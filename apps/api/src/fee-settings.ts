import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import {
  feeSettingsSchema,
  playerFeeOverrideSchema,
  TEMPLAT_PENGINGAT_AWAL,
  type FeePublicInfo,
  type FeeSettings,
  type PlayerFeeOverrideRow,
} from "@ssb/shared";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { HttpError } from "./errors";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);

/** Pengaturan bawaan bila admin belum pernah menyimpan pengaturan SPP. */
export const pengaturanAwal = (): FeeSettings => ({
  dueDay: 10,
  reminderTemplate: TEMPLAT_PENGINGAT_AWAL,
  bankInfo: null,
  reminderIntervalDays: 7,
});

/** Baca pengaturan SPP milik satu SSB; mengembalikan bawaan bila belum pernah disimpan. */
export async function bacaPengaturan(db: Db, ssbId: string): Promise<FeeSettings> {
  return withTenant(db, ssbId, async (tx) => {
    const [row] = await tx.select().from(schema.feeSetting).where(eq(schema.feeSetting.ssbId, ssbId)).limit(1);
    if (!row) return pengaturanAwal();
    return {
      dueDay: row.dueDay,
      reminderTemplate: row.reminderTemplate,
      bankInfo: row.bankInfo,
      reminderIntervalDays: row.reminderIntervalDays,
    };
  });
}

/**
 * Pengaturan SPP dan tarif khusus per siswa.
 * Pengaturan disimpan di server, jadi semua admin SSB memakai nilai yang sama.
 */
export function feeSettingRoutes(db: Db) {
  return (
    new Hono<AppEnv>()
      // Pengaturan SPP: tanggal jatuh tempo bawaan, templat pesan, info rekening, dan jeda pengingat.
      .get("/fees/settings", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        return c.json(await bacaPengaturan(db, m.ssbId));
      })

      .put("/fees/settings", requirePermission("fee.manage"), zv("json", feeSettingsSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const b = c.req.valid("json");
        await withTenant(db, m.ssbId, async (tx) => {
          await tx
            .insert(schema.feeSetting)
            .values({
              ssbId: m.ssbId,
              dueDay: b.dueDay,
              reminderTemplate: b.reminderTemplate,
              bankInfo: b.bankInfo || null,
              reminderIntervalDays: b.reminderIntervalDays,
            })
            .onConflictDoUpdate({
              target: schema.feeSetting.ssbId,
              set: {
                dueDay: b.dueDay,
                reminderTemplate: b.reminderTemplate,
                bankInfo: b.bankInfo || null,
                reminderIntervalDays: b.reminderIntervalDays,
                updatedAt: new Date(),
              },
            });
        });
        return c.json(await bacaPengaturan(db, m.ssbId));
      })

      // Info rekening untuk orang tua; hanya bagian yang boleh dilihat di luar admin.
      .get("/fees/public-info", requirePermission("invoice.read"), async (c) => {
        const m = c.get("auth")!.member!;
        const pengaturan = await bacaPengaturan(db, m.ssbId);
        return c.json({ bankInfo: pengaturan.bankInfo } satisfies FeePublicInfo);
      })

      // Daftar siswa yang tarifnya khusus (menggantikan tarif KU).
      .get("/fees/player-overrides", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, async (tx) => {
          const out = await tx
            .select({
              playerId: schema.playerFeeOverride.playerId,
              playerName: schema.player.fullName,
              ageGroup: schema.ageGroup.name,
              monthlyFee: schema.playerFeeOverride.monthlyFee,
              note: schema.playerFeeOverride.note,
            })
            .from(schema.playerFeeOverride)
            .innerJoin(schema.player, and(eq(schema.player.ssbId, schema.playerFeeOverride.ssbId), eq(schema.player.id, schema.playerFeeOverride.playerId)))
            .leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)))
            .orderBy(asc(schema.player.fullName));
          return out;
        });
        return c.json(rows satisfies PlayerFeeOverrideRow[]);
      })

      // Simpan tarif khusus satu siswa. Menghapus baris (nilai 0 dengan hapus) mengembalikan tarif KU.
      .put("/fees/player-overrides/:playerId", requirePermission("fee.manage"), zv("json", playerFeeOverrideSchema.omit({ playerId: true })), async (c) => {
        const m = c.get("auth")!.member!;
        const playerId = c.req.param("playerId");
        if (!UUID.test(playerId)) throw notFound("Siswa");
        const b = c.req.valid("json");
        const ok = await withTenant(db, m.ssbId, async (tx) => {
          const [p] = await tx
            .select({ id: schema.player.id })
            .from(schema.player)
            .where(and(eq(schema.player.ssbId, m.ssbId), eq(schema.player.id, playerId)))
            .limit(1);
          if (!p) return false;
          await tx
            .insert(schema.playerFeeOverride)
            .values({ ssbId: m.ssbId, playerId, monthlyFee: b.monthlyFee, note: b.note || null, createdBy: m.userId })
            .onConflictDoUpdate({
              target: [schema.playerFeeOverride.ssbId, schema.playerFeeOverride.playerId],
              set: { monthlyFee: b.monthlyFee, note: b.note || null, updatedAt: new Date() },
            });
          return true;
        });
        if (!ok) throw notFound("Siswa");
        return c.json({ ok: true });
      })

      // Buang tarif khusus; siswa kembali memakai tarif KU.
      .delete("/fees/player-overrides/:playerId", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const playerId = c.req.param("playerId");
        if (!UUID.test(playerId)) throw notFound("Tarif khusus");
        const del = await withTenant(db, m.ssbId, (tx) =>
          tx
            .delete(schema.playerFeeOverride)
            .where(and(eq(schema.playerFeeOverride.ssbId, m.ssbId), eq(schema.playerFeeOverride.playerId, playerId)))
            .returning({ playerId: schema.playerFeeOverride.playerId }),
        );
        if (del.length === 0) throw notFound("Tarif khusus");
        return c.body(null, 204);
      })
  );
}
