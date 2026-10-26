import { createSignal, type JSX, Show } from "solid-js";
import { POST_MEDIA_MAX_BYTES, type Localized, type SiteSectionHead, type SiteSectionKey } from "@ssb/shared";
import { buatLokal, type Sunting } from "~/lib/situs";
import AreaField from "./AreaField";
import Field from "./Field";

/** Teks dua bahasa: kolom Indonesia (wajib) dan English (opsional, kosong = pakai Indonesia). */
export function Lokal(p: {
  id: string;
  label: string;
  value: Localized | undefined;
  onChange: (v: Localized) => void;
  /** Jalur kolom di dokumen, untuk menampilkan galat dari API (mis. `programs.0.name`). */
  jalur: string;
  salah: (jalur: string) => string | undefined;
  panjang?: boolean;
  hint?: string;
}) {
  const idVal = () => p.value?.id ?? "";
  const enVal = () => p.value?.en ?? "";
  const tulisEn = (v: string) => p.onChange(buatLokal(idVal(), v === "" ? undefined : v));
  return (
    <div class="dua-bahasa">
      <Show
        when={p.panjang}
        fallback={
          <>
            <Field
              id={`${p.id}-id`}
              label={`${p.label} (Indonesia)`}
              value={idVal()}
              onInput={(v) => p.onChange(buatLokal(v, p.value?.en))}
              error={p.salah(`${p.jalur}.id`)}
              hint={p.hint}
              maxlength={2000}
            />
            <Field id={`${p.id}-en`} label={`${p.label} (English)`} value={enVal()} onInput={tulisEn} error={p.salah(`${p.jalur}.en`)} maxlength={2000} />
          </>
        }
      >
        <AreaField
          id={`${p.id}-id`}
          label={`${p.label} (Indonesia)`}
          value={idVal()}
          onInput={(v) => p.onChange(buatLokal(v, p.value?.en))}
          error={p.salah(`${p.jalur}.id`)}
          hint={p.hint}
          maxlength={2000}
        />
        <AreaField id={`${p.id}-en`} label={`${p.label} (English)`} value={enVal()} onInput={tulisEn} error={p.salah(`${p.jalur}.en`)} maxlength={2000} />
      </Show>
    </div>
  );
}

/** Satu butir dalam daftar yang bisa digeser dan dihapus, dengan judul ringkas. */
export function Butir(p: { judul: string; i: number; jumlah: number; geser: (arah: -1 | 1) => void; hapus: () => void; children: JSX.Element }) {
  return (
    <fieldset class="butir-situs">
      <legend>{p.judul}</legend>
      <div class="butir-aksi aksi-butir-situs">
        <button class="tombol tipis" type="button" disabled={p.i === 0} aria-label={`Naikkan ${p.judul}`} onClick={() => p.geser(-1)}>
          Naik
        </button>
        <button class="tombol tipis" type="button" disabled={p.i >= p.jumlah - 1} aria-label={`Turunkan ${p.judul}`} onClick={() => p.geser(1)}>
          Turun
        </button>
        <button class="tombol tipis" type="button" aria-label={`Hapus ${p.judul}`} onClick={p.hapus}>
          Hapus
        </button>
      </div>
      {p.children}
    </fieldset>
  );
}

const NAMA_BAGIAN: Record<SiteSectionKey, string> = {
  programs: "Program",
  coaches: "Pelatih",
  facilities: "Fasilitas",
  matches: "Pertandingan",
  testimonials: "Testimoni",
};

/** Isian header sebuah bagian di landing: label kecil, judul, dan pengantar. Kosong = teks bawaan landing. */
export function HeaderBagian(p: { s: Sunting; kunci: SiteSectionKey }) {
  const { d, ubah, salah } = p.s;
  const ubahBagian = (kolom: keyof SiteSectionHead) => (v: Localized) =>
    ubah((x) => {
      const sections = x.sections ?? {};
      const h = sections[p.kunci] ?? {};
      h[kolom] = v;
      sections[p.kunci] = h;
      x.sections = sections;
    });
  const nilai = (kolom: keyof SiteSectionHead) => d.sections?.[p.kunci]?.[kolom];
  const jalur = (kolom: string) => `sections.${p.kunci}.${kolom}`;
  return (
    <fieldset class="butir-situs">
      <legend>Header bagian {NAMA_BAGIAN[p.kunci]}</legend>
      <p class="petunjuk">
        Teks di atas daftar pada halaman landing. Kosongkan kolom Indonesia untuk memakai teks bawaan landing. Label kecil diikuti tahun berdiri otomatis.
      </p>
      <div class="form">
        <Lokal
          id={`head-${p.kunci}-label`}
          label="Label kecil"
          value={nilai("eyebrow")}
          onChange={ubahBagian("eyebrow")}
          jalur={jalur("eyebrow")}
          salah={salah}
        />
        <Lokal id={`head-${p.kunci}-judul`} label="Judul" value={nilai("title")} onChange={ubahBagian("title")} jalur={jalur("title")} salah={salah} />
        <Lokal
          id={`head-${p.kunci}-pengantar`}
          label="Pengantar"
          panjang
          value={nilai("intro")}
          onChange={ubahBagian("intro")}
          jalur={jalur("intro")}
          salah={salah}
        />
      </div>
    </fieldset>
  );
}

const TIPE_FOTO = ["image/jpeg", "image/png", "image/webp"];

/** Foto bagian situs: unggah lewat media artikel, lalu simpan URL-nya di konten. Kosong = foto bawaan landing. */
export function FotoSitus(p: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
  error?: string;
  bawaan: string;
}) {
  let berkas: HTMLInputElement | undefined;
  const [sibuk, setSibuk] = createSignal(false);
  const [galat, setGalat] = createSignal("");
  const pilih = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setGalat("");
    if (!TIPE_FOTO.includes(file.type)) return setGalat("Gambar harus berformat JPG, PNG, atau WebP.");
    if (file.size > POST_MEDIA_MAX_BYTES) return setGalat(`Gambar terlalu besar. Maksimal ${POST_MEDIA_MAX_BYTES / 1024 / 1024} MB.`);
    setSibuk(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/posts/media", { method: "POST", credentials: "same-origin", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "Gambar tidak bisa diunggah. Coba lagi.");
      p.onChange((data as { url: string }).url);
    } catch (err) {
      setGalat(err instanceof Error && err.message ? err.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };
  return (
    <div class="sampul-artikel" id={p.id}>
      <strong>{p.label}</strong>
      <Show when={p.value} fallback={<p class="kosong">{p.bawaan}</p>}>
        {(u) => <img class="sampul-pratinjau" src={u()} alt={p.label} />}
      </Show>
      <div class="butir-aksi">
        <button class="tombol tipis" type="button" disabled={sibuk()} onClick={() => berkas?.click()}>
          {sibuk() ? "Mengunggah…" : p.value ? "Ganti foto" : "Unggah foto"}
        </button>
        <Show when={p.value}>
          <button class="tombol tipis" type="button" onClick={() => p.onChange(undefined)}>
            Pakai foto bawaan
          </button>
        </Show>
        <input ref={berkas} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pilih} />
      </div>
      <span class="petunjuk">JPG, PNG, atau WebP, maksimal 5 MB.</span>
      <Show when={galat() || p.error}>
        <span class="pesan-salah" role="alert">
          {galat() || p.error}
        </span>
      </Show>
    </div>
  );
}
