import type { JSX } from "solid-js";
import Pitch from "./Pitch";

/**
 * Kerangka layar masuk, daftar, dan undangan.
 * gaya="buku": kartu kapur bergaya buku rapor (desain Garuda Muda) di atas latar lapangan beranimasi,
 * tepat di tengah layar.
 */
export default function AuthShell(props: { children: JSX.Element; gaya?: "lapangan" | "buku" }) {
  return props.gaya === "buku" ? (
    <div class="buku">
      <Pitch />
      <main class="buku-isi">{props.children}</main>
    </div>
  ) : (
    <div class="lapangan">
      <Pitch />
      <div class="merek">SSB App</div>
      <main class="kotak">{props.children}</main>
    </div>
  );
}
