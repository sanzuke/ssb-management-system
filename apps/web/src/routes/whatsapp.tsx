import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import WaPendaftarPengaturan from "~/components/WaPendaftarPengaturan";
import WhatsappPengaturan from "~/components/WhatsappPengaturan";
import { getMe, type Me } from "~/lib/api";

/** Pengaturan WhatsApp (Fonnte) untuk seluruh SSB: koneksi dan token, lalu pesan per kegiatan (pengingat SPP, pendaftar trial). Hanya admin SSB. */
export default function Whatsapp() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  // Naik setiap kali token disimpan, supaya bagian pesan pendaftar membaca status token terbaru.
  const [versi, setVersi] = createSignal(0);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
  });

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>WhatsApp · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Pesan"
          judul="WhatsApp"
          sub="Sambungkan Fonnte sekali, lalu atur pesan untuk pengingat SPP dan pendaftar trial."
        />
        <WhatsappPengaturan onTersimpan={() => setVersi((v) => v + 1)} />
        <WaPendaftarPengaturan ssbName={me()?.active?.ssbName ?? "akademi"} muatUlang={versi()} />
      </main>
    </Show>
  );
}
