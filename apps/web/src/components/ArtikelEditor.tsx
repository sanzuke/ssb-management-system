import { useNavigate } from "@solidjs/router";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { type PostAdminDetail, type PostInput, type PostMedia, POST_MEDIA_MAX_BYTES } from "@ssb/shared";
import { api, ApiError } from "~/lib/api";
import ArtikelIsi from "./ArtikelIsi";
import Field from "./Field";

type Isian = {
  titleId: string;
  titleEn: string;
  slug: string;
  excerptId: string;
  excerptEn: string;
  bodyId: string;
  bodyEn: string;
  category: string;
  coverMediaId: string | null;
  coverUrl: string | null;
  coverAlt: string;
};

type Tempat = "id" | "en" | "sampul";

const TIPE_GAMBAR = ["image/jpeg", "image/png", "image/webp"];
const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

const dariDetail = (a: PostAdminDetail | null): Isian => ({
  titleId: a?.title.id ?? "",
  titleEn: a?.title.en ?? "",
  slug: a?.slug ?? "",
  excerptId: a?.excerpt.id ?? "",
  excerptEn: a?.excerpt.en ?? "",
  bodyId: a?.body.id ?? "",
  bodyEn: a?.body.en ?? "",
  category: a?.category ?? "",
  coverMediaId: a?.coverMediaId ?? null,
  coverUrl: a?.coverUrl ?? null,
  coverAlt: a?.coverAlt ?? "",
});

/** Teks English opsional: kosong dihilangkan agar landing memakai Indonesia. */
const en = (v: string) => {
  const t = v.trim();
  return t ? { en: t } : {};
};

const keInput = (f: Isian): PostInput => ({
  title: { id: f.titleId.trim(), ...en(f.titleEn) },
  ...(f.slug.trim() ? { slug: f.slug.trim() } : {}),
  excerpt: { id: f.excerptId.trim(), ...en(f.excerptEn) },
  body: { id: f.bodyId.trim(), ...en(f.bodyEn) },
  category: f.category.trim(),
  coverMediaId: f.coverMediaId,
  coverAlt: f.coverAlt.trim(),
});

