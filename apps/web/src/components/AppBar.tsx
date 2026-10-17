import { A, useNavigate } from "@solidjs/router";
import { Show } from "solid-js";
import { api, roleLabel, type Me } from "~/lib/api";

export default function AppBar(props: { me: Me }) {
  const nav = useNavigate();
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    nav("/masuk", { replace: true });
  };
  return (
    <header class="bar">
      <div>
        <div class="nama-ssb">{props.me.active?.ssbName ?? "SSB App"}</div>
        <Show when={props.me.active}>
          <div class="peran">{roleLabel[props.me.active!.role]}</div>
        </Show>
      </div>
      <nav class="aksi" aria-label="Akun">
        <Show when={props.me.memberships.length > 1}>
          <A class="tombol tipis" href="/pilih-ssb">Ganti SSB</A>
        </Show>
        <Show when={props.me.active}>
          <A class="tombol tipis" href="/pemain">{props.me.active!.role === "orang_tua" ? "Anak" : "Pemain"}</A>
        </Show>
        <Show when={["admin_ssb", "pelatih", "korlas"].includes(props.me.active?.role ?? "")}>
          <A class="tombol tipis" href="/master">Data master</A>
        </Show>
        <A class="tombol tipis" href="/akun">Akun</A>
        <button class="tombol tipis" type="button" onClick={logout}>Keluar</button>
      </nav>
    </header>
  );
}
