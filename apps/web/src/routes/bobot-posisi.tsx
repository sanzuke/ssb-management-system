import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import type { AssessmentIndicator, PositionWeights } from "@ssb/shared";
import { positionLabel, positions, WEIGHT_MAX } from "@ssb/shared";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe, type Me } from "~/lib/api";

const pilihan = Array.from({ length: WEIGHT_MAX + 1 }, (_, i) => i);

/** Bobot tiap indikator untuk tiap posisi, dipakai menghitung kecocokan posisi di profil siswa. Admin mengubah; staf lain membaca. */
export default function BobotPosisi() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [bobot, setBobot] = createSignal<PositionWeights | null>(null);
  const [indikator, setIndikator] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  const [konfirmasi, setKonfirmasi] = createSignal(false);

  const admin = () => me()?.active?.role === "admin_ssb";

  const muat = async () => {
    const [b, ind] = await Promise.all([api<PositionWeights>("/position-weights"), api<AssessmentIndicator[]>("/assessment-indicators").catch(() => [])]);
    setBobot(b);
    // Nama indikator: yang ada di bobot (bawaan dan buatan SSB) ditambah indikator yang dipakai KU, tanpa duplikat.
    const nama = new Set<string>();
    for (const p of positions) for (const n of Object.keys(b[p])) nama.add(n);
    for (const i of ind) nama.add(i.name);
    setIndikator([...nama]);
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active || m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    await muat().catch(() => setError("Bobot tidak bisa dimuat. Muat ulang halaman."));
  });

  const nilai = (p: (typeof positions)[number], nama: string) => bobot()?.[p][nama] ?? 0;
  const ubah = (p: (typeof positions)[number], nama: string, v: number) => {
    setNotice("");
    setBobot((b) => (b ? { ...b, [p]: { ...b[p], [nama]: v } } : b));
  };

  const simpan = async () => {
    setSibuk(true);
    setError("");
    setNotice("");
    try {
      setBobot(await api<PositionWeights>("/position-weights", { method: "PUT", body: { weights: bobot() } }));
      setNotice("Bobot disimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa menyimpan. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };
  const kembalikan = async () => {
    setKonfirmasi(false);
    setSibuk(true);
    setError("");
    try {
      await api("/position-weights", { method: "DELETE" });
      await muat();
      setNotice("Bobot dikembalikan ke bawaan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa mengembalikan. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  const jumlah = createMemo(() => Object.fromEntries(positions.map((p) => [p, indikator().reduce((t, n) => t + nilai(p, n), 0)])));

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Bobot posisi · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Penilaian"
          judul="Bobot posisi"
          sub={`Seberapa berpengaruh tiap indikator pada kecocokan posisi di profil siswa. Skala 0 (tidak dihitung) sampai ${WEIGHT_MAX}. Hasilnya hanya saran, dan hanya tampil untuk siswa usia 10 tahun ke atas.${admin() ? "" : " Hanya admin SSB yang bisa mengubahnya."}`}
        />
        <p>
          <A href="/indikator">← Indikator penilaian</A>
        </p>
        <Show when={error()}>
          <div class="peringatan" role="alert">
            {error()}
          </div>
        </Show>
        <Show when={notice()}>
          <div class="info" role="status">
            {notice()}
          </div>
        </Show>

        <Show when={bobot()}>
          <div class="tabel-bungkus">
            <table class="tabel-bobot">
              <thead>
                <tr>
                  <th class="kolom-nama">Indikator</th>
                  <For each={positions}>{(p) => <th>{positionLabel[p]}</th>}</For>
                </tr>
              </thead>
              <tbody>
                <For each={indikator()}>
                  {(n) => (
                    <tr>
                      <th scope="row" class="kolom-nama">
                        {n}
                      </th>
                      <For each={positions}>
                        {(p) => (
                          <td>
                            <select
                              aria-label={`Bobot ${n} untuk ${positionLabel[p]}`}
                              disabled={!admin() || sibuk()}
                              value={String(nilai(p, n))}
                              onChange={(e) => ubah(p, n, Number(e.currentTarget.value))}
                            >
                              <For each={pilihan}>
                                {(v) => (
                                  <option value={String(v)} selected={nilai(p, n) === v}>
                                    {v}
                                  </option>
                                )}
                              </For>
                            </select>
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
              <tfoot>
                <tr>
                  <th class="kolom-nama">Jumlah bobot</th>
                  <For each={positions}>{(p) => <td>{jumlah()[p]}</td>}</For>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="petunjuk">Posisi baru dianggap cukup data bila indikator yang dinilai mencakup separuh atau lebih dari jumlah bobotnya.</p>

          <Show when={admin()}>
            <div class="aksi-baris">
              <button class="tombol utama" type="button" disabled={sibuk()} onClick={simpan}>
                {sibuk() ? "Menyimpan…" : "Simpan bobot"}
              </button>
              <Show
                when={konfirmasi()}
                fallback={
                  <button class="tombol tipis" type="button" disabled={sibuk()} onClick={() => setKonfirmasi(true)}>
                    Kembalikan ke bawaan
                  </button>
                }
              >
                <button class="tombol bahaya" type="button" onClick={kembalikan}>
                  Ya, kembalikan
                </button>
                <button class="tombol tipis" type="button" onClick={() => setKonfirmasi(false)}>
                  Batal
                </button>
              </Show>
            </div>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
