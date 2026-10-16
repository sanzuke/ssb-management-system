import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import { hashPassword } from "./auth/password";

// Test integrasi: butuh PostgreSQL yang sudah dimigrasi, diakses dengan role ssb_app.
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("autentikasi dan otorisasi", () => {
  const { db, client } = createDb(url!);
  const app = createApp(db, { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001" });
  const created: string[] = [];
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";

  const post = (path: string, body: unknown, cookie?: string) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
  const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} });
  const cookieOf = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!;

  async function register(tag: string) {
    const slug = `uji-${tag}-${uid}`;
    const res = await post("/auth/register-ssb", {
      ssbName: `SSB ${tag}`,
      slug,
      adminName: `Admin ${tag}`,
      email: `admin@${slug}.test`,
      password: PASS,
    });
    expect(res.status).toBe(201);
    const { ssbId } = (await res.json()) as { ssbId: string };
    created.push(ssbId);
    return { slug, ssbId, email: `admin@${slug}.test`, cookie: cookieOf(res), res };
  }

  afterAll(async () => {
    for (const id of created) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await client.end();
  });

  test("daftar SSB membuat admin dan sesi yang bisa dipakai", async () => {
    const a = await register("a");
    const flags = a.res.headers.get("set-cookie")!;
    expect(flags).toContain("HttpOnly");
    expect(flags).toContain("SameSite=Lax");
    const me = await get("/auth/me", a.cookie);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ role: "admin_ssb", ssbId: a.ssbId });
  });

  test("kode SSB yang sama ditolak dengan 409", async () => {
    const a = await register("dup");
    const res = await post("/auth/register-ssb", {
      ssbName: "Lain", slug: a.slug, adminName: "X", email: "x@lain.test", password: PASS,
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("slug_taken");
  });

  test("kata sandi pendek ditolak", async () => {
    const res = await post("/auth/register-ssb", {
      ssbName: "Pendek", slug: `pendek-${uid}`, adminName: "X", email: "x@pendek.test", password: "pendek",
    });
    expect(res.status).toBe(400);
  });

  test("login berhasil, dan gagal dengan pesan sama untuk semua sebab", async () => {
    const a = await register("login");
    const ok = await post("/auth/login", { slug: a.slug, email: a.email, password: PASS });
    expect(ok.status).toBe(200);

    const wrongPass = await post("/auth/login", { slug: a.slug, email: a.email, password: "salah-salah-salah" });
    const wrongEmail = await post("/auth/login", { slug: a.slug, email: "tidak@ada.test", password: PASS });
    const wrongSlug = await post("/auth/login", { slug: `tidak-ada-${uid}`, email: a.email, password: PASS });
    const bodies = await Promise.all([wrongPass, wrongEmail, wrongSlug].map((r) => r.text()));
    for (const r of [wrongPass, wrongEmail, wrongSlug]) expect(r.status).toBe(401);
    expect(new Set(bodies).size).toBe(1);
  });

  test("tanpa sesi: /auth/me dan /users mengembalikan 401", async () => {
    expect((await get("/auth/me")).status).toBe(401);
    expect((await get("/users")).status).toBe(401);
    expect((await get("/auth/me", "ssb_session=token-palsu")).status).toBe(401);
  });

  test("logout mencabut sesi", async () => {
    const a = await register("logout");
    expect((await post("/auth/logout", {}, a.cookie)).status).toBe(200);
    expect((await get("/auth/me", a.cookie)).status).toBe(401);
  });

  test("sesi kedaluwarsa ditolak", async () => {
    const a = await register("exp");
    await db.update(schema.userSession).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.userSession.ssbId, a.ssbId));
    expect((await get("/auth/me", a.cookie)).status).toBe(401);
  });

  test("role: admin boleh /users, pelatih dan orang tua mendapat 403", async () => {
    const a = await register("role");
    const hash = await hashPassword(PASS);
    await withTenant(db, a.ssbId, (tx) =>
      tx.insert(schema.appUser).values([
        { ssbId: a.ssbId, name: "Pelatih", email: `pelatih@${a.slug}.test`, passwordHash: hash, role: "pelatih" },
        { ssbId: a.ssbId, name: "Ortu", email: `ortu@${a.slug}.test`, passwordHash: hash, role: "orang_tua" },
      ]),
    );
    const admin = await get("/users", a.cookie);
    expect(admin.status).toBe(200);
    expect(((await admin.json()) as unknown[]).length).toBe(3);

    for (const who of ["pelatih", "ortu"]) {
      const login = await post("/auth/login", { slug: a.slug, email: `${who}@${a.slug}.test`, password: PASS });
      expect(login.status).toBe(200);
      const res = await get("/users", cookieOf(login));
      expect(res.status).toBe(403);
    }
  });

  test("tenant berasal dari sesi: ssbId palsu dari klien diabaikan", async () => {
    const a = await register("iso-a");
    const b = await register("iso-b");
    const res = await app.request(`/users?ssbId=${b.ssbId}`, {
      headers: { cookie: a.cookie, "x-ssb-id": b.ssbId },
    });
    const rows = (await res.json()) as { email: string }[];
    expect(rows.map((r) => r.email)).toEqual([a.email]);
  });

  test("ganti kata sandi mencabut sesi lain dan kata sandi lama", async () => {
    const a = await register("pw");
    const other = await post("/auth/login", { slug: a.slug, email: a.email, password: PASS });
    const otherCookie = cookieOf(other);

    const wrong = await post("/auth/change-password", { currentPassword: "bukan-yang-benar", newPassword: "kata-sandi-baru-123" }, a.cookie);
    expect(wrong.status).toBe(400);

    const ok = await post("/auth/change-password", { currentPassword: PASS, newPassword: "kata-sandi-baru-123" }, a.cookie);
    expect(ok.status).toBe(200);
    expect((await get("/auth/me", a.cookie)).status).toBe(200);
    expect((await get("/auth/me", otherCookie)).status).toBe(401);
    expect((await post("/auth/login", { slug: a.slug, email: a.email, password: PASS })).status).toBe(401);
    expect((await post("/auth/login", { slug: a.slug, email: a.email, password: "kata-sandi-baru-123" })).status).toBe(200);
  });

  test("hash kata sandi dan token sesi tidak tersimpan sebagai teks asli", async () => {
    const a = await register("hash");
    const [u] = await withTenant(db, a.ssbId, (tx) => tx.select().from(schema.appUser).where(eq(schema.appUser.email, a.email)));
    expect(u!.passwordHash).toStartWith("$argon2id$");
    const token = a.cookie.split("=")[1]!;
    const [s] = await db.select().from(schema.userSession).where(eq(schema.userSession.ssbId, a.ssbId)).limit(1);
    expect(s!.tokenHash).not.toBe(token);
  });
});
