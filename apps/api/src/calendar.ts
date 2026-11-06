import { and, asc, eq, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import { calendarEventInputSchema, calendarRangeSchema, type CalendarEventRow, type CalendarEventType, type PublicCalendarEvent } from "@ssb/shared";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { ssbIdBySlug } from "./auth/service";
import { HttpError } from "./errors";
import { todayWib } from "./fees";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);

/** Batas baris per permintaan, supaya rentang yang lebar tidak menarik seluruh tabel. */
const LIMIT = 500;

type Row = typeof schema.calendarEvent.$inferSelect;
const hm = (t: string | null) => (t ? t.slice(0, 5) : null);

const toPublic = (r: Row): PublicCalendarEvent => ({
  id: r.id,
  title: r.title,
  description: r.description,
  eventType: r.eventType as CalendarEventType,
  startDate: r.startDate,
  endDate: r.endDate,
  startTime: hm(r.startTime),
  endTime: hm(r.endTime),
  location: r.location,
});
const toRow = (r: Row): CalendarEventRow => ({ ...toPublic(r), isPublic: r.isPublic });

/** Kegiatan yang beririsan dengan rentang: berakhir pada/ setelah `from` dan mulai pada/ sebelum `to`. Tanpa `from`, mulai hari ini. */
const overlap = (range: { from?: string | undefined; to?: string | undefined }) => {
  const e = schema.calendarEvent;
  const from = range.from ?? todayWib();
  return and(sql`coalesce(${e.endDate}, ${e.startDate}) >= ${from}`, range.to ? lte(e.startDate, range.to) : undefined);
};

const order = [asc(schema.calendarEvent.startDate), asc(schema.calendarEvent.startTime), asc(schema.calendarEvent.title)] as const;

/** Kalender akademi: daftar untuk semua anggota SSB, pengelolaan untuk admin, dan daftar publik untuk landing page. */
export function calendarRoutes(db: Db) {
  return (
    new Hono<AppEnv>()
      .get("/calendar", requirePermission("calendar.read"), zv("query", calendarRangeSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select()
            .from(schema.calendarEvent)
            .where(overlap(c.req.valid("query")))
            .orderBy(...order)
            .limit(LIMIT),
        );
        return c.json(rows.map(toRow));
      })

      .post("/calendar", requirePermission("calendar.manage"), zv("json", calendarEventInputSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const b = c.req.valid("json");
        const row = await withTenant(db, m.ssbId, async (tx) => {
          const [r] = await tx
            .insert(schema.calendarEvent)
            .values({
              ssbId: m.ssbId,
              title: b.title,
              description: b.description,
              eventType: b.eventType,
              startDate: b.startDate,
              endDate: b.endDate ?? null,
              startTime: b.startTime ?? null,
              endTime: b.endTime ?? null,
              location: b.location,
              isPublic: b.isPublic,
              createdBy: m.userId,
            })
            .returning();
          return r;
        });
        if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan kegiatan");
        return c.json(toRow(row), 201);
      })

      .put("/calendar/:id", requirePermission("calendar.manage"), zv("json", calendarEventInputSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const id = c.req.param("id");
        if (!UUID.test(id)) throw notFound("Kegiatan");
        const b = c.req.valid("json");
        const row = await withTenant(db, m.ssbId, async (tx) => {
          const [r] = await tx
            .update(schema.calendarEvent)
            .set({
              title: b.title,
              description: b.description,
              eventType: b.eventType,
              startDate: b.startDate,
              endDate: b.endDate ?? null,
              startTime: b.startTime ?? null,
              endTime: b.endTime ?? null,
              location: b.location,
              isPublic: b.isPublic,
              updatedAt: new Date(),
            })
            .where(eq(schema.calendarEvent.id, id))
            .returning();
          return r;
        });
        if (!row) throw notFound("Kegiatan");
        return c.json(toRow(row));
      })

      .delete("/calendar/:id", requirePermission("calendar.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = c.req.param("id");
        if (!UUID.test(id)) throw notFound("Kegiatan");
        const gone = await withTenant(db, m.ssbId, (tx) =>
          tx.delete(schema.calendarEvent).where(eq(schema.calendarEvent.id, id)).returning({ id: schema.calendarEvent.id }),
        );
        if (gone.length === 0) throw notFound("Kegiatan");
        return c.body(null, 204);
      })

      // Landing page, tanpa sesi: hanya kegiatan yang ditandai publik.
      .get("/public/site/:slug/calendar", zv("query", calendarRangeSchema), async (c) => {
        const ssbId = await ssbIdBySlug(db, c.req.param("slug").toLowerCase());
        if (!ssbId) throw notFound("Situs");
        const rows = await withTenant(db, ssbId, (tx) =>
          tx
            .select()
            .from(schema.calendarEvent)
            .where(and(eq(schema.calendarEvent.isPublic, true), overlap(c.req.valid("query"))))
            .orderBy(...order)
            .limit(LIMIT),
        );
        c.header("cache-control", "public, max-age=60");
        return c.json(rows.map(toPublic));
      })
  );
}
