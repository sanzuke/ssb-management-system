import { BADGE_MAX, type BadgeCode, badgeCatalog, badgeGroupLabel, badgeGroups, badgeLabel, type PlayerBadge } from "@ssb/shared";
import { createResource, createSignal, For, Show } from "solid-js";
import { api, ApiError } from "~/lib/api";
import { tanggal } from "~/lib/pemain";

const kelompokDari = (kode: BadgeCode) => badgeCatalog.find((b) => b.code === kode)!.group;

/**
 * Lencana: label perilaku positif yang diamati pelatih (maksimal {BADGE_MAX} aktif). Semua peran yang boleh melihat siswa
 * membacanya; admin dan pelatih bisa memberi dan mencabut.
 */
export default function LencanaPemain(props: { playerId: string; bisaUbah: boolean }) {
  const [daftar, { mutate, refetch }] = createResource(
    () => props.playerId,
    (id) => api<PlayerBadge[]>(`/players/${encodeURIComponent(id)}/badges`).catch(() => [] as PlayerBadge[]),
  );
  const [memilih, setMemilih] = createSignal(false);
  const [sibuk, setSibuk] = createSignal(false);
  const [galat, setGalat] = createSignal("");

  const aktif = () => daftar() ?? [];
  const penuh = () => aktif().length >= BADGE_MAX;
  const sudah = (kode: BadgeCode) => aktif().some((b) => b.badge === kode);

  const jalankan = async (fn: () => Promise<unknown>) => {
    setSibuk(true);
    setGalat("");
    try {
      await fn();
    } catch (e) {
      setGalat(e instanceof ApiError ? e.message : "Tidak bisa menyimpan. Coba lagi.");
    } finally {
      await refetch();
      setSibuk(false);
    }
  };
  const beri = (kode: BadgeCode) =>
    jalankan(async () => {
      await api(`/players/${encodeURIComponent(props.playerId)}/badges`, { method: "POST", body: { badge: kode } });
      if (aktif().length + 1 >= BADGE_MAX) setMemilih(false);
    });
  const cabut = (b: PlayerBadge) =>
    jalankan(async () => {
      await api(`/players/${encodeURIComponent(props.playerId)}/badges/${encodeURIComponent(b.id)}`, { method: "DELETE" });
      mutate((l) => (l ?? []).filter((x) => x.id !== b.id));
    });

  return (
    <Show when={aktif().length > 0 || props.bisaUbah}>
      <section class="panel-nilai panel-lencana" aria-label="Lencana">
        <div class="panel-kepala">
          <div>
            <h3>Lencana</h3>
            <p class="petunjuk">
              Diamati pelatih. {aktif().length} dari {BADGE_MAX}.
            </p>
          </div>
          <Show when={props.bisaUbah}>
            <button
              type="button"
              class="tombol tipis tombol-kecil"
              aria-expanded={memilih()}
              disabled={sibuk() || (penuh() && !memilih())}
              onClick={() => setMemilih(!memilih())}
            >
              {memilih() ? "Selesai" : "Beri lencana"}
            </button>
          </Show>
        </div>

        <Show when={aktif().length > 0} fallback={<p class="kosong">Belum ada lencana.</p>}>
          <ul class="lencana-daftar">
            <For each={aktif()}>
              {(b) => (
                <li
                  class="lencana-chip"
                  data-kelompok={kelompokDari(b.badge)}
                  title={`${badgeGroupLabel[kelompokDari(b.badge)]}. Diberikan ${tanggal(b.awardedAt)}${b.awardedBy ? ` oleh ${b.awardedBy}` : ""}`}
                >
                  <span>{badgeLabel[b.badge]}</span>
                  <Show when={props.bisaUbah}>
                    <button type="button" class="lencana-cabut" aria-label={`Cabut lencana ${badgeLabel[b.badge]}`} disabled={sibuk()} onClick={() => cabut(b)}>
                      ×
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <Show when={galat()}>
          <p class="galat" role="alert">
            {galat()}
          </p>
        </Show>

        <Show when={memilih()}>
          <div class="lencana-pilih">
            <For each={badgeGroups}>
              {(g) => (
                <fieldset>
                  <legend>{badgeGroupLabel[g]}</legend>
                  <div class="lencana-daftar">
                    <For each={badgeCatalog.filter((b) => b.group === g)}>
                      {(b) => (
                        <button
                          type="button"
                          class="lencana-chip pilih"
                          data-kelompok={g}
                          disabled={sibuk() || sudah(b.code) || penuh()}
                          aria-pressed={sudah(b.code)}
                          onClick={() => beri(b.code)}
                        >
                          {b.label}
                        </button>
                      )}
                    </For>
                  </div>
                </fieldset>
              )}
            </For>
          </div>
        </Show>
      </section>
    </Show>
  );
}
