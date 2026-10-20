import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import {
  feeRatesInputSchema,
  generateInvoicesSchema,
  invoiceAmountSchema,
  paymentInputSchema,
  type FeeRate,
  type FeeSummary,
  type GenerateInvoicesResult,
  type InvoiceRow,
  type InvoiceStatus,
  type PaymentRow,
  type ReminderRow,
} from "@ssb/shared";
import { requirePermission, type AppEnv } from "./auth/middleware";
import { HttpError } from "./errors";
import { bacaPengaturan } from "./fee-settings";
import { visibleTo } from "./players";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const idOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};

/** Tanggal hari ini di zona waktu Indonesia barat (WIB), bukan UTC, agar jatuh tempo dan tanggal bayar tidak meleset di pagi hari. */
export const todayWib = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function invoiceStatus(amount: number, paid: number, voided: boolean): InvoiceStatus {
  if (voided) return "dibatalkan";
  if (paid >= amount) return "lunas";
  return paid > 0 ? "sebagian" : "belum";
}

export function feeRoutes(db: Db) {
  const I = schema.invoice;
  const P = schema.payment;

  /** Tagihan beserta jumlah terbayar dan riwayat pembayarannya, dengan batas data per role. */
  async function loadInvoices(
    ssbId: string,
    member: { role: string; userId: string; ssbId: string },
    filter: { month?: string; playerId?: string; id?: string },
  ): Promise<InvoiceRow[]> {
    return withTenant(db, ssbId, async (tx) => {
      const rows = await tx
        .select({
          id: I.id,
          month: I.month,
          amount: I.amount,
          dueOn: I.dueOn,
          voidedAt: I.voidedAt,
          lastRemindedAt: I.lastRemindedAt,
          reminderCount: I.reminderCount,
          playerId: schema.player.id,
          playerName: schema.player.fullName,
          memberNo: schema.player.memberNo,
          ageGroup: schema.ageGroup.name,
        })
        .from(I)
        .innerJoin(schema.player, and(eq(schema.player.ssbId, I.ssbId), eq(schema.player.id, I.playerId)))
        .leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)))
        .where(
          and(
            member.role === "orang_tua" ? visibleTo(member as never) : undefined,
            filter.month ? eq(I.month, `${filter.month}-01`) : undefined,
            filter.playerId ? eq(I.playerId, filter.playerId) : undefined,
            filter.id ? eq(I.id, filter.id) : undefined,
          ),
        )
        .orderBy(desc(I.month), asc(schema.player.fullName))
        .limit(500);
      if (rows.length === 0) return [];
      const pays = await tx
        .select({
          id: P.id,
          invoiceId: P.invoiceId,
          amount: P.amount,
          paidOn: P.paidOn,
          method: P.method,
          note: P.note,
          recordedBy: schema.appUser.name,
        })
        .from(P)
        .leftJoin(schema.appUser, and(eq(schema.appUser.ssbId, P.ssbId), eq(schema.appUser.id, P.recordedBy)))
        .where(
          inArray(
            P.invoiceId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(P.paidOn), asc(P.createdAt));
      const byInvoice = new Map<string, PaymentRow[]>();
      for (const p of pays) {
        const list = byInvoice.get(p.invoiceId) ?? [];
        list.push({ id: p.id, amount: p.amount, paidOn: p.paidOn, method: p.method, note: p.note, recordedBy: p.recordedBy });
        byInvoice.set(p.invoiceId, list);
      }
      const hariIni = todayWib();
      return rows.map((r) => {
        const payments = byInvoice.get(r.id) ?? [];
        const paid = payments.reduce((s, p) => s + p.amount, 0);
        const status = invoiceStatus(r.amount, paid, r.voidedAt !== null);
        return {
          id: r.id,
          player: { id: r.playerId, name: r.playerName, memberNo: r.memberNo, ageGroup: r.ageGroup },
          month: r.month,
          amount: r.amount,
          paid,
          remaining: status === "dibatalkan" ? 0 : Math.max(0, r.amount - paid),
          dueOn: r.dueOn,
          status,
          overdue: (status === "belum" || status === "sebagian") && r.dueOn < hariIni,
          payments,
          lastRemindedAt: r.lastRemindedAt?.toISOString() ?? null,
          reminderCount: r.reminderCount,
        };
      });
    });
  }

  return (
    new Hono<AppEnv>()
      // Tarif SPP tiap KU beserta jumlah pemain aktifnya.
      .get("/fees/rates", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const rows = await withTenant(db, m.ssbId, (tx) =>
          tx
            .select({
              ageGroupId: schema.ageGroup.id,
              name: schema.ageGroup.name,
              monthlyFee: schema.ageGroup.monthlyFee,
              activePlayers: sql<number>`count(${schema.player.id}) filter (where ${schema.player.status} = 'aktif')::int`,
            })
            .from(schema.ageGroup)
            .leftJoin(schema.player, and(eq(schema.player.ssbId, schema.ageGroup.ssbId), eq(schema.player.ageGroupId, schema.ageGroup.id)))
            .groupBy(schema.ageGroup.id)
            .orderBy(asc(schema.ageGroup.minAge), asc(schema.ageGroup.name)),
        );
        return c.json(rows satisfies FeeRate[]);
      })

      .put("/fees/rates", requirePermission("fee.manage"), zv("json", feeRatesInputSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const { rates } = c.req.valid("json");
        const ids = [...new Set(rates.map((r) => r.ageGroupId))];
        const ok = await withTenant(db, m.ssbId, async (tx) => {
          // Semua KU harus milik SSB ini; bila ada yang asing, tidak ada tarif yang berubah.
          const ada = ids.length === 0 ? [] : await tx.select({ id: schema.ageGroup.id }).from(schema.ageGroup).where(inArray(schema.ageGroup.id, ids));
          if (ada.length !== ids.length) return false;
          for (const r of rates) await tx.update(schema.ageGroup).set({ monthlyFee: r.monthlyFee }).where(eq(schema.ageGroup.id, r.ageGroupId));
          return true;
        });
        if (!ok) throw new HttpError(422, "age_group_invalid", "Ada KU yang tidak ditemukan di SSB ini");
        return c.json({ ok: true });
      })

      // Buat tagihan satu bulan untuk semua pemain aktif di KU bertarif. Aman dijalankan ulang: yang sudah ditagih dilewati.
      // Tarif khusus pemain menggantikan tarif KU; tarif 0 berarti pemain itu tidak ikut ditagih.
      .post("/invoices/generate", requirePermission("fee.manage"), zv("json", generateInvoicesSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const { month, dueDay } = c.req.valid("json");
        const pengaturan = await bacaPengaturan(db, m.ssbId);
        const bulan = `${month}-01`;
        const jatuhTempo = `${month}-${String(dueDay ?? pengaturan.dueDay).padStart(2, "0")}`;
        const out = await withTenant(db, m.ssbId, async (tx): Promise<GenerateInvoicesResult> => {
          const aktif = await tx
            .select({
              id: schema.player.id,
              fee: schema.ageGroup.monthlyFee,
              khusus: schema.playerFeeOverride.monthlyFee,
            })
            .from(schema.player)
            .leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)))
            .leftJoin(
              schema.playerFeeOverride,
              and(eq(schema.playerFeeOverride.ssbId, schema.player.ssbId), eq(schema.playerFeeOverride.playerId, schema.player.id)),
            )
            .where(eq(schema.player.status, "aktif"));
          // Tarif khusus menggantikan tarif KU, termasuk 0 yang berarti tidak ditagih.
          const tarif = aktif.map((p) => ({ id: p.id, fee: p.khusus ?? p.fee }));
          const bertarif = tarif.filter((p): p is { id: string; fee: number } => p.fee !== null && p.fee > 0);
          let created = 0;
          for (const p of bertarif) {
            const ins = await tx
              .insert(I)
              .values({ ssbId: m.ssbId, playerId: p.id, month: bulan, amount: p.fee, dueOn: jatuhTempo, createdBy: m.userId })
              .onConflictDoNothing({ target: [I.ssbId, I.playerId, I.month], where: sql`${I.voidedAt} is null` })
              .returning({ id: I.id });
            created += ins.length;
          }
          return { created, existing: bertarif.length - created, withoutRate: tarif.length - bertarif.length };
        });
        return c.json(out, 201);
      })

      // Daftar tagihan. Admin melihat semua (bisa disaring bulan dan pemain); orang tua hanya tagihan anaknya.
      .get("/invoices", requirePermission("invoice.read"), async (c) => {
        const m = c.get("auth")!.member!;
        const month = c.req.query("month");
        if (month && !MONTH.test(month)) throw new HttpError(400, "bad_request", "Bulan harus berformat YYYY-MM");
        const playerId = c.req.query("playerId");
        if (playerId && !UUID.test(playerId)) throw new HttpError(400, "bad_request", "Pemain tidak valid");
        return c.json(await loadInvoices(m.ssbId, m, { month, playerId }));
      })

      // Tagihan yang perlu diingatkan: sudah lewat jatuh tempo atau jatuh tempo dalam `days` hari ke depan (bawaan 3),
      // beserta nama dan WhatsApp wali. Yang paling terlambat di atas. Pengingat dikirim admin sendiri lewat WhatsApp.
      // Tagihan yang baru saja diingatkan tetap tampil, tapi ditandai `dalamJeda` supaya admin tahu
      // pengingat berikutnya sebaiknya ditunda sesuai jeda yang ditetapkan di pengaturan.
      .get("/fees/reminders", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const days = Math.min(30, Math.max(0, Number.parseInt(c.req.query("days") ?? "3", 10) || 0));
        const pengaturan = await bacaPengaturan(db, m.ssbId);
        const hariIni = todayWib();
        const batas = new Date(Date.parse(`${hariIni}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
        const semua = await loadInvoices(m.ssbId, m, {});
        const perlu = semua.filter((r) => (r.status === "belum" || r.status === "sebagian") && r.dueOn <= batas);
        const wali = new Map<string, ReminderRow["guardians"]>();
        if (perlu.length > 0) {
          const rows = await withTenant(db, m.ssbId, (tx) =>
            tx
              .select({
                playerId: schema.playerGuardian.playerId,
                name: schema.appUser.name,
                whatsapp: schema.appUser.whatsapp,
                relationship: schema.playerGuardian.relationship,
              })
              .from(schema.playerGuardian)
              .innerJoin(schema.appUser, and(eq(schema.appUser.ssbId, schema.playerGuardian.ssbId), eq(schema.appUser.id, schema.playerGuardian.userId)))
              .where(inArray(schema.playerGuardian.playerId, [...new Set(perlu.map((r) => r.player.id))])),
          );
          for (const w of rows) wali.set(w.playerId, [...(wali.get(w.playerId) ?? []), { name: w.name, whatsapp: w.whatsapp, relationship: w.relationship }]);
        }
        const out: ReminderRow[] = perlu
          .map(({ payments: _p, ...r }) => {
            // Sisa jeda: berapa hari lagi tagihan ini boleh diingatkan lagi.
            const sisaJedaHari = r.lastRemindedAt
              ? Math.max(0, Math.ceil((Date.parse(r.lastRemindedAt) + pengaturan.reminderIntervalDays * 86400000 - Date.now()) / 86400000))
              : 0;
            return {
              ...r,
              daysToDue: Math.round((Date.parse(`${r.dueOn}T00:00:00Z`) - Date.parse(`${hariIni}T00:00:00Z`)) / 86400000),
              dalamJeda: sisaJedaHari > 0,
              sisaJedaHari,
              guardians: wali.get(r.player.id) ?? [],
            };
          })
          .sort((a, b) => a.daysToDue - b.daysToDue || a.player.name.localeCompare(b.player.name));
        return c.json(out);
      })

      // Catat bahwa admin mengirim pengingat untuk tagihan ini (dipanggil saat tombol kirim WhatsApp ditekan).
      .post("/invoices/:id/reminded", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Tagihan");
        const res = await withTenant(db, m.ssbId, async (tx) => {
          const [inv] = await tx.select({ voidedAt: I.voidedAt, amount: I.amount }).from(I).where(eq(I.id, id)).for("update").limit(1);
          if (!inv) return "none" as const;
          if (inv.voidedAt) return "void" as const;
          const [jumlah] = await tx
            .select({ paid: sql<number>`coalesce(sum(${P.amount}), 0)::int` })
            .from(P)
            .where(eq(P.invoiceId, id));
          if ((jumlah?.paid ?? 0) >= inv.amount) return "lunas" as const;
          const [upd] = await tx
            .update(I)
            .set({ lastRemindedAt: new Date(), reminderCount: sql`${I.reminderCount} + 1` })
            .where(eq(I.id, id))
            .returning({ at: I.lastRemindedAt, n: I.reminderCount });
          return upd!;
        });
        if (res === "none") throw notFound("Tagihan");
        if (res === "void" || res === "lunas") throw new HttpError(409, "not_payable", "Tagihan ini sudah lunas atau dibatalkan, tidak perlu diingatkan");
        return c.json({ lastRemindedAt: res.at!.toISOString(), reminderCount: res.n });
      })

      // Ringkasan satu bulan untuk dasbor admin.
      .get("/fees/summary", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const month = c.req.query("month");
        if (!month || !MONTH.test(month)) throw new HttpError(400, "bad_request", "Bulan harus berformat YYYY-MM");
        const rows = await loadInvoices(m.ssbId, m, { month });
        const aktif = rows.filter((r) => r.status !== "dibatalkan");
        const out: FeeSummary = {
          month,
          invoices: aktif.length,
          billed: aktif.reduce((s, r) => s + r.amount, 0),
          paid: aktif.reduce((s, r) => s + r.paid, 0),
          outstanding: aktif.reduce((s, r) => s + r.remaining, 0),
          overdueInvoices: aktif.filter((r) => r.overdue).length,
          settledInvoices: aktif.filter((r) => r.status === "lunas").length,
        };
        return c.json(out);
      })

      // Catat pembayaran (boleh dicicil, tidak boleh melebihi sisa tagihan).
      .post("/invoices/:id/payments", requirePermission("fee.manage"), zv("json", paymentInputSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Tagihan");
        const b = c.req.valid("json");
        if (b.paidOn > todayWib()) throw new HttpError(400, "bad_request", "Tanggal bayar tidak boleh di masa depan");
        const res = await withTenant(db, m.ssbId, async (tx) => {
          // Kunci baris tagihan agar dua pembayaran serentak tidak sama-sama lolos cek sisa.
          const [inv] = await tx.select().from(I).where(eq(I.id, id)).for("update").limit(1);
          if (!inv) return "none" as const;
          if (inv.voidedAt) return "void" as const;
          const [jumlah] = await tx
            .select({ paid: sql<number>`coalesce(sum(${P.amount}), 0)::int` })
            .from(P)
            .where(eq(P.invoiceId, id));
          const sisa = inv.amount - (jumlah?.paid ?? 0);
          if (b.amount > sisa) return { over: sisa } as const;
          await tx
            .insert(P)
            .values({ ssbId: m.ssbId, invoiceId: id, amount: b.amount, paidOn: b.paidOn, method: b.method, note: b.note || null, recordedBy: m.userId });
          return "ok" as const;
        });
        if (res === "none") throw notFound("Tagihan");
        if (res === "void") throw new HttpError(409, "invoice_void", "Tagihan ini sudah dibatalkan");
        if (typeof res === "object") throw new HttpError(409, "overpaid", `Pembayaran melebihi sisa tagihan (sisa Rp ${res.over.toLocaleString("id-ID")})`);
        return c.json((await loadInvoices(m.ssbId, m, { id }))[0], 201);
      })

      // Koreksi: hapus satu catatan pembayaran.
      .delete("/payments/:id", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Pembayaran");
        const del = await withTenant(db, m.ssbId, (tx) => tx.delete(P).where(eq(P.id, id)).returning({ id: P.id }));
        if (del.length === 0) throw notFound("Pembayaran");
        return c.body(null, 204);
      })

      // Koreksi nominal tagihan. Tidak boleh membuat sisa tagihan negatif.
      .patch("/invoices/:id", requirePermission("fee.manage"), zv("json", invoiceAmountSchema), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Tagihan");
        const b = c.req.valid("json");
        const res = await withTenant(db, m.ssbId, async (tx) => {
          const [inv] = await tx.select().from(I).where(eq(I.id, id)).for("update").limit(1);
          if (!inv) return "none" as const;
          if (inv.voidedAt) return "void" as const;
          const [jumlah] = await tx
            .select({ paid: sql<number>`coalesce(sum(${P.amount}), 0)::int` })
            .from(P)
            .where(eq(P.invoiceId, id));
          if (b.amount < (jumlah?.paid ?? 0)) return { underpaid: jumlah?.paid ?? 0 } as const;
          await tx.update(I).set({ amount: b.amount }).where(eq(I.id, id));
          return "ok" as const;
        });
        if (res === "none") throw notFound("Tagihan");
        if (res === "void") throw new HttpError(409, "invoice_void", "Tagihan ini sudah dibatalkan");
        if (typeof res === "object")
          throw new HttpError(409, "underpaid", `Nominal tidak boleh lebih kecil dari yang sudah dibayar (Rp ${res.underpaid.toLocaleString("id-ID")})`);
        return c.json((await loadInvoices(m.ssbId, m, { id }))[0]);
      })

      // Buat ulang tagihan yang dibatalkan: nomor tagihan lama dibuang dan tagihan baru dibuat
      // dengan tarif dan jatuh tempo saat ini.
      .post("/invoices/:id/recreate", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Tagihan");
        const pengaturan = await bacaPengaturan(db, m.ssbId);
        const res = await withTenant(db, m.ssbId, async (tx) => {
          const [inv] = await tx.select().from(I).where(eq(I.id, id)).for("update").limit(1);
          if (!inv) return "none" as const;
          if (!inv.voidedAt) return "aktif" as const;
          const [adaBayar] = await tx.select({ n: sql<number>`count(*)::int` }).from(P).where(eq(P.invoiceId, id));
          if ((adaBayar?.n ?? 0) > 0) return "paid" as const;
          const [tarif] = await tx
            .select({ fee: schema.ageGroup.monthlyFee, khusus: schema.playerFeeOverride.monthlyFee })
            .from(schema.player)
            .leftJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.player.ssbId), eq(schema.ageGroup.id, schema.player.ageGroupId)))
            .leftJoin(
              schema.playerFeeOverride,
              and(eq(schema.playerFeeOverride.ssbId, schema.player.ssbId), eq(schema.playerFeeOverride.playerId, schema.player.id)),
            )
            .where(and(eq(schema.player.ssbId, m.ssbId), eq(schema.player.id, inv.playerId)))
            .limit(1);
          const fee = tarif?.khusus ?? tarif?.fee ?? null;
          if (fee === null || fee <= 0) return "tanpaTarif" as const;
          const bulan = inv.month.slice(0, 10);
          const jatuhTempo = `${bulan.slice(0, 7)}-${String(pengaturan.dueDay).padStart(2, "0")}`;
          const [baru] = await tx
            .insert(I)
            .values({ ssbId: m.ssbId, playerId: inv.playerId, month: inv.month, amount: fee, dueOn: jatuhTempo, createdBy: m.userId })
            .returning({ id: I.id });
          return { id: baru!.id };
        });
        if (res === "none") throw notFound("Tagihan");
        if (res === "aktif") throw new HttpError(409, "invoice_active", "Tagihan ini belum dibatalkan, tidak perlu dibuat ulang");
        if (res === "paid") throw new HttpError(409, "has_payments", "Tagihan lama masih punya catatan pembayaran. Hapus pembayarannya dulu");
        if (res === "tanpaTarif") throw new HttpError(409, "no_rate", "Pemain ini belum punya tarif. Atur tarif KU atau tarif khusus pemain dulu");
        return c.json((await loadInvoices(m.ssbId, m, { id: res.id }))[0], 201);
      })

      // Batalkan tagihan yang salah buat; hanya bila belum ada pembayaran (hapus dulu pembayarannya bila perlu).
      .post("/invoices/:id/void", requirePermission("fee.manage"), async (c) => {
        const m = c.get("auth")!.member!;
        const id = idOr404(c.req.param("id"), "Tagihan");
        const res = await withTenant(db, m.ssbId, async (tx) => {
          const [inv] = await tx.select({ voidedAt: I.voidedAt }).from(I).where(eq(I.id, id)).for("update").limit(1);
          if (!inv) return "none" as const;
          const [adaBayar] = await tx.select({ n: sql<number>`count(*)::int` }).from(P).where(eq(P.invoiceId, id));
          if ((adaBayar?.n ?? 0) > 0) return "paid" as const;
          if (!inv.voidedAt)
            await tx
              .update(I)
              .set({ voidedAt: new Date() })
              .where(and(eq(I.id, id), isNull(I.voidedAt)));
          return "ok" as const;
        });
        if (res === "none") throw notFound("Tagihan");
        if (res === "paid") throw new HttpError(409, "has_payments", "Tagihan yang sudah ada pembayarannya tidak bisa dibatalkan. Hapus pembayarannya dulu");
        return c.json((await loadInvoices(m.ssbId, m, { id }))[0]);
      })
  );
}
