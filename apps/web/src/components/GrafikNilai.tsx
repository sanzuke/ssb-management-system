import { assessmentAspects, aspectLabel, SCORE_MAX } from "@ssb/shared/aspects";
import type { AssessmentView } from "@ssb/shared";
import { createMemo, For, Show } from "solid-js";

const koma = (n: number) => String(n).replace(".", ",");
const pendek = (s: string, n = 11) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Urut dari periode tertua ke terbaru. */
const urut = (list: AssessmentView[]) => [...list].sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));

const aspectValue = (a: AssessmentView, aspect: string) => a.aspects.find((x) => x.aspect === aspect)?.average ?? null;

// Radar: pusat (CX, CY), jari-jari R untuk skor 10; label di luar jari-jari.
const W = 360;
const H = 290;
const CX = W / 2;
const CY = 150;
const R = 84;
const sudut = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / assessmentAspects.length;
const titik = (i: number, v: number) => [CX + Math.cos(sudut(i)) * R * (v / SCORE_MAX), CY + Math.sin(sudut(i)) * R * (v / SCORE_MAX)] as const;
const bentuk = (a: AssessmentView) => {
  const pts = assessmentAspects
    .map((k, i) => ({ k, i, v: aspectValue(a, k) }))
    .filter((p): p is { k: (typeof assessmentAspects)[number]; i: number; v: number } => p.v !== null);
  return {
    pts,
    path:
      pts
        .map(
          (p, n) =>
            `${n === 0 ? "M" : "L"}${titik(p.i, p.v)
              .map((x) => x.toFixed(1))
              .join(",")}`,
        )
        .join(" ") + (pts.length > 2 ? "Z" : ""),
  };
};
const RINGS = [2, 4, 6, 8, 10];

// Garis perkembangan.
const LW = 360;
const LH = 190;
const ML = 32;
const MR = 16;
const MT = 22;
const MB = 40;
const lx = (i: number, n: number) => ML + (n === 1 ? (LW - ML - MR) / 2 : (i * (LW - ML - MR)) / (n - 1));
const ly = (v: number) => MT + (LH - MT - MB) * (1 - v / SCORE_MAX);

/**
 * Radar enam aspek (periode terpilih dibanding periode sebelumnya) dan garis rata-rata antar periode.
 * Warna: hijau = periode terpilih (garis penuh), kuning tua = periode sebelumnya (garis putus-putus),
 * jadi tidak bergantung pada warna saja. Tabel di bawah memuat angka yang sama.
 */
