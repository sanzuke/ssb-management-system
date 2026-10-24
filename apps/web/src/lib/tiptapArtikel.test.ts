import { describe, expect, test } from "bun:test";
import { type Block, type Inline, parseMarkdown } from "@ssb/shared";
import { bacaMarkdown, rapikanDokumen, tautanDariIsian, tulisMarkdown } from "./tiptapArtikel";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const url = (id: string) => (id === ID ? `u/${id}` : null);
const blok = (md: string) => parseMarkdown(md, url);
const bolakBalik = (md: string) => tulisMarkdown(bacaMarkdown(md));

describe("editor visual artikel: Markdown <-> dokumen", () => {
  test("sintaks subset kembali sebagai blok yang sama", () => {
    const sumber = [
      "## Judul **tebal**",
      "Paragraf **tebal**, *miring*, dan [tautan](https://contoh.id/a_b).\nBaris kedua.",
      "### Sub",
      "- satu\n- dua dengan **b**",
      "1. a\n2. b",
      "> kutipan\n> dua baris",
      "---",
      `![foto](media:${ID})`,
      "**a *b* c** dan ***semua*** dan *a **b** c*",
      "A & B < C > D, 2*3 \\*bintang\\* [x] \\\\ snake_case",
      "\\## bukan judul\n\n\\- bukan daftar\n\n1\\. bukan\n\n\\> bukan",
      "Daftar:\n- a\n- b",
    ].join("\n\n");
    expect(blok(bolakBalik(sumber))).toEqual(blok(sumber));
  });

  test("keluaran tetap rapi dan mudah dibaca", () => {
    expect(bolakBalik("A & B < C > D, [x]")).toBe("A & B < C > D, \\[x\\]");
    expect(bolakBalik("*miring* **tebal**\nbaris dua")).toBe("_miring_ **tebal**\nbaris dua");
    expect(bolakBalik("me*ng*ulang")).toBe("me*ng*ulang");
    expect(bolakBalik("- a\n\n- b")).toBe("- a\n- b");
    expect(bolakBalik("&amp;lt; bukan tanda")).toBe("&amp;lt; bukan tanda");
    expect(bolakBalik("")).toBe("");
  });

  test("format di luar subset tidak menghilangkan isi", () => {
    expect(bolakBalik("- [ ] tugas\n- [x] selesai")).toBe("- \\[ \\] tugas\n- \\[x\\] selesai");
    expect(bolakBalik("# H1\n\n#### H4")).toBe("# H1\n\n#### H4");
    expect(bolakBalik("`kode` <b>html</b> ~~coret~~ https://a.id")).toBe("`kode` <b>html</b> ~~coret~~ https://a.id");
    expect(blok(bolakBalik("![x](https://jahat.test/a.png)\n\n[klik](javascript:alert(1))"))).toEqual(
      blok("![x](https://jahat.test/a.png)\n\n[klik](javascript:alert(1))"),
    );
  });

  test("dokumen dari editor dirapikan: kutipan, butir bersarang, judul satu baris, spasi di tepi penanda", () => {
    const t = (text: string, marks?: { type: string }[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
    const p = (...content: object[]) => ({ type: "paragraph", content });
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t("Judul"), { type: "hardBreak" }, t("dua")] },
        { type: "blockquote", content: [p(t("a")), p(t("b"))] },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [p(t("x")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("y"))] }] }] }],
        },
        p(t("tebal ", [{ type: "bold" }]), t("biasa")),
        p(t("a"), { type: "hardBreak" }, { type: "hardBreak" }, t("b")),
        p(),
        { type: "image", attrs: { mediaId: ID.toUpperCase(), alt: "foto [x]\nbaris" } },
        { type: "image", attrs: { mediaId: "bukan-uuid", alt: "" } },
      ],
    };
    expect(tulisMarkdown(doc)).toBe(`## Judul dua\n\n> a\n> b\n\n- x\n- y\n\n**tebal** biasa\n\na\nb\n\n![foto x baris](media:${ID})`);
    expect(rapikanDokumen({ type: "doc", content: [] })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  test("tautan dari dialog: https otomatis, surel jadi mailto, skema berbahaya ditolak", () => {
    expect(tautanDariIsian("contoh.id/a b")).toBe("https://contoh.id/a%20b");
    expect(tautanDariIsian("a@b.id")).toBe("mailto:a@b.id");
    expect(tautanDariIsian("/artikel/x")).toBe("/artikel/x");
    expect(tautanDariIsian("http://a.id/(x)")).toBe("http://a.id/%28x%29");
    expect(tautanDariIsian("localhost:3000")).toBe("https://localhost:3000");
    expect(tautanDariIsian("javascript:alert(1)")).toBeNull();
    expect(tautanDariIsian("data:text/html,x")).toBeNull();
    expect(tautanDariIsian("//jahat.test")).toBeNull();
    expect(tautanDariIsian("   ")).toBeNull();
  });
});

