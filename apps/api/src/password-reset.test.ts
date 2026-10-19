import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import type { Mail } from "./mail";
import { maskEmail } from "./password-reset";

describe("password-reset: penyamaran email (tanpa database)", () => {
  test("hanya huruf pertama dan domain yang terlihat", () => {
    expect(maskEmail("ratna@contoh.id")).toBe("r***@contoh.id");
  });
});

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("lupa dan reset kata sandi", () => {
  const { db, client } = createDb(url!);
  const inbox: Mail[] = [];
  const env = { NODE_ENV: "test" as const, ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) };
  const app = createApp(db, env, { google: null, mailer: { send: async (m) => void inbox.push(m) } });
  const tanpaEmail = createApp(db, env, { google: null });
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const BARU = "kata-sandi-baru-99";
  const ssbIds: string[] = [];

  const call = (method: string, path: string, cookie?: string, body?: unknown, a = app) =>
    a.request(path, {
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
  const tunggu = async (n: number) => {
    for (let i = 0; i < 40 && inbox.length < n; i++) await new Promise((r) => setTimeout(r, 50));
  };
  const tokenDari = (link: string) => link.slice(link.lastIndexOf("/") + 1);
  const login = (email: string, password: string) => call("POST", "/auth/login", undefined, { email, password });

  afterAll(async () => {
    // Pembersihan lewat koneksi baru: koneksi tes bisa tertahan dalam transaksi yang belum selesai.
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("lupa kata sandi lewat email, tautan sekali pakai, dan sesi lama dicabut", async () => {
    expect(await json(await call("GET", "/auth/features"))).toEqual({ emailReset: true });
    expect(await json(await call("GET", "/auth/features", undefined, undefined, tanpaEmail))).toEqual({ emailReset: false });

    const email = `admin-${uid}@uji.test`;
    const reg = await call("POST", "/auth/register-ssb", undefined, { ssbName: `Reset ${uid}`, slug: `r-${uid}`, adminName: "Admin", email, password: PASS });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const sesiLama = sessionOf(reg);

    // email tak dikenal dan email dikenal dijawab persis sama; hanya yang dikenal menerima email
    const tak = await call("POST", "/auth/forgot-password", undefined, { email: `tidak-ada-${uid}@uji.test` });
    const ada = await call("POST", "/auth/forgot-password", undefined, { email });
    expect(tak.status).toBe(200);
    expect(await json(tak)).toEqual(await json(ada));
    await tunggu(1);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.to).toBe(email);
    const link = inbox[0]!.text.match(/http:\/\/web\.test\/reset-sandi\/\S+/)![0];
    const token = tokenDari(link);

    // permintaan kedua dalam satu menit tidak mengirim email lagi
    await call("POST", "/auth/forgot-password", undefined, { email });
    await new Promise((r) => setTimeout(r, 400));
    expect(inbox).toHaveLength(1);

    // pratinjau menyamarkan email; kata sandi lemah ditolak; sebelum dipakai kata sandi lama masih berlaku
    expect(await json(await call("GET", `/auth/reset-password/${token}`))).toEqual({ ok: true, email: maskEmail(email) });
    expect((await call("POST", `/auth/reset-password/${token}`, undefined, { newPassword: "pendek" })).status).toBe(400);
    expect((await login(email, PASS)).status).toBe(200);

    const ok = await call("POST", `/auth/reset-password/${token}`, undefined, { newPassword: BARU });
    expect(ok.status).toBe(200);
    expect((await login(email, BARU)).status).toBe(200);
    expect((await login(email, PASS)).status).toBe(401);
    expect((await call("GET", "/auth/me", sesiLama)).status).toBe(401); // sesi lama dicabut

    // tautan hangus setelah dipakai; token acak dan tautan kedaluwarsa juga ditolak
    expect((await call("POST", `/auth/reset-password/${token}`, undefined, { newPassword: "kata-sandi-lain-77" })).status).toBe(404);
    expect((await call("GET", `/auth/reset-password/${token}`)).status).toBe(404);
    expect((await call("GET", "/auth/reset-password/bukan-token")).status).toBe(404);
    await db.update(schema.passwordReset).set({ createdAt: new Date(Date.now() - 120_000) }); // lewati jeda satu menit
    await call("POST", "/auth/forgot-password", undefined, { email });
    await tunggu(2);
    expect(inbox).toHaveLength(2);
    const t2 = tokenDari(inbox[1]!.text.match(/http:\/\/web\.test\/reset-sandi\/\S+/)![0]);
    await db.update(schema.passwordReset).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await call("POST", `/auth/reset-password/${t2}`, undefined, { newPassword: "kata-sandi-lain-77" })).status).toBe(404);

    // tanpa pengirim email, permintaan tetap dijawab sama dan tidak ada email keluar
    const n = inbox.length;
    const diam = await call("POST", "/auth/forgot-password", undefined, { email }, tanpaEmail);
    expect(await json(diam)).toEqual({ ok: true });
    expect(inbox).toHaveLength(n);
  });

  test("admin membuatkan tautan reset untuk anggota; akun lintas SSB dan peran lain ditolak", async () => {
    const email = `admin2-${uid}@uji.test`;
    const reg = await call("POST", "/auth/register-ssb", undefined, { ssbName: `Reset2 ${uid}`, slug: `r2-${uid}`, adminName: "Admin", email, password: PASS });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);

    const inv = await json(await call("POST", "/invitations", admin, { role: "pelatih", label: "Coach" }));
    const pEmail = `pelatih-${uid}@uji.test`;
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: "Coach Budi", email: pEmail, password: PASS });
    expect(acc.status).toBe(201);
    const pelatih = sessionOf(acc);
    const users = await json(await call("GET", "/users", admin));
    const budi = users.find((u: any) => u.email === pEmail);

    expect((await call("POST", `/users/${budi.id}/reset-link`, pelatih)).status).toBe(403);
    expect((await call("POST", `/users/${budi.id}/reset-link`)).status).toBe(401);
    expect((await call("POST", `/users/${randomUUID()}/reset-link`, admin)).status).toBe(404);
    expect((await call("POST", "/users/bukan-uuid/reset-link", admin)).status).toBe(404);

    const r = await call("POST", `/users/${budi.id}/reset-link`, admin);
    expect(r.status).toBe(201);
    const hasil = await json(r);
    expect(hasil.name).toBe("Coach Budi");
    expect(hasil.url).toMatch(/^http:\/\/web\.test\/reset-sandi\//);
    const token = tokenDari(hasil.url);
    expect((await call("POST", `/auth/reset-password/${token}`, undefined, { newPassword: BARU })).status).toBe(200);
    expect((await login(pEmail, BARU)).status).toBe(200);
    expect((await call("GET", "/auth/me", pelatih)).status).toBe(401);

    // akun yang juga anggota SSB lain tidak boleh direset oleh admin satu SSB
    const sesiBaru = sessionOf(await login(pEmail, BARU));
    const ssbLain = await call("POST", "/auth/ssb", sesiBaru, { ssbName: `Reset3 ${uid}`, slug: `r3-${uid}` });
    expect(ssbLain.status).toBe(201);
    ssbIds.push((await json(ssbLain)).ssbId);
    const ditolak = await call("POST", `/users/${budi.id}/reset-link`, admin);
    expect(ditolak.status).toBe(409);
    expect((await json(ditolak)).error.code).toBe("multi_ssb_account");
  });
});
