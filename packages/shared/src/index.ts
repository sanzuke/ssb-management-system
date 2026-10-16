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

export const ssbInputSchema = z.object({
  ssbName: z.string().trim().min(2).max(120),
  slug: slugSchema,
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
});
export type SsbInput = z.infer<typeof ssbInputSchema>;

/** Daftar akun baru sekaligus SSB baru, dengan email + kata sandi. */
export const registerSsbSchema = ssbInputSchema.extend({
  adminName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterSsb = z.infer<typeof registerSsbSchema>;

/** Kode SSB opsional: dipakai bila akun punya beberapa SSB dan ingin langsung memilih salah satu. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  slug: slugSchema.optional(),
});
export type Login = z.infer<typeof loginSchema>;

export const selectSsbSchema = z.object({ ssbId: z.uuid() });

/** Peran yang bisa diundang. Admin SSB pertama dibuat saat pendaftaran SSB. */
export const invitableRoleSchema = z.enum(["pelatih", "korlas", "orang_tua"]);

export const createInvitationSchema = z.object({
  role: invitableRoleSchema,
  label: z.string().trim().max(120).optional(),
  /** Untuk orang tua: pemain yang langsung dihubungkan. */
  playerId: z.uuid().optional(),
});

/** Menerima undangan dengan akun baru (email + kata sandi). Akun yang sudah login tidak perlu body. */
export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  /** Wajib bila akun sudah punya kata sandi; akun yang hanya login Google boleh mengosongkannya. */
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});

/** Bentuk baku error API. */
export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), fields: z.record(z.string(), z.string()).optional() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const membershipSchema = z.object({
  ssbId: z.string(),
  userId: z.string(),
  ssbName: z.string(),
  role: userRoleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

export const meSchema = z.object({
  accountId: z.string(),
  name: z.string(),
  email: z.string(),
  /** Apakah akun punya kata sandi (akun yang hanya login Google belum punya). */
  hasPassword: z.boolean(),
  /** SSB aktif pada sesi ini; kosong bila akun belum memilih SSB. */
  active: membershipSchema.nullable(),
  memberships: z.array(membershipSchema),
});
export type Me = z.infer<typeof meSchema>;
