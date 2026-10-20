import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import { createLogger } from "./logger";
import { TEMPLAT_PENGINGAT_AWAL, type FeeSettings, type GenerateInvoicesResult, type InvoiceRow, type PlayerFeeOverrideRow } from "@ssb/shared";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("SPP: pengaturan, tarif khusus pemain, koreksi nominal, dan tagihan ulang", () => {
  const { db, client } = createDb(url!);
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) },
    { google: null, logger: createLogger({}) },
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
  // Bentuk respons sudah dijamin oleh API; cast hanya untuk membaca field yang dipakai.
  const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
  async function gabung(admin: string, role: string, extra: object = {}) {
    const inv = await json<{ token: string }>(await call("POST", "/invitations", admin, { role, ...extra }));
    const email = `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`;
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: `${role} x`, email, password: PASS });
    expect(acc.status).toBe(201);
    return sessionOf(acc);
  }

  afterAll(async () => {
    // Pembersihan lewat koneksi baru: koneksi tes bisa tertahan dalam transaksi yang belum selesai.
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("pengaturan SPP, tarif khusus, koreksi nominal, dan tagihan ulang", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `Set ${uid}`,
      slug: `s-${uid}`,
      adminName: "Admin",
      email: `admin-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json<{ ssbId: string }>(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku = (await json<{ id: string }>(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    await call("PUT", "/fees/rates", admin, { rates: [{ ageGroupId: ku, monthlyFee: 150000 }] });
    const mk = async (fullName: string) => json<{ id: string }>(await call("POST", "/players", admin, { fullName, birthDate: "2016-04-05", ageGroupId: ku }));
    const a = await mk("Anak A");
    const b = await mk("Anak B");

    // Pengaturan bawaan sebelum admin pernah menyimpan.
    const bawaan = await json<FeeSettings>(await call("GET", "/fees/settings", admin));
    expect(bawaan).toEqual({ dueDay: 10, reminderTemplate: TEMPLAT_PENGINGAT_AWAL, bankInfo: null, reminderIntervalDays: 7 });

    // Simpan pengaturan; nilai validasi ditolak dan tidak ada yang berubah.
    expect((await call("PUT", "/fees/settings", admin, { dueDay: 31, reminderTemplate: "x", bankInfo: null, reminderIntervalDays: 7 })).status).toBe(400);
    expect((await call("PUT", "/fees/settings", admin, { dueDay: 10, reminderTemplate: "", bankInfo: null, reminderIntervalDays: 7 })).status).toBe(400);
    const simpan = await json<FeeSettings>(
      await call("PUT", "/fees/settings", admin, {
        dueDay: 5,
        reminderTemplate: "Halo {wali}, tagihan {anak} {sisa}",
        bankInfo: "BCA 123456789 a.n. SSB",
        reminderIntervalDays: 3,
      }),
    );
    expect(simpan).toEqual({
      dueDay: 5,
      reminderTemplate: "Halo {wali}, tagihan {anak} {sisa}",
      bankInfo: "BCA 123456789 a.n. SSB",
      reminderIntervalDays: 3,
    });
    expect((await json<FeeSettings>(await call("GET", "/fees/settings", admin))).dueDay).toBe(5);

    // Orang tua boleh membaca info rekening, tapi bukan pengaturan penuh.
    const ortu = await gabung(admin, "orang_tua", { playerId: a.id });
    expect(await json<{ bankInfo: string | null }>(await call("GET", "/fees/public-info", ortu))).toEqual({
      bankInfo: "BCA 123456789 a.n. SSB",
    });
    expect((await call("GET", "/fees/settings", ortu)).status).toBe(403);
    expect((await call("PUT", "/fees/settings", ortu, { dueDay: 5, reminderTemplate: "x", bankInfo: null, reminderIntervalDays: 3 })).status).toBe(403);

    // Tagihan memakai jatuh tempo bawaan dari pengaturan (tanpa dueDay pada permintaan).
    const gen = await json<GenerateInvoicesResult>(await call("POST", "/invoices/generate", admin, { month: "2020-01" }));
    expect(gen.created).toBe(2);
    const tagihan = await json<InvoiceRow[]>(await call("GET", "/invoices?month=2020-01", admin));
    expect(tagihan.map((i) => [i.player.name, i.amount, i.dueOn])).toEqual([
      ["Anak A", 150000, "2020-01-05"],
      ["Anak B", 150000, "2020-01-05"],
    ]);
    const idA = tagihan.find((i) => i.player.name === "Anak A")!.id;

    // Tarif khusus pemain menggantikan tarif KU; 0 berarti tidak ditagih.
    expect((await call("PUT", `/fees/player-overrides/${a.id}`, admin, { monthlyFee: -1, note: null })).status).toBe(400);
    expect((await call("PUT", `/fees/player-overrides/${randomUUID()}`, admin, { monthlyFee: 1000, note: null })).status).toBe(404);
    expect((await call("PUT", `/fees/player-overrides/${a.id}`, admin, { monthlyFee: 75000, note: "saudara kandung" })).status).toBe(200);
    expect((await call("PUT", `/fees/player-overrides/${b.id}`, admin, { monthlyFee: 0, note: "gratis" })).status).toBe(200);
    const daftar = await json<PlayerFeeOverrideRow[]>(await call("GET", "/fees/player-overrides", admin));
    expect(daftar.map((r) => [r.playerName, r.monthlyFee, r.note, r.ageGroup])).toEqual([
      ["Anak A", 75000, "saudara kandung", "KU-10"],
      ["Anak B", 0, "gratis", "KU-10"],
    ]);
    const gen2 = await json<GenerateInvoicesResult>(await call("POST", "/invoices/generate", admin, { month: "2020-02" }));
    expect(gen2).toEqual({ created: 1, existing: 0, withoutRate: 1 }); // Anak B tarif 0 tidak ikut ditagih
    const panggil = await json<InvoiceRow[]>(await call("GET", "/invoices?month=2020-02", admin));
    expect(panggil.map((i) => [i.player.name, i.amount])).toEqual([["Anak A", 75000]]);

    // Buang tarif khusus: pemain kembali memakai tarif KU.
    expect((await call("DELETE", `/fees/player-overrides/${b.id}`, admin)).status).toBe(204);
    expect((await call("DELETE", `/fees/player-overrides/${b.id}`, admin)).status).toBe(404);
    expect((await json<PlayerFeeOverrideRow[]>(await call("GET", "/fees/player-overrides", admin))).map((r) => r.playerName)).toEqual(["Anak A"]);

    // Koreksi nominal: boleh lebih besar, tidak boleh lebih kecil dari yang sudah dibayar.
    expect((await call("PATCH", `/invoices/${idA}`, admin, { amount: 0 })).status).toBe(400);
    expect((await call("PATCH", `/invoices/${randomUUID()}`, admin, { amount: 1000 })).status).toBe(404);
    const diubah = await json<InvoiceRow>(await call("PATCH", `/invoices/${idA}`, admin, { amount: 200000 }));
    expect([diubah.amount, diubah.remaining, diubah.status]).toEqual([200000, 200000, "belum"]);
    await call("POST", `/invoices/${idA}/payments`, admin, { amount: 150000, paidOn: "2020-01-06" });
    expect((await call("PATCH", `/invoices/${idA}`, admin, { amount: 100000 })).status).toBe(409);
    const setelahBayar = await json<InvoiceRow[]>(await call("GET", "/invoices?month=2020-01", admin));
    expect(setelahBayar.find((i) => i.id === idA)!.amount).toBe(200000);

    // Tagihan yang sudah punya pembayaran tidak bisa dibatalkan.
    expect((await call("POST", `/invoices/${idA}/void`, admin)).status).toBe(409);

    // Batalkan tagihan tanpa pembayaran, lalu buat ulang dengan tarif dan jatuh tempo saat ini.
    const gen3 = await json<GenerateInvoicesResult>(await call("POST", "/invoices/generate", admin, { month: "2020-03" }));
    expect(gen3.created).toBe(2);
    const maret = await json<InvoiceRow[]>(await call("GET", "/invoices?month=2020-03", admin));
    const idMaret = maret.find((i) => i.player.name === "Anak B")!.id;
    expect((await call("POST", `/invoices/${idMaret}/void`, admin)).status).toBe(200);
    const dibuat = await json<InvoiceRow>(await call("POST", `/invoices/${idMaret}/recreate`, admin));
    expect([dibuat.player.name, dibuat.amount, dibuat.dueOn, dibuat.status]).toEqual(["Anak B", 150000, "2020-03-05", "belum"]);
    expect(dibuat.id).not.toBe(idMaret);
    // Tagihan lama yang batal masih tercatat, yang baru aktif.
    const semuaMaret = await json<InvoiceRow[]>(await call("GET", "/invoices?month=2020-03", admin));
    expect(semuaMaret.filter((i) => i.player.name === "Anak B").map((i) => i.status)).toEqual(["dibatalkan", "belum"]);
    // Membuat ulang tagihan yang belum dibatalkan ditolak.
    expect((await call("POST", `/invoices/${dibuat.id}/recreate`, admin)).status).toBe(409);

    // Tagihan yang dibatalkan tidak menghalangi pembuatan tagihan baru untuk bulan yang sama.
    const gen4 = await json<GenerateInvoicesResult>(await call("POST", "/invoices/generate", admin, { month: "2020-03" }));
    expect(gen4.created).toBe(0); // bulan itu sudah ada tagihan aktif untuk kedua pemain

    // Hanya admin: pelatih dan orang tua ditolak.
    const pelatih = await gabung(admin, "pelatih");
    expect((await call("GET", "/fees/settings", pelatih)).status).toBe(403);
    expect((await call("PUT", "/fees/settings", pelatih, { dueDay: 5, reminderTemplate: "x", bankInfo: null, reminderIntervalDays: 3 })).status).toBe(403);
    expect((await call("GET", "/fees/player-overrides", pelatih)).status).toBe(403);
    expect((await call("PUT", `/fees/player-overrides/${a.id}`, pelatih, { monthlyFee: 1000, note: null })).status).toBe(403);
    expect((await call("GET", "/fees/settings")).status).toBe(401);
  });
});
