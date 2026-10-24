import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { schema, withTenant, type Db, type Tx } from "@ssb/db";
import {
  blocksToText,
  mediaIdsIn,
  parseMarkdown,
  POST_MEDIA_MAX_BYTES,
  postInputSchema,
  type Block,
  type PostAdminDetail,
  type PostAdminRow,
  type PostInput,
  type PostMedia,
  type PostStatus,
  type PublicPost,
  type PublicPostList,
  type PublicPostSummary,
} from "@ssb/shared";
import { requirePermission, type AppEnv, type Member } from "./auth/middleware";
import { ssbIdBySlug } from "./auth/service";
import { HttpError } from "./errors";
import { photoMime, photoStore, sniffImage } from "./photo";
import { zv } from "./validator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (what: string) => new HttpError(404, "not_found", `${what} tidak ditemukan`);
const uuidOr404 = (v: string, what: string) => {
  if (!UUID.test(v)) throw notFound(what);
  return v;
};

export type PostOptions = {
  uploadDir: string;
  /** URL publik API tanpa garis miring akhir, mis. https://app.familyunitedfa.com/api; dasar alamat gambar. */
  publicApiUrl: string;
};

export const mediaBaseFor = (publicApiUrl: string, ssbSlug: string) => `${publicApiUrl.replace(/\/+$/, "")}/public/site/${ssbSlug}/media/`;

/** Alamat artikel dari judul: huruf kecil, angka, dan tanda hubung. */
export function slugFromTitle(title: string): string {
  const s = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : "artikel";
}

