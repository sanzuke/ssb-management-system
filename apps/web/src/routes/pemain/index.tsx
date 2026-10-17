import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createResource, createSignal, For, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import Field from "~/components/Field";
import SelectField from "~/components/SelectField";
import { api, getMe, type Me } from "~/lib/api";
import { posisiLabel, statusLabel, usia, type AgeGroup, type PlayerSummary } from "~/lib/pemain";

export default function DaftarPemain() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [q, setQ] = createSignal("");
  const [ku, setKu] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [groups, setGroups] = createSignal<AgeGroup[]>([]);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active) return nav("/", { replace: true });
    setMe(m);
    // Orang tua tidak punya akses ke data master; filter KU tidak ditampilkan untuk mereka.
    if (m.active.role !== "orang_tua") setGroups(await api<AgeGroup[]>("/age-groups").catch(() => []));
  });

  const params = () => {
    const s = new URLSearchParams();
    if (q().trim()) s.set("q", q().trim());
    if (ku()) s.set("ageGroupId", ku());
    if (status()) s.set("status", status());
    return s.toString();
  };
  const [players] = createResource(
    () => (me() ? params() : null),
    (qs) => api<PlayerSummary[]>(`/players${qs ? `?${qs}` : ""}`),
  );
  const role = () => me()?.active?.role;

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Pemain · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman">
        <h1>{role() === "orang_tua" ? "Anak Anda" : "Pemain"}</h1>
        <Show when={role() === "admin_ssb"}>
          <p>
            <A class="tombol utama" href="/pemain/baru">
              Tambah pemain
            </A>
          </p>
        </Show>
        <Show when={role() !== "orang_tua"}>
          <div class="form saring">
            <Field id="cari" label="Cari nama" value={q()} onInput={setQ} />
            <SelectField id="fku" label="KU" blank="Semua KU" value={ku()} onInput={setKu} options={groups().map((g) => ({ value: g.id, label: g.name }))} />
            <SelectField
              id="fstatus"
              label="Status"
              blank="Semua status"
              value={status()}
              onInput={setStatus}
              options={Object.entries(statusLabel).map(([value, label]) => ({ value, label }))}
            />
          </div>
        </Show>
        <Show when={players.error}>
          <div class="peringatan" role="alert">
            Daftar pemain tidak bisa dimuat. Muat ulang halaman.
          </div>
        </Show>
        <Show when={players()}>
          <Show
            when={players()!.length > 0}
            fallback={
              <p class="kosong">
                {params()
                  ? "Tidak ada pemain yang cocok dengan pencarian ini."
                  : role() === "admin_ssb"
                    ? "Belum ada pemain. Tambahkan pemain pertama."
                    : role() === "orang_tua"
                      ? "Belum ada anak yang terhubung ke akun Anda. Hubungi admin SSB."
                      : "Belum ada pemain di KU yang ditugaskan kepada Anda. Hubungi admin SSB untuk penugasan KU."}
              </p>
            }
          >
            <p class="petunjuk" aria-live="polite">
              {players()!.length} pemain
            </p>
            <ul class="daftar-butir">
              <For each={players()}>
                {(pl) => (
                  <li class="butir">
                    <A class="pemain-tautan" href={`/pemain/${pl.id}`}>
                      <strong>{pl.fullName}</strong>
                      <span class="petunjuk">
                        {[
                          pl.memberNo,
                          pl.ageGroup?.name ?? "Tanpa KU",
                          `${usia(pl.birthDate)} th`,
                          pl.position ? posisiLabel[pl.position] : null,
                          pl.status !== "aktif" ? statusLabel[pl.status] : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
