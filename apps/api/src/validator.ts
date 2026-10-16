import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { ZodType } from "zod";
import { errorBody } from "./errors";

/**
 * zValidator dengan format error baku. Pesan per kolom ikut dikirim di `fields`
 * supaya layar bisa menandai kolom yang bermasalah.
 */
export const zv = <T extends ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    return c.json({ error: { ...errorBody("validation", "Periksa kembali isian Anda").error, fields } }, 400);
  });
