import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import KepalaHalaman from "~/components/KepalaHalaman";
import SelectField from "~/components/SelectField";
import { api, ApiError, getMe, roleLabel, type Me } from "~/lib/api";
import { inisial, tanggal } from "~/lib/pemain";
import { linkWa } from "~/lib/wa";
import type { MemberRow } from "@ssb/shared";

type Saring = "semua" | "admin_ssb" | "korlas" | "pelatih" | "orang_tua";
type ResetLink = { url: string; name: string; expiresAt: string };
const SARING: { id: Saring; label: string }[] = [
  { id: "semua", label: "Semua" },
  { id: "admin_ssb", label: "Admin" },
  { id: "korlas", label: "Korlas" },
  { id: "pelatih", label: "Pelatih" },
  { id: "orang_tua", label: "Orang tua" },
];
const tgl = (s: string) => new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function Anggota() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [rows, setRows] = createSignal<MemberRow[] | null>(null);
  const [saring, setSaring] = createSignal<Saring>("semua");
  const [cari, setCari] = createSignal("");
  const [ubah, setUbah] = createSignal<string | null>(null);
  const [nama, setNama] = createSignal("");
  const [wa, setWa] = createSignal("");
  const [peran, setPeran] = createSignal("pelatih");
  const [yakin, setYakin] = createSignal<string | null>(null);
  const [galat, setGalat] = createSignal("");
  const [pesan, setPesan] = createSignal("");
  const [sibuk, setSibuk] = createSignal("");
  const [resetLink, setResetLink] = createSignal<ResetLink | null>(null);
  const [salin, setSalin] = createSignal("");

  const muat = async () => setRows(await api<MemberRow[]>("/members").catch(() => []));
  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
    await muat();
  });

  const hitung = (s: Saring) => (rows() ?? []).filter((r) => s === "semua" || r.role === s).length;
  const tampil = createMemo(() => {
    const q = cari().trim().toLowerCase();
    return (rows() ?? []).filter((r) => (saring() === "semua" || r.role === saring()) && (!q || `${r.name} ${r.email}`.toLowerCase().includes(q)));
  });

  const aksi = async (kunci: string, kerja: () => Promise<void>) => {
    setGalat("");
    setPesan("");
    setSibuk(kunci);
    try {
      await kerja();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
    } finally {
      setSibuk("");
    }
  };

  const bukaUbah = (r: MemberRow) => {
    setUbah(ubah() === r.userId ? null : r.userId);
    setYakin(null);
    setNama(r.name);
    setWa(r.whatsapp ?? "");
    setPeran(r.role);
    setGalat("");
  };
  const simpan = (r: MemberRow) =>
    aksi(r.userId, async () => {
      const body: Record<string, string> = {};
      if (nama().trim() !== r.name) body.name = nama().trim();
      if (wa().trim() !== (r.whatsapp ?? "")) body.whatsapp = wa().trim();
      if (!r.isSelf && peran() !== r.role) body.role = peran();
      if (Object.keys(body).length === 0) {
        setUbah(null);
        return;
      }
      await api(`/members/${r.userId}`, { method: "PATCH", body });
      setUbah(null);
      setPesan(`Data ${body.name ?? r.name} disimpan.`);
      await muat();
    });
  const keluarkan = (r: MemberRow) =>
    aksi(r.userId, async () => {
      await api(`/members/${r.userId}`, { method: "DELETE" });
      setYakin(null);
      setPesan(`${r.name} dikeluarkan dari SSB. Riwayat absensi dan penilaian tetap tersimpan.`);
      await muat();
    });
  const buatReset = (r: MemberRow) =>
    aksi(r.userId, async () => {
      setResetLink(await api<ResetLink>(`/users/${r.userId}/reset-link`, { method: "POST" }));
      setSalin("");
    });
  const salinResetLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLink()!.url);
      setSalin("Tautan disalin.");
    } catch {
      setSalin("Salin manual: pilih tautan di atas, lalu tekan Ctrl+C.");
    }
  };
  const pesanResetWa = (nomor: string | null) => {
    const t = resetLink()!;
    return linkWa(nomor, `Halo ${t.name}, ini tautan untuk mengatur ulang kata sandi SSB App Anda (berlaku sampai ${tgl(t.expiresAt)}): ${t.url}`);
  };

  const rincian = (r: MemberRow) =>
    [r.role === "orang_tua" ? `${r.children} anak` : r.role !== "admin_ssb" ? `${r.assignments} penugasan KU` : "", `bergabung ${tanggal(r.joinedAt)}`]
      .filter(Boolean)
      .join(" • ");

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Anggota · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Pengaturan"
          judul="Anggota SSB"
          sub="Kelola pelatih, korlas, orang tua, dan admin: ubah data dan peran, buatkan tautan reset kata sandi, atau keluarkan dari SSB."
        />

        <p class="aksi-baris">
          <A class="tombol utama" href="/undangan">
            Undang anggota baru
          </A>
          <A class="tombol" href="/penugasan">
            Atur penugasan pelatih
          </A>
        </p>

        <Show when={pesan()}>
          <div class="info" role="status">
            {pesan()}
          </div>
        </Show>
        <Show when={galat()}>
          <div class="peringatan" role="alert">
            {galat()}
          </div>
        </Show>

        <Show when={resetLink()}>
          {(t) => (
            <section class="tautan-baru" aria-label="Tautan reset kata sandi">
              <h2>Tautan reset kata sandi untuk {t().name}</h2>
              <p class="petunjuk">Kirim tautan ini langsung ke orangnya. Berlaku sampai {tgl(t().expiresAt)}, sekali pakai, dan tampil sekali ini saja.</p>
              <input class="tautan-isi" readonly value={t().url} aria-label="Tautan reset kata sandi" onFocus={(e) => e.currentTarget.select()} />
              <div class="aksi-baris">
                <button class="tombol utama" type="button" onClick={salinResetLink}>
                  Salin tautan
                </button>
                <Show when={pesanResetWa((rows() ?? []).find((r) => r.name === t().name)?.whatsapp ?? null)}>
                  {(href) => (
                    <a class="tombol" href={href()} target="_blank" rel="noopener noreferrer">
                      Kirim lewat WhatsApp
                    </a>
                  )}
                </Show>
                <button class="tombol tipis" type="button" onClick={() => setResetLink(null)}>
                  Tutup
                </button>
              </div>
              <Show when={salin()}>
                <p class="petunjuk">{salin()}</p>
              </Show>
            </section>
          )}
        </Show>

        <section class="master" aria-label="Daftar anggota">
          {/* biome-ignore lint/a11y/useSemanticElements: deretan penyaring peran */}
          <div class="tab-periode" role="group" aria-label="Saring peran">
            <For each={SARING}>
              {(s) => (
                <button type="button" aria-pressed={saring() === s.id} onClick={() => setSaring(s.id)}>
                  {s.label} ({hitung(s.id)})
                </button>
              )}
            </For>
          </div>
          <Field id="cari-anggota" label="Cari nama atau email" type="search" autocomplete="off" value={cari()} onInput={setCari} />

          <Show when={rows()} fallback={<p>Memuat…</p>}>
            <Show when={tampil().length > 0} fallback={<p class="kosong">Tidak ada anggota yang cocok.</p>}>
              <ul class="anggota-daftar">
                <For each={tampil()}>
                  {(r) => (
                    <li>
                      <div class="anggota-baris">
                        <span class="avatar-pengguna" aria-hidden="true">
                          {inisial(r.name)}
                        </span>
                        <div class="undangan-info">
                          <strong>
                            {r.name}
                            <Show when={r.isSelf}>
                              <span class="status-pil"> Anda</span>
                            </Show>
                          </strong>
                          <span class="petunjuk">{r.email}</span>
                          <span class="petunjuk">{rincian(r)}</span>
                        </div>
                        <div class="anggota-chip">
                          <span class="ortu-chip" classList={{ kuning: r.role === "admin_ssb" }}>
                            {roleLabel[r.role]}
                          </span>
                          <Show when={r.whatsapp} fallback={<span class="petunjuk">Tanpa WhatsApp</span>}>
                            <a class="petunjuk" href={linkWa(r.whatsapp) ?? undefined} target="_blank" rel="noopener noreferrer">
                              {r.whatsapp}
                            </a>
                          </Show>
                          <span class="petunjuk">{[r.hasPassword ? "Kata sandi" : "", r.hasGoogle ? "Google" : ""].filter(Boolean).join(" + ")}</span>
                        </div>
                      </div>

                      <div class="aksi-baris">
                        <button class="tombol tipis tombol-kecil" type="button" onClick={() => bukaUbah(r)}>
                          {ubah() === r.userId ? "Tutup" : "Ubah"}
                        </button>
                        <Show when={r.hasPassword && !r.isSelf}>
                          <button class="tombol tipis tombol-kecil" type="button" disabled={sibuk() === r.userId} onClick={() => buatReset(r)}>
                            Tautan reset sandi
                          </button>
                        </Show>
                        <Show when={!r.isSelf}>
                          <Show
                            when={yakin() === r.userId}
                            fallback={
                              <button class="tombol tipis tombol-kecil bahaya" type="button" onClick={() => setYakin(r.userId)}>
                                Keluarkan
                              </button>
                            }
                          >
                            <span class="anggota-yakin" role="alert">
                              Keluarkan {r.name}? Penugasan dan kaitan anaknya ikut lepas.
                              <button class="tombol bahaya tombol-kecil" type="button" disabled={sibuk() === r.userId} onClick={() => keluarkan(r)}>
                                Ya, keluarkan
                              </button>
                              <button class="tombol tipis tombol-kecil" type="button" onClick={() => setYakin(null)}>
                                Batal
                              </button>
                            </span>
                          </Show>
                        </Show>
                      </div>

                      <Show when={ubah() === r.userId}>
                        <form
                          class="form anggota-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            simpan(r);
                          }}
                        >
                          <Field id={`nama-${r.userId}`} label="Nama tampilan" required maxlength={120} value={nama()} onInput={setNama} />
                          <Field
                            id={`wa-${r.userId}`}
                            label="Nomor WhatsApp"
                            type="tel"
                            inputmode="tel"
                            hint="Kosongkan untuk menghapus."
                            value={wa()}
                            onInput={setWa}
                          />
                          <Show
                            when={!r.isSelf}
                            fallback={<p class="petunjuk">Peran Anda sendiri tidak bisa diubah dari sini. Minta admin lain bila perlu.</p>}
                          >
                            <SelectField
                              id={`peran-${r.userId}`}
                              label="Peran"
                              value={peran()}
                              onInput={setPeran}
                              options={(Object.keys(roleLabel) as (keyof typeof roleLabel)[]).map((value) => ({ value, label: roleLabel[value] ?? value }))}
                              hint={
                                peran() === "admin_ssb"
                                  ? "Admin bisa mengelola semua data, anggota, dan keuangan SSB."
                                  : r.role === "orang_tua"
                                    ? "Orang tua yang masih terhubung ke anak harus dilepas dulu di profil pemain."
                                    : "Penugasan KU tetap berlaku untuk pelatih dan korlas."
                              }
                            />
                          </Show>
                          <button class="tombol utama" type="submit" disabled={sibuk() === r.userId}>
                            {sibuk() === r.userId ? "Menyimpan…" : "Simpan perubahan"}
                          </button>
                        </form>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </Show>
        </section>
      </main>
    </Show>
  );
}
