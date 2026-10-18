import { assessmentAspects, aspectLabel, SCORE_MAX } from "@ssb/shared/aspects";
import type { AspectSummary } from "@ssb/shared";
import { For } from "solid-js";

const W = 320;
const H = 280;
const CX = W / 2;
const CY = 140;
const R = 84;
const RINGS = [2, 4, 6, 8, 10];
const n = assessmentAspects.length;
const sudut = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
const titik = (i: number, v: number) => [CX + Math.cos(sudut(i)) * R * (v / SCORE_MAX), CY + Math.sin(sudut(i)) * R * (v / SCORE_MAX)] as const;
const koma = (v: number) => String(v).replace(".", ",");
const bentuk = (s: AspectSummary) =>
  `${assessmentAspects
    .map((a, i) => ({ i, v: s.aspects.find((x) => x.aspect === a)?.average }))
    .filter((p): p is { i: number; v: number } => p.v !== undefined)
    .map(
      (p, k) =>
        `${k === 0 ? "M" : "L"}${titik(p.i, p.v)
          .map((x) => x.toFixed(1))
          .join(",")}`,
    )
    .join(" ")}Z`;

/**
 * Radar enam aspek: periode terbaru (garis penuh hijau) dibanding periode sebelumnya (putus-putus kuning tua),
 * sehingga tidak bergantung pada warna saja. Tabel kecil di bawahnya memuat angka yang sama.
 */
export default function RadarAspek(props: { sekarang: AspectSummary; sebelumnya?: AspectSummary }) {
  return (
    <figure class="radar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Radar rata-rata skor enam aspek, ${props.sekarang.period.name}`}>
        <For each={RINGS}>
          {(r) => (
            <polygon
              points={assessmentAspects
                .map((_, i) =>
                  titik(i, r)
                    .map((x) => x.toFixed(1))
                    .join(","),
                )
                .join(" ")}
              fill="none"
              stroke="var(--garis)"
              stroke-width="1"
            />
          )}
        </For>
        <For each={assessmentAspects}>
          {(a, i) => {
            const [x, y] = titik(i(), SCORE_MAX);
            const [lx, ly] = titik(i(), SCORE_MAX + 2.1);
            return (
              <>
                <line x1={CX} y1={CY} x2={x} y2={y} stroke="var(--garis)" stroke-width="1" />
                <text x={lx} y={ly} text-anchor="middle" dominant-baseline="middle" font-size="10" fill="var(--redup)">
                  {aspectLabel[a].length > 12 ? `${aspectLabel[a].slice(0, 11)}…` : aspectLabel[a]}
                </text>
              </>
            );
          }}
        </For>
        {props.sebelumnya && <path d={bentuk(props.sebelumnya)} fill="none" stroke="#b8861b" stroke-width="2" stroke-dasharray="5 4" />}
        <path d={bentuk(props.sekarang)} fill="rgba(27, 77, 54, 0.15)" stroke="var(--rumput)" stroke-width="2" />
      </svg>
      <figcaption class="radar-legenda">
        <span class="garis-penuh">{props.sekarang.period.name}</span>
        {props.sebelumnya && <span class="garis-putus">{props.sebelumnya.period.name}</span>}
      </figcaption>
      <table class="radar-tabel">
        <thead>
          <tr>
            <th scope="col">Aspek</th>
            <th scope="col">{props.sekarang.period.name}</th>
            {props.sebelumnya && <th scope="col">{props.sebelumnya.period.name}</th>}
          </tr>
        </thead>
        <tbody>
          <For each={props.sekarang.aspects}>
            {(a) => (
              <tr>
                <th scope="row">{aspectLabel[a.aspect]}</th>
                <td>{koma(a.average)}</td>
                {props.sebelumnya && <td>{koma(props.sebelumnya.aspects.find((x) => x.aspect === a.aspect)?.average ?? 0)}</td>}
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </figure>
  );
}
