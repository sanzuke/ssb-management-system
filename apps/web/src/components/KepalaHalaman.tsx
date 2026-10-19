import { type JSX, Show } from "solid-js";
import { meCache } from "~/lib/api";

/**
 * Kepala halaman seragam bergaya dashboard: jejak (chip bagian dan nama SSB), judul, keterangan singkat,
 * dan tempat untuk tombol aksi di kanan.
 */
export default function KepalaHalaman(props: { chip: string; judul: string; sub?: string; children?: JSX.Element }) {
  return (
    <header class="kepala-dashboard">
      <div>
        <p class="jejak">
          <span class="ortu-chip">{props.chip}</span>
          <Show when={meCache()?.active}>
            <span aria-hidden="true">/</span>
            <span>{meCache()!.active!.ssbName}</span>
          </Show>
        </p>
        <h1>{props.judul}</h1>
        <Show when={props.sub}>
          <p class="petunjuk">{props.sub}</p>
        </Show>
      </div>
      {props.children}
    </header>
  );
}
