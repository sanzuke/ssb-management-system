// Kecocokan posisi (lihat docs/konsep-fm.md): bobot indikator per posisi, perhitungan, dan zona. Tanpa dependensi,
// agar layar web bisa memakainya tanpa ikut memuat zod. Bobot awal perlu divalidasi pelatih berlisensi.
import { defaultIndicators } from "./aspects";

export const positions = ["GK", "DF", "MF", "FW"] as const;
export type PositionCode = (typeof positions)[number];
export const positionLabel: Record<PositionCode, string> = { GK: "Kiper", DF: "Bek", MF: "Gelandang", FW: "Penyerang" };

/** Bobot indikator per posisi: nama indikator ke bilangan bulat 0 sampai WEIGHT_MAX (0 = tidak dihitung). */
export type PositionWeights = Record<PositionCode, Record<string, number>>;
export const WEIGHT_MAX = 5;

const bobot = (kode: string): Record<string, number> => {
  const nilai = kode.split(",").map(Number);
  const nama = Object.values(defaultIndicators).flat();
  return Object.fromEntries(nama.map((n, i) => [n, nilai[i] ?? 0]));
};

/**
 * Urutan: Kontrol bola, Passing, Dribbling, Shooting, Kecepatan, Kelincahan, Daya tahan, Penempatan posisi, Pemahaman peran,
 * Fokus, Kerja sama, Sportivitas, Koordinasi, Keseimbangan, Pengambilan keputusan, Membaca permainan
 * (sama dengan urutan `defaultIndicators`).
 */
export const defaultPositionWeights: PositionWeights = {
  GK: bobot("2,3,0,0,1,5,1,5,3,5,2,1,4,4,4,4"),
  DF: bobot("2,3,1,0,3,3,3,5,5,4,4,2,2,3,4,5"),
  MF: bobot("5,5,3,2,2,3,5,4,4,3,5,2,3,2,5,5"),
  FW: bobot("4,2,5,5,5,4,2,3,2,3,2,1,3,3,4,3"),
};

/** Siswa di bawah usia ini diajak mencoba semua posisi, jadi kecocokan posisi tidak ditampilkan. */
export const USIA_MIN_POSISI = 10;
/** Bagian bobot posisi yang harus punya skor; di bawahnya hasilnya "belum cukup data". */
export const MIN_BOBOT_TERISI = 0.5;

/** Rata-rata berbobot skor indikator untuk satu posisi (satu desimal); null bila bobot yang terisi kurang dari separuh. */
export function hitungKecocokan(scores: { name: string; score: number }[], bobotPosisi: Record<string, number>): number | null {
  const total = Object.values(bobotPosisi).reduce((t, w) => t + w, 0);
  if (total <= 0) return null;
  let terisi = 0;
  let jumlah = 0;
  for (const s of scores) {
    const w = bobotPosisi[s.name] ?? 0;
    if (w <= 0) continue;
    terisi += w;
    jumlah += w * s.score;
  }
  if (terisi / total < MIN_BOBOT_TERISI) return null;
  return Math.round((jumlah / terisi) * 10) / 10;
}

export type ZonaPosisi = "cocok" | "bisa" | "belum";
export const zonaLabel: Record<ZonaPosisi, string> = { cocok: "Cocok", bisa: "Bisa", belum: "Belum" };
export const zonaDari = (skor: number): ZonaPosisi => (skor >= 7 ? "cocok" : skor >= 5 ? "bisa" : "belum");
