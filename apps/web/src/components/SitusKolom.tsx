import { type JSX, Show } from "solid-js";
import type { Localized } from "@ssb/shared";
import { buatLokal } from "~/lib/situs";
import AreaField from "./AreaField";
import Field from "./Field";

/** Teks dua bahasa: kolom Indonesia (wajib) dan English (opsional, kosong = pakai Indonesia). */
export function Lokal(p: {
  id: string;
  label: string;
  value: Localized | undefined;
  onChange: (v: Localized) => void;
  /** Jalur kolom di dokumen, untuk menampilkan galat dari API (mis. `programs.0.name`). */
  jalur: string;
  salah: (jalur: string) => string | undefined;
  panjang?: boolean;
  hint?: string;
}) {
  const idVal = () => p.value?.id ?? "";
  const enVal = () => p.value?.en ?? "";
  const tulisEn = (v: string) => p.onChange(buatLokal(idVal(), v === "" ? undefined : v));
  return (
    <div class="dua-bahasa">
      <Show
        when={p.panjang}
        fallback={
          <>
            <Field
              id={`${p.id}-id`}
              label={`${p.label} (Indonesia)`}
              value={idVal()}
              onInput={(v) => p.onChange(buatLokal(v, p.value?.en))}
              error={p.salah(`${p.jalur}.id`)}
              hint={p.hint}
              maxlength={2000}
            />
            <Field id={`${p.id}-en`} label={`${p.label} (English)`} value={enVal()} onInput={tulisEn} error={p.salah(`${p.jalur}.en`)} maxlength={2000} />
          </>
        }
      >
        <AreaField
          id={`${p.id}-id`}
          label={`${p.label} (Indonesia)`}
          value={idVal()}
          onInput={(v) => p.onChange(buatLokal(v, p.value?.en))}
          error={p.salah(`${p.jalur}.id`)}
          hint={p.hint}
          maxlength={2000}
        />
        <AreaField id={`${p.id}-en`} label={`${p.label} (English)`} value={enVal()} onInput={tulisEn} error={p.salah(`${p.jalur}.en`)} maxlength={2000} />
      </Show>
    </div>
  );
}

/** Satu butir dalam daftar yang bisa digeser dan dihapus, dengan judul ringkas. */
export function Butir(p: { judul: string; i: number; jumlah: number; geser: (arah: -1 | 1) => void; hapus: () => void; children: JSX.Element }) {
  return (
    <fieldset class="butir-situs">
      <legend>{p.judul}</legend>
      <div class="butir-aksi aksi-butir-situs">
        <button class="tombol tipis" type="button" disabled={p.i === 0} aria-label={`Naikkan ${p.judul}`} onClick={() => p.geser(-1)}>
          Naik
        </button>
        <button class="tombol tipis" type="button" disabled={p.i >= p.jumlah - 1} aria-label={`Turunkan ${p.judul}`} onClick={() => p.geser(1)}>
          Turun
        </button>
        <button class="tombol tipis" type="button" aria-label={`Hapus ${p.judul}`} onClick={p.hapus}>
          Hapus
        </button>
      </div>
      {p.children}
    </fieldset>
  );
}
