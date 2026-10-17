import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  assessmentAspects,
  assessmentInputSchema,
  defaultIndicators,
  indicatorDefaultsSchema,
  indicatorInputSchema,
  indicatorPatchSchema,
  type AssessmentAspect,
  type AssessmentHistoryRow,
  type AssessmentIndicator,
  type AssessmentView,
} from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { isUniqueViolation } from "./auth/service";
import { visibleTo as playersVisibleTo } from "./players";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const idOf = (raw: string, what: string) => {
  if (!UUID.test(raw)) throw notFound(what);
  return raw;
};
const isFk = (e: unknown) => (e as { code?: string })?.code === "23503" || (e as { cause?: { code?: string } })?.cause?.code === "23503";
const round1 = (n: number) => Math.round(n * 10) / 10;
const A = schema.assessment;
const I = schema.assessmentIndicator;
const S = schema.assessmentScore;

/** Menyusun tampilan penilaian: skor per indikator, rata-rata per aspek, dan rata-rata keseluruhan. */
async function views(tx: Tx, where: ReturnType<typeof and>, publishedOnly: boolean): Promise<AssessmentView[]> {
  const rows = await tx
    .select({
      id: A.id,
      assessedOn: A.assessedOn,
      note: A.note,
      publishedAt: A.publishedAt,
      assessor: schema.appUser.name,
      perId: schema.period.id,
      perName: schema.period.name,
      perStart: schema.period.startDate,
      perEnd: schema.period.endDate,
      kuId: schema.ageGroup.id,
      kuName: schema.ageGroup.name,
    })
    .from(A)
    .innerJoin(schema.period, and(eq(schema.period.ssbId, A.ssbId), eq(schema.period.id, A.periodId)))
    .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, A.ssbId), eq(schema.ageGroup.id, A.ageGroupId)))
    .leftJoin(schema.appUser, and(eq(schema.appUser.ssbId, A.ssbId), eq(schema.appUser.id, A.assessorId)))
    .where(and(where, publishedOnly ? isNotNull(A.publishedAt) : undefined))
    .orderBy(desc(schema.period.startDate));
  if (rows.length === 0) return [];
  const scores = await tx
    .select({ assessmentId: S.assessmentId, indicatorId: I.id, aspect: I.aspect, name: I.name, sort: I.sortOrder, score: S.score })
    .from(S)
    .innerJoin(I, and(eq(I.ssbId, S.ssbId), eq(I.id, S.indicatorId)))
    .where(
      inArray(
        S.assessmentId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(I.sortOrder), asc(I.name));
  return rows.map((r) => {
    const mine = scores.filter((x) => x.assessmentId === r.id);
    const aspects = assessmentAspects
      .map((a) => ({ aspect: a, list: mine.filter((x) => x.aspect === a) }))
      .filter((x) => x.list.length > 0)
      .map((x) => ({ aspect: x.aspect, average: round1(x.list.reduce((t, y) => t + y.score, 0) / x.list.length) }));
    return {
      id: r.id,
      period: { id: r.perId, name: r.perName, startDate: r.perStart, endDate: r.perEnd },
      ageGroup: { id: r.kuId, name: r.kuName },
      assessedOn: r.assessedOn,
      note: r.note,
      assessor: r.assessor,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      scores: mine.map(({ indicatorId, aspect, name, score }) => ({ indicatorId, aspect: aspect as AssessmentAspect, name, score })),
      aspects,
      overall: mine.length ? round1(mine.reduce((t, y) => t + y.score, 0) / mine.length) : null,
    };
  });
}

