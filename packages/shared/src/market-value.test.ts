import { describe, expect, test } from "bun:test";
import {
  hitungMvi,
  kategoriMvi,
  MVI_COMPONENTS,
  MVI_WEIGHTS,
  persentil,
  skorFisik,
  skorKehadiran,
  skorPenilaian,
  skorPerforma,
  skorUsia,
  type HasilTes,
  type StatLaga,
} from "./market-value";

const stat = (o: Partial<StatLaga> = {}): StatLaga => ({ matchesPlayed: 10, goals: 0, assists: 0, starts: 10, yellowCards: 0, redCards: 0, ...o });
const tes = (o: Partial<HasilTes> = {}): HasilTes => ({ speed30m: null, zigZag: null, verticalJump: null, bleepLevel: null, ...o });

describe("kategori", () => {
  test("bobot berjumlah 100", () => {
    expect(MVI_COMPONENTS.reduce((t, k) => t + MVI_WEIGHTS[k], 0)).toBe(100);
  });

  test("batas kategori tanpa celah, termasuk di antara 25 dan 26", () => {
    const hasil = [0, 25, 25.4, 25.5, 26, 50, 50.5, 51, 75, 76, 90, 91, 100].map((n) => kategoriMvi(n));
    expect(hasil).toEqual([
      "Sangat Rendah", "Sangat Rendah", "Sangat Rendah", "Rendah", "Rendah", "Rendah", "Baik", "Baik", "Baik", "Sangat Baik", "Sangat Baik", "Elit", "Elit",
    ]);
    expect([kategoriMvi(-5), kategoriMvi(140)]).toEqual(["Sangat Rendah", "Elit"]);
  });
});

describe("komponen", () => {
  test("penilaian: rata-rata skor 1 sampai 10 menjadi 0 sampai 100 dan dibatasi", () => {
    expect([skorPenilaian(8.3), skorPenilaian(10), skorPenilaian(0.4), skorPenilaian(12)]).toEqual([83, 100, 4, 100]);
  });

  test("usia relatif: termuda di KU 100, tertua 0; KU satu usia netral; di luar rentang dibatasi", () => {
    // KU-10 mencakup usia 9 sampai 10 (lebar 2 tahun).
    expect([skorUsia(9, 9, 10), skorUsia(10, 9, 10), skorUsia(11, 9, 10), skorUsia(8, 9, 10), skorUsia(13, 9, 10)]).toEqual([100, 50, 0, 100, 0]);
    expect(skorUsia(10, 10, 10)).toBe(50);
  });

  test("kehadiran: butuh minimal 5 catatan", () => {
    expect([skorKehadiran(4, 4), skorKehadiran(8, 10), skorKehadiran(5, 5), skorKehadiran(0, 6)]).toEqual([null, 80, 100, 0]);
  });

  test("performa: butuh minimal 3 laga; kontribusi gol dinilai menurut posisi", () => {
    expect(skorPerforma(stat({ matchesPlayed: 2, goals: 5 }), "FW")).toBeNull();
    // Penyerang: 5 gol+assist di 10 laga = 0,5 per laga dari batas 1,0 => 50; starter 100; disiplin 100 => 50*.5 + 100*.3 + 100*.2 = 75.
    expect(skorPerforma(stat({ goals: 4, assists: 1 }), "FW")).toBe(75);
    // Kontribusi yang sama bernilai lebih bagi bek (batas 0,3 per laga) daripada penyerang.
    const per = (p: "DF" | "MF" | "FW") => skorPerforma(stat({ goals: 3 }), p)!;
    expect(per("DF")).toBeGreaterThan(per("MF"));
    expect(per("MF")).toBeGreaterThan(per("FW"));
  });

  test("performa: kiper dan posisi kosong tidak dinilai dari gol; bobot sisanya dihitung ulang", () => {
    // Hanya keikutsertaan (30) dan disiplin (20): 100 dan 100 => 100, gol sebanyak apa pun tidak berpengaruh.
    expect(skorPerforma(stat({ goals: 0 }), "GK")).toBe(100);
    expect(skorPerforma(stat({ goals: 9 }), null)).toBe(100);
    // Starter 5 dari 10 => 50; disiplin 100 => (50*30 + 100*20)/50 = 70.
    expect(skorPerforma(stat({ starts: 5 }), "GK")).toBe(70);
  });

  test("performa: kartu mengurangi disiplin, kartu merah tiga kali lebih berat, dan tidak di bawah 0", () => {
    expect(skorPerforma(stat({ yellowCards: 2 }), "GK")).toBe(((100 * 30) + (80 * 20)) / 50);
    expect(skorPerforma(stat({ redCards: 1 }), "GK")).toBe(((100 * 30) + (70 * 20)) / 50);
    expect(skorPerforma(stat({ yellowCards: 10, redCards: 10 }), "GK")).toBe(60);
  });
});

