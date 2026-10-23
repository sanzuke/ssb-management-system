import type { JSX } from "solid-js";
import Pitch from "./Pitch";

/**
 * Kerangka layar masuk, daftar, dan undangan.
 * gaya="buku": latar kapur dengan lingkaran tengah lapangan sebagai tanda air (desain Garuda Muda).
 */
export default function AuthShell(props: { children: JSX.Element; gaya?: "lapangan" | "buku" }) {
  return props.gaya === "buku" ? (
    <div class="buku">
      <svg class="tanda-air" viewBox="0 0 340 340" aria-hidden="true">
        <circle cx="170" cy="170" r="130" stroke-dasharray="8 6" />
        <circle cx="170" cy="170" r="8" class="titik" />
        <line x1="0" y1="170" x2="340" y2="170" />
      </svg>
      <main class="buku-isi">{props.children}</main>
    </div>
  ) : (
    <div class="lapangan">
      <Pitch />
      <div class="merek">
        <img class="logo-masuk-kecil" src="/logo.png" alt="" width="32" height="35" />
        SSB App
      </div>
      <main class="kotak">{props.children}</main>
    </div>
  );
}
