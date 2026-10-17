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

/** Usulan awal dari rancangan; perlu divalidasi pelatih berlisensi sebelum dikunci. */
export const defaultIndicators: Record<AssessmentAspect, string[]> = {
  technical: ["Kontrol bola", "Passing", "Dribbling", "Shooting"],
  physical: ["Kecepatan", "Kelincahan", "Daya tahan"],
  tactical: ["Penempatan posisi", "Pemahaman peran"],
  mental: ["Fokus", "Kerja sama", "Sportivitas"],
  movement: ["Koordinasi", "Keseimbangan"],
  game_intelligence: ["Pengambilan keputusan", "Membaca permainan"],
};
