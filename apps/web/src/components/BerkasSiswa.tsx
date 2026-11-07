import { DOCUMENT_LABEL_MAX, DOCUMENT_MAX_BYTES, playerDocumentKindLabel, RAPORT_MAX, type PlayerDocument, type PlayerDocumentKind } from "@ssb/shared";
import { createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import { api, ApiError } from "~/lib/api";
import { tanggal } from "~/lib/pemain";

const TIPE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const SATU: PlayerDocumentKind[] = ["kartu_keluarga", "akta_kelahiran", "nisn"];

const ukuran = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * Berkas siswa: kartu keluarga, akta kelahiran, NISN, dan raport (PDF atau gambar, maksimal 5 MB). Data pribadi keluarga,
 * jadi hanya tampil untuk admin SSB dan orang tua anaknya. Selain raport, unggahan baru menggantikan yang lama.
 */
export default function BerkasSiswa(props: { playerId: string }) {
  const dasar = `/players/${encodeURIComponent(props.playerId)}/documents`;
  const [daftar, setDaftar] = createSignal<PlayerDocument[] | null>(null);
  const [sibuk, setSibuk] = createSignal<string | null>(null);
  const [galat, setGalat] = createSignal("");
  const [labelRaport, setLabelRaport] = createSignal("");

  const muat = async () => setDaftar(await api<PlayerDocument[]>(dasar));
  onMount(() => {
    muat().catch((e) => setGalat(e instanceof ApiError ? e.message : "Berkas tidak bisa dimuat. Coba lagi."));
  });

  const dari = (kind: PlayerDocumentKind) => (daftar() ?? []).filter((d) => d.kind === kind);
  const berkasUrl = (d: PlayerDocument) => `/api${dasar}/${encodeURIComponent(d.id)}/file`;

  const unggah = async (kind: PlayerDocumentKind, e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setGalat("");
    if (!TIPE.includes(file.type)) return setGalat("Berkas harus berformat PDF, JPG, PNG, atau WebP.");
    if (file.size > DOCUMENT_MAX_BYTES) return setGalat("Berkas terlalu besar. Maksimal 5 MB.");
    const label = labelRaport().trim();
    if (kind === "raport" && !label) return setGalat("Isi keterangan raport dulu, mis. Semester 1 2025/2026.");
    setSibuk(kind);
    try {
      const body = new FormData();
      body.set("kind", kind);
      if (kind === "raport") body.set("label", label);
      body.set("file", file);
      const res = await fetch(`/api${dasar}`, { method: "POST", credentials: "same-origin", body });
      if (!res.ok) throw new ApiError(res.status, "error", (await res.json().catch(() => null))?.error?.message ?? "Berkas tidak bisa diunggah. Coba lagi.", {});
      if (kind === "raport") setLabelRaport("");
      await muat();
    } catch (err) {
      setGalat(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(null);
    }
  };

  const hapus = async (d: PlayerDocument) => {
    if (!window.confirm(`Hapus ${playerDocumentKindLabel[d.kind]}${d.label ? ` (${d.label})` : ""}? Berkas tidak bisa dikembalikan.`)) return;
    setGalat("");
    setSibuk(d.id);
    try {
      await api(`${dasar}/${encodeURIComponent(d.id)}`, { method: "DELETE" });
      await muat();
    } catch (err) {
      setGalat(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(null);
    }
  };

  const Berkas = (p: { d: PlayerDocument }) => (
    <>
      <a href={berkasUrl(p.d)} target="_blank" rel="noopener noreferrer">
        {p.d.originalName}
      </a>{" "}
      <span class="petunjuk">
        {ukuran(p.d.sizeBytes)} · diunggah {tanggal(p.d.uploadedAt)}
      </span>
    </>
  );

  return (
    <section class="master" id="berkas">
      <h2>Berkas siswa</h2>
      <p class="petunjuk">PDF, JPG, PNG, atau WebP, maksimal 5 MB per berkas. Hanya admin SSB dan orang tua anak ini yang bisa melihat. Pelatih tidak.</p>
      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>
      <Show when={daftar()} fallback={<p class="kosong">Memuat berkas…</p>}>
        <ul class="daftar-butir">
          <For each={SATU}>
            {(kind) => (
              <li class="butir">
                <span class="isi">
                  <strong>{playerDocumentKindLabel[kind]}</strong>
                  <br />
                  <Show when={dari(kind)[0]} fallback={<span class="petunjuk">Belum diunggah</span>}>
                    {(d) => <Berkas d={d()} />}
                  </Show>
                </span>
                <span class="foto-kelola">
                  <label class="tombol tombol-kecil" aria-disabled={sibuk() !== null}>
                    {sibuk() === kind ? "Mengunggah…" : dari(kind)[0] ? "Ganti" : "Unggah"}
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={sibuk() !== null} onChange={(e) => unggah(kind, e)} />
                  </label>
                </span>
                <Show when={dari(kind)[0]}>
                  {(d) => (
                    <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk() !== null} onClick={() => hapus(d())}>
                      Hapus
                    </button>
                  )}
                </Show>
              </li>
            )}
          </For>
          <For each={dari("raport")}>
            {(d) => (
              <li class="butir">
                <span class="isi">
                  <strong>Raport: {d.label}</strong>
                  <br />
                  <Berkas d={d} />
                </span>
                <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk() !== null} onClick={() => hapus(d)}>
                  Hapus
                </button>
              </li>
            )}
          </For>
        </ul>
        <Show when={dari("raport").length === 0}>
          <p class="petunjuk">Raport: belum diunggah.</p>
        </Show>
        <Show
          when={dari("raport").length < RAPORT_MAX}
          fallback={<p class="petunjuk">Raport sudah {RAPORT_MAX} berkas. Hapus yang lama untuk menambah.</p>}
        >
          <div class="form">
            <Field
              id="raport-label"
              label="Tambah raport"
              hint="Keterangan wajib diisi dulu, lalu pilih berkasnya."
              placeholder="mis. Semester 1 2025/2026"
              maxlength={DOCUMENT_LABEL_MAX}
              value={labelRaport()}
              onInput={setLabelRaport}
            />
            <div class="foto-kelola">
              <label class="tombol tombol-kecil" aria-disabled={sibuk() !== null}>
                {sibuk() === "raport" ? "Mengunggah…" : "Pilih berkas raport"}
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={sibuk() !== null} onChange={(e) => unggah("raport", e)} />
              </label>
            </div>
          </div>
        </Show>
      </Show>
    </section>
  );
}
