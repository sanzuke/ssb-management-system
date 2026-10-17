import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount, Show } from "solid-js";
import AuthShell from "~/components/AuthShell";
import Field from "~/components/Field";
import GoogleButton from "~/components/GoogleButton";
import { api, getMe, googleErrors, slugify, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";
import { useSearchParams } from "@solidjs/router";

export default function Daftar() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [me, setMe] = createSignal<Me | null>(null);
  const [ssbName, setSsbName] = createSignal("");
  const [slug, setSlug] = createSignal("");
  const [slugEdited, setSlugEdited] = createSignal(false);
  const [city, setCity] = createSignal("");
  const [adminName, setAdminName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  let formEl!: HTMLFormElement;

  onMount(async () => setMe(await getMe().catch(() => null)));

  const onName = (v: string) => {
    setSsbName(v);
    if (!slugEdited()) setSlug(slugify(v));
  };
  const ssbBody = () => ({ ssbName: ssbName(), slug: slug(), ...(city().trim() ? { city: city() } : {}) });

  const form = createSubmit(async () => {
    if (me()) {
      await api("/auth/ssb", { method: "POST", body: ssbBody() });
    } else {
      await api("/auth/register-ssb", { method: "POST", body: { ...ssbBody(), adminName: adminName(), email: email(), password: password() } });
    }
    nav("/", { replace: true });
  });

  // Daftar dengan Google hanya butuh data SSB; kolom akun diisi Google.
  const withGoogle = () => {
    const ids = ["ssbName", "slug"];
    for (const id of ids) {
      const el = formEl.elements.namedItem(id) as HTMLInputElement;
      if (!el.reportValidity()) return;
    }
    const q = new URLSearchParams({ intent: "register", ssbName: ssbName(), slug: slug() });
    if (city().trim()) q.set("city", city());
    window.location.href = `/api/auth/google/start?${q}`;
  };

  const urlError = () => (typeof params.error === "string" ? (googleErrors[params.error] ?? "Pendaftaran gagal. Coba lagi.") : "");

  return (
    <AuthShell>
      <Title>Daftarkan SSB · SSB App</Title>
      <h1>Daftarkan SSB Anda</h1>
      <p>Anda menjadi admin SSB. Pelatih dan orang tua bergabung lewat tautan undangan.</p>

      <Show when={urlError() || form.error()}>
        <div class="peringatan" role="alert">
          {urlError() || form.error()}
        </div>
      </Show>

      <form class="form" ref={formEl} onSubmit={form.submit} novalidate={false}>
        <Field
          id="ssbName"
          label="Nama SSB"
          required
          minlength={2}
          maxlength={120}
          autocomplete="organization"
          value={ssbName()}
          onInput={onName}
          error={form.fields().ssbName}
        />
        <Field
          id="slug"
          label="Kode SSB"
          required
          minlength={3}
          maxlength={40}
          pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
          hint="Huruf kecil, angka, dan tanda hubung. Dipakai sebagai pengenal SSB Anda."
          value={slug()}
          onInput={(v) => {
            setSlugEdited(true);
            setSlug(v.toLowerCase());
          }}
          error={form.fields().slug}
        />
        <Field id="city" label="Kota (boleh dikosongkan)" autocomplete="address-level2" value={city()} onInput={setCity} error={form.fields().city} />

        <Show
          when={!me()}
          fallback={
            <>
              <p class="info">Dibuat atas nama {me()!.name}. SSB ini akan ditambahkan ke akun Anda.</p>
              <button class="tombol utama" type="submit" disabled={form.busy()}>
                {form.busy() ? "Membuat SSB…" : "Buat SSB"}
              </button>
            </>
          }
        >
          <GoogleButton onClick={withGoogle}>Daftar dengan Google</GoogleButton>
          <div class="pemisah">atau buat akun dengan email</div>
          <Field id="adminName" label="Nama Anda" required autocomplete="name" value={adminName()} onInput={setAdminName} error={form.fields().adminName} />
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
          <button class="tombol utama" type="submit" disabled={form.busy()}>
            {form.busy() ? "Membuat akun…" : "Daftar dengan email"}
          </button>
        </Show>
      </form>

      <p class="tautan-bawah">
        Sudah punya akun? <A href="/masuk">Masuk</A>
      </p>
    </AuthShell>
  );
}
