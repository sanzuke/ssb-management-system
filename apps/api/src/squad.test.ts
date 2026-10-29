import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import type { SquadRow } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

run("tabel skuad: rating, aspek, dan tren", () => {
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
      ssbName: `S ${tag}`,
      slug: `s-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku10 = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id as string;
    const ku12 = (await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id as string;
    const p1 = (await json(await call("POST", "/periods", admin, { name: "P1", startDate: iso(-400), endDate: iso(-300) }))).id as string;
    const p2 = (await json(await call("POST", "/periods", admin, { name: "P2", startDate: iso(-290), endDate: iso(-200) }))).id as string;
    const p3 = (await json(await call("POST", "/periods", admin, { name: "P3", startDate: iso(-60), endDate: iso(90) }))).id as string;
    const join = async (role: string) => {
      const inv = await json(await call("POST", "/invitations", admin, { role }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, {
        name: role,
        email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`,
        password: PASS,
      });
      expect(acc.status).toBe(201);
      const cookie = sessionOf(acc);
      return { cookie, userId: (await json(await call("GET", "/auth/me", cookie))).active.userId as string };
    };
    const pelatih = await join("pelatih");
    expect((await call("POST", "/assignments", admin, { userId: pelatih.userId, ageGroupId: ku10, periodId: p3 })).status).toBe(201);
    const ortu = await join("orang_tua");
    const mk = async (name: string, ageGroupId: string) =>
      (await json(await call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId }))).id as string;
    const ali = await mk("Ali", ku10);
    const bima = await mk("Bima", ku10);
    const eko = await mk("Eko", ku12);
    const ind = (await (await call("POST", "/assessment-indicators/defaults", admin, { ageGroupId: ku10 })).json()) as { id: string }[];
    return { admin, p1, p2, p3, pelatih, ortu, ali, bima, eko, ind };
  }
  /** Semua indikator KU-10 diisi skor sama, sehingga rata-rata tiap aspek dan keseluruhan sama dengan skor itu. */
  const nilai = (w: { admin: string; ind: { id: string }[] }, playerId: string, periodId: string, skor: number) =>
    call("PUT", `/players/${playerId}/assessments/${periodId}`, w.admin, { scores: w.ind.map((i) => ({ indicatorId: i.id, score: skor })) });

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("admin: periode terbaru, enam aspek, dan tren dari tiga periode; pemain tanpa nilai kosong", async () => {
    const w = await world("adm");
    for (const [periodId, skor] of [
      [w.p1, 4],
      [w.p2, 6],
      [w.p3, 8],
    ] as const) {
      expect((await nilai(w, w.ali, periodId, skor)).status).toBe(200);
    }
    expect((await call("GET", "/squad")).status).toBe(401);
    const list = (await (await call("GET", "/squad", w.admin)).json()) as SquadRow[];
    expect(list).toHaveLength(3);
    const ali = list.find((x) => x.playerId === w.ali);
    expect(ali).toMatchObject({ periodName: "P3", overall: 8, published: false, tren: { arah: "naik", selisih: 3 } }); // 8 dibanding rata-rata (4+6)/2 = 5
    expect(ali?.aspects).toHaveLength(6);
    expect(ali?.aspects.every((a) => a.average === 8)).toBe(true);
    expect(list.find((x) => x.playerId === w.bima)).toEqual({
      playerId: w.bima,
      periodName: null,
      overall: null,
      aspects: [],
      published: false,
      tren: { arah: "baru", selisih: null },
    });
  });

  test("pelatih hanya melihat KU yang ditugaskan; orang tua ditolak", async () => {
    const w = await world("plt");
    expect((await nilai(w, w.ali, w.p3, 6)).status).toBe(200);
    const list = (await (await call("GET", "/squad", w.pelatih.cookie)).json()) as SquadRow[];
    expect(list.map((x) => x.playerId).sort()).toEqual([w.ali, w.bima].sort()); // Eko di KU-12, tidak ditugaskan
    expect(list.find((x) => x.playerId === w.ali)?.overall).toBe(6);
    expect((await call("GET", "/squad", w.ortu.cookie)).status).toBe(403);
  });
});
