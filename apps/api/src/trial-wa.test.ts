import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { DEFAULT_TRIAL_REPLY_TEMPLATE, renderTrialMessage, unknownTrialPlaceholders } from "@ssb/shared";
import { createApp } from "./app";

describe("templat pesan pendaftar trial (tanpa database)", () => {
  const data = { wali: "Bu Sari", anak: "Rafi", kode: "TRL-ABC123", ssb: "Garuda Muda" };

  test("semua kata terisi, juga yang muncul lebih dari sekali", () => {
    expect(renderTrialMessage("Halo {wali}, {anak} ({kode}) di {ssb}. Sekali lagi {anak}.", data)).toBe(
      "Halo Bu Sari, Rafi (TRL-ABC123) di Garuda Muda. Sekali lagi Rafi.",
    );
  });

  test("kata yang salah ketik dibiarkan terlihat dan dilaporkan; isi data yang mirip kata tidak diisi ulang", () => {
    expect(renderTrialMessage("Halo {nama_wali}", data)).toBe("Halo {nama_wali}");
    expect(unknownTrialPlaceholders("Halo {wali} {nama_wali} {nama_wali} {anak}")).toEqual(["nama_wali"]);
    // Nama anak yang kebetulan berisi tanda kurung kurawal tidak diproses lagi sebagai kata.
    expect(renderTrialMessage("{anak}", { ...data, anak: "{kode}" })).toBe("{kode}");
  });

  test("templat bawaan hanya memakai kata yang dikenal", () => {
    expect(unknownTrialPlaceholders(DEFAULT_TRIAL_REPLY_TEMPLATE)).toEqual([]);
  });
});

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("pengaturan WhatsApp pendaftar trial: API", () => {
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
      ssbName: `T ${tag}`,
      slug: `t-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(res.status).toBe(201);
    const { ssbId } = await json(res);
    ssbIds.push(ssbId);
    return { ssbId: ssbId as string, admin: sessionOf(res) };
  }
  const simpanToken = (cookie: string) => call("PUT", "/whatsapp/settings", cookie, { token: "token-uji-bukan-asli", countryCode: "62", autoReminder: false });

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("awal mati dengan templat bawaan; tidak bisa dinyalakan tanpa token", async () => {
    const { admin } = await newSsb("awal");
    expect(await json(await call("GET", "/whatsapp/trial-settings", admin))).toEqual({
      hasToken: false,
      replyEnabled: false,
      replyTemplate: DEFAULT_TRIAL_REPLY_TEMPLATE,
      replyTemplateDefault: true,
      notifyEnabled: false,
      notifyNumber: null,
    });
    const tolak = await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: true, notifyEnabled: false });
    expect(tolak.status).toBe(409);
    expect((await json(tolak)).error.code).toBe("no_token");
    // Menyimpan dalam keadaan mati tetap boleh, mis. menyiapkan templat lebih dulu.
    const siap = await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: false, replyTemplate: "Halo {wali}!", notifyEnabled: false });
    expect(siap.status).toBe(200);
    expect((await json(siap)).replyTemplate).toBe("Halo {wali}!");
  });

  test("simpan setelah token ada: templat sendiri, templat bawaan disimpan kosong, nomor admin dinormalkan", async () => {
    const { admin } = await newSsb("simpan");
    expect((await simpanToken(admin)).status).toBe(200);

    const ok = await json(
      await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: true, replyTemplate: "Halo {wali}, {anak} sudah terdaftar.", notifyEnabled: true, notifyNumber: "+62 812-3456-7890" }),
    );
    expect(ok).toMatchObject({ hasToken: true, replyEnabled: true, replyTemplate: "Halo {wali}, {anak} sudah terdaftar.", replyTemplateDefault: false, notifyEnabled: true, notifyNumber: "6281234567890" });
    expect(await json(await call("GET", "/whatsapp/trial-settings", admin))).toEqual(ok);

    // Mengembalikan teks ke bawaan (atau mengosongkannya) tidak menyimpan salinan templat bawaan.
    const bawaan = await json(await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: true, replyTemplate: DEFAULT_TRIAL_REPLY_TEMPLATE, notifyEnabled: false, notifyNumber: "" }));
    expect(bawaan).toMatchObject({ replyTemplateDefault: true, replyTemplate: DEFAULT_TRIAL_REPLY_TEMPLATE, notifyEnabled: false, notifyNumber: null });
    const kosong = await json(await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: true, replyTemplate: "  ", notifyEnabled: false }));
    expect(kosong.replyTemplateDefault).toBe(true);
  });

  test("masukan tidak valid ditolak dan tidak mengubah pengaturan", async () => {
    const { admin } = await newSsb("tolak");
    await simpanToken(admin);
    const awal = await json(await call("GET", "/whatsapp/trial-settings", admin));
    const tanpaNomor = await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: false, notifyEnabled: true });
    expect(tanpaNomor.status).toBe(400);
    expect((await json(tanpaNomor)).error.fields.notifyNumber).toBeTruthy();
    expect((await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: false, notifyEnabled: true, notifyNumber: "abc" })).status).toBe(400);
    expect((await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: true, replyTemplate: "x".repeat(1001), notifyEnabled: false })).status).toBe(400);
    expect((await call("PUT", "/whatsapp/trial-settings", admin, { replyEnabled: "ya" })).status).toBe(400);
    expect(await json(await call("GET", "/whatsapp/trial-settings", admin))).toEqual(awal);
  });

  test("menghapus token mematikan pesan otomatis pendaftar; SSB lain tidak terpengaruh", async () => {
    const a = await newSsb("hapus");
    const b = await newSsb("lain");
    await simpanToken(a.admin);
    await simpanToken(b.admin);
    for (const s of [a, b]) {
      expect((await call("PUT", "/whatsapp/trial-settings", s.admin, { replyEnabled: true, notifyEnabled: true, notifyNumber: "081234567890" })).status).toBe(200);
    }
    // Admin A menghapus token (token kosong): semua pengiriman otomatis ikut mati, nomor dan templat tetap.
    expect((await call("PUT", "/whatsapp/settings", a.admin, { token: "", countryCode: "62", autoReminder: true })).status).toBe(200);
    expect(await json(await call("GET", "/whatsapp/trial-settings", a.admin))).toMatchObject({ hasToken: false, replyEnabled: false, notifyEnabled: false, notifyNumber: "081234567890" });
    expect(await json(await call("GET", "/whatsapp/trial-settings", b.admin))).toMatchObject({ hasToken: true, replyEnabled: true, notifyEnabled: true });
  });
});
