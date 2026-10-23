import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { emptySiteContent, type SiteAdminView, type SiteContent, type SitePublicView, type TrialRow } from "@ssb/shared";
import { createApp } from "./app";
import { createLogger } from "./logger";
import { createRateLimiter } from "./rate-limit";

describe("pembatas laju", () => {
  test("menolak setelah batas dan pulih setelah jendela lewat", () => {
    let t = 1_000;
    const rl = createRateLimiter({ limit: 2, windowMs: 100, now: () => t });
    expect([rl.allow("a"), rl.allow("a"), rl.allow("a")]).toEqual([true, true, false]);
    expect(rl.allow("b")).toBe(true); // kunci lain tidak terpengaruh
    t += 101;
    expect(rl.allow("a")).toBe(true);
  });

  test("menolak kunci baru bila tabel penuh oleh kunci aktif, bukan tumbuh tanpa batas", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 5, maxKeys: 2 });
    expect([rl.allow("a"), rl.allow("b"), rl.allow("c")]).toEqual([true, true, false]);
  });
});

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("landing page: konten situs dan pendaftaran trial", () => {
  const { db, client } = createDb(url!);
  const baseEnv = { NODE_ENV: "test" as const, ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) };
  const app = createApp(db, baseEnv, { google: null, logger: createLogger({}) });
  const appCors = createApp(db, { ...baseEnv, LANDING_ORIGINS: "https://landing.test" }, { google: null, logger: createLogger({}) });
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];

  const call = (method: string, path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;

  async function daftar(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `Situs ${tag} ${uid}`,
      slug: `st-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    ssbIds.push((await json<{ ssbId: string }>(reg)).ssbId);
    return { cookie: sessionOf(reg), slug: `st-${tag}-${uid}` };
  }
  const konten = (nama: string): SiteContent => ({
    ...emptySiteContent(nama),
    hero: { title: { id: `Judul ${nama}`, en: `Title ${nama}` }, subtitle: { id: "Sub" }, primaryCta: { id: "Daftar" } },
    programs: [
      {
        id: "u-12",
        code: "BINTANG",
        name: { id: "Bintang" },
        ageRange: { id: "10-12 tahun" },
        focus: { id: "Taktik" },
        schedule: { id: "Sabtu" },
        curriculum: [{ id: "Passing" }],
        hasScholarship: true,
      },
    ],
  });
  const trial = (extra: object = {}) => ({
    childName: "Rizky Pratama",
    birthDate: "2015-03-02",
    gender: "Putra",
    parentName: "Bambang",
    phone: "081234567890",
    programId: "u-12",
    ...extra,
  });
  let ip = 0;
  const postTrial = (slug: string, body: object, ipAddr = `10.0.0.${++ip}`) =>
    call("POST", `/public/site/${slug}/trial`, undefined, body, { "x-real-ip": ipAddr });

  afterAll(async () => {
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("draf, terbit, ubah draf, dan tarik: pengunjung hanya melihat versi terbit", async () => {
    const a = await daftar("a");
    // Belum ada apa-apa: publik 404, admin melihat draf awal.
    expect((await call("GET", `/public/site/${a.slug}`)).status).toBe(404);
    const awal = await json<SiteAdminView>(await call("GET", "/site", a.cookie));
    expect([awal.published, awal.dirty, awal.draft.identity.brandName]).toEqual([false, false, `Situs a ${uid}`]);
    expect((await call("POST", "/site/publish", a.cookie)).status).toBe(409); // belum ada draf tersimpan

    // Simpan draf: belum tampil.
    const put = await call("PUT", "/site", a.cookie, konten("A1"));
    expect(put.status).toBe(200);
    expect(await json<SiteAdminView>(put)).toMatchObject({ published: false, dirty: true });
    expect((await call("GET", `/public/site/${a.slug}`)).status).toBe(404);

    // Terbit: publik membaca isi yang sama, dengan bentuk yang tetap.
    const pub = await json<SiteAdminView>(await call("POST", "/site/publish", a.cookie));
    expect([pub.published, pub.dirty]).toEqual([true, false]);
    const res = await call("GET", `/public/site/${a.slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const v = await json<SitePublicView>(res);
    expect(Object.keys(v).sort()).toEqual(["content", "publishedAt", "slug", "ssbName"]);
    expect(v.content.hero.title.id).toBe("Judul A1");
    expect(v.content.programs[0]!.id).toBe("u-12");

    // Ubah draf: publik tetap versi lama sampai diterbitkan lagi.
    await call("PUT", "/site", a.cookie, konten("A2"));
    expect((await json<SiteAdminView>(await call("GET", "/site", a.cookie))).dirty).toBe(true);
    expect((await json<SitePublicView>(await call("GET", `/public/site/${a.slug}`))).content.hero.title.id).toBe("Judul A1");
    await call("POST", "/site/publish", a.cookie);
    expect((await json<SitePublicView>(await call("GET", `/public/site/${a.slug}`))).content.hero.title.id).toBe("Judul A2");

    // Tarik: publik 404 lagi, draf tetap.
    const tarik = await json<SiteAdminView>(await call("POST", "/site/unpublish", a.cookie));
    expect([tarik.published, tarik.draft.hero.title.id]).toEqual([false, "Judul A2"]);
    expect((await call("GET", `/public/site/${a.slug}`)).status).toBe(404);
  });

  test("isian yang tidak sesuai skema ditolak dengan pesan per kolom", async () => {
    const a = await daftar("v");
    const buruk = { ...konten("V"), identity: { ...konten("V").identity, whatsapp: "08-123" }, programs: [{ ...konten("V").programs[0]!, id: "ID Salah" }] };
    const res = await call("PUT", "/site", a.cookie, buruk);
    expect(res.status).toBe(400);
    const { error } = await json<{ error: { fields: Record<string, string> } }>(res);
    expect(Object.keys(error.fields).sort()).toEqual(["identity.whatsapp", "programs.0.id"]);
    expect((await call("PUT", "/site", a.cookie, { ...konten("V"), programs: Array.from({ length: 13 }, () => konten("V").programs[0]) })).status).toBe(400);
  });

  test("tiap SSB hanya melihat dan mengubah kontennya sendiri", async () => {
    const a = await daftar("ia");
    const b = await daftar("ib");
    await call("PUT", "/site", a.cookie, konten("Milik A"));
    await call("POST", "/site/publish", a.cookie);
    // Kode SSB A tidak menampilkan apa pun milik B, dan sebaliknya.
    expect((await call("GET", `/public/site/${b.slug}`)).status).toBe(404);
    expect((await json<SiteAdminView>(await call("GET", "/site", b.cookie))).draft.hero.title.id).toBe(`Situs ib ${uid}`);
    await call("PUT", "/site", b.cookie, konten("Milik B"));
    expect((await json<SiteAdminView>(await call("GET", "/site", a.cookie))).draft.hero.title.id).toBe("Judul Milik A");
    expect((await call("GET", "/public/site/slug-tak-ada")).status).toBe(404);
  });

  test("pendaftaran trial: hanya saat situs terbit, masuk ke kotak masuk, status bisa diubah", async () => {
    const a = await daftar("t");
    const b = await daftar("tb");
    // Belum terbit: ditolak walau kode SSB benar.
    expect((await postTrial(a.slug, trial())).status).toBe(404);

    await call("PUT", "/site", a.cookie, konten("T"));
    await call("POST", "/site/publish", a.cookie);
    const ok = await postTrial(a.slug, trial({ email: "ortu@uji.test", applyScholarship: true, notes: "Kidal" }));
    expect(ok.status).toBe(201);
    const { code } = await json<{ code: string }>(ok);
    expect(code).toMatch(/^TRL-[2-9A-HJ-NP-Z]{6}$/);

    const daftarA = await json<TrialRow[]>(await call("GET", "/trials", a.cookie));
    expect(daftarA).toHaveLength(1);
    expect(daftarA[0]).toMatchObject({ code, childName: "Rizky Pratama", status: "baru", applyScholarship: true, email: "ortu@uji.test", programId: "u-12" });
    // SSB lain tidak melihatnya dan tidak bisa mengubahnya.
    expect(await json<TrialRow[]>(await call("GET", "/trials", b.cookie))).toEqual([]);
    expect((await call("PATCH", `/trials/${daftarA[0]!.id}`, b.cookie, { status: "diterima" })).status).toBe(404);

    const ubah = await call("PATCH", `/trials/${daftarA[0]!.id}`, a.cookie, { status: "dihubungi", adminNote: "Sudah ditelepon" });
    expect(await json<TrialRow>(ubah)).toMatchObject({ status: "dihubungi", adminNote: "Sudah ditelepon" });
    expect((await call("PATCH", `/trials/${daftarA[0]!.id}`, a.cookie, { status: "ngawur" })).status).toBe(400);
    expect(await json<TrialRow[]>(await call("GET", "/trials?status=baru", a.cookie))).toEqual([]);
    expect(await json<TrialRow[]>(await call("GET", "/trials?status=dihubungi", a.cookie))).toHaveLength(1);
    expect((await call("PATCH", "/trials/bukan-uuid", a.cookie, { status: "diterima" })).status).toBe(404);
  });

  test("isian trial yang tidak valid ditolak, dan kolom jebakan bot tidak menyimpan apa pun", async () => {
    const a = await daftar("j");
    await call("PUT", "/site", a.cookie, konten("J"));
    await call("POST", "/site/publish", a.cookie);
    for (const buruk of [
      trial({ childName: "" }),
      trial({ birthDate: "02-03-2015" }),
      trial({ gender: "X" }),
      trial({ phone: "abc" }),
      trial({ email: "bukan-email" }),
    ]) {
      expect((await postTrial(a.slug, buruk)).status).toBe(400);
    }
    const bot = await postTrial(a.slug, trial({ website: "http://spam.test" }));
    expect(bot.status).toBe(201); // dijawab seolah berhasil
    expect(await json<TrialRow[]>(await call("GET", "/trials", a.cookie))).toEqual([]);
  });

  test("batas laju: satu alamat IP dibatasi per jam, alamat lain tidak terpengaruh", async () => {
    const a = await daftar("r");
    await call("PUT", "/site", a.cookie, konten("R"));
    await call("POST", "/site/publish", a.cookie);
    const hasil: number[] = [];
    for (let i = 0; i < 7; i++) hasil.push((await postTrial(a.slug, trial({ childName: `Anak ${i}` }), "203.0.113.9")).status);
    expect(hasil).toEqual([201, 201, 201, 201, 201, 429, 429]);
    expect((await postTrial(a.slug, trial(), "203.0.113.10")).status).toBe(201);
    expect(await json<TrialRow[]>(await call("GET", "/trials", a.cookie))).toHaveLength(6);
  });

  test("CORS: hanya origin landing yang terdaftar mendapat izin; tanpa daftar tidak ada header sama sekali", async () => {
    const preflight = (a: typeof app, origin: string) =>
      a.request("/public/site/apa-saja/trial", {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "content-type" },
      });
    expect((await preflight(appCors, "https://landing.test")).headers.get("access-control-allow-origin")).toBe("https://landing.test");
    expect((await preflight(appCors, "https://jahat.test")).headers.get("access-control-allow-origin")).toBeNull();
    expect((await preflight(app, "https://landing.test")).headers.get("access-control-allow-origin")).toBeNull();
    // Rute admin tidak pernah terbuka lintas origin.
    const admin = await appCors.request("/site", { method: "OPTIONS", headers: { origin: "https://landing.test", "access-control-request-method": "PUT" } });
    expect(admin.headers.get("access-control-allow-origin")).toBeNull();
  });
});
