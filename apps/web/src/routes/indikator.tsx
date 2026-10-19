import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { assessmentAspects, aspectLabel, type AssessmentAspect } from "@ssb/shared/aspects";
import type { AgeGroup, AssessmentIndicator } from "@ssb/shared";

export default function Indikator() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [ku, setKu] = createSignal("");
  const [items, setItems] = createSignal<AssessmentIndicator[]>([]);
  const [aspect, setAspect] = createSignal<AssessmentAspect>("technical");
  const [name, setName] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [confirmId, setConfirmId] = createSignal<string | null>(null);

  const admin = () => me()?.active?.role === "admin_ssb";

  const load = async () => {
    if (!ku()) return setItems([]);
    setItems(await api<AssessmentIndicator[]>(`/assessment-indicators?ageGroupId=${ku()}`).catch(() => []));
  };
  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active || m.active.role === "orang_tua") return nav("/", { replace: true });
    setMe(m);
    const g = await api<AgeGroup[]>("/age-groups").catch(() => []);
    setGroups(g);
    setKu(g[0]?.id ?? "");
    await load();
  });
  const pickKu = async (id: string) => {
    setKu(id);
    setNotice("");
    setError("");
    await load();
  };
  const act = async (fn: () => Promise<void>) => {
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    }
  };

  const add = createSubmit(async () => {
    await api("/assessment-indicators", { method: "POST", body: { ageGroupId: ku(), aspect: aspect(), name: name().trim() } });
    setName("");
    setNotice("Indikator ditambahkan.");
    await load();
  });
  const defaults = () =>
    act(async () => {
      await api("/assessment-indicators/defaults", { method: "POST", body: { ageGroupId: ku() } });
      setNotice("Usulan awal dipasang. Mintalah pelatih berlisensi memeriksanya sebelum dipakai menilai.");
    });
  const toggle = (i: AssessmentIndicator) =>
    act(async () => {
      await api(`/assessment-indicators/${i.id}`, { method: "PATCH", body: { name: i.name, active: !i.active } });
      setNotice(i.active ? `${i.name} dinonaktifkan.` : `${i.name} diaktifkan.`);
    });
  const remove = (i: AssessmentIndicator) =>
    act(async () => {
      setConfirmId(null);
      await api(`/assessment-indicators/${i.id}`, { method: "DELETE" });
      setNotice(`${i.name} dihapus.`);
    });

  const byAspect = createMemo(() =>
    assessmentAspects.map((a) => ({ aspect: a, list: items().filter((i) => i.aspect === a) })).filter((g) => g.list.length > 0),
  );

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Indikator penilaian · SSB App</Title>
      <main class="halaman">
        <KepalaHalaman
          chip="Penilaian"
          judul="Indikator penilaian"
          sub={`Indikator yang dinilai pelatih untuk tiap KU, dikelompokkan dalam enam aspek. Skalanya 1 sampai 10.${admin() ? "" : " Hanya admin SSB yang bisa mengubahnya."}`}
        />
        <Show when={groups().length === 0}>
          <p class="kosong">
            Belum ada KU. Buat KU di <A href="/master">Data master</A> dulu.
          </p>
        </Show>
        <Show when={groups().length > 0}>
          <div class="form saring">
            <SelectField id="ku" label="KU" value={ku()} onInput={pickKu} options={groups().map((g) => ({ value: g.id, label: g.name }))} />
          </div>
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

          <Show when={items().length === 0}>
            <p class="kosong">KU ini belum punya indikator.{admin() ? " Pasang usulan awal (16 indikator) lalu sesuaikan, atau tambahkan sendiri." : ""}</p>
          </Show>
          <Show when={admin() && items().length === 0}>
            <p>
              <button class="tombol utama" type="button" onClick={defaults}>
                Pasang usulan awal
              </button>
            </p>
          </Show>

          <For each={byAspect()}>
            {(g) => (
              <section class="master" aria-label={aspectLabel[g.aspect]}>
                <h2>{aspectLabel[g.aspect]}</h2>
                <ul class="daftar-butir">
                  <For each={g.list}>
                    {(i) => (
                      <li class="butir">
                        <span class="isi" classList={{ nonaktif: !i.active }}>
                          {i.name}
                          {i.active ? "" : " (nonaktif)"}
                        </span>
                        <Show when={admin()}>
                          <span class="butir-aksi">
                            <Show
                              when={confirmId() === i.id}
                              fallback={
                                <>
                                  <button class="tombol tipis" type="button" onClick={() => toggle(i)}>
                                    {i.active ? "Nonaktifkan" : "Aktifkan"}
                                  </button>
                                  <button class="tombol tipis" type="button" aria-label={`Hapus ${i.name}`} onClick={() => setConfirmId(i.id)}>
                                    Hapus
                                  </button>
                                </>
                              }
                            >
                              <button class="tombol bahaya" type="button" onClick={() => remove(i)}>
                                Ya, hapus
                              </button>
                              <button class="tombol tipis" type="button" onClick={() => setConfirmId(null)}>
                                Batal
                              </button>
                            </Show>
                          </span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>

          <Show when={admin() && ku()}>
            <section class="master">
              <h2>Tambah indikator</h2>
              <form class="form" onSubmit={add.submit} novalidate={false}>
                <Show when={add.error()}>
                  <div class="peringatan" role="alert">
                    {add.error()}
                  </div>
                </Show>
                <SelectField
                  id="aspek"
                  label="Aspek"
                  value={aspect()}
                  onInput={(v) => setAspect(v as AssessmentAspect)}
                  options={assessmentAspects.map((a) => ({ value: a, label: aspectLabel[a] }))}
                />
                <Field
                  id="nama-indikator"
                  label="Nama indikator"
                  required
                  minlength={2}
                  maxlength={80}
                  value={name()}
                  onInput={setName}
                  error={add.fields().name}
                />
                <button class="tombol utama" type="submit" disabled={add.busy()}>
                  {add.busy() ? "Menambah…" : "Tambah indikator"}
                </button>
              </form>
              <Show when={items().length > 0}>
                <p class="petunjuk">Indikator yang sudah dipakai penilaian tidak bisa dihapus, hanya dinonaktifkan agar riwayat tetap utuh.</p>
              </Show>
            </section>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