/** Editor artikel: `awal` null = artikel baru. Dirender setelah artikel selesai dimuat. */
export default function ArtikelEditor(props: { awal: PostAdminDetail | null }) {
  const nav = useNavigate();
  const [detail, setDetail] = createSignal(props.awal);
  const [f, setF] = createStore<Isian>(dariDetail(props.awal));
  const [belumSimpan, setBelumSimpan] = createSignal(false);
  const [galat, setGalat] = createSignal<Record<string, string>>({});
  const [pesanGalat, setPesanGalat] = createSignal("");
  const [info, setInfo] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  const [konfirmasi, setKonfirmasi] = createSignal<"terbit" | "tarik" | "hapus" | null>(null);
  // Awalan alamat gambar untuk pratinjau. Artikel baru belum punya; diambil dari gambar yang pertama diunggah.
  const [mediaBase, setMediaBase] = createSignal(props.awal?.mediaBase ?? "");
  const [mengunggah, setMengunggah] = createSignal<Tempat | null>(null);
  const [galatUnggah, setGalatUnggah] = createSignal<{ tempat: Tempat; pesan: string } | null>(null);
  let berkasSampul: HTMLInputElement | undefined;

  const bisaUbah = () => detail()?.canEdit ?? true;
  const terbit = () => detail()?.status === "published";
  const salah = (jalur: string) => galat()[jalur];

  const isi = <K extends keyof Isian>(k: K, v: Isian[K]) => {
    setF(
      produce((x) => {
        x[k] = v;
      }),
    );
    setBelumSimpan(true);
    setInfo("");
    setKonfirmasi(null);
  };

  const peringatKeluar = (e: BeforeUnloadEvent) => {
    if (belumSimpan()) e.preventDefault();
  };
  onMount(() => window.addEventListener("beforeunload", peringatKeluar));
  onCleanup(() => window.removeEventListener("beforeunload", peringatKeluar));

  /** Menjalankan aksi ke API dengan penanganan galat yang sama. Mengembalikan true bila berhasil. */
  const jalankan = async (fn: () => Promise<void>): Promise<boolean> => {
    if (sibuk()) return false;
    setSibuk(true);
    setPesanGalat("");
    setInfo("");
    setKonfirmasi(null);
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setGalat(e.fields);
        const n = Object.keys(e.fields).length;
        setPesanGalat(e.code === "validation" ? `Ada ${n} isian yang perlu diperbaiki. Kolom bermasalah ditandai merah.` : e.message);
      } else {
        setPesanGalat("Tidak bisa terhubung ke server. Coba lagi.");
      }
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const simpanDraf = async () => {
    const d = detail();
    const v = d
      ? await api<PostAdminDetail>(`/posts/${encodeURIComponent(d.id)}`, { method: "PUT", body: keInput(f) })
      : await api<PostAdminDetail>("/posts", { method: "POST", body: keInput(f) });
    setDetail(v);
    setGalat({});
    setBelumSimpan(false);
    // Alamat artikel bisa dibuat server dari judul; tampilkan yang tersimpan.
    setF("slug", v.slug);
  };

  /** Setelah artikel baru tersimpan, pindah ke alamat editornya. */
  const keEditor = () => {
    const d = detail();
    if (!props.awal && d) nav(`/artikel/${d.id}`, { replace: true });
  };

  const simpan = async () => {
    if (await jalankan(simpanDraf)) {
      setInfo("Artikel disimpan.");
      keEditor();
    }
  };
  const terbitkan = async () => {
    const ok = await jalankan(async () => {
      if (belumSimpan() || !detail()) await simpanDraf();
      const d = detail();
      if (d) setDetail(await api<PostAdminDetail>(`/posts/${encodeURIComponent(d.id)}/publish`, { method: "POST", body: {} }));
    });
    if (ok) {
      setInfo("Terbit. Artikel tampil di landing dalam satu menit.");
      keEditor();
    }
  };
  const tarik = async () => {
    const d = detail();
    if (!d) return;
    const ok = await jalankan(async () => {
      setDetail(await api<PostAdminDetail>(`/posts/${encodeURIComponent(d.id)}/unpublish`, { method: "POST", body: {} }));
    });
    if (ok) setInfo("Artikel ditarik dari publik dan kembali menjadi draf.");
  };
  const hapus = async () => {
    const d = detail();
    if (!d) return;
    const ok = await jalankan(async () => {
      await api(`/posts/${encodeURIComponent(d.id)}`, { method: "DELETE" });
      setBelumSimpan(false);
    });
    if (ok) nav("/artikel", { replace: true });
  };

  /** Unggah gambar artikel. Mengembalikan null (dan menyimpan pesan galat) bila gagal. */
  const unggah = async (file: File, tempat: Tempat): Promise<PostMedia | null> => {
    setGalatUnggah(null);
    if (!TIPE_GAMBAR.includes(file.type)) {
      setGalatUnggah({ tempat, pesan: "Gambar harus berformat JPG, PNG, atau WebP." });
      return null;
    }
    if (file.size > POST_MEDIA_MAX_BYTES) {
      setGalatUnggah({ tempat, pesan: `Gambar terlalu besar. Maksimal ${POST_MEDIA_MAX_BYTES / 1024 / 1024} MB.` });
      return null;
    }
    setMengunggah(tempat);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/posts/media", { method: "POST", credentials: "same-origin", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, "error", data?.error?.message ?? "Gambar tidak bisa diunggah. Coba lagi.");
      const media = data as PostMedia;
      const pos = media.url.lastIndexOf(media.id);
      if (!mediaBase() && pos >= 0) setMediaBase(media.url.slice(0, pos));
      return media;
    } catch (e) {
      setGalatUnggah({ tempat, pesan: e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi." });
      return null;
    } finally {
      setMengunggah(null);
    }
  };

  const pilihSampul = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const media = await unggah(file, "sampul");
    if (!media) return;
    setF(
      produce((x) => {
        x.coverMediaId = media.id;
        x.coverUrl = media.url;
      }),
    );
    setBelumSimpan(true);
    setInfo("");
  };
  const hapusSampul = () => {
    setF(
      produce((x) => {
        x.coverMediaId = null;
        x.coverUrl = null;
        x.coverAlt = "";
      }),
    );
    setBelumSimpan(true);
    setInfo("");
  };

  const mediaUrl = (id: string) => (mediaBase() ? mediaBase() + id : null);
  const galatDi = (t: Tempat) => (galatUnggah()?.tempat === t ? galatUnggah()?.pesan : "") ?? "";

  return (
    <>
      <section class="master status-situs" aria-label="Status artikel">
        <p>
          <Show when={detail()} fallback={<strong>Artikel baru, belum disimpan.</strong>}>
            {(d) => (
              <>
                <Show when={d().status === "published"} fallback={<strong>Draf.</strong>}>
                  <strong>Terbit</strong> sejak {d().publishedAt ? waktu(d().publishedAt as string) : "-"}.
                </Show>{" "}
                Penulis {d().authorName}. Terakhir diubah {waktu(d().updatedAt)}.{" "}
              </>
            )}
          </Show>
          <Show when={belumSimpan()}>Ada perubahan di layar yang belum disimpan.</Show>
        </p>
        <Show when={!bisaUbah()}>
          <div class="info" role="status">
            Artikel ini ditulis orang lain. Anda hanya bisa membacanya.
          </div>
        </Show>
        <Show when={pesanGalat()}>
          <div class="peringatan" role="alert">
            {pesanGalat()}
          </div>
        </Show>
        <Show when={info()}>
          <div class="info" role="status">
            {info()}
          </div>
        </Show>
        <Show when={bisaUbah()}>
          <div class="butir-aksi aksi-situs">
            <button class="tombol" type="button" disabled={sibuk() || !belumSimpan()} onClick={simpan}>
              {sibuk() ? "Memproses…" : "Simpan"}
            </button>
            <Show when={!terbit()}>
              <Show
                when={konfirmasi() === "terbit"}
                fallback={
                  <button class="tombol utama" type="button" disabled={sibuk()} onClick={() => setKonfirmasi("terbit")}>
                    Terbitkan
                  </button>
                }
              >
                <button class="tombol utama" type="button" disabled={sibuk()} onClick={terbitkan}>
                  Ya, terbitkan sekarang
                </button>
                <button class="tombol tipis" type="button" onClick={() => setKonfirmasi(null)}>
                  Batal
                </button>
              </Show>
            </Show>
            <Show when={terbit()}>
              <Show
                when={konfirmasi() === "tarik"}
                fallback={
                  <button class="tombol tipis" type="button" disabled={sibuk()} onClick={() => setKonfirmasi("tarik")}>
                    Tarik dari publik
                  </button>
                }
              >
                <button class="tombol bahaya" type="button" disabled={sibuk()} onClick={tarik}>
                  Ya, tarik
                </button>
                <button class="tombol tipis" type="button" onClick={() => setKonfirmasi(null)}>
                  Batal
                </button>
              </Show>
            </Show>
            <Show when={detail()}>
              <Show
                when={konfirmasi() === "hapus"}
                fallback={
                  <button class="tombol tipis" type="button" disabled={sibuk()} onClick={() => setKonfirmasi("hapus")}>
                    Hapus
                  </button>
                }
              >
                <button class="tombol bahaya" type="button" disabled={sibuk()} onClick={hapus}>
                  Ya, hapus artikel
                </button>
                <button class="tombol tipis" type="button" onClick={() => setKonfirmasi(null)}>
                  Batal
                </button>
              </Show>
            </Show>
          </div>
        </Show>
      </section>

      <section class="master form editor-artikel" aria-label="Isi artikel">
        <h2>Judul dan alamat</h2>
        <div class="dua-bahasa">
          <Field
            id="judul-id"
            label="Judul (Indonesia)"
            value={f.titleId}
            onInput={(v) => isi("titleId", v)}
            error={salah("title.id")}
            maxlength={160}
            required
          />
          <Field
            id="judul-en"
            label="Judul (English)"
            value={f.titleEn}
            onInput={(v) => isi("titleEn", v)}
            error={salah("title.en")}
            hint="Opsional. Kosong = pakai Indonesia."
            maxlength={160}
          />
        </div>
        <Field
          id="slug"
          label="Alamat artikel"
          value={f.slug}
          onInput={(v) => isi("slug", v.toLowerCase())}
          error={salah("slug")}
          hint="Huruf kecil, angka, dan tanda hubung, 3 sampai 80 karakter (contoh: juara-liga-u13). Kosong = dibuat otomatis dari judul. Mengubahnya mengubah tautan artikel."
          maxlength={80}
          placeholder="otomatis dari judul"
        />
        <Field
          id="kategori"
          label="Kategori"
          value={f.category}
          onInput={(v) => isi("category", v)}
          error={salah("category")}
          hint="Opsional, mis. Berita, Prestasi, Pengumuman."
          maxlength={40}
        />
        <h2>Ringkasan</h2>
        <div class="dua-bahasa">
          <ArtikelRingkas
            id="ringkasan-id"
            label="Ringkasan (Indonesia)"
            value={f.excerptId}
            onInput={(v) => isi("excerptId", v)}
            error={salah("excerpt.id")}
          />
          <ArtikelRingkas
            id="ringkasan-en"
            label="Ringkasan (English)"
            value={f.excerptEn}
            onInput={(v) => isi("excerptEn", v)}
            error={salah("excerpt.en")}
            hint="Opsional. Kosong = pakai Indonesia."
          />
        </div>

        <h2>Foto sampul</h2>
        <div class="sampul-artikel">
          <Show when={f.coverUrl} fallback={<p class="kosong">Belum ada foto sampul.</p>}>
            {(u) => <img class="sampul-pratinjau" src={u()} alt={f.coverAlt || "Foto sampul"} />}
          </Show>
          <div class="butir-aksi">
            <button class="tombol tipis" type="button" disabled={!bisaUbah() || mengunggah() !== null} onClick={() => berkasSampul?.click()}>
              {mengunggah() === "sampul" ? "Mengunggah…" : f.coverUrl ? "Ganti foto" : "Unggah foto"}
            </button>
            <Show when={f.coverUrl && bisaUbah()}>
              <button class="tombol tipis" type="button" onClick={hapusSampul}>
                Hapus sampul
              </button>
            </Show>
            <input ref={berkasSampul} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pilihSampul} />
          </div>
          <span class="petunjuk">JPG, PNG, atau WebP, maksimal 5 MB.</span>
          <Show when={galatDi("sampul")}>
            <span class="pesan-salah" role="alert">
              {galatDi("sampul")}
            </span>
          </Show>
          <Show when={salah("coverMediaId")}>
            <span class="pesan-salah">{salah("coverMediaId")}</span>
          </Show>
        </div>
        <Field
          id="sampul-alt"
          label="Teks alternatif sampul"
          value={f.coverAlt}
          onInput={(v) => isi("coverAlt", v)}
          error={salah("coverAlt")}
          hint="Deskripsi singkat foto untuk pembaca layar dan saat gambar gagal dimuat."
          maxlength={200}
        />

        <h2>Isi artikel</h2>
        <p class="petunjuk">
          Tulis dengan Markdown sederhana: gunakan tombol di atas kolom isi, atau ketik langsung. Tab Pratinjau menunjukkan tampilan di landing.
        </p>
        <ArtikelIsi
          id="isi-id"
          label="Isi (Indonesia)"
          value={f.bodyId}
          onInput={(v) => isi("bodyId", v)}
          error={salah("body.id")}
          mediaUrl={mediaUrl}
          unggah={(file) => unggah(file, "id")}
          sedangUnggah={mengunggah() === "id"}
          galatUnggah={galatDi("id")}
          bisaUbah={bisaUbah()}
        />
        <ArtikelIsi
          id="isi-en"
          label="Isi (English)"
          hint="Opsional. Kosong = pakai Indonesia."
          value={f.bodyEn}
          onInput={(v) => isi("bodyEn", v)}
          error={salah("body.en")}
          mediaUrl={mediaUrl}
          unggah={(file) => unggah(file, "en")}
          sedangUnggah={mengunggah() === "en"}
          galatUnggah={galatDi("en")}
          bisaUbah={bisaUbah()}
        />
      </section>
    </>
  );
}

/** Ringkasan pendek (maks 300 huruf) dengan penghitung. */
function ArtikelRingkas(p: { id: string; label: string; value: string; onInput: (v: string) => void; error?: string | undefined; hint?: string }) {
  return (
    <div class="field" attr:data-salah={p.error ? "" : undefined}>
      <label for={p.id}>{p.label}</label>
      <textarea
        id={p.id}
        name={p.id}
        rows={3}
        maxlength={300}
        value={p.value}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        aria-invalid={p.error ? "true" : undefined}
      />
      <span class="petunjuk">
        {p.value.length}/300
        {p.hint ? ` · ${p.hint}` : ""}
      </span>
      <Show when={p.error}>
        <span class="pesan-salah">{p.error}</span>
      </Show>
    </div>
  );
}
