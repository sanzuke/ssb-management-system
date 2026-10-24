import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { schema, withTenant, type Db } from "@ssb/db";
import { blocksToText, type Block, type Inline, type PublicPost, type PublicPostSummary } from "@ssb/shared";
import type { AppEnv } from "./auth/middleware";
import { ssbIdBySlug } from "./auth/service";
import { clampPage, loadPublicList, loadPublicPost } from "./posts";
import { HttpError } from "./errors";

/**
 * Halaman berita untuk mesin pencari. Landing adalah aplikasi satu halaman yang mengambil konten lewat JavaScript,
 * jadi untuk /berita dan /berita/<slug> Nginx meminta HTML dari sini: kerangka build landing (index.html) dengan judul,
 * meta, data terstruktur, dan isi artikel sudah terisi. Di browser, React mengambil alih dan menggantikan isinya.
 */

export type SeoOptions = {
  publicApiUrl: string;
  /** Alamat situs landing tanpa garis miring akhir; dasar alamat kanonik dan sitemap. */
  landingUrl: string;
  /** index.html hasil build landing. */
  landingIndexPath: string;
};

const FALLBACK_TEMPLATE = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title></title><meta name="description" content="" /><meta property="og:title" content="" /><meta property="og:description" content="" /></head><body><div id="root"></div></body></html>`;

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const inlineHtml = (c: Inline[]): string =>
  c
    .map((n) => {
      switch (n.t) {
        case "text":
          return esc(n.v);
        case "br":
          return "<br>";
        case "bold":
          return `<strong>${inlineHtml(n.c)}</strong>`;
        case "italic":
          return `<em>${inlineHtml(n.c)}</em>`;
        case "link":
          return `<a href="${esc(n.href)}">${inlineHtml(n.c)}</a>`;
        default:
          return "";
      }
    })
    .join("");

/** Blok aman menjadi HTML. Semua teks di-escape; tautan dan gambar sudah disaring oleh penguraian Markdown. */
export function blocksHtml(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.t) {
        case "h2":
          return `<h2>${inlineHtml(b.c)}</h2>`;
        case "h3":
          return `<h3>${inlineHtml(b.c)}</h3>`;
        case "p":
          return `<p>${inlineHtml(b.c)}</p>`;
        case "quote":
          return `<blockquote>${inlineHtml(b.c)}</blockquote>`;
        case "ul":
          return `<ul>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</ul>`;
        case "ol":
          return `<ol>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join("")}</ol>`;
        case "img":
          return `<figure><img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy"></figure>`;
        case "hr":
          return "<hr>";
        default:
          return "";
      }
    })
    .join("\n");
}

const tanggal = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" });
const potong = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

type Page = {
  title: string;
  description: string;
  canonical: string;
  ogType: "website" | "article";
  image?: string | null;
  jsonLd?: unknown;
  body: string;
  status?: 200 | 404;
};

/** Suntik judul, meta, data terstruktur, dan isi ke kerangka landing. */
export function fillTemplate(tpl: string, p: Page): string {
  const head = [
    `<link rel="canonical" href="${esc(p.canonical)}" />`,
    `<meta property="og:type" content="${p.ogType}" />`,
    `<meta property="og:url" content="${esc(p.canonical)}" />`,
    ...(p.image
      ? [`<meta property="og:image" content="${esc(p.image)}" />`, `<meta name="twitter:card" content="summary_large_image" />`]
      : [`<meta name="twitter:card" content="summary" />`]),
    ...(p.status === 404 ? [`<meta name="robots" content="noindex" />`] : []),
    // JSON-LD: karakter "<" di-escape agar teks artikel tidak bisa menutup tag script.
    ...(p.jsonLd ? [`<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, "\\u003c")}</script>`] : []),
  ].join("\n    ");
  const meta = (re: RegExp, tag: string, src: string) => (re.test(src) ? src.replace(re, () => tag) : src.replace("</head>", () => `${tag}\n  </head>`));
  let out = tpl;
  out = /<title>[\s\S]*?<\/title>/.test(out)
    ? out.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(p.title)}</title>`)
    : out.replace("</head>", () => `<title>${esc(p.title)}</title>\n  </head>`);
  out = meta(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${esc(p.description)}" />`, out);
  out = meta(/<meta\s+property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(p.title)}" />`, out);
  out = meta(/<meta\s+property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(p.description)}" />`, out);
  out = out.replace("</head>", () => `${head}\n  </head>`);
  out = /<div id="root"><\/div>/.test(out)
    ? out.replace(/<div id="root"><\/div>/, () => `<div id="root">${p.body}</div>`)
    : out.replace("</body>", () => `<div id="root">${p.body}</div></body>`);
  return out;
}

