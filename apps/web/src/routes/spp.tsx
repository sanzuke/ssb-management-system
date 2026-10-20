import { useNavigate, useSearchParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import KepalaHalaman from "~/components/KepalaHalaman";
import SppAdmin from "~/components/SppAdmin";
import SppPengingat from "~/components/SppPengingat";
import SppPengaturan from "~/components/SppPengaturan";
import SppOrtu from "~/components/SppOrtu";
import SppTarifKhusus from "~/components/SppTarifKhusus";
import WhatsappPengaturan from "~/components/WhatsappPengaturan";
import { getMe, type Me } from "~/lib/api";

type TabSpp = "tagihan" | "pengingat" | "pengaturan";

export default function Spp() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [params, setParams] = useSearchParams();
  // Tab tersimpan di alamat (?tab=...) supaya bisa ditautkan dari dasbor.
  const tab = (): TabSpp => (params.tab === "pengingat" || params.tab === "pengaturan" ? params.tab : "tagihan");
  const setTab = (t: TabSpp) => setParams({ tab: t === "tagihan" ? undefined : t }, { replace: true });

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
          {/* biome-ignore lint/a11y/useSemanticElements: pilihan tampilan */}
          <div class="tab-periode" role="group" aria-label="Tampilan">
            <button type="button" aria-pressed={tab() === "tagihan"} onClick={() => setTab("tagihan")}>
              Tagihan
            </button>
            <button type="button" aria-pressed={tab() === "pengingat"} onClick={() => setTab("pengingat")}>
              Pengingat
            </button>
            <button type="button" aria-pressed={tab() === "pengaturan"} onClick={() => setTab("pengaturan")}>
              Pengaturan
            </button>
          </div>
          <Show when={tab() === "tagihan"}>
            <SppAdmin />
          </Show>
          <Show when={tab() === "pengingat"}>
            <SppPengingat ssbName={me()?.active?.ssbName ?? "SSB"} />
          </Show>
          <Show when={tab() === "pengaturan"}>
            <SppPengaturan />
            <WhatsappPengaturan />
          </Show>
        </Show>
      </main>
    </Show>
  );
}
