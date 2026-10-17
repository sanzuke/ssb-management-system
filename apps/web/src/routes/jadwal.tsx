import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import SessionForm from "~/components/SessionForm";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import type { AgeGroup, Location, TrainingSession } from "@ssb/shared";

const iso = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const hari = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Jadwal() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [items, setItems] = createSignal<TrainingSession[]>([]);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [locs, setLocs] = createSignal<Location[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const [editing, setEditing] = createSignal<string | null>(null); // "baru" atau id
  const [confirmId, setConfirmId] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal("");
  const [past, setPast] = createSignal(false);

  const admin = () => me()?.active?.role === "admin_ssb";

  const load = async () => {
    try {
      setItems(await api<TrainingSession[]>(`/sessions?from=${past() ? iso(-60) : iso(0)}&to=${iso(120)}`));
      setError("");
    } catch {
      setError("Jadwal tidak bisa dimuat. Muat ulang halaman.");
    } finally {
      setLoaded(true);
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    if (m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    const [g, l] = await Promise.all([api<AgeGroup[]>("/age-groups").catch(() => []), api<Location[]>("/locations").catch(() => [])]);
    setGroups(g);
    setLocs(l);
    await load();
  });

  const byDate = createMemo(() => {
    const out: { date: string; list: TrainingSession[] }[] = [];
    for (const s of items()) {
      const last = out[out.length - 1];
      if (last && last.date === s.sessionDate) last.list.push(s);
      else out.push({ date: s.sessionDate, list: [s] });
    }
    return out;
  });

  const remove = async (id: string) => {
    setNotice("");
    try {
      await api(`/sessions/${id}`, { method: "DELETE" });
      setConfirmId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
      setConfirmId(null);
    }
  };
  const ringkas = (a: TrainingSession["attendance"]) => {
    const parts = [a.hadir ? `${a.hadir} hadir` : "", a.izin ? `${a.izin} izin` : "", a.sakit ? `${a.sakit} sakit` : "", a.alpa ? `${a.alpa} alpa` : "", a.belum ? `${a.belum} belum diisi` : ""].filter(Boolean);
    return parts.length ? parts.join(", ") : "Tidak ada pemain aktif";
  };

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Jadwal latihan · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman">
        <h1>Jadwal latihan</h1>
        <Show when={error()}>
          <div class="peringatan" role="alert">{error()}</div>
        </Show>
        <Show when={notice()}>
          <div class="info" role="status">{notice()}</div>
        </Show>

        <Show when={admin()}>
          <Show
            when={editing() === "baru"}
            fallback={<p><button class="tombol utama" type="button" onClick={() => { setNotice(""); setEditing("baru"); }}>Tambah sesi</button></p>}
          >
            <section class="master">
              <h2>Sesi baru</h2>
              <Show when={groups().length === 0}>
                <p class="info">Belum ada KU. Buat KU di <A href="/master">Data master</A> dulu.</p>
              </Show>
              <SessionForm ageGroups={groups()} locations={locs()} onCancel={() => setEditing(null)} onSaved={async (n) => { setEditing(null); setNotice(n > 1 ? `${n} sesi dijadwalkan.` : "Sesi dijadwalkan."); await load(); }} />
            </section>
          </Show>
        </Show>

        <Show when={loaded() && !error() && items().length === 0}>
          <p class="kosong">
            {admin()
              ? "Belum ada sesi latihan. Tambahkan sesi pertama; bisa diulang tiap minggu."
              : "Belum ada sesi untuk KU yang ditugaskan kepada Anda. Hubungi admin SSB untuk penjadwalan atau penugasan KU."}
          </p>
        </Show>

        <For each={byDate()}>
          {(day) => (
            <section class="master" aria-label={hari(day.date)}>
              <h2>{hari(day.date)}</h2>
              <ul class="daftar-butir">
                <For each={day.list}>
                  {(s) => (
                    <li class="butir">
                      <Show
                        when={editing() === s.id}
                        fallback={
                          <>
                            <A class="pemain-tautan isi" href={`/absensi/${s.id}`}>
                              <strong>{s.ageGroup.name}{s.startTime ? `, jam ${s.startTime}` : ""}</strong>
                              <span class="petunjuk">{[s.location?.name, ringkas(s.attendance)].filter(Boolean).join(", ")}</span>
                            </A>
                            <Show when={admin()}>
                              <span class="butir-aksi">
                                <Show
                                  when={confirmId() === s.id}
                                  fallback={
                                    <>
                                      <button class="tombol tipis" type="button" onClick={() => { setNotice(""); setEditing(s.id); }}>Ubah</button>
                                      <button class="tombol tipis" type="button" onClick={() => setConfirmId(s.id)}>Hapus</button>
                                    </>
                                  }
                                >
                                  <button class="tombol bahaya" type="button" onClick={() => remove(s.id)}>Ya, hapus</button>
                                  <button class="tombol tipis" type="button" onClick={() => setConfirmId(null)}>Batal</button>
                                </Show>
                              </span>
                            </Show>
                          </>
                        }
                      >
                        <SessionForm initial={s} ageGroups={groups()} locations={locs()} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice("Sesi diperbarui."); await load(); }} />
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>

        <p class="tautan-bawah">
          <button class="tombol tipis" type="button" onClick={async () => { setPast(!past()); await load(); }}>
            {past() ? "Sembunyikan sesi yang sudah lewat" : "Tampilkan sesi 60 hari terakhir"}
          </button>
        </p>
      </main>
    </Show>
  );
}
