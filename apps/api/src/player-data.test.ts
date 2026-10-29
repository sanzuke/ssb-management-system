import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import type { PlayerDetail } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

run("data siswa: ID siswa, NISN, orang tua, fisik, jersey, dan catatan medis", () => {
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
    (await (await res).json()) as {
      id: string;
      token: string;
      ssbId: string;
      active: { userId: string };
      error?: { code: string; fields?: Record<string, string> };
    };

  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `D ${tag}`,
      slug: `d-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku = (await json(call("POST", "/age-groups", admin, { name: "U-12", minAge: 11, maxAge: 12 }))).id;
    const periode = (await json(call("POST", "/periods", admin, { name: "Kini", startDate: iso(-60), endDate: iso(90) }))).id;
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
    return { admin, ku, periode, join };
  }
  const contoh = (ku: string, extra: Record<string, unknown> = {}) => ({
    memberNo: "SSB-001",
    nisn: "3142186517",
    fullName: "Muhammad Setia Budi",
    birthPlace: "Garut",
    birthDate: "2014-01-21",
    ageGroupId: ku,
    position: "FW",
    guardianName: "Nurlinda",
    guardianWhatsapp: "81234567890",
    documentStatus: "lengkap",
    heightCm: null,
    weightKg: null,
    medicalNote: null,
    jerseyNo: 60,
    jerseySize: "m",
    shoeSize: 38,
    ...extra,
  });
  const detail = async (cookie: string, id: string) => (await (await call("GET", `/players/${id}`, cookie)).json()) as PlayerDetail;

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("data contoh disimpan dan dinormalkan: ID siswa buatan sendiri, WhatsApp 08, ukuran jersey huruf besar", async () => {
    const w = await world("contoh");
    const res = await call("POST", "/players", w.admin, contoh(w.ku));
    expect(res.status).toBe(201);
    const { id } = await json(res);
    const d = await detail(w.admin, id);
    expect(d).toMatchObject({
      memberNo: "SSB-001",
      nisn: "3142186517",
      fullName: "Muhammad Setia Budi",
      birthPlace: "Garut",
      birthDate: "2014-01-21",
      position: "FW",
      guardianName: "Nurlinda",
      guardianWhatsapp: "081234567890",
      documentStatus: "lengkap",
      heightCm: null,
      weightKg: null,
      medicalNote: null,
      jerseyNo: 60,
      jerseySize: "M",
      shoeSize: 38,
    });
  });

  test("ID siswa kosong diberi nomor otomatis yang melewati ID buatan sendiri yang bentrok", async () => {
    const w = await world("otomatis");
    expect((await call("POST", "/players", w.admin, contoh(w.ku, { memberNo: "P0001", nisn: null }))).status).toBe(201);
    const { id } = await json(call("POST", "/players", w.admin, contoh(w.ku, { memberNo: "", nisn: null, fullName: "Otomatis Satu" })));
    expect((await detail(w.admin, id)).memberNo).toBe("P0002"); // P0001 sudah dipakai
  });

  test("ID siswa dan NISN ganda ditolak 409 dengan pesan di kolomnya; SSB lain tidak terpengaruh", async () => {
    const w = await world("ganda");
    const lain = await world("lain");
    expect((await call("POST", "/players", w.admin, contoh(w.ku))).status).toBe(201);

    const idGanda = await call("POST", "/players", w.admin, contoh(w.ku, { nisn: "1000000001", fullName: "Anak Dua" }));
    expect(idGanda.status).toBe(409);
    expect((await json(idGanda)).error).toMatchObject({ code: "member_no_taken", fields: { memberNo: expect.any(String) } });

    const nisnGanda = await call("POST", "/players", w.admin, contoh(w.ku, { memberNo: "SSB-002", fullName: "Anak Tiga" }));
    expect(nisnGanda.status).toBe(409);
    expect((await json(nisnGanda)).error).toMatchObject({ code: "nisn_taken", fields: { nisn: expect.any(String) } });

    expect((await call("POST", "/players", lain.admin, contoh(lain.ku))).status).toBe(201); // ID dan NISN yang sama di SSB lain
  });

  test("ubah: ID siswa kosong tetap, ID baru menggantikan, data lain diperbarui", async () => {
    const w = await world("ubah");
    const { id } = await json(call("POST", "/players", w.admin, contoh(w.ku)));
    const ubah = await call(
      "PATCH",
      `/players/${id}`,
      w.admin,
      contoh(w.ku, { memberNo: "", heightCm: 150, weightKg: 38.5, medicalNote: "Alergi udang", guardianName: "" }),
    );
    expect(ubah.status).toBe(200);
    let d = await detail(w.admin, id);
    expect(d).toMatchObject({ memberNo: "SSB-001", heightCm: 150, weightKg: 38.5, medicalNote: "Alergi udang", guardianName: null });
    expect((await call("PATCH", `/players/${id}`, w.admin, contoh(w.ku, { memberNo: "SSB-099" }))).status).toBe(200);
    d = await detail(w.admin, id);
    expect(d.memberNo).toBe("SSB-099");
  });

  test("nilai di luar batas ditolak 400", async () => {
    const w = await world("batas");
    for (const extra of [
      { nisn: "123456789" },
      { nisn: "12345678901" },
      { nisn: "31421865AB" },
      { heightCm: 49 },
      { heightCm: 231 },
      { weightKg: 9 },
      { jerseyNo: 100 },
      { jerseyNo: -1 },
      { shoeSize: 14 },
      { documentStatus: "lunas" },
      { guardianWhatsapp: "abc" },
      { memberNo: "SSB 001" },
      { medicalNote: "x".repeat(501) },
    ]) {
      const res = await call("POST", "/players", w.admin, contoh(w.ku, { memberNo: null, nisn: null, ...extra }));
      expect([JSON.stringify(extra), res.status]).toEqual([JSON.stringify(extra), 400]);
    }
  });

  test("akses: pelatih KU-nya dan orang tua anaknya membaca data lengkap; kontak orang tua di ringkasan hanya untuk admin", async () => {
    const w = await world("akses");
    const pelatih = await w.join("pelatih");
    expect((await call("POST", "/assignments", w.admin, { userId: pelatih.userId, ageGroupId: w.ku, periodId: w.periode })).status).toBe(201);
    const { id } = await json(call("POST", "/players", w.admin, contoh(w.ku, { medicalNote: "Asma ringan" })));
    const ortu = await w.join("orang_tua", { playerId: id });

    expect((await detail(pelatih.cookie, id)).medicalNote).toBe("Asma ringan");
    expect((await detail(ortu.cookie, id)).medicalNote).toBe("Asma ringan");
    const lain = await json(call("POST", "/players", w.admin, contoh(w.ku, { memberNo: "SSB-002", nisn: null, fullName: "Tanpa Wali" })));
    expect((await call("GET", `/players/${lain.id}`, ortu.cookie)).status).toBe(404);

    const ringkas = async (cookie: string) =>
      (await (await call("GET", "/players-overview", cookie)).json()) as {
        playerId: string;
        guardian: { name: string; whatsapp: string | null; total: number } | null;
      }[];
    // Akun wali yang terhubung didahulukan; pemain tanpa akun wali memakai kontak dari data siswa (admin saja).
    const untukAdmin = await ringkas(w.admin);
    expect(untukAdmin.find((x) => x.playerId === id)?.guardian).toMatchObject({ name: "orang_tua" });
    expect(untukAdmin.find((x) => x.playerId === lain.id)?.guardian).toMatchObject({ name: "Nurlinda", whatsapp: "081234567890", total: 1 });
    expect((await ringkas(pelatih.cookie)).every((x) => x.guardian === null)).toBe(true);
  });
});
