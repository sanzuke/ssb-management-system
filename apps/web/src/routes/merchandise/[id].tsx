import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import type { Me, MerchandiseProductRow } from "@ssb/shared";
import { merchandiseProductInputSchema, type MerchandiseProductInput } from "@ssb/shared";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import Field from "~/components/Field";
import { api, ApiError, getMe } from "~/lib/api";

export default function MerchandiseProduk() {
  const nav = useNavigate();
  const params = useParams();
  const id = params.id;
  const [me, setMe] = createSignal<Me | null>(null);
  const [produk, setProduk] = createSignal<MerchandiseProductRow | null>(null);
  const [baru, setBaru] = createSignal(true);
  const [values, setValues] = createSignal<MerchandiseProductInput>({
    name: "",
    description: "",
    price: 0,
    hpp: 0,
    stock: 0,
    imageFileKey: null,
    active: true,
  });
  const [error, setError] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  const [fotoUrl, setFotoUrl] = createSignal<string | null>(null);

  const admin = () => me()?.active?.role === "admin_ssb";

  const hapusProduk = async () => {
    if (!confirm("Hapus produk ini? Pesanan yang sudah terjadi akan tetap tersimpan.")) return;
    setSibuk(true);
    try {
      await api(`/merchandise/${encodeURIComponent(id ?? "")}`, { method: "DELETE" });
      nav("/merchandise", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? (e.message as string) : "Gagal menghapus produk.");
    } finally {
      setSibuk(false);
    }
  };

  const muat = async () => {
    if (!id || id === "baru") {
      setBaru(true);
      return;
    }
    try {
      const p = await api<MerchandiseProductRow>(`/merchandise/${encodeURIComponent(id)}`);
      setProduk(p);
      setBaru(false);
      setValues({
        name: p.name,
        description: p.description,
        price: p.price,
        hpp: p.hpp,
        stock: p.stock,
        imageFileKey: p.imageFileKey,
        active: p.active,
      });
      setFotoUrl(p.imageFileKey ? `/api/public/site/${me()?.active?.ssbId ?? ""}/media/${p.imageFileKey}` : null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat produk.");
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    setMe(m);
    await muat();
  });

  const isi = (k: keyof MerchandiseProductInput, v: unknown) => {
    setValues((x) => ({ ...x, [k]: v }));
  };

  const simpan = async () => {
    setSibuk(true);
    setError("");
    try {
      const v = merchandiseProductInputSchema.safeParse(values());
      if (!v.success) {
        setError("Periksa kembali isian Anda.");
        return;
      }
      if (baru()) {
        await api<MerchandiseProductRow>("/merchandise", { method: "POST", body: v.data });
      } else {
        await api<MerchandiseProductRow>(`/merchandise/${encodeURIComponent(id ?? "")}`, {
          method: "PUT",
          body: v.data,
        });
      }
      nav("/merchandise", { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? (e.message as string) : "Gagal menyimpan produk.");
    } finally {
      setSibuk(false);
    }
  };

  const unggahFoto = async (file: File) => {
    setSibuk(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/merchandise/${encodeURIComponent(id ?? "")}/foto`, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, "error", data?.error?.message ?? "Gagal unggah foto.");
      const p = data as MerchandiseProductRow;
      setProduk(p);
      setValues((x) => ({ ...x, imageFileKey: p.imageFileKey }));
      setFotoUrl(p.imageFileKey ? `/api/public/site/${me()?.active?.ssbId ?? ""}/media/${p.imageFileKey}` : null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.message as string) : "Gagal mengunggah foto.");
    } finally {
      setSibuk(false);
    }
  };

  const pilihFoto = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    await unggahFoto(file);
  };

  return (
    <>
      <Title>{baru() ? "Tambah produk · SSB App" : "Ubah produk · SSB App"}</Title>
      <main class="halaman lebar">
        <KepalaHalaman chip="Merchandise" judul={baru() ? "Tambah produk" : "Ubah produk"}>
          <A class="tombol tipis" href="/merchandise">
            Kembali ke daftar
          </A>
        </KepalaHalaman>

        <Show when={error()}>
          <div class="peringatan" role="alert">
            {error()}
          </div>
        </Show>

        <Show when={me() && admin() && (!baru() || sibuk() === false)}>
          <section class="master form">
            <Field
              id="nama"
              label="Nama produk"
              value={values().name}
              onInput={(v) => isi("name", v)}
              required
              maxlength={100}
              hint="Contoh: Jersi Liga KU-10, Tas olahraga SSB"
            />
            <Field
              id="deskripsi"
              label="Deskripsi"
              value={values().description ?? ""}
              onInput={(v) => isi("description", v)}
              maxlength={500}
              hint="Deskripsi singkat produk yang akan tampil di halaman pembelian"
            />
            <Field
              id="harga"
              label="Harga (rupiah)"
              value={String(values().price ?? 0)}
              type="number"
              onInput={(v) => isi("price", Number.parseInt(v, 10) || 0)}
              required
              hint="Contoh: 150000"
            />
            <Field
              id="hpp"
              label="Harga beli (HPP)"
              value={String(values().hpp ?? 0)}
              type="number"
              onInput={(v) => isi("hpp", Number.parseInt(v, 10) || 0)}
              required
              hint="Harga beli dari vendor untuk perhitungan margin"
            />
            <Field
              id="stok"
              label="Stok"
              value={String(values().stock ?? 0)}
              type="number"
              onInput={(v) => isi("stock", Number.parseInt(v, 10) || 0)}
              required
              hint="0 berarti produk habis dijual"
            />
            <div class="master form">
              <span id="label-foto" class="petunjuk">
                Foto produk
              </span>
              <div class="butir-aksi">
                <button
                  class="tombol tipis"
                  type="button"
                  disabled={sibuk() || !id || id === "baru"}
                  onClick={(e) => (e.currentTarget as HTMLInputElement).click()}
                  aria-labelledby="label-foto"
                >
                  {sibuk() ? "Mengunggah…" : fotoUrl() ? "Ganti foto" : "Unggah foto"}
                </button>
                <input
                  ref={(el) => {
                    if (el) el.addEventListener("change", pilihFoto);
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                />
                <span class="petunjuk">JPG, PNG, atau WebP, maksimal 2 MB.</span>
                {fotoUrl() && (
                  <div class="foto-produk">
                    <img src={fotoUrl() ?? ""} alt="Foto produk" class="pratinjau-foto" />
                  </div>
                )}
              </div>
            </div>
            <div class="butir-aksi">
              <label class="centang">
                <input type="checkbox" checked={values().active} onChange={(e) => isi("active", e.currentTarget.checked)} />
                Produk aktif (dapat dipesan pembeli)
              </label>
            </div>
            <div class="butir-aksi aksi-situs">
              <button class="tombol" type="button" disabled={sibuk()} onClick={simpan}>
                {sibuk() ? "Menyimpan…" : baru() ? "Simpan produk" : "Simpan perubahan"}
              </button>
              {!baru() && (
                <button class="tombol bahaya tipis" type="button" onClick={hapusProduk}>
                  Hapus produk
                </button>
              )}
            </div>
          </section>
        </Show>

        <Show when={!me() || !admin()}>
          <p class="kosong">Hanya admin SSB yang bisa mengelola produk merchandise.</p>
        </Show>
      </main>
    </>
  );
}
