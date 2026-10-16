import { z } from "zod";

/** Respons endpoint kesehatan API. */
export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  time: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

/** Posisi bermain. */
export const positionSchema = z.enum(["GK", "DF", "MF", "FW"]);
export type Position = z.infer<typeof positionSchema>;

/** Input pembuatan pemain. Skema lengkap menyusul bersama model data. */
export const playerInputSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  birthDate: z.iso.date(),
  position: positionSchema.optional(),
});
export type PlayerInput = z.infer<typeof playerInputSchema>;

/** Role pengguna di dalam SSB. */
export const userRoleSchema = z.enum(["admin_ssb", "pelatih", "korlas", "orang_tua"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Kode SSB dipakai saat login, jadi dibatasi huruf kecil, angka, dan tanda hubung. */
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3-40 karakter: huruf kecil, angka, tanda hubung");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(200));

export const passwordSchema = z.string().min(10, "minimal 10 karakter").max(200);

export const registerSsbSchema = z.object({
  ssbName: z.string().trim().min(2).max(120),
  slug: slugSchema,
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  adminName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterSsb = z.infer<typeof registerSsbSchema>;

export const loginSchema = z.object({
  slug: slugSchema,
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type Login = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

/** Bentuk baku error API. */
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const meSchema = z.object({
  userId: z.string(),
  ssbId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: userRoleSchema,
});
export type Me = z.infer<typeof meSchema>;
