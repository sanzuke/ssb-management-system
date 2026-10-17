import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import SelectField from "~/components/SelectField";
import { api, getMe, type Me } from "~/lib/api";
import type { AgeGroup, AttendanceSummary, Period } from "@ssb/shared";

const today = () => new Date().toISOString().slice(0, 10);

export default function Kehadiran() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [periods, setPeriods] = createSignal<Period[]>([]);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [period, setPeriod] = createSignal<string | null>(null); // null = belum siap; "" = semua periode
  const [ku, setKu] = createSignal("");

  const parent = () => me()?.active?.role === "orang_tua";

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    if (m.active.role === "orang_tua") return setPeriod(""); // orang tua tidak punya akses data master
    const [p, g] = await Promise.all([api<Period[]>("/periods").catch(() => []), api<AgeGroup[]>("/age-groups").catch(() => [])]);
    setPeriods(p);
    setGroups(g);
    setPeriod(p.find((x) => x.startDate <= today() && today() <= x.endDate)?.id ?? "");
  });

  const [data] = createResource(
    () => (period() === null ? null : `${period()}|${ku()}`),
    () => {
      const s = new URLSearchParams();
      if (period()) s.set("periodId", period()!);
      if (ku()) s.set("ageGroupId", ku());
      return api<AttendanceSummary>(`/attendance/summary${s.size ? `?${s}` : ""}`);
    },
  );

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Kehadiran · SSB App</Title>
      <main class="halaman">
        <h1>Kehadiran</h1>
        <Show when={!parent()}>
          <div class="form saring">
            <SelectField
              id="periode"
              label="Periode"
              value={period() ?? ""}
              onInput={setPeriod}
              blank="Semua periode"
              options={periods().map((p) => ({ value: p.id, label: p.name }))}
            />
            <SelectField id="ku" label="KU" value={ku()} onInput={setKu} blank="Semua KU" options={groups().map((g) => ({ value: g.id, label: g.name }))} />
          </div>
        </Show>

        <Show when={data.error}>
          <div class="peringatan" role="alert">
            Rekap tidak bisa dimuat. Muat ulang halaman.
          </div>
        </Show>

        <Show when={data()}>
          {(d) => (
            <>
              <p class="petunjuk" role="status">
                {d().sessionsHeld} sesi latihan tercatat{d().period ? ` pada ${d().period!.name}` : ""}
                {d().ageGroup ? ` untuk ${d().ageGroup!.name}` : ""}. Persentase = hadir dibagi sesi yang tercatat untuk pemain itu.
              </p>
              <Show when={d().players.length === 0}>
                <p class="kosong">{parent() ? "Belum ada data kehadiran untuk anak Anda." : "Tidak ada pemain pada pilihan ini."}</p>
              </Show>
              <ul class="daftar-butir">
                <For each={d().players}>
                  {(p) => (
                    <li class="butir">
                      <A class="pemain-tautan isi" href={`/pemain/${p.playerId}`}>
                        <strong>{p.fullName}</strong>
                        <span class="petunjuk">
                          {p.ageGroup.name}
                          {p.recorded ? `, ${p.hadir} hadir, ${p.izin} izin, ${p.sakit} sakit, ${p.alpa} alpa dari ${p.recorded} sesi` : ", belum ada catatan"}
                        </span>
                      </A>
                      <span class="persen" role="img" aria-label={p.percent === null ? "Belum ada catatan" : `${p.percent} persen hadir`}>
                        {p.percent === null ? "–" : `${String(p.percent).replace(".", ",")}%`}
                      </span>
                      <Show when={p.percent !== null}>
                        <span class="batang" aria-hidden="true">
                          <span style={{ width: `${p.percent}%` }} />
                        </span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </>
          )}
        </Show>
      </main>
    </Show>
  );
}
