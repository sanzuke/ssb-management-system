import { useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, For, onMount, Show } from "solid-js";
import AuthShell from "~/components/AuthShell";
import Kerangka from "~/components/Kerangka";
import { api, getMe, roleLabel, type Me } from "~/lib/api";
import { createSubmit } from "~/lib/form";

export default function PilihSsb() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    setMe(m);
    setReady(true);
  });

  let chosen = "";
  const form = createSubmit(async () => {
    await api("/auth/select", { method: "POST", body: { ssbId: chosen } });
    nav("/", { replace: true });
  });

  return (
    <AuthShell gaya="buku">
      <Title>Pilih SSB · SSB App</Title>
      <Show when={ready()} fallback={<Kerangka />}>
        <h1>Pilih SSB</h1>
        <p>Akun {me()!.email} tergabung di lebih dari satu SSB. Anda bisa menggantinya kapan saja.</p>
        <Show when={form.error()}>
          <div class="peringatan" role="alert">
            {form.error()}
          </div>
        </Show>
        <ul class="daftar-pilihan">
          <For each={me()!.memberships}>
            {(m) => (
              <li>
                <button
                  class="tombol pilihan"
                  type="button"
                  disabled={form.busy()}
                  onClick={(e) => {
                    chosen = m.ssbId;
                    form.submit(e);
                  }}
                >
                  <span>
                    {m.ssbName}
                    <small>{roleLabel[m.role]}</small>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </AuthShell>
  );
}
