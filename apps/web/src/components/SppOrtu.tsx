import { createMemo, createResource, For, Show } from "solid-js";
import { api } from "~/lib/api";
import { tanggal } from "~/lib/pemain";
import { namaBulan, rupiah } from "~/lib/waktu";
import type { FeePublicInfo, InvoiceRow, PaymentMethod } from "@ssb/shared";
import Kerangka from "~/components/Kerangka";

const metodeLabel: Record<PaymentMethod, string> = { tunai: "Tunai", transfer: "Transfer", lainnya: "Lainnya" };

/** Tagihan SPP anak untuk orang tua: sisa yang harus dibayar, jatuh tempo, dan riwayat pembayaran. */
export default function SppOrtu() {
  const [rows] = createResource(() => api<InvoiceRow[]>("/invoices").catch(() => [] as InvoiceRow[]));
  const [info] = createResource(() => api<FeePublicInfo>("/fees/public-info").catch(() => null));
  const aktif = createMemo(() => (rows() ?? []).filter((r) => r.status !== "dibatalkan"));
  const perAnak = createMemo(() => {
    const m = new Map<string, { nama: string; ku: string | null; list: InvoiceRow[] }>();
    for (const r of aktif()) {
      const g = m.get(r.player.id) ?? { nama: r.player.name, ku: r.player.ageGroup, list: [] };
      g.list.push(r);
      m.set(r.player.id, g);
    }
    return [...m.entries()];
  });
  const total = createMemo(() => aktif().reduce((s, r) => s + r.remaining, 0));
  const menunggak = createMemo(() => aktif().filter((r) => r.overdue).length);

  return (
    <Show when={rows()} fallback={<Kerangka />}>
      <Show when={aktif().length > 0} fallback={<p class="kosong">Belum ada tagihan SPP untuk anak Anda.</p>}>
        <section class="statistik uang" aria-label="Ringkasan SPP">
          <div class="ubin" classList={{ perhatian: menunggak() > 0 }}>
            <span class="label-ubin">Belum dibayar</span>
            <span class="angka-ubin">{rupiah(total())}</span>
            <span class="petunjuk">
              {menunggak() > 0 ? `${menunggak()} tagihan lewat jatuh tempo` : total() > 0 ? "Belum ada yang lewat jatuh tempo" : "Semua tagihan lunas"}
            </span>
          </div>
        </section>
        <p class="petunjuk">Pembayaran dilakukan langsung ke SSB. Status berubah setelah admin SSB mencatat pembayaran Anda.</p>
        <Show when={info()?.bankInfo}>
          <div class="info">
            <strong>Cara pembayaran</strong>
            <p>{info()!.bankInfo}</p>
          </div>
        </Show>
        <For each={perAnak()}>
          {([id, g]) => (
            <section class="master" aria-label={`SPP ${g.nama}`}>
              <h2>
                {g.nama} <span class="petunjuk">{g.ku}</span>
              </h2>
              <ul class="spp-daftar">
                <For each={g.list}>
                  {(r) => (
                    <li data-id={id}>
                      <div class="spp-baris">
                        <div class="undangan-info">
                          <strong>SPP {namaBulan(r.month)}</strong>
                          <span class="petunjuk">Jatuh tempo {tanggal(r.dueOn)}</span>
                        </div>
                        <div class="spp-angka">
                          <strong>{rupiah(r.amount)}</strong>
                          <Show when={r.status === "sebagian"}>
                            <span class="petunjuk">sisa {rupiah(r.remaining)}</span>
                          </Show>
                        </div>
                        <span class="status-undangan" data-status={r.status === "lunas" ? "diterima" : r.overdue ? "kedaluwarsa" : undefined}>
                          {r.status === "lunas" ? "Lunas" : r.overdue ? "Menunggak" : r.status === "sebagian" ? "Sebagian" : "Belum bayar"}
                        </span>
                      </div>
                      <Show when={r.payments.length > 0}>
                        <ul class="spp-bayar">
                          <For each={r.payments}>
                            {(p) => (
                              <li>
                                <span>
                                  {rupiah(p.amount)} • {tanggal(p.paidOn)} • {metodeLabel[p.method]}
                                </span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </Show>
    </Show>
  );
}
