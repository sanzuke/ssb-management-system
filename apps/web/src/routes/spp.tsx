import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import KepalaHalaman from "~/components/KepalaHalaman";
import SppAdmin from "~/components/SppAdmin";
import SppOrtu from "~/components/SppOrtu";
import { getMe, type Me } from "~/lib/api";

export default function Spp() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    const role = m.active?.role;
    // Hanya admin SSB (mengelola) dan orang tua (melihat tagihan anak).
    if (role !== "admin_ssb" && role !== "orang_tua") return nav("/", { replace: true });
    setMe(m);
  });

  const admin = () => me()?.active?.role === "admin_ssb";

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>SPP · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Keuangan"
          judul="SPP"
          sub={admin() ? "Atur tarif tiap KU, buat tagihan bulanan, dan catat pembayaran yang diterima." : "Tagihan SPP dan riwayat pembayaran anak Anda."}
        />
        <Show when={admin()} fallback={<SppOrtu />}>
          <SppAdmin />
        </Show>
      </main>
    </Show>
  );
}
