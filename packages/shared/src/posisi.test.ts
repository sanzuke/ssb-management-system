import { expect, test } from "bun:test";
import { defaultIndicators } from "./aspects";
import { defaultPositionWeights, hitungKecocokan, positions, zonaDari } from "./posisi";

const semua = Object.values(defaultIndicators).flat();
const skorSama = (n: number) => semua.map((name) => ({ name, score: n }));

test("bobot awal memuat tiap indikator awal untuk tiap posisi, dalam rentang 0 sampai 5", () => {
  for (const p of positions) {
    expect(Object.keys(defaultPositionWeights[p]).sort()).toEqual([...semua].sort());
    for (const w of Object.values(defaultPositionWeights[p])) expect(w >= 0 && w <= 5 && Number.isInteger(w)).toBe(true);
  }
});

test("skor sama di semua indikator menghasilkan skor itu di semua posisi", () => {
  for (const p of positions) expect(hitungKecocokan(skorSama(7), defaultPositionWeights[p])).toBe(7);
});

test("indikator berbobot tinggi menggeser hasil lebih dari yang berbobot rendah", () => {
  const skor = skorSama(5).map((s) => (s.name === "Shooting" ? { ...s, score: 10 } : s));
  // Shooting berbobot 5 untuk penyerang (5 dari 51) dan 0 untuk kiper dan bek.
  expect(hitungKecocokan(skor, defaultPositionWeights.FW)).toBe(5.5);
  expect(hitungKecocokan(skor, defaultPositionWeights.GK)).toBe(5);
  expect(hitungKecocokan(skor, defaultPositionWeights.DF)).toBe(5);
});

test("bobot yang terisi kurang dari separuh berarti belum cukup data", () => {
  expect(hitungKecocokan([{ name: "Fokus", score: 9 }], defaultPositionWeights.GK)).toBeNull();
  expect(hitungKecocokan(skorSama(8), { Fokus: 0 })).toBeNull(); // total bobot nol
});

test("indikator di luar tabel bobot tidak ikut dihitung", () => {
  const skor = [...skorSama(6), { name: "Tendangan bebas", score: 10 }];
  expect(hitungKecocokan(skor, defaultPositionWeights.MF)).toBe(6);
});

test("zona: 7 ke atas cocok, 5 sampai di bawah 7 bisa, di bawah 5 belum", () => {
  expect([4.9, 5, 6.9, 7, 10].map(zonaDari)).toEqual(["belum", "bisa", "bisa", "cocok", "cocok"]);
});
