// Foto contoh untuk data seed: siluet pemain di atas latar berwarna (PNG dibuat tanpa pustaka gambar).
// Hanya untuk demo; foto asli diunggah lewat aplikasi.
import { deflateSync } from "node:zlib";

const SIZE = 256;
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
};

/** HSL ke RGB (h 0-360, s dan l 0-1). */
const hsl = (h: number, s: number, l: number): [number, number, number] => {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
};

/** Siluet kepala dan bahu di atas latar gradien; warna ditentukan oleh nomor urut. */
export function fotoContoh(n: number): Uint8Array {
  const hue = (n * 47 + 130) % 360;
  const [r1, g1, b1] = hsl(hue, 0.45, 0.32);
  const [r2, g2, b2] = hsl(hue, 0.5, 0.52);
  const [rs, gs, bs] = hsl((hue + 20) % 360, 0.25, 0.9);
  const raw = new Uint8Array(SIZE * (SIZE * 3 + 1));
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < SIZE; x++) {
      const t = (x + y) / (2 * SIZE);
      let r = r1 + (r2 - r1) * t;
      let g = g1 + (g2 - g1) * t;
      let b = b1 + (b2 - b1) * t;
      const kepala = ((x - 128) / 44) ** 2 + ((y - 98) / 50) ** 2 <= 1;
      const bahu = ((x - 128) / 92) ** 2 + ((y - 262) / 100) ** 2 <= 1;
      if (kepala || bahu) {
        r = rs;
        g = gs;
        b = bs;
      }
      const o = row + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, SIZE);
  dv.setUint32(4, SIZE);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8 bit, RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
