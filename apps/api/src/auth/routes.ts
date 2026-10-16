import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { schema, withTenant, type Db } from "@ssb/db";
import { changePasswordSchema, loginSchema, registerSsbSchema, type Me } from "@ssb/shared";
import { HttpError } from "../errors";
import { requireAuth, type AppEnv } from "./middleware";
import { dummyHash, hashPassword, verifyPassword } from "./password";
import { SESSION_COOKIE, SESSION_TTL_MS, hashToken, newToken } from "./session";

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

export function authRoutes(db: Db, opts: { secureCookie: boolean }) {
  const startSession = async (c: Parameters<typeof setCookie>[0], ssbId: string, userId: string) => {
    const token = newToken();
    await db.insert(schema.userSession).values({
      tokenHash: hashToken(token),
      ssbId,
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: opts.secureCookie,
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
  };

  const invalidLogin = () => new HttpError(401, "invalid_credentials", "Kode SSB, email, atau kata sandi salah");

  return new Hono<AppEnv>()
    // Daftar SSB baru + admin pertama dalam satu transaksi.
    .post("/register-ssb", zValidator("json", registerSsbSchema), async (c) => {
      const body = c.req.valid("json");
      const ssbId = randomUUID();
      const userId = randomUUID();
      const passwordHash = await hashPassword(body.password);
      try {
        await withTenant(db, ssbId, async (tx) => {
          await tx.insert(schema.ssb).values({ id: ssbId, name: body.ssbName, city: body.city, province: body.province });
          await tx.insert(schema.ssbDirectory).values({ slug: body.slug, ssbId });
          await tx.insert(schema.appUser).values({
            id: userId,
            ssbId,
            name: body.adminName,
            email: body.email,
            passwordHash,
            role: "admin_ssb",
          });
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw new HttpError(409, "slug_taken", "Kode SSB sudah dipakai");
        throw e;
      }
      await startSession(c, ssbId, userId);
      return c.json({ ssbId, userId }, 201);
    })

    .post("/login", zValidator("json", loginSchema), async (c) => {
      const { slug, email, password } = c.req.valid("json");
      const [dir] = await db.select().from(schema.ssbDirectory).where(eq(schema.ssbDirectory.slug, slug)).limit(1);
      const [user] = dir
        ? await withTenant(db, dir.ssbId, (tx) => tx.select().from(schema.appUser).where(eq(schema.appUser.email, email)).limit(1))
        : [];
      // Selalu verifikasi hash, termasuk hash tiruan, agar waktu respons tidak membocorkan akun mana yang ada.
      const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
      if (!user || !user.passwordHash || !ok) throw invalidLogin();
      await startSession(c, user.ssbId, user.id);
      return c.json({ ok: true });
    })

    .post("/logout", async (c) => {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) await db.delete(schema.userSession).where(eq(schema.userSession.tokenHash, hashToken(token)));
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      return c.json({ ok: true });
    })

    .get("/me", requireAuth, (c) => {
      const a = c.get("auth")!;
      const me: Me = { userId: a.userId, ssbId: a.ssbId, name: a.name, email: a.email, role: a.role };
      return c.json(me);
    })

    .post("/change-password", requireAuth, zValidator("json", changePasswordSchema), async (c) => {
      const a = c.get("auth")!;
      const { currentPassword, newPassword } = c.req.valid("json");
      const [u] = await withTenant(db, a.ssbId, (tx) => tx.select().from(schema.appUser).where(eq(schema.appUser.id, a.userId)).limit(1));
      if (!u?.passwordHash || !(await verifyPassword(currentPassword, u.passwordHash))) {
        throw new HttpError(400, "wrong_password", "Kata sandi saat ini salah");
      }
      const newHash = await hashPassword(newPassword);
      await withTenant(db, a.ssbId, (tx) => tx.update(schema.appUser).set({ passwordHash: newHash }).where(eq(schema.appUser.id, a.userId)));
      // Sesi lain milik pengguna ini dicabut; sesi yang sedang dipakai tetap berlaku.
      const current = hashToken(getCookie(c, SESSION_COOKIE)!);
      await db.delete(schema.userSession).where(and(eq(schema.userSession.userId, a.userId), ne(schema.userSession.tokenHash, current)));
      return c.json({ ok: true });
    });
}
