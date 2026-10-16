import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Origin web yang boleh mengirim permintaan yang mengubah data, dipisah koma. */
  ALLOWED_ORIGINS: z.string().default("http://localhost:3001"),
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
