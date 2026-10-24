import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { like } from "drizzle-orm";
import { createDb, schema } from "@ssb/db";
import {
  blocksToText,
  mediaIdsIn,
  parseMarkdown,
  type PostAdminDetail,
  type PostAdminRow,
  type PostMedia,
  type PublicPost,
  type PublicPostList,
} from "@ssb/shared";
import { createApp, type AppType } from "./app";
import { createLogger } from "./logger";
import { esc } from "./seo";
import { slugFromTitle } from "./posts";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("markdown artikel", () => {
  const url = (id: string) => (id === ID ? `https://api.test/media/${id}` : null);

  test("mengurai blok, teks bergaya, dan gambar milik SSB", () => {
    const md = `## Judul\n\nParagraf **tebal** dan *miring* dengan [tautan](https://contoh.id).\nBaris kedua.\n\n- satu\n- dua\n\n1. a\n2. b\n\n> kutipan\n\n---\n\n![foto](media:${ID})`;
    const b = parseMarkdown(md, url);
    expect(b.map((x) => x.t)).toEqual(["h2", "p", "ul", "ol", "quote", "hr", "img"]);
    expect(b[1]).toMatchObject({
      t: "p",
      c: [
        { t: "text", v: "Paragraf " },
        { t: "bold" },
        { t: "text" },
        { t: "italic" },
        { t: "text" },
        { t: "link", href: "https://contoh.id" },
        { t: "text" },
        { t: "br" },
        { t: "text", v: "Baris kedua." },
      ],
    });
    expect(b[6]).toEqual({ t: "img", src: `https://api.test/media/${ID}`, alt: "foto" });
    expect(blocksToText(b)).toContain("Paragraf tebal dan miring dengan tautan. Baris kedua.");
  });

  test("tautan berbahaya dan HTML mentah tidak menjadi elemen; gambar luar atau tak dikenal dilewati", () => {
    const b = parseMarkdown(
      `[klik](javascript:alert(1)) <script>alert(1)</script>\n\n![x](https://jahat.test/a.png)\n\n![x](media:11111111-1111-4111-8111-111111111111)\n\n[ok](//jahat.test)`,
      url,
    );
    expect(b.map((x) => x.t)).toEqual(["p", "p", "p"]);
    const flat = JSON.stringify(b);
    expect(flat).not.toContain("javascript:");
    expect(flat).not.toContain('"t":"link"');
    // Teks mentah tetap teks; pengecualian karakter HTML dilakukan saat HTML dibuat.
    expect(esc('<script>"x"</script>')).toBe("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  });

  test("id media diambil dari isi dan alamat artikel dari judul", () => {
    expect(mediaIdsIn(`![a](media:${ID}) ![b](media:${ID.toUpperCase()}) ![c](media:bukan-uuid)`)).toEqual([ID]);
    expect(slugFromTitle("Juara Piala Soeratin U-15!")).toBe("juara-piala-soeratin-u-15");
    expect(slugFromTitle("Pelatih Baru: Café & Teknik")).toBe("pelatih-baru-cafe-teknik");
    expect(slugFromTitle("!!")).toBe("artikel");
  });

  const teks = (md: string) => parseMarkdown(md, url);
  const plain = (md: string) => blocksToText(teks(md));

  test("escape backslash menjadi karakternya tanpa makna sintaks, entitas dasar didekode", () => {
    expect(teks("\\*bukan miring\\* dan \\_bukan\\_ \\[x\\](https://a.id) \\\\ \\# \\- 1\\. \\>")).toEqual([
      { t: "p", c: [{ t: "text", v: "*bukan miring* dan _bukan_ [x](https://a.id) \\ # - 1. >" }] },
    ]);
    // Awal baris yang di-escape tidak menjadi judul, daftar, kutipan, atau garis.
    expect(teks("\\## bukan judul\n\n\\- bukan daftar\n\n1\\. bukan\n\n\\> bukan\n\n\\---").map((b) => b.t)).toEqual(["p", "p", "p", "p", "p"]);
    expect(plain("A &amp; B &lt;c&gt; &quot;d&quot; &amp;amp; &copy;")).toBe('A & B <c> "d" &amp; &copy;');
    // Garis miring tanpa tanda baca sesudahnya dibiarkan, tautan tetap disaring walau penandanya di-escape.
    expect(plain("a \\b c")).toBe("a \\b c");
    expect(JSON.stringify(teks("\\[x](javascript:alert(1)) [y\\]z](javascript:alert(1))"))).not.toContain('"link"');
    expect(teks("[a\\]b](https://a.id)")).toEqual([{ t: "p", c: [{ t: "link", href: "https://a.id", c: [{ t: "text", v: "a]b" }] }] }]);
  });

  test("backslash di akhir baris = jeda baris; genap = garis miring biasa", () => {
    expect(teks("satu\\\ndua")).toEqual([{ t: "p", c: [{ t: "text", v: "satu" }, { t: "br" }, { t: "text", v: "dua" }] }]);
    expect(teks("satu\\\\\ndua")).toEqual([{ t: "p", c: [{ t: "text", v: "satu\\" }, { t: "br" }, { t: "text", v: "dua" }] }]);
    expect(teks("satu  \ndua")).toEqual(teks("satu\ndua"));
    // Backslash di ujung paragraf tetap teks.
    expect(plain("akhir\\")).toBe("akhir\\");
  });

  test("penanda tebal dan miring boleh bersarang; yang tak berpasangan tetap teks", () => {
    expect(teks("**a *b* c**")).toEqual([
      {
        t: "p",
        c: [
          {
            t: "bold",
            c: [
              { t: "text", v: "a " },
              { t: "italic", c: [{ t: "text", v: "b" }] },
              { t: "text", v: " c" },
            ],
          },
        ],
      },
    ]);
    expect(teks("***x***")).toEqual([{ t: "p", c: [{ t: "bold", c: [{ t: "italic", c: [{ t: "text", v: "x" }] }] }] }]);
    expect(teks("*a **b** c*")).toEqual([
      {
        t: "p",
        c: [
          {
            t: "italic",
            c: [
              { t: "text", v: "a " },
              { t: "bold", c: [{ t: "text", v: "b" }] },
              { t: "text", v: " c" },
            ],
          },
        ],
      },
    ]);
    expect(teks("_i_ dan __b__ dan snake_case_name")).toMatchObject([
      { t: "p", c: [{ t: "italic" }, { t: "text", v: " dan " }, { t: "bold" }, { t: "text", v: " dan snake_case_name" }] },
    ]);
    expect(plain("2 * 3 * 4 dan **buka tanpa tutup dan *sendiri")).toBe("2 * 3 * 4 dan **buka tanpa tutup dan *sendiri");
  });

  test("heading, garis, kutipan, daftar, dan gambar memutus paragraf; baris biasa menyambung daftar dan kutipan", () => {
    expect(teks(`Daftar:\n- a\n- b\nsambung\n## Judul\nisi\n---\n> q1\nlazy\n1. satu\n2. dua\n![f](media:${ID})`).map((b) => b.t)).toEqual([
      "p",
      "ul",
      "h2",
      "p",
      "hr",
      "quote",
      "ol",
      "img",
    ]);
    const ul = teks("- a\n  lanjut\n- b")[0];
    expect(ul).toMatchObject({ t: "ul", items: [[{ t: "text", v: "a" }, { t: "br" }, { t: "text", v: "lanjut" }], [{ t: "text", v: "b" }]] });
    // Daftar sejenis yang dipisah baris kosong adalah satu daftar; kutipan kosong dilewati; "2024." bukan awal daftar di tengah paragraf.
    expect(teks("- a\n\n- b").map((b) => b.t)).toEqual(["ul"]);
    expect(teks(">\n\nsetelah").map((b) => b.t)).toEqual(["p"]);
    expect(teks("Tahun\n2024. Juara").map((b) => b.t)).toEqual(["p"]);
    expect(teks("Daftar\n1. satu").map((b) => b.t)).toEqual(["p", "ol"]);
  });
});

const dbUrl = process.env.DATABASE_URL;
const run = dbUrl ? describe : describe.skip;

run("artikel landing page (database)", () => {
  const { db, client } = createDb(dbUrl!);
  const uid = randomUUID().slice(0, 8);
  const PASS = "kata-sandi-panjang-1";
  const API = "https://api.test/api";
  let dir = "";
  let indexPath = "";
  let app: AppType;

  const call = (method: string, path: string, cookie?: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      ...(method !== "GET" && method !== "DELETE" ? { body: JSON.stringify(body ?? {}) } : {}),
    });
  const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;
  const sessionOf = (res: Response) =>
    res.headers
      .getSetCookie()
      .find((c) => c.startsWith("ssb_session="))!
      .split(";")[0]!;
  const png = (extra = 64): Uint8Array<ArrayBuffer> => {
    const b = new Uint8Array(new ArrayBuffer(8 + extra));
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return b;
  };
  const upload = (cookie: string, bytes: Uint8Array, name = "a.png") => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(bytes)], name, { type: "image/png" }));
    return app.request("/posts/media", { method: "POST", headers: { cookie, origin: "http://localhost:3001" }, body: form });
  };
  const artikel = (judul: string, extra: Record<string, unknown> = {}) => ({
    title: { id: judul },
    excerpt: { id: "Ringkasan singkat." },
    body: { id: "Paragraf pertama.\n\nParagraf kedua." },
    ...extra,
  });

  async function daftar(tag: string) {
    const reg = await app.request("/auth/register-ssb", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ssbName: `Berita ${tag} ${uid}`,
        slug: `br-${tag}-${uid}`,
        adminName: `Admin ${tag}`,
        email: `admin-${tag}-${uid}@uji.test`,
        password: PASS,
      }),
    });
    expect(reg.status).toBe(201);
    const admin = sessionOf(reg);
    const undang = async (role: string) => {
      const inv = await call("POST", "/invitations", admin, { role });
      const { token } = await json<{ token: string }>(inv);
      const acc = await app.request(`/invitations/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `${role} ${tag}`, email: `${role}-${tag}-${uid}@uji.test`, password: PASS }),
      });
      expect(acc.status).toBe(201);
      return sessionOf(acc);
    };
    return { admin, slug: `br-${tag}-${uid}`, pelatih: await undang("pelatih"), ortu: await undang("orang_tua") };
  }

  test("siapkan aplikasi dengan folder upload dan kerangka landing sementara", async () => {
    dir = await mkdtemp(join(tmpdir(), "ssb-post-"));
    indexPath = join(dir, "index.html");
    await writeFile(
      indexPath,
      `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Landing</title><meta name="description" content="x" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:type" content="website" /><link rel="canonical" href="https://lama.test/" /></head><body><div id="root"></div></body></html>`,
    );
    app = createApp(
      db,
      {
        NODE_ENV: "test",
        ALLOWED_ORIGINS: "http://localhost:3001",
        WEB_URL: "http://web.test",
        SESSION_SECRET: "x".repeat(40),
        UPLOAD_DIR: dir,
        PUBLIC_API_URL: API,
        LANDING_URL: "https://landing.test",
        LANDING_INDEX_PATH: indexPath,
      },
      { google: null, logger: createLogger({}) },
    );
  });

  afterAll(async () => {
    const bersih = createDb(dbUrl!);
    await bersih.db.delete(schema.account).where(like(schema.account.email, `%${uid}%`));
    await bersih.client.end();
    await client.end({ timeout: 2 });
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test("orang tua tidak boleh; pelatih boleh menulis dan hanya menyunting miliknya, admin menyunting semuanya", async () => {
    const a = await daftar("izin");
    expect((await call("GET", "/posts", a.ortu)).status).toBe(403);
    expect((await call("POST", "/posts", a.ortu, artikel("Tidak boleh"))).status).toBe(403);
    expect((await upload(a.ortu, png())).status).toBe(403);
    expect((await call("GET", "/posts")).status).toBe(401);

    const milikAdmin = await json<PostAdminDetail>(await call("POST", "/posts", a.admin, artikel("Tulisan admin")));
    const milikPelatih = await json<PostAdminDetail>(await call("POST", "/posts", a.pelatih, artikel("Tulisan pelatih")));
    expect([milikAdmin.status, milikAdmin.canEdit]).toEqual(["draft", true]);

    // Pelatih melihat semua artikel, tetapi hanya miliknya yang boleh disunting.
    const daftarPelatih = await json<PostAdminRow[]>(await call("GET", "/posts", a.pelatih));
    expect(Object.fromEntries(daftarPelatih.map((r) => [r.slug, r.canEdit]))).toEqual({ "tulisan-admin": false, "tulisan-pelatih": true });
    const put = (cookie: string, id: string) => call("PUT", `/posts/${id}`, cookie, artikel("Diubah"));
    expect((await put(a.pelatih, milikAdmin.id)).status).toBe(403);
    expect((await call("POST", `/posts/${milikAdmin.id}/publish`, a.pelatih)).status).toBe(403);
    expect((await call("DELETE", `/posts/${milikAdmin.id}`, a.pelatih)).status).toBe(403);
    expect((await put(a.pelatih, milikPelatih.id)).status).toBe(200);
    expect((await put(a.admin, milikPelatih.id)).status).toBe(200);
    expect((await call("DELETE", `/posts/${milikPelatih.id}`, a.admin)).status).toBe(200);
    expect((await call("GET", `/posts/${milikPelatih.id}`, a.admin)).status).toBe(404);
    expect((await call("GET", "/posts/bukan-uuid", a.admin)).status).toBe(404);
  });

  test("draf, terbit, tarik: pengunjung hanya melihat yang terbit; alamat dibuat dari judul dan dijaga unik", async () => {
    const a = await daftar("alur");
    const satu = await json<PostAdminDetail>(await call("POST", "/posts", a.admin, artikel("Juara Piala Soeratin!")));
    const dua = await json<PostAdminDetail>(await call("POST", "/posts", a.admin, artikel("Juara Piala Soeratin!")));
    expect([satu.slug, dua.slug]).toEqual(["juara-piala-soeratin", "juara-piala-soeratin-2"]);
    const bentrok = await call("POST", "/posts", a.admin, artikel("Lain", { slug: "juara-piala-soeratin" }));
    expect(bentrok.status).toBe(400);
    expect((await json<{ error: { fields: Record<string, string> } }>(bentrok)).error.fields.slug).toBeTruthy();
    const salah = await call("POST", "/posts", a.admin, { ...artikel("x"), body: { id: "" } });
    expect(salah.status).toBe(400);

    // Draf belum tampil.
    const kosong = await json<PublicPostList>(await call("GET", `/public/site/${a.slug}/posts`));
    expect([kosong.total, kosong.items.length]).toEqual([0, 0]);
    expect((await call("GET", `/public/site/${a.slug}/posts/${satu.slug}`)).status).toBe(404);

    const terbit = await json<PostAdminDetail>(await call("POST", `/posts/${satu.id}/publish`, a.admin));
    expect([terbit.status, terbit.publishedAt !== null]).toEqual(["published", true]);
    const res = await call("GET", `/public/site/${a.slug}/posts`);
    expect(res.headers.get("cache-control")).toContain("max-age");
    const list = await json<PublicPostList>(res);
    expect(list.total).toBe(1);
    expect(Object.keys(list.items[0]!).sort()).toEqual(["authorName", "category", "coverAlt", "coverUrl", "excerpt", "publishedAt", "slug", "title"]);
    const detail = await json<PublicPost>(await call("GET", `/public/site/${a.slug}/posts/${satu.slug}`));
    expect(detail.blocks.id.map((b) => b.t)).toEqual(["p", "p"]);
    expect(detail.blocks.en).toBeUndefined();

    // Draf kedua tetap tersembunyi; tarik membuat 404 lagi.
    expect((await call("GET", `/public/site/${a.slug}/posts/${dua.slug}`)).status).toBe(404);
    const tarik = await json<PostAdminDetail>(await call("POST", `/posts/${satu.id}/unpublish`, a.admin));
    expect([tarik.status, tarik.publishedAt]).toEqual(["draft", null]);
    expect((await call("GET", `/public/site/${a.slug}/posts/${satu.slug}`)).status).toBe(404);
    expect((await call("GET", "/public/site/tidak-ada-sama-sekali/posts")).status).toBe(404);
  });

  test("gambar: unggah, dibaca publik, dirujuk dari isi; tipe, ukuran, dan kepemilikan diperiksa", async () => {
    const a = await daftar("gbr");
    const b = await daftar("gbr2");
    expect((await upload(a.admin, new TextEncoder().encode("bukan gambar"))).status).toBe(415);
    expect((await upload(a.admin, png(6 * 1024 * 1024))).status).toBe(413);
    const up = await upload(a.admin, png());
    expect(up.status).toBe(201);
    const media = await json<PostMedia>(up);
    expect(media.url).toBe(`${API}/public/site/${a.slug}/media/${media.id}`);
    expect(media.markdown).toBe(`![](media:${media.id})`);

    const baca = await call("GET", `/public/site/${a.slug}/media/${media.id}`);
    expect([baca.status, baca.headers.get("content-type"), baca.headers.get("cross-origin-resource-policy")]).toEqual([200, "image/png", "cross-origin"]);
    expect(baca.headers.get("cache-control")).toContain("immutable");
    // Id yang sama lewat kode SSB lain tidak membuka berkas.
    expect((await call("GET", `/public/site/${b.slug}/media/${media.id}`)).status).toBe(404);

    const dengan = await json<PostAdminDetail>(
      await call(
        "POST",
        "/posts",
        a.admin,
        artikel("Berita bergambar", {
          coverMediaId: media.id,
          coverAlt: "Tim berlatih",
          body: { id: `Awal.\n\n${media.markdown.replace("![]", "![Tim]")}\n\nAkhir.` },
        }),
      ),
    );
    expect([dengan.coverUrl, dengan.mediaBase]).toEqual([media.url, `${API}/public/site/${a.slug}/media/`]);
    await call("POST", `/posts/${dengan.id}/publish`, a.admin);
    const pub = await json<PublicPost>(await call("GET", `/public/site/${a.slug}/posts/${dengan.slug}`));
    expect(pub.coverUrl).toBe(media.url);
    expect(pub.blocks.id[1]).toEqual({ t: "img", src: media.url, alt: "Tim" });

    // Rujukan ke gambar yang tidak ada atau milik SSB lain ditolak dengan pesan per kolom.
    const asing = await json<PostMedia>(await upload(b.admin, png()));
    const tolakSampul = await call("POST", "/posts", a.admin, artikel("Sampul asing", { coverMediaId: asing.id }));
    expect(tolakSampul.status).toBe(400);
    expect((await json<{ error: { fields: Record<string, string> } }>(tolakSampul)).error.fields.coverMediaId).toBeTruthy();
    const tolakIsi = await call("POST", "/posts", a.admin, artikel("Isi asing", { body: { id: `![x](media:${asing.id})` } }));
    expect(tolakIsi.status).toBe(400);
    expect((await json<{ error: { fields: Record<string, string> } }>(tolakIsi)).error.fields["body.id"]).toBeTruthy();
  });

  test("isian English ikut keluar bila diisi; tautan dan HTML di isi tidak menjadi elemen", async () => {
    const a = await daftar("en");
    const p = await json<PostAdminDetail>(
      await call(
        "POST",
        "/posts",
        a.admin,
        artikel("Dua bahasa", {
          title: { id: "Dua bahasa", en: "Two languages" },
          body: { id: "[x](javascript:alert(1)) <script>alert(1)</script>", en: "English body" },
        }),
      ),
    );
    await call("POST", `/posts/${p.id}/publish`, a.admin);
    const pub = await json<PublicPost>(await call("GET", `/public/site/${a.slug}/posts/${p.slug}`));
    expect(pub.title.en).toBe("Two languages");
    expect(pub.blocks.en?.[0]?.t).toBe("p");
    expect(JSON.stringify(pub.blocks.id)).not.toContain('"t":"link"');
  });

  test("isolasi: tiap SSB hanya melihat artikelnya sendiri", async () => {
    const a = await daftar("isa");
    const b = await daftar("isb");
    const pa = await json<PostAdminDetail>(await call("POST", "/posts", a.admin, artikel("Milik A")));
    await call("POST", `/posts/${pa.id}/publish`, a.admin);
    expect((await json<PostAdminRow[]>(await call("GET", "/posts", b.admin))).length).toBe(0);
    expect((await call("GET", `/posts/${pa.id}`, b.admin)).status).toBe(404);
    expect((await call("PUT", `/posts/${pa.id}`, b.admin, artikel("Curian"))).status).toBe(404);
    expect((await call("DELETE", `/posts/${pa.id}`, b.admin)).status).toBe(404);
    expect((await json<PublicPostList>(await call("GET", `/public/site/${b.slug}/posts`))).total).toBe(0);
    expect((await call("GET", `/public/site/${b.slug}/posts/${pa.slug}`)).status).toBe(404);
  });

  test("halaman SEO: kerangka landing terisi judul, meta, data terstruktur, dan isi yang di-escape; sitemap memuat artikel terbit", async () => {
    const a = await daftar("seo");
    const p = await json<PostAdminDetail>(
      await call(
        "POST",
        "/posts",
        a.admin,
        artikel('Berita <b>"penting"</b> & baru', {
          excerpt: { id: 'Ringkasan "kutip" <i>' },
          body: { id: "Isi dengan <script>alert(1)</script> dan **tebal**." },
        }),
      ),
    );
    // Draf: 404 dan noindex.
    const draf = await call("GET", `/public/seo/${a.slug}/berita/${p.slug}`);
    expect(draf.status).toBe(404);
    expect(await draf.text()).toContain('name="robots" content="noindex"');

    await call("POST", `/posts/${p.id}/publish`, a.admin);
    const res = await call("GET", `/public/seo/${a.slug}/berita/${p.slug}`);
    expect([res.status, res.headers.get("content-type")]).toEqual([200, "text/html; charset=utf-8"]);
    const html = await res.text();
    expect(html).toContain("<title>Berita &lt;b&gt;&quot;penting&quot;&lt;/b&gt; &amp; baru | ");
    expect(html).toContain(`<link rel="canonical" href="https://landing.test/berita/${p.slug}" />`);
    expect(html.match(/property="og:type"/g)?.length).toBe(1);
    expect(html.match(/rel="canonical"/g)?.length).toBe(1);
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain("<strong>tebal</strong>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html.match(/<title>/g)?.length).toBe(1);
    expect(html).toMatch(/<div id="root"><main>/);

    const daftarHtml = await (await call("GET", `/public/seo/${a.slug}/berita`)).text();
    expect(daftarHtml).toContain(`href="/berita/${p.slug}"`);

    const peta = await call("GET", `/public/seo/${a.slug}/sitemap.xml`);
    expect(peta.headers.get("content-type")).toContain("application/xml");
    const xml = await peta.text();
    expect(xml).toContain(`<loc>https://landing.test/berita/${p.slug}</loc>`);
    expect(xml).toContain("<loc>https://landing.test/berita</loc>");

    expect((await call("GET", `/public/seo/${a.slug}/berita/tidak-ada`)).status).toBe(404);
    expect((await call("GET", "/public/seo/ssb-tidak-ada/berita")).status).toBe(404);
  });
});
