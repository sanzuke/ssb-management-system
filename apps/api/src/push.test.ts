import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("perangkat push", () => {
  const { db, client } = createDb(url!);
  const app = createApp(db, { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) }, { google: null });
  const uid = randomUUID().slice(0, 8);
  const ssbIds: string[] = [];

  const call = (method: string, path: string, body?: unknown, cookie?: string) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  async function account(tag: string) {
    const res = await call("POST", "/auth/register-ssb", { ssbName: `P ${tag}`, slug: `p-${tag}-${uid}`, adminName: tag, email: `${tag}-${uid}@uji.test`, password: "kata-sandi-panjang-1" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ssbId: string }; // bentuk respons register-ssb yang dikontrol test ini
    ssbIds.push(body.ssbId);
    return res.headers.getSetCookie().find((c) => c.startsWith("ssb_session="))!.split(";")[0]!;
  }

  const rows = (token: string) => db.select().from(schema.pushDevice).where(eq(schema.pushDevice.token, token));

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%-${uid}@uji.test`));
    await client.end();
  });

  test("daftar, pindah ke akun lain, dan cabut; tanpa sesi 401; platform salah 400", async () => {
    const a = await account("push-a");
    const b = await account("push-b");
    const token = `fcm-token-${uid}-${"x".repeat(20)}`;

    expect((await call("POST", "/push/devices", { token, platform: "android" })).status).toBe(401);
    expect((await call("POST", "/push/devices", { token, platform: "symbian" }, a)).status).toBe(400);

    expect((await call("POST", "/push/devices", { token, platform: "android" }, a)).status).toBe(200);
    expect((await call("POST", "/push/devices", { token, platform: "android" }, a)).status).toBe(200);
    const first = await rows(token);
    expect(first).toHaveLength(1);

    // Perangkat yang sama dipakai akun lain (mis. ganti pengguna): token berpindah, tidak menggandakan baris.
    expect((await call("POST", "/push/devices", { token, platform: "android" }, b)).status).toBe(200);
    const moved = await rows(token);
    expect(moved).toHaveLength(1);
    expect(moved[0]!.accountId).not.toBe(first[0]!.accountId);

    // Akun lama tidak bisa mencabut token yang sudah bukan miliknya.
    await call("DELETE", "/push/devices", { token }, a);
    expect(await rows(token)).toHaveLength(1);
    expect((await call("DELETE", "/push/devices", { token }, b)).status).toBe(200);
    expect(await rows(token)).toHaveLength(0);
  });
});
