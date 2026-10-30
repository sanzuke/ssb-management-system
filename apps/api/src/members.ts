import { and, asc, eq, ne, sql } from "drizzle-orm";
import { deleteCookie } from "hono/cookie";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import { deleteAccountSchema, memberUpdateSchema, type MemberRow, type UserRole } from "@ssb/shared";
import { HttpError } from "./errors";
import { requireAccount, requirePermission, type AppEnv } from "./auth/middleware";
import { verifyPassword } from "./auth/password";
import { SESSION_COOKIE } from "./auth/session";
import { listMemberships } from "./auth/service";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new HttpError(404, "not_found", "Anggota tidak ditemukan");
const urutanPeran: Record<UserRole, number> = { admin_ssb: 0, korlas: 1, pelatih: 2, orang_tua: 3 };

/** Anggota, anak yang dihubungkan, dan penugasan KU, dibaca di dalam konteks tenant. */
async function bacaAnggota(db: Db, ssbId: string, selfUserId: string, userId?: string): Promise<MemberRow[]> {
  const rows = await withTenant(db, ssbId, (tx) =>
    tx
      .select({
        userId: schema.appUser.id,
        name: schema.appUser.name,
        email: schema.account.email,
        role: schema.appUser.role,
        whatsapp: schema.appUser.whatsapp,
        joinedAt: schema.appUser.createdAt,
        passwordHash: schema.account.passwordHash,
        googleSub: schema.account.googleSub,
        children: sql<number>`(select count(*)::int from player_guardian g where g.ssb_id = ${schema.appUser.ssbId} and g.user_id = ${schema.appUser.id})`,
        assignments: sql<number>`(select count(*)::int from coach_assignment c where c.ssb_id = ${schema.appUser.ssbId} and c.user_id = ${schema.appUser.id})`,
      })
      .from(schema.appUser)
      .innerJoin(schema.account, eq(schema.account.id, schema.appUser.accountId))
      .where(userId ? eq(schema.appUser.id, userId) : undefined)
      .orderBy(asc(schema.appUser.name)),
  );
  return rows
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      email: r.email,
      role: r.role,
      whatsapp: r.whatsapp,
      joinedAt: r.joinedAt.toISOString(),
      isSelf: r.userId === selfUserId,
      children: r.children,
      assignments: r.assignments,
      hasPassword: r.passwordHash !== null,
      hasGoogle: r.googleSub !== null,
    }))
    .sort((a, b) => urutanPeran[a.role] - urutanPeran[b.role] || a.name.localeCompare(b.name));
}

export function memberRoutes(db: Db) {
  const adaAdminLain = async (ssbId: string, userId: string) =>
    withTenant(db, ssbId, async (tx) => {
      const [r] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.appUser)
        .where(and(eq(schema.appUser.role, "admin_ssb"), ne(schema.appUser.id, userId)));
      return (r?.n ?? 0) > 0;
    });

  return (
    new Hono<AppEnv>()
      .get("/members", requirePermission("member.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        return c.json(await bacaAnggota(db, m.ssbId, m.userId));
      })

      // Ubah nama, kontak, atau peran. Peran dijaga agar SSB tidak kehilangan admin terakhir dan data tidak yatim.
      .patch("/members/:userId", requirePermission("member.manage"), zv("json", memberUpdateSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const id = c.req.param("userId");
        if (!UUID.test(id)) throw notFound();
        const body = c.req.valid("json");
        const [target] = await bacaAnggota(db, m.ssbId, m.userId, id);
        if (!target) throw notFound();

        if (body.role !== undefined && body.role !== target.role) {
          if (target.isSelf) throw new HttpError(409, "self_role", "Peran Anda sendiri tidak bisa diubah. Minta admin lain melakukannya");
          if (target.role === "admin_ssb" && !(await adaAdminLain(m.ssbId, id))) throw new HttpError(409, "last_admin", "SSB harus punya minimal satu admin");
          if (target.role === "orang_tua" && target.children > 0)
            throw new HttpError(409, "has_children", "Orang tua ini masih terhubung ke anak. Lepaskan dulu di profil siswa");
          if (body.role === "orang_tua" && target.assignments > 0)
            throw new HttpError(409, "has_assignments", "Anggota ini masih punya penugasan KU. Hapus dulu di halaman Penugasan");
        }
        await withTenant(db, m.ssbId, (tx) =>
          tx
            .update(schema.appUser)
            .set({
              ...(body.name !== undefined ? { name: body.name } : {}),
              ...(body.whatsapp !== undefined ? { whatsapp: body.whatsapp } : {}),
              ...(body.role !== undefined ? { role: body.role } : {}),
            })
            .where(eq(schema.appUser.id, id)),
        );
        return c.json((await bacaAnggota(db, m.ssbId, m.userId, id))[0]);
      })

      // Keluarkan anggota dari SSB ini. Akunnya tetap ada (mungkin anggota SSB lain); riwayat absensi, penilaian, dan undangan
      // yang dibuatnya tetap, hanya pencatatnya dikosongkan. Penugasan dan kaitan anak ikut lepas.
      .delete("/members/:userId", requirePermission("member.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = c.req.param("userId");
        if (!UUID.test(id)) throw notFound();
        const [target] = await bacaAnggota(db, m.ssbId, m.userId, id);
        if (!target) throw notFound();
        if (target.isSelf) throw new HttpError(409, "self", "Anda tidak bisa mengeluarkan diri sendiri dari sini. Pakai Hapus akun di halaman Akun");
        if (target.role === "admin_ssb" && !(await adaAdminLain(m.ssbId, id))) throw new HttpError(409, "last_admin", "SSB harus punya minimal satu admin");
        await withTenant(db, m.ssbId, (tx) => tx.delete(schema.appUser).where(eq(schema.appUser.id, id)));
        return c.body(null, 204);
      })

      // Hapus akun sendiri. Ditolak bila akun ini satu-satunya admin di suatu SSB (serahkan dulu). Semua keanggotaan ikut hilang;
      // riwayat di SSB tetap, hanya nama pencatatnya dikosongkan.
      .post("/auth/delete-account", requireAccount, zv("json", deleteAccountSchema), async (c) => {
        const a = c.get("auth")!;
        const { confirm } = c.req.valid("json");
        const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, a.accountId)).limit(1);
        if (!acc) throw new HttpError(404, "not_found", "Akun tidak ditemukan");
        const cocok = acc.passwordHash ? await verifyPassword(confirm, acc.passwordHash) : confirm.trim().toLowerCase() === acc.email.toLowerCase();
        if (!cocok) throw new HttpError(400, "wrong_confirmation", acc.passwordHash ? "Kata sandi salah" : "Email yang diketik tidak sama dengan email akun");

        const sendiri: string[] = [];
        for (const mem of (await listMemberships(db, a.accountId)).filter((x) => x.role === "admin_ssb")) {
          if (!(await adaAdminLain(mem.ssbId, mem.userId))) sendiri.push(mem.ssbName);
        }
        if (sendiri.length > 0)
          throw new HttpError(409, "sole_admin", `Anda satu-satunya admin di ${sendiri.join(", ")}. Jadikan anggota lain admin dulu sebelum menghapus akun`);

        await db.delete(schema.account).where(eq(schema.account.id, a.accountId));
        deleteCookie(c, SESSION_COOKIE, { path: "/" });
        return c.json({ ok: true });
      })
  );
}
