import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

run("catatan cedera", () => {
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
  const json = async (res: Response | Promise<Response>) => (await (await res).json()) as any;

  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `C ${tag}`,
      slug: `c-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    ssbIds.push((await json(reg)).ssbId);
    const admin = sessionOf(reg);
    const ku10 = (await json(call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id as string;
    const ku12 = (await json(call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id as string;
    const periode = (await json(call("POST", "/periods", admin, { name: "Kini", startDate: iso(-60), endDate: iso(90) }))).id as string;
    const join = async (role: string, extra: object = {}) => {
      const inv = await json(call("POST", "/invitations", admin, { role, ...extra }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, {
        name: role,
        email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`,
        password: PASS,
      });
      expect(acc.status).toBe(201);
      const cookie = sessionOf(acc);
      return { cookie, userId: (await json(call("GET", "/auth/me", cookie))).active.userId as string };
    };
    const mk = async (name: string, ageGroupId: string) =>
      (await json(call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId }))).id as string;
    const ali = await mk("Ali", ku10);
    const bima = await mk("Bima", ku10);
    const eko = await mk("Eko", ku12);
    const pelatih = await join("pelatih");
    expect((await call("POST", "/assignments", admin, { userId: pelatih.userId, ageGroupId: ku10, periodId: periode })).status).toBe(201);
    const korlas = await join("korlas");
    expect((await call("POST", "/assignments", admin, { userId: korlas.userId, ageGroupId: ku10, periodId: periode })).status).toBe(201);
    const ortuAli = await join("orang_tua", { playerId: ali });
    const ortuBima = await join("orang_tua", { playerId: bima });
    return { admin, ku10, ali, bima, eko, pelatih, korlas, ortuAli, ortuBima };
  }

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await client.end();
  });

  test("alur: catat, ubah perkiraan pulih, tandai pulih; riwayat tetap ada", async () => {
    const w = await world("alur");
    const buat = await call("POST", `/players/${w.ali}/injuries`, w.pelatih.cookie, {
      bodyPart: "lutut",
      startedOn: iso(-3),
      expectedReturnOn: iso(10),
      note: "  jatuh saat latihan  ",
    });
    expect(buat.status).toBe(201);
    const [cedera] = await json(buat);
    expect(cedera).toMatchObject({
      bodyPart: "lutut",
      startedOn: iso(-3),
      expectedReturnOn: iso(10),
      recoveredOn: null,
      note: "jatuh saat latihan",
      recordedBy: "pelatih",
    });

    const ubah = await json(call("PATCH", `/players/${w.ali}/injuries/${cedera.id}`, w.admin, { expectedReturnOn: iso(20), note: "" }));
    expect(ubah[0]).toMatchObject({ expectedReturnOn: iso(20), note: null });
    // Hanya catatan saja yang diubah: perkiraan pulih tidak ikut terhapus.
    expect((await json(call("PATCH", `/players/${w.ali}/injuries/${cedera.id}`, w.admin, { note: "kontrol hari Senin" })))[0]).toMatchObject({
      expectedReturnOn: iso(20),
      note: "kontrol hari Senin",
    });

    const dua = await json(call("POST", `/players/${w.ali}/injuries`, w.admin, { bodyPart: "pergelangan_kaki", startedOn: iso(-1) }));
    expect(dua.map((x: any) => x.bodyPart)).toEqual(["pergelangan_kaki", "lutut"]); // yang berjalan, terbaru dulu

    const pulih = await json(call("POST", `/players/${w.ali}/injuries/${cedera.id}/recover`, w.pelatih.cookie, {}));
    expect(pulih.map((x: any) => [x.bodyPart, x.recoveredOn !== null])).toEqual([
      ["pergelangan_kaki", false],
      ["lutut", true],
    ]);
    expect((await call("POST", `/players/${w.ali}/injuries/${cedera.id}/recover`, w.admin, {})).status).toBe(409);
    expect((await call("PATCH", `/players/${w.ali}/injuries/${cedera.id}`, w.admin, { note: "x" })).status).toBe(409);
  });

  test("isian tidak sah ditolak", async () => {
    const w = await world("valid");
    const post = (b: object) => call("POST", `/players/${w.ali}/injuries`, w.admin, b);
    expect((await post({ bodyPart: "ekor", startedOn: iso(-1) })).status).toBe(400);
    expect((await post({ bodyPart: "lutut", startedOn: iso(30) })).status).toBe(400); // mulai di masa depan
    expect((await post({ bodyPart: "lutut", startedOn: "kemarin" })).status).toBe(400);
    const salah = await json(post({ bodyPart: "lutut", startedOn: iso(-5), expectedReturnOn: iso(-9) }));
    expect(salah.error.fields.expectedReturnOn).toContain("sebelum");
    expect((await post({ bodyPart: "lutut", startedOn: iso(-1), note: "x".repeat(501) })).status).toBe(400);
    expect((await call("PATCH", `/players/${w.ali}/injuries/${randomUUID()}`, w.admin, { note: "a" })).status).toBe(404);
    expect((await call("PATCH", `/players/${w.ali}/injuries/bukan-uuid`, w.admin, { note: "a" })).status).toBe(404);
    const [c] = await json(post({ bodyPart: "kepala", startedOn: iso(-2) }));
    expect((await call("PATCH", `/players/${w.ali}/injuries/${c.id}`, w.admin, {})).status).toBe(400);
    expect((await call("PATCH", `/players/${w.ali}/injuries/${c.id}`, w.admin, { expectedReturnOn: iso(-9) })).status).toBe(400);
    expect((await call("POST", `/players/${w.ali}/injuries/${c.id}/recover`, w.admin, { recoveredOn: iso(-9) })).status).toBe(400);
    expect((await call("POST", `/players/${w.ali}/injuries/${c.id}/recover`, w.admin, { recoveredOn: iso(-1) })).status).toBe(200);
  });

  test("akses: admin, pelatih KU-nya, korlas (baca), dan orang tua anaknya; selain itu 404 atau 403", async () => {
    const w = await world("akses");
    expect((await call("POST", `/players/${w.ali}/injuries`, w.admin, { bodyPart: "bahu", startedOn: iso(-1), note: "rahasia" })).status).toBe(201);
    const baca = async (cookie: string, id: string) => (await call("GET", `/players/${id}/injuries`, cookie)).status;

    expect(await baca(w.admin, w.ali)).toBe(200);
    expect(await baca(w.pelatih.cookie, w.ali)).toBe(200);
    expect(await baca(w.korlas.cookie, w.ali)).toBe(200);
    expect(await baca(w.ortuAli.cookie, w.ali)).toBe(200);
    expect((await json(call("GET", `/players/${w.ali}/injuries`, w.ortuAli.cookie)))[0].note).toBe("rahasia");
    // Anak orang lain dan KU yang tidak ditugaskan: tidak ada (404), bukan terlarang.
    expect(await baca(w.ortuBima.cookie, w.ali)).toBe(404);
    expect(await baca(w.pelatih.cookie, w.eko)).toBe(404);
    expect(await baca(w.korlas.cookie, w.eko)).toBe(404);
    expect(await baca(w.admin, randomUUID())).toBe(404);
    expect(await baca("", w.ali)).toBe(401);

    // Menulis: admin dan pelatih KU-nya saja.
    const tulis = (cookie: string, id: string) => call("POST", `/players/${id}/injuries`, cookie, { bodyPart: "kaki", startedOn: iso(-1) });
    expect((await tulis(w.korlas.cookie, w.ali)).status).toBe(403);
    expect((await tulis(w.ortuAli.cookie, w.ali)).status).toBe(403);
    expect((await tulis(w.pelatih.cookie, w.eko)).status).toBe(404);
    expect((await tulis(w.pelatih.cookie, w.bima)).status).toBe(201);
    const [punyaAli] = await json(call("GET", `/players/${w.ali}/injuries`, w.admin));
    expect((await call("POST", `/players/${w.ali}/injuries/${punyaAli.id}/recover`, w.ortuAli.cookie, {})).status).toBe(403);
    // Cedera milik siswa lain tidak bisa disentuh lewat siswa yang berbeda di URL.
    expect((await call("POST", `/players/${w.bima}/injuries/${punyaAli.id}/recover`, w.admin, {})).status).toBe(404);
  });

  test("SSB lain tidak melihat dan tidak bisa menulis", async () => {
    const a = await world("iso-a");
    const b = await world("iso-b");
    expect((await call("POST", `/players/${a.ali}/injuries`, a.admin, { bodyPart: "paha", startedOn: iso(-1) })).status).toBe(201);
    expect((await call("GET", `/players/${a.ali}/injuries`, b.admin)).status).toBe(404);
    expect((await call("POST", `/players/${a.ali}/injuries`, b.admin, { bodyPart: "paha", startedOn: iso(-1) })).status).toBe(404);
  });

  test("tanda cedera di absensi dan skuad tanpa catatan; hilang setelah pulih", async () => {
    const w = await world("tanda");
    const sesi = (await json(call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(2), startTime: "16:00" })))[0];
    const [c] = await json(
      call("POST", `/players/${w.ali}/injuries`, w.admin, { bodyPart: "betis", startedOn: iso(-2), expectedReturnOn: iso(7), note: "tertutup" }),
    );

    const roster = () => json(call("GET", `/sessions/${sesi.id}/attendance`, w.pelatih.cookie));
    const skuad = () => json(call("GET", "/squad", w.pelatih.cookie));
    const mark = { bodyPart: "betis", expectedReturnOn: iso(7) };

    const r = await roster();
    expect(r.players.find((p: any) => p.playerId === w.ali).injury).toEqual(mark);
    expect(r.players.find((p: any) => p.playerId === w.bima).injury).toBeNull();
    const s = await skuad();
    expect(s.find((x: any) => x.playerId === w.ali).injury).toEqual(mark);
    expect(s.find((x: any) => x.playerId === w.bima).injury).toBeNull();
    expect(JSON.stringify([r, s])).not.toContain("tertutup");

    await call("POST", `/players/${w.ali}/injuries/${c.id}/recover`, w.admin, {});
    expect((await roster()).players.every((p: any) => p.injury === null)).toBe(true);
    expect((await skuad()).every((x: any) => x.injury === null)).toBe(true);
  });
});
