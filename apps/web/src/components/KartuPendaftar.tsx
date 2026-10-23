import { createSignal, Show } from "solid-js";
import type { TrialRow, TrialStatus } from "@ssb/shared";
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

function umur(lahir: string): string {
  const l = new Date(`${lahir}T00:00:00`);
  const n = new Date();
  let t = n.getFullYear() - l.getFullYear();
  if (n.getMonth() < l.getMonth() || (n.getMonth() === l.getMonth() && n.getDate() < l.getDate())) t--;
  return `${t} tahun`;
}

const tanggal = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** Satu pendaftar trial: data yang dikirim orang tua, tombol hubungi lewat WhatsApp, dan status tindak lanjut. */
export default function KartuPendaftar(props: { baris: TrialRow; program: string | undefined; ssbName: string; onUbah: (b: TrialRow) => void }) {
  const [status, setStatus] = createSignal<TrialStatus>(props.baris.status);
  const [catatan, setCatatan] = createSignal(props.baris.adminNote ?? "");
  const [sibuk, setSibuk] = createSignal(false);
  const [galat, setGalat] = createSignal("");
  const [info, setInfo] = createSignal("");
  const berubah = () => status() !== props.baris.status || catatan().trim() !== (props.baris.adminNote ?? "");
  const b = () => props.baris;
  const wa = () =>
    linkWa(
      b().phone,
      `Halo ${b().parentName}, kami dari ${props.ssbName}. Terima kasih sudah mendaftarkan ${b().childName} untuk trial (kode ${b().code}). Kami ingin mengatur jadwal trialnya.`,
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
        <dd>{props.program ?? b().programId ?? "Belum memilih"}</dd>
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
    </article>
  );
}
