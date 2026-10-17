import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import type { GoogleClaims, GoogleProvider } from "./auth/google";

// Test integrasi: butuh PostgreSQL yang sudah dimigrasi, diakses dengan role ssb_app.
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

/** Penyedia Google tiruan: tidak memanggil jaringan, dan mengembalikan klaim yang diatur test. */
class FakeGoogle implements GoogleProvider {
  claims: Omit<GoogleClaims, "nonce"> = { sub: "", email: "", emailVerified: true, name: "" };
  nonceOverride: string | undefined;
  private lastNonce = "";
  authUrl(p: { state: string; nonce: string; challenge: string }) {
    this.lastNonce = p.nonce;
    return `https://fake.google/auth?state=${p.state}&nonce=${p.nonce}&challenge=${p.challenge}`;
  }
  async exchange(code: string, verifier: string): Promise<GoogleClaims> {
    if (code !== "ok" || !verifier) throw new Error("kode salah");
    return { ...this.claims, nonce: this.nonceOverride ?? this.lastNonce };
  }
}

run("autentikasi, akun global, dan undangan", () => {
  const { db, client } = createDb(url!);
  const fake = new FakeGoogle();
  const baseEnv = { NODE_ENV: "test" as const, ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) };
  const app = createApp(db, baseEnv, { google: fake });
  const appNoGoogle = createApp(db, baseEnv, { google: null });
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];

  const req = (a: typeof app, method: string, path: string, body?: unknown, cookie?: string) =>
    a.request(path, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  const post = (path: string, body: unknown, cookie?: string) => req(app, "POST", path, body, cookie);
  const get = (path: string, cookie?: string) => req(app, "GET", path, undefined, cookie);
  const cookieNamed = (res: Response, name: string) => {
    const line = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
    return line ? line.split(";")[0]! : undefined;
  };
  const sessionOf = (res: Response) => cookieNamed(res, "ssb_session")!;
  const json = async <T = any>(res: Response) => (await res.json()) as T;

  async function register(tag: string) {
    const slug = `uji-${tag}-${uid}`;
    const email = `admin-${tag}-${uid}@uji.test`;
    const res = await post("/auth/register-ssb", { ssbName: `SSB ${tag}`, slug, adminName: `Admin ${tag}`, email, password: PASS });
    expect(res.status).toBe(201);
    const body = await json<{ ssbId: string; accountId: string }>(res);
    ssbIds.push(body.ssbId);
    return { slug, email, ssbId: body.ssbId, accountId: body.accountId, cookie: sessionOf(res), res };
  }

  async function invite(admin: { cookie: string }, role: string, extra: object = {}) {
    const res = await post("/invitations", { role, ...extra }, admin.cookie);
    expect(res.status).toBe(201);
    return (await json<{ token: string }>(res)).token;
  }

  async function joinAsNew(token: string, tag: string) {
    const email = `${tag}-${uid}@uji.test`;
    const res = await post(`/invitations/${token}/accept`, { name: tag, email, password: PASS });
    expect(res.status).toBe(201);
    return { email, cookie: sessionOf(res) };
  }

  afterAll(async () => {
    // SSB dulu (keanggotaan, undangan, dan sisanya ikut terhapus), baru akun global.
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  // ---- Email + kata sandi ----

  test("daftar SSB membuat akun, SSB, admin, dan sesi", async () => {
    const a = await register("a");
    const flags = a.res.headers.getSetCookie().join("\n");
    expect(flags).toContain("HttpOnly");
    expect(flags).toContain("SameSite=Lax");
    const me = await json(await get("/auth/me", a.cookie));
    expect(me.active).toMatchObject({ ssbId: a.ssbId, role: "admin_ssb" });
    expect(me.memberships).toHaveLength(1);
  });

  test("kode SSB atau email yang sudah ada ditolak dengan 409; kata sandi pendek 400", async () => {
    const a = await register("dup");
    const sameSlug = await post("/auth/register-ssb", { ssbName: "Lain", slug: a.slug, adminName: "X", email: `lain-${uid}@uji.test`, password: PASS });
    expect(sameSlug.status).toBe(409);
    expect((await json(sameSlug)).error.code).toBe("slug_taken");
    const sameEmail = await post("/auth/register-ssb", { ssbName: "Lain", slug: `lain-${uid}`, adminName: "X", email: a.email, password: PASS });
    expect(sameEmail.status).toBe(409);
    expect((await json(sameEmail)).error.code).toBe("email_taken");
    const short = await post("/auth/register-ssb", {
      ssbName: "Pendek",
      slug: `pendek-${uid}`,
      adminName: "X",
      email: `p-${uid}@uji.test`,
      password: "pendek",
    });
    expect(short.status).toBe(400);
    const err = await json(short);
    expect(err.error.code).toBe("validation");
    expect(err.error.fields.password).toBe("minimal 10 karakter");
  });

  test("login berhasil; gagal dengan respons sama untuk semua sebab", async () => {
    const a = await register("login");
    const ok = await post("/auth/login", { email: a.email, password: PASS });
    expect(ok.status).toBe(200);
    expect(await json(ok)).toMatchObject({ selected: true });

    const wrongPass = await post("/auth/login", { email: a.email, password: "salah-salah-salah" });
    const unknown = await post("/auth/login", { email: `tidak-ada-${uid}@uji.test`, password: PASS });
    const bodies = await Promise.all([wrongPass, unknown].map((r) => r.text()));
    for (const r of [wrongPass, unknown]) expect(r.status).toBe(401);
    expect(new Set(bodies).size).toBe(1);
  });

  test("tanpa sesi: 401; sesi palsu: 401", async () => {
    expect((await get("/auth/me")).status).toBe(401);
    expect((await get("/users")).status).toBe(401);
    expect((await get("/auth/me", "ssb_session=token-palsu")).status).toBe(401);
  });

  test("logout mencabut sesi; sesi kedaluwarsa ditolak", async () => {
    const a = await register("logout");
    expect((await post("/auth/logout", {}, a.cookie)).status).toBe(200);
    expect((await get("/auth/me", a.cookie)).status).toBe(401);

    const b = await register("exp");
    await db
      .update(schema.userSession)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.userSession.accountId, b.accountId));
    expect((await get("/auth/me", b.cookie)).status).toBe(401);
  });

  test("tenant berasal dari sesi: ssbId palsu dari klien diabaikan", async () => {
    const a = await register("iso-a");
    const b = await register("iso-b");
    const res = await app.request(`/users?ssbId=${b.ssbId}`, { headers: { cookie: a.cookie, "x-ssb-id": b.ssbId } });
    expect((await json<{ email: string }[]>(res)).map((r) => r.email)).toEqual([a.email]);
  });

  test("ganti kata sandi mencabut sesi lain dan kata sandi lama", async () => {
    const a = await register("pw");
    const otherCookie = sessionOf(await post("/auth/login", { email: a.email, password: PASS }));
    expect((await post("/auth/change-password", { currentPassword: "bukan-yang-benar", newPassword: "kata-sandi-baru-123" }, a.cookie)).status).toBe(400);
    expect((await post("/auth/change-password", { currentPassword: PASS, newPassword: "kata-sandi-baru-123" }, a.cookie)).status).toBe(200);
    expect((await get("/auth/me", a.cookie)).status).toBe(200);
    expect((await get("/auth/me", otherCookie)).status).toBe(401);
    expect((await post("/auth/login", { email: a.email, password: PASS })).status).toBe(401);
    expect((await post("/auth/login", { email: a.email, password: "kata-sandi-baru-123" })).status).toBe(200);
  });

  test("hash kata sandi argon2id; token sesi tidak tersimpan sebagai teks asli", async () => {
    const a = await register("hash");
    const [acc] = await db.select().from(schema.account).where(eq(schema.account.id, a.accountId));
    expect(acc!.passwordHash).toStartWith("$argon2id$");
    const [s] = await db.select().from(schema.userSession).where(eq(schema.userSession.accountId, a.accountId)).limit(1);
    expect(s!.tokenHash).not.toBe(a.cookie.split("=")[1]);
  });

  // ---- Undangan dan role ----

  test("undangan: pelatih bergabung, role dijaga; hanya admin yang boleh mengundang", async () => {
    const a = await register("inv");
    const token = await invite(a, "pelatih", { label: "Coach Budi" });

    const preview = await get(`/invitations/${token}`);
    expect(await json(preview)).toMatchObject({ ssbName: "SSB inv", role: "pelatih", label: "Coach Budi" });

    const coach = await joinAsNew(token, "coach");
    const me = await json(await get("/auth/me", coach.cookie));
    expect(me.active).toMatchObject({ ssbId: a.ssbId, role: "pelatih" });

    expect((await get("/users", coach.cookie)).status).toBe(403);
    expect((await post("/invitations", { role: "pelatih" }, coach.cookie)).status).toBe(403);
    const users = await json<unknown[]>(await get("/users", a.cookie));
    expect(users).toHaveLength(2);
  });

  test("undangan orang tua menghubungkan akun ke pemain", async () => {
    const a = await register("ortu");
    const [p] = await withTenant(db, a.ssbId, (tx) =>
      tx.insert(schema.player).values({ ssbId: a.ssbId, fullName: "Anak", birthDate: "2016-01-01" }).returning(),
    );
    const token = await invite(a, "orang_tua", { playerId: p!.id });
    await joinAsNew(token, "ortu");
    const links = await withTenant(db, a.ssbId, (tx) => tx.select().from(schema.playerGuardian));
    expect(links).toHaveLength(1);
    expect(links[0]!.playerId).toBe(p!.id);
  });

  test("undangan sekali pakai, kedaluwarsa, dan token palsu ditolak", async () => {
    const a = await register("inv2");
    const token = await invite(a, "korlas");
    await joinAsNew(token, "korlas1");
    expect((await post(`/invitations/${token}/accept`, { name: "L", email: `lagi-${uid}@uji.test`, password: PASS })).status).toBe(404);

    const expired = await invite(a, "pelatih");
    await withTenant(db, a.ssbId, (tx) => tx.update(schema.invitation).set({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await get(`/invitations/${expired}`)).status).toBe(404);

    const other = await register("inv3");
    const secret = (await invite(other, "pelatih")).split(".")[1];
    expect((await get(`/invitations/${a.ssbId}.${secret}`)).status).toBe(404); // rahasia SSB lain
    expect((await get("/invitations/bukan-token")).status).toBe(404);
  });

  test("akun yang sama bisa menjadi anggota beberapa SSB dan memilih SSB aktif", async () => {
    const a = await register("multi-a");
    const b = await register("multi-b");
    const token = await invite(b, "orang_tua");

    // Admin SSB A menerima undangan SSB B dengan akun yang sama.
    const join = await post(`/invitations/${token}/accept`, {}, a.cookie);
    expect(join.status).toBe(200);
    expect((await post(`/invitations/${token}/accept`, {}, a.cookie)).status).toBe(404);

    // Login tanpa kode SSB: dua keanggotaan, belum ada yang terpilih.
    const login = await post("/auth/login", { email: a.email, password: PASS });
    const body = await json(login);
    expect(body.selected).toBe(false);
    expect(body.memberships).toHaveLength(2);
    const cookie = sessionOf(login);
    expect((await get("/users", cookie)).status).toBe(403);
    expect((await json(await get("/users", cookie))).error.code).toBe("ssb_not_selected");

    expect((await post("/auth/select", { ssbId: a.ssbId }, cookie)).status).toBe(200);
    expect((await get("/users", cookie)).status).toBe(200); // admin di SSB A
    expect((await post("/auth/select", { ssbId: b.ssbId }, cookie)).status).toBe(200);
    expect((await get("/users", cookie)).status).toBe(403); // orang tua di SSB B

    const stranger = await register("multi-c");
    expect((await post("/auth/select", { ssbId: stranger.ssbId }, cookie)).status).toBe(403);

    // Login dengan kode SSB langsung memilih SSB itu.
    const bySlug = await post("/auth/login", { email: a.email, password: PASS, slug: b.slug });
    expect((await json(bySlug)).selected).toBe(true);
    expect((await json(await get("/auth/me", sessionOf(bySlug)))).active.ssbId).toBe(b.ssbId);
  });

  test("akun membuat SSB tambahan dari akunnya", async () => {
    const a = await register("extra");
    const res = await post("/auth/ssb", { ssbName: "Cabang", slug: `cabang-${uid}` }, a.cookie);
    expect(res.status).toBe(201);
    ssbIds.push((await json(res)).ssbId);
    expect((await json(await get("/auth/me", a.cookie))).memberships).toHaveLength(2);
  });

  // ---- Google ----

  async function googleFlow(query: string, claims: Partial<Omit<GoogleClaims, "nonce">>, tweak?: () => void) {
    fake.claims = { sub: `sub-${randomUUID()}`, email: `g-${uid}@uji.test`, emailVerified: true, name: "Nama Google", ...claims };
    fake.nonceOverride = undefined;
    const start = await get(`/auth/google/start?${query}`);
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get("location")!);
    expect(loc.host).toBe("fake.google");
    tweak?.();
    const state = loc.searchParams.get("state");
    const cb = await get(`/auth/google/callback?code=ok&state=${state}`, cookieNamed(start, "oauth_tx"));
    return { cb, location: cb.headers.get("location")!, cookie: cookieNamed(cb, "ssb_session") };
  }

  test("Google: start mengalihkan dengan state, nonce, dan PKCE", async () => {
    const res = await get("/auth/google/start?intent=login");
    const loc = new URL(res.headers.get("location")!);
    for (const k of ["state", "nonce", "challenge"]) expect(loc.searchParams.get(k)).toBeTruthy();
    expect(cookieNamed(res, "oauth_tx")).toBeTruthy();
    expect(res.headers.getSetCookie().join("\n")).toContain("HttpOnly");
  });

  test("CSRF: permintaan tanpa content-type dari origin asing ditolak dengan 403, bukan 500", async () => {
    const res = await app.request("/auth/logout", { method: "POST", headers: { origin: "http://jahat.test" } });
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe("forbidden");
  });

  test("Google: tidak aktif mengembalikan 501", async () => {
    expect((await req(appNoGoogle, "GET", "/auth/google/start?intent=login")).status).toBe(501);
  });

  test("Google: daftar SSB baru, lalu login kembali dengan akun yang sama", async () => {
    const email = `g-reg-${uid}@uji.test`;
    const sub = `sub-reg-${uid}`;
    const reg = await googleFlow(`intent=register&ssbName=SSB+Google&slug=google-${uid}`, { sub, email });
    expect(reg.location).toBe("http://web.test/?login=ok");
    const me = await json(await get("/auth/me", reg.cookie));
    expect(me.active).toMatchObject({ role: "admin_ssb", ssbName: "SSB Google" });
    ssbIds.push(me.active.ssbId);
    const [acc] = await db.select().from(schema.account).where(eq(schema.account.email, email));
    expect(acc).toMatchObject({ googleSub: sub, passwordHash: null });

    const again = await googleFlow("intent=login", { sub, email });
    expect(again.location).toBe("http://web.test/?login=ok");
    expect((await json(await get("/auth/me", again.cookie))).active.ssbId).toBe(me.active.ssbId);

    // Akun Google-only menambahkan kata sandi tanpa kata sandi lama, lalu bisa login dengan email.
    expect((await post("/auth/change-password", { newPassword: "kata-sandi-baru-123" }, again.cookie)).status).toBe(200);
    expect((await post("/auth/login", { email, password: "kata-sandi-baru-123" })).status).toBe(200);
  });

  test("Google: login akun yang belum terdaftar ditolak dan tidak membuat akun", async () => {
    const email = `g-baru-${uid}@uji.test`;
    const r = await googleFlow("intent=login", { email });
    expect(r.location).toBe("http://web.test/masuk?error=akun_belum_terdaftar");
    expect(r.cookie).toBeUndefined();
    expect(await db.select().from(schema.account).where(eq(schema.account.email, email))).toHaveLength(0);
  });

  test("Google: email belum terverifikasi, state salah, dan nonce salah ditolak", async () => {
    const unverified = await googleFlow("intent=register&ssbName=X+SSB&slug=tidak-jadi", { email: `g-uv-${uid}@uji.test`, emailVerified: false });
    expect(unverified.location).toContain("error=email_belum_terverifikasi");

    fake.claims = { sub: "s", email: `g-st-${uid}@uji.test`, emailVerified: true, name: "N" };
    const start = await get("/auth/google/start?intent=login");
    const bad = await get("/auth/google/callback?code=ok&state=state-palsu", cookieNamed(start, "oauth_tx"));
    expect(bad.headers.get("location")).toContain("error=state_tidak_cocok");

    const noCookie = await get("/auth/google/callback?code=ok&state=apa-saja");
    expect(noCookie.headers.get("location")).toContain("error=sesi_google_habis");

    const nonce = await googleFlow("intent=login", { email: `g-nc-${uid}@uji.test` }, () => (fake.nonceOverride = "nonce-lain"));
    expect(nonce.location).toContain("error=verifikasi_google_gagal");
  });

  test("Google: email yang sudah punya akun kata sandi tidak ditautkan otomatis", async () => {
    const a = await register("gtaut");
    const r = await googleFlow(`intent=register&ssbName=Curi&slug=curi-${uid}`, { email: a.email, sub: `sub-curi-${uid}` });
    expect(r.location).toContain("error=email_sudah_terdaftar");
    expect(r.cookie).toBeUndefined();
    const [acc] = await db.select().from(schema.account).where(eq(schema.account.email, a.email));
    expect(acc!.googleSub).toBeNull();
  });

  test("Google: menerima undangan membuat akun dan keanggotaan", async () => {
    const a = await register("ginv");
    const token = await invite(a, "pelatih");
    const r = await googleFlow(`intent=invite&invite=${encodeURIComponent(token)}`, { email: `g-coach-${uid}@uji.test` });
    expect(r.location).toBe("http://web.test/?login=ok");
    expect((await json(await get("/auth/me", r.cookie))).active).toMatchObject({ ssbId: a.ssbId, role: "pelatih" });

    // Undangan yang sama tidak bisa dipakai lagi lewat Google.
    const again = await googleFlow(`intent=invite&invite=${encodeURIComponent(token)}`, { email: `g-coach2-${uid}@uji.test` });
    expect(again.location).toContain("error=invalid_invitation");
  });
});
