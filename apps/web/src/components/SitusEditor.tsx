import { useSearchParams } from "@solidjs/router";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce, unwrap } from "solid-js/store";
import type { SiteAdminView, SiteContent } from "@ssb/shared";
import { api, ApiError } from "~/lib/api";
import type { Sunting } from "~/lib/situs";
import { SitusFasilitas, SitusLaga, SitusPelatih, SitusProgram, SitusTestimoni } from "./SitusDaftar";
import { SitusBeranda, SitusCerita, SitusIdentitas, SitusTautan } from "./SitusUmum";

const TAB = [
  { kunci: "identitas", label: "Identitas", awalan: ["identity"] },
  { kunci: "beranda", label: "Beranda", awalan: ["hero", "stats", "images.hero"] },
  { kunci: "cerita", label: "Cerita", awalan: ["story"] },
  { kunci: "program", label: "Program", awalan: ["programs", "sections.programs"] },
  { kunci: "pelatih", label: "Pelatih", awalan: ["coaches", "sections.coaches"] },
  { kunci: "fasilitas", label: "Fasilitas", awalan: ["facilities", "sections.facilities"] },
  { kunci: "laga", label: "Pertandingan", awalan: ["matches", "sections.matches", "images.matches"] },
  { kunci: "testimoni", label: "Testimoni", awalan: ["testimonials", "sections.testimonials"] },
  { kunci: "sosial", label: "Media sosial", awalan: ["social"] },
] as const;
type KunciTab = (typeof TAB)[number]["kunci"];

const waktu = (iso: string) => new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

