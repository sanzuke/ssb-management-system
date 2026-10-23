import { Show } from "solid-js";

type Props = {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  rows?: number;
  maxlength?: number;
  hint?: string;
  error?: string | undefined;
  placeholder?: string;
};

/** Kolom teks beberapa baris; pasangan `Field` untuk isian panjang. */
export default function AreaField(p: Props) {
  const describedBy = () => [p.hint ? `${p.id}-hint` : "", p.error ? `${p.id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div class="field" attr:data-salah={p.error ? "" : undefined}>
      <label for={p.id}>{p.label}</label>
      <textarea
        id={p.id}
        name={p.id}
        rows={p.rows ?? 3}
        maxlength={p.maxlength}
        placeholder={p.placeholder}
        value={p.value}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        aria-invalid={p.error ? "true" : undefined}
        aria-describedby={describedBy()}
      />
      <Show when={p.hint}>
        <span class="petunjuk" id={`${p.id}-hint`}>
          {p.hint}
        </span>
      </Show>
      <Show when={p.error}>
        <span class="pesan-salah" id={`${p.id}-err`}>
          {p.error}
        </span>
      </Show>
    </div>
  );
}
