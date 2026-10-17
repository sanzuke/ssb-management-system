import { aspectLabel } from "@ssb/shared/aspects";
import type { DevelopmentPlanItem } from "@ssb/shared";
import { For, Show } from "solid-js";

/** Tampilan baca rencana pengembangan satu periode. Kosong = tidak menampilkan apa-apa kecuali `tampilkanKosong`. */
export default function RencanaBaca(props: { items: DevelopmentPlanItem[]; tampilkanKosong?: boolean }) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={
        <Show when={props.tampilkanKosong}>
          <p class="kosong">Belum ada rencana pengembangan untuk periode ini.</p>
        </Show>
      }
    >
      <section class="rencana" aria-label="Rencana pengembangan">
        <h3>Rencana pengembangan</h3>
        <ul class="daftar-rencana">
          <For each={props.items}>
            {(x) => (
              <li>
                <strong>{x.area}</strong>
                <Show when={x.aspect}>
                  <span class="label-aspek">{aspectLabel[x.aspect!]}</span>
                </Show>
                <Show when={x.target}>
                  <p>
                    <span class="petunjuk">Target:</span> {x.target}
                  </p>
                </Show>
                <Show when={x.note}>
                  <p>{x.note}</p>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  );
}
