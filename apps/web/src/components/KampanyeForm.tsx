import { createSignal, Show } from "solid-js";
import AreaField from "~/components/AreaField";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api } from "~/lib/api";
import { angka, labelKampanye } from "~/lib/donasi";
import { createSubmit } from "~/lib/form";
import type { CalendarEventRow, FundraisingCampaignRow } from "@ssb/shared";

/** Formulir kampanye donasi. Hanya kampanye aktif yang menerima sumbangan; draf tidak tampil di landing. */
export default function KampanyeForm(p: { initial?: FundraisingCampaignRow; events: CalendarEventRow[]; onSaved: (saved: FundraisingCampaignRow) => void; onCancel: () => void }) {
  const i = p.initial;
  const [title, setTitle] = createSignal(i?.title ?? "");
  const [description, setDescription] = createSignal(i?.description ?? "");
  const [eventId, setEventId] = createSignal(i?.event?.id ?? "");
  const [target, setTarget] = createSignal(i?.targetAmount ? String(i.targetAmount) : "");
  const [deadline, setDeadline] = createSignal(i?.deadline ?? "");
  const [status, setStatus] = createSignal<string>(i?.status ?? "draft");
  const [paymentInfo, setPaymentInfo] = createSignal(i?.paymentInfo ?? "");
  const [isPublic, setIsPublic] = createSignal(i?.isPublic ?? true);

  // Kegiatan yang sudah dikaitkan tetap muncul sebagai pilihan walau tanggalnya di luar daftar.
  const pilihan = () => {
    const out = p.events.map((e) => ({ value: e.id, label: `${e.title} (${e.startDate})` }));
    if (i?.event && !out.some((o) => o.value === i.event!.id)) out.unshift({ value: i.event.id, label: `${i.event.title} (${i.event.startDate})` });
    return out;
  };

  const form = createSubmit(async () => {
    const body = {
      title: title(),
      description: description(),
      calendarEventId: eventId(),
      targetAmount: angka(target()) ?? null,
      deadline: deadline(),
      status: status(),
      paymentInfo: paymentInfo(),
      isPublic: isPublic(),
    };
    const saved = await api<FundraisingCampaignRow>(i ? `/fundraising/${i.id}` : "/fundraising", { method: i ? "PUT" : "POST", body });
    p.onSaved(saved);
  });

  return (
    <form class="form" onSubmit={form.submit}>
      <Show when={form.error()}>
        <div class="peringatan" role="alert">
          {form.error()}
        </div>
      </Show>
      <Field id="kp-judul" label="Nama kampanye" required maxlength={120} value={title()} onInput={setTitle} error={form.fields().title} />
      <AreaField id="kp-ket" label="Keterangan" rows={4} maxlength={2000} value={description()} onInput={setDescription} error={form.fields().description} />
      <SelectField
        id="kp-kegiatan"
        label="Kegiatan terkait (boleh dikosongkan)"
        blank="Tidak terkait kegiatan"
        value={eventId()}
        onInput={setEventId}
        options={pilihan()}
        hint="Pilih dari Kalender akademi, mis. turnamen atau acara yang butuh dana."
        error={form.fields().calendarEventId}
      />
      <Field
        id="kp-target"
        label="Target dana, rupiah (boleh dikosongkan)"
        type="number"
        inputmode="numeric"
        value={target()}
        onInput={setTarget}
        error={form.fields().targetAmount}
      />
      <Field
        id="kp-batas"
        label="Batas akhir sumbangan (boleh dikosongkan)"
        type="date"
        value={deadline()}
        onInput={setDeadline}
        hint="Sumbangan masih diterima sampai hari itu."
        error={form.fields().deadline}
      />
      <SelectField
        id="kp-status"
        label="Status"
        value={status()}
        onInput={setStatus}
        options={Object.entries(labelKampanye).map(([value, label]) => ({ value, label }))}
        hint="Draf hanya terlihat admin. Aktif menerima sumbangan. Selesai berhenti menerima tetapi tetap tampil."
        error={form.fields().status}
      />
      <AreaField
        id="kp-rekening"
        label="Rekening dan petunjuk transfer"
        rows={3}
        maxlength={1000}
        value={paymentInfo()}
        onInput={setPaymentInfo}
        hint="Hanya terlihat anggota yang login, tidak tampil di landing."
        error={form.fields().paymentInfo}
      />
      <label class="centang">
        <input type="checkbox" checked={isPublic()} onChange={(e) => setIsPublic(e.currentTarget.checked)} />
        Tampilkan di landing page (setelah aktif)
      </label>
      <div class="butir-aksi">
        <button class="tombol utama" type="submit" disabled={form.busy()}>
          {form.busy() ? "Menyimpan…" : i ? "Simpan perubahan" : "Simpan kampanye"}
        </button>
        <button class="tombol" type="button" onClick={p.onCancel}>
          Batal
        </button>
      </div>
    </form>
  );
}
