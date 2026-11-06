import { Show } from "solid-js";
import { persenTerkumpul } from "~/lib/donasi";
import { rupiah } from "~/lib/waktu";

/** Bilah dan ringkasan dana terkumpul. Tanpa bilah bila kampanye tidak punya target. */
export default function ProgresDana(p: { raised: number; target: number | null; supporters: number }) {
  const persen = () => persenTerkumpul(p.raised, p.target);
  return (
    <div>
      <Show when={persen() !== null}>
        <div class="batang" role="progressbar" aria-label="Dana terkumpul" aria-valuemin={0} aria-valuemax={100} aria-valuenow={persen()!}>
          <span style={{ width: `${persen()}%` }} />
        </div>
      </Show>
      <p class="petunjuk">
        <strong>{rupiah(p.raised)}</strong>
        {p.target ? ` dari ${rupiah(p.target)} (${persen()}%)` : " terkumpul"}
        {` • ${p.supporters} pendukung`}
      </p>
    </div>
  );
}
