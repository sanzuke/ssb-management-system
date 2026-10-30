import { Hono } from "hono";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant, type Db } from "@ssb/db";
import { BADGE_MAX, badgeInputSchema, type BadgeCode, type PlayerBadge } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type Auth, type AppEnv, type Member } from "./auth/middleware";
import { isUniqueViolation } from "./auth/service";
import { visibleTo } from "./players";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B = schema.playerBadge;

/** Lencana siswa. Siswa di luar batas peran (pelatih: KU lain, orang tua: anak orang lain) dijawab 404, seperti rute siswa lain. */
export function badgeRoutes(db: Db) {
  const member = (c: { get: (k: "auth") => Auth | undefined }): Member => c.get("auth")!.member!;
  const idOf = (raw: string, what: string) => {
    if (!UUID.test(raw)) throw new HttpError(404, "not_found", `${what} tidak ditemukan`);
    return raw;
  };

  return new Hono<AppEnv>()
    .get("/players/:playerId/badges", requirePermission("badge.read"), async (c) => {
      const m = member(c);
      const playerId = idOf(c.req.param("playerId"), "Siswa");
      const out = await withTenant(db, m.ssbId, async (tx): Promise<PlayerBadge[]> => {
        const [p] = await tx
          .select({ id: schema.player.id })
          .from(schema.player)
          .where(and(eq(schema.player.id, playerId), visibleTo(m)))
          .limit(1);
        if (!p) throw new HttpError(404, "not_found", "Siswa tidak ditemukan");
        const rows = await tx
          .select({ id: B.id, badge: B.badge, awardedAt: B.awardedAt, awardedBy: schema.appUser.name })
          .from(B)
          .leftJoin(schema.appUser, and(eq(schema.appUser.ssbId, B.ssbId), eq(schema.appUser.id, B.awardedBy)))
          .where(and(eq(B.playerId, playerId), isNull(B.revokedAt)))
          .orderBy(asc(B.awardedAt));
        return rows.map((r) => ({ id: r.id, badge: r.badge as BadgeCode, awardedAt: r.awardedAt.toISOString(), awardedBy: r.awardedBy }));
      });
      return c.json(out);
    })

    .post("/players/:playerId/badges", requirePermission("badge.write"), zv("json", badgeInputSchema), async (c) => {
      const m = member(c);
      const playerId = idOf(c.req.param("playerId"), "Siswa");
      const { badge } = c.req.valid("json");
      const id = await withTenant(db, m.ssbId, async (tx) => {
        const [p] = await tx
          .select({ id: schema.player.id })
          .from(schema.player)
          .where(and(eq(schema.player.id, playerId), visibleTo(m)))
          .limit(1);
        if (!p) throw new HttpError(404, "not_found", "Siswa tidak ditemukan");
        // Kunci per pemain: dua pemberian serentak tidak boleh sama-sama lolos batas.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`player_badge:${playerId}`}))`);
        const aktif = await tx
          .select({ badge: B.badge })
          .from(B)
          .where(and(eq(B.playerId, playerId), isNull(B.revokedAt)));
        if (aktif.some((x) => x.badge === badge)) throw new HttpError(409, "badge_exists", "Siswa sudah punya lencana ini");
        if (aktif.length >= BADGE_MAX) throw new HttpError(409, "badge_limit", `Paling banyak ${BADGE_MAX} lencana aktif; cabut satu lebih dulu`);
        try {
          const [row] = await tx.insert(B).values({ ssbId: m.ssbId, playerId, badge, awardedBy: m.userId }).returning({ id: B.id });
          return row!.id;
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "badge_exists", "Siswa sudah punya lencana ini");
          throw e;
        }
      });
      return c.json({ id }, 201);
    })

    .delete("/players/:playerId/badges/:badgeId", requirePermission("badge.write"), async (c) => {
      const m = member(c);
      const playerId = idOf(c.req.param("playerId"), "Siswa");
      const badgeId = idOf(c.req.param("badgeId"), "Lencana");
      await withTenant(db, m.ssbId, async (tx) => {
        const [p] = await tx
          .select({ id: schema.player.id })
          .from(schema.player)
          .where(and(eq(schema.player.id, playerId), visibleTo(m)))
          .limit(1);
        if (!p) throw new HttpError(404, "not_found", "Siswa tidak ditemukan");
        const dicabut = await tx
          .update(B)
          .set({ revokedAt: new Date(), revokedBy: m.userId })
          .where(and(eq(B.id, badgeId), eq(B.playerId, playerId), isNull(B.revokedAt)))
          .returning({ id: B.id });
        if (dicabut.length === 0) throw new HttpError(404, "not_found", "Lencana tidak ditemukan");
      });
      return c.body(null, 204);
    });
}
