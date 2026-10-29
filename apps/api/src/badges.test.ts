import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { BADGE_MAX, badgeCodes, type PlayerBadge } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

run("lencana pemain", () => {
  const { db, client } = createDb(url!);
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) },
    { google: null },
  );
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;
  const json = async (res: Response | Promise<Response>) =>
    (await (await res).json()) as { id: string; token: string; ssbId: string; active: { userId: string } };

  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `L ${tag}`,
      slug: `l-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku10 = (await json(call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    const ku12 = (await json(call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id;
    const kini = (await json(call("POST", "/periods", admin, { name: "Kini", startDate: iso(-60), endDate: iso(90) }))).id;
    const join = async (role: string, extra: object = {}) => {
      const inv = await json(call("POST", "/invitations", admin, { role, ...extra }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, {
        name: role,
        email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`,
        password: PASS,
      });
      expect(acc.status).toBe(201);
      const cookie = sessionOf(acc);
      return { cookie, userId: (await json(call("GET", "/auth/me", cookie))).active.userId };
    };
    const pelatih = await join("pelatih");
    expect((await call("POST", "/assignments", admin, { userId: pelatih.userId, ageGroupId: ku10, periodId: kini })).status).toBe(201);
    const mk = async (name: string, ageGroupId: string) =>
      (await json(call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId }))).id;
    const ali = await mk("Ali", ku10);
    const bima = await mk("Bima", ku10);
    const eko = await mk("Eko", ku12);
    const ortuAli = await join("orang_tua", { playerId: ali });
    return { admin, pelatih, ortuAli, ali, bima, eko };
  }
  const beri = (cookie: string, playerId: string, badge: string) => call("POST", `/players/${playerId}/badges`, cookie, { badge });
  const daftar = async (cookie: string, playerId: string) => (await (await call("GET", `/players/${playerId}/badges`, cookie)).json()) as PlayerBadge[];

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("beri, daftar, tolak duplikat, cabut, lalu beri lagi", async () => {
    const w = await world("dasar");
    const res = await beri(w.admin, w.ali, "pemimpin");
    expect(res.status).toBe(201);
    const { id } = await json(res);
    expect((await beri(w.admin, w.ali, "pemimpin")).status).toBe(409);
    const aktif = await daftar(w.admin, w.ali);
    expect(aktif).toHaveLength(1);
    expect(aktif[0]).toMatchObject({ id, badge: "pemimpin", awardedBy: "Admin" });

    expect((await call("DELETE", `/players/${w.ali}/badges/${id}`, w.admin)).status).toBe(204);
    expect(await daftar(w.admin, w.ali)).toHaveLength(0);
    expect((await call("DELETE", `/players/${w.ali}/badges/${id}`, w.admin)).status).toBe(404); // sudah dicabut
    expect((await beri(w.admin, w.ali, "pemimpin")).status).toBe(201); // lencana yang pernah dicabut boleh diberikan lagi
  });

  test("kode di luar katalog ditolak", async () => {
    const w = await world("kode");
    expect((await beri(w.admin, w.ali, "bintang_lapangan")).status).toBe(400);
    expect((await daftar(w.admin, w.ali)).length).toBe(0);
  });

  test("batas lencana aktif: serentak pun tidak melewati batas, dan mencabut membuka ruang", async () => {
    const w = await world("batas");
    const hasil = await Promise.all(badgeCodes.slice(0, BADGE_MAX + 3).map((b) => beri(w.admin, w.ali, b)));
    expect(hasil.filter((r) => r.status === 201)).toHaveLength(BADGE_MAX);
    const ditolak = hasil.filter((r) => r.status === 409);
    expect(ditolak).toHaveLength(3);
    expect((await json(ditolak[0]!.clone())) as unknown).toMatchObject({ error: { code: "badge_limit" } });
    const aktif = await daftar(w.admin, w.ali);
    expect(aktif).toHaveLength(BADGE_MAX);
    expect((await call("DELETE", `/players/${w.ali}/badges/${aktif[0]!.id}`, w.admin)).status).toBe(204);
    expect((await beri(w.admin, w.ali, badgeCodes[BADGE_MAX + 4]!)).status).toBe(201);
  });

  test("pelatih hanya untuk KU yang ditugaskan; orang tua hanya membaca anaknya", async () => {
    const w = await world("akses");
    expect((await beri(w.pelatih.cookie, w.ali, "sportif")).status).toBe(201);
    expect((await beri(w.pelatih.cookie, w.eko, "sportif")).status).toBe(404); // KU-12, tidak ditugaskan
    expect((await call("GET", `/players/${w.eko}/badges`, w.pelatih.cookie)).status).toBe(404);

    expect((await daftar(w.ortuAli.cookie, w.ali)).map((b) => b.badge)).toEqual(["sportif"]);
    expect((await call("GET", `/players/${w.bima}/badges`, w.ortuAli.cookie)).status).toBe(404); // anak orang lain
    expect((await beri(w.ortuAli.cookie, w.ali, "pemimpin")).status).toBe(403);
    const [b] = await daftar(w.admin, w.ali);
    expect((await call("DELETE", `/players/${w.ali}/badges/${b!.id}`, w.ortuAli.cookie)).status).toBe(403);
    expect((await call("GET", `/players/${w.ali}/badges`)).status).toBe(401);
  });
});
