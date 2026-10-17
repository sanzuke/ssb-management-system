import { Hono } from "hono";
import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { assignmentInputSchema, guardianInputSchema, playerFormSchema, playerStatusSchema, type PlayerDetail, type PlayerSummary } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { isUniqueViolation } from "./auth/service";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const uuidOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};
const isFk = (e: unknown) => (e as { code?: string })?.code === "23503" || (e as { cause?: { code?: string } })?.cause?.code === "23503";

/**
 * Batas data pemain per role. Admin melihat semua; pelatih dan korlas hanya pemain di KU yang
 * ditugaskan pada periode yang sedang berjalan; orang tua hanya anaknya. Selain ini, RLS membatasi ke SSB.
 */
export function visibleTo(m: Member): SQL | undefined {
  if (m.role === "admin_ssb") return undefined;
  if (m.role === "orang_tua") {
    return sql`${schema.player.id} in (select player_id from player_guardian where user_id = ${m.userId})`;
  }
  return sql`${schema.player.ageGroupId} in (
    select ca.age_group_id from coach_assignment ca join period p on p.id = ca.period_id
    where ca.user_id = ${m.userId} and current_date between p.start_date and p.end_date)`;
}

const playerCols = {
  id: schema.player.id,
  memberNo: schema.player.memberNo,
  fullName: schema.player.fullName,
  birthDate: schema.player.birthDate,
  position: schema.player.position,
  school: schema.player.school,
  status: schema.player.status,
  ageGroupId: schema.ageGroup.id,
  ageGroupName: schema.ageGroup.name,
};
const toSummary = (r: { id: string; memberNo: string | null; fullName: string; birthDate: string; position: any; school: string | null; status: any; ageGroupId: string | null; ageGroupName: string | null }): PlayerSummary => ({
  id: r.id,
  memberNo: r.memberNo,
  fullName: r.fullName,
  birthDate: r.birthDate,
  position: r.position,
  school: r.school,
  status: r.status,
  ageGroup: r.ageGroupId ? { id: r.ageGroupId, name: r.ageGroupName! } : null,
});

const selectPlayers = (tx: Tx) => tx.select(playerCols).from(schema.player).leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)));

async function ageGroupName(tx: Tx, id: string | null | undefined) {
  if (!id) return null;
  const [g] = await tx.select({ name: schema.ageGroup.name }).from(schema.ageGroup).where(eq(schema.ageGroup.id, id)).limit(1);
  return g?.name ?? null;
}

