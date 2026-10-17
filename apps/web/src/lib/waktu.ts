const dua = (n: number) => String(n).padStart(2, "0");

/** Tanggal hari ini menurut jam perangkat (bukan UTC), format YYYY-MM-DD. */
export const hariIni = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
};

/** Menggeser tanggal YYYY-MM-DD sebanyak n hari. */
export const tambahHari = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
};

/** Tanggal sesi untuk daftar: "Sabtu, 24 Okt"; hari ini dan besok disebut langsung. */
export const tanggalSesi = (iso: string) => {
  const hari = hariIni();
  if (iso === hari) return "Hari ini";
  if (iso === tambahHari(hari, 1)) return "Besok";
  if (iso === tambahHari(hari, -1)) return "Kemarin";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
};
