import { and, eq, gt, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import { forgotPasswordSchema, resetPasswordSchema } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { hashPassword } from "./auth/password";
import { hashToken, newToken } from "./auth/session";
import { listMemberships } from "./auth/service";
import type { Logger } from "./logger";
import type { Mailer } from "./mail";
import { zv } from "./validator";

/** Tautan dari email berlaku 1 jam; tautan buatan admin 24 jam karena diteruskan manual. */
export const RESET_TTL_EMAIL_MS = 60 * 60 * 1000;
export const RESET_TTL_ADMIN_MS = 24 * 60 * 60 * 1000;
/** Permintaan lupa kata sandi untuk akun yang sama dijarangkan agar tidak dipakai membanjiri kotak masuk orang lain. */
const MIN_INTERVAL_MS = 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalidReset = () => new HttpError(404, "invalid_reset", "Tautan reset tidak berlaku atau sudah dipakai. Minta tautan baru");

/** r***@contoh.id: cukup untuk memastikan orangnya, tanpa membuka seluruh alamat. */
export const maskEmail = (email: string) => {
  const [u = "", d = ""] = email.split("@");
  return `${u.slice(0, 1)}***@${d}`;
};

/** Membuat token reset baru; token lama yang belum dipakai untuk akun itu dihapus (hanya satu yang aktif). */
export async function issuePasswordReset(db: Db, accountId: string, opts: { ttlMs: number; issuedBy?: string }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + opts.ttlMs);
  await db.transaction(async (tx) => {
    await tx.delete(schema.passwordReset).where(and(eq(schema.passwordReset.accountId, accountId), isNull(schema.passwordReset.usedAt)));
    await tx.insert(schema.passwordReset).values({ accountId, tokenHash: hashToken(token), issuedBy: opts.issuedBy ?? null, expiresAt });
  });
  return { token, expiresAt };
}

