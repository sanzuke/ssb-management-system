import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import ArtikelEditor from "~/components/ArtikelEditor";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { getMe } from "~/lib/api";

export default function ArtikelBaru() {
  const nav = useNavigate();
  const [siap, setSiap] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!["admin_ssb", "pelatih", "korlas"].includes(m.active?.role ?? "")) return nav("/", { replace: true });
    setSiap(true);
  });

  return (
    <Show when={siap()} fallback={<Memuat halaman />}>
      <Title>Tulis artikel · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Artikel" judul="Tulis artikel" sub="Simpan sebagai draf dulu. Artikel baru tampil di landing setelah diterbitkan.">
          <A class="tombol tipis" href="/artikel">
            Kembali ke daftar
          </A>
        </KepalaHalaman>
        <ArtikelEditor awal={null} />
      </main>
    </Show>
  );
}
