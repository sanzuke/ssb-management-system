import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { createDb, schema } from "@ssb/db";
import {
  donationRecordSchema,
  fundraisingCampaignInputSchema,
  pledgeInputSchema,
  type CalendarEventRow,
  type FundraisingCampaignRow,
  type FundraisingDetail,
  type FundraisingPledgeRow,
  type PublicFundraising,
} from "@ssb/shared";
import { createApp, type AppType } from "./app";

describe("isian donasi", () => {
  const gagal = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, v: object) => {
    const r = schema.safeParse(v);
    return r.success ? null : r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  test("kampanye: bawaan draf dan publik; target dan tanggal kosong menjadi null", () => {
    const r = fundraisingCampaignInputSchema.parse({ title: "Seragam turnamen", targetAmount: null, deadline: "", calendarEventId: "" });
    expect(r).toMatchObject({ status: "draft", isPublic: true, description: "", paymentInfo: "", targetAmount: null, deadline: null, calendarEventId: null });
    expect(gagal(fundraisingCampaignInputSchema, { title: "ab" })).toEqual(["title: minimal 3 karakter"]);
    expect(gagal(fundraisingCampaignInputSchema, { title: "Valid", targetAmount: 0 })).toEqual(["targetAmount: minimal 1 rupiah"]);
    expect(gagal(fundraisingCampaignInputSchema, { title: "Valid", status: "terbuka" })).not.toBeNull();
    expect(gagal(fundraisingCampaignInputSchema, { title: "Valid", deadline: "31-12-2030" })).not.toBeNull();
  });

  test("sumbangan: nominal bulat 1 sampai 1 miliar; pencatatan admin wajib punya nama dan tanggal terima", () => {
    expect(pledgeInputSchema.parse({ amount: 50000 })).toEqual({ kind: "donasi", amount: 50000, message: "", isAnonymous: false });
    for (const amount of [0, -5, 1.5, 1_000_000_001]) expect(gagal(pledgeInputSchema, { amount })).not.toBeNull();
    expect(gagal(pledgeInputSchema, { amount: 1000, kind: "hibah" })).not.toBeNull();
    expect(gagal(donationRecordSchema, { amount: 1000 })?.map((m) => m.split(":")[0]).sort()).toEqual(["donorName", "receivedOn"]);
    expect(gagal(donationRecordSchema, { amount: 1000, donorName: "PT Maju", receivedOn: "2031-01-02", kind: "sponsor" })).toBeNull();
  });
});

const dbUrl = process.env.DATABASE_URL;
const run = dbUrl ? describe : describe.skip;