// ---- Uji acak: dokumen editor -> Markdown -> blok harus sama dengan dokumennya ----

type Nd = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Nd[] };
type Ch = { c: string; b: boolean; i: boolean; h: string };
const KOSONG = { b: false, i: false, h: "" };

/** Deret karakter bertanda per baris, tiap baris dipangkas dan baris kosong dibuang; tanda pada spasi diabaikan. */
function kanon(chars: Ch[]): string {
  const baris: Ch[][] = [[]];
  for (const ch of chars) {
    if (ch.c === "\n") baris.push([]);
    else baris[baris.length - 1]?.push(/\s/.test(ch.c) ? { c: ch.c, ...KOSONG } : ch);
  }
  const rapi = baris
    .map((l) => {
      let a = 0;
      let z = l.length;
      while (a < z && /\s/.test(l[a]?.c ?? "")) a++;
      while (z > a && /\s/.test(l[z - 1]?.c ?? "")) z--;
      return l.slice(a, z);
    })
    .filter((l) => l.length);
  const run: string[] = [];
  let cur = "";
  let kunci = "";
  rapi.forEach((l, k) => {
    for (const ch of k > 0 ? [{ c: "\n", ...KOSONG }, ...l] : l) {
      const kk = ch.c === "\n" ? "NL" : `${ch.b ? "B" : ""}${ch.i ? "I" : ""}${ch.h}`;
      if (kk !== kunci) {
        if (cur) run.push(`${kunci}|${cur}`);
        cur = "";
        kunci = kk;
      }
      cur += ch.c;
    }
  });
  if (cur) run.push(`${kunci}|${cur}`);
  return run.join("¦");
}
const dariInline = (c: Inline[], b = false, i = false, h = ""): Ch[] =>
  c.flatMap((n): Ch[] => {
    if (n.t === "text") return [...n.v].map((x) => ({ c: x, b, i, h }));
    if (n.t === "br") return [{ c: "\n", ...KOSONG }];
    if (n.t === "bold") return dariInline(n.c, true, i, h);
    if (n.t === "italic") return dariInline(n.c, b, true, h);
    return dariInline(n.c, b, i, n.href);
  });
const dariNodes = (c: Nd[]): Ch[] =>
  c.flatMap((n): Ch[] =>
    n.type === "hardBreak"
      ? [{ c: "\n", ...KOSONG }]
      : [...(n.text ?? "")].map((x) => ({
          c: x,
          b: !!n.marks?.some((k) => k.type === "bold"),
          i: !!n.marks?.some((k) => k.type === "italic"),
          h: String(n.marks?.find((k) => k.type === "link")?.attrs?.href ?? ""),
        })),
  );
const kanonBlok = (bs: Block[]): string[] =>
  bs.map((b) => {
    if (b.t === "ul" || b.t === "ol") return `${b.t}:${b.items.map((x) => kanon(dariInline(x))).join("§")}`;
    if (b.t === "img") return `img:${b.alt}`;
    if (b.t === "hr") return "hr";
    return `${b.t}:${kanon(dariInline(b.c))}`;
  });
function kanonDok(doc: Nd): string[] {
  const out: string[] = [];
  for (const b of doc.content ?? []) {
    const c = b.content ?? [];
    if (b.type === "paragraph" || b.type === "heading") {
      const r = kanon(dariNodes(c));
      if (r) out.push(`${b.type === "paragraph" ? "p" : `h${b.attrs?.level}`}:${r}`);
    } else if (b.type === "bulletList" || b.type === "orderedList") {
      const t = b.type === "bulletList" ? "ul" : "ol";
      const butir = c.map((li) => kanon(dariNodes(li.content?.[0]?.content ?? []))).filter(Boolean);
      const last = out[out.length - 1];
      if (butir.length && last?.startsWith(`${t}:`)) out[out.length - 1] = `${last}§${butir.join("§")}`;
      else if (butir.length) out.push(`${t}:${butir.join("§")}`);
    } else if (b.type === "blockquote") {
      const r = kanon(c.flatMap((p, k) => (k > 0 ? [{ c: "\n", ...KOSONG }, ...dariNodes(p.content ?? [])] : dariNodes(p.content ?? []))));
      if (r) out.push(`quote:${r}`);
    } else if (b.type === "horizontalRule") {
      out.push("hr");
    } else if (b.type === "image") {
      out.push(`img:${b.attrs?.alt}`);
    }
  }
  return out;
}

