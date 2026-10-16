import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Migrasi dijalankan dengan role pemilik (DATABASE_URL_OWNER), bukan role aplikasi.
const url = process.env.DATABASE_URL_OWNER;
if (!url) throw new Error("DATABASE_URL_OWNER belum diatur");

const client = postgres(url, { max: 1 });
await migrate(drizzle(client), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await client.end();
console.log("migrasi selesai");
