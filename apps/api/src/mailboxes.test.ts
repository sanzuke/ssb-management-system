import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { like } from "drizzle-orm";
import { createDb, schema } from "@ssb/db";
import type { MailboxCredential, MailboxList } from "@ssb/shared";
import { createApp, type AppType } from "./app";
import { createMailboxAdmin, type MailboxAdmin } from "./mailboxes";

const DOM = "akademi.test";

/** Pengelola tiruan di memori; mencatat sandi yang dibuat supaya tes bisa memeriksanya. */
function fake(): MailboxAdmin & { names: Set<string>; calls: string[] } {
  const names = new Set(["admin", "noreply", "info"]);
  const calls: string[] = [];
  return {
    domain: DOM,
    webmailUrl: `https://mail.${DOM}`,
    names,
    calls,
    async list() {
      return [...names].sort();
    },
    async create(name) {
      calls.push(`tambah ${name}`);
      names.add(name);
      return { address: `${name}@${DOM}`, password: "Sandi-Baru-123" };
    },
    async resetPassword(name) {
      calls.push(`sandi ${name}`);
      return { address: `${name}@${DOM}`, password: "Sandi-Reset-456" };
    },
    async remove(name) {
      calls.push(`hapus ${name}`);
      names.delete(name);
    },
  };
}

