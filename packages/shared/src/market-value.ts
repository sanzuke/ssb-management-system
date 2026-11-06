/**
 * Indeks nilai pemain (MVI): angka 0 sampai 100 dan kategori yang merangkum penilaian pelatih, performa laga, kebugaran,
 * kehadiran, dan usia relatif terhadap KU. Bukan harga dan tidak pernah dinyatakan dalam rupiah.
 *
 * Prinsip: komponen yang datanya belum ada tidak diberi nilai netral, tetapi dikeluarkan dan bobot sisanya dihitung ulang.
 * Indeks baru keluar bila penilaian pelatih ada dan minimal satu dari performa laga atau kebugaran ikut terisi; selain itu
 * hasilnya "belum cukup data". Nilai kebugaran dan usia bersifat relatif (terhadap teman satu KU), jadi indeks dibandingkan
 * dalam KU yang sama, bukan antar KU. Ambang dan bobot di sini adalah titik awal yang perlu divalidasi pelatih berlisensi.
 */

export const MVI_COMPONENTS = ["penilaian", "performa", "fisik", "kehadiran", "usia"] as const;
export type MviComponent = (typeof MVI_COMPONENTS)[number];

/** Bobot dalam persen; jumlahnya 100. */
export const MVI_WEIGHTS: Record<MviComponent, number> = { penilaian: 35, performa: 25, fisik: 20, kehadiran: 10, usia: 10 };
export const MVI_LABEL: Record<MviComponent, string> = {
  penilaian: "Penilaian pelatih",
  performa: "Performa laga",
  fisik: "Kebugaran",
  kehadiran: "Kehadiran latihan",
  usia: "Usia relatif di KU",
};

/** Laga minimal dalam satu periode agar performa laga dihitung; lebih sedikit terlalu acak. */
export const MVI_MIN_MATCHES = 3;
/** Teman satu KU minimal yang punya hasil tes yang sama agar peringkat kebugaran bermakna. */
export const MVI_MIN_PEERS = 5;
/** Catatan kehadiran minimal dalam periode agar persentasenya dihitung. */
export const MVI_MIN_ATTENDANCE = 5;
/** Hasil tes lebih lama dari ini (hari, dari akhir periode) dianggap kedaluwarsa. */
export const MVI_TEST_MAX_AGE_DAYS = 365;

/** Batas bawah tiap kategori pada indeks bulat 0 sampai 100. */
export const MVI_CATEGORIES = [
  { min: 0, label: "Sangat Rendah" },
  { min: 26, label: "Rendah" },
  { min: 51, label: "Baik" },
  { min: 76, label: "Sangat Baik" },
  { min: 91, label: "Elit" },
] as const;
export type MviCategory = (typeof MVI_CATEGORIES)[number]["label"];

/** Kategori dari indeks; indeks dibulatkan lebih dulu supaya tidak ada celah di antara 25 dan 26. */
export function kategoriMvi(indeks: number): MviCategory {
  const n = Math.round(Math.min(100, Math.max(0, indeks)));
  let hasil: MviCategory = MVI_CATEGORIES[0].label;
  for (const c of MVI_CATEGORIES) if (n >= c.min) hasil = c.label;
  return hasil;
}

const klem = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const satuDesimal = (n: number) => Math.round(n * 10) / 10;

/** Rata-rata skor indikator (1 sampai 10) menjadi 0 sampai 100: 8,3 menjadi 83. */
export const skorPenilaian = (rataRata: number): number => satuDesimal(klem(rataRata * 10));

/**
 * Usia relatif di KU: yang termuda di rentang KU mendapat 100, yang tertua 0. Usia dalam tahun pecahan pada akhir periode.
 * KU satu usia (min sama dengan max) tidak membedakan, jadi 50.
 */
export function skorUsia(usiaTahun: number, minUsia: number, maxUsia: number): number {
  const lebar = maxUsia + 1 - minUsia;
  if (lebar <= 1) return 50;
  return satuDesimal(klem((1 - (usiaTahun - minUsia) / lebar) * 100));
}

/** Persentase hadir dari catatan kehadiran; kosong bila catatan terlalu sedikit. */
export function skorKehadiran(hadir: number, tercatat: number): number | null {
  if (tercatat < MVI_MIN_ATTENDANCE) return null;
  return satuDesimal(klem((hadir / tercatat) * 100));
}

export type PosisiMvi = "GK" | "DF" | "MF" | "FW" | null;
export type StatLaga = { matchesPlayed: number; goals: number; assists: number; starts: number; yellowCards: number; redCards: number };

/** Gol dan assist per laga yang dianggap sempurna menurut posisi; kiper tidak dinilai dari gol. */
export const KONTRIBUSI_PENUH: Record<"DF" | "MF" | "FW", number> = { DF: 0.3, MF: 0.6, FW: 1 };

