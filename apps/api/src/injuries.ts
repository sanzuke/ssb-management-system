import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { injuryInputSchema, injuryRecoverSchema, injuryUpdateSchema, type BodyPartCode, type InjuryMark, type PlayerInjury } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type Auth, type AppEnv, type Member } from "./auth/middleware";
import { todayWib } from "./fees";
import { visibleTo } from "./players";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const J = schema.playerInjury;

/**
 * Cedera yang sedang berjalan untuk banyak siswa sekaligus (tanpa catatan), untuk tanda di absensi dan skuad.
 * Bila satu siswa punya lebih dari satu, yang dipakai yang paling baru dimulai. Pemanggil bertanggung jawab atas
 * batas akses siswanya; fungsi ini hanya membaca baris yang ditemui.
 */
export async function activeInjuries(tx: Tx, playerIds: string[]): Promise<Map<string, InjuryMark>> {
  const out = new Map<string, InjuryMark>();
  if (playerIds.length === 0) return out;
  const rows = await tx
    .select({ playerId: J.playerId, bodyPart: J.bodyPart, expectedReturnOn: J.expectedReturnOn })
    .from(J)
    .where(and(inArray(J.playerId, playerIds), isNull(J.recoveredOn)))
    .orderBy(desc(J.startedOn), desc(J.createdAt));
  for (const r of rows) if (!out.has(r.playerId)) out.set(r.playerId, { bodyPart: r.bodyPart as BodyPartCode, expectedReturnOn: r.expectedReturnOn });
  return out;
}

/** Catatan cedera siswa: data kesehatan anak. Siswa di luar batas peran dijawab 404, seperti rute siswa lain. */
export function injuryRoutes(db: Db) {
  const member = (c: { get: (k: "auth") => Auth | undefined }): Member => c.get("auth")!.member!;
  const idOf = (raw: string, what: string) => {
    if (!UUID.test(raw)) throw new HttpError(404, "not_found", `${what} tidak ditemukan`);
    return raw;
  };
  const ensurePlayer = async (tx: Tx, m: Member, playerId: string) => {
    const [p] = await tx
      .select({ id: schema.player.id })
      .from(schema.player)
      .where(and(eq(schema.player.id, playerId), visibleTo(m)))
      .limit(1);
    if (!p) throw new HttpError(404, "not_found", "Siswa tidak ditemukan");
  };
  const list = async (tx: Tx, playerId: string): Promise<PlayerInjury[]> => {
    const rows = await tx
      .select({
        id: J.id,
        bodyPart: J.bodyPart,
        startedOn: J.startedOn,
        expectedReturnOn: J.expectedReturnOn,
        recoveredOn: J.recoveredOn,
        note: J.note,
        recordedBy: schema.appUser.name,
      })
      .from(J)
      .leftJoin(schema.appUser, and(eq(schema.appUser.ssbId, J.ssbId), eq(schema.appUser.id, J.recordedBy)))
      .where(eq(J.playerId, playerId))
      // Yang masih berjalan dulu, lalu yang terbaru.
      .orderBy(sql`${J.recoveredOn} is not null`, desc(J.startedOn), desc(J.createdAt))
      .limit(100);
    return rows.map((r) => ({ ...r, bodyPart: r.bodyPart as BodyPartCode }));
  };
  const findOpen = async (tx: Tx, playerId: string, id: string) => {
    const [r] = await tx
      .select({ id: J.id, startedOn: J.startedOn, recoveredOn: J.recoveredOn })
      .from(J)
      .where(and(eq(J.id, id), eq(J.playerId, playerId)))
      .for("update")
      .limit(1);
    if (!r) throw new HttpError(404, "not_found", "Catatan cedera tidak ditemukan");
    if (r.recoveredOn) throw new HttpError(409, "already_recovered", "Cedera ini sudah ditandai pulih");
    return r;
  };

  return (
    new Hono<AppEnv>()
      .get("/players/:playerId/injuries", requirePermission("injury.read"), async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("playerId"), "Siswa");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await ensurePlayer(tx, m, playerId);
          return list(tx, playerId);
        });
        return c.json(out);
      })

      .post("/players/:playerId/injuries", requirePermission("injury.write"), zv("json", injuryInputSchema), async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("playerId"), "Siswa");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await ensurePlayer(tx, m, playerId);
          await tx.insert(J).values({
            ssbId: m.ssbId,
            playerId,
            bodyPart: b.bodyPart,
            startedOn: b.startedOn,
            expectedReturnOn: b.expectedReturnOn ?? null,
            note: b.note ?? null,
            recordedBy: m.userId,
          });
          return list(tx, playerId);
        });
        return c.json(out, 201);
      })

      // Ubah perkiraan pulih dan catatan. Hanya untuk cedera yang masih berjalan.
      .patch("/players/:playerId/injuries/:id", requirePermission("injury.write"), zv("json", injuryUpdateSchema), async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("playerId"), "Siswa");
        const id = idOf(c.req.param("id"), "Catatan cedera");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await ensurePlayer(tx, m, playerId);
          const cur = await findOpen(tx, playerId, id);
          if (b.expectedReturnOn && b.expectedReturnOn < cur.startedOn) {
            throw new HttpError(400, "validation", "Periksa kembali isian Anda", { expectedReturnOn: "tidak boleh sebelum tanggal mulai" });
          }
          await tx
            .update(J)
            .set({
              ...(b.expectedReturnOn !== undefined ? { expectedReturnOn: b.expectedReturnOn } : {}),
              ...(b.note !== undefined ? { note: b.note } : {}),
            })
            .where(eq(J.id, id));
          return list(tx, playerId);
        });
        return c.json(out);
      })

      .post("/players/:playerId/injuries/:id/recover", requirePermission("injury.write"), zv("json", injuryRecoverSchema), async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("playerId"), "Siswa");
        const id = idOf(c.req.param("id"), "Catatan cedera");
        const { recoveredOn } = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await ensurePlayer(tx, m, playerId);
          const cur = await findOpen(tx, playerId, id);
          const tgl = recoveredOn ?? todayWib();
          if (tgl < cur.startedOn) throw new HttpError(400, "validation", "Periksa kembali isian Anda", { recoveredOn: "tidak boleh sebelum tanggal mulai" });
          await tx.update(J).set({ recoveredOn: tgl, recoveredBy: m.userId }).where(eq(J.id, id));
          return list(tx, playerId);
        });
        return c.json(out);
      })
  );
}
