import { type Extensions, Extension, type JSONContent, mergeAttributes, Node } from "@tiptap/core";
import { ListItem } from "@tiptap/extension-list";
import StarterKit from "@tiptap/starter-kit";
import { type Block, type Inline, isMediaId, isSafeLink, parseMarkdown } from "@ssb/shared";

/**
 * Editor visual artikel (Tiptap) dibatasi ke subset Markdown yang dikenal `parseMarkdown` di @ssb/shared:
 * h2/h3, tebal, miring, tautan aman, daftar, kutipan, garis, jeda baris, dan gambar media SSB.
 *
 * Markdown tetap sumber kebenaran. Jalur masuk (`bacaMarkdown`) dan keluar (`tulisMarkdown`) sama-sama merapikan dokumen
 * ke bentuk yang bisa ditulis ulang tanpa mengubah arti menurut `parseMarkdown`.
 */

type Nd = JSONContent;

const bersihAlt = (alt: string) => alt.replace(/[[\]\s]+/g, " ").trim();

/** Gambar artikel: hanya merujuk media SSB lewat id; disimpan sebagai `![alt](media:<id>)`. */
const GambarMedia = (mediaUrl: (id: string) => string | null) =>
  Node.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return { mediaId: { default: "", rendered: false }, alt: { default: "", rendered: false } };
    },
    // Gambar luar (tempel dari web/Word) tak punya data-media-id sehingga dibuang oleh skema.
    parseHTML() {
      return [
        {
          tag: "img[data-media-id]",
          getAttrs: (el) => {
            const id = el.getAttribute("data-media-id") ?? "";
            return isMediaId(id) ? { mediaId: id.toLowerCase(), alt: el.getAttribute("alt") ?? "" } : false;
          },
        },
      ];
    },
    renderHTML({ node, HTMLAttributes }) {
      const src = mediaUrl(node.attrs.mediaId as string);
      return ["img", mergeAttributes(HTMLAttributes, { "data-media-id": node.attrs.mediaId, alt: node.attrs.alt, ...(src ? { src } : {}) })];
    },
  });

/** Daftar rata: satu paragraf per butir (butir bersarang tidak ada di Markdown artikel). */
const ButirRata = ListItem.extend({ content: "paragraph" });

/** Judul satu baris: Shift+Enter tidak menyisipkan jeda baris di dalam judul. */
const TanpaJedaDiJudul = Extension.create({
  name: "tanpaJedaDiJudul",
  priority: 200,
  addKeyboardShortcuts() {
    const tahan = () => this.editor.isActive("heading");
    return { "Shift-Enter": tahan, "Mod-Enter": tahan };
  },
});

/**
 * Tautan yang diterima editor: sama dengan parser (http, https, mailto, jalur `/`). Spasi dan kurung dikodekan agar
 * tidak memutus sintaks. Mengembalikan null bila tidak aman.
 */
export const rapikanTautan = (url: string): string | null => {
  const t = url.trim().replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return isSafeLink(t) ? t : null;
};

/** Dari isian dialog tautan: `contoh.id` menjadi https, alamat surel menjadi mailto. Null bila ditolak. */
export const tautanDariIsian = (isian: string): string | null => {
  const t = isian.trim();
  if (!t) return null;
  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(t)) return rapikanTautan(`mailto:${t}`);
  if (/^(https?:|mailto:|\/(?!\/))/i.test(t)) return rapikanTautan(t);
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t) || t.startsWith("//")) return null;
  return rapikanTautan(`https://${t}`);
};

export function ekstensiArtikel(mediaUrl: (id: string) => string | null): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      listItem: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        protocols: ["mailto"],
        isAllowedUri: (url) => rapikanTautan(url) !== null,
        HTMLAttributes: { rel: "noopener noreferrer", target: null },
      },
    }),
    ButirRata,
    TanpaJedaDiJudul,
    GambarMedia(mediaUrl),
  ];
}

