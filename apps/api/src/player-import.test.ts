import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import type { ImportReport } from "@ssb/shared/impor";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("impor siswa dari lembar", () => {
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
  const json = async (res: Response | Promise<Response>) => (await (await res).json()) as Record<string, any>;

  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `I ${tag}`,
      slug: `i-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    ssbIds.push((await json(reg)).ssbId);
    return sessionOf(reg);
  }
  const baris = (nomor: number, data: Record<string, unknown>) => ({ nomor, data: { birthDate: "2014-01-21", ...data } });
  const impor = async (cookie: string, rows: unknown[], dryRun = false) => {
    const res = await call("POST", "/players/import", cookie, { rows, dryRun });
    return { status: res.status, body: (await res.json()) as ImportReport };
  };
  const daftar = async (cookie: string) => (await json(call("GET", "/players", cookie))) as unknown as { memberNo: string; fullName: string }[];

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await client.end();
  });

  test("baris sah tersimpan, baris gagal dilaporkan dengan nomor barisnya, dan tidak menggagalkan yang lain", async () => {
    const admin = await world("a");
    const ku = (await json(call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id;
    const { status, body } = await impor(admin, [
      baris(2, { fullName: "Muhammad Setia Budi", memberNo: "SSB-001", nisn: "3142186517", guardianWhatsapp: "81234567890", ageGroupId: ku, position: "FW" }),
      baris(3, { fullName: "Tanpa NISN" }), // ID otomatis
      baris(4, { fullName: "X", nisn: "123" }), // nama terlalu pendek dan NISN salah
      baris(5, { fullName: "Kembar ID", memberNo: "SSB-001" }), // bentrok dengan baris 2 di berkas yang sama
      baris(6, { fullName: "Kembar NISN", nisn: "3142186517" }),
      baris(7, { fullName: "Lahir Nanti", birthDate: "2999-01-01" }),
      baris(8, { fullName: "Baris Terakhir" }),
    ]);
    expect(status).toBe(200);
    expect(body.dryRun).toBe(false);
    expect(body.created).toBe(3);
    expect(body.gagal.map((g) => g.nomor)).toEqual([4, 5, 6, 7]);
    expect(body.gagal[0]!.galat).toEqual(expect.arrayContaining([expect.stringContaining("Nama lengkap:"), expect.stringContaining("NISN:")]));
    expect(body.gagal[1]).toMatchObject({ nama: "Kembar ID", galat: ["ID siswa: sudah dipakai siswa lain"] });
    expect(body.gagal[2]).toMatchObject({ galat: ["NISN: sudah dipakai siswa lain"] });
    expect(body.gagal[3]!.galat[0]).toContain("Tanggal lahir:");

    const ada = await daftar(admin);
    expect(ada.map((p) => p.fullName).sort()).toEqual(["Baris Terakhir", "Muhammad Setia Budi", "Tanpa NISN"]);
    // ID otomatis tidak bentrok dengan ID buatan sendiri; nomor yang dilewati karena gagal tidak membuat celah yang merusak
    expect(new Set(ada.map((p) => p.memberNo)).size).toBe(3);

    const budi = ada.find((p) => p.fullName === "Muhammad Setia Budi")!;
    const id = (await json(call("GET", "/players", admin))) as unknown as { id: string; fullName: string }[];
    const detail = await json(call("GET", `/players/${id.find((p) => p.fullName === budi.fullName)!.id}`, admin));
    expect(detail).toMatchObject({ memberNo: "SSB-001", nisn: "3142186517", guardianWhatsapp: "081234567890", position: "FW" });
  });

  test("dryRun menjalankan semua aturan tetapi tidak menyimpan apa pun", async () => {
    const admin = await world("b");
    const rows = [baris(2, { fullName: "Calon Satu", memberNo: "B-1" }), baris(3, { fullName: "Calon Dua", memberNo: "B-1" }), baris(4, { fullName: "Z" })];
    const { body } = await impor(admin, rows, true);
    expect(body).toMatchObject({ dryRun: true, created: 1 });
    expect(body.gagal.map((g) => g.nomor)).toEqual([3, 4]);
    expect(await daftar(admin)).toEqual([]);
    // dijalankan sungguhan hasilnya sama, dan ID B-1 tidak "terpakai" oleh dry run
    const nyata = await impor(admin, rows);
    expect(nyata.body).toMatchObject({ dryRun: false, created: 1 });
    expect((await daftar(admin)).map((p) => p.memberNo)).toEqual(["B-1"]);
  });

  test("KU dari SSB lain ditolak per baris, bukan menggagalkan seluruh impor", async () => {
    const a = await world("c");
    const b = await world("d");
    const kuB = (await json(call("POST", "/age-groups", b, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    const { status, body } = await impor(a, [baris(2, { fullName: "KU Asing", ageGroupId: kuB }), baris(3, { fullName: "Siswa Biasa" })]);
    expect(status).toBe(200);
    expect(body.created).toBe(1);
    expect(body.gagal).toEqual([{ nomor: 2, nama: "KU Asing", galat: ["Kelompok usia: KU tidak ditemukan di SSB ini"] }]);
  });

  test("hanya admin; berkas kosong atau terlalu besar ditolak", async () => {
    const admin = await world("e");
    const inv = await json(call("POST", "/invitations", admin, { role: "pelatih" }));
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: "Pelatih", email: `pel-${uid}@uji.test`, password: PASS });
    expect((await impor(sessionOf(acc), [baris(2, { fullName: "Tidak Boleh" })])).status).toBe(403);
    expect((await call("POST", "/players/import", undefined, { rows: [baris(2, { fullName: "Anon" })] })).status).toBe(401);
    expect((await call("POST", "/players/import", admin, { rows: [] })).status).toBe(400);
    const banyak = Array.from({ length: 501 }, (_, i) => baris(i + 2, { fullName: `Siswa ${i}` }));
    expect((await call("POST", "/players/import", admin, { rows: banyak })).status).toBe(400);
    expect(await daftar(admin)).toEqual([]);
  });
});
