import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import KepalaHalaman from "~/components/KepalaHalaman";
import QrCode from "~/components/QrCode";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import FotoPemain from "~/components/FotoPemain";
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
              <KepalaHalaman chip="Kartu pemain" judul={`Kartu ${d().fullName}`} sub="Tunjukkan kode QR ke pelatih saat tiba di lapangan." />
              <article class="kartu" aria-label={`Kartu pemain ${d().fullName}`}>
                <header>
                  <div>
                    <span class="kartu-ssb">{me()!.active!.ssbName}</span>
                    <span class="kartu-sub">Kartu anggota</span>
                  </div>
                  <div class="kartu-no">
                    <strong>{d().memberNo ?? "Belum ada nomor"}</strong>
                    <span class="kartu-status" data-status={d().status}>
                      {statusLabel[d().status]}
                    </span>
                  </div>
                </header>
                <div class="kartu-badan">
                  <div class="kartu-profil">
                    <FotoPemain id={d().id} nama={d().fullName} photoV={d().photoV} />
                    <div class="ortu-teks">
                      <span class="ortu-chip hijau">{d().ageGroup?.name ?? "KU belum ditentukan"}</span>
                      <div class="kartu-nama">{d().fullName}</div>
                      <span class="petunjuk">{d().position ? posisiLabel[d().position!] : "Posisi belum ditentukan"}</span>
                    </div>
                  </div>
                  <div class="kartu-qr">
                    <QrCode value={url()} label={`Kode QR ${d().fullName}, nomor anggota ${d().memberNo ?? "belum ada"}`} />
                    <p>Tunjukkan kode ini ke pelatih. Kode membuka profil pemain, dan hanya akun yang berhak yang bisa melihat isinya.</p>
                    <Show when={d().memberNo}>
                      <p class="kartu-kode">
                        Kode unik: <strong>{d().memberNo}</strong>
                      </p>
                    </Show>
                  </div>
                </div>
              </article>
              <div class="kartu-aksi">
                <button class="tombol utama" type="button" onClick={() => window.print()}>
                  Cetak kartu
                </button>
                <A class="tombol utama-rumput" href={`/pemain/${d().id}`}>
                  Lihat profil
                </A>
              </div>
            </>
          )}
        </Show>
      </main>
    </Show>
  );
}
