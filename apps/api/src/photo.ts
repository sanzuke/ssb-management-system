import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/** Batas ukuran foto siswa. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

const TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
export type PhotoExt = keyof typeof TYPES;
export const photoMime = (ext: string) => TYPES[ext as PhotoExt] ?? "application/octet-stream";

/** Tipe gambar ditentukan dari isi berkas (bukan nama atau Content-Type kiriman klien). */
export function sniffImage(b: Uint8Array): PhotoExt | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  const tag = (o: number, s: string) => [...s].every((ch, i) => b[o + i] === ch.charCodeAt(0));
  if (b.length > 12 && tag(0, "RIFF") && tag(8, "WEBP")) return "webp";
  return null;
}

/** Kunci berkas: <ssb>/<siswa>-<versi>.<ekstensi>. Versi acak membuat URL foto baru tidak tertahan cache lama. */
export const newPhotoKey = (ssbId: string, playerId: string, ext: PhotoExt) => `${ssbId}/${playerId}-${randomBytes(4).toString("hex")}.${ext}`;
export const photoVersion = (key: string | null) => key?.match(/-([0-9a-f]{8})\.[a-z]+$/)?.[1] ?? null;
export const photoExt = (key: string) => key.slice(key.lastIndexOf(".") + 1);

/** Penyimpanan berkas di folder lokal. Kunci selalu dipastikan tetap di dalam folder penyimpanan. */
export function photoStore(dir: string) {
  const root = resolve(dir);
  const path = (key: string) => {
    const p = resolve(root, key);
    if (!p.startsWith(root + sep)) throw new Error("kunci berkas tidak valid");
    return p;
  };
  return {
    async put(key: string, bytes: Uint8Array) {
      const p = path(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, bytes);
    },
    async get(key: string) {
      return readFile(path(key)).catch(() => null);
    },
    async remove(key: string) {
      await rm(path(key), { force: true });
    },
  };
}
