import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import type { MatchStatRow, MviPlayerView, MviRanking, MviResult, PhysicalTestRow } from "@ssb/shared";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;
const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

type Id = { id: string };
type ApiErr = { error: { code: string; message: string; fields?: Record<string, string> } };
interface Member {
  cookie: string;
  userId: string;
}
interface World {
  ssbId: string;
  admin: string;
  ku10: string;
  ku12: string;
  period: string;
  pelatih: Member;
  korlas: Member;
  ali: string;
  bima: string;
  citra: string;
  dedi: string;
  eko: string;
  fani: string;
  luar: string;
  indikator: Id[];
  join: (role: string, playerId?: string) => Promise<Member>;
}

run("indeks nilai pemain (database)", () => {
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
  const json = async <T = unknown>(res: Response): Promise<T> => (await res.json()) as T;
  const fields = async (res: Response) => (await json<ApiErr>(res)).error.fields;

  /** Satu SSB: KU-10 (9 sampai 10 tahun) dan KU-12, periode berjalan, pelatih dan korlas KU-10, dan enam siswa KU-10. */
  async function world(tag: string): Promise<World> {
    const reg = await call("POST", "/auth/register-ssb", undefined, { ssbName: `MV ${tag}`, slug: `mv-${tag}-${uid}`, adminName: "Admin", email: `admin-${tag}-${uid}@uji.test`, password: PASS });
    expect(reg.status).toBe(201);
    const ssbId = (await json<{ ssbId: string }>(reg)).ssbId;
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const buat = async (path: string, body: unknown) => (await json<Id>(await call("POST", path, admin, body))).id;
    const ku10 = await buat("/age-groups", { name: "KU-10", minAge: 9, maxAge: 10 });
    const ku12 = await buat("/age-groups", { name: "KU-12", minAge: 11, maxAge: 12 });
    const period = await buat("/periods", { name: "Semester 1", startDate: iso(-90), endDate: iso(60) });
    const join = async (role: string, playerId?: string): Promise<Member> => {
      const inv = await json<{ token: string }>(await call("POST", "/invitations", admin, { role, ...(playerId ? { playerId } : {}) }));
      const acc = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: role, email: `${role}-${randomUUID().slice(0, 6)}-${uid}@uji.test`, password: PASS });
      expect(acc.status).toBe(201);
      const cookie = sessionOf(acc);
      const me = await json<{ active: { userId: string } }>(await call("GET", "/auth/me", cookie));
      return { cookie, userId: me.active.userId };
    };
    const pelatih = await join("pelatih");
    const korlas = await join("korlas");
    for (const u of [pelatih, korlas]) expect((await call("POST", "/assignments", admin, { userId: u.userId, ageGroupId: ku10, periodId: period })).status).toBe(201);
    // Ali berusia sekitar 9,5 tahun: tepat di tengah KU-10, jadi skor usia relatif 75.
    const lahir = iso(-Math.round(9.5 * 365.2425));
    const siswa = (fullName: string, ageGroupId: string, birthDate = lahir) => buat("/players", { fullName, birthDate, ageGroupId, position: "FW" });
    const [ali, bima, citra, dedi, eko, fani] = await Promise.all(["Ali", "Bima", "Citra", "Dedi", "Eko", "Fani"].map((n) => siswa(n, ku10)));
    const luar = await siswa("Gita", ku12, "2014-03-03");
    const indikator = await json<Id[]>(await call("POST", "/assessment-indicators/defaults", admin, { ageGroupId: ku10 }));
    return { ssbId, admin, ku10, ku12, period, pelatih, korlas, ali: ali!, bima: bima!, citra: citra!, dedi: dedi!, eko: eko!, fani: fani!, luar, indikator, join };
  }

  /** Semua indikator KU-10 bernilai `skor` untuk satu siswa, sehingga rata-ratanya persis `skor`. */
  const nilai = (w: World, playerId: string, skor: number) =>
    call("PUT", `/players/${playerId}/assessments/${w.period}`, w.pelatih.cookie, { scores: w.indikator.map((i) => ({ indicatorId: i.id, score: skor })) });
  const hitung = (w: World, cookie = w.pelatih.cookie) => call("POST", "/market-value/compute", cookie, { ageGroupId: w.ku10, periodId: w.period });
  const baris = (r: MviRanking, id: string) => r.rows.find((x) => x.playerId === id)!;
  const stat = (w: World, playerId: string, body: unknown) => call("PUT", `/players/${playerId}/match-stats/${w.period}`, w.pelatih.cookie, body);
  const laga = (matchesPlayed: number, goals: number, assists: number, starts = matchesPlayed) => ({ matchesPlayed, goals, assists, starts, yellowCards: 0, redCards: 0 });
  /** Rincian indeks yang dilihat staf; gagal bila ternyata tampilan orang tua. */
  const rincian = async (w: World, playerId: string): Promise<MviResult[]> => {
    const v = await json<MviPlayerView>(await call("GET", `/players/${playerId}/market-value`, w.pelatih.cookie));
    if (v.role !== "staff") throw new Error("diharapkan tampilan staf");
    return v.items;
  };

  afterAll(async () => {
    for (const id of ssbIds) await withTenant(db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await client.end();
  });

  test("batas peran: staf menulis hanya untuk KU-nya, korlas hanya membaca, orang tua dan tamu tidak boleh", async () => {
    const w = await world("izin");
    const ortu = await w.join("orang_tua", w.ali);
    const tes = { testedOn: iso(-3), verticalJump: 30 };

    // Tamu
    expect((await call("GET", `/market-value?ageGroupId=${w.ku10}&periodId=${w.period}`)).status).toBe(401);
    expect((await call("POST", "/market-value/compute", undefined, { ageGroupId: w.ku10, periodId: w.period })).status).toBe(401);
    // Orang tua: tidak ada akses tulis atau peringkat, dan tidak melihat data mentah.
    expect((await hitung(w, ortu.cookie)).status).toBe(403);
    expect((await call("GET", `/market-value?ageGroupId=${w.ku10}&periodId=${w.period}`, ortu.cookie)).status).toBe(403);
    expect((await call("PUT", `/players/${w.ali}/match-stats/${w.period}`, ortu.cookie, laga(5, 1, 0))).status).toBe(403);
    expect((await call("GET", `/players/${w.ali}/match-stats`, ortu.cookie)).status).toBe(403);
    expect((await call("POST", `/players/${w.ali}/physical-tests`, ortu.cookie, tes)).status).toBe(403);
    expect((await call("GET", `/players/${w.ali}/physical-tests`, ortu.cookie)).status).toBe(403);
    // Korlas membaca, tidak menulis.
    expect((await hitung(w, w.korlas.cookie)).status).toBe(403);
    expect((await call("PUT", `/players/${w.ali}/match-stats/${w.period}`, w.korlas.cookie, laga(5, 1, 0))).status).toBe(403);
    expect((await call("GET", `/players/${w.ali}/match-stats`, w.korlas.cookie)).status).toBe(200);
    expect((await call("GET", `/market-value?ageGroupId=${w.ku10}&periodId=${w.period}`, w.korlas.cookie)).status).toBe(200);
    // Pelatih KU-10: boleh untuk KU-10, tidak untuk siswa KU lain (tampak seperti tidak ada).
    expect((await stat(w, w.ali, laga(5, 1, 0))).status).toBe(200);
    expect((await stat(w, w.luar, laga(5, 1, 0))).status).toBe(404);
    expect((await call("POST", `/players/${w.luar}/physical-tests`, w.pelatih.cookie, tes)).status).toBe(404);
    expect((await json<MviRanking>(await call("GET", `/market-value?ageGroupId=${w.ku12}&periodId=${w.period}`, w.pelatih.cookie))).rows).toEqual([]);
    expect((await call("POST", "/market-value/compute", w.pelatih.cookie, { ageGroupId: w.ku12, periodId: w.period })).status).toBe(200);
    expect((await call("GET", `/players/${w.luar}/market-value`, w.pelatih.cookie)).status).toBe(404);
    // Admin untuk semua.
    expect((await call("PUT", `/players/${w.luar}/match-stats/${w.period}`, w.admin, laga(5, 1, 0))).status).toBe(200);
  });

  test("isian ditolak dengan pesan per kolom; statistik diganti seluruhnya; satu hasil tes per tanggal", async () => {
    const w = await world("isian");
    const put = (body: unknown, periodId = w.period) => call("PUT", `/players/${w.ali}/match-stats/${periodId}`, w.pelatih.cookie, body);

    expect(await fields(await put({ matchesPlayed: 4, goals: 0, assists: 0, starts: 5, yellowCards: 0, redCards: 0 }))).toEqual({ starts: "tidak boleh melebihi jumlah laga" });
    expect(await fields(await put({ matchesPlayed: 4, goals: 0, assists: 0, starts: 4, yellowCards: 5, redCards: 6 }))).toEqual({
      yellowCards: "tidak boleh melebihi jumlah laga",
      redCards: "tidak boleh melebihi jumlah laga",
    });
    expect((await put({ matchesPlayed: -1, goals: 0, assists: 0, starts: 0, yellowCards: 0, redCards: 0 })).status).toBe(400);
    expect((await put({ matchesPlayed: 2.5, goals: 0, assists: 0, starts: 0, yellowCards: 0, redCards: 0 })).status).toBe(400);
    expect((await put(laga(4, 1, 0), randomUUID())).status).toBe(404);

    const satu = await put({ matchesPlayed: 4, goals: 1, assists: 2, starts: 3, yellowCards: 1, redCards: 0 });
    expect(await json<MatchStatRow>(satu)).toMatchObject({ periodId: w.period, matchesPlayed: 4, goals: 1, assists: 2, starts: 3, yellowCards: 1 });
    await put(laga(6, 2, 0));
    const daftar = await json<MatchStatRow[]>(await call("GET", `/players/${w.ali}/match-stats`, w.pelatih.cookie));
    expect(daftar).toHaveLength(1);
    expect(daftar[0]).toMatchObject({ matchesPlayed: 6, goals: 2, assists: 0, yellowCards: 0 });

    const tes = (body: unknown) => call("POST", `/players/${w.ali}/physical-tests`, w.pelatih.cookie, body);
    expect(await fields(await tes({ testedOn: iso(-1) }))).toEqual({ speed30m: "isi minimal satu hasil tes" });
    expect(await fields(await tes({ testedOn: iso(-1), speed30m: 1.2 }))).toEqual({ speed30m: "minimal 3" });
    expect(await fields(await tes({ testedOn: iso(-1), verticalJump: 250 }))).toEqual({ verticalJump: "maksimal 100" });
    expect(await fields(await tes({ testedOn: iso(40), verticalJump: 30 }))).toEqual({ testedOn: "tidak boleh di masa depan" });
    const ok = await tes({ testedOn: iso(-5), speed30m: 5.5, bleepLevel: 7.5, note: "Lapangan basah" });
    expect(ok.status).toBe(201);
    expect(await json<PhysicalTestRow>(ok)).toMatchObject({ speed30m: 5.5, zigZag: null, verticalJump: null, bleepLevel: 7.5, note: "Lapangan basah" });
    const ganda = await tes({ testedOn: iso(-5), verticalJump: 30 });
    expect(ganda.status).toBe(409);
    expect(await fields(ganda)).toEqual({ testedOn: "sudah ada hasil tes pada tanggal ini" });
    expect(await json<PhysicalTestRow[]>(await call("GET", `/players/${w.ali}/physical-tests`, w.korlas.cookie))).toHaveLength(1);
  });

  test("hasil dihitung dari data yang ada: skenario lengkap bernilai tepat, dan data kurang tidak diberi indeks", async () => {
    const w = await world("hitung");

    // Tanpa data apa pun: tidak ada indeks, hanya usia yang terisi, dan siswa tetap muncul di peringkat.
    const kosong = await json<MviRanking>(await hitung(w));
    expect(kosong.rows).toHaveLength(6);
    expect(kosong.rows.every((r) => r.mvi === null && r.category === null)).toBe(true);
    expect(baris(kosong, w.ali)).toMatchObject({ coverage: 10, kurang: ["penilaian", "performa", "fisik", "kehadiran"] });

    // Penilaian saja belum cukup: butuh performa laga atau kebugaran juga.
    expect((await nilai(w, w.ali, 8)).status).toBe(200);
    expect(baris(await json<MviRanking>(await hitung(w)), w.ali)).toMatchObject({ mvi: null, category: null });

    // Statistik laga: 10 laga, 5 gol+assist (penyerang) => performa 75.
    expect((await stat(w, w.ali, laga(10, 4, 1))).status).toBe(200);
    // Kehadiran: 5 sesi, 4 hadir => 80. POST /sessions mengembalikan daftar sesi yang dibuat.
    for (let i = 1; i <= 5; i++) {
      const [sesi] = await json<Id[]>(await call("POST", "/sessions", w.admin, { ageGroupId: w.ku10, sessionDate: iso(-i * 3) }));
      const res = await call("PUT", `/sessions/${sesi!.id}/attendance`, w.pelatih.cookie, { entries: [{ playerId: w.ali, status: i === 5 ? "alpa" : "hadir" }] });
      expect(res.status).toBe(200);
    }
    // Kebugaran: lompat 20, 25, 30, 35, 40 cm pada lima siswa; Ali 40 cm => peringkat 90.
    const lompat: [string, number][] = [[w.bima, 20], [w.citra, 25], [w.dedi, 30], [w.eko, 35], [w.ali, 40]];
    for (const [id, cm] of lompat) expect((await call("POST", `/players/${id}/physical-tests`, w.pelatih.cookie, { testedOn: iso(-10), verticalJump: cm })).status).toBe(201);

    const r = await json<MviRanking>(await hitung(w));
    // (80*35 + 75*25 + 90*20 + 80*10 + 75*10) / 100 = 80,25 => 80
    expect(baris(r, w.ali)).toMatchObject({ mvi: 80, category: "Sangat Baik", coverage: 100, kurang: [] });
    const hasil = (await rincian(w, w.ali))[0]!;
    expect(hasil).toMatchObject({ mvi: 80, category: "Sangat Baik", coverage: 100, period: { name: "Semester 1" }, ageGroup: { name: "KU-10" } });
    const skor = Object.fromEntries(hasil.components.map((c) => [c.key, c.score]));
    expect([skor.penilaian, skor.performa, skor.fisik, skor.kehadiran]).toEqual([80, 75, 90, 80]);
    expect(skor.usia).toBeCloseTo(75, 0);
    expect(hasil.components.map((c) => c.weight)).toEqual([35, 25, 20, 10, 10]);
    expect(hasil.components.find((c) => c.key === "kehadiran")!.detail).toBe("Hadir 4 dari 5 sesi");

    // Siswa yang hanya punya tes (tanpa penilaian) tetap tanpa indeks; peringkat menaruh yang berindeks di atas.
    expect(baris(r, w.bima)).toMatchObject({ mvi: null, coverage: 30, kurang: ["penilaian", "performa", "kehadiran"] });
    expect(r.rows[0]!.playerId).toBe(w.ali);
    expect(r.rows.slice(1).every((x) => x.mvi === null)).toBe(true);
    expect(r.rows.map((x) => x.playerId)).not.toContain(w.luar);

    // Hitung ulang mengganti hasil lama (tetap satu baris per siswa dan periode).
    await stat(w, w.ali, laga(10, 0, 0, 0));
    const lagi = await json<MviRanking>(await hitung(w));
    expect(baris(lagi, w.ali).mvi).toBeLessThan(80);
    // Dibaca dalam konteks tenant: tanpa konteks, RLS tidak menampilkan baris apa pun.
    const tersimpan = await withTenant(db, w.ssbId, (tx) => tx.select().from(schema.playerMarketValue).where(eq(schema.playerMarketValue.playerId, w.ali)));
    expect(tersimpan).toHaveLength(1);
  });

  test("tes kedaluwarsa tidak dihitung, dan kebugaran butuh minimal lima teman yang punya hasil", async () => {
    const w = await world("fisik");
    expect((await nilai(w, w.fani, 7)).status).toBe(200);
    expect((await stat(w, w.fani, laga(5, 0, 0))).status).toBe(200);
    // Tes dua tahun lalu: di luar 12 bulan sebelum akhir periode.
    expect((await call("POST", `/players/${w.fani}/physical-tests`, w.pelatih.cookie, { testedOn: iso(-730), verticalJump: 50 })).status).toBe(201);
    expect(await rincian(w, w.fani)).toEqual([]);
    await hitung(w);
    const lama = (await rincian(w, w.fani))[0]!.components.find((c) => c.key === "fisik")!;
    expect(lama.score).toBeNull();
    expect(lama.detail).toContain("Belum ada tes");

    // Tes baru, tetapi baru dua siswa yang punya hasil: terlalu sedikit teman, komponen tetap kosong.
    await call("POST", `/players/${w.fani}/physical-tests`, w.pelatih.cookie, { testedOn: iso(-2), verticalJump: 50 });
    await call("POST", `/players/${w.bima}/physical-tests`, w.pelatih.cookie, { testedOn: iso(-2), verticalJump: 30 });
    await hitung(w);
    const sedikit = (await rincian(w, w.fani))[0]!.components.find((c) => c.key === "fisik")!;
    expect([sedikit.score, sedikit.detail]).toEqual([null, `Tes ${iso(-2)} ada, tetapi teman satu KU yang punya hasil sama kurang dari 5`]);
  });

  test("orang tua hanya melihat kategori anaknya, setelah penilaian terbit; tidak pernah angka atau rincian", async () => {
    const w = await world("ortu");
    await nilai(w, w.ali, 9);
    await stat(w, w.ali, laga(10, 6, 2));
    const r = await json<MviRanking>(await hitung(w));
    expect(baris(r, w.ali).mvi).not.toBeNull();
    const kategori = baris(r, w.ali).category;

    const ortu = await w.join("orang_tua", w.ali);
    const lain = await w.join("orang_tua", w.bima);
    const lihat = (cookie: string, id = w.ali) => call("GET", `/players/${id}/market-value`, cookie);

    // Sebelum terbit: kosong.
    expect(await json(await lihat(ortu.cookie))).toEqual({ role: "guardian", items: [] });
    // Setelah terbit: hanya periode dan kategori.
    expect((await call("POST", `/players/${w.ali}/assessments/${w.period}/publish`, w.admin)).status).toBe(200);
    const sesudah = await json(await lihat(ortu.cookie));
    expect(sesudah).toEqual({ role: "guardian", items: [{ period: { id: w.period, name: "Semester 1" }, category: kategori }] });
    expect(JSON.stringify(sesudah)).not.toMatch(/mvi|coverage|components|score|detail/);
    // Orang tua anak lain, lalu tarik terbit.
    expect((await lihat(lain.cookie)).status).toBe(404);
    expect((await call("DELETE", `/players/${w.ali}/assessments/${w.period}/publish`, w.admin)).status).toBe(200);
    expect(await json(await lihat(ortu.cookie))).toEqual({ role: "guardian", items: [] });
    // Staf melihat angka dan rincian.
    const staf = await rincian(w, w.ali);
    expect(staf[0]).toMatchObject({ mvi: expect.any(Number), category: kategori });
    expect(staf[0]!.components).toHaveLength(5);
  });

  test("hapus hasil tes: staf KU-nya saja; SSB lain tidak melihat atau mengubah apa pun", async () => {
    const a = await world("isoA");
    const b = await world("isoB");
    const tes = await json<PhysicalTestRow>(await call("POST", `/players/${a.ali}/physical-tests`, a.pelatih.cookie, { testedOn: iso(-4), zigZag: 15 }));
    await nilai(a, a.ali, 8);
    await stat(a, a.ali, laga(5, 1, 0));
    await hitung(a);

    // SSB lain.
    expect((await call("GET", `/players/${a.ali}/market-value`, b.admin)).status).toBe(404);
    expect((await call("GET", `/players/${a.ali}/physical-tests`, b.admin)).status).toBe(404);
    expect((await call("PUT", `/players/${a.ali}/match-stats/${a.period}`, b.admin, laga(1, 0, 0))).status).toBe(404);
    expect((await call("DELETE", `/physical-tests/${tes.id}`, b.admin)).status).toBe(404);
    expect((await call("POST", "/market-value/compute", b.admin, { ageGroupId: a.ku10, periodId: a.period })).status).toBe(404);
    expect((await call("GET", `/market-value?ageGroupId=${a.ku10}&periodId=${b.period}`, b.admin)).status).toBe(404);
    const milikB = await json<MviRanking>(await call("GET", `/market-value?ageGroupId=${b.ku10}&periodId=${b.period}`, b.admin));
    expect(milikB.rows.every((x) => x.mvi === null)).toBe(true);

    // Peran dan batas KU.
    const ortu = await a.join("orang_tua", a.ali);
    expect((await call("DELETE", `/physical-tests/${tes.id}`, ortu.cookie)).status).toBe(403);
    expect((await call("DELETE", `/physical-tests/${tes.id}`, a.korlas.cookie)).status).toBe(403);
    expect((await call("DELETE", "/physical-tests/bukan-uuid", a.admin)).status).toBe(404);
    expect((await call("DELETE", `/physical-tests/${tes.id}`, a.pelatih.cookie)).status).toBe(204);
    expect((await call("DELETE", `/physical-tests/${tes.id}`, a.pelatih.cookie)).status).toBe(404);
    expect(await json<PhysicalTestRow[]>(await call("GET", `/players/${a.ali}/physical-tests`, a.admin))).toEqual([]);
  });
});
