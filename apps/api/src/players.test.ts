import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

run("pemain, penugasan, dan batas data per role", () => {
  const { db, client } = createDb(url!);
  const app = createApp(db, { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) }, { google: null });
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const sessionOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("ssb_session="))!.split(";")[0]!;
  const json = async (res: Response) => (await res.json()) as any;

  async function newSsb(tag: string) {
    const res = await call("POST", "/auth/register-ssb", undefined, { ssbName: `P ${tag}`, slug: `p-${tag}-${uid}`, adminName: "Admin", email: `admin-${tag}-${uid}@uji.test`, password: PASS });
    expect(res.status).toBe(201);
    const { ssbId } = await json(res);
    ssbIds.push(ssbId);
    return { ssbId, admin: sessionOf(res) };
  }
  async function join(admin: string, role: string, extra: object = {}) {
    const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
    const email = `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`;
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: `${role} ${email.slice(0, 6)}`, email, password: PASS });
    expect(acc.status).toBe(201);
    const cookie = sessionOf(acc);
    const me = await json(await call("GET", "/auth/me", cookie));
    return { cookie, userId: me.active.userId as string };
  }
  const mkKu = async (admin: string, name: string, min: number, max: number) => (await json(await call("POST", "/age-groups", admin, { name, minAge: min, maxAge: max }))).id as string;
  const mkPlayer = async (admin: string, name: string, ageGroupId?: string | null, extra: object = {}) => {
    const r = await call("POST", "/players", admin, { fullName: name, birthDate: "2016-04-05", ageGroupId, ...extra });
    expect(r.status).toBe(201);
    return json(r);
  };

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("nomor anggota otomatis, berurutan, dan unik walau dibuat serentak", async () => {
    const { admin } = await newSsb("no");
    const a = await mkPlayer(admin, "Budi Santoso");
    const b = await mkPlayer(admin, "Andi Pratama");
    expect([a.memberNo, b.memberNo]).toEqual(["P0001", "P0002"]);
    const many = await Promise.all(Array.from({ length: 6 }, (_, i) => call("POST", "/players", admin, { fullName: `Paralel ${i}`, birthDate: "2015-01-01" })));
    expect(many.every((r) => r.status === 201)).toBe(true);
    const nos = (await Promise.all(many.map(json))).map((p) => p.memberNo);
    expect(new Set(nos).size).toBe(6);
    expect(a.status).toBe("aktif");
  });

  test("nomor anggota per SSB: SSB lain mulai dari P0001 lagi", async () => {
    const x = await newSsb("noX");
    const y = await newSsb("noY");
    expect((await mkPlayer(x.admin, "Satu")).memberNo).toBe("P0001");
    expect((await mkPlayer(y.admin, "Satu")).memberNo).toBe("P0001");
  });

  test("validasi biodata dan KU dari SSB lain ditolak", async () => {
    const a = await newSsb("val");
    const b = await newSsb("valB");
    const kuB = await mkKu(b.admin, "KU-10", 9, 10);
    const bad = await call("POST", "/players", a.admin, { fullName: "B", birthDate: iso(5) });
    expect(bad.status).toBe(400);
    const f = (await json(bad)).error.fields;
    expect(f.fullName).toBeTruthy();
    expect(f.birthDate).toBe("tidak boleh di masa depan");
    expect((await call("POST", "/players", a.admin, { fullName: "Budi", birthDate: "2016-02-30" })).status).toBe(400);
    const cross = await call("POST", "/players", a.admin, { fullName: "Budi", birthDate: "2016-01-01", ageGroupId: kuB });
    expect(cross.status).toBe(422);
    expect((await json(cross)).error.code).toBe("age_group_invalid");
  });

  test("riwayat: perubahan KU dan status tercatat, tanpa perubahan tidak mencatat", async () => {
    const { admin } = await newSsb("riw");
    const k10 = await mkKu(admin, "KU-10", 9, 10);
    const k12 = await mkKu(admin, "KU-12", 11, 12);
    const p = await mkPlayer(admin, "Dimas", k10);
    const form = (o: object) => ({ fullName: "Dimas", birthDate: "2016-04-05", school: "SDN 1", ageGroupId: k10, status: "aktif", ...o });
    expect((await call("PATCH", `/players/${p.id}`, admin, form({}))).status).toBe(200);
    expect((await json(await call("GET", `/players/${p.id}`, admin))).history).toEqual([]);
    await call("PATCH", `/players/${p.id}`, admin, form({ ageGroupId: k12 }));
    await call("PATCH", `/players/${p.id}`, admin, form({ ageGroupId: k12, status: "cuti" }));
    const d = await json(await call("GET", `/players/${p.id}`, admin));
    expect(d.school).toBe("SDN 1");
    expect(d.ageGroup.name).toBe("KU-12");
    expect(d.history.map((h: any) => [h.field, h.from, h.to])).toEqual([
      ["status", "aktif", "cuti"],
      ["age_group", "KU-10", "KU-12"],
    ]);
    await call("PATCH", `/players/${p.id}`, admin, form({ ageGroupId: null, status: "cuti" }));
    const d2 = await json(await call("GET", `/players/${p.id}`, admin));
    expect(d2.history[0]).toMatchObject({ field: "age_group", from: "KU-12", to: null });
  });

  test("pencarian, filter KU dan status; karakter % dan _ tidak jadi wildcard", async () => {
    const { admin } = await newSsb("cari");
    const k10 = await mkKu(admin, "KU-10", 9, 10);
    await mkPlayer(admin, "Rizky Aditya", k10);
    await mkPlayer(admin, "Rizal Fajar");
    await mkPlayer(admin, "Gilang", k10, { status: "cuti" });
    const names = async (qs: string) => (await json(await call("GET", `/players${qs}`, admin))).map((p: any) => p.fullName);
    expect(await names("")).toEqual(["Gilang", "Rizal Fajar", "Rizky Aditya"]);
    expect(await names("?q=riz")).toEqual(["Rizal Fajar", "Rizky Aditya"]);
    expect(await names(`?ageGroupId=${k10}`)).toEqual(["Gilang", "Rizky Aditya"]);
    expect(await names("?status=cuti")).toEqual(["Gilang"]);
    expect(await names("?q=%25")).toEqual([]);
    expect(await names("?q=R_zal")).toEqual([]);
    expect((await call("GET", "/players?status=ngawur", admin)).status).toBe(400);
    expect(await names("?ageGroupId=bukan-uuid")).toEqual([]);
  });

  test("pelatih dan korlas hanya melihat KU yang ditugaskan di periode berjalan", async () => {
    const { admin } = await newSsb("scope");
    const k10 = await mkKu(admin, "KU-10", 9, 10);
    const k12 = await mkKu(admin, "KU-12", 11, 12);
    const now = (await json(await call("POST", "/periods", admin, { name: "Sekarang", startDate: iso(-30), endDate: iso(30) }))).id;
    const old = (await json(await call("POST", "/periods", admin, { name: "Lama", startDate: iso(-400), endDate: iso(-100) }))).id;
    const p10 = await mkPlayer(admin, "Anak KU10", k10);
    const p12 = await mkPlayer(admin, "Anak KU12", k12);
    const p0 = await mkPlayer(admin, "Tanpa KU");
    const pel = await join(admin, "pelatih");
    const kor = await join(admin, "korlas");
    const asg = (userId: string, ageGroupId: string, periodId: string) => call("POST", "/assignments", admin, { userId, ageGroupId, periodId });
    expect((await asg(pel.userId, k10, now)).status).toBe(201);
    expect((await asg(pel.userId, k12, old)).status).toBe(201); // periode lama tidak memberi akses
    expect((await asg(kor.userId, k12, now)).status).toBe(201);

    const list = async (cookie: string) => (await json(await call("GET", "/players", cookie))).map((p: any) => p.fullName);
    expect(await list(pel.cookie)).toEqual(["Anak KU10"]);
    expect(await list(kor.cookie)).toEqual(["Anak KU12"]);
    expect(await list(admin)).toHaveLength(3);
    expect((await call("GET", `/players/${p10.id}`, pel.cookie)).status).toBe(200);
    for (const id of [p12.id, p0.id]) expect((await call("GET", `/players/${id}`, pel.cookie)).status).toBe(404);
    expect((await call("GET", `/players/${p10.id}`, kor.cookie)).status).toBe(404);
    // pelatih punya riwayat tetapi bukan daftar orang tua; tidak boleh menulis
    const d = await json(await call("GET", `/players/${p10.id}`, pel.cookie));
    expect(d.history).toEqual([]);
    expect(d.guardians).toBeUndefined();
    expect((await call("PATCH", `/players/${p10.id}`, pel.cookie, { fullName: "Ubah", birthDate: "2016-04-05" })).status).toBe(403);
    expect((await call("POST", "/players", pel.cookie, { fullName: "Baru", birthDate: "2016-04-05" })).status).toBe(403);
    // pelatih tanpa penugasan sama sekali melihat daftar kosong
    const none = await join(admin, "pelatih");
    expect(await list(none.cookie)).toEqual([]);
  });

  test("orang tua hanya melihat anaknya; undangan dan hubungan manual", async () => {
    const { admin } = await newSsb("ortu");
    const k10 = await mkKu(admin, "KU-10", 9, 10);
    const anak = await mkPlayer(admin, "Anak Satu", k10);
    const lain = await mkPlayer(admin, "Anak Lain", k10);
    const ortu = await join(admin, "orang_tua", { playerId: anak.id });
    expect((await json(await call("GET", "/players", ortu.cookie))).map((p: any) => p.fullName)).toEqual(["Anak Satu"]);
    expect((await call("GET", `/players/${lain.id}`, ortu.cookie)).status).toBe(404);
    const d = await json(await call("GET", `/players/${anak.id}`, ortu.cookie));
    expect(d.guardians).toBeUndefined();
    expect(d.history).toEqual([]);
    expect((await call("PATCH", `/players/${anak.id}`, ortu.cookie, { fullName: "X", birthDate: "2016-04-05" })).status).toBe(403);
    // admin menghubungkan orang tua ke anak kedua; duplikat dan non-orang tua ditolak
    expect((await call("POST", `/players/${lain.id}/guardians`, admin, { userId: ortu.userId, relationship: "Ibu" })).status).toBe(201);
    expect((await json(await call("POST", `/players/${lain.id}/guardians`, admin, { userId: ortu.userId }))).error.code).toBe("duplicate");
    const pel = await join(admin, "pelatih");
    expect((await json(await call("POST", `/players/${lain.id}/guardians`, admin, { userId: pel.userId }))).error.code).toBe("member_not_parent");
    expect((await json(await call("POST", `/players/${lain.id}/guardians`, admin, { userId: randomUUID() }))).error.code).toBe("member_invalid");
    expect((await json(await call("GET", "/players", ortu.cookie))).map((p: any) => p.fullName)).toEqual(["Anak Lain", "Anak Satu"]);
    const ad = await json(await call("GET", `/players/${lain.id}`, admin));
    expect(ad.guardians).toEqual([{ userId: ortu.userId, name: expect.any(String), relationship: "Ibu" }]);
    expect((await call("DELETE", `/players/${lain.id}/guardians/${ortu.userId}`, admin)).status).toBe(204);
    expect((await call("DELETE", `/players/${lain.id}/guardians/${ortu.userId}`, admin)).status).toBe(404);
    expect((await call("GET", `/players/${lain.id}`, ortu.cookie)).status).toBe(404);
  });

  test("penugasan: hanya pelatih atau korlas, tidak ganda, bisa dihapus; hanya admin yang mengelola", async () => {
    const { admin } = await newSsb("asg");
    const k10 = await mkKu(admin, "KU-10", 9, 10);
    const per = (await json(await call("POST", "/periods", admin, { name: "Periode", startDate: iso(-1), endDate: iso(100) }))).id;
    const pel = await join(admin, "pelatih");
    const ortu = await join(admin, "orang_tua");
    const body = { userId: pel.userId, ageGroupId: k10, periodId: per };
    expect((await call("POST", "/assignments", admin, body)).status).toBe(201);
    expect((await json(await call("POST", "/assignments", admin, body))).error.code).toBe("duplicate");
    expect((await json(await call("POST", "/assignments", admin, { ...body, userId: ortu.userId }))).error.code).toBe("member_not_coach");
    expect((await json(await call("POST", "/assignments", admin, { ...body, ageGroupId: randomUUID() }))).error.code).toBe("reference_invalid");
    const list = await json(await call("GET", "/assignments", admin));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ userId: pel.userId, ageGroupName: "KU-10", periodName: "Periode", role: "pelatih" });
    expect((await call("GET", "/assignments", pel.cookie)).status).toBe(403);
    expect((await call("POST", "/assignments", pel.cookie, body)).status).toBe(403);
    expect((await call("DELETE", `/assignments/${pel.userId}/${k10}/${per}`, pel.cookie)).status).toBe(403);
    expect((await call("DELETE", `/assignments/${pel.userId}/${k10}/${per}`, admin)).status).toBe(204);
    expect((await call("DELETE", `/assignments/${pel.userId}/${k10}/${per}`, admin)).status).toBe(404);
  });

  test("isolasi tenant: pemain, penugasan, dan hubungan SSB lain tidak terlihat atau bisa diubah", async () => {
    const a = await newSsb("isoA");
    const b = await newSsb("isoB");
    const p = await mkPlayer(a.admin, "Rahasia A");
    expect(await json(await call("GET", "/players", b.admin))).toEqual([]);
    expect((await call("GET", `/players/${p.id}`, b.admin)).status).toBe(404);
    expect((await call("PATCH", `/players/${p.id}`, b.admin, { fullName: "Curi", birthDate: "2016-04-05" })).status).toBe(404);
    expect((await call("POST", `/players/${p.id}/guardians`, b.admin, { userId: randomUUID() })).status).toBe(404);
    expect((await json(await call("GET", `/players/${p.id}`, a.admin))).fullName).toBe("Rahasia A");
  });
});
