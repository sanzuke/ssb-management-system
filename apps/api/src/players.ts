import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, asc, desc, eq, ilike, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  assignmentInputSchema,
  guardianInputSchema,
  playerFormSchema,
  playerStatusSchema,
  type PlayerDetail,
  type PlayerFormData,
  type PlayerExtra,
  type PlayerOverview,
  type PlayerSummary,
} from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { isUniqueViolation } from "./auth/service";
import { zv } from "./validator";
import { newPhotoKey, PHOTO_MAX_BYTES, photoExt, photoMime, photoStore, photoVersion, sniffImage } from "./photo";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const uuidOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};
const isFk = (e: unknown) => (e as { code?: string })?.code === "23503" || (e as { cause?: { code?: string } })?.cause?.code === "23503";

/** Nama constraint dari galat Postgres (langsung atau di `cause` galat Drizzle). */
function pgConstraint(e: unknown): string | undefined {
  const err = e && typeof e === "object" && "cause" in e && e.cause && typeof e.cause === "object" ? e.cause : e;
  return err && typeof err === "object" && "constraint_name" in err && typeof err.constraint_name === "string" ? err.constraint_name : undefined;
}
/** Pelanggaran keunikan ID siswa atau NISN menjadi 409 dengan pesan di kolomnya. */
function duplicateOf(e: unknown): HttpError | null {
  const c = pgConstraint(e);
  if (c === "player_ssb_member_no") return new HttpError(409, "member_no_taken", "ID siswa sudah dipakai siswa lain", { memberNo: "sudah dipakai siswa lain" });
  if (c === "player_ssb_nisn") return new HttpError(409, "nisn_taken", "NISN sudah dipakai siswa lain", { nisn: "sudah dipakai siswa lain" });
  return null;
}

/**
 * Batas data siswa per role. Admin melihat semua; pelatih dan korlas hanya siswa di KU yang
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
  photoKey: schema.player.photoKey,
  nisn: schema.player.nisn,
  birthPlace: schema.player.birthPlace,
  guardianName: schema.player.guardianName,
  guardianWhatsapp: schema.player.guardianWhatsapp,
  documentStatus: schema.player.documentStatus,
  heightCm: schema.player.heightCm,
  weightKg: schema.player.weightKg,
  medicalNote: schema.player.medicalNote,
  jerseyNo: schema.player.jerseyNo,
  jerseySize: schema.player.jerseySize,
  shoeSize: schema.player.shoeSize,
};
const toExtra = (r: Omit<PlayerExtra, "documentStatus"> & { documentStatus: string }): PlayerExtra => ({
  nisn: r.nisn,
  birthPlace: r.birthPlace,
  guardianName: r.guardianName,
  guardianWhatsapp: r.guardianWhatsapp,
  documentStatus: r.documentStatus as PlayerExtra["documentStatus"],
  heightCm: r.heightCm,
  weightKg: r.weightKg,
  medicalNote: r.medicalNote,
  jerseyNo: r.jerseyNo,
  jerseySize: r.jerseySize,
  shoeSize: r.shoeSize,
});

/** Nomor anggota otomatis: penghitung per SSB dinaikkan atomik; nomor yang sudah dipakai ID buatan sendiri dilewati. */
async function nextMemberNo(tx: Tx, ssbId: string): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const [seq] = await tx
      .update(schema.ssb)
      .set({ memberSeq: sql`${schema.ssb.memberSeq} + 1` })
      .where(eq(schema.ssb.id, ssbId))
      .returning({ n: schema.ssb.memberSeq });
    const no = `P${String(seq!.n).padStart(4, "0")}`;
    const [dup] = await tx.select({ id: schema.player.id }).from(schema.player).where(eq(schema.player.memberNo, no)).limit(1);
    if (!dup) return no;
  }
  throw new HttpError(500, "member_no_exhausted", "Tidak bisa membuat nomor anggota otomatis");
}
/** Kolom data siswa dari formulir; isian kosong menjadi null. */
const extraColumns = (b: PlayerFormData) => ({
  nisn: b.nisn ?? null,
  birthPlace: b.birthPlace || null,
  guardianName: b.guardianName || null,
  guardianWhatsapp: b.guardianWhatsapp ?? null,
  documentStatus: b.documentStatus,
  heightCm: b.heightCm ?? null,
  weightKg: b.weightKg ?? null,
  medicalNote: b.medicalNote || null,
  jerseyNo: b.jerseyNo ?? null,
  jerseySize: b.jerseySize ?? null,
  shoeSize: b.shoeSize ?? null,
});
const toSummary = (r: {
  id: string;
  memberNo: string | null;
  fullName: string;
  birthDate: string;
  position: any;
  school: string | null;
  status: any;
  ageGroupId: string | null;
  ageGroupName: string | null;
  photoKey: string | null;
}): PlayerSummary => ({
  id: r.id,
  memberNo: r.memberNo,
  fullName: r.fullName,
  birthDate: r.birthDate,
  position: r.position,
  school: r.school,
  status: r.status,
  ageGroup: r.ageGroupId ? { id: r.ageGroupId, name: r.ageGroupName! } : null,
  photoV: photoVersion(r.photoKey),
});