export function assessmentRoutes(db: Db) {
  const member = (c: { get: (k: "auth") => any }) => c.get("auth")!.member as Member;

  /** Pemain yang boleh dilihat peran ini (sama dengan daftar pemain); di luar batas dijawab 404. */
  const visiblePlayer = async (tx: Tx, m: Member, id: string) => {
    const [p] = await tx
      .select({ id: schema.player.id, ageGroupId: schema.player.ageGroupId })
      .from(schema.player)
      .where(and(eq(schema.player.id, id), playersVisibleTo(m)))
      .limit(1);
    if (!p) throw notFound("Pemain");
    return p;
  };
  const indicatorRow = (r: typeof I.$inferSelect): AssessmentIndicator => ({
    id: r.id,
    ageGroupId: r.ageGroupId,
    aspect: r.aspect as AssessmentAspect,
    name: r.name,
    sortOrder: r.sortOrder,
    active: r.active,
  });

  return (
    new Hono<AppEnv>()
      // ---- Template indikator per KU ----
      .get("/assessment-indicators", requirePermission("master.read"), async (c) => {
        const m = member(c);
        const ku = c.req.query("ageGroupId");
        if (ku && !UUID.test(ku)) return c.json([]);
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select()
            .from(I)
            .where(ku ? eq(I.ageGroupId, ku) : undefined)
            .orderBy(asc(I.ageGroupId), asc(I.sortOrder), asc(I.name)),
        );
        return c.json(rows.map(indicatorRow));
      })

      .post("/assessment-indicators", requirePermission("master.write"), zv("json", indicatorInputSchema), async (c) => {
        const m = member(c);
        const b = c.req.valid("json");
        try {
          const row = await withTenant(db, m.ssbId, async (tx) => {
            const [mx] = await tx
              .select({ n: sql<number>`coalesce(max(${I.sortOrder}), 0)::int` })
              .from(I)
              .where(eq(I.ageGroupId, b.ageGroupId));
            const [r] = await tx
              .insert(I)
              .values({ ssbId: m.ssbId, ageGroupId: b.ageGroupId, aspect: b.aspect, name: b.name, sortOrder: (mx?.n ?? 0) + 1 })
              .returning();
            return r!;
          });
          return c.json(indicatorRow(row), 201);
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Indikator dengan nama ini sudah ada di KU ini");
          if (isFk(e)) throw new HttpError(422, "reference_invalid", "KU tidak ditemukan di SSB ini");
          throw e;
        }
      })

      // Memasang usulan awal (belum divalidasi pelatih berlisensi). Yang sudah ada dilewati, jadi aman diulang.
      .post("/assessment-indicators/defaults", requirePermission("master.write"), zv("json", indicatorDefaultsSchema), async (c) => {
        const m = member(c);
        const { ageGroupId } = c.req.valid("json");
        try {
          const rows = await withTenant(db, m.ssbId, async (tx) => {
            const [mx] = await tx
              .select({ n: sql<number>`coalesce(max(${I.sortOrder}), 0)::int` })
              .from(I)
              .where(eq(I.ageGroupId, ageGroupId));
            let order = mx?.n ?? 0;
            const values = assessmentAspects.flatMap((aspect) =>
              defaultIndicators[aspect].map((name) => ({ ssbId: m.ssbId, ageGroupId, aspect, name, sortOrder: ++order })),
            );
            await tx
              .insert(I)
              .values(values)
              .onConflictDoNothing({ target: [I.ssbId, I.ageGroupId, I.name] });
            return tx.select().from(I).where(eq(I.ageGroupId, ageGroupId)).orderBy(asc(I.sortOrder), asc(I.name));
          });
          return c.json(rows.map(indicatorRow), 201);
        } catch (e) {
          if (isFk(e)) throw new HttpError(422, "reference_invalid", "KU tidak ditemukan di SSB ini");
          throw e;
        }
      })

      .patch("/assessment-indicators/:id", requirePermission("master.write"), zv("json", indicatorPatchSchema), async (c) => {
        const m = member(c);
        const id = idOf(c.req.param("id"), "Indikator");
        const b = c.req.valid("json");
        try {
          const row = await withTenant(db, m.ssbId, async (tx) => {
            const [r] = await tx
              .update(I)
              .set({ name: b.name, active: b.active, ...(b.sortOrder !== undefined ? { sortOrder: b.sortOrder } : {}) })
              .where(eq(I.id, id))
              .returning();
            return r;
          });
          if (!row) throw notFound("Indikator");
          return c.json(indicatorRow(row));
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Indikator dengan nama ini sudah ada di KU ini");
          throw e;
        }
      })

      .delete("/assessment-indicators/:id", requirePermission("master.write"), async (c) => {
        const m = member(c);
        const id = idOf(c.req.param("id"), "Indikator");
        try {
          const rows = await withTenant(db, m.ssbId, (tx) => tx.delete(I).where(eq(I.id, id)).returning({ id: I.id }));
          if (rows.length === 0) throw notFound("Indikator");
          return c.body(null, 204);
        } catch (e) {
          if (isFk(e)) throw new HttpError(409, "in_use", "Indikator sudah dipakai penilaian. Nonaktifkan saja agar riwayat tetap utuh.");
          throw e;
        }
      })

      // ---- Penilaian per pemain per periode ----
      .get("/players/:playerId/assessments", requirePermission("assessment.read"), async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("playerId"), "Pemain");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await visiblePlayer(tx, m, playerId);
          // Orang tua hanya melihat penilaian yang sudah diterbitkan.
          return views(tx, eq(A.playerId, playerId), m.role === "orang_tua");
        });
        return c.json(out);
      })

      .put("/players/:playerId/assessments/:periodId", requirePermission("assessment.write"), zv("json", assessmentInputSchema), async (c) => {
        const m = member(c);
        const playerId = idOf(c.req.param("playerId"), "Pemain");
        const periodId = idOf(c.req.param("periodId"), "Periode");
        const b = c.req.valid("json");
        const ids = b.scores.map((x) => x.indicatorId);
        if (new Set(ids).size !== ids.length) throw new HttpError(422, "duplicate_indicator", "Satu indikator hanya boleh muncul sekali");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          const player = await visiblePlayer(tx, m, playerId);
          if (!player.ageGroupId) throw new HttpError(422, "no_age_group", "Pemain belum punya KU, jadi belum bisa dinilai");
          const [period] = await tx.select({ id: schema.period.id }).from(schema.period).where(eq(schema.period.id, periodId)).limit(1);
          if (!period) throw notFound("Periode");
          const valid = await tx
            .select({ id: I.id })
            .from(I)
            .where(and(eq(I.ageGroupId, player.ageGroupId), eq(I.active, true), inArray(I.id, ids)));
          if (valid.length !== ids.length)
            throw new HttpError(422, "indicator_invalid", "Ada indikator yang bukan milik KU pemain ini atau sudah dinonaktifkan");

          const [a] = await tx
            .insert(A)
            .values({
              ssbId: m.ssbId,
              playerId,
              periodId,
              ageGroupId: player.ageGroupId,
              assessedOn: b.assessedOn ?? new Date().toISOString().slice(0, 10),
              note: b.note || null,
              assessorId: m.userId,
            })
            .onConflictDoUpdate({
              target: [A.ssbId, A.playerId, A.periodId],
              set: {
                ageGroupId: player.ageGroupId,
                ...(b.assessedOn ? { assessedOn: b.assessedOn } : {}),
                note: b.note || null,
                assessorId: m.userId,
                updatedAt: sql`now()`,
              },
            })
            .returning({ id: A.id });
          const assessmentId = a!.id;
          const before = await tx.select({ indicatorId: S.indicatorId, score: S.score }).from(S).where(eq(S.assessmentId, assessmentId));
          const old = new Map(before.map((x) => [x.indicatorId, x.score]));
          for (const x of b.scores) {
            if (old.get(x.indicatorId) === x.score) continue;
            await tx
              .insert(S)
              .values({ ssbId: m.ssbId, assessmentId, indicatorId: x.indicatorId, score: x.score })
              .onConflictDoUpdate({ target: [S.assessmentId, S.indicatorId], set: { score: x.score } });
            await tx.insert(schema.assessmentScoreLog).values({
              ssbId: m.ssbId,
              assessmentId,
              indicatorId: x.indicatorId,
              oldScore: old.get(x.indicatorId) ?? null,
              newScore: x.score,
              changedBy: m.userId,
            });
          }
          return (await views(tx, eq(A.id, assessmentId), false))[0]!;
        });
        return c.json(out);
      })

      .post("/players/:playerId/assessments/:periodId/publish", requirePermission("report.publish"), async (c) => publish(c, true))
      .delete("/players/:playerId/assessments/:periodId/publish", requirePermission("report.publish"), async (c) => publish(c, false))

      .get("/players/:playerId/assessments/:periodId/history", requirePermission("assessment.read"), async (c) => {
        const m = member(c);
        if (m.role === "orang_tua") throw new HttpError(403, "forbidden", "Anda tidak punya izin untuk tindakan ini");
        const playerId = idOf(c.req.param("playerId"), "Pemain");
        const periodId = idOf(c.req.param("periodId"), "Periode");
        const out = await withTenant(db, m.ssbId, async (tx): Promise<AssessmentHistoryRow[]> => {
          await visiblePlayer(tx, m, playerId);
          const [a] = await tx
            .select({ id: A.id })
            .from(A)
            .where(and(eq(A.playerId, playerId), eq(A.periodId, periodId)))
            .limit(1);
          if (!a) throw notFound("Penilaian");
          const rows = await tx
            .select({
              indicator: I.name,
              aspect: I.aspect,
              from: schema.assessmentScoreLog.oldScore,
              to: schema.assessmentScoreLog.newScore,
              by: schema.appUser.name,
              at: schema.assessmentScoreLog.changedAt,
            })
            .from(schema.assessmentScoreLog)
            .innerJoin(I, and(eq(I.ssbId, schema.assessmentScoreLog.ssbId), eq(I.id, schema.assessmentScoreLog.indicatorId)))
            .leftJoin(
              schema.appUser,
              and(eq(schema.appUser.ssbId, schema.assessmentScoreLog.ssbId), eq(schema.appUser.id, schema.assessmentScoreLog.changedBy)),
            )
            .where(eq(schema.assessmentScoreLog.assessmentId, a.id))
            .orderBy(desc(schema.assessmentScoreLog.changedAt), asc(I.name));
          return rows.map((r) => ({ indicator: r.indicator, aspect: r.aspect as AssessmentAspect, from: r.from, to: r.to, by: r.by, at: r.at.toISOString() }));
        });
        return c.json(out);
      })
  );

  async function publish(c: any, on: boolean) {
    const m = member(c);
    const playerId = idOf(c.req.param("playerId"), "Pemain");
    const periodId = idOf(c.req.param("periodId"), "Periode");
    const out = await withTenant(db, m.ssbId, async (tx) => {
      await visiblePlayer(tx, m, playerId);
      const [a] = await tx
        .select({ id: A.id, publishedAt: A.publishedAt })
        .from(A)
        .where(and(eq(A.playerId, playerId), eq(A.periodId, periodId)))
        .limit(1);
      if (!a) throw notFound("Penilaian");
      await tx
        .update(A)
        .set({ publishedAt: on ? (a.publishedAt ?? sql`now()`) : null })
        .where(eq(A.id, a.id));
      return (await views(tx, eq(A.id, a.id), false))[0]!;
    });
    return c.json(out);
  }
}
