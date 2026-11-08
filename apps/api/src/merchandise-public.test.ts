import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("merchandise publik: tidak membocorkan data internal", () => {
  const { db, client } = createDb(url!);
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) },
    { google: null },
  );
  const uid = randomUUID().slice(0, 8);
  const ssbIds: string[] = [];
  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" ? { body: JSON.stringify(body ?? {}) } : {}),
    });

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("daftar produk publik hanya memuat produk aktif dan tanpa harga modal", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `M ${uid}`,
      slug: `m-${uid}`,
      adminName: "Admin",
      email: `admin-${uid}@uji.test`,
      password: "kata-sandi-panjang-1",
    });
    expect(reg.status).toBe(201);
    const { ssbId } = (await reg.json()) as { ssbId: string };
    ssbIds.push(ssbId);
    const cookie = reg.headers.getSetCookie().find((c) => c.startsWith("ssb_session="))!.split(";")[0]!;

    expect((await call("POST", "/merchandise", cookie, { name: "Jersey Uji", description: "d", price: 150000, hpp: 90000, stock: 5, category: "jersey", active: true })).status).toBeLessThan(300);
    expect((await call("POST", "/merchandise", cookie, { name: "Produk Tersembunyi", price: 1000, hpp: 500, stock: 1, active: false })).status).toBeLessThan(300);

    const res = await app.request(`/public/merchandise/products?ssb=m-${uid}`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Record<string, unknown>[];
    expect(list.map((p) => p.name)).toEqual(["Jersey Uji"]);
    // Bentuk persis yang boleh keluar: harga modal, status, dan waktu ubah tidak ikut.
    expect(Object.keys(list[0]!).sort()).toEqual(["category", "description", "id", "imageFileKey", "name", "price", "stock"]);
    expect(list[0]!.category).toBe("jersey");
    expect(JSON.stringify(list)).not.toContain("90000");
  });

  test("kategori: bawaan lainnya, kode tidak dikenal ditolak, dan perubahan tersimpan", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `K ${uid}`,
      slug: `k-${uid}`,
      adminName: "Admin",
      email: `admin-k-${uid}@uji.test`,
      password: "kata-sandi-panjang-1",
    });
    expect(reg.status).toBe(201);
    ssbIds.push(((await reg.json()) as { ssbId: string }).ssbId);
    const cookie = reg.headers.getSetCookie().find((c) => c.startsWith("ssb_session="))!.split(";")[0]!;

    const tanpa = await call("POST", "/merchandise", cookie, { name: "Tanpa Kategori", price: 1000, hpp: 500, stock: 1 });
    expect(tanpa.status).toBe(201);
    const baris = (await tanpa.json()) as { id: string; category: string };
    expect(baris.category).toBe("lainnya");

    const salah = await call("POST", "/merchandise", cookie, { name: "Salah", price: 1000, hpp: 500, stock: 1, category: "senjata" });
    expect(salah.status).toBe(400);

    const ubah = await call("PUT", `/merchandise/${baris.id}`, cookie, { name: "Tanpa Kategori", price: 1000, hpp: 500, stock: 1, category: "aksesori" });
    expect(ubah.status).toBe(200);
    expect(((await ubah.json()) as { category: string }).category).toBe("aksesori");
    const daftar = (await (await call("GET", "/merchandise", cookie)).json()) as { category: string }[];
    expect(daftar.map((p) => p.category)).toEqual(["aksesori"]);
  });
});
