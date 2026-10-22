import { createResource, createSignal, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import type { WhatsappSettings } from "@ssb/shared";
import Field from "./Field";
import Kerangka from "~/components/Kerangka";

type ProfilFonnte = { device: string; deviceStatus: string; name: string; quota: string; expired: string; package: string };

/**
 * Pengaturan pengiriman WhatsApp lewat Fonnte. Admin menempelkan token API
 * Fonnte satu kali; server menyimpannya terenkripsi dan tidak pernah
 * mengirimkannya kembali ke peramban.
 */
export default function WhatsappPengaturan() {
  const [pengaturan, { refetch: muat }] = createResource(async () => api<WhatsappSettings>("/whatsapp/settings").catch(() => null));
  const [token, setToken] = createSignal("");
  const [kodeNegara, setKodeNegara] = createSignal("62");
  const [otomatis, setOtomatis] = createSignal(false);
  const [terisi, setTerisi] = createSignal(false);
  const [nomorUji, setNomorUji] = createSignal("");
  const [pesanUji, setPesanUji] = createSignal("Halo, ini pesan uji dari SSB App.");
  const [pesan, setPesan] = createSignal("");
  const [galat, setGalat] = createSignal("");
  const [profil, setProfil] = createSignal<ProfilFonnte | null>(null);
  const [sibuk, setSibuk] = createSignal("");

  // Nilai form diisi sekali dari pengaturan yang tersimpan.
  const isi = (p: WhatsappSettings) => {
    if (terisi()) return;
    setKodeNegara(p.countryCode);
    setOtomatis(p.autoReminder);
    setTerisi(true);
  };

  const aksi = async (kunci: string, kerja: () => Promise<void>) => {
    setGalat("");
    setPesan("");
    setSibuk(kunci);
    try {
      await kerja();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setSibuk("");
    }
  };

  const simpan = (e: SubmitEvent) => {
    e.preventDefault();
    return aksi("simpan", async () => {
      await api<WhatsappSettings>("/whatsapp/settings", {
        method: "PUT",
        body: {
          token: token().trim() || undefined,
          countryCode: kodeNegara().trim(),
          autoReminder: otomatis(),
        },
      });
      setToken("");
      setPesan("Pengaturan WhatsApp disimpan.");
      await muat();
    });
  };

  const periksa = () =>
    aksi("periksa", async () => {
      const hasil = await api<ProfilFonnte>("/whatsapp/settings/check", { method: "POST" });
      setProfil(hasil);
      setPesan(`Token valid. Perangkat ${hasil.name || hasil.device} (${hasil.deviceStatus}), sisa kuota ${hasil.quota}.`);
    });

  const kirimUji = (e: SubmitEvent) => {
    e.preventDefault();
    return aksi("uji", async () => {
      await api("/whatsapp/test", { method: "POST", body: { number: nomorUji().trim(), message: pesanUji() } });
      setPesan(`Pesan uji terkirim ke ${nomorUji()}.`);
    });
  };

  return (
    <section class="master" aria-label="Pengaturan WhatsApp">
      <h2>Pengiriman WhatsApp (Fonnte)</h2>
      <p class="petunjuk">
        Tempelkan token API Fonnte di bawah, lalu tekan Periksa Token. Token disimpan terenkripsi di server dan tidak pernah dikembalikan ke peramban. Setelah
        token aktif, tombol kirim di tab Pengingat bisa mengirim pesan tanpa perlu menekan kirim di WhatsApp.
      </p>
      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>
      <Show when={pesan()}>
        <div class="info" role="status">
          {pesan()}
        </div>
      </Show>
      <Show when={pengaturan()} fallback={<Kerangka />}>
        {(p) => {
          isi(p());
          return (
            <>
              <form class="form" onSubmit={simpan}>
                <Field
                  id="token-fonnte"
                  label="Token API Fonnte"
                  type="password"
                  value={token()}
                  onInput={setToken}
                  maxlength={200}
                  required={!p().hasToken}
                  hint={
                    p().hasToken
                      ? "Token sudah tersimpan di server. Isi lagi hanya bila ingin mengganti."
                      : "Token diambil dari Fonnte: Device > device Anda > Edit > Token. Jangan dibagikan."
                  }
                />
                <Field
                  id="kode-negara"
                  label="Kode negara"
                  value={kodeNegara()}
                  onInput={setKodeNegara}
                  maxlength={4}
                  inputmode="numeric"
                  hint="62 untuk Indonesia. Dipakai saat awalan 0 pada nomor wali diganti."
                />
                <label class="centang">
                  <input type="checkbox" checked={otomatis()} onChange={(e) => setOtomatis(e.currentTarget.checked)} />
                  <span>Kirim pengingat tagihan otomatis tanpa perlu menekan tombol kirim</span>
                </label>
                <div class="aksi-baris">
                  <button class="tombol utama" type="submit" disabled={sibuk() !== ""}>
                    {sibuk() === "simpan" ? "Menyimpan…" : "Simpan pengaturan"}
                  </button>
                  <button class="tombol tipis" type="button" disabled={sibuk() !== "" || !p().hasToken} onClick={periksa}>
                    {sibuk() === "periksa" ? "Memeriksa…" : "Periksa token"}
                  </button>
                </div>
              </form>

              <Show when={profil()}>
                {(pf) => (
                  <ul class="spp-daftar">
                    <li>
                      <div class="spp-baris">
                        <div class="undangan-info">
                          <strong>{pf().name || pf().device}</strong>
                          <span class="petunjuk">
                            {pf().device} • {pf().package} • berlaku sampai {pf().expired}
                          </span>
                        </div>
                        <span class="status-undangan" data-status={pf().deviceStatus === "connect" ? "diterima" : "kedaluwarsa"}>
                          {pf().deviceStatus === "connect" ? "Terhubung" : "Putus"}
                        </span>
                      </div>
                      <span class="petunjuk">Sisa kuota: {pf().quota} pesan</span>
                    </li>
                  </ul>
                )}
              </Show>

              <details class="master spp-tarif">
                <summary>Kirim pesan uji</summary>
                <p class="petunjuk">Pastikan nomor tujuan benar; pesan uji langsung terkirim ke nomor itu.</p>
                <form class="form" onSubmit={kirimUji}>
                  <Field
                    id="nomor-uji"
                    label="Nomor tujuan"
                    type="tel"
                    inputmode="tel"
                    required
                    value={nomorUji()}
                    onInput={setNomorUji}
                    placeholder="081234567890"
                  />
                  <Field id="pesan-uji" label="Isi pesan" required value={pesanUji()} onInput={setPesanUji} maxlength={1000} />
                  <button class="tombol utama" type="submit" disabled={sibuk() !== "" || !p().hasToken}>
                    {sibuk() === "uji" ? "Mengirim…" : "Kirim pesan uji"}
                  </button>
                </form>
              </details>
            </>
          );
        }}
      </Show>
    </section>
  );
}
