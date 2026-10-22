import { For } from "solid-js";

/** Lebar tiap baris kerangka dibuat berbeda agar terlihat seperti teks sungguhan. */
const LEBAR = ["100%", "82%", "64%", "92%", "48%"];

/**
 * Kerangka sementara untuk bagian halaman yang masih memuat data.
 * "baris": teks berbaris; "kartu": blok bertinggi tetap; "inline": satu garis pendek di dalam kalimat.
 */
export default function Kerangka(props: { varian?: "baris" | "kartu" | "inline"; baris?: number }) {
  const varian = () => props.varian ?? "baris";
  return (
    <div class="kerangka" classList={{ "kerangka-inline": varian() === "inline" }} role="status" aria-label="Memuat">
      {varian() === "baris" && (
        <For each={Array.from({ length: props.baris ?? 3 }, (_, i) => LEBAR[i % LEBAR.length]!)}>
          {(lebar) => <span class="kerangka-baris" style={{ width: lebar }} />}
        </For>
      )}
      {varian() === "kartu" && <span class="kerangka-kartu" />}
      {varian() === "inline" && <span class="kerangka-baris" />}
    </div>
  );
}
