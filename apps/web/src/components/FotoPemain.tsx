import { createSignal, Show } from "solid-js";
import { inisial } from "~/lib/pemain";

/** Alamat foto pemain; `v` (versi) membuat foto baru langsung tampil tanpa tersangkut cache. */
export const fotoUrl = (id: string, v: string) => `/api/players/${encodeURIComponent(id)}/photo?v=${v}`;

/**
 * Foto pemain dalam kotak membulat; bila belum ada (atau gagal dimuat) tampil dua huruf inisial.
 * Dekoratif: nama pemain selalu ada di teks sebelahnya.
 */
export default function FotoPemain(props: { id: string; nama: string; photoV: string | null; ukuran?: "kecil" | "besar" }) {
  const [gagal, setGagal] = createSignal<string | null>(null);
  return (
    <span class="ortu-foto" classList={{ kecil: props.ukuran === "kecil", besar: props.ukuran === "besar" }} aria-hidden="true">
      <Show when={props.photoV && gagal() !== props.photoV} fallback={inisial(props.nama)}>
        <img class="foto-img" src={fotoUrl(props.id, props.photoV!)} alt="" loading="lazy" decoding="async" onError={() => setGagal(props.photoV)} />
      </Show>
    </span>
  );
}
