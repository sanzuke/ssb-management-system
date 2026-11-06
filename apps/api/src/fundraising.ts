import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  donationRecordSchema,
  fundraisingCampaignInputSchema,
  pledgeDecisionSchema,
  pledgeInputSchema,
  type FundraisingCampaignRow,
  type FundraisingDetail,
  type FundraisingPledgeRow,
  type FundraisingStatus,
  type PledgeKind,
  type PledgeStatus,
  type PublicFundraising,
} from "@ssb/shared";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { ssbIdBySlug } from "./auth/service";
import { HttpError } from "./errors";
import { todayWib } from "./fees";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const idOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};

/** Sumbangan menunggu konfirmasi per anggota per kampanye; mencegah daftar admin dibanjiri. */
const MAX_PENDING_PER_DONOR = 5;
/** Jumlah nama sponsor dan donatur yang ditampilkan di landing per kampanye. */
const PUBLIC_SUPPORTERS = 12;

type Campaign = typeof schema.fundraisingCampaign.$inferSelect;
type Pledge = typeof schema.fundraisingPledge.$inferSelect;
type Summary = { raised: number; supporters: number };
type EventRef = { id: string; title: string; startDate: string };

const isAdmin = (m: Member) => m.role === "admin_ssb";
/** Boleh menerima sumbangan baru: aktif dan belum lewat batas akhir (batas akhir termasuk hari itu). */
const isOpen = (c: Campaign) => c.status === "aktif" && (!c.deadline || c.deadline >= todayWib());

/** Dana terkumpul dan jumlah pendukung, hanya dari sumbangan yang sudah diterima. */
async function summaries(tx: Tx, ids: string[]): Promise<Map<string, Summary>> {
  const out = new Map<string, Summary>();
  if (ids.length === 0) return out;
  const p = schema.fundraisingPledge;
  const rows = await tx
    .select({ campaignId: p.campaignId, raised: sql<string>`coalesce(sum(${p.amount}), 0)::bigint`, supporters: sql<number>`count(*)::int` })
    .from(p)
    .where(and(eq(p.status, "diterima"), inArray(p.campaignId, ids)))
    .groupBy(p.campaignId);
  for (const r of rows) out.set(r.campaignId, { raised: Number(r.raised), supporters: r.supporters });
  return out;
}

async function eventRefs(tx: Tx, rows: Campaign[]): Promise<Map<string, EventRef>> {
  const ids = [...new Set(rows.map((r) => r.calendarEventId).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const e = schema.calendarEvent;
  const found = await tx.select({ id: e.id, title: e.title, startDate: e.startDate }).from(e).where(inArray(e.id, ids));
  return new Map(found.map((r) => [r.id, r]));
}

/** Baris kampanye lengkap dengan ringkasan dana dan kegiatan terkait; yang masih terbuka di atas, lalu terbaru. */
async function campaignRows(tx: Tx, rows: Campaign[]): Promise<FundraisingCampaignRow[]> {
  const [sums, events] = await Promise.all([summaries(tx, rows.map((r) => r.id)), eventRefs(tx, rows)]);
  return rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      event: r.calendarEventId ? (events.get(r.calendarEventId) ?? null) : null,
      targetAmount: r.targetAmount,
      raised: sums.get(r.id)?.raised ?? 0,
      supporters: sums.get(r.id)?.supporters ?? 0,
      deadline: r.deadline,
      status: r.status as FundraisingStatus,
      open: isOpen(r),
      isPublic: r.isPublic,
      paymentInfo: r.paymentInfo,
      createdAt: r.createdAt.getTime(),
    }))
    .sort((a, b) => Number(b.open) - Number(a.open) || b.createdAt - a.createdAt)
    .map(({ createdAt: _createdAt, ...row }) => row);
}

function toPledge(r: Pledge, m: Member): FundraisingPledgeRow {
  const mine = r.donorId !== null && r.donorId === m.userId;
  const admin = isAdmin(m);
  return {
    id: r.id,
    campaignId: r.campaignId,
    kind: r.kind as PledgeKind,
    amount: r.amount,
    message: r.message,
    isAnonymous: r.isAnonymous,
    donorName: r.isAnonymous && !mine && !admin ? null : r.donorName,
    status: r.status as PledgeStatus,
    receivedOn: r.receivedOn,
    createdAt: r.createdAt.toISOString(),
    mine,
    ...(admin ? { donorWhatsapp: r.donorWhatsapp, adminNote: r.adminNote } : {}),
  };
}

async function loadCampaign(tx: Tx, id: string): Promise<Campaign> {
  const [row] = await tx.select().from(schema.fundraisingCampaign).where(eq(schema.fundraisingCampaign.id, id)).limit(1);
  if (!row) throw notFound("Kampanye");
  return row;
}

/** Kegiatan yang dikaitkan harus ada di SSB ini; FK saja akan memberi galat basis data yang tidak ramah. */
async function assertEvent(tx: Tx, eventId: string | null | undefined) {
  if (!eventId) return;
  const [e] = await tx.select({ id: schema.calendarEvent.id }).from(schema.calendarEvent).where(eq(schema.calendarEvent.id, eventId)).limit(1);
  if (!e) throw new HttpError(400, "validation", "Periksa kembali isian Anda", { calendarEventId: "kegiatan tidak ditemukan" });
}