run("donasi crowdfunding (database)", () => {
  const { db, client } = createDb(dbUrl!);
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  let app: AppType;

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;

  async function daftar(tag: string) {
    const slug = `don-${tag}-${uid}`;
    const reg = await app.request("/auth/register-ssb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ssbName: `Donasi ${tag} ${uid}`, slug, adminName: `Admin ${tag}`, email: `admin-${tag}-${uid}@uji.test`, password: PASS }),
    });
    expect(reg.status).toBe(201);
    const admin = sessionOf(reg);
    const undang = async (role: string) => {
      const { token } = await json<{ token: string }>(await call("POST", "/invitations", admin, { role }));
      const acc = await app.request(`/invitations/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `${role} ${tag}`, email: `${role}-${tag}-${uid}@uji.test`, password: PASS }),
      });
      expect(acc.status).toBe(201);
      return sessionOf(acc);
    };
    return { admin, slug, pelatih: await undang("pelatih"), ortu: await undang("orang_tua") };
  }
  const kampanye = async (cookie: string, body: object) => {
    const res = await call("POST", "/fundraising", cookie, { title: "Seragam turnamen", paymentInfo: "BCA 123 a.n. SSB", ...body });
    expect(res.status).toBe(201);
    return json<FundraisingCampaignRow>(res);
  };
  const sumbang = (cookie: string, id: string, body: object) => call("POST", `/fundraising/${id}/pledges`, cookie, body);
  const detail = async (cookie: string, id: string) => json<FundraisingDetail>(await call("GET", `/fundraising/${id}`, cookie));

  test("siapkan aplikasi", () => {
    app = createApp(db, { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) }, { google: null });
  });

  afterAll(async () => {
    const bersih = createDb(dbUrl!);
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("hanya admin mengelola; draf tersembunyi dari anggota lain; kegiatan kalender terkait tampil", async () => {
    const a = await daftar("a");
    expect((await call("POST", "/fundraising", a.ortu, { title: "Coba buat" })).status).toBe(403);
    expect((await call("POST", "/fundraising", a.pelatih, { title: "Coba buat" })).status).toBe(403);
    expect((await call("GET", "/fundraising")).status).toBe(401);

    const ev = await json<CalendarEventRow>(await call("POST", "/calendar", a.admin, { title: "Turnamen Soeratin", startDate: "2098-03-14" }));
    const draf = await kampanye(a.admin, { calendarEventId: ev.id, targetAmount: 5_000_000 });
    expect(draf).toMatchObject({ status: "draft", open: false, raised: 0, supporters: 0, targetAmount: 5_000_000, event: { id: ev.id, title: "Turnamen Soeratin", startDate: "2098-03-14" } });

    expect((await json<FundraisingCampaignRow[]>(await call("GET", "/fundraising", a.admin))).map((k) => k.id)).toEqual([draf.id]);
    expect(await json<FundraisingCampaignRow[]>(await call("GET", "/fundraising", a.ortu))).toEqual([]);
    expect((await call("GET", `/fundraising/${draf.id}`, a.ortu)).status).toBe(404);
    expect((await sumbang(a.ortu, draf.id, { amount: 10000 })).status).toBe(404);

    const aktif = await json<FundraisingCampaignRow>(await call("PUT", `/fundraising/${draf.id}`, a.admin, { title: "Seragam turnamen", status: "aktif", targetAmount: 5_000_000, calendarEventId: ev.id }));
    expect([aktif.status, aktif.open]).toEqual(["aktif", true]);
    expect((await json<FundraisingCampaignRow[]>(await call("GET", "/fundraising", a.ortu))).map((k) => k.id)).toEqual([draf.id]);
    expect((await call("GET", "/fundraising/bukan-uuid", a.admin)).status).toBe(404);
  });

  test("kegiatan dari SSB lain atau yang tidak ada ditolak dengan pesan per kolom", async () => {
    const a = await daftar("e");
    const b = await daftar("f");
    const milikB = await json<CalendarEventRow>(await call("POST", "/calendar", b.admin, { title: "Acara B", startDate: "2098-03-14" }));
    for (const calendarEventId of [milikB.id, randomUUID()]) {
      const res = await call("POST", "/fundraising", a.admin, { title: "Tidak sah", calendarEventId });
      expect(res.status).toBe(400);
      expect((await json<{ error: { fields: Record<string, string> } }>(res)).error.fields).toEqual({ calendarEventId: "kegiatan tidak ditemukan" });
    }
  });

  test("sumbangan: menunggu tidak dihitung; diterima menambah dana; ditolak mengosongkan; dapat dikoreksi", async () => {
    const a = await daftar("s");
    const k = await kampanye(a.admin, { status: "aktif", targetAmount: 1_000_000 });

    const res = await sumbang(a.ortu, k.id, { amount: 50_000, message: "Semoga lancar" });
    expect(res.status).toBe(201);
    const p = await json<FundraisingPledgeRow>(res);
    expect(p).toMatchObject({ kind: "donasi", amount: 50_000, status: "menunggu", receivedOn: null, mine: true, donorName: "orang_tua s", message: "Semoga lancar" });
    expect(p).not.toHaveProperty("adminNote");
    expect((await detail(a.admin, k.id)).campaign).toMatchObject({ raised: 0, supporters: 0 });

    // Hanya admin yang memutuskan.
    expect((await call("PATCH", `/fundraising/pledges/${p.id}`, a.ortu, { status: "diterima" })).status).toBe(403);
    const diterima = await json<FundraisingPledgeRow>(await call("PATCH", `/fundraising/pledges/${p.id}`, a.admin, { status: "diterima", adminNote: "Transfer BCA masuk" }));
    expect(diterima).toMatchObject({ status: "diterima", adminNote: "Transfer BCA masuk" });
    expect(diterima.receivedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await detail(a.admin, k.id)).campaign).toMatchObject({ raised: 50_000, supporters: 1 });

    const ditolak = await json<FundraisingPledgeRow>(await call("PATCH", `/fundraising/pledges/${p.id}`, a.admin, { status: "ditolak", receivedOn: "2098-01-01" }));
    expect([ditolak.status, ditolak.receivedOn]).toEqual(["ditolak", null]);
    expect((await detail(a.admin, k.id)).campaign).toMatchObject({ raised: 0, supporters: 0 });

    // Catatan admin di luar aplikasi langsung diterima dan dihitung.
    const sponsor = await call("POST", `/fundraising/${k.id}/donations`, a.admin, { donorName: "PT Maju Jaya", kind: "sponsor", amount: 2_000_000, receivedOn: "2098-02-02" });
    expect(sponsor.status).toBe(201);
    expect(await json<FundraisingPledgeRow>(sponsor)).toMatchObject({ status: "diterima", kind: "sponsor", donorName: "PT Maju Jaya", receivedOn: "2098-02-02" });
    expect((await call("POST", `/fundraising/${k.id}/donations`, a.ortu, { donorName: "X Y", amount: 1000, receivedOn: "2098-02-02" })).status).toBe(403);
    expect((await detail(a.admin, k.id)).campaign).toMatchObject({ raised: 2_000_000, supporters: 1 });
  });

  test("kampanye selesai, lewat batas akhir, atau terlalu banyak menunggu: sumbangan baru ditolak", async () => {
    const a = await daftar("c");
    const selesai = await kampanye(a.admin, { status: "selesai" });
    const lewat = await kampanye(a.admin, { status: "aktif", deadline: "2020-01-01" });
    const hariIni = await kampanye(a.admin, { status: "aktif", deadline: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) });
    expect([selesai.open, lewat.open, hariIni.open]).toEqual([false, false, true]);
    expect((await sumbang(a.ortu, selesai.id, { amount: 1000 })).status).toBe(409);
    expect((await sumbang(a.ortu, lewat.id, { amount: 1000 })).status).toBe(409);
    expect((await sumbang(a.ortu, hariIni.id, { amount: 1000 })).status).toBe(201);

    const aktif = await kampanye(a.admin, { status: "aktif" });
    for (let i = 0; i < 5; i++) expect((await sumbang(a.ortu, aktif.id, { amount: 1000 + i })).status).toBe(201);
    expect((await sumbang(a.ortu, aktif.id, { amount: 9999 })).status).toBe(429);
    // Anggota lain tidak terpengaruh batas ini.
    expect((await sumbang(a.pelatih, aktif.id, { amount: 9999 })).status).toBe(201);
    expect((await sumbang(a.ortu, aktif.id, { amount: 0 })).status).toBe(400);
  });

  test("anonim: disembunyikan dari anggota lain dan publik, tetap terlihat oleh pemilik dan admin", async () => {
    const a = await daftar("n");
    const k = await kampanye(a.admin, { status: "aktif" });
    const anon = await json<FundraisingPledgeRow>(await sumbang(a.ortu, k.id, { amount: 100_000, isAnonymous: true }));
    const terbuka = await json<FundraisingPledgeRow>(await sumbang(a.pelatih, k.id, { amount: 200_000, kind: "sponsor" }));
    for (const id of [anon.id, terbuka.id]) await call("PATCH", `/fundraising/pledges/${id}`, a.admin, { status: "diterima" });

    const nama = async (cookie: string) => Object.fromEntries((await detail(cookie, k.id)).pledges.map((p) => [p.amount, p.donorName]));
    expect(await nama(a.ortu)).toEqual({ 100000: "orang_tua n", 200000: "pelatih n" });
    expect(await nama(a.pelatih)).toEqual({ 100000: null, 200000: "pelatih n" });
    expect(await nama(a.admin)).toEqual({ 100000: "orang_tua n", 200000: "pelatih n" });
    const admin = (await detail(a.admin, k.id)).pledges.find((p) => p.id === anon.id)!;
    expect(admin).toHaveProperty("adminNote");
    expect((await detail(a.pelatih, k.id)).pledges.find((p) => p.id === anon.id)).not.toHaveProperty("donorWhatsapp");

    const pub = await json<PublicFundraising[]>(await call("GET", `/public/site/${a.slug}/fundraising`));
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ raised: 300_000, supporters: 2, sponsors: [{ name: "pelatih n", kind: "sponsor" }] });
    const mentah = JSON.stringify(pub);
    expect(mentah).not.toContain("orang_tua n");
    expect(mentah).not.toContain("BCA");
    expect(mentah).not.toContain("200000");
  });

  test("anggota hanya melihat sumbangan yang sudah diterima dan miliknya sendiri", async () => {
    const a = await daftar("v");
    const k = await kampanye(a.admin, { status: "aktif" });
    await sumbang(a.ortu, k.id, { amount: 11_000 });
    expect((await detail(a.pelatih, k.id)).pledges).toEqual([]);
    expect((await detail(a.ortu, k.id)).pledges.map((p) => p.amount)).toEqual([11_000]);
    expect((await detail(a.admin, k.id)).pledges.map((p) => p.amount)).toEqual([11_000]);
  });

  test("landing: tanpa sesi, hanya yang publik dan bukan draf; selesai tetap tampil sebagai selesai", async () => {
    const a = await daftar("p");
    await kampanye(a.admin, { title: "Terbuka", status: "aktif" });
    await kampanye(a.admin, { title: "Selesai", status: "selesai" });
    await kampanye(a.admin, { title: "Draf", status: "draft" });
    await kampanye(a.admin, { title: "Internal", status: "aktif", isPublic: false });
    const res = await call("GET", `/public/site/${a.slug}/fundraising`);
    expect([res.status, res.headers.get("cache-control")]).toEqual([200, "public, max-age=60"]);
    const list = await json<PublicFundraising[]>(res);
    expect(list.map((k) => [k.title, k.open])).toEqual([["Terbuka", true], ["Selesai", false]]);
    expect(Object.keys(list[0]!).sort()).toEqual(["deadline", "description", "event", "id", "open", "raised", "sponsors", "supporters", "targetAmount", "title"]);
    expect((await call("GET", "/public/site/tidak-ada-sama-sekali/fundraising")).status).toBe(404);
  });

  test("data uang dijaga: kampanye atau sumbangan yang sudah diterima tidak bisa dihapus atau dijadikan draf", async () => {
    const a = await daftar("g");
    const k = await kampanye(a.admin, { status: "aktif" });
    const p = await json<FundraisingPledgeRow>(await sumbang(a.ortu, k.id, { amount: 25_000 }));
    await call("PATCH", `/fundraising/pledges/${p.id}`, a.admin, { status: "diterima" });

    expect((await call("DELETE", `/fundraising/${k.id}`, a.admin)).status).toBe(409);
    expect((await call("PUT", `/fundraising/${k.id}`, a.admin, { title: "Seragam turnamen", status: "draft" })).status).toBe(409);
    expect((await call("DELETE", `/fundraising/pledges/${p.id}`, a.admin)).status).toBe(409);
    expect((await call("PUT", `/fundraising/${k.id}`, a.admin, { title: "Seragam turnamen", status: "selesai" })).status).toBe(200);

    // Setelah ditolak, sumbangan boleh dihapus; lalu kampanye tanpa dana boleh dihapus.
    await call("PATCH", `/fundraising/pledges/${p.id}`, a.admin, { status: "ditolak" });
    expect((await call("DELETE", `/fundraising/pledges/${p.id}`, a.ortu)).status).toBe(403);
    expect((await call("DELETE", `/fundraising/pledges/${p.id}`, a.admin)).status).toBe(204);
    expect((await call("DELETE", `/fundraising/pledges/${p.id}`, a.admin)).status).toBe(404);
    expect((await call("DELETE", `/fundraising/${k.id}`, a.admin)).status).toBe(204);
    expect((await call("GET", `/fundraising/${k.id}`, a.admin)).status).toBe(404);
  });

  test("antar SSB terpisah: kampanye dan sumbangan SSB lain tidak terbaca atau terubah", async () => {
    const a = await daftar("x");
    const b = await daftar("y");
    const k = await kampanye(a.admin, { status: "aktif" });
    const p = await json<FundraisingPledgeRow>(await sumbang(a.ortu, k.id, { amount: 5000 }));

    expect(await json<FundraisingCampaignRow[]>(await call("GET", "/fundraising", b.admin))).toEqual([]);
    expect((await call("GET", `/fundraising/${k.id}`, b.admin)).status).toBe(404);
    expect((await call("PUT", `/fundraising/${k.id}`, b.admin, { title: "Dibajak", status: "selesai" })).status).toBe(404);
    expect((await call("DELETE", `/fundraising/${k.id}`, b.admin)).status).toBe(404);
    expect((await sumbang(b.ortu, k.id, { amount: 5000 })).status).toBe(404);
    expect((await call("PATCH", `/fundraising/pledges/${p.id}`, b.admin, { status: "diterima" })).status).toBe(404);
    expect((await call("DELETE", `/fundraising/pledges/${p.id}`, b.admin)).status).toBe(404);
    expect((await json<PublicFundraising[]>(await call("GET", `/public/site/${b.slug}/fundraising`))).length).toBe(0);
    expect((await detail(a.admin, k.id)).pledges[0]!.status).toBe("menunggu");
  });
});