// ---- Merapikan dokumen ----

const tandaAman = (marks: Nd["marks"]): NonNullable<Nd["marks"]> =>
  (marks ?? []).flatMap((m) => {
    if (m.type === "bold" || m.type === "italic") return [{ type: m.type }];
    const href = m.type === "link" ? rapikanTautan(String(m.attrs?.href ?? "")) : null;
    return href ? [{ type: "link", attrs: { href } }] : [];
  });

/** Simpul sebaris: teks bertanda (tebal, miring, tautan aman) dan jeda baris; yang lain dibuang. Baris baru dalam teks = jeda. */
function sebaris(nodes: Nd[] | undefined): Nd[] {
  const out: Nd[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      const marks = tandaAman(n.marks);
      (n.text ?? "").split("\n").forEach((bagian, k) => {
        if (k > 0) out.push({ type: "hardBreak" });
        if (bagian) out.push({ type: "text", text: bagian, ...(marks.length ? { marks } : {}) });
      });
    } else if (n.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (n.content) {
      out.push(...sebaris(n.content));
    }
  }
  return out;
}

const kunci = (m: { type: string; attrs?: Record<string, unknown> | undefined }) => (m.type === "link" ? `link:${m.attrs?.href}` : m.type);
/** Gabungkan teks bersebelahan yang tandanya sama. */
function gabungTeks(nodes: Nd[]): Nd[] {
  const out: Nd[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    const sama = last?.type === "text" && n.type === "text" && (last.marks ?? []).map(kunci).sort().join("|") === (n.marks ?? []).map(kunci).sort().join("|");
    if (sama && last) out[out.length - 1] = { ...last, text: (last.text ?? "") + (n.text ?? "") };
    else out.push(n);
  }
  return out;
}

/**
 * Rapikan satu deret sebaris: tiap baris dipangkas dan baris kosong (jeda beruntun, di awal, atau di akhir) dibuang
 * karena baris kosong memecah paragraf.
 */
function rapikanSebaris(nodes: Nd[]): Nd[] {
  const baris: Nd[][] = [[]];
  for (const n of nodes) {
    if (n.type === "hardBreak") baris.push([]);
    else baris[baris.length - 1]?.push(n);
  }
  const rapi = baris
    .map((b) =>
      b
        .map((n, i) => {
          if (n.type !== "text") return n;
          const t = i === 0 ? (n.text ?? "").trimStart() : (n.text ?? "");
          return { ...n, text: i === b.length - 1 ? t.trimEnd() : t };
        })
        .filter((n) => n.type !== "text" || n.text),
    )
    .filter((b) => b.length > 0);
  return gabungTeks(gabungBaris(rapi));
}

const gabungBaris = (baris: Nd[][]): Nd[] => baris.flatMap((b, i) => (i > 0 ? [{ type: "hardBreak" }, ...b] : b));
const paragraf = (content: Nd[]): Nd => ({ type: "paragraph", content });

/** Baris-baris sebaris dari blok yang sudah dirapikan (untuk butir daftar dan kutipan). */
function barisDari(b: Nd): Nd[][] {
  if (b.type === "paragraph" || b.type === "heading") return b.content?.length ? [b.content] : [];
  if (b.type === "blockquote") return (b.content ?? []).flatMap(barisDari);
  if (b.type === "bulletList" || b.type === "orderedList") return (b.content ?? []).flatMap((li) => (li.content ?? []).flatMap(barisDari));
  return [];
}

