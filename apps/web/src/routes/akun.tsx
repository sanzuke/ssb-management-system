import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AppBar from "~/components/AppBar";
import Field from "~/components/Field";
import { api, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";

export default function Akun() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [current, setCurrent] = createSignal("");
  const [next, setNext] = createSignal("");
  const [done, setDone] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    setMe(m);
  });

  const form = createSubmit(async () => {
    setDone(false);
    await api("/auth/change-password", {
      method: "POST",
      body: { newPassword: next(), ...(current() ? { currentPassword: current() } : {}) },
    });
    setCurrent("");
    setNext("");
    setDone(true);
  });

  return (
    <Show when={me()} fallback={<p class="halaman">Memuat…</p>}>
      <Title>Akun · SSB App</Title>
      <AppBar me={me()!} />
      <main class="halaman">
        <h1>Akun</h1>
        <p>
          {me()!.name}, {me()!.email}
        </p>

        <h2>{me()!.hasPassword ? "Ganti kata sandi" : "Tambah kata sandi"}</h2>
        <Show when={!me()!.hasPassword}>
          <p>Akun ini masuk dengan Google. Dengan kata sandi, Anda juga bisa masuk memakai email.</p>
        </Show>
        <Show when={form.error()}>
          <div class="peringatan" role="alert">
            {form.error()}
          </div>
        </Show>
        <Show when={done()}>
          <div class="info" role="status">
            Kata sandi disimpan. Perangkat lain perlu masuk ulang.
          </div>
        </Show>
        <form class="form" onSubmit={form.submit}>
          <Show when={me()!.hasPassword}>
            <Field
              id="currentPassword"
              label="Kata sandi saat ini"
              type="password"
              autocomplete="current-password"
              required
              value={current()}
              onInput={setCurrent}
              error={form.fields().currentPassword}
            />
          </Show>
          <Field
            id="newPassword"
            label="Kata sandi baru"
            type="password"
            autocomplete="new-password"
            required
            minlength={10}
            hint="Minimal 10 karakter."
            value={next()}
            onInput={setNext}
            error={form.fields().newPassword}
          />
          <button class="tombol utama" type="submit" disabled={form.busy()}>
            {form.busy() ? "Menyimpan…" : "Simpan kata sandi"}
          </button>
        </form>
        <p class="tautan-bawah">
          <A href="/">Kembali ke beranda</A>
        </p>
      </main>
    </Show>
  );
}
