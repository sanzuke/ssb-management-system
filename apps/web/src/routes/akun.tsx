import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import { api, getMe, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";

export default function Akun() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [current, setCurrent] = createSignal("");
  const [next, setNext] = createSignal("");
  const [done, setDone] = createSignal(false);
  const [wa, setWa] = createSignal("");
  const [waDone, setWaDone] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    setMe(m);
    setWa(m.whatsapp ?? "");
  });

  const kontak = createSubmit(async () => {
    setWaDone(false);
    const r = await api<{ ok: boolean; whatsapp: string | null }>("/auth/me", { method: "PATCH", body: { whatsapp: wa() } });
    setMe({ ...me()!, whatsapp: r.whatsapp });
    setWa(r.whatsapp ?? "");
    setWaDone(true);
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
      <main class="halaman">
        <h1>Akun</h1>
        <p>
          {me()!.name}, {me()!.email}
        </p>

        <Show when={me()!.active}>
          <h2>Kontak</h2>
          <p>
            Nomor WhatsApp untuk keanggotaan Anda di <strong>{me()!.active!.ssbName}</strong>. Admin SSB bisa melihatnya untuk menghubungi Anda.
          </p>
          <Show when={kontak.error()}>
            <div class="peringatan" role="alert">
              {kontak.error()}
            </div>
          </Show>
          <Show when={waDone()}>
            <div class="info" role="status">
              {me()!.whatsapp ? "Nomor WhatsApp disimpan." : "Nomor WhatsApp dihapus."}
            </div>
          </Show>
          <form class="form" onSubmit={kontak.submit}>
            <Field
              id="whatsapp"
              label="Nomor WhatsApp"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              hint="Contoh: 081234567890. Kosongkan untuk menghapus."
              value={wa()}
              onInput={setWa}
              error={kontak.fields().whatsapp}
            />
            <button class="tombol utama" type="submit" disabled={kontak.busy()}>
              {kontak.busy() ? "Menyimpan…" : "Simpan nomor"}
            </button>
          </form>
        </Show>

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