/** Slug unik per SSB: tambahkan -2, -3, ... bila sudah dipakai artikel lain. */
async function uniqueSlug(tx: Tx, base: string, exceptId?: string): Promise<string> {
  for (let n = 1; n < 200; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const clash = await tx
      .select({ id: schema.sitePost.id })
      .from(schema.sitePost)
      .where(exceptId ? and(eq(schema.sitePost.slug, candidate), ne(schema.sitePost.id, exceptId)) : eq(schema.sitePost.slug, candidate))
      .limit(1);
    if (clash.length === 0) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/** Gambar yang dirujuk (sampul dan isi) harus milik SSB ini. Kembalikan id yang tidak ditemukan. */
async function missingMedia(tx: Tx, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const have = await tx.select({ id: schema.siteMedia.id }).from(schema.siteMedia).where(inArray(schema.siteMedia.id, ids));
  const ok = new Set(have.map((r) => r.id));
  return ids.filter((id) => !ok.has(id));
}

type PostRow = typeof schema.sitePost.$inferSelect;

const bi = (id: string, en: string | null) => (en ? { id, en } : { id });

/** Artikel yang sudah ada. Pengecekan kepemilikan: penulis sendiri, atau admin SSB. */
const canEdit = (m: Member, authorId: string | null) => m.role === "admin_ssb" || authorId === m.userId;

const toAdminRow = (r: PostRow, m: Member, base: string): PostAdminRow => ({
  id: r.id,
  slug: r.slug,
  title: bi(r.titleId, r.titleEn),
  category: r.category,
  status: r.status === "published" ? "published" : "draft",
  coverUrl: r.coverMediaId ? `${base}${r.coverMediaId}` : null,
  publishedAt: r.publishedAt?.toISOString() ?? null,
  updatedAt: r.updatedAt.toISOString(),
  authorName: r.authorName,
  canEdit: canEdit(m, r.authorId),
});

const toAdminDetail = (r: PostRow, m: Member, base: string): PostAdminDetail => ({
  ...toAdminRow(r, m, base),
  excerpt: bi(r.excerptId, r.excerptEn),
  body: bi(r.bodyId, r.bodyEn),
  coverMediaId: r.coverMediaId,
  coverAlt: r.coverAlt,
  mediaBase: base,
});

/** Kolom artikel dari isian; en kosong disimpan sebagai null. */
const columns = (b: PostInput) => ({
  titleId: b.title.id,
  titleEn: b.title.en || null,
  excerptId: b.excerpt.id,
  excerptEn: b.excerpt.en || null,
  bodyId: b.body.id,
  bodyEn: b.body.en || null,
  category: b.category,
  coverMediaId: b.coverMediaId,
  coverAlt: b.coverAlt,
});

async function ssbSlugOf(tx: Tx, ssbId: string): Promise<string> {
  const [d] = await tx.select({ slug: schema.ssbDirectory.slug }).from(schema.ssbDirectory).where(eq(schema.ssbDirectory.ssbId, ssbId)).limit(1);
  if (!d) throw notFound("SSB");
  return d.slug;
}

/** Validasi rujukan gambar dan slug sebelum menyimpan; melempar 400 dengan pesan per kolom. */
async function checkInput(tx: Tx, b: PostInput, ownId?: string): Promise<void> {
  const fields: Record<string, string> = {};
  const ids = [...new Set([...mediaIdsIn(b.body.id), ...mediaIdsIn(b.body.en ?? ""), ...(b.coverMediaId ? [b.coverMediaId] : [])])];
  const gone = new Set(await missingMedia(tx, ids));
  if (b.coverMediaId && gone.has(b.coverMediaId)) fields.coverMediaId = "gambar sampul tidak ditemukan";
  if (mediaIdsIn(b.body.id).some((id) => gone.has(id))) fields["body.id"] = "ada gambar di isi yang tidak ditemukan";
  if (mediaIdsIn(b.body.en ?? "").some((id) => gone.has(id))) fields["body.en"] = "ada gambar di isi yang tidak ditemukan";
  if (b.slug) {
    const clash = await tx
      .select({ id: schema.sitePost.id })
      .from(schema.sitePost)
      .where(ownId ? and(eq(schema.sitePost.slug, b.slug), ne(schema.sitePost.id, ownId)) : eq(schema.sitePost.slug, b.slug))
      .limit(1);
    if (clash.length > 0) fields.slug = "alamat ini sudah dipakai artikel lain";
  }
  if (Object.keys(fields).length > 0) throw new HttpError(400, "validation", "Periksa kembali isian Anda", fields);
}

/** Artikel untuk admin SSB dan staf yang menulis: draf, terbit, tarik, hapus, dan unggah gambar. */
export function postRoutes(db: Db, opts: PostOptions) {
  const store = photoStore(opts.uploadDir);
  const member = (c: Context<AppEnv>) => c.get("auth")!.member!;

  /** Ambil artikel yang boleh disunting pemanggil; 404 bila tidak ada, 403 bila milik penulis lain. */
  async function editable(tx: Tx, m: Member, id: string): Promise<PostRow> {
    const [row] = await tx.select().from(schema.sitePost).where(eq(schema.sitePost.id, id)).limit(1);
    if (!row) throw notFound("Artikel");
    if (!canEdit(m, row.authorId)) throw new HttpError(403, "forbidden", "Artikel ini milik penulis lain");
    return row;
  }

  return (
    new Hono<AppEnv>()
      .get("/posts", requirePermission("post.write"), async (c) => {
        const m = member(c);
        const rows = await withTenant(db, m.ssbId, async (tx) => {
          const base = mediaBaseFor(opts.publicApiUrl, await ssbSlugOf(tx, m.ssbId));
          const all = await tx.select().from(schema.sitePost).orderBy(desc(schema.sitePost.updatedAt));
          return all.map((r) => toAdminRow(r, m, base));
        });
        return c.json(rows);
      })

      .post("/posts", requirePermission("post.write"), zv("json", postInputSchema), async (c) => {
        const m = member(c);
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          await checkInput(tx, b);
          const slug = b.slug ?? (await uniqueSlug(tx, slugFromTitle(b.title.id)));
          const [row] = await tx
            .insert(schema.sitePost)
            .values({ ssbId: m.ssbId, slug, ...columns(b), authorId: m.userId, authorName: m.name })
            .returning();
          if (!row) throw new HttpError(500, "insert_failed", "Gagal menyimpan artikel");
          return toAdminDetail(row, m, mediaBaseFor(opts.publicApiUrl, await ssbSlugOf(tx, m.ssbId)));
        });
        return c.json(out, 201);
      })

      // Unggah gambar artikel. Dipasang sebelum rute /posts/:id supaya "media" tidak terbaca sebagai id.
      .post(
        "/posts/media",
        requirePermission("post.write"),
        bodyLimit({
          maxSize: POST_MEDIA_MAX_BYTES + 64 * 1024,
          onError: () => {
            throw new HttpError(413, "media_too_large", "Gambar terlalu besar (maksimal 5 MB)");
          },
        }),
        async (c) => {
          const m = member(c);
          const body = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
          const file = body.file;
          if (!(file instanceof File)) throw new HttpError(400, "bad_request", 'Kirim gambar pada kolom "file"');
          if (file.size > POST_MEDIA_MAX_BYTES) throw new HttpError(413, "media_too_large", "Gambar terlalu besar (maksimal 5 MB)");
          const bytes = new Uint8Array(await file.arrayBuffer());
          const ext = sniffImage(bytes);
          if (!ext) throw new HttpError(415, "media_type", "Gambar harus berformat JPG, PNG, atau WebP");
          const id = randomUUID();
          const key = `${m.ssbId}/artikel/${id}.${ext}`;
          const out = await withTenant(db, m.ssbId, async (tx) => {
            await store.put(key, bytes);
            try {
              await tx.insert(schema.siteMedia).values({ id, ssbId: m.ssbId, fileKey: key, mime: photoMime(ext), bytes: bytes.length, createdBy: m.userId });
            } catch (e) {
              await store.remove(key);
              throw e;
            }
            const base = mediaBaseFor(opts.publicApiUrl, await ssbSlugOf(tx, m.ssbId));
            const r: PostMedia = { id, url: `${base}${id}`, markdown: `![](media:${id})` };
            return r;
          });
          return c.json(out, 201);
        },
      )

      .get("/posts/:id", requirePermission("post.write"), async (c) => {
        const m = member(c);
        const id = uuidOr404(c.req.param("id"), "Artikel");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          const [row] = await tx.select().from(schema.sitePost).where(eq(schema.sitePost.id, id)).limit(1);
          if (!row) throw notFound("Artikel");
          return toAdminDetail(row, m, mediaBaseFor(opts.publicApiUrl, await ssbSlugOf(tx, m.ssbId)));
        });
        return c.json(out);
      })

      .put("/posts/:id", requirePermission("post.write"), zv("json", postInputSchema), async (c) => {
        const m = member(c);
        const id = uuidOr404(c.req.param("id"), "Artikel");
        const b = c.req.valid("json");
        const out = await withTenant(db, m.ssbId, async (tx) => {
          const cur = await editable(tx, m, id);
          await checkInput(tx, b, id);
          const slug = b.slug ?? cur.slug;
          const [row] = await tx
            .update(schema.sitePost)
            .set({ ...columns(b), slug, updatedAt: new Date() })
            .where(eq(schema.sitePost.id, id))
            .returning();
          if (!row) throw notFound("Artikel");
          return toAdminDetail(row, m, mediaBaseFor(opts.publicApiUrl, await ssbSlugOf(tx, m.ssbId)));
        });
        return c.json(out);
      })

      .post("/posts/:id/publish", requirePermission("post.write"), (c) => setStatus(c, "published"))
      .post("/posts/:id/unpublish", requirePermission("post.write"), (c) => setStatus(c, "draft"))

      .delete("/posts/:id", requirePermission("post.write"), async (c) => {
        const m = member(c);
        const id = uuidOr404(c.req.param("id"), "Artikel");
        await withTenant(db, m.ssbId, async (tx) => {
          await editable(tx, m, id);
          await tx.delete(schema.sitePost).where(eq(schema.sitePost.id, id));
        });
        return c.json({ ok: true });
      })
  );

  async function setStatus(c: Context<AppEnv>, status: PostStatus) {
    const m = member(c);
    const id = uuidOr404(c.req.param("id") ?? "", "Artikel");
    const out = await withTenant(db, m.ssbId, async (tx) => {
      const cur = await editable(tx, m, id);
      if (status === "published" && cur.bodyId.trim() === "") throw new HttpError(400, "validation", "Isi artikel masih kosong", { "body.id": "wajib diisi" });
      const [row] = await tx
        .update(schema.sitePost)
        .set({ status, publishedAt: status === "published" ? (cur.publishedAt ?? new Date()) : null, updatedAt: new Date() })
        .where(eq(schema.sitePost.id, id))
        .returning();
      if (!row) throw notFound("Artikel");
      return toAdminDetail(row, m, mediaBaseFor(opts.publicApiUrl, await ssbSlugOf(tx, m.ssbId)));
    });
    return c.json(out);
  }
}

