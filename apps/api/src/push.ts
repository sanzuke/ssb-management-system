import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import { pushDeviceRemoveSchema, pushDeviceSchema } from "@ssb/shared";
import { requireAccount, type AppEnv } from "./auth/middleware";
import type { Env } from "./env";
import type { Logger } from "./logger";
import { zv } from "./validator";

/** Isi satu notifikasi. `route` adalah rute aplikasi mobile yang dibuka saat notifikasi diketuk. */
export type PushMessage = { type: string; title: string; body: string; route: string };

/** Pengirim push ke semua perangkat milik akun penerima. `null` berarti push tidak aktif di server ini. */
export type Pusher = { send(accountIds: string[], msg: PushMessage): Promise<void> };

const MAX_DEVICES_PER_ACCOUNT = 10;
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/** "2026-11-20" -> "Jum, 20 Nov". Dihitung di UTC karena tanggal sesi tidak punya zona waktu. */
export function tanggalId(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]}`;
}

export const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const BULAN_PENUH = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** "2026-11-01" -> "November 2026". */
export const bulanTahun = (iso: string) => `${BULAN_PENUH[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

// ---- FCM HTTP v1 ----

type ServiceAccount = { client_email: string; private_key: string; project_id: string; token_uri?: string };

/** Akun layanan Firebase dari JSON langsung atau jalur ke berkas JSON. Gagal dengan pesan jelas bila isinya tidak lengkap. */
export function loadServiceAccount(raw: string): ServiceAccount {
  const text = raw.trim().startsWith("{") ? raw : readFileSync(raw.trim(), "utf8");
  const sa = JSON.parse(text) as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error("FCM_SERVICE_ACCOUNT harus berisi client_email, private_key, dan project_id");
  return { client_email: sa.client_email, private_key: sa.private_key, project_id: sa.project_id, ...(sa.token_uri ? { token_uri: sa.token_uri } : {}) };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** JWT RS256 untuk menukar akun layanan dengan access token OAuth, ditandatangani dengan node:crypto. */
function signJwt(sa: ServiceAccount, nowSec: number): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud: sa.token_uri ?? TOKEN_URI, iat: nowSec, exp: nowSec + 3600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.private_key);
  return `${head}.${claims}.${b64url(signature)}`;
}

type FcmOptions = { serviceAccount: ServiceAccount; db: Db; logger: Logger; fetch?: typeof fetch; now?: () => number };

/** Pengirim lewat FCM HTTP v1. Access token disimpan sampai mendekati kedaluwarsa; token perangkat yang sudah tidak berlaku dihapus. */
export function createFcmPusher(opts: FcmOptions): Pusher {
  const http = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const sa = opts.serviceAccount;
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  async function accessToken(): Promise<string> {
    // Margin semenit supaya token tidak kedaluwarsa di tengah pengiriman.
    if (cached && cached.expiresAt - 60_000 > now()) return cached.token;
    // Pengiriman serentak berbagi satu permintaan token.
    pending ??= (async () => {
      const res = await http(sa.token_uri ?? TOKEN_URI, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signJwt(sa, Math.floor(now() / 1000)) }),
      });
      if (!res.ok) throw new Error(`token OAuth FCM gagal (${res.status})`);
      const body = (await res.json()) as { access_token: string; expires_in: number };
      cached = { token: body.access_token, expiresAt: now() + body.expires_in * 1000 };
      return cached.token;
    })().finally(() => {
      pending = null;
    });
    return pending;
  }

  /** Mengirim ke satu token; true bila token sudah tidak berlaku dan perlu dihapus. */
  async function sendOne(token: string, msg: PushMessage, retry = true): Promise<boolean> {
    const res = await http(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: { type: msg.type, route: msg.route },
          android: { priority: "HIGH" },
          apns: { payload: { aps: { sound: "default" } } },
        },
      }),
    });
    if (res.ok) return false;
    if (res.status === 401 && retry) {
      cached = null;
      return sendOne(token, msg, false);
    }
    const text = await res.text();
    // UNREGISTERED (404): aplikasi dihapus atau token diganti. Galat lain tidak menghapus apa pun.
    if (res.status === 404 || text.includes("UNREGISTERED")) return true;
    throw new Error(`FCM menolak pesan (${res.status}): ${text.slice(0, 200)}`);
  }

  return {
    async send(accountIds, msg) {
      if (accountIds.length === 0) return;
      const devices = await opts.db
        .select({ token: schema.pushDevice.token })
        .from(schema.pushDevice)
        .where(inArray(schema.pushDevice.accountId, accountIds));
      const stale: string[] = [];
      // Bertahap supaya ratusan perangkat tidak membuka ratusan koneksi sekaligus.
      for (let i = 0; i < devices.length; i += 10) {
        await Promise.all(
          devices.slice(i, i + 10).map(async (d) => {
            try {
              if (await sendOne(d.token, msg)) stale.push(d.token);
            } catch (e) {
              opts.logger.log("error", "gagal mengirim push ke satu perangkat", { error: e instanceof Error ? e.message : String(e) });
            }
          }),
        );
      }
      if (stale.length > 0) await opts.db.delete(schema.pushDevice).where(inArray(schema.pushDevice.token, stale));
    },
  };
}

