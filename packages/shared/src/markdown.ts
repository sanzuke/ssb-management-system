/**
 * Isi artikel ditulis dalam Markdown sederhana dan diurai menjadi blok bertipe. Tampilan (landing, pratinjau SSB MS)
 * hanya merender blok ini sebagai elemen, tanpa HTML mentah, sehingga isi artikel tidak bisa menyisipkan skrip.
 *
 * Yang didukung: `## Judul`, `### Subjudul`, paragraf (baris baru atau `\` di akhir baris = pindah baris), `- daftar`,
 * `1. daftar bernomor`, `> kutipan`, `---` garis, `![keterangan](media:<id>)` gambar, serta `**tebal**`, `*miring*`,
 * `[teks](tautan)`. Tanda baca ASCII boleh di-escape dengan `\` (mis. `\*`), dan `&amp; &lt; &gt; &quot;` menjadi
 * karakternya; keduanya dihasilkan editor visual. Gambar hanya boleh merujuk media milik SSB (`media:<id>`); tautan
 * hanya http, https, mailto, atau jalur `/`.
 *
 * Batas blok mengikuti CommonMark: heading, garis, gambar, kutipan, dan butir daftar memutus paragraf walau tanpa baris
 * kosong; baris biasa setelah butir daftar atau kutipan menyambung ke blok itu.
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

/** Tautan yang boleh dipakai isi artikel: http, https, mailto, atau jalur `/`. Dipakai parser dan editor visual. */
export const isSafeLink = (href: string) => SAFE_LINK.test(href);
/** Id media artikel yang valid (UUID). */
export const isMediaId = (id: string) => MEDIA_ID.test(id);

