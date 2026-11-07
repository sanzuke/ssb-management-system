import { DOCUMENT_LABEL_MAX, DOCUMENT_MAX_BYTES, documentStatusLabel, type DocumentStatus, type PlayerExtra } from "@ssb/shared";
import { createSignal, For, Show } from "solid-js";
import AreaField from "~/components/AreaField";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { type AgeGroup, type PlayerSummary, posisiLabel, statusLabel } from "~/lib/pemain";

const teks = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
/** Angka dari isian (koma atau titik desimal); kosong menjadi null, selain angka dikirim apa adanya agar API menolaknya dengan pesan di kolomnya. */
const angka = (s: string): number | string | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
};

const FOTO_MAX = 2 * 1024 * 1024;
const DOK_TIPE = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const DOK_ACCEPT = DOK_TIPE.join(",");
const BERKAS = [
  { kind: "kartu_keluarga", label: "Kartu Keluarga" },
  { kind: "akta_kelahiran", label: "Akta Kelahiran" },
  { kind: "nisn", label: "NISN" },
] as const;

/**
 * Formulir data siswa, dipakai untuk menambah dan mengubah. Urutan isian mengikuti lembar data siswa SSB.
 * Saat menambah siswa, berkas (foto, KK, akta, NISN, raport) boleh dipilih sekalian dan diunggah setelah siswa tersimpan.
 */
