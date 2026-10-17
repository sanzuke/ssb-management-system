import type { PlayerDetail, PlayerSummary, AgeGroup } from "@ssb/shared";
export type { PlayerDetail, PlayerSummary, AgeGroup };

export const statusLabel: Record<string, string> = { aktif: "Aktif", cuti: "Cuti", keluar: "Keluar" };
export const posisiLabel: Record<string, string> = { GK: "Kiper", DF: "Bek", MF: "Gelandang", FW: "Penyerang" };

export const usia = (birthDate: string) => {
  const b = new Date(`${birthDate}T00:00:00`);
  const n = new Date();
  let y = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) y--;
  return y;
};
export const tanggal = (s: string) =>
  new Date(s.length === 10 ? `${s}T00:00:00` : s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Dua huruf pertama nama (kata pertama dan kedua), untuk avatar tanpa foto. */
export const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((k) => k[0]?.toUpperCase() ?? "")
    .join("");
