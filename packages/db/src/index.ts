import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Db = ReturnType<typeof createDb>["db"];

/**
 * Koneksi aplikasi. Harus memakai role ssb_app (tanpa BYPASSRLS),
 * bukan role pemilik tabel, supaya RLS selalu berlaku.
 */
export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, client };
}

/**
 * Jalankan fn dalam transaksi dengan konteks tenant.
 * set_config(..., true) berlaku hanya di transaksi ini, jadi aman
 * untuk connection pool. Tanpa konteks, RLS tidak menampilkan baris apa pun.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(db: Db, ssbId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID.test(ssbId)) throw new Error("ssbId bukan UUID");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.ssb_id', ${ssbId}, true)`);
    return fn(tx);
  });
}
