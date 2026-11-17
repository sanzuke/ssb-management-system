import { Hono } from "hono";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { absenceRequestInputSchema, type AbsenceKind, type GuardianAbsenceRequest, type SessionAbsenceRequest } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { todayWib } from "./fees";
import { tanggalId, type Notifier } from "./push";
import { visibleTo as sessionsVisibleTo } from "./sessions";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const A = schema.absenceRequest;
const ts = schema.trainingSession;
/** Pengajuan yang masih tampil di portal orang tua: sesi sampai sebulan ke belakang. */
const HISTORY_DAYS = 30;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const sessionPast = () => new HttpError(422, "session_past", "Sesi ini sudah lewat, pengajuan tidak bisa diubah");

/** Satu pengajuan beserta sesi, KU, dan siswanya; pemanggil menambahkan syarat sendiri. */
const rows = (tx: Tx) =>
  tx
    .select({
      id: A.id,
      sessionId: A.sessionId,
      sessionDate: ts.sessionDate,
      startTime: ts.startTime,
      kuId: schema.ageGroup.id,
      kuName: schema.ageGroup.name,
      playerId: A.playerId,
      playerName: schema.player.fullName,
      kind: A.kind,
      note: A.note,
      createdAt: A.createdAt,
    })
    .from(A)
    .innerJoin(ts, and(eq(ts.ssbId, A.ssbId), eq(ts.id, A.sessionId)))
    .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, ts.ssbId), eq(schema.ageGroup.id, ts.ageGroupId)))
    .innerJoin(schema.player, and(eq(schema.player.ssbId, A.ssbId), eq(schema.player.id, A.playerId)));

interface Row {
  id: string;
  sessionId: string;
  sessionDate: string;
  startTime: string | null;
  kuId: string;
  kuName: string;
  playerId: string;
  playerName: string;
  kind: AbsenceKind;
  note: string | null;
  createdAt: Date;
}

const loadOne = async (tx: Tx, id: string): Promise<Row> => (await rows(tx).where(eq(A.id, id)).limit(1))[0]!;

const forGuardian = (r: Row): GuardianAbsenceRequest => ({
  id: r.id,
  sessionId: r.sessionId,
  sessionDate: r.sessionDate,
  startTime: r.startTime ? r.startTime.slice(0, 5) : null,
  ageGroup: { id: r.kuId, name: r.kuName },
  playerId: r.playerId,
  playerName: r.playerName,
  kind: r.kind,
  note: r.note,
  createdAt: r.createdAt.toISOString(),
});

