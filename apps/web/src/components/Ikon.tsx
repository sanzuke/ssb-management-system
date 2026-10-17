import type { JSX } from "solid-js";

/** Ikon garis 24x24 yang mengikuti warna teks. Dekoratif: label ada di teks sekitarnya. */
const jalur: Record<string, JSX.Element> = {
  bola: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 8 3.5 2.5-1.3 4.1H9.8L8.5 10.5z" />
      <path d="M12 3v5M20.5 9.5l-5 1M17.5 19l-3.3-4.4M6.5 19l3.3-4.4M3.5 9.5l5 1" />
    </>
  ),
  surat: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6.5L20.5 7" />
    </>
  ),
  kunci: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  mata: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "mata-coret": (
    <>
      <path d="M2 12s3.5-7 10-7c2 0 3.8.6 5.3 1.5M22 12s-3.5 7-10 7c-2 0-3.8-.6-5.3-1.5" />
      <path d="m3 3 18 18" />
    </>
  ),
  panah: <path d="M5 12h14m-6-6 6 6-6 6" />,
  centang: <path d="m5 12.5 4.5 4.5L19 7.500" />,
  buku: (
    <>
      <path d="M12 6c-1.800-1.200-4.200-1.700-8-1.700V18c3.800 0 6.200.5 8 1.700 1.800-1.200 4.200-1.700 8-1.700V4.300C16.200 4.300 13.800 4.800 12 6z" />
      <path d="M12 6v13.700" />
    </>
  ),
  kartu: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.600 1.700-2.300 3-2.300s2.500.7 3 2.300M15 10h3M15 13h3" />
    </>
  ),
  kalender: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  lokasi: (
    <>
      <path d="M12 21s-6.500-5.800-6.500-11a6.500 6.500 0 0 1 13 0c0 5.200-6.500 11-6.500 11z" />
      <circle cx="12" cy="10" r="2.300" />
    </>
  ),
  daftar: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6 1.5 0 2.8.5 3.8 1.4M17 14v6m-3-3h6" />
    </>
  ),
};

export default function Ikon(p: { nama: keyof typeof jalur; ukuran?: number }) {
  return (
    <svg
      width={p.ukuran ?? 20}
      height={p.ukuran ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {jalur[p.nama]}
    </svg>
  );
}
