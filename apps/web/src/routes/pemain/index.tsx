import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import Ikon from "~/components/Ikon";
import { api, getMe, type Me } from "~/lib/api";
import { inisial, posisiLabel, statusLabel, usia, tanggal, type AgeGroup, type PlayerSummary } from "~/lib/pemain";
import type { AttendanceSummary, PlayerOverview } from "@ssb/shared";

const PER_HALAMAN = 10;
const koma = (n: number) => String(n).replace(".", ",");
/** Tautan WhatsApp dari nomor lokal (08...) atau internasional; null bila tidak terbaca sebagai nomor. */
const linkWa = (nomor: string | null) => {
  const d = (nomor ?? "").replace(/D/g, "");
  if (d.length < 8) return null;
  return `https://wa.me/${d.startsWith("0") ? `62${d.slice(1)}` : d}`;
};

export default function DaftarPemain() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [q, setQ] = createSignal("");
  const [ku, setKu] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [posisi, setPosisi] = createSignal("");
  const [halaman, setHalaman] = createSignal(1);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    // Orang tua tidak punya akses ke data master; filter KU tidak ditampilkan untuk mereka.
    if (m.active.role !== "orang_tua") setGroups(await api<AgeGroup[]>("/age-groups").catch(() => []));
  });

  const role = () => me()?.active?.role;
  const orangTua = () => role() === "orang_tua";
  const [players] = createResource(
    () => me(),
    () => api<PlayerSummary[]>("/players"),
  );
  const [sum] = createResource(
    () => (me() && !orangTua() ? true : null),
    () => api<AttendanceSummary>("/attendance/summary").catch(() => null),
  );
  const stat = (id: string) => sum()?.players.find((p) => p.playerId === id);
  // Wali utama dan penilaian terakhir tiap pemain; wali hanya dikirim API untuk admin SSB.
  const [ringkas] = createResource(
    () => (me() && !orangTua() ? true : null),
    () => api<PlayerOverview[]>("/players-overview").catch(() => null),
  );
  const info = (id: string) => ringkas()?.find((r) => r.playerId === id);
  const adminSsb = () => role() === "admin_ssb";

  // Filter dan paging dikerjakan di sisi klien: API mengembalikan seluruh pemain yang boleh dilihat.
  const disaring = createMemo(() => {
    const kata = q().trim().toLowerCase();
    return (players() ?? []).filter(
      (p) =>
        (!kata || p.fullName.toLowerCase().includes(kata) || (p.memberNo ?? "").toLowerCase().includes(kata)) &&
        (!ku() || p.ageGroup?.id === ku()) &&
        (!status() || p.status === status()) &&
        (!posisi() || p.position === posisi()),
    );
  });
  const jumlahHalaman = () => Math.max(1, Math.ceil(disaring().length / PER_HALAMAN));
  const halamanKini = () => Math.min(halaman(), jumlahHalaman());
  const tampil = () => disaring().slice((halamanKini() - 1) * PER_HALAMAN, halamanKini() * PER_HALAMAN);
  const sedangDisaring = () => !!(q().trim() || ku() || status() || posisi());
  const reset = () => {
    setQ("");
    setKu("");
    setStatus("");
    setPosisi("");
    setHalaman(1);
  };
  const ubah = (set: (v: string) => void) => (v: string) => {
    set(v);
    setHalaman(1);
  };

  // Ringkasan memakai seluruh pemain, tidak ikut terpengaruh filter.
  const ringkasan = createMemo(() => {
    const semua = players() ?? [];
    const aktif = semua.filter((p) => p.status === "aktif").length;
    const perKu = new Map<string, number>();
    for (const p of semua) if (p.ageGroup) perKu.set(p.ageGroup.name, (perKu.get(p.ageGroup.name) ?? 0) + 1);
    const terbanyak = [...perKu.entries()].sort((a, b) => b[1] - a[1])[0];
    const hadir = (sum()?.players ?? []).reduce((n, p) => n + p.hadir, 0);
    const tercatat = (sum()?.players ?? []).reduce((n, p) => n + p.recorded, 0);
    return {
      total: semua.length,
      aktif,
      tidakAktif: semua.length - aktif,
      jumlahKu: perKu.size,
      terbanyak,
      hadir,
      tercatat,
      persenHadir: tercatat ? Math.round((hadir / tercatat) * 1000) / 10 : null,
      tanpaKu: semua.filter((p) => !p.ageGroup).length,
    };
  });

  const kosong = () =>
    sedangDisaring()
      ? "Tidak ada pemain yang cocok dengan pencarian ini."
      : role() === "admin_ssb"
        ? "Belum ada pemain. Tambahkan pemain pertama."
        : orangTua()
          ? "Belum ada anak yang terhubung ke akun Anda. Hubungi admin SSB."
          : "Belum ada pemain di KU yang ditugaskan kepada Anda. Hubungi admin SSB untuk penugasan KU.";

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Pemain · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman lebar">
        <Show when={players.error}>
          <div class="peringatan" role="alert">
            Daftar pemain tidak bisa dimuat. Muat ulang halaman.
          </div>
        </Show>

        {/* Orang tua: daftar anak sederhana */}
        <Show when={orangTua()}>
          <h1>Anak Anda</h1>
          <Show when={players() && players()!.length === 0}>
            <p class="kosong">{kosong()}</p>
          </Show>
          <ul class="daftar-butir">
            <For each={players()}>
              {(pl) => (
                <li class="butir">
                  <A class="pemain-tautan" href={`/pemain/${pl.id}`}>
                    <strong>{pl.fullName}</strong>
                    <span class="petunjuk">
                      {[pl.memberNo, pl.ageGroup?.name ?? "Tanpa KU", `${usia(pl.birthDate)} th`, pl.position ? posisiLabel[pl.position] : null]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </A>
                </li>
              )}
            </For>
          </ul>
        </Show>

        {/* Admin, korlas, pelatih: buku induk bergaya dashboard */}
        <Show when={!orangTua()}>
          <header class="kepala-dashboard">
            <div>
              <p class="jejak">
                <span class="ortu-chip">Buku induk registrasi</span>
                <span aria-hidden="true">/</span>
                <span>{me()!.active!.ssbName}</span>
              </p>
              <h1>Data pemain</h1>
              <Show when={players()}>
                <p class="petunjuk">
                  Total <strong>{ringkasan().total} siswa</strong> terdaftar di {ringkasan().jumlahKu} kelompok umur
                </p>
              </Show>
            </div>
            <Show when={role() === "admin_ssb"}>
              <A class="tombol utama tambah" href="/pemain/baru">
                <Ikon nama="tambah" ukuran={18} />
                Tambah pemain baru
              </A>
            </Show>
          </header>

          <Show when={players() && players()!.length > 0}>
            <section class="statistik" aria-label="Ringkasan">
              <div class="ubin">
                <span class="label-ubin">Total siswa aktif</span>
                <span class="angka-ubin">
                  {ringkasan().aktif}
                  <Show when={ringkasan().total > 0}>
                    <small class="lencana-kecil">{koma(Math.round((ringkasan().aktif / ringkasan().total) * 1000) / 10)}%</small>
                  </Show>
                </span>
                <span class="petunjuk">
                  {ringkasan().tidakAktif > 0 ? `${ringkasan().tidakAktif} siswa berstatus cuti atau keluar` : "Semua siswa berstatus aktif"}
                </span>
              </div>
              <div class="ubin">
                <span class="label-ubin">Kelompok umur terbanyak</span>
                <span class="angka-ubin">
                  {ringkasan().terbanyak?.[0] ?? "–"}
                  <Show when={ringkasan().terbanyak}>
                    <small class="redup-kecil">{ringkasan().terbanyak![1]} anak</small>
                  </Show>
                </span>
                <span class="petunjuk">Dari {ringkasan().jumlahKu} kelompok umur</span>
              </div>
              <div class="ubin">
                <span class="label-ubin">Kehadiran {sum()?.period?.name ?? "latihan"}</span>
                <span class="angka-ubin">{ringkasan().persenHadir === null ? "–" : `${koma(ringkasan().persenHadir!)}%`}</span>
                <span class="petunjuk">
                  {ringkasan().tercatat ? `${ringkasan().hadir} hadir dari ${ringkasan().tercatat} catatan absensi` : "Belum ada catatan absensi"}
                </span>
              </div>
              <div class="ubin" classList={{ perhatian: ringkasan().tanpaKu > 0 }}>
                <span class="label-ubin">Belum punya KU</span>
                <span class="angka-ubin">{ringkasan().tanpaKu}</span>
                <span class="petunjuk">{ringkasan().tanpaKu > 0 ? "Perlu ditentukan KU-nya" : "Semua pemain sudah punya KU"}</span>
              </div>
            </section>
          </Show>

          <section class="bilah-filter" aria-label="Pencarian dan filter">
            <div class="kolom-cari">
              <Ikon nama="cari" ukuran={18} />
              <input
                id="cari"
                type="search"
                placeholder="Cari nama atau nomor induk"
                aria-label="Cari nama atau nomor induk"
                value={q()}
                onInput={(e) => ubah(setQ)(e.currentTarget.value)}
              />
            </div>
            <select aria-label="Kelompok umur" value={ku()} onChange={(e) => ubah(setKu)(e.currentTarget.value)}>
              <option value="">Semua KU</option>
              <For each={groups()}>{(g) => <option value={g.id}>{g.name}</option>}</For>
            </select>
            <select aria-label="Status" value={status()} onChange={(e) => ubah(setStatus)(e.currentTarget.value)}>
              <option value="">Semua status</option>
              <For each={Object.entries(statusLabel)}>{([v, l]) => <option value={v}>{l}</option>}</For>
            </select>
            <select aria-label="Posisi" value={posisi()} onChange={(e) => ubah(setPosisi)(e.currentTarget.value)}>
              <option value="">Semua posisi</option>
              <For each={Object.entries(posisiLabel)}>{([v, l]) => <option value={v}>{l}</option>}</For>
            </select>
            <button
              class="tombol ikon-saja"
              type="button"
              onClick={reset}
              disabled={!sedangDisaring()}
              aria-label="Atur ulang filter"
              title="Atur ulang filter"
            >
              <Ikon nama="ulang" ukuran={18} />
            </button>
          </section>

          <Show when={players()}>
            <Show when={disaring().length > 0} fallback={<p class="kosong">{kosong()}</p>}>
              <p class="petunjuk" aria-live="polite">
                Menampilkan {disaring().length} pemain
                <Show when={sedangDisaring()}> dari {ringkasan().total}</Show>
              </p>
              <div class="tabel-bungkus">
                <table class="tabel-pemain">
                  <thead>
                    <tr>
                      <th>No. induk</th>
                      <th>Profil siswa</th>
                      <th>KU dan posisi</th>
                      <Show when={adminSsb()}>
                        <th>Kontak wali</th>
                      </Show>
                      <th class="tengah">Presensi sesi</th>
                      <th class="tengah">Rapor terakhir</th>
                      <th class="tengah">Status</th>
                      <th class="kanan">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={tampil()}>
                      {(pl) => (
                        <tr>
                          <td data-label="No. induk">
                            <span class="kode-induk">{pl.memberNo ?? "–"}</span>
                          </td>
                          <td class="sel-profil">
                            <A class="profil-baris" href={`/pemain/${pl.id}`}>
                              <span class="ortu-foto kecil" aria-hidden="true">
                                {inisial(pl.fullName)}
                              </span>
                              <span class="ortu-teks">
                                <strong>{pl.fullName}</strong>
                                <span class="petunjuk">
                                  {usia(pl.birthDate)} th • Lahir {tanggal(pl.birthDate)}
                                </span>
                              </span>
                            </A>
                          </td>
                          <td data-label="KU">
                            <span class="ku-titik">{pl.ageGroup?.name ?? "Tanpa KU"}</span>
                            <span class="petunjuk">{pl.position ? posisiLabel[pl.position] : "Posisi belum ditentukan"}</span>
                          </td>
                          <Show when={adminSsb()}>
                            <td class="sel-kontak" data-label="Wali">
                              <Show when={info(pl.id)?.guardian} fallback={<span class="petunjuk">Belum ada wali</span>}>
                                {(w) => (
                                  <>
                                    <strong class="nama-wali">{w().name}</strong>
                                    <Show when={w().total > 1}>
                                      <span class="petunjuk">+{w().total - 1} wali lain</span>
                                    </Show>
                                    <Show when={linkWa(w().whatsapp)} fallback={<span class="petunjuk">Nomor WhatsApp belum ada</span>}>
                                      {(href) => (
                                        <a class="tautan-wa" href={href()} target="_blank" rel="noopener noreferrer">
                                          {w().whatsapp}
                                        </a>
                                      )}
                                    </Show>
                                  </>
                                )}
                              </Show>
                            </td>
                          </Show>
                          <td class="tengah" data-label="Presensi">
                            <Show when={stat(pl.id)?.percent != null} fallback={<span class="petunjuk">Belum ada catatan</span>}>
                              <span class="persen-lencana">{koma(stat(pl.id)!.percent!)}%</span>
                              <span class="petunjuk">
                                {stat(pl.id)!.hadir} dari {stat(pl.id)!.recorded} sesi
                              </span>
                            </Show>
                          </td>
                          <td class="tengah" data-label="Rapor">
                            <Show when={info(pl.id)?.latestAssessment} fallback={<span class="petunjuk">Belum dinilai</span>}>
                              {(a) => (
                                <>
                                  <span class="nilai-rapor">{a().overall === null ? "–" : koma(a().overall!)}</span>
                                  <span class="petunjuk">
                                    {a().periodName}
                                    <Show when={!a().published}> • belum terbit</Show>
                                  </span>
                                </>
                              )}
                            </Show>
                          </td>
                          <td class="tengah" data-label="Status">
                            <span class="status-lencana" data-status={pl.status}>
                              {statusLabel[pl.status]}
                            </span>
                          </td>
                          <td class="kanan">
                            <div class="aksi-tabel">
                              <A class="ikon-aksi" href={`/pemain/${pl.id}`} aria-label={`Profil ${pl.fullName}`} title="Profil">
                                <Ikon nama="profil" ukuran={18} />
                              </A>
                              <A class="ikon-aksi" href={`/nilai/${pl.id}`} aria-label={`Penilaian ${pl.fullName}`} title="Penilaian">
                                <Ikon nama="buku" ukuran={18} />
                              </A>
                              <A class="ikon-aksi" href={`/kartu/${pl.id}`} aria-label={`Kartu ${pl.fullName}`} title="Kartu pemain">
                                <Ikon nama="kartu" ukuran={18} />
                              </A>
                            </div>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <Show when={jumlahHalaman() > 1}>
                <nav class="paging" aria-label="Halaman">
                  <span class="petunjuk">
                    Menampilkan {(halamanKini() - 1) * PER_HALAMAN + 1} sampai {Math.min(halamanKini() * PER_HALAMAN, disaring().length)} dari{" "}
                    {disaring().length} pemain
                  </span>
                  <div class="paging-tombol">
                    <button type="button" class="tombol" disabled={halamanKini() === 1} onClick={() => setHalaman(halamanKini() - 1)}>
                      Sebelumnya
                    </button>
                    <For each={Array.from({ length: jumlahHalaman() }, (_, i) => i + 1)}>
                      {(n) => (
                        <button type="button" class="tombol nomor" aria-current={n === halamanKini() ? "page" : undefined} onClick={() => setHalaman(n)}>
                          {n}
                        </button>
                      )}
                    </For>
                    <button type="button" class="tombol" disabled={halamanKini() === jumlahHalaman()} onClick={() => setHalaman(halamanKini() + 1)}>
                      Berikutnya
                    </button>
                  </div>
                </nav>
              </Show>
            </Show>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
