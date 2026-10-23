import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { can, permissions, renderPermissionTable, userRoleSchema, type Permission } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const roles = userRoleSchema.options;
const env = { NODE_ENV: "test" as const, ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) };

describe("matriks izin (tanpa database)", () => {
  test("setiap izin punya paling sedikit satu role, dan admin SSB memegang semuanya", () => {
    for (const p of Object.keys(permissions) as Permission[]) {
      expect(permissions[p].roles.length).toBeGreaterThan(0);
      expect(can("admin_ssb", p)).toBe(true);
    }
  });

  test("docs/izin.md sinkron dengan matriks (jalankan `bun run docs:izin` bila gagal)", () => {
    const doc = readFileSync(new URL("../../../docs/izin.md", import.meta.url), "utf8");
    expect(doc).toContain(renderPermissionTable());
  });

  test("setiap endpoint punya penjaga eksplisit; endpoint baru tanpa penjaga membuat test ini gagal", () => {
    const { db } = createDb(url ?? "postgres://x:x@localhost:1/x");
    const app = createApp(db, env, { google: null });
    // Endpoint yang memang terbuka tanpa sesi; setiap tambahan harus disengaja.
    const publik = new Set([
      "GET /health",
      "GET /auth/google/start",
      "GET /auth/google/callback",
      "POST /auth/register-ssb",
      "POST /auth/login",
      "POST /auth/logout",
      "GET /auth/features",
      "POST /auth/forgot-password",
      "GET /auth/reset-password/:token",
      "POST /auth/reset-password/:token",
      "GET /invitations/:token",
      "POST /invitations/:token/accept",
      // Landing page: tanpa sesi; hanya konten terbit dan pendaftaran trial (dibatasi laju dan kolom jebakan).
      "GET /public/site/:slug",
      "POST /public/site/:slug/trial",
    ]);
    const byRoute = new Map<string, any[]>();
    for (const r of app.routes) {
      if (r.method === "ALL") continue;
      const k = `${r.method} ${r.path}`;
      byRoute.set(k, [...(byRoute.get(k) ?? []), r.handler]);
    }
    const unguarded: string[] = [];
    for (const [k, handlers] of byRoute) {
      const guarded = handlers.some((h) => h.permission || h.access === "account");
      if (!guarded && !publik.has(k)) unguarded.push(k);
    }
    expect(unguarded).toEqual([]);
    for (const k of publik) expect(byRoute.has(k)).toBe(true); // daftar publik tidak usang
  });
});

const run = url ? describe : describe.skip;
run("matriks izin per endpoint (database)", () => {
  const { db, client } = createDb(url!);
  const app = createApp(db, env, { google: null });
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  let ssbId = "";
  const cookies: Record<string, string> = {};

  const call = (method: string, path: string, cookie: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", cookie },
      ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;

  test("siapkan satu anggota untuk tiap role", async () => {
    const reg = await app.request("/auth/register-ssb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ssbName: "Izin", slug: `izin-${uid}`, adminName: "Admin", email: `admin-izin-${uid}@uji.test`, password: PASS }),
    });
    expect(reg.status).toBe(201);
    ssbId = ((await reg.json()) as { ssbId: string }).ssbId;
    cookies.admin_ssb = sessionOf(reg);
    for (const role of ["pelatih", "korlas", "orang_tua"] as const) {
      const inv = await call("POST", "/invitations", cookies.admin_ssb!, { role });
      const { token } = (await inv.json()) as { token: string };
      const acc = await app.request(`/invitations/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: role, email: `${role}-izin-${uid}@uji.test`, password: PASS }),
      });
      expect(acc.status).toBe(201);
      cookies[role] = sessionOf(acc);
    }
  });

  // Tiap endpoint tenant yang sudah ada, dengan izin yang menjaganya.
  const endpoints: { method: string; path: string; perm: Permission; body?: unknown }[] = [
    { method: "GET", path: "/users", perm: "user.list" },
    { method: "POST", path: "/invitations", perm: "invitation.create", body: { role: "pelatih" } },
    { method: "GET", path: "/age-groups", perm: "master.read" },
    { method: "GET", path: "/periods", perm: "master.read" },
    { method: "GET", path: "/locations", perm: "master.read" },
    { method: "POST", path: "/locations", perm: "master.write", body: { name: "Lokasi uji izin" } },
    { method: "GET", path: "/players", perm: "player.read" },
    { method: "POST", path: "/players", perm: "player.write", body: { fullName: "Pemain Izin", birthDate: "2016-01-01" } },
    { method: "GET", path: "/assignments", perm: "assignment.manage" },
    { method: "GET", path: "/sessions", perm: "session.read" },
    { method: "GET", path: "/fees/settings", perm: "fee.manage" },
    { method: "GET", path: "/fees/player-overrides", perm: "fee.manage" },
    { method: "GET", path: "/fees/public-info", perm: "invoice.read" },
    { method: "GET", path: "/whatsapp/settings", perm: "fee.manage" },
    { method: "GET", path: "/site", perm: "site.manage" },
    { method: "GET", path: "/trials", perm: "trial.manage" },
  ];
  for (const e of endpoints) {
    test(`${e.method} ${e.path}: hanya role dengan izin ${e.perm} yang lolos`, async () => {
      for (const role of roles) {
        const res = await call(e.method, e.path, cookies[role]!, e.body);
        if (can(role, e.perm)) expect([role, res.status < 400]).toEqual([role, true]);
        else expect([role, res.status]).toEqual([role, 403]);
      }
      expect(
        (await app.request(e.path, { method: e.method, headers: { "content-type": "application/json" }, ...(e.method !== "GET" ? { body: "{}" } : {}) }))
          .status,
      ).toBe(401);
    });
  }

  afterAll(async () => {
    if (ssbId) await withTenant(db, ssbId, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, ssbId)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });
});
