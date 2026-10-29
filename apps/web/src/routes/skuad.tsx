import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { assessmentAspects, type AssessmentAspect, aspectLabel, pitaDari } from "@ssb/shared/aspects";
import type { AgeGroup, PlayerSummary, SquadRow } from "@ssb/shared";
import { createMemo, createResource, createSignal, For, onMount, Show } from "solid-js";
import Ikon from "~/components/Ikon";
import Memuat from "~/components/Memuat";
import { api, getMe, type Me } from "~/lib/api";
import { inisial, posisiLabel } from "~/lib/pemain";

const koma = (n: number) => String(n).replace(".", ",");
const singkat: Record<AssessmentAspect, string> = {
  technical: "TEK",
  physical: "FIS",
  tactical: "TAK",
  mental: "MEN",
  movement: "GER",
  game_intelligence: "KEC",
};
type Kunci = "nama" | "rating" | "tren" | AssessmentAspect;
type Baris = { p: PlayerSummary; s: SquadRow | undefined };

const nilaiAspek = (b: Baris, a: AssessmentAspect) => b.s?.aspects.find((x) => x.aspect === a)?.average ?? null;
/** Angka untuk diurutkan; null = belum ada nilai dan selalu di ujung. */
const angka = (b: Baris, k: Kunci): number | null => {
  if (k === "rating") return b.s?.overall ?? null;
  if (k === "tren") return b.s?.tren.selisih ?? null;
  if (k === "nama") return null;
  return nilaiAspek(b, k);
};
const labelTren = (s: SquadRow["tren"]) =>
  s.arah === "baru" ? "Baru" : s.arah === "naik" ? `▲ +${koma(s.selisih!)}` : s.arah === "turun" ? `▼ ${koma(s.selisih!)}` : "=";

