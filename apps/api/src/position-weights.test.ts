import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { defaultPositionWeights, type PositionWeights } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("bobot posisi per SSB", () => {
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
  const bobot = async (cookie: string) => (await (await call("GET", "/position-weights", cookie)).json()) as PositionWeights;

  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `B ${tag}`,
      slug: `b-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = (await reg.json()) as { ssbId: string };
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const inv = (await (await call("POST", "/invitations", admin, { role: "pelatih" })).json()) as { token: string };
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, {
      name: "pelatih",
      email: `pelatih-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(acc.status).toBe(201);
    return { ssbId, admin, pelatih: sessionOf(acc) };
  }
  const tersimpan = (ssbId: string) => withTenant(db, ssbId, (tx) => tx.select().from(schema.positionWeight));

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("tanpa perubahan, semua peran membaca bobot awal", async () => {
    const w = await world("awal");
    expect((await call("GET", "/position-weights")).status).toBe(401);
    expect(await bobot(w.admin)).toEqual(defaultPositionWeights);
    expect(await bobot(w.pelatih)).toEqual(defaultPositionWeights);
  });

  test("admin menimpa bobot: hanya yang berbeda dari bawaan disimpan, SSB lain tidak terpengaruh", async () => {
    const w = await world("timpa");
    const lain = await world("lain");
    const res = await call("PUT", "/position-weights", w.admin, {
      weights: {
        GK: { Shooting: 3, Fokus: defaultPositionWeights.GK.Fokus, "Tendangan bebas": 4, Refleks: 0 },
        FW: { Dribbling: 0 },
      },
    });
    expect(res.status).toBe(200);
    const hasil = (await res.json()) as PositionWeights;
    expect(hasil.GK.Shooting).toBe(3);
    expect(hasil.GK["Tendangan bebas"]).toBe(4);
    expect(hasil.FW.Dribbling).toBe(0);
    expect(hasil.FW.Shooting).toBe(defaultPositionWeights.FW.Shooting);
    expect(hasil.DF).toEqual(defaultPositionWeights.DF);
    expect(await bobot(w.pelatih)).toEqual(hasil);

    // Fokus sama dengan bawaan dan Refleks bernilai 0 (sama dengan tidak ada), jadi tidak disimpan.
    expect((await tersimpan(w.ssbId)).map((r) => `${r.position}:${r.indicator}:${r.weight}`).sort()).toEqual([
      "FW:Dribbling:0",
      "GK:Shooting:3",
      "GK:Tendangan bebas:4",
    ]);
    expect(await bobot(lain.admin)).toEqual(defaultPositionWeights);

    // PUT mengganti seluruhnya: posisi yang tidak dikirim kembali ke bawaan.
    const ganti = (await (await call("PUT", "/position-weights", w.admin, { weights: { DF: { Passing: 5 } } })).json()) as PositionWeights;
    expect(ganti.GK).toEqual(defaultPositionWeights.GK);
    expect(ganti.DF.Passing).toBe(5);
  });

  test("hanya admin yang boleh mengubah; DELETE mengembalikan ke bawaan", async () => {
    const w = await world("izin");
    expect((await call("PUT", "/position-weights", w.pelatih, { weights: { GK: { Shooting: 3 } } })).status).toBe(403);
    expect((await call("DELETE", "/position-weights", w.pelatih)).status).toBe(403);
    expect((await call("PUT", "/position-weights", w.admin, { weights: { GK: { Shooting: 3 } } })).status).toBe(200);
    expect((await call("DELETE", "/position-weights", w.admin)).status).toBe(204);
    expect(await bobot(w.admin)).toEqual(defaultPositionWeights);
    expect(await tersimpan(w.ssbId)).toHaveLength(0);
  });

  test("bobot di luar 0 sampai 5, pecahan, dan posisi tak dikenal ditolak", async () => {
    const w = await world("tolak");
    for (const weights of [{ GK: { Shooting: 6 } }, { GK: { Shooting: -1 } }, { GK: { Shooting: 2.5 } }, { XX: { Shooting: 2 } }]) {
      expect([JSON.stringify(weights), (await call("PUT", "/position-weights", w.admin, { weights })).status]).toEqual([JSON.stringify(weights), 400]);
    }
    expect(await tersimpan(w.ssbId)).toHaveLength(0);
  });
});
