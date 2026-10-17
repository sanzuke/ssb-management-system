import { Hono } from "hono";
import { zv } from "./validator";
import { schema, type Db } from "@ssb/db";
import { acceptInvitationSchema, createInvitationSchema } from "@ssb/shared";
import { HttpError } from "./errors";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { hashPassword } from "./auth/password";
import { acceptInvitation, createInvitation, isUniqueViolation, previewInvitation, setActive, startSession } from "./auth/service";

export function invitationRoutes(db: Db, opts: { secureCookie: boolean; webUrl: string }) {
  return (
    new Hono<AppEnv>()
      // Admin SSB membuat tautan undangan; token hanya ditampilkan sekali.
      .post("/", requirePermission("invitation.create"), zv("json", createInvitationSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const { token, expiresAt } = await createInvitation(db, m, c.req.valid("json"));
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
        if (!parsed.success) throw new HttpError(400, "bad_request", "Nama, email, dan kata sandi (minimal 10 karakter) wajib diisi");
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
        const joined = await acceptInvitation(db, token, { id: accountId, name: body.name });
        await startSession(db, c, accountId, joined, opts.secureCookie);
        return c.json({ ok: true, ssbId: joined.ssbId, role: joined.role }, 201);
      })
  );
}
