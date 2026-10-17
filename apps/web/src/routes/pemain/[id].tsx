import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import PlayerForm from "~/components/PlayerForm";
import SelectField from "~/components/SelectField";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { posisiLabel, statusLabel, tanggal, usia, type AgeGroup, type PlayerDetail } from "~/lib/pemain";

type Member = { id: string; name: string; email: string; role: string };

export default function DetailPemain() {
  const nav = useNavigate();
  const p = useParams<{ id: string }>();
  const [me, setMe] = createSignal<Me | null>(null);
  const [pl, setPl] = createSignal<PlayerDetail | null>(null);
  const [missing, setMissing] = createSignal(false);
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);
  const [parents, setParents] = createSignal<Member[]>([]);
  const [editing, setEditing] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [pick, setPick] = createSignal("");
  const [guardianError, setGuardianError] = createSignal("");

  const admin = () => me()?.active?.role === "admin_ssb";

  const load = async () => {
    try {
      setPl(await api<PlayerDetail>(`/players/${encodeURIComponent(p.id)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setMissing(true);
    }
  };

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    await load();
    if (m.active.role === "admin_ssb") {
      setGroups(await api<AgeGroup[]>("/age-groups").catch(() => []));
      setParents((await api<Member[]>("/users").catch(() => [])).filter((u) => u.role === "orang_tua"));
    }
  });

  const addGuardian = createSubmit(async () => {
    setGuardianError("");
    await api(`/players/${p.id}/guardians`, { method: "POST", body: { userId: pick() } });
    setPick("");
    await load();
  });
  const removeGuardian = async (userId: string) => {
    setGuardianError("");
    try {
      await api(`/players/${p.id}/guardians/${userId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setGuardianError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    }
  };
  const available = () => parents().filter((u) => !pl()?.guardians?.some((g) => g.userId === u.id));

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <AppBar me={me()!} />
      <main class="halaman">
        <Show
          when={!missing()}
          fallback={
            <>
              <Title>Pemain tidak ditemukan · SSB App</Title>
              <h1>Pemain tidak ditemukan</h1>
              <p>Pemain ini tidak ada, atau bukan bagian dari KU atau anak yang bisa Anda akses.</p>
              <A class="tombol" href="/pemain">Ke daftar pemain</A>
            </>
          }
        >
          <Show when={pl()} fallback={<p>Memuat…</p>}>
            <Title>{pl()!.fullName} · SSB App</Title>
            <h1>{pl()!.fullName}</h1>
            <Show
              when={!editing()}
              fallback={
                <>
                  <PlayerForm initial={pl()!} ageGroups={groups()} onSaved={async () => { setEditing(false); setSaved(true); await load(); }} />
                  <p class="tautan-bawah"><button class="tombol tipis" type="button" onClick={() => setEditing(false)}>Batal</button></p>
                </>
              }
            >
              <Show when={saved()}>
                <div class="info" role="status">Perubahan disimpan.</div>
              </Show>
              <dl class="rincian">
                <dt>Nomor anggota</dt><dd>{pl()!.memberNo ?? "-"}</dd>
                <dt>Tanggal lahir</dt><dd>{tanggal(pl()!.birthDate)}, {usia(pl()!.birthDate)} tahun</dd>
                <dt>KU</dt><dd>{pl()!.ageGroup?.name ?? "Belum ditentukan"}</dd>
                <dt>Posisi</dt><dd>{pl()!.position ? posisiLabel[pl()!.position!] : "Belum ditentukan"}</dd>
                <dt>Sekolah</dt><dd>{pl()!.school ?? "-"}</dd>
                <dt>Status</dt><dd>{statusLabel[pl()!.status]}</dd>
              </dl>
              <Show when={admin()}>
                <button class="tombol" type="button" onClick={() => { setSaved(false); setEditing(true); }}>Ubah data pemain</button>
              </Show>
            </Show>

            <Show when={admin()}>
              <section class="master">
                <h2>Orang tua</h2>
                <Show when={guardianError()}>
                  <div class="peringatan" role="alert">{guardianError()}</div>
                </Show>
                <Show when={(pl()!.guardians ?? []).length > 0} fallback={<p class="kosong">Belum ada orang tua yang terhubung. Buat undangan orang tua untuk pemain ini, atau hubungkan akun yang sudah ada.</p>}>
                  <ul class="daftar-butir">
                    <For each={pl()!.guardians}>
                      {(g) => (
                        <li class="butir">
                          <span class="isi">{g.name}{g.relationship ? `, ${g.relationship}` : ""}</span>
                          <button class="tombol tipis" type="button" onClick={() => removeGuardian(g.userId)}>Lepas</button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
                <Show when={available().length > 0}>
                  <form class="form" onSubmit={addGuardian.submit}>
                    <Show when={addGuardian.error()}>
                      <div class="peringatan" role="alert">{addGuardian.error()}</div>
                    </Show>
                    <SelectField id="ortu" label="Hubungkan orang tua yang sudah bergabung" blank="Pilih orang tua" required value={pick()} onInput={setPick} options={available().map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))} />
                    <button class="tombol" type="submit" disabled={addGuardian.busy()}>Hubungkan</button>
                  </form>
                </Show>
              </section>
            </Show>

            <Show when={me()!.active!.role !== "orang_tua"}>
              <section class="master">
                <h2>Riwayat perubahan</h2>
                <Show when={pl()!.history.length > 0} fallback={<p class="kosong">Belum ada perubahan KU atau status.</p>}>
                  <ul class="daftar-butir">
                    <For each={pl()!.history}>
                      {(h) => (
                        <li class="butir">
                          <span class="isi">
                            {h.field === "age_group" ? "KU" : "Status"}: {h.field === "status" ? (statusLabel[h.from ?? ""] ?? "-") : (h.from ?? "belum ada")} menjadi {h.field === "status" ? (statusLabel[h.to ?? ""] ?? "-") : (h.to ?? "belum ada")}
                          </span>
                          <span class="petunjuk">{tanggal(h.at)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </section>
            </Show>
            <p class="tautan-bawah"><A href="/pemain">Kembali ke daftar pemain</A></p>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