/** Editor draf konten landing: simpan draf, terbitkan, atau tarik dari publik. Dirender setelah draf selesai dimuat. */
export default function SitusEditor(props: { awal: SiteAdminView }) {
  const [d, setD] = createStore<SiteContent>(structuredClone(props.awal.draft));
  const [status, setStatus] = createSignal(props.awal);
  // Ada perubahan di layar yang belum disimpan ke draf.
  const [belumSimpan, setBelumSimpan] = createSignal(false);
  const [galat, setGalat] = createSignal<Record<string, string>>({});
  const [pesanGalat, setPesanGalat] = createSignal("");
  const [info, setInfo] = createSignal("");
  const [sibuk, setSibuk] = createSignal(false);
  const [konfirmasi, setKonfirmasi] = createSignal<"terbit" | "tarik" | null>(null);
  const [params, setParams] = useSearchParams();
  const tab = (): KunciTab => TAB.find((t) => t.kunci === params.tab)?.kunci ?? "identitas";

  const ubah = (fn: (x: SiteContent) => void) => {
    setD(produce(fn));
    setBelumSimpan(true);
    setInfo("");
    setKonfirmasi(null);
  };
  const salah = (jalur: string) => galat()[jalur];
  const s: Sunting = { d, ubah, salah };

  const tabBermasalah = (k: KunciTab) => {
    const awalan = TAB.find((t) => t.kunci === k)?.awalan ?? [];
    return Object.keys(galat()).some((j) => awalan.some((a) => j === a || j.startsWith(`${a}.`)));
  };

  const peringatKeluar = (e: BeforeUnloadEvent) => {
    if (belumSimpan()) e.preventDefault();
  };
  onMount(() => window.addEventListener("beforeunload", peringatKeluar));
  onCleanup(() => window.removeEventListener("beforeunload", peringatKeluar));

  /** Menjalankan aksi ke API dengan penanganan galat yang sama. Mengembalikan true bila berhasil. */
  const jalankan = async (fn: () => Promise<void>): Promise<boolean> => {
    if (sibuk()) return false;
    setSibuk(true);
    setPesanGalat("");
    setInfo("");
    setKonfirmasi(null);
    try {
      await fn();
      return true;
    } catch (e) {
      if (e instanceof ApiError) {
        setGalat(e.fields);
        const n = Object.keys(e.fields).length;
        setPesanGalat(e.code === "validation" ? `Ada ${n} isian yang perlu diperbaiki. Tab bertanda ● berisi kolom yang bermasalah.` : e.message);
      } else {
        setPesanGalat("Tidak bisa terhubung ke server. Coba lagi.");
      }
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const simpanDraf = async () => {
    const body = structuredClone(unwrap(d));
    const v = await api<SiteAdminView>("/site", { method: "PUT", body });
    setStatus(v);
    setGalat({});
    setBelumSimpan(false);
  };

  const simpan = async () => {
    if (await jalankan(simpanDraf)) setInfo("Draf disimpan. Pengunjung belum melihat perubahan ini sampai Anda menerbitkannya.");
  };
  const terbitkan = async () => {
    const ok = await jalankan(async () => {
      await simpanDraf();
      setStatus(await api<SiteAdminView>("/site/publish", { method: "POST", body: {} }));
    });
    if (ok) setInfo("Terbit. Pengunjung melihat versi ini dalam satu menit.");
  };
  const tarik = async () => {
    const ok = await jalankan(async () => {
      setStatus(await api<SiteAdminView>("/site/unpublish", { method: "POST", body: {} }));
    });
    if (ok) setInfo("Landing ditarik dari publik. Draf tetap tersimpan.");
  };

  const adaPerubahan = () => belumSimpan() || status().dirty;

  return (
    <>
      <section class="master status-situs" aria-label="Status terbit">
        <p>
          <Show when={status().published} fallback={<strong>Belum terbit.</strong>}>
            <strong>Terbit</strong> sejak {status().publishedAt ? waktu(status().publishedAt as string) : "-"}.
          </Show>{" "}
          <Show when={belumSimpan()}>Ada perubahan di layar yang belum disimpan. </Show>
          <Show when={!belumSimpan() && status().dirty}>Draf berbeda dari versi terbit. </Show>
          <Show when={status().published && !adaPerubahan()}>Draf sama dengan versi terbit.</Show>
        </p>
        <Show when={pesanGalat()}>
          <div class="peringatan" role="alert">
            {pesanGalat()}
          </div>
        </Show>
        <Show when={info()}>
          <div class="info" role="status">
            {info()}
          </div>
        </Show>
        <div class="butir-aksi aksi-situs">
          <button class="tombol" type="button" disabled={sibuk() || !belumSimpan()} onClick={simpan}>
            {sibuk() ? "Memproses…" : "Simpan draf"}
          </button>
          <Show
            when={konfirmasi() === "terbit"}
            fallback={
              <button class="tombol utama" type="button" disabled={sibuk() || (status().published && !adaPerubahan())} onClick={() => setKonfirmasi("terbit")}>
                Terbitkan
              </button>
            }
          >
            <button class="tombol utama" type="button" disabled={sibuk()} onClick={terbitkan}>
              Ya, terbitkan sekarang
            </button>
            <button class="tombol tipis" type="button" onClick={() => setKonfirmasi(null)}>
              Batal
            </button>
          </Show>
          <Show when={status().published}>
            <Show
              when={konfirmasi() === "tarik"}
              fallback={
                <button class="tombol tipis" type="button" disabled={sibuk()} onClick={() => setKonfirmasi("tarik")}>
                  Tarik dari publik
                </button>
              }
            >
              <button class="tombol bahaya" type="button" disabled={sibuk()} onClick={tarik}>
                Ya, tarik
              </button>
              <button class="tombol tipis" type="button" onClick={() => setKonfirmasi(null)}>
                Batal
              </button>
            </Show>
          </Show>
        </div>
      </section>

      {/* biome-ignore lint/a11y/useSemanticElements: pilihan bagian */}
      <div class="tab-periode" role="group" aria-label="Bagian konten">
        <For each={TAB}>
          {(t) => (
            <button
              type="button"
              aria-pressed={tab() === t.kunci}
              onClick={() => setParams({ tab: t.kunci === "identitas" ? undefined : t.kunci }, { replace: true })}
            >
              {t.label}
              <Show when={tabBermasalah(t.kunci)}>
                <span aria-hidden="true"> ●</span>
                <span class="sr-saja"> (ada isian bermasalah)</span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <Show when={tab() === "identitas"}>
        <SitusIdentitas s={s} />
      </Show>
      <Show when={tab() === "beranda"}>
        <SitusBeranda s={s} />
      </Show>
      <Show when={tab() === "cerita"}>
        <SitusCerita s={s} />
      </Show>
      <Show when={tab() === "program"}>
        <SitusProgram s={s} />
      </Show>
      <Show when={tab() === "pelatih"}>
        <SitusPelatih s={s} />
      </Show>
      <Show when={tab() === "fasilitas"}>
        <SitusFasilitas s={s} />
      </Show>
      <Show when={tab() === "laga"}>
        <SitusLaga s={s} />
      </Show>
      <Show when={tab() === "testimoni"}>
        <SitusTestimoni s={s} />
      </Show>
      <Show when={tab() === "sosial"}>
        <SitusTautan s={s} />
      </Show>
    </>
  );
}
