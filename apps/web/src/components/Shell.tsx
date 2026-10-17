import { useLocation } from "@solidjs/router";
import { type JSX, onMount, Show } from "solid-js";
import { getMe, meCache, meDicek } from "~/lib/api";
import AppBar from "./AppBar";

/** Halaman tanpa menu: masuk, daftar, pilih SSB, dan undangan. */
const TANPA_MENU = ["/masuk", "/daftar", "/pilih-ssb"];

/**
 * Tata letak bersama: menu dirender di sini, bukan di tiap halaman, sehingga tetap ada saat
 * berpindah halaman dan hanya area konten yang menampilkan "Memuat…".
 */
export default function Shell(props: { children: JSX.Element }) {
  const lokasi = useLocation();
  const denganMenu = () => !TANPA_MENU.includes(lokasi.pathname) && !lokasi.pathname.startsWith("/undangan");

  // Muat akun sekali di awal (hasilnya dipakai bersama oleh menu dan halaman).
  onMount(() => {
    if (!meDicek()) getMe().catch(() => null);
  });

  return (
    <>
      <Show when={denganMenu() && (meCache() || !meDicek())}>
        <Show when={meCache()} fallback={<div class="bar bar-memuat" role="presentation" />}>
          {(m) => <AppBar me={m()} />}
        </Show>
      </Show>
      {props.children}
    </>
  );
}
