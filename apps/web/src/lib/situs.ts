import type { Localized, SiteContent } from "@ssb/shared";

/** Akses ke draf yang sedang disunting: isi, cara mengubah, dan pesan galat per jalur kolom dari API. */
export type Sunting = {
  d: SiteContent;
  ubah: (fn: (d: SiteContent) => void) => void;
  salah: (jalur: string) => string | undefined;
};

/** Teks dua bahasa; `en` dihilangkan bila belum ada supaya dokumen tidak menyimpan kosong yang tak berguna. */
export const buatLokal = (id: string, en: string | undefined): Localized => (en === undefined ? { id } : { id, en });

/** Ubah satu elemen larik bila indeksnya ada. */
export function ubahDi<T>(larik: T[], i: number, fn: (b: T) => void): void {
  const b = larik[i];
  if (b !== undefined) fn(b);
}

/** Tukar elemen i dengan tetangganya (arah -1 naik, +1 turun). */
export function geser<T>(larik: T[], i: number, arah: -1 | 1): void {
  const j = i + arah;
  const a = larik[i];
  const b = larik[j];
  if (a === undefined || b === undefined) return;
  larik[i] = b;
  larik[j] = a;
}

/** Angka dari isian teks; kosong atau bukan angka menjadi undefined. */
export function angka(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Id program baru yang belum dipakai: program-1, program-2, ... */
export function idProgramBaru(ada: string[]): string {
  for (let n = ada.length + 1; ; n++) {
    const id = `program-${n}`;
    if (!ada.includes(id)) return id;
  }
}

/** Isi satu properti; dipakai di pengubah draf supaya penugasan tidak tertulis di dalam ekspresi. */
export function isi<T, K extends keyof T>(obj: T, kunci: K, nilai: T[K]): void {
  obj[kunci] = nilai;
}
