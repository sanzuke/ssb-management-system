import { A, useLocation, useNavigate } from "@solidjs/router";
import { createEffect, Show } from "solid-js";
import { api, lupaMe, roleLabel, type Me } from "~/lib/api";
import Ikon from "./Ikon";

/**
 * Navigasi akun. Di HP berupa bilah atas; di layar lebar (dashboard.css) menjadi sidebar kiri
 * seperti desain Stitch "Data Pemain - Admin".
 */
export default function AppBar(props: { me: Me }) {
  const nav = useNavigate();
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    lupaMe();
    nav("/masuk", { replace: true });
  };
  const lokasi = useLocation();
  let konfirmasi: HTMLDialogElement | undefined;
  let daftarMenu: HTMLElement | undefined;

  // Di HP menu bisa digeser; menu halaman yang sedang dibuka dibawa ke tengah supaya selalu terlihat.
  createEffect(() => {
    lokasi.pathname;
    queueMicrotask(() => daftarMenu?.querySelector(".menu.active")?.scrollIntoView({ inline: "center", block: "nearest" }));
  });
  const staf = () => ["admin_ssb", "pelatih", "korlas"].includes(props.me.active?.role ?? "");
  return (
    <header class="bar">
      <div class="merek-bar">
        <div class="nama-ssb">{props.me.active?.ssbName ?? "SSB App"}</div>
        <Show when={props.me.active}>
          <div class="peran">{roleLabel[props.me.active!.role]}</div>
        </Show>
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
        <button class="tombol tipis menu" type="button" onClick={() => konfirmasi?.showModal()}>
          <Ikon nama="keluar" />
          <span>Keluar</span>
        </button>
      </div>
      <dialog class="dialog-konfirmasi" ref={konfirmasi} aria-labelledby="judul-keluar">
        <span class="dialog-ikon" aria-hidden="true">
          <Ikon nama="keluar" ukuran={26} />
        </span>
        <h2 id="judul-keluar">Keluar dari aplikasi?</h2>
        <p>Anda perlu masuk lagi dengan email dan kata sandi untuk membuka SSB App.</p>
        <div class="dialog-aksi">
          <button class="tombol batal" type="button" onClick={() => konfirmasi?.close()}>
            Batal
          </button>
          <button class="tombol utama" type="button" onClick={logout}>
            Ya, keluar
          </button>
        </div>
      </dialog>
    </header>
  );
}