describe("kebugaran relatif", () => {
  test("persentil butuh minimal 5 teman dan membalik arah untuk waktu lari", () => {
    expect(persentil(10, [10, 11, 12, 13], false)).toBeNull();
    const lompat = [20, 25, 30, 35, 40];
    expect([persentil(40, lompat, false), persentil(20, lompat, false), persentil(30, lompat, false)]).toEqual([90, 10, 50]);
    const lari = [5.0, 5.5, 6.0, 6.5, 7.0];
    expect([persentil(5.0, lari, true), persentil(7.0, lari, true)]).toEqual([90, 10]);
  });

  test("nilai sama dibagi dua", () => {
    expect(persentil(30, [30, 30, 30, 30, 30], false)).toBe(50);
  });

  test("kebugaran: rata-rata metrik yang tersedia; metrik tanpa cukup teman dilewati; tanpa tes kosong", () => {
    const teman = [20, 25, 30, 35, 40].map((v) => tes({ verticalJump: v, bleepLevel: v === 40 ? 8 : null }));
    expect(skorFisik(tes({ verticalJump: 40 }), teman)).toBe(90);
    // Bleep hanya punya satu teman sehingga dilewati; lompat 30 => 50.
    expect(skorFisik(tes({ verticalJump: 30, bleepLevel: 8 }), teman)).toBe(50);
    expect(skorFisik(tes(), teman)).toBeNull();
  });
});

describe("indeks", () => {
  const skor = (o: Partial<Record<(typeof MVI_COMPONENTS)[number], number | null>> = {}) => ({ penilaian: null, performa: null, fisik: null, kehadiran: null, usia: null, ...o });

  test("pemain tanpa data apa pun tidak mendapat indeks (bukan nilai netral)", () => {
    expect(hitungMvi(skor({ usia: 100 }))).toEqual({ indeks: null, kategori: null, cakupan: 10, kurang: ["penilaian", "performa", "fisik", "kehadiran"] });
  });

  test("butuh penilaian pelatih dan minimal satu dari performa atau kebugaran", () => {
    expect(hitungMvi(skor({ penilaian: 90, kehadiran: 100, usia: 100 })).indeks).toBeNull();
    expect(hitungMvi(skor({ performa: 90, fisik: 90, kehadiran: 100, usia: 100 })).indeks).toBeNull();
    expect(hitungMvi(skor({ penilaian: 80, performa: 60 })).indeks).not.toBeNull();
    expect(hitungMvi(skor({ penilaian: 80, fisik: 60 })).indeks).not.toBeNull();
  });

  test("rata-rata tertimbang atas komponen yang ada; bobot yang hilang dihitung ulang", () => {
    // penilaian 35 dan performa 25: (80*35 + 60*25) / 60 = 71,67 => 72.
    expect(hitungMvi(skor({ penilaian: 80, performa: 60 }))).toEqual({ indeks: 72, kategori: "Baik", cakupan: 60, kurang: ["fisik", "kehadiran", "usia"] });
    const semua = hitungMvi(skor({ penilaian: 100, performa: 100, fisik: 100, kehadiran: 100, usia: 100 }));
    expect([semua.indeks, semua.kategori, semua.cakupan, semua.kurang]).toEqual([100, "Elit", 100, []]);
    expect(hitungMvi(skor({ penilaian: 0, performa: 0, fisik: 0, kehadiran: 0, usia: 0 })).kategori).toBe("Sangat Rendah");
  });

  test("usia paling lemah pengaruhnya: 10 poin pada data lengkap, dan selalu kalah dari penilaian pelatih", () => {
    const penuh = { penilaian: 50, performa: 50, fisik: 50, kehadiran: 50 };
    const swingUsia = hitungMvi(skor({ ...penuh, usia: 100 })).indeks! - hitungMvi(skor({ ...penuh, usia: 0 })).indeks!;
    expect(swingUsia).toBe(10);
    // Data minimal (penilaian, performa, usia): usia berbobot lebih besar karena bobot lain kosong, tetap kalah dari penilaian.
    const minimal = { performa: 50, usia: 50 };
    const usia = hitungMvi(skor({ ...minimal, penilaian: 50, usia: 100 })).indeks! - hitungMvi(skor({ ...minimal, penilaian: 50, usia: 0 })).indeks!;
    const nilai = hitungMvi(skor({ ...minimal, penilaian: 100 })).indeks! - hitungMvi(skor({ ...minimal, penilaian: 0 })).indeks!;
    expect(nilai).toBeGreaterThan(usia);
  });
});
