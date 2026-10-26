import { z } from "zod";

/**
 * Konten landing page akademi: satu dokumen per SSB, disunting admin di SSB MS dan dibaca landing lewat API publik.
 * Semua teks yang tampil ke pengunjung dua bahasa: `id` wajib, `en` boleh kosong (landing jatuh ke `id`).
 * Batas panjang dan jumlah sengaja ketat agar dokumen tidak bisa dipakai menimbun data.
 */

/** Teks dua bahasa. */
export const localizedSchema = z.object({
  id: z.string().trim().max(2000),
  en: z.string().trim().max(2000).optional(),
});
export type Localized = z.infer<typeof localizedSchema>;

const short = z.string().trim().max(200);
const url = z.string().trim().max(500).url().or(z.literal(""));

export const siteIdentitySchema = z.object({
  name: short,
  shortName: short.optional(),
  brandName: short,
  acronym: z.string().trim().max(12).optional(),
  motto: localizedSchema,
  foundedYear: z.number().int().min(1900).max(2100).optional(),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(40),
  email: z.string().trim().max(200).email().or(z.literal("")),
  /** Nomor WhatsApp tujuan tombol "Tanya Sekretariat", format internasional tanpa tanda plus. */
  whatsapp: z
    .string()
    .trim()
    .regex(/^[0-9]{8,15}$/, "8-15 digit, tanpa spasi atau plus")
    .or(z.literal("")),
  venue: z.string().trim().max(300).optional(),
});

export const siteHeroSchema = z.object({
  eyebrow: localizedSchema.optional(),
  title: localizedSchema,
  subtitle: localizedSchema,
  primaryCta: localizedSchema,
});

export const siteStatSchema = z.object({ label: localizedSchema, value: short });

export const siteProgramSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,30}$/, "huruf kecil, angka, tanda hubung"),
  code: z.string().trim().max(20),
  name: localizedSchema,
  subname: localizedSchema.optional(),
  ageRange: localizedSchema,
  focus: localizedSchema,
  schedule: localizedSchema,
  curriculum: z.array(localizedSchema).max(12),
  maxSquadSize: z.number().int().min(1).max(200).optional(),
  /** Biaya bulanan sebagai teks bebas ("IDR 250.000 / bulan") karena dipajang apa adanya. */
  fee: short.optional(),
  hasScholarship: z.boolean().default(false),
});

export const siteCoachSchema = z.object({
  name: short,
  role: localizedSchema,
  license: short.optional(),
  experience: short.optional(),
  bio: localizedSchema.optional(),
});

export const siteFacilitySchema = z.object({ title: localizedSchema, description: localizedSchema });

export const siteMatchSchema = z.object({
  tournament: short,
  round: short.optional(),
  homeTeam: short,
  awayTeam: short,
  homeScore: z.number().int().min(0).max(99).optional(),
  awayScore: z.number().int().min(0).max(99).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM")
    .optional(),
  venue: short.optional(),
  status: z.enum(["upcoming", "finished"]),
});

export const siteTestimonialSchema = z.object({ name: short, role: localizedSchema.optional(), quote: localizedSchema });

/** Header sebuah bagian di landing. Kolom kosong membuat landing memakai teks bawaannya. */
export const siteSectionHeadSchema = z.object({
  eyebrow: localizedSchema.optional(),
  title: localizedSchema.optional(),
  intro: localizedSchema.optional(),
});
export type SiteSectionHead = z.infer<typeof siteSectionHeadSchema>;

export const SITE_SECTION_KEYS = ["programs", "coaches", "facilities", "matches", "testimonials"] as const;
export type SiteSectionKey = (typeof SITE_SECTION_KEYS)[number];

export const siteContentSchema = z.object({
  identity: siteIdentitySchema,
  hero: siteHeroSchema,
  stats: z.array(siteStatSchema).max(8),
  story: z.object({ title: localizedSchema, body: localizedSchema }).optional(),
  programs: z.array(siteProgramSchema).max(12),
  coaches: z.array(siteCoachSchema).max(30),
  facilities: z.array(siteFacilitySchema).max(12),
  matches: z.array(siteMatchSchema).max(60),
  testimonials: z.array(siteTestimonialSchema).max(12),
  /** Label kecil, judul, dan pengantar tiap bagian; bagian yang tidak diisi memakai teks bawaan landing. */
  sections: z
    .object({
      programs: siteSectionHeadSchema,
      coaches: siteSectionHeadSchema,
      facilities: siteSectionHeadSchema,
      matches: siteSectionHeadSchema,
      testimonials: siteSectionHeadSchema,
    })
    .partial()
    .optional(),
  /** Tautan media sosial yang ditampilkan di footer. */
  social: z.object({ instagram: url, youtube: url, facebook: url, tiktok: url }).partial().optional(),
});
export type SiteContent = z.infer<typeof siteContentSchema>;

/** Dokumen awal untuk SSB yang belum pernah mengisi konten situs. */
export const emptySiteContent = (ssbName: string): SiteContent => ({
  identity: { name: ssbName, brandName: ssbName, motto: { id: "" }, address: "", phone: "", email: "", whatsapp: "" },
  hero: { title: { id: ssbName }, subtitle: { id: "" }, primaryCta: { id: "Daftar Free Trial" } },
  stats: [],
  programs: [],
  coaches: [],
  facilities: [],
  matches: [],
  testimonials: [],
});

/** Isi GET /site (admin): draf yang sedang disunting dan status terbitnya. */
export type SiteAdminView = {
  draft: SiteContent;
  /** Ada draf yang belum sama dengan versi terbit. */
  dirty: boolean;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string | null;
};

/** Isi GET /public/site/:slug: hanya versi terbit. */
export type SitePublicView = {
  slug: string;
  ssbName: string;
  publishedAt: string;
  content: SiteContent;
};

// ---- Pendaftaran trial dari landing ----

export const trialStatusSchema = z.enum(["baru", "dihubungi", "diterima", "ditolak"]);
export type TrialStatus = z.infer<typeof trialStatusSchema>;

export const trialInputSchema = z.object({
  childName: z.string().trim().min(2).max(120),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  gender: z.enum(["Putra", "Putri"]),
  /** Id program dari konten terbit; tidak dicocokkan keras karena konten bisa berubah setelah formulir dibuka. */
  programId: z.string().trim().max(30).optional(),
  parentName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{8,20}$/, "Nomor telepon tidak valid"),
  email: z.string().trim().max(200).email().or(z.literal("")).optional(),
  address: z.string().trim().max(300).optional(),
  preferredSession: z.string().trim().max(100).optional(),
  applyScholarship: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional(),
  /** Kolom jebakan bot: manusia tidak melihatnya, jadi harus kosong. API menjawab seolah berhasil bila terisi. */
  website: z.string().max(200).optional(),
});
export type TrialInput = z.infer<typeof trialInputSchema>;

export const trialUpdateSchema = z.object({
  status: trialStatusSchema.optional(),
  adminNote: z.string().trim().max(1000).optional(),
});
export type TrialUpdate = z.infer<typeof trialUpdateSchema>;

export type TrialRow = {
  id: string;
  code: string;
  childName: string;
  birthDate: string;
  gender: "Putra" | "Putri";
  programId: string | null;
  parentName: string;
  phone: string;
  email: string | null;
  address: string | null;
  preferredSession: string | null;
  applyScholarship: boolean;
  notes: string | null;
  status: TrialStatus;
  adminNote: string | null;
  createdAt: string;
};