const selectPlayers = (tx: Tx) =>
  tx
    .select(playerCols)
    .from(schema.player)
    .leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)));

async function ageGroupName(tx: Tx, id: string | null | undefined) {
  if (!id) return null;
  const [g] = await tx.select({ name: schema.ageGroup.name }).from(schema.ageGroup).where(eq(schema.ageGroup.id, id)).limit(1);
  return g?.name ?? null;
}

export function playerRoutes(db: Db, opts: { uploadDir: string }) {
  const store = photoStore(opts.uploadDir);
  const ctx = (c: { get: (k: "auth") => any }) => c.get("auth")!.member as Member;

  return (
    new Hono<AppEnv>()
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

      // Ringkasan untuk tabel siswa dalam satu permintaan: wali utama dan penilaian terakhir tiap siswa
      // yang boleh dilihat role ini. Data wali (nama, WhatsApp) hanya untuk admin SSB, sama seperti daftar wali di detail siswa.
      .get("/players-overview", requirePermission("player.read"), async (c) => {
        const m = ctx(c);
        const out = await withTenant(db, m.ssbId, async (tx): Promise<PlayerOverview[]> => {
          const ids = (await tx.select({ id: schema.player.id }).from(schema.player).where(visibleTo(m)).limit(500)).map((r) => r.id);
          if (ids.length === 0) return [];

          // Penilaian terbaru per pemain: periode terbaru dulu, lalu tanggal penilaian. Orang tua hanya yang terbit.
          const A = schema.assessment;
          const rows = await tx
            .select({ id: A.id, playerId: A.playerId, assessedOn: A.assessedOn, publishedAt: A.publishedAt, periodName: schema.period.name })
            .from(A)
            .innerJoin(schema.period, and(eq(schema.period.ssbId, A.ssbId), eq(schema.period.id, A.periodId)))
            .where(and(inArray(A.playerId, ids), m.role === "orang_tua" ? isNotNull(A.publishedAt) : undefined))
            .orderBy(desc(schema.period.startDate), desc(A.assessedOn));
          const terbaru = new Map<string, (typeof rows)[number]>();
          for (const r of rows) if (!terbaru.has(r.playerId)) terbaru.set(r.playerId, r);
          const rata = new Map<string, number>();
          if (terbaru.size > 0) {
            const S = schema.assessmentScore;
            const avg = await tx
              .select({ assessmentId: S.assessmentId, rata: sql<string>`avg(${S.score})` })
              .from(S)
              .where(
                inArray(
                  S.assessmentId,
                  [...terbaru.values()].map((r) => r.id),
                ),
              )
              .groupBy(S.assessmentId);
            for (const r of avg) rata.set(r.assessmentId, Math.round(Number(r.rata) * 10) / 10);
          }

          // Wali: hanya admin SSB.
          const wali = new Map<string, { name: string; whatsapp: string | null; relationship: string | null; total: number }>();
          if (m.role === "admin_ssb") {
            const g = await tx
              .select({
                playerId: schema.playerGuardian.playerId,
                name: schema.appUser.name,
                whatsapp: schema.appUser.whatsapp,
                relationship: schema.playerGuardian.relationship,
              })
              .from(schema.playerGuardian)
              .innerJoin(schema.appUser, and(eq(schema.appUser.ssbId, schema.playerGuardian.ssbId), eq(schema.appUser.id, schema.playerGuardian.userId)))
              .where(inArray(schema.playerGuardian.playerId, ids))
              .orderBy(asc(schema.appUser.name));
            for (const r of g) {
              const ada = wali.get(r.playerId);
              if (ada) ada.total++;
              else wali.set(r.playerId, { name: r.name, whatsapp: r.whatsapp, relationship: r.relationship, total: 1 });
            }
          }
          // Siswa yang belum punya akun wali memakai kontak orang tua dari data siswa.
          if (m.role === "admin_ssb") {
            const kontak = await tx
              .select({ id: schema.player.id, name: schema.player.guardianName, whatsapp: schema.player.guardianWhatsapp })
              .from(schema.player)
              .where(and(inArray(schema.player.id, ids), isNotNull(schema.player.guardianName)));
            for (const k of kontak) if (!wali.has(k.id)) wali.set(k.id, { name: k.name!, whatsapp: k.whatsapp, relationship: null, total: 1 });
          }

          return ids.map((playerId) => {
            const a = terbaru.get(playerId);
            return {
              playerId,
              guardian: wali.get(playerId) ?? null,
              latestAssessment: a
                ? { periodName: a.periodName, overall: rata.get(a.id) ?? null, assessedOn: a.assessedOn, published: a.publishedAt !== null }
                : null,
            };
          });
        });
        return c.json(out);
      })

      .get("/players/:id", requirePermission("player.read"), async (c) => {
        const m = ctx(c);
        const id = uuidOr404(c.req.param("id"), "Siswa");
        const detail = await withTenant(db, m.ssbId, async (tx): Promise<PlayerDetail | null> => {
          const [row] = await selectPlayers(tx)
            .where(and(eq(schema.player.id, id), visibleTo(m)))
            .limit(1);
          if (!row) return null;
          const out: PlayerDetail = { ...toSummary(row), ...toExtra(row), history: [] };
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
        if (!detail) throw notFound("Siswa"); // di luar batas role dijawab sama dengan tidak ada
        return c.json(detail);
      })

      .post("/players", requirePermission("player.write"), zv("json", playerFormSchema), async (c) => {
        const m = ctx(c);
        const b = c.req.valid("json");
        try {
          const id = await withTenant(db, m.ssbId, async (tx) => {
            // ID siswa: yang diisi admin dipakai apa adanya; kosong diberi nomor otomatis (unik walau dua siswa dibuat bersamaan).
            const memberNo = b.memberNo ?? (await nextMemberNo(tx, m.ssbId));
            const [p] = await tx
              .insert(schema.player)
              .values({
                ssbId: m.ssbId,
                memberNo,
                fullName: b.fullName,
                birthDate: b.birthDate,
                position: b.position ?? null,
                school: b.school || null,
                ageGroupId: b.ageGroupId ?? null,
                status: b.status,
                ...extraColumns(b),
              })
              .returning({ id: schema.player.id });
            return p!.id;
          });
          const [row] = await withTenant(db, m.ssbId, (tx) => selectPlayers(tx).where(eq(schema.player.id, id)).limit(1));
          return c.json(toSummary(row!), 201);
        } catch (e) {
          if (isFk(e)) throw new HttpError(422, "age_group_invalid", "KU tidak ditemukan di SSB ini");
          throw duplicateOf(e) ?? e;
        }
      })

      .patch("/players/:id", requirePermission("player.write"), zv("json", playerFormSchema), async (c) => {
        const m = ctx(c);
        const id = uuidOr404(c.req.param("id"), "Siswa");
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
              .set({
                fullName: b.fullName,
                birthDate: b.birthDate,
                position: b.position ?? null,
                school: b.school || null,
                ageGroupId: nextKu,
                status: b.status,
                ...(b.memberNo ? { memberNo: b.memberNo } : {}),
                ...extraColumns(b),
              })
              .where(eq(schema.player.id, id));
            for (const l of log)
              await tx
                .insert(schema.playerHistory)
                .values({ ssbId: m.ssbId, playerId: id, field: l.field, fromValue: l.from, toValue: l.to, changedBy: m.userId });
            return true;
          });
          if (!found) throw notFound("Siswa");
        } catch (e) {
          if (isFk(e)) throw new HttpError(422, "age_group_invalid", "KU tidak ditemukan di SSB ini");
          throw duplicateOf(e) ?? e;
        }
        const [row] = await withTenant(db, m.ssbId, (tx) => selectPlayers(tx).where(eq(schema.player.id, id)).limit(1));
        return c.json(toSummary(row!));
      })

      // ---- Orang tua siswa ----
      .post("/players/:id/guardians", requirePermission("player.write"), zv("json", guardianInputSchema), async (c) => {
        const m = ctx(c);
        const id = uuidOr404(c.req.param("id"), "Siswa");
        const b = c.req.valid("json");
        await withTenant(db, m.ssbId, async (tx) => {
          const [p] = await tx.select({ id: schema.player.id }).from(schema.player).where(eq(schema.player.id, id)).limit(1);
          if (!p) throw notFound("Siswa");
          const [u] = await tx.select({ role: schema.appUser.role }).from(schema.appUser).where(eq(schema.appUser.id, b.userId)).limit(1);
          if (!u) throw new HttpError(422, "member_invalid", "Anggota tidak ditemukan di SSB ini");
          if (u.role !== "orang_tua") throw new HttpError(422, "member_not_parent", "Hanya anggota ber-role orang tua yang bisa dihubungkan ke siswa");
          try {
            await tx.insert(schema.playerGuardian).values({ ssbId: m.ssbId, playerId: id, userId: b.userId, relationship: b.relationship ?? null });
          } catch (e) {
            if (isUniqueViolation(e)) throw new HttpError(409, "duplicate", "Orang tua ini sudah terhubung ke siswa");
            throw e;
          }
        });
        return c.body(null, 201);
      })
      .delete("/players/:id/guardians/:userId", requirePermission("player.write"), async (c) => {
        const m = ctx(c);
        const id = uuidOr404(c.req.param("id"), "Siswa");
        const userId = uuidOr404(c.req.param("userId"), "Orang tua");
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .delete(schema.playerGuardian)
            .where(and(eq(schema.playerGuardian.playerId, id), eq(schema.playerGuardian.userId, userId)))
            .returning({ id: schema.playerGuardian.playerId }),
        );
        if (rows.length === 0) throw notFound("Hubungan orang tua");
        return c.body(null, 204);
      })

      // ---- Penugasan pelatih dan korlas ke KU per periode ----
      // Foto siswa. Berkas disimpan di folder lokal dan hanya bisa dibaca lewat endpoint ini (dengan login dan batas data per role).
      .put(
        "/players/:id/photo",
        requirePermission("player.photo"),
        bodyLimit({
          maxSize: PHOTO_MAX_BYTES + 64 * 1024,
          onError: () => {
            throw new HttpError(413, "photo_too_large", "Foto terlalu besar (maksimal 2 MB)");
          },
        }),
        async (c) => {
          const m = ctx(c);
          const id = uuidOr404(c.req.param("id"), "Siswa");
          const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
          const file = body.file;
          if (!(file instanceof File)) throw new HttpError(400, "bad_request", 'Kirim berkas foto pada kolom "file"');
          if (file.size > PHOTO_MAX_BYTES) throw new HttpError(413, "photo_too_large", "Foto terlalu besar (maksimal 2 MB)");
          const bytes = new Uint8Array(await file.arrayBuffer());
          const ext = sniffImage(bytes);
          if (!ext) throw new HttpError(415, "photo_type", "Foto harus berformat JPG, PNG, atau WebP");
          const key = newPhotoKey(m.ssbId, id, ext);
          const old = await withTenant(db, m.ssbId, async (tx) => {
            const [cur] = await tx
              .select({ key: schema.player.photoKey })
              .from(schema.player)
              .where(and(eq(schema.player.id, id), visibleTo(m)))
              .limit(1);
            if (!cur) return undefined;
            await store.put(key, bytes);
            await tx.update(schema.player).set({ photoKey: key }).where(eq(schema.player.id, id));
            return cur.key;
          });
          if (old === undefined) throw notFound("Siswa");
          if (old) await store.remove(old);
          return c.json({ photoV: photoVersion(key) });
        },
      )

      .get("/players/:id/photo", requirePermission("player.read"), async (c) => {
        const m = ctx(c);
        const id = uuidOr404(c.req.param("id"), "Siswa");
        const [row] = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select({ key: schema.player.photoKey })
            .from(schema.player)
            .where(and(eq(schema.player.id, id), visibleTo(m)))
            .limit(1),
        );
        const bytes = row?.key ? await store.get(row.key) : null;
        if (!row?.key || !bytes) throw notFound("Foto");
        // URL berversi (?v=), jadi aman disimpan lama di cache browser; tetap private karena foto anak.
        return c.body(bytes, 200, {
          "content-type": photoMime(photoExt(row.key)),
          "cache-control": "private, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        });
      })

      .delete("/players/:id/photo", requirePermission("player.photo"), async (c) => {
        const m = ctx(c);
        const id = uuidOr404(c.req.param("id"), "Siswa");
        const old = await withTenant(db, m.ssbId, async (tx) => {
          const [cur] = await tx
            .select({ key: schema.player.photoKey })
            .from(schema.player)
            .where(and(eq(schema.player.id, id), visibleTo(m)))
            .limit(1);
          if (!cur) return undefined;
          await tx.update(schema.player).set({ photoKey: null }).where(eq(schema.player.id, id));
          return cur.key;
        });
        if (old === undefined) throw notFound("Siswa");
        if (old) await store.remove(old);
        return c.body(null, 204);
      })

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
            .where(
              and(eq(schema.coachAssignment.userId, userId), eq(schema.coachAssignment.ageGroupId, ageGroupId), eq(schema.coachAssignment.periodId, periodId)),
            )
            .returning({ u: schema.coachAssignment.userId }),
        );
        if (rows.length === 0) throw notFound("Penugasan");
        return c.body(null, 204);
      })
  );
}
