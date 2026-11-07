import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { emptySiteContent, type SiteContent, type SitePublicView, type TrialConvertResult, type TrialRow } from "@ssb/shared";
import { createApp } from "./app";
import { createLogger } from "./logger";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("program dari KU dan konversi pendaftar trial menjadi siswa", () => {
  const { db, client } = createDb(url!);
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40) },
    { google: null, logger: createLogger({}) },
  );
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];

  const call = (method: string, path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const json = async <T = any>(res: Response | Promise<Response>): Promise<T> => (await (await res).json()) as T;
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;

  let ip = 0;
  const postTrial = (slug: string, body: object) =>
    call(
      "POST",
      `/public/site/${slug}/trial`,
      undefined,
      {
        childName: "Raffaza Haris",
        birthDate: "2015-06-12",
        gender: "Putra",
        parentName: "Hendra Gunawan",
        phone: "+62 812-3456-7890",
        commitmentAccepted: true,
        ...body,
      },
      { "x-real-ip": `10.1.0.${++ip}` },
    );

  async function world(tag: string, program: SiteContent["programs"] = []) {
    const slug = `tk-${tag}-${uid}`;
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `TK ${tag}`,
      slug,
      adminName: "Admin",
      email: `admin-${tag}-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    ssbIds.push((await json(reg)).ssbId);
    const admin = sessionOf(reg);
    const ku8 = (await json(call("POST", "/age-groups", admin, { name: "KU-8", minAge: 7, maxAge: 8 }))).id as string;
    const ku10 = (await json(call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id as string;
    expect((await call("PUT", "/site", admin, { ...emptySiteContent(`TK ${tag}`), programs: program })).status).toBe(200);
    expect((await call("POST", "/site/publish", admin)).status).toBe(200);
    return { admin, slug, ku8, ku10 };
  }
  const publik = async (slug: string) => (await json<SitePublicView>(call("GET", `/public/site/${slug}`))).content.programs;

  afterAll(async () => {
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("program di landing mengikuti KU di Data master; program buatan admin menimpa teks dan rentang tetap dari master", async () => {
    const w = await world("prog");
    const awal = await publik(w.slug);
    expect(awal.map((p) => [p.code, p.ageRange.id, p.ageGroupId])).toEqual([
      ["KU-8", "Usia 7 sampai 8 tahun", w.ku8],
      ["KU-10", "Usia 9 sampai 10 tahun", w.ku10],
    ]);

    // Admin menimpa teks KU-10 dan menambah satu program lepas; rentang usia yang diketik admin diabaikan.
    const buatan = (id: string, extra: object) => ({
      id,
      code: "X",
      name: { id: "Nama" },
      ageRange: { id: "salah" },
      focus: { id: "F" },
      schedule: { id: "S" },
      curriculum: [],
      hasScholarship: false,
      ...extra,
    });
    expect(
      (
        await call("PUT", "/site", w.admin, {
          ...emptySiteContent("TK"),
          programs: [
            buatan("bintang", { ageGroupId: w.ku10, name: { id: "Bintang Muda" } }),
            buatan("beasiswa", {}),
            buatan("hantu", { ageGroupId: randomUUID() }),
          ],
        })
      ).status,
    ).toBe(200);
    await call("POST", "/site/publish", w.admin);
    expect((await publik(w.slug)).map((p) => [p.id, p.name.id, p.ageRange.id])).toEqual([
      [awal[0]!.id, "Pembinaan sepak bola", "Usia 7 sampai 8 tahun"],
      ["bintang", "Bintang Muda", "Usia 9 sampai 10 tahun"],
      ["beasiswa", "Nama", "salah"], // tanpa tautan: apa adanya; yang tertaut ke KU yang tidak ada dibuang
    ]);

    // KU baru langsung muncul, KU yang dihapus langsung hilang, tanpa menerbitkan ulang.
    const ku12 = (await json(call("POST", "/age-groups", w.admin, { name: "KU-12", minAge: 11, maxAge: 12 }))).id as string;
    expect((await publik(w.slug)).some((p) => p.ageGroupId === ku12)).toBe(true);
    expect((await call("DELETE", `/age-groups/${ku12}`, w.admin)).status).toBe(204);
    expect((await publik(w.slug)).some((p) => p.ageGroupId === ku12)).toBe(false);
  });

  test("pendaftaran menyimpan KU yang dipilih; id KU yang tidak dikenal atau milik SSB lain diabaikan", async () => {
    const a = await world("a");
    const b = await world("b");
    const dipilih = await postTrial(a.slug, { ageGroupId: a.ku10 });
    expect(dipilih.status).toBe(201);
    expect((await postTrial(a.slug, { ageGroupId: randomUUID(), childName: "Acak Satu" })).status).toBe(201);
    expect((await postTrial(a.slug, { ageGroupId: b.ku10, childName: "Asing Dua" })).status).toBe(201); // KU SSB lain
    expect((await postTrial(a.slug, { ageGroupId: "bukan-uuid", childName: "Salah Tiga" })).status).toBe(400);

    const daftar = await json<TrialRow[]>(call("GET", "/trials", a.admin));
    const per = Object.fromEntries(daftar.map((t) => [t.childName, t.ageGroup?.name ?? null]));
    expect(per).toEqual({ "Raffaza Haris": "KU-10", "Acak Satu": null, "Asing Dua": null });
  });

  test("konversi: siswa dibuat dengan KU dan kontak orang tua, undangan terhubung ke siswa, dan hanya sekali", async () => {
    const w = await world("kon");
    await postTrial(w.slug, { ageGroupId: w.ku10 });
    const [trial] = await json<TrialRow[]>(call("GET", "/trials", w.admin));

    const res = await call("POST", `/trials/${trial!.id}/convert`, w.admin, {});
    expect(res.status).toBe(201);
    const out = await json<TrialConvertResult>(res);
    expect(out.trial).toMatchObject({ status: "diterima", player: { id: out.player.id, name: "Raffaza Haris" }, ageGroup: { name: "KU-10" } });
    expect(out.invitation.url).toMatch(/^http:\/\/web\.test\/undangan\/.+/);

    const detail = await json(call("GET", `/players/${out.player.id}`, w.admin));
    expect(detail).toMatchObject({
      fullName: "Raffaza Haris",
      birthDate: "2015-06-12",
      status: "aktif",
      ageGroup: { name: "KU-10" },
      guardianName: "Hendra Gunawan",
      guardianWhatsapp: "6281234567890",
    });
    expect(detail.memberNo).toMatch(/^P\d{4}$/);

    // Orang tua membuka tautan undangan: langsung terhubung ke siswa ini, dan hanya siswa ini.
    const token = out.invitation.url.split("/undangan/")[1]!;
    const acc = await call("POST", `/invitations/${token}/accept`, undefined, { name: "Hendra", email: `hendra-${uid}@uji.test`, password: PASS });
    expect(acc.status).toBe(201);
    const ortu = sessionOf(acc);
    expect((await json<{ id: string }[]>(call("GET", "/players", ortu))).map((p) => p.id)).toEqual([out.player.id]);

    expect((await json(call("POST", `/trials/${trial!.id}/convert`, w.admin, {}))).error.code).toBe("already_converted");
    expect((await json<{ id: string }[]>(call("GET", "/players", w.admin))).length).toBe(1);
  });

  test("pendaftaran: perjanjian komitmen wajib, batas data siswa dijaga, dan data siswa ikut tersalin saat konversi", async () => {
    const w = await world("dat");
    // Tanpa persetujuan, atau persetujuan false, ditolak dan tidak ada yang tersimpan.
    for (const commitmentAccepted of [undefined, false]) {
      const res = await postTrial(w.slug, { commitmentAccepted });
      expect(res.status).toBe(400);
    }
    for (const buruk of [{ heightCm: 20 }, { weightKg: 500 }, { shoeSize: 5 }, { nisn: "123" }, { position: "ST" }, { medicalNote: "x".repeat(501) }]) {
      expect([JSON.stringify(buruk), (await postTrial(w.slug, buruk)).status]).toEqual([JSON.stringify(buruk), 400]);
    }
    expect(await json<TrialRow[]>(call("GET", "/trials", w.admin))).toEqual([]);

    const ok = await postTrial(w.slug, {
      ageGroupId: w.ku10,
      birthPlace: "Bandung",
      nisn: "0123456789",
      school: "SDN 1 Padasuka",
      position: "MF",
      heightCm: 142,
      weightKg: 35.5,
      jerseySize: "m",
      shoeSize: 36,
      medicalNote: "Asma ringan, alergi udang",
      mediaConsent: true,
    });
    expect(ok.status).toBe(201);
    const [trial] = await json<TrialRow[]>(call("GET", "/trials", w.admin));
    expect(trial).toMatchObject({ birthPlace: "Bandung", nisn: "0123456789", position: "MF", heightCm: 142, weightKg: 35.5, mediaConsent: true });
    expect(trial!.commitmentAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const out = await json<TrialConvertResult>(call("POST", `/trials/${trial!.id}/convert`, w.admin, {}));
    const detail = await json(call("GET", `/players/${out.player.id}`, w.admin));
    expect(detail).toMatchObject({
      birthPlace: "Bandung",
      nisn: "0123456789",
      school: "SDN 1 Padasuka",
      position: "MF",
      heightCm: 142,
      weightKg: 35.5,
      jerseySize: "M",
      shoeSize: 36,
      medicalNote: "Asma ringan, alergi udang",
    });

    // NISN yang sudah dipakai siswa lain: konversi ditolak dengan pesan jelas, pendaftar tetap belum menjadi siswa.
    await postTrial(w.slug, { childName: "Kembar NISN", nisn: "0123456789" });
    const kembar = (await json<TrialRow[]>(call("GET", "/trials", w.admin))).find((t) => t.childName === "Kembar NISN")!;
    const tolak = await call("POST", `/trials/${kembar.id}/convert`, w.admin, {});
    expect(tolak.status).toBe(409);
    expect((await json(tolak)).error.code).toBe("nisn_taken");
    expect((await json<TrialRow[]>(call("GET", "/trials", w.admin))).find((t) => t.childName === "Kembar NISN")!.player).toBeNull();
  });

  test("konversi: KU boleh diisi admin saat pendaftar tanpa KU; ditolak tidak bisa; data tidak sah ditolak tanpa membuat siswa", async () => {
    const w = await world("var");
    await postTrial(w.slug, {});
    await postTrial(w.slug, { childName: "Anak Ditolak" });
    await postTrial(w.slug, { childName: "Lahir Lampau", birthDate: "1980-01-01" });
    const daftar = await json<TrialRow[]>(call("GET", "/trials", w.admin));
    const id = (nama: string) => daftar.find((t) => t.childName === nama)!.id;

    // Tanpa KU: boleh tetap dikonversi dengan KU kosong, atau memilih KU saat itu.
    const pilih = await json<TrialConvertResult>(call("POST", `/trials/${id("Raffaza Haris")}/convert`, w.admin, { ageGroupId: w.ku8 }));
    expect(pilih.trial.ageGroup).toMatchObject({ name: "KU-8" });
    expect((await json(call("POST", `/trials/${id("Anak Ditolak")}/convert`, w.admin, { ageGroupId: randomUUID() }))).error.code).toBe("age_group_invalid");

    await call("PATCH", `/trials/${id("Anak Ditolak")}`, w.admin, { status: "ditolak" });
    expect((await json(call("POST", `/trials/${id("Anak Ditolak")}/convert`, w.admin, {}))).error.code).toBe("rejected");

    const lampau = await call("POST", `/trials/${id("Lahir Lampau")}/convert`, w.admin, {});
    expect(lampau.status).toBe(422);
    expect((await json(lampau)).error.code).toBe("trial_invalid");
    expect((await json<{ id: string }[]>(call("GET", "/players", w.admin))).length).toBe(1); // hanya yang berhasil
  });

  test("hanya admin SSB pemilik pendaftar", async () => {
    const a = await world("ia");
    const b = await world("ib");
    await postTrial(a.slug, {});
    const [trial] = await json<TrialRow[]>(call("GET", "/trials", a.admin));
    expect((await call("POST", `/trials/${trial!.id}/convert`, b.admin, {})).status).toBe(404);
    expect((await call("POST", `/trials/${trial!.id}/convert`, undefined, {})).status).toBe(401);
    const inv = await json(call("POST", "/invitations", a.admin, { role: "pelatih" }));
    const pel = await call("POST", `/invitations/${inv.token}/accept`, undefined, { name: "Pelatih", email: `pel-${uid}@uji.test`, password: PASS });
    expect((await call("POST", `/trials/${trial!.id}/convert`, sessionOf(pel), {})).status).toBe(403);
    expect((await call("POST", `/trials/${randomUUID()}/convert`, a.admin, {})).status).toBe(404);
    expect((await call("POST", "/trials/bukan-uuid/convert", a.admin, {})).status).toBe(404);
  });
});
