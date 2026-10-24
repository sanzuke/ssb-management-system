import type { Editor } from "@tiptap/core";
import { createEffect, createSignal, type JSX, on, onCleanup, Show } from "solid-js";
import type { PostMedia } from "@ssb/shared";
import type * as TiptapArtikel from "~/lib/tiptapArtikel";

type Lib = typeof TiptapArtikel;

export type KendaliVisual = { flush: () => void };

type Props = {
  id: string;
  label: string;
  /** Markdown artikel; sumber kebenaran ada di induk. */
  value: string;
  /** Markdown hasil suntingan visual (sudah didebounce). */
  onChange: (md: string) => void;
  /** Dipanggil segera pada setiap perubahan isi, agar penanda "belum disimpan" tidak menunggu debounce. */
  onUbah: () => void;
  /** Alamat gambar dari id media; null bila belum diketahui. */
  mediaUrl: (id: string) => string | null;
  unggah: (file: File) => Promise<PostMedia | null>;
  sedangUnggah: boolean;
  bisaUbah: boolean;
  /** Editor baru dibuat saat pertama kali tampil. */
  tampil: boolean;
  invalid: boolean;
  onSiap: (k: KendaliVisual) => void;
};

const JEDA_MS = 250;

function Alat(a: { label: JSX.Element; judul: string; aktif?: boolean; mati?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      class="tombol tipis alat"
      title={a.judul}
      aria-label={a.judul}
      aria-pressed={a.aktif}
      disabled={a.mati}
      // Tahan fokus di editor agar pilihan teks tidak hilang saat tombol ditekan.
      onMouseDown={(e) => e.preventDefault()}
      onClick={a.onClick}
    >
      {a.label}
    </button>
  );
}

const gambarDari = (files: FileList | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith("image/"));

