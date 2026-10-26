import { expect, test } from "bun:test";
import { emptySiteContent, siteContentSchema } from "./site";

test("header bagian opsional dan diterima bila diisi", () => {
  const dasar = emptySiteContent("SSB Uji");
  expect(siteContentSchema.safeParse(dasar).success).toBe(true);
  const isi = { ...dasar, sections: { facilities: { title: { id: "Fasilitas Kami", en: "Our Facilities" }, intro: { id: "Aman dan nyaman" } } } };
  const r = siteContentSchema.safeParse(isi);
  expect(r.success).toBe(true);
  expect(r.success && r.data.sections?.facilities?.title?.en).toBe("Our Facilities");
});

test("header bagian menolak teks terlalu panjang dan bagian tak dikenal dibuang", () => {
  const dasar = emptySiteContent("SSB Uji");
  const panjang = { ...dasar, sections: { programs: { title: { id: "x".repeat(2001) } } } };
  expect(siteContentSchema.safeParse(panjang).success).toBe(false);
  const asing = siteContentSchema.safeParse({ ...dasar, sections: { rahasia: { title: { id: "x" } } } });
  expect(asing.success && "rahasia" in (asing.data.sections ?? {})).toBe(false);
});
