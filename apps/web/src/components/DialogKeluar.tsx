import { useNavigate } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import { api, lupaMe } from "~/lib/api";
import Ikon from "./Ikon";

const [terbuka, setTerbuka] = createSignal(false);
/** Membuka dialog konfirmasi keluar dari bagian mana pun (menu HP, dropdown profil). */
export const mintaKeluar = () => setTerbuka(true);

/** Dialog konfirmasi keluar; dirender sekali di Shell, di luar bilah menu supaya gayanya tidak ikut warna bilah. */
export default function DialogKeluar() {
  const nav = useNavigate();
  let dialog: HTMLDialogElement | undefined;
  const [sibuk, setSibuk] = createSignal(false);

  createEffect(() => {
    if (terbuka() && !dialog?.open) dialog?.showModal();
    if (!terbuka() && dialog?.open) dialog.close();
  });
  const keluar = async () => {
    if (sibuk()) return;
    setSibuk(true);
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      lupaMe();
      setSibuk(false);
      setTerbuka(false);
      nav("/masuk", { replace: true });
    }
  };

  return (
    <dialog class="dialog-konfirmasi" ref={dialog} aria-labelledby="judul-keluar" onClose={() => setTerbuka(false)}>
      <span class="dialog-ikon" aria-hidden="true">
        <Ikon nama="keluar" ukuran={26} />
      </span>
      <h2 id="judul-keluar">Keluar dari aplikasi?</h2>
      <p>Anda perlu masuk lagi dengan email dan kata sandi untuk membuka SSB App.</p>
      <div class="dialog-aksi">
        <button class="tombol batal" type="button" onClick={() => setTerbuka(false)}>
          Batal
        </button>
        <button class="tombol utama" type="button" disabled={sibuk()} onClick={keluar}>
          {sibuk() ? "Keluar…" : "Ya, keluar"}
        </button>
      </div>
    </dialog>
  );
}
