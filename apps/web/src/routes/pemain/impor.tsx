import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import { IMPORT_HEADER, IMPORT_MAX_ROWS, parseCsv, petakanBaris, type ImportFailure, type ImportReport, type ImportRow } from "@ssb/shared/impor";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import type { AgeGroup } from "~/lib/pemain";

/** Isi templat: judul seperti lembar SSB dan satu baris contoh. */
const TEMPLAT = `${IMPORT_HEADER.join(",")}\n1,SSB-001,3142186517,Muhammad Setia Budi,Garut,21-Jan-14,KU-12,Penyerang,Nurlinda,81234567890,Lengkap,,,,60,M,38\n`;

export default function ImporSiswa() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [berkas, setBerkas] = createSignal("");
  const [baris, setBaris] = createSignal<ImportRow[]>([]);
  const [kolom, setKolom] = createSignal<{ dikenali: string[]; takDikenal: string[] }>({ dikenali: [], takDikenal: [] });
  const [periksa, setPeriksa] = createSignal<ImportReport | null>(null);
  const [hasil, setHasil] = createSignal<ImportReport | null>(null);
  const [galat, setGalat] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/pemain", { replace: true });
    setMe(m);
    setGroups(await api<AgeGroup[]>("/age-groups").catch(() => []));
  });

  /** Baris yang bisa dikirim: tanpa isian yang tidak dipahami. Sisanya langsung dilaporkan gagal. */
  const siap = () => baris().filter((r) => r.galat.length === 0);
  const gagalLokal = (): ImportFailure[] =>
    baris()
      .filter((r) => r.galat.length > 0)
      .map((r) => ({ nomor: r.nomor, nama: String(r.data.fullName ?? ""), galat: r.galat }));
  const semuaGagal = (lap: ImportReport | null) => [...gagalLokal(), ...(lap?.gagal ?? [])].sort((a, b) => a.nomor - b.nomor);

  const kirim = async (dryRun: boolean) => {
    setSibuk(true);
    setGalat("");
    try {
      const lap = await api<ImportReport>("/players/import", { method: "POST", body: { rows: siap().map((r) => ({ nomor: r.nomor, data: r.data })), dryRun } });
      if (dryRun) setPeriksa(lap);
      else setHasil(lap);
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  const pilihBerkas = async (e: Event & { currentTarget: HTMLInputElement }) => {
    const f = e.currentTarget.files?.[0];
    setPeriksa(null);
    setHasil(null);
    setBaris([]);
    setGalat("");
    if (!f) return;
    setBerkas(f.name);
    const peta = petakanBaris(parseCsv(await f.text()), groups());
    setKolom({ dikenali: peta.kolomDikenali, takDikenal: peta.kolomTakDikenal });
    if (!peta.kolomDikenali.includes("fullName") || !peta.kolomDikenali.includes("birthDate")) {
      setGalat("Kolom Nama Lengkap dan Tanggal Lahir wajib ada di baris pertama. Pastikan berkas disimpan sebagai CSV dengan judul kolom di baris 1.");
      return;
    }
    if (peta.baris.length === 0) {
      setGalat("Tidak ada baris data di berkas ini.");
      return;
    }
    if (peta.baris.length > IMPORT_MAX_ROWS) {
      setGalat(`Terlalu banyak baris (${peta.baris.length}). Maksimal ${IMPORT_MAX_ROWS} per berkas; bagi menjadi beberapa berkas.`);
      return;
    }
    setBaris(peta.baris);
    if (siap().length > 0) await kirim(true);
  };

  const unduhTemplat = () => {
    const a = document.createElement("a");
    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${TEMPLAT}`)}`;
    a.download = "templat-data-siswa.csv";
    a.click();
  };

  const Masalah = (props: { daftar: ImportFailure[] }) => (
    <div class="tabel-bungkus">
      <table class="tabel-pemain">
        <thead>
          <tr>
            <th>Baris</th>
            <th>Nama</th>
            <th>Masalah</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.daftar}>
            {(g) => (
              <tr>
                <td data-label="Baris">{g.nomor}</td>
                <td data-label="Nama">{g.nama || "-"}</td>
                <td data-label="Masalah">
                  <ul class="daftar-masalah">
                    <For each={g.galat}>{(m) => <li>{m}</li>}</For>
                  </ul>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Impor siswa · SSB App</Title>
      <main class="halaman">
        <KepalaHalaman
          chip="Data siswa"
          judul="Impor siswa dari lembar"
          sub="Unggah lembar data siswa (CSV). Hasilnya diperiksa dulu; tidak ada yang disimpan sebelum Anda menekan Impor."
        />

        <section class="panel panel-isi bagian-form" aria-label="Langkah impor">
          <h2>1. Siapkan berkas</h2>
          <p class="petunjuk">
            Dari Excel atau Google Sheets: Simpan atau Unduh sebagai CSV. Judul kolom di baris pertama, urutan kolom bebas. Kolom yang dikenali: ID Siswa, NISN,
            Nama Lengkap, Tempat Lahir, Tanggal Lahir (21-Jan-14 atau 21/01/2014), Kelompok Usia (U-12 atau KU-12), Posisi (Penyerang, Gelandang, Bek, Kiper),
            Nama Orang Tua, No. WhatsApp, Status Berkas, Tinggi Badan, Berat Badan, Catatan Medis, No. Punggung, Ukuran Jersey, Ukuran Sepatu. Hanya Nama dan
            Tanggal Lahir yang wajib. ID Siswa kosong dibuat otomatis. KU harus sudah ada di <A href="/master">Data master</A>.
          </p>
          <p>
            <button class="tombol tipis" type="button" onClick={unduhTemplat}>
              Unduh templat CSV
            </button>
          </p>
          <h2>2. Pilih berkas</h2>
          <div class="field">
            <label for="berkas-csv">Berkas CSV (maksimal {IMPORT_MAX_ROWS} baris)</label>
            <input id="berkas-csv" type="file" accept=".csv,.txt,text/csv" onChange={pilihBerkas} disabled={sibuk()} />
          </div>
        </section>

        <Show when={galat()}>
          <p class="pesan-salah" role="alert">
            {galat()}
          </p>
        </Show>

        <Show when={baris().length > 0 && !hasil()}>
          <section class="panel panel-isi bagian-form" aria-label="Hasil pemeriksaan" aria-busy={sibuk()}>
            <h2>3. Periksa hasil</h2>
            <p>
              <strong>{berkas()}</strong>: {baris().length} baris terbaca.
              <Show when={kolom().takDikenal.length > 0}> Kolom diabaikan: {kolom().takDikenal.join(", ")}.</Show>
            </p>
            <Show when={periksa() || siap().length === 0} fallback={<p class="petunjuk">Memeriksa…</p>}>
              <p>
                <strong>{periksa()?.created ?? 0}</strong> siswa siap diimpor, <strong>{semuaGagal(periksa()).length}</strong> baris bermasalah.
              </p>
              <Show when={semuaGagal(periksa()).length > 0}>
                <Masalah daftar={semuaGagal(periksa())} />
                <p class="petunjuk">Baris bermasalah dilewati. Perbaiki di lembar dan unggah lagi, atau tambahkan manual nanti.</p>
              </Show>
              <button class="tombol utama" type="button" disabled={sibuk() || (periksa()?.created ?? 0) === 0} onClick={() => kirim(false)}>
                {sibuk() ? "Mengimpor…" : `Impor ${periksa()?.created ?? 0} siswa`}
              </button>
            </Show>
          </section>
        </Show>

        <Show when={hasil()}>
          <section class="panel panel-isi bagian-form" aria-label="Hasil impor">
            <div class="info" role="status">
              <strong>{hasil()!.created} siswa</strong> berhasil diimpor.{" "}
              <Show when={semuaGagal(hasil()).length > 0}>{semuaGagal(hasil()).length} baris dilewati.</Show>
            </div>
            <Show when={semuaGagal(hasil()).length > 0}>
              <Masalah daftar={semuaGagal(hasil())} />
            </Show>
            <p>
              <A class="tombol utama" href="/pemain">
                Lihat daftar siswa
              </A>
            </p>
          </section>
        </Show>

        <p class="tautan-bawah">
          <A href="/pemain">Kembali ke daftar siswa</A>
        </p>
      </main>
    </Show>
  );
}
