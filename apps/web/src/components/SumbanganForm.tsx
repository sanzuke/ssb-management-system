import { createSignal, Show } from "solid-js";
import AreaField from "~/components/AreaField";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api, ApiError } from "~/lib/api";
import { angka, labelJenis } from "~/lib/donasi";
import { createSubmit } from "~/lib/form";
import { hariIni } from "~/lib/waktu";
import type { FundraisingPledgeRow } from "@ssb/shared";

/**
 * Formulir sumbangan. Anggota: nominal, jenis, pesan, anonim; hasilnya menunggu konfirmasi admin.
 * Admin (`catat`): mencatat sumbangan atau sponsor di luar aplikasi dengan nama donatur dan tanggal terima; langsung diterima.
 */
export default function SumbanganForm(p: { campaignId: string; catat?: boolean; onSaved: () => void; onCancel?: () => void }) {
  // Halaman admin menampilkan kedua bentuk sekaligus, jadi id kolom harus berbeda agar label tidak menunjuk kolom form lain.
  const id = (nama: string) => `${p.catat ? "ct" : "sb"}-${nama}`;
  const [kind, setKind] = createSignal<string>("donasi");
  const [amount, setAmount] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [isAnonymous, setIsAnonymous] = createSignal(false);
  const [donorName, setDonorName] = createSignal("");
  const [donorWhatsapp, setDonorWhatsapp] = createSignal("");
  const [receivedOn, setReceivedOn] = createSignal(hariIni());
  const [adminNote, setAdminNote] = createSignal("");

  const form = createSubmit(async () => {
    const nominal = angka(amount());
    if (nominal === undefined) throw new ApiError(400, "validation", "Periksa kembali isian Anda.", { amount: "isi nominal dalam rupiah" });
    const dasar = { kind: kind(), amount: nominal, message: message(), isAnonymous: isAnonymous() };
    await api<FundraisingPledgeRow>(
      p.catat ? `/fundraising/${p.campaignId}/donations` : `/fundraising/${p.campaignId}/pledges`,
      { method: "POST", body: p.catat ? { ...dasar, donorName: donorName(), donorWhatsapp: donorWhatsapp(), receivedOn: receivedOn(), adminNote: adminNote() } : dasar },
    );
    setAmount("");
    setMessage("");
    setIsAnonymous(false);
    setDonorName("");
    setDonorWhatsapp("");
    setAdminNote("");
    p.onSaved();
  });

  return (
    <form class="form" onSubmit={form.submit}>
      <Show when={form.error()}>
        <div class="peringatan" role="alert">
          {form.error()}
        </div>
      </Show>
      <Show when={p.catat}>
        <Field id={id("nama")} label="Nama donatur atau sponsor" required maxlength={120} value={donorName()} onInput={setDonorName} error={form.fields().donorName} />
        <Field id={id("wa")} label="WhatsApp (boleh dikosongkan)" type="tel" inputmode="tel" value={donorWhatsapp()} onInput={setDonorWhatsapp} error={form.fields().donorWhatsapp} />
      </Show>
      <SelectField
        id={id("jenis")}
        label="Jenis"
        value={kind()}
        onInput={setKind}
        options={Object.entries(labelJenis).map(([value, label]) => ({ value, label }))}
        hint="Pilih Sponsor bila menyumbang sebagai perusahaan atau pendukung utama kegiatan."
        error={form.fields().kind}
      />
      <Field id={id("nominal")} label="Nominal, rupiah" type="number" inputmode="numeric" required value={amount()} onInput={setAmount} error={form.fields().amount} />
      <Show when={p.catat}>
        <Field id={id("tgl")} label="Tanggal diterima" type="date" required value={receivedOn()} onInput={setReceivedOn} error={form.fields().receivedOn} />
      </Show>
      <AreaField id={id("pesan")} label="Pesan (boleh dikosongkan)" rows={2} maxlength={300} value={message()} onInput={setMessage} error={form.fields().message} />
      <label class="centang">
        <input type="checkbox" checked={isAnonymous()} onChange={(e) => setIsAnonymous(e.currentTarget.checked)} />
        Sembunyikan nama dari anggota lain dan landing page
      </label>
      <Show when={p.catat}>
        <Field id={id("catatan")} label="Catatan admin (boleh dikosongkan)" maxlength={300} value={adminNote()} onInput={setAdminNote} error={form.fields().adminNote} />
      </Show>
      <div class="butir-aksi">
        <button class="tombol utama" type="submit" disabled={form.busy()}>
          {form.busy() ? "Menyimpan…" : p.catat ? "Catat sumbangan" : "Kirim sumbangan"}
        </button>
        <Show when={p.onCancel}>
          <button class="tombol" type="button" onClick={p.onCancel}>
            Batal
          </button>
        </Show>
      </div>
    </form>
  );
}
