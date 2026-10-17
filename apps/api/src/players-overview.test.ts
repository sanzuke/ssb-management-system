import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

run("ringkasan pemain: wali dan penilaian terakhir", () => {
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
  const json = async (res: Response) => (await res.json()) as any;

  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `O ${tag}`,
      slug: `o-${tag}-${uid}`,
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
    const lama = (await json(await call("POST", "/periods", admin, { name: "Semester lama", startDate: iso(-300), endDate: iso(-120) }))).id as string;
    const kini = (await json(await call("POST", "/periods", admin, { name: "Semester kini", startDate: iso(-60), endDate: iso(90) }))).id as string;
    const join = async (role: string, extra: object = {}, name = role) => {
      const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, {
        name,
        email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`,
        password: PASS,
      });
      expect(acc.status).toBe(201);
      const cookie = sessionOf(acc);
      return { cookie, userId: (await json(await call("GET", "/auth/me", cookie))).active.userId as string };
    };
    const pelatih = await join("pelatih");
    expect((await call("POST", "/assignments", admin, { userId: pelatih.userId, ageGroupId: ku10, periodId: kini })).status).toBe(201);
    const mk = async (name: string, ageGroupId: string) =>
      (await json(await call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId }))).id as string;
    const ali = await mk("Ali", ku10);
    const bima = await mk("Bima", ku10);
    const eko = await mk("Eko", ku12);
    const ind = (await json(await call("POST", "/assessment-indicators/defaults", admin, { ageGroupId: ku10 }))) as any[];
    return { ssbId, admin, ku10, lama, kini, pelatih, ali, bima, eko, ind, join };
  }
  /** Mengisi semua indikator KU-10 dengan skor yang sama, sehingga rata-ratanya sama dengan skor itu. */
  const nilai = (w: Awaited<ReturnType<typeof world>>, playerId: string, periodId: string, skor: number) =>
    call("PUT", `/players/${playerId}/assessments/${periodId}`, w.admin, { scores: w.ind.map((i) => ({ indicatorId: i.id, score: skor })) });

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("admin: wali utama dan penilaian periode terbaru; pemain tanpa data bernilai null", async () => {
    const w = await world("adm");
    // Dua wali untuk Ali: yang ditampilkan menurut urutan nama (Bu Citra lebih dulu dari Pak Agus), jumlahnya tercatat.
    await w.join("orang_tua", { playerId: w.ali }, "Bu Citra");
    await w.join("orang_tua", { playerId: w.ali }, "Pak Agus");
    // WhatsApp belum punya jalur pengisian lewat API, jadi diisi langsung untuk uji.
    await withTenant(db, w.ssbId, (tx) => tx.update(schema.appUser).set({ whatsapp: "081200000001" }).where(eq(schema.appUser.name, "Bu Citra")));
    expect((await nilai(w, w.ali, w.lama, 5)).status).toBe(200);
    expect((await nilai(w, w.ali, w.kini, 8)).status).toBe(200);

    expect((await call("GET", "/players-overview")).status).toBe(401);
    const res = await call("GET", "/players-overview", w.admin);
    expect(res.status).toBe(200);
    const list = (await json(res)) as any[];
    expect(list).toHaveLength(3);
    const ali = list.find((x) => x.playerId === w.ali);
    expect(ali.guardian).toEqual({ name: "Bu Citra", whatsapp: "081200000001", relationship: null, total: 2 });
    expect(ali.latestAssessment).toMatchObject({ periodName: "Semester kini", overall: 8, published: false });
    const bima = list.find((x) => x.playerId === w.bima);
    expect(bima).toEqual({ playerId: w.bima, guardian: null, latestAssessment: null });
  });

  test("pelatih: tanpa data wali, hanya pemain KU yang ditugaskan, termasuk penilaian belum terbit", async () => {
    const w = await world("plt");
    await w.join("orang_tua", { playerId: w.ali }, "Bu Dewi");
    expect((await nilai(w, w.ali, w.kini, 6)).status).toBe(200);
    const list = (await json(await call("GET", "/players-overview", w.pelatih.cookie))) as any[];
    expect(list.map((x) => x.playerId).sort()).toEqual([w.ali, w.bima].sort()); // Eko di KU-12, tidak ditugaskan
    expect(list.every((x) => x.guardian === null)).toBe(true);
    expect(list.find((x) => x.playerId === w.ali).latestAssessment).toMatchObject({ overall: 6, published: false });
  });

  test("orang tua: hanya anaknya dan hanya penilaian yang sudah terbit", async () => {
    const w = await world("ortu");
    const ortu = await w.join("orang_tua", { playerId: w.ali }, "Bu Eka");
    expect((await nilai(w, w.ali, w.lama, 7)).status).toBe(200);
    expect((await call("POST", `/players/${w.ali}/assessments/${w.lama}/publish`, w.admin)).status).toBeLessThan(300);
    expect((await nilai(w, w.ali, w.kini, 9)).status).toBe(200); // lebih baru, tapi belum terbit
    const list = (await json(await call("GET", "/players-overview", ortu.cookie))) as any[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ playerId: w.ali, guardian: null });
    expect(list[0].latestAssessment).toMatchObject({ periodName: "Semester lama", overall: 7, published: true });
  });
});
