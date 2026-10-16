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
