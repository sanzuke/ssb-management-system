import { createMemo, createSignal, Show } from "solid-js";
import { type PostMedia, parseMarkdown } from "@ssb/shared";
import BlokArtikel from "./BlokArtikel";

type Props = {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onInput: (v: string) => void;
  error?: string | undefined;
  baris?: number;
  /** Alamat gambar dari id media; null bila belum diketahui (gambar dilewati di pratinjau). */
  mediaUrl: (id: string) => string | null;
  /** Unggah gambar; mengembalikan null bila gagal (pesan galat ditampilkan induk). */
  unggah: (file: File) => Promise<PostMedia | null>;
  sedangUnggah: boolean;
  galatUnggah: string;
  bisaUbah: boolean;
};

/** Blok baru harus dipisah baris kosong dari teks di sekitarnya. */
const pemisahAwal = (sebelum: string) => (sebelum === "" || sebelum.endsWith("\n\n") ? "" : sebelum.endsWith("\n") ? "\n" : "\n\n");
const pemisahAkhir = (sesudah: string) => (sesudah === "" || sesudah.startsWith("\n\n") ? "" : sesudah.startsWith("\n") ? "\n" : "\n\n");

/** Textarea isi artikel (Markdown) dengan bilah format, sisip gambar, dan tab pratinjau. */
export default function ArtikelIsi(p: Props) {
  const [tab, setTab] = createSignal<"tulis" | "pratinjau">("tulis");
  let area: HTMLTextAreaElement | undefined;
  let berkas: HTMLInputElement | undefined;

  const blok = createMemo(() => parseMarkdown(p.value, p.mediaUrl));

  /** Ganti [s, e) dengan teks baru lalu pilih bagian `dari`..`sampai` (relatif ke awal teks baru). */
  const ganti = (s: number, e: number, teks: string, dari: number, sampai: number) => {
    p.onInput(p.value.slice(0, s) + teks + p.value.slice(e));
    queueMicrotask(() => {
      area?.focus();
      area?.setSelectionRange(s + dari, s + sampai);
    });
  };

  const bungkus = (awal: string, akhir: string, contoh: string) => {
    if (!area) return;
    const s = area.selectionStart;
    const e = area.selectionEnd;
    const isi = p.value.slice(s, e) || contoh;
    ganti(s, e, awal + isi + akhir, awal.length, awal.length + isi.length);
  };

  /** Sisipkan blok (satu atau beberapa baris) di posisi kursor, dipisah baris kosong. `timpa` = pilihan diganti. */
  const sisipBlok = (baris: (b: string, i: number) => string, contoh: string, timpa = true) => {
    if (!area) return;
    const s = area.selectionStart;
    const e = timpa ? area.selectionEnd : s;
    const isi = (p.value.slice(s, e) || contoh)
      .split("\n")
      .map((b, i) => baris(b, i))
      .join("\n");
    const awal = pemisahAwal(p.value.slice(0, s));
    const akhir = pemisahAkhir(p.value.slice(e));
    ganti(s, e, awal + isi + akhir, awal.length, awal.length + isi.length);
  };

  const pilihBerkas = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !area) return;
    const s = area.selectionStart;
    const media = await p.unggah(file);
    if (!media) return;
    const sebelum = p.value.slice(0, s);
    const sesudah = p.value.slice(s);
    const awal = pemisahAwal(sebelum);
    const akhir = pemisahAkhir(sesudah);
    p.onInput(sebelum + awal + media.markdown + akhir + sesudah);
    const posisi = s + awal.length + media.markdown.length + akhir.length;
    queueMicrotask(() => {
      area?.focus();
      area?.setSelectionRange(posisi, posisi);
    });
  };

  const Alat = (a: { label: string; judul: string; onClick: () => void }) => (
    <button type="button" class="tombol tipis" title={a.judul} aria-label={a.judul} disabled={!p.bisaUbah} onClick={a.onClick}>
      {a.label}
    </button>
  );

  return (
    <div class="field isi-artikel" attr:data-salah={p.error ? "" : undefined}>
      <div class="isi-kepala">
        <label for={p.id}>{p.label}</label>
        {/* biome-ignore lint/a11y/useSemanticElements: pilihan tampilan */}
        <div class="tab-periode" role="group" aria-label={`Tampilan ${p.label}`}>
          <button type="button" aria-pressed={tab() === "tulis"} onClick={() => setTab("tulis")}>
            Tulis
          </button>
          <button type="button" aria-pressed={tab() === "pratinjau"} onClick={() => setTab("pratinjau")}>
            Pratinjau
          </button>
        </div>
      </div>
      <div hidden={tab() !== "tulis"}>
        <div class="bilah-format" role="toolbar" aria-label="Format teks">
          <Alat label="H2" judul="Subjudul" onClick={() => sisipBlok((b) => `## ${b}`, "Subjudul")} />
          <Alat label="H3" judul="Sub-subjudul" onClick={() => sisipBlok((b) => `### ${b}`, "Sub-subjudul")} />
          <Alat label="B" judul="Tebal" onClick={() => bungkus("**", "**", "teks tebal")} />
          <Alat label="I" judul="Miring" onClick={() => bungkus("*", "*", "teks miring")} />
          <Alat label="Tautan" judul="Tautan" onClick={() => bungkus("[", "](https://)", "teks tautan")} />
          <Alat label="Daftar" judul="Daftar" onClick={() => sisipBlok((b) => `- ${b}`, "butir")} />
          <Alat label="1. Daftar" judul="Daftar bernomor" onClick={() => sisipBlok((b, i) => `${i + 1}. ${b}`, "butir")} />
          <Alat label="Kutipan" judul="Kutipan" onClick={() => sisipBlok((b) => `> ${b}`, "kutipan")} />
          <Alat label="Garis" judul="Garis pemisah" onClick={() => sisipBlok((b) => b, "---", false)} />
          <button type="button" class="tombol tipis" disabled={!p.bisaUbah || p.sedangUnggah} onClick={() => berkas?.click()}>
            {p.sedangUnggah ? "Mengunggah…" : "Sisipkan gambar"}
          </button>
          <input ref={berkas} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pilihBerkas} />
        </div>
        <textarea
          ref={area}
          id={p.id}
          name={p.id}
          class="area-isi"
          rows={p.baris ?? 16}
          value={p.value}
          readOnly={!p.bisaUbah}
          onInput={(e) => p.onInput(e.currentTarget.value)}
          aria-invalid={p.error ? "true" : undefined}
          aria-describedby={`${p.id}-hint`}
        />
      </div>
      <Show when={tab() === "pratinjau"}>
        <div class="pratinjau-artikel">
          <Show when={blok().length > 0} fallback={<p class="kosong">Belum ada isi untuk dipratinjau.</p>}>
            <BlokArtikel blocks={blok()} />
          </Show>
        </div>
      </Show>
      <span class="petunjuk" id={`${p.id}-hint`}>
        {p.hint}
      </span>
      <Show when={p.galatUnggah}>
        <span class="pesan-salah" role="alert">
          {p.galatUnggah}
        </span>
      </Show>
      <Show when={p.error}>
        <span class="pesan-salah" id={`${p.id}-err`}>
          {p.error}
        </span>
      </Show>
    </div>
  );
}
