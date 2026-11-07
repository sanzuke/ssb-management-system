import { A } from "@solidjs/router";
import { createEffect, createSignal, Show } from "solid-js";
import type { TrialConvertResult, TrialRow, TrialStatus } from "@ssb/shared";
import { api, ApiError } from "~/lib/api";
import { linkWa } from "~/lib/wa";
import SelectField from "./SelectField";
import AreaField from "./AreaField";

export const labelStatusTrial: Record<TrialStatus, string> = {
  baru: "Baru",
  dihubungi: "Sudah dihubungi",
  diterima: "Diterima",
  ditolak: "Ditolak",
};
const opsiStatus = (Object.keys(labelStatusTrial) as TrialStatus[]).map((v) => ({ value: v, label: labelStatusTrial[v] }));

export function umur(lahir: string): string {
  const l = new Date(`${lahir}T00:00:00`);
  const n = new Date();
  let t = n.getFullYear() - l.getFullYear();
  if (n.getMonth() < l.getMonth() || (n.getMonth() === l.getMonth() && n.getDate() < l.getDate())) t--;
  return `${t} tahun`;
}

const tanggal = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** Satu pendaftar trial: data yang dikirim orang tua, tombol hubungi lewat WhatsApp, dan status tindak lanjut. */
export default function KartuPendaftar(props: {
  baris: TrialRow;
  program: string | undefined;
  /** KU di Data master, untuk memilih KU saat menjadikan pendaftar siswa. */
  kus: { id: string; name: string }[];
  ssbName: string;
  onUbah: (b: TrialRow) => void;
  /** Hasil konversi (tautan undangan hanya tampil sekali) disimpan oleh halaman agar tidak hilang saat kartu dirender ulang. */
  undangan: TrialConvertResult | null;
  onJadi: (hasil: TrialConvertResult) => void;
}) {
  const [status, setStatus] = createSignal<TrialStatus>(props.baris.status);
  const [catatan, setCatatan] = createSignal(props.baris.adminNote ?? "");
  const [sibuk, setSibuk] = createSignal(false);
  const [galat, setGalat] = createSignal("");
  const [info, setInfo] = createSignal("");
  const berubah = () => status() !== props.baris.status || catatan().trim() !== (props.baris.adminNote ?? "");
  const [kuPilihan, setKuPilihan] = createSignal(props.baris.ageGroup?.id ?? "");
  const jadi = () => props.undangan;
  const [jadiSibuk, setJadiSibuk] = createSignal(false);
  const [jadiGalat, setJadiGalat] = createSignal("");
  const b = () => props.baris;
  // Status berubah dari luar (mis. otomatis "Diterima" setelah dijadikan siswa): isian ikut, supaya tombol Simpan tidak mengembalikannya.
  createEffect(() => setStatus(props.baris.status));
  const wa = () =>
    linkWa(
      b().phone,
      `Halo ${b().parentName}, kami dari ${props.ssbName}. Terima kasih sudah mendaftarkan ${b().childName} untuk trial (kode ${b().code}). Kami ingin mengatur jadwal trialnya.`,
    );

  const jadikanSiswa = async () => {
    if (jadiSibuk()) return;
    setJadiSibuk(true);
    setJadiGalat("");
    try {
      const hasil = await api<TrialConvertResult>(`/trials/${encodeURIComponent(b().id)}/convert`, {
        method: "POST",
        body: { ageGroupId: kuPilihan() || null },
      });
      props.onJadi(hasil);
    } catch (e) {
      setJadiGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setJadiSibuk(false);
    }
  };
  const waUndangan = () =>
    jadi() &&
    linkWa(
      b().phone,
      `Halo ${b().parentName}, terima kasih sudah mendaftar di ${props.ssbName}. ${b().childName} sudah terdaftar. Silakan buat akun orang tua lewat tautan ini untuk melihat jadwal, kehadiran, dan nilai: ${jadi()!.invitation.url}`,
    );
  const simpan = async () => {
    if (sibuk()) return;
    setSibuk(true);
    setGalat("");
    setInfo("");
    try {
      props.onUbah(await api<TrialRow>(`/trials/${b().id}`, { method: "PATCH", body: { status: status(), adminNote: catatan().trim() } }));
      setInfo("Tersimpan.");
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <article class="kartu-pendaftar" aria-label={`Pendaftar ${b().childName}`}>
      <header>
        <h2>{b().childName}</h2>
        <span class={`status-trial ${b().status}`}>{labelStatusTrial[b().status]}</span>
      </header>
      <p class="petunjuk">
        {b().code} · masuk {tanggal(b().createdAt)}
      </p>
      <dl class="rincian-pendaftar">
        <dt>Anak</dt>
        <dd>
          {b().gender}, {umur(b().birthDate)} (lahir {b().birthDate})
        </dd>
        <dt>Program</dt>
        <dd>{[b().ageGroup?.name, props.program].filter(Boolean).join(" · ") || b().programId || "Belum memilih"}</dd>
        <dt>Orang tua</dt>
        <dd>{b().parentName}</dd>
        <dt>Telepon</dt>
        <dd>
          {b().phone}
          <Show when={wa()}>
            {(u) => (
              <a class="tombol tipis" href={u()} target="_blank" rel="noopener noreferrer">
                Hubungi lewat WhatsApp
              </a>
            )}
          </Show>
        </dd>
        <Show when={b().email}>
          <dt>Email</dt>
          <dd>{b().email}</dd>
        </Show>
        <Show when={b().address}>
          <dt>Alamat</dt>
          <dd>{b().address}</dd>
        </Show>
        <Show when={b().preferredSession}>
          <dt>Sesi pilihan</dt>
          <dd>{b().preferredSession}</dd>
        </Show>
        <Show when={b().birthPlace || b().school || b().nisn}>
          <dt>Sekolah dan identitas</dt>
          <dd>
            {[b().birthPlace && `Lahir di ${b().birthPlace}`, b().school, b().nisn && `NISN ${b().nisn}`].filter(Boolean).join(" · ")}
          </dd>
        </Show>
        <Show when={b().position || b().heightCm || b().weightKg || b().jerseySize || b().shoeSize}>
          <dt>Fisik dan perlengkapan</dt>
          <dd>
            {[
              b().position && `Posisi favorit ${b().position}`,
              b().heightCm && `${b().heightCm} cm`,
              b().weightKg && `${String(b().weightKg).replace(".", ",")} kg`,
              b().jerseySize && `Jersey ${b().jerseySize}`,
              b().shoeSize && `Sepatu ${String(b().shoeSize).replace(".", ",")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </dd>
        </Show>
        <Show when={b().medicalNote}>
          <dt>Riwayat kesehatan</dt>
          <dd>{b().medicalNote}</dd>
        </Show>
        <dt>Persetujuan</dt>
        <dd>
          {b().commitmentAcceptedAt ? `Komitmen disetujui ${tanggal(b().commitmentAcceptedAt!)}` : "Komitmen: belum ada (pendaftar lama)"}
          {" · "}
          {b().mediaConsent ? "Foto dan video diizinkan" : "Foto dan video tidak diizinkan"}
        </dd>
        <dt>Beasiswa</dt>
        <dd>{b().applyScholarship ? "Mengajukan" : "Tidak"}</dd>
        <Show when={b().notes}>
          <dt>Catatan orang tua</dt>
          <dd>{b().notes}</dd>
        </Show>
      </dl>
      <div class="form">
        <SelectField id={`status-${b().id}`} label="Status" value={status()} onInput={(v) => setStatus(v as TrialStatus)} options={opsiStatus} />
        <AreaField
          id={`catatan-${b().id}`}
          label="Catatan internal"
          value={catatan()}
          onInput={setCatatan}
          maxlength={1000}
          hint="Hanya terlihat oleh admin."
        />
        <Show when={galat()}>
          <div class="peringatan" role="alert">
            {galat()}
          </div>
        </Show>
        <Show when={info() && !berubah()}>
          <div class="info" role="status">
            {info()}
          </div>
        </Show>
        <button class="tombol utama" type="button" disabled={sibuk() || !berubah()} onClick={simpan}>
          {sibuk() ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
      <div class="form jadi-siswa">
        <Show
          when={!b().player}
          fallback={
            <Show when={!jadi()}>
              <div class="info" role="status">
                Sudah dijadikan siswa:{" "}
                <A href={`/pemain/${b().player!.id}`}>
                  <strong>{b().player!.name}</strong>
                </A>
                . Untuk tautan undangan orang tua, buka menu Undangan lalu buat ulang tautannya.
              </div>
            </Show>
          }
        >
          <Show
            when={b().status !== "ditolak"}
            fallback={<p class="petunjuk">Pendaftar yang ditolak tidak bisa dijadikan siswa. Ubah statusnya dulu bila ingin menerimanya.</p>}
          >
            <SelectField
              id={`ku-${b().id}`}
              label="KU untuk siswa"
              value={kuPilihan()}
              onInput={setKuPilihan}
              blank="Belum ditentukan"
              options={props.kus.map((k) => ({ value: k.id, label: k.name }))}
              hint="Terisi dari pilihan orang tua di landing; boleh diganti."
            />
            <Show when={jadiGalat()}>
              <div class="peringatan" role="alert">
                {jadiGalat()}
              </div>
            </Show>
            <button class="tombol utama-rumput" type="button" disabled={jadiSibuk()} onClick={jadikanSiswa}>
              {jadiSibuk() ? "Memproses…" : "Jadikan siswa dan undang orang tua"}
            </button>
          </Show>
        </Show>
        <Show when={jadi()}>
          {(h) => (
            <div class="info" role="status">
              <p>
                <A href={`/pemain/${h().player.id}`}>
                  <strong>{h().player.name}</strong>
                </A>{" "}
                sudah menjadi siswa. Kirim tautan ini ke orang tua agar bisa membuat akun (berlaku sampai {tanggal(h().invitation.expiresAt)}, hanya tampil
                sekali):
              </p>
              <p class="tautan-undangan">
                <input type="text" readonly value={h().invitation.url} aria-label="Tautan undangan orang tua" onFocus={(e) => e.currentTarget.select()} />
              </p>
              <Show when={waUndangan()}>
                {(u) => (
                  <a class="tombol tipis" href={u()} target="_blank" rel="noopener noreferrer">
                    Kirim lewat WhatsApp
                  </a>
                )}
              </Show>
            </div>
          )}
        </Show>
      </div>
    </article>
  );
}
