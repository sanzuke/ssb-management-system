import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  hitungMvi,
  matchStatInputSchema,
  METRIK_FISIK,
  MVI_COMPONENTS,
  MVI_LABEL,
  MVI_MIN_ATTENDANCE,
  MVI_MIN_MATCHES,
  MVI_MIN_PEERS,
  MVI_TEST_MAX_AGE_DAYS,
  MVI_WEIGHTS,
  mviComputeSchema,
  physicalTestInputSchema,
  skorFisik,
  skorKehadiran,
  skorPenilaian,
  skorPerforma,
  skorUsia,
  type HasilTes,
  type MatchStatRow,
  type MviCategory,
  type MviComponent,
  type MviComponentRow,
  type MviGuardianResult,
  type MviPlayerView,
  type MviRanking,
  type MviResult,
  type PhysicalTestRow,
  type Position,
  type PosisiMvi,
  type SkorKomponen,
} from "@ssb/shared";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { HttpError } from "./errors";
import { todayWib } from "./fees";
import { visibleTo } from "./players";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const idOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};

const P = schema.player;
const M = schema.playerMarketValue;
const MS = schema.playerMatchStat;
const T = schema.playerPhysicalTest;
const DAY = 86_400_000;
const angka = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** Nama constraint dari galat Postgres (langsung atau di `cause` galat Drizzle). */
function constraintOf(e: unknown): string | undefined {
  const err = e && typeof e === "object" && "cause" in e && e.cause && typeof e.cause === "object" ? e.cause : e;
  return err && typeof err === "object" && "constraint_name" in err && typeof err.constraint_name === "string" ? err.constraint_name : undefined;
}

/** Siswa yang boleh dilihat pemanggil (admin semua; pelatih dan korlas KU yang ditugaskan; orang tua anaknya), atau 404. */
async function visiblePlayer(tx: Tx, m: Member, playerId: string) {
  const [row] = await tx.select({ id: P.id, position: P.position, birthDate: P.birthDate, ageGroupId: P.ageGroupId }).from(P).where(and(eq(P.id, playerId), visibleTo(m))).limit(1);
  if (!row) throw notFound("Siswa");
  return row;
}

async function periodOr404(tx: Tx, id: string) {
  const [row] = await tx.select({ id: schema.period.id, name: schema.period.name, startDate: schema.period.startDate, endDate: schema.period.endDate }).from(schema.period).where(eq(schema.period.id, id)).limit(1);
  if (!row) throw notFound("Periode");
  return row;
}

/**
 * Menghitung ulang indeks seluruh siswa aktif satu KU (yang boleh dilihat pemanggil) pada satu periode, lalu menyimpannya.
 * Satu KU sekaligus karena kebugaran dan usia dinilai relatif terhadap teman satu KU.
 */