describe("editor visual artikel: uji acak", () => {
  let seed = 20260612;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)] as T;
  // Alfabet sengaja penuh tanda sintaks.
  const ALFA = [
    "a",
    "b",
    "c",
    "1",
    " ",
    " ",
    "*",
    "_",
    "[",
    "]",
    "(",
    ")",
    "\\",
    "#",
    "-",
    ">",
    ".",
    "&",
    "<",
    '"',
    "!",
    "~",
    "`",
    ":",
    "/",
    "ab",
    "2024. ",
    "## ",
    "- ",
    "> ",
    "---",
    "1) ",
    "&amp;",
  ];
  const teks = () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => pick(ALFA)).join("");
  const inline = (): Nd[] =>
    Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k): Nd => {
      if (k > 0 && rnd() < 0.12) return { type: "hardBreak" };
      const marks: NonNullable<Nd["marks"]> = [];
      if (rnd() < 0.3) marks.push({ type: "bold" });
      if (rnd() < 0.3) marks.push({ type: "italic" });
      if (rnd() < 0.15) marks.push({ type: "link", attrs: { href: pick(["https://a.id/x_y", "/jalur", "mailto:a@b.id"]) } });
      return { type: "text", text: teks(), ...(marks.length ? { marks } : {}) };
    });
  const para = (): Nd => ({ type: "paragraph", content: inline() });
  const acak = (): Nd => {
    const r = rnd();
    if (r < 0.35) return para();
    if (r < 0.45) return { type: "heading", attrs: { level: pick([2, 3]) }, content: inline().filter((x) => x.type !== "hardBreak") };
    if (r < 0.6)
      return {
        type: pick(["bulletList", "orderedList"]),
        content: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ type: "listItem", content: [para()] })),
      };
    if (r < 0.75) return { type: "blockquote", content: Array.from({ length: 1 + Math.floor(rnd() * 2) }, para) };
    if (r < 0.85) return { type: "horizontalRule" };
    return { type: "image", attrs: { mediaId: ID, alt: pick(["", "foto", "a b"]) } };
  };

  test("dokumen acak -> Markdown -> blok sama; Markdown -> dokumen -> Markdown tetap sama arti", () => {
    for (let n = 0; n < 400; n++) {
      const doc: Nd = { type: "doc", content: Array.from({ length: 1 + Math.floor(rnd() * 4) }, acak) };
      const md1 = tulisMarkdown(doc);
      const b1 = kanonBlok(blok(md1));
      expect({ n, md1, blok: b1 }).toEqual({ n, md1, blok: kanonDok(doc) });
      const md2 = tulisMarkdown(bacaMarkdown(md1));
      expect({ n, md1, md2, blok: kanonBlok(blok(md2)) }).toEqual({ n, md1, md2, blok: b1 });
    }
  });

  test("Markdown acak -> editor -> Markdown menghasilkan blok yang sama", () => {
    const POTONGAN = [
      "## judul",
      "### sub",
      "# h1",
      "#### h4",
      "- butir",
      "* bintang",
      "1. satu",
      "2. dua",
      "> kutipan",
      "---",
      "teks biasa",
      "teks **tebal** dan *miring*",
      "_miring_ __tebal__",
      `![a](media:${ID})`,
      "[tautan](https://a.id)",
      "[x](javascript:alert(1))",
      "  indent",
      "",
      "",
      "baris\\",
      "akhir  ",
      "a \\* b",
      "&amp; &lt;",
      "2024. tahun",
      "text *a **b*** c",
      "***x***",
      "**a *b* c**",
      "`kode`",
      "<b>x</b>",
      "- [ ] x",
      "[a **b** c](/x)",
    ];
    for (let n = 0; n < 400; n++) {
      const md = Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => pick(POTONGAN)).join(pick(["\n", "\n", "\n\n"]));
      const keluar = bolakBalik(md);
      expect({ n, md, keluar, blok: kanonBlok(blok(keluar)) }).toEqual({ n, md, keluar, blok: kanonBlok(blok(md)) });
    }
  });
});
