import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import DashboardStaf from "~/components/DashboardStaf";
import PortalOrangTua from "~/components/PortalOrangTua";
import { getMe, roleLabel, type Me } from "~/lib/api";

export default function Beranda() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active && m.memberships.length > 0) return nav("/pilih-ssb", { replace: true });
    setMe(m);
  });

  // Admin, korlas, dan pelatih mendapat dashboard; orang tua mendapat portal anak.
  const staf = () => !!me()?.active && me()!.active!.role !== "orang_tua";

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Beranda · SSB App</Title>
      <main class="halaman" classList={{ lebar: staf() }}>
        <Show
          when={staf()}
          fallback={
            <>
              <h1>Halo, {me()!.name}</h1>
              <Show
                when={me()!.active}
                fallback={
                  <>
                    <p>Akun ini belum tergabung di SSB mana pun. Buka tautan undangan dari admin SSB, atau buat SSB baru.</p>
                    <A class="tombol utama" href="/daftar">
                      Daftarkan SSB baru
                    </A>
                  </>
                }
              >
                <p class="ortu-chip-baris">
                  <span class="ortu-chip">{me()!.active!.ssbName}</span>
                  <span class="ortu-chip kuning">{roleLabel[me()!.active!.role]}</span>
                </p>
                <PortalOrangTua />
              </Show>
            </>
          }
        >
          <DashboardStaf me={me()!} />
        </Show>
      </main>
    </Show>
  );
}
