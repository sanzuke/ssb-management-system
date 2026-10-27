import { execFile } from "node:child_process";
import { Hono } from "hono";
import {
  mailboxCreateSchema,
  mailboxNameSchema,
  MAILBOX_NO_DELETE,
  MAILBOX_NO_RESET,
  type MailboxAccount,
  type MailboxCredential,
  type MailboxList,
} from "@ssb/shared";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { HttpError } from "./errors";
import { zv } from "./validator";

/** Pengelola kotak surat server. `null` pada AppDeps berarti server ini tidak mengelola email. */
export type MailboxAdmin = {
  domain: string;
  webmailUrl: string;
  /** Bagian lokal tiap alamat, mis. ["admin", "info"]. */
  list(): Promise<string[]>;
  create(name: string): Promise<MailboxCredential>;
  resetPassword(name: string): Promise<MailboxCredential>;
  remove(name: string): Promise<void>;
};

const run = (file: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 20_000, maxBuffer: 64 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });

const parseCredential = (out: string): MailboxCredential => {
  const address = /^Akun: (\S+)$/m.exec(out)?.[1];
  const password = /^Sandi: (\S+)$/m.exec(out)?.[1];
  if (!address || !password) throw new Error("keluaran pengelola email tidak dikenali");
  return { address, password };
};

/**
 * Pengelola yang memanggil skrip server `buat-email` (lihat docs/email.md). `command` berisi perintah beserta awalan
 * `sudo -n`, dipisah spasi; argumennya divalidasi dulu dan diberikan sebagai larik, bukan lewat shell.
 */
export function createMailboxAdmin(opts: { command: string; domain: string }): MailboxAdmin {
  const [file, ...base] = opts.command.trim().split(/\s+/);
  if (!file) throw new Error("MAILBOX_CMD kosong");
  const call = (...args: string[]) => run(file, [...base, ...args]);
  return {
    domain: opts.domain,
    webmailUrl: `https://mail.${opts.domain}`,
    async list() {
      const out = await call("daftar");
      const suffix = `@${opts.domain}`;
      return out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.endsWith(suffix))
        .map((l) => l.slice(0, -suffix.length))
        .sort();
    },
    async create(name) {
      return parseCredential(await call("tambah", name));
    },
    async resetPassword(name) {
      return parseCredential(await call("sandi", name));
    },
    async remove(name) {
      await call("hapus", name);
    },
  };
}

const toAccount = (name: string, domain: string): MailboxAccount => ({
  name,
  address: `${name}@${domain}`,
  canDelete: !MAILBOX_NO_DELETE.includes(name),
  canReset: !MAILBOX_NO_RESET.includes(name),
});

export function mailboxRoutes(admin: MailboxAdmin | null) {
  const need = (): MailboxAdmin => {
    if (!admin) throw new HttpError(503, "mailbox_disabled", "Pengelolaan email tidak aktif di server ini");
    return admin;
  };
  const existing = async (a: MailboxAdmin, raw: string) => {
    const name = mailboxNameSchema.safeParse(raw);
    if (!name.success) throw new HttpError(404, "not_found", "Akun email tidak ditemukan");
    if (!(await a.list()).includes(name.data)) throw new HttpError(404, "not_found", "Akun email tidak ditemukan");
    return name.data;
  };
  const failed = (e: unknown): never => {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, "mailbox_failed", "Server email tidak bisa memproses permintaan");
  };

  return new Hono<AppEnv>()
    .get("/mailboxes", requirePermission("mailbox.manage"), async (c) => {
      if (!admin) return c.json({ enabled: false, domain: "", webmailUrl: "", accounts: [] } satisfies MailboxList);
      const names = await admin.list().catch(failed);
      return c.json({
        enabled: true,
        domain: admin.domain,
        webmailUrl: admin.webmailUrl,
        accounts: names.map((n) => toAccount(n, admin.domain)),
      } satisfies MailboxList);
    })
    .post("/mailboxes", requirePermission("mailbox.manage"), zv("json", mailboxCreateSchema), async (c) => {
      const a = need();
      const { name } = c.req.valid("json");
      const names = await a.list().catch(failed);
      if (names.includes(name)) throw new HttpError(409, "conflict", "Alamat email itu sudah ada", { name: "Sudah dipakai" });
      const cred = await a.create(name).catch(failed);
      return c.json(cred satisfies MailboxCredential, 201);
    })
    .post("/mailboxes/:name/password", requirePermission("mailbox.manage"), async (c) => {
      const a = need();
      const name = await existing(a, c.req.param("name")).catch(failed);
      if (MAILBOX_NO_RESET.includes(name)) throw new HttpError(403, "forbidden", "Sandi akun ini dikelola sistem");
      const cred = await a.resetPassword(name).catch(failed);
      return c.json(cred satisfies MailboxCredential);
    })
    .delete("/mailboxes/:name", requirePermission("mailbox.manage"), async (c) => {
      const a = need();
      const name = await existing(a, c.req.param("name")).catch(failed);
      if (MAILBOX_NO_DELETE.includes(name)) throw new HttpError(403, "forbidden", "Akun ini dilindungi dan tidak boleh dihapus");
      await a.remove(name).catch(failed);
      return c.body(null, 204);
    });
}
