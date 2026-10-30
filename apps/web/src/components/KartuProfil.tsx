import { assessmentAspects, type AssessmentAspect, pitaDari, type Tren } from "@ssb/shared/aspects";
import type { AssessmentView, PlayerDetail } from "@ssb/shared";
import { For, type JSX, Show } from "solid-js";
import { posisiLabel, statusLabel, usia } from "~/lib/pemain";
import FotoPemain from "./FotoPemain";

const singkat: Record<AssessmentAspect, string> = {
  technical: "TEK",
  physical: "FIS",
  tactical: "TAK",
  mental: "MEN",
  movement: "GER",
  game_intelligence: "KEC",
};
const koma = (n: number) => String(n).replace(".", ",");

/**
 * Kartu siswa bergaya kartu koleksi (desain Stitch "Statistik Siswa Interaktif"): rata-rata keseluruhan,
 * posisi, KU, foto, nama, dan enam aspek penilaian pada periode yang dipilih.
 */
export default function KartuProfil(props: { pl: PlayerDetail; nilai: AssessmentView | null; tren?: Tren; children?: JSX.Element }) {
  const rata = (a: AssessmentAspect) => props.nilai?.aspects.find((x) => x.aspect === a)?.average ?? null;
  return (
    <section class="kartu-pro" aria-label={`Kartu ${props.pl.fullName}`}>
      <div class="kartu-pro-badan">
        <svg class="kartu-pro-garis" viewBox="0 0 320 480" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="160" cy="240" r="70" />
          <line x1="0" x2="320" y1="240" y2="240" />
          <rect x="70" y="0" width="180" height="90" />
          <rect x="70" y="390" width="180" height="90" />
        </svg>
        <div class="kartu-pro-atas">
          <div
            class="kartu-pro-ovr"
            role="img"
            aria-label={props.nilai?.overall == null ? "Belum ada nilai" : `Rata-rata ${koma(props.nilai.overall)} dari 10`}
          >
            <strong>{props.nilai?.overall == null ? "–" : koma(props.nilai.overall)}</strong>
            <span>RATA</span>
            <Show when={props.pl.position}>
              <em>{props.pl.position}</em>
            </Show>
          </div>
          <div class="kartu-pro-ku">
            <span class="pil">{props.pl.ageGroup?.name ?? "Belum ada KU"}</span>
            <span>{usia(props.pl.birthDate)} tahun</span>
          </div>
        </div>
        <div class="kartu-pro-foto">
          <FotoPemain id={props.pl.id} nama={props.pl.fullName} photoV={props.pl.photoV} ukuran="potret" />
          <Show when={props.pl.jerseyNo ?? props.pl.memberNo}>
            <span class="kartu-pro-nomor">{props.pl.jerseyNo !== null ? `#${props.pl.jerseyNo}` : props.pl.memberNo}</span>
          </Show>
        </div>
        <div class="kartu-pro-nama">
          <h2>{props.pl.fullName}</h2>
          <p>{props.pl.position ? posisiLabel[props.pl.position] : "Posisi belum ditentukan"}</p>
          <Show when={props.tren}>
            {(t) => (
              <span class="tren" data-arah={t().arah}>
                {t().arah === "naik" ? "▲ Naik" : t().arah === "turun" ? "● Perlu perhatian" : t().arah === "tetap" ? "= Stabil" : "Baru"}
                <Show when={t().selisih !== null && t().selisih !== 0 && t().arah !== "baru"}>
                  {" "}
                  ({t().selisih! > 0 ? "+" : ""}
                  {koma(t().selisih!)})
                </Show>
              </span>
            )}
          </Show>
        </div>
        <ul class="kartu-pro-atribut" aria-label="Rata-rata enam aspek">
          <For each={assessmentAspects}>
            {(a) => (
              <li data-pita={rata(a) === null ? undefined : String(pitaDari(rata(a)!).kode)}>
                <span>{singkat[a]}</span>
                <strong>{rata(a) === null ? "–" : koma(rata(a)!)}</strong>
                <Show when={rata(a) !== null}>
                  <small>{pitaDari(rata(a)!).kata}</small>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </div>
      <div class="kartu-pro-kaki">
        <span>ID siswa: {props.pl.memberNo ?? "-"}</span>
        <span class="status-pil">{statusLabel[props.pl.status]}</span>
      </div>
      {props.children}
    </section>
  );
}
