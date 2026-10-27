import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import { mailboxCreateSchema, type MailboxCredential, type MailboxList } from "@ssb/shared";
import Field from "~/components/Field";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe, type Me } from "~/lib/api";

type Yakin = { jenis: "hapus" | "reset"; nama: string };

export default function Email() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [data, setData] = createSignal<MailboxList | null>(null);
  const [gagalMuat, setGagalMuat] = createSignal(false);
  const [nama, setNama] = createSignal("");
  const [galatNama, setGalatNama] = createSignal<string | undefined>();
  const [galat, setGalat] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  const [yakin, setYakin] = createSignal<Yakin | null>(null);
  const [rahasia, setRahasia] = createSignal<MailboxCredential | null>(null);
  const [salin, setSalin] = createSignal("");

  const muat = async () => {
    try {
      setData(await api<MailboxList>("/mailboxes"));
      setGagalMuat(false);
    } catch {
      setGagalMuat(true);
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
    await muat();
  });

  const jalankan = async (kerja: () => Promise<void>) => {
    setGalat("");
    setGalatNama(undefined);
    setSibuk(true);
    try {
      await kerja();
      await muat();
    } catch (e) {
      if (e instanceof ApiError && e.fields.name) setGalatNama(e.fields.name);
      else setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  const tampilkan = (c: MailboxCredential) => {
    setSalin("");
    setRahasia(c);
  };

  const buat = (e: SubmitEvent) => {
    e.preventDefault();
    const cek = mailboxCreateSchema.safeParse({ name: nama().trim().toLowerCase() });
    if (!cek.success) {
      setGalatNama(cek.error.issues[0]?.message ?? "Nama tidak valid.");
      return;
    }
    const isi = cek.data;
    return jalankan(async () => {
      tampilkan(await api<MailboxCredential>("/mailboxes", { method: "POST", body: isi }));
      setNama("");
    });
  };

  const lakukan = (y: Yakin) => {
    setYakin(null);
    const nm = encodeURIComponent(y.nama);
    return jalankan(async () => {
      if (y.jenis === "hapus") {
        await api<void>(`/mailboxes/${nm}`, { method: "DELETE" });
        if (rahasia()?.address.startsWith(`${y.nama}@`)) setRahasia(null);
      } else {
        tampilkan(await api<MailboxCredential>(`/mailboxes/${nm}/password`, { method: "POST", body: {} }));
      }
    });
  };

  const salinSandi = async () => {
    try {
      await navigator.clipboard.writeText(rahasia()!.password);
      setSalin("Sandi disalin.");
    } catch {
      setSalin("Salin manual: pilih sandi di atas, lalu tekan Ctrl+C.");
    }
  };

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Email akademi · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Akademi"
          judul="Email akademi"
          sub="Kelola akun email untuk pengurus dan pelatih. Sandi hanya terlihat sekali saat dibuat atau direset."
        >
          <Show when={data()?.enabled}>
            <a class="tombol tipis" href={data()!.webmailUrl} target="_blank" rel="noopener noreferrer">
              Buka webmail
            </a>
          </Show>
        </KepalaHalaman>

        <Show when={!data() && !gagalMuat()}>
          <Memuat />
        </Show>
        <Show when={gagalMuat()}>
          <p class="kosong">Daftar email tidak bisa dimuat. Muat ulang halaman ini.</p>
        </Show>
        <Show when={galat()}>
          <p class="pesan-salah" role="alert">
            {galat()}
          </p>
        </Show>

        <Show when={data()}>
          {(d) => (
            <Show when={d().enabled} fallback={<p class="kosong">Pengelolaan email tidak aktif di server ini</p>}>
              <Show when={rahasia()}>
                {(r) => (
                  <section class="email-rahasia" role="status">
                    <p>
                      <strong>Akun siap dipakai</strong>
                    </p>
                    <p>
                      Alamat: <code>{r().address}</code>
                    </p>
                    <p>
                      Sandi: <code>{r().password}</code>
                    </p>
                    <p class="pesan-salah">Sandi hanya tampil sekali. Catat sekarang.</p>
                    <div class="aksi-baris">
                      <button class="tombol utama tombol-kecil" type="button" onClick={salinSandi}>
                        Salin sandi
                      </button>
                      <button class="tombol tipis tombol-kecil" type="button" onClick={() => setRahasia(null)}>
                        Tutup
                      </button>
                    </div>
                    <Show when={salin()}>
                      <p class="petunjuk">{salin()}</p>
                    </Show>
                  </section>
                )}
              </Show>

              <form class="form" onSubmit={buat} novalidate>
                <h2>Tambah akun</h2>
                <div class="email-nama">
                  <Field id="email-nama" label="Nama akun" required maxlength={64} autocomplete="off" value={nama()} onInput={setNama} error={galatNama()} />
                  <span class="email-domain">@{d().domain}</span>
                </div>
                <button class="tombol utama" type="submit" disabled={sibuk()}>
                  {sibuk() ? "Memproses…" : "Buat akun"}
                </button>
              </form>

              <Show when={d().accounts.length > 0} fallback={<p class="kosong">Belum ada akun email.</p>}>
                <ul class="anggota-daftar">
                  <For each={d().accounts}>
                    {(a) => (
                      <li>
                        <div class="anggota-baris">
                          <div class="undangan-info">
                            <strong class="email-alamat">{a.address}</strong>
                          </div>
                        </div>
                        <div class="aksi-baris">
                          <Show when={a.canReset}>
                            <button
                              class="tombol tipis tombol-kecil"
                              type="button"
                              disabled={sibuk()}
                              onClick={() => setYakin({ jenis: "reset", nama: a.name })}
                            >
                              Reset sandi
                            </button>
                          </Show>
                          <Show when={a.canDelete}>
                            <button
                              class="tombol tipis tombol-kecil bahaya"
                              type="button"
                              disabled={sibuk()}
                              onClick={() => setYakin({ jenis: "hapus", nama: a.name })}
                            >
                              Hapus
                            </button>
                          </Show>
                        </div>
                        <Show when={yakin()?.nama === a.name ? yakin() : null}>
                          {(y) => (
                            <span class="anggota-yakin" role="alert">
                              {y().jenis === "hapus"
                                ? `Hapus ${a.address} beserta semua suratnya? Tidak bisa dibatalkan.`
                                : `Reset sandi ${a.address}? Sandi lama tidak berlaku lagi.`}
                              <button class="tombol bahaya tombol-kecil" type="button" disabled={sibuk()} onClick={() => lakukan(y())}>
                                {y().jenis === "hapus" ? "Ya, hapus" : "Ya, reset"}
                              </button>
                              <button class="tombol tipis tombol-kecil" type="button" onClick={() => setYakin(null)}>
                                Batal
                              </button>
                            </span>
                          )}
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          )}
        </Show>
      </main>
    </Show>
  );
}
