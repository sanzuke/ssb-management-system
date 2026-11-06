import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import InputIndeks from "~/components/InputIndeks";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { hariIni } from "~/lib/waktu";
import { MVI_LABEL, type AgeGroup, type MviRanking, type Period } from "@ssb/shared";

const posisi: Record<string, string> = { GK: "Kiper", DF: "Bek", MF: "Gelandang", FW: "Penyerang" };

/** Periode yang sedang berjalan, atau yang terbaru bila tidak ada. */
const periodeAwal = (daftar: Period[]): string => {
  const hari = hariIni();
  const jalan = daftar.find((p) => p.startDate <= hari && hari <= p.endDate);
  return (jalan ?? [...daftar].sort((a, b) => b.startDate.localeCompare(a.startDate))[0])?.id ?? "";
};

export default function Indeks() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [periods, setPeriods] = createSignal<Period[]>([]);
  const [ku, setKu] = createSignal("");
  const [periode, setPeriode] = createSignal("");
  const [data, setData] = createSignal<MviRanking | null>(null);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  const [buka, setBuka] = createSignal<string | null>(null);

  const bisaTulis = () => ["admin_ssb", "pelatih"].includes(me()?.active?.role ?? "");
  const namaPeriode = () => periods().find((p) => p.id === periode())?.name ?? "";

  const muat = async () => {
    if (!ku() || !periode()) return setData(null);
    try {
      setData(await api<MviRanking>(`/market-value?ageGroupId=${encodeURIComponent(ku())}&periodId=${encodeURIComponent(periode())}`));
      setError("");
    } catch {
      setError("Peringkat tidak bisa dimuat. Muat ulang halaman.");
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active || m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    const [g, p] = await Promise.all([api<AgeGroup[]>("/age-groups").catch(() => [] as AgeGroup[]), api<Period[]>("/periods").catch(() => [] as Period[])]);
    setGroups(g);
    setPeriods(p);
    setKu(g[0]?.id ?? "");
    setPeriode(periodeAwal(p));
    await muat();
  });

  const hitung = async () => {
    setSibuk(true);
    setNotice("");
    try {
      setData(await api<MviRanking>("/market-value/compute", { method: "POST", body: { ageGroupId: ku(), periodId: periode() } }));
      setError("");
      setNotice("Indeks dihitung ulang dari data terbaru.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Indeks nilai · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Indeks nilai"
          judul="Indeks nilai siswa"
          sub="Gambaran perkembangan siswa dibanding teman satu KU, dari penilaian pelatih, performa laga, kebugaran, kehadiran, dan usia. Bukan harga dan bukan peringkat resmi."
        >
          <Show when={bisaTulis()}>
            <button class="tombol utama tambah" type="button" disabled={sibuk() || !ku() || !periode()} onClick={hitung}>
              {sibuk() ? "Menghitung…" : "Hitung ulang"}
            </button>
          </Show>
        </KepalaHalaman>

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

        <section class="bilah-filter" aria-label="Pilih KU dan periode">
          <select
            aria-label="Kelompok umur"
            value={ku()}
            onChange={async (e) => {
              setKu(e.currentTarget.value);
              setBuka(null);
              await muat();
            }}
          >
            <For each={groups()}>
              {(g) => (
                <option value={g.id} selected={ku() === g.id}>
                  {g.name}
                </option>
              )}
            </For>
          </select>
          <select
            aria-label="Periode"
            value={periode()}
            onChange={async (e) => {
              setPeriode(e.currentTarget.value);
              setBuka(null);
              await muat();
            }}
          >
            <For each={periods()}>
              {(p) => (
                <option value={p.id} selected={periode() === p.id}>
                  {p.name}
                </option>
              )}
            </For>
          </select>
        </section>

        <Show when={data() && data()!.rows.length === 0}>
          <p class="kosong">Tidak ada siswa aktif di KU ini yang bisa Anda lihat.</p>
        </Show>

        <Show when={data() && data()!.rows.length > 0}>
          <div class="tabel-bungkus">
            <table class="tabel-pemain">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Siswa</th>
                  <th>Posisi</th>
                  <th>Indeks</th>
                  <th>Kategori</th>
                  <th>Data terisi</th>
                  <th>Belum ada</th>
                  <Show when={bisaTulis()}>
                    <th>Aksi</th>
                  </Show>
                </tr>
              </thead>
              <tbody>
                <For each={data()!.rows}>
                  {(r, i) => (
                    <>
                      <tr>
                        <td>{r.mvi === null ? "-" : i() + 1}</td>
                        <td>
                          <A href={`/pemain/${r.playerId}`}>{r.fullName}</A>
                        </td>
                        <td>{r.position ? (posisi[r.position] ?? r.position) : "-"}</td>
                        <td>{r.mvi ?? "Belum cukup data"}</td>
                        <td>
                          <Show when={r.category} fallback="-">
                            <span class="lencana-status" data-s="Berjalan">
                              {r.category}
                            </span>
                          </Show>
                        </td>
                        <td>{r.computedAt ? `${r.coverage}%` : "Belum dihitung"}</td>
                        <td class="petunjuk">{r.computedAt ? r.kurang.map((k) => MVI_LABEL[k].toLowerCase()).join(", ") || "-" : "-"}</td>
                        <Show when={bisaTulis()}>
                          <td>
                            <button class="tombol tipis" type="button" aria-expanded={buka() === r.playerId} onClick={() => setBuka(buka() === r.playerId ? null : r.playerId)}>
                              {buka() === r.playerId ? "Tutup" : "Isi data"}
                            </button>
                          </td>
                        </Show>
                      </tr>
                      <Show when={bisaTulis() && buka() === r.playerId}>
                        <tr>
                          <td colSpan={8}>
                            <InputIndeks
                              playerId={r.playerId}
                              periodId={periode()}
                              periodName={namaPeriode()}
                              onSaved={(pesan) => {
                                setNotice(pesan);
                              }}
                            />
                          </td>
                        </tr>
                      </Show>
                    </>
                  )}
                </For>
              </tbody>
            </table>
          </div>
          <p class="petunjuk">
            Indeks dibandingkan dalam KU yang sama, bukan antar KU. Siswa tanpa indeks belum punya penilaian pelatih dan minimal satu dari statistik laga atau tes kebugaran. Bobot dan ambang masih perlu divalidasi pelatih berlisensi.
          </p>
        </Show>
      </main>
    </Show>
  );
}
