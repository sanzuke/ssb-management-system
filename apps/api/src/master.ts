import { Hono } from "hono";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { ageGroupInputSchema, locationInputSchema, periodInputSchema } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { isUniqueViolation } from "./auth/service";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const idOf = (raw: string, what: string) => {
  if (!UUID.test(raw)) throw notFound(what);
  return raw;
};
const isFkViolation = (e: unknown) => (e as { code?: string })?.code === "23503" || (e as { cause?: { code?: string } })?.cause?.code === "23503";

/** Menjalankan perubahan, menerjemahkan nama ganda (409) dan data yang masih dipakai (409). */
async function guarded<T>(fn: () => Promise<T>, dupMsg: string, inUseMsg: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", dupMsg);
    if (isFkViolation(e)) throw new HttpError(409, "in_use", inUseMsg);
    throw e;
  }
}

/** Rentang usia KU tidak boleh tumpang tindih. Kunci advisory per SSB mencegah dua perubahan serentak lolos bersamaan. */
async function assertNoOverlap(tx: Tx, ssbId: string, minAge: number, maxAge: number, exceptId?: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`age_group:${ssbId}`}))`);
  const rows = await tx
    .select({ name: schema.ageGroup.name, minAge: schema.ageGroup.minAge, maxAge: schema.ageGroup.maxAge })
    .from(schema.ageGroup)
    .where(and(sql`${schema.ageGroup.minAge} <= ${maxAge} AND ${schema.ageGroup.maxAge} >= ${minAge}`, exceptId ? ne(schema.ageGroup.id, exceptId) : undefined))
    .limit(1);
  const hit = rows[0];
  if (hit) throw new HttpError(409, "age_overlap", `Rentang usia tumpang tindih dengan ${hit.name} (${hit.minAge}-${hit.maxAge} tahun)`);
}

export function masterRoutes(db: Db) {
  const read = requirePermission("master.read");
  const write = requirePermission("master.write");
  const ssbOf = (c: { get: (k: "auth") => any }) => c.get("auth")!.member!.ssbId as string;

  return (
    new Hono<AppEnv>()
      // ---- Kelompok usia (KU) ----
      .get("/age-groups", read, async (c) =>
        c.json(
          await withTenant(db, ssbOf(c), (tx) => tx.select().from(schema.ageGroup).orderBy(asc(schema.ageGroup.minAge), asc(schema.ageGroup.name))).then(
            (rows) => rows.map(({ id, name, minAge, maxAge }) => ({ id, name, minAge, maxAge })),
          ),
        ),
      )
      .post("/age-groups", write, zv("json", ageGroupInputSchema), async (c) => {
        const ssbId = ssbOf(c);
        const b = c.req.valid("json");
        const row = await guarded(
          () =>
            withTenant(db, ssbId, async (tx) => {
              await assertNoOverlap(tx, ssbId, b.minAge, b.maxAge);
              const [r] = await tx
                .insert(schema.ageGroup)
                .values({ ssbId, ...b })
                .returning();
              return r!;
            }),
          "Nama KU sudah dipakai",
          "KU masih dipakai",
        );
        return c.json({ id: row.id, name: row.name, minAge: row.minAge, maxAge: row.maxAge }, 201);
      })
      .patch("/age-groups/:id", write, zv("json", ageGroupInputSchema), async (c) => {
        const ssbId = ssbOf(c);
        const id = idOf(c.req.param("id"), "KU");
        const b = c.req.valid("json");
        const row = await guarded(
          () =>
            withTenant(db, ssbId, async (tx) => {
              await assertNoOverlap(tx, ssbId, b.minAge, b.maxAge, id);
              const [r] = await tx.update(schema.ageGroup).set(b).where(eq(schema.ageGroup.id, id)).returning();
              return r;
            }),
          "Nama KU sudah dipakai",
          "KU masih dipakai",
        );
        if (!row) throw notFound("KU");
        return c.json({ id: row.id, name: row.name, minAge: row.minAge, maxAge: row.maxAge });
      })
      .delete("/age-groups/:id", write, async (c) => {
        const id = idOf(c.req.param("id"), "KU");
        const rows = await guarded(
          () => withTenant(db, ssbOf(c), (tx) => tx.delete(schema.ageGroup).where(eq(schema.ageGroup.id, id)).returning({ id: schema.ageGroup.id })),
          "",
          "KU tidak bisa dihapus karena masih dipakai pemain, penugasan, atau jadwal latihan",
        );
        if (rows.length === 0) throw notFound("KU");
        return c.body(null, 204);
      })

      // ---- Periode ----
      .get("/periods", read, async (c) =>
        c.json(
          await withTenant(db, ssbOf(c), (tx) => tx.select().from(schema.period).orderBy(sql`${schema.period.startDate} desc`)).then((rows) =>
            rows.map(({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate })),
          ),
        ),
      )
      .post("/periods", write, zv("json", periodInputSchema), async (c) => {
        const ssbId = ssbOf(c);
        const row = await guarded(
          () =>
            withTenant(
              db,
              ssbId,
              async (tx) =>
                (
                  await tx
                    .insert(schema.period)
                    .values({ ssbId, ...c.req.valid("json") })
                    .returning()
                )[0]!,
            ),
          "Nama periode sudah dipakai",
          "Periode masih dipakai",
        );
        return c.json({ id: row.id, name: row.name, startDate: row.startDate, endDate: row.endDate }, 201);
      })
      .patch("/periods/:id", write, zv("json", periodInputSchema), async (c) => {
        const id = idOf(c.req.param("id"), "Periode");
        const [row] = await guarded(
          () => withTenant(db, ssbOf(c), (tx) => tx.update(schema.period).set(c.req.valid("json")).where(eq(schema.period.id, id)).returning()),
          "Nama periode sudah dipakai",
          "Periode masih dipakai",
        );
        if (!row) throw notFound("Periode");
        return c.json({ id: row.id, name: row.name, startDate: row.startDate, endDate: row.endDate });
      })
      .delete("/periods/:id", write, async (c) => {
        const id = idOf(c.req.param("id"), "Periode");
        const rows = await guarded(
          () => withTenant(db, ssbOf(c), (tx) => tx.delete(schema.period).where(eq(schema.period.id, id)).returning({ id: schema.period.id })),
          "",
          "Periode tidak bisa dihapus karena masih dipakai penugasan atau jadwal latihan",
        );
        if (rows.length === 0) throw notFound("Periode");
        return c.body(null, 204);
      })

      // ---- Lokasi latihan ----
      .get("/locations", read, async (c) =>
        c.json(
          await withTenant(db, ssbOf(c), (tx) => tx.select().from(schema.location).orderBy(asc(schema.location.name))).then((rows) =>
            rows.map(({ id, name, address }) => ({ id, name, address })),
          ),
        ),
      )
      .post("/locations", write, zv("json", locationInputSchema), async (c) => {
        const ssbId = ssbOf(c);
        const b = c.req.valid("json");
        const row = await guarded(
          () =>
            withTenant(
              db,
              ssbId,
              async (tx) =>
                (
                  await tx
                    .insert(schema.location)
                    .values({ ssbId, name: b.name, address: b.address || null })
                    .returning()
                )[0]!,
            ),
          "Nama lokasi sudah dipakai",
          "Lokasi masih dipakai",
        );
        return c.json({ id: row.id, name: row.name, address: row.address }, 201);
      })
      .patch("/locations/:id", write, zv("json", locationInputSchema), async (c) => {
        const id = idOf(c.req.param("id"), "Lokasi");
        const b = c.req.valid("json");
        const [row] = await guarded(
          () =>
            withTenant(db, ssbOf(c), (tx) =>
              tx
                .update(schema.location)
                .set({ name: b.name, address: b.address || null })
                .where(eq(schema.location.id, id))
                .returning(),
            ),
          "Nama lokasi sudah dipakai",
          "Lokasi masih dipakai",
        );
        if (!row) throw notFound("Lokasi");
        return c.json({ id: row.id, name: row.name, address: row.address });
      })
      .delete("/locations/:id", write, async (c) => {
        const id = idOf(c.req.param("id"), "Lokasi");
        const rows = await guarded(
          () => withTenant(db, ssbOf(c), (tx) => tx.delete(schema.location).where(eq(schema.location.id, id)).returning({ id: schema.location.id })),
          "",
          "Lokasi tidak bisa dihapus karena masih dipakai jadwal latihan",
        );
        if (rows.length === 0) throw notFound("Lokasi");
        return c.body(null, 204);
      })
  );
}
