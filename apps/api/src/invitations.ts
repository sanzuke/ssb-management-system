import { Hono } from "hono";
import { zv } from "./validator";
import { desc, eq, sql } from "drizzle-orm";
import { schema, withTenant, type Db } from "@ssb/db";
import { acceptInvitationSchema, createInvitationSchema, type InvitationRow } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { hashPassword } from "./auth/password";
import { acceptInvitation, createInvitation, isUniqueViolation, previewInvitation, renewInvitation, setActive, startSession } from "./auth/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idOr404 = (v: string) => {
  if (!UUID.test(v)) throw new HttpError(404, "not_found", "Undangan tidak ditemukan");
  return v;
};

export function invitationRoutes(db: Db, opts: { secureCookie: boolean; webUrl: string }) {
  return (
    new Hono<AppEnv>()
      // Admin SSB membuat tautan undangan; token hanya ditampilkan sekali.
      .post("/", requirePermission("invitation.create"), zv("json", createInvitationSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const { token, expiresAt } = await createInvitation(db, m, c.req.valid("json"));
        return c.json({ token, url: `${opts.webUrl}/undangan/${token}`, expiresAt }, 201);
      })

      // Daftar undangan SSB ini, terbaru dulu. Tautan tidak ikut: hanya hash yang disimpan, jadi tautan baru dibuat lewat "renew".
      .get("/", requirePermission("invitation.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select({
              id: schema.invitation.id,
              role: schema.invitation.role,
              label: schema.invitation.label,
              playerId: schema.invitation.playerId,
              playerName: schema.player.fullName,
              createdByName: schema.appUser.name,
              createdAt: schema.invitation.createdAt,
              expiresAt: schema.invitation.expiresAt,
              acceptedAt: schema.invitation.acceptedAt,
            })
            .from(schema.invitation)
            .leftJoin(schema.player, sql`${schema.player.ssbId} = ${schema.invitation.ssbId} and ${schema.player.id} = ${schema.invitation.playerId}`)
            .leftJoin(schema.appUser, sql`${schema.appUser.ssbId} = ${schema.invitation.ssbId} and ${schema.appUser.id} = ${schema.invitation.createdBy}`)
            .orderBy(desc(schema.invitation.createdAt))
            .limit(200),
        );
        const now = Date.now();
        const out: InvitationRow[] = rows.map((r) => ({
          id: r.id,
          role: r.role,
          label: r.label,
          player: r.playerId && r.playerName ? { id: r.playerId, name: r.playerName } : null,
          createdBy: r.createdByName,
          createdAt: r.createdAt.toISOString(),
          expiresAt: r.expiresAt.toISOString(),
          acceptedAt: r.acceptedAt?.toISOString() ?? null,
          status: r.acceptedAt ? "diterima" : r.expiresAt.getTime() <= now ? "kedaluwarsa" : "menunggu",
        }));
        return c.json(out);
      })

      // Cabut undangan yang belum diterima. Yang sudah diterima dipertahankan sebagai riwayat.
      .delete("/:id", requirePermission("invitation.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"));
        const res = await withTenant(db, m.ssbId, async (tx) => {
          const [inv] = await tx.select({ acceptedAt: schema.invitation.acceptedAt }).from(schema.invitation).where(eq(schema.invitation.id, id)).limit(1);
          if (!inv) return "none" as const;
          if (inv.acceptedAt) return "accepted" as const;
          await tx.delete(schema.invitation).where(eq(schema.invitation.id, id));
          return "ok" as const;
        });
        if (res === "none") throw new HttpError(404, "not_found", "Undangan tidak ditemukan");
        if (res === "accepted") throw new HttpError(409, "already_accepted", "Undangan yang sudah diterima tidak bisa dicabut");
        return c.body(null, 204);
      })

      // Buat ulang tautan (undangan lama diganti); token baru hanya ditampilkan sekali.
      .post("/:id/renew", requirePermission("invitation.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const { token, expiresAt } = await renewInvitation(db, m, idOr404(c.req.param("id")));
        return c.json({ token, url: `${opts.webUrl}/undangan/${token}`, expiresAt }, 201);
      })

      // Pratinjau publik untuk halaman undangan.
      .get("/:token", async (c) => c.json(await previewInvitation(db, c.req.param("token"))))

      // Terima undangan: akun yang sedang login langsung bergabung; selain itu buat akun baru.
      .post("/:token/accept", async (c) => {
        const token = c.req.param("token");
        await previewInvitation(db, token); // gagal lebih awal bila undangan tidak berlaku
        const a = c.get("auth");
        if (a) {
          const joined = await acceptInvitation(db, token, { id: a.accountId, name: a.accountName });
          await setActive(db, a.sessionHash, joined);
          return c.json({ ok: true, ssbId: joined.ssbId, role: joined.role });
        }
        const parsed = acceptInvitationSchema.safeParse(await c.req.json().catch(() => ({})));
        if (!parsed.success)
          throw new HttpError(
            400,
            "bad_request",
            "Nama, email, dan kata sandi (minimal 10 karakter) wajib diisi; nomor WhatsApp, bila diisi, harus 8 sampai 15 angka",
          );
        const body = parsed.data;
        let accountId: string;
        try {
          const [acc] = await db
            .insert(schema.account)
            .values({ email: body.email, name: body.name, passwordHash: await hashPassword(body.password) })
            .returning({ id: schema.account.id });
          accountId = acc!.id;
        } catch (e) {
          if (isUniqueViolation(e)) throw new HttpError(409, "email_taken", "Email sudah terdaftar. Masuk dulu, lalu buka tautan undangan lagi");
          throw e;
        }
        const joined = await acceptInvitation(db, token, { id: accountId, name: body.name }, undefined, body.whatsapp);
        await startSession(db, c, accountId, joined, opts.secureCookie);
        return c.json({ ok: true, ssbId: joined.ssbId, role: joined.role }, 201);
      })
  );
}
