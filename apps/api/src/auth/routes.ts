import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import { zv } from "../validator";
import { schema, withTenant, type Db } from "@ssb/db";
import { changePasswordSchema, loginSchema, registerSsbSchema, selectSsbSchema, ssbInputSchema, updateProfileSchema, type Me } from "@ssb/shared";
import { HttpError } from "../errors";
import { requireAccount, type AppEnv } from "./middleware";
import { dummyHash, hashPassword, verifyPassword } from "./password";
import { SESSION_COOKIE, hashToken } from "./session";
import { createSsb, isUniqueViolation, listMemberships, pickActive, setActive, ssbIdBySlug, startSession } from "./service";

export function authRoutes(db: Db, opts: { secureCookie: boolean }) {
  const invalidLogin = () => new HttpError(401, "invalid_credentials", "Email atau kata sandi salah");

  return (
    new Hono<AppEnv>()
      // Akun baru + SSB baru + admin pertama, dengan email dan kata sandi.
      .post("/register-ssb", zv("json", registerSsbSchema), async (c) => {
        const body = c.req.valid("json");
        const passwordHash = await hashPassword(body.password);
        let accountId: string;
        try {
          const [a] = await db.insert(schema.account).values({ email: body.email, name: body.adminName, passwordHash }).returning({ id: schema.account.id });
          accountId = a!.id;
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "email_taken", "Email sudah terdaftar. Masuk, lalu buat SSB dari akun Anda");
          throw e;
        }
        const { ssbId, userId } = await createSsb(db, accountId, body.adminName, body);
        await startSession(db, c, accountId, { ssbId, userId }, opts.secureCookie);
        return c.json({ accountId, ssbId, userId }, 201);
      })

      .post("/login", zv("json", loginSchema), async (c) => {
        const { email, password, slug } = c.req.valid("json");
        const [acc] = await db.select().from(schema.account).where(eq(schema.account.email, email)).limit(1);
        // Selalu verifikasi hash, termasuk hash tiruan, agar waktu respons tidak membocorkan akun mana yang ada.
        const ok = await verifyPassword(password, acc?.passwordHash ?? (await dummyHash()));
        if (!acc?.passwordHash || !ok) throw invalidLogin();
        const memberships = await listMemberships(db, acc.id);
        const slugSsbId = slug ? await ssbIdBySlug(db, slug) : undefined;
        const active = pickActive(memberships, slugSsbId);
        await startSession(db, c, acc.id, active, opts.secureCookie);
        return c.json({ ok: true, selected: active !== null, memberships });
      })

      .post("/logout", async (c) => {
        const token = getCookie(c, SESSION_COOKIE);
        if (token) await db.delete(schema.userSession).where(eq(schema.userSession.tokenHash, hashToken(token)));
        deleteCookie(c, SESSION_COOKIE, { path: "/" });
        return c.json({ ok: true });
      })

      .get("/me", requireAccount, async (c) => {
        const a = c.get("auth")!;
        const memberships = await listMemberships(db, a.accountId);
        const active = a.member ? (memberships.find((m) => m.userId === a.member!.userId) ?? null) : null;
        const [acc] = await db.select({ hasPassword: schema.account.passwordHash }).from(schema.account).where(eq(schema.account.id, a.accountId)).limit(1);
        const whatsapp = a.member
          ? await withTenant(db, a.member.ssbId, async (tx) => {
              const [u] = await tx.select({ whatsapp: schema.appUser.whatsapp }).from(schema.appUser).where(eq(schema.appUser.id, a.member!.userId)).limit(1);
              return u?.whatsapp ?? null;
            })
          : null;
        const me: Me = { accountId: a.accountId, name: a.accountName, email: a.email, hasPassword: acc?.hasPassword != null, whatsapp, active, memberships };
        return c.json(me);
      })

      // Ubah kontak sendiri pada keanggotaan di SSB aktif (nomor WhatsApp; kosong menghapus).
      .patch("/me", requireAccount, zv("json", updateProfileSchema), async (c) => {
        const a = c.get("auth")!;
        if (!a.member) throw new HttpError(400, "no_active_ssb", "Pilih SSB terlebih dulu");
        const { whatsapp } = c.req.valid("json");
        await withTenant(db, a.member.ssbId, (tx) => tx.update(schema.appUser).set({ whatsapp }).where(eq(schema.appUser.id, a.member!.userId)));
        return c.json({ ok: true, whatsapp });
      })

      // Pilih SSB aktif untuk sesi ini; hanya SSB tempat akun menjadi anggota.
      .post("/select", requireAccount, zv("json", selectSsbSchema), async (c) => {
        const a = c.get("auth")!;
        const { ssbId } = c.req.valid("json");
        const m = (await listMemberships(db, a.accountId)).find((x) => x.ssbId === ssbId);
        if (!m) throw new HttpError(403, "not_a_member", "Anda bukan anggota SSB tersebut");
        await setActive(db, a.sessionHash, { ssbId: m.ssbId, userId: m.userId });
        return c.json({ ok: true, active: m });
      })

      // Akun yang sudah ada membuat SSB tambahan.
      .post("/ssb", requireAccount, zv("json", ssbInputSchema), async (c) => {
        const a = c.get("auth")!;
        const created = await createSsb(db, a.accountId, a.accountName, c.req.valid("json"));
        await setActive(db, a.sessionHash, created);
        return c.json(created, 201);
      })

      .post("/change-password", requireAccount, zv("json", changePasswordSchema), async (c) => {
        const a = c.get("auth")!;
        const { currentPassword, newPassword } = c.req.valid("json");
        const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, a.accountId)).limit(1);
        // Akun yang hanya punya login Google boleh menambahkan kata sandi tanpa kata sandi lama.
        if (acc?.passwordHash && !(currentPassword && (await verifyPassword(currentPassword, acc.passwordHash)))) {
          throw new HttpError(400, "wrong_password", "Kata sandi saat ini salah");
        }
        await db
          .update(schema.account)
          .set({ passwordHash: await hashPassword(newPassword) })
          .where(eq(schema.account.id, a.accountId));
        // Sesi lain milik akun ini dicabut; sesi yang sedang dipakai tetap berlaku.
        await db.delete(schema.userSession).where(and(eq(schema.userSession.accountId, a.accountId), ne(schema.userSession.tokenHash, a.sessionHash)));
        return c.json({ ok: true });
      })
  );
}
