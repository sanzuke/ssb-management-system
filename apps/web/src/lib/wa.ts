/**
 * Tautan WhatsApp dari nomor lokal (08...) atau internasional; null bila tidak terbaca sebagai nomor.
 * Dengan `pesan`, isi pesan sudah terisi di WhatsApp dan tinggal ditekan kirim.
 */
export function linkWa(nomor: string | null, pesan?: string): string | null {
  const d = (nomor ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  const tujuan = d.startsWith("0") ? `62${d.slice(1)}` : d;
  return `https://wa.me/${tujuan}${pesan ? `?text=${encodeURIComponent(pesan)}` : ""}`;
}
