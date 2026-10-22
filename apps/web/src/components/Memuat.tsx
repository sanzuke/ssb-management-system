/**
 * Tanda memuat tingkat halaman: bola sepak memantul di atas bayangan yang ikut mengecil.
 * Untuk bagian kecil di dalam halaman, pakai Kerangka.
 */
export default function Memuat(props: { halaman?: boolean; teks?: string }) {
  return (
    <div class="memuat" classList={{ halaman: props.halaman }} role="status" aria-live="polite">
      <div class="memuat-panggung" aria-hidden="true">
        <span class="memuat-lompat">
          <svg class="memuat-bola" viewBox="0 0 48 48" width="48" height="48" role="img">
            <title>Bola sepak</title>
            <circle cx="24" cy="24" r="22" fill="#fff" stroke="var(--tinta)" stroke-width="2.5" />
            <polygon points="24,14 33,20.5 29.5,31 18.5,31 15,20.5" fill="var(--tinta)" />
            <g stroke="var(--tinta)" stroke-width="2.5" stroke-linecap="round">
              <path d="M24 14V4" />
              <path d="M33 20.5l9-4" />
              <path d="M29.5 31l6 8" />
              <path d="M18.5 31l-6 8" />
              <path d="M15 20.5l-9-4" />
            </g>
          </svg>
        </span>
        <span class="memuat-bayangan" />
      </div>
      <p class="memuat-teks">{props.teks ?? "Memuat…"}</p>
    </div>
  );
}
