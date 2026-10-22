import { A } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import { linkWa } from "~/lib/wa";
import { namaBulan, rupiah } from "~/lib/waktu";
import { tanggal } from "~/lib/pemain";
import { isiTemplat, statusTempo, type FeeSettings, type ReminderRow, type WhatsappSettings } from "@ssb/shared";
import SelectField from "./SelectField";
import Kerangka from "~/components/Kerangka";

/** Pengingat tagihan SPP: daftar yang menunggak atau segera jatuh tempo, dengan tombol kirim WhatsApp ke wali. */
export default function SppPengingat(props: { ssbName: string }) {
  const [hari, setHari] = createSignal("3");
  const [galat, setGalat] = createSignal("");
  const [pesan, setPesan] = createSignal("");
  const [sibuk, setSibuk] = createSignal<string | null>(null);
  const [rows, { refetch }] = createResource(hari, (d) => api<ReminderRow[]>(`/fees/reminders?days=${d}`).catch(() => [] as ReminderRow[]));
  // Templat pesan diambil dari pengaturan SPP di server, jadi sama untuk semua admin.
  const [pengaturan] = createResource(async () => api<FeeSettings>("/fees/settings").catch(() => null));
  // Status Fonnte: token sudah tersimpan berarti pesan bisa dikirim dari server.
  const [wa] = createResource(async () => api<WhatsappSettings>("/whatsapp/settings").catch(() => null));
  const templat = () => pengaturan()?.reminderTemplate ?? "";

  // Dicatat saat tombol ditekan (WhatsApp terbuka di tab baru); admin yang menekan kirim di WhatsApp.
  const catat = async (r: ReminderRow) => {
    setGalat("");
    try {
      await api(`/invoices/${r.id}/reminded`, { method: "POST" });
      await refetch();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Pengingat terkirim, tetapi gagal dicatat. Coba muat ulang.");
    }
  };

  // Kirim langsung lewat Fonnte; server mengirim ke semua wali yang punya nomor.
  const kirimOtomatis = async (r: ReminderRow) => {
    setGalat("");
    setPesan("");
    setSibuk(r.id);
    try {
      const hasil = await api<{ terkirim: number; gagal: number; rincian: { wali: string; ok: boolean; reason: string | null }[] }>(
        `/invoices/${r.id}/remind`,
        { method: "POST" },
      );
      const gagal = hasil.rincian.filter((x) => !x.ok).map((x) => `${x.wali}: ${x.reason ?? "gagal"}`);
      setPesan(`Pengingat untuk ${r.player.name} dikirim ke ${hasil.terkirim} wali${hasil.gagal > 0 ? `, ${hasil.gagal} gagal (${gagal.join("; ")})` : ""}.`);
      await refetch();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa menghubungi server. Coba lagi.");
    } finally {
      setSibuk(null);
    }
  };

  return (
    <section class="master" aria-label="Pengingat tagihan">
      <h2>Pengingat tagihan</h2>
      <p class="petunjuk">
        Daftar tagihan yang sudah lewat jatuh tempo atau segera jatuh tempo. Tombol WhatsApp membuka pesan yang sudah terisi; Anda tinggal menekan kirim. Bila
        token Fonnte sudah diisi, tombol <strong>Kirim otomatis</strong> mengirim pesan langsung dari server tanpa perlu membuka WhatsApp.
      </p>
      <div class="pengingat-atur">
        <SelectField
          id="rentang"
          label="Tampilkan"
          value={hari()}
          onInput={setHari}
          options={[
            { value: "0", label: "Yang sudah menunggak saja" },
            { value: "3", label: "Menunggak dan jatuh tempo 3 hari lagi" },
            { value: "7", label: "Menunggak dan jatuh tempo 7 hari lagi" },
          ]}
        />
        <div class="field">
          <label for="templat">Isi pesan</label>
          <textarea id="templat" rows="4" maxlength="600" value={templat()} readOnly />
          <span class="petunjuk">
            Kata dalam kurung diisi otomatis: {"{wali}"} {"{anak}"} {"{bulan}"} {"{sisa}"} {"{status}"} {"{ssb}"}. Isi pesan diubah di tab{" "}
            <A href="/spp?tab=pengaturan">Pengaturan</A>.
          </span>
        </div>
      </div>

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
      <Show when={rows()} fallback={<Kerangka />}>
        <Show when={(rows() ?? []).length > 0} fallback={<p class="kosong">Tidak ada tagihan yang perlu diingatkan. Semua yang jatuh tempo sudah lunas.</p>}>
          <ul class="spp-daftar">
            <For each={rows()}>
              {(r) => (
                <li>
                  <div class="spp-baris">
                    <div class="undangan-info">
                      <strong>{r.player.name}</strong>
                      <span class="petunjuk">
                        SPP {namaBulan(r.month)} • {r.player.ageGroup ?? "Tanpa KU"} • jatuh tempo {tanggal(r.dueOn)}
                      </span>
                    </div>
                    <div class="spp-angka">
                      <strong>{rupiah(r.remaining)}</strong>
                    </div>
                    <span class="status-undangan" data-status={r.daysToDue < 0 ? "kedaluwarsa" : undefined}>
                      {statusTempo(r.daysToDue)}
                    </span>
                  </div>
                  <Show when={r.reminderCount > 0}>
                    <span class="petunjuk">
                      Sudah diingatkan {r.reminderCount} kali, terakhir {tanggal(r.lastRemindedAt!)}
                    </span>
                  </Show>
                  <Show when={r.dalamJeda}>
                    <span class="petunjuk">Masih dalam jeda pengingat: {r.sisaJedaHari} hari lagi boleh diingatkan.</span>
                  </Show>
                  <div class="aksi-baris">
                    <Show when={wa()?.hasToken}>
                      <button class="tombol utama tombol-kecil" type="button" disabled={sibuk() === r.id} onClick={() => kirimOtomatis(r)}>
                        {sibuk() === r.id ? "Mengirim…" : "Kirim otomatis"}
                      </button>
                    </Show>
                    <For each={r.guardians}>
                      {(w) => {
                        const href = () =>
                          linkWa(
                            w.whatsapp,
                            isiTemplat(templat(), {
                              wali: w.name,
                              anak: r.player.name,
                              bulan: r.month,
                              sisa: r.remaining,
                              hari: r.daysToDue,
                              ssb: props.ssbName,
                            }),
                          );
                        return (
                          <Show
                            when={href()}
                            fallback={
                              <span class="petunjuk">
                                {w.name}: belum ada nomor WhatsApp (<A href={`/pemain/${r.player.id}`}>lihat profil</A>)
                              </span>
                            }
                          >
                            <a class="tombol tipis tombol-kecil" href={href()!} target="_blank" rel="noopener noreferrer" onClick={() => catat(r)}>
                              Kirim ke {w.name}
                              {w.relationship ? ` (${w.relationship})` : ""}
                            </a>
                          </Show>
                        );
                      }}
                    </For>
                    <Show when={r.guardians.length === 0}>
                      <span class="petunjuk">
                        Belum ada orang tua yang terhubung. <A href={`/pemain/${r.player.id}`}>Hubungkan di profil</A>
                      </span>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