export default function GrafikNilai(props: { list: AssessmentView[]; selectedId?: string }) {
  const sorted = createMemo(() => urut(props.list).filter((a) => a.overall !== null));
  const idx = createMemo(() => {
    const i = sorted().findIndex((a) => a.period.id === props.selectedId);
    return i >= 0 ? i : sorted().length - 1;
  });
  const cur = createMemo(() => sorted()[idx()]);
  const prev = createMemo(() => (idx() > 0 ? sorted()[idx() - 1] : undefined));

  return (
    <Show when={cur()} fallback={<p class="kosong">Grafik muncul setelah ada penilaian dengan skor.</p>}>
      <div class="grafik-baris">
        <figure class="grafik">
          <figcaption>
            <strong>Profil aspek</strong>
            <span class="petunjuk">skor 0 sampai 10, rata-rata tiap aspek</span>
          </figcaption>
          <Show
            when={bentuk(cur()!).pts.length >= 3}
            fallback={<p class="kosong">Radar muncul bila minimal tiga aspek sudah punya skor. Saat ini {bentuk(cur()!).pts.length} aspek terisi.</p>}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Radar enam aspek periode ${cur()!.period.name}${prev() ? ` dibanding ${prev()!.period.name}` : ""}`}
            >
              <For each={RINGS}>
                {(r) => (
                  <polygon
                    class="cincin"
                    points={assessmentAspects
                      .map((_, i) =>
                        titik(i, r)
                          .map((x) => x.toFixed(1))
                          .join(","),
                      )
                      .join(" ")}
                  />
                )}
              </For>
              <For each={assessmentAspects}>
                {(k, i) => {
                  const [x, y] = titik(i(), SCORE_MAX);
                  const [lxp, lyp] = [CX + Math.cos(sudut(i())) * (R + 20), CY + Math.sin(sudut(i())) * (R + 20)];
                  const anchor = Math.abs(Math.cos(sudut(i()))) < 0.2 ? "middle" : Math.cos(sudut(i())) > 0 ? "start" : "end";
                  return (
                    <>
                      <line class="poros" x1={CX} y1={CY} x2={x} y2={y} />
                      <text class="label-poros" x={lxp} y={lyp + 4} text-anchor={anchor}>
                        <For each={aspectLabel[k].split(" ")}>
                          {(kata, n) => (
                            <tspan x={lxp} dy={n() === 0 ? (aspectLabel[k].includes(" ") ? "-0.5em" : 0) : "1.2em"}>
                              {kata}
                            </tspan>
                          )}
                        </For>
                      </text>
                    </>
                  );
                }}
              </For>
              <text class="label-skala" x={CX + 3} y={CY - R * 0.5 + 3}>
                5
              </text>
              <text class="label-skala" x={CX + 3} y={CY - R + 3}>
                10
              </text>
              <Show when={prev()}>
                <path class="radar-lalu" d={bentuk(prev()!).path} />
              </Show>
              <path class="radar-kini" d={bentuk(cur()!).path} />
              <For each={bentuk(cur()!).pts}>
                {(p) => {
                  const [x, y] = titik(p.i, p.v);
                  return (
                    <circle class="titik-kini" cx={x} cy={y} r="4.5">
                      <title>{`${aspectLabel[p.k]}: ${koma(p.v)}`}</title>
                    </circle>
                  );
                }}
              </For>
            </svg>
          </Show>
          <ul class="legenda">
            <li>
              <svg width="28" height="10" aria-hidden="true">
                <line x1="0" y1="5" x2="28" y2="5" class="garis-kini" />
              </svg>
              {cur()!.period.name}
            </li>
            <Show when={prev()}>
              <li>
                <svg width="28" height="10" aria-hidden="true">
                  <line x1="0" y1="5" x2="28" y2="5" class="garis-lalu" />
                </svg>
                {prev()!.period.name}
              </li>
            </Show>
          </ul>
        </figure>

        <figure class="grafik">
          <figcaption>
            <strong>Perkembangan antar periode</strong>
            <span class="petunjuk">rata-rata semua indikator, skala 0 sampai 10</span>
          </figcaption>
          <Show when={sorted().length > 1} fallback={<p class="kosong">Grafik perkembangan muncul setelah dua periode atau lebih dinilai.</p>}>
            <svg
              viewBox={`0 0 ${LW} ${LH}`}
              role="img"
              aria-label={`Rata-rata per periode: ${sorted()
                .map((a) => `${a.period.name} ${koma(a.overall!)}`)
                .join(", ")}`}
            >
              <For each={[0, 5, 10]}>
                {(v) => (
                  <>
                    <line class="kisi" x1={ML} x2={LW - MR} y1={ly(v)} y2={ly(v)} />
                    <text class="label-skala" x={ML - 6} y={ly(v) + 4} text-anchor="end">
                      {v}
                    </text>
                  </>
                )}
              </For>
              <polyline
                class="garis-kini garis-data"
                fill="none"
                points={sorted()
                  .map((a, i) => `${lx(i, sorted().length).toFixed(1)},${ly(a.overall!).toFixed(1)}`)
                  .join(" ")}
              />
              <For each={sorted()}>
                {(a, i) => {
                  const aktif = () => a.period.id === cur()?.period.id;
                  return (
                    <>
                      <circle class={aktif() ? "titik-kini" : "titik-biasa"} cx={lx(i(), sorted().length)} cy={ly(a.overall!)} r={aktif() ? 6 : 4.5}>
                        <title>{`${a.period.name}: ${koma(a.overall!)}`}</title>
                      </circle>
                      <text class="label-nilai" x={lx(i(), sorted().length)} y={ly(a.overall!) - 11} text-anchor="middle">
                        {koma(a.overall!)}
                      </text>
                      <text
                        class="label-poros"
                        x={lx(i(), sorted().length)}
                        y={LH - MB + 18}
                        text-anchor={i() === 0 ? "start" : i() === sorted().length - 1 ? "end" : "middle"}
                      >
                        {pendek(a.period.name, 14)}
                      </text>
                    </>
                  );
                }}
              </For>
            </svg>
          </Show>
        </figure>

        <details class="riwayat-nilai">
          <summary>Lihat angkanya dalam tabel</summary>
          <div class="tabel-gulir">
            <table class="tabel-nilai">
              <thead>
                <tr>
                  <th scope="col">Aspek</th>
                  <For each={sorted()}>{(a) => <th scope="col">{a.period.name}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={assessmentAspects}>
                  {(k) => (
                    <tr>
                      <th scope="row">{aspectLabel[k]}</th>
                      <For each={sorted()}>
                        {(a) => {
                          const v = aspectValue(a, k);
                          return <td>{v === null ? "–" : koma(v)}</td>;
                        }}
                      </For>
                    </tr>
                  )}
                </For>
                <tr>
                  <th scope="row">Rata-rata</th>
                  <For each={sorted()}>{(a) => <td>{koma(a.overall!)}</td>}</For>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </Show>
  );
}
