import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { createDb, schema } from "@ssb/db";
import { calendarEventInputSchema, type CalendarEventRow, type PublicCalendarEvent } from "@ssb/shared";
import { createApp, type AppType } from "./app";

describe("isian kegiatan kalender", () => {
  const base = { title: "Turnamen Soeratin", startDate: "2031-03-14" };
  const gagal = (v: object) => {
    const r = calendarEventInputSchema.safeParse({ ...base, ...v });
    return r.success ? null : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  };

  test("isian minimal valid dan terisi bawaan; isian kosong untuk jam dan tanggal akhir menjadi null", () => {
    const r = calendarEventInputSchema.parse({ ...base, endDate: "", startTime: "", endTime: "" });
    expect(r).toMatchObject({ eventType: "acara", isPublic: true, location: "", description: "", endDate: null, startTime: null, endTime: null });
  });

  test("tanggal akhir dan jam akhir tidak boleh mendahului awalnya", () => {
    expect(gagal({ endDate: "2031-03-13" })).toEqual(["endDate: tidak boleh sebelum tanggal mulai"]);
    expect(gagal({ endTime: "10:00" })).toEqual(["endTime: isi jam mulai lebih dulu"]);
    expect(gagal({ startTime: "10:00", endTime: "09:59" })).toEqual(["endTime: tidak boleh sebelum jam mulai"]);
    // Kegiatan lintas hari boleh berakhir pada jam yang lebih pagi.
    expect(gagal({ startTime: "20:00", endDate: "2031-03-15", endTime: "06:00" })).toBeNull();
    expect(gagal({ startTime: "10:00", endTime: "10:00" })).toBeNull();
  });

  test("jenis, format tanggal, dan format jam ditolak bila tidak dikenal", () => {
    expect(gagal({ eventType: "demo" })).not.toBeNull();
    expect(gagal({ startDate: "14-03-2031" })).not.toBeNull();
    expect(gagal({ startDate: "2031-02-30" })).not.toBeNull();
    expect(gagal({ startTime: "24:00" })).not.toBeNull();
    expect(gagal({ title: "x" })).not.toBeNull();
  });
});

const dbUrl = process.env.DATABASE_URL;
const run = dbUrl ? describe : describe.skip;

