import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import { invoiceStatus, todayWib } from "./fees";

describe("SPP: status tagihan dan tanggal (tanpa database)", () => {
  test("status mengikuti jumlah terbayar dan pembatalan", () => {
    expect(invoiceStatus(100, 0, false)).toBe("belum");
    expect(invoiceStatus(100, 40, false)).toBe("sebagian");
    expect(invoiceStatus(100, 100, false)).toBe("lunas");
    expect(invoiceStatus(100, 0, true)).toBe("dibatalkan");
    expect(todayWib()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("SPP: tarif, tagihan, pembayaran, dan batas peran", () => {
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
  async function gabung(admin: string, role: string, extra: object = {}) {
    const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
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

  test("tarif, buat tagihan bulanan, cicilan, koreksi, pembatalan, dan akses orang tua", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `SPP ${uid}`,
      slug: `s-${uid}`,
      adminName: "Admin",
      email: `admin-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const k10 = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    const k12 = (await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id;
    const mk = async (fullName: string, ageGroupId?: string, status?: string) =>
      json(await call("POST", "/players", admin, { fullName, birthDate: "2016-04-05", ageGroupId, status: status ?? "aktif" }));
    const a = await mk("Anak A", k10);
    const b = await mk("Anak B", k10);
    await mk("Anak C", k12); // KU tanpa tarif
    await mk("Anak D"); // tanpa KU
    await mk("Anak E", k10, "cuti"); // tidak aktif

    // tarif: awalnya kosong; KU asing ditolak seluruhnya
    const awal = await json(await call("GET", "/fees/rates", admin));
    expect(awal.map((r: any) => [r.name, r.monthlyFee, r.activePlayers])).toEqual([
      ["KU-10", null, 2],
      ["KU-12", null, 1],
    ]);
    expect(
      (
        await call("PUT", "/fees/rates", admin, {
          rates: [
            { ageGroupId: k10, monthlyFee: 150000 },
            { ageGroupId: randomUUID(), monthlyFee: 1 },
          ],
        })
      ).status,
    ).toBe(422);
    expect((await json(await call("GET", "/fees/rates", admin)))[0].monthlyFee).toBeNull(); // rollback: tidak ada yang berubah
    expect((await call("PUT", "/fees/rates", admin, { rates: [{ ageGroupId: k10, monthlyFee: -5 }] })).status).toBe(400);
    expect((await call("PUT", "/fees/rates", admin, { rates: [{ ageGroupId: k10, monthlyFee: 150000 }] })).status).toBe(200);

    // buat tagihan: hanya pemain aktif di KU bertarif; ulang tidak menggandakan; tarif baru tidak mengubah tagihan lama
    expect((await call("POST", "/invoices/generate", admin, { month: "2026-13" })).status).toBe(400);
    const gen = await json(await call("POST", "/invoices/generate", admin, { month: "2020-01", dueDay: 10 }));
    expect(gen).toEqual({ created: 2, existing: 0, withoutRate: 2 });
    expect(await json(await call("POST", "/invoices/generate", admin, { month: "2020-01", dueDay: 10 }))).toEqual({ created: 0, existing: 2, withoutRate: 2 });
    await call("PUT", "/fees/rates", admin, { rates: [{ ageGroupId: k10, monthlyFee: 200000 }] });
    const lama = await json(await call("GET", "/invoices?month=2020-01", admin));
    expect(lama.map((i: any) => [i.player.name, i.amount, i.status, i.overdue, i.dueOn, i.month])).toEqual([
      ["Anak A", 150000, "belum", true, "2020-01-10", "2020-01-01"],
      ["Anak B", 150000, "belum", true, "2020-01-10", "2020-01-01"],
    ]);
    const baru = await json(await call("POST", "/invoices/generate", admin, { month: "2099-01" }));
    expect(baru.created).toBe(2);
    const depan = await json(await call("GET", "/invoices?month=2099-01", admin));
    expect(depan[0].amount).toBe(200000);
    expect(depan[0].overdue).toBe(false);

    // pembayaran: cicil, tak boleh melebihi sisa atau bertanggal masa depan, lunas, koreksi
    const invA = lama[0].id;
    const bayar = (id: string, body: object, cookie = admin) => call("POST", `/invoices/${id}/payments`, cookie, body);
    const p1 = await bayar(invA, { amount: 50000, paidOn: "2020-01-05", method: "tunai", note: "cicilan 1" });
    expect(p1.status).toBe(201);
    const after1 = await json(p1);
    expect([after1.status, after1.paid, after1.remaining]).toEqual(["sebagian", 50000, 100000]);
    expect(after1.payments[0]).toMatchObject({ amount: 50000, method: "tunai", note: "cicilan 1", recordedBy: "Admin" });
    const lebih = await bayar(invA, { amount: 100001, paidOn: "2020-01-06" });
    expect(lebih.status).toBe(409);
    expect((await json(lebih)).error.code).toBe("overpaid");
    expect((await bayar(invA, { amount: 1000, paidOn: "2999-01-01" })).status).toBe(400);
    expect((await bayar(invA, { amount: 0, paidOn: "2020-01-06" })).status).toBe(400);
    expect((await bayar(randomUUID(), { amount: 1000, paidOn: "2020-01-06" })).status).toBe(404);
    const p2 = await json(await bayar(invA, { amount: 100000, paidOn: "2020-01-08", method: "transfer" }));
    expect([p2.status, p2.remaining, p2.overdue]).toEqual(["lunas", 0, false]);

    const ringkas = await json(await call("GET", "/fees/summary?month=2020-01", admin));
    expect(ringkas).toEqual({ month: "2020-01", invoices: 2, billed: 300000, paid: 150000, outstanding: 150000, overdueInvoices: 1, settledInvoices: 1 });

    // koreksi: hapus pembayaran terakhir mengembalikan status
    const hapus = p2.payments[1].id;
    expect((await call("DELETE", `/payments/${hapus}`, admin)).status).toBe(204);
    expect((await call("DELETE", `/payments/${hapus}`, admin)).status).toBe(404);
    const balik = (await json(await call("GET", "/invoices?month=2020-01", admin)))[0];
    expect([balik.status, balik.paid]).toEqual(["sebagian", 50000]);

    // batalkan: tidak bila sudah ada pembayaran; tagihan batal tidak bisa dibayar dan keluar dari ringkasan
    const invB = lama[1].id;
    expect((await call("POST", `/invoices/${invA}/void`, admin)).status).toBe(409);
    const batal = await json(await call("POST", `/invoices/${invB}/void`, admin));
    expect([batal.status, batal.remaining, batal.overdue]).toEqual(["dibatalkan", 0, false]);
    expect((await bayar(invB, { amount: 1000, paidOn: "2020-01-06" })).status).toBe(409);
    const ringkas2 = await json(await call("GET", "/fees/summary?month=2020-01", admin));
    expect([ringkas2.invoices, ringkas2.billed, ringkas2.overdueInvoices]).toEqual([1, 150000, 1]);

    // orang tua: hanya tagihan anaknya, tanpa hak mengubah; pelatih tidak punya akses sama sekali
    const ortu = await gabung(admin, "orang_tua", { playerId: a.id });
    const milikOrtu = await json(await call("GET", "/invoices", ortu));
    expect(milikOrtu.every((i: any) => i.player.id === a.id)).toBe(true);
    expect(milikOrtu.map((i: any) => i.month).sort()).toEqual(["2020-01-01", "2099-01-01"]);
    expect((await call("GET", `/invoices?playerId=${b.id}`, ortu)).status).toBe(200);
    expect(await json(await call("GET", `/invoices?playerId=${b.id}`, ortu))).toEqual([]);
    expect((await bayar(invA, { amount: 1000, paidOn: "2020-01-06" }, ortu)).status).toBe(403);
    expect((await call("POST", "/invoices/generate", ortu, { month: "2020-02" })).status).toBe(403);
    expect((await call("GET", "/fees/rates", ortu)).status).toBe(403);
    expect((await call("DELETE", `/payments/${hapus}`, ortu)).status).toBe(403);
    const pelatih = await gabung(admin, "pelatih");
    expect((await call("GET", "/invoices", pelatih)).status).toBe(403);
    expect((await call("GET", "/invoices")).status).toBe(401);
  });
});
