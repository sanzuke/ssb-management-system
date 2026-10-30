/** Bagian tubuh untuk catatan cedera. Kode disimpan di database; daftar ini bisa ditambah tanpa migrasi. */
export const bodyParts = [
  { code: "kepala", label: "Kepala" },
  { code: "leher", label: "Leher" },
  { code: "bahu", label: "Bahu" },
  { code: "lengan", label: "Lengan atau siku" },
  { code: "tangan", label: "Pergelangan atau tangan" },
  { code: "punggung", label: "Punggung" },
  { code: "perut", label: "Dada atau perut" },
  { code: "pinggul", label: "Pinggul atau selangkangan" },
  { code: "paha", label: "Paha" },
  { code: "lutut", label: "Lutut" },
  { code: "betis", label: "Betis atau tulang kering" },
  { code: "pergelangan_kaki", label: "Pergelangan kaki" },
  { code: "kaki", label: "Telapak kaki atau jari" },
  { code: "lainnya", label: "Lainnya" },
] as const;

export type BodyPartCode = (typeof bodyParts)[number]["code"];
export const bodyPartCodes = bodyParts.map((b) => b.code) as [BodyPartCode, ...BodyPartCode[]];
export const bodyPartLabel = (code: string) => bodyParts.find((b) => b.code === code)?.label ?? code;

/** Panjang maksimal catatan cedera (juga dijaga CHECK di database). */
export const INJURY_NOTE_MAX = 500;
