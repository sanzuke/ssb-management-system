import { createSignal, For, onMount, Show } from "solid-js";
import { api } from "~/lib/api";
import type { MviGuardianResult, MviPlayerView, MviResult } from "@ssb/shared";

const koma = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/**
 * Indeks nilai siswa. Staf melihat angka, kategori, dan rincian tiap komponen dengan sumber datanya; orang tua hanya kategori
 * anaknya per periode (setelah penilaian periode itu terbit). Ini ukuran relatif terhadap teman satu KU, bukan harga atau ramalan.
 */
export default function IndeksNilai(props: { playerId: string }) {
  const [view, setView] = createSignal<MviPlayerView | null>(null);
  const [selesai, setSelesai] = createSignal(false);

  onMount(async () => {
    setView(await api<MviPlayerView>(`/players/${encodeURIComponent(props.playerId)}/market-value`).catch(() => null));
    setSelesai(true);
  });

  const staf = (): MviResult[] | null => {
    const v = view();
    return v?.role === "staff" ? v.items : null;
  };
  const ortu = (): MviGuardianResult[] | null => {
    const v = view();
    return v?.role === "guardian" ? v.items : null;
  };

  return (
    <Show when={selesai()}>
      <Show when={ortu()}>
        {(items) => (
          <Show when={items().length > 0}>
            <section class="panel-nilai" aria-label="Indeks nilai">
              <div class="panel-kepala">
                <h3>Indeks nilai</h3>
              </div>
              <ul class="daftar-sesi">
                <For each={items()}>
                  {(i) => (
                    <li class="baris-sesi">
                      <strong>{i.period.name}</strong>
                      <span class="lencana-status" data-s="Berjalan">
                        {i.category}
                      </span>
                    </li>
                  )}
                </For>
              </ul>
              <p class="petunjuk">Gambaran perkembangan dibanding teman satu KU, dari penilaian pelatih dan data lain. Bukan peringkat resmi.</p>
            </section>
          </Show>
        )}
      </Show>

      <Show when={staf()}>
        {(items) => (
          <section class="panel-nilai" aria-label="Indeks nilai">
            <Show
              when={items().length > 0}
              fallback={
                <>
                  <div class="panel-kepala">
                    <h3>Indeks nilai</h3>
                  </div>
                  <p class="petunjuk">Belum dihitung. Hitung dari halaman Indeks nilai setelah penilaian, statistik laga, atau tes kebugaran diisi.</p>
                </>
              }
            >
              {(() => {
                const terbaru = () => items()[0]!;
                const kurang = () => terbaru().components.filter((c) => c.score === null).map((c) => c.label.toLowerCase());
                return (
                  <>
                    <div class="panel-kepala">
                      <h3>Indeks nilai · {terbaru().period.name}</h3>
                      <span class="petunjuk">
                        {terbaru().ageGroup.name} · data terisi {terbaru().coverage}%
                      </span>
                    </div>
                    <Show
                      when={terbaru().mvi !== null}
                      fallback={
                        <p class="petunjuk">
                          Data belum cukup untuk indeks. Perlu penilaian pelatih dan minimal satu dari statistik laga atau tes kebugaran. Yang belum ada: {kurang().join(", ")}.
                        </p>
                      }
                    >
                      <p>
                        <strong style={{ "font-size": "2rem" }}>{terbaru().mvi}</strong> <span class="petunjuk">dari 100</span>{" "}
                        <span class="lencana-status" data-s="Berjalan">
                          {terbaru().category}
                        </span>
                      </p>
                    </Show>
                    <ul class="daftar-sesi">
                      <For each={terbaru().components}>
                        {(c) => (
                          <li class="baris-sesi">
                            <div class="info-sesi">
                              <strong>
                                {c.label} <span class="petunjuk">bobot {c.weight}%</span>
                              </strong>
                              <Show when={c.score !== null}>
                                <div class="batang" role="progressbar" aria-label={c.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.score ?? 0}>
                                  <span style={{ width: `${c.score}%` }} />
                                </div>
                              </Show>
                              <span class="petunjuk">
                                {c.score !== null ? `${koma(c.score)} · ` : "Belum ada · "}
                                {c.detail}
                              </span>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>
                    <Show when={items().length > 1}>
                      <p class="petunjuk">
                        Periode sebelumnya:{" "}
                        {items()
                          .slice(1)
                          .map((i) => `${i.period.name} ${i.mvi ?? "belum cukup data"}${i.category ? ` (${i.category})` : ""}`)
                          .join(" · ")}
                      </p>
                    </Show>
                    <p class="petunjuk">Relatif terhadap teman satu KU, bukan harga atau ramalan. Bobot dan ambang masih perlu divalidasi pelatih berlisensi.</p>
                  </>
                );
              })()}
            </Show>
          </section>
        )}
      </Show>
    </Show>
  );
}
