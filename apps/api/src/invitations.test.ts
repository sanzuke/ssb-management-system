import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, like } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { createApp } from "./app";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("kelola undangan: daftar, cabut, dan buat ulang tautan", () => {
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
  const tokenOf = (inv: { token: string }) => inv.token;

  afterAll(async () => {
    // Pembersihan lewat koneksi baru: koneksi tes bisa tertahan dalam transaksi yang belum selesai.
    const bersih = createDb(url!);
    for (const id of ssbIds) await withTenant(bersih.db, id, (tx) => tx.delete(schema.ssb).where(eq(schema.ssb.id, id)));
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
  });

  test("daftar berstatus, cabut, buat ulang, dan batas peran", async () => {
    const reg = await call("POST", "/auth/register-ssb", undefined, {
      ssbName: `Undangan ${uid}`,
      slug: `u-${uid}`,
      adminName: "Admin",
      email: `admin-${uid}@uji.test`,
      password: PASS,
    });
    expect(reg.status).toBe(201);
    const { ssbId } = await json(reg);
    ssbIds.push(ssbId);
    const admin = sessionOf(reg);
    const ku = (await json(await call("POST", "/age-groups", admin, { name: "KU-10", minAge: 9, maxAge: 10 }))).id;
    const anak = await json(await call("POST", "/players", admin, { fullName: "Anak Satu", birthDate: "2016-04-05", ageGroupId: ku }));

    expect(await json(await call("GET", "/invitations", admin))).toEqual([]);

    const pelatih = await json(await call("POST", "/invitations", admin, { role: "pelatih", label: "Coach Budi" }));
    const ortu = await json(await call("POST", "/invitations", admin, { role: "orang_tua", label: "Ibu Ratna", playerId: anak.id }));
    const diterima = await json(await call("POST", "/invitations", admin, { role: "korlas" }));
    const kedaluwarsa = await json(await call("POST", "/invitations", admin, { role: "pelatih", label: "Lama" }));

    // satu diterima, satu dibuat kedaluwarsa
    const acc = await call("POST", `/invitations/${tokenOf(diterima)}/accept`, undefined, {
      name: "Korlas Baru",
      email: `korlas-${uid}@uji.test`,
      password: PASS,
    });
    expect(acc.status).toBe(201);
    await withTenant(db, ssbId, (tx) =>
      tx
        .update(schema.invitation)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.invitation.label, "Lama")),
    );

    const list = await json(await call("GET", "/invitations", admin));
    expect(list).toHaveLength(4);
    const by = (label: string | null, role?: string) => list.find((x: any) => x.label === label && (!role || x.role === role));
    expect(by("Coach Budi").status).toBe("menunggu");
    expect(by("Lama").status).toBe("kedaluwarsa");
    expect(by(null, "korlas").status).toBe("diterima");
    expect(by("Ibu Ratna").player).toEqual({ id: anak.id, name: "Anak Satu" });
    expect(by("Coach Budi").createdBy).toBe("Admin");
    expect(JSON.stringify(list)).not.toContain("secret"); // tautan tidak pernah ikut daftar

    // buat ulang: tautan lama mati, tautan baru hidup, data sama, satu baris saja
    const baru = await json(await call("POST", `/invitations/${by("Coach Budi").id}/renew`, admin));
    expect(baru.url).toBe(`http://web.test/undangan/${baru.token}`);
    expect((await call("GET", `/invitations/${tokenOf(pelatih)}`)).status).toBe(404);
    const pratinjau = await json(await call("GET", `/invitations/${tokenOf(baru)}`));
    expect(pratinjau.role).toBe("pelatih");
    expect(pratinjau.label).toBe("Coach Budi");
    const list2 = await json(await call("GET", "/invitations", admin));
    expect(list2).toHaveLength(4);
    expect(list2.filter((x: any) => x.label === "Coach Budi")).toHaveLength(1);

    // undangan kedaluwarsa bisa dihidupkan lagi dengan tautan baru
    const hidup = await json(await call("POST", `/invitations/${by("Lama").id}/renew`, admin));
    expect((await call("GET", `/invitations/${tokenOf(hidup)}`)).status).toBe(200);

    // cabut yang menunggu; yang sudah diterima tidak bisa dicabut atau dibuat ulang
    const ortuId = by("Ibu Ratna").id;
    expect((await call("DELETE", `/invitations/${ortuId}`, admin)).status).toBe(204);
    expect((await call("GET", `/invitations/${tokenOf(ortu)}`)).status).toBe(404);
    expect((await call("DELETE", `/invitations/${ortuId}`, admin)).status).toBe(404);
    const idDiterima = by(null, "korlas").id;
    expect((await json(await call("DELETE", `/invitations/${idDiterima}`, admin))).error.code).toBe("already_accepted");
    expect((await call("POST", `/invitations/${idDiterima}/renew`, admin)).status).toBe(409);
    expect((await call("DELETE", "/invitations/bukan-uuid", admin)).status).toBe(404);
    expect((await call("POST", `/invitations/${randomUUID()}/renew`, admin)).status).toBe(404);

    // hanya admin: korlas yang baru bergabung dan pengunjung tanpa login ditolak
    const korlas = sessionOf(acc);
    expect((await call("GET", "/invitations", korlas)).status).toBe(403);
    expect((await call("DELETE", `/invitations/${idDiterima}`, korlas)).status).toBe(403);
    expect((await call("POST", `/invitations/${idDiterima}/renew`, korlas)).status).toBe(403);
    expect((await call("GET", "/invitations")).status).toBe(401);
  });
});
