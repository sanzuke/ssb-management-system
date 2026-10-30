import type { PlayerInjury } from "@ssb/shared";
import { bodyPartLabel, bodyParts, INJURY_NOTE_MAX } from "@ssb/shared/injuries";
import { createSignal, For, Show } from "solid-js";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api, ApiError } from "~/lib/api";
import { tanggal } from "~/lib/pemain";

const hariIni = () => new Date().toISOString().slice(0, 10);
const kosong = { bodyPart: "lutut", startedOn: "", expectedReturnOn: "", note: "" };

/**
 * Catatan cedera: data kesehatan anak, hanya untuk yang boleh melihat siswa ini (admin, pelatih dan korlas KU-nya,
 * orang tua anaknya). Admin dan pelatih mencatat, mengubah perkiraan pulih, dan menandai pulih. Mengisi pulih tidak
 * menghapus catatan, jadi riwayat tetap ada. Tanpa persentase kebugaran: hanya fakta dan catatan pelatih.
 */
export default function CederaPemain(props: { playerId: string; daftar: PlayerInjury[]; onUbah: (l: PlayerInjury[]) => void; bisaUbah: boolean }) {
  const [form, setForm] = createSignal<(typeof kosong & { id?: string }) | null>(null);
  const [sibuk, setSibuk] = createSignal(false);
  const [galat, setGalat] = createSignal("");
  const [salah, setSalah] = createSignal<Record<string, string>>({});

  const berjalan = () => props.daftar.filter((c) => !c.recoveredOn);
  const riwayat = () => props.daftar.filter((c) => c.recoveredOn);
  const dasar = `/players/${encodeURIComponent(props.playerId)}/injuries`;

  const buka = (c?: PlayerInjury) => {
    setGalat("");
    setSalah({});
    setForm(
      c
        ? { id: c.id, bodyPart: c.bodyPart, startedOn: c.startedOn, expectedReturnOn: c.expectedReturnOn ?? "", note: c.note ?? "" }
        : { ...kosong, startedOn: hariIni() },
    );
  };
  const jalankan = async (fn: () => Promise<PlayerInjury[]>) => {
    setSibuk(true);
    setGalat("");
    setSalah({});
    try {
      props.onUbah(await fn());
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setGalat(e.code === "validation" ? "Periksa kembali isian Anda." : e.message);
        setSalah(e.fields);
      } else setGalat("Tidak bisa terhubung ke server. Coba lagi.");
      return false;
    } finally {
      setSibuk(false);
    }
  };
  const simpan = async (e: Event) => {
    e.preventDefault();
    const f = form();
    if (!f) return;
    const ok = await jalankan(() =>
      f.id
        ? api<PlayerInjury[]>(`${dasar}/${encodeURIComponent(f.id)}`, { method: "PATCH", body: { expectedReturnOn: f.expectedReturnOn, note: f.note } })
        : api<PlayerInjury[]>(dasar, { method: "POST", body: f }),
    );
    if (ok) setForm(null);
  };
  const pulih = (c: PlayerInjury) => jalankan(() => api<PlayerInjury[]>(`${dasar}/${encodeURIComponent(c.id)}/recover`, { method: "POST", body: {} }));
  const set = (k: keyof typeof kosong, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <Show when={props.daftar.length > 0 || props.bisaUbah}>
      <section class="panel-nilai panel-cedera" aria-label="Cedera">
        <div class="panel-kepala">
          <div>
            <h3>Cedera</h3>
            <p class="petunjuk">Data kesehatan anak. Hanya admin, pelatih, dan orang tua anak ini yang melihatnya.</p>
          </div>
          <Show when={props.bisaUbah && !form()}>
            <button type="button" class="tombol tipis tombol-kecil" disabled={sibuk()} onClick={() => buka()}>
              Catat cedera
            </button>
          </Show>
        </div>

        <Show when={berjalan().length > 0} fallback={<p class="kosong">Tidak ada cedera yang sedang berjalan.</p>}>
          <ul class="cedera-daftar">
            <For each={berjalan()}>
              {(c) => (
                <li class="cedera-butir">
                  <div>
                    <strong>{bodyPartLabel(c.bodyPart)}</strong>
                    <span class="petunjuk">
                      {" "}
                      sejak {tanggal(c.startedOn)}
                      {c.expectedReturnOn ? `, perkiraan pulih ${tanggal(c.expectedReturnOn)}` : ", perkiraan pulih belum ditentukan"}
                    </span>
                    <Show when={c.note}>
                      <p class="cedera-catatan">{c.note}</p>
                    </Show>
                  </div>
                  <Show when={props.bisaUbah}>
                    <div class="aksi-baris">
                      <button type="button" class="tombol tipis tombol-kecil" disabled={sibuk()} onClick={() => buka(c)}>
                        Ubah
                      </button>
                      <button type="button" class="tombol tombol-kecil" disabled={sibuk()} onClick={() => pulih(c)}>
                        Tandai pulih
                      </button>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={galat() && !form()}>
          <p class="pesan-salah" role="alert">
            {galat()}
          </p>
        </Show>

        <Show when={form()}>
          {(f) => (
            <form class="cedera-form" onSubmit={simpan}>
              <h4>{f().id ? `Ubah cedera: ${bodyPartLabel(f().bodyPart)}` : "Catat cedera"}</h4>
              <Show when={!f().id}>
                <SelectField
                  id="cedera-bagian"
                  label="Bagian tubuh"
                  value={f().bodyPart}
                  onInput={(v) => set("bodyPart", v)}
                  options={bodyParts.map((b) => ({ value: b.code, label: b.label }))}
                  error={salah().bodyPart}
                  required
                />
                <Field
                  id="cedera-mulai"
                  label="Mulai cedera"
                  type="date"
                  value={f().startedOn}
                  onInput={(v) => set("startedOn", v)}
                  error={salah().startedOn}
                  required
                />
              </Show>
              <Field
                id="cedera-pulih"
                label="Perkiraan pulih (boleh dikosongkan)"
                type="date"
                value={f().expectedReturnOn}
                onInput={(v) => set("expectedReturnOn", v)}
                error={salah().expectedReturnOn}
              />
              <div class="field" attr:data-salah={salah().note ? "" : undefined}>
                <label for="cedera-catatan">Catatan (boleh dikosongkan)</label>
                <textarea id="cedera-catatan" rows="3" maxlength={INJURY_NOTE_MAX} value={f().note} onInput={(e) => set("note", e.currentTarget.value)} />
                <Show when={salah().note}>
                  <span class="pesan-salah">{salah().note}</span>
                </Show>
              </div>
              <Show when={galat()}>
                <p class="pesan-salah" role="alert">
                  {galat()}
                </p>
              </Show>
              <div class="aksi-baris">
                <button class="tombol utama tombol-kecil" type="submit" disabled={sibuk()}>
                  {sibuk() ? "Menyimpan…" : "Simpan"}
                </button>
                <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk()} onClick={() => setForm(null)}>
                  Batal
                </button>
              </div>
            </form>
          )}
        </Show>

        <Show when={riwayat().length > 0}>
          <details class="cedera-riwayat">
            <summary>Riwayat cedera ({riwayat().length})</summary>
            <ul class="cedera-daftar">
              <For each={riwayat()}>
                {(c) => (
                  <li class="cedera-butir">
                    <div>
                      <strong>{bodyPartLabel(c.bodyPart)}</strong>
                      <span class="petunjuk">
                        {" "}
                        {tanggal(c.startedOn)} sampai {tanggal(c.recoveredOn!)}
                      </span>
                      <Show when={c.note}>
                        <p class="cedera-catatan">{c.note}</p>
                      </Show>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </details>
        </Show>
      </section>
    </Show>
  );
}