/** Pengirim FCM bila FCM_SERVICE_ACCOUNT diisi; selain itu null (push tidak aktif). Isi yang tidak valid menggagalkan start dengan pesan jelas. */
export function createPusher(db: Db, env: Pick<Env, "FCM_SERVICE_ACCOUNT">, logger: Logger): Pusher | null {
  if (!env.FCM_SERVICE_ACCOUNT) return null;
  return createFcmPusher({ serviceAccount: loadServiceAccount(env.FCM_SERVICE_ACCOUNT), db, logger });
}

// ---- Penerima dan pemicu ----

/** Akun pelatih dan korlas yang bertugas di KU pada tanggal tertentu (periode penugasan mencakup tanggal itu). */
export async function coachAccounts(tx: Tx, ageGroupId: string, date: string): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ accountId: schema.appUser.accountId })
    .from(schema.coachAssignment)
    .innerJoin(schema.period, and(eq(schema.period.ssbId, schema.coachAssignment.ssbId), eq(schema.period.id, schema.coachAssignment.periodId)))
    .innerJoin(schema.appUser, and(eq(schema.appUser.ssbId, schema.coachAssignment.ssbId), eq(schema.appUser.id, schema.coachAssignment.userId)))
    .where(
      and(
        eq(schema.coachAssignment.ageGroupId, ageGroupId),
        sql`${date}::date between ${schema.period.startDate} and ${schema.period.endDate}`,
      ),
    );
  return rows.map((r) => r.accountId);
}

const guardianLinks = (tx: Tx) =>
  tx
    .select({ accountId: schema.appUser.accountId, playerId: schema.player.id, playerName: schema.player.fullName })
    .from(schema.playerGuardian)
    .innerJoin(schema.player, and(eq(schema.player.ssbId, schema.playerGuardian.ssbId), eq(schema.player.id, schema.playerGuardian.playerId)))
    .innerJoin(schema.appUser, and(eq(schema.appUser.ssbId, schema.playerGuardian.ssbId), eq(schema.appUser.id, schema.playerGuardian.userId)));

/**
 * Pemicu push dari kode API. Semua metodenya berjalan di latar belakang: tidak pernah menggagalkan permintaan,
 * galatnya hanya dicatat. Tanpa pengirim (FCM belum dikonfigurasi) pencarian penerima pun dilewati.
 */
export type Notifier = {
  /** Kirim langsung ke akun tertentu (mis. pelatih yang sudah ditemukan pemanggil). */
  toAccounts(what: string, accountIds: string[], msg: PushMessage): void;
  /** Orang tua semua siswa (selain yang sudah keluar) di satu KU. */
  toGuardiansOfAgeGroup(ssbId: string, ageGroupId: string, msg: PushMessage): void;
  /**
   * Wali dari sekumpulan siswa. Tiap akun menerima satu pesan yang disusun dari nama anak-anaknya
   * (orang tua dengan dua anak di daftar tidak menerima dua notifikasi).
   */
  toGuardiansOfPlayers(ssbId: string, playerIds: string[], build: (anak: string[]) => PushMessage): void;
  /** Pelatih dan korlas yang bertugas di KU sesi itu pada tanggal sesi. */
  toCoachesOfSession(ssbId: string, sessionId: string, build: (s: { ageGroupName: string; sessionDate: string }) => PushMessage): void;
};

