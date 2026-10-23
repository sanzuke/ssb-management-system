// Memasang konten awal landing ke SSB tertentu, mis. di server: bun run site:seed garuda-muda --terbitkan
// Konten berasal dari tools/site-contoh.ts (salinan halaman statik landing) dan divalidasi dengan skema yang sama seperti API.
// Menolak bila SSB itu sudah punya konten, kecuali diberi --timpa, supaya sunting admin tidak hilang tanpa sengaja.
import { eq } from "drizzle-orm";
import { createDb, schema, withTenant } from "@ssb/db";
import { siteContentSchema } from "@ssb/shared";
import { ssbIdBySlug } from "../apps/api/src/auth/service";
import { kontenFamilyUnited } from "./site-contoh";

const [slug, ...opsi] = process.argv.slice(2);
const terbitkan = opsi.includes("--terbitkan");
const timpa = opsi.includes("--timpa");
if (!slug) {
  console.error("Pemakaian: bun run site:seed <kode-ssb> [--terbitkan] [--timpa]");
  process.exit(1);
}
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL belum diisi.");
  process.exit(1);
}

const konten = siteContentSchema.parse(kontenFamilyUnited);
const { db, client } = createDb(dbUrl);
try {
  const ssbId = await ssbIdBySlug(db, slug);
  if (!ssbId) throw new Error(`SSB dengan kode "${slug}" tidak ada.`);
  await withTenant(db, ssbId, async (tx) => {
    const [ada] = await tx.select({ ssbId: schema.siteContent.ssbId }).from(schema.siteContent).where(eq(schema.siteContent.ssbId, ssbId)).limit(1);
    if (ada && !timpa) throw new Error("SSB ini sudah punya konten situs. Tambahkan --timpa bila memang ingin menggantinya.");
    const sekarang = new Date();
    const nilai = terbitkan ? { draft: konten, published: konten, publishedAt: sekarang } : { draft: konten };
    await tx
      .insert(schema.siteContent)
      .values({ ssbId, ...nilai })
      .onConflictDoUpdate({ target: schema.siteContent.ssbId, set: { ...nilai, updatedAt: sekarang } });
  });
  console.log(`Konten awal terpasang di "${slug}" sebagai ${terbitkan ? "draf dan versi terbit" : "draf (belum terbit)"}.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await client.end();
}
