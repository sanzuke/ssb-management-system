import { For, Show } from "solid-js";

type Props = {
  id: string;
  label: string;
  value: string;
  onInput: (v: string) => void;
  options: { value: string; label: string }[];
  blank?: string;
  hint?: string;
  error?: string | undefined;
  required?: boolean;
};

export default function SelectField(p: Props) {
  return (
    <div class="field" attr:data-salah={p.error ? "" : undefined}>
      <label for={p.id}>{p.label}</label>
      <select
        id={p.id}
        name={p.id}
        value={p.value}
        required={p.required}
        onChange={(e) => p.onInput(e.currentTarget.value)}
        aria-invalid={p.error ? "true" : undefined}
      >
        <Show when={p.blank !== undefined}>
          <option value="" selected={p.value === ""}>
            {p.blank}
          </option>
        </Show>
        <For each={p.options}>
          {(o) => (
            <option value={o.value} selected={o.value === p.value}>
              {o.label}
            </option>
          )}
        </For>
      </select>
      <Show when={p.hint}>
        <span class="petunjuk">{p.hint}</span>
      </Show>
      <Show when={p.error}>
        <span class="pesan-salah">{p.error}</span>
      </Show>
    </div>
  );
}
