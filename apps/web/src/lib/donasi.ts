import type { FundraisingStatus, PledgeKind, PledgeStatus } from "@ssb/shared";

export const labelKampanye: Record<FundraisingStatus, string> = { draft: "Draf", aktif: "Aktif", selesai: "Selesai" };
export const labelSumbangan: Record<PledgeStatus, string> = { menunggu: "Menunggu konfirmasi", diterima: "Diterima", ditolak: "Ditolak" };
export const labelJenis: Record<PledgeKind, string> = { donasi: "Donasi", sponsor: "Sponsor" };

/** Warna lencana yang sudah ada di dashboard.css: hijau untuk berjalan/diterima, kuning untuk menunggu, netral untuk lainnya. */
export const warnaLencana = (s: FundraisingStatus | PledgeStatus): string => (s === "aktif" || s === "diterima" ? "Berjalan" : s === "menunggu" ? "Menunggu" : "");

/** Persentase terkumpul dibatasi 100; kosong bila kampanye tanpa target. */
export const persenTerkumpul = (raised: number, target: number | null): number | null => (target ? Math.min(100, Math.floor((raised * 100) / target)) : null);

/** Isian nominal dari kolom teks: kosong atau bukan angka menjadi undefined. */
export const angka = (v: string): number | undefined => {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
