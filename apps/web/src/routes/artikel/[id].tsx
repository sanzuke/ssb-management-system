import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import type { PostAdminDetail } from "@ssb/shared";
import ArtikelEditor from "~/components/ArtikelEditor";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe } from "~/lib/api";

export default function ArtikelSunting() {
  const nav = useNavigate();
  const params = useParams();
  const [artikel, setArtikel] = createSignal<PostAdminDetail | null>(null);
  const [pesan, setPesan] = createSignal("");

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!["admin_ssb", "pelatih", "korlas"].includes(m.active?.role ?? "")) return nav("/", { replace: true });
    try {
      setArtikel(await api<PostAdminDetail>(`/posts/${encodeURIComponent(params.id ?? "")}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setPesan("Artikel tidak ditemukan.");
      else if (e instanceof ApiError && e.status === 403) setPesan("Anda tidak punya akses ke artikel ini.");
      else setPesan("Artikel tidak bisa dimuat. Muat ulang halaman ini.");
    }
  });

  return (
    <>
      <Title>Sunting artikel · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Artikel" judul={artikel()?.title.id ?? "Sunting artikel"}>
          <A class="tombol tipis" href="/artikel">
            Kembali ke daftar
          </A>
        </KepalaHalaman>
        <Show when={!pesan()} fallback={<p class="kosong">{pesan()}</p>}>
          <Show when={artikel()} fallback={<Memuat />}>
            {(a) => <ArtikelEditor awal={a()} />}
          </Show>
        </Show>
      </main>
    </>
  );
}