/** Ratakan `n` menjadi blok-blok yang diizinkan skema artikel dan tambahkan ke `out`. */
function kumpulBlok(n: Nd, out: Nd[]): void {
  switch (n.type) {
    case "paragraph": {
      let deret: Nd[] = [];
      const tutup = () => {
        const c = rapikanSebaris(sebaris(deret));
        if (c.length) out.push(paragraf(c));
        deret = [];
      };
      for (const k of n.content ?? []) {
        if (k.type === "image") {
          tutup();
          kumpulBlok(k, out);
        } else {
          deret.push(k);
        }
      }
      tutup();
      return;
    }
    case "heading": {
      const level = Number(n.attrs?.level);
      const isi = rapikanSebaris(sebaris(n.content).map((k) => (k.type === "hardBreak" ? { type: "text", text: " " } : k)));
      if (!isi.length) return;
      if (level === 2 || level === 3) out.push({ type: "heading", attrs: { level }, content: isi });
      else out.push(paragraf([{ type: "text", text: `${"#".repeat(level || 1)} ` }, ...isi]));
      return;
    }
    case "bulletList":
    case "orderedList": {
      const butir: Nd[] = [];
      const tambah = (daftar: Nd) => {
        for (const li of daftar.content ?? []) {
          const tmp: Nd[] = [];
          const bersarang: Nd[] = [];
          for (const ch of li.content ?? []) {
            if (ch.type === "bulletList" || ch.type === "orderedList") bersarang.push(ch);
            else kumpulBlok(ch, tmp);
          }
          const baris = tmp.flatMap(barisDari);
          if (baris.length) butir.push({ type: "listItem", content: [paragraf(gabungBaris(baris))] });
          for (const d of bersarang) tambah(d);
        }
      };
      tambah(n);
      if (butir.length) out.push({ type: n.type, content: butir });
      return;
    }
    case "blockquote": {
      const tmp: Nd[] = [];
      for (const ch of n.content ?? []) kumpulBlok(ch, tmp);
      const baris = tmp.flatMap(barisDari);
      if (baris.length) out.push({ type: "blockquote", content: baris.map(paragraf) });
      for (const b of tmp) if (b.type === "image") out.push(b);
      return;
    }
    case "horizontalRule":
      out.push({ type: "horizontalRule" });
      return;
    case "image": {
      const id = String(n.attrs?.mediaId ?? "");
      if (isMediaId(id)) out.push({ type: "image", attrs: { mediaId: id.toLowerCase(), alt: bersihAlt(String(n.attrs?.alt ?? "")) } });
      return;
    }
    default: {
      // Teks lepas atau simpul tak dikenal (blok kode, tabel, dst.): ambil teksnya saja.
      const c = rapikanSebaris(sebaris(n.type === "text" ? [n] : n.content));
      if (c.length) out.push(paragraf(c));
    }
  }
}

/** Rapikan dokumen ke subset artikel. Paragraf kosong dibuang; dokumen tak pernah kosong (satu paragraf kosong). */
export function rapikanDokumen(doc: Nd): Nd {
  const out: Nd[] = [];
  for (const n of doc.content ?? []) kumpulBlok(n, out);
  return { type: "doc", content: out.length ? out : [{ type: "paragraph" }] };
}

/**
 * Bentuk simpan: kutipan satu paragraf (baris = jeda baris) dan daftar sejenis yang bersebelahan menyatu, karena Markdown
 * artikel tidak bisa membedakannya.
 */
function untukSimpan(doc: Nd): Nd {
  const content: Nd[] = [];
  for (const b of doc.content ?? []) {
    const last = content[content.length - 1];
    if (b.type === "blockquote") content.push({ ...b, content: [paragraf(gabungBaris(barisDari(b)))] });
    else if (last && (b.type === "bulletList" || b.type === "orderedList") && last.type === b.type)
      content[content.length - 1] = { ...last, content: [...(last.content ?? []), ...(b.content ?? [])] };
    else content.push(b);
  }
  return { ...doc, content };
}

type Tanda = { type: string; attrs?: { href: string } };

function inlineKeJson(c: Inline[], marks: Tanda[] = []): Nd[] {
  return c.flatMap((n): Nd[] => {
    if (n.t === "text") return [{ type: "text", text: n.v, ...(marks.length ? { marks } : {}) }];
    if (n.t === "br") return [{ type: "hardBreak" }];
    return inlineKeJson(n.c, [...marks, n.t === "link" ? { type: "link", attrs: { href: n.href } } : { type: n.t }]);
  });
}

