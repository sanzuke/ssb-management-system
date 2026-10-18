import { A, useNavigate } from "@solidjs/router";
import { createResource, onCleanup, onMount, Show } from "solid-js";
import { api, type Me } from "~/lib/api";
import { inisial } from "~/lib/pemain";
import { hariIni } from "~/lib/waktu";
import type { Period } from "@ssb/shared";
import Ikon from "./Ikon";

/**
 * Header atas di layar lebar (desain Stitch "Data Pemain - Admin"): pencarian pemain di kiri,
 * periode berjalan, dan akun yang sedang masuk di kanan. Di HP tidak tampil; menu atas yang dipakai.
 */
export default function HeaderAtas(props: { me: Me }) {
  const nav = useNavigate();
  let kolom: HTMLInputElement | undefined;
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

  // Ctrl+K (atau Cmd+K) memfokuskan kolom pencarian.
  onMount(() => {
    const tombol = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && kolom) {
        e.preventDefault();
        kolom.focus();
        kolom.select();
      }
    };
    window.addEventListener("keydown", tombol);
    onCleanup(() => window.removeEventListener("keydown", tombol));
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
        <A class="pengguna" href="/akun" title="Akun saya">
          <span class="pengguna-teks">
            <strong>{props.me.name}</strong>
            <span>{props.me.email}</span>
          </span>
          <span class="avatar-pengguna" aria-hidden="true">
            {inisial(props.me.name)}
          </span>
        </A>
      </div>
    </header>
  );
}
