import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "ssb_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Token acak 256 bit untuk cookie; hanya hash-nya yang disimpan di database. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Token sesi dari permintaan: cookie `ssb_session` (web) atau `Authorization: Bearer` (aplikasi mobile).
 * Keduanya menunjuk baris `user_session` yang sama.
 */
export function readSessionToken(c: Context): string | undefined {
  const auth = c.req.header("authorization");
  if (auth && /^Bearer\s+\S+$/i.test(auth)) return auth.replace(/^Bearer\s+/i, "");
  return getCookie(c, SESSION_COOKIE);
}