export function passwordResetRoutes(db: Db, opts: { webUrl: string; mailer: Mailer | null; logger: Logger }) {
  const url = (token: string) => `${opts.webUrl}/reset-sandi/${token}`;

  return (
    new Hono<AppEnv>()
      // Apakah server bisa mengirim email reset; dipakai layar untuk memberi petunjuk yang tepat.
      .get("/auth/features", (c) => c.json({ emailReset: opts.mailer !== null }))

      // Lupa kata sandi. Jawabannya selalu sama, apa pun isi email, supaya tidak membocorkan akun mana yang ada.
      // Pencarian dan pengiriman berjalan di belakang agar waktu respons juga tidak membedakan.
      .post("/auth/forgot-password", zv("json", forgotPasswordSchema), (c) => {
        const { email } = c.req.valid("json");
        const mailer = opts.mailer;
        if (mailer) {
          void (async () => {
            const [acc] = await db
              .select({ id: schema.account.id, name: schema.account.name })
              .from(schema.account)
              .where(eq(schema.account.email, email))
              .limit(1);
            if (!acc) return;
            const [terakhir] = await db
              .select({ at: schema.passwordReset.createdAt })
              .from(schema.passwordReset)
              .where(and(eq(schema.passwordReset.accountId, acc.id), gt(schema.passwordReset.createdAt, new Date(Date.now() - MIN_INTERVAL_MS))))
              .limit(1);
            if (terakhir) return;
            const { token } = await issuePasswordReset(db, acc.id, { ttlMs: RESET_TTL_EMAIL_MS });
            await mailer.send({
              to: email,
              subject: "Atur ulang kata sandi SSB App",
              text: `Halo ${acc.name},\n\nKami menerima permintaan untuk mengatur ulang kata sandi akun SSB App Anda. Buka tautan ini dalam 1 jam:\n\n${url(token)}\n\nBila Anda tidak memintanya, abaikan email ini; kata sandi Anda tidak berubah.`,
            });
          })().catch((e) => opts.logger.log("error", "gagal mengirim email reset kata sandi", { error: e instanceof Error ? e.message : String(e) }));
        }
        return c.json({ ok: true });
      })

      // Pratinjau tautan reset: memastikan tautan masih berlaku dan menampilkan email yang tersamar.
      .get("/auth/reset-password/:token", async (c) => {
        const [r] = await db
          .select({ email: schema.account.email })
          .from(schema.passwordReset)
          .innerJoin(schema.account, eq(schema.account.id, schema.passwordReset.accountId))
          .where(
            and(
              eq(schema.passwordReset.tokenHash, hashToken(c.req.param("token"))),
              isNull(schema.passwordReset.usedAt),
              gt(schema.passwordReset.expiresAt, new Date()),
            ),
          )
          .limit(1);
        if (!r) throw invalidReset();
        return c.json({ ok: true, email: maskEmail(r.email) });
      })

      // Pakai tautan: kata sandi diganti, semua sesi akun dicabut, tautan hangus. Tidak langsung masuk; pengguna masuk dengan kata sandi baru.
      .post("/auth/reset-password/:token", zv("json", resetPasswordSchema), async (c) => {
        const passwordHash = await hashPassword(c.req.valid("json").newPassword);
        const accountId = await db.transaction(async (tx) => {
          // Update bersyarat membuat pemakaian atomik: hanya satu permintaan yang berhasil.
          const [r] = await tx
            .update(schema.passwordReset)
            .set({ usedAt: new Date() })
            .where(
              and(
                eq(schema.passwordReset.tokenHash, hashToken(c.req.param("token"))),
                isNull(schema.passwordReset.usedAt),
                gt(schema.passwordReset.expiresAt, new Date()),
              ),
            )
            .returning({ accountId: schema.passwordReset.accountId });
          if (!r) return null;
          await tx.update(schema.account).set({ passwordHash }).where(eq(schema.account.id, r.accountId));
          await tx.delete(schema.userSession).where(eq(schema.userSession.accountId, r.accountId));
          await tx.delete(schema.passwordReset).where(and(eq(schema.passwordReset.accountId, r.accountId), isNull(schema.passwordReset.usedAt)));
          return r.accountId;
        });
        if (!accountId) throw invalidReset();
        return c.json({ ok: true });
      })

      // Admin SSB membuatkan tautan reset untuk anggotanya (diteruskan manual, mis. lewat WhatsApp).
      // Akun yang juga anggota SSB lain tidak boleh direset oleh admin satu SSB: kata sandi akun itu membuka SSB lain juga.
      .post("/users/:userId/reset-link", requirePermission("member.reset_password"), async (c) => {
        const a = c.get("auth")!;
        const userId = c.req.param("userId");
        if (!UUID.test(userId)) throw new HttpError(404, "not_found", "Anggota tidak ditemukan");
        const [target] = await withTenant(db, a.member!.ssbId, (tx) =>
          tx.select({ accountId: schema.appUser.accountId, name: schema.appUser.name }).from(schema.appUser).where(eq(schema.appUser.id, userId)).limit(1),
        );
        if (!target) throw new HttpError(404, "not_found", "Anggota tidak ditemukan");
        const [acc] = await db
          .select({ googleSub: schema.account.googleSub, passwordHash: schema.account.passwordHash })
          .from(schema.account)
          .where(eq(schema.account.id, target.accountId))
          .limit(1);
        if (acc && !acc.passwordHash && acc.googleSub)
          throw new HttpError(409, "google_account", "Anggota ini masuk dengan Google dan tidak memakai kata sandi, jadi tidak perlu direset");
        if ((await listMemberships(db, target.accountId)).length > 1)
          throw new HttpError(409, "multi_ssb_account", "Akun ini juga anggota SSB lain. Pemiliknya perlu memakai Lupa kata sandi lewat email");
        const { token, expiresAt } = await issuePasswordReset(db, target.accountId, { ttlMs: RESET_TTL_ADMIN_MS, issuedBy: a.accountId });
        return c.json({ url: url(token), expiresAt, name: target.name }, 201);
      })
  );
}
