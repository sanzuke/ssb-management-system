import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant, type Db } from "@ssb/db";
import type { Logger } from "./logger";
import { coachAccounts, type Pusher } from "./push";

const WIB_MS = 7 * 3600 * 1000;
/** Pengingat dikirim untuk sesi yang mulai dalam jendela ini. */
const AHEAD_MS = 30 * 60 * 1000;

/** Waktu dinding WIB sebagai teks timestamp tanpa zona ("2026-11-20 15:30:00"), sama dengan jam sesi yang disimpan tanpa zona. */
const wibStamp = (t: number) => new Date(t + WIB_MS).toISOString().slice(0, 19).replace("T", " ");

/**
 * Mengirim "Latihan 30 menit lagi" ke pelatih dan korlas untuk sesi yang akan mulai dalam 30 menit, satu kali per sesi.
 * Penanda `reminder_sent_at` dipasang lebih dulu dengan update bersyarat, jadi dua proses atau dua putaran tidak mengirim ganda
 * (konsekuensinya: bila pengiriman gagal, pengingat itu tidak diulang). Sesi tanpa jam mulai tidak diingatkan.
 * Dipanggil berkala dari index.ts; baris sesi dibatasi RLS per SSB, jadi tiap SSB diproses dalam konteks tenantnya.
 */
export async function sendSessionReminders(opts: { db: Db; pusher: Pusher; logger: Logger; now?: () => number }): Promise<number> {
  const { db, pusher, logger } = opts;
  const t = (opts.now ?? Date.now)();
  const from = wibStamp(t);
  const to = wibStamp(t + AHEAD_MS);
  const ts = schema.trainingSession;
  let sent = 0;

  const ssbs = await db.select({ ssbId: schema.ssbDirectory.ssbId }).from(schema.ssbDirectory);
  for (const { ssbId } of ssbs) {
    try {
      const due = await withTenant(db, ssbId, async (tx) => {
        const claimed = await tx
          .update(ts)
          .set({ reminderSentAt: new Date(t) })
          .where(
            and(
              isNull(ts.reminderSentAt),
              sql`${ts.startTime} is not null`,
              sql`(${ts.sessionDate} + ${ts.startTime}) > ${from}::timestamp`,
              sql`(${ts.sessionDate} + ${ts.startTime}) <= ${to}::timestamp`,
            ),
          )
          .returning({ id: ts.id, ageGroupId: ts.ageGroupId, sessionDate: ts.sessionDate, startTime: ts.startTime, locationId: ts.locationId });
        const out = [];
        for (const s of claimed) {
          const [ku] = await tx.select({ name: schema.ageGroup.name }).from(schema.ageGroup).where(eq(schema.ageGroup.id, s.ageGroupId)).limit(1);
          const [loc] = s.locationId
            ? await tx.select({ name: schema.location.name }).from(schema.location).where(eq(schema.location.id, s.locationId)).limit(1)
            : [];
          out.push({ ...s, ageGroupName: ku?.name ?? "", locationName: loc?.name ?? null, accounts: await coachAccounts(tx, s.ageGroupId, s.sessionDate) });
        }
        return out;
      });
      for (const s of due) {
        const jam = s.startTime!.slice(0, 5);
        const menit = Math.max(1, Math.ceil((Date.parse(`${s.sessionDate}T${s.startTime}Z`) - (t + WIB_MS)) / 60000));
        try {
          await pusher.send(s.accounts, {
            type: "session_reminder",
            title: `Latihan ${menit} menit lagi`,
            body: `${s.ageGroupName} jam ${jam}${s.locationName ? ` di ${s.locationName}` : ""}`,
            route: `/absensi/${s.id}`,
          });
          sent++;
        } catch (e) {
          logger.log("error", "gagal mengirim pengingat latihan", { sessionId: s.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      logger.log("error", "gagal memproses pengingat latihan satu SSB", { ssbId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return sent;
}
