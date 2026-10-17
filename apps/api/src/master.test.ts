import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("data master: KU, periode, lokasi", () => {
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
  const sessionOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("ssb_session="))!.split(";")[0]!;
  const json = async (res: Response) => (await res.json()) as any;

  async function newSsb(tag: string) {
    const res = await call("POST", "/auth/register-ssb", undefined, { ssbName: `M ${tag}`, slug: `m-${tag}-${uid}`, adminName: "Admin", email: `admin-${tag}-${uid}@uji.test`, password: PASS });
    expect(res.status).toBe(201);
    const { ssbId } = await json(res);
    ssbIds.push(ssbId);
    return { ssbId, admin: sessionOf(res) };
  }
  async function member(admin: string, role: string) {
    const inv = await json(await call("POST", "/invitations", admin, { role }));
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: role, email: `${role}-${uid}-${randomUUID().slice(0, 4)}@uji.test`, password: PASS });
    expect(acc.status).toBe(201);
    return sessionOf(acc);
  }

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("KU: tambah, daftar terurut usia, ubah, hapus", async () => {
    const { admin } = await newSsb("ku");
    const a = await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 });
    expect(a.status).toBe(201);
    const idA = (await json(a)).id;
    expect((await call("POST", "/age-groups", admin, { name: "KU-8", minAge: 7, maxAge: 8 })).status).toBe(201);
    const list = await json(await call("GET", "/age-groups", admin));
    expect(list.map((x: any) => x.name)).toEqual(["KU-8", "KU-10"]);
    const upd = await call("PATCH", `/age-groups/${idA}`, admin, { name: "KU-10 A", minAge: 9, maxAge: 10 });
    expect((await json(upd)).name).toBe("KU-10 A");
    expect((await call("DELETE", `/age-groups/${idA}`, admin)).status).toBe(204);
    expect((await call("DELETE", `/age-groups/${idA}`, admin)).status).toBe(404);
  });

  test("KU: rentang usia tidak boleh tumpang tindih (tambah dan ubah); bersebelahan boleh", async () => {
    const { admin } = await newSsb("tumpang");
    const first = await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }));
    const overlap = await call("POST", "/age-groups", admin, { name: "KU-12B", minAge: 12, maxAge: 13 });
    expect(overlap.status).toBe(409);
    expect((await json(overlap)).error.code).toBe("age_overlap");
    const inside = await call("POST", "/age-groups", admin, { name: "KU-X", minAge: 11, maxAge: 11 });
    expect(inside.status).toBe(409);
    const next = await json(await call("POST", "/age-groups", admin, { name: "KU-14", minAge: 13, maxAge: 14 }));
    expect(next.id).toBeTruthy();
    // mengubah diri sendiri tidak dianggap tumpang tindih; melebar ke tetangga ditolak
    expect((await call("PATCH", `/age-groups/${first.id}`, admin, { name: "KU-12", minAge: 10, maxAge: 12 })).status).toBe(200);
    expect((await call("PATCH", `/age-groups/${first.id}`, admin, { name: "KU-12", minAge: 10, maxAge: 13 })).status).toBe(409);
    expect((await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 20, maxAge: 21 }))).error.code).toBe("duplicate");
  });

  test("KU: validasi rentang dan nama memberi pesan per kolom", async () => {
    const { admin } = await newSsb("valku");
    const bad = await call("POST", "/age-groups", admin, { name: "K", minAge: 12, maxAge: 9 });
    expect(bad.status).toBe(400);
    const f = (await json(bad)).error.fields;
    expect(f.name).toBeTruthy();
    expect(f.maxAge).toBe("tidak boleh lebih kecil dari usia minimal");
    expect((await call("POST", "/age-groups", admin, { name: "KU-1", minAge: 1.5, maxAge: 3 })).status).toBe(400);
  });

  test("periode: tanggal valid, selesai tidak sebelum mulai, nama unik", async () => {
    const { admin } = await newSsb("per");
    const ok = await call("POST", "/periods", admin, { name: "Musim 2026/27", startDate: "2026-08-01", endDate: "2027-05-31" });
    expect(ok.status).toBe(201);
    const id = (await json(ok)).id;
    const rev = await call("POST", "/periods", admin, { name: "Terbalik", startDate: "2026-09-01", endDate: "2026-08-01" });
    expect(rev.status).toBe(400);
    expect((await json(rev)).error.fields.endDate).toBeTruthy();
    expect((await call("POST", "/periods", admin, { name: "Salah", startDate: "2026-02-30", endDate: "2026-03-01" })).status).toBe(400);
    expect((await json(await call("POST", "/periods", admin, { name: "Musim 2026/27", startDate: "2027-06-01", endDate: "2027-12-01" }))).error.code).toBe("duplicate");
    const upd = await call("PATCH", `/periods/${id}`, admin, { name: "Musim 2026/27", startDate: "2026-08-01", endDate: "2027-06-30" });
    expect((await json(upd)).endDate).toBe("2027-06-30");
    expect((await call("DELETE", `/periods/${id}`, admin)).status).toBe(204);
  });

  test("lokasi: tambah, alamat opsional, ubah, nama unik, hapus", async () => {
    const { admin } = await newSsb("lok");
    const a = await json(await call("POST", "/locations", admin, { name: "Lapangan Utama" }));
    expect(a.address).toBeNull();
    await call("POST", "/locations", admin, { name: "Lapangan B", address: "Jl. Merdeka 1" });
    expect((await json(await call("POST", "/locations", admin, { name: "Lapangan B" }))).error.code).toBe("duplicate");
    const upd = await json(await call("PATCH", `/locations/${a.id}`, admin, { name: "Lapangan Utama", address: "Jl. Mawar 5" }));
    expect(upd.address).toBe("Jl. Mawar 5");
    expect((await json(await call("GET", "/locations", admin))).map((x: any) => x.name)).toEqual(["Lapangan B", "Lapangan Utama"]);
    expect((await call("DELETE", `/locations/${a.id}`, admin)).status).toBe(204);
  });

  test("izin: pelatih dan korlas hanya membaca; orang tua dan tanpa sesi ditolak", async () => {
    const { admin } = await newSsb("izin");
    const pelatih = await member(admin, "pelatih");
    const korlas = await member(admin, "korlas");
    const ortu = await member(admin, "orang_tua");
    for (const path of ["/age-groups", "/periods", "/locations"]) {
      expect((await call("GET", path, pelatih)).status).toBe(200);
      expect((await call("GET", path, korlas)).status).toBe(200);
      expect((await call("GET", path, ortu)).status).toBe(403);
      expect((await call("GET", path)).status).toBe(401);
    }
    const body = { "/age-groups": { name: "KU-9", minAge: 8, maxAge: 9 }, "/periods": { name: "Periode", startDate: "2026-01-01", endDate: "2026-12-31" }, "/locations": { name: "Lokasi" } } as const;
    for (const [path, b] of Object.entries(body)) for (const who of [pelatih, korlas, ortu]) expect((await call("POST", path, who, b)).status).toBe(403);
    const ku = await json(await call("POST", "/age-groups", admin, body["/age-groups"]));
    expect((await call("DELETE", `/age-groups/${ku.id}`, pelatih)).status).toBe(403);
    expect((await call("PATCH", `/age-groups/${ku.id}`, pelatih, body["/age-groups"])).status).toBe(403);
  });

  test("isolasi tenant: SSB lain tidak melihat, mengubah, atau menghapus data ini", async () => {
    const a = await newSsb("isoA");
    const b = await newSsb("isoB");
    const ku = await json(await call("POST", "/age-groups", a.admin, { name: "KU-10", minAge: 9, maxAge: 10 }));
    const per = await json(await call("POST", "/periods", a.admin, { name: "P1", startDate: "2026-01-01", endDate: "2026-06-30" }));
    const lok = await json(await call("POST", "/locations", a.admin, { name: "L1" }));
    for (const path of ["/age-groups", "/periods", "/locations"]) expect(await json(await call("GET", path, b.admin))).toEqual([]);
    expect((await call("PATCH", `/age-groups/${ku.id}`, b.admin, { name: "Curi", minAge: 9, maxAge: 10 })).status).toBe(404);
    expect((await call("PATCH", `/periods/${per.id}`, b.admin, { name: "Curi", startDate: "2026-01-01", endDate: "2026-06-30" })).status).toBe(404);
    expect((await call("PATCH", `/locations/${lok.id}`, b.admin, { name: "Curi" })).status).toBe(404);
    for (const p of [`/age-groups/${ku.id}`, `/periods/${per.id}`, `/locations/${lok.id}`]) expect((await call("DELETE", p, b.admin)).status).toBe(404);
    // SSB lain boleh memakai nama dan rentang usia yang sama (tumpang tindih hanya dalam satu SSB)
    expect((await call("POST", "/age-groups", b.admin, { name: "KU-10", minAge: 9, maxAge: 10 })).status).toBe(201);
    expect((await json(await call("GET", "/age-groups", a.admin))).map((x: any) => x.id)).toEqual([ku.id]);
  });

  test("KU yang masih dipakai pemain tidak bisa dihapus (409) dan data tidak hilang", async () => {
    const { ssbId, admin } = await newSsb("pakai");
    const ku = await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }));
    await withTenant(db, ssbId, (tx) => tx.insert(schema.player).values({ ssbId, fullName: "Budi", birthDate: "2016-03-01", ageGroupId: ku.id }));
    const del = await call("DELETE", `/age-groups/${ku.id}`, admin);
    expect(del.status).toBe(409);
    expect((await json(del)).error.code).toBe("in_use");
    expect(await json(await call("GET", "/age-groups", admin))).toHaveLength(1);
  });

  test("id bukan UUID dijawab 404, bukan 500", async () => {
    const { admin } = await newSsb("uuid");
    expect((await call("DELETE", "/age-groups/bukan-uuid", admin)).status).toBe(404);
    expect((await call("PATCH", "/periods/123", admin, { name: "Periode", startDate: "2026-01-01", endDate: "2026-02-01" })).status).toBe(404);
  });
});
