// Konstanta penilaian tanpa dependensi, agar layar web bisa memakainya tanpa ikut memuat zod.
export const assessmentAspects = ["technical", "physical", "tactical", "mental", "movement", "game_intelligence"] as const;
export type AssessmentAspect = (typeof assessmentAspects)[number];
export const aspectLabel: Record<AssessmentAspect, string> = {
  technical: "Teknik",
  physical: "Fisik",
  tactical: "Taktik",
  mental: "Mental",
  movement: "Gerak",
  game_intelligence: "Kecerdasan bermain",
};
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

/** Lima pita warna skor 1-10 (lihat docs/konsep-fm.md). Batas atas bersifat eksklusif; skor desimal (rata-rata) ikut pita yang memuatnya. */
export const pitaSkor = [
  { kode: 1, kata: "Baru mulai", sampai: 3 },
  { kode: 2, kata: "Berkembang", sampai: 5 },
  { kode: 3, kata: "Cukup", sampai: 7 },
  { kode: 4, kata: "Baik", sampai: 9 },
  { kode: 5, kata: "Menonjol", sampai: Number.POSITIVE_INFINITY },
] as const;
export type PitaSkor = (typeof pitaSkor)[number];
export const pitaDari = (skor: number): PitaSkor => pitaSkor.find((p) => skor < p.sampai) ?? pitaSkor[pitaSkor.length - 1]!;

/** Selisih minimum rata-rata (rating terbaru dikurangi rata-rata dua periode sebelumnya) agar tren dianggap naik atau turun. */
export const AMBANG_TREN = 0.3;
export type Tren = { arah: "baru" | "naik" | "tetap" | "turun"; selisih: number | null };
/** Tren dari rating tiap periode, urut dari tertua ke terbaru. Butuh minimal dua periode; pembanding adalah rata-rata maksimal dua periode sebelum yang terbaru. */
export function hitungTren(rating: number[]): Tren {
  if (rating.length < 2) return { arah: "baru", selisih: null };
  const terbaru = rating[rating.length - 1]!;
  const lalu = rating.slice(-3, -1);
  const selisih = Math.round((terbaru - lalu.reduce((a, b) => a + b, 0) / lalu.length) * 10) / 10;
  return { arah: selisih >= AMBANG_TREN ? "naik" : selisih <= -AMBANG_TREN ? "turun" : "tetap", selisih };
}

/** Usulan awal dari rancangan; perlu divalidasi pelatih berlisensi sebelum dikunci. */
export const defaultIndicators: Record<AssessmentAspect, string[]> = {
  technical: ["Kontrol bola", "Passing", "Dribbling", "Shooting"],
  physical: ["Kecepatan", "Kelincahan", "Daya tahan"],
  tactical: ["Penempatan posisi", "Pemahaman peran"],
  mental: ["Fokus", "Kerja sama", "Sportivitas"],
  movement: ["Koordinasi", "Keseimbangan"],
  game_intelligence: ["Pengambilan keputusan", "Membaca permainan"],
};
