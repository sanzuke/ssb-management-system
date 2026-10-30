import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Ikon from "~/components/Ikon";
import SessionForm from "~/components/SessionForm";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { hariIni, tambahHari, tanggalSesi } from "~/lib/waktu";
import type { AgeGroup, Location, TrainingSession } from "@ssb/shared";

const hari = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const blok = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return { hari: d.toLocaleDateString("id-ID", { weekday: "short" }), tgl: d.getDate(), bulan: d.toLocaleDateString("id-ID", { month: "short" }) };
};

export default function Jadwal() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [items, setItems] = createSignal<TrainingSession[]>([]);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [locs, setLocs] = createSignal<Location[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [editing, setEditing] = createSignal<string | null>(null); // "baru" atau id
  const [confirmId, setConfirmId] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal("");
  const [past, setPast] = createSignal(false);
  const [ku, setKu] = createSignal("");
  const [lokasi, setLokasi] = createSignal("");

  const admin = () => me()?.active?.role === "admin_ssb";
  const today = hariIni();

  const load = async () => {
    try {
      setItems(await api<TrainingSession[]>(`/sessions?from=${past() ? tambahHari(today, -60) : today}&to=${tambahHari(today, 120)}`));
      setError("");
    } catch {
      setError("Jadwal tidak bisa dimuat. Muat ulang halaman.");
    } finally {
      setLoaded(true);
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    if (m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    const [g, l] = await Promise.all([api<AgeGroup[]>("/age-groups").catch(() => []), api<Location[]>("/locations").catch(() => [])]);
    setGroups(g);
    setLocs(l);
    await load();
  });

  const tersaring = createMemo(() =>
    items().filter((s) => (!ku() || s.ageGroup.id === ku()) && (!lokasi() || (lokasi() === "none" ? !s.location : s.location?.id === lokasi()))),
  );
  const byDate = createMemo(() => {
    const out: { date: string; list: TrainingSession[] }[] = [];
    for (const s of tersaring()) {
      const last = out[out.length - 1];
      if (last && last.date === s.sessionDate) last.list.push(s);
      else out.push({ date: s.sessionDate, list: [s] });
    }
    return out;
  });

  const hariIniJumlah = () => items().filter((s) => s.sessionDate === today).length;
  const pekanJumlah = () => items().filter((s) => s.sessionDate >= today && s.sessionDate <= tambahHari(today, 7)).length;
  const belumLengkap = () => items().filter((s) => s.sessionDate <= today && s.attendance.belum > 0).length;
  const sedangDisaring = () => !!(ku() || lokasi());

  const remove = async (id: string) => {
    setNotice("");
    try {
      await api(`/sessions/${id}`, { method: "DELETE" });
      setConfirmId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
      setConfirmId(null);
    }
  };
  const diabsen = (a: TrainingSession["attendance"]) => a.hadir + a.izin + a.sakit + a.alpa;

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Jadwal latihan · SSB App</Title>
      <main class="halaman lebar">
        <header class="kepala-dashboard">
          <div>
            <p class="jejak">
              <span class="ortu-chip">Jadwal latihan</span>
              <span aria-hidden="true">/</span>
              <span>{me()!.active!.ssbName}</span>
            </p>
            <h1>Jadwal latihan</h1>
            <p class="petunjuk">Sesi latihan per KU. Pilih sesi untuk mengisi absensinya.</p>
          </div>
          <Show when={admin() && editing() !== "baru"}>
            <button
              class="tombol utama tambah"
              type="button"
              onClick={() => {
                setNotice("");
                setEditing("baru");
              }}
            >
              <Ikon nama="tambah" ukuran={18} />
              Tambah sesi
            </button>
          </Show>
        </header>

        <Show when={error()}>
          <div class="peringatan" role="alert">
            {error()}
          </div>
        </Show>
        <Show when={notice()}>
          <div class="info" role="status">
            {notice()}
          </div>
        </Show>

        <Show when={admin() && editing() === "baru"}>
          <section class="panel form-sesi" aria-label="Sesi baru">
            <header class="panel-kepala">
              <h2>Sesi baru</h2>
            </header>
            <div class="panel-isi">
              <Show when={groups().length === 0}>
                <p class="info">
                  Belum ada KU. Buat KU di <A href="/master">Data master</A> dulu.
                </p>
              </Show>
              <SessionForm
                ageGroups={groups()}
                locations={locs()}
                onCancel={() => setEditing(null)}
                onSaved={async (n) => {
                  setEditing(null);
                  setNotice(n > 1 ? `${n} sesi dijadwalkan.` : "Sesi dijadwalkan.");
                  await load();
                }}
              />
            </div>
          </section>
        </Show>

        <Show when={loaded()}>
          <section class="statistik" aria-label="Ringkasan jadwal">
            <div class="ubin">
              <span class="label-ubin">Sesi hari ini</span>
              <span class="angka-ubin">{hariIniJumlah()}</span>
              <span class="petunjuk">{hari(today)}</span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Sesi 7 hari ke depan</span>
              <span class="angka-ubin">{pekanJumlah()}</span>
              <span class="petunjuk">Termasuk hari ini</span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Sesi dalam daftar</span>
              <span class="angka-ubin">{items().length}</span>
              <span class="petunjuk">{past() ? "60 hari terakhir sampai 120 hari ke depan" : "Mulai hari ini sampai 120 hari ke depan"}</span>
            </div>
            <div class="ubin" classList={{ perhatian: belumLengkap() > 0 }}>
              <span class="label-ubin">Absensi belum lengkap</span>
              <span class="angka-ubin">{belumLengkap()}</span>
              <span class="petunjuk">
                {past() ? "Sesi sampai hari ini yang masih punya siswa belum diabsen" : "Tampilkan sesi lalu untuk melihat yang tertinggal"}
              </span>
            </div>
          </section>
        </Show>

        <section class="bilah-filter bilah-jadwal" aria-label="Filter jadwal">
          <select aria-label="Kelompok umur" value={ku()} onChange={(e) => setKu(e.currentTarget.value)}>
            <option value="">Semua KU</option>
            <For each={groups()}>
              {(g) => (
                <option value={g.id} selected={ku() === g.id}>
                  {g.name}
                </option>
              )}
            </For>
          </select>
          <select aria-label="Lokasi" value={lokasi()} onChange={(e) => setLokasi(e.currentTarget.value)}>
            <option value="">Semua lokasi</option>
            <For each={locs()}>
              {(l) => (
                <option value={l.id} selected={lokasi() === l.id}>
                  {l.name}
                </option>
              )}
            </For>
            <option value="none">Lokasi belum diisi</option>
          </select>
          {/* biome-ignore lint/a11y/useSemanticElements: fieldset merusak tata letak tombol segmen */}
          <div class="segmen" role="group" aria-label="Rentang jadwal">
            <button
              type="button"
              aria-pressed={!past()}
              onClick={async () => {
                setPast(false);
                await load();
              }}
            >
              Mendatang
            </button>
            <button
              type="button"
              aria-pressed={past()}
              onClick={async () => {
                setPast(true);
                await load();
              }}
            >
              Termasuk 60 hari lalu
            </button>
          </div>
          <button
            class="tombol ikon-saja"
            type="button"
            disabled={!sedangDisaring()}
            onClick={() => {
              setKu("");
              setLokasi("");
            }}
            aria-label="Atur ulang filter"
            title="Atur ulang filter"
          >
            <Ikon nama="ulang" ukuran={18} />
          </button>
        </section>

        <Show when={loaded() && !error() && items().length === 0}>
          <p class="kosong">
            {admin()
              ? "Belum ada sesi latihan. Tambahkan sesi pertama; bisa diulang tiap minggu."
              : "Belum ada sesi untuk KU yang ditugaskan kepada Anda. Hubungi admin SSB untuk penjadwalan atau penugasan KU."}
          </p>
        </Show>
        <Show when={items().length > 0 && tersaring().length === 0}>
          <p class="kosong">Tidak ada sesi yang cocok dengan filter ini.</p>
        </Show>

        <div class="hari-daftar">
          <For each={byDate()}>
            {(day) => {
              const b = blok(day.date);
              return (
                <section class="panel hari-sesi" aria-label={hari(day.date)}>
                  <header class="panel-kepala">
                    <div class="judul-hari">
                      <span class="blok-tanggal" aria-hidden="true">
                        <small>{b.hari}</small>
                        <strong>{b.tgl}</strong>
                        <small>{b.bulan}</small>
                      </span>
                      <div>
                        <h2>{hari(day.date)}</h2>
                        <span class="petunjuk">{day.list.length} sesi</span>
                      </div>
                    </div>
                    <Show when={day.date === today || day.date === tambahHari(today, 1)}>
                      <span class="lencana-kecil-netral">{tanggalSesi(day.date)}</span>
                    </Show>
                  </header>
                  <ul class="daftar-sesi">
                    <For each={day.list}>
                      {(s) => (
                        <li class="baris-sesi">
                          <Show
                            when={editing() === s.id}
                            fallback={
                              <>
                                <A class="info-sesi" href={`/absensi/${s.id}`}>
                                  <strong>{s.startTime ? `Jam ${s.startTime}` : "Waktu belum diisi"}</strong>
                                  <span class="petunjuk">
                                    <span class="ku-titik">{s.ageGroup.name}</span>
                                    {s.location ? ` • ${s.location.name}` : " • Lokasi belum diisi"}
                                  </span>
                                </A>
                                <span
                                  class="hisa"
                                  role="img"
                                  aria-label={`${s.attendance.hadir} hadir, ${s.attendance.izin} izin, ${s.attendance.sakit} sakit, ${s.attendance.alpa} alpa, ${s.attendance.belum} belum diisi`}
                                >
                                  <Show when={diabsen(s.attendance) > 0}>
                                    <span data-v="hadir" title="Hadir">
                                      H {s.attendance.hadir}
                                    </span>
                                    <span data-v="izin" title="Izin">
                                      I {s.attendance.izin}
                                    </span>
                                    <span data-v="sakit" title="Sakit">
                                      S {s.attendance.sakit}
                                    </span>
                                    <span data-v="alpa" title="Alpa">
                                      A {s.attendance.alpa}
                                    </span>
                                  </Show>
                                  <Show
                                    when={s.attendance.belum > 0}
                                    fallback={
                                      <Show when={diabsen(s.attendance) === 0}>
                                        <span class="petunjuk">Tidak ada siswa aktif</span>
                                      </Show>
                                    }
                                  >
                                    <span class="lencana-peringatan">{s.attendance.belum} belum diisi</span>
                                  </Show>
                                </span>
                                <span class="butir-aksi">
                                  <A class="tombol tombol-kecil" href={`/absensi/${s.id}`}>
                                    Absensi
                                  </A>
                                  <Show when={admin()}>
                                    <Show
                                      when={confirmId() === s.id}
                                      fallback={
                                        <>
                                          <button
                                            class="tombol tipis"
                                            type="button"
                                            onClick={() => {
                                              setNotice("");
                                              setEditing(s.id);
                                            }}
                                          >
                                            Ubah
                                          </button>
                                          <button class="tombol tipis" type="button" onClick={() => setConfirmId(s.id)}>
                                            Hapus
                                          </button>
                                        </>
                                      }
                                    >
                                      <button class="tombol bahaya" type="button" onClick={() => remove(s.id)}>
                                        Ya, hapus
                                      </button>
                                      <button class="tombol tipis" type="button" onClick={() => setConfirmId(null)}>
                                        Batal
                                      </button>
                                    </Show>
                                  </Show>
                                </span>
                              </>
                            }
                          >
                            <SessionForm
                              initial={s}
                              ageGroups={groups()}
                              locations={locs()}
                              onCancel={() => setEditing(null)}
                              onSaved={async () => {
                                setEditing(null);
                                setNotice("Sesi diperbarui.");
                                await load();
                              }}
                            />
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              );
            }}
          </For>
        </div>
      </main>
    </Show>
  );
}
