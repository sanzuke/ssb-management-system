import type { Logger } from "../logger";
import { and, eq, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { schema, withTenant, type Db } from "@ssb/db";
import { can, type Permission, type UserRole } from "@ssb/shared";
import { forbidden, HttpError, unauthorized } from "../errors";
import { SESSION_COOKIE, hashToken } from "./session";

export type Member = { ssbId: string; userId: string; role: UserRole; name: string };
export type Auth = {
  accountId: string;
  email: string;
  accountName: string;
  /** Hash token sesi saat ini. */
  sessionHash: string;
  /** SSB aktif pada sesi; null bila akun belum memilih SSB. */
  member: Member | null;
};
export type AppEnv = { Variables: { auth?: Auth; reqId?: string; logger?: Logger } };

/** Membaca cookie sesi dan mengisi c.var.auth bila sesi masih berlaku. Tidak menolak permintaan. */
export const loadAuth = (db: Db) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const sessionHash = hashToken(token);
      const [s] = await db
        .select()
        .from(schema.userSession)
        .where(and(eq(schema.userSession.tokenHash, sessionHash), gt(schema.userSession.expiresAt, new Date())))
        .limit(1);
      if (s) {
        const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, s.accountId)).limit(1);
        if (acc) {
          let member: Member | null = null;
          if (s.ssbId && s.userId) {
            // ssb_id berasal dari sesi di server, tidak pernah dari input klien.
            const [u] = await withTenant(db, s.ssbId, (tx) => tx.select().from(schema.appUser).where(eq(schema.appUser.id, s.userId!)).limit(1));
            if (u && u.accountId === acc.id) member = { ssbId: u.ssbId, userId: u.id, role: u.role, name: u.name };
          }
          c.set("auth", { accountId: acc.id, email: acc.email, accountName: acc.name, sessionHash, member });
        }
      }
    }
    await next();
  });

/** Butuh sesi login, boleh belum memilih SSB. */
export const requireAccount = Object.assign(
  createMiddleware<AppEnv>(async (c, next) => {
    if (!c.get("auth")) throw unauthorized();
    await next();
  }),
  { access: "account" as const },
);

/** Butuh sesi login dengan SSB aktif. */
export const requireMember = createMiddleware<AppEnv>(async (c, next) => {
  const a = c.get("auth");
  if (!a) throw unauthorized();
  if (!a.member) throw new HttpError(403, "ssb_not_selected", "Pilih SSB terlebih dahulu");
  await next();
});

/**
 * Izin dicek terhadap matriks di @ssb/shared. Sudah termasuk requireMember.
 * Ditandai `permission` agar test bisa memastikan tiap endpoint tenant punya penjaga.
 */
export const requirePermission = (p: Permission) =>
  Object.assign(
    createMiddleware<AppEnv>(async (c, next) => {
      const a = c.get("auth");
      if (!a) throw unauthorized();
      if (!a.member) throw new HttpError(403, "ssb_not_selected", "Pilih SSB terlebih dahulu");
      if (!can(a.member.role, p)) throw forbidden();
      await next();
    }),
    { permission: p },
  );
