import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import SelectField from "~/components/SelectField";
import { api, ApiError, getMe, roleLabel, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import type { AgeGroup, Assignment, Period } from "@ssb/shared";

type Member = { id: string; name: string; email: string; role: string };

export default function Penugasan() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [items, setItems] = createSignal<Assignment[]>([]);
  const [coaches, setCoaches] = createSignal<Member[]>([]);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [periods, setPeriods] = createSignal<Period[]>([]);
  const [userId, setUserId] = createSignal("");
  const [ageGroupId, setAgeGroupId] = createSignal("");
  const [periodId, setPeriodId] = createSignal("");
  const [rowError, setRowError] = createSignal("");

  const load = async () => setItems(await api<Assignment[]>("/assignments").catch(() => []));

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
    const [u, g, p] = await Promise.all([
      api<Member[]>("/users").catch(() => []),
      api<AgeGroup[]>("/age-groups").catch(() => []),
      api<Period[]>("/periods").catch(() => []),
      load(),
    ]);
    setCoaches(u.filter((x) => x.role === "pelatih" || x.role === "korlas"));
    setGroups(g);
    setPeriods(p);
  });

  const form = createSubmit(async () => {
    await api("/assignments", { method: "POST", body: { userId: userId(), ageGroupId: ageGroupId(), periodId: periodId() } });
    await load();
  });
  const remove = async (a: Assignment) => {
    setRowError("");
    try {
      await api(`/assignments/${a.userId}/${a.ageGroupId}/${a.periodId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setRowError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    }
  };
  const ready = () => coaches().length > 0 && groups().length > 0 && periods().length > 0;

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Penugasan · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman">
        <h1>Penugasan pelatih</h1>
        <p>Pelatih dan koordinator hanya melihat pemain di KU yang ditugaskan kepada mereka pada periode yang sedang berjalan.</p>

        <Show when={rowError()}>
          <div class="peringatan" role="alert">
            {rowError()}
          </div>
        </Show>
        <Show when={items().length > 0} fallback={<p class="kosong">Belum ada penugasan.</p>}>
          <ul class="daftar-butir">
            <For each={items()}>
              {(a) => (
                <li class="butir">
                  <span class="isi">
                    {a.userName} ({roleLabel[a.role]}), {a.ageGroupName}, {a.periodName}
                  </span>
                  <button class="tombol tipis" type="button" onClick={() => remove(a)}>
                    Hapus
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <section class="master">
          <h2>Tambah penugasan</h2>
          <Show
            when={ready()}
            fallback={
              <p class="info">
                Penugasan butuh minimal satu pelatih atau korlas yang sudah bergabung (lewat undangan), satu KU, dan satu periode. KU dan periode dibuat di{" "}
                <A href="/master">Data master</A>.
              </p>
            }
          >
            <form class="form" onSubmit={form.submit}>
              <Show when={form.error()}>
                <div class="peringatan" role="alert">
                  {form.error()}
                </div>
              </Show>
              <SelectField
                id="anggota"
                label="Pelatih atau korlas"
                blank="Pilih anggota"
                required
                value={userId()}
                onInput={setUserId}
                options={coaches().map((u) => ({ value: u.id, label: `${u.name} (${roleLabel[u.role]})` }))}
              />
              <SelectField
                id="ku"
                label="KU"
                blank="Pilih KU"
                required
                value={ageGroupId()}
                onInput={setAgeGroupId}
                options={groups().map((g) => ({ value: g.id, label: g.name }))}
              />
              <SelectField
                id="periode"
                label="Periode"
                blank="Pilih periode"
                required
                value={periodId()}
                onInput={setPeriodId}
                options={periods().map((p) => ({ value: p.id, label: p.name }))}
              />
              <button class="tombol utama" type="submit" disabled={form.busy()}>
                {form.busy() ? "Menyimpan…" : "Tambah penugasan"}
              </button>
            </form>
          </Show>
        </section>
      </main>
    </Show>
  );
}
