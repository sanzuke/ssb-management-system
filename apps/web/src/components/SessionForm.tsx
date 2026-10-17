import { createSignal, Show } from "solid-js";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import type { AgeGroup, Location, TrainingSession } from "@ssb/shared";

/** Formulir sesi latihan. Saat membuat, bisa diulang tiap minggu sampai tanggal tertentu. */
export default function SessionForm(p: { initial?: TrainingSession; ageGroups: AgeGroup[]; locations: Location[]; onSaved: (count: number) => void; onCancel: () => void }) {
  const i = p.initial;
  const [ageGroupId, setAgeGroupId] = createSignal(i?.ageGroup.id ?? "");
  const [sessionDate, setSessionDate] = createSignal(i?.sessionDate ?? "");
  const [startTime, setStartTime] = createSignal(i?.startTime ?? "");
  const [locationId, setLocationId] = createSignal(i?.location?.id ?? "");
  const [repeat, setRepeat] = createSignal(false);
  const [repeatUntil, setRepeatUntil] = createSignal("");

  const form = createSubmit(async () => {
    const body = {
      ageGroupId: ageGroupId(),
      sessionDate: sessionDate(),
      startTime: startTime() || null,
      locationId: locationId() || null,
      ...(!i && repeat() ? { repeatUntil: repeatUntil() } : {}),
    };
    const res = await api<unknown>(i ? `/sessions/${i.id}` : "/sessions", { method: i ? "PATCH" : "POST", body });
    p.onSaved(Array.isArray(res) ? res.length : 1);
  });

  return (
    <form class="form" onSubmit={form.submit}>
      <Show when={form.error()}>
        <div class="peringatan" role="alert">{form.error()}</div>
      </Show>
      <SelectField id="s-ku" label="KU" blank="Pilih KU" required value={ageGroupId()} onInput={setAgeGroupId} options={p.ageGroups.map((g) => ({ value: g.id, label: g.name }))} error={form.fields().ageGroupId} />
      <Field id="s-tgl" label="Tanggal" type="date" required value={sessionDate()} onInput={setSessionDate} error={form.fields().sessionDate} />
      <Field id="s-jam" label="Jam mulai (boleh dikosongkan)" type="time" value={startTime()} onInput={setStartTime} error={form.fields().startTime} />
      <SelectField id="s-lok" label="Lokasi" blank="Belum ditentukan" value={locationId()} onInput={setLocationId} options={p.locations.map((l) => ({ value: l.id, label: l.name }))} error={form.fields().locationId} />
      <Show when={!i}>
        <label class="centang">
          <input type="checkbox" checked={repeat()} onChange={(e) => setRepeat(e.currentTarget.checked)} />
          Ulangi tiap minggu di hari yang sama
        </label>
        <Show when={repeat()}>
          <Field id="s-ulang" label="Ulangi sampai tanggal" type="date" required value={repeatUntil()} onInput={setRepeatUntil} hint="Satu sesi dibuat tiap minggu, maksimal 100 sesi." error={form.fields().repeatUntil} />
        </Show>
      </Show>
      <div class="butir-aksi">
        <button class="tombol utama" type="submit" disabled={form.busy()}>{form.busy() ? "Menyimpan…" : i ? "Simpan perubahan" : "Simpan jadwal"}</button>
        <button class="tombol" type="button" onClick={p.onCancel}>Batal</button>
      </div>
    </form>
  );
}