/** Orang tua mengajukan izin atau sakit untuk latihan anaknya; pelatih membacanya saat mengisi absensi (absensi tetap dicatat pelatih). */
export function absenceRequestRoutes(db: Db, opts: { notifier: Notifier }) {
  const member = (c: { get: (k: "auth") => any }) => c.get("auth")!.member as Member;
  const isChildOf = (m: Member) => sql`exists (select 1 from player_guardian pg where pg.player_id = ${A.playerId} and pg.user_id = ${m.userId})`;

  return new Hono<AppEnv>()
    // Satu pengajuan per (sesi, siswa): mengajukan lagi memperbarui jenis dan catatannya.
    .post("/guardian/absence-requests", requirePermission("absence.request"), zv("json", absenceRequestInputSchema), async (c) => {
      const m = member(c);
      const b = c.req.valid("json");
      const out = await withTenant(db, m.ssbId, async (tx) => {
        // Anak orang lain dijawab 404 seperti rute siswa lain, supaya keberadaannya tidak bocor.
        const [child] = await tx
          .select({ id: schema.player.id, name: schema.player.fullName, ageGroupId: schema.player.ageGroupId })
          .from(schema.playerGuardian)
          .innerJoin(schema.player, and(eq(schema.player.ssbId, schema.playerGuardian.ssbId), eq(schema.player.id, schema.playerGuardian.playerId)))
          .where(and(eq(schema.playerGuardian.userId, m.userId), eq(schema.playerGuardian.playerId, b.playerId)))
          .limit(1);
        if (!child) throw new HttpError(404, "not_found", "Siswa tidak ditemukan");
        const [s] = await tx.select({ id: ts.id, ageGroupId: ts.ageGroupId, sessionDate: ts.sessionDate }).from(ts).where(eq(ts.id, b.sessionId)).limit(1);
        if (!s) throw new HttpError(404, "not_found", "Sesi tidak ditemukan");
        if (s.ageGroupId !== child.ageGroupId) throw new HttpError(422, "session_not_for_player", "Sesi ini bukan untuk KU anak Anda");
        if (s.sessionDate < todayWib()) throw sessionPast();
        const [saved] = await tx
          .insert(A)
          .values({ ssbId: m.ssbId, sessionId: b.sessionId, playerId: b.playerId, kind: b.kind, note: b.note ?? null, createdBy: m.userId })
          .onConflictDoUpdate({
            target: [A.sessionId, A.playerId],
            set: { kind: b.kind, note: b.note ?? null, createdBy: m.userId, updatedAt: sql`now()` },
          })
          .returning({ id: A.id });
        return { row: await loadOne(tx, saved!.id), playerName: child.name };
      });
      opts.notifier.toCoachesOfSession(m.ssbId, out.row.sessionId, () => ({
        type: "absence_request",
        title: `Pengajuan ${out.row.kind} latihan`,
        body: `${out.playerName} ${out.row.kind} pada ${tanggalId(out.row.sessionDate)}${out.row.note ? `: ${out.row.note}` : ""}`,
        route: `/absensi/${out.row.sessionId}`,
      }));
      return c.json(forGuardian(out.row), 201);
    })

    // Pengajuan anak sendiri, sesi terbaru dulu, dari sebulan ke belakang.
    .get("/guardian/absence-requests", requirePermission("absence.request"), async (c) => {
      const m = member(c);
      const list = await withTenant(db, m.ssbId, (tx) =>
        rows(tx)
          .where(and(isChildOf(m), gte(ts.sessionDate, addDays(todayWib(), -HISTORY_DAYS))))
          .orderBy(desc(ts.sessionDate), desc(ts.startTime), asc(schema.player.fullName))
          .limit(300),
      );
      return c.json(list.map(forGuardian));
    })

    // Menarik pengajuan selama sesinya belum lewat.
    .delete("/guardian/absence-requests/:id", requirePermission("absence.request"), async (c) => {
      const m = member(c);
      const id = c.req.param("id");
      if (!UUID.test(id)) throw new HttpError(404, "not_found", "Pengajuan tidak ditemukan");
      await withTenant(db, m.ssbId, async (tx) => {
        const [r] = await rows(tx)
          .where(and(eq(A.id, id), isChildOf(m)))
          .limit(1);
        if (!r) throw new HttpError(404, "not_found", "Pengajuan tidak ditemukan");
        if (r.sessionDate < todayWib()) throw sessionPast();
        await tx.delete(A).where(eq(A.id, id));
      });
      return c.json({ ok: true });
    })

    // Untuk pelatih: pengajuan pada satu sesi. Sesi di luar jangkauan pelatih dijawab 404, sama dengan absensi.
    .get("/sessions/:id/absence-requests", requirePermission("attendance.record"), async (c) => {
      const m = member(c);
      const id = c.req.param("id");
      if (!UUID.test(id)) throw new HttpError(404, "not_found", "Sesi tidak ditemukan");
      const list = await withTenant(db, m.ssbId, async (tx): Promise<SessionAbsenceRequest[] | null> => {
        const [s] = await tx
          .select({ id: ts.id })
          .from(ts)
          .where(and(eq(ts.id, id), sessionsVisibleTo(m)))
          .limit(1);
        if (!s) return null;
        const found = await rows(tx).where(eq(A.sessionId, id)).orderBy(asc(schema.player.fullName));
        return found.map((r) => ({ id: r.id, playerId: r.playerId, playerName: r.playerName, kind: r.kind, note: r.note, createdAt: r.createdAt.toISOString() }));
      });
      if (!list) throw new HttpError(404, "not_found", "Sesi tidak ditemukan");
      return c.json(list);
    });
}
