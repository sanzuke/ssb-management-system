import { useLocation } from "@solidjs/router";
import { type JSX, onMount, Show } from "solid-js";
import { getMe, meCache, meDicek } from "~/lib/api";
import AppBar from "./AppBar";
import DialogKeluar from "./DialogKeluar";
import HeaderAtas from "./HeaderAtas";

/** Halaman tanpa menu: masuk, daftar, pilih SSB, undangan, dan lupa atau reset kata sandi. */
const TANPA_MENU = ["/masuk", "/daftar", "/pilih-ssb", "/lupa-sandi"];

/**
 * Tata letak bersama: menu dirender di sini, bukan di tiap halaman, sehingga tetap ada saat
 * berpindah halaman dan hanya area konten yang menampilkan "Memuat…".
 */
export default function Shell(props: { children: JSX.Element }) {
  const lokasi = useLocation();
  // /undangan (kelola undangan, admin) memakai menu; /undangan/<token> (terima undangan) tidak.
  const denganMenu = () => {
    const jalur = lokasi.pathname.length > 1 ? lokasi.pathname.replace(/\/+$/, "") : lokasi.pathname;
    return !TANPA_MENU.includes(jalur) && !jalur.startsWith("/undangan/") && !jalur.startsWith("/reset-sandi/");
  };

  // Muat akun sekali di awal (hasilnya dipakai bersama oleh menu dan halaman).
  onMount(() => {
    if (!meDicek()) getMe().catch(() => null);
  });

  return (
    <>
      <Show when={denganMenu() && (meCache() || !meDicek())}>
        <Show
          when={meCache()}
          fallback={
            <>
              <div class="bar bar-memuat" role="presentation" />
              <div class="header-atas header-memuat" role="presentation" />
            </>
          }
        >
          {(m) => (
            <>
              <AppBar me={m()} />
              <HeaderAtas me={m()} />
            </>
          )}
        </Show>
      </Show>
      <DialogKeluar />
      {props.children}
    </>
  );
}
