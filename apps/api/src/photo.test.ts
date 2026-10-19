import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import { photoStore, photoVersion, sniffImage } from "./photo";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1]);
const WEBP = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);

describe("foto pemain: isi berkas dan penyimpanan (tanpa database)", () => {
  test("tipe gambar dikenali dari isi, bukan dari nama", () => {
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(JPG)).toBe("jpg");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(sniffImage(new TextEncoder().encode("GIF89a......."))).toBeNull();
  });

  test("versi diambil dari kunci; kunci di luar folder penyimpanan ditolak", async () => {
    expect(photoVersion("ssb/pemain-0a1b2c3d.png")).toBe("0a1b2c3d");
    expect(photoVersion(null)).toBeNull();
    const dir = mkdtempSync(join(tmpdir(), "ssb-foto-"));
    try {
      const s = photoStore(dir);
      await s.put("a/b-0a1b2c3d.png", PNG);
      expect((await s.get("a/b-0a1b2c3d.png"))?.length).toBe(PNG.length);
      expect(await s.get("a/tidak-ada.png")).toBeNull();
      await expect(s.get("../folder-lain/berkas.png")).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("foto pemain: API dan batas data per role", () => {
  const { db, client } = createDb(url!);
  const dir = mkdtempSync(join(tmpdir(), "ssb-foto-"));
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40), UPLOAD_DIR: dir },
    { google: null },
  );
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];
  const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const upload = (id: string, cookie: string, bytes: Uint8Array, name = "foto.png") => {
    const f = new FormData();
    f.set("file", new File([bytes as BlobPart], name));
    return app.request(`/players/${id}/photo`, { method: "PUT", headers: { cookie, origin: "http://localhost:3001" }, body: f });
  };
  const get = (id: string, cookie: string) => app.request(`/players/${id}/photo`, { headers: cookie ? { cookie } : {} });
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;
  const json = async (res: Response) => (await res.json()) as any;
  async function gabung(admin: string, role: string, extra: object = {}) {
    const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
    const email = `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`;
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: `${role} x`, email, password: PASS });
    expect(acc.status).toBe(201);
    const cookie = sessionOf(acc);
    const me = await json(await call("GET", "/auth/me", cookie));
    return { cookie, userId: me.active.userId as string };
  }

  // Satu SSB untuk semua tes di berkas ini (pembersihan dengan beberapa SSB menggantung di lingkungan ini).
  let satu: Promise<{ ssbId: string; admin: string }> | undefined;
  const ssbTunggal = () =>
    (satu ??= (async () => {
      const reg = await call("POST", "/auth/register-ssb", undefined, {
        ssbName: `Foto ${uid}`,
        slug: `f-${uid}`,
        adminName: "Admin",
        email: `admin-${uid}@uji.test`,
        password: PASS,
      });
      const { ssbId } = await json(reg);
      ssbIds.push(ssbId);
      return { ssbId: ssbId as string, admin: sessionOf(reg) };
    })());

  afterAll(async () => {
    // Pembersihan lewat koneksi baru: koneksi tes bisa tertahan dalam transaksi yang belum selesai.
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
    rmSync(dir, { recursive: true, force: true });
  });

  test("unggah, baca, ganti, dan hapus; tipe dan ukuran dibatasi", async () => {
    const { ssbId, admin } = await ssbTunggal();
    const ku = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    const p = await json(await call("POST", "/players", admin, { fullName: "Budi", birthDate: "2016-04-05", ageGroupId: ku }));
    expect(p.photoV).toBeNull();
    expect((await get(p.id, admin)).status).toBe(404);

    const up = await upload(p.id, admin, PNG);
    expect(up.status).toBe(200);
    const v1 = (await json(up)).photoV as string;
    expect(v1).toMatch(/^[0-9a-f]{8}$/);
    const res = await get(p.id, admin);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    expect((await json(await call("GET", `/players/${p.id}`, admin))).photoV).toBe(v1);
    expect((await json(await call("GET", "/players", admin)))[0].photoV).toBe(v1);

    // mengganti: versi berubah dan berkas lama dihapus dari penyimpanan
    const v2 = (await json(await upload(p.id, admin, JPG, "foto.jpg"))).photoV as string;
    expect(v2).not.toBe(v1);
    expect((await get(p.id, admin)).headers.get("content-type")).toBe("image/jpeg");
    const files = readdirSync(join(dir, ssbId));
    expect(files).toHaveLength(1);

    // bukan gambar (walau bernama .png), terlalu besar, atau tanpa berkas
    expect((await upload(p.id, admin, new TextEncoder().encode("<svg/>"), "x.png")).status).toBe(415);
    expect((await upload(p.id, admin, new Uint8Array(2 * 1024 * 1024 + 10).fill(0xff))).status).toBe(413);
    const kosong = await app.request(`/players/${p.id}/photo`, {
      method: "PUT",
      headers: { cookie: admin, origin: "http://localhost:3001" },
      body: new FormData(),
    });
    expect(kosong.status).toBe(400);
    expect((await upload(randomUUID(), admin, PNG)).status).toBe(404);

    expect((await call("DELETE", `/players/${p.id}/photo`, admin)).status).toBe(204);
    expect((await get(p.id, admin)).status).toBe(404);
    expect((await json(await call("GET", `/players/${p.id}`, admin))).photoV).toBeNull();
    expect(existsSync(join(dir, ssbId, files[0]!))).toBe(false);
  });

  test("batas role: pelatih hanya KU-nya, orang tua hanya melihat anaknya dan tidak bisa mengunggah", async () => {
    const { admin } = await ssbTunggal();
    const k10 = (await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id;
    const k12 = (await json(await call("POST", "/age-groups", admin, { name: "KU-14", minAge: 13, maxAge: 14 }))).id;
    const now = (await json(await call("POST", "/periods", admin, { name: "Sekarang", startDate: iso(-30), endDate: iso(30) }))).id;
    const a = await json(await call("POST", "/players", admin, { fullName: "Anak A", birthDate: "2016-04-05", ageGroupId: k10 }));
    const b = await json(await call("POST", "/players", admin, { fullName: "Anak B", birthDate: "2014-04-05", ageGroupId: k12 }));
    const pel = await gabung(admin, "pelatih");
    await call("POST", "/assignments", admin, { userId: pel.userId, ageGroupId: k10, periodId: now });
    const ortu = await gabung(admin, "orang_tua", { playerId: a.id });

    expect((await upload(a.id, pel.cookie, PNG)).status).toBe(200);
    expect((await upload(b.id, pel.cookie, PNG)).status).toBe(404); // di luar KU pelatih
    expect((await get(b.id, pel.cookie)).status).toBe(404);
    expect((await call("DELETE", `/players/${b.id}/photo`, pel.cookie)).status).toBe(404);

    expect((await get(a.id, ortu.cookie)).status).toBe(200);
    expect((await json(await call("GET", `/players/${a.id}`, ortu.cookie))).photoV).toMatch(/^[0-9a-f]{8}$/);
    expect((await upload(a.id, ortu.cookie, PNG)).status).toBe(403);
    expect((await call("DELETE", `/players/${a.id}/photo`, ortu.cookie)).status).toBe(403);
    expect((await get(b.id, ortu.cookie)).status).toBe(404);
    expect((await get(a.id, "")).status).toBe(401);
  });
});