describe("pengelola email (soket server tiruan)", () => {
  test("mengirim satu baris perintah per koneksi dan membaca keluarannya; kode gagal menjadi galat", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ssb-mbx-"));
    const path = process.platform === "win32" ? `\\\\.\\pipe\\ssb-mbx-${randomUUID()}` : join(dir, "m.sock");
    const diterima: string[] = [];
    const server = createServer({ allowHalfOpen: true }, (sock) => {
      let buf = "";
      sock.on("error", () => {});
      sock.setEncoding("utf8");
      sock.on("data", (d: string) => {
        buf += d;
      });
      sock.on("data", () => {
        if (!buf.endsWith("\n")) return;
        const [c, n] = buf.trim().split(" ");
        diterima.push(buf.trim());
        if (c === "daftar") sock.end(`noreply@${DOM}\nadmin@${DOM}\nlain@domain-lain.test\nbudi@${DOM}\nSELESAI 0\n`);
        else if (c === "tambah" || c === "sandi") sock.end(`Akun: ${n}@${DOM}\nSandi: abc123XYZ\nWebmail: x\nSELESAI 0\n`);
        else if (c === "hapus") sock.end(n === "budi" ? "dihapus\nSELESAI 0\n" : "tidak ada\nSELESAI 1\n");
        else sock.end("SELESAI 2\n");
      });
    });
    await new Promise<void>((ok) => server.listen(path, ok));
    try {
      const a = createMailboxAdmin({ socketPath: path, domain: DOM });
      expect(await a.list()).toEqual(["admin", "budi", "noreply"]);
      expect(await a.create("budi")).toEqual({ address: `budi@${DOM}`, password: "abc123XYZ" });
      expect(await a.resetPassword("budi")).toEqual({ address: `budi@${DOM}`, password: "abc123XYZ" });
      await a.remove("budi");
      await expect(a.remove("orang")).rejects.toThrow("kode 1");
      expect(diterima).toEqual(["daftar", "tambah budi", "sandi budi", "hapus budi", "hapus orang"]);
      server.close();
      await expect(a.list()).rejects.toThrow();
    } finally {
      server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

const dbUrl = process.env.DATABASE_URL;
const run = dbUrl ? describe : describe.skip;

run("kelola email (database)", () => {
  const { db, client } = createDb(dbUrl!);
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const env = { NODE_ENV: "test" as const, ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) };
  const admin = fake();
  const app: AppType = createApp(db, env, { google: null, mailboxes: admin });
  const mati: AppType = createApp(db, env, { google: null, mailboxes: null });

  const call = (a: AppType, method: string, path: string, cookie?: string, body?: unknown) =>
    a.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method === "POST" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;

  let adminCookie = "";
  let pelatihCookie = "";

  afterAll(async () => {
    const bersih = createDb(dbUrl!);
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("siapkan admin dan pelatih", async () => {
    const reg = await app.request("/auth/register-ssb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ssbName: `Email ${uid}`, slug: `em-${uid}`, adminName: "Admin Email", email: `admin-${uid}@uji.test`, password: PASS }),
    });
    expect(reg.status).toBe(201);
    adminCookie = sessionOf(reg);
    const inv = await call(app, "POST", "/invitations", adminCookie, { role: "pelatih" });
    const { token } = (await inv.json()) as { token: string };
    const acc = await app.request(`/invitations/${token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Pelatih Email", email: `pelatih-${uid}@uji.test`, password: PASS }),
    });
    pelatihCookie = sessionOf(acc);
  });

  test("hanya admin SSB yang boleh; tanpa sesi 401", async () => {
    expect((await call(app, "GET", "/mailboxes")).status).toBe(401);
    expect((await call(app, "GET", "/mailboxes", pelatihCookie)).status).toBe(403);
    expect((await call(app, "POST", "/mailboxes", pelatihCookie, { name: "baru" })).status).toBe(403);
    expect((await call(app, "DELETE", "/mailboxes/info", pelatihCookie)).status).toBe(403);
    expect(admin.calls).toEqual([]);
  });

  test("daftar menandai akun sistem yang tidak boleh dihapus atau direset", async () => {
    const list = (await (await call(app, "GET", "/mailboxes", adminCookie)).json()) as MailboxList;
    expect(list).toMatchObject({ enabled: true, domain: DOM, webmailUrl: `https://mail.${DOM}` });
    const by = Object.fromEntries(list.accounts.map((a) => [a.name, a]));
    expect(by.admin).toMatchObject({ address: `admin@${DOM}`, canDelete: false, canReset: true });
    expect(by.noreply).toMatchObject({ canDelete: false, canReset: false });
    expect(by.info).toMatchObject({ canDelete: true, canReset: true });
  });

  test("tambah: nama dinormalkan, sandi dikembalikan sekali, nama ganda 409, nama tak valid 400", async () => {
    const res = await call(app, "POST", "/mailboxes", adminCookie, { name: "  Pelatih.Budi " });
    expect(res.status).toBe(201);
    expect((await res.json()) as MailboxCredential).toEqual({ address: `pelatih.budi@${DOM}`, password: "Sandi-Baru-123" });
    expect((await call(app, "POST", "/mailboxes", adminCookie, { name: "pelatih.budi" })).status).toBe(409);
    for (const name of ["a", "../etc", "x y", "a;rm -rf", "-awal", "A@b.c", ""]) {
      expect([name, (await call(app, "POST", "/mailboxes", adminCookie, { name })).status]).toEqual([name, 400]);
    }
    expect(admin.calls).toEqual(["tambah pelatih.budi"]);
  });

  test("reset sandi: akun ada berhasil, akun tak ada 404, noreply ditolak", async () => {
    expect((await (await call(app, "POST", "/mailboxes/info/password", adminCookie)).json()) as MailboxCredential).toEqual({
      address: `info@${DOM}`,
      password: "Sandi-Reset-456",
    });
    expect((await call(app, "POST", "/mailboxes/tidakada/password", adminCookie)).status).toBe(404);
    expect((await call(app, "POST", "/mailboxes/noreply/password", adminCookie)).status).toBe(403);
    expect(admin.calls).toEqual(["tambah pelatih.budi", "sandi info"]);
  });

  test("hapus: akun biasa terhapus; admin dan noreply dilindungi; akun tak ada 404", async () => {
    expect((await call(app, "DELETE", "/mailboxes/info", adminCookie)).status).toBe(204);
    expect(admin.names.has("info")).toBe(false);
    expect((await call(app, "DELETE", "/mailboxes/admin", adminCookie)).status).toBe(403);
    expect((await call(app, "DELETE", "/mailboxes/noreply", adminCookie)).status).toBe(403);
    expect((await call(app, "DELETE", "/mailboxes/info", adminCookie)).status).toBe(404);
    expect((await call(app, "DELETE", "/mailboxes/..%2Fetc", adminCookie)).status).toBe(404);
    expect(admin.calls).toEqual(["tambah pelatih.budi", "sandi info", "hapus info"]);
  });

  test("tanpa pengelola: daftar kosong dan enabled=false, perubahan 503", async () => {
    expect(await (await call(mati, "GET", "/mailboxes", adminCookie)).json()).toEqual({ enabled: false, domain: "", webmailUrl: "", accounts: [] });
    expect((await call(mati, "POST", "/mailboxes", adminCookie, { name: "baru" })).status).toBe(503);
    expect((await call(mati, "DELETE", "/mailboxes/info", adminCookie)).status).toBe(503);
  });
});
