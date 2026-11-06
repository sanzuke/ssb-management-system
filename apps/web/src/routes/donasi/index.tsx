import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import Ikon from "~/components/Ikon";
import KampanyeForm from "~/components/KampanyeForm";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import ProgresDana from "~/components/ProgresDana";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { labelKampanye, warnaLencana } from "~/lib/donasi";
import { hariIni, tambahHari } from "~/lib/waktu";
import type { CalendarEventRow, FundraisingCampaignRow } from "@ssb/shared";

const tanggal = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

export default function Donasi() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [items, setItems] = createSignal<FundraisingCampaignRow[]>([]);
  const [events, setEvents] = createSignal<CalendarEventRow[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [editing, setEditing] = createSignal<string | null>(null); // "baru" atau id
  const [confirmId, setConfirmId] = createSignal<string | null>(null);

  const admin = () => me()?.active?.role === "admin_ssb";

  const load = async () => {
    try {
      setItems(await api<FundraisingCampaignRow[]>("/fundraising"));
      setError("");
    } catch {
      setError("Daftar kampanye tidak bisa dimuat. Muat ulang halaman.");
    } finally {
      setLoaded(true);
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    if (m.active.role === "admin_ssb") {
      const today = hariIni();
      setEvents(await api<CalendarEventRow[]>(`/calendar?from=${tambahHari(today, -30)}&to=${tambahHari(today, 365)}`).catch(() => []));
    }
    await load();
  });

  const remove = async (id: string) => {
    setNotice("");
    try {
      await api(`/fundraising/${id}`, { method: "DELETE" });
      await load();
      setNotice("Kampanye dihapus.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setConfirmId(null);
    }
  };

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Donasi · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Donasi" judul="Donasi kegiatan" sub="Galang dana untuk kegiatan akademi. Orang tua bisa menyumbang atau menjadi sponsor; admin mengonfirmasi tiap sumbangan setelah transfer diterima.">
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
              Tambah kampanye
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
          <section class="panel form-sesi" aria-label="Kampanye baru">
            <header class="panel-kepala">
              <h2>Kampanye baru</h2>
            </header>
            <div class="panel-isi">
              <KampanyeForm
                events={events()}
                onCancel={() => setEditing(null)}
                onSaved={async (k) => {
                  setEditing(null);
                  setNotice(
                    k.status === "aktif"
                      ? "Kampanye ditambahkan dan sudah menerima sumbangan."
                      : "Kampanye ditambahkan. Ubah statusnya menjadi Aktif agar bisa menerima sumbangan.",
                  );
                  await load();
                }}
              />
            </div>
          </section>
        </Show>

        <Show when={loaded() && !error() && items().length === 0}>
          <p class="kosong">{admin() ? "Belum ada kampanye. Tambahkan kampanye untuk kegiatan yang butuh dana." : "Belum ada kampanye donasi saat ini."}</p>
        </Show>

        <div class="hari-daftar">
          <For each={items()}>
            {(k) => (
              <section class="panel" aria-label={k.title}>
                <Show
                  when={editing() === k.id}
                  fallback={
                    <>
                      <header class="panel-kepala">
                        <div>
                          <h2>
                            <A href={`/donasi/${k.id}`}>{k.title}</A>
                          </h2>
                          <span class="petunjuk">
                            {k.event ? `Untuk: ${k.event.title} (${tanggal(k.event.startDate)})` : "Tidak terkait kegiatan"}
                            {k.deadline ? ` • Sampai ${tanggal(k.deadline)}` : ""}
                          </span>
                        </div>
                        <span class="butir-aksi">
                          <span class="lencana-status" data-s={warnaLencana(k.status)}>
                            {k.status === "aktif" && !k.open ? "Lewat batas akhir" : labelKampanye[k.status]}
                          </span>
                          <Show when={admin() && k.status !== "draft" && !k.isPublic}>
                            <span class="lencana-kecil-netral">Tidak tampil di landing</span>
                          </Show>
                        </span>
                      </header>
                      <div class="panel-isi">
                        <Show when={k.description}>
                          <p>{k.description}</p>
                        </Show>
                        <ProgresDana raised={k.raised} target={k.targetAmount} supporters={k.supporters} />
                        <div class="butir-aksi">
                          <A class="tombol utama tombol-kecil" href={`/donasi/${k.id}`}>
                            {k.open ? "Lihat dan sumbang" : "Lihat detail"}
                          </A>
                          <Show when={admin()}>
                            <Show
                              when={confirmId() === k.id}
                              fallback={
                                <>
                                  <button
                                    class="tombol tipis"
                                    type="button"
                                    onClick={() => {
                                      setNotice("");
                                      setEditing(k.id);
                                    }}
                                  >
                                    Ubah
                                  </button>
                                  <button class="tombol tipis" type="button" onClick={() => setConfirmId(k.id)}>
                                    Hapus
                                  </button>
                                </>
                              }
                            >
                              <button class="tombol bahaya" type="button" onClick={() => remove(k.id)}>
                                Ya, hapus
                              </button>
                              <button class="tombol tipis" type="button" onClick={() => setConfirmId(null)}>
                                Batal
                              </button>
                            </Show>
                          </Show>
                        </div>
                      </div>
                    </>
                  }
                >
                  <div class="panel-isi">
                    <KampanyeForm
                      initial={k}
                      events={events()}
                      onCancel={() => setEditing(null)}
                      onSaved={async () => {
                        setEditing(null);
                        setNotice("Kampanye diperbarui.");
                        await load();
                      }}
                    />
                  </div>
                </Show>
              </section>
            )}
          </For>
        </div>
      </main>
    </Show>
  );
}
