import { z } from "zod";
import type { Block } from "./markdown";

/**
 * Artikel atau berita di landing page. Dikelola di SSB MS (draf lalu terbit), dibaca landing lewat API publik.
 * Teks dua bahasa: `id` wajib, `en` opsional (landing jatuh ke `id` bila `en` kosong).
 */

export const postStatusSchema = z.enum(["draft", "published"]);
export type PostStatus = z.infer<typeof postStatusSchema>;

const bilingual = (idMin: number, max: number) =>
  z.object({
    id: z.string().trim().min(idMin).max(max),
    en: z.string().trim().max(max).optional(),
  });

export const POST_BODY_MAX = 60000;
export const POST_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export const postSlugSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "huruf kecil, angka, dan tanda hubung");

/** Simpan artikel (draf). `slug` kosong = dibuat dari judul Indonesia dan dijaga unik. */
export const postInputSchema = z.object({
  title: bilingual(3, 160),
  slug: postSlugSchema.optional(),
  excerpt: bilingual(0, 300),
  body: bilingual(1, POST_BODY_MAX),
  category: z.string().trim().max(40).default(""),
  coverMediaId: z.string().uuid().nullable().default(null),
  coverAlt: z.string().trim().max(200).default(""),
});
export type PostInput = z.infer<typeof postInputSchema>;

export type Bilingual = { id: string; en?: string | undefined };

/** Baris daftar artikel di SSB MS. */
export type PostAdminRow = {
  id: string;
  slug: string;
  title: Bilingual;
  category: string;
  status: PostStatus;
  coverUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
  authorName: string;
  /** Pengguna ini boleh menyunting atau menghapus (penulis sendiri, atau admin SSB). */
  canEdit: boolean;
};

/** Satu artikel untuk editor. */
export type PostAdminDetail = PostAdminRow & {
  excerpt: Bilingual;
  body: Bilingual;
  coverMediaId: string | null;
  coverAlt: string;
  /** Awalan alamat gambar artikel (berakhiran "/"); alamat gambar = mediaBase + id. Dipakai pratinjau editor. */
  mediaBase: string;
};

/** Hasil unggah gambar artikel. Sisipkan `markdown` ke isi, atau pakai `id` sebagai `coverMediaId`. */
export type PostMedia = { id: string; url: string; markdown: string };

/** Ringkasan artikel di API publik. */
export type PublicPostSummary = {
  slug: string;
  title: Bilingual;
  excerpt: Bilingual;
  category: string;
  coverUrl: string | null;
  coverAlt: string;
  publishedAt: string;
  authorName: string;
};

/** Artikel lengkap di API publik; isi sudah diurai menjadi blok aman (lihat markdown.ts). */
export type PublicPost = PublicPostSummary & {
  updatedAt: string;
  blocks: { id: Block[]; en?: Block[] | undefined };
};

export type PublicPostList = { items: PublicPostSummary[]; total: number; page: number; pageSize: number };
