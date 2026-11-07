import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import ProgresDana from "~/components/ProgresDana";
import SumbanganForm from "~/components/SumbanganForm";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { labelJenis, labelKampanye, labelSumbangan, warnaLencana } from "~/lib/donasi";
import { rupiah } from "~/lib/waktu";
import type { FundraisingDetail, FundraisingPledgeRow, PledgeStatus } from "@ssb/shared";

const tanggal = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
/** Waktu pembuatan (ISO UTC) ditampilkan menurut jam perangkat, bukan tanggal UTC-nya, supaya tidak mundur sehari di WIB. */
const tanggalWaktu = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

export default function DonasiDetail() {
  const nav = useNavigate();
  const params = useParams();
  const [me, setMe] = createSignal<Me | null>(null);
  const [data, setData] = createSignal<FundraisingDetail | null>(null);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [catat, setCatat] = createSignal(false);
  const [confirmId, setConfirmId] = createSignal<string | null>(null);

  const admin = () => me()?.active?.role === "admin_ssb";
  const k = () => data()?.campaign;

  const load = async () => {
    try {
      setData(await api<FundraisingDetail>(`/fundraising/${encodeURIComponent(params.id ?? "")}`));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 404 ? "Kampanye tidak ditemukan." : "Kampanye tidak bisa dimuat. Muat ulang halaman.");
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    await load();
  });

  const putuskan = async (p: FundraisingPledgeRow, status: Exclude<PledgeStatus, "menunggu">) => {
    setNotice("");
    try {
      await api(`/fundraising/pledges/${p.id}`, { method: "PATCH", body: { status, adminNote: p.adminNote ?? "" } });
      await load();
      setNotice(status === "diterima" ? "Sumbangan diterima dan dihitung ke dana terkumpul." : "Sumbangan ditolak.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    }
  };

  const hapus = async (id: string) => {
    setNotice("");
    try {
      await api(`/fundraising/pledges/${id}`, { method: "DELETE" });
      await load();
      setNotice("Sumbangan dihapus.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setConfirmId(null);
    }
  };

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>{k() ? `${k()!.title} · Donasi` : "Donasi"} · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Donasi" judul={k()?.title ?? "Kampanye donasi"}>
          <A class="tombol tipis" href="/donasi">
            Kembali ke daftar
          </A>
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

        <Show when={k()}>
          {(c) => (
            <>
              <section class="panel" aria-label="Ringkasan kampanye">
                <header class="panel-kepala">
                  <div>
                    <h2>Ringkasan</h2>
                    <span class="petunjuk">
                      {c().event ? `Untuk: ${c().event!.title} (${tanggal(c().event!.startDate)})` : "Tidak terkait kegiatan"}
                      {c().deadline ? ` • Sampai ${tanggal(c().deadline!)}` : ""}
                    </span>
                  </div>
                  <span class="lencana-status" data-s={warnaLencana(c().status)}>
                    {c().status === "aktif" && !c().open ? "Lewat batas akhir" : labelKampanye[c().status]}
                  </span>
                </header>
                <div class="panel-isi">
                  <Show when={c().description}>
                    <p>{c().description}</p>
                  </Show>
                  <ProgresDana raised={c().raised} target={c().targetAmount} supporters={c().supporters} />
                </div>
              </section>

              <section class="panel" aria-label="Menyumbang">
                <header class="panel-kepala">
                  <h2>Menyumbang atau menjadi sponsor</h2>
                </header>
                <div class="panel-isi">
                  <Show when={c().paymentInfo}>
                    <p>
                      <strong>Transfer ke:</strong>
                    </p>
                    <p style={{ "white-space": "pre-wrap" }}>{c().paymentInfo}</p>
                  </Show>
                  <Show
                    when={c().open}
                    fallback={<p class="kosong">Kampanye ini sedang tidak menerima sumbangan baru.</p>}
                  >
                    <p class="petunjuk">Isi formulir setelah Anda mentransfer. Admin akan mengonfirmasi dan sumbangan dihitung setelah dikonfirmasi.</p>
                    <SumbanganForm
                      campaignId={c().id}
                      onSaved={async () => {
                        setNotice("Terima kasih. Sumbangan Anda tercatat dan menunggu konfirmasi admin setelah transfer diterima.");
                        await load();
                      }}
                    />
                  </Show>
                </div>
              </section>

              <Show when={admin()}>
                <section class="panel" aria-label="Catat sumbangan">
                  <header class="panel-kepala">
                    <div>
                      <h2>Catat sumbangan di luar aplikasi</h2>
                      <span class="petunjuk">Untuk sumbangan tunai, transfer langsung, atau sponsor perusahaan. Langsung dihitung sebagai diterima.</span>
                    </div>
                    <Show when={!catat()}>
                      <button class="tombol tipis" type="button" onClick={() => setCatat(true)}>
                        Catat sumbangan
                      </button>
                    </Show>
                  </header>
                  <Show when={catat()}>
                    <div class="panel-isi">
                      <SumbanganForm
                        catat
                        campaignId={c().id}
                        onCancel={() => setCatat(false)}
                        onSaved={async () => {
                          setCatat(false);
                          setNotice("Sumbangan dicatat sebagai diterima.");
                          await load();
                        }}
                      />
                    </div>
                  </Show>
                </section>
              </Show>

              <section class="panel" aria-label="Daftar sumbangan">
                <header class="panel-kepala">
                  <div>
                    <h2>{admin() ? "Semua sumbangan" : "Pendukung"}</h2>
                    <span class="petunjuk">{admin() ? "Termasuk yang menunggu konfirmasi dan yang ditolak." : "Sumbangan yang sudah diterima, dan sumbangan Anda sendiri."}</span>
                  </div>
                </header>
                <Show when={data()!.pledges.length > 0} fallback={<p class="kosong">Belum ada sumbangan.</p>}>
                  <div class="tabel-bungkus">
                    <table class="tabel-pemain">
                      <thead>
                        <tr>
                          <th>Donatur</th>
                          <th>Jenis</th>
                          <th>Nominal</th>
                          <th>Status</th>
                          <th>Tanggal</th>
                          <Show when={admin()}>
                            <th>Aksi</th>
                          </Show>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={data()!.pledges}>
                          {(p) => (
                            <tr>
                              <td>
                                <strong>{p.donorName ?? "Anonim"}</strong>
                                {p.mine ? " (Anda)" : ""}
                                {p.isAnonymous && (admin() || p.mine) ? " • disembunyikan" : ""}
                                {p.fromLanding ? " • dari landing" : ""}
                                <Show when={p.message}>
                                  <div class="petunjuk">“{p.message}”</div>
                                </Show>
                                <Show when={admin() && (p.donorWhatsapp || p.adminNote)}>
                                  <div class="petunjuk">{[p.donorWhatsapp, p.adminNote].filter(Boolean).join(" • ")}</div>
                                </Show>
                              </td>
                              <td>
                                {labelJenis[p.kind]}
                                <Show when={p.packageName}>
                                  <div class="petunjuk">{p.packageName}</div>
                                </Show>
                              </td>
                              <td>{rupiah(p.amount)}</td>
                              <td>
                                <span class="lencana-status" data-s={warnaLencana(p.status)}>
                                  {labelSumbangan[p.status]}
                                </span>
                              </td>
                              <td>{p.receivedOn ? tanggal(p.receivedOn) : tanggalWaktu(p.createdAt)}</td>
                              <Show when={admin()}>
                                <td>
                                  <span class="butir-aksi">
                                    <Show when={p.status !== "diterima"}>
                                      <button class="tombol tombol-kecil" type="button" onClick={() => putuskan(p, "diterima")}>
                                        Terima
                                      </button>
                                    </Show>
                                    <Show when={p.status !== "ditolak"}>
                                      <button class="tombol tipis" type="button" onClick={() => putuskan(p, "ditolak")}>
                                        Tolak
                                      </button>
                                    </Show>
                                    <Show when={p.status !== "diterima"}>
                                      <Show
                                        when={confirmId() === p.id}
                                        fallback={
                                          <button class="tombol tipis" type="button" onClick={() => setConfirmId(p.id)}>
                                            Hapus
                                          </button>
                                        }
                                      >
                                        <button class="tombol bahaya" type="button" onClick={() => hapus(p.id)}>
                                          Ya, hapus
                                        </button>
                                      </Show>
                                    </Show>
                                  </span>
                                </td>
                              </Show>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </section>
            </>
          )}
        </Show>
      </main>
    </Show>
  );
}
