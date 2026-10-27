import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
    PORT: z.coerce.number().int().default(3000),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Origin web yang boleh mengirim permintaan yang mengubah data, dipisah koma. */
    ALLOWED_ORIGINS: z.string().default("http://localhost:3001"),
    /** Origin landing page yang boleh memanggil API publik (/public/*) dari browser, dipisah koma. Kosong = tidak ada. */
    LANDING_ORIGINS: z.string().default(""),
    /** Alamat situs landing (tanpa garis miring akhir); dasar alamat kanonik dan sitemap halaman berita. */
    LANDING_URL: z.string().default("http://localhost:5173"),
    /** index.html hasil build landing; kerangka halaman berita untuk mesin pencari. Di server: /var/www/landing/index.html. */
    LANDING_INDEX_PATH: z.string().default("./landing-index.html"),
    /** URL web; tujuan pengalihan setelah login Google. */
    WEB_URL: z.string().default("http://localhost:3001"),
    /** URL publik API; dasar redirect URI Google (/auth/google/callback). */
    PUBLIC_API_URL: z.string().default("http://localhost:3000"),
    /** Kunci penandatangan cookie sementara alur OAuth. Wajib bila login Google diaktifkan. */
    SESSION_SECRET: z.string().min(32, "minimal 32 karakter").optional(),
    /** Kunci enkripsi token API pihak ketiga (mis. Fonnte). Bila kosong, memakai SESSION_SECRET. */
    TOKEN_SECRET: z.string().min(32, "minimal 32 karakter").optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    /** Jalur Chromium untuk membuat rapor PDF; kosong = memakai Chromium bawaan Playwright. */
    /** Folder penyimpanan foto pemain; di server arahkan ke volume yang ikut dicadangkan. */
    UPLOAD_DIR: z.string().default("./uploads"),
    /** Server SMTP untuk email reset kata sandi, mis. smtps://user:sandi@smtp.contoh.id:465. Kosong = email reset tidak aktif. */
    SMTP_URL: z.string().optional(),
    /** Pengirim email, mis. "SSB App <no-reply@contoh.id>". Wajib bila SMTP_URL diisi. */
    MAIL_FROM: z.string().optional(),
    CHROMIUM_PATH: z.string().optional(),
    /** Jalur soket unix pengelola kotak surat, mis. /run/buat-email.sock. Kosong = menu Email tidak aktif. */
    MAILBOX_SOCKET: z.string().optional(),
    /** Domain email akademi yang dikelola, mis. familyunitedfa.com. Wajib bila MAILBOX_SOCKET diisi. */
    MAILBOX_DOMAIN: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const g = [v.GOOGLE_CLIENT_ID, v.GOOGLE_CLIENT_SECRET].filter(Boolean).length;
    if (v.SMTP_URL && !v.MAIL_FROM) ctx.addIssue({ code: "custom", path: ["MAIL_FROM"], message: "wajib diisi bila SMTP_URL diisi" });
    if (v.MAILBOX_SOCKET && !v.MAILBOX_DOMAIN) ctx.addIssue({ code: "custom", path: ["MAILBOX_DOMAIN"], message: "wajib diisi bila MAILBOX_SOCKET diisi" });
    if (g === 1) ctx.addIssue({ code: "custom", path: ["GOOGLE_CLIENT_SECRET"], message: "GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET harus diisi berpasangan" });
    if (g === 2 && !v.SESSION_SECRET) ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "wajib diisi bila login Google aktif" });
  });

export type Env = z.infer<typeof envSchema>;

/** Validasi env saat start; gagal dengan pesan jelas bila ada yang kurang. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi env tidak valid: ${detail}`);
  }
  return parsed.data;
}
