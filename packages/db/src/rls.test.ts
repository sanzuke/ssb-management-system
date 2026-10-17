import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, withTenant, schema } from "./index";

// Test integrasi: butuh PostgreSQL yang sudah dimigrasi.
// DATABASE_URL = role ssb_app. Data uji dibuat lewat role aplikasi sendiri,
// persis seperti alur onboarding SSB baru: konteks tenant diatur ke id SSB yang dibuat.
const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("isolasi tenant (RLS)", () => {
  const a = randomUUID();
  const b = randomUUID();
  const app = createDb(url!);

  beforeAll(async () => {
    for (const [id, name] of [
      [a, "SSB A"],
      [b, "SSB B"],
    ] as const) {
      await withTenant(app.db, id, async (tx) => {
        await tx.insert(schema.ssb).values({ id, name });
        const [g] = await tx.insert(schema.ageGroup).values({ ssbId: id, name: "KU-10", minAge: 9, maxAge: 10 }).returning();
        await tx.insert(schema.player).values({ ssbId: id, fullName: `Pemain ${name}`, birthDate: "2016-01-01", ageGroupId: g!.id });
      });
    }
  });

  afterAll(async () => {
    for (const id of [a, b]) await withTenant(app.db, id, (tx) => tx.delete(schema.ssb).where(sql`id = ${id}`));
    await app.client.end();
  });

  test("tenant A hanya melihat data A", async () => {
    const rows = await withTenant(app.db, a, (tx) => tx.select().from(schema.player));
    expect(rows.map((r) => r.fullName)).toEqual(["Pemain SSB A"]);
  });

  test("tanpa konteks tenant tidak ada baris yang terlihat", async () => {
    const rows = await app.db.select().from(schema.player);
    expect(rows).toHaveLength(0);
  });

  test("tenant A tidak bisa menulis atas nama B", async () => {
    await expect(withTenant(app.db, a, (tx) => tx.insert(schema.player).values({ ssbId: b, fullName: "Penyusup", birthDate: "2016-01-01" }))).rejects.toThrow();
  });

  test("tenant A tidak bisa mengubah atau menghapus data B", async () => {
    const upd = await withTenant(app.db, a, (tx) => tx.update(schema.player).set({ fullName: "X" }).where(sql`ssb_id = ${b}`).returning());
    expect(upd).toHaveLength(0);
    const del = await withTenant(app.db, a, (tx) => tx.delete(schema.player).where(sql`ssb_id = ${b}`).returning());
    expect(del).toHaveLength(0);
  });

  test("KU dari SSB lain ditolak oleh foreign key komposit", async () => {
    const [gB] = await withTenant(app.db, b, (tx) => tx.select().from(schema.ageGroup));
    await expect(
      withTenant(app.db, a, (tx) => tx.insert(schema.player).values({ ssbId: a, fullName: "Silang", birthDate: "2016-01-01", ageGroupId: gB!.id })),
    ).rejects.toThrow();
  });

  test("role aplikasi tidak memiliki BYPASSRLS", async () => {
    const r = await app.db.execute(sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`);
    expect(r[0]).toMatchObject({ rolbypassrls: false, rolsuper: false });
  });
});
