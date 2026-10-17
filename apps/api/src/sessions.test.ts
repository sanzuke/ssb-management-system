import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

run("jadwal latihan dan absensi", () => {
  const { db, client } = createDb(url!);
  const app = createApp(db, { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) }, { google: null });
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const sessionOf = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("ssb_session="))!.split(";")[0]!;
  const json = async (res: Response) => (await res.json()) as any;

  /** SSB dengan KU-10 dan KU-12, periode berjalan, pelatih (ditugaskan ke KU-10), dan pemain di tiap KU. */
  async function world(tag: string) {
    const reg = await call("POST", "/auth/register-ssb", undefined, { ssbName: `S ${tag}`, slug: `s-${tag}-${uid}`, adminName: "Admin", email: `admin-${tag}-${uid}@uji.test`, password: PASS });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku10 = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id as string;
    const ku12 = (await json(await call("POST", "/age-groups", admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id as string;
    const period = (await json(await call("POST", "/periods", admin, { name: "Musim", startDate: iso(-60), endDate: iso(90) }))).id as string;
    const loc = (await json(await call("POST", "/locations", admin, { name: "Lapangan Utama" }))).id as string;
    const join = async (role: string) => {
      const inv = await json(await call("POST", "/invitations", admin, { role }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: role, email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`, password: PASS });
      const cookie = sessionOf(acc);
      return { cookie, userId: (await json(await call("GET", "/auth/me", cookie))).active.userId as string };
    };
    const pelatih = await join("pelatih");
    expect((await call("POST", "/assignments", admin, { userId: pelatih.userId, ageGroupId: ku10, periodId: period })).status).toBe(201);
    const mk = async (name: string, ageGroupId: string, status = "aktif") => (await json(await call("POST", "/players", admin, { fullName: name, birthDate: "2015-05-05", ageGroupId, status }))).id as string;
    const a1 = await mk("Ali", ku10);
    const a2 = await mk("Bima", ku10);
    const a3 = await mk("Cakra", ku10);
    const off = await mk("Dodo Keluar", ku10, "keluar");
    const b1 = await mk("Eko", ku12);
    return { ssbId, admin, ku10, ku12, period, loc, pelatih, a1, a2, a3, off, b1, join };
  }

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("admin menjadwalkan sesi; periode dan lokasi terisi, jam berformat HH:MM", async () => {
    const w = await world("buat");
    const r = await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(3), startTime: "16:00", locationId: w.loc });
    expect(r.status).toBe(201);
    const [s] = await json(r);
    expect(s).toMatchObject({ sessionDate: iso(3), startTime: "16:00", ageGroup: { name: "KU-10" }, location: { name: "Lapangan Utama" }, period: { name: "Musim" }, attendance: { hadir: 0, belum: 3 } });
    const noPeriod = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(300) }));
    expect(noPeriod[0].period).toBeNull();
    expect(noPeriod[0].startTime).toBeNull();
  });

  test("jadwal berulang mingguan membuat sesi di hari yang sama; tidak ganda; batas 100", async () => {
    const w = await world("ulang");
    const r = await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(1), startTime: "15:30", repeatUntil: iso(22) });
    expect(r.status).toBe(201);
    const list = await json(r);
    expect(list.map((s: any) => s.sessionDate)).toEqual([iso(1), iso(8), iso(15), iso(22)]);
    expect(new Set(list.map((s: any) => new Date(s.sessionDate).getUTCDay())).size).toBe(1);
    // tumpang tindih dengan sesi yang ada: seluruh permintaan ditolak, tidak ada yang tersimpan
    const dup = await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(8), startTime: "15:30", repeatUntil: iso(29) });
    expect(dup.status).toBe(409);
    expect((await json(await call("GET", `/sessions?from=${iso(29)}&to=${iso(29)}`, w.admin))).length).toBe(0);
    // jam berbeda boleh
    expect((await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(8), startTime: "18:00" })).status).toBe(201);
    expect((await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(1), repeatUntil: iso(800) })).status).toBe(422);
    expect((await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(10), repeatUntil: iso(2) })).status).toBe(400);
  });

  test("validasi: jam, tanggal, KU dan lokasi dari SSB lain", async () => {
    const w = await world("val");
    const other = await world("valB");
    const bad = await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: "2026-02-30", startTime: "25:00" });
    expect(bad.status).toBe(400);
    const f = (await json(bad)).error.fields;
    expect(f.sessionDate).toBeTruthy();
    expect(f.startTime).toBe("format jam HH:MM");
    expect((await json(await call("POST", "/sessions", w.admin, { ageGroupId: other.ku10, sessionDate: iso(2) }))).error.code).toBe("reference_invalid");
    expect((await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(2), locationId: other.loc }))).error.code).toBe("reference_invalid");
  });

  test("ubah dan hapus sesi; KU terkunci dan hapus ditolak bila sudah ada absensi", async () => {
    const w = await world("ubah");
    const [s] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(-1), startTime: "16:00" }));
    const upd = await call("PATCH", `/sessions/${s.id}`, w.admin, { ageGroupId: w.ku10, sessionDate: iso(-2), startTime: "17:00", locationId: w.loc });
    expect(await json(upd)).toMatchObject({ sessionDate: iso(-2), startTime: "17:00", location: { name: "Lapangan Utama" } });
    expect((await call("PUT", `/sessions/${s.id}/attendance`, w.admin, { entries: [{ playerId: w.a1, status: "hadir" }] })).status).toBe(200);
    const swap = await call("PATCH", `/sessions/${s.id}`, w.admin, { ageGroupId: w.ku12, sessionDate: iso(-2) });
    expect(swap.status).toBe(409);
    expect((await json(swap)).error.code).toBe("has_attendance");
    expect((await call("PATCH", `/sessions/${s.id}`, w.admin, { ageGroupId: w.ku10, sessionDate: iso(-3) })).status).toBe(200); // ganti tanggal tetap boleh
    expect((await call("DELETE", `/sessions/${s.id}`, w.admin)).status).toBe(409);
    const [kosong] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku12, sessionDate: iso(5) }));
    expect((await call("DELETE", `/sessions/${kosong.id}`, w.admin)).status).toBe(204);
    expect((await call("DELETE", `/sessions/${kosong.id}`, w.admin)).status).toBe(404);
    expect((await call("DELETE", "/sessions/bukan-uuid", w.admin)).status).toBe(404);
  });

  test("lokasi yang dipakai jadwal tidak bisa dihapus", async () => {
    const w = await world("lok");
    await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(2), locationId: w.loc });
    const del = await call("DELETE", `/locations/${w.loc}`, w.admin);
    expect(del.status).toBe(409);
    expect((await json(del)).error.code).toBe("in_use");
  });

  test("absensi massal: simpan, koreksi, ringkasan, dan roster tanpa pemain keluar", async () => {
    const w = await world("abs");
    const [s] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(0), startTime: "16:00" }));
    const first = await call("PUT", `/sessions/${s.id}/attendance`, w.pelatih.cookie, { entries: [{ playerId: w.a1, status: "hadir" }, { playerId: w.a2, status: "sakit", note: "demam" }] });
    expect(first.status).toBe(200);
    const roster = await json(first);
    expect(roster.players.map((p: any) => [p.fullName, p.status])).toEqual([["Ali", "hadir"], ["Bima", "sakit"], ["Cakra", null]]); // "Dodo Keluar" tidak muncul
    expect(roster.players[1].note).toBe("demam");
    expect(roster.session.attendance).toEqual({ hadir: 1, izin: 0, sakit: 1, alpa: 0, belum: 1 });
    // koreksi: Bima jadi izin, Cakra alpa; satu permintaan lagi
    const fix = await json(await call("PUT", `/sessions/${s.id}/attendance`, w.pelatih.cookie, { entries: [{ playerId: w.a2, status: "izin", note: null }, { playerId: w.a3, status: "alpa" }] }));
    expect(fix.session.attendance).toEqual({ hadir: 1, izin: 1, sakit: 0, alpa: 1, belum: 0 });
    expect(fix.players[1].note).toBeNull();
    // admin melihat ringkasan yang sama di daftar sesi
    expect((await json(await call("GET", "/sessions", w.admin)))[0].attendance.hadir).toBe(1);
  });

  test("absensi: pemain KU lain, duplikat, status salah, dan sesi yang belum berlangsung ditolak", async () => {
    const w = await world("tolak");
    const [s] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(0) }));
    const put = (entries: unknown) => call("PUT", `/sessions/${s.id}/attendance`, w.pelatih.cookie, { entries });
    expect((await json(await put([{ playerId: w.b1, status: "hadir" }]))).error.code).toBe("player_not_in_group");
    expect((await json(await put([{ playerId: w.a1, status: "hadir" }, { playerId: w.a1, status: "izin" }]))).error.code).toBe("duplicate_player");
    expect((await put([{ playerId: w.a1, status: "bolos" }])).status).toBe(400);
    expect((await put([])).status).toBe(400);
    expect((await json(await put([{ playerId: randomUUID(), status: "hadir" }]))).error.code).toBe("player_not_in_group");
    const [future] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(10) }));
    const early = await call("PUT", `/sessions/${future.id}/attendance`, w.pelatih.cookie, { entries: [{ playerId: w.a1, status: "hadir" }] });
    expect(early.status).toBe(422);
    expect((await json(early)).error.code).toBe("session_not_started");
    // gagal tidak menyimpan apa pun
    expect((await json(await call("GET", `/sessions/${s.id}/attendance`, w.admin))).players.every((p: any) => p.status === null)).toBe(true);
  });

  test("batas role: pelatih hanya KU yang ditugaskan; orang tua dan tanpa sesi ditolak", async () => {
    const w = await world("role");
    const [s10] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(0) }));
    const [s12] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku12, sessionDate: iso(0) }));
    const list = await json(await call("GET", "/sessions", w.pelatih.cookie));
    expect(list.map((s: any) => s.id)).toEqual([s10.id]);
    expect((await call("GET", `/sessions/${s12.id}/attendance`, w.pelatih.cookie)).status).toBe(404);
    expect((await call("PUT", `/sessions/${s12.id}/attendance`, w.pelatih.cookie, { entries: [{ playerId: w.b1, status: "hadir" }] })).status).toBe(404);
    expect((await call("POST", "/sessions", w.pelatih.cookie, { ageGroupId: w.ku10, sessionDate: iso(4) })).status).toBe(403);
    expect((await call("PATCH", `/sessions/${s10.id}`, w.pelatih.cookie, { ageGroupId: w.ku10, sessionDate: iso(4) })).status).toBe(403);
    expect((await call("DELETE", `/sessions/${s10.id}`, w.pelatih.cookie)).status).toBe(403);
    // admin boleh mengisi KU mana pun
    expect((await call("PUT", `/sessions/${s12.id}/attendance`, w.admin, { entries: [{ playerId: w.b1, status: "hadir" }] })).status).toBe(200);
    const ortu = await w.join("orang_tua");
    expect((await call("GET", "/sessions", ortu.cookie)).status).toBe(403);
    expect((await call("GET", `/sessions/${s10.id}/attendance`, ortu.cookie)).status).toBe(404);
    expect((await call("PUT", `/sessions/${s10.id}/attendance`, ortu.cookie, { entries: [{ playerId: w.a1, status: "hadir" }] })).status).toBe(403);
    expect((await call("GET", "/sessions")).status).toBe(401);
    // pelatih lain tanpa penugasan: daftar kosong
    const lain = await w.join("pelatih");
    expect(await json(await call("GET", "/sessions", lain.cookie))).toEqual([]);
  });

  test("pencatat yang keanggotaannya dihapus: absensi tetap ada, pencatat dikosongkan", async () => {
    const w = await world("hapus");
    const [s] = await json(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(0) }));
    expect((await call("PUT", `/sessions/${s.id}/attendance`, w.pelatih.cookie, { entries: [{ playerId: w.a1, status: "hadir" }] })).status).toBe(200);
    await withTenant(db, w.ssbId, async (tx) => {
      const before = await tx.select().from(schema.attendance).where(eq(schema.attendance.sessionId, s.id));
      expect(before[0]!.recordedBy).toBe(w.pelatih.userId);
      await tx.delete(schema.appUser).where(eq(schema.appUser.id, w.pelatih.userId));
      const after = await tx.select().from(schema.attendance).where(eq(schema.attendance.sessionId, s.id));
      expect(after).toHaveLength(1);
      expect(after[0]!.recordedBy).toBeNull();
      expect(after[0]!.ssbId).toBe(w.ssbId);
    });
  });

  test("isolasi tenant dan filter tanggal/KU", async () => {
    const a = await world("isoA");
    const b = await world("isoB");
    await call("POST", "/sessions", a.admin, { ageGroupId: a.ku10, sessionDate: iso(1) });
    await call("POST", "/sessions", a.admin, { ageGroupId: a.ku12, sessionDate: iso(2) });
    const [sa] = await json(await call("GET", `/sessions?ageGroupId=${a.ku12}`, a.admin));
    expect(sa.sessionDate).toBe(iso(2));
    expect((await json(await call("GET", `/sessions?from=${iso(2)}`, a.admin))).length).toBe(1);
    expect(await json(await call("GET", "/sessions", b.admin))).toEqual([]);
    expect((await call("GET", `/sessions/${sa.id}/attendance`, b.admin)).status).toBe(404);
    expect((await call("DELETE", `/sessions/${sa.id}`, b.admin)).status).toBe(404);
    expect((await call("GET", "/sessions?from=kemarin", a.admin)).status).toBe(400);
  });
  test("rekap kehadiran: persentase per pemain dan per periode, KU, dan batas role", async () => {
    const w = await world("rekap");
    const period2 = (await json(await call("POST", "/periods", w.admin, { name: "Musim lalu", startDate: iso(-200), endDate: iso(-100) }))).id as string;
    const mkSession = async (ageGroupId: string, offset: number) => (await json(await call("POST", "/sessions", w.admin, { ageGroupId, sessionDate: iso(offset) })))[0].id as string;
    const rec = async (sid: string, entries: { playerId: string; status: string }[]) => expect((await call("PUT", `/sessions/${sid}/attendance`, w.admin, { entries })).status).toBe(200);
    const [s1, s2, s3, s4] = [await mkSession(w.ku10, -3), await mkSession(w.ku10, -2), await mkSession(w.ku10, -1), await mkSession(w.ku10, 0)];
    const old = await mkSession(w.ku10, -150);
    const s12 = await mkSession(w.ku12, -1);
    await mkSession(w.ku10, 1); // sesi tanpa catatan tidak dihitung
    await rec(s1, [{ playerId: w.a1, status: "hadir" }, { playerId: w.a2, status: "hadir" }]);
    await rec(s2, [{ playerId: w.a1, status: "hadir" }, { playerId: w.a2, status: "hadir" }]);
    await rec(s3, [{ playerId: w.a1, status: "izin" }, { playerId: w.a2, status: "hadir" }, { playerId: w.off, status: "sakit" }]);
    await rec(s4, [{ playerId: w.a1, status: "alpa" }]); // Bima tidak tercatat
    await rec(old, [{ playerId: w.a1, status: "hadir" }]);
    await rec(s12, [{ playerId: w.b1, status: "hadir" }]);
    const by = (r: any, id: string) => r.players.find((p: any) => p.playerId === id);

    const cur = await json(await call("GET", `/attendance/summary?periodId=${w.period}&ageGroupId=${w.ku10}`, w.admin));
    expect(cur.sessionsHeld).toBe(4);
    expect(cur.period.name).toBe("Musim");
    expect(cur.ageGroup.name).toBe("KU-10");
    expect(by(cur, w.a1)).toMatchObject({ hadir: 2, izin: 1, sakit: 0, alpa: 1, recorded: 4, percent: 50 });
    expect(by(cur, w.a2)).toMatchObject({ hadir: 3, recorded: 3, percent: 100 });
    expect(by(cur, w.a3)).toMatchObject({ recorded: 0, percent: null }); // aktif tapi belum ada catatan
    expect(by(cur, w.off)).toMatchObject({ sakit: 1, recorded: 1, percent: 0 }); // keluar, tapi punya catatan
    expect(by(cur, w.b1)).toBeUndefined();

    const prev = await json(await call("GET", `/attendance/summary?periodId=${period2}&ageGroupId=${w.ku10}`, w.admin));
    expect(prev.sessionsHeld).toBe(1);
    expect(by(prev, w.a1)).toMatchObject({ hadir: 1, recorded: 1, percent: 100 });
    expect(by(prev, w.a2)).toMatchObject({ recorded: 0, percent: null });
    expect(by(prev, w.off)).toBeUndefined(); // keluar dan tanpa catatan di periode ini

    const all = await json(await call("GET", "/attendance/summary", w.admin));
    expect(all.period).toBeNull();
    expect(all.sessionsHeld).toBe(6);
    expect(by(all, w.a1)).toMatchObject({ hadir: 3, recorded: 5, percent: 60 });
    expect(by(all, w.b1)).toMatchObject({ recorded: 1, percent: 100 });

    // pelatih: hanya KU yang ditugaskan
    const pel = await json(await call("GET", `/attendance/summary?periodId=${w.period}`, w.pelatih.cookie));
    expect(pel.players.map((p: any) => p.playerId).sort()).toEqual([w.a1, w.a2, w.a3, w.off].sort());
    expect(pel.sessionsHeld).toBe(4);
    expect((await json(await call("GET", `/attendance/summary?ageGroupId=${w.ku12}`, w.pelatih.cookie))).players).toEqual([]);
    const lain = await w.join("pelatih");
    expect((await json(await call("GET", "/attendance/summary", lain.cookie))).players).toEqual([]);

    // orang tua: hanya anaknya
    const inv = await json(await call("POST", "/invitations", w.admin, { role: "orang_tua", playerId: w.a1 }));
    const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: "Ortu Ali", email: `ortu-rekap-${uid}@uji.test`, password: PASS });
    expect(acc.status).toBe(201);
    const ortu = await json(await call("GET", `/attendance/summary?periodId=${w.period}`, sessionOf(acc)));
    expect(ortu.players.map((p: any) => p.playerId)).toEqual([w.a1]);
    expect(ortu.players[0].percent).toBe(50);
    expect(ortu.sessionsHeld).toBe(4);

    // validasi, isolasi tenant, tanpa login
    expect((await call("GET", "/attendance/summary?periodId=bukan-uuid", w.admin)).status).toBe(400);
    const other = await world("rekapB");
    expect((await call("GET", `/attendance/summary?periodId=${w.period}`, other.admin)).status).toBe(404);
    expect((await json(await call("GET", "/attendance/summary", other.admin))).players.every((p: any) => p.recorded === 0)).toBe(true);
    expect((await call("GET", "/attendance/summary")).status).toBe(401);
  });

});
