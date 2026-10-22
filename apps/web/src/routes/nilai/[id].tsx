import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import GrafikNilai from "~/components/GrafikNilai";
import HasilNilai from "~/components/HasilNilai";
import RencanaBaca from "~/components/RencanaBaca";
import SelectField from "~/components/SelectField";
import Memuat from "~/components/Memuat";
import Kerangka from "~/components/Kerangka";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { assessmentAspects, aspectLabel } from "@ssb/shared/aspects";
import type { AssessmentHistoryRow, AssessmentIndicator, AssessmentView, DevelopmentPlanItem, Period, PlayerDetail } from "@ssb/shared";

const tgl = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const NILAI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const today = () => new Date().toISOString().slice(0, 10);

export default function NilaiPemain() {
  const nav = useNavigate();
  const p = useParams<{ id: string }>();
  const [me, setMe] = createSignal<Me | null>(null);
  const [pl, setPl] = createSignal<PlayerDetail | null>(null);
  const [missing, setMissing] = createSignal(false);
  const [periods, setPeriods] = createSignal<Period[]>([]);
  const [indicators, setIndicators] = createSignal<AssessmentIndicator[]>([]);
  const [list, setList] = createSignal<AssessmentView[]>([]);
  const [periodId, setPeriodId] = createSignal("");
  const [scores, setScores] = createSignal<Record<string, number>>({});
  const [note, setNote] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [error, setError] = createSignal("");
  const [history, setHistory] = createSignal<AssessmentHistoryRow[] | null>(null);
  const [plans, setPlans] = createSignal<Record<string, DevelopmentPlanItem[]>>({});

  const role = () => me()?.active?.role;
  const parent = () => role() === "orang_tua";
  const canWrite = () => role() === "admin_ssb" || role() === "pelatih";
  const canPublish = () => role() === "admin_ssb" || role() === "korlas";
  const current = createMemo(() => list().find((a) => a.period.id === periodId()) ?? null);
  // Orang tua: satu periode tampil sekali; bawaannya yang terbaru.
  const terbaruDulu = createMemo(() => [...list()].sort((a, b) => b.period.startDate.localeCompare(a.period.startDate)));
  const [ortuId, setOrtuId] = createSignal("");
  const ortuPilih = createMemo(() => terbaruDulu().find((a) => a.period.id === ortuId()) ?? terbaruDulu()[0] ?? null);

  const fill = (a: AssessmentView | null) => {
    setScores(a ? Object.fromEntries(a.scores.map((s) => [s.indicatorId, s.score])) : {});
    setNote(a?.note ?? "");
    setDirty(false);
    setHistory(null);
  };
  const reload = async () => {
    const l = await api<AssessmentView[]>(`/players/${encodeURIComponent(p.id)}/assessments`);
    setList(l);
    return l;
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    try {
      const player = await api<PlayerDetail>(`/players/${encodeURIComponent(p.id)}`);
      setPl(player);
      const l = await reload();
      if (m.active.role === "orang_tua") {
        const rs = await Promise.all(
          l.map((a) =>
            api<{ items: DevelopmentPlanItem[] }>(`/players/${encodeURIComponent(p.id)}/development-plan/${a.period.id}`).catch(() => ({ items: [] })),
          ),
        );
        setPlans(Object.fromEntries(l.map((a, i) => [a.period.id, rs[i]!.items])));
      }
      if (m.active.role !== "orang_tua") {
        const per = await api<Period[]>("/periods").catch(() => []);
        setPeriods(per);
        const now = per.find((x) => x.startDate <= today() && today() <= x.endDate);
        setPeriodId(now?.id ?? per[per.length - 1]?.id ?? "");
        if (player.ageGroup)
          setIndicators((await api<AssessmentIndicator[]>(`/assessment-indicators?ageGroupId=${player.ageGroup.id}`).catch(() => [])).filter((i) => i.active));
        fill(l.find((a) => a.period.id === periodId()) ?? null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError("Penilaian tidak bisa dimuat. Muat ulang halaman.");
    }
  });

  const pickPeriod = (id: string) => {
    setPeriodId(id);
    setSaved(false);
    setNotice("");
    fill(list().find((a) => a.period.id === id) ?? null);
  };
  const setScore = (indicatorId: string, v: number) => {
    setSaved(false);
    setDirty(true);
    setScores({ ...scores(), [indicatorId]: v });
  };
  const filled = createMemo(() => indicators().filter((i) => scores()[i.id] !== undefined).length);
  const rataSementara = createMemo(() => {
    const v = indicators()
      .map((i) => scores()[i.id])
      .filter((x): x is number => x !== undefined);
    return v.length ? String(Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10).replace(".", ",") : "–";
  });
  const groups = createMemo(() =>
    assessmentAspects.map((a) => ({ aspect: a, items: indicators().filter((i) => i.aspect === a) })).filter((g) => g.items.length > 0),
  );

  const form = createSubmit(async () => {
    const body = {
      note: note().trim() || null,
      scores: indicators()
        .filter((i) => scores()[i.id] !== undefined)
        .map((i) => ({ indicatorId: i.id, score: scores()[i.id]! })),
    };
    await api<AssessmentView>(`/players/${p.id}/assessments/${periodId()}`, { method: "PUT", body });
    const l = await reload();
    fill(l.find((a) => a.period.id === periodId()) ?? null);
    setSaved(true);
  });

  const publish = async (on: boolean) => {
    setError("");
    setNotice("");
    try {
      await api(`/players/${p.id}/assessments/${periodId()}/publish`, { method: on ? "POST" : "DELETE" });
      await reload();
      setNotice(on ? "Penilaian diterbitkan. Orang tua sekarang bisa melihatnya." : "Penilaian ditarik. Orang tua tidak lagi melihatnya.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    }
  };
  const loadHistory = async (e: Event) => {
    if (!(e.currentTarget as HTMLDetailsElement).open || history()) return;
    setHistory(await api<AssessmentHistoryRow[]>(`/players/${p.id}/assessments/${periodId()}/history`).catch(() => []));
  };

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <main class="halaman nilai">
        <Show
          when={!missing()}
          fallback={
            <>
              <Title>Pemain tidak ditemukan · SSB App</Title>
              <h1>Pemain tidak ditemukan</h1>
              <p>Pemain ini tidak ada, atau bukan bagian dari KU atau anak yang bisa Anda akses.</p>
              <A class="tombol" href="/pemain">
                Ke daftar pemain
              </A>
            </>
          }
        >
          <Show when={pl()} fallback={<Kerangka />}>
            <Title>Penilaian {pl()!.fullName} · SSB App</Title>
            <KepalaHalaman
              chip="Penilaian"
              judul={`Penilaian ${pl()!.fullName}`}
              sub={[pl()!.memberNo, pl()!.ageGroup?.name ?? "Belum ada KU", "skala 1 sampai 10"].filter(Boolean).join(" • ")}
            />
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

            {/* Orang tua: semua penilaian yang sudah diterbitkan */}
            <Show when={parent()}>
              <Show when={list().length === 0}>
                <p class="kosong">Belum ada penilaian yang diterbitkan untuk {pl()!.fullName}. Penilaian muncul di sini setelah SSB menerbitkannya.</p>
              </Show>
              <Show when={list().length > 0}>
                <GrafikNilai list={list()} />
              </Show>
              <Show when={terbaruDulu().length > 1}>
                {/* biome-ignore lint/a11y/useSemanticElements: deretan tab periode */}
                <div class="tab-periode" role="group" aria-label="Pilih periode">
                  <For each={terbaruDulu()}>
                    {(a) => (
                      <button type="button" aria-pressed={ortuPilih()?.period.id === a.period.id} onClick={() => setOrtuId(a.period.id)}>
                        {a.period.name}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <Show when={ortuPilih()}>
                {(a) => (
                  <section class="master" aria-label={a().period.name}>
                    <div class="judul-periode">
                      <h2>{a().period.name}</h2>
                      <a class="tombol utama" href={`/api/players/${encodeURIComponent(p.id)}/assessments/${a().period.id}/report`} download="">
                        Unduh rapor (PDF)
                      </a>
                    </div>
                    <HasilNilai a={a()} />
                    <RencanaBaca items={plans()[a().period.id] ?? []} />
                  </section>
                )}
              </Show>
            </Show>

            {/* Admin, pelatih, korlas */}
            <Show when={!parent()}>
              <Show when={periods().length > 0} fallback={<p class="kosong">Belum ada periode. Admin perlu menambahkannya di Data master.</p>}>
                <div class="form saring">
                  <SelectField
                    id="periode"
                    label="Periode"
                    value={periodId()}
                    onInput={pickPeriod}
                    options={periods().map((x) => ({ value: x.id, label: x.name }))}
                  />
                </div>

                <Show when={current()}>
                  <p>
                    <a class="tombol utama" href={`/api/players/${encodeURIComponent(p.id)}/assessments/${current()!.period.id}/report`} download="">
                      Unduh rapor (PDF)
                    </a>
                  </p>
                  <p>
                    <A class="tombol" href={`/rencana/${encodeURIComponent(p.id)}`}>
                      Rencana pengembangan
                    </A>
                  </p>
                  <p class="petunjuk" role="status">
                    {current()!.publishedAt ? `Sudah diterbitkan ke orang tua pada ${tgl(current()!.publishedAt!)}.` : "Belum diterbitkan ke orang tua."}
                  </p>
                  <Show when={canPublish()}>
                    <p>
                      <Show
                        when={current()!.publishedAt}
                        fallback={
                          <button class="tombol utama" type="button" onClick={() => publish(true)}>
                            Terbitkan ke orang tua
                          </button>
                        }
                      >
                        <button class="tombol" type="button" onClick={() => publish(false)}>
                          Tarik dari orang tua
                        </button>
                      </Show>
                    </p>
                  </Show>
                </Show>

                <Show
                  when={canWrite()}
                  fallback={
                    <Show when={current()} fallback={<p class="kosong">Belum ada penilaian pada periode ini.</p>}>
                      <GrafikNilai list={list()} selectedId={periodId()} />
                      <HasilNilai a={current()!} />
                    </Show>
                  }
                >
                  <Show when={list().length > 0}>
                    <details class="riwayat-nilai">
                      <summary>Grafik perkembangan</summary>
                      <GrafikNilai list={list()} selectedId={periodId()} />
                    </details>
                  </Show>
                  <Show when={form.error()}>
                    <div class="peringatan" role="alert">
                      {form.error()}
                    </div>
                  </Show>
                  <Show when={saved()}>
                    <div class="info" role="status">
                      Penilaian disimpan. Anda masih bisa mengubahnya.
                    </div>
                  </Show>
                  <Show
                    when={indicators().length > 0}
                    fallback={
                      <p class="kosong">
                        {pl()!.ageGroup ? `KU ${pl()!.ageGroup!.name} belum punya indikator penilaian.` : "Pemain ini belum punya KU, jadi belum bisa dinilai."}
                        {role() === "admin_ssb" ? " " : " Minta admin SSB menyiapkannya."}
                        <Show when={role() === "admin_ssb"}>
                          <A href="/indikator">Siapkan indikator</A>
                        </Show>
                      </p>
                    }
                  >
                    <div class="progres-nilai" role="status" aria-live="polite">
                      <div class="progres-teks">
                        <strong>Progres penilaian</strong>
                        <span>
                          {filled()}/{indicators().length} terisi
                        </span>
                      </div>
                      <span class="batang" aria-hidden="true">
                        <span style={{ width: `${(filled() / indicators().length) * 100}%` }} />
                      </span>
                      <span class="petunjuk">Rata-rata sementara: {rataSementara()}</span>
                    </div>
                    <div class="grid-aspek">
                      <For each={groups()}>
                        {(g, gi) => (
                          <section class="aspek kartu-aspek" aria-label={aspectLabel[g.aspect]}>
                            <h2>
                              <span class="nomor-aspek" aria-hidden="true">
                                {gi() + 1}
                              </span>
                              {aspectLabel[g.aspect]}
                              <span class="rata">
                                {g.items.filter((i) => scores()[i.id] !== undefined).length}/{g.items.length} terisi
                              </span>
                            </h2>
                            <For each={g.items}>
                              {(i) => (
                                <div class="indikator">
                                  <span class="nama">
                                    {i.name}
                                    <Show when={scores()[i.id] !== undefined}>
                                      <span class="nilai-terpilih" data-tinggi={scores()[i.id]! >= 9 ? "" : undefined}>
                                        {scores()[i.id]}
                                      </span>
                                    </Show>
                                  </span>
                                  {/* biome-ignore lint/a11y/useSemanticElements: fieldset merusak tata letak grid tombol */}
                                  <div class="pilih-nilai" role="group" aria-label={`Skor ${i.name}`}>
                                    <For each={NILAI}>
                                      {(n) => (
                                        <button
                                          type="button"
                                          class="nilai-btn"
                                          attr:data-tinggi={n >= 9 ? "" : undefined}
                                          aria-pressed={scores()[i.id] === n}
                                          aria-label={`${i.name} ${n}`}
                                          onClick={() => setScore(i.id, n)}
                                        >
                                          {n}
                                        </button>
                                      )}
                                    </For>
                                  </div>
                                </div>
                              )}
                            </For>
                          </section>
                        )}
                      </For>
                    </div>
                    <div class="field">
                      <label for="catatan">Catatan pelatih (boleh dikosongkan)</label>
                      <textarea
                        id="catatan"
                        rows="3"
                        maxlength="1000"
                        value={note()}
                        onInput={(e) => {
                          setNote(e.currentTarget.value);
                          setDirty(true);
                          setSaved(false);
                        }}
                      />
                    </div>
                    <div class="bar-simpan">
                      <span aria-live="polite">
                        {filled()} dari {indicators().length} indikator terisi
                      </span>
                      <button class="tombol utama" type="button" disabled={form.busy() || filled() === 0 || !dirty()} onClick={form.submit}>
                        {form.busy() ? "Menyimpan…" : "Simpan penilaian"}
                      </button>
                    </div>
                  </Show>
                </Show>

                <Show when={current() && !parent()}>
                  <details class="riwayat-nilai" onToggle={loadHistory}>
                    <summary>Riwayat perubahan skor</summary>
                    <Show when={history()} fallback={<Kerangka />}>
                      <Show when={history()!.length > 0} fallback={<p class="kosong">Belum ada perubahan.</p>}>
                        <ul class="daftar-butir">
                          <For each={history()!}>
                            {(h) => (
                              <li class="butir">
                                <span class="isi">
                                  <strong>{h.indicator}</strong>: {h.from === null ? "diisi" : `${h.from} menjadi`} {h.to}
                                  <span class="petunjuk">
                                    {" "}
                                    {tgl(h.at)}
                                    {h.by ? `, ${h.by}` : ""}
                                  </span>
                                </span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </Show>
                  </details>
                </Show>
              </Show>
            </Show>
            <p class="tautan-bawah">
              <A href={`/pemain/${pl()!.id}`}>Kembali ke profil</A>
            </p>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
