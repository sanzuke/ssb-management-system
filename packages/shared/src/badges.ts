// Lencana: label perilaku positif yang diamati pelatih (lihat docs/konsep-fm.md). Tanpa dependensi, agar layar web
// bisa memakainya tanpa ikut memuat zod. Daftar awal ini perlu divalidasi pelatih berlisensi sebelum dikunci.
export const badgeGroups = ["teknik", "fisik", "mental", "sikap"] as const;
export type BadgeGroup = (typeof badgeGroups)[number];
export const badgeGroupLabel: Record<BadgeGroup, string> = { teknik: "Teknik", fisik: "Fisik", mental: "Mental", sikap: "Sikap" };

export const badgeCatalog = [
  { code: "kaki_kiri_kuat", label: "Kaki kiri kuat", group: "teknik" },
  { code: "kaki_kanan_kuat", label: "Kaki kanan kuat", group: "teknik" },
  { code: "dribel_lincah", label: "Dribel lincah", group: "teknik" },
  { code: "umpan_terobosan", label: "Umpan terobosan", group: "teknik" },
  { code: "penyelesaian_tenang", label: "Penyelesaian tenang", group: "teknik" },
  { code: "penjaga_gawang_tangguh", label: "Penjaga gawang tangguh", group: "teknik" },
  { code: "pelari_cepat", label: "Pelari cepat", group: "fisik" },
  { code: "stamina_tinggi", label: "Stamina tinggi", group: "fisik" },
  { code: "gesit", label: "Gesit", group: "fisik" },
  { code: "kuat_berduel", label: "Kuat berduel", group: "fisik" },
  { code: "pantang_menyerah", label: "Pantang menyerah", group: "mental" },
  { code: "pemimpin", label: "Pemimpin", group: "mental" },
  { code: "suka_membantu", label: "Suka membantu teman", group: "mental" },
  { code: "tenang_tertekan", label: "Tenang saat tertekan", group: "mental" },
  { code: "disiplin_latihan", label: "Disiplin latihan", group: "sikap" },
  { code: "cepat_belajar", label: "Cepat belajar", group: "sikap" },
  { code: "sportif", label: "Sportif", group: "sikap" },
] as const satisfies readonly { code: string; label: string; group: BadgeGroup }[];

export type BadgeCode = (typeof badgeCatalog)[number]["code"];
export const badgeCodes = badgeCatalog.map((b) => b.code) as [BadgeCode, ...BadgeCode[]];
export const badgeLabel = Object.fromEntries(badgeCatalog.map((b) => [b.code, b.label])) as Record<BadgeCode, string>;
/** Paling banyak lencana aktif per pemain, supaya tetap bermakna. */
export const BADGE_MAX = 5;
