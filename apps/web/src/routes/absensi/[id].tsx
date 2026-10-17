import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import type { AttendanceRoster, AttendanceStatus } from "@ssb/shared";

const hari = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const pilihan: { v: AttendanceStatus; label: string }[] = [
  { v: "hadir", label: "Hadir" },
  { v: "izin", label: "Izin" },
  { v: "sakit", label: "Sakit" },
  { v: "alpa", label: "Alpa" },
];

export default function Absensi() {
  const nav = useNavigate();
  const p = useParams<{ id: string }>();
  const [me, setMe] = createSignal<Me | null>(null);
  const [roster, setRoster] = createSignal<AttendanceRoster | null>(null);
  const [missing, setMissing] = createSignal(false);
  const [marks, setMarks] = createSignal<Record<string, AttendanceStatus>>({});
  const [dirty, setDirty] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  const apply = (r: AttendanceRoster) => {
    setRoster(r);
    setMarks(Object.fromEntries(r.players.filter((x) => x.status).map((x) => [x.playerId, x.status!])));
    setDirty(false);
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active || m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    try {
      apply(await api<AttendanceRoster>(`/sessions/${encodeURIComponent(p.id)}/attendance`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
    }
  });

  const set = (id: string, v: AttendanceStatus) => {
    setSaved(false);
    setDirty(true);
    setMarks({ ...marks(), [id]: v });
  };
  const allPresent = () => {
    setSaved(false);
    setDirty(true);
    const next = { ...marks() };
    for (const pl of roster()!.players) if (!next[pl.playerId]) next[pl.playerId] = "hadir";
    setMarks(next);
  };

  const count = createMemo(() => {
    const c = { hadir: 0, izin: 0, sakit: 0, alpa: 0, belum: 0 };
    for (const pl of roster()?.players ?? []) {
      const s = marks()[pl.playerId];
      if (s) c[s]++;
      else c.belum++;
    }
    return c;
  });

  const form = createSubmit(async () => {
    const entries = roster()!
      .players.filter((x) => marks()[x.playerId])
      .map((x) => ({ playerId: x.playerId, status: marks()[x.playerId]!, note: x.note }));
    apply(await api<AttendanceRoster>(`/sessions/${p.id}/attendance`, { method: "PUT", body: { entries } }));
    setSaved(true);
  });

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <AppBar me={me()!} />
      <main class="halaman absensi">
        <Show
          when={!missing()}
          fallback={
            <>
              <Title>Sesi tidak ditemukan · SSB App</Title>
              <h1>Sesi tidak ditemukan</h1>
              <p>Sesi ini tidak ada, atau KU-nya tidak ditugaskan kepada Anda.</p>
              <A class="tombol" href="/jadwal">
                Ke jadwal latihan
              </A>
            </>
          }
        >
          <Show when={roster()} fallback={<p>Memuat…</p>}>
            <Title>Absensi {roster()!.session.ageGroup.name} · SSB App</Title>
            <h1>Absensi {roster()!.session.ageGroup.name}</h1>
            <p>
              {hari(roster()!.session.sessionDate)}
              {roster()!.session.startTime ? `, jam ${roster()!.session.startTime}` : ""}
              {roster()!.session.location ? `, ${roster()!.session.location!.name}` : ""}
            </p>
            <Show when={form.error()}>
              <div class="peringatan" role="alert">
                {form.error()}
              </div>
            </Show>
            <Show when={saved()}>
              <div class="info" role="status">
                Absensi disimpan. Anda masih bisa mengoreksinya.
              </div>
            </Show>
            <Show when={roster()!.players.length > 0} fallback={<p class="kosong">Belum ada pemain aktif di KU ini. Tambahkan pemain di menu Pemain.</p>}>
              <p>
                <button class="tombol" type="button" onClick={allPresent}>
                  Tandai semua yang belum diisi hadir
                </button>
              </p>
              <ul class="daftar-absen">
                <For each={roster()!.players}>
                  {(pl) => (
                    <li class="baris-absen">
                      <span class="nama">{pl.fullName}</span>
                      {/* biome-ignore lint/a11y/useSemanticElements: fieldset merusak tata letak grid tombol */}
                      <div class="pilih-status" role="group" aria-label={`Kehadiran ${pl.fullName}`}>
                        <For each={pilihan}>
                          {(o) => (
                            <button type="button" class="status" data-v={o.v} aria-pressed={marks()[pl.playerId] === o.v} onClick={() => set(pl.playerId, o.v)}>
                              {o.label}
                            </button>
                          )}
                        </For>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
              <div class="bar-simpan">
                <span aria-live="polite">
                  {count().hadir} hadir, {count().izin} izin, {count().sakit} sakit, {count().alpa} alpa, {count().belum} belum
                </span>
                <button
                  class="tombol utama"
                  type="button"
                  disabled={form.busy() || (!dirty() && count().belum === roster()!.players.length)}
                  onClick={form.submit}
                >
                  {form.busy() ? "Menyimpan…" : "Simpan absensi"}
                </button>
              </div>
            </Show>
            <p class="tautan-bawah">
              <A href="/jadwal">Kembali ke jadwal</A>
            </p>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
