import { expect, test } from "bun:test";
import { hitungTren, pitaDari } from "./aspects";

test("skor 1-10 jatuh ke lima pita sesuai tabel", () => {
  const kode = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => pitaDari(s).kode);
  expect(kode).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("rata-rata desimal ikut pita yang memuatnya", () => {
  expect(pitaDari(2.9).kode).toBe(1);
  expect(pitaDari(6.9).kode).toBe(3);
  expect(pitaDari(8.5).kode).toBe(4);
});

test("tren butuh minimal dua periode", () => {
  expect(hitungTren([]).arah).toBe("baru");
  expect(hitungTren([7]).arah).toBe("baru");
});

test("tren membandingkan dengan rata-rata maksimal dua periode sebelumnya", () => {
  expect(hitungTren([5, 5.4])).toEqual({ arah: "naik", selisih: 0.4 });
  expect(hitungTren([8, 6, 6.2])).toEqual({ arah: "turun", selisih: -0.8 });
  expect(hitungTren([2, 6, 6.1, 6.2]).arah).toBe("tetap");
});

test("selisih tepat di ambang dihitung naik atau turun", () => {
  expect(hitungTren([6, 6.3]).arah).toBe("naik");
  expect(hitungTren([6, 5.7]).arah).toBe("turun");
});
