import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Enkripsi simetris untuk token API pihak ketiga (mis. Fonnte).
 * Kunci diturunkan dari SESSION_SECRET lewat HKDF, jadi satu rahasia server
 * cukup untuk semua yang perlu dienkripsi. Format ciphertext:
 * base64( iv 12 byte || tag 16 byte || teks terenkripsi ).
 */
const KUNCI_INFO = "ssb-app/token-encryption/v1";
const IV_LEN = 12;
const TAG_LEN = 16;

const kunciDari = (secret: string) => createHash("sha256").update(`${KUNCI_INFO}:${secret}`).digest();

/** Enkripsi teks rahasia. Hasilnya base64 yang aman disimpan di database. */
export function enkripsi(secret: string, teks: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", kunciDari(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(teks, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** Dekripsi nilai dari `enkripsi`. Mengembalikan null bila teks rusak atau kunci berbeda. */
export function dekripsi(secret: string, nilai: string): string | null {
  try {
    const data = Buffer.from(nilai, "base64");
    if (data.length <= IV_LEN + TAG_LEN) return null;
    const iv = data.subarray(0, IV_LEN);
    const tag = data.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = data.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", kunciDari(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // Tag tidak cocok berarti token bukan milik instance ini atau sudah rusak.
    return null;
  }
}
