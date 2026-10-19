import { A } from "@solidjs/router";
import { createResource, createSignal, For, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import { linkWa } from "~/lib/wa";
import { namaBulan, rupiah } from "~/lib/waktu";
import { tanggal } from "~/lib/pemain";
import type { ReminderRow } from "@ssb/shared";
import SelectField from "./SelectField";

const KUNCI_TEMPLAT = "spp-templat-pengingat";
const TEMPLAT_AWAL =
  "Yth. {wali}, kami dari {ssb} mengingatkan bahwa SPP {anak} bulan {bulan} sebesar {sisa} ({status}). Mohon pembayarannya diselesaikan. Bila sudah membayar, abaikan pesan ini. Terima kasih.";

const bacaTemplat = () => {
  try {
    return localStorage.getItem(KUNCI_TEMPLAT) || TEMPLAT_AWAL;
  } catch {
    return TEMPLAT_AWAL;
  }
};

/** Keterangan jatuh tempo: terlambat sekian hari, hari ini, atau sekian hari lagi. */
export const statusTempo = (hari: number) =>
  hari < 0 ? `terlambat ${-hari} hari` : hari === 0 ? "jatuh tempo hari ini" : hari === 1 ? "jatuh tempo besok" : `jatuh tempo ${hari} hari lagi`;

/** Mengisi {wali}, {anak}, {bulan}, {sisa}, {status}, dan {ssb} pada templat pesan. */
export const isiTemplat = (templat: string, r: ReminderRow, wali: string, ssb: string) =>
  templat
    .replaceAll("{wali}", wali)
    .replaceAll("{anak}", r.player.name)
    .replaceAll("{bulan}", namaBulan(r.month))
    .replaceAll("{sisa}", rupiah(r.remaining))
    .replaceAll("{status}", statusTempo(r.daysToDue))
    .replaceAll("{ssb}", ssb);

/** Pengingat tagihan SPP: daftar yang menunggak atau segera jatuh tempo, dengan tombol kirim WhatsApp ke wali. */
export default function SppPengingat(props: { ssbName: string }) {
  const [hari, setHari] = createSignal("3");
  const [templat, setTemplat] = createSignal(bacaTemplat());
  const [galat, setGalat] = createSignal("");
  const [rows, { refetch }] = createResource(hari, (d) => api<ReminderRow[]>(`/fees/reminders?days=${d}`).catch(() => [] as ReminderRow[]));

  const simpanTemplat = (v: string) => {
    setTemplat(v);
    try {
      localStorage.setItem(KUNCI_TEMPLAT, v);
    } catch {
      /* penyimpanan peramban tidak tersedia: templat berlaku sampai halaman ditutup */
    }
  };
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

  return (
    <section class="master" aria-label="Pengingat tagihan">
      <h2>Pengingat tagihan</h2>
      <p class="petunjuk">
        Daftar tagihan yang sudah lewat jatuh tempo atau segera jatuh tempo. Tombol WhatsApp membuka pesan yang sudah terisi; Anda tinggal menekan kirim.
        Pengingat otomatis tanpa menekan kirim belum tersedia.
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
          <textarea id="templat" rows="4" maxlength="600" value={templat()} onInput={(e) => simpanTemplat(e.currentTarget.value)} />
          <span class="petunjuk">
            Kata dalam kurung diisi otomatis: {"{wali}"} {"{anak}"} {"{bulan}"} {"{sisa}"} {"{status}"} {"{ssb}"}. Pesan Anda tersimpan di peramban ini.
          </span>
          <Show when={templat() !== TEMPLAT_AWAL}>
            <button class="tombol tipis tombol-kecil" type="button" onClick={() => simpanTemplat(TEMPLAT_AWAL)}>
              Kembalikan pesan bawaan
            </button>
          </Show>
        </div>
      </div>

      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>
      <Show when={rows()} fallback={<p>Memuat…</p>}>
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
                  <div class="aksi-baris">
                    <For each={r.guardians}>
                      {(w) => {
                        const href = () => linkWa(w.whatsapp, isiTemplat(templat(), r, w.name, props.ssbName));
                        return (
                          <Show
                            when={href()}
                            fallback={
                              <span class="petunjuk">
                                {w.name}: belum ada nomor WhatsApp (<A href={`/pemain/${r.player.id}`}>lihat profil</A>)
                              </span>
                            }
                          >
                            <a class="tombol utama tombol-kecil" href={href()!} target="_blank" rel="noopener noreferrer" onClick={() => catat(r)}>
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
