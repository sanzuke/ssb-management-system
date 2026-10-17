import { expect, test } from "bun:test";
import type { AssessmentView } from "@ssb/shared";
import { radarSvg, reportHtml } from "./html";

const mk = (over: Partial<AssessmentView> = {}): AssessmentView => ({
  id: "a",
  period: { id: "p", name: "Semester <1>", startDate: "2026-01-01", endDate: "2026-06-30" },
  ageGroup: { id: "k", name: "KU-10" },
  assessedOn: "2026-03-01",
  note: '<script>alert("x")</script>',
  assessor: "Pak <Budi>",
  publishedAt: null,
  scores: [
    { indicatorId: "1", aspect: "technical", name: "Kontrol <bola>", score: 8 },
    { indicatorId: "2", aspect: "physical", name: "Kecepatan", score: 6 },
    { indicatorId: "3", aspect: "mental", name: "Fokus", score: 9 },
  ],
  aspects: [
    { aspect: "technical", average: 8 },
    { aspect: "physical", average: 6 },
    { aspect: "mental", average: 9 },
  ],
  overall: 7.7,
  ...over,
});
const data = (a: AssessmentView) => ({
  ssbName: "SSB <Garuda>",
  player: { fullName: "Ali & Bima", memberNo: "SSB-0001", birthDate: "2015-05-05", position: null },
  assessment: a,
  attendance: { hadir: 8, izin: 1, sakit: 0, alpa: 1, percent: 80 },
  plan: [{ id: "x", aspect: "mental" as const, area: "Tenang <di> depan gawang", target: "Gol dari 3 peluang", note: null }],
  generatedAt: new Date("2026-10-17T10:00:00Z"),
});

test("semua teks dari data di-escape; tidak ada skrip atau sumber luar", () => {
  const html = reportHtml(data(mk()));
  expect(html).not.toContain("<script");
  expect(html).not.toContain("<Budi>");
  expect(html).not.toContain("<Garuda>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("Ali &amp; Bima");
  expect(html).not.toMatch(/(src|href)=["']https?:/);
  expect(html).toContain("7,7");
  expect(html).toContain("80%");
  expect(html).toContain("Tenang &lt;di&gt; depan gawang");
  expect(html).not.toContain("<di>");
});

test("radar hanya dengan >= 3 aspek; pembanding periode lalu digambar putus-putus", () => {
  expect(reportHtml(data(mk({ aspects: [{ aspect: "technical", average: 8 }] })))).toContain("Radar muncul bila minimal tiga aspek");
  const svg = radarSvg(mk(), mk({ period: { id: "q", name: "Lalu", startDate: "2025-01-01", endDate: "2025-06-30" } }));
  expect(svg).toContain('class="kini"');
  expect(svg).toContain('class="lalu"');
  expect(radarSvg(mk())).not.toContain('class="lalu"');
});

test("tanpa absensi: pesan kosong, bukan 0%", () => {
  const d = data(mk());
  const html = reportHtml({ ...d, attendance: { hadir: 0, izin: 0, sakit: 0, alpa: 0, percent: null } });
  expect(html).toContain("Belum ada absensi tercatat");
  expect(html).not.toContain(`class="hadir"`);
});
