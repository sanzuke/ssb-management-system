import { A, useLocation } from "@solidjs/router";
import { createEffect, Show } from "solid-js";
import { roleLabel, type Me } from "~/lib/api";
import { mintaKeluar } from "./DialogKeluar";
import Ikon from "./Ikon";

/**
 * Navigasi akun. Di HP berupa bilah atas; di layar lebar (dashboard.css) menjadi sidebar kiri
 * seperti desain Stitch "Data Pemain - Admin".
 */
export default function AppBar(props: { me: Me }) {
  const lokasi = useLocation();
  let daftarMenu: HTMLElement | undefined;

  // Di HP menu bisa digeser; menu halaman yang sedang dibuka dibawa ke tengah supaya selalu terlihat.
  createEffect(() => {
    lokasi.pathname;
    queueMicrotask(() => daftarMenu?.querySelector(".menu.active")?.scrollIntoView({ inline: "center", block: "nearest" }));
  });
  // Nama SSB yang panjang diperkecil dan boleh dua baris; ukuran ditentukan dari jumlah huruf.
  const panjangNama = () => {
    const n = (props.me.active?.ssbName ?? "").length;
    return n > 32 ? "sangat" : n > 18 ? "panjang" : undefined;
  };
  const staf = () => ["admin_ssb", "pelatih", "korlas"].includes(props.me.active?.role ?? "");
  return (
    <header class="bar">
      <div class="merek-bar">
        <img class="logo-bar" src="/logo.png" alt="" width="36" height="39" />
        <div class="merek-teks">
          <div class="nama-ssb" title={props.me.active?.ssbName} attr:data-panjang={panjangNama()}>
            {props.me.active?.ssbName ?? "SSB App"}
          </div>
          <Show when={props.me.active}>
            <div class="peran">{roleLabel[props.me.active!.role]}</div>
          </Show>
        </div>
      </div>
      <nav class="aksi" aria-label="Menu utama" ref={daftarMenu}>
        <Show when={props.me.active}>
          <A class="tombol tipis menu" href="/" end>
            <Ikon nama="beranda" />
            <span>Beranda</span>
          </A>
          <A class="tombol tipis menu" href="/pemain">
            <Ikon nama="pemain" />
            <span>{props.me.active!.role === "orang_tua" ? "Anak" : "Pemain"}</span>
          </A>
          <A class="tombol tipis menu" href="/kehadiran">
            <Ikon nama="absen" />
            <span>Kehadiran</span>
          </A>
        </Show>
        <Show when={staf()}>
          <A class="tombol tipis menu" href="/jadwal">
            <Ikon nama="kalender" />
            <span>Jadwal</span>
          </A>
          <A class="tombol tipis menu" href="/artikel">
            <Ikon nama="daftar" />
            <span>Artikel</span>
          </A>
          <A class="tombol tipis menu" href="/master">
            <Ikon nama="master" />
            <span>Data master</span>
          </A>
          <A class="tombol tipis menu" href="/indikator">
            <Ikon nama="indikator" />
            <span>Indikator</span>
          </A>
        </Show>
        <Show when={props.me.active?.role === "admin_ssb"}>
          <A class="tombol tipis menu" href="/anggota">
            <Ikon nama="profil" />
            <span>Anggota</span>
          </A>
          <A class="tombol tipis menu" href="/situs">
            <Ikon nama="bola" />
            <span>Konten situs</span>
          </A>
          <A class="tombol tipis menu" href="/pendaftar">
            <Ikon nama="profil" />
            <span>Pendaftar</span>
          </A>
          <A class="tombol tipis menu" href="/undangan">
            <Ikon nama="surat" />
            <span>Undangan</span>
          </A>
        </Show>
        <Show when={props.me.active?.role === "admin_ssb" || props.me.active?.role === "orang_tua"}>
          <A class="tombol tipis menu" href="/spp">
            <Ikon nama="kartu" />
            <span>SPP</span>
          </A>
        </Show>
        <A class="tombol tipis menu" href="/akun">
          <Ikon nama="akun" />
          <span>Akun</span>
        </A>
      </nav>
      <div class="aksi bawah">
        <Show when={props.me.memberships.length > 1}>
          <A class="tombol tipis menu" href="/pilih-ssb">
            <Ikon nama="ulang" />
            <span>Ganti SSB</span>
          </A>
        </Show>
        <button class="tombol tipis menu" type="button" onClick={mintaKeluar}>
          <Ikon nama="keluar" />
          <span>Keluar</span>
        </button>
      </div>
    </header>
  );
}
