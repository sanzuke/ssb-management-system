import { A, useNavigate, useParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AuthShell from "~/components/AuthShell";
import Field from "~/components/Field";
import GoogleButton from "~/components/GoogleButton";
import { api, ApiError, getMe, googleErrors, roleLabel, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { useSearchParams } from "@solidjs/router";

type Preview = { ssbName: string; role: string; label: string | null; expiresAt: string };

export default function Undangan() {
  const nav = useNavigate();
  const p = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const [inv, setInv] = createSignal<Preview | null>(null);
  const [invalid, setInvalid] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [me, setMe] = createSignal<Me | null>(null);
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [whatsapp, setWhatsapp] = createSignal("");

  onMount(async () => {
    try {
      setInv(await api<Preview>(`/invitations/${encodeURIComponent(p.token)}`));
      setMe(await getMe().catch(() => null));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setInvalid(true);
    } finally {
      setLoading(false);
    }
  });

  const form = createSubmit(async () => {
    const path = `/invitations/${encodeURIComponent(p.token)}/accept`;
    await api(path, { method: "POST", body: me() ? {} : { name: name(), email: email(), password: password(), whatsapp: whatsapp() } });
    nav("/", { replace: true });
  });

  const urlError = () => (typeof params.error === "string" ? (googleErrors[params.error] ?? "Gagal menerima undangan.") : "");

  return (
    <AuthShell>
      <Title>Undangan · SSB App</Title>
      <Show when={!loading()} fallback={<p>Memeriksa undangan…</p>}>
        <Show
          when={inv()}
          fallback={
            <>
              <h1>Undangan tidak berlaku</h1>
              <p>
                {invalid()
                  ? "Tautan ini sudah dipakai, kedaluwarsa, atau salah. Minta admin SSB membuat tautan undangan baru."
                  : "Undangan tidak bisa dimuat. Periksa sambungan internet Anda, lalu muat ulang halaman."}
              </p>
              <A class="tombol" href="/masuk">
                Ke halaman masuk
              </A>
            </>
          }
        >
          <h1>Bergabung dengan {inv()!.ssbName}</h1>
          <p>
            Anda diundang sebagai <strong>{roleLabel[inv()!.role]}</strong>
            <Show when={inv()!.label}> ({inv()!.label})</Show>.
          </p>

          <Show when={urlError() || form.error()}>
            <div class="peringatan" role="alert">
              {urlError() || form.error()}
            </div>
          </Show>

          <Show
            when={!me()}
            fallback={
              <form class="form" onSubmit={form.submit}>
                <p class="info">
                  Anda masuk sebagai {me()!.name} ({me()!.email}).
                </p>
                <button class="tombol utama" type="submit" disabled={form.busy()}>
                  {form.busy() ? "Bergabung…" : `Gabung sebagai ${roleLabel[inv()!.role]}`}
                </button>
              </form>
            }
          >
            <GoogleButton href={`/api/auth/google/start?intent=invite&invite=${encodeURIComponent(p.token)}`}>Lanjut dengan Google</GoogleButton>
            <div class="pemisah">atau buat akun dengan email</div>
            <form class="form" onSubmit={form.submit}>
              <Field id="name" label="Nama Anda" required autocomplete="name" value={name()} onInput={setName} error={form.fields().name} />
              <Field
                id="email"
                label="Email"
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
                type="password"
                autocomplete="new-password"
                required
                minlength={10}
                hint="Minimal 10 karakter."
                value={password()}
                onInput={setPassword}
                error={form.fields().password}
              />
              <Field
                id="whatsapp"
                label="Nomor WhatsApp (boleh dikosongkan)"
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                hint="Dipakai admin SSB untuk menghubungi Anda. Contoh: 081234567890."
                value={whatsapp()}
                onInput={setWhatsapp}
                error={form.fields().whatsapp}
              />
              <button class="tombol utama" type="submit" disabled={form.busy()}>
                {form.busy() ? "Membuat akun…" : "Buat akun dan bergabung"}
              </button>
            </form>
            <p class="tautan-bawah">
              Sudah punya akun? <A href={`/masuk?lanjut=${encodeURIComponent(`/undangan/${p.token}`)}`}>Masuk dulu</A>, lalu tautan ini akan terbuka lagi.
            </p>
          </Show>
        </Show>
      </Show>
    </AuthShell>
  );
}
