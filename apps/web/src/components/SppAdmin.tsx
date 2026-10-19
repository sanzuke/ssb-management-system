import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import { bulanIni, hariIni, namaBulan, rupiah } from "~/lib/waktu";
import { tanggal } from "~/lib/pemain";
import type { FeeRate, FeeSummary, GenerateInvoicesResult, InvoiceRow, PaymentMethod } from "@ssb/shared";
import Field from "./Field";
import SelectField from "./SelectField";

type Saring = "semua" | "belum" | "terlambat" | "lunas";
const metodeLabel: Record<PaymentMethod, string> = { tunai: "Tunai", transfer: "Transfer", lainnya: "Lainnya" };
const statusLabel: Record<InvoiceRow["status"], string> = { belum: "Belum bayar", sebagian: "Sebagian", lunas: "Lunas", dibatalkan: "Dibatalkan" };

/** Keuangan SPP untuk admin: ringkasan bulan, tarif per KU, pembuatan tagihan, dan pencatatan pembayaran. */
export default function SppAdmin() {
  const [bulan, setBulan] = createSignal(bulanIni());
  const [saring, setSaring] = createSignal<Saring>("semua");
  const [pesan, setPesan] = createSignal("");
  const [galat, setGalat] = createSignal("");
  const [sibuk, setSibuk] = createSignal("");
  const [jatuhTempo, setJatuhTempo] = createSignal("10");
  const [buka, setBuka] = createSignal<string | null>(null);
  const [jumlah, setJumlah] = createSignal("");
  const [tglBayar, setTglBayar] = createSignal(hariIni());
  const [metode, setMetode] = createSignal<PaymentMethod>("tunai");
  const [catatan, setCatatan] = createSignal("");
  const [tarif, setTarif] = createSignal<Record<string, string>>({});

  const [rows, { refetch: muatTagihan }] = createResource(bulan, (b) => api<InvoiceRow[]>(`/invoices?month=${b}`).catch(() => [] as InvoiceRow[]));
  const [ringkas, { refetch: muatRingkas }] = createResource(bulan, (b) => api<FeeSummary>(`/fees/summary?month=${b}`).catch(() => null));
  const [rates, { refetch: muatTarif }] = createResource(async () => {
    const r = await api<FeeRate[]>("/fees/rates").catch(() => [] as FeeRate[]);
    setTarif(Object.fromEntries(r.map((x) => [x.ageGroupId, x.monthlyFee === null ? "" : String(x.monthlyFee)])));
    return r;
  });

  const muatUlang = async () => {
    await Promise.all([muatTagihan(), muatRingkas()]);
  };
  const tampil = createMemo(() =>
    (rows() ?? []).filter((r) => {
      switch (saring()) {
        case "belum":
          return r.status === "belum" || r.status === "sebagian";
        case "terlambat":
          return r.overdue;
        case "lunas":
          return r.status === "lunas";
        default:
          return true;
      }
    }),
  );
  const aksi = async (kunci: string, kerja: () => Promise<void>) => {
    setGalat("");
    setSibuk(kunci);
    try {
      await kerja();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk("");
    }
  };

  const simpanTarif = () =>
    aksi("tarif", async () => {
      const list = (rates() ?? []).map((r) => ({ ageGroupId: r.ageGroupId, monthlyFee: tarif()[r.ageGroupId]?.trim() ? Number(tarif()[r.ageGroupId]) : null }));
      if (list.some((r) => r.monthlyFee !== null && !Number.isInteger(r.monthlyFee)))
        throw new ApiError(400, "bad_request", "Tarif harus berupa angka bulat tanpa titik atau koma", {});
      await api("/fees/rates", { method: "PUT", body: { rates: list } });
      setPesan("Tarif disimpan. Tagihan yang sudah dibuat tidak berubah.");
      await muatTarif();
    });
  const buatTagihan = () =>
    aksi("buat", async () => {
      const r = await api<GenerateInvoicesResult>("/invoices/generate", { method: "POST", body: { month: bulan(), dueDay: Number(jatuhTempo()) } });
      setPesan(
        `${r.created} tagihan dibuat untuk ${namaBulan(bulan())}${r.existing ? `, ${r.existing} sudah ada sebelumnya` : ""}${r.withoutRate ? `. ${r.withoutRate} pemain aktif dilewati karena KU-nya belum bertarif atau belum punya KU` : ""}.`,
      );
      await muatUlang();
    });
  const bukaBayar = (r: InvoiceRow) => {
    setBuka(buka() === r.id ? null : r.id);
    setJumlah(String(r.remaining));
    setTglBayar(hariIni());
    setMetode("tunai");
    setCatatan("");
    setGalat("");
  };
  const catatBayar = (r: InvoiceRow) =>
    aksi(r.id, async () => {
      await api(`/invoices/${r.id}/payments`, {
        method: "POST",
        body: { amount: Number(jumlah()), paidOn: tglBayar(), method: metode(), note: catatan().trim() || undefined },
      });
      setBuka(null);
      setPesan(`Pembayaran ${r.player.name} dicatat.`);
      await muatUlang();
    });
  const hapusBayar = (id: string) =>
    aksi(id, async () => {
      await api(`/payments/${id}`, { method: "DELETE" });
      await muatUlang();
    });
  const batalkan = (r: InvoiceRow) =>
    aksi(r.id, async () => {
      await api(`/invoices/${r.id}/void`, { method: "POST" });
      await muatUlang();
    });

  return (
    <>
      <div class="spp-bulan">
        <Field id="bulan" label="Bulan tagihan" type="month" value={bulan()} onInput={(v) => v && setBulan(v)} />
        <div class="spp-buat">
          <SelectField
            id="jatuh"
            label="Jatuh tempo tanggal"
            value={jatuhTempo()}
            onInput={setJatuhTempo}
            options={[1, 5, 10, 15, 20, 25, 28].map((d) => ({ value: String(d), label: String(d) }))}
          />
          <button class="tombol utama" type="button" disabled={sibuk() === "buat"} onClick={buatTagihan}>
            {sibuk() === "buat" ? "Membuat…" : `Buat tagihan ${namaBulan(bulan())}`}
          </button>
        </div>
      </div>

      <Show when={pesan()}>
        <div class="info" role="status">
          {pesan()}
        </div>
      </Show>
      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>

      <Show when={ringkas()}>
        {(s) => (
          <section class="statistik uang" aria-label={`Ringkasan ${namaBulan(bulan())}`}>
            <div class="ubin">
              <span class="label-ubin">Ditagih</span>
              <span class="angka-ubin">{rupiah(s().billed)}</span>
              <span class="petunjuk">{s().invoices} tagihan</span>
            </div>
            <div class="ubin">
              <span class="label-ubin">Sudah dibayar</span>
              <span class="angka-ubin">{rupiah(s().paid)}</span>
              <span class="petunjuk">{s().settledInvoices} tagihan lunas</span>
            </div>
            <div class="ubin" classList={{ perhatian: s().outstanding > 0 && s().overdueInvoices > 0 }}>
              <span class="label-ubin">Belum dibayar</span>
              <span class="angka-ubin">{rupiah(s().outstanding)}</span>
              <span class="petunjuk">{s().invoices - s().settledInvoices} tagihan belum lunas</span>
            </div>
            <div class="ubin" classList={{ perhatian: s().overdueInvoices > 0 }}>
              <span class="label-ubin">Lewat jatuh tempo</span>
              <span class="angka-ubin">{s().overdueInvoices}</span>
              <span class="petunjuk">tagihan menunggak</span>
            </div>
          </section>
        )}
      </Show>

      <section class="master" aria-label="Tagihan">
        <h2>Tagihan {namaBulan(bulan())}</h2>
        {/* biome-ignore lint/a11y/useSemanticElements: deretan penyaring status */}
        <div class="tab-periode" role="group" aria-label="Saring status">
          <For each={["semua", "belum", "terlambat", "lunas"] as Saring[]}>
            {(s) => (
              <button type="button" aria-pressed={saring() === s} onClick={() => setSaring(s)}>
                {{ semua: "Semua", belum: "Belum lunas", terlambat: "Menunggak", lunas: "Lunas" }[s]}
              </button>
            )}
          </For>
        </div>
        <Show when={rows()} fallback={<p>Memuat…</p>}>
          <Show
            when={tampil().length > 0}
            fallback={
              <p class="kosong">
                {(rows() ?? []).length === 0
                  ? "Belum ada tagihan bulan ini. Atur tarif tiap KU di bawah, lalu tekan Buat tagihan."
                  : "Tidak ada tagihan pada saringan ini."}
              </p>
            }
          >
            <ul class="spp-daftar">
              <For each={tampil()}>
                {(r) => (
                  <li>
                    <div class="spp-baris">
                      <div class="undangan-info">
                        <strong>{r.player.name}</strong>
                        <span class="petunjuk">
                          {r.player.ageGroup ?? "Tanpa KU"} • jatuh tempo {tanggal(r.dueOn)}
                        </span>
                      </div>
                      <div class="spp-angka">
                        <strong>{rupiah(r.amount)}</strong>
                        <Show when={r.status === "sebagian"}>
                          <span class="petunjuk">sisa {rupiah(r.remaining)}</span>
                        </Show>
                      </div>
                      <span class="status-undangan" data-status={r.status === "lunas" ? "diterima" : r.overdue ? "kedaluwarsa" : undefined}>
                        {r.overdue ? "Menunggak" : statusLabel[r.status]}
                      </span>
                    </div>
                    <Show when={r.status !== "dibatalkan"}>
                      <div class="aksi-baris">
                        <Show when={r.remaining > 0}>
                          <button class="tombol tipis tombol-kecil" type="button" onClick={() => bukaBayar(r)}>
                            {buka() === r.id ? "Tutup" : "Catat pembayaran"}
                          </button>
                        </Show>
                        <Show when={r.payments.length === 0}>
                          <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk() === r.id} onClick={() => batalkan(r)}>
                            Batalkan tagihan
                          </button>
                        </Show>
                      </div>
                    </Show>
                    <Show when={r.payments.length > 0}>
                      <ul class="spp-bayar">
                        <For each={r.payments}>
                          {(p) => (
                            <li>
                              <span>
                                {rupiah(p.amount)} • {tanggal(p.paidOn)} • {metodeLabel[p.method]}
                                <Show when={p.note}> • {p.note}</Show>
                                <Show when={p.recordedBy}>
                                  <span class="petunjuk"> (dicatat {p.recordedBy})</span>
                                </Show>
                              </span>
                              <button
                                class="tombol tipis tombol-kecil"
                                type="button"
                                disabled={sibuk() === p.id}
                                onClick={() => hapusBayar(p.id)}
                                aria-label="Hapus catatan pembayaran ini"
                              >
                                Hapus
                              </button>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Show>
                    <Show when={buka() === r.id}>
                      <form
                        class="form spp-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          catatBayar(r);
                        }}
                      >
                        <Field
                          id={`jml-${r.id}`}
                          label="Jumlah (Rp)"
                          type="number"
                          inputmode="numeric"
                          required
                          value={jumlah()}
                          onInput={setJumlah}
                          hint={`Sisa tagihan ${rupiah(r.remaining)}`}
                        />
                        <Field id={`tgl-${r.id}`} label="Tanggal bayar" type="date" required value={tglBayar()} onInput={setTglBayar} />
                        <SelectField
                          id={`met-${r.id}`}
                          label="Cara bayar"
                          value={metode()}
                          onInput={(v) => setMetode(v as PaymentMethod)}
                          options={Object.entries(metodeLabel).map(([value, label]) => ({ value, label }))}
                        />
                        <Field id={`cat-${r.id}`} label="Catatan (boleh dikosongkan)" maxlength={200} value={catatan()} onInput={setCatatan} />
                        <button class="tombol utama" type="submit" disabled={sibuk() === r.id}>
                          {sibuk() === r.id ? "Menyimpan…" : "Simpan pembayaran"}
                        </button>
                      </form>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </section>

      <details class="master spp-tarif" open={(rates() ?? []).every((r) => r.monthlyFee === null)}>
        <summary>Tarif SPP per KU</summary>
        <Show when={rates()} fallback={<p>Memuat…</p>}>
          <Show when={(rates() ?? []).length > 0} fallback={<p class="kosong">Belum ada KU. Buat KU di Data master dulu.</p>}>
            <p class="petunjuk">Rupiah per bulan. Kosongkan bila KU itu tidak ditagih. Perubahan tarif hanya berlaku untuk tagihan yang dibuat sesudahnya.</p>
            <form
              class="form"
              onSubmit={(e) => {
                e.preventDefault();
                simpanTarif();
              }}
            >
              <For each={rates()}>
                {(r) => (
                  <Field
                    id={`tarif-${r.ageGroupId}`}
                    label={`${r.name} (${r.activePlayers} pemain aktif)`}
                    type="number"
                    inputmode="numeric"
                    value={tarif()[r.ageGroupId] ?? ""}
                    onInput={(v) => setTarif({ ...tarif(), [r.ageGroupId]: v })}
                  />
                )}
              </For>
              <button class="tombol utama" type="submit" disabled={sibuk() === "tarif"}>
                {sibuk() === "tarif" ? "Menyimpan…" : "Simpan tarif"}
              </button>
            </form>
          </Show>
        </Show>
      </details>
    </>
  );
}