/** `track` hanya untuk tes: menerima janji pekerjaan latar belakang supaya bisa ditunggu. */
export function createNotifier(opts: { db: Db; pusher: Pusher | null; logger: Logger; track?: ((selesai: Promise<void>) => void) | undefined }): Notifier {
  const { db, pusher, logger } = opts;

  const run = (what: string, fn: (pusher: Pusher) => Promise<void>) => {
    if (!pusher) {
      logger.log("debug", "push dilewati: FCM belum dikonfigurasi", { what });
      return;
    }
    const selesai = fn(pusher).catch((e) => logger.log("error", "gagal mengirim push", { what, error: e instanceof Error ? e.message : String(e) }));
    opts.track?.(selesai);
  };

  return {
    /** Kirim langsung ke akun tertentu (mis. pelatih yang sudah ditemukan pemanggil). */
    toAccounts(what: string, accountIds: string[], msg: PushMessage) {
      run(what, (p) => p.send([...new Set(accountIds)], msg));
    },

    /** Orang tua semua siswa (selain yang sudah keluar) di satu KU. */
    toGuardiansOfAgeGroup(ssbId: string, ageGroupId: string, msg: PushMessage) {
      run("orang tua KU", async (p) => {
        const rows = await withTenant(db, ssbId, (tx) => guardianLinks(tx).where(and(eq(schema.player.ageGroupId, ageGroupId), ne(schema.player.status, "keluar"))));
        await p.send([...new Set(rows.map((r) => r.accountId))], msg);
      });
    },

    /**
     * Wali dari sekumpulan siswa. Tiap akun menerima satu pesan yang disusun dari nama anak-anaknya
     * (orang tua dengan dua anak di daftar tidak menerima dua notifikasi).
     */
    toGuardiansOfPlayers(ssbId: string, playerIds: string[], build: (anak: string[]) => PushMessage) {
      if (playerIds.length === 0) return;
      run("wali siswa", async (p) => {
        const rows = await withTenant(db, ssbId, (tx) => guardianLinks(tx).where(inArray(schema.playerGuardian.playerId, playerIds)));
        const perAkun = new Map<string, string[]>();
        for (const r of rows) perAkun.set(r.accountId, [...(perAkun.get(r.accountId) ?? []), r.playerName]);
        for (const [accountId, anak] of perAkun) await p.send([accountId], build(anak));
      });
    },

    /** Pelatih dan korlas yang bertugas di KU sesi itu pada tanggal sesi. */
    toCoachesOfSession(ssbId: string, sessionId: string, build: (s: { ageGroupName: string; sessionDate: string }) => PushMessage) {
      run("pelatih sesi", async (p) => {
        const found = await withTenant(db, ssbId, async (tx) => {
          const [s] = await tx
            .select({ ageGroupId: schema.trainingSession.ageGroupId, sessionDate: schema.trainingSession.sessionDate, ageGroupName: schema.ageGroup.name })
            .from(schema.trainingSession)
            .innerJoin(schema.ageGroup, and(eq(schema.ageGroup.ssbId, schema.trainingSession.ssbId), eq(schema.ageGroup.id, schema.trainingSession.ageGroupId)))
            .where(eq(schema.trainingSession.id, sessionId))
            .limit(1);
          return s ? { ...s, accounts: await coachAccounts(tx, s.ageGroupId, s.sessionDate) } : null;
        });
        if (found) await p.send(found.accounts, build(found));
      });
    },
  };
}

// ---- Perangkat ----

/** Pendaftaran perangkat untuk push. Milik akun, jadi cukup login (belum perlu memilih SSB). */
export function pushRoutes(db: Db) {
  return new Hono<AppEnv>()
    // Token yang sama bisa berpindah akun (ganti pengguna di satu ponsel): upsert mengikatnya ke akun yang sedang login.
    .post("/push/devices", requireAccount, zv("json", pushDeviceSchema), async (c) => {
      const accountId = c.get("auth")!.accountId;
      const { token, platform } = c.req.valid("json");
      await db
        .insert(schema.pushDevice)
        .values({ accountId, token, platform })
        .onConflictDoUpdate({ target: schema.pushDevice.token, set: { accountId, platform, lastSeenAt: sql`now()` } });
      // Batas perangkat per akun: yang paling lama tidak terlihat dibuang, agar tabel tidak dibanjiri token.
      await db.delete(schema.pushDevice).where(
        and(
          eq(schema.pushDevice.accountId, accountId),
          sql`${schema.pushDevice.id} not in (
            select id from push_device where account_id = ${accountId} order by last_seen_at desc limit ${MAX_DEVICES_PER_ACCOUNT})`,
        ),
      );
      return c.json({ ok: true });
    })

    // Hanya token milik akun yang sedang login yang bisa dilepas.
    .delete("/push/devices", requireAccount, zv("json", pushDeviceRemoveSchema), async (c) => {
      const accountId = c.get("auth")!.accountId;
      await db.delete(schema.pushDevice).where(and(eq(schema.pushDevice.token, c.req.valid("json").token), eq(schema.pushDevice.accountId, accountId)));
      return c.json({ ok: true });
    });
}
