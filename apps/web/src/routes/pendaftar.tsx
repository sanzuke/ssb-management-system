import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createEffect, createMemo, createSignal, For, onMount, Show } from "solid-js";
import type { SiteAdminView, TrialConvertResult, TrialRow, TrialStatus } from "@ssb/shared";
import Ikon from "~/components/Ikon";
import KartuPendaftar, { labelStatusTrial, umur } from "~/components/KartuPendaftar";
import KepalaHalaman from "~/components/KepalaHalaman";
import Memuat from "~/components/Memuat";
import { api, getMe, type Me } from "~/lib/api";
import { linkWa } from "~/lib/wa";

const PER_HALAMAN = 10;
const STATUS = Object.keys(labelStatusTrial) as TrialStatus[];
const tgl = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
const jam = (iso: string) => new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

/**
 * Pendaftar trial sebagai tabel: cari, saring status dan KU, halaman. Rincian, status, catatan, dan "jadikan siswa"
 * dibuka di dialog lewat tombol Detail supaya daftar tetap ringkas walau pendaftarnya banyak.
 */
export default function Pendaftar() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [baris, setBaris] = createSignal<TrialRow[]>([]);
  const [program, setProgram] = createSignal<Record<string, string>>({});
  const [kus, setKus] = createSignal<{ id: string; name: string }[]>([]);
  const [gagal, setGagal] = createSignal(false);
  const [dimuat, setDimuat] = createSignal(false);
  const [saring, setSaring] = createSignal<"" | TrialStatus>("");
  const [q, setQ] = createSignal("");
  const [ku, setKu] = createSignal("");
  const [halaman, setHalaman] = createSignal(1);
  const [dibuka, setDibuka] = createSignal<string | null>(null);
  let dialog: HTMLDialogElement | undefined;

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (m.active?.role !== "admin_ssb") return nav("/", { replace: true });
    setMe(m);
    try {
      setBaris(await api<TrialRow[]>("/trials"));
      // Nama program untuk label; boleh gagal tanpa mengganggu daftar.
      const site = await api<SiteAdminView>("/site").catch(() => null);
      setKus(await api<{ id: string; name: string }[]>("/age-groups").catch(() => []));
      if (site) setProgram(Object.fromEntries(site.draft.programs.map((p) => [p.id, p.name.id])));
    } catch {
      setGagal(true);
    }
    setDimuat(true);
  });

  createEffect(() => {
    if (dibuka() && !dialog?.open) dialog?.showModal();
    if (!dibuka() && dialog?.open) dialog.close();
  });

  const urut = createMemo(() => [...baris()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const jumlah = (s: "" | TrialStatus) => baris().filter((b) => !s || b.status === s).length;
  const disaring = createMemo(() => {
    const kata = q().trim().toLowerCase();
    const digit = kata.replace(/\D/g, "");
    return urut().filter(
      (b) =>
        (!saring() || b.status === saring()) &&
        (!ku() || (ku() === "none" ? !b.ageGroup : b.ageGroup?.id === ku())) &&
        (!kata ||
          b.childName.toLowerCase().includes(kata) ||
          b.parentName.toLowerCase().includes(kata) ||
          b.code.toLowerCase().includes(kata) ||
          (digit.length >= 3 && b.phone.replace(/\D/g, "").includes(digit))),
    );
  });
  const jumlahHalaman = () => Math.max(1, Math.ceil(disaring().length / PER_HALAMAN));
  const halamanKini = () => Math.min(halaman(), jumlahHalaman());
  const tampil = () => disaring().slice((halamanKini() - 1) * PER_HALAMAN, halamanKini() * PER_HALAMAN);
  const sedangDisaring = () => !!(q().trim() || ku() || saring());
  const ubah = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setHalaman(1);
  };
  const reset = () => {
    setQ("");
    setKu("");
    setSaring("");
    setHalaman(1);
  };

  const ganti = (b: TrialRow) => setBaris((l) => l.map((x) => (x.id === b.id ? b : x)));
  // Tautan undangan hanya dikirim sekali oleh API, jadi disimpan di sini selama halaman terbuka.
  const [undangan, setUndangan] = createSignal<Record<string, TrialConvertResult>>({});
  const jadi = (h: TrialConvertResult) => {
    setUndangan((u) => ({ ...u, [h.trial.id]: h }));
    ganti(h.trial);
  };
  const terbuka = () => baris().find((b) => b.id === dibuka()) ?? null;
  const ssbName = () => me()?.active?.ssbName ?? "akademi";
  const waUrl = (b: TrialRow) =>
    linkWa(
      b.phone,
      `Halo ${b.parentName}, kami dari ${ssbName()}. Terima kasih sudah mendaftarkan ${b.childName} untuk trial (kode ${b.code}). Kami ingin mengatur jadwal trialnya.`,
    );

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Pendaftar trial · SSB App</Title>
      <main class="halaman lebar">
        <KepalaHalaman
          chip="Situs"
          judul="Pendaftar trial"
          sub="Anak yang mendaftar trial lewat landing page. Hubungi orang tuanya, lalu catat tindak lanjutnya di sini."
        >
          <p class="aksi-baris">
            <A class="tombol tombol-kecil" href="/whatsapp">
              Pengaturan WhatsApp
            </A>
          </p>
        </KepalaHalaman>
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
            {/* biome-ignore lint/a11y/useSemanticElements: pilihan saringan status */}
            <div class="tab-periode tab-status" role="group" aria-label="Saring status">
              <button type="button" aria-pressed={saring() === ""} onClick={() => ubah(setSaring)("")}>
                Semua <span class="hitung">{jumlah("")}</span>
              </button>
              <For each={STATUS}>
                {(s) => (
                  <button type="button" aria-pressed={saring() === s} onClick={() => ubah(setSaring)(s)}>
                    {labelStatusTrial[s]} <span class="hitung">{jumlah(s)}</span>
                  </button>
                )}
              </For>
            </div>

            <section class="bilah-filter" aria-label="Pencarian dan filter">
              <div class="kolom-cari">
                <Ikon nama="cari" ukuran={18} />
                <input
                  type="search"
                  placeholder="Cari nama anak, orang tua, kode, atau telepon"
                  aria-label="Cari nama anak, orang tua, kode, atau telepon"
                  value={q()}
                  onInput={(e) => ubah(setQ)(e.currentTarget.value)}
                />
              </div>
              <select aria-label="Kelompok umur" value={ku()} onChange={(e) => ubah(setKu)(e.currentTarget.value)}>
                <option value="">Semua KU</option>
                <For each={kus()}>
                  {(g) => (
                    <option value={g.id} selected={ku() === g.id}>
                      {g.name}
                    </option>
                  )}
                </For>
                <option value="none">Tanpa KU</option>
              </select>
              <button class="tombol ikon-saja" type="button" onClick={reset} disabled={!sedangDisaring()} aria-label="Atur ulang filter" title="Atur ulang filter">
                <Ikon nama="ulang" ukuran={18} />
              </button>
            </section>

            <Show when={disaring().length > 0} fallback={<p class="kosong">Tidak ada pendaftar yang cocok dengan pencarian atau filter ini.</p>}>
              <p class="petunjuk" aria-live="polite">
                Menampilkan {disaring().length} pendaftar
                <Show when={sedangDisaring()}> dari {baris().length}</Show>
              </p>
              <div class="tabel-bungkus">
                <table class="tabel-pemain tabel-pendaftar">
                  <thead>
                    <tr>
                      <th>Pendaftar</th>
                      <th>Program</th>
                      <th>Orang tua</th>
                      <th>Masuk</th>
                      <th class="tengah">Status</th>
                      <th class="kanan">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={tampil()}>
                      {(b) => (
                        <tr classList={{ "baris-baru": b.status === "baru" }}>
                          <td class="sel-profil">
                            <button class="tautan-baris" type="button" onClick={() => setDibuka(b.id)}>
                              <strong>{b.childName}</strong>
                              <span class="petunjuk">
                                {b.gender}, {umur(b.birthDate)} · {b.code}
                              </span>
                            </button>
                          </td>
                          <td data-label="Program">
                            <span class="ku-titik">{b.ageGroup?.name ?? "Tanpa KU"}</span>
                            <span class="petunjuk">{(b.programId && program()[b.programId]) || b.programId || "Belum memilih"}</span>
                          </td>
                          <td class="sel-kontak" data-label="Orang tua">
                            <strong>{b.parentName}</strong>
                            <span class="petunjuk">{b.phone}</span>
                          </td>
                          <td data-label="Masuk">
                            {tgl(b.createdAt)}
                            <span class="petunjuk">{jam(b.createdAt)}</span>
                          </td>
                          <td class="tengah">
                            <span class={`status-trial ${b.status}`}>{labelStatusTrial[b.status]}</span>
                            <Show when={b.player}>
                              <span class="petunjuk">Sudah jadi siswa</span>
                            </Show>
                          </td>
                          <td class="kanan">
                            <span class="aksi-baris-tabel">
                              <Show when={waUrl(b)}>
                                {(u) => (
                                  <a class="tombol tipis tombol-kecil" href={u()} target="_blank" rel="noopener noreferrer" aria-label={`Hubungi ${b.parentName} lewat WhatsApp`}>
                                    WhatsApp
                                  </a>
                                )}
                              </Show>
                              <button class="tombol tombol-kecil" type="button" onClick={() => setDibuka(b.id)}>
                                Detail
                              </button>
                            </span>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <Show when={jumlahHalaman() > 1}>
                <nav class="paging" aria-label="Halaman">
                  <span class="petunjuk">
                    Menampilkan {(halamanKini() - 1) * PER_HALAMAN + 1} sampai {Math.min(halamanKini() * PER_HALAMAN, disaring().length)} dari{" "}
                    {disaring().length} pendaftar
                  </span>
                  <div class="paging-tombol">
                    <button type="button" class="tombol" disabled={halamanKini() === 1} onClick={() => setHalaman(halamanKini() - 1)}>
                      Sebelumnya
                    </button>
                    <For each={Array.from({ length: jumlahHalaman() }, (_, i) => i + 1)}>
                      {(n) => (
                        <button type="button" class="tombol nomor" aria-current={n === halamanKini() ? "page" : undefined} onClick={() => setHalaman(n)}>
                          {n}
                        </button>
                      )}
                    </For>
                    <button type="button" class="tombol" disabled={halamanKini() === jumlahHalaman()} onClick={() => setHalaman(halamanKini() + 1)}>
                      Berikutnya
                    </button>
                  </div>
                </nav>
              </Show>
            </Show>
          </Show>
        </Show>

        {/* biome-ignore lint/a11y/useKeyWithClickEvents: klik latar hanya pintasan; Esc dan tombol Tutup sudah menutup dialog */}
        <dialog class="dialog-detail" ref={dialog} aria-label="Rincian pendaftar" onClose={() => setDibuka(null)} onClick={(e) => e.target === dialog && setDibuka(null)}>
          <Show when={terbuka()}>
            {(b) => (
              <>
                <div class="dialog-detail-bilah">
                  <strong>Rincian pendaftar</strong>
                  <button class="tombol tipis tombol-kecil" type="button" onClick={() => setDibuka(null)}>
                    Tutup
                  </button>
                </div>
                <KartuPendaftar
                  baris={b()}
                  kus={kus()}
                  program={b().programId ? program()[b().programId!] : undefined}
                  ssbName={ssbName()}
                  onUbah={ganti}
                  undangan={undangan()[b().id] ?? null}
                  onJadi={jadi}
                />
              </>
            )}
          </Show>
        </dialog>
      </main>
    </Show>
  );
}
