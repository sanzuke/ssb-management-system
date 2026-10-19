import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { api, roleLabel, type Me } from "~/lib/api";
import { inisial, type AgeGroup, type PlayerSummary } from "~/lib/pemain";
import { bulanIni, hariIni, namaBulan, rupiah, tambahHari, tanggalSesi } from "~/lib/waktu";
import type { Assignment, AspectSummary, AttendanceSummary, FeeSummary, Period, PlayerOverview, ReminderRow, TrainingSession } from "@ssb/shared";
import Ikon from "./Ikon";
import RadarAspek from "./RadarAspek";

const koma = (n: number) => String(n).replace(".", ",");
const persen = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
/** Target kehadiran akademi, seperti di desain Stitch. */
const TARGET_HADIR = 80;

type Tindakan = { judul: string; badge: string; isi: string; tombol: string; href: string };

/** Dasbor Admin SSB (desain Stitch "Dasbor Admin SSB - Garuda Muda"), dari data yang sudah ada di API. */
export default function DashboardAdmin(props: { me: Me }) {
  const hari = hariIni();
  const [players] = createResource(() => api<PlayerSummary[]>("/players").catch(() => null));
  const [ringkas] = createResource(() => api<PlayerOverview[]>("/players-overview").catch(() => null));
  const [sum] = createResource(() => api<AttendanceSummary>("/attendance/summary").catch(() => null));
  const [sesi] = createResource(() => api<TrainingSession[]>(`/sessions?from=${tambahHari(hari, -21)}&to=${tambahHari(hari, 7)}`).catch(() => null));
  const [groups] = createResource(() => api<AgeGroup[]>("/age-groups").catch(() => null));
  const [tugas] = createResource(() => api<Assignment[]>("/assignments").catch(() => null));
  const [periode] = createResource(() => api<Period[]>("/periods").catch(() => null));
  const [aspek] = createResource(() => api<AspectSummary[]>("/assessment-aspects").catch(() => null));
  // SPP bulan berjalan dan tagihan yang perlu diingatkan (menunggak atau jatuh tempo 3 hari lagi).
  const bulan = bulanIni();
  const [spp] = createResource(() => api<FeeSummary>(`/fees/summary?month=${bulan}`).catch(() => null));
  const [ingat] = createResource(() => api<ReminderRow[]>("/fees/reminders?days=3").catch(() => null));
  const menunggak = () => (ingat() ?? []).filter((r) => r.daysToDue < 0);
  const segera = () => (ingat() ?? []).filter((r) => r.daysToDue >= 0);
  const persenBayar = () => (spp() && spp()!.billed > 0 ? Math.round((spp()!.paid / spp()!.billed) * 100) : null);

  const kini = createMemo(() => periode()?.find((p) => p.startDate <= hari && hari <= p.endDate) ?? null);
  const mingguKe = () => {
    const p = kini();
    return p ? Math.floor((new Date(`${hari}T00:00:00`).getTime() - new Date(`${p.startDate}T00:00:00`).getTime()) / 604_800_000) + 1 : null;
  };

  const semua = () => players() ?? [];
  const aktif = () => semua().filter((p) => p.status === "aktif");
  const info = (id: string) => ringkas()?.find((r) => r.playerId === id);
  /** Penilaian pemain pada periode berjalan (bukan periode lama). */
  const nilaiKini = (id: string) => {
    const a = info(id)?.latestAssessment;
    return a && a.periodName === kini()?.name ? a : null;
  };
  const terisi = () => aktif().filter((p) => nilaiKini(p.id)).length;
  const terbit = () => aktif().filter((p) => nilaiKini(p.id)?.published).length;
  const hadir = () => (sum()?.players ?? []).reduce((n, p) => n + p.hadir, 0);
  const tercatat = () => (sum()?.players ?? []).reduce((n, p) => n + p.recorded, 0);
  const persenHadir = () => persen(hadir(), tercatat());

  const urut = createMemo(() =>
    [...(sesi() ?? [])].sort((a, b) => `${a.sessionDate} ${a.startTime ?? ""}`.localeCompare(`${b.sessionDate} ${b.startTime ?? ""}`)),
  );
  const hariIniSesi = () => urut().filter((s) => s.sessionDate === hari);
  const mendatang = () => urut().filter((s) => s.sessionDate > hari && s.sessionDate <= tambahHari(hari, 7));
  const perluAbsen = () => urut().filter((s) => s.sessionDate <= hari && s.attendance.belum > 0);

  const pelatihKu = (kuId: string) => {
    const daftar = (tugas() ?? []).filter((t) => t.ageGroupId === kuId && (!kini() || t.periodId === kini()!.id));
    return daftar.find((t) => t.role === "pelatih") ?? daftar[0] ?? null;
  };
  const urutKu = createMemo(() => [...(groups() ?? [])].sort((a, b) => a.minAge - b.minAge || a.name.localeCompare(b.name)));

  const barisKu = createMemo(() =>
    urutKu().map((g) => {
      const isi = aktif().filter((p) => p.ageGroup?.id === g.id);
      const dinilai = isi.filter((p) => nilaiKini(p.id));
      const terbitKu = dinilai.filter((p) => nilaiKini(p.id)?.published).length;
      const h = (sum()?.players ?? []).filter((p) => p.ageGroup.id === g.id);
      return {
        g,
        pemain: isi.length,
        pelatih: pelatihKu(g.id),
        hadir: persen(
          h.reduce((n, p) => n + p.hadir, 0),
          h.reduce((n, p) => n + p.recorded, 0),
        ),
        nilai: persen(dinilai.length, isi.length),
        dinilai: dinilai.length,
        terbitKu,
      };
    }),
  );

  // "Perlu tindakan": hanya yang benar-benar ada.
  const tindakan = createMemo<Tindakan[]>(() => {
    const out: Tindakan[] = [];
    const belumTerbit = barisKu()
      .map((b) => ({ b, n: b.dinilai - b.terbitKu }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    const totalBelum = belumTerbit.reduce((t, x) => t + x.n, 0);
    if (totalBelum > 0) {
      const t = belumTerbit[0]!;
      out.push({
        judul: "Rapor siap diterbitkan",
        badge: `${totalBelum} rapor`,
        isi: `${totalBelum} penilaian menunggu diterbitkan ke orang tua. Terbanyak di ${t.b.g.name} (${t.n} dari ${t.b.dinilai} yang dinilai).`,
        tombol: `Tinjau ${t.b.g.name}`,
        href: `/pemain?ku=${t.b.g.id}`,
      });
    }
    const tanpaKu = semua().filter((p) => !p.ageGroup);
    if (tanpaKu.length > 0) {
      out.push({
        judul: "Pemain belum masuk KU",
        badge: `${tanpaKu.length} siswa`,
        isi: `${tanpaKu
          .slice(0, 2)
          .map((p) => p.fullName)
          .join(" dan ")}${tanpaKu.length > 2 ? ` dan ${tanpaKu.length - 2} lainnya` : ""} perlu ditetapkan KU-nya sebelum sesi berikutnya.`,
        tombol: "Atur KU",
        href: "/pemain?ku=none",
      });
    }
    if (perluAbsen().length > 0) {
      const s = perluAbsen()[perluAbsen().length - 1]!;
      out.push({
        judul: "Absensi belum lengkap",
        badge: `${perluAbsen().length} sesi`,
        isi: `Sesi ${s.ageGroup.name} ${tanggalSesi(s.sessionDate).toLowerCase()} masih ${s.attendance.belum} pemain belum diabsen.`,
        tombol: "Isi absensi",
        href: `/absensi/${s.id}`,
      });
    }
    if (spp() && spp()!.invoices === 0) {
      out.push({
        judul: "Tagihan SPP bulan ini belum dibuat",
        badge: namaBulan(bulan),
        isi: "Belum ada tagihan SPP untuk bulan berjalan. Atur tarif tiap KU, lalu buat tagihannya.",
        tombol: "Buat tagihan",
        href: "/spp",
      });
    }
    if (menunggak().length > 0) {
      const total = menunggak().reduce((t, r) => t + r.remaining, 0);
      out.push({
        judul: "SPP menunggak",
        badge: `${menunggak().length} tagihan`,
        isi: `Sisa ${rupiah(total)} sudah lewat jatuh tempo${segera().length > 0 ? `, ditambah ${segera().length} tagihan yang jatuh tempo dalam 3 hari` : ""}. Kirim pengingat ke orang tua lewat WhatsApp.`,
        tombol: "Kirim pengingat",
        href: "/spp?tab=pengingat",
      });
    }
    const tanpaPelatih = barisKu().filter((b) => b.pelatih === null);
    if (kini() && groups() && tugas() && tanpaPelatih.length > 0) {
      out.push({
        judul: "KU belum punya pelatih",
        badge: `${tanpaPelatih.length} KU`,
        isi: `${tanpaPelatih.map((b) => b.g.name).join(", ")} belum ditugaskan pelatih pada ${kini()!.name}.`,
        tombol: "Atur penugasan",
        href: "/penugasan",
      });
    }
    return out;
  });

  const statusSesi = (s: TrainingSession) => {
    if (!s.startTime) return "Hari ini";
    const [h, m] = s.startTime.split(":").map(Number);
    const sekarang = new Date();
    const menit = sekarang.getHours() * 60 + sekarang.getMinutes();
    const mulai = (h ?? 0) * 60 + (m ?? 0);
    return menit < mulai ? "Menunggu" : menit < mulai + 120 ? "Berjalan" : "Selesai";
  };
  const diabsen = (s: TrainingSession) => s.attendance.hadir + s.attendance.izin + s.attendance.sakit + s.attendance.alpa;
  const jam = (s: TrainingSession) => s.startTime ?? "";
  const tglBlok = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return {
      hari: d.toLocaleDateString("id-ID", { weekday: "short" }),
      tgl: d.getDate(),
      bulan: d.toLocaleDateString("id-ID", { month: "short" }),
    };
  };
  const dispensasi = () => hariIniSesi().reduce((n, s) => n + s.attendance.izin + s.attendance.sakit, 0);
  const memuat = () => players.loading || sesi.loading;

  return (
    <>
      <header class="kepala-dashboard">
        <div>
          <p class="jejak">
            <span class="ortu-chip">Buku induk operasional dan rapor siswa</span>
            <span>/</span>
            <span>{props.me.active!.ssbName}</span>
          </p>
          <h1>Dasbor administrasi SSB</h1>
          <p class="petunjuk">Ringkasan berkas evaluasi teknis, kehadiran lapangan, dan kesiapan rapor berkala.</p>
        </div>
        <div class="chip-baris">
          <Show when={kini()}>
            <span class="ortu-chip">{kini()!.name}</span>
            <span class="ortu-chip kuning">Minggu ke-{mingguKe()}</span>
          </Show>
        </div>
      </header>

      <div class="dasbor">
        <div class="dasbor-utama">
          {/* Perlu tindakan */}
          <section class="tindakan" aria-label="Perlu tindakan hari ini">
            <header class="tindakan-kepala">
              <h2>
                <Ikon nama="absen" ukuran={20} /> Perlu tindakan hari ini
              </h2>
              <span class="lencana-peringatan">{tindakan().length} tugas tertunda</span>
            </header>
            <Show when={!memuat()} fallback={<p class="panel-isi">Memuat…</p>}>
              <Show when={tindakan().length > 0} fallback={<p class="tindakan-kosong">Semua beres: tidak ada tugas administrasi yang tertunda.</p>}>
                <ul class="kartu-tindakan">
                  <For each={tindakan()}>
                    {(t) => (
                      <li>
                        <div class="tindakan-teks">
                          <div class="tindakan-judul">
                            <strong>{t.judul}</strong>
                            <span class="lencana-kecil-netral">{t.badge}</span>
                          </div>
                          <p>{t.isi}</p>
                        </div>
                        <A class="tombol tombol-kecil" href={t.href}>
                          {t.tombol}
                        </A>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>

          {/* Ubin ringkasan */}
          <section class="statistik" aria-label="Ringkasan">
            <div class="ubin">
              <span class="label-ubin">Pemain aktif</span>
              <span class="angka-ubin">{players() ? aktif().length : "–"}</span>
              <span class="petunjuk">{players() ? `${semua().length} terdaftar, ${semua().length - aktif().length} cuti atau keluar` : "Memuat…"}</span>
            </div>
            <div class="ubin" classList={{ perhatian: persenHadir() !== null && persenHadir()! < TARGET_HADIR }}>
              <span class="label-ubin">Kehadiran {kini()?.name ?? "latihan"}</span>
              <span class="angka-ubin">{persenHadir() === null ? "–" : `${koma(persenHadir()!)}%`}</span>
              <span class="petunjuk">Target akademi ≥ {TARGET_HADIR},0%</span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Penilaian terisi</span>
              <span class="angka-ubin">{ringkas() ? `${koma(persen(terisi(), aktif().length) ?? 0)}%` : "–"}</span>
              <span class="petunjuk">
                {terisi()} dari {aktif().length} siswa
              </span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Rapor terbit</span>
              <span class="angka-ubin">
                {ringkas() ? terbit() : "–"}
                <small class="redup-kecil">/ {aktif().length}</small>
              </span>
              <span class="petunjuk">Sudah bisa dibaca orang tua</span>
            </div>
          </section>

          {/* SPP bulan ini */}
          <section class="panel" aria-label="SPP bulan ini">
            <header class="panel-kepala">
              <div>
                <h2>SPP {namaBulan(bulan)}</h2>
                <p class="petunjuk panel-sub">Tagihan, pembayaran, dan yang perlu diingatkan bulan ini.</p>
              </div>
              <A class="tombol tombol-kecil" href="/spp">
                Kelola SPP
              </A>
            </header>
            <Show when={spp()} fallback={<p class="panel-isi petunjuk">Memuat…</p>}>
              {(d) => (
                <div class="panel-isi">
                  <Show when={d().invoices > 0} fallback={<p class="kosong">Belum ada tagihan bulan ini.</p>}>
                    <section class="statistik uang" aria-label="Ringkasan SPP">
                      <div class="ubin">
                        <span class="label-ubin">Ditagih</span>
                        <span class="angka-ubin">{rupiah(d().billed)}</span>
                        <span class="petunjuk">{d().invoices} tagihan</span>
                      </div>
                      <div class="ubin">
                        <span class="label-ubin">Sudah dibayar</span>
                        <span class="angka-ubin">{rupiah(d().paid)}</span>
                        <span class="petunjuk">{d().settledInvoices} lunas</span>
                      </div>
                      <div class="ubin" classList={{ perhatian: d().overdueInvoices > 0 }}>
                        <span class="label-ubin">Belum dibayar</span>
                        <span class="angka-ubin">{rupiah(d().outstanding)}</span>
                        <span class="petunjuk">{d().overdueInvoices > 0 ? `${d().overdueInvoices} lewat jatuh tempo` : "Belum ada yang menunggak"}</span>
                      </div>
                    </section>
                    <div class="spp-progres" role="img" aria-label={`${persenBayar()} persen sudah dibayar`}>
                      <span class="batang">
                        <span style={{ width: `${persenBayar() ?? 0}%` }} />
                      </span>
                      <span class="petunjuk">{persenBayar()}% dari tagihan bulan ini sudah dibayar</span>
                    </div>
                  </Show>
                  <Show when={(ingat() ?? []).length > 0}>
                    <p class="spp-ingat">
                      <strong>{(ingat() ?? []).length} tagihan perlu diingatkan</strong> ({menunggak().length} menunggak, {segera().length} segera jatuh tempo).{" "}
                      <A href="/spp?tab=pengingat">Buka pengingat</A>
                    </p>
                  </Show>
                </div>
              )}
            </Show>
          </section>

          {/* Status per KU */}
          <section class="panel" aria-label="Status berkas per kelompok umur">
            <header class="panel-kepala">
              <div>
                <h2>Status berkas per kelompok umur</h2>
                <p class="petunjuk panel-sub">Pelatih, kepatuhan absensi, dan progres rapor per jenjang pembinaan.</p>
              </div>
              <span class="petunjuk">{urutKu().length} kelompok umur</span>
            </header>
            <Show when={groups()} fallback={<p class="panel-isi petunjuk">Memuat…</p>}>
              <Show when={urutKu().length > 0} fallback={<p class="kosong panel-isi">Belum ada KU. Tambahkan di Data master.</p>}>
                <div class="tabel-bungkus tanpa-garis">
                  <table class="tabel-pemain tabel-ku">
                    <thead>
                      <tr>
                        <th>Kelompok umur</th>
                        <th class="tengah">Pemain</th>
                        <th>Pelatih</th>
                        <th class="tengah">Kehadiran</th>
                        <th class="tengah">Penilaian</th>
                        <th>Status rapor</th>
                        <th class="kanan">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={barisKu()}>
                        {(b) => (
                          <tr>
                            <td class="sel-profil">
                              <span class="ku-nama">{b.g.name}</span>
                              <span class="petunjuk">
                                Usia {b.g.minAge} sampai {b.g.maxAge} tahun
                              </span>
                            </td>
                            <td class="tengah" data-label="Pemain">
                              {b.pemain}
                            </td>
                            <td data-label="Pelatih">
                              <Show when={b.pelatih} fallback={<span class="petunjuk">Belum ditugaskan</span>}>
                                {(p) => (
                                  <span class="pelatih-sel">
                                    <span class="ortu-foto kecil" aria-hidden="true">
                                      {inisial(p().userName)}
                                    </span>
                                    {p().userName}
                                  </span>
                                )}
                              </Show>
                            </td>
                            <td class="tengah" data-label="Kehadiran">
                              {b.hadir === null ? "–" : `${koma(b.hadir)}%`}
                            </td>
                            <td class="tengah" data-label="Penilaian">
                              {b.nilai === null ? "–" : `${koma(b.nilai)}%`}
                            </td>
                            <td data-label="Rapor">
                              <span class="status-rapor" data-s={b.dinilai === 0 ? "belum" : b.terbitKu === b.dinilai ? "terbit" : "draf"}>
                                {b.dinilai === 0
                                  ? "Belum dinilai"
                                  : b.terbitKu === b.dinilai
                                    ? `Terbit (${b.terbitKu}/${b.dinilai})`
                                    : `Draf (${b.dinilai - b.terbitKu} belum terbit)`}
                              </span>
                            </td>
                            <td class="kanan">
                              <A class="tombol tombol-kecil" href={`/pemain?ku=${b.g.id}`}>
                                Buka KU
                              </A>
                            </td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </div>
              </Show>
            </Show>
          </section>

          {/* Pintasan */}
          <section class="panel" aria-label="Jalan pintas administrasi">
            <header class="panel-kepala">
              <div>
                <h2>Jalan pintas administrasi</h2>
                <p class="petunjuk panel-sub">Tindakan cepat untuk admin.</p>
              </div>
            </header>
            <div class="pintasan pintasan-besar">
              <A class="pintasan-item" href="/pemain/baru">
                <Ikon nama="tambah" />
                <span>
                  <strong>Tambah pemain</strong>
                  <small>Isi biodata, KU, dan posisi</small>
                </span>
              </A>
              <A class="pintasan-item" href="/jadwal">
                <Ikon nama="kalender" />
                <span>
                  <strong>Jadwalkan sesi</strong>
                  <small>Sesi latihan per KU, bisa berulang</small>
                </span>
              </A>
              <A class="pintasan-item" href="/penugasan">
                <Ikon nama="pemain" />
                <span>
                  <strong>Atur penugasan pelatih</strong>
                  <small>Pelatih dan korlas per KU dan periode</small>
                </span>
              </A>
              <A class="pintasan-item" href="/master">
                <Ikon nama="master" />
                <span>
                  <strong>Kelola KU, periode, lokasi</strong>
                  <small>Struktur semester dan lapangan</small>
                </span>
              </A>
              <A class="pintasan-item" href="/indikator">
                <Ikon nama="indikator" />
                <span>
                  <strong>Indikator penilaian</strong>
                  <small>Aspek dan indikator per KU</small>
                </span>
              </A>
              <A class="pintasan-item" href="/spp">
                <Ikon nama="kartu" />
                <span>
                  <strong>Tagihan SPP</strong>
                  <small>Tarif, tagihan, pembayaran, dan pengingat</small>
                </span>
              </A>
              <A class="pintasan-item" href="/kehadiran">
                <Ikon nama="absen" />
                <span>
                  <strong>Rekap kehadiran</strong>
                  <small>Persentase hadir per pemain</small>
                </span>
              </A>
            </div>
          </section>

          {/* Radar kurikulum */}
          <section class="panel" aria-label="Indeks kurikulum teknikal">
            <header class="panel-kepala">
              <div>
                <h2>Indeks kurikulum teknikal</h2>
                <p class="petunjuk panel-sub">Rata-rata skor enam aspek dari seluruh penilaian, dibanding periode sebelumnya.</p>
              </div>
            </header>
            <Show when={aspek()} fallback={<p class="panel-isi petunjuk">Memuat…</p>}>
              <Show when={aspek()!.length > 0} fallback={<p class="kosong panel-isi">Belum ada penilaian untuk ditampilkan.</p>}>
                <div class="panel-isi radar-samping">
                  <RadarAspek sekarang={aspek()![0]!} sebelumnya={aspek()![1]} />
                </div>
              </Show>
            </Show>
          </section>
        </div>

        <aside class="dasbor-sisi">
          <section class="panel" aria-label="Sesi lapangan hari ini">
            <header class="panel-kepala sesi-kepala">
              <div>
                <h2>Sesi lapangan hari ini</h2>
                <p class="petunjuk panel-sub">
                  {new Date(`${hari}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
              <span class="lencana-kecil-netral">{hariIniSesi().length} sesi</span>
            </header>
            <Show when={sesi()} fallback={<p class="panel-isi petunjuk">Memuat…</p>}>
              <Show when={hariIniSesi().length > 0} fallback={<p class="kosong panel-isi">Tidak ada sesi latihan hari ini.</p>}>
                <ul class="daftar-tugas">
                  <For each={hariIniSesi()}>
                    {(s) => (
                      <li class="sesi-hari">
                        <div class="tugas-teks">
                          <strong>
                            {s.ageGroup.name} {jam(s) && `• ${jam(s)}`}
                          </strong>
                          <span class="petunjuk">{s.location?.name ?? "Lokasi belum diisi"}</span>
                          <span class="petunjuk">Pelatih: {pelatihKu(s.ageGroup.id)?.userName ?? "belum ditugaskan"}</span>
                        </div>
                        <div class="sesi-kanan">
                          <span class="lencana-status" data-s={statusSesi(s)}>
                            {statusSesi(s)}
                          </span>
                          <A class="tautan-kecil" href={`/absensi/${s.id}`}>
                            {diabsen(s) > 0 ? `${s.attendance.hadir} hadir` : "Isi absensi"}
                          </A>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>

          <section class="panel" aria-label="Jadwal 7 hari ke depan">
            <header class="panel-kepala">
              <h2>Jadwal 7 hari ke depan</h2>
              <A class="tautan-kecil" href="/jadwal">
                Kalender
              </A>
            </header>
            <Show when={sesi()} fallback={<p class="panel-isi petunjuk">Memuat…</p>}>
              <Show when={mendatang().length > 0} fallback={<p class="kosong panel-isi">Belum ada jadwal pekan ini.</p>}>
                <ul class="daftar-tugas">
                  <For each={mendatang().slice(0, 8)}>
                    {(s) => {
                      const t = tglBlok(s.sessionDate);
                      return (
                        <li>
                          <span class="blok-tanggal" aria-hidden="true">
                            <small>{t.hari}</small>
                            <strong>{t.tgl}</strong>
                            <small>{t.bulan}</small>
                          </span>
                          <div class="tugas-teks">
                            <strong>
                              {s.ageGroup.name} {jam(s) && `• ${jam(s)}`}
                            </strong>
                            <span class="petunjuk">{s.location?.name ?? "Lokasi belum diisi"}</span>
                          </div>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>

          <section class="panel" aria-label="Izin dan sakit hari ini">
            <header class="panel-kepala">
              <h2>Izin dan sakit hari ini</h2>
            </header>
            <Show when={sesi()} fallback={<p class="panel-isi petunjuk">Memuat…</p>}>
              <p class="panel-isi">
                <Show when={dispensasi() > 0} fallback={<span class="kosong">Belum ada izin atau sakit tercatat untuk sesi hari ini.</span>}>
                  <strong>{dispensasi()} pemain</strong> tercatat izin atau sakit pada sesi hari ini.
                  <A class="tautan-kecil blok" href="/kehadiran">
                    Lihat rekap kehadiran
                  </A>
                </Show>
              </p>
            </Show>
          </section>
          <p class="petunjuk catatan-peran">Masuk sebagai {roleLabel[props.me.active!.role]}.</p>
        </aside>
      </div>
    </>
  );
}