const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"' } as const;
const decodeEntities = (s: string) => s.replace(/&(amp|lt|gt|quot);/g, (_, n: keyof typeof ENTITY) => ENTITY[n]);
const ESCAPABLE = /[!-/:-@[-`{-~]/;
const LINK = /^\[((?:\\.|[^\]\\])+)\]\(([^)\s]+)\)/;
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Tambah simpul; teks bersebelahan digabung. */
function addNode(kids: Inline[], n: Inline) {
  const last = kids[kids.length - 1];
  if (n.t === "text" && last?.t === "text") last.v += n.v;
  else kids.push(n);
}

type Frame = { ch: string; len: number; kids: Inline[]; run: number; both: boolean };

/**
 * Teks bergaya: **tebal**, *miring*, [teks](tautan). Penanda boleh bersarang (`**a *b* c**`, `***x***`); yang tidak
 * berpasangan dibiarkan sebagai teks biasa.
 */
export function parseInline(src: string, depth = 0): Inline[] {
  const stack: Frame[] = [{ ch: "", len: 0, kids: [], run: 0, both: false }];
  const top = () => stack[stack.length - 1]!;
  let raw = "";
  let done = "";
  const flush = () => {
    const v = done + decodeEntities(raw);
    raw = "";
    done = "";
    if (v) addNode(top().kids, { t: "text", v });
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "\\" && next !== undefined && ESCAPABLE.test(next)) {
      done += decodeEntities(raw) + next;
      raw = "";
      i += 2;
      continue;
    }
    if (c === "*" || c === "_") {
      let n = 1;
      while (src[i + n] === c) n++;
      const before = src[i - 1];
      const after = src[i + n];
      const canOpen = !isSpace(after) && !(c === "_" && isWord(before));
      const canClose = !isSpace(before) && !(c === "_" && isWord(after));
      let left = n;
      flush();
      while (canClose && left > 0 && stack.length > 1 && top().ch === c) {
        const fr = top();
        // Aturan kelipatan 3 (CommonMark): penanda yang bisa membuka sekaligus menutup tidak memadankan pasangan berjumlah kelipatan 3.
        if ((fr.both || canOpen) && (fr.run + n) % 3 === 0 && !(fr.run % 3 === 0 && n % 3 === 0)) break;
        // Pasangan memakai dua penanda (tebal) bila keduanya punya cukup; sisanya tetap terbuka di luar. `***x***` = tebal berisi miring.
        const pakai = fr.len === 3 && left >= 3 ? 1 : fr.len >= 2 && left >= 2 ? 2 : 1;
        const node: Inline = pakai === 2 ? { t: "bold", c: fr.kids } : { t: "italic", c: fr.kids };
        fr.len -= pakai;
        left -= pakai;
        if (fr.len === 0) {
          stack.pop();
          addNode(top().kids, node);
        } else {
          fr.kids = [node];
        }
      }
      if (left > 0 && left <= 3 && canOpen) {
        stack.push({ ch: c, len: left, kids: [], run: n, both: canClose });
      } else if (left > 0) {
        raw += c.repeat(left);
      }
      i += n;
      continue;
    }
    // Gambar di tengah kalimat tidak didukung (gambar harus satu baris sendiri); tampilkan keterangannya saja.
    if (c === "!" && next === "[") {
      const inlineImg = /^!\[([^\]]*)\]\([^)\s]*\)/.exec(src.slice(i));
      if (inlineImg) {
        raw += inlineImg[1] ?? "";
        i += inlineImg[0].length;
        continue;
      }
    }
    if (c === "[" && depth < MAX_INLINE_DEPTH) {
      const link = LINK.exec(src.slice(i));
      if (link?.[1] && link[2]) {
        flush();
        const inner = parseInline(link[1], depth + 1);
        if (SAFE_LINK.test(link[2])) addNode(top().kids, { t: "link", href: link[2], c: inner });
        else for (const k of inner) addNode(top().kids, k);
        i += link[0].length;
        continue;
      }
    }
    raw += c;
    i++;
  }
  flush();
  // Penanda yang tak pernah ditutup menjadi teks biasa.
  while (stack.length > 1) {
    const fr = stack.pop()!;
    const parent = top();
    addNode(parent.kids, { t: "text", v: fr.ch.repeat(fr.len) });
    for (const k of fr.kids) addNode(parent.kids, k);
  }
  return stack[0]!.kids;
}

/** `\` ganjil di akhir baris = jeda baris eksplisit (sama dengan baris baru); genap = garis miring biasa. */
const tanpaJeda = (line: string) => {
  const tail = /\\+$/.exec(line)?.[0].length ?? 0;
  return tail % 2 === 1 ? line.slice(0, -1) : line;
};

/** Satu paragraf: baris baru di dalamnya menjadi <br>. */
function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, n) => {
    if (n > 0) out.push({ t: "br" });
    const t = line.trim();
    out.push(...parseInline(n < lines.length - 1 ? tanpaJeda(t) : t));
  });
  return out;
}

const HEADING = /^(#{2,3})\s+(.+)$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const QUOTE = /^>\s?/;
const BULLET = /^[-*]\s+/;
const ORDERED = /^\d+[.)]\s+/;

/** Baris yang memulai blok baru walau tanpa baris kosong. Daftar bernomor hanya memutus paragraf bila dimulai dari 1. */
const startsBlock = (t: string) => HEADING.test(t) || HR.test(t) || IMAGE_LINE.test(t) || QUOTE.test(t) || BULLET.test(t) || /^1[.)]\s+/.test(t);

/** Baca daftar mulai baris `from`: butir sejenis (juga lewat baris kosong), baris biasa menyambung butir terakhir. */
function takeList(lines: string[], from: number, marker: RegExp): { items: Inline[][]; end: number } {
  const items: string[][] = [];
  let i = from;
  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (!t) {
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim()) j++;
      if (j >= lines.length || !marker.test(lines[j]!.trim())) break;
      i = j;
      continue;
    }
    if (marker.test(t)) {
      items.push([t.replace(marker, "")]);
    } else if (startsBlock(t)) {
      break;
    } else {
      items[items.length - 1]?.push(t);
    }
    i++;
  }
  return { items: items.map(inlineLines), end: i };
}

/**
 * Uraikan Markdown menjadi blok. `mediaUrl` mengubah id media menjadi alamat gambar; id yang tidak dikenal
 * (mengembalikan null) membuat gambar itu dilewati.
 */
export function parseMarkdown(src: string, mediaUrl: (id: string) => string | null): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (!t) {
      i++;
      continue;
    }
    const h = HEADING.exec(t);
    const img = IMAGE_LINE.exec(t);
    if (HR.test(t)) {
      blocks.push({ t: "hr" });
      i++;
    } else if (h?.[2]) {
      blocks.push({ t: h[1] === "##" ? "h2" : "h3", c: parseInline(h[2].trim()) });
      i++;
    } else if (img?.[2] !== undefined) {
      const id = img[2];
      const url = MEDIA_ID.test(id) ? mediaUrl(id) : null;
      if (url) blocks.push({ t: "img", src: url, alt: (img[1] ?? "").trim() });
      i++;
    } else if (QUOTE.test(t)) {
      const q: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!.trim();
        if (!l || (!QUOTE.test(l) && startsBlock(l))) break;
        q.push(l.replace(QUOTE, ""));
        i++;
      }
      if (q.some((l) => l.trim())) blocks.push({ t: "quote", c: inlineLines(q) });
    } else if (BULLET.test(t) || ORDERED.test(t)) {
      const ordered = !BULLET.test(t);
      const list = takeList(lines, i, ordered ? ORDERED : BULLET);
      blocks.push(ordered ? { t: "ol", items: list.items } : { t: "ul", items: list.items });
      i = list.end;
    } else {
      const p: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!.trim();
        if (!l || (p.length > 0 && startsBlock(l))) break;
        p.push(l);
        i++;
      }
      blocks.push({ t: "p", c: inlineLines(p) });
    }
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
