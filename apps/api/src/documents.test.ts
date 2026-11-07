import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { RAPORT_MAX } from "@ssb/shared";
import { createApp } from "./app";
import { cleanFileName, sniffDocument } from "./documents";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const PDF = Uint8Array.from([...Buffer.from("%PDF-1.7\n"), 1, 2, 3]);

describe("berkas siswa: isi berkas (tanpa database)", () => {
  test("PDF dan gambar dikenali dari isi; selain itu ditolak", () => {
    expect(sniffDocument(PDF)).toBe("pdf");
    expect(sniffDocument(PNG)).toBe("png");
    expect(sniffDocument(Uint8Array.from(Buffer.from("<html><script>alert(1)</script></html>")))).toBeNull();
    expect(sniffDocument(Uint8Array.from(Buffer.from("PK\u0003\u0004 contoh zip")))).toBeNull();
    // Nama berkas .pdf tidak membuat isi lain lolos: yang dinilai hanya isinya.
    expect(sniffDocument(Uint8Array.from(Buffer.from("MZ executable")))).toBeNull();
  });

  test("nama berkas dibersihkan dari folder dan karakter kontrol", () => {
    expect(cleanFileName("C:\\Users\\x\\kk.pdf")).toBe("kk.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(cleanFileName("///")).toBe("berkas");
    expect(cleanFileName(`${"a".repeat(300)}.pdf`).length).toBe(120);
  });
});

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("berkas siswa: API dan batas data per role", () => {
  const { db, client } = createDb(url!);
  const dir = mkdtempSync(join(tmpdir(), "ssb-berkas-"));
  const app = createApp(
    db,
    { NODE_ENV: "test", ALLOWED_ORIGINS: "http://localhost:3001", WEB_URL: "http://web.test", SESSION_SECRET: "x".repeat(40), UPLOAD_DIR: dir },
    { google: null },
  );
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const ssbIds: string[] = [];
  const iso = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const upload = (playerId: string, cookie: string, fields: { kind: string; label?: string }, bytes: Uint8Array = PDF, name = "berkas.pdf") => {
    const f = new FormData();
    f.set("kind", fields.kind);
    if (fields.label !== undefined) f.set("label", fields.label);
    f.set("file", new File([bytes as BlobPart], name));
    return app.request(`/players/${playerId}/documents`, { method: "POST", headers: { cookie, origin: "http://localhost:3001" }, body: f });
  };
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
    const cookie = sessionOf(acc);
    const me = await json(await call("GET", "/auth/me", cookie));
    return { cookie, userId: me.active.userId as string };
  }

  let satu: Promise<{ ssbId: string; admin: string }> | undefined;
  const ssbTunggal = () =>
    (satu ??= (async () => {
      const reg = await call("POST", "/auth/register-ssb", undefined, {
        ssbName: `Berkas ${uid}`,
        slug: `b-${uid}`,
        adminName: "Admin",
        email: `admin-${uid}@uji.test`,
        password: PASS,
      });
      const { ssbId } = await json(reg);
      ssbIds.push(ssbId);
      return { ssbId: ssbId as string, admin: sessionOf(reg) };
    })());

  afterAll(async () => {
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
    rmSync(dir, { recursive: true, force: true });
  });

  const filesOf = (ssbId: string) => (existsSync(join(dir, ssbId, "dokumen")) ? readdirSync(join(dir, ssbId, "dokumen")) : []);

  test("unggah, ganti, baca, dan hapus; raport boleh banyak dan butuh keterangan", async () => {
    const { ssbId, admin } = await ssbTunggal();
    const p = await json(await call("POST", "/players", admin, { fullName: "Anak Berkas", birthDate: "2016-04-05" }));

    const kk = await upload(p.id, admin, { kind: "kartu_keluarga" });
    expect(kk.status).toBe(201);
    const kk1 = await json(kk);
    expect(kk1).toMatchObject({ kind: "kartu_keluarga", mime: "application/pdf", originalName: "berkas.pdf", label: null });
    expect(filesOf(ssbId)).toHaveLength(1);

    // Mengunggah ulang jenis yang sama menggantikan: satu baris, berkas lama terhapus dari penyimpanan.
    const kk2 = await json(await upload(p.id, admin, { kind: "kartu_keluarga" }, PNG, "kk-baru.png"));
    expect(kk2.id).not.toBe(kk1.id);
    expect(kk2.mime).toBe("image/png");
    const daftar = await json(await call("GET", `/players/${p.id}/documents`, admin));
    expect(daftar.filter((d: { kind: string }) => d.kind === "kartu_keluarga")).toHaveLength(1);
    expect(filesOf(ssbId)).toHaveLength(1);

    // Isi berkas kembali apa adanya, tidak ditebak browser, dan tidak disimpan di cache bersama.
    const file = await call("GET", `/players/${p.id}/documents/${kk2.id}/file`, admin);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/png");
    expect(file.headers.get("x-content-type-options")).toBe("nosniff");
    expect(file.headers.get("cache-control")).toContain("no-store");
    expect(file.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);

    // Raport wajib berketerangan; boleh lebih dari satu.
    const tanpaLabel = await upload(p.id, admin, { kind: "raport" });
    expect(tanpaLabel.status).toBe(400);
    expect((await json(tanpaLabel)).error.fields.label).toBeTruthy();
    expect((await upload(p.id, admin, { kind: "raport", label: "Semester 1" })).status).toBe(201);
    expect((await upload(p.id, admin, { kind: "raport", label: "Semester 2" })).status).toBe(201);
    const semua = await json(await call("GET", `/players/${p.id}/documents`, admin));
    expect(semua.filter((d: { kind: string }) => d.kind === "raport").map((d: { label: string }) => d.label).sort()).toEqual(["Semester 1", "Semester 2"]);

    const del = await call("DELETE", `/players/${p.id}/documents/${kk2.id}`, admin);
    expect(del.status).toBe(204);
    expect((await call("GET", `/players/${p.id}/documents/${kk2.id}/file`, admin)).status).toBe(404);
    expect(filesOf(ssbId)).toHaveLength(2); // tinggal dua raport
  });

  test("jenis, isi, dan ukuran dibatasi; raport maksimal per siswa", async () => {
    const { ssbId, admin } = await ssbTunggal();
    const p = await json(await call("POST", "/players", admin, { fullName: "Anak Batas", birthDate: "2016-04-05" }));
    const before = filesOf(ssbId).length;

    expect((await upload(p.id, admin, { kind: "ktp" })).status).toBe(400);
    expect((await upload(p.id, admin, { kind: "nisn" }, Uint8Array.from(Buffer.from("<script>alert(1)</script>")), "x.pdf")).status).toBe(415);
    const besar = new Uint8Array(5 * 1024 * 1024 + 1);
    besar.set(PDF);
    expect((await upload(p.id, admin, { kind: "nisn" }, besar)).status).toBe(413);
    expect((await upload(p.id, admin, { kind: "nisn" }, new Uint8Array(0))).status).toBe(400);
    expect(filesOf(ssbId).length).toBe(before); // yang ditolak tidak meninggalkan berkas

    for (let i = 0; i < RAPORT_MAX; i++) expect((await upload(p.id, admin, { kind: "raport", label: `Raport ${i}` })).status).toBe(201);
    const lebih = await upload(p.id, admin, { kind: "raport", label: "Kelebihan" });
    expect(lebih.status).toBe(409);
    expect(filesOf(ssbId).length).toBe(before + RAPORT_MAX);
  });

  test("batas role: orang tua hanya anaknya; pelatih dan korlas tidak melihat berkas sama sekali", async () => {
    const { admin } = await ssbTunggal();
    const ku = (await json(await call("POST", "/age-groups", admin, { name: "KU-B", minAge: 9, maxAge: 12 }))).id;
    const now = (await json(await call("POST", "/periods", admin, { name: "Sekarang B", startDate: iso(-30), endDate: iso(30) }))).id;
    const a = await json(await call("POST", "/players", admin, { fullName: "Anak Ortu A", birthDate: "2016-04-05", ageGroupId: ku }));
    const b = await json(await call("POST", "/players", admin, { fullName: "Anak Ortu B", birthDate: "2016-05-05", ageGroupId: ku }));
    const ortu = await gabung(admin, "orang_tua", { playerId: a.id });
    const pel = await gabung(admin, "pelatih");
    await call("POST", "/assignments", admin, { userId: pel.userId, ageGroupId: ku, periodId: now });

    // Orang tua mengunggah, melihat, dan menghapus berkas anaknya.
    const akta = await upload(a.id, ortu.cookie, { kind: "akta_kelahiran" });
    expect(akta.status).toBe(201);
    const aktaId = (await json(akta)).id;
    expect((await call("GET", `/players/${a.id}/documents`, ortu.cookie)).status).toBe(200);
    expect((await call("GET", `/players/${a.id}/documents/${aktaId}/file`, ortu.cookie)).status).toBe(200);

    // Anak lain: 404 untuk semua jalur, seperti rute siswa lain.
    expect((await upload(b.id, ortu.cookie, { kind: "akta_kelahiran" })).status).toBe(404);
    expect((await call("GET", `/players/${b.id}/documents`, ortu.cookie)).status).toBe(404);
    const bDoc = await json(await upload(b.id, admin, { kind: "nisn" }));
    expect((await call("GET", `/players/${b.id}/documents/${bDoc.id}/file`, ortu.cookie)).status).toBe(404);
    expect((await call("DELETE", `/players/${b.id}/documents/${bDoc.id}`, ortu.cookie)).status).toBe(404);
    // Id berkas anak lain lewat jalur anak sendiri juga tidak menembus.
    expect((await call("GET", `/players/${a.id}/documents/${bDoc.id}/file`, ortu.cookie)).status).toBe(404);

    // Pelatih yang menangani KU-nya tetap tidak boleh: KK dan akta bukan urusan kepelatihan.
    expect((await call("GET", `/players/${a.id}/documents`, pel.cookie)).status).toBe(403);
    expect((await call("GET", `/players/${a.id}/documents/${aktaId}/file`, pel.cookie)).status).toBe(403);
    expect((await upload(a.id, pel.cookie, { kind: "nisn" })).status).toBe(403);
    expect((await call("DELETE", `/players/${a.id}/documents/${aktaId}`, pel.cookie)).status).toBe(403);
    expect((await call("GET", `/players/${a.id}/documents`, "")).status).toBe(401);

    expect((await call("DELETE", `/players/${a.id}/documents/${aktaId}`, ortu.cookie)).status).toBe(204);
  });

  test("SSB lain tidak bisa membaca berkas (isolasi tenant)", async () => {
    const { admin } = await ssbTunggal();
    const p = await json(await call("POST", "/players", admin, { fullName: "Anak Tenant", birthDate: "2016-04-05" }));
    const d = await json(await upload(p.id, admin, { kind: "kartu_keluarga" }));
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `Lain ${uid}`,
      slug: `l-${uid}`,
      adminName: "Admin Lain",
      email: `lain-${uid}@uji.test`,
      password: PASS,
    });
    ssbIds.push((await json(reg)).ssbId);
    const lain = sessionOf(reg);
    expect((await call("GET", `/players/${p.id}/documents`, lain)).status).toBe(404);
    expect((await call("GET", `/players/${p.id}/documents/${d.id}/file`, lain)).status).toBe(404);
    expect((await call("DELETE", `/players/${p.id}/documents/${d.id}`, lain)).status).toBe(404);
    expect((await upload(p.id, lain, { kind: "nisn" })).status).toBe(404);
  });
});
