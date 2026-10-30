import { Hono } from "hono";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  attendanceInputSchema,
  sessionCreateSchema,
  sessionInputSchema,
  type AttendanceRoster,
  type AttendanceSummary,
  type GuardianSession,
  type TrainingSession,
} from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { zv } from "./validator";
import { visibleTo as playersVisibleTo } from "./players";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPEAT = 100;
const notFound = () => new HttpError(404, "not_found", "Sesi tidak ditemukan");
const isFk = (e: unknown) => (e as { code?: string })?.code === "23503" || (e as { cause?: { code?: string } })?.cause?.code === "23503";
const ts = schema.trainingSession;

/** Admin melihat semua sesi; pelatih dan korlas hanya KU yang ditugaskan pada periode yang mencakup tanggal sesi. */
function visibleTo(m: Member): SQL | undefined {
  if (m.role === "admin_ssb") return undefined;
  if (m.role === "pelatih" || m.role === "korlas") {
    return sql`exists (
      select 1 from coach_assignment ca join period p on p.id = ca.period_id
      where ca.user_id = ${m.userId} and ca.age_group_id = ${ts.ageGroupId} and ${ts.sessionDate} between p.start_date and p.end_date)`;
  }
  return sql`false`;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Toleransi satu hari untuk selisih zona waktu server dan lapangan. */
const notFuture = (date: string) => date <= addDays(new Date().toISOString().slice(0, 10), 1);

async function query(tx: Tx, where: SQL | undefined): Promise<TrainingSession[]> {
  const rows = await tx
    .select({
      id: ts.id,
      sessionDate: ts.sessionDate,
      startTime: ts.startTime,
      kuId: schema.ageGroup.id,
      kuName: schema.ageGroup.name,
      locId: schema.location.id,
      locName: schema.location.name,
      perId: schema.period.id,
      perName: schema.period.name,
    })
    .from(ts)
    .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, ts.ssbId), eq(schema.ageGroup.id, ts.ageGroupId)))
    .leftJoin(schema.location, and(eq(schema.location.ssbId, ts.ssbId), eq(schema.location.id, ts.locationId)))
    .leftJoin(schema.period, and(eq(schema.period.ssbId, ts.ssbId), eq(schema.period.id, ts.periodId)))
    .where(where)
    .orderBy(asc(ts.sessionDate), asc(ts.startTime), asc(schema.ageGroup.minAge))
    .limit(500);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const counts = await tx
    .select({ sessionId: schema.attendance.sessionId, status: schema.attendance.status, n: sql<number>`count(*)::int` })
    .from(schema.attendance)
    .where(inArray(schema.attendance.sessionId, ids))
    .groupBy(schema.attendance.sessionId, schema.attendance.status);
  const kuIds = [...new Set(rows.map((r) => r.kuId))];
  const active = await tx
    .select({ kuId: schema.player.ageGroupId, n: sql<number>`count(*)::int` })
    .from(schema.player)
    .where(and(inArray(schema.player.ageGroupId, kuIds), eq(schema.player.status, "aktif")))
    .groupBy(schema.player.ageGroupId);
  const activeBy = new Map(active.map((a) => [a.kuId, a.n]));
  return rows.map((r) => {
    const att = { hadir: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 };
    let recorded = 0;
    for (const c of counts)
      if (c.sessionId === r.id) {
        att[c.status] = c.n;
        recorded += c.n;
      }
    att.belum = Math.max(0, (activeBy.get(r.kuId) ?? 0) - recorded);
    return {
      id: r.id,
      sessionDate: r.sessionDate,
      startTime: r.startTime ? r.startTime.slice(0, 5) : null,
      ageGroup: { id: r.kuId, name: r.kuName },
      location: r.locId ? { id: r.locId, name: r.locName! } : null,
      period: r.perId ? { id: r.perId, name: r.perName! } : null,
      attendance: att,
    };
  });
}

async function periodFor(tx: Tx, date: string) {
  const [p] = await tx
    .select({ id: schema.period.id })
    .from(schema.period)
    .where(and(lte(schema.period.startDate, date), gte(schema.period.endDate, date)))
    .orderBy(desc(schema.period.startDate))
    .limit(1);
  return p?.id ?? null;
}

