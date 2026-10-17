import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import QrCode from "~/components/QrCode";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { posisiLabel, statusLabel, type PlayerDetail } from "~/lib/pemain";

export default function KartuPemain() {
  const nav = useNavigate();
  const p = useParams<{ id: string }>();
  const [me, setMe] = createSignal<Me | null>(null);
  const [pl, setPl] = createSignal<PlayerDetail | null>(null);
  const [missing, setMissing] = createSignal(false);
  const [error, setError] = createSignal("");

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    try {
      setPl(await api<PlayerDetail>(`/players/${encodeURIComponent(p.id)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError("Kartu tidak bisa dimuat. Muat ulang halaman.");
    }
  });

  // Isi QR = alamat profil pemain di aplikasi. Siapa pun bisa memindainya dengan kamera HP,
  // tetapi profil hanya terbuka bagi yang sudah masuk dan berhak (admin, pelatih KU-nya, orang tua anak itu).
  const url = () => `${location.origin}/pemain/${p.id}`;

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Kartu pemain · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman">
        <Show when={error()}>
          <div class="peringatan" role="alert">
            {error()}
          </div>
        </Show>
        <Show when={missing()}>
          <h1>Kartu tidak ditemukan</h1>
          <p>Pemain ini tidak ada, atau bukan bagian dari KU atau anak yang bisa Anda akses.</p>
          <A class="tombol" href="/pemain">
            Ke daftar pemain
          </A>
        </Show>
        <Show when={pl()}>
          {(d) => (
            <>
              <h1>Kartu pemain</h1>
              <article class="kartu" aria-label={`Kartu pemain ${d().fullName}`}>
                <header>
                  <span class="kartu-ssb">{me()!.active!.ssbName}</span>
                  <span class="kartu-status" data-status={d().status}>
                    {statusLabel[d().status]}
                  </span>
                </header>
                <div class="kartu-nama">{d().fullName}</div>
                <dl class="kartu-data">
                  <dt>Nomor anggota</dt>
                  <dd>{d().memberNo ?? "-"}</dd>
                  <dt>KU</dt>
                  <dd>{d().ageGroup?.name ?? "Belum ditentukan"}</dd>
                  <dt>Posisi</dt>
                  <dd>{d().position ? posisiLabel[d().position!] : "Belum ditentukan"}</dd>
                </dl>
                <QrCode value={url()} label={`Kode QR ${d().fullName}, nomor anggota ${d().memberNo ?? "belum ada"}`} />
              </article>
              <p class="petunjuk">Kode QR membuka profil pemain. Hanya akun yang berhak yang bisa melihat isinya.</p>
              <p class="tautan-bawah">
                <A class="tombol tipis" href={`/pemain/${d().id}`}>
                  Lihat profil
                </A>
                <button class="tombol tipis" type="button" onClick={() => window.print()}>
                  Cetak kartu
                </button>
              </p>
            </>
          )}
        </Show>
      </main>
    </Show>
  );
}