function blokKeJson(b: Block): Nd {
  switch (b.t) {
    case "h2":
    case "h3":
      return { type: "heading", attrs: { level: b.t === "h2" ? 2 : 3 }, content: inlineKeJson(b.c) };
    case "p":
      return paragraf(inlineKeJson(b.c));
    case "quote":
      return { type: "blockquote", content: [paragraf(inlineKeJson(b.c))] };
    case "ul":
    case "ol":
      return { type: b.t === "ul" ? "bulletList" : "orderedList", content: b.items.map((it) => ({ type: "listItem", content: [paragraf(inlineKeJson(it))] })) };
    case "img":
      return { type: "image", attrs: { mediaId: b.src, alt: b.alt } };
    case "hr":
      return { type: "horizontalRule" };
  }
}

/**
 * Markdown -> dokumen editor. Memakai `parseMarkdown` (parser yang sama dengan pratinjau dan landing) supaya tampilan
 * visual selalu identik dengan hasil terbit, lalu dirapikan.
 */
export const bacaMarkdown = (md: string): Nd => rapikanDokumen({ type: "doc", content: parseMarkdown(md, (id) => id).map(blokKeJson) });

// ---- Penulis Markdown ----

const huruf = /[\p{L}\p{N}]/u;

/** Escape teks biasa agar tidak terbaca sebagai penanda: `\`, `*`, `[`, `]`, `_` (kecuali di dalam kata), dan entitas. */
const escapeTeks = (t: string) =>
  t.replace(/&(?=(?:amp|lt|gt|quot);)|[\\*[\]_]/g, (m, i: number) => {
    if (m === "&") return "&amp;";
    if (m === "_" && huruf.test(t[i - 1] ?? "") && huruf.test(t[i + 1] ?? "")) return m;
    return `\\${m}`;
  });

const MIRING_BUKA = "\uE000";
const MIRING_TUTUP = "\uE001";
const PRIORITAS = ["link", "bold", "italic"];

/** Tanda aktif pada simpul teks, urut prioritas (tautan paling luar). */
const tandaDi = (n: Nd) => PRIORITAS.flatMap((p) => (n.marks ?? []).map(kunci).filter((k) => k === p || (p === "link" && k.startsWith("link:"))));

/** `!` yang langsung diikuti tautan terbaca sebagai gambar; beri escape. */
const tanpaSeru = (s: string) => ((/(\\*)!$/.exec(s)?.[1]?.length ?? 1) % 2 === 0 ? `${s.slice(0, -1)}\\!` : s);

