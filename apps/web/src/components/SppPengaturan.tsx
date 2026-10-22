import { createResource, createSignal, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import { TEMPLAT_PENGINGAT_AWAL, type FeeSettings } from "@ssb/shared";
import Field from "./Field";
import SelectField from "./SelectField";
import Kerangka from "~/components/Kerangka";

/**
 * Pengaturan SPP milik SSB: tanggal jatuh tempo bawaan, templat pesan pengingat,
 * info rekening tujuan pembayaran, dan jeda antar pengingat. Disimpan di server
 * sehingga semua admin SSB memakai nilai yang sama.
 */
export default function SppPengaturan() {
  const [pengaturan, { refetch: muat }] = createResource(async () => api<FeeSettings>("/fees/settings").catch(() => null));
  const [jatuhTempo, setJatuhTempo] = createSignal("10");
  const [templat, setTemplat] = createSignal(TEMPLAT_PENGINGAT_AWAL);
  const [rekening, setRekening] = createSignal("");
  const [jeda, setJeda] = createSignal("7");
  const [pesan, setPesan] = createSignal("");
  const [galat, setGalat] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  // Pengaturan yang tampil di form diisi sekali setelah data dimuat.
  const [terisi, setTerisi] = createSignal(false);

  const isi = (p: FeeSettings) => {
    if (terisi()) return;
    setJatuhTempo(String(p.dueDay));
    setTemplat(p.reminderTemplate);
    setRekening(p.bankInfo ?? "");
    setJeda(String(p.reminderIntervalDays));
    setTerisi(true);
  };

  const simpan = async (e: SubmitEvent) => {
    e.preventDefault();
    setGalat("");
    setPesan("");
    setSibuk(true);
    try {
      await api<FeeSettings>("/fees/settings", {
        method: "PUT",
        body: {
          dueDay: Number(jatuhTempo()),
          reminderTemplate: templat(),
          bankInfo: rekening().trim() || null,
          reminderIntervalDays: Number(jeda()),
        },
      });
      setPesan("Pengaturan SPP disimpan.");
      await muat();
    } catch (err) {
      setGalat(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <section class="master" aria-label="Pengaturan SPP">
      <h2>Pengaturan SPP</h2>
      <p class="petunjuk">
        Pengaturan ini berlaku untuk semua admin SSB. Tanggal jatuh tempo bawaan dipakai saat membuat tagihan tanpa memilih tanggal sendiri. Jeda pengingat
        menahan pengingat ulang untuk tagihan yang sama.
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
            <form class="form" onSubmit={simpan}>
              <SelectField
                id="due-day"
                label="Tanggal jatuh tempo bawaan"
                value={jatuhTempo()}
                onInput={setJatuhTempo}
                options={[1, 5, 10, 15, 20, 25, 28].map((d) => ({ value: String(d), label: `Tanggal ${d}` }))}
                hint="Dipakai saat membuat tagihan bulan baru."
              />
              <div class="field">
                <label for="templat-pesan">Isi pesan pengingat</label>
                <textarea id="templat-pesan" rows="4" maxlength="600" value={templat()} onInput={(e) => setTemplat(e.currentTarget.value)} />
                <span class="petunjuk">
                  Kata dalam kurung diisi otomatis: {"{wali}"} {"{anak}"} {"{bulan}"} {"{sisa}"} {"{status}"} {"{ssb}"}.
                </span>
                <Show when={templat() !== TEMPLAT_PENGINGAT_AWAL}>
                  <button class="tombol tipis tombol-kecil" type="button" onClick={() => setTemplat(TEMPLAT_PENGINGAT_AWAL)}>
                    Kembalikan pesan bawaan
                  </button>
                </Show>
              </div>
              <Field
                id="bank-info"
                label="Info rekening (boleh dikosongkan)"
                maxlength={300}
                value={rekening()}
                onInput={setRekening}
                hint="Ditampilkan kepada orang tua di halaman SPP, misalnya nama bank dan nomor rekening."
              />
              <SelectField
                id="reminder-interval"
                label="Jeda antar pengingat"
                value={jeda()}
                onInput={setJeda}
                options={[0, 3, 7, 14, 30].map((d) => ({
                  value: String(d),
                  label: d === 0 ? "Tidak ada jeda (boleh setiap hari)" : `${d} hari`,
                }))}
                hint="Tagihan yang baru saja diingatkan ditandai, agar tidak diingatkan lagi terlalu cepat."
              />
              <button class="tombol utama" type="submit" disabled={sibuk()}>
                {sibuk() ? "Menyimpan…" : "Simpan pengaturan"}
              </button>
            </form>
          );
        }}
      </Show>
    </section>
  );
}
