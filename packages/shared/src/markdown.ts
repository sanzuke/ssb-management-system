/**
 * Isi artikel ditulis dalam Markdown sederhana dan diurai menjadi blok bertipe. Tampilan (landing, pratinjau SSB MS)
 * hanya merender blok ini sebagai elemen, tanpa HTML mentah, sehingga isi artikel tidak bisa menyisipkan skrip.
 *
 * Yang didukung: `## Judul`, `### Subjudul`, paragraf (baris baru = pindah baris), `- daftar`, `1. daftar bernomor`,
 * `> kutipan`, `---` garis, `![keterangan](media:<id>)` gambar, serta `**tebal**`, `*miring*`, `[teks](tautan)`.
 * Gambar hanya boleh merujuk media milik SSB (`media:<id>`); tautan hanya http, https, mailto, atau jalur `/`.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; c: Inline[] }
  | { t: "italic"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" };

export type Block =
  | { t: "h2"; c: Inline[] }
  | { t: "h3"; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "quote"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][] }
  | { t: "img"; src: string; alt: string }
  | { t: "hr" };

const SAFE_LINK = /^(https?:\/\/|mailto:|\/(?!\/))/i;
const MEDIA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_LINE = /^!\[([^\]]*)\]\(media:([^)\s]+)\)$/;
const MAX_INLINE_DEPTH = 4;

/** Teks bergaya: **tebal**, *miring*, [teks](tautan). Penanda yang tidak berpasangan dibiarkan sebagai teks biasa. */
export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (depth < MAX_INLINE_DEPTH) {
      const bold = /^\*\*([^*]+?)\*\*/.exec(rest);
      if (bold?.[1]) {
        flush();
        out.push({ t: "bold", c: parseInline(bold[1], depth + 1) });
        i += bold[0].length;
        continue;
      }
      const italic = /^\*([^*\s][^*]*?)\*/.exec(rest) ?? /^_([^_\s][^_]*?)_/.exec(rest);
      if (italic?.[1]) {
        flush();
        out.push({ t: "italic", c: parseInline(italic[1], depth + 1) });
        i += italic[0].length;
        continue;
      }
      // Gambar di tengah kalimat tidak didukung (gambar harus satu baris sendiri); tampilkan keterangannya saja.
      const inlineImg = /^!\[([^\]]*)\]\([^)\s]*\)/.exec(rest);
      if (inlineImg) {
        buf += inlineImg[1] ?? "";
        i += inlineImg[0].length;
        continue;
      }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (link?.[1] && link[2]) {
        if (SAFE_LINK.test(link[2])) {
          flush();
          out.push({ t: "link", href: link[2], c: parseInline(link[1], depth + 1) });
        } else {
          buf += link[1];
        }
        i += link[0].length;
        continue;
      }
    }
    buf += src[i];
    i++;
  }
  flush();
  return out;
}

/** Satu paragraf: baris baru di dalamnya menjadi <br>. */
function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, n) => {
    if (n > 0) out.push({ t: "br" });
    out.push(...parseInline(line.trim()));
  });
  return out;
}

/**
 * Uraikan Markdown menjadi blok. `mediaUrl` mengubah id media menjadi alamat gambar; id yang tidak dikenal
 * (mengembalikan null) membuat gambar itu dilewati.
 */
export function parseMarkdown(src: string, mediaUrl: (id: string) => string | null): Block[] {
  const blocks: Block[] = [];
  const groups = src.replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const group of groups) {
    const lines = group.split("\n").filter((l) => l.trim() !== "");
    const first = lines[0]?.trim();
    if (!first) continue;

    if (lines.length === 1 && /^-{3,}$/.test(first)) {
      blocks.push({ t: "hr" });
      continue;
    }
    const h = /^(#{2,3})\s+(.+)$/.exec(first);
    if (lines.length === 1 && h?.[2]) {
      blocks.push({ t: h[1] === "##" ? "h2" : "h3", c: parseInline(h[2].trim()) });
      continue;
    }
    const img = IMAGE_LINE.exec(first);
    if (lines.length === 1 && img?.[2] !== undefined) {
      const id = img[2];
      const url = MEDIA_ID.test(id) ? mediaUrl(id) : null;
      if (url) blocks.push({ t: "img", src: url, alt: (img[1] ?? "").trim() });
      continue;
    }
    if (lines.every((l) => /^>\s?/.test(l.trim()))) {
      blocks.push({ t: "quote", c: inlineLines(lines.map((l) => l.trim().replace(/^>\s?/, ""))) });
      continue;
    }
    if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) {
      blocks.push({ t: "ul", items: lines.map((l) => parseInline(l.trim().replace(/^[-*]\s+/, ""))) });
      continue;
    }
    if (lines.every((l) => /^\d+[.)]\s+/.test(l.trim()))) {
      blocks.push({ t: "ol", items: lines.map((l) => parseInline(l.trim().replace(/^\d+[.)]\s+/, ""))) });
      continue;
    }
    blocks.push({ t: "p", c: inlineLines(lines) });
  }
  return blocks;
}

const inlineText = (c: Inline[]): string =>
  c
    .map((n) => {
      if (n.t === "text") return n.v;
      if (n.t === "br") return " ";
      return inlineText(n.c);
    })
    .join("");

/** Teks polos dari blok, untuk ringkasan otomatis dan meta deskripsi. */
export function blocksToText(blocks: Block[]): string {
  return blocks
    .map((b) => {
      if (b.t === "img" || b.t === "hr") return "";
      if (b.t === "ul" || b.t === "ol") return b.items.map(inlineText).join(" ");
      return inlineText(b.c);
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Id media yang dirujuk isi artikel (untuk memeriksa bahwa semuanya milik SSB yang sama). */
export function mediaIdsIn(src: string): string[] {
  const ids = new Set<string>();
  for (const m of src.matchAll(/!\[[^\]]*\]\(media:([^)\s]+)\)/g)) {
    if (m[1] && MEDIA_ID.test(m[1])) ids.add(m[1].toLowerCase());
  }
  return [...ids];
}