export default function Skuad() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [ku, setKu] = createSignal("");
  const [q, setQ] = createSignal("");
  const [semuaStatus, setSemuaStatus] = createSignal(false);
  const [kunci, setKunci] = createSignal<Kunci>("rating");
  const [naik, setNaik] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active || m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    setGroups(await api<AgeGroup[]>("/age-groups").catch(() => []));
  });

  const [data] = createResource(
    () => (me() ? true : null),
    async () => {
      const [players, squad] = await Promise.all([api<PlayerSummary[]>("/players"), api<SquadRow[]>("/squad")]);
      const per = new Map(squad.map((s) => [s.playerId, s]));
      return players.map((p): Baris => ({ p, s: per.get(p.id) }));
    },
  );

  const baris = createMemo(() => {
    const kata = q().trim().toLowerCase();
    const list = (data() ?? []).filter(
      (b) =>
        (!ku() || (ku() === "none" ? !b.p.ageGroup : b.p.ageGroup?.id === ku())) &&
        (semuaStatus() || b.p.status === "aktif") &&
        (!kata || b.p.fullName.toLowerCase().includes(kata)),
    );
    const k = kunci();
    const arah = naik() ? 1 : -1;
    return [...list].sort((a, b) => {
      if (k === "nama") return arah * a.p.fullName.localeCompare(b.p.fullName, "id");
      const x = angka(a, k);
      const y = angka(b, k);
      if (x === null && y === null) return a.p.fullName.localeCompare(b.p.fullName, "id");
      if (x === null) return 1; // tanpa nilai selalu di bawah, apa pun arahnya
      if (y === null) return -1;
      return (x - y) * arah || a.p.fullName.localeCompare(b.p.fullName, "id");
    });
  });

  const urut = (k: Kunci) => {
    if (kunci() === k) setNaik(!naik());
    else {
      setKunci(k);
      setNaik(k === "nama"); // nama: A ke Z; angka: tertinggi dulu
    }
  };
  const ariaUrut = (k: Kunci) => (kunci() === k ? (naik() ? "ascending" : "descending") : "none");
  const Judul = (p: { k: Kunci; label: string; judul?: string; kelas?: string }) => (
    <th class={p.kelas} aria-sort={ariaUrut(p.k)} title={p.judul}>
      <button type="button" class="urut-kolom" onClick={() => urut(p.k)}>
        {p.label}
        <span aria-hidden="true">{kunci() === p.k ? (naik() ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
  );

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Skuad · SSB App</Title>
      <main class="halaman lebar">
        <header class="kepala-dashboard">
          <div>
            <p class="jejak">
              <span class="ortu-chip">Skuad</span>
              <span aria-hidden="true">/</span>
              <span>{me()!.active!.ssbName}</span>
            </p>
            <h1>Skuad</h1>
            <p class="petunjuk">
              Penilaian terbaru tiap pemain, termasuk yang belum terbit (ditandai *). Warna menunjukkan tahap, bukan peringkat. Tren membandingkan penilaian
              terbaru dengan rata-rata dua periode sebelumnya.
            </p>
          </div>
        </header>

        <section class="bilah-filter bilah-hadir" aria-label="Filter">
          <select aria-label="Kelompok umur" value={ku()} onChange={(e) => setKu(e.currentTarget.value)}>
            <option value="">Semua KU</option>
            <For each={groups()}>
              {(g) => (
                <option value={g.id} selected={ku() === g.id}>
                  {g.name}
                </option>
              )}
            </For>
            <option value="none">Tanpa KU</option>
          </select>
          <div class="kolom-cari">
            <Ikon nama="cari" ukuran={18} />
            <input type="search" placeholder="Cari nama pemain" aria-label="Cari pemain" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
          </div>
          <select
            aria-label="Urutkan"
            value={kunci()}
            onChange={(e) => {
              setKunci(e.currentTarget.value as Kunci);
              setNaik(e.currentTarget.value === "nama");
            }}
          >
            <option value="rating">Rating tertinggi</option>
            <option value="tren">Tren terbaik</option>
            <For each={assessmentAspects}>{(a) => <option value={a}>{aspectLabel[a]} tertinggi</option>}</For>
            <option value="nama">Urut nama</option>
          </select>
          <label class="centang-filter">
            <input type="checkbox" checked={semuaStatus()} onChange={(e) => setSemuaStatus(e.currentTarget.checked)} />
            Termasuk cuti dan keluar
          </label>
        </section>

        <Show when={data.error}>
          <div class="peringatan" role="alert">
            Skuad tidak bisa dimuat. Muat ulang halaman.
          </div>
        </Show>

        <Show when={data()}>
          <Show when={baris().length > 0} fallback={<p class="kosong">Tidak ada pemain pada pilihan ini.</p>}>
            <p class="petunjuk" aria-live="polite">
              {baris().length} pemain
            </p>
            <div class="tabel-bungkus">
              <table class="tabel-skuad">
                <thead>
                  <tr>
                    <Judul k="nama" label="Pemain" kelas="kolom-nama" />
                    <th>Pos</th>
                    <Judul k="rating" label="Rating" />
                    <For each={assessmentAspects}>{(a) => <Judul k={a} label={singkat[a]} judul={aspectLabel[a]} />}</For>
                    <Judul k="tren" label="Tren" />
                  </tr>
                </thead>
                <tbody>
                  <For each={baris()}>
                    {(b) => (
                      <tr>
                        <th scope="row" class="kolom-nama">
                          <A class="profil-baris" href={`/pemain/${b.p.id}`}>
                            <span class="ortu-foto kecil" aria-hidden="true">
                              {inisial(b.p.fullName)}
                            </span>
                            <span class="ortu-teks">
                              <strong>{b.p.fullName}</strong>
                              <span class="petunjuk">
                                {b.p.ageGroup?.name ?? "Tanpa KU"}
                                {b.s?.periodName ? ` • ${b.s.periodName}` : ""}
                              </span>
                            </span>
                          </A>
                        </th>
                        <td title={b.p.position ? posisiLabel[b.p.position] : undefined}>{b.p.position ?? "–"}</td>
                        <td class="sel-nilai sel-rating" data-pita={b.s?.overall == null ? undefined : String(pitaDari(b.s.overall).kode)}>
                          <Show when={b.s?.overall != null} fallback="–">
                            <span
                              role="img"
                              aria-label={`Rating ${koma(b.s!.overall!)}, ${pitaDari(b.s!.overall!).kata}${b.s!.published ? "" : ", belum terbit"}`}
                            >
                              {koma(b.s!.overall!)}
                              {b.s!.published ? "" : "*"}
                            </span>
                          </Show>
                        </td>
                        <For each={assessmentAspects}>
                          {(a) => (
                            <td class="sel-nilai" data-pita={nilaiAspek(b, a) === null ? undefined : String(pitaDari(nilaiAspek(b, a)!).kode)}>
                              <Show when={nilaiAspek(b, a) !== null} fallback="–">
                                <span role="img" aria-label={`${aspectLabel[a]} ${koma(nilaiAspek(b, a)!)}, ${pitaDari(nilaiAspek(b, a)!).kata}`}>
                                  {koma(nilaiAspek(b, a)!)}
                                </span>
                              </Show>
                            </td>
                          )}
                        </For>
                        <td class="sel-tren" data-arah={b.s?.tren.arah ?? "baru"}>
                          {b.s ? labelTren(b.s.tren) : "–"}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
