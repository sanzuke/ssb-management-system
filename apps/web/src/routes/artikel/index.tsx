import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { PostAdminRow, PostStatus } from "@ssb/shared";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import SelectField from "~/components/SelectField";
import { api, getMe } from "~/lib/api";

const labelStatus: Record<PostStatus, string> = { draft: "Draf", published: "Terbit" };
const tanggal = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { dateStyle: "medium" });

export default function Artikel() {
  const nav = useNavigate();
  const [ada, setAda] = createSignal(false);
  const [baris, setBaris] = createSignal<PostAdminRow[]>([]);
  const [saring, setSaring] = createSignal<"" | PostStatus>("");
  const [gagal, setGagal] = createSignal(false);
  const [dimuat, setDimuat] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!["admin_ssb", "pelatih", "korlas"].includes(m.active?.role ?? "")) return nav("/", { replace: true });
    setAda(true);
    try {
      setBaris(await api<PostAdminRow[]>("/posts"));
    } catch {
      setGagal(true);
    }
    setDimuat(true);
  });

  const tampil = createMemo(() => baris().filter((b) => !saring() || b.status === saring()));

  return (
    <Show when={ada()} fallback={<Memuat halaman />}>
      <Title>Artikel · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Situs" judul="Artikel" sub="Berita dan tulisan akademi di landing page. Tulis sebagai draf, lalu terbitkan.">
          <A class="tombol utama" href="/artikel/baru">
            Tulis artikel
          </A>
        </KepalaHalaman>
        <Show when={!dimuat()}>
          <Memuat />
        </Show>
        <Show when={gagal()}>
          <p class="kosong">Daftar artikel tidak bisa dimuat. Muat ulang halaman ini.</p>
        </Show>
        <Show when={dimuat() && !gagal()}>
          <Show when={baris().length > 0} fallback={<p class="kosong">Belum ada artikel. Mulai dengan tombol Tulis artikel.</p>}>
            <div class="form saring">
              <SelectField
                id="saring-status"
                label={`Status (${baris().length} artikel)`}
                value={saring()}
                onInput={(v) => setSaring(v === "draft" || v === "published" ? v : "")}
                blank="Semua"
                options={[
                  { value: "draft", label: labelStatus.draft },
                  { value: "published", label: labelStatus.published },
                ]}
              />
            </div>
            <Show when={tampil().length === 0}>
              <p class="kosong">Tidak ada artikel dengan status itu.</p>
            </Show>
            <ul class="daftar-artikel">
              <For each={tampil()}>
                {(b) => (
                  <li class="baris-artikel">
                    <Show when={b.coverUrl} fallback={<span class="mini-sampul kosong-sampul" aria-hidden="true" />}>
                      {(u) => <img class="mini-sampul" src={u()} alt="" loading="lazy" />}
                    </Show>
                    <div class="teks-artikel">
                      <Show when={b.canEdit} fallback={<strong>{b.title.id}</strong>}>
                        <A href={`/artikel/${b.id}`}>
                          <strong>{b.title.id}</strong>
                        </A>
                      </Show>
                      <span class="petunjuk">
                        {b.category ? `${b.category} · ` : ""}
                        {b.authorName} · {b.status === "published" && b.publishedAt ? `terbit ${tanggal(b.publishedAt)}` : `diubah ${tanggal(b.updatedAt)}`}
                      </span>
                      <Show when={!b.canEdit}>
                        <span class="petunjuk">Ditulis orang lain; tidak bisa Anda sunting.</span>
                      </Show>
                    </div>
                    <span class="lencana-status" attr:data-s={b.status === "published" ? "Berjalan" : "Menunggu"}>
                      {labelStatus[b.status]}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
