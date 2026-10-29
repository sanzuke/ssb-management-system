import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { defaultPositionWeights, positionWeightsInputSchema, positions, type PositionCode, type PositionWeights } from "@ssb/shared";
import { requirePermission, type AppEnv, type Auth, type Member } from "./auth/middleware";
import { zv } from "./validator";

const W = schema.positionWeight;

/** Bobot yang berlaku: bobot awal ditimpa baris buatan SSB. */
async function effective(tx: Tx): Promise<PositionWeights> {
  const out = Object.fromEntries(positions.map((p) => [p, { ...defaultPositionWeights[p] }])) as PositionWeights;
  for (const r of await tx.select({ position: W.position, indicator: W.indicator, weight: W.weight }).from(W))
    out[r.position as PositionCode][r.indicator] = r.weight;
  return out;
}

/** Bobot indikator per posisi untuk kecocokan posisi. Membaca: semua yang boleh membaca penilaian. Mengubah: admin (izin yang sama dengan template indikator). */
export function positionWeightRoutes(db: Db) {
  const member = (c: { get: (k: "auth") => Auth | undefined }): Member => c.get("auth")!.member!;

  return (
    new Hono<AppEnv>()
      .get("/position-weights", requirePermission("assessment.read"), async (c) => {
        const m = member(c);
        return c.json(await withTenant(db, m.ssbId, effective));
      })

      // Mengganti seluruh bobot buatan SSB; hanya yang berbeda dari bobot awal yang disimpan.
      .put("/position-weights", requirePermission("master.write"), zv("json", positionWeightsInputSchema), async (c) => {
        const m = member(c);
        const { weights } = c.req.valid("json");
        const rows = positions.flatMap((p) =>
          Object.entries(weights[p] ?? {})
            .filter(([indicator, weight]) => (defaultPositionWeights[p][indicator] ?? 0) !== weight)
            .map(([indicator, weight]) => ({ ssbId: m.ssbId, position: p, indicator, weight })),
        );
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await tx.delete(W).where(eq(W.ssbId, m.ssbId));
          if (rows.length > 0) await tx.insert(W).values(rows);
          return effective(tx);
        });
        return c.json(out);
      })

      .delete("/position-weights", requirePermission("master.write"), async (c) => {
        const m = member(c);
        await withTenant(db, m.ssbId, (tx) => tx.delete(W).where(eq(W.ssbId, m.ssbId)));
        return c.body(null, 204);
      })
  );
}
