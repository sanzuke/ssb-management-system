import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import { todayWib } from "./fees";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("pengingat SPP: daftar dan pencatatan", () => {
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
  async function gabung(admin: string, role: string, extra: object = {}, whatsapp?: string) {
    const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
    const email = `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`;
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: `Ibu ${role}`, email, password: PASS, whatsapp });
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

  test("tagihan menunggak dan segera jatuh tempo muncul bersama wali; pengingat tercatat", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `Ingat ${uid}`,
      slug: `i-${uid}`,
      adminName: "Admin",
      email: `admin-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    await call("PUT", "/fees/rates", admin, { rates: [{ ageGroupId: ku, monthlyFee: 100000 }] });
    const mk = async (fullName: string) => json(await call("POST", "/players", admin, { fullName, birthDate: "2016-04-05", ageGroupId: ku }));
    const a = await mk("Anak A");
    const b = await mk("Anak B");
    await mk("Anak C");
    await mk("Anak D");
    const ortu = await gabung(admin, "orang_tua", { playerId: a.id }, "081234567890");

    await call("POST", "/invoices/generate", admin, { month: "2020-01", dueDay: 10 });
    await call("POST", "/invoices/generate", admin, { month: "2099-01", dueDay: 10 });
    const lama = await json(await call("GET", "/invoices?month=2020-01", admin));
    const idDari = (nama: string) => lama.find((i: any) => i.player.name === nama).id as string;
    // B lunas, D dibatalkan: tidak perlu diingatkan
    await call("POST", `/invoices/${idDari("Anak B")}/payments`, admin, { amount: 100000, paidOn: "2020-01-05" });
    expect((await call("POST", `/invoices/${idDari("Anak D")}/void`, admin)).status).toBe(200);

    const awal = await json(await call("GET", "/fees/reminders", admin));
    expect(awal.map((r: any) => r.player.name)).toEqual(["Anak A", "Anak C"]); // bulan 2099 belum waktunya
    expect(awal[0].daysToDue).toBeLessThan(-1000);
    expect(awal[0].guardians).toEqual([{ name: "Ibu orang_tua", whatsapp: "081234567890", relationship: null }]);
    expect(awal[1].guardians).toEqual([]);
    expect(awal[0]).toMatchObject({ remaining: 100000, overdue: true, reminderCount: 0, lastRemindedAt: null });

    // jatuh tempo mendekat: masuk bila dalam rentang hari, keluar bila di luar rentang
    const dekat = new Date(Date.parse(`${todayWib()}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
    const id2099 = (await json(await call("GET", "/invoices?month=2099-01", admin))).find((i: any) => i.player.name === "Anak A").id;
    await withTenant(db, ssbId, (tx) => tx.update(schema.invoice).set({ dueOn: dekat }).where(eq(schema.invoice.id, id2099)));
    const tiga = await json(await call("GET", "/fees/reminders?days=3", admin));
    expect(tiga.find((r: any) => r.id === id2099).daysToDue).toBe(2);
    const satu = await json(await call("GET", "/fees/reminders?days=1", admin));
    expect(satu.find((r: any) => r.id === id2099)).toBeUndefined();

    // catat pengingat: hitungan naik dan tampil di daftar; tagihan lunas atau batal ditolak
    const idA = idDari("Anak A");
    const r1 = await json(await call("POST", `/invoices/${idA}/reminded`, admin));
    expect(r1.reminderCount).toBe(1);
    expect(new Date(r1.lastRemindedAt).getTime()).toBeGreaterThan(Date.now() - 60000);
    expect((await json(await call("POST", `/invoices/${idA}/reminded`, admin))).reminderCount).toBe(2);
    const sesudah = (await json(await call("GET", "/fees/reminders", admin))).find((r: any) => r.id === idA);
    expect([sesudah.reminderCount, sesudah.lastRemindedAt === r1.lastRemindedAt || sesudah.lastRemindedAt > r1.lastRemindedAt]).toEqual([2, true]);
    expect((await call("POST", `/invoices/${idDari("Anak B")}/reminded`, admin)).status).toBe(409);
    expect((await call("POST", `/invoices/${idDari("Anak D")}/reminded`, admin)).status).toBe(409);
    expect((await call("POST", `/invoices/${randomUUID()}/reminded`, admin)).status).toBe(404);
    // setelah lunas, tagihan hilang dari daftar pengingat
    await call("POST", `/invoices/${idA}/payments`, admin, { amount: 100000, paidOn: "2020-01-06" });
    expect((await json(await call("GET", "/fees/reminders", admin))).some((r: any) => r.id === idA)).toBe(false);

    // hanya admin: orang tua dan pelatih ditolak
    expect((await call("GET", "/fees/reminders", ortu)).status).toBe(403);
    expect((await call("POST", `/invoices/${idA}/reminded`, ortu)).status).toBe(403);
    const pelatih = await gabung(admin, "pelatih");
    expect((await call("GET", "/fees/reminders", pelatih)).status).toBe(403);
    expect((await call("GET", "/fees/reminders")).status).toBe(401);
  });
});
