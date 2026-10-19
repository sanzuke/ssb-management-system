import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import Ikon from "~/components/Ikon";
import { api, getMe, type Me } from "~/lib/api";
import { inisial } from "~/lib/pemain";
import { hariIni } from "~/lib/waktu";
import type { AgeGroup, AttendanceSummary, AttendanceSummaryRow, Period } from "@ssb/shared";

const PER_HALAMAN = 15;
/** Di bawah ambang ini (dengan cukup catatan) pemain ditandai perlu perhatian; target akademi 80%. */
const AMBANG = 70;
const TARGET = 80;
const MIN_CATATAN = 5;
const koma = (n: number) => String(n).replace(".", ",");
const tingkat = (p: number | null) => (p === null ? "kosong" : p >= TARGET ? "baik" : p >= AMBANG ? "sedang" : "rendah");
type Urutan = "nama" | "rendah" | "tinggi";

export default function Kehadiran() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [periods, setPeriods] = createSignal<Period[]>([]);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [period, setPeriod] = createSignal<string | null>(null); // null = belum siap; "" = semua periode
  const [ku, setKu] = createSignal("");
  const [q, setQ] = createSignal("");
  const [urutan, setUrutan] = createSignal<Urutan>("nama");
  const [perhatian, setPerhatian] = createSignal(false);
  const [halaman, setHalaman] = createSignal(1);

  const parent = () => me()?.active?.role === "orang_tua";

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    if (m.active.role === "orang_tua") return setPeriod(""); // orang tua tidak punya akses data master
    const [p, g] = await Promise.all([api<Period[]>("/periods").catch(() => []), api<AgeGroup[]>("/age-groups").catch(() => [])]);
    setPeriods(p);
    setGroups(g);
    setPeriod(p.find((x) => x.startDate <= hariIni() && hariIni() <= x.endDate)?.id ?? "");
  });

  const [data] = createResource(
    () => (period() === null ? null : `${period()}|${ku()}`),
    () => {
      const s = new URLSearchParams();
      if (period()) s.set("periodId", period()!);
      if (ku()) s.set("ageGroupId", ku());
      return api<AttendanceSummary>(`/attendance/summary${s.size ? `?${s}` : ""}`);
    },
  );

  const semua = () => data()?.players ?? [];
  const butuhPerhatian = (p: AttendanceSummaryRow) => p.recorded >= MIN_CATATAN && p.percent !== null && p.percent < AMBANG;
  const total = createMemo(() => {
    const p = semua();
    const hadir = p.reduce((n, x) => n + x.hadir, 0);
    const tercatat = p.reduce((n, x) => n + x.recorded, 0);
    return {
      hadir,
      tercatat,
      persen: tercatat ? Math.round((hadir / tercatat) * 1000) / 10 : null,
      izinSakit: p.reduce((n, x) => n + x.izin + x.sakit, 0),
      alpa: p.reduce((n, x) => n + x.alpa, 0),
      perhatian: p.filter(butuhPerhatian).length,
    };
  });

  const disaring = createMemo(() => {
    const kata = q().trim().toLowerCase();
    const list = semua().filter(
      (p) => (!kata || p.fullName.toLowerCase().includes(kata) || (p.memberNo ?? "").toLowerCase().includes(kata)) && (!perhatian() || butuhPerhatian(p)),
    );
    const nilai = (p: AttendanceSummaryRow) => p.percent ?? (urutan() === "rendah" ? 101 : -1); // tanpa catatan di ujung
    if (urutan() === "rendah") return [...list].sort((a, b) => nilai(a) - nilai(b));
    if (urutan() === "tinggi") return [...list].sort((a, b) => nilai(b) - nilai(a));
    return list;
  });
  const jumlahHalaman = () => Math.max(1, Math.ceil(disaring().length / PER_HALAMAN));
  const halamanKini = () => Math.min(halaman(), jumlahHalaman());
  const tampil = () => disaring().slice((halamanKini() - 1) * PER_HALAMAN, halamanKini() * PER_HALAMAN);
  const sedangDisaring = () => !!(q().trim() || perhatian() || urutan() !== "nama" || ku());
  const ubah =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setHalaman(1);
    };
  const reset = () => {
    setQ("");
    setKu("");
    setPerhatian(false);
    setUrutan("nama");
    setHalaman(1);
  };

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Kehadiran · SSB App</Title>
      <main class="halaman lebar">
        <header class="kepala-dashboard">
          <div>
            <p class="jejak">
              <span class="ortu-chip">Rekap kehadiran</span>
              <span aria-hidden="true">/</span>
              <span>{me()!.active!.ssbName}</span>
            </p>
            <h1>{parent() ? "Kehadiran anak" : "Kehadiran latihan"}</h1>
            <Show when={data()}>
              {(d) => (
                <p class="petunjuk" role="status">
                  {d().sessionsHeld} sesi latihan tercatat{d().period ? ` pada ${d().period!.name}` : ""}
                  {d().ageGroup ? ` untuk ${d().ageGroup!.name}` : ""}. Persentase = hadir dibagi sesi yang tercatat untuk pemain itu.
                </p>
              )}
            </Show>
          </div>
        </header>

        <Show when={data.error}>
          <div class="peringatan" role="alert">
            Rekap tidak bisa dimuat. Muat ulang halaman.
          </div>
        </Show>

        <Show when={data()}>
          <section class="statistik" aria-label="Ringkasan kehadiran">
            <div class="ubin" classList={{ perhatian: total().persen !== null && total().persen! < TARGET }}>
              <span class="label-ubin">Rata-rata kehadiran</span>
              <span class="angka-ubin">{total().persen === null ? "–" : `${koma(total().persen!)}%`}</span>
              <span class="petunjuk">Target akademi ≥ {TARGET},0%</span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Hadir</span>
              <span class="angka-ubin">{total().hadir}</span>
              <span class="petunjuk">dari {total().tercatat} catatan absensi</span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Izin dan sakit</span>
              <span class="angka-ubin">{total().izinSakit}</span>
              <span class="petunjuk">{total().alpa} alpa tanpa keterangan</span>
            </div>
            <Show when={!parent()}>
              <div class="ubin" classList={{ perhatian: total().perhatian > 0 }}>
                <span class="label-ubin">Perlu perhatian</span>
                <span class="angka-ubin">{total().perhatian}</span>
                <span class="petunjuk">
                  Pemain di bawah {AMBANG}% (min. {MIN_CATATAN} catatan)
                </span>
              </div>
            </Show>
          </section>
        </Show>

        <section class="bilah-filter bilah-hadir" aria-label="Filter">
          <Show when={!parent()}>
            <select aria-label="Periode" value={period() ?? ""} onChange={(e) => ubah<string | null>(setPeriod)(e.currentTarget.value)}>
              <option value="">Semua periode</option>
              <For each={periods()}>
                {(p) => (
                  <option value={p.id} selected={period() === p.id}>
                    {p.name}
                  </option>
                )}
              </For>
            </select>
            <select aria-label="Kelompok umur" value={ku()} onChange={(e) => ubah(setKu)(e.currentTarget.value)}>
              <option value="">Semua KU</option>
              <For each={groups()}>
                {(g) => (
                  <option value={g.id} selected={ku() === g.id}>
                    {g.name}
                  </option>
                )}
              </For>
            </select>
          </Show>
          <div class="kolom-cari">
            <Ikon nama="cari" ukuran={18} />
            <input
              type="search"
              placeholder="Cari nama atau nomor induk"
              aria-label="Cari pemain"
              value={q()}
              onInput={(e) => ubah(setQ)(e.currentTarget.value)}
            />
          </div>
          <select aria-label="Urutkan" value={urutan()} onChange={(e) => ubah(setUrutan)(e.currentTarget.value as Urutan)}>
            <option value="nama">Urut nama</option>
            <option value="rendah">Kehadiran terendah</option>
            <option value="tinggi">Kehadiran tertinggi</option>
          </select>
          <Show when={!parent()}>
            <label class="centang-filter">
              <input type="checkbox" checked={perhatian()} onChange={(e) => ubah(setPerhatian)(e.currentTarget.checked)} />
              Perlu perhatian
            </label>
          </Show>
          <button class="tombol ikon-saja" type="button" onClick={reset} disabled={!sedangDisaring()} aria-label="Atur ulang filter" title="Atur ulang filter">
            <Ikon nama="ulang" ukuran={18} />
          </button>
        </section>

        <Show when={data()}>
          <Show
            when={disaring().length > 0}
            fallback={
              <p class="kosong">
                {semua().length === 0
                  ? parent()
                    ? "Belum ada data kehadiran untuk anak Anda."
                    : "Tidak ada pemain pada pilihan ini."
                  : "Tidak ada pemain yang cocok dengan filter ini."}
              </p>
            }
          >
            <p class="petunjuk" aria-live="polite">
              Menampilkan {disaring().length} pemain
              <Show when={disaring().length !== semua().length}> dari {semua().length}</Show>
            </p>
            <div class="tabel-bungkus">
              <table class="tabel-pemain tabel-hadir">
                <thead>
                  <tr>
                    <th>Pemain</th>
                    <th>Rincian sesi</th>
                    <th class="lebar-batang">Kehadiran</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={tampil()}>
                    {(p) => (
                      <tr>
                        <td class="sel-profil">
                          <A class="profil-baris" href={`/pemain/${p.playerId}`}>
                            <span class="ortu-foto kecil" aria-hidden="true">
                              {inisial(p.fullName)}
                            </span>
                            <span class="ortu-teks">
                              <strong>{p.fullName}</strong>
                              <span class="petunjuk">
                                {p.memberNo ? `${p.memberNo} • ` : ""}
                                {p.ageGroup.name}
                              </span>
                            </span>
                          </A>
                        </td>
                        <td data-label="Rincian">
                          <Show when={p.recorded} fallback={<span class="petunjuk">Belum ada catatan</span>}>
                            <span
                              class="hisa"
                              role="img"
                              aria-label={`${p.hadir} hadir, ${p.izin} izin, ${p.sakit} sakit, ${p.alpa} alpa dari ${p.recorded} sesi`}
                            >
                              <span data-v="hadir" title="Hadir">
                                H {p.hadir}
                              </span>
                              <span data-v="izin" title="Izin">
                                I {p.izin}
                              </span>
                              <span data-v="sakit" title="Sakit">
                                S {p.sakit}
                              </span>
                              <span data-v="alpa" title="Alpa">
                                A {p.alpa}
                              </span>
                              <span class="petunjuk">dari {p.recorded} sesi</span>
                            </span>
                          </Show>
                        </td>
                        <td class="lebar-batang" data-label="Kehadiran">
                          <div class="persen-batang" data-t={tingkat(p.percent)}>
                            <span class="persen-angka" role="img" aria-label={p.percent === null ? "Belum ada catatan" : `${p.percent} persen hadir`}>
                              {p.percent === null ? "–" : `${koma(p.percent)}%`}
                            </span>
                            <Show when={p.percent !== null}>
                              <span class="batang" aria-hidden="true">
                                <span style={{ width: `${p.percent}%` }} />
                              </span>
                            </Show>
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
                  Menampilkan {(halamanKini() - 1) * PER_HALAMAN + 1} sampai {Math.min(halamanKini() * PER_HALAMAN, disaring().length)} dari {disaring().length}{" "}
                  pemain
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
      </main>
    </Show>
  );
}
