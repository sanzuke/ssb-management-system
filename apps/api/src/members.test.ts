import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

run("manajemen anggota: daftar, ubah, keluarkan, dan hapus akun", () => {
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
  async function gabung(admin: string, role: string, nama: string, extra: object = {}, whatsapp?: string) {
    const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
    const email = `${nama.toLowerCase().replace(/\W/g, "")}-${uid}@uji.test`;
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: nama, email, password: PASS, whatsapp });
    expect(acc.status).toBe(201);
    const cookie = sessionOf(acc);
    const me = await json(await call("GET", "/auth/me", cookie));
    return { cookie, userId: me.active.userId as string, email };
  }

  afterAll(async () => {
    // Pembersihan lewat koneksi baru: koneksi tes bisa tertahan dalam transaksi yang belum selesai.
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("daftar anggota, ubah data dan peran, keluarkan, dan hapus akun", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `Anggota ${uid}`,
      slug: `a-${uid}`,
      adminName: "Admin Utama",
      email: `admin-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const adminId = (await json(await call("GET", "/auth/me", admin))).active.userId as string;
    const ku = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    const period = (await json(await call("POST", "/periods", admin, { name: "Musim", startDate: iso(-30), endDate: iso(30) }))).id;
    const anak = await json(await call("POST", "/players", admin, { fullName: "Anak Satu", birthDate: "2016-04-05", ageGroupId: ku }));

    const budi = await gabung(admin, "pelatih", "Budi Coach", {}, "081234567890");
    const rina = await gabung(admin, "korlas", "Rina Korlas");
    const ibu = await gabung(admin, "orang_tua", "Ibu Ratna", { playerId: anak.id });
    expect((await call("POST", "/assignments", admin, { userId: budi.userId, ageGroupId: ku, periodId: period })).status).toBe(201);
    // Budi membuat sebuah undangan? hanya admin yang bisa; buat lewat admin lalu pindahkan pembuatnya agar uji pengosongan pembuat bermakna
    await call("POST", "/invitations", admin, { role: "pelatih", label: "Dibuat Budi" });
    await withTenant(db, ssbId, (tx) => tx.update(schema.invitation).set({ createdBy: budi.userId }).where(eq(schema.invitation.label, "Dibuat Budi")));

    // daftar: admin dulu, lalu korlas, pelatih, orang tua; jumlah anak dan penugasan serta cara masuk terisi
    const daftar = await json(await call("GET", "/members", admin));
    expect(daftar.map((m: any) => [m.name, m.role])).toEqual([
      ["Admin Utama", "admin_ssb"],
      ["Rina Korlas", "korlas"],
      ["Budi Coach", "pelatih"],
      ["Ibu Ratna", "orang_tua"],
    ]);
    const mBudi = daftar.find((m: any) => m.userId === budi.userId);
    expect(mBudi).toMatchObject({ whatsapp: "081234567890", assignments: 1, children: 0, hasPassword: true, hasGoogle: false, isSelf: false });
    expect(daftar.find((m: any) => m.userId === ibu.userId).children).toBe(1);
    expect(daftar[0].isSelf).toBe(true);

    // ubah nama dan kontak; kosong menghapus WhatsApp
    const diubah = await json(await call("PATCH", `/members/${budi.userId}`, admin, { name: "Budi Santoso", whatsapp: "" }));
    expect([diubah.name, diubah.whatsapp]).toEqual(["Budi Santoso", null]);
    expect((await call("PATCH", `/members/${budi.userId}`, admin, {})).status).toBe(400);
    expect((await call("PATCH", `/members/${budi.userId}`, admin, { whatsapp: "abc" })).status).toBe(400);
    expect((await call("PATCH", `/members/${randomUUID()}`, admin, { name: "X Y" })).status).toBe(404);
    // Mengubah nama diri sendiri lewat Anggota juga mengubah nama di /auth/me (dipakai header).
    expect((await call("PATCH", `/members/${adminId}`, admin, { name: "Nama Baru Admin" })).status).toBe(200);
    expect((await json(await call("GET", "/auth/me", admin))).name).toBe("Nama Baru Admin");
    expect((await call("PATCH", `/members/${adminId}`, admin, { name: "Admin Utama" })).status).toBe(200);

    // peran: pelatih menjadi korlas (penugasan tetap); aturan penjaga
    const korlasBaru = await json(await call("PATCH", `/members/${budi.userId}`, admin, { role: "korlas" }));
    expect([korlasBaru.role, korlasBaru.assignments]).toEqual(["korlas", 1]);
    expect((await json(await call("PATCH", `/members/${adminId}`, admin, { role: "pelatih" }))).error.code).toBe("self_role");
    expect((await json(await call("PATCH", `/members/${ibu.userId}`, admin, { role: "pelatih" }))).error.code).toBe("has_children");
    expect((await json(await call("PATCH", `/members/${budi.userId}`, admin, { role: "orang_tua" }))).error.code).toBe("has_assignments");
    // naikkan Rina menjadi admin: ia kini bisa mengelola anggota
    expect((await call("PATCH", `/members/${rina.userId}`, admin, { role: "admin_ssb" })).status).toBe(200);
    expect((await call("GET", "/members", rina.cookie)).status).toBe(200);

    // hanya admin: pelatih dan orang tua ditolak
    expect((await call("GET", "/members", ibu.cookie)).status).toBe(403);
    expect((await call("PATCH", `/members/${budi.userId}`, ibu.cookie, { name: "Hack Er" })).status).toBe(403);
    expect((await call("DELETE", `/members/${budi.userId}`, ibu.cookie)).status).toBe(403);
    expect((await call("GET", "/members")).status).toBe(401);

    // keluarkan: tidak diri sendiri; penugasan dan kaitan anak ikut lepas; riwayat tetap; sesi anggota itu berakhir
    expect((await json(await call("DELETE", `/members/${adminId}`, admin))).error.code).toBe("self");
    expect((await call("DELETE", `/members/${budi.userId}`, admin)).status).toBe(204);
    expect((await call("DELETE", `/members/${budi.userId}`, admin)).status).toBe(404);
    expect((await call("GET", "/auth/me", budi.cookie)).status).toBe(401);
    expect((await json(await call("GET", "/assignments", admin))).some((a: any) => a.userId === budi.userId)).toBe(false);
    const undangan = (await json(await call("GET", "/invitations", admin))).find((i: any) => i.label === "Dibuat Budi");
    expect(undangan.createdBy).toBeNull(); // undangan tetap ada, pembuatnya dikosongkan
    expect((await call("DELETE", `/members/${ibu.userId}`, admin)).status).toBe(204);
    expect((await json(await call("GET", `/players/${anak.id}`, admin))).guardians).toEqual([]);
    // akun yang dikeluarkan masih ada dan bisa masuk (tanpa SSB)
    expect((await call("POST", "/auth/login", undefined, { email: budi.email, password: PASS })).status).toBe(200);

    // hapus akun sendiri: konfirmasi harus benar; satu-satunya admin ditolak sampai ada admin lain
    const rina2 = await call("POST", "/auth/delete-account", rina.cookie, { confirm: "salah-sekali" });
    expect(rina2.status).toBe(400);
    expect((await json(rina2)).error.code).toBe("wrong_confirmation");
    // Rina dan admin utama sama-sama admin, jadi Rina boleh menghapus akun
    const hapus = await call("POST", "/auth/delete-account", rina.cookie, { confirm: PASS });
    expect(hapus.status).toBe(200);
    expect((await call("GET", "/auth/me", rina.cookie)).status).toBe(401);
    expect((await call("POST", "/auth/login", undefined, { email: rina.email, password: PASS })).status).toBe(401);
    expect((await json(await call("GET", "/members", admin))).map((m: any) => m.name)).toEqual(["Admin Utama"]);
    // Admin utama kini satu-satunya admin: tidak boleh menghapus akun
    const sendiri = await call("POST", "/auth/delete-account", admin, { confirm: PASS });
    expect(sendiri.status).toBe(409);
    expect((await json(sendiri)).error.code).toBe("sole_admin");
    expect((await call("POST", "/auth/delete-account", undefined, { confirm: PASS })).status).toBe(401);
  });
});
