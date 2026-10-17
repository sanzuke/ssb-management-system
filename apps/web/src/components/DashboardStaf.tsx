import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { api, roleLabel, type Me } from "~/lib/api";
import { inisial, type PlayerSummary } from "~/lib/pemain";
import { hariIni, tambahHari, tanggalSesi } from "~/lib/waktu";
import type { AttendanceSummary, PlayerOverview, TrainingSession } from "@ssb/shared";
import Ikon from "./Ikon";

const koma = (n: number) => String(n).replace(".", ",");
/** Pemain dengan kehadiran di bawah ambang ini (dan cukup banyak catatan) ditandai perlu perhatian. */
const AMBANG_HADIR = 70;
const MIN_CATATAN = 5;

/** Beranda admin, korlas, dan pelatih: ringkasan, tugas yang menunggu, jadwal, dan pintasan. */
export default function DashboardStaf(props: { me: Me }) {
  const role = () => props.me.active!.role;
  const admin = () => role() === "admin_ssb";
  const bisaTerbit = () => role() === "admin_ssb" || role() === "korlas";
  const awal = tambahHari(hariIni(), -21);
  const akhir = tambahHari(hariIni(), 14);

  const [players] = createResource(() => api<PlayerSummary[]>("/players").catch(() => null));
  const [sum] = createResource(() => api<AttendanceSummary>("/attendance/summary").catch(() => null));
  const [sesi] = createResource(() => api<TrainingSession[]>(`/sessions?from=${awal}&to=${akhir}`).catch(() => null));
  const [ringkas] = createResource(() => api<PlayerOverview[]>("/players-overview").catch(() => null));

  const hari = hariIni();
  const batasPekan = tambahHari(hari, 7);
  const urut = createMemo(() =>
    [...(sesi() ?? [])].sort((a, b) => `${a.sessionDate} ${a.startTime ?? ""}`.localeCompare(`${b.sessionDate} ${b.startTime ?? ""}`)),
  );
  // Sesi hari ini dan yang sudah lewat, tetapi absensinya belum lengkap: paling baru dulu.
  const perluAbsen = createMemo(() =>
    urut()
      .filter((s) => s.sessionDate <= hari && s.attendance.belum > 0)
      .reverse()
      .slice(0, 6),
  );
  const mendatang = createMemo(() => urut().filter((s) => s.sessionDate > hari));
  const pekanIni = () => urut().filter((s) => s.sessionDate >= hari && s.sessionDate <= batasPekan);

  const aktif = () => (players() ?? []).filter((p) => p.status === "aktif").length;
  const hadir = () => (sum()?.players ?? []).reduce((n, p) => n + p.hadir, 0);
  const tercatat = () => (sum()?.players ?? []).reduce((n, p) => n + p.recorded, 0);
  const persen = () => (tercatat() ? Math.round((hadir() / tercatat()) * 1000) / 10 : null);
  const belumTerbit = () => (ringkas() ?? []).filter((r) => r.latestAssessment && !r.latestAssessment.published).length;
  const belumDinilai = () => (ringkas() ?? []).filter((r) => !r.latestAssessment).length;
  const rendah = createMemo(() =>
    (sum()?.players ?? [])
      .filter((p) => p.status === "aktif" && p.recorded >= MIN_CATATAN && p.percent !== null && p.percent < AMBANG_HADIR)
      .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
      .slice(0, 6),
  );
  const gagal = () => players.state === "ready" && players() === null;

  const jam = (s: TrainingSession) => [s.startTime ? `jam ${s.startTime}` : null, s.location?.name].filter(Boolean).join(", ");

  return (
    <>
      <header class="kepala-dashboard">
        <div>
          <p class="jejak">
            <span class="ortu-chip">{props.me.active!.ssbName}</span>
            <span class="ortu-chip kuning">{roleLabel[role()]}</span>
          </p>
          <h1>Halo, {props.me.name}</h1>
          <p class="petunjuk">Ringkasan hari ini: absensi yang perlu diisi, jadwal terdekat, dan pemain yang perlu diperhatikan.</p>
        </div>
        <Show when={admin()}>
          <A class="tombol utama tambah" href="/pemain/baru">
            <Ikon nama="tambah" ukuran={18} />
            Tambah pemain baru
          </A>
        </Show>
      </header>

      <Show when={gagal()}>
        <div class="peringatan" role="alert">
          Sebagian data tidak bisa dimuat. Muat ulang halaman.
        </div>
      </Show>

      <section class="statistik" aria-label="Ringkasan">
        <div class="ubin">
          <span class="label-ubin">Pemain aktif</span>
          <span class="angka-ubin">{players() ? aktif() : "–"}</span>
          <span class="petunjuk">{players() ? `${players()!.length} pemain terdaftar` : "Memuat…"}</span>
        </div>
        <div class="ubin">
          <span class="label-ubin">Sesi 7 hari ke depan</span>
          <span class="angka-ubin">{sesi() ? pekanIni().length : "–"}</span>
          <span class="petunjuk">{pekanIni()[0] ? `Berikutnya ${tanggalSesi(pekanIni()[0]!.sessionDate)}` : "Belum ada jadwal pekan ini"}</span>
        </div>
        <div class="ubin">
          <span class="label-ubin">Kehadiran {sum()?.period?.name ?? "latihan"}</span>
          <span class="angka-ubin">{persen() === null ? "–" : `${koma(persen()!)}%`}</span>
          <span class="petunjuk">{tercatat() ? `${hadir()} hadir dari ${tercatat()} catatan absensi` : "Belum ada catatan absensi"}</span>
        </div>
        <Show
          when={bisaTerbit()}
          fallback={
            <div class="ubin" classList={{ perhatian: belumDinilai() > 0 }}>
              <span class="label-ubin">Belum dinilai</span>
              <span class="angka-ubin">{ringkas() ? belumDinilai() : "–"}</span>
              <span class="petunjuk">Pemain yang belum punya penilaian</span>
            </div>
          }
        >
          <div class="ubin" classList={{ perhatian: belumTerbit() > 0 }}>
            <span class="label-ubin">Rapor belum terbit</span>
            <span class="angka-ubin">{ringkas() ? belumTerbit() : "–"}</span>
            <span class="petunjuk">Penilaian menunggu diterbitkan ke orang tua</span>
          </div>
        </Show>
      </section>

      <div class="kolom-dashboard">
        <div class="kolom-isi">
          <section class="panel" aria-label="Absensi yang perlu diisi">
            <header class="panel-kepala">
              <h2>Absensi perlu diisi</h2>
              <A class="tautan-kecil" href="/kehadiran">
                Rekap kehadiran
              </A>
            </header>
            <Show when={sesi()} fallback={<p class="petunjuk panel-isi">Memuat…</p>}>
              <Show when={perluAbsen().length > 0} fallback={<p class="kosong panel-isi">Semua sesi sampai hari ini sudah terisi absensinya.</p>}>
                <ul class="daftar-tugas">
                  <For each={perluAbsen()}>
                    {(s) => (
                      <li>
                        <div class="tugas-teks">
                          <strong>
                            {tanggalSesi(s.sessionDate)} • {s.ageGroup.name}
                          </strong>
                          <span class="petunjuk">{jam(s) || "Waktu dan lokasi belum diisi"}</span>
                        </div>
                        <span class="lencana-peringatan">{s.attendance.belum} belum</span>
                        <A class="tombol tombol-kecil" href={`/absensi/${s.id}`}>
                          Isi absensi
                        </A>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>

          <section class="panel" aria-label="Pemain yang perlu diperhatikan">
            <header class="panel-kepala">
              <h2>Kehadiran rendah</h2>
              <span class="petunjuk">di bawah {AMBANG_HADIR}%</span>
            </header>
            <Show when={sum()} fallback={<p class="petunjuk panel-isi">Memuat…</p>}>
              <Show when={rendah().length > 0} fallback={<p class="kosong panel-isi">Tidak ada pemain dengan kehadiran rendah. Bagus!</p>}>
                <ul class="daftar-tugas">
                  <For each={rendah()}>
                    {(p) => (
                      <li>
                        <span class="ortu-foto kecil" aria-hidden="true">
                          {inisial(p.fullName)}
                        </span>
                        <div class="tugas-teks">
                          <A class="profil-baris" href={`/pemain/${p.playerId}`}>
                            <strong>{p.fullName}</strong>
                          </A>
                          <span class="petunjuk">
                            {p.ageGroup.name} • {p.hadir} dari {p.recorded} sesi
                          </span>
                        </div>
                        <span class="persen-lencana rendah">{koma(p.percent!)}%</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>
        </div>
        <div class="kolom-isi">
          <section class="panel" aria-label="Latihan mendatang">
            <header class="panel-kepala">
              <h2>Latihan mendatang</h2>
              <A class="tautan-kecil" href="/jadwal">
                Semua jadwal
              </A>
            </header>
            <Show when={sesi()} fallback={<p class="petunjuk panel-isi">Memuat…</p>}>
              <Show
                when={mendatang().length > 0}
                fallback={<p class="kosong panel-isi">Belum ada jadwal latihan ke depan.{admin() ? " Tambahkan di menu Jadwal." : ""}</p>}
              >
                <ul class="daftar-tugas">
                  <For each={mendatang().slice(0, 6)}>
                    {(s) => (
                      <li>
                        <div class="tugas-teks">
                          <strong>
                            {tanggalSesi(s.sessionDate)} • {s.ageGroup.name}
                          </strong>
                          <span class="petunjuk">{jam(s) || "Waktu dan lokasi belum diisi"}</span>
                        </div>
                        <Ikon nama="kalender" />
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>

          <section class="panel" aria-label="Pintasan">
            <header class="panel-kepala">
              <h2>Pintasan</h2>
            </header>
            <div class="pintasan">
              <A class="pintasan-item" href="/pemain">
                <Ikon nama="pemain" />
                <span>Data pemain</span>
              </A>
              <A class="pintasan-item" href="/jadwal">
                <Ikon nama="kalender" />
                <span>Jadwal latihan</span>
              </A>
              <A class="pintasan-item" href="/kehadiran">
                <Ikon nama="absen" />
                <span>Rekap kehadiran</span>
              </A>
              <Show when={admin()}>
                <A class="pintasan-item" href="/master">
                  <Ikon nama="master" />
                  <span>Data master</span>
                </A>
                <A class="pintasan-item" href="/pemain/baru">
                  <Ikon nama="tambah" />
                  <span>Tambah pemain</span>
                </A>
              </Show>
              <Show when={!admin()}>
                <A class="pintasan-item" href="/pemain">
                  <Ikon nama="buku" />
                  <span>Isi penilaian</span>
                </A>
              </Show>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
