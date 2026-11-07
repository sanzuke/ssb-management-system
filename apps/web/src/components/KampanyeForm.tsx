import { createSignal, Index, Show } from "solid-js";
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
  const [paket, setPaket] = createSignal<{ name: string; amount: string; description: string }[]>(
    (i?.packages ?? []).map((k) => ({ name: k.name, amount: String(k.amount), description: k.description })),
  );
  const ubahPaket = (n: number, patch: Partial<{ name: string; amount: string; description: string }>) =>
    setPaket((l) => l.map((k, idx) => (idx === n ? { ...k, ...patch } : k)));
  const galatPaket = () => Object.entries(form.fields()).filter(([k]) => k.startsWith("packages")).map(([, v]) => v);

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
      packages: paket().map((k) => ({ name: k.name, amount: angka(k.amount), description: k.description })),
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
        hint="Terlihat anggota yang login. Di landing, donatur melihatnya hanya setelah mengirim donasi (bersama nominal yang harus ditransfer), supaya mudah mencocokkan transfer."
        error={form.fields().paymentInfo}
      />
      <fieldset>
        <legend>Paket donasi di landing (maksimal 8, boleh dikosongkan)</legend>
        <p class="petunjuk">Donatur memilih paket atau mengisi nominal sendiri (minimal Rp 10.000). Contoh: Paket Bola Rp 50.000, Paket Jersey Rp 150.000.</p>
        <Index each={paket()}>
          {(k, n) => (
            <div class="form">
              <Field id={`kp-paket-nama-${n}`} label={`Nama paket ${n + 1}`} maxlength={60} value={k().name} onInput={(v) => ubahPaket(n, { name: v })} />
              <Field
                id={`kp-paket-nominal-${n}`}
                label="Nominal, rupiah"
                type="number"
                inputmode="numeric"
                value={k().amount}
                onInput={(v) => ubahPaket(n, { amount: v })}
              />
              <Field id={`kp-paket-ket-${n}`} label="Keterangan (opsional)" maxlength={200} value={k().description} onInput={(v) => ubahPaket(n, { description: v })} />
              <button class="tombol tipis" type="button" onClick={() => setPaket((l) => l.filter((_, idx) => idx !== n))}>
                Hapus paket {n + 1}
              </button>
            </div>
          )}
        </Index>
        <Show when={galatPaket().length > 0}>
          <div class="peringatan" role="alert">
            {galatPaket().join("; ")}
          </div>
        </Show>
        <Show when={paket().length < 8}>
          <button class="tombol" type="button" onClick={() => setPaket((l) => [...l, { name: "", amount: "", description: "" }])}>
            Tambah paket
          </button>
        </Show>
      </fieldset>
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
