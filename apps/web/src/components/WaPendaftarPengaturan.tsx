import {
  DEFAULT_TRIAL_REPLY_TEMPLATE,
  renderTrialMessage,
  TRIAL_REPLY_TEMPLATE_MAX,
  TRIAL_WA_PLACEHOLDERS,
  unknownTrialPlaceholders,
  type TrialWaSettings,
} from "@ssb/shared";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import AreaField from "./AreaField";
import Field from "./Field";

const CONTOH = { wali: "Bu Sari", anak: "Rafi Pratama", kode: "TRL-AB12CD" };

/**
 * Pengaturan pesan WhatsApp (Fonnte) untuk pendaftar trial: konfirmasi ke orang tua dan pemberitahuan ke admin.
 * Token Fonnte diisi di bagian koneksi pada halaman yang sama. Bagian ini hanya menyimpan pengaturan; server belum mengirim pesan otomatis.
 * `muatUlang` dinaikkan halaman setiap token berubah supaya status token di sini ikut segar.
 */
export default function WaPendaftarPengaturan(props: { ssbName: string; muatUlang: number }) {
  const [tersimpan, setTersimpan] = createSignal<TrialWaSettings | null>(null);
  const [balas, setBalas] = createSignal(false);
  const [templat, setTemplat] = createSignal(DEFAULT_TRIAL_REPLY_TEMPLATE);
  const [kabari, setKabari] = createSignal(false);
  const [nomor, setNomor] = createSignal("");
  const [sibuk, setSibuk] = createSignal("");
  const [galat, setGalat] = createSignal("");
  const [salah, setSalah] = createSignal<Record<string, string>>({});
  const [info, setInfo] = createSignal("");

  const isi = (s: TrialWaSettings) => {
    setTersimpan(s);
    setBalas(s.replyEnabled);
    setTemplat(s.replyTemplate);
    setKabari(s.notifyEnabled);
    setNomor(s.notifyNumber ?? "");
  };

  createEffect(
    on(
      () => props.muatUlang,
      () => {
        api<TrialWaSettings>("/whatsapp/trial-settings")
          .then(isi)
          .catch((e) => setGalat(e instanceof ApiError ? e.message : "Pengaturan tidak bisa dimuat. Coba lagi."));
      },
    ),
  );

  const pratinjau = () => renderTrialMessage(templat().trim() || DEFAULT_TRIAL_REPLY_TEMPLATE, { ...CONTOH, ssb: props.ssbName });
  const asing = () => unknownTrialPlaceholders(templat());
  const adaToken = () => tersimpan()?.hasToken ?? false;
  const tambah = (k: string) => setTemplat((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}{${k}}`);

  const jalankan = async (kunci: string, kerja: () => Promise<void>) => {
    setGalat("");
    setSalah({});
    setInfo("");
    setSibuk(kunci);
    try {
      await kerja();
    } catch (e) {
      if (e instanceof ApiError) {
        setGalat(e.message);
        setSalah(e.fields);
      } else setGalat("Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk("");
    }
  };

  const simpan = (e: SubmitEvent) => {
    e.preventDefault();
    return jalankan("simpan", async () => {
      isi(
        await api<TrialWaSettings>("/whatsapp/trial-settings", {
          method: "PUT",
          body: { replyEnabled: balas(), replyTemplate: templat(), notifyEnabled: kabari(), notifyNumber: nomor() },
        }),
      );
      setInfo("Pengaturan disimpan.");
    });
  };

  const uji = () =>
    jalankan("uji", async () => {
      await api("/whatsapp/test", { method: "POST", body: { number: nomor().trim(), message: pratinjau() } });
      setInfo(`Pesan uji terkirim ke ${nomor()}.`);
    });

  return (
    <section class="master" aria-label="Pesan untuk pendaftar trial">
      <h2>Pesan untuk pendaftar trial</h2>
      <p class="petunjuk">
        Pesan WhatsApp lewat Fonnte untuk anak yang mendaftar trial dari landing page.
        <Show when={tersimpan()}>
          <strong>{adaToken() ? " Token Fonnte sudah tersimpan." : " Token Fonnte belum diisi: isi dulu di bagian Koneksi Fonnte di atas."}</strong>
        </Show>
      </p>
      <div class="info" role="note">
        Pengaturan ini baru disimpan. Pengiriman otomatis ke pendaftar baru belum dijalankan oleh sistem, jadi belum ada pesan yang terkirim.
      </div>
      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>
      <Show when={info()}>
        <div class="info" role="status">
          {info()}
        </div>
      </Show>
      <Show when={tersimpan()} fallback={<p class="kosong">Memuat…</p>}>
        <form class="form" onSubmit={simpan}>
          <h3>Konfirmasi ke orang tua</h3>
          <label class="centang">
            <input type="checkbox" checked={balas()} disabled={!adaToken() && !balas()} onChange={(e) => setBalas(e.currentTarget.checked)} />
            <span>Kirim pesan konfirmasi ke orang tua saat anak mendaftar trial</span>
          </label>
          <AreaField
            id="templat-trial"
            label="Isi pesan"
            value={templat()}
            onInput={setTemplat}
            rows={5}
            maxlength={TRIAL_REPLY_TEMPLATE_MAX}
            error={salah().replyTemplate}
            hint="Klik kata di bawah untuk menyisipkannya; kata diisi otomatis dari data pendaftar."
          />
          <p class="aksi-baris">
            <For each={TRIAL_WA_PLACEHOLDERS}>
              {(p) => (
                <button class="tombol tipis tombol-kecil" type="button" title={p.desc} onClick={() => tambah(p.key)}>
                  {`{${p.key}}`}
                </button>
              )}
            </For>
            <button class="tombol tipis tombol-kecil" type="button" onClick={() => setTemplat(DEFAULT_TRIAL_REPLY_TEMPLATE)}>
              Kembalikan bawaan
            </button>
          </p>
          <Show when={asing().length > 0}>
            <div class="peringatan" role="alert">
              Kata tidak dikenal akan terkirim apa adanya: {asing().map((k) => `{${k}}`).join(", ")}.
            </div>
          </Show>
          <div class="pratinjau-wa" role="note" aria-label="Pratinjau pesan">
            <span class="petunjuk">Pratinjau (contoh data)</span>
            <p>{pratinjau()}</p>
          </div>

          <h3>Pemberitahuan ke admin</h3>
          <label class="centang">
            <input type="checkbox" checked={kabari()} disabled={!adaToken() && !kabari()} onChange={(e) => setKabari(e.currentTarget.checked)} />
            <span>Kabari admin lewat WhatsApp saat ada pendaftar trial baru</span>
          </label>
          <Field
            id="nomor-admin-trial"
            label="Nomor WhatsApp admin"
            type="tel"
            inputmode="tel"
            placeholder="081234567890"
            value={nomor()}
            onInput={setNomor}
            error={salah().notifyNumber}
            hint="Nomor penerima pemberitahuan; boleh format 08… atau 62…."
          />
          <div class="aksi-baris">
            <button class="tombol utama" type="submit" disabled={sibuk() !== ""}>
              {sibuk() === "simpan" ? "Menyimpan…" : "Simpan pengaturan"}
            </button>
            <button class="tombol tipis" type="button" disabled={sibuk() !== "" || !adaToken() || !nomor().trim()} onClick={uji}>
              {sibuk() === "uji" ? "Mengirim…" : "Kirim pesan uji ke nomor admin"}
            </button>
          </div>
          <p class="petunjuk">Pesan uji berisi pratinjau di atas dan langsung terkirim ke nomor admin.</p>
        </form>
      </Show>
    </section>
  );
}
