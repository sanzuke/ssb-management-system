import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
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

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Beranda · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman">
        <h1>Halo, {me()!.name}</h1>
        <Show
          when={me()!.active}
          fallback={
            <>
              <p>Akun ini belum tergabung di SSB mana pun. Buka tautan undangan dari admin SSB, atau buat SSB baru.</p>
              <A class="tombol utama" href="/daftar">Daftarkan SSB baru</A>
            </>
          }
        >
          <p>
            Anda masuk di <strong>{me()!.active!.ssbName}</strong> sebagai {roleLabel[me()!.active!.role]}.
          </p>
          <p class="info">Data pemain, absensi, dan penilaian sedang dibangun dan akan muncul di sini.</p>
        </Show>
      </main>
    </Show>
  );
}
