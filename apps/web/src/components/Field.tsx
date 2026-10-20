import { createSignal, Show } from "solid-js";
import Ikon from "./Ikon";

type Props = {
  /** Ikon di kiri kolom; bila diisi, kolom memakai gaya buku (ikon di dalam). */
  ikon?: "surat" | "kunci";
  /** Untuk kolom kata sandi: tampilkan tombol lihat/sembunyikan. */
  bisaLihat?: boolean;
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
  inputmode?: "text" | "email" | "numeric" | "tel";
  placeholder?: string;
};

export default function Field(p: Props) {
  const describedBy = () => [p.hint ? `${p.id}-hint` : "", p.error ? `${p.id}-err` : ""].filter(Boolean).join(" ") || undefined;
  const [terlihat, setTerlihat] = createSignal(false);
  const jenis = () => (p.bisaLihat && terlihat() ? "text" : (p.type ?? "text"));
  return (
    <div class="field" classList={{ "dengan-ikon": !!p.ikon }} attr:data-salah={p.error ? "" : undefined}>
      <label for={p.id}>{p.label}</label>
      <div class="kolom-input">
        <Show when={p.ikon}>
          {(nama) => (
            <span class="ikon-kolom">
              <Ikon nama={nama()} />
            </span>
          )}
        </Show>
        <input
          id={p.id}
          name={p.id}
          type={jenis()}
          value={p.value}
          onInput={(e) => p.onInput(e.currentTarget.value)}
          autocomplete={p.autocomplete}
          required={p.required}
          minlength={p.minlength}
          maxlength={p.maxlength}
          pattern={p.pattern}
          inputmode={p.inputmode}
          placeholder={p.placeholder}
          aria-invalid={p.error ? "true" : undefined}
          aria-describedby={describedBy()}
        />
        <Show when={p.bisaLihat}>
          <button
            type="button"
            class="lihat-sandi"
            aria-label={terlihat() ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
            aria-pressed={terlihat()}
            onClick={() => setTerlihat(!terlihat())}
          >
            <Ikon nama={terlihat() ? "mata-coret" : "mata"} />
          </button>
        </Show>
      </div>
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
