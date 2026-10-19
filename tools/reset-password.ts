// Membuat tautan reset kata sandi dari server, mis. untuk admin SSB yang lupa kata sandi dan tidak punya email reset.
// Jalankan di server: bun run auth:reset <email>
// Memakai DATABASE_URL dan WEB_URL dari .env; tautan berlaku 24 jam dan hanya tampil di terminal ini.
import { eq } from "drizzle-orm";
import { createDb, schema } from "@ssb/db";
import { issuePasswordReset, RESET_TTL_ADMIN_MS } from "../apps/api/src/password-reset";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Pemakaian: bun run auth:reset <email>");
  process.exit(1);
}
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL belum diisi.");
  process.exit(1);
}
const webUrl = process.env.WEB_URL ?? "http://localhost:3001";
const { db, client } = createDb(dbUrl);
const [acc] = await db.select({ id: schema.account.id, name: schema.account.name }).from(schema.account).where(eq(schema.account.email, email)).limit(1);
if (!acc) {
  console.error(`Tidak ada akun dengan email ${email}.`);
  await client.end();
  process.exit(1);
}
const { token, expiresAt } = await issuePasswordReset(db, acc.id, { ttlMs: RESET_TTL_ADMIN_MS });
console.log(`Tautan reset untuk ${acc.name} (${email}), berlaku sampai ${expiresAt.toLocaleString("id-ID")}:\n\n${webUrl}/reset-sandi/${token}\n`);
await client.end();