/**
 * Performa laga satu periode. Kontribusi gol (bergantung posisi), keikutsertaan sebagai starter, dan disiplin.
 * Kiper dan posisi yang belum diisi tidak dinilai dari kontribusi gol; bobot sisanya dihitung ulang.
 */
export function skorPerforma(s: StatLaga, posisi: PosisiMvi): number | null {
  if (s.matchesPlayed < MVI_MIN_MATCHES) return null;
  const laga = s.matchesPlayed;
  const keikutsertaan = klem((s.starts / laga) * 100);
  const disiplin = klem(100 - ((s.yellowCards + 3 * s.redCards) / laga) * 100);
  const bagian: { skor: number; bobot: number }[] = [
    { skor: keikutsertaan, bobot: 30 },
    { skor: disiplin, bobot: 20 },
  ];
  if (posisi === "DF" || posisi === "MF" || posisi === "FW") {
    bagian.push({ skor: klem((((s.goals + s.assists) / laga) / KONTRIBUSI_PENUH[posisi]) * 100), bobot: 50 });
  }
  const total = bagian.reduce((t, b) => t + b.bobot, 0);
  return satuDesimal(bagian.reduce((t, b) => t + b.skor * b.bobot, 0) / total);
}

export type MetrikFisik = "speed30m" | "zigZag" | "verticalJump" | "bleepLevel";
export type HasilTes = Record<MetrikFisik, number | null>;
export const METRIK_FISIK: { key: MetrikFisik; label: string; satuan: string; lebihKecilLebihBaik: boolean }[] = [
  { key: "speed30m", label: "Lari 30 m", satuan: "detik", lebihKecilLebihBaik: true },
  { key: "zigZag", label: "Lari zig-zag", satuan: "detik", lebihKecilLebihBaik: true },
  { key: "verticalJump", label: "Lompat vertikal", satuan: "cm", lebihKecilLebihBaik: false },
  { key: "bleepLevel", label: "Bleep test (level)", satuan: "level", lebihKecilLebihBaik: false },
];

/**
 * Peringkat persentil (0 sampai 100) sebuah nilai di antara teman satu KU; nilai sama dibagi dua (peringkat tengah).
 * Kosong bila temannya kurang dari `MVI_MIN_PEERS`. Daftar `semua` sudah termasuk pemain itu sendiri.
 */
export function persentil(nilai: number, semua: number[], lebihKecilLebihBaik: boolean): number | null {
  if (semua.length < MVI_MIN_PEERS) return null;
  const lebihBaik = (x: number) => (lebihKecilLebihBaik ? x > nilai : x < nilai);
  const di_bawah = semua.filter(lebihBaik).length;
  const sama = semua.filter((x) => x === nilai).length;
  return satuDesimal(((di_bawah + sama / 2) / semua.length) * 100);
}

/** Kebugaran: rata-rata persentil metrik yang tersedia. `teman` berisi hasil tes terbaru tiap pemain KU, termasuk pemain ini. */
export function skorFisik(tes: HasilTes, teman: HasilTes[]): number | null {
  const skor: number[] = [];
  for (const m of METRIK_FISIK) {
    const v = tes[m.key];
    if (v === null) continue;
    const p = persentil(
      v,
      teman.map((t) => t[m.key]).filter((x): x is number => x !== null),
      m.lebihKecilLebihBaik,
    );
    if (p !== null) skor.push(p);
  }
  return skor.length === 0 ? null : satuDesimal(skor.reduce((t, x) => t + x, 0) / skor.length);
}

export type SkorKomponen = Record<MviComponent, number | null>;
export type MviHasil = {
  /** Indeks bulat 0 sampai 100, atau null bila data belum cukup. */
  indeks: number | null;
  kategori: MviCategory | null;
  /** Persen bobot yang datanya tersedia. */
  cakupan: number;
  /** Komponen yang belum punya data. */
  kurang: MviComponent[];
};

/** Rata-rata tertimbang komponen yang tersedia. Butuh penilaian pelatih dan minimal satu dari performa laga atau kebugaran. */
export function hitungMvi(skor: SkorKomponen): MviHasil {
  const ada = MVI_COMPONENTS.filter((k) => skor[k] !== null);
  const kurang = MVI_COMPONENTS.filter((k) => skor[k] === null);
  const cakupan = ada.reduce((t, k) => t + MVI_WEIGHTS[k], 0);
  const cukup = skor.penilaian !== null && (skor.performa !== null || skor.fisik !== null);
  if (!cukup) return { indeks: null, kategori: null, cakupan, kurang };
  const indeks = Math.round(klem(ada.reduce((t, k) => t + skor[k]! * MVI_WEIGHTS[k], 0) / cakupan));
  return { indeks, kategori: kategoriMvi(indeks), cakupan, kurang };
}