async function computeGroup(tx: Tx, m: Member, ageGroupId: string, periodId: string): Promise<number> {
  const period = await periodOr404(tx, periodId);
  const [group] = await tx.select({ id: schema.ageGroup.id, minAge: schema.ageGroup.minAge, maxAge: schema.ageGroup.maxAge }).from(schema.ageGroup).where(eq(schema.ageGroup.id, ageGroupId)).limit(1);
  if (!group) throw notFound("KU");

  const players = await tx
    .select({ id: P.id, position: P.position, birthDate: P.birthDate })
    .from(P)
    .where(and(eq(P.ageGroupId, ageGroupId), eq(P.status, "aktif"), visibleTo(m)));
  if (players.length === 0) return 0;
  const ids = players.map((p) => p.id);

  // Penilaian pelatih: rata-rata skor indikator pada periode ini.
  const A = schema.assessment;
  const S = schema.assessmentScore;
  const nilai = new Map(
    (
      await tx
        .select({ playerId: A.playerId, rata: sql<string>`avg(${S.score})`, n: sql<number>`count(*)::int`, terbit: sql<boolean>`bool_and(${A.publishedAt} is not null)` })
        .from(S)
        .innerJoin(A, and(eq(A.ssbId, S.ssbId), eq(A.id, S.assessmentId)))
        .where(and(eq(A.periodId, periodId), inArray(A.playerId, ids)))
        .groupBy(A.playerId)
    ).map((r) => [r.playerId, { rata: Number(r.rata), n: r.n, terbit: r.terbit }]),
  );

  // Kehadiran: sesi pada periode ini yang punya catatan; semua status yang tercatat dihitung.
  const AT = schema.attendance;
  const TS = schema.trainingSession;
  const hadir = new Map(
    (
      await tx
        .select({ playerId: AT.playerId, hadir: sql<number>`count(*) filter (where ${AT.status} = 'hadir')::int`, tercatat: sql<number>`count(*)::int` })
        .from(AT)
        .innerJoin(TS, and(eq(TS.ssbId, AT.ssbId), eq(TS.id, AT.sessionId)))
        .where(and(eq(TS.periodId, periodId), inArray(AT.playerId, ids)))
        .groupBy(AT.playerId)
    ).map((r) => [r.playerId, r]),
  );

  const stats = new Map((await tx.select().from(MS).where(and(eq(MS.periodId, periodId), inArray(MS.playerId, ids)))).map((r) => [r.playerId, r]));

  // Tes kebugaran terbaru per siswa, tidak lebih lama dari 12 bulan sebelum akhir periode dan tidak setelahnya.
  const batasAwal = new Date(Date.parse(`${period.endDate}T00:00:00Z`) - MVI_TEST_MAX_AGE_DAYS * DAY).toISOString().slice(0, 10);
  const tesTerbaru = new Map(
    (
      await tx
        .selectDistinctOn([T.playerId], { playerId: T.playerId, testedOn: T.testedOn, speed30m: T.speed30m, zigZag: T.zigZag, verticalJump: T.verticalJump, bleepLevel: T.bleepLevel })
        .from(T)
        .where(and(inArray(T.playerId, ids), gte(T.testedOn, batasAwal), lte(T.testedOn, period.endDate)))
        .orderBy(T.playerId, desc(T.testedOn))
    ).map((r) => [r.playerId, r]),
  );
  const teman: HasilTes[] = [...tesTerbaru.values()].map((t) => ({ speed30m: t.speed30m, zigZag: t.zigZag, verticalJump: t.verticalJump, bleepLevel: t.bleepLevel }));

  const acuan = period.endDate < todayWib() ? period.endDate : todayWib();
  const hasil = players.map((p) => {
    const usiaTahun = (Date.parse(`${acuan}T00:00:00Z`) - Date.parse(`${p.birthDate}T00:00:00Z`)) / (365.2425 * DAY);
    const n = nilai.get(p.id);
    const h = hadir.get(p.id);
    const st = stats.get(p.id);
    const tes = tesTerbaru.get(p.id);
    const posisi: PosisiMvi = p.position ?? null;

    const skor: SkorKomponen = {
      penilaian: n ? skorPenilaian(n.rata) : null,
      performa: st ? skorPerforma(st, posisi) : null,
      fisik: tes ? skorFisik({ speed30m: tes.speed30m, zigZag: tes.zigZag, verticalJump: tes.verticalJump, bleepLevel: tes.bleepLevel }, teman) : null,
      kehadiran: h ? skorKehadiran(h.hadir, h.tercatat) : null,
      usia: skorUsia(usiaTahun, group.minAge, group.maxAge),
    };

    const keterangan: Record<MviComponent, string> = {
      penilaian: n ? `Rata-rata skor indikator ${angka(n.rata)} dari 10 (${n.n} indikator${n.terbit ? "" : ", belum terbit ke orang tua"})` : "Belum ada penilaian pada periode ini",
      performa: !st
        ? "Belum ada statistik laga pada periode ini"
        : st.matchesPlayed < MVI_MIN_MATCHES
          ? `Baru ${st.matchesPlayed} laga; butuh minimal ${MVI_MIN_MATCHES}`
          : `${st.matchesPlayed} laga, ${st.goals} gol, ${st.assists} assist, ${st.starts} starter${posisi ? "" : "; posisi belum diisi, gol dan assist tidak dihitung"}`,
      fisik: !tes
        ? `Belum ada tes dalam ${Math.round(MVI_TEST_MAX_AGE_DAYS / 30)} bulan sebelum akhir periode`
        : skor.fisik === null
          ? `Tes ${tes.testedOn} ada, tetapi teman satu KU yang punya hasil sama kurang dari ${MVI_MIN_PEERS}`
          : `Tes ${tes.testedOn}, dibanding teman satu KU: ${METRIK_FISIK.filter((x) => tes[x.key] !== null).map((x) => `${x.label.toLowerCase()} ${angka(tes[x.key]!)} ${x.satuan}`).join(", ")}`,
      kehadiran: !h ? "Belum ada catatan kehadiran pada periode ini" : h.tercatat < MVI_MIN_ATTENDANCE ? `Baru ${h.tercatat} sesi tercatat; butuh minimal ${MVI_MIN_ATTENDANCE}` : `Hadir ${h.hadir} dari ${h.tercatat} sesi`,
      usia: `${angka(usiaTahun)} tahun pada akhir periode; KU ${group.minAge} sampai ${group.maxAge} tahun (lebih muda dalam KU = lebih tinggi)`,
    };
    const komponen: MviComponentRow[] = MVI_COMPONENTS.map((key) => ({ key, label: MVI_LABEL[key], weight: MVI_WEIGHTS[key], score: skor[key], detail: keterangan[key] }));
    return { playerId: p.id, komponen, ...hitungMvi(skor) };
  });

  await tx
    .insert(M)
    .values(
      hasil.map((h) => ({
        ssbId: m.ssbId,
        playerId: h.playerId,
        periodId,
        ageGroupId,
        mvi: h.indeks,
        category: h.kategori,
        coverage: h.cakupan,
        breakdown: h.komponen,
        computedBy: m.userId,
        computedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [M.ssbId, M.playerId, M.periodId],
      set: {
        ageGroupId: sql`excluded.age_group_id`,
        mvi: sql`excluded.mvi`,
        category: sql`excluded.category`,
        coverage: sql`excluded.coverage`,
        breakdown: sql`excluded.breakdown`,
        computedBy: sql`excluded.computed_by`,
        computedAt: sql`excluded.computed_at`,
      },
    });
  return hasil.length;
}

async function ranking(tx: Tx, m: Member, ageGroupId: string, periodId: string): Promise<MviRanking> {
  const period = await periodOr404(tx, periodId);
  const [group] = await tx.select({ id: schema.ageGroup.id, name: schema.ageGroup.name }).from(schema.ageGroup).where(eq(schema.ageGroup.id, ageGroupId)).limit(1);
  if (!group) throw notFound("KU");
  const rows = await tx
    .select({
      playerId: P.id,
      fullName: P.fullName,
      position: P.position,
      mvi: M.mvi,
      category: M.category,
      coverage: M.coverage,
      breakdown: M.breakdown,
      computedAt: M.computedAt,
    })
    .from(P)
    .leftJoin(M, and(eq(M.ssbId, P.ssbId), eq(M.playerId, P.id), eq(M.periodId, periodId)))
    .where(and(eq(P.ageGroupId, ageGroupId), eq(P.status, "aktif"), visibleTo(m)))
    .orderBy(asc(P.fullName));
  const out = rows
    .map((r) => ({
      playerId: r.playerId,
      fullName: r.fullName,
      position: (r.position ?? null) as Position | null,
      mvi: r.mvi,
      category: (r.category ?? null) as MviCategory | null,
      coverage: r.coverage ?? 0,
      kurang: r.breakdown ? (r.breakdown as MviComponentRow[]).filter((c) => c.score === null).map((c) => c.key) : [...MVI_COMPONENTS],
      computedAt: r.computedAt ? r.computedAt.toISOString() : null,
    }))
    .sort((a, b) => (b.mvi ?? -1) - (a.mvi ?? -1) || a.fullName.localeCompare(b.fullName, "id"));
  return { ageGroup: { id: group.id, name: group.name }, period: { id: period.id, name: period.name }, rows: out };
}

const toMatchStat = (r: typeof MS.$inferSelect): MatchStatRow => ({
  periodId: r.periodId,
  matchesPlayed: r.matchesPlayed,
  goals: r.goals,
  assists: r.assists,
  starts: r.starts,
  yellowCards: r.yellowCards,
  redCards: r.redCards,
  updatedAt: r.updatedAt.toISOString(),
});
const toTest = (r: typeof T.$inferSelect): PhysicalTestRow => ({
  id: r.id,
  testedOn: r.testedOn,
  speed30m: r.speed30m,
  zigZag: r.zigZag,
  verticalJump: r.verticalJump,
  bleepLevel: r.bleepLevel,
  note: r.note,
});

/**
 * Indeks nilai siswa (MVI): input statistik laga dan tes kebugaran oleh pelatih, perhitungan per KU dan periode, dan pembacaan.
 * Orang tua hanya menerima kategori anaknya sendiri untuk periode yang penilaiannya sudah terbit; angka dan rincian untuk staf.
 */
export function marketValueRoutes(db: Db) {
  const member = (c: { get: (k: "auth") => { member?: Member } | undefined }) => c.get("auth")!.member!;

  return (
    new Hono<AppEnv>()
      // Hitung ulang satu KU pada satu periode, lalu kembalikan peringkatnya.
      .post("/market-value/compute", requirePermission("mvi.write"), zv("json", mviComputeSchema), async (c) => {
        const m = member(c);
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await computeGroup(tx, m, b.ageGroupId, b.periodId);
          return ranking(tx, m, b.ageGroupId, b.periodId);
        });
        return c.json(out);
      })

      .get("/market-value", requirePermission("squad.read"), zv("query", mviComputeSchema), async (c) => {
        const m = member(c);
        const q = c.req.valid("query");
        return c.json(await withTenant(db, m.ssbId, (tx) => ranking(tx, m, q.ageGroupId, q.periodId)));
      })

      .get("/players/:playerId/market-value", requirePermission("mvi.read"), async (c) => {
        const m = member(c);
        const playerId = idOr404(c.req.param("playerId"), "Siswa");
        const view = await withTenant(db, m.ssbId, async (tx): Promise<MviPlayerView> => {
          await visiblePlayer(tx, m, playerId);
          const rows = await tx
            .select({
              periodId: schema.period.id,
              periodName: schema.period.name,
              groupId: schema.ageGroup.id,
              groupName: schema.ageGroup.name,
              mvi: M.mvi,
              category: M.category,
              coverage: M.coverage,
              breakdown: M.breakdown,
              computedAt: M.computedAt,
              terbit: sql<boolean>`exists (select 1 from assessment a where a.player_id = ${M.playerId} and a.period_id = ${M.periodId} and a.published_at is not null)`,
            })
            .from(M)
            .innerJoin(schema.period, and(eq(schema.period.ssbId, M.ssbId), eq(schema.period.id, M.periodId)))
            .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, M.ssbId), eq(schema.ageGroup.id, M.ageGroupId)))
            .where(eq(M.playerId, playerId))
            .orderBy(desc(schema.period.startDate));
          if (m.role === "orang_tua") {
            const items: MviGuardianResult[] = rows
              .filter((r) => r.terbit && r.category !== null)
              .map((r) => ({ period: { id: r.periodId, name: r.periodName }, category: r.category as MviCategory }));
            return { role: "guardian", items };
          }
          const items: MviResult[] = rows.map((r) => ({
            period: { id: r.periodId, name: r.periodName },
            ageGroup: { id: r.groupId, name: r.groupName },
            mvi: r.mvi,
            category: (r.category ?? null) as MviCategory | null,
            coverage: r.coverage,
            components: r.breakdown as MviComponentRow[],
            computedAt: r.computedAt.toISOString(),
          }));
          return { role: "staff", items };
        });
        return c.json(view);
      })

      .get("/players/:playerId/match-stats", requirePermission("squad.read"), async (c) => {
        const m = member(c);
        const playerId = idOr404(c.req.param("playerId"), "Siswa");
        const rows = await withTenant(db, m.ssbId, async (tx) => {
          await visiblePlayer(tx, m, playerId);
          return tx.select().from(MS).where(eq(MS.playerId, playerId));
        });
        return c.json(rows.map(toMatchStat));
      })

      .put("/players/:playerId/match-stats/:periodId", requirePermission("mvi.write"), zv("json", matchStatInputSchema), async (c) => {
        const m = member(c);
        const playerId = idOr404(c.req.param("playerId"), "Siswa");
        const periodId = idOr404(c.req.param("periodId"), "Periode");
        const b = c.req.valid("json");
        const row = await withTenant(db, m.ssbId, async (tx) => {
          await visiblePlayer(tx, m, playerId);
          await periodOr404(tx, periodId);
          const [r] = await tx
            .insert(MS)
            .values({ ssbId: m.ssbId, playerId, periodId, ...b, recordedBy: m.userId })
            .onConflictDoUpdate({ target: [MS.ssbId, MS.playerId, MS.periodId], set: { ...b, recordedBy: m.userId, updatedAt: new Date() } })
            .returning();
          return r;
        });
        if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan statistik laga");
        return c.json(toMatchStat(row));
      })

      .get("/players/:playerId/physical-tests", requirePermission("squad.read"), async (c) => {
        const m = member(c);
        const playerId = idOr404(c.req.param("playerId"), "Siswa");
        const rows = await withTenant(db, m.ssbId, async (tx) => {
          await visiblePlayer(tx, m, playerId);
          return tx.select().from(T).where(eq(T.playerId, playerId)).orderBy(desc(T.testedOn));
        });
        return c.json(rows.map(toTest));
      })

      .post("/players/:playerId/physical-tests", requirePermission("mvi.write"), zv("json", physicalTestInputSchema), async (c) => {
        const m = member(c);
        const playerId = idOr404(c.req.param("playerId"), "Siswa");
        const b = c.req.valid("json");
        try {
          const row = await withTenant(db, m.ssbId, async (tx) => {
            await visiblePlayer(tx, m, playerId);
            const [r] = await tx
              .insert(T)
              .values({
                ssbId: m.ssbId,
                playerId,
                testedOn: b.testedOn,
                speed30m: b.speed30m ?? null,
                zigZag: b.zigZag ?? null,
                verticalJump: b.verticalJump ?? null,
                bleepLevel: b.bleepLevel ?? null,
                note: b.note ?? null,
                recordedBy: m.userId,
              })
              .returning();
            return r;
          });
          if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan hasil tes");
          return c.json(toTest(row), 201);
        } catch (e) {
          if (constraintOf(e) === "player_physical_test_player_day") {
            throw new HttpError(409, "duplicate", "Siswa ini sudah punya hasil tes pada tanggal itu", { testedOn: "sudah ada hasil tes pada tanggal ini" });
          }
          throw e;
        }
      })

      .delete("/physical-tests/:id", requirePermission("mvi.write"), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Hasil tes");
        await withTenant(db, m.ssbId, async (tx) => {
          const [row] = await tx.select({ playerId: T.playerId }).from(T).where(eq(T.id, id)).limit(1);
          if (!row) throw notFound("Hasil tes");
          await visiblePlayer(tx, m, row.playerId).catch(() => {
            throw notFound("Hasil tes");
          });
          await tx.delete(T).where(eq(T.id, id));
        });
        return c.body(null, 204);
      })
  );
}
