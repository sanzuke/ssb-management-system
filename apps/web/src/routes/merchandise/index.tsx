import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show, For } from "solid-js";
import { merchandiseCategories, merchandiseCategoryLabel, type MerchandiseCategory, type MerchandiseOrderRow, type MerchandiseProductRow } from "@ssb/shared";
import KepalaHalaman from "~/components/KepalaHalaman";
import { api, ApiError, getMe } from "~/lib/api";

const formatRupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const statusLabel: Record<string, string> = {
  pending: "Menunggu pembayaran",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};
const statusBadge: Record<string, string> = {
  pending: "peringatan",
  processing: "tombol",
  shipped: "tombol utama",
  completed: "berhasil",
  cancelled: "bahaya",
};

export default function Merchandise() {
  const nav = useNavigate();
  const [kategori, setKategori] = createSignal<"" | MerchandiseCategory>("");
  const tampilProduk = () => produk().filter((p) => !kategori() || p.category === kategori());
  const [me, setMe] = createSignal<{ active: { role: string } | null } | null>(null);
  const [produk, setProduk] = createSignal<MerchandiseProductRow[]>([]);
  const [pesanan, setPesanan] = createSignal<MerchandiseOrderRow[]>([]);
  const [tab, setTab] = createSignal<"produk" | "pesanan">("produk");
  const [error, setError] = createSignal("");

  const admin = () => me()?.active?.role === "admin_ssb";

  const hapusProduk = async (id: string) => {
    if (!confirm("Hapus produk ini? Pesanan yang sudah terjadi akan tetap tersimpan.")) return;
    try {
      await api(`/merchandise/${encodeURIComponent(id)}`, { method: "DELETE" });
      await muat();
    } catch (e) {
      setError(e instanceof ApiError ? (e.message as string) : "Gagal menghapus produk.");
    }
  };

  const muat = async () => {
    try {
      const [p, o] = await Promise.all([
        api<MerchandiseProductRow[]>("/merchandise").catch(() => [] as MerchandiseProductRow[]),
        api<MerchandiseOrderRow[]>("/merchandise/orders").catch(() => [] as MerchandiseOrderRow[]),
      ]);
      setProduk(p);
      setPesanan(o);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data merchandise.");
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    setMe(m);
    await muat();
  });

  return (
    <>
      <Title>Merchandise · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Merchandise" judul="Produk dan Pesanan">
          {/* biome-ignore lint/a11y/useSemanticElements: fieldset merusak tata letak tombol segmen */}
          <div class="segmen" role="group" aria-label="Bagian merchandise">
            <button type="button" aria-pressed={tab() === "produk"} onClick={() => setTab("produk")}>
              Produk
            </button>
            <button type="button" aria-pressed={tab() === "pesanan"} onClick={() => setTab("pesanan")}>
              Pesanan
            </button>
          </div>
        </KepalaHalaman>

        <Show when={error()}>
          <div class="peringatan" role="alert">
            {error()}
          </div>
        </Show>

        {/* Tabel produk */}
        <Show when={tab() === "produk"}>
          <section class="master">
            <div class="butir-aksi aksi-situs">
              <button class="tombol utama" type="button" onClick={() => nav("/merchandise/baru")}>
                Tambah produk
              </button>
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: pilihan saringan kategori */}
            <div class="tab-periode" role="group" aria-label="Saring kategori">
              <button type="button" aria-pressed={kategori() === ""} onClick={() => setKategori("")}>
                Semua <span class="hitung">{produk().length}</span>
              </button>
              <For each={merchandiseCategories}>
                {(c) => (
                  <button type="button" aria-pressed={kategori() === c.code} onClick={() => setKategori(c.code)}>
                    {c.label} <span class="hitung">{produk().filter((p) => p.category === c.code).length}</span>
                  </button>
                )}
              </For>
            </div>
            <table class="tabel">
              <thead>
                <tr>
                  <th>Nama produk</th>
                  <th>Kategori</th>
                  <th>Harga</th>
                  <th>Stok</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={tampilProduk().length > 0}
                  fallback={
                    <tr>
                      <td colSpan={6} class="kosong">
                        {kategori() ? "Belum ada produk di kategori ini." : "Belum ada produk merchandise. Tambahkan produk pertama."}
                      </td>
                    </tr>
                  }
                >
                  <For each={tampilProduk()}>
                    {(p) => (
                      <tr>
                        <td>{p.name}</td>
                        <td>{merchandiseCategoryLabel[p.category]}</td>
                        <td>{formatRupiah(p.price)}</td>
                        <td>{p.stock}</td>
                        <td>
                          <span class={`chip ${p.active ? "berhasil" : "peringatan"}`}>
                            {p.active ? "Aktif" : "Tidak aktif"}
                          </span>
                        </td>
                        <td>
                          <div class="aksi-tabel">
                            <button
                              class="tombol tipis"
                              type="button"
                              onClick={() => nav(`/merchandise/${p.id}`)}
                            >
                              Ubah
                            </button>
                            <button
                              class="tombol bahaya tipis"
                              type="button"
                              onClick={() => hapusProduk(p.id)}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </section>
        </Show>

        {/* Tabel pesanan */}
        <Show when={tab() === "pesanan"}>
          <section class="master">
            <table class="tabel">
              <thead>
                <tr>
                  <th>Pembeli</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Tanggal</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                <Show
                  when={pesanan().length > 0}
                  fallback={
                    <tr>
                      <td colSpan={5} class="kosong">Belum ada pesanan merchandise.</td>
                    </tr>
                  }
                >
                  <For each={pesanan()}>
                    {(o) => (
                      <tr>
                        <td>
                          <div>{o.buyerName}</div>
                          <div class="muted">{o.buyerWhatsapp}</div>
                        </td>
                        <td>{formatRupiah(o.total)}</td>
                        <td>
                          <span class={`chip ${statusBadge[o.status]}`}>
                            {statusLabel[o.status]}
                          </span>
                        </td>
                        <td>{new Date(o.createdAt).toLocaleDateString("id-ID")}</td>
                        <td>
                          <div class="aksi-tabel">
                            <button
                              class="tombol tipis"
                              type="button"
                              onClick={() => nav(`/merchandise/pesanan/${o.id}`)}
                            >
                              Detail
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </Show>
              </tbody>
            </table>
          </section>
        </Show>

        <Show when={!me() || !admin()}>
          <p class="kosong">Hanya admin SSB yang bisa mengelola produk merchandise.</p>
        </Show>
      </main>
    </>
  );
}
