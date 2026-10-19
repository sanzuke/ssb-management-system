import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { api, roleLabel, type Me } from "~/lib/api";
import { inisial } from "~/lib/pemain";
import { hariIni } from "~/lib/waktu";
import type { Period } from "@ssb/shared";
import { mintaKeluar } from "./DialogKeluar";
import Ikon from "./Ikon";

/**
 * Header atas di layar lebar (desain Stitch "Data Pemain - Admin"): pencarian pemain di kiri,
 * periode berjalan, dan menu profil di kanan (info akun, Akun saya, Ganti SSB, Keluar).
 * Di HP tidak tampil; menu atas yang dipakai.
 */
export default function HeaderAtas(props: { me: Me }) {
  const nav = useNavigate();
  const lokasi = useLocation();
  let kolom: HTMLInputElement | undefined;
  let wadahProfil: HTMLDivElement | undefined;
  let tombolProfil: HTMLButtonElement | undefined;
  const [buka, setBuka] = createSignal(false);
  const staf = () => !!props.me.active && props.me.active.role !== "orang_tua";

  // Periode berjalan; /periods hanya bisa dibaca staf.
  const [periode] = createResource(
    () => (staf() ? true : null),
    () => api<Period[]>("/periods").catch(() => [] as Period[]),
  );
  const periodeKini = () => {
    const h = hariIni();
    return periode()?.find((p) => p.startDate <= h && h <= p.endDate)?.name ?? null;
  };

  const cari = (e: Event) => {
    e.preventDefault();
    const q = kolom?.value.trim() ?? "";
    nav(q ? `/pemain?q=${encodeURIComponent(q)}` : "/pemain");
  };

  const tutup = (kembaliFokus = false) => {
    setBuka(false);
    if (kembaliFokus) tombolProfil?.focus();
  };
  // Menu tertutup saat pindah halaman.
  createEffect(() => {
    lokasi.pathname;
    setBuka(false);
  });
  // Fokus ke butir pertama saat menu dibuka.
  createEffect(() => {
    if (buka()) queueMicrotask(() => wadahProfil?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  });
  const tombolMenu = (e: KeyboardEvent) => {
    if (e.key === "Escape") return tutup(true);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const butir = [...(wadahProfil?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = butir.indexOf(document.activeElement as HTMLElement);
    butir[(i + (e.key === "ArrowDown" ? 1 : butir.length - 1)) % butir.length]?.focus();
    e.preventDefault();
  };

  onMount(() => {
    // Ctrl+K (atau Cmd+K) memfokuskan kolom pencarian.
    const tombol = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && kolom) {
        e.preventDefault();
        kolom.focus();
        kolom.select();
      }
    };
    // Klik di luar menu profil menutupnya.
    const luar = (e: MouseEvent) => {
      if (buka() && wadahProfil && !wadahProfil.contains(e.target as Node)) setBuka(false);
    };
    window.addEventListener("keydown", tombol);
    document.addEventListener("mousedown", luar);
    onCleanup(() => {
      window.removeEventListener("keydown", tombol);
      document.removeEventListener("mousedown", luar);
    });
  });

  return (
    <header class="header-atas">
      <div class="header-kiri">
        <Show when={staf()}>
          <form class="cari-global" aria-label="Cari pemain" onSubmit={cari}>
            <Ikon nama="cari" ukuran={18} />
            <input ref={kolom} type="search" placeholder="Cari pemain: nama atau nomor induk" aria-label="Cari pemain" />
            <span class="pintasan-cari">Ctrl K</span>
          </form>
        </Show>
      </div>
      <div class="header-kanan">
        <Show when={periodeKini()}>
          {(nama) => (
            <span class="chip-periode" title="Periode berjalan">
              <Ikon nama="kalender" ukuran={16} />
              {nama()}
            </span>
          )}
        </Show>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: wadah menu hanya meneruskan tombol panah dan Esc dari butir menu di dalamnya */}
        <div class="profil-menu" ref={wadahProfil} onKeyDown={(e) => buka() && tombolMenu(e)}>
          <button
            class="pengguna"
            type="button"
            ref={tombolProfil}
            aria-haspopup="menu"
            aria-expanded={buka()}
            aria-controls="menu-profil"
            title="Menu profil"
            onClick={() => setBuka(!buka())}
          >
            <span class="pengguna-teks">
              <strong>{props.me.name}</strong>
              <span>{props.me.email}</span>
            </span>
            <span class="avatar-pengguna" aria-hidden="true">
              {inisial(props.me.name)}
            </span>
            <span class="panah-menu" aria-hidden="true" />
          </button>
          <Show when={buka()}>
            <div class="menu-profil" id="menu-profil" role="menu" aria-label="Menu profil">
              <div class="menu-profil-info">
                <span class="avatar-pengguna besar" aria-hidden="true">
                  {inisial(props.me.name)}
                </span>
                <div>
                  <strong>{props.me.name}</strong>
                  <span>{props.me.email}</span>
                  <Show when={props.me.active}>
                    <span class="menu-profil-peran">
                      {roleLabel[props.me.active!.role]} • {props.me.active!.ssbName}
                    </span>
                  </Show>
                </div>
              </div>
              <A class="butir-menu" role="menuitem" href="/akun" onClick={() => tutup()}>
                <Ikon nama="akun" ukuran={18} />
                Akun saya
              </A>
              <Show when={props.me.memberships.length > 1}>
                <A class="butir-menu" role="menuitem" href="/pilih-ssb" onClick={() => tutup()}>
                  <Ikon nama="ulang" ukuran={18} />
                  Ganti SSB
                </A>
              </Show>
              <hr class="menu-profil-garis" />
              <button
                class="butir-menu bahaya"
                type="button"
                role="menuitem"
                onClick={() => {
                  tutup();
                  mintaKeluar();
                }}
              >
                <Ikon nama="keluar" ukuran={18} />
                Keluar
              </button>
            </div>
          </Show>
        </div>
      </div>
    </header>
  );
}