export type PublicPostOptions = PostOptions & {
  /** Alamat situs landing tanpa garis miring akhir, mis. https://familyunitedfa.com; dasar alamat kanonik dan sitemap. */
  landingUrl: string;
  /** Berkas index.html hasil build landing; dipakai sebagai kerangka halaman SEO. */
  landingIndexPath: string;
};

const PAGE_SIZE_MAX = 30;

/** Ambil dan susun artikel terbit untuk satu SSB. Gambar di isi hanya dirujuk bila milik SSB yang sama. */
export async function loadPublicPost(db: Db, ssbId: string, slug: string, publicApiUrl: string, ssbSlug: string): Promise<PublicPost | null> {
  const base = mediaBaseFor(publicApiUrl, ssbSlug);
  return withTenant(db, ssbId, async (tx) => {
    const [r] = await tx
      .select()
      .from(schema.sitePost)
      .where(and(eq(schema.sitePost.slug, slug), eq(schema.sitePost.status, "published")))
      .limit(1);
    if (!r?.publishedAt) return null;
    const ids = [...new Set([...mediaIdsIn(r.bodyId), ...mediaIdsIn(r.bodyEn ?? "")])];
    const have = ids.length > 0 ? await tx.select({ id: schema.siteMedia.id }).from(schema.siteMedia).where(inArray(schema.siteMedia.id, ids)) : [];
    const ok = new Set(have.map((x) => x.id));
    const resolve = (id: string) => (ok.has(id.toLowerCase()) ? `${base}${id.toLowerCase()}` : null);
    const blocksId: Block[] = parseMarkdown(r.bodyId, resolve);
    const out: PublicPost = {
      ...summaryOf(r, base),
      publishedAt: r.publishedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      blocks: r.bodyEn ? { id: blocksId, en: parseMarkdown(r.bodyEn, resolve) } : { id: blocksId },
    };
    return out;
  });
}

