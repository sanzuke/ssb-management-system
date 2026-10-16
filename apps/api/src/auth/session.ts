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