run("kalender akademi (database)", () => {
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
    const slug = `kal-${tag}-${uid}`;
    const reg = await app.request("/auth/register-ssb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ssbName: `Kalender ${tag} ${uid}`, slug, adminName: `Admin ${tag}`, email: `admin-${tag}-${uid}@uji.test`, password: PASS }),
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
  const buat = async (cookie: string, body: object) => json<CalendarEventRow>(await call("POST", "/calendar", cookie, body));

  test("siapkan aplikasi", () => {
    app = createApp(db, { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) }, { google: null });
  });

  afterAll(async () => {
    const bersih = createDb(dbUrl!);
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("semua anggota boleh melihat; hanya admin yang menulis", async () => {
    const a = await daftar("a");
    const body = { title: "Laga uji coba", startDate: "2098-05-01", eventType: "pertandingan" };
    for (const [who, cookie] of [["pelatih", a.pelatih], ["orang_tua", a.ortu]] as const) {
      expect([who, (await call("POST", "/calendar", cookie, body)).status]).toEqual([who, 403]);
      expect([who, (await call("GET", "/calendar", cookie)).status]).toEqual([who, 200]);
    }
    expect((await call("GET", "/calendar")).status).toBe(401);
    const dibuat = await buat(a.admin, body);
    expect(dibuat).toMatchObject({ title: "Laga uji coba", eventType: "pertandingan", endDate: null, startTime: null, isPublic: true });

    const id = dibuat.id;
    expect((await call("PUT", `/calendar/${id}`, a.pelatih, body)).status).toBe(403);
    expect((await call("DELETE", `/calendar/${id}`, a.ortu)).status).toBe(403);
    const ubah = await json<CalendarEventRow>(await call("PUT", `/calendar/${id}`, a.admin, { ...body, title: "Laga final", startTime: "15:30", location: "Lapangan A" }));
    expect([ubah.title, ubah.startTime, ubah.location]).toEqual(["Laga final", "15:30", "Lapangan A"]);
    expect((await call("DELETE", `/calendar/${id}`, a.admin)).status).toBe(204);
    expect((await call("DELETE", `/calendar/${id}`, a.admin)).status).toBe(404);
    expect((await call("PUT", `/calendar/${id}`, a.admin, body)).status).toBe(404);
    expect((await call("PUT", "/calendar/bukan-uuid", a.admin, body)).status).toBe(404);
  });

  test("isian tidak valid ditolak dengan pesan per kolom", async () => {
    const a = await daftar("v");
    const res = await call("POST", "/calendar", a.admin, { title: "Libur", startDate: "2098-06-02", endDate: "2098-06-01" });
    expect(res.status).toBe(400);
    expect((await json<{ error: { fields: Record<string, string> } }>(res)).error.fields).toEqual({ endDate: "tidak boleh sebelum tanggal mulai" });
    expect((await call("GET", "/calendar?from=2098-06-10&to=2098-06-01", a.admin)).status).toBe(400);
  });

  test("daftar: urut tanggal lalu jam, irisan rentang, dan tanpa batas awal hanya yang belum lewat", async () => {
    const a = await daftar("r");
    await buat(a.admin, { title: "Sudah lewat", startDate: "2020-01-10" });
    await buat(a.admin, { title: "Siang", startDate: "2098-07-10", startTime: "13:00" });
    await buat(a.admin, { title: "Pagi", startDate: "2098-07-10", startTime: "07:00" });
    await buat(a.admin, { title: "Libur panjang", eventType: "libur", startDate: "2098-07-05", endDate: "2098-07-12" });
    await buat(a.admin, { title: "Agustus", startDate: "2098-08-20" });

    const judul = async (q: string) => (await json<CalendarEventRow[]>(await call("GET", `/calendar${q}`, a.ortu))).map((e) => e.title);
    expect(await judul("")).toEqual(["Libur panjang", "Pagi", "Siang", "Agustus"]);
    // Libur panjang mulai sebelum rentang tetapi masih berjalan di dalamnya.
    expect(await judul("?from=2098-07-11&to=2098-07-31")).toEqual(["Libur panjang"]);
    expect(await judul("?from=2098-07-10&to=2098-07-10")).toEqual(["Libur panjang", "Pagi", "Siang"]);
    expect(await judul("?from=2098-07-13&to=2098-07-31")).toEqual([]);
    expect(await judul("?from=2020-01-01&to=2020-01-31")).toEqual(["Sudah lewat"]);
  });

  test("landing: hanya yang bertanda publik, tanpa sesi, dan terpisah antar SSB", async () => {
    const a = await daftar("p");
    const b = await daftar("q");
    await buat(a.admin, { title: "Terbuka", startDate: "2098-09-01", isPublic: true });
    await buat(a.admin, { title: "Internal pelatih", startDate: "2098-09-02", isPublic: false });
    const sendiri = await buat(b.admin, { title: "Milik B", startDate: "2098-09-03" });

    const res = await call("GET", `/public/site/${a.slug}/calendar`);
    expect([res.status, res.headers.get("cache-control")]).toEqual([200, "public, max-age=60"]);
    expect((await json<PublicCalendarEvent[]>(res)).map((e) => e.title)).toEqual(["Terbuka"]);
    expect(Object.keys((await json<PublicCalendarEvent[]>(await call("GET", `/public/site/${a.slug}/calendar`)))[0]!).sort()).toEqual(
      ["description", "endDate", "endTime", "eventType", "id", "location", "startDate", "startTime", "title"],
    );
    expect((await call("GET", "/public/site/tidak-ada-sama-sekali/calendar")).status).toBe(404);

    // Anggota SSB lain tidak melihat, mengubah, atau menghapus kegiatan SSB ini.
    expect((await json<CalendarEventRow[]>(await call("GET", "/calendar", a.admin))).map((e) => e.title)).toEqual(["Terbuka", "Internal pelatih"]);
    expect((await call("PUT", `/calendar/${sendiri.id}`, a.admin, { title: "Dibajak", startDate: "2098-09-03" })).status).toBe(404);
    expect((await call("DELETE", `/calendar/${sendiri.id}`, a.admin)).status).toBe(404);
    expect((await json<CalendarEventRow[]>(await call("GET", "/calendar", b.admin))).map((e) => e.title)).toEqual(["Milik B"]);
  });
});
