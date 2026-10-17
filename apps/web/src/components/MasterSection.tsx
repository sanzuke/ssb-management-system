import { createSignal, For, onMount, Show } from "solid-js";
import Field from "~/components/Field";
import { api, ApiError } from "~/lib/api";
import { createSubmit } from "~/lib/form";

export type FieldDef = { key: string; label: string; type?: "text" | "number" | "date"; required?: boolean; hint?: string; maxlength?: number };
type Item = { id: string } & Record<string, unknown>;

/** Daftar data master dengan tambah, ubah, dan hapus (hapus perlu konfirmasi). Tanpa izin tulis, hanya daftar. */
export default function MasterSection(p: {
  title: string;
  path: string;
  fields: FieldDef[];
  summary: (i: Item) => string;
  empty: string;
  addLabel: string;
  canWrite: boolean;
}) {
  const [items, setItems] = createSignal<Item[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [loadError, setLoadError] = createSignal("");
  const [editing, setEditing] = createSignal<string | null>(null); // "baru" atau id
  const [values, setValues] = createSignal<Record<string, string>>({});
  const [confirmId, setConfirmId] = createSignal<string | null>(null);
  const [rowError, setRowError] = createSignal("");

  const load = async () => {
    try {
      setItems(await api<Item[]>(p.path));
      setLoadError("");
    } catch {
      setLoadError("Data tidak bisa dimuat. Muat ulang halaman.");
    } finally {
      setLoaded(true);
    }
  };
  onMount(load);

  const open = (item?: Item) => {
    setRowError("");
    setConfirmId(null);
    setValues(Object.fromEntries(p.fields.map((f) => [f.key, item ? String(item[f.key] ?? "") : ""])));
    setEditing(item ? item.id : "baru");
  };

  const body = () => {
    const out: Record<string, string | number> = {};
    for (const f of p.fields) {
      const v = (values()[f.key] ?? "").trim();
      if (f.type === "number") out[f.key] = v === "" ? NaN : Number(v);
      else if (v !== "" || f.required) out[f.key] = v;
    }
    return out;
  };

  const form = createSubmit(async () => {
    const id = editing();
    await api(id === "baru" ? p.path : `${p.path}/${id}`, { method: id === "baru" ? "POST" : "PATCH", body: body() });
    setEditing(null);
    await load();
  });

  const remove = async (id: string) => {
    setRowError("");
    try {
      await api(`${p.path}/${id}`, { method: "DELETE" });
      setConfirmId(null);
      await load();
    } catch (e) {
      setRowError(e instanceof ApiError ? e.message : "Tidak bisa terhubung ke server. Coba lagi.");
      setConfirmId(null);
    }
  };

  const slug = p.path.replace("/", "");
  return (
    <section class="master" aria-labelledby={`h-${slug}`}>
      <h2 id={`h-${slug}`}>{p.title}</h2>
      <Show when={loadError()}>
        <div class="peringatan" role="alert">
          {loadError()}
        </div>
      </Show>
      <Show when={rowError()}>
        <div class="peringatan" role="alert">
          {rowError()}
        </div>
      </Show>
      <Show when={loaded() && !loadError() && items().length === 0 && editing() !== "baru"}>
        <p class="kosong">{p.empty}</p>
      </Show>
      <ul class="daftar-butir">
        <For each={items()}>
          {(item) => (
            <li class="butir">
              <Show
                when={editing() === item.id}
                fallback={
                  <>
                    <span class="isi">{p.summary(item)}</span>
                    <Show when={p.canWrite}>
                      <span class="butir-aksi">
                        <Show
                          when={confirmId() === item.id}
                          fallback={
                            <>
                              <button class="tombol tipis" type="button" onClick={() => open(item)}>
                                Ubah
                              </button>
                              <button
                                class="tombol tipis"
                                type="button"
                                onClick={() => {
                                  setRowError("");
                                  setConfirmId(item.id);
                                }}
                              >
                                Hapus
                              </button>
                            </>
                          }
                        >
                          <button class="tombol bahaya" type="button" onClick={() => remove(item.id)}>
                            Ya, hapus
                          </button>
                          <button class="tombol tipis" type="button" onClick={() => setConfirmId(null)}>
                            Batal
                          </button>
                        </Show>
                      </span>
                    </Show>
                  </>
                }
              >
                <FormBody />
              </Show>
            </li>
          )}
        </For>
        <Show when={editing() === "baru"}>
          <li class="butir">
            <FormBody />
          </li>
        </Show>
      </ul>
      <Show when={p.canWrite && editing() === null}>
        <button class="tombol" type="button" onClick={() => open()}>
          {p.addLabel}
        </button>
      </Show>
    </section>
  );

  function FormBody() {
    return (
      <form class="form" onSubmit={form.submit}>
        <Show when={form.error()}>
          <div class="peringatan" role="alert">
            {form.error()}
          </div>
        </Show>
        <For each={p.fields}>
          {(f) => (
            <Field
              id={`${p.path.slice(1)}-${editing()}-${f.key}`}
              label={f.label}
              type={f.type ?? "text"}
              inputmode={f.type === "number" ? "numeric" : undefined}
              required={f.required}
              hint={f.hint}
              maxlength={f.maxlength}
              value={values()[f.key] ?? ""}
              onInput={(v) => setValues({ ...values(), [f.key]: v })}
              error={form.fields()[f.key]}
            />
          )}
        </For>
        <div class="butir-aksi">
          <button class="tombol utama" type="submit" disabled={form.busy()}>
            {form.busy() ? "Menyimpan…" : "Simpan"}
          </button>
          <button class="tombol" type="button" onClick={() => setEditing(null)}>
            Batal
          </button>
        </div>
      </form>
    );
  }
}
