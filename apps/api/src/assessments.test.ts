import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { defaultIndicators } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const DEFAULT_COUNT = Object.values(defaultIndicators).flat().length;

run("penilaian pemain (skala 1-10)", () => {
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
    const period = (await json(await call("POST", "/periods", admin, { name: "Semester 1", startDate: iso(-60), endDate: iso(90) }))).id as string;
    const join = async (role: string, playerId?: string) => {
      const inv = await json(await call("POST", "/invitations", admin, { role, ...(playerId ? { playerId } : {}) }));
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
    const korlas = await join("korlas");
    for (const u of [pelatih, korlas])
      expect((await call("POST", "/assignments", admin, { userId: u.userId, ageGroupId: ku10, periodId: period })).status).toBe(201);
    const mk = async (name: string, ageGroupId: string) =>
      (await json(await call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId }))).id as string;
    const ali = await mk("Ali", ku10);
    const bima = await mk("Bima", ku10);
    const eko = await mk("Eko", ku12);
    const ind10 = (await json(await call("POST", "/assessment-indicators/defaults", admin, { ageGroupId: ku10 }))) as any[];
    const ind12 = (await json(await call("POST", "/assessment-indicators/defaults", admin, { ageGroupId: ku12 }))) as any[];
    const byName = (list: any[], n: string) => list.find((i) => i.name === n)!.id as string;
    return { ssbId, admin, ku10, ku12, period, pelatih, korlas, ali, bima, eko, ind10, ind12, byName, join };
  }

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("template indikator: usulan awal, ganda, nonaktif, hapus, dan batas role", async () => {
    const w = await world("tpl");
    expect(w.ind10).toHaveLength(DEFAULT_COUNT);
    expect(w.ind10.filter((i) => i.aspect === "technical").map((i) => i.name)).toEqual(["Kontrol bola", "Passing", "Dribbling", "Shooting"]);
    // aman diulang
    expect((await json(await call("POST", "/assessment-indicators/defaults", w.admin, { ageGroupId: w.ku10 }))).length).toBe(DEFAULT_COUNT);
    // tambah, ganda, KU tak dikenal
    const extra = await call("POST", "/assessment-indicators", w.admin, { ageGroupId: w.ku10, aspect: "mental", name: "Disiplin" });
    expect(extra.status).toBe(201);
    const extraId = (await json(extra)).id as string;
    expect((await call("POST", "/assessment-indicators", w.admin, { ageGroupId: w.ku10, aspect: "mental", name: "Disiplin" })).status).toBe(409);
    expect((await call("POST", "/assessment-indicators", w.admin, { ageGroupId: randomUUID(), aspect: "mental", name: "Disiplin" })).status).toBe(422);
    expect((await call("POST", "/assessment-indicators", w.admin, { ageGroupId: w.ku10, aspect: "bukan-aspek", name: "Disiplin" })).status).toBe(400);
    // ubah dan nonaktifkan
    const patched = await json(await call("PATCH", `/assessment-indicators/${extraId}`, w.admin, { name: "Disiplin latihan", active: false }));
    expect(patched).toMatchObject({ name: "Disiplin latihan", active: false });
    expect((await call("PATCH", `/assessment-indicators/${randomUUID()}`, w.admin, { name: "Apa saja", active: true })).status).toBe(404);
    // hapus yang belum dipakai: boleh; yang sudah dipakai skor: 409
    expect((await call("DELETE", `/assessment-indicators/${extraId}`, w.admin)).status).toBe(204);
    expect(
      (await call("PUT", `/players/${w.ali}/assessments/${w.period}`, w.pelatih.cookie, { scores: [{ indicatorId: w.byName(w.ind10, "Passing"), score: 7 }] }))
        .status,
    ).toBe(200);
    expect((await json(await call("DELETE", `/assessment-indicators/${w.byName(w.ind10, "Passing")}`, w.admin))).error.code).toBe("in_use");
    // filter per KU dan batas role: pelatih boleh baca, tidak boleh ubah; orang tua tidak boleh
    expect((await json(await call("GET", `/assessment-indicators?ageGroupId=${w.ku12}`, w.pelatih.cookie))).length).toBe(DEFAULT_COUNT);
    expect((await call("POST", "/assessment-indicators", w.pelatih.cookie, { ageGroupId: w.ku10, aspect: "mental", name: "Baru" })).status).toBe(403);
    expect((await call("POST", "/assessment-indicators/defaults", w.pelatih.cookie, { ageGroupId: w.ku10 })).status).toBe(403);
    const ortu = await w.join("orang_tua", w.ali);
    expect((await call("GET", "/assessment-indicators", ortu.cookie)).status).toBe(403);
    expect((await call("GET", "/assessment-indicators")).status).toBe(401);
    // SSB lain tidak melihat indikator ini
    const other = await world("tplB");
    expect((await json(await call("GET", "/assessment-indicators", other.admin))).every((i: any) => i.ageGroupId !== w.ku10)).toBe(true);
    expect((await call("PATCH", `/assessment-indicators/${w.byName(w.ind10, "Fokus")}`, other.admin, { name: "Diretas", active: true })).status).toBe(404);
  });

  test("input penilaian: skor 1-10, rata-rata, dan semua penolakan", async () => {
    const w = await world("skor");
    const id = (n: string) => w.byName(w.ind10, n);
    const put = (body: unknown, cookie = w.pelatih.cookie, player = w.ali) => call("PUT", `/players/${player}/assessments/${w.period}`, cookie, body);

    const ok = await put({
      note: "Berkembang baik",
      scores: [
        { indicatorId: id("Kontrol bola"), score: 8 },
        { indicatorId: id("Passing"), score: 6 },
        { indicatorId: id("Fokus"), score: 9 },
      ],
    });
    expect(ok.status).toBe(200);
    const a = await json(ok);
    expect(a).toMatchObject({
      note: "Berkembang baik",
      ageGroup: { name: "KU-10" },
      period: { name: "Semester 1" },
      publishedAt: null,
      assessor: "pelatih",
      overall: 7.7,
    });
    expect(a.aspects).toEqual([
      { aspect: "technical", average: 7 },
      { aspect: "mental", average: 9 },
    ]);
    expect(a.scores).toHaveLength(3);

    // nilai di luar skala atau bukan bilangan bulat ditolak (400) dan tidak ada yang tersimpan
    for (const bad of [0, 11, -1, 5.5, "8", null]) {
      const r = await put({ scores: [{ indicatorId: id("Dribbling"), score: bad }] });
      expect(r.status).toBe(400);
      expect(Object.keys((await json(r)).error.fields)[0]).toBe("scores.0.score");
    }
    expect((await put({ scores: [] })).status).toBe(400);
    expect(
      (
        await put({
          scores: [
            { indicatorId: id("Dribbling"), score: 10 },
            { indicatorId: id("Shooting"), score: 1 },
          ],
        })
      ).status,
    ).toBe(200); // batas 1 dan 10 sah
    // indikator KU lain, nonaktif, ganda, tak dikenal
    expect((await json(await put({ scores: [{ indicatorId: w.byName(w.ind12, "Passing"), score: 5 }] }))).error.code).toBe("indicator_invalid");
    expect((await call("PATCH", `/assessment-indicators/${id("Kecepatan")}`, w.admin, { name: "Kecepatan", active: false })).status).toBe(200);
    expect((await json(await put({ scores: [{ indicatorId: id("Kecepatan"), score: 5 }] }))).error.code).toBe("indicator_invalid");
    expect(
      (
        await json(
          await put({
            scores: [
              { indicatorId: id("Fokus"), score: 5 },
              { indicatorId: id("Fokus"), score: 6 },
            ],
          }),
        )
      ).error.code,
    ).toBe("duplicate_indicator");
    expect((await put({ scores: [{ indicatorId: randomUUID(), score: 5 }] })).status).toBe(422);
    // periode tak ada, pemain bukan KU yang ditugaskan, peran tanpa izin
    expect(
      (await call("PUT", `/players/${w.ali}/assessments/${randomUUID()}`, w.pelatih.cookie, { scores: [{ indicatorId: id("Fokus"), score: 5 }] })).status,
    ).toBe(404);
    expect((await put({ scores: [{ indicatorId: w.byName(w.ind12, "Fokus"), score: 5 }] }, w.pelatih.cookie, w.eko)).status).toBe(404);
    expect((await put({ scores: [{ indicatorId: id("Fokus"), score: 5 }] }, w.korlas.cookie)).status).toBe(403);
    // admin boleh; satu penilaian per pemain per periode (diperbarui, bukan ganda)
    expect((await put({ scores: [{ indicatorId: id("Fokus"), score: 10 }] }, w.admin, w.bima)).status).toBe(200);
    const list = await json(await call("GET", `/players/${w.ali}/assessments`, w.pelatih.cookie));
    expect(list).toHaveLength(1);
    expect(list[0].scores.find((s: any) => s.name === "Fokus").score).toBe(9); // gagal-gagalan di atas tidak mengubah apa pun
    // pemain tanpa KU belum bisa dinilai
    const noKu = (await json(await call("POST", "/players", w.admin, { fullName: "Tanpa KU", birthDate: "2015-05-05" }))).id as string;
    expect((await json(await put({ scores: [{ indicatorId: id("Fokus"), score: 5 }] }, w.admin, noKu))).error.code).toBe("no_age_group");
    // batas CHECK di database sendiri
    await expect(
      withTenant(db, w.ssbId, (tx) =>
        tx.insert(schema.assessmentScore).values({ ssbId: w.ssbId, assessmentId: a.id, indicatorId: id("Kecepatan"), score: 11 }),
      ),
    ).rejects.toThrow();
  });

  test("jejak perubahan skor: siapa, kapan, nilai lama dan baru", async () => {
    const w = await world("jejak");
    const id = (n: string) => w.byName(w.ind10, n);
    const put = (cookie: string, scores: { indicatorId: string; score: number }[]) =>
      call("PUT", `/players/${w.ali}/assessments/${w.period}`, cookie, { scores });
    expect(
      (
        await put(w.pelatih.cookie, [
          { indicatorId: id("Fokus"), score: 6 },
          { indicatorId: id("Passing"), score: 5 },
        ])
      ).status,
    ).toBe(200);
    expect(
      (
        await put(w.admin, [
          { indicatorId: id("Fokus"), score: 8 },
          { indicatorId: id("Passing"), score: 5 },
        ])
      ).status,
    ).toBe(200); // Passing tidak berubah
    const hist = await json(await call("GET", `/players/${w.ali}/assessments/${w.period}/history`, w.korlas.cookie));
    const fokus = hist.filter((h: any) => h.indicator === "Fokus");
    expect(fokus.map((h: any) => [h.from, h.to, h.by])).toEqual([
      [6, 8, "Admin"],
      [null, 6, "pelatih"],
    ]);
    expect(hist.filter((h: any) => h.indicator === "Passing")).toHaveLength(1); // hanya pencatatan awal
    expect(hist[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((await call("GET", `/players/${w.bima}/assessments/${w.period}/history`, w.admin)).status).toBe(404);
    // pelatih yang dihapus: penilaian dan jejak tetap, namanya dikosongkan
    await withTenant(db, w.ssbId, (tx) => tx.delete(schema.appUser).where(eq(schema.appUser.id, w.pelatih.userId)));
    const after = await json(await call("GET", `/players/${w.ali}/assessments/${w.period}/history`, w.admin));
    expect(after.find((h: any) => h.to === 6 && h.indicator === "Fokus").by).toBeNull();
    expect((await json(await call("GET", `/players/${w.ali}/assessments`, w.admin)))[0].assessor).toBe("Admin"); // penilai terakhir admin
  });

  test("penerbitan dan orang tua: hanya anak sendiri dan hanya yang terbit", async () => {
    const w = await world("terbit");
    const id = (n: string) => w.byName(w.ind10, n);
    expect(
      (await call("PUT", `/players/${w.ali}/assessments/${w.period}`, w.pelatih.cookie, { scores: [{ indicatorId: id("Fokus"), score: 7 }] })).status,
    ).toBe(200);
    expect(
      (await call("PUT", `/players/${w.bima}/assessments/${w.period}`, w.pelatih.cookie, { scores: [{ indicatorId: id("Fokus"), score: 4 }] })).status,
    ).toBe(200);
    const ortu = await w.join("orang_tua", w.ali);
    const read = (player: string, cookie = ortu.cookie) => call("GET", `/players/${player}/assessments`, cookie);
    expect(await json(await read(w.ali))).toEqual([]); // belum terbit
    // yang berhak menerbitkan: admin dan korlas (sementara); pelatih dan orang tua tidak
    expect((await call("POST", `/players/${w.ali}/assessments/${w.period}/publish`, w.pelatih.cookie)).status).toBe(403);
    expect((await call("POST", `/players/${w.ali}/assessments/${w.period}/publish`, ortu.cookie)).status).toBe(403);
    const pub = await call("POST", `/players/${w.ali}/assessments/${w.period}/publish`, w.korlas.cookie);
    expect(pub.status).toBe(200);
    expect((await json(pub)).publishedAt).toMatch(/^\d{4}-/);
    const seen = await json(await read(w.ali));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ overall: 7, period: { name: "Semester 1" } });
    // anak orang lain: tertutup walau sudah terbit
    expect((await call("POST", `/players/${w.bima}/assessments/${w.period}/publish`, w.admin)).status).toBe(200);
    expect((await read(w.bima)).status).toBe(404);
    // orang tua tidak bisa menulis atau melihat jejak
    expect((await call("PUT", `/players/${w.ali}/assessments/${w.period}`, ortu.cookie, { scores: [{ indicatorId: id("Fokus"), score: 10 }] })).status).toBe(
      403,
    );
    expect((await call("GET", `/players/${w.ali}/assessments/${w.period}/history`, ortu.cookie)).status).toBe(403);
    // tarik kembali: hilang dari orang tua
    expect((await call("DELETE", `/players/${w.ali}/assessments/${w.period}/publish`, w.admin)).status).toBe(200);
    expect(await json(await read(w.ali))).toEqual([]);
    // tanpa penilaian: 404; tanpa login: 401
    expect((await call("POST", `/players/${w.eko}/assessments/${w.period}/publish`, w.admin)).status).toBe(404);
    expect((await call("GET", `/players/${w.ali}/assessments`)).status).toBe(401);
    // pelatih lain di luar KU yang ditugaskan
    const lain = await w.join("pelatih");
    expect((await call("GET", `/players/${w.ali}/assessments`, lain.cookie)).status).toBe(404);
  });

  test("rapor PDF: akses seperti penilaian, dan berkas PDF sungguhan bila Chromium tersedia", async () => {
    const w = await world("rapor");
    const id = (n: string) => w.byName(w.ind10, n);
    const rapor = (player: string, cookie?: string) => call("GET", `/players/${player}/assessments/${w.period}/report`, cookie);
    expect((await rapor(w.ali)).status).toBe(401);
    expect((await rapor(w.ali, w.admin)).status).toBe(404); // belum ada penilaian
    const scores = [
      { indicatorId: id("Fokus"), score: 7 },
      { indicatorId: id("Passing"), score: 9 },
      { indicatorId: id("Kecepatan"), score: 6 },
      { indicatorId: id("Penempatan posisi"), score: 8 },
    ];
    expect((await call("PUT", `/players/${w.ali}/assessments/${w.period}`, w.pelatih.cookie, { scores, note: "Rajin <b>berlatih</b> & tekun" })).status).toBe(
      200,
    );
    const ortu = await w.join("orang_tua", w.ali);
    expect((await rapor(w.ali, ortu.cookie)).status).toBe(404); // belum terbit: orang tua tidak bisa mengunduh
    expect((await call("POST", `/players/${w.ali}/assessments/${w.period}/publish`, w.admin)).status).toBe(200);
    expect((await rapor(w.bima, ortu.cookie)).status).toBe(404); // anak orang lain
    const lain = await w.join("pelatih");
    expect((await rapor(w.ali, lain.cookie)).status).toBe(404); // pelatih di luar KU
    expect((await rapor(w.ali, w.admin)).status).not.toBe(404);

    const chromium = process.env.CHROMIUM_PATH;
    if (!chromium) return; // render PDF butuh Chromium; akses di atas sudah teruji
    for (const cookie of [w.admin, ortu.cookie]) {
      const t0 = performance.now();
      const res = await rapor(w.ali, cookie);
      const ms = performance.now() - t0;
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("content-disposition")).toContain("attachment");
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(new TextDecoder().decode(buf.subarray(0, 4))).toBe("%PDF");
      expect(ms).toBeLessThan(10_000);
      const file = `/tmp/rapor-uji-${uid}.pdf`;
      await Bun.write(file, buf);
      const text = Bun.spawnSync(["pdftotext", "-layout", file, "-"]).stdout.toString();
      if (text) {
        expect(text).toContain("Ali");
        expect(text).toContain("Semester 1");
        expect(text).toContain("7,5"); // (7+9+6+8)/4... = 7,5
        expect(text).toContain("Rajin <b>berlatih</b> & tekun"); // tampil sebagai teks, bukan markup
      }
    }
  }, 60_000);

  test("isolasi tenant: SSB lain tidak melihat atau menilai pemain ini", async () => {
    const a = await world("isoA");
    const b = await world("isoB");
    const fokus = a.byName(a.ind10, "Fokus");
    expect((await call("PUT", `/players/${a.ali}/assessments/${a.period}`, a.admin, { scores: [{ indicatorId: fokus, score: 5 }] })).status).toBe(200);
    expect((await call("GET", `/players/${a.ali}/assessments`, b.admin)).status).toBe(404);
    expect(
      (await call("PUT", `/players/${a.ali}/assessments/${b.period}`, b.admin, { scores: [{ indicatorId: b.byName(b.ind10, "Fokus"), score: 5 }] })).status,
    ).toBe(404);
    expect(
      (await call("PUT", `/players/${b.ali}/assessments/${a.period}`, b.admin, { scores: [{ indicatorId: b.byName(b.ind10, "Fokus"), score: 5 }] })).status,
    ).toBe(404); // periode SSB lain
    expect((await call("PUT", `/players/${b.ali}/assessments/${b.period}`, b.admin, { scores: [{ indicatorId: fokus, score: 5 }] })).status).toBe(422); // indikator SSB lain
  });
});
