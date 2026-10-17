import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("nomor WhatsApp anggota", () => {
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

  async function newSsb(tag: string) {
    const res = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `W ${tag}`,
      slug: `w-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(res.status).toBe(201);
    const { ssbId } = await json(res);
    ssbIds.push(ssbId);
    return { ssbId, admin: sessionOf(res) };
  }
  const invite = async (admin: string) => (await json(await call("POST", "/invitations", admin, { role: "orang_tua" }))).token as string;
  const accept = (token: string, extra: object = {}) =>
    call("POST", `/invitations/${token}/accept`, undefined, {
      name: "Wali Uji",
      email: `wali-${randomUUID().slice(0, 6)}-${uid}@uji.test`,
      password: PASS,
      ...extra,
    });
  const waOf = async (cookie: string) => (await json(await call("GET", "/auth/me", cookie))).whatsapp as string | null;

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("undangan: nomor opsional, dinormalkan, dan nomor tidak valid ditolak tanpa menghabiskan undangan", async () => {
    const { admin } = await newSsb("inv");
    const token = await invite(admin);
    // nomor tidak valid: ditolak, undangan tetap berlaku
    expect((await accept(token, { whatsapp: "abc" })).status).toBe(400);
    expect((await accept(token, { whatsapp: "0812" })).status).toBe(400);
    // dengan nomor berformat bebas: disimpan sebagai angka saja
    const ok = await accept(token, { whatsapp: "+62 812-3456-7890" });
    expect(ok.status).toBe(201);
    expect(await waOf(sessionOf(ok))).toBe("6281234567890");
    // tanpa nomor atau isian kosong: boleh, nomor kosong
    const tanpa = await accept(await invite(admin));
    expect(tanpa.status).toBe(201);
    expect(await waOf(sessionOf(tanpa))).toBeNull();
    const kosong = await accept(await invite(admin), { whatsapp: "  " });
    expect(kosong.status).toBe(201);
    expect(await waOf(sessionOf(kosong))).toBeNull();
  });

  test("ubah nomor sendiri: isi, ganti, hapus; permintaan kosong atau tidak valid tidak menghapus", async () => {
    const { admin } = await newSsb("ubah");
    const cookie = sessionOf(await accept(await invite(admin)));
    expect((await call("PATCH", "/auth/me", undefined, { whatsapp: "0812345678" })).status).toBe(401);
    expect((await json(await call("PATCH", "/auth/me", cookie, { whatsapp: "0812-3456-7890" }))).whatsapp).toBe("081234567890");
    expect(await waOf(cookie)).toBe("081234567890");
    // tidak valid atau field tidak dikirim: 400 dan nomor lama tetap
    expect((await call("PATCH", "/auth/me", cookie, { whatsapp: "abc" })).status).toBe(400);
    expect((await call("PATCH", "/auth/me", cookie, {})).status).toBe(400);
    expect(await waOf(cookie)).toBe("081234567890");
    // kosong menghapus
    expect((await json(await call("PATCH", "/auth/me", cookie, { whatsapp: "" }))).whatsapp).toBeNull();
    expect(await waOf(cookie)).toBeNull();
    // nomor hanya milik keanggotaan sendiri: admin tidak ikut berubah
    expect(await waOf(admin)).toBeNull();
  });
});
