import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import { api, getMe, roleLabel, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";

type Tab = "kontak" | "keamanan" | "keanggotaan";

export default function Akun() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = createSignal<Me | null>(null);
  const [current, setCurrent] = createSignal("");
  const [next, setNext] = createSignal("");
  const [done, setDone] = createSignal(false);
  const [wa, setWa] = createSignal("");
  const [waDone, setWaDone] = createSignal(false);

  // Tab yang tersedia: kontak hanya untuk akun yang sudah punya SSB aktif.
  const tabs = createMemo(() => [
    ...(me()?.active ? [{ id: "kontak" as Tab, label: "Kontak" }] : []),
    { id: "keamanan" as Tab, label: "Keamanan" },
    { id: "keanggotaan" as Tab, label: "Keanggotaan" },
  ]);
  const tab = createMemo<Tab>(() => {
    const t = typeof params.tab === "string" ? params.tab : "";
    return tabs().some((x) => x.id === t) ? (t as Tab) : tabs()[0]!.id;
  });
  const pilih = (t: Tab) => setParams({ tab: t === tabs()[0]!.id ? undefined : t }, { replace: true });
  // Panah kiri dan kanan memindahkan tab, sesuai kebiasaan tablist.
  const geser = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const daftar = tabs();
    const i = daftar.findIndex((x) => x.id === tab());
    const baru = daftar[(i + (e.key === "ArrowRight" ? 1 : daftar.length - 1)) % daftar.length]!;
    pilih(baru.id);
    queueMicrotask(() => document.getElementById(`tab-${baru.id}`)?.focus());
    e.preventDefault();
  };

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
        <KepalaHalaman chip="Akun" judul={me()!.name} sub={me()!.email} />

        <div class="tab-periode" role="tablist" aria-label="Pengaturan akun" onKeyDown={geser}>
          <For each={tabs()}>
            {(t) => (
              <button
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab() === t.id}
                aria-controls={`panel-${t.id}`}
                tabindex={tab() === t.id ? 0 : -1}
                onClick={() => pilih(t.id)}
              >
                {t.label}
              </button>
            )}
          </For>
        </div>

        <Show when={tab() === "kontak" && me()!.active}>
          <section role="tabpanel" id="panel-kontak" aria-labelledby="tab-kontak">
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
          </section>
        </Show>

        <Show when={tab() === "keamanan"}>
          <section role="tabpanel" id="panel-keamanan" aria-labelledby="tab-keamanan">
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
          </section>
        </Show>

        <Show when={tab() === "keanggotaan"}>
          <section role="tabpanel" id="panel-keanggotaan" aria-labelledby="tab-keanggotaan">
            <h2>SSB tempat Anda bergabung</h2>
            <Show
              when={me()!.memberships.length > 0}
              fallback={<p class="kosong">Akun ini belum tergabung di SSB mana pun. Buka tautan undangan dari admin SSB, atau daftarkan SSB baru.</p>}
            >
              <ul class="daftar-butir">
                <For each={me()!.memberships}>
                  {(m) => (
                    <li class="butir">
                      <span class="isi">
                        <strong>{m.ssbName}</strong> <span class="petunjuk">{roleLabel[m.role]}</span>
                      </span>
                      <Show when={me()!.active?.ssbId === m.ssbId} fallback={<span class="petunjuk">&nbsp;</span>}>
                        <span class="status-pil">Sedang dipakai</span>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <p class="aksi-baris">
              <Show when={me()!.memberships.length > 1}>
                <A class="tombol" href="/pilih-ssb">
                  Ganti SSB
                </A>
              </Show>
              <A class="tombol" href="/daftar">
                Daftarkan SSB baru
              </A>
            </p>
          </section>
        </Show>
        <p class="tautan-bawah">
          <A href="/">Kembali ke beranda</A>
        </p>
      </main>
    </Show>
  );
}
