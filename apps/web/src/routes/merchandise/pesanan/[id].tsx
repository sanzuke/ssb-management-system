import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show, For } from "solid-js";
import type { Me, MerchandiseOrderRow, MerchandiseStatus } from "@ssb/shared";
import { merchandiseOrderStatusSchema } from "@ssb/shared";
import KepalaHalaman from "~/components/KepalaHalaman";
import Field from "~/components/Field";
import { api, ApiError, getMe } from "~/lib/api";

const formatRupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const statusLabel: Record<string, string> = {
  pending: "Menunggu pembayaran",
  processing: "Diproses",
  shipped: "Dikirim",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export default function PesananDetail() {
  const nav = useNavigate();
  const params = useParams();
  const id = params.id;
  const [me, setMe] = createSignal<Me | null>(null);
  const [pesanan, setPesanan] = createSignal<MerchandiseOrderRow | null>(null);
  const [status, setStatus] = createSignal<MerchandiseStatus>("pending");
  const [adminNote, setAdminNote] = createSignal("");
  const [error, setError] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);

  const admin = () => me()?.active?.role === "admin_ssb";

  const muat = async () => {
    if (!id) return;
    try {
      const p = await api<MerchandiseOrderRow>(`/merchandise/orders/${encodeURIComponent(id)}`);
      setPesanan(p);
      setStatus(p.status);
      setAdminNote(p.adminNote ?? "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat pesanan.");
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    setMe(m);
    await muat();
  });

  const simpan = async () => {
    setSibuk(true);
    setError("");
    try {
      await api<MerchandiseOrderRow>(`/merchandise/orders/${encodeURIComponent(id ?? "")}`, {
        method: "PATCH",
        body: merchandiseOrderStatusSchema.parse({ status, adminNote }),
      });
      nav("/merchandise?tab=pesanan", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? (e.message as string) : "Gagal menyimpan perubahan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <Title>Detail pesanan · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Merchandise" judul="Detail pesanan">
          <A class="tombol tipis" href="/merchandise?tab=pesanan">
            Kembali ke daftar pesanan
          </A>
        </KepalaHalaman>

        <Show when={error()}>
          <div class="peringatan" role="alert">
            {error()}
          </div>
        </Show>

        <Show when={me() && admin() && pesanan()}>
          <section class="master form">
            <div class="butir-aksi">
              <strong>Pembeli</strong>
              <p>{pesanan()!.buyerName}</p>
              <p class="petunjuk">{pesanan()!.buyerWhatsapp}</p>
            </div>
            <div class="butir-aksi">
              <strong>Alamat pengiriman</strong>
              <p>{pesanan()!.shippingAddress}</p>
            </div>
            <div class="butir-aksi">
              <strong>Total</strong>
              <p>{formatRupiah(pesanan()!.total)}</p>
            </div>
            <div class="master form">
              <label for="status-select">Status pesanan</label>
              <select id="status-select" class="input" value={status()} onChange={(e) => setStatus(e.currentTarget.value as MerchandiseStatus)}>
                {Object.entries(statusLabel).map(([k, l]) => (
                  <option value={k}>{l}</option>
                ))}
              </select>
            </div>
            <Field
              id="catatan-admin"
              label="Catatan admin"
              value={adminNote()}
              onInput={(v) => setAdminNote(v)}
              maxlength={300}
              hint="Catatan internal untuk tim admin, tidak tampil ke pembeli"
            />
            <div class="butir-aksi aksi-situs">
              <button class="tombol utama" type="button" disabled={sibuk()} onClick={simpan}>
                {sibuk() ? "Menyimpan…" : "Simpan perubahan"}
              </button>
            </div>

            <h2>Item pesanan</h2>
            <table class="tabel">
              <thead>
                <tr>
                  <th>Produk</th>
                  <th>Harga satuan</th>
                  <th>Qty</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                <For each={pesanan()!.items}>
                  {(it) => (
                    <tr>
                      <td>{it.productName}</td>
                      <td>{formatRupiah(it.unitPrice)}</td>
                      <td>{it.quantity}</td>
                      <td>{formatRupiah(it.unitPrice * it.quantity)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </section>
        </Show>

        <Show when={!me() || !admin() || !pesanan()}>
          <p class="kosong">Hanya admin SSB yang bisa mengelola pesanan merchandise.</p>
        </Show>
      </main>
    </>
  );
}
