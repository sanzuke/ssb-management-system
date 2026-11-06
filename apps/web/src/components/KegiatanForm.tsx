import { createSignal, Show } from "solid-js";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import type { CalendarEventRow, CalendarEventType } from "@ssb/shared";

export const jenisKegiatan: Record<CalendarEventType, string> = {
  pertandingan: "Pertandingan",
  latihan: "Latihan khusus",
  acara: "Acara",
  libur: "Libur",
  lainnya: "Lainnya",
};

/** Formulir kegiatan kalender akademi. Jam dan tanggal akhir boleh dikosongkan. */
export default function KegiatanForm(p: { initial?: CalendarEventRow; defaultDate?: string; onSaved: () => void; onCancel: () => void }) {
  const i = p.initial;
  const [title, setTitle] = createSignal(i?.title ?? "");
  const [eventType, setEventType] = createSignal<string>(i?.eventType ?? "acara");
  const [startDate, setStartDate] = createSignal(i?.startDate ?? p.defaultDate ?? "");
  const [endDate, setEndDate] = createSignal(i?.endDate ?? "");
  const [startTime, setStartTime] = createSignal(i?.startTime ?? "");
  const [endTime, setEndTime] = createSignal(i?.endTime ?? "");
  const [location, setLocation] = createSignal(i?.location ?? "");
  const [description, setDescription] = createSignal(i?.description ?? "");
  const [isPublic, setIsPublic] = createSignal(i?.isPublic ?? true);

  const form = createSubmit(async () => {
    const body = {
      title: title(),
      eventType: eventType(),
      startDate: startDate(),
      endDate: endDate(),
      startTime: startTime(),
      endTime: endTime(),
      location: location(),
      description: description(),
      isPublic: isPublic(),
    };
    await api<CalendarEventRow>(i ? `/calendar/${i.id}` : "/calendar", { method: i ? "PUT" : "POST", body });
    p.onSaved();
  });

  return (
    <form class="form" onSubmit={form.submit}>
      <Show when={form.error()}>
        <div class="peringatan" role="alert">
          {form.error()}
        </div>
      </Show>
      <Field id="k-judul" label="Nama kegiatan" required maxlength={120} value={title()} onInput={setTitle} error={form.fields().title} />
      <SelectField
        id="k-jenis"
        label="Jenis"
        value={eventType()}
        onInput={setEventType}
        options={Object.entries(jenisKegiatan).map(([value, label]) => ({ value, label }))}
        error={form.fields().eventType}
      />
      <Field id="k-mulai" label="Tanggal mulai" type="date" required value={startDate()} onInput={setStartDate} error={form.fields().startDate} />
      <Field
        id="k-selesai"
        label="Tanggal selesai (boleh dikosongkan)"
        type="date"
        value={endDate()}
        onInput={setEndDate}
        hint="Kosongkan untuk kegiatan satu hari."
        error={form.fields().endDate}
      />
      <Field id="k-jam" label="Jam mulai (boleh dikosongkan)" type="time" value={startTime()} onInput={setStartTime} error={form.fields().startTime} />
      <Field id="k-jam-akhir" label="Jam selesai (boleh dikosongkan)" type="time" value={endTime()} onInput={setEndTime} error={form.fields().endTime} />
      <Field id="k-lokasi" label="Lokasi" maxlength={160} value={location()} onInput={setLocation} error={form.fields().location} />
      <Field id="k-ket" label="Keterangan" maxlength={1000} value={description()} onInput={setDescription} error={form.fields().description} />
      <label class="centang">
        <input type="checkbox" checked={isPublic()} onChange={(e) => setIsPublic(e.currentTarget.checked)} />
        Tampilkan di landing page
      </label>
      <div class="butir-aksi">
        <button class="tombol utama" type="submit" disabled={form.busy()}>
          {form.busy() ? "Menyimpan…" : i ? "Simpan perubahan" : "Simpan kegiatan"}
        </button>
        <button class="tombol" type="button" onClick={p.onCancel}>
          Batal
        </button>
      </div>
    </form>
  );
}
