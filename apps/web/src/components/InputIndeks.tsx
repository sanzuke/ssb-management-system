import { createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import { api, ApiError } from "~/lib/api";
import { angka } from "~/lib/donasi";
import { createSubmit } from "~/lib/form";
import { hariIni } from "~/lib/waktu";
import { METRIK_FISIK, type MatchStatRow, type PhysicalTestRow } from "@ssb/shared";

const hitungan = (v: string) => (v.trim() === "" ? 0 : Number(v));

type FormLaga = { matchesPlayed: string; goals: string; assists: string; starts: string; yellowCards: string; redCards: string };
type FormTes = { testedOn: string; speed30m: string; zigZag: string; verticalJump: string; bleepLevel: string; note: string };
const tesKosong = (): FormTes => ({ testedOn: hariIni(), speed30m: "", zigZag: "", verticalJump: "", bleepLevel: "", note: "" });

/** Statistik laga satu siswa pada satu periode dan hasil tes kebugarannya; diisi pelatih atau admin. Indeks baru berubah setelah dihitung ulang. */
export default function InputIndeks(props: { playerId: string; periodId: string; periodName: string; onSaved: (pesan: string) => void }) {
  const dasar = () => `/players/${encodeURIComponent(props.playerId)}`;
  const [tes, setTes] = createSignal<PhysicalTestRow[]>([]);
  const [laga, setLaga] = createSignal<FormLaga>({ matchesPlayed: "", goals: "", assists: "", starts: "", yellowCards: "", redCards: "" });
  const [baru, setBaru] = createSignal<FormTes>(tesKosong());
  const [galat, setGalat] = createSignal("");

  const muatTes = async () => setTes(await api<PhysicalTestRow[]>(`${dasar()}/physical-tests`).catch(() => [] as PhysicalTestRow[]));
  // Statistik hanya mengisi kolom bila sudah pernah disimpan, dan hanya sekali saat dibuka, supaya ketikan pengguna tidak tertimpa.
  const muatStat = async () => {
    const stat = await api<MatchStatRow[]>(`${dasar()}/match-stats`).catch(() => [] as MatchStatRow[]);
    const s = stat.find((x) => x.periodId === props.periodId);
    if (!s) return;
    setLaga({
      matchesPlayed: String(s.matchesPlayed),
      goals: String(s.goals),
      assists: String(s.assists),
      starts: String(s.starts),
      yellowCards: String(s.yellowCards),
      redCards: String(s.redCards),
    });
  };
  onMount(() => {
    void muatStat();
    void muatTes();
  });

  const formLaga = createSubmit(async () => {
    const v = laga();
    await api<MatchStatRow>(`${dasar()}/match-stats/${encodeURIComponent(props.periodId)}`, {
      method: "PUT",
      body: {
        matchesPlayed: hitungan(v.matchesPlayed),
        goals: hitungan(v.goals),
        assists: hitungan(v.assists),
        starts: hitungan(v.starts),
        yellowCards: hitungan(v.yellowCards),
        redCards: hitungan(v.redCards),
      },
    });
    props.onSaved(`Statistik laga ${props.periodName} tersimpan. Hitung ulang untuk memperbarui indeks.`);
  });

  const formTes = createSubmit(async () => {
    const v = baru();
    await api<PhysicalTestRow>(`${dasar()}/physical-tests`, {
      method: "POST",
      body: { testedOn: v.testedOn, speed30m: angka(v.speed30m), zigZag: angka(v.zigZag), verticalJump: angka(v.verticalJump), bleepLevel: angka(v.bleepLevel), note: v.note },
    });
    setBaru(tesKosong());
    await muatTes();
    props.onSaved("Hasil tes tersimpan. Hitung ulang untuk memperbarui indeks.");
  });

  const hapus = async (id: string) => {
    setGalat("");
    try {
      await api(`/physical-tests/${encodeURIComponent(id)}`, { method: "DELETE" });
      await muatTes();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    }
  };

  const isiLaga = (k: keyof FormLaga, v: string) => setLaga({ ...laga(), [k]: v });
  const isiTes = (k: keyof FormTes, v: string) => setBaru({ ...baru(), [k]: v });

  return (
    <div class="form">
      <Show when={galat()}>
        <div class="peringatan" role="alert">
          {galat()}
        </div>
      </Show>

      <form class="form" onSubmit={formLaga.submit} aria-label={`Statistik laga ${props.periodName}`}>
        <h3>Statistik laga · {props.periodName}</h3>
        <Show when={formLaga.error()}>
          <div class="peringatan" role="alert">
            {formLaga.error()}
          </div>
        </Show>
        <Field id={`ml-${props.playerId}`} label="Jumlah laga" type="number" inputmode="numeric" value={laga().matchesPlayed} onInput={(v) => isiLaga("matchesPlayed", v)} error={formLaga.fields().matchesPlayed} />
        <Field id={`gl-${props.playerId}`} label="Gol" type="number" inputmode="numeric" value={laga().goals} onInput={(v) => isiLaga("goals", v)} error={formLaga.fields().goals} />
        <Field id={`as-${props.playerId}`} label="Assist" type="number" inputmode="numeric" value={laga().assists} onInput={(v) => isiLaga("assists", v)} error={formLaga.fields().assists} />
        <Field id={`st-${props.playerId}`} label="Jadi starter (dari jumlah laga)" type="number" inputmode="numeric" value={laga().starts} onInput={(v) => isiLaga("starts", v)} error={formLaga.fields().starts} />
        <Field id={`yc-${props.playerId}`} label="Kartu kuning" type="number" inputmode="numeric" value={laga().yellowCards} onInput={(v) => isiLaga("yellowCards", v)} error={formLaga.fields().yellowCards} />
        <Field id={`rc-${props.playerId}`} label="Kartu merah" type="number" inputmode="numeric" value={laga().redCards} onInput={(v) => isiLaga("redCards", v)} error={formLaga.fields().redCards} />
        <p class="petunjuk">Performa laga baru dihitung bila jumlah laga minimal 3. Menyimpan mengganti seluruh statistik periode ini.</p>
        <div class="butir-aksi">
          <button class="tombol utama" type="submit" disabled={formLaga.busy()}>
            {formLaga.busy() ? "Menyimpan…" : "Simpan statistik laga"}
          </button>
        </div>
      </form>

      <form class="form" onSubmit={formTes.submit} aria-label="Tes kebugaran">
        <h3>Tes kebugaran</h3>
        <Show when={tes().length > 0}>
          <ul class="daftar-sesi">
            <For each={tes()}>
              {(t) => (
                <li class="baris-sesi">
                  <div class="info-sesi">
                    <strong>{t.testedOn}</strong>
                    <span class="petunjuk">
                      {METRIK_FISIK.filter((m) => t[m.key] !== null)
                        .map((m) => `${m.label} ${t[m.key]} ${m.satuan}`)
                        .join(" · ")}
                      {t.note ? ` · ${t.note}` : ""}
                    </span>
                  </div>
                  <button class="tombol tipis" type="button" onClick={() => hapus(t.id)}>
                    Hapus
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={formTes.error()}>
          <div class="peringatan" role="alert">
            {formTes.error()}
          </div>
        </Show>
        <Field id={`td-${props.playerId}`} label="Tanggal tes" type="date" required value={baru().testedOn} onInput={(v) => isiTes("testedOn", v)} error={formTes.fields().testedOn} />
        <Field id={`s3-${props.playerId}`} label="Lari 30 m (detik)" type="number" inputmode="decimal" value={baru().speed30m} onInput={(v) => isiTes("speed30m", v)} error={formTes.fields().speed30m} />
        <Field id={`zz-${props.playerId}`} label="Lari zig-zag (detik)" type="number" inputmode="decimal" value={baru().zigZag} onInput={(v) => isiTes("zigZag", v)} error={formTes.fields().zigZag} />
        <Field id={`vj-${props.playerId}`} label="Lompat vertikal (cm)" type="number" inputmode="decimal" value={baru().verticalJump} onInput={(v) => isiTes("verticalJump", v)} error={formTes.fields().verticalJump} />
        <Field id={`bl-${props.playerId}`} label="Bleep test (level)" type="number" inputmode="decimal" value={baru().bleepLevel} onInput={(v) => isiTes("bleepLevel", v)} error={formTes.fields().bleepLevel} />
        <Field id={`nt-${props.playerId}`} label="Catatan (boleh dikosongkan)" maxlength={200} value={baru().note} onInput={(v) => isiTes("note", v)} error={formTes.fields().note} />
        <p class="petunjuk">Isi minimal satu hasil. Kebugaran dinilai relatif terhadap teman satu KU, jadi butuh minimal 5 siswa yang punya hasil yang sama.</p>
        <div class="butir-aksi">
          <button class="tombol utama" type="submit" disabled={formTes.busy()}>
            {formTes.busy() ? "Menyimpan…" : "Simpan hasil tes"}
          </button>
        </div>
      </form>
    </div>
  );
}
