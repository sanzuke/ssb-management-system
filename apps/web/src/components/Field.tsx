import { Show } from "solid-js";

type Props = {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  type?: string;
  hint?: string;
  error?: string | undefined;
  autocomplete?: string;
  required?: boolean;
  minlength?: number;
  maxlength?: number;
  pattern?: string;
  inputmode?: "text" | "email" | "numeric";
};

export default function Field(p: Props) {
  const describedBy = () => [p.hint ? `${p.id}-hint` : "", p.error ? `${p.id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div class="field" attr:data-salah={p.error ? "" : undefined}>
      <label for={p.id}>{p.label}</label>
      <input
        id={p.id}
        name={p.id}
        type={p.type ?? "text"}
        value={p.value}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        autocomplete={p.autocomplete}
        required={p.required}
        minlength={p.minlength}
        maxlength={p.maxlength}
        pattern={p.pattern}
        inputmode={p.inputmode}
        aria-invalid={p.error ? "true" : undefined}
        aria-describedby={describedBy()}
      />
      <Show when={p.hint}>
        <span class="petunjuk" id={`${p.id}-hint`}>{p.hint}</span>
      </Show>
      <Show when={p.error}>
        <span class="pesan-salah" id={`${p.id}-err`}>{p.error}</span>
      </Show>
    </div>
  );
}