/** Tulis deretan teks bertanda: tiap kali tanda terpanjang dibuka paling luar, sehingga sarangnya selalu rapi. */
function tulisTanda(ns: Nd[], terpakai: string[]): string {
  let out = "";
  let i = 0;
  while (i < ns.length) {
    const calon = tandaDi(ns[i] as Nd).filter((k) => !terpakai.includes(k));
    let terbaik = "";
    let panjang = 0;
    for (const k of calon) {
      let j = i;
      while (j < ns.length && tandaDi(ns[j] as Nd).includes(k)) j++;
      if (j - i > panjang) {
        terbaik = k;
        panjang = j - i;
      }
    }
    if (!terbaik) {
      out += escapeTeks(ns[i]?.text ?? "");
      i++;
      continue;
    }
    const dalam = tulisTanda(ns.slice(i, i + panjang), [...terpakai, terbaik]);
    // Spasi di tepi dikeluarkan dari penanda: `**a **` tidak dikenal parser.
    const [, depan = "", isi = "", belakang = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(dalam) ?? [];
    if (!isi) {
      out += depan + belakang;
    } else {
      if (terbaik.startsWith("link:") && !depan) out = tanpaSeru(out);
      const bungkus = terbaik === "bold" ? `**${isi}**` : terbaik === "italic" ? `${MIRING_BUKA}${isi}${MIRING_TUTUP}` : `[${isi}](${terbaik.slice(5)})`;
      out += depan + bungkus + belakang;
    }
    i += panjang;
  }
  return out;
}

/** Miring ditulis `_x_`, tetapi `*x*` bila menempel pada huruf (garis bawah di dalam kata tidak dikenal parser). */
function pilihPenandaMiring(s: string) {
  return s.replace(new RegExp(`${MIRING_BUKA}([\\s\\S]*?)${MIRING_TUTUP}`, "g"), (_, isi: string, pos: number, semua: string) => {
    const sebelum = semua.slice(0, pos).replace(/[\uE000\uE001]/g, "");
    const sesudah = semua.slice(pos + isi.length + 2).replace(/[\uE000\uE001]/g, "");
    const d = huruf.test(sebelum.slice(-1)) || huruf.test(sesudah.slice(0, 1)) ? "*" : "_";
    return `${d}${isi}${d}`;
  });
}

/** Satu paragraf sebaris menjadi baris-baris teks (jeda baris = baris baru). */
function tulisSebaris(nodes: Nd[]): string[] {
  const baris: Nd[][] = [[]];
  for (const n of nodes) {
    if (n.type === "hardBreak") baris.push([]);
    else baris[baris.length - 1]?.push(n);
  }
  return baris.map((b) => pilihPenandaMiring(tulisTanda(b, [])));
}

/** Awal baris yang akan dibaca parser sebagai blok (judul, butir, kutipan, garis) diberi `\` agar tetap teks. */
const amankanAwalBaris = (l: string) =>
  l
    .replace(/^(#{2,3})(?=\s)/, "\\$1")
    .replace(/^-(?=\s|-*$)/, "\\-")
    .replace(/^>/, "\\>")
    .replace(/^(\d+)([.)])(?=\s)/, "$1\\$2");

/** Blok (sudah dirapikan) menjadi Markdown. */
function tulisBlok(b: Nd): string {
  const baris = tulisSebaris(b.content ?? []).map(amankanAwalBaris);
  switch (b.type) {
    case "heading":
      return `${"#".repeat(Number(b.attrs?.level) === 3 ? 3 : 2)} ${baris.join(" ")}`;
    case "blockquote":
      return tulisSebaris(b.content?.[0]?.content ?? [])
        .map((l) => `> ${amankanAwalBaris(l)}`)
        .join("\n");
    case "bulletList":
    case "orderedList":
      return (b.content ?? [])
        .map((li, i) => {
          const [awal = "", ...sisa] = tulisSebaris(li.content?.[0]?.content ?? []).map(amankanAwalBaris);
          const tanda = b.type === "bulletList" ? "- " : `${i + 1}. `;
          return [tanda + awal, ...sisa.map((l) => " ".repeat(tanda.length) + l)].join("\n");
        })
        .join("\n");
    case "horizontalRule":
      return "---";
    case "image":
      return `![${bersihAlt(String(b.attrs?.alt ?? ""))}](media:${b.attrs?.mediaId})`;
    default:
      return baris.join("\n");
  }
}

/** Dokumen editor -> Markdown artikel. Dokumen kosong menghasilkan string kosong. */
export function tulisMarkdown(doc: Nd): string {
  return untukSimpan(rapikanDokumen(doc)).content?.map(tulisBlok).filter(Boolean).join("\n\n") ?? "";
}

/** Apakah editor visual menampilkan Markdown ini berbeda dari pratinjau (format di luar subset, mis. kode atau tabel)? */
export const disederhanakan = (md: string): boolean =>
  JSON.stringify(parseMarkdown(md, (x) => x)) !== JSON.stringify(parseMarkdown(tulisMarkdown(bacaMarkdown(md)), (x) => x));
