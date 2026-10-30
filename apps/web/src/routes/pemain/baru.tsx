import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createSignal, onMount, Show } from "solid-js";
import PlayerForm from "~/components/PlayerForm";
import Memuat from "~/components/Memuat";
import { api, getMe, type Me } from "~/lib/api";
import type { AgeGroup } from "~/lib/pemain";

export default function PemainBaru() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/pemain", { replace: true });
    setMe(m);
    setGroups(await api<AgeGroup[]>("/age-groups").catch(() => []));
  });

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Tambah siswa · SSB App</Title>
      <main class="halaman">
        <KepalaHalaman
          chip="Data siswa"
          judul="Tambah siswa"
          sub="Isi data siswa. ID siswa boleh diisi sendiri (mis. SSB-001) atau dikosongkan agar dibuat otomatis."
        />
        <Show when={groups().length === 0}>
          <p class="info">
            Belum ada KU. Siswa tetap bisa ditambahkan sekarang, KU diisi nanti setelah dibuat di <A href="/master">Data master</A>.
          </p>
        </Show>
        <PlayerForm ageGroups={groups()} onSaved={(p) => nav(`/pemain/${p.id}`)} />
        <p class="tautan-bawah">
          <A href="/pemain">Kembali ke daftar siswa</A>
        </p>
      </main>
    </Show>
  );
}