async function acceptedCount(tx: Tx, campaignId: string): Promise<number> {
  const p = schema.fundraisingPledge;
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(p).where(and(eq(p.campaignId, campaignId), eq(p.status, "diterima")));
  return r?.n ?? 0;
}

/**
 * Donasi (crowdfunding) per kegiatan. Dana masuk lewat transfer manual dan dikonfirmasi admin; semua anggota melihat kampanye
 * dan boleh menyumbang atau menjadi sponsor, admin mengelola kampanye serta mencatat sumbangan di luar aplikasi.
 */
export function fundraisingRoutes(db: Db) {
  const campaigns = schema.fundraisingCampaign;
  const pledges = schema.fundraisingPledge;
  const member = (c: { get: (k: "auth") => { member?: Member } | undefined }) => c.get("auth")!.member!;

  return (
    new Hono<AppEnv>()
      .get("/fundraising", requirePermission("fundraising.read"), async (c) => {
        const m = member(c);
        const rows = await withTenant(db, m.ssbId, async (tx) =>
          campaignRows(tx, await tx.select().from(campaigns).where(isAdmin(m) ? undefined : ne(campaigns.status, "draft"))),
        );
        return c.json(rows);
      })

      .get("/fundraising/:id", requirePermission("fundraising.read"), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Kampanye");
        const out = await withTenant(db, m.ssbId, async (tx): Promise<FundraisingDetail> => {
          const row = await loadCampaign(tx, id);
          if (row.status === "draft" && !isAdmin(m)) throw notFound("Kampanye");
          const visible = isAdmin(m) ? undefined : sql`(${pledges.status} = 'diterima' or ${pledges.donorId} = ${m.userId})`;
          const list = await tx.select().from(pledges).where(and(eq(pledges.campaignId, id), visible)).orderBy(desc(pledges.createdAt));
          return { campaign: (await campaignRows(tx, [row]))[0]!, pledges: list.map((p) => toPledge(p, m)) };
        });
        return c.json(out);
      })

      .post("/fundraising", requirePermission("fundraising.manage"), zv("json", fundraisingCampaignInputSchema), async (c) => {
        const m = member(c);
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await assertEvent(tx, b.calendarEventId);
          const [row] = await tx
            .insert(campaigns)
            .values({
              ssbId: m.ssbId,
              title: b.title,
              description: b.description,
              calendarEventId: b.calendarEventId ?? null,
              targetAmount: b.targetAmount ?? null,
              deadline: b.deadline ?? null,
              status: b.status,
              isPublic: b.isPublic,
              paymentInfo: b.paymentInfo,
              createdBy: m.userId,
            })
            .returning();
          if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan kampanye");
          return (await campaignRows(tx, [row]))[0]!;
        });
        return c.json(out, 201);
      })

      .put("/fundraising/:id", requirePermission("fundraising.manage"), zv("json", fundraisingCampaignInputSchema), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Kampanye");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await loadCampaign(tx, id);
          await assertEvent(tx, b.calendarEventId);
          if (b.status === "draft" && (await acceptedCount(tx, id)) > 0) {
            throw new HttpError(409, "conflict", "Kampanye sudah punya sumbangan yang diterima, jadi tidak bisa dikembalikan ke draf. Tandai selesai saja.");
          }
          const [row] = await tx
            .update(campaigns)
            .set({
              title: b.title,
              description: b.description,
              calendarEventId: b.calendarEventId ?? null,
              targetAmount: b.targetAmount ?? null,
              deadline: b.deadline ?? null,
              status: b.status,
              isPublic: b.isPublic,
              paymentInfo: b.paymentInfo,
              updatedAt: new Date(),
            })
            .where(eq(campaigns.id, id))
            .returning();
          return (await campaignRows(tx, [row!]))[0]!;
        });
        return c.json(out);
      })

      .delete("/fundraising/:id", requirePermission("fundraising.manage"), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Kampanye");
        await withTenant(db, m.ssbId, async (tx) => {
          await loadCampaign(tx, id);
          if ((await acceptedCount(tx, id)) > 0) {
            throw new HttpError(409, "conflict", "Kampanye sudah punya sumbangan yang diterima dan tidak bisa dihapus. Tandai selesai saja.");
          }
          await tx.delete(campaigns).where(eq(campaigns.id, id));
        });
        return c.body(null, 204);
      })

      // Anggota menyumbang atau menjadi sponsor; masuk berstatus menunggu sampai admin memastikan transfernya.
      .post("/fundraising/:id/pledges", requirePermission("fundraising.pledge"), zv("json", pledgeInputSchema), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Kampanye");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          const camp = await loadCampaign(tx, id);
          if (camp.status === "draft" && !isAdmin(m)) throw notFound("Kampanye");
          if (!isOpen(camp)) throw new HttpError(409, "conflict", "Kampanye ini sedang tidak menerima sumbangan");
          const [pending] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(pledges)
            .where(and(eq(pledges.campaignId, id), eq(pledges.donorId, m.userId), eq(pledges.status, "menunggu")));
          if ((pending?.n ?? 0) >= MAX_PENDING_PER_DONOR) {
            throw new HttpError(429, "too_many", "Masih ada beberapa sumbangan Anda yang menunggu konfirmasi admin. Tunggu hingga dikonfirmasi.");
          }
          const [u] = await tx.select({ whatsapp: schema.appUser.whatsapp }).from(schema.appUser).where(eq(schema.appUser.id, m.userId)).limit(1);
          const [row] = await tx
            .insert(pledges)
            .values({
              ssbId: m.ssbId,
              campaignId: id,
              donorId: m.userId,
              donorName: m.name,
              donorWhatsapp: u?.whatsapp ?? null,
              kind: b.kind,
              amount: b.amount,
              message: b.message,
              isAnonymous: b.isAnonymous,
            })
            .returning();
          if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan sumbangan");
          return toPledge(row, m);
        });
        return c.json(out, 201);
      })

      // Admin mencatat sumbangan di luar aplikasi: langsung diterima.
      .post("/fundraising/:id/donations", requirePermission("fundraising.manage"), zv("json", donationRecordSchema), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Kampanye");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await loadCampaign(tx, id);
          const [row] = await tx
            .insert(pledges)
            .values({
              ssbId: m.ssbId,
              campaignId: id,
              donorId: null,
              donorName: b.donorName,
              donorWhatsapp: b.donorWhatsapp ?? null,
              kind: b.kind,
              amount: b.amount,
              message: b.message,
              isAnonymous: b.isAnonymous,
              status: "diterima",
              receivedOn: b.receivedOn,
              adminNote: b.adminNote ?? null,
            })
            .returning();
          if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan sumbangan");
          return toPledge(row, m);
        });
        return c.json(out, 201);
      })

      // Terima atau tolak. Boleh dikoreksi kemudian; tanggal terima hanya ada pada yang diterima.
      .patch("/fundraising/pledges/:id", requirePermission("fundraising.manage"), zv("json", pledgeDecisionSchema), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Sumbangan");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          const [row] = await tx
            .update(pledges)
            .set({
              status: b.status,
              receivedOn: b.status === "diterima" ? (b.receivedOn ?? todayWib()) : null,
              adminNote: b.adminNote ?? null,
              updatedAt: new Date(),
            })
            .where(eq(pledges.id, id))
            .returning();
          if (!row) throw notFound("Sumbangan");
          return toPledge(row, m);
        });
        return c.json(out);
      })

      .delete("/fundraising/pledges/:id", requirePermission("fundraising.manage"), async (c) => {
        const m = member(c);
        const id = idOr404(c.req.param("id"), "Sumbangan");
        await withTenant(db, m.ssbId, async (tx) => {
          const [row] = await tx.select().from(pledges).where(eq(pledges.id, id)).limit(1);
          if (!row) throw notFound("Sumbangan");
          if (row.status === "diterima") throw new HttpError(409, "conflict", "Sumbangan yang sudah diterima tidak bisa dihapus. Tolak dulu bila memang salah catat.");
          await tx.delete(pledges).where(eq(pledges.id, id));
        });
        return c.body(null, 204);
      })

      // Landing page, tanpa sesi: kampanye aktif atau selesai yang bertanda publik. Tanpa rekening, nominal per donatur, atau donatur anonim.
      .get("/public/site/:slug/fundraising", async (c) => {
        const ssbId = await ssbIdBySlug(db, c.req.param("slug").toLowerCase());
        if (!ssbId) throw notFound("Situs");
        const out = await withTenant(db, ssbId, async (tx): Promise<PublicFundraising[]> => {
          const rows = await tx
            .select()
            .from(campaigns)
            .where(and(eq(campaigns.isPublic, true), ne(campaigns.status, "draft")));
          const full = await campaignRows(tx, rows);
          const supporters = full.length
            ? await tx
                .select({ campaignId: pledges.campaignId, name: pledges.donorName, kind: pledges.kind })
                .from(pledges)
                .where(and(inArray(pledges.campaignId, full.map((f) => f.id)), eq(pledges.status, "diterima"), eq(pledges.isAnonymous, false)))
                .orderBy(asc(sql`case when ${pledges.kind} = 'sponsor' then 0 else 1 end`), desc(pledges.amount), asc(pledges.createdAt))
            : [];
          return full.map((f) => ({
            id: f.id,
            title: f.title,
            description: f.description,
            event: f.event ? { title: f.event.title, startDate: f.event.startDate } : null,
            targetAmount: f.targetAmount,
            raised: f.raised,
            supporters: f.supporters,
            deadline: f.deadline,
            open: f.open,
            sponsors: supporters
              .filter((s) => s.campaignId === f.id)
              .slice(0, PUBLIC_SUPPORTERS)
              .map((s) => ({ name: s.name, kind: s.kind as PledgeKind })),
          }));
        });
        c.header("cache-control", "public, max-age=60");
        return c.json(out);
      })
  );
}
