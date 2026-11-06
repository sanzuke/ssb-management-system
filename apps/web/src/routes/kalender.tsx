import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Ikon from "~/components/Ikon";
import KegiatanForm, { jenisKegiatan } from "~/components/KegiatanForm";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { bulanIni, hariIni, namaBulan, tambahHari, tanggalSesi } from "~/lib/waktu";
import type { CalendarEventRow } from "@ssb/shared";

const hari = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const pendek = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
const blok = (s: string) => {
  const d = new Date(`${s}T00:00:00`);
  return { hari: d.toLocaleDateString("id-ID", { weekday: "short" }), tgl: d.getDate(), bulan: d.toLocaleDateString("id-ID", { month: "short" }) };
};
/** Bulan YYYY-MM digeser n bulan. */
const geserBulan = (bulan: string, n: number) => {
  const d = new Date(`${bulan}-01T00:00:00`);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const akhirBulan = (bulan: string) => tambahHari(`${geserBulan(bulan, 1)}-01`, -1);

export default function Kalender() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [bulan, setBulan] = createSignal(bulanIni());
  const [items, setItems] = createSignal<CalendarEventRow[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [editing, setEditing] = createSignal<string | null>(null); // "baru" atau id
  const [confirmId, setConfirmId] = createSignal<string | null>(null);

  const admin = () => me()?.active?.role === "admin_ssb";
  const today = hariIni();
  const awal = () => `${bulan()}-01`;

  const load = async () => {
    setLoaded(false);
    try {
      setItems(await api<CalendarEventRow[]>(`/calendar?from=${awal()}&to=${akhirBulan(bulan())}`));
      setError("");
    } catch {
      setError("Kalender tidak bisa dimuat. Muat ulang halaman.");
    } finally {
      setLoaded(true);
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    await load();
  });

  const pilihBulan = async (b: string) => {
    setBulan(b);
    setEditing(null);
    setConfirmId(null);
    setNotice("");
    await load();
  };

  // Kegiatan yang mulai sebelum bulan ini dikelompokkan di hari pertama bulan, dengan rentang aslinya tetap tampil.
  const perHari = createMemo(() => {
    const out: { date: string; list: CalendarEventRow[] }[] = [];
    for (const e of items()) {
      const date = e.startDate < awal() ? awal() : e.startDate;
      const last = out[out.length - 1];
      if (last && last.date === date) last.list.push(e);
      else out.push({ date, list: [e] });
    }
    return out;
  });

  const remove = async (id: string) => {
    setNotice("");
    try {
      await api(`/calendar/${id}`, { method: "DELETE" });
      await load();
      setNotice("Kegiatan dihapus.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setConfirmId(null);
    }
  };

  const rentang = (e: CalendarEventRow) => (e.endDate && e.endDate !== e.startDate ? `${pendek(e.startDate)} – ${pendek(e.endDate)}` : null);
  const waktu = (e: CalendarEventRow) => (e.startTime ? `Jam ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : "Sepanjang hari");

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Kalender · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Kalender" judul="Kalender akademi" sub="Pertandingan, acara, dan libur. Jadwal latihan per KU ada di menu Jadwal.">
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
              Tambah kegiatan
            </button>
          </Show>
        </KepalaHalaman>

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
          <section class="panel form-sesi" aria-label="Kegiatan baru">
            <header class="panel-kepala">
              <h2>Kegiatan baru</h2>
            </header>
            <div class="panel-isi">
              <KegiatanForm
                defaultDate={bulan() === bulanIni() ? today : awal()}
                onCancel={() => setEditing(null)}
                onSaved={async () => {
                  setEditing(null);
                  setNotice("Kegiatan ditambahkan.");
                  await load();
                }}
              />
            </div>
          </section>
        </Show>

        <nav class="bilah-filter" aria-label="Pilih bulan">
          <button class="tombol ikon-saja" type="button" onClick={() => pilihBulan(geserBulan(bulan(), -1))} aria-label="Bulan sebelumnya" title="Bulan sebelumnya">
            ‹
          </button>
          <strong aria-live="polite">{namaBulan(bulan())}</strong>
          <button class="tombol ikon-saja" type="button" onClick={() => pilihBulan(geserBulan(bulan(), 1))} aria-label="Bulan berikutnya" title="Bulan berikutnya">
            ›
          </button>
          <button class="tombol tipis" type="button" disabled={bulan() === bulanIni()} onClick={() => pilihBulan(bulanIni())}>
            Bulan ini
          </button>
        </nav>

        <Show when={loaded() && !error() && items().length === 0}>
          <p class="kosong">
            {admin() ? `Belum ada kegiatan pada ${namaBulan(bulan())}. Tambahkan pertandingan, acara, atau libur.` : `Belum ada kegiatan pada ${namaBulan(bulan())}.`}
          </p>
        </Show>

        <div class="hari-daftar">
          <For each={perHari()}>
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
                        <span class="petunjuk">{day.list.length} kegiatan</span>
                      </div>
                    </div>
                    <Show when={day.date === today || day.date === tambahHari(today, 1)}>
                      <span class="lencana-kecil-netral">{tanggalSesi(day.date)}</span>
                    </Show>
                  </header>
                  <ul class="daftar-sesi">
                    <For each={day.list}>
                      {(e) => (
                        <li class="baris-sesi">
                          <Show
                            when={editing() === e.id}
                            fallback={
                              <>
                                <div class="info-sesi">
                                  <strong>{e.title}</strong>
                                  <span class="petunjuk">
                                    <span class="ku-titik">{jenisKegiatan[e.eventType]}</span>
                                    {` • ${rentang(e) ?? waktu(e)}`}
                                    {rentang(e) && e.startTime ? ` • ${waktu(e)}` : ""}
                                    {e.location ? ` • ${e.location}` : ""}
                                  </span>
                                  <Show when={e.description}>
                                    <span class="petunjuk">{e.description}</span>
                                  </Show>
                                </div>
                                <Show when={admin()}>
                                  <span class="lencana-kecil-netral">{e.isPublic ? "Tampil di landing" : "Internal"}</span>
                                  <span class="butir-aksi">
                                    <Show
                                      when={confirmId() === e.id}
                                      fallback={
                                        <>
                                          <button
                                            class="tombol tipis"
                                            type="button"
                                            onClick={() => {
                                              setNotice("");
                                              setEditing(e.id);
                                            }}
                                          >
                                            Ubah
                                          </button>
                                          <button class="tombol tipis" type="button" onClick={() => setConfirmId(e.id)}>
                                            Hapus
                                          </button>
                                        </>
                                      }
                                    >
                                      <button class="tombol bahaya" type="button" onClick={() => remove(e.id)}>
                                        Ya, hapus
                                      </button>
                                      <button class="tombol tipis" type="button" onClick={() => setConfirmId(null)}>
                                        Batal
                                      </button>
                                    </Show>
                                  </span>
                                </Show>
                              </>
                            }
                          >
                            <KegiatanForm
                              initial={e}
                              onCancel={() => setEditing(null)}
                              onSaved={async () => {
                                setEditing(null);
                                setNotice("Kegiatan diperbarui.");
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
