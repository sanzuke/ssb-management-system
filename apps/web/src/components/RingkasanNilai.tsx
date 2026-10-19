import { A } from "@solidjs/router";
import { aspectLabel } from "@ssb/shared/aspects";
import type { AssessmentView, AspectSummary, DevelopmentPlanItem } from "@ssb/shared";
import { createMemo, createResource, For, Show } from "solid-js";
import { api } from "~/lib/api";
import RadarAspek from "./RadarAspek";

const koma = (n: number) => String(n).replace(".", ",");
/** Skor di bawah ini ditandai kuning sebagai area yang perlu dikembangkan. */
const AMBANG = 6;
const ringkas = (a: AssessmentView): AspectSummary => ({
  period: { id: a.period.id, name: a.period.name, startDate: a.period.startDate },
  assessments: 1,
  aspects: a.aspects,
});

/** Radar, rincian skor per aspek, dan rencana pengembangan untuk satu periode (tab periode bila lebih dari satu). */
export default function RingkasanNilai(props: { playerId: string; list: AssessmentView[]; selectedId: string; onSelect: (id: string) => void; staf: boolean }) {
  const urut = createMemo(() => [...props.list].sort((a, b) => b.period.startDate.localeCompare(a.period.startDate)));
  const cur = createMemo(() => urut().find((a) => a.period.id === props.selectedId) ?? urut()[0] ?? null);
  const prev = createMemo(() => {
    const i = urut().findIndex((a) => a.period.id === cur()?.period.id);
    return i >= 0
      ? (urut()
          .slice(i + 1)
          .find((a) => a.overall !== null) ?? null)
      : null;
  });
  const delta = createMemo(() => (cur()?.overall != null && prev()?.overall != null ? Math.round((cur()!.overall! - prev()!.overall!) * 10) / 10 : null));
  const [rencana] = createResource(
    () => cur()?.period.id ?? null,
    (pid) =>
      api<{ items: DevelopmentPlanItem[] }>(`/players/${encodeURIComponent(props.playerId)}/development-plan/${pid}`)
        .then((r) => r.items)
        .catch(() => [] as DevelopmentPlanItem[]),
  );
  const rows = (a: AssessmentView, aspect: string) => a.scores.filter((s) => s.aspect === aspect);

  return (
    <Show
      when={cur()}
      fallback={
        <section class="panel-nilai">
          <p class="kosong">Belum ada penilaian untuk pemain ini{props.staf ? "." : ", atau belum diterbitkan oleh SSB."}</p>
          <Show when={props.staf}>
            <A class="tombol utama" href={`/nilai/${props.playerId}`}>
              Isi penilaian
            </A>
          </Show>
        </section>
      }
    >
      {(a) => (
        <>
          <Show when={urut().length > 1}>
            {/* biome-ignore lint/a11y/useSemanticElements: deretan tab periode */}
            <div class="tab-periode" role="group" aria-label="Pilih periode">
              <For each={urut()}>
                {(x) => (
                  <button type="button" aria-pressed={a().period.id === x.period.id} onClick={() => props.onSelect(x.period.id)}>
                    {x.period.name}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <section class="panel-nilai profil-radar" id="radar" aria-label="Radar performa">
            <div class="panel-kepala">
              <div>
                <h3>Radar performa</h3>
                <p class="petunjuk">
                  {a().period.name}
                  {prev() ? `, dibanding ${prev()!.period.name}` : ""}
                </p>
              </div>
              <Show when={delta() !== null}>
                <span class="delta" data-turun={delta()! < 0 ? "" : undefined}>
                  {delta()! > 0 ? "▲ +" : delta()! < 0 ? "▼ " : "= "}
                  {koma(delta()!)} rata-rata
                </span>
              </Show>
            </div>
            <RadarAspek sekarang={ringkas(a())} sebelumnya={prev() ? ringkas(prev()!) : undefined} />
          </section>

          <section id="atribut" aria-label="Rincian skor">
            <div class="panel-kepala">
              <h3>Rincian skor</h3>
              <span class="petunjuk">skala 1 sampai 10; kuning = perlu dikembangkan</span>
            </div>
            <div class="grid-aspek">
              <For each={a().aspects}>
                {(x, i) => (
                  <section class="aspek kartu-aspek" aria-label={aspectLabel[x.aspect]}>
                    <h3>
                      <span class="nomor-aspek" aria-hidden="true">
                        {i() + 1}
                      </span>
                      {aspectLabel[x.aspect]} <span class="rata">rata-rata {koma(x.average)}</span>
                    </h3>
                    <ul class="daftar-butir">
                      <For each={rows(a(), x.aspect)}>
                        {(s) => (
                          <li class="butir" data-rendah={s.score < AMBANG ? "" : undefined}>
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
            </div>
            <Show when={a().note}>
              <p class="catatan">
                <strong>Catatan pelatih:</strong> {a().note}
              </p>
            </Show>
          </section>

          <Show when={(rencana() ?? []).length > 0}>
            <section class="panel-nilai misi" aria-label="Fokus pengembangan">
              <div class="panel-kepala">
                <h3>Fokus pengembangan</h3>
                <Show when={props.staf}>
                  <A class="tombol tipis tombol-kecil" href={`/rencana/${props.playerId}`}>
                    Ubah rencana
                  </A>
                </Show>
              </div>
              <ul class="misi-daftar">
                <For each={rencana()}>
                  {(x) => (
                    <li>
                      <span class="misi-ikon" aria-hidden="true">
                        ⚑
                      </span>
                      <div>
                        <strong>{x.area}</strong>
                        <Show when={x.target}>
                          <span class="petunjuk">Target: {x.target}</span>
                        </Show>
                        <Show when={x.note}>
                          <span class="petunjuk">{x.note}</span>
                        </Show>
                      </div>
                      <Show when={x.aspect}>
                        <span class="label-aspek">{aspectLabel[x.aspect!]}</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          </Show>
        </>
      )}
    </Show>
  );
}