export function seoRoutes(db: Db, opts: SeoOptions) {
  const landing = opts.landingUrl.replace(/\/+$/, "");
  let cached: { text: string; at: number } | null = null;
  const template = async () => {
    if (cached && Date.now() - cached.at < 30_000) return cached.text;
    const text = await readFile(opts.landingIndexPath, "utf8").catch(() => FALLBACK_TEMPLATE);
    cached = { text, at: Date.now() };
    return text;
  };

  const context = async (rawSlug: string) => {
    const slug = rawSlug.toLowerCase();
    const ssbId = await ssbIdBySlug(db, slug);
    if (!ssbId) throw new HttpError(404, "not_found", "Situs tidak ditemukan");
    const name = await withTenant(db, ssbId, async (tx) => {
      const [s] = await tx.select({ name: schema.ssb.name }).from(schema.ssb).where(eq(schema.ssb.id, ssbId)).limit(1);
      return s?.name ?? slug;
    });
    return { slug, ssbId, name };
  };

  const html = (c: { header: (k: string, v: string) => void; body: (b: string, s?: 200 | 404) => Response }, doc: string, status: 200 | 404 = 200) => {
    c.header("content-type", "text/html; charset=utf-8");
    c.header("cache-control", status === 200 ? "public, max-age=60" : "no-store");
    return c.body(doc, status);
  };

  const card = (p: PublicPostSummary) =>
    `<article><h2><a href="/berita/${esc(p.slug)}">${esc(p.title.id)}</a></h2><p><time datetime="${esc(p.publishedAt)}">${esc(tanggal(p.publishedAt))}</time>${p.category ? ` · ${esc(p.category)}` : ""}</p>${p.excerpt.id ? `<p>${esc(p.excerpt.id)}</p>` : ""}</article>`;

  return new Hono<AppEnv>()
    .get("/public/seo/:slug/berita", async (c) => {
      const { slug, ssbId, name } = await context(c.req.param("slug"));
      const page = clampPage(c.req.query("page"), 1, 10_000);
      const list = await loadPublicList(db, ssbId, slug, opts.publicApiUrl, page, 9);
      const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
      const nav = [
        page > 1 ? `<a href="/berita${page - 1 > 1 ? `?page=${page - 1}` : ""}">Sebelumnya</a>` : "",
        page < pages ? `<a href="/berita?page=${page + 1}">Berikutnya</a>` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const doc = fillTemplate(await template(), {
        title: `Berita dan Artikel | ${name}`,
        description: `Kabar terbaru, kegiatan, dan artikel pembinaan dari ${name}.`,
        canonical: page > 1 ? `${landing}/berita?page=${page}` : `${landing}/berita`,
        ogType: "website",
        body: `<main><h1>Berita dan Artikel</h1>${list.items.map(card).join("\n")}${list.items.length === 0 ? "<p>Belum ada artikel.</p>" : ""}<nav>${nav}</nav></main>`,
        status: page > 1 && list.items.length === 0 ? 404 : 200,
      });
      return html(c, doc, page > 1 && list.items.length === 0 ? 404 : 200);
    })

    .get("/public/seo/:slug/berita/:postSlug", async (c) => {
      const { slug, ssbId, name } = await context(c.req.param("slug"));
      const post: PublicPost | null = await loadPublicPost(db, ssbId, c.req.param("postSlug").toLowerCase(), opts.publicApiUrl, slug);
      if (!post) {
        const doc = fillTemplate(await template(), {
          title: `Artikel tidak ditemukan | ${name}`,
          description: "Artikel yang Anda cari tidak ditemukan.",
          canonical: `${landing}/berita`,
          ogType: "website",
          body: `<main><h1>Artikel tidak ditemukan</h1><p><a href="/berita">Lihat semua berita</a></p></main>`,
          status: 404,
        });
        return html(c, doc, 404);
      }
      const url = `${landing}/berita/${post.slug}`;
      const plain = blocksToText(post.blocks.id);
      const description = potong(post.excerpt.id || plain, 160);
      const doc = fillTemplate(await template(), {
        title: `${post.title.id} | ${name}`,
        description,
        canonical: url,
        ogType: "article",
        image: post.coverUrl,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: post.title.id,
          description,
          datePublished: post.publishedAt,
          dateModified: post.updatedAt,
          mainEntityOfPage: url,
          ...(post.coverUrl ? { image: [post.coverUrl] } : {}),
          author: { "@type": "Person", name: post.authorName },
          publisher: { "@type": "Organization", name },
          inLanguage: "id",
        },
        body: `<main><article><header>${post.category ? `<p>${esc(post.category)}</p>` : ""}<h1>${esc(post.title.id)}</h1><p><time datetime="${esc(post.publishedAt)}">${esc(tanggal(post.publishedAt))}</time> · ${esc(post.authorName)}</p></header>${post.coverUrl ? `<figure><img src="${esc(post.coverUrl)}" alt="${esc(post.coverAlt)}"></figure>` : ""}${blocksHtml(post.blocks.id)}</article><p><a href="/berita">Semua berita</a></p></main>`,
      });
      return html(c, doc);
    })

    .get("/public/seo/:slug/sitemap.xml", async (c) => {
      const { ssbId } = await context(c.req.param("slug"));
      const rows = await withTenant(db, ssbId, (tx) =>
        tx.select({ slug: schema.sitePost.slug, updatedAt: schema.sitePost.updatedAt }).from(schema.sitePost).where(eq(schema.sitePost.status, "published")),
      );
      const urls = [
        `<url><loc>${esc(`${landing}/`)}</loc></url>`,
        `<url><loc>${esc(`${landing}/berita`)}</loc></url>`,
        ...rows.map((r) => `<url><loc>${esc(`${landing}/berita/${r.slug}`)}</loc><lastmod>${r.updatedAt.toISOString()}</lastmod></url>`),
      ];
      c.header("content-type", "application/xml; charset=utf-8");
      c.header("cache-control", "public, max-age=300");
      return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
    });
}
