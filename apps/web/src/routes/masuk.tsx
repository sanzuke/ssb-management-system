import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AuthShell from "~/components/AuthShell";
import Field from "~/components/Field";
import GoogleButton from "~/components/GoogleButton";
import Ikon from "~/components/Ikon";
import { api, getMe, googleErrors } from "~/lib/api";
import { createSubmit, safeNext } from "~/lib/form";

export default function Masuk() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const lanjut = () => safeNext(params.lanjut);

  onMount(async () => {
    const me = await getMe().catch(() => null);
    if (me) nav(me.active || me.memberships.length === 0 ? lanjut() : "/pilih-ssb", { replace: true });
  });

  const form = createSubmit(async () => {
    const r = await api<{ selected: boolean; memberships: unknown[] }>("/auth/login", {
      method: "POST",
      body: { email: email(), password: password() },
    });
    nav(r.selected || r.memberships.length === 0 ? lanjut() : "/pilih-ssb");
  });

  const urlError = () => (typeof params.error === "string" ? (googleErrors[params.error] ?? "Masuk gagal. Coba lagi.") : "");

  return (
    <AuthShell gaya="buku">
      <Title>Masuk · SSB App</Title>
      <header class="kepala-buku">
        <div class="lencana" aria-hidden="true">
          <Ikon nama="bola" ukuran={30} />
        </div>
        <h1>Masuk ke SSB Anda</h1>
        <p>Pelatih, orang tua, dan admin masuk dari sini.</p>
      </header>

      <Show when={urlError() || form.error()}>
        <div class="peringatan" role="alert">
          {urlError() || form.error()}
        </div>
      </Show>

      <form class="form" onSubmit={form.submit} novalidate>
        <Field
          id="email"
          label="Email"
          ikon="surat"
          type="email"
          inputmode="email"
          autocomplete="username"
          required
          value={email()}
          onInput={setEmail}
          error={form.fields().email}
        />
        <Field
          id="password"
          label="Kata sandi"
          ikon="kunci"
          bisaLihat
          type="password"
          autocomplete="current-password"
          required
          value={password()}
          onInput={setPassword}
          error={form.fields().password}
        />
        <p class="tautan-lupa">
          <A href="/lupa-sandi">Lupa kata sandi?</A>
        </p>
        <button class="tombol utama" type="submit" disabled={form.busy()}>
          {form.busy() ? "Memeriksa…" : "Masuk"}
          <Show when={!form.busy()}>
            <Ikon nama="panah" />
          </Show>
        </button>
      </form>

      <div class="pemisah">atau masuk lebih cepat</div>
      <GoogleButton href="/api/auth/google/start?intent=login">Masuk dengan Google</GoogleButton>

      <aside class="kartu-bantuan">
        <strong>Belum punya SSB di sini?</strong>
        <p>Daftarkan SSB Anda, lalu undang pelatih dan orang tua.</p>
        <A class="tombol putih" href="/daftar">
          <Ikon nama="daftar" ukuran={18} />
          Daftarkan SSB baru
        </A>
      </aside>
    </AuthShell>
  );
}
