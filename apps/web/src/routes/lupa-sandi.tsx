import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AuthShell from "~/components/AuthShell";
import Field from "~/components/Field";
import Ikon from "~/components/Ikon";
import { api } from "~/lib/api";
import { createSubmit } from "~/lib/form";

export default function LupaSandi() {
  const [email, setEmail] = createSignal("");
  const [terkirim, setTerkirim] = createSignal(false);
  // null = belum diketahui; false = server belum bisa mengirim email reset.
  const [emailAktif, setEmailAktif] = createSignal<boolean | null>(null);

  onMount(async () => {
    setEmailAktif((await api<{ emailReset: boolean }>("/auth/features").catch(() => ({ emailReset: true }))).emailReset);
  });

  const form = createSubmit(async () => {
    await api("/auth/forgot-password", { method: "POST", body: { email: email() } });
    setTerkirim(true);
  });

  return (
    <AuthShell gaya="buku">
      <Title>Lupa kata sandi · SSB App</Title>
      <header class="kepala-buku">
        <div class="lencana" aria-hidden="true">
          <Ikon nama="kunci" ukuran={30} />
        </div>
        <h1>Lupa kata sandi</h1>
        <p>Kami kirim tautan untuk mengatur ulang kata sandi.</p>
      </header>

      <Show
        when={emailAktif() !== false}
        fallback={
          <aside class="kartu-bantuan" role="status">
            <strong>Pengiriman email belum aktif di server ini</strong>
            <p>Minta admin SSB Anda membuatkan tautan reset kata sandi, lalu buka tautan itu. Bila Anda sendiri admin SSB, jalankan perintah ini di server:</p>
            <code>bun run auth:reset email-anda@contoh.id</code>
          </aside>
        }
      >
        <Show
          when={!terkirim()}
          fallback={
            <div class="info" role="status">
              Bila email itu terdaftar, tautan reset sudah dikirim dan berlaku 1 jam. Periksa kotak masuk dan folder spam. Tidak menerima apa pun? Minta admin
              SSB membuatkan tautan.
            </div>
          }
        >
          <Show when={form.error()}>
            <div class="peringatan" role="alert">
              {form.error()}
            </div>
          </Show>
          <form class="form" onSubmit={form.submit} novalidate>
            <Field
              id="email"
              label="Email akun"
              ikon="surat"
              type="email"
              inputmode="email"
              autocomplete="username"
              required
              value={email()}
              onInput={setEmail}
              error={form.fields().email}
            />
            <button class="tombol utama" type="submit" disabled={form.busy()}>
              {form.busy() ? "Mengirim…" : "Kirim tautan reset"}
            </button>
          </form>
        </Show>
      </Show>
      <p class="tautan-bawah">
        <A href="/masuk">Kembali ke halaman masuk</A>
      </p>
    </AuthShell>
  );
}
