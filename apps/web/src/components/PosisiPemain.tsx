import {
  type AssessmentView,
  hitungKecocokan,
  type Position,
  type PositionCode,
  type PositionWeights,
  positionLabel,
  positions,
  USIA_MIN_POSISI,
  zonaDari,
  zonaLabel,
  type ZonaPosisi,
} from "@ssb/shared";
import { createResource, For, Show } from "solid-js";
import { api } from "~/lib/api";

const koma = (n: number) => String(n).replace(".", ",");
/** Dari gawang sendiri (bawah) ke gawang lawan (atas). */
const urutan: PositionCode[] = ["FW", "MF", "DF", "GK"];
const TINGGI = 66;

/**
 * Kecocokan posisi dari skor indikator periode yang tampil dan bobot posisi SSB. Hanya saran: posisi utama tetap dipilih manusia.
 * Pemain di bawah usia 10 tahun tidak diberi zona; mereka diajak mencoba semua posisi.
 */
export default function PosisiPemain(props: { nilai: AssessmentView | null; usia: number; utama: Position | null }) {
  const [bobot] = createResource(() => api<PositionWeights>("/position-weights").catch(() => null));

  const hasil = () => {
    const b = bobot();
    const n = props.nilai;
    if (!b || !n || n.scores.length === 0) return null;
    return Object.fromEntries(
      positions.map((p) => {
        const skor = hitungKecocokan(n.scores, b[p]);
        return [p, skor === null ? null : { skor, zona: zonaDari(skor) }];
      }),
    ) as Record<PositionCode, { skor: number; zona: ZonaPosisi } | null>;
  };
  const adaHasil = () => Object.values(hasil() ?? {}).some((x) => x !== null);

  return (
    <Show
      when={props.usia >= USIA_MIN_POSISI}
      fallback={
        <section class="panel-nilai panel-posisi" aria-label="Posisi">
          <div class="panel-kepala">
            <h3>Posisi</h3>
          </div>
          <p class="petunjuk">Di usia dini anak diajak mencoba semua posisi. Kecocokan posisi baru ditampilkan mulai usia {USIA_MIN_POSISI} tahun.</p>
        </section>
      }
    >
      <Show when={hasil()}>
        {(h) => (
          <section class="panel-nilai panel-posisi" aria-label="Kecocokan posisi">
            <div class="panel-kepala">
              <div>
                <h3>Kecocokan posisi</h3>
                <p class="petunjuk">Saran dari skor indikator, bukan keputusan.</p>
              </div>
            </div>
            <Show when={adaHasil()} fallback={<p class="kosong">Belum cukup indikator yang dinilai untuk menghitung kecocokan posisi.</p>}>
              <div class="posisi-isi">
                <svg class="lapangan-mini" viewBox={`0 0 220 ${TINGGI * 4 + 12}`} aria-hidden="true">
                  <rect x="2" y="2" width="216" height={TINGGI * 4 + 8} rx="8" class="pos-garis" />
                  <For each={urutan}>
                    {(p, i) => (
                      <g>
                        <rect x="8" y={8 + i() * TINGGI} width="204" height={TINGGI - 6} rx="6" class="pos-band" data-zona={h()[p]?.zona ?? "kosong"} />
                        <text x="110" y={8 + i() * TINGGI + (TINGGI - 6) / 2 - 3} class="pos-nama" text-anchor="middle">
                          {positionLabel[p]}
                          {props.utama === p ? " ★" : ""}
                        </text>
                        <text x="110" y={8 + i() * TINGGI + (TINGGI - 6) / 2 + 15} class="pos-skor" text-anchor="middle">
                          {h()[p] ? `${koma(h()[p]!.skor)} · ${zonaLabel[h()[p]!.zona]}` : "belum cukup data"}
                        </text>
                      </g>
                    )}
                  </For>
                </svg>
                <ul class="posisi-daftar">
                  <For each={urutan}>
                    {(p) => (
                      <li data-zona={h()[p]?.zona ?? "kosong"}>
                        <strong>{positionLabel[p]}</strong>
                        {props.utama === p ? <span class="petunjuk"> (posisi utama)</span> : ""}
                        <span>{h()[p] ? `${koma(h()[p]!.skor)}, ${zonaLabel[h()[p]!.zona].toLowerCase()}` : "belum cukup data"}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
          </section>
        )}
      </Show>
    </Show>
  );
}
