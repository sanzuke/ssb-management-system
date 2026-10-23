import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import type { SiteAdminView } from "@ssb/shared";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import SitusEditor from "~/components/SitusEditor";
import { api, getMe } from "~/lib/api";

export default function Situs() {
  const nav = useNavigate();
  const [view, setView] = createSignal<SiteAdminView | null>(null);
  const [gagal, setGagal] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    try {
      setView(await api<SiteAdminView>("/site"));
    } catch {
      setGagal(true);
    }
  });

  return (
    <>
      <Title>Konten situs · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Situs"
          judul="Konten situs"
          sub="Isi landing page akademi. Simpan sebagai draf, periksa, lalu terbitkan. Pengunjung hanya melihat versi yang sudah diterbitkan."
        />
        <Show when={!gagal()} fallback={<p class="kosong">Konten situs tidak bisa dimuat. Muat ulang halaman ini.</p>}>
          <Show when={view()} fallback={<Memuat halaman />}>
            {(v) => <SitusEditor awal={v()} />}
          </Show>
        </Show>
      </main>
    </>
  );
}
