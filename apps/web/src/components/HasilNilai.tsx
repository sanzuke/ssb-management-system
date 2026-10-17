import { For, Show } from "solid-js";
import { aspectLabel } from "@ssb/shared/aspects";
import type { AssessmentView } from "@ssb/shared";

const koma = (n: number) => String(n).replace(".", ",");

/** Tampilan baca satu penilaian: rata-rata keseluruhan, rata-rata per aspek, dan skor tiap indikator. */
export default function HasilNilai(props: { a: AssessmentView }) {
  const rows = (aspect: string) => props.a.scores.filter((s) => s.aspect === aspect);
  return (
    <div class="hasil">
      <p class="hasil-total">
        <span class="persen" role="img" aria-label={props.a.overall === null ? "Belum ada skor" : `Rata-rata ${koma(props.a.overall)} dari 10`}>
          {props.a.overall === null ? "–" : koma(props.a.overall)}
        </span>
        <span class="petunjuk">
          rata-rata dari 10, dinilai{" "}
          {new Date(`${props.a.assessedOn}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          {props.a.assessor ? ` oleh ${props.a.assessor}` : ""}
        </span>
      </p>
      <For each={props.a.aspects}>
        {(x, i) => (
          <section class="aspek kartu-aspek" aria-label={aspectLabel[x.aspect]}>
            <h3>
              <span class="nomor-aspek" aria-hidden="true">
                {i() + 1}
              </span>
              {aspectLabel[x.aspect]} <span class="rata">rata-rata {koma(x.average)}</span>
            </h3>
            <ul class="daftar-butir">
              <For each={rows(x.aspect)}>
                {(s) => (
                  <li class="butir">
                    <span class="isi">{s.name}</span>
                    <span class="skor" role="img" aria-label={`${s.name}: ${s.score} dari 10`}>
                      {s.score}
                    </span>
                    <span class="batang" aria-hidden="true">
                      <span style={{ width: `${s.score * 10}%` }} />
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
      <Show when={props.a.note}>
        <p class="catatan">
          <strong>Catatan pelatih:</strong> {props.a.note}
        </p>
      </Show>
    </div>
  );
}
