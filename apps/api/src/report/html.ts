import { assessmentAspects, aspectLabel, SCORE_MAX } from "@ssb/shared/aspects";
import type { AssessmentView, DevelopmentPlanItem } from "@ssb/shared";

export type ReportData = {
  ssbName: string;
  player: { fullName: string; memberNo: string | null; birthDate: string; position: string | null };
  assessment: AssessmentView;
  /** Penilaian periode sebelumnya yang boleh dilihat pembaca ini; dipakai sebagai pembanding di radar. */
  previous?: AssessmentView;
  attendance: { hadir: number; izin: number; sakit: number; alpa: number; percent: number | null };
  plan: DevelopmentPlanItem[];
  generatedAt: Date;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const koma = (n: number) => String(n).replace(".", ",");
const tanggal = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// Radar enam aspek sebagai SVG statis. Geometri sama dengan grafik di web.
const W = 360;
const H = 290;
const CX = W / 2;
const CY = 150;
const R = 84;
const sudut = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / assessmentAspects.length;
const titik = (i: number, v: number) => [CX + Math.cos(sudut(i)) * R * (v / SCORE_MAX), CY + Math.sin(sudut(i)) * R * (v / SCORE_MAX)] as const;
const f = (n: number) => n.toFixed(1);

function bentuk(a: AssessmentView) {
  const pts = assessmentAspects
    .map((k, i) => ({ i, v: a.aspects.find((x) => x.aspect === k)?.average ?? null }))
    .filter((p): p is { i: number; v: number } => p.v !== null);
  const d = pts.map((p, n) => `${n === 0 ? "M" : "L"}${titik(p.i, p.v).map(f).join(",")}`).join(" ") + (pts.length > 2 ? "Z" : "");
  return { pts, d };
}

export function radarSvg(a: AssessmentView, prev?: AssessmentView): string {
  const rings = [2, 4, 6, 8, 10]
    .map((r) => `<polygon class="cincin" points="${assessmentAspects.map((_, i) => titik(i, r).map(f).join(",")).join(" ")}"/>`)
    .join("");
  const axes = assessmentAspects
    .map((k, i) => {
      const [x, y] = titik(i, SCORE_MAX);
      const lx = CX + Math.cos(sudut(i)) * (R + 20);
      const ly = CY + Math.sin(sudut(i)) * (R + 20);
      const anchor = Math.abs(Math.cos(sudut(i))) < 0.2 ? "middle" : Math.cos(sudut(i)) > 0 ? "start" : "end";
      const words = aspectLabel[k].split(" ");
      const tspans = words.map((w, n) => `<tspan x="${f(lx)}" dy="${n === 0 ? (words.length > 1 ? "-0.5em" : "0") : "1.2em"}">${esc(w)}</tspan>`).join("");
      return `<line class="poros" x1="${CX}" y1="${CY}" x2="${f(x)}" y2="${f(y)}"/><text class="lp" x="${f(lx)}" y="${f(ly + 4)}" text-anchor="${anchor}">${tspans}</text>`;
    })
    .join("");
  const cur = bentuk(a);
  const dots = cur.pts.map((p) => `<circle class="dot" cx="${titik(p.i, p.v).map(f).join('" cy="')}" r="4"/>`).join("");
  const lalu = prev ? `<path class="lalu" d="${bentuk(prev).d}"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Radar enam aspek">${rings}${axes}<text class="ls" x="${CX + 3}" y="${CY - R * 0.5 + 3}">5</text><text class="ls" x="${CX + 3}" y="${CY - R + 3}">10</text>${lalu}<path class="kini" d="${cur.d}"/>${dots}</svg>`;
}

const CSS = `
@page { size: A4; margin: 16mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Atkinson Hyperlegible Next", "Segoe UI", "DejaVu Sans", Arial, sans-serif; color: #14201a; font-size: 10pt; line-height: 1.4; }
header { background: #1b4d36; color: #f4f6ef; padding: 14px 18px; border-radius: 6px; }
header .ssb { font-size: 9.5pt; opacity: .85; }
header h1 { margin: 2px 0 0; font-size: 20pt; letter-spacing: -.01em; }
.meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 24px; margin: 12px 0 4px; }
.meta div { display: flex; gap: 8px; }
.meta dt { color: #56655b; min-width: 96px; }
.meta dd { margin: 0; font-weight: 700; }
h2 { font-size: 12pt; margin: 14px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #1b4d36; break-after: avoid; }
.ringkas { display: flex; gap: 20px; align-items: stretch; }
.angka { align-self: flex-start; border: 1px solid #c9d1c4; border-radius: 6px; padding: 10px 16px; min-width: 120px; }
.angka b { display: block; font-size: 26pt; line-height: 1.1; color: #1b4d36; }
.angka span { color: #56655b; font-size: 9pt; }
.radar { flex: 1; max-width: 300px; }
.radar svg { width: 100%; height: auto; display: block; }
.cincin { fill: none; stroke: #c9d1c4; stroke-width: 1; }
.poros { stroke: #c9d1c4; stroke-width: 1; }
.lp { font-size: 11px; fill: #14201a; }
.ls { font-size: 10px; fill: #56655b; }
.kini { fill: #2a8a57; fill-opacity: .18; stroke: #2a8a57; stroke-width: 2.5; stroke-linejoin: round; }
.lalu { fill: none; stroke: #c0841a; stroke-width: 2.5; stroke-dasharray: 6 4; stroke-linejoin: round; }
.dot { fill: #2a8a57; stroke: #fff; stroke-width: 1.5; }
.legenda { display: flex; gap: 16px; font-size: 9pt; margin-top: 2px; }
.legenda i { display: inline-block; width: 22px; border-top: 2.5px solid #2a8a57; vertical-align: middle; margin-right: 6px; }
.legenda i.lalu { border-top: 2.5px dashed #c0841a; background: none; }
.aspek { break-inside: avoid; margin-bottom: 8px; }
.aspek h3 { margin: 10px 0 4px; font-size: 11pt; display: flex; justify-content: space-between; }
.aspek h3 small { color: #56655b; font-weight: 400; font-size: 9.5pt; }
.butir { display: grid; grid-template-columns: 1fr 130px 26px; gap: 10px; align-items: center; padding: 2px 0; border-bottom: 1px solid #e3e8df; }
.bar { height: 7px; background: #e3e8df; border-radius: 4px; overflow: hidden; }
.bar span { display: block; height: 100%; background: #1b4d36; }
.skor { text-align: right; font-weight: 700; }
.hadir { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; text-align: center; }
.hadir div { border: 1px solid #c9d1c4; border-radius: 6px; padding: 6px 4px; }
.hadir b { display: block; font-size: 15pt; }
.hadir span { font-size: 9pt; color: #56655b; }
.catatan { background: #f4f6ef; border-left: 4px solid #f0c23b; padding: 8px 12px; margin: 0; white-space: pre-wrap; break-inside: avoid; }
.rencana { break-inside: avoid; margin: 0 0 6px; padding: 6px 0; border-bottom: 1px solid #e3e8df; }
.rencana b { display: block; }
.rencana small { color: #56655b; }
.rencana p { margin: 2px 0 0; white-space: pre-wrap; }
.kosong { color: #56655b; margin: 4px 0; }
footer { margin-top: 14px; font-size: 8.5pt; color: #56655b; border-top: 1px solid #c9d1c4; padding-top: 6px; }
`;

/** HTML rapor satu pemain untuk satu periode. Semua teks dari data di-escape; tanpa skrip dan tanpa sumber luar. */
export function reportHtml(d: ReportData): string {
  const a = d.assessment;
  const rows = (aspect: string) => a.scores.filter((s) => s.aspect === aspect);
  const aspects = a.aspects
    .map(
      (x) =>
        `<section class="aspek"><h3>${esc(aspectLabel[x.aspect])} <small>rata-rata ${koma(x.average)}</small></h3>${rows(x.aspect)
          .map(
            (s) =>
              `<div class="butir"><span>${esc(s.name)}</span><span class="bar"><span style="width:${s.score * 10}%"></span></span><span class="skor">${s.score}</span></div>`,
          )
          .join("")}</section>`,
    )
    .join("");
  const plan = d.plan.length
    ? d.plan
        .map(
          (x) =>
            `<div class="rencana"><b>${esc(x.area)}</b>${x.aspect ? `<small>${esc(aspectLabel[x.aspect])}</small>` : ""}${x.target ? `<p>Target: ${esc(x.target)}</p>` : ""}${x.note ? `<p>${esc(x.note)}</p>` : ""}</div>`,
        )
        .join("")
    : `<p class="kosong">Belum ada rencana pengembangan.</p>`;
  const att = d.attendance;
  const enoughForRadar = a.aspects.length >= 3;
  const attendance =
    att.percent === null
      ? `<p class="kosong">Belum ada absensi tercatat pada periode ini.</p>`
      : `<div class="hadir"><div><b>${koma(att.percent)}%</b><span>hadir</span></div><div><b>${att.hadir}</b><span>hadir (kali)</span></div><div><b>${att.izin}</b><span>izin</span></div><div><b>${att.sakit}</b><span>sakit</span></div><div><b>${att.alpa}</b><span>alpa</span></div></div>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Rapor ${esc(d.player.fullName)} - ${esc(a.period.name)}</title><style>${CSS}</style></head><body>
<header><div class="ssb">${esc(d.ssbName)}</div><h1>Rapor perkembangan pemain</h1></header>
<dl class="meta">
<div><dt>Nama</dt><dd>${esc(d.player.fullName)}</dd></div>
<div><dt>Periode</dt><dd>${esc(a.period.name)}</dd></div>
<div><dt>Nomor anggota</dt><dd>${esc(d.player.memberNo ?? "-")}</dd></div>
<div><dt>Kelompok usia</dt><dd>${esc(a.ageGroup.name)}</dd></div>
<div><dt>Tanggal lahir</dt><dd>${esc(tanggal(d.player.birthDate))}</dd></div>
<div><dt>Dinilai</dt><dd>${esc(tanggal(a.assessedOn))}${a.assessor ? ` oleh ${esc(a.assessor)}` : ""}</dd></div>
</dl>
<h2>Ringkasan</h2>
<div class="ringkas">
<div class="angka"><b>${a.overall === null ? "-" : koma(a.overall)}</b><span>rata-rata dari ${SCORE_MAX}</span></div>
<div class="radar">${
    enoughForRadar
      ? `${radarSvg(a, d.previous)}<div class="legenda"><span><i></i>${esc(a.period.name)}</span>${d.previous ? `<span><i class="lalu"></i>${esc(d.previous.period.name)}</span>` : ""}</div>`
      : `<p class="kosong">Radar muncul bila minimal tiga aspek sudah punya skor.</p>`
  }</div>
</div>
<h2>Skor per indikator</h2>
${aspects || `<p class="kosong">Belum ada skor.</p>`}
<h2>Kehadiran latihan</h2>
${attendance}
<h2>Rencana pengembangan</h2>
${plan}
<h2>Catatan pelatih</h2>
${a.note ? `<p class="catatan">${esc(a.note)}</p>` : `<p class="kosong">Tidak ada catatan.</p>`}
<footer>Skala skor 1 sampai ${SCORE_MAX}. Dibuat ${esc(d.generatedAt.toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }))} WIB.</footer>
</body></html>`;
}