export function playerRoutes(db: Db) {
  const ctx = (c: { get: (k: "auth") => any }) => c.get("auth")!.member as Member;

  return new Hono<AppEnv>()
    .get("/players", requirePermission("player.read"), async (c) => {
      const m = ctx(c);
      const q = c.req.query("q")?.trim();
      const ku = c.req.query("ageGroupId");
      const st = c.req.query("status");
      if (st && !playerStatusSchema.safeParse(st).success) throw new HttpError(400, "bad_request", "Status tidak dikenal");
      const rows = await withTenant(db, m.ssbId, (tx) =>
        selectPlayers(tx)
          .where(
            and(
              visibleTo(m),
              q ? ilike(schema.player.fullName, `%${q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
              ku && UUID.test(ku) ? eq(schema.player.ageGroupId, ku) : ku ? sql`false` : undefined,
              st ? eq(schema.player.status, st as "aktif") : undefined,
            ),
          )
          .orderBy(asc(schema.player.fullName))
          .limit(500),
      );
      return c.json(rows.map(toSummary));
    })

    .get("/players/:id", requirePermission("player.read"), async (c) => {
      const m = ctx(c);
      const id = uuidOr404(c.req.param("id"), "Pemain");
      const detail = await withTenant(db, m.ssbId, async (tx): Promise<PlayerDetail | null> => {
        const [row] = await selectPlayers(tx).where(and(eq(schema.player.id, id), visibleTo(m))).limit(1);
        if (!row) return null;
        const out: PlayerDetail = { ...toSummary(row), history: [] };
        if (m.role !== "orang_tua") {
          const h = await tx.select().from(schema.playerHistory).where(eq(schema.playerHistory.playerId, id)).orderBy(desc(schema.playerHistory.changedAt));
          out.history = h.map((x) => ({ field: x.field as "age_group" | "status", from: x.fromValue, to: x.toValue, at: x.changedAt.toISOString() }));
        }
        if (m.role === "admin_ssb") {
          const g = await tx
            .select({ userId: schema.playerGuardian.userId, name: schema.appUser.name, relationship: schema.playerGuardian.relationship })
            .from(schema.playerGuardian)
            .innerJoin(schema.appUser, and(eq(schema.appUser.ssbId, schema.playerGuardian.ssbId), eq(schema.appUser.id, schema.playerGuardian.userId)))
            .where(eq(schema.playerGuardian.playerId, id));
          out.guardians = g;
        }
        return out;
      });
      if (!detail) throw notFound("Pemain"); // di luar batas role dijawab sama dengan tidak ada
      return c.json(detail);
    })

    .post("/players", requirePermission("player.write"), zv("json", playerFormSchema), async (c) => {
      const m = ctx(c);
      const b = c.req.valid("json");
      try {
        const id = await withTenant(db, m.ssbId, async (tx) => {
          // Nomor anggota: penghitung per SSB dinaikkan atomik, jadi unik walau dua pemain dibuat bersamaan.
          const [seq] = await tx.update(schema.ssb).set({ memberSeq: sql`${schema.ssb.memberSeq} + 1` }).where(eq(schema.ssb.id, m.ssbId)).returning({ n: schema.ssb.memberSeq });
          const [p] = await tx
            .insert(schema.player)
            .values({
              ssbId: m.ssbId,
              memberNo: `P${String(seq!.n).padStart(4, "0")}`,
              fullName: b.fullName,
              birthDate: b.birthDate,
              position: b.position ?? null,
              school: b.school || null,
              ageGroupId: b.ageGroupId ?? null,
              status: b.status,
            })
            .returning({ id: schema.player.id });
          return p!.id;
        });
        const [row] = await withTenant(db, m.ssbId, (tx) => selectPlayers(tx).where(eq(schema.player.id, id)).limit(1));
        return c.json(toSummary(row!), 201);
      } catch (e) {
        if (isFk(e)) throw new HttpError(422, "age_group_invalid", "KU tidak ditemukan di SSB ini");
        throw e;
      }
    })

    .patch("/players/:id", requirePermission("player.write"), zv("json", playerFormSchema), async (c) => {
      const m = ctx(c);
      const id = uuidOr404(c.req.param("id"), "Pemain");
      const b = c.req.valid("json");
      try {
        const found = await withTenant(db, m.ssbId, async (tx) => {
          const [cur] = await tx.select().from(schema.player).where(eq(schema.player.id, id)).for("update").limit(1);
          if (!cur) return false;
          const nextKu = b.ageGroupId ?? null;
          const log: { field: string; from: string | null; to: string | null }[] = [];
          if ((cur.ageGroupId ?? null) !== nextKu) {
            log.push({ field: "age_group", from: await ageGroupName(tx, cur.ageGroupId), to: await ageGroupName(tx, nextKu) });
          }
          if (cur.status !== b.status) log.push({ field: "status", from: cur.status, to: b.status });
          await tx
            .update(schema.player)
            .set({ fullName: b.fullName, birthDate: b.birthDate, position: b.position ?? null, school: b.school || null, ageGroupId: nextKu, status: b.status })
            .where(eq(schema.player.id, id));
          for (const l of log) await tx.insert(schema.playerHistory).values({ ssbId: m.ssbId, playerId: id, field: l.field, fromValue: l.from, toValue: l.to, changedBy: m.userId });
          return true;
        });
        if (!found) throw notFound("Pemain");
      } catch (e) {
        if (isFk(e)) throw new HttpError(422, "age_group_invalid", "KU tidak ditemukan di SSB ini");
        throw e;
      }
      const [row] = await withTenant(db, m.ssbId, (tx) => selectPlayers(tx).where(eq(schema.player.id, id)).limit(1));
      return c.json(toSummary(row!));
    })

    // ---- Orang tua pemain ----
    .post("/players/:id/guardians", requirePermission("player.write"), zv("json", guardianInputSchema), async (c) => {
      const m = ctx(c);
      const id = uuidOr404(c.req.param("id"), "Pemain");
      const b = c.req.valid("json");
      await withTenant(db, m.ssbId, async (tx) => {
        const [p] = await tx.select({ id: schema.player.id }).from(schema.player).where(eq(schema.player.id, id)).limit(1);
        if (!p) throw notFound("Pemain");
        const [u] = await tx.select({ role: schema.appUser.role }).from(schema.appUser).where(eq(schema.appUser.id, b.userId)).limit(1);
        if (!u) throw new HttpError(422, "member_invalid", "Anggota tidak ditemukan di SSB ini");
        if (u.role !== "orang_tua") throw new HttpError(422, "member_not_parent", "Hanya anggota ber-role orang tua yang bisa dihubungkan ke pemain");
        try {
          await tx.insert(schema.playerGuardian).values({ ssbId: m.ssbId, playerId: id, userId: b.userId, relationship: b.relationship ?? null });
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Orang tua ini sudah terhubung ke pemain");
          throw e;
        }
      });
      return c.body(null, 201);
    })
    .delete("/players/:id/guardians/:userId", requirePermission("player.write"), async (c) => {
      const m = ctx(c);
      const id = uuidOr404(c.req.param("id"), "Pemain");
      const userId = uuidOr404(c.req.param("userId"), "Orang tua");
      const rows = await withTenant(db, m.ssbId, (tx) =>
        tx.delete(schema.playerGuardian).where(and(eq(schema.playerGuardian.playerId, id), eq(schema.playerGuardian.userId, userId))).returning({ id: schema.playerGuardian.playerId }),
      );
      if (rows.length === 0) throw notFound("Hubungan orang tua");
      return c.body(null, 204);
    })

    // ---- Penugasan pelatih dan korlas ke KU per periode ----
    .get("/assignments", requirePermission("assignment.manage"), async (c) => {
      const m = ctx(c);
      const rows = await withTenant(db, m.ssbId, (tx) =>
        tx
          .select({
            userId: schema.coachAssignment.userId,
            userName: schema.appUser.name,
            role: schema.appUser.role,
            ageGroupId: schema.coachAssignment.ageGroupId,
            ageGroupName: schema.ageGroup.name,
            periodId: schema.coachAssignment.periodId,
            periodName: schema.period.name,
          })
          .from(schema.coachAssignment)
          .innerJoin(schema.appUser, and(eq(schema.appUser.ssbId, schema.coachAssignment.ssbId), eq(schema.appUser.id, schema.coachAssignment.userId)))
          .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.coachAssignment.ssbId), eq(schema.ageGroup.id, schema.coachAssignment.ageGroupId)))
          .innerJoin(schema.period, and(eq(schema.period.ssbId, schema.coachAssignment.ssbId), eq(schema.period.id, schema.coachAssignment.periodId)))
          .orderBy(desc(schema.period.startDate), asc(schema.ageGroup.minAge), asc(schema.appUser.name)),
      );
      return c.json(rows);
    })
    .post("/assignments", requirePermission("assignment.manage"), zv("json", assignmentInputSchema), async (c) => {
      const m = ctx(c);
      const b = c.req.valid("json");
      await withTenant(db, m.ssbId, async (tx) => {
        const [u] = await tx.select({ role: schema.appUser.role }).from(schema.appUser).where(eq(schema.appUser.id, b.userId)).limit(1);
        if (!u) throw new HttpError(422, "member_invalid", "Anggota tidak ditemukan di SSB ini");
        if (u.role !== "pelatih" && u.role !== "korlas") throw new HttpError(422, "member_not_coach", "Hanya pelatih atau korlas yang bisa ditugaskan");
        try {
          await tx.insert(schema.coachAssignment).values({ ssbId: m.ssbId, ...b });
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Penugasan ini sudah ada");
          if (isFk(e)) throw new HttpError(422, "reference_invalid", "KU atau periode tidak ditemukan di SSB ini");
          throw e;
        }
      });
      return c.body(null, 201);
    })
    .delete("/assignments/:userId/:ageGroupId/:periodId", requirePermission("assignment.manage"), async (c) => {
      const m = ctx(c);
      const userId = uuidOr404(c.req.param("userId"), "Penugasan");
      const ageGroupId = uuidOr404(c.req.param("ageGroupId"), "Penugasan");
      const periodId = uuidOr404(c.req.param("periodId"), "Penugasan");
      const rows = await withTenant(db, m.ssbId, (tx) =>
        tx
          .delete(schema.coachAssignment)
          .where(and(eq(schema.coachAssignment.userId, userId), eq(schema.coachAssignment.ageGroupId, ageGroupId), eq(schema.coachAssignment.periodId, periodId)))
          .returning({ u: schema.coachAssignment.userId }),
      );
      if (rows.length === 0) throw notFound("Penugasan");
      return c.body(null, 204);
    });
}
