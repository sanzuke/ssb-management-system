import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { SiteAdminView, TrialRow, TrialStatus } from "@ssb/shared";
import KartuPendaftar, { labelStatusTrial } from "~/components/KartuPendaftar";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import SelectField from "~/components/SelectField";
import { api, getMe, type Me } from "~/lib/api";

export default function Pendaftar() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [baris, setBaris] = createSignal<TrialRow[]>([]);
  const [program, setProgram] = createSignal<Record<string, string>>({});
  const [saring, setSaring] = createSignal<"" | TrialStatus>("");
  const [gagal, setGagal] = createSignal(false);
  const [dimuat, setDimuat] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
    try {
      setBaris(await api<TrialRow[]>("/trials"));
      // Nama program untuk label; boleh gagal tanpa mengganggu daftar.
      const site = await api<SiteAdminView>("/site").catch(() => null);
      if (site) setProgram(Object.fromEntries(site.draft.programs.map((p) => [p.id, p.name.id])));
    } catch {
      setGagal(true);
    }
    setDimuat(true);
  });

  const tampil = createMemo(() => baris().filter((b) => !saring() || b.status === saring()));
  const jumlahBaru = () => baris().filter((b) => b.status === "baru").length;
  const ganti = (b: TrialRow) => setBaris((l) => l.map((x) => (x.id === b.id ? b : x)));

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Pendaftar trial · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Situs"
          judul="Pendaftar trial"
          sub="Anak yang mendaftar trial lewat landing page. Hubungi orang tuanya, lalu catat tindak lanjutnya di sini."
        />
        <Show when={!dimuat()}>
          <Memuat />
        </Show>
        <Show when={gagal()}>
          <p class="kosong">Daftar pendaftar tidak bisa dimuat. Muat ulang halaman ini.</p>
        </Show>
        <Show when={dimuat() && !gagal()}>
          <Show
            when={baris().length > 0}
            fallback={<p class="kosong">Belum ada pendaftar. Pendaftar muncul di sini setelah landing page diterbitkan dan ada yang mengisi formulir trial.</p>}
          >
            <div class="form saring">
              <SelectField
                id="saring-status"
                label={`Status (${jumlahBaru()} baru dari ${baris().length})`}
                value={saring()}
                onInput={(v) => setSaring(v === "" ? "" : ((Object.keys(labelStatusTrial) as TrialStatus[]).find((k) => k === v) ?? ""))}
                blank="Semua"
                options={(Object.keys(labelStatusTrial) as TrialStatus[]).map((v) => ({ value: v, label: labelStatusTrial[v] }))}
              />
            </div>
            <Show when={tampil().length === 0}>
              <p class="kosong">Tidak ada pendaftar dengan status itu.</p>
            </Show>
            <div class="daftar-pendaftar">
              <For each={tampil()}>
                {(b) => (
                  <KartuPendaftar
                    baris={b}
                    program={b.programId ? program()[b.programId] : undefined}
                    ssbName={me()?.active?.ssbName ?? "akademi"}
                    onUbah={ganti}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </main>
    </Show>
  );
}
