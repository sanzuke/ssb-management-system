import { z } from "zod";

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
    PORT: z.coerce.number().int().default(3000),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Origin web yang boleh mengirim permintaan yang mengubah data, dipisah koma. */
    ALLOWED_ORIGINS: z.string().default("http://localhost:3001"),
    /** URL web; tujuan pengalihan setelah login Google. */
    WEB_URL: z.string().default("http://localhost:3001"),
    /** URL publik API; dasar redirect URI Google (/auth/google/callback). */
    PUBLIC_API_URL: z.string().default("http://localhost:3000"),
    /** Kunci penandatangan cookie sementara alur OAuth. Wajib bila login Google diaktifkan. */
    SESSION_SECRET: z.string().min(32, "minimal 32 karakter").optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const g = [v.GOOGLE_CLIENT_ID, v.GOOGLE_CLIENT_SECRET].filter(Boolean).length;
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
