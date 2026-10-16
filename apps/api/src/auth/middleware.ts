import { and, eq, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { schema, withTenant, type Db } from "@ssb/db";
import type { UserRole } from "@ssb/shared";
import { forbidden, unauthorized } from "../errors";
import { SESSION_COOKIE, hashToken } from "./session";

export type Auth = { userId: string; ssbId: string; name: string; email: string | null; role: UserRole };
export type AppEnv = { Variables: { auth?: Auth } };

/** Membaca cookie sesi dan mengisi c.var.auth bila sesi masih berlaku. Tidak menolak permintaan. */
export const loadAuth = (db: Db) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const [s] = await db
        .select()
        .from(schema.userSession)
        .where(and(eq(schema.userSession.tokenHash, hashToken(token)), gt(schema.userSession.expiresAt, new Date())))
        .limit(1);
      if (s) {
        // ssb_id berasal dari sesi di server, tidak pernah dari input klien.
        const [u] = await withTenant(db, s.ssbId, (tx) =>
          tx.select().from(schema.appUser).where(eq(schema.appUser.id, s.userId)).limit(1),
        );
        if (u) c.set("auth", { userId: u.id, ssbId: u.ssbId, name: u.name, email: u.email, role: u.role });
      }
    }
    await next();
  });

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get("auth")) throw unauthorized();
  await next();
});

/** Hanya role yang disebut yang lolos; selain itu 403. Sudah termasuk requireAuth. */
export const requireRole = (...roles: UserRole[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const a = c.get("auth");
    if (!a) throw unauthorized();
    if (!roles.includes(a.role)) throw forbidden();
    await next();
  });