/** Editor teks visual (Tiptap). Dimuat hanya di klien; nilai disinkronkan ke Markdown di induk. */
export default function EditorVisual(p: Props) {
  let host: HTMLDivElement | undefined;
  let berkas: HTMLInputElement | undefined;
  let kolomTautan: HTMLInputElement | undefined;
  const [lib, setLib] = createSignal<Lib | null>(null);
  const [editor, setEditor] = createSignal<Editor | null>(null);
  const [gagal, setGagal] = createSignal(false);
  const [versi, setVersi] = createSignal(0);
  const [tautan, setTautan] = createSignal<{ nilai: string; galat: string } | null>(null);
  const [disederhanakan, setDisederhanakan] = createSignal(false);

  /** Markdown terakhir yang diketahui sama antara editor dan induk; mencegah setContent saat isinya sama. */
  let terakhir = p.value;
  let kotor = false;
  let timer: number | undefined;
  let dimulai = false;
  let mati = false;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const ed = editor();
    const l = lib();
    if (!kotor || !ed || !l) return;
    kotor = false;
    const md = l.tulisMarkdown(ed.getJSON());
    terakhir = md;
    if (md !== p.value) p.onChange(md);
  };
  p.onSiap({ flush });

  const sisipGambar = async (file: File, pos?: number) => {
    const media = await p.unggah(file);
    const ed = editor();
    if (!media || !ed) return;
    const node = { type: "image", attrs: { mediaId: media.id, alt: "" } };
    if (pos === undefined) ed.chain().focus().insertContent(node).run();
    else ed.chain().focus().insertContentAt(pos, node).run();
  };

  const buatEditor = async () => {
    try {
      const [{ Editor }, l] = await Promise.all([import("@tiptap/core"), import("~/lib/tiptapArtikel")]);
      if (mati || !host) return;
      const ed = new Editor({
        element: host,
        extensions: l.ekstensiArtikel((id) => p.mediaUrl(id)),
        content: l.bacaMarkdown(p.value),
        editable: p.bisaUbah,
        editorProps: {
          attributes: {
            id: p.id,
            role: "textbox",
            "aria-multiline": "true",
            "aria-label": p.label,
            class: "blok-artikel isi-visual",
          },
          handleKeyDown: (_v, e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
              // Ctrl+K di sini untuk tautan, bukan pencarian global di header.
              e.preventDefault();
              e.stopPropagation();
              bukaTautan();
              return true;
            }
            return false;
          },
          handlePaste: (_v, e) => {
            const data = e.clipboardData;
            // Teks tempelan (Word, web) ditangani skema; hanya tangkapan layar/gambar murni yang diunggah.
            if (!data || data.types.includes("text/html") || data.types.includes("text/plain")) return false;
            const [gambar] = gambarDari(data.files);
            if (!gambar) return false;
            e.preventDefault();
            void sisipGambar(gambar);
            return true;
          },
          handleDrop: (view, e, _slice, dipindah) => {
            const files = e.dataTransfer?.files;
            if (dipindah || !files?.length) return false;
            // Berkas yang dilepas tidak boleh membuat peramban membukanya; hanya gambar yang diunggah.
            e.preventDefault();
            const [gambar] = gambarDari(files);
            if (gambar) void sisipGambar(gambar, view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos);
            return true;
          },
        },
        onTransaction: () => setVersi((v) => v + 1),
        onUpdate: () => {
          kotor = true;
          setDisederhanakan(false);
          p.onUbah();
          clearTimeout(timer);
          timer = window.setTimeout(flush, JEDA_MS);
        },
      });
      setLib(l);
      setEditor(ed);
      setDisederhanakan(l.disederhanakan(p.value));
    } catch {
      setGagal(true);
    }
  };

  createEffect(() => {
    if (p.tampil && !dimulai) {
      dimulai = true;
      void buatEditor();
    }
  });

  // Isi diubah dari luar (tab Markdown): muat ulang ke editor, kecuali Markdown-nya sama dengan yang sudah ada di editor.
  createEffect(
    on([() => p.value, editor], ([v, ed]) => {
      const l = lib();
      if (!ed || !l || v === terakhir) return;
      terakhir = v;
      kotor = false;
      clearTimeout(timer);
      ed.commands.setContent(l.bacaMarkdown(v), { emitUpdate: false });
      setDisederhanakan(l.disederhanakan(v));
    }),
  );

  createEffect(() => editor()?.setEditable(p.bisaUbah, false));

  onCleanup(() => {
    flush();
    mati = true;
    editor()?.destroy();
  });

  const aktif = (nama: string, attrs?: Record<string, unknown>) => {
    versi();
    return editor()?.isActive(nama, attrs) ?? false;
  };
  const ed = () => editor() as Editor;
  const bisa = () => !!editor() && p.bisaUbah;
  const adaRiwayat = (arah: "undo" | "redo") => {
    versi();
    return bisa() && ed().can()[arah]();
  };
  const gaya = () => (aktif("heading", { level: 2 }) ? "2" : aktif("heading", { level: 3 }) ? "3" : "p");

  const pilihGaya = (nilai: string) => {
    const c = ed().chain().focus();
    if (nilai === "p") c.setParagraph().run();
    else c.setHeading({ level: nilai === "2" ? 2 : 3 }).run();
  };

  const bukaTautan = () => {
    const e = editor();
    if (!e || !p.bisaUbah) return;
    setTautan({ nilai: String(e.getAttributes("link").href ?? ""), galat: "" });
    queueMicrotask(() => kolomTautan?.select());
  };
  const terapkanTautan = () => {
    const t = tautan();
    const l = lib();
    if (!t || !l) return;
    const href = l.tautanDariIsian(t.nilai);
    if (!href) {
      setTautan({ ...t, galat: "Tautan tidak valid. Pakai alamat web, surel, atau jalur seperti /artikel." });
      return;
    }
    const c = ed().chain().focus();
    if (ed().state.selection.empty && !aktif("link")) c.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else c.extendMarkRange("link").setLink({ href }).run();
    setTautan(null);
  };
  const lepasTautan = () => {
    ed().chain().focus().extendMarkRange("link").unsetLink().run();
    setTautan(null);
  };
  const tutupTautan = () => {
    setTautan(null);
    ed().commands.focus();
  };

  const pilihBerkas = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void sisipGambar(file);
  };

  const altGambar = () => {
    versi();
    return String(editor()?.getAttributes("image").alt ?? "");
  };

  return (
    <div class="editor-visual" attr:data-salah={p.invalid ? "" : undefined}>
      <Show when={!gagal()} fallback={<div class="peringatan">Editor visual tidak bisa dimuat. Pakai tab Markdown untuk menulis.</div>}>
        <div class="bilah-visual" role="toolbar" aria-label={`Format teks ${p.label}`}>
          <select class="gaya-blok" aria-label="Gaya paragraf" disabled={!bisa()} value={gaya()} onChange={(e) => pilihGaya(e.currentTarget.value)}>
            <option value="p">Paragraf</option>
            <option value="2">Subjudul (H2)</option>
            <option value="3">Sub-subjudul (H3)</option>
          </select>
          <Alat
            label={<strong>B</strong>}
            judul="Tebal (Ctrl+B)"
            aktif={aktif("bold")}
            mati={!bisa()}
            onClick={() => ed().chain().focus().toggleBold().run()}
          />
          <Alat label={<em>I</em>} judul="Miring (Ctrl+I)" aktif={aktif("italic")} mati={!bisa()} onClick={() => ed().chain().focus().toggleItalic().run()} />
          <Alat label="Tautan" judul="Tautan (Ctrl+K)" aktif={aktif("link")} mati={!bisa()} onClick={bukaTautan} />
          <Alat
            label="Daftar"
            judul="Daftar berbutir"
            aktif={aktif("bulletList")}
            mati={!bisa()}
            onClick={() => ed().chain().focus().toggleBulletList().run()}
          />
          <Alat
            label="1. Daftar"
            judul="Daftar bernomor"
            aktif={aktif("orderedList")}
            mati={!bisa()}
            onClick={() => ed().chain().focus().toggleOrderedList().run()}
          />
          <Alat label="Kutipan" judul="Kutipan" aktif={aktif("blockquote")} mati={!bisa()} onClick={() => ed().chain().focus().toggleBlockquote().run()} />
          <Alat label="Garis" judul="Garis pemisah" mati={!bisa()} onClick={() => ed().chain().focus().setHorizontalRule().run()} />
          <Alat label={p.sedangUnggah ? "Mengunggah…" : "Gambar"} judul="Sisipkan gambar" mati={!bisa() || p.sedangUnggah} onClick={() => berkas?.click()} />
          <span class="pemisah-alat" aria-hidden="true" />
          <Alat label="Urungkan" judul="Urungkan (Ctrl+Z)" mati={!adaRiwayat("undo")} onClick={() => ed().chain().focus().undo().run()} />
          <Alat label="Ulangi" judul="Ulangi (Ctrl+Shift+Z)" mati={!adaRiwayat("redo")} onClick={() => ed().chain().focus().redo().run()} />
          <input ref={berkas} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pilihBerkas} />
        </div>

        <Show when={tautan()}>
          {(t) => (
            <form
              class="bilah-sisip"
              aria-label="Tautan"
              onSubmit={(e) => {
                e.preventDefault();
                terapkanTautan();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  tutupTautan();
                }
              }}
            >
              <label for={`${p.id}-tautan`}>Alamat tautan</label>
              <input
                ref={kolomTautan}
                id={`${p.id}-tautan`}
                type="text"
                inputmode="url"
                autocomplete="off"
                placeholder="https://contoh.id atau /jalur"
                value={t().nilai}
                onInput={(e) => setTautan({ nilai: e.currentTarget.value, galat: "" })}
                aria-invalid={t().galat ? "true" : undefined}
              />
              <button type="submit" class="tombol tipis">
                Terapkan
              </button>
              <Show when={aktif("link")}>
                <button type="button" class="tombol tipis" onClick={lepasTautan}>
                  Hapus tautan
                </button>
              </Show>
              <button type="button" class="tombol tipis" onClick={tutupTautan}>
                Batal
              </button>
              <Show when={t().galat}>
                <span class="pesan-salah" role="alert">
                  {t().galat}
                </span>
              </Show>
            </form>
          )}
        </Show>

        <Show when={aktif("image")}>
          <div class="bilah-sisip">
            <label for={`${p.id}-alt`}>Keterangan gambar (alt)</label>
            <input
              id={`${p.id}-alt`}
              type="text"
              maxlength={200}
              autocomplete="off"
              placeholder="Deskripsi singkat untuk pembaca layar"
              value={altGambar()}
              disabled={!p.bisaUbah}
              onInput={(e) => ed().chain().updateAttributes("image", { alt: e.currentTarget.value }).run()}
            />
            <button type="button" class="tombol tipis" disabled={!p.bisaUbah} onClick={() => ed().chain().focus().deleteSelection().run()}>
              Hapus gambar
            </button>
          </div>
        </Show>

        <Show when={disederhanakan()}>
          <div class="info" role="status">
            Isi ini memakai format di luar yang didukung editor visual (mis. kode, tabel, atau HTML). Editor menampilkannya sebagai teks biasa. Pakai tab
            Markdown bila ingin mempertahankannya apa adanya.
          </div>
        </Show>

        <div class="permukaan-visual">
          <div ref={host} class="tempat-visual" />
          <Show when={!editor()}>
            <p class="kosong memuat-visual" role="status">
              Memuat editor…
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}
