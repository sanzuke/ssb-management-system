import type { JSX } from "solid-js";

/** Ikon garis 24x24 yang mengikuti warna teks. Dekoratif: label ada di teks sekitarnya. */
const jalur = {
  bola: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 8 3.5 2.5-1.3 4.1H9.8L8.5 10.5z" />
      <path d="M12 3v5M20.5 9.5l-5 1M17.5 19l-3.3-4.4M6.5 19l3.3-4.4M3.5 9.5l5 1" />
    </>
  ),
  surat: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6.5L20.5 7" />
    </>
  ),
  kunci: () => (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  mata: () => (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "mata-coret": () => (
    <>
      <path d="M2 12s3.5-7 10-7c2 0 3.8.6 5.3 1.5M22 12s-3.5 7-10 7c-2 0-3.8-.6-5.3-1.5" />
      <path d="m3 3 18 18" />
    </>
  ),
  panah: () => <path d="M5 12h14m-6-6 6 6-6 6" />,
  beranda: () => <path d="M4 11.5 12 4l8 7.5M6 10v9.5h4.5V14h3v5.5H18V10" />,
  pemain: () => (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19.5c0-3.2 2.7-5.5 6-5.5s6 2.300 6 5.500M16.500 5.200a3.200 3.200 0 0 1 0 5.800M18 14.300c1.800.6 3 2.200 3 4.200" />
    </>
  ),
  absen: () => (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M8.500 12.500l2 2 4-4M8.500 17h7" />
    </>
  ),
  master: () => (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.700 3.100 3 7 3s7-1.300 7-3V6M5 12v6c0 1.700 3.100 3 7 3s7-1.300 7-3v-6" />
    </>
  ),
  indikator: () => <path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4.500v5M7 14.500v5" />,
  akun: () => (
    <>
      <circle cx="12" cy="8" r="3.500" />
      <path d="M5 20c0-3.900 3.100-6.500 7-6.500s7 2.600 7 6.500" />
    </>
  ),
  keluar: () => <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l-4 4 4 4M6 12h10" />,
  cari: () => (
    <>
      <circle cx="11" cy="11" r="6.500" />
      <path d="m16 16 4.500 4.500" />
    </>
  ),
  ulang: () => <path d="M4 12a8 8 0 0 1 14-5.300L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.300L4 15M4 20v-5h5" />,
  tambah: () => <path d="M12 5v14M5 12h14" />,
  profil: () => (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="2.500" />
      <path d="M7.500 17.500c.8-2 2.500-3 4.500-3s3.700 1 4.500 3" />
    </>
  ),
  centang: () => <path d="m5 12.5 4.5 4.5L19 7.500" />,
  buku: () => (
    <>
      <path d="M12 6c-1.800-1.200-4.200-1.700-8-1.700V18c3.800 0 6.200.5 8 1.700 1.800-1.200 4.200-1.700 8-1.700V4.300C16.200 4.300 13.800 4.800 12 6z" />
      <path d="M12 6v13.700" />
    </>
  ),
  kartu: () => (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.600 1.700-2.300 3-2.300s2.500.7 3 2.300M15 10h3M15 13h3" />
    </>
  ),
  kalender: () => (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </>
  ),
  lokasi: () => (
    <>
      <path d="M12 21s-6.500-5.800-6.500-11a6.500 6.500 0 0 1 13 0c0 5.200-6.500 11-6.500 11z" />
      <circle cx="12" cy="10" r="2.300" />
    </>
  ),
  daftar: () => (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.3 2.7-6 6-6 1.5 0 2.8.5 3.8 1.4M17 14v6m-3-3h6" />
    </>
  ),
} satisfies Record<string, () => JSX.Element>;

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
      {jalur[p.nama]()}
    </svg>
  );
}