export const summaryOf = (r: PostRow, base: string): PublicPostSummary => ({
  slug: r.slug,
  title: bi(r.titleId, r.titleEn),
  excerpt: bi(r.excerptId, r.excerptEn),
  category: r.category,
  coverUrl: r.coverMediaId ? `${base}${r.coverMediaId}` : null,
  coverAlt: r.coverAlt,
  publishedAt: (r.publishedAt ?? r.createdAt).toISOString(),
  authorName: r.authorName,
});

export async function loadPublicList(db: Db, ssbId: string, ssbSlug: string, publicApiUrl: string, page: number, pageSize: number): Promise<PublicPostList> {
  const base = mediaBaseFor(publicApiUrl, ssbSlug);
  return withTenant(db, ssbId, async (tx) => {
    const where = eq(schema.sitePost.status, "published");
    const [tot] = await tx.select({ n: count() }).from(schema.sitePost).where(where);
    const rows = await tx
      .select()
      .from(schema.sitePost)
      .where(where)
      .orderBy(desc(schema.sitePost.publishedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    return { items: rows.map((r) => summaryOf(r, base)), total: tot?.n ?? 0, page, pageSize };
  });
}

export const clampPage = (v: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
};

/** API publik artikel dan gambar untuk landing page, tanpa sesi. Hanya artikel terbit yang keluar. */
export function publicPostRoutes(db: Db, opts: PublicPostOptions) {
  const store = photoStore(opts.uploadDir);
  const slugOf = async (c: { req: { param: (k: string) => string } }) => {
    const slug = c.req.param("slug").toLowerCase();
    const ssbId = await ssbIdBySlug(db, slug);
    if (!ssbId) throw notFound("Situs");
    return { slug, ssbId };
  };

  return (
    new Hono<AppEnv>()
      .get("/public/site/:slug/posts", async (c) => {
        const { slug, ssbId } = await slugOf(c);
        const page = clampPage(c.req.query("page"), 1, 10_000);
        const pageSize = clampPage(c.req.query("pageSize"), 9, PAGE_SIZE_MAX);
        c.header("cache-control", "public, max-age=60");
        return c.json(await loadPublicList(db, ssbId, slug, opts.publicApiUrl, page, pageSize));
      })

      .get("/public/site/:slug/posts/:postSlug", async (c) => {
        const { slug, ssbId } = await slugOf(c);
        const post = await loadPublicPost(db, ssbId, c.req.param("postSlug").toLowerCase(), opts.publicApiUrl, slug);
        if (!post) throw notFound("Artikel");
        c.header("cache-control", "public, max-age=60");
        return c.json(post);
      })

      // Berkas gambar artikel. Alamatnya memuat id acak yang tidak bisa ditebak; isinya gambar yang memang dipakai untuk situs publik.
      .get("/public/site/:slug/media/:id", async (c) => {
        const { ssbId } = await slugOf(c);
        const id = c.req.param("id").toLowerCase();
        if (!UUID.test(id)) throw notFound("Gambar");
        const row = await withTenant(db, ssbId, async (tx) => {
          const [r] = await tx.select().from(schema.siteMedia).where(eq(schema.siteMedia.id, id)).limit(1);
          return r;
        });
        const bytes = row ? await store.get(row.fileKey) : null;
        if (!row || !bytes) throw notFound("Gambar");
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": row.mime,
            "cache-control": "public, max-age=31536000, immutable",
            "x-content-type-options": "nosniff",
            // Gambar ini dipajang di situs lain (landing), jadi boleh dimuat lintas origin.
            "cross-origin-resource-policy": "cross-origin",
          },
        });
      })
  );
}