export function sessionRoutes(db: Db) {
  const member = (c: { get: (k: "auth") => any }) => c.get("auth")!.member as Member;
  const sessionId = (raw: string) => {
    if (!UUID.test(raw)) throw notFound();
    return raw;
  };
  const rosterOf = async (tx: Tx, m: Member, id: string): Promise<AttendanceRoster | null> => {
    const [s] = await query(tx, and(eq(ts.id, id), visibleTo(m)));
    if (!s) return null;
    const players = await tx
      .select({
        playerId: schema.player.id,
        fullName: schema.player.fullName,
        memberNo: schema.player.memberNo,
        status: schema.attendance.status,
        note: schema.attendance.note,
        playerStatus: schema.player.status,
      })
      .from(schema.player)
      .leftJoin(schema.attendance, and(eq(schema.attendance.playerId, schema.player.id), eq(schema.attendance.sessionId, id)))
      .where(eq(schema.player.ageGroupId, s.ageGroup.id))
      .orderBy(asc(schema.player.fullName));
    // Siswa tidak aktif hanya tampil bila sudah punya catatan absensi di sesi ini.
    return { session: s, players: players.filter((p) => p.playerStatus === "aktif" || p.status).map(({ playerStatus: _x, ...p }) => p) };
  };

  return (
    new Hono<AppEnv>()
      .get("/sessions", requirePermission("session.read"), async (c) => {
        const m = member(c);
        const from = c.req.query("from");
        const to = c.req.query("to");
        const ku = c.req.query("ageGroupId");
        if ((from && !ISO.test(from)) || (to && !ISO.test(to))) throw new HttpError(400, "bad_request", "Tanggal harus berformat YYYY-MM-DD");
        const rows = await withTenant(db, m.ssbId, (tx) =>
          query(
            tx,
            and(
              visibleTo(m),
              from ? gte(ts.sessionDate, from) : undefined,
              to ? lte(ts.sessionDate, to) : undefined,
              ku ? (UUID.test(ku) ? eq(ts.ageGroupId, ku) : sql`false`) : undefined,
            ),
          ),
        );
        return c.json(rows);
      })

      .post("/sessions", requirePermission("session.manage"), zv("json", sessionCreateSchema), async (c) => {
        const m = member(c);
        const b = c.req.valid("json");
        const dates = [b.sessionDate];
        if (b.repeatUntil) for (let d = addDays(b.sessionDate, 7); d <= b.repeatUntil; d = addDays(d, 7)) dates.push(d);
        if (dates.length > MAX_REPEAT) throw new HttpError(422, "too_many", `Jadwal berulang maksimal ${MAX_REPEAT} sesi; pendekkan sampai tanggal`);
        try {
          const created = await withTenant(db, m.ssbId, async (tx) => {
            const dup = await tx
              .select({ d: ts.sessionDate })
              .from(ts)
              .where(
                and(
                  eq(ts.ageGroupId, b.ageGroupId),
                  inArray(ts.sessionDate, dates),
                  b.startTime ? eq(ts.startTime, b.startTime) : sql`${ts.startTime} is null`,
                ),
              )
              .limit(1);
            if (dup[0]) throw new HttpError(409, "duplicate", `KU ini sudah punya sesi pada ${dup[0].d}${b.startTime ? ` jam ${b.startTime}` : ""}`);
            const ids: string[] = [];
            for (const date of dates) {
              const [r] = await tx
                .insert(ts)
                .values({
                  ssbId: m.ssbId,
                  ageGroupId: b.ageGroupId,
                  sessionDate: date,
                  startTime: b.startTime ?? null,
                  locationId: b.locationId ?? null,
                  periodId: await periodFor(tx, date),
                })
                .returning({ id: ts.id });
              ids.push(r!.id);
            }
            return query(tx, inArray(ts.id, ids));
          });
          return c.json(created, 201);
        } catch (e) {
          if (isFk(e)) throw new HttpError(422, "reference_invalid", "KU atau lokasi tidak ditemukan di SSB ini");
          throw e;
        }
      })

      .patch("/sessions/:id", requirePermission("session.manage"), zv("json", sessionInputSchema), async (c) => {
        const m = member(c);
        const id = sessionId(c.req.param("id"));
        const b = c.req.valid("json");
        try {
          const out = await withTenant(db, m.ssbId, async (tx) => {
            const [cur] = await tx.select().from(ts).where(eq(ts.id, id)).for("update").limit(1);
            if (!cur) return null;
            if (cur.ageGroupId !== b.ageGroupId) {
              const [a] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.attendance).where(eq(schema.attendance.sessionId, id));
              if ((a?.n ?? 0) > 0) throw new HttpError(409, "has_attendance", "Sesi ini sudah punya absensi, jadi KU-nya tidak bisa diganti");
            }
            await tx
              .update(ts)
              .set({
                ageGroupId: b.ageGroupId,
                sessionDate: b.sessionDate,
                startTime: b.startTime ?? null,
                locationId: b.locationId ?? null,
                periodId: await periodFor(tx, b.sessionDate),
              })
              .where(eq(ts.id, id));
            return (await query(tx, eq(ts.id, id)))[0]!;
          });
          if (!out) throw notFound();
          return c.json(out);
        } catch (e) {
          if (isFk(e)) throw new HttpError(422, "reference_invalid", "KU atau lokasi tidak ditemukan di SSB ini");
          throw e;
        }
      })

      .delete("/sessions/:id", requirePermission("session.manage"), async (c) => {
        const m = member(c);
        const id = sessionId(c.req.param("id"));
        await withTenant(db, m.ssbId, async (tx) => {
          const [a] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.attendance).where(eq(schema.attendance.sessionId, id));
          if ((a?.n ?? 0) > 0) throw new HttpError(409, "has_attendance", "Sesi ini sudah punya absensi dan tidak bisa dihapus");
          const rows = await tx.delete(ts).where(eq(ts.id, id)).returning({ id: ts.id });
          if (rows.length === 0) throw notFound();
        });
        return c.body(null, 204);
      })

      // Rekap kehadiran per siswa. Siswa yang terlihat mengikuti aturan daftar siswa
      // (pelatih/korlas: KU ditugaskan; orang tua: anaknya). Persentase = hadir / sesi tercatat.
      .get("/attendance/summary", requirePermission("attendance.read"), async (c) => {
        const m = member(c);
        const periodId = c.req.query("periodId");
        const ku = c.req.query("ageGroupId");
        for (const v of [periodId, ku]) if (v && !UUID.test(v)) throw new HttpError(400, "bad_request", "Id periode atau KU tidak valid");
        const out = await withTenant(db, m.ssbId, async (tx): Promise<AttendanceSummary> => {
          const inScope = and(periodId ? eq(ts.periodId, periodId) : undefined, ku ? eq(ts.ageGroupId, ku) : undefined);
          const players = await tx
            .select({
              id: schema.player.id,
              fullName: schema.player.fullName,
              memberNo: schema.player.memberNo,
              status: schema.player.status,
              kuId: schema.ageGroup.id,
              kuName: schema.ageGroup.name,
            })
            .from(schema.player)
            .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)))
            .where(and(playersVisibleTo(m), ku ? eq(schema.player.ageGroupId, ku) : undefined))
            .orderBy(asc(schema.player.fullName))
            .limit(500);
          const ids = players.map((p) => p.id);
          const counts = ids.length
            ? await tx
                .select({ playerId: schema.attendance.playerId, status: schema.attendance.status, n: sql<number>`count(*)::int` })
                .from(schema.attendance)
                .innerJoin(ts, and(eq(ts.ssbId, schema.attendance.ssbId), eq(ts.id, schema.attendance.sessionId)))
                .where(and(inArray(schema.attendance.playerId, ids), inScope))
                .groupBy(schema.attendance.playerId, schema.attendance.status)
            : [];
          const [held] = await tx
            .select({ n: sql<number>`count(distinct ${ts.id})::int` })
            .from(ts)
            .where(
              and(
                inScope,
                sql`exists (select 1 from attendance a where a.session_id = ${ts.id})`,
                m.role === "admin_ssb"
                  ? undefined
                  : inArray(ts.ageGroupId, [...new Set(players.map((p) => p.kuId))].concat("00000000-0000-0000-0000-000000000000")),
              ),
            );
          const [period] = periodId
            ? await tx.select({ id: schema.period.id, name: schema.period.name }).from(schema.period).where(eq(schema.period.id, periodId)).limit(1)
            : [];
          const [group] = ku
            ? await tx.select({ id: schema.ageGroup.id, name: schema.ageGroup.name }).from(schema.ageGroup).where(eq(schema.ageGroup.id, ku)).limit(1)
            : [];
          if ((periodId && !period) || (ku && !group)) throw new HttpError(404, "not_found", "Periode atau KU tidak ditemukan");
          const rows = players
            .map((p) => {
              const t = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
              for (const x of counts) if (x.playerId === p.id) t[x.status] = x.n;
              const recorded = t.hadir + t.izin + t.sakit + t.alpa;
              return {
                playerId: p.id,
                fullName: p.fullName,
                memberNo: p.memberNo,
                status: p.status,
                ageGroup: { id: p.kuId, name: p.kuName },
                ...t,
                recorded,
                percent: recorded ? Math.round((t.hadir / recorded) * 1000) / 10 : null,
              };
            })
            // Siswa tidak aktif hanya tampil bila punya catatan pada rentang ini.
            .filter((r) => r.status === "aktif" || r.recorded > 0);
          return { period: period ?? null, ageGroup: group ?? null, sessionsHeld: held?.n ?? 0, players: rows };
        });
        return c.json(out);
      })

      // Portal orang tua: jadwal KU anak sendiri + status anak. Tidak membuka daftar siswa lain.
      .get("/guardian/sessions", requirePermission("guardian.sessions"), async (c) => {
        const m = member(c);
        const from = c.req.query("from") ?? addDays(new Date().toISOString().slice(0, 10), -30);
        const to = c.req.query("to") ?? addDays(new Date().toISOString().slice(0, 10), 30);
        if (!ISO.test(from) || !ISO.test(to)) throw new HttpError(400, "bad_request", "Tanggal harus berformat YYYY-MM-DD");
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select({
              sessionId: ts.id,
              sessionDate: ts.sessionDate,
              startTime: ts.startTime,
              kuId: schema.ageGroup.id,
              kuName: schema.ageGroup.name,
              locId: schema.location.id,
              locName: schema.location.name,
              playerId: schema.player.id,
              playerName: schema.player.fullName,
              status: schema.attendance.status,
            })
            .from(schema.playerGuardian)
            .innerJoin(schema.player, and(eq(schema.player.ssbId, schema.playerGuardian.ssbId), eq(schema.player.id, schema.playerGuardian.playerId)))
            .innerJoin(ts, and(eq(ts.ssbId, schema.player.ssbId), eq(ts.ageGroupId, schema.player.ageGroupId)))
            .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, ts.ssbId), eq(schema.ageGroup.id, ts.ageGroupId)))
            .leftJoin(schema.location, and(eq(schema.location.ssbId, ts.ssbId), eq(schema.location.id, ts.locationId)))
            .leftJoin(schema.attendance, and(eq(schema.attendance.sessionId, ts.id), eq(schema.attendance.playerId, schema.player.id)))
            .where(and(eq(schema.playerGuardian.userId, m.userId), gte(ts.sessionDate, from), lte(ts.sessionDate, to)))
            .orderBy(asc(ts.sessionDate), asc(ts.startTime), asc(schema.player.fullName))
            .limit(300),
        );
        const out: GuardianSession[] = rows.map((r) => ({
          sessionId: r.sessionId,
          sessionDate: r.sessionDate,
          startTime: r.startTime ? r.startTime.slice(0, 5) : null,
          ageGroup: { id: r.kuId, name: r.kuName },
          location: r.locId ? { id: r.locId, name: r.locName! } : null,
          playerId: r.playerId,
          playerName: r.playerName,
          status: r.status ?? null,
        }));
        return c.json(out);
      })

      // ---- Absensi ----
      .get("/sessions/:id/attendance", requirePermission("attendance.read"), async (c) => {
        const m = member(c);
        const id = sessionId(c.req.param("id"));
        const roster = await withTenant(db, m.ssbId, (tx) => rosterOf(tx, m, id));
        if (!roster) throw notFound();
        return c.json(roster);
      })

      // Absensi massal: satu permintaan untuk satu KU; boleh diulang untuk mengoreksi.
      .put("/sessions/:id/attendance", requirePermission("attendance.record"), zv("json", attendanceInputSchema), async (c) => {
        const m = member(c);
        const id = sessionId(c.req.param("id"));
        const { entries } = c.req.valid("json");
        const roster = await withTenant(db, m.ssbId, async (tx) => {
          const cur = await rosterOf(tx, m, id);
          if (!cur) throw notFound();
          if (!notFuture(cur.session.sessionDate)) throw new HttpError(422, "session_not_started", "Sesi ini belum berlangsung, absensi belum bisa diisi");
          const ids = entries.map((e) => e.playerId);
          if (new Set(ids).size !== ids.length) throw new HttpError(422, "duplicate_player", "Satu siswa hanya boleh muncul sekali");
          const inGroup = await tx
            .select({ id: schema.player.id })
            .from(schema.player)
            .where(and(eq(schema.player.ageGroupId, cur.session.ageGroup.id), inArray(schema.player.id, ids)));
          if (inGroup.length !== ids.length) throw new HttpError(422, "player_not_in_group", "Ada siswa yang bukan anggota KU sesi ini");
          for (const e of entries) {
            await tx
              .insert(schema.attendance)
              .values({ ssbId: m.ssbId, sessionId: id, playerId: e.playerId, status: e.status, note: e.note || null, recordedBy: m.userId })
              .onConflictDoUpdate({
                target: [schema.attendance.sessionId, schema.attendance.playerId],
                set: { status: e.status, note: e.note || null, recordedBy: m.userId, recordedAt: sql`now()` },
              });
          }
          return (await rosterOf(tx, m, id))!;
        });
        return c.json(roster);
      })
  );
}
