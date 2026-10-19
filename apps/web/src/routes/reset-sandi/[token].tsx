import { A, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AuthShell from "~/components/AuthShell";
import Field from "~/components/Field";
import Ikon from "~/components/Ikon";
import { api, ApiError, lupaMe } from "~/lib/api";
import { createSubmit } from "~/lib/form";

export default function ResetSandi() {
  const p = useParams<{ token: string }>();
  const [email, setEmail] = createSignal<string | null>(null);
  const [valid, setValid] = createSignal<boolean | null>(null);
  const [baru, setBaru] = createSignal("");
  const [ulang, setUlang] = createSignal("");
  const [selesai, setSelesai] = createSignal(false);

  onMount(async () => {
    try {
      setEmail((await api<{ email: string }>(`/auth/reset-password/${encodeURIComponent(p.token)}`)).email);
      setValid(true);
    } catch (e) {
      // Hanya tautan yang memang ditolak (404) yang dianggap tidak berlaku; gangguan jaringan bukan.
      setValid(e instanceof ApiError && e.status === 404 ? false : null);
    }
  });

  const form = createSubmit(async () => {
    if (baru() !== ulang()) throw new ApiError(400, "mismatch", "Kata sandi dan pengulangannya belum sama", {});
    await api(`/auth/reset-password/${encodeURIComponent(p.token)}`, { method: "POST", body: { newPassword: baru() } });
    lupaMe();
    setSelesai(true);
  });

  return (
    <AuthShell gaya="buku">
      <Title>Atur ulang kata sandi · SSB App</Title>
      <header class="kepala-buku">
        <div class="lencana" aria-hidden="true">
          <Ikon nama="kunci" ukuran={30} />
        </div>
        <h1>Atur ulang kata sandi</h1>
        <Show when={valid() === true && !selesai()}>
          <p>
            Untuk akun <strong>{email()}</strong>
          </p>
        </Show>
      </header>

      <Show when={valid() !== null} fallback={<p>Memeriksa tautan…</p>}>
        <Show
          when={valid()}
          fallback={
            <>
              <div class="peringatan" role="alert">
                Tautan ini sudah dipakai, kedaluwarsa, atau salah.
              </div>
              <A class="tombol utama" href="/lupa-sandi">
                Minta tautan baru
              </A>
            </>
          }
        >
          <Show
            when={!selesai()}
            fallback={
              <>
                <div class="info" role="status">
                  Kata sandi sudah diganti. Semua perangkat yang sedang masuk dikeluarkan, jadi masuk lagi dengan kata sandi baru.
                </div>
                <A class="tombol utama" href="/masuk">
                  Masuk
                </A>
              </>
            }
          >
            <Show when={form.error()}>
              <div class="peringatan" role="alert">
                {form.error()}
              </div>
            </Show>
            <form class="form" onSubmit={form.submit} novalidate>
              <Field
                id="baru"
                label="Kata sandi baru"
                ikon="kunci"
                bisaLihat
                type="password"
                autocomplete="new-password"
                required
                minlength={10}
                hint="Minimal 10 karakter."
                value={baru()}
                onInput={setBaru}
                error={form.fields().newPassword}
              />
              <Field
                id="ulang"
                label="Ulangi kata sandi baru"
                ikon="kunci"
                type="password"
                autocomplete="new-password"
                required
                value={ulang()}
                onInput={setUlang}
              />
              <button class="tombol utama" type="submit" disabled={form.busy()}>
                {form.busy() ? "Menyimpan…" : "Simpan kata sandi baru"}
              </button>
            </form>
          </Show>
        </Show>
      </Show>
    </AuthShell>
  );
}
