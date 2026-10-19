import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KartuProfil from "~/components/KartuProfil";
import RingkasanNilai from "~/components/RingkasanNilai";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createSignal, For, onMount, Show } from "solid-js";
import PlayerForm from "~/components/PlayerForm";
import SelectField from "~/components/SelectField";
import { api, ApiError, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { posisiLabel, statusLabel, tanggal, usia, type AgeGroup, type PlayerDetail } from "~/lib/pemain";
import type { AssessmentView } from "@ssb/shared";

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
  const bisaFoto = () => me()?.active?.role !== "orang_tua";
  const [fotoBusy, setFotoBusy] = createSignal(false);
  const [fotoError, setFotoError] = createSignal("");

  const unggahFoto = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setFotoError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setFotoError("Foto harus berformat JPG, PNG, atau WebP.");
    if (file.size > 2 * 1024 * 1024) return setFotoError("Foto terlalu besar. Maksimal 2 MB.");
    setFotoBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/players/${encodeURIComponent(p.id)}/photo`, { method: "PUT", credentials: "same-origin", body });
      if (!res.ok) throw new ApiError(res.status, "error", (await res.json().catch(() => null))?.error?.message ?? "Foto tidak bisa diunggah. Coba lagi.", {});
      await load();
    } catch (err) {
      setFotoError(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setFotoBusy(false);
    }
  };
  const hapusFoto = async () => {
    setFotoError("");
    setFotoBusy(true);
    try {
      await api(`/players/${encodeURIComponent(p.id)}/photo`, { method: "DELETE" });
      await load();
    } catch (err) {
      setFotoError(err instanceof ApiError ? err.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setFotoBusy(false);
    }
  };

  const [nilai, setNilai] = createSignal<AssessmentView[]>([]);
  const [periodeId, setPeriodeId] = createSignal("");
  // Periode yang tampil: pilihan pengguna, atau yang terbaru (yang punya skor lebih dulu).
  const terbaru = () => [...nilai()].sort((a, b) => b.period.startDate.localeCompare(a.period.startDate));
  const terpilih = () => nilai().find((a) => a.period.id === periodeId()) ?? terbaru().find((a) => a.overall !== null) ?? terbaru()[0] ?? null;

  const load = async () => {
    try {
      setPl(await api<PlayerDetail>(`/players/${encodeURIComponent(p.id)}`));
      setNilai(await api<AssessmentView[]>(`/players/${encodeURIComponent(p.id)}/assessments`).catch(() => []));
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
      <main class="halaman">
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
          <Show when={pl()} fallback={<p>Memuat…</p>}>
            <Title>{pl()!.fullName} · SSB App</Title>
            <KepalaHalaman
              chip="Profil pemain"
              judul={pl()!.fullName}
              sub={[pl()!.memberNo, pl()!.ageGroup?.name ?? "Belum ada KU"].filter(Boolean).join(" • ")}
            >
              <p class="aksi-baris">
                <A class="tombol tombol-kecil" href={`/nilai/${pl()!.id}`}>
                  Penilaian
                </A>
                <A class="tombol tombol-kecil" href={`/kartu/${pl()!.id}`}>
                  Kartu QR
                </A>
                <Show when={terpilih()}>
                  <a class="tombol tombol-kecil" href={`/api/players/${encodeURIComponent(pl()!.id)}/assessments/${terpilih()!.period.id}/report`} download="">
                    Rapor PDF
                  </a>
                </Show>
              </p>
            </KepalaHalaman>
            <div class="profil-grid">
              <div class="profil-kiri">
                <KartuProfil pl={pl()!} nilai={terpilih()}>
                  <div class="foto-kelola">
                    <Show when={bisaFoto()}>
                      {/* biome-ignore lint/a11y/noLabelWithoutControl: input berkas tersembunyi ada di dalam label */}
                      <label class="tombol tombol-kecil" aria-disabled={fotoBusy()}>
                        {fotoBusy() ? "Mengunggah…" : pl()!.photoV ? "Ganti foto" : "Unggah foto"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={fotoBusy()} onChange={unggahFoto} />
                      </label>
                      <Show when={pl()!.photoV}>
                        <button class="tombol tipis tombol-kecil" type="button" disabled={fotoBusy()} onClick={hapusFoto}>
                          Hapus foto
                        </button>
                      </Show>
                      <span class="petunjuk">JPG, PNG, atau WebP, maksimal 2 MB. Foto persegi dengan wajah di tengah paling pas.</span>
                    </Show>
                  </div>
                  <Show when={fotoError()}>
                    <div class="peringatan" role="alert">
                      {fotoError()}
                    </div>
                  </Show>
                </KartuProfil>
              </div>
              <div class="profil-kanan">
                {/* biome-ignore lint/a11y/useSemanticElements: pintasan ke bagian halaman, hanya di HP */}
                <div class="profil-nav" role="group" aria-label="Loncat ke bagian">
                  <a href="#radar">Radar</a>
                  <a href="#atribut">Atribut</a>
                  <a href="#data">Data</a>
                </div>
                <RingkasanNilai
                  playerId={pl()!.id}
                  list={nilai()}
                  selectedId={terpilih()?.period.id ?? ""}
                  onSelect={setPeriodeId}
                  staf={me()!.active!.role !== "orang_tua"}
                />
                <div id="data">
                  <Show
                    when={!editing()}
                    fallback={
                      <>
                        <PlayerForm
                          initial={pl()!}
                          ageGroups={groups()}
                          onSaved={async () => {
                            setEditing(false);
                            setSaved(true);
                            await load();
                          }}
                        />
                        <p class="tautan-bawah">
                          <button class="tombol tipis" type="button" onClick={() => setEditing(false)}>
                            Batal
                          </button>
                        </p>
                      </>
                    }
                  >
                    <Show when={saved()}>
                      <div class="info" role="status">
                        Perubahan disimpan.
                      </div>
                    </Show>
                    <dl class="rincian">
                      <dt>Nomor anggota</dt>
                      <dd>{pl()!.memberNo ?? "-"}</dd>
                      <dt>Tanggal lahir</dt>
                      <dd>
                        {tanggal(pl()!.birthDate)}, {usia(pl()!.birthDate)} tahun
                      </dd>
                      <dt>KU</dt>
                      <dd>{pl()!.ageGroup?.name ?? "Belum ditentukan"}</dd>
                      <dt>Posisi</dt>
                      <dd>{pl()!.position ? posisiLabel[pl()!.position!] : "Belum ditentukan"}</dd>
                      <dt>Sekolah</dt>
                      <dd>{pl()!.school ?? "-"}</dd>
                      <dt>Status</dt>
                      <dd>{statusLabel[pl()!.status]}</dd>
                    </dl>
                    <Show when={admin()}>
                      <button
                        class="tombol"
                        type="button"
                        onClick={() => {
                          setSaved(false);
                          setEditing(true);
                        }}
                      >
                        Ubah data pemain
                      </button>
                    </Show>
                  </Show>

                  <Show when={admin()}>
                    <section class="master">
                      <h2>Orang tua</h2>
                      <Show when={guardianError()}>
                        <div class="peringatan" role="alert">
                          {guardianError()}
                        </div>
                      </Show>
                      <Show
                        when={(pl()!.guardians ?? []).length > 0}
                        fallback={
                          <p class="kosong">
                            Belum ada orang tua yang terhubung. Buat undangan orang tua untuk pemain ini, atau hubungkan akun yang sudah ada.
                          </p>
                        }
                      >
                        <ul class="daftar-butir">
                          <For each={pl()!.guardians}>
                            {(g) => (
                              <li class="butir">
                                <span class="isi">
                                  {g.name}
                                  {g.relationship ? `, ${g.relationship}` : ""}
                                </span>
                                <button class="tombol tipis" type="button" onClick={() => removeGuardian(g.userId)}>
                                  Lepas
                                </button>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                      <Show when={available().length > 0}>
                        <form class="form" onSubmit={addGuardian.submit}>
                          <Show when={addGuardian.error()}>
                            <div class="peringatan" role="alert">
                              {addGuardian.error()}
                            </div>
                          </Show>
                          <SelectField
                            id="ortu"
                            label="Hubungkan orang tua yang sudah bergabung"
                            blank="Pilih orang tua"
                            required
                            value={pick()}
                            onInput={setPick}
                            options={available().map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
                          />
                          <button class="tombol" type="submit" disabled={addGuardian.busy()}>
                            Hubungkan
                          </button>
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
                                  {h.field === "age_group" ? "KU" : "Status"}:{" "}
                                  {h.field === "status" ? (statusLabel[h.from ?? ""] ?? "-") : (h.from ?? "belum ada")} menjadi{" "}
                                  {h.field === "status" ? (statusLabel[h.to ?? ""] ?? "-") : (h.to ?? "belum ada")}
                                </span>
                                <span class="petunjuk">{tanggal(h.at)}</span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </section>
                  </Show>
                </div>
              </div>
            </div>
            <p class="tautan-bawah">
              <A href="/pemain">Kembali ke daftar pemain</A>
            </p>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
