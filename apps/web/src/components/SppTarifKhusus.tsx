import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import { rupiah } from "~/lib/waktu";
import type { PlayerFeeOverrideRow, PlayerSummary } from "@ssb/shared";
import Field from "./Field";

/**
 * Tarif SPP khusus per pemain (keringatan, saudara kandung, dan sejenisnya).
 * Tarif khusus menggantikan tarif KU; 0 berarti pemain itu tidak ikut ditagih.
 */
export default function SppTarifKhusus() {
  const [daftar, { refetch: muatDaftar }] = createResource(async () =>
    api<PlayerFeeOverrideRow[]>("/fees/player-overrides").catch(() => [] as PlayerFeeOverrideRow[]),
  );
  const [pemain, { refetch: muatPemain }] = createResource(async () => api<PlayerSummary[]>("/players?status=aktif").catch(() => [] as PlayerSummary[]));
  const [dipilih, setDipilih] = createSignal("");
  const [nominal, setNominal] = createSignal("");
  const [catatan, setCatatan] = createSignal("");
  const [pesan, setPesan] = createSignal("");
  const [galat, setGalat] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);

  const tarifPemain = createMemo(() => {
    const m = new Map<string, number>();
    for (const r of daftar() ?? []) m.set(r.playerId, r.monthlyFee);
    return m;
  });
  // Pemain yang belum punya tarif khusus.
  const kandidat = createMemo(() => (pemain() ?? []).filter((p) => !tarifPemain().has(p.id)));

  const aksi = async (kerja: () => Promise<void>) => {
    setGalat("");
    setPesan("");
    setSibuk(true);
    try {
      await kerja();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  const simpan = (e: SubmitEvent) => {
    e.preventDefault();
    const id = dipilih();
    if (!id) {
      setGalat("Pilih pemain dulu.");
      return;
    }
    const nilai = Number(nominal());
    if (!Number.isInteger(nilai) || nilai < 0) {
      setGalat("Nominal harus berupa angka bulat tanpa titik atau koma.");
      return;
    }
    return aksi(async () => {
      await api(`/fees/player-overrides/${id}`, { method: "PUT", body: { monthlyFee: nilai, note: catatan().trim() || null } });
      setPesan("Tarif khusus disimpan. Berlaku untuk tagihan yang dibuat sesudahnya.");
      setDipilih("");
      setNominal("");
      setCatatan("");
      await Promise.all([muatDaftar(), muatPemain()]);
    });
  };

  const buang = (r: PlayerFeeOverrideRow) =>
    aksi(async () => {
      await api(`/fees/player-overrides/${r.playerId}`, { method: "DELETE" });
      setPesan(`${r.playerName} kembali memakai tarif KU.`);
      await Promise.all([muatDaftar(), muatPemain()]);
    });

  return (
    <section class="master" aria-label="Tarif khusus pemain">
      <h2>Tarif khusus per pemain</h2>
      <p class="petunjuk">
        Untuk keringatan, saudara kandung, atau keadaan lain. Tarif khusus menggantikan tarif KU. Isi 0 bila pemain itu tidak ikut ditagih. Berlaku untuk
        tagihan yang dibuat sesudahnya; tagihan lama tidak berubah.
      </p>
      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>
      <Show when={pesan()}>
        <div class="info" role="status">
          {pesan()}
        </div>
      </Show>
      <form class="form" onSubmit={simpan}>
        <div class="field">
          <label for="pemain-khusus">Pemain</label>
          <select id="pemain-khusus" value={dipilih()} onChange={(e) => setDipilih(e.currentTarget.value)}>
            <option value="">Pilih pemain…</option>
            <For each={kandidat()}>
              {(p) => (
                <option value={p.id}>
                  {p.fullName} {p.ageGroup ? `• ${p.ageGroup.name}` : ""}
                </option>
              )}
            </For>
          </select>
          <span class="petunjuk">Hanya pemain aktif yang belum punya tarif khusus.</span>
        </div>
        <Field
          id="nominal-khusus"
          label="Nominal per bulan (Rp)"
          type="number"
          inputmode="numeric"
          value={nominal()}
          onInput={setNominal}
          hint="Isi 0 bila tidak ditagih."
        />
        <Field id="catatan-khusus" label="Alasan (boleh dikosongkan)" maxlength={120} value={catatan()} onInput={setCatatan} />
        <button class="tombol utama" type="submit" disabled={sibuk() || kandidat().length === 0}>
          {sibuk() ? "Menyimpan…" : "Simpan tarif khusus"}
        </button>
      </form>
      <Show when={daftar()} fallback={<p>Memuat…</p>}>
        <Show when={(daftar() ?? []).length > 0} fallback={<p class="kosong">Belum ada tarif khusus. Semua pemain memakai tarif KU.</p>}>
          <ul class="spp-daftar">
            <For each={daftar()}>
              {(r) => (
                <li>
                  <div class="spp-baris">
                    <div class="undangan-info">
                      <strong>{r.playerName}</strong>
                      <span class="petunjuk">
                        {r.ageGroup ?? "Tanpa KU"}
                        {r.note ? ` • ${r.note}` : ""}
                      </span>
                    </div>
                    <div class="spp-angka">
                      <strong>{rupiah(r.monthlyFee)}</strong>
                      <Show when={r.monthlyFee === 0}>
                        <span class="petunjuk">tidak ditagih</span>
                      </Show>
                    </div>
                    <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk()} onClick={() => buang(r)}>
                      Kembali ke tarif KU
                    </button>
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