export default function PlayerForm(p: { initial?: PlayerSummary & Partial<PlayerExtra>; ageGroups: AgeGroup[]; onSaved: (saved: PlayerSummary) => void }) {
  const i = p.initial;
  const [memberNo, setMemberNo] = createSignal(i?.memberNo ?? "");
  const [nisn, setNisn] = createSignal(i?.nisn ?? "");
  const [fullName, setFullName] = createSignal(i?.fullName ?? "");
  const [birthPlace, setBirthPlace] = createSignal(i?.birthPlace ?? "");
  const [birthDate, setBirthDate] = createSignal(i?.birthDate ?? "");
  const [ageGroupId, setAgeGroupId] = createSignal(i?.ageGroup?.id ?? "");
  const [position, setPosition] = createSignal(i?.position ?? "");
  const [jerseyNo, setJerseyNo] = createSignal(teks(i?.jerseyNo));
  const [jerseySize, setJerseySize] = createSignal(i?.jerseySize ?? "");
  const [shoeSize, setShoeSize] = createSignal(teks(i?.shoeSize));
  const [heightCm, setHeightCm] = createSignal(teks(i?.heightCm));
  const [weightKg, setWeightKg] = createSignal(teks(i?.weightKg));
  const [guardianName, setGuardianName] = createSignal(i?.guardianName ?? "");
  const [guardianWhatsapp, setGuardianWhatsapp] = createSignal(i?.guardianWhatsapp ?? "");
  const [documentStatus, setDocumentStatus] = createSignal<DocumentStatus>(i?.documentStatus ?? "belum");
  const [medicalNote, setMedicalNote] = createSignal(i?.medicalNote ?? "");
  const [school, setSchool] = createSignal(i?.school ?? "");
  const [status, setStatus] = createSignal(i?.status ?? "aktif");
  const [foto, setFoto] = createSignal<File | null>(null);
  const [berkas, setBerkasState] = createSignal<Partial<Record<"kartu_keluarga" | "akta_kelahiran" | "nisn", File>>>({});
  const setBerkas = (k: "kartu_keluarga" | "akta_kelahiran" | "nisn", f: File | null) =>
    setBerkasState((b) => {
      const n = { ...b };
      if (f) n[k] = f;
      else delete n[k];
      return n;
    });
  const [raport, setRaport] = createSignal<File | null>(null);
  const [raportLabel, setRaportLabel] = createSignal("");
  const [fileError, setFileError] = createSignal("");
  const [dibuat, setDibuat] = createSignal<PlayerSummary | null>(null);
  const [gagalUnggah, setGagalUnggah] = createSignal<string[]>([]);

  /** Ambil berkas dari isian; yang tipe atau ukurannya salah ditolak di sini dan isiannya dikosongkan. */
  const pilih = (set: (f: File | null) => void, e: Event, maks: number) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    setFileError("");
    if (f && !DOK_TIPE.includes(f.type)) {
      input.value = "";
      set(null);
      return setFileError("Berkas harus berformat PDF, JPG, PNG, atau WebP.");
    }
    if (f && f.size > maks) {
      input.value = "";
      set(null);
      return setFileError(`Berkas terlalu besar. Maksimal ${maks / 1024 / 1024} MB.`);
    }
    set(f);
  };

  /** Unggah semua berkas terpilih satu per satu; mengembalikan nama berkas yang gagal beserta alasannya. */
  const unggahSemua = async (id: string): Promise<string[]> => {
    const kirim = async (url: string, method: string, body: FormData) => {
      const res = await fetch(`/api${url}`, { method, credentials: "same-origin", body });
      if (!res.ok) return (await res.json().catch(() => null))?.error?.message ?? "gagal diunggah";
      return null;
    };
    const gagal: string[] = [];
    const f = foto();
    if (f) {
      const b = new FormData();
      b.set("file", f);
      const m = await kirim(`/players/${encodeURIComponent(id)}/photo`, "PUT", b).catch(() => "tidak bisa terhubung");
      if (m) gagal.push(`Foto: ${m}`);
    }
    const dok: { kind: string; label: string; file: File; ket?: string }[] = [
      ...BERKAS.flatMap((x) => (berkas()[x.kind] ? [{ kind: x.kind, label: x.label, file: berkas()[x.kind]! }] : [])),
      ...(raport() ? [{ kind: "raport", label: "Raport", file: raport()!, ket: raportLabel().trim() }] : []),
    ];
    for (const d of dok) {
      if (d.kind === "raport" && !d.ket) {
        gagal.push("Raport: keterangan wajib diisi");
        continue;
      }
      const b = new FormData();
      b.set("kind", d.kind);
      if (d.ket) b.set("label", d.ket);
      b.set("file", d.file);
      const m = await kirim(`/players/${encodeURIComponent(id)}/documents`, "POST", b).catch(() => "tidak bisa terhubung");
      if (m) gagal.push(`${d.label}: ${m}`);
    }
    return gagal;
  };

  const form = createSubmit(async () => {
    const body = {
      memberNo: memberNo().trim() || null,
      nisn: nisn().trim() || null,
      fullName: fullName(),
      birthPlace: birthPlace().trim() || null,
      birthDate: birthDate(),
      ageGroupId: ageGroupId() || null,
      position: position() || null,
      jerseyNo: angka(jerseyNo()),
      jerseySize: jerseySize().trim() || null,
      shoeSize: angka(shoeSize()),
      heightCm: angka(heightCm()),
      weightKg: angka(weightKg()),
      guardianName: guardianName().trim() || null,
      guardianWhatsapp: guardianWhatsapp().trim() || null,
      documentStatus: documentStatus(),
      medicalNote: medicalNote().trim() || null,
      school: school().trim() || null,
      status: status(),
    };
    const saved = await api<PlayerSummary>(i ? `/players/${i.id}` : "/players", { method: i ? "PATCH" : "POST", body });
    if (i) return p.onSaved(saved);
    // Siswa baru: unggah berkas yang dipilih. Siswa sudah tersimpan, jadi kegagalan unggah tidak membatalkannya.
    const gagal = await unggahSemua(saved.id);
    if (gagal.length === 0) return p.onSaved(saved);
    setDibuat(saved);
    setGagalUnggah(gagal);
  });

  return (
    <form class="form" onSubmit={form.submit}>
      <Show when={form.error()}>
        <div class="peringatan" role="alert">
          {form.error()}
        </div>
      </Show>

      <fieldset class="bagian-form">
        <legend>Identitas</legend>
        <Field
          id="memberNo"
          label="ID siswa"
          maxlength={30}
          autocomplete="off"
          hint={i ? undefined : "Kosongkan agar dibuat otomatis (P0001, P0002, dan seterusnya)."}
          value={memberNo()}
          onInput={setMemberNo}
          error={form.fields().memberNo}
        />
        <Field
          id="nisn"
          label="NISN (Nomor Induk Siswa Nasional)"
          inputmode="numeric"
          maxlength={10}
          pattern="\d{10}"
          autocomplete="off"
          hint="10 angka. Boleh dikosongkan."
          value={nisn()}
          onInput={setNisn}
          error={form.fields().nisn}
        />
        <Field
          id="fullName"
          label="Nama lengkap (sesuai kartu identitas)"
          required
          maxlength={120}
          autocomplete="off"
          value={fullName()}
          onInput={setFullName}
          error={form.fields().fullName}
        />
        <Field
          id="birthPlace"
          label="Tempat lahir"
          maxlength={80}
          autocomplete="off"
          value={birthPlace()}
          onInput={setBirthPlace}
          error={form.fields().birthPlace}
        />
        <Field id="birthDate" label="Tanggal lahir" type="date" required value={birthDate()} onInput={setBirthDate} error={form.fields().birthDate} />
      </fieldset>

      <fieldset class="bagian-form">
        <legend>Sepak bola</legend>
        <SelectField
          id="ageGroupId"
          label="Kelompok usia (KU)"
          blank="Belum ditentukan"
          value={ageGroupId()}
          onInput={setAgeGroupId}
          options={p.ageGroups.map((g) => ({ value: g.id, label: `${g.name} (usia ${g.minAge} sampai ${g.maxAge})` }))}
          error={form.fields().ageGroupId}
        />
        <SelectField
          id="position"
          label="Posisi"
          blank="Belum ditentukan"
          value={position()}
          onInput={setPosition}
          options={Object.entries(posisiLabel).map(([value, label]) => ({ value, label }))}
          error={form.fields().position}
        />
        <Field id="jerseyNo" label="No. punggung" inputmode="numeric" maxlength={2} value={jerseyNo()} onInput={setJerseyNo} error={form.fields().jerseyNo} />
        <Field
          id="jerseySize"
          label="Ukuran jersey"
          maxlength={10}
          placeholder="S, M, L, XL"
          autocomplete="off"
          value={jerseySize()}
          onInput={setJerseySize}
          error={form.fields().jerseySize}
        />
        <Field id="shoeSize" label="Ukuran sepatu" inputmode="decimal" maxlength={4} value={shoeSize()} onInput={setShoeSize} error={form.fields().shoeSize} />
      </fieldset>

      <fieldset class="bagian-form">
        <legend>Fisik</legend>
        <Field
          id="heightCm"
          label="Tinggi badan (cm)"
          inputmode="decimal"
          maxlength={5}
          value={heightCm()}
          onInput={setHeightCm}
          error={form.fields().heightCm}
        />
        <Field
          id="weightKg"
          label="Berat badan (kg)"
          inputmode="decimal"
          maxlength={5}
          value={weightKg()}
          onInput={setWeightKg}
          error={form.fields().weightKg}
        />
      </fieldset>

      <fieldset class="bagian-form">
        <legend>Orang tua</legend>
        <Field
          id="guardianName"
          label="Nama orang tua"
          maxlength={120}
          autocomplete="off"
          hint="Kontak saja. Akun orang tua untuk masuk ke portal dihubungkan lewat undangan."
          value={guardianName()}
          onInput={setGuardianName}
          error={form.fields().guardianName}
        />
        <Field
          id="guardianWhatsapp"
          label="No. WhatsApp"
          type="tel"
          inputmode="tel"
          autocomplete="off"
          hint="Contoh 081234567890. Awalan 8 dilengkapi menjadi 08."
          value={guardianWhatsapp()}
          onInput={setGuardianWhatsapp}
          error={form.fields().guardianWhatsapp}
        />
      </fieldset>

      <fieldset class="bagian-form">
        <legend>Berkas dan kesehatan</legend>
        <SelectField
          id="documentStatus"
          label="Status berkas (KK dan akta)"
          value={documentStatus()}
          onInput={(v) => setDocumentStatus(v as DocumentStatus)}
          options={Object.entries(documentStatusLabel).map(([value, label]) => ({ value, label }))}
          error={form.fields().documentStatus}
        />
        <AreaField
          id="medicalNote"
          label="Catatan medis (alergi, riwayat cedera, penyakit)"
          rows={3}
          maxlength={500}
          hint="Dilihat admin, pelatih KU-nya, dan orang tua anak ini."
          value={medicalNote()}
          onInput={setMedicalNote}
          error={form.fields().medicalNote}
        />
      </fieldset>

      <fieldset class="bagian-form">
        <legend>Lainnya</legend>
        <Field id="school" label="Sekolah (boleh dikosongkan)" maxlength={120} value={school()} onInput={setSchool} error={form.fields().school} />
        <SelectField
          id="status"
          label="Status"
          value={status()}
          onInput={(v) => setStatus(v as "aktif")}
          options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))}
          error={form.fields().status}
        />
      </fieldset>

      <Show when={!i}>
        <fieldset class="bagian-form">
          <legend>Unggah berkas (boleh nanti)</legend>
          <p class="petunjuk">Berkas diunggah setelah siswa tersimpan; yang dikosongkan bisa diunggah kapan saja dari profil siswa. PDF, JPG, PNG, atau WebP.</p>
          <Show when={fileError()}>
            <div class="peringatan" role="alert">
              {fileError()}
            </div>
          </Show>
          <div class="field">
            <label for="berkas-foto">Foto (maksimal 2 MB, hanya gambar)</label>
            <input id="berkas-foto" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => pilih(setFoto, e, FOTO_MAX)} />
          </div>
          <For each={BERKAS}>
            {(b) => (
              <div class="field">
                <label for={`berkas-${b.kind}`}>{b.label} (maksimal 5 MB)</label>
                <input id={`berkas-${b.kind}`} type="file" accept={DOK_ACCEPT} onChange={(e) => pilih((f) => setBerkas(b.kind, f), e, DOCUMENT_MAX_BYTES)} />
              </div>
            )}
          </For>
          <div class="field">
            <label for="berkas-raport">Raport (maksimal 5 MB; raport lain bisa ditambah dari profil siswa)</label>
            <input id="berkas-raport" type="file" accept={DOK_ACCEPT} onChange={(e) => pilih(setRaport, e, DOCUMENT_MAX_BYTES)} />
          </div>
          <Show when={raport()}>
            <Field id="berkas-raport-label" label="Keterangan raport" placeholder="mis. Semester 1 2025/2026" maxlength={DOCUMENT_LABEL_MAX} value={raportLabel()} onInput={setRaportLabel} />
          </Show>
        </fieldset>
      </Show>

      <Show
        when={dibuat()}
        fallback={
          <button class="tombol utama" type="submit" disabled={form.busy()}>
            {form.busy() ? "Menyimpan…" : i ? "Simpan perubahan" : "Tambah siswa"}
          </button>
        }
      >
        {(s) => (
          <div class="peringatan" role="alert">
            <p>
              <strong>{s().fullName} sudah ditambahkan</strong>, tetapi ada berkas yang belum terunggah:
            </p>
            <ul>
              <For each={gagalUnggah()}>{(m) => <li>{m}</li>}</For>
            </ul>
            <p>Unggah ulang dari kartu Berkas siswa di profilnya.</p>
            <button class="tombol utama" type="button" onClick={() => p.onSaved(s())}>
              Buka profil siswa
            </button>
          </div>
        )}
      </Show>
    </form>
  );
}
