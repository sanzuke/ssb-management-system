import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";
import type { PushMessage, Pusher } from "./push";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Pengirim tiruan: mencatat penerima dan isi pesan tanpa menyentuh jaringan. */
class FakePusher implements Pusher {
  sent: { accountIds: string[]; msg: PushMessage }[] = [];
  async send(accountIds: string[], msg: PushMessage) {
    this.sent.push({ accountIds, msg });
  }
}

run("pengajuan izin dan sakit dari orang tua", () => {
  const { db, client } = createDb(url!);
  const pusher = new FakePusher();
  const pending: Promise<void>[] = [];
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) },
    { google: null, pusher, onLatar: (p) => pending.push(p) },
  );
  const settle = async () => {
    await Promise.all(pending.splice(0));
  };
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

  /** SSB dengan KU-10 dan KU-12; pelatih A bertugas di KU-10, pelatih B di KU-12; Ali di KU-10 dan Eko di KU-12, masing-masing punya orang tua. */
  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `S ${tag}`,
      slug: `s-${tag}-${uid}`,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku10 = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id as string;
    const ku12 = (await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id as string;
    const period = (await json(await call("POST", "/periods", admin, { name: "Musim", startDate: iso(-60), endDate: iso(90) }))).id as string;
    const loc = (await json(await call("POST", "/locations", admin, { name: "Lapangan Utama" }))).id as string;
    const join = async (role: string, extra: Record<string, unknown> = {}) => {
      const inv = await json(await call("POST", "/invitations", admin, { role, ...extra }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, {
        name: role,
        email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`,
        password: PASS,
      });
      expect(acc.status).toBe(201);
      const cookie = sessionOf(acc);
      const me = await json(await call("GET", "/auth/me", cookie));
      return { cookie, userId: me.active.userId as string, accountId: me.accountId as string };
    };
    const coachA = await join("pelatih");
    const coachB = await join("pelatih");
    expect((await call("POST", "/assignments", admin, { userId: coachA.userId, ageGroupId: ku10, periodId: period })).status).toBe(201);
    expect((await call("POST", "/assignments", admin, { userId: coachB.userId, ageGroupId: ku12, periodId: period })).status).toBe(201);
    const mk = async (name: string, ageGroupId: string) =>
      (await json(await call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId, status: "aktif" }))).id as string;
    const ali = await mk("Ali", ku10);
    const eko = await mk("Eko", ku12);
    const ortuAli = await join("orang_tua", { playerId: ali });
    const ortuEko = await join("orang_tua", { playerId: eko });
    const session = async (ageGroupId: string, offset: number) =>
      (await json(await call("POST", "/sessions", admin, { ageGroupId, sessionDate: iso(offset), startTime: "16:00", locationId: loc })))[0].id as string;
    return { ssbId, admin, ku10, ku12, loc, coachA, coachB, ali, eko, ortuAli, ortuEko, session };
  }

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("orang tua mengajukan, memperbarui, melihat, dan menarik pengajuan anaknya", async () => {
    const w = await world("alur");
    const s = await w.session(w.ku10, 3);
    const body = { sessionId: s, playerId: w.ali, kind: "izin", note: "  acara keluarga " };
    const made = await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, body);
    expect(made.status).toBe(201);
    const row = await json(made);
    expect(row).toMatchObject({ sessionId: s, sessionDate: iso(3), startTime: "16:00", ageGroup: { name: "KU-10" }, playerId: w.ali, playerName: "Ali", kind: "izin", note: "acara keluarga" });
    expect(typeof row.createdAt).toBe("string");

    // mengajukan lagi memperbarui baris yang sama, bukan membuat dua
    const again = await json(await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, { ...body, kind: "sakit", note: "" }));
    expect(again.id).toBe(row.id);
    expect(again).toMatchObject({ kind: "sakit", note: null });
    const list = await json(await call("GET", "/guardian/absence-requests", w.ortuAli.cookie));
    expect(list.map((r: any) => [r.id, r.kind])).toEqual([[row.id, "sakit"]]);

    // catatan maksimal 200 karakter, jenis harus izin atau sakit
    expect((await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, { ...body, note: "x".repeat(201) })).status).toBe(400);
    expect((await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, { ...body, kind: "alpa" })).status).toBe(400);

    // orang tua lain tidak melihat dan tidak bisa menghapusnya
    expect(await json(await call("GET", "/guardian/absence-requests", w.ortuEko.cookie))).toEqual([]);
    expect((await call("DELETE", `/guardian/absence-requests/${row.id}`, w.ortuEko.cookie)).status).toBe(404);

    expect(await json(await call("DELETE", `/guardian/absence-requests/${row.id}`, w.ortuAli.cookie))).toEqual({ ok: true });
    expect(await json(await call("GET", "/guardian/absence-requests", w.ortuAli.cookie))).toEqual([]);
    expect((await call("DELETE", `/guardian/absence-requests/${row.id}`, w.ortuAli.cookie)).status).toBe(404);
    expect((await call("DELETE", "/guardian/absence-requests/bukan-uuid", w.ortuAli.cookie)).status).toBe(404);
  });

  test("anak orang lain, sesi KU lain, dan sesi yang sudah lewat ditolak; hari ini masih boleh", async () => {
    const w = await world("tolak");
    const s10 = await w.session(w.ku10, 2);
    const s12 = await w.session(w.ku12, 2);
    const post = (cookie: string, sessionId: string, playerId: string) => call("POST", "/guardian/absence-requests", cookie, { sessionId, playerId, kind: "izin" });

    // anak orang tua lain: 404 seperti rute siswa lain
    expect((await post(w.ortuAli.cookie, s12, w.eko)).status).toBe(404);
    expect((await post(w.ortuEko.cookie, s10, w.ali)).status).toBe(404);
    // sesi milik KU lain untuk anak sendiri
    const lain = await post(w.ortuAli.cookie, s12, w.ali);
    expect(lain.status).toBe(422);
    expect((await json(lain)).error.code).toBe("session_not_for_player");
    // sesi tidak ada
    expect((await post(w.ortuAli.cookie, randomUUID(), w.ali)).status).toBe(404);

    // sesi kemarin sudah lewat
    const lewat = await w.session(w.ku10, -1);
    const res = await post(w.ortuAli.cookie, lewat, w.ali);
    expect(res.status).toBe(422);
    expect((await json(res)).error.code).toBe("session_past");

    // sesi hari ini (WIB) masih bisa diajukan
    const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const hariIni = (
      await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: today, startTime: "17:30", locationId: w.loc }))
    )[0].id as string;
    expect((await post(w.ortuAli.cookie, hariIni, w.ali)).status).toBe(201);

    // pengajuan yang sesinya kemudian dipindah ke masa lalu tidak bisa ditarik lagi
    const made = await json(await post(w.ortuAli.cookie, s10, w.ali));
    const moved = await call("PATCH", `/sessions/${s10}`, w.admin, { ageGroupId: w.ku10, sessionDate: iso(-2), startTime: "16:00", locationId: w.loc });
    expect(moved.status).toBe(200);
    const del = await call("DELETE", `/guardian/absence-requests/${made.id}`, w.ortuAli.cookie);
    expect(del.status).toBe(422);
    expect((await json(del)).error.code).toBe("session_past");
  });

  test("hanya orang tua yang boleh mengajukan; tanpa login 401", async () => {
    const w = await world("izin");
    const s = await w.session(w.ku10, 2);
    const body = { sessionId: s, playerId: w.ali, kind: "izin" };
    expect((await call("POST", "/guardian/absence-requests", w.admin, body)).status).toBe(403);
    expect((await call("POST", "/guardian/absence-requests", w.coachA.cookie, body)).status).toBe(403);
    expect((await call("GET", "/guardian/absence-requests", w.coachA.cookie)).status).toBe(403);
    expect((await call("POST", "/guardian/absence-requests", undefined, body)).status).toBe(401);
  });

  test("pelatih KU-nya melihat pengajuan di sesi itu; pelatih KU lain 404; orang tua tidak bisa membaca daftar pelatih", async () => {
    const w = await world("pelatih");
    const s = await w.session(w.ku10, 2);
    const other = await w.session(w.ku12, 2);
    const made = await json(await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, { sessionId: s, playerId: w.ali, kind: "sakit", note: "demam" }));
    await call("POST", "/guardian/absence-requests", w.ortuEko.cookie, { sessionId: other, playerId: w.eko, kind: "izin" });

    const seen = await json(await call("GET", `/sessions/${s}/absence-requests`, w.coachA.cookie));
    expect(seen).toEqual([{ id: made.id, playerId: w.ali, playerName: "Ali", kind: "sakit", note: "demam", createdAt: made.createdAt }]);
    // admin boleh melihat semua sesi
    expect((await json(await call("GET", `/sessions/${s}/absence-requests`, w.admin))).length).toBe(1);
    // pelatih KU-12 tidak bertugas di KU-10: sesinya tidak tampak, sama dengan absensi
    expect((await call("GET", `/sessions/${s}/absence-requests`, w.coachB.cookie)).status).toBe(404);
    expect((await call("GET", `/sessions/${s}/attendance`, w.coachB.cookie)).status).toBe(404);
    expect((await json(await call("GET", `/sessions/${other}/absence-requests`, w.coachB.cookie))).length).toBe(1);
    // orang tua dan tanpa login
    expect((await call("GET", `/sessions/${s}/absence-requests`, w.ortuAli.cookie)).status).toBe(403);
    expect((await call("GET", `/sessions/${s}/absence-requests`)).status).toBe(401);
    expect((await call("GET", "/sessions/bukan-uuid/absence-requests", w.coachA.cookie)).status).toBe(404);
    // SSB lain tidak melihat apa pun
    const x = await world("pelatihB");
    expect((await call("GET", `/sessions/${s}/absence-requests`, x.admin)).status).toBe(404);

    // absensi resmi tidak berubah: pengajuan tidak masuk ke daftar kehadiran
    const roster = await json(await call("GET", `/sessions/${s}/attendance`, w.coachA.cookie));
    expect(Object.keys(roster).sort()).toEqual(["players", "session"]);
    expect(roster.players.find((p: any) => p.playerId === w.ali).status).toBeNull();
  });

  test("pengajuan memberi tahu pelatih KU itu lewat push, bukan pelatih KU lain", async () => {
    const w = await world("push");
    const s = await w.session(w.ku10, 2);
    await settle();
    pusher.sent.length = 0;
    const res = await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, { sessionId: s, playerId: w.ali, kind: "izin", note: "acara keluarga" });
    expect(res.status).toBe(201);
    await settle();
    expect(pusher.sent).toHaveLength(1);
    expect(pusher.sent[0]!.accountIds).toEqual([w.coachA.accountId]);
    expect(pusher.sent[0]!.msg).toMatchObject({ type: "absence_request", title: "Pengajuan izin latihan", route: `/absensi/${s}` });
    expect(pusher.sent[0]!.msg.body).toContain("Ali izin");
    expect(pusher.sent[0]!.msg.body).toContain("acara keluarga");
  });

  test("menghapus sesi ikut menghapus pengajuannya", async () => {
    const w = await world("hapus");
    const s = await w.session(w.ku10, 2);
    const made = await json(await call("POST", "/guardian/absence-requests", w.ortuAli.cookie, { sessionId: s, playerId: w.ali, kind: "izin" }));
    expect((await call("DELETE", `/sessions/${s}`, w.admin)).status).toBe(204);
    expect(await json(await call("GET", "/guardian/absence-requests", w.ortuAli.cookie))).toEqual([]);
    expect(made.id).toBeTruthy();
  });
});
