import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { setCookie } from "hono/cookie";
import type { Context } from "hono";
import { schema, withAccount, withTenant, type Db } from "@ssb/db";
import type { Membership, SsbInput, UserRole } from "@ssb/shared";
import { HttpError } from "../errors";
import { SESSION_COOKIE, SESSION_TTL_MS, hashToken, newToken } from "./session";

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Daftar keanggotaan akun lintas SSB. */
export async function listMemberships(db: Db, accountId: string): Promise<Membership[]> {
  return withAccount(db, accountId, (tx) =>
    tx
      .select({ ssbId: schema.appUser.ssbId, userId: schema.appUser.id, role: schema.appUser.role, ssbName: schema.ssb.name })
      .from(schema.appUser)
      .innerJoin(schema.ssb, eq(schema.ssb.id, schema.appUser.ssbId))
      .where(eq(schema.appUser.accountId, accountId)),
  );
}

/** Membuat SSB baru beserta keanggotaan admin untuk akun, dalam satu transaksi. */
export async function createSsb(db: Db, accountId: string, adminName: string, input: SsbInput) {
  const ssbId = randomUUID();
  const userId = randomUUID();
  try {
    await withTenant(db, ssbId, async (tx) => {
      await tx.insert(schema.ssb).values({ id: ssbId, name: input.ssbName, city: input.city, province: input.province });
      await tx.insert(schema.ssbDirectory).values({ slug: input.slug, ssbId });
      await tx.insert(schema.appUser).values({ id: userId, ssbId, accountId, name: adminName, role: "admin_ssb" });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "slug_taken", "Kode SSB sudah dipakai");
    throw e;
  }
  return { ssbId, userId };
}

/** Cari SSB lewat kode SSB (untuk memilih SSB saat login). */
export async function ssbIdBySlug(db: Db, slug: string) {
  const [d] = await db.select().from(schema.ssbDirectory).where(eq(schema.ssbDirectory.slug, slug)).limit(1);
  return d?.ssbId;
}

/** Membuat sesi untuk akun; ssbId/userId kosong bila belum ada SSB yang dipilih. */
export async function startSession(db: Db, c: Context, accountId: string, active: { ssbId: string; userId: string } | null, secureCookie: boolean) {
  const token = newToken();
  await db.insert(schema.userSession).values({
    tokenHash: hashToken(token),
    accountId,
    ssbId: active?.ssbId ?? null,
    userId: active?.userId ?? null,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: secureCookie,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Pilih SSB aktif untuk sesi yang sedang berjalan. */
export async function setActive(db: Db, sessionHash: string, active: { ssbId: string; userId: string }) {
  await db.update(schema.userSession).set({ ssbId: active.ssbId, userId: active.userId }).where(eq(schema.userSession.tokenHash, sessionHash));
}

/** SSB yang dipilih otomatis setelah login: yang cocok dengan kode SSB, atau satu-satunya. */
export function pickActive(memberships: Membership[], slugSsbId?: string) {
  const m = slugSsbId ? memberships.find((x) => x.ssbId === slugSsbId) : memberships.length === 1 ? memberships[0] : undefined;
  return m ? { ssbId: m.ssbId, userId: m.userId } : null;
}

// ---- Undangan ----

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createInvitation(
  db: Db,
  by: { ssbId: string; userId: string },
  input: { role: UserRole; label?: string | undefined; playerId?: string | undefined },
) {
  const secret = newToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  await withTenant(db, by.ssbId, (tx) =>
    tx.insert(schema.invitation).values({
      ssbId: by.ssbId,
      secretHash: hashToken(secret),
      role: input.role,
      label: input.label,
      playerId: input.playerId,
      createdBy: by.userId,
      expiresAt,
    }),
  );
  return { token: `${by.ssbId}.${secret}`, expiresAt };
}

/**
 * Membuat ulang tautan undangan yang belum diterima: undangan baru (role, catatan, dan pemain sama,
 * masa berlaku baru) menggantikan yang lama dalam satu transaksi, sehingga tautan lama langsung tidak berlaku.
 */
export async function renewInvitation(db: Db, by: { ssbId: string; userId: string }, id: string) {
  const secret = newToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const ok = await withTenant(db, by.ssbId, async (tx) => {
    const [old] = await tx.select().from(schema.invitation).where(eq(schema.invitation.id, id)).limit(1);
    if (!old) return "none" as const;
    if (old.acceptedAt) return "accepted" as const;
    await tx.delete(schema.invitation).where(eq(schema.invitation.id, id));
    await tx.insert(schema.invitation).values({
      ssbId: by.ssbId,
      secretHash: hashToken(secret),
      role: old.role,
      label: old.label,
      playerId: old.playerId,
      createdBy: by.userId,
      expiresAt,
    });
    return "ok" as const;
  });
  if (ok === "none") throw new HttpError(404, "not_found", "Undangan tidak ditemukan");
  if (ok === "accepted") throw new HttpError(409, "already_accepted", "Undangan ini sudah diterima");
  return { token: `${by.ssbId}.${secret}`, expiresAt };
}

function parseToken(token: string) {
  const i = token.indexOf(".");
  const ssbId = token.slice(0, i);
  const secret = token.slice(i + 1);
  if (i < 0 || !UUID.test(ssbId) || !secret) throw new HttpError(404, "invalid_invitation", "Undangan tidak ditemukan atau sudah tidak berlaku");
  return { ssbId, secret };
}

const invalidInvitation = () => new HttpError(404, "invalid_invitation", "Undangan tidak ditemukan atau sudah tidak berlaku");

/** Pratinjau undangan (publik): nama SSB, role, dan masa berlaku. */
export async function previewInvitation(db: Db, token: string) {
  const { ssbId, secret } = parseToken(token);
  const row = await withTenant(db, ssbId, async (tx) => {
    const [inv] = await tx
      .select()
      .from(schema.invitation)
      .where(and(eq(schema.invitation.secretHash, hashToken(secret)), isNull(schema.invitation.acceptedAt), gt(schema.invitation.expiresAt, new Date())))
      .limit(1);
    if (!inv) return undefined;
    const [s] = await tx.select().from(schema.ssb).where(eq(schema.ssb.id, ssbId)).limit(1);
    return { ssbName: s?.name ?? "", role: inv.role, label: inv.label, expiresAt: inv.expiresAt };
  });
  if (!row) throw invalidInvitation();
  return row;
}

/** Menerima undangan atas nama akun. Sekali pakai; gagal bila akun sudah menjadi anggota. */
export async function acceptInvitation(db: Db, token: string, account: { id: string; name: string }, memberName?: string, whatsapp?: string) {
  const { ssbId, secret } = parseToken(token);
  try {
    return await withTenant(db, ssbId, async (tx) => {
      // Update bersyarat membuat penerimaan atomik: hanya satu penerima yang berhasil.
      const [inv] = await tx
        .update(schema.invitation)
        .set({ acceptedAt: new Date() })
        .where(and(eq(schema.invitation.secretHash, hashToken(secret)), isNull(schema.invitation.acceptedAt), gt(schema.invitation.expiresAt, new Date())))
        .returning();
      if (!inv) throw invalidInvitation();
      const [u] = await tx
        .insert(schema.appUser)
        .values({ ssbId, accountId: account.id, name: memberName ?? account.name, role: inv.role, whatsapp: whatsapp ?? null })
        .returning();
      if (inv.playerId && inv.role === "orang_tua") {
        await tx.insert(schema.playerGuardian).values({ ssbId, playerId: inv.playerId, userId: u!.id });
      }
      return { ssbId, userId: u!.id, role: inv.role };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "already_member", "Akun ini sudah menjadi anggota SSB tersebut");
    throw e;
  }
}
