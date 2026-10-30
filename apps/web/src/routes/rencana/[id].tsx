import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createSignal, Index, onMount, Show } from "solid-js";
import RencanaBaca from "~/components/RencanaBaca";
import SelectField from "~/components/SelectField";
import Memuat from "~/components/Memuat";
import Kerangka from "~/components/Kerangka";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { assessmentAspects, aspectLabel, type AssessmentAspect } from "@ssb/shared/aspects";
import type { DevelopmentPlanItem, Period, PlayerDetail } from "@ssb/shared";

const MAKS = 8;
type Butir = { aspect: AssessmentAspect | ""; area: string; target: string; note: string };
const kosong = (): Butir => ({ aspect: "", area: "", target: "", note: "" });
const today = () => new Date().toISOString().slice(0, 10);

export default function RencanaPemain() {
  const nav = useNavigate();
  const p = useParams<{ id: string }>();
  const [me, setMe] = createSignal<Me | null>(null);
  const [pl, setPl] = createSignal<PlayerDetail | null>(null);
  const [missing, setMissing] = createSignal(false);
  const [periods, setPeriods] = createSignal<Period[]>([]);
  const [periodId, setPeriodId] = createSignal("");
  const [saved, setSaved] = createSignal<DevelopmentPlanItem[]>([]);
  const [items, setItems] = createSignal<Butir[]>([]);
  const [dirty, setDirty] = createSignal(false);
  const [done, setDone] = createSignal(false);
  const [error, setError] = createSignal("");

  const role = () => me()?.active?.role;
  const canWrite = () => role() === "admin_ssb" || role() === "pelatih";

  const load = async (id: string) => {
    if (!id) return;
    setError("");
    try {
      const r = await api<{ items: DevelopmentPlanItem[] }>(`/players/${encodeURIComponent(p.id)}/development-plan/${id}`);
      setSaved(r.items);
      setItems(r.items.map((x) => ({ aspect: x.aspect ?? "", area: x.area, target: x.target ?? "", note: x.note ?? "" })));
      setDirty(false);
      setDone(false);
    } catch {
      setError("Rencana tidak bisa dimuat. Muat ulang halaman.");
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    if (m.active.role === "orang_tua") return nav(`/nilai/${p.id}`, { replace: true }); // orang tua membaca rencana di halaman penilaian
    setMe(m);
    try {
      setPl(await api<PlayerDetail>(`/players/${encodeURIComponent(p.id)}`));
      const per = await api<Period[]>("/periods").catch(() => []);
      setPeriods(per);
      const now = per.find((x) => x.startDate <= today() && today() <= x.endDate);
      setPeriodId(now?.id ?? per[per.length - 1]?.id ?? "");
      await load(periodId());
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
      else setError("Halaman tidak bisa dimuat. Muat ulang halaman.");
    }
  });

  const edit = (n: number, patch: Partial<Butir>) => {
    setItems(items().map((x, i) => (i === n ? { ...x, ...patch } : x)));
    setDirty(true);
    setDone(false);
  };

  const form = createSubmit(async () => {
    const body = {
      items: items()
        .filter((x) => x.area.trim() !== "")
        .map((x) => ({ aspect: x.aspect || null, area: x.area.trim(), target: x.target.trim() || null, note: x.note.trim() || null })),
    };
    const r = await api<{ items: DevelopmentPlanItem[] }>(`/players/${p.id}/development-plan/${periodId()}`, { method: "PUT", body });
    setSaved(r.items);
    setItems(r.items.map((x) => ({ aspect: x.aspect ?? "", area: x.area, target: x.target ?? "", note: x.note ?? "" })));
    setDirty(false);
    setDone(true);
  });

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <main class="halaman nilai">
        <Show
          when={!missing()}
          fallback={
            <>
              <Title>Siswa tidak ditemukan · SSB App</Title>
              <h1>Siswa tidak ditemukan</h1>
              <p>Siswa ini tidak ada, atau bukan bagian dari KU yang bisa Anda akses.</p>
              <A class="tombol" href="/pemain">
                Ke daftar siswa
              </A>
            </>
          }
        >
          <Show when={pl()} fallback={<Kerangka />}>
            <Title>Rencana pengembangan {pl()!.fullName} · SSB App</Title>
            <KepalaHalaman
              chip="Rencana pengembangan"
              judul={`Rencana ${pl()!.fullName}`}
              sub="Area yang dilatih lebih lanjut pada periode ini. Orang tua melihatnya setelah penilaian periode ini diterbitkan."
            />
            <Show when={error()}>
              <div class="peringatan" role="alert">
                {error()}
              </div>
            </Show>
            <Show when={periods().length > 0} fallback={<p class="kosong">Belum ada periode. Admin perlu menambahkannya di Data master.</p>}>
              <div class="form saring">
                <SelectField
                  id="periode"
                  label="Periode"
                  value={periodId()}
                  onInput={(v) => {
                    setPeriodId(v);
                    load(v);
                  }}
                  options={periods().map((x) => ({ value: x.id, label: x.name }))}
                />
              </div>

              <Show when={canWrite()} fallback={<RencanaBaca items={saved()} tampilkanKosong />}>
                <Show when={form.error()}>
                  <div class="peringatan" role="alert">
                    {form.error()}
                  </div>
                </Show>
                <Show when={done()}>
                  <div class="info" role="status">
                    Rencana disimpan. Anda masih bisa mengubahnya.
                  </div>
                </Show>
                <Show when={items().length === 0}>
                  <p class="kosong">Belum ada butir. Tambahkan area yang ingin dikembangkan, misalnya "Tenang di depan gawang".</p>
                </Show>
                <Index each={items()}>
                  {(x, n) => (
                    <fieldset class="butir-rencana">
                      <legend>Butir {n + 1}</legend>
                      <div class="field">
                        <label for={`area-${n}`}>Area pengembangan</label>
                        <input id={`area-${n}`} type="text" maxlength="120" value={x().area} onInput={(e) => edit(n, { area: e.currentTarget.value })} />
                      </div>
                      <SelectField
                        id={`aspek-${n}`}
                        label="Aspek terkait (boleh dikosongkan)"
                        value={x().aspect}
                        blank="Tidak terkait aspek tertentu"
                        onInput={(v) => edit(n, { aspect: v as AssessmentAspect | "" })}
                        options={assessmentAspects.map((a) => ({ value: a, label: aspectLabel[a] }))}
                      />
                      <div class="field">
                        <label for={`target-${n}`}>Target (boleh dikosongkan)</label>
                        <input id={`target-${n}`} type="text" maxlength="200" value={x().target} onInput={(e) => edit(n, { target: e.currentTarget.value })} />
                      </div>
                      <div class="field">
                        <label for={`catatan-${n}`}>Catatan (boleh dikosongkan)</label>
                        <textarea id={`catatan-${n}`} rows="2" maxlength="500" value={x().note} onInput={(e) => edit(n, { note: e.currentTarget.value })} />
                      </div>
                      <button
                        type="button"
                        class="tombol"
                        onClick={() => {
                          setItems(items().filter((_, i) => i !== n));
                          setDirty(true);
                          setDone(false);
                        }}
                      >
                        Hapus butir {n + 1}
                      </button>
                    </fieldset>
                  )}
                </Index>
                <p>
                  <button
                    type="button"
                    class="tombol"
                    disabled={items().length >= MAKS}
                    onClick={() => {
                      setItems([...items(), kosong()]);
                      setDirty(true);
                      setDone(false);
                    }}
                  >
                    Tambah butir
                  </button>
                  <Show when={items().length >= MAKS}>
                    <span class="petunjuk"> Maksimal {MAKS} butir.</span>
                  </Show>
                </p>
                <div class="bar-simpan">
                  <span aria-live="polite">{items().filter((x) => x.area.trim()).length} butir terisi</span>
                  <button class="tombol utama" type="button" disabled={form.busy() || !dirty()} onClick={form.submit}>
                    {form.busy() ? "Menyimpan…" : "Simpan rencana"}
                  </button>
                </div>
              </Show>
            </Show>
            <p class="tautan-bawah">
              <A href={`/nilai/${pl()!.id}`}>Ke penilaian</A> · <A href={`/pemain/${pl()!.id}`}>Kembali ke profil</A>
            </p>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
