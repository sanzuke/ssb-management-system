import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import KepalaHalaman from "~/components/KepalaHalaman";
import SelectField from "~/components/SelectField";
import Memuat from "~/components/Memuat";
import Kerangka from "~/components/Kerangka";
import { api, ApiError, getMe, roleLabel, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import type { InvitationRow, PlayerSummary } from "@ssb/shared";

type Tautan = { url: string; label: string; role: string; expiresAt: string };
type Saring = "menunggu" | "semua" | "diterima" | "kedaluwarsa";

const tgl = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const statusLabel: Record<InvitationRow["status"], string> = { menunggu: "Menunggu", diterima: "Diterima", kedaluwarsa: "Kedaluwarsa" };
const peran = { pelatih: "Pelatih", korlas: "Koordinator kelompok usia", orang_tua: "Orang tua" };

export default function KelolaUndangan() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [rows, setRows] = createSignal<InvitationRow[] | null>(null);
  const [players, setPlayers] = createSignal<PlayerSummary[]>([]);
  const [saring, setSaring] = createSignal<Saring>("menunggu");
  const [role, setRole] = createSignal("pelatih");
  const [label, setLabel] = createSignal("");
  const [playerId, setPlayerId] = createSignal("");
  const [tautan, setTautan] = createSignal<Tautan | null>(null);
  const [salin, setSalin] = createSignal("");
  const [galat, setGalat] = createSignal("");
  const [sibuk, setSibuk] = createSignal("");

  const load = async () => setRows(await api<InvitationRow[]>("/invitations").catch(() => []));

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
    const [p] = await Promise.all([api<PlayerSummary[]>("/players").catch(() => []), load()]);
    setPlayers(p);
  });

  const tampil = createMemo(() => (rows() ?? []).filter((r) => saring() === "semua" || r.status === saring()));
  const hitung = (s: InvitationRow["status"]) => (rows() ?? []).filter((r) => r.status === s).length;

  const buat = createSubmit(async () => {
    const body = { role: role(), label: label().trim() || undefined, playerId: role() === "orang_tua" && playerId() ? playerId() : undefined };
    const r = await api<{ url: string; expiresAt: string }>("/invitations", { method: "POST", body });
    setTautan({ url: r.url, label: label().trim(), role: role(), expiresAt: r.expiresAt });
    setLabel("");
    setPlayerId("");
    setSalin("");
    await load();
  });

  const aksi = async (kunci: string, kerja: () => Promise<void>) => {
    setGalat("");
    setSibuk(kunci);
    try {
      await kerja();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk("");
    }
  };
  const buatUlang = (r: InvitationRow) =>
    aksi(r.id, async () => {
      const x = await api<{ url: string; expiresAt: string }>(`/invitations/${r.id}/renew`, { method: "POST" });
      setTautan({ url: x.url, label: r.label ?? "", role: r.role, expiresAt: x.expiresAt });
      setSalin("");
      await load();
    });
  const cabut = (r: InvitationRow) =>
    aksi(r.id, async () => {
      await api(`/invitations/${r.id}`, { method: "DELETE" });
      await load();
    });

  const salinTautan = async () => {
    try {
      await navigator.clipboard.writeText(tautan()!.url);
      setSalin("Tautan disalin.");
    } catch {
      setSalin("Salin manual: pilih tautan di atas, lalu tekan Ctrl+C.");
    }
  };
  const pesanWa = () => {
    const t = tautan()!;
    const nama = me()?.active?.ssbName ?? "SSB";
    return `https://wa.me/?text=${encodeURIComponent(`Halo${t.label ? ` ${t.label}` : ""}, Anda diundang bergabung sebagai ${peran[t.role as keyof typeof peran] ?? t.role} di ${nama}. Buka tautan ini (berlaku sampai ${tgl(t.expiresAt)}): ${t.url}`)}`;
  };

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Undangan · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Pengaturan"
          judul="Undangan dan anggota"
          sub="Undang pelatih, korlas, dan orang tua lewat tautan sekali pakai yang berlaku 7 hari."
        />

        <Show when={tautan()}>
          {(t) => (
            <section class="tautan-baru" aria-label="Tautan undangan baru">
              <h2>Tautan undangan siap dikirim</h2>
              <p class="petunjuk">
                Tautan ini hanya tampil sekali. Bila terlewat, buat ulang tautannya dari daftar di bawah. Berlaku sampai {tgl(t().expiresAt)}.
              </p>
              <input class="tautan-isi" readonly value={t().url} aria-label="Tautan undangan" onFocus={(e) => e.currentTarget.select()} />
              <div class="aksi-baris">
                <button class="tombol utama" type="button" onClick={salinTautan}>
                  Salin tautan
                </button>
                <a class="tombol" href={pesanWa()} target="_blank" rel="noopener noreferrer">
                  Kirim lewat WhatsApp
                </a>
                <button class="tombol tipis" type="button" onClick={() => setTautan(null)}>
                  Tutup
                </button>
              </div>
              <Show when={salin()}>
                <p class="petunjuk" role="status">
                  {salin()}
                </p>
              </Show>
            </section>
          )}
        </Show>

        <div class="undangan-grid">
          <section class="master" aria-label="Buat undangan">
            <h2>Buat undangan</h2>
            <form class="form" onSubmit={buat.submit}>
              <Show when={buat.error()}>
                <div class="peringatan" role="alert">
                  {buat.error()}
                </div>
              </Show>
              <SelectField
                id="peran"
                label="Diundang sebagai"
                required
                value={role()}
                onInput={setRole}
                options={Object.entries(peran).map(([value, label]) => ({ value, label }))}
              />
              <Field
                id="catatan"
                label="Nama atau catatan (boleh dikosongkan)"
                maxlength={120}
                autocomplete="off"
                value={label()}
                onInput={setLabel}
                error={buat.fields().label}
              />
              <Show when={role() === "orang_tua"}>
                <SelectField
                  id="anak"
                  label="Anak yang dihubungkan"
                  blank="Pilih pemain (opsional)"
                  hint="Orang tua langsung terhubung ke anak ini begitu undangan diterima."
                  value={playerId()}
                  onInput={setPlayerId}
                  options={players().map((p) => ({ value: p.id, label: `${p.fullName}${p.ageGroup ? ` (${p.ageGroup.name})` : ""}` }))}
                />
              </Show>
              <button class="tombol utama" type="submit" disabled={buat.busy()}>
                {buat.busy() ? "Membuat…" : "Buat tautan undangan"}
              </button>
            </form>
          </section>

          <section class="master" aria-label="Daftar undangan">
            <h2>Daftar undangan</h2>
            {/* biome-ignore lint/a11y/useSemanticElements: deretan penyaring status */}
            <div class="tab-periode" role="group" aria-label="Saring status">
              <For each={["menunggu", "diterima", "kedaluwarsa", "semua"] as Saring[]}>
                {(s) => (
                  <button type="button" aria-pressed={saring() === s} onClick={() => setSaring(s)}>
                    {s === "semua" ? "Semua" : statusLabel[s]}
                    <Show when={s !== "semua" && s}>{(st) => <> ({hitung(st())})</>}</Show>
                  </button>
                )}
              </For>
            </div>
            <Show when={galat()}>
              <div class="peringatan" role="alert">
                {galat()}
              </div>
            </Show>
            <Show when={rows()} fallback={<Kerangka />}>
              <Show
                when={tampil().length > 0}
                fallback={<p class="kosong">{saring() === "menunggu" ? "Tidak ada undangan yang menunggu." : "Tidak ada undangan pada status ini."}</p>}
              >
                <ul class="undangan-daftar">
                  <For each={tampil()}>
                    {(r) => (
                      <li>
                        <div class="undangan-info">
                          <strong>{r.label || "(tanpa catatan)"}</strong>
                          <span class="petunjuk">
                            {roleLabel[r.role]}
                            <Show when={r.player}>, untuk {r.player!.name}</Show>
                          </span>
                          <span class="petunjuk">
                            Dibuat {tgl(r.createdAt)}
                            {r.createdBy ? ` oleh ${r.createdBy}` : ""}
                            {r.status === "menunggu" ? `, berlaku sampai ${tgl(r.expiresAt)}` : ""}
                            {r.status === "kedaluwarsa" ? `, berakhir ${tgl(r.expiresAt)}` : ""}
                            {r.status === "diterima" && r.acceptedAt ? `, diterima ${tgl(r.acceptedAt)}` : ""}
                          </span>
                        </div>
                        <span class="status-undangan" data-status={r.status}>
                          {statusLabel[r.status]}
                        </span>
                        <Show when={r.status !== "diterima"}>
                          <div class="aksi-baris">
                            <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk() === r.id} onClick={() => buatUlang(r)}>
                              Buat ulang tautan
                            </button>
                            <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk() === r.id} onClick={() => cabut(r)}>
                              Cabut
                            </button>
                          </div>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </section>
        </div>

        <p class="petunjuk">
          Mengubah peran, mengeluarkan anggota, atau membuatkan tautan reset kata sandi ada di <A href="/anggota">halaman Anggota</A>.
        </p>
      </main>
    </Show>
  );
}
