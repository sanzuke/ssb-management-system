import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { schema, type Db } from "@ssb/db";
import { ssbInputSchema } from "@ssb/shared";
import { z } from "zod";
import { HttpError } from "../errors";
import { acceptInvitation, createMobileLoginCode, createSsb, isUniqueViolation, listMemberships, pickActive, startSession } from "./service";
import type { GoogleProvider } from "./google";
import type { AppEnv } from "./middleware";

const TX_COOKIE = "oauth_tx";
/** Alamat tujuan akhir alur Google dari aplikasi mobile (skema tautan aplikasi). */
const MOBILE_REDIRECT = "ssbapp://auth";

const startQuery = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("login") }),
  z.object({ intent: z.literal("register") }).extend(ssbInputSchema.shape),
  z.object({ intent: z.literal("invite"), invite: z.string().min(10).max(300) }),
]);

type Tx = { state: string; nonce: string; verifier: string; start: z.infer<typeof startQuery>; mobile?: boolean };

const b64 = (b: Buffer) => b.toString("base64url");

/**
 * Login/daftar dengan Google (OIDC, authorization code + PKCE).
 * Status alur disimpan di cookie bertanda tangan yang berlaku 10 menit.
 */
export function googleRoutes(db: Db, cfg: { provider: GoogleProvider | null; secret: string | undefined; webUrl: string; secureCookie: boolean }) {
  // Berhasil: ke beranda. Gagal: kembali ke halaman asal alur (masuk, daftar, atau undangan), tempat pesan ditampilkan.
  const back = (error?: string, page = "/masuk") => (error ? `${cfg.webUrl}${page}?error=${error}` : `${cfg.webUrl}/?login=ok`);
  // Aplikasi mobile menerima hasilnya lewat tautan ssbapp://auth (kode sekali pakai, atau kode galat).
  const backMobile = (r: { code: string } | { error: string }) => `${MOBILE_REDIRECT}?${new URLSearchParams(r).toString()}`;
  const pageOf = (start: Tx["start"]) =>
    start.intent === "register" ? "/daftar" : start.intent === "invite" ? `/undangan/${encodeURIComponent(start.invite)}` : "/masuk";

  return new Hono<AppEnv>()
    .get("/start", async (c) => {
      if (!cfg.provider || !cfg.secret) throw new HttpError(501, "google_not_configured", "Login Google belum diaktifkan");
      const q = startQuery.safeParse(c.req.query());
      if (!q.success) throw new HttpError(400, "bad_request", "Parameter tidak valid");
      const tx: Tx = {
        state: b64(randomBytes(24)),
        nonce: b64(randomBytes(24)),
        verifier: b64(randomBytes(32)),
        start: q.data,
        ...(c.req.query("mobile") === "1" ? { mobile: true } : {}),
      };
      await setSignedCookie(c, TX_COOKIE, JSON.stringify(tx), cfg.secret, {
        httpOnly: true,
        sameSite: "Lax",
        secure: cfg.secureCookie,
        path: "/",
        maxAge: 600,
      });
      const challenge = b64(createHash("sha256").update(tx.verifier).digest());
      return c.redirect(cfg.provider.authUrl({ state: tx.state, nonce: tx.nonce, challenge }), 302);
    })

    .get("/callback", async (c) => {
      if (!cfg.provider || !cfg.secret) throw new HttpError(501, "google_not_configured", "Login Google belum diaktifkan");
      const raw = await getSignedCookie(c, cfg.secret, TX_COOKIE);
      deleteCookie(c, TX_COOKIE, { path: "/" });
      if (!raw) return c.redirect(back("sesi_google_habis"), 302);
      const tx = JSON.parse(raw) as Tx;
      const page = pageOf(tx.start);
      // Alur dari aplikasi mobile kembali lewat tautan aplikasi, bukan ke halaman web.
      const fail = (error: string) => c.redirect(tx.mobile ? backMobile({ error }) : back(error, page), 302);
      if (c.req.query("error")) return fail("google_dibatalkan");
      const code = c.req.query("code");
      if (!code || c.req.query("state") !== tx.state) return fail("state_tidak_cocok");

      let claims: Awaited<ReturnType<typeof cfg.provider.exchange>>;
      try {
        claims = await cfg.provider.exchange(code, tx.verifier);
      } catch {
        return fail("verifikasi_google_gagal");
      }
      if (claims.nonce !== tx.nonce) return fail("verifikasi_google_gagal");
      // Email dari Google hanya dipercaya bila Google sudah memverifikasinya.
      if (!claims.emailVerified || !claims.email) return fail("email_belum_terverifikasi");

      let [acc] = await db.select().from(schema.account).where(eq(schema.account.googleSub, claims.sub)).limit(1);
      if (!acc) {
        if (tx.start.intent === "login") return fail("akun_belum_terdaftar");
        const [byEmail] = await db.select().from(schema.account).where(eq(schema.account.email, claims.email)).limit(1);
        // Tidak menautkan otomatis ke akun yang sudah ada hanya karena emailnya sama.
        if (byEmail) return fail("email_sudah_terdaftar");
        try {
          [acc] = await db.insert(schema.account).values({ email: claims.email, name: claims.name, googleSub: claims.sub }).returning();
        } catch (e) {
          if (isUniqueViolation(e)) return fail("email_sudah_terdaftar");
          throw e;
        }
      }
      const account = acc!;

      let active: { ssbId: string; userId: string } | null = null;
      let error: string | undefined;
      try {
        if (tx.start.intent === "register") {
          active = await createSsb(db, account.id, account.name, tx.start);
        } else if (tx.start.intent === "invite") {
          active = await acceptInvitation(db, tx.start.invite, account);
        } else {
          active = pickActive(await listMemberships(db, account.id));
        }
      } catch (e) {
        if (e instanceof HttpError) error = e.code;
        else throw e;
      }
      // Akun tetap masuk meski langkah SSB/undangan gagal, supaya bisa mencoba lagi.
      if (!active && !error) active = pickActive(await listMemberships(db, account.id));
      if (tx.mobile) {
        // Tanpa cookie: aplikasi menukar kode sekali pakai ke token lewat POST /auth/mobile-exchange.
        if (error) return fail(error);
        return c.redirect(backMobile({ code: await createMobileLoginCode(db, account.id, active) }), 302);
      }
      await startSession(db, c, account.id, active, cfg.secureCookie);
      return c.redirect(back(error, page), 302);
    });
}
