import { createSignal, Show } from "solid-js";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { posisiLabel, statusLabel, type AgeGroup, type PlayerSummary } from "~/lib/pemain";

/** Formulir biodata pemain, dipakai untuk menambah dan mengubah. */
export default function PlayerForm(p: { initial?: PlayerSummary; ageGroups: AgeGroup[]; onSaved: (saved: PlayerSummary) => void }) {
  const i = p.initial;
  const [fullName, setFullName] = createSignal(i?.fullName ?? "");
  const [birthDate, setBirthDate] = createSignal(i?.birthDate ?? "");
  const [position, setPosition] = createSignal(i?.position ?? "");
  const [school, setSchool] = createSignal(i?.school ?? "");
  const [ageGroupId, setAgeGroupId] = createSignal(i?.ageGroup?.id ?? "");
  const [status, setStatus] = createSignal(i?.status ?? "aktif");

  const form = createSubmit(async () => {
    const body = {
      fullName: fullName(),
      birthDate: birthDate(),
      position: position() || null,
      school: school().trim() || null,
      ageGroupId: ageGroupId() || null,
      status: status(),
    };
    const saved = await api<PlayerSummary>(i ? `/players/${i.id}` : "/players", { method: i ? "PATCH" : "POST", body });
    p.onSaved(saved);
  });

  return (
    <form class="form" onSubmit={form.submit}>
      <Show when={form.error()}>
        <div class="peringatan" role="alert">{form.error()}</div>
      </Show>
      <Field id="fullName" label="Nama lengkap" required maxlength={120} autocomplete="off" value={fullName()} onInput={setFullName} error={form.fields().fullName} />
      <Field id="birthDate" label="Tanggal lahir" type="date" required value={birthDate()} onInput={setBirthDate} error={form.fields().birthDate} />
      <SelectField id="ageGroupId" label="Kelompok usia (KU)" blank="Belum ditentukan" value={ageGroupId()} onInput={setAgeGroupId} options={p.ageGroups.map((g) => ({ value: g.id, label: `${g.name} (usia ${g.minAge} sampai ${g.maxAge})` }))} error={form.fields().ageGroupId} />
      <SelectField id="position" label="Posisi" blank="Belum ditentukan" value={position()} onInput={setPosition} options={Object.entries(posisiLabel).map(([value, label]) => ({ value, label }))} error={form.fields().position} />
      <Field id="school" label="Sekolah (boleh dikosongkan)" maxlength={120} value={school()} onInput={setSchool} error={form.fields().school} />
      <SelectField id="status" label="Status" value={status()} onInput={(v) => setStatus(v as "aktif")} options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))} error={form.fields().status} />
      <button class="tombol utama" type="submit" disabled={form.busy()}>{form.busy() ? "Menyimpan…" : i ? "Simpan perubahan" : "Tambah pemain"}</button>
    </form>
  );
}
