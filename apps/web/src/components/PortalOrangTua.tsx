import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { api } from "~/lib/api";
import { inisial } from "~/lib/pemain";
import type { AttendanceSummary, GuardianSession, PlayerSummary } from "@ssb/shared";
import Ikon from "./Ikon";

const statusLabel = { hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpa: "Alpa" } as const;
const hari = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
const pad = (n: number) => String(n).padStart(2, "0");
/** Tanggal hari ini menurut jam perangkat (bukan UTC), agar sesi pagi tidak dianggap kemarin. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const selisihHari = (s: string) => Math.round((new Date(`${s}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86_400_000);
const hariLagi = (s: string) => {
  const n = selisihHari(s);
  return n <= 0 ? "Hari ini" : n === 1 ? "Besok" : `${n} hari lagi`;
};

export default function PortalOrangTua() {
  const [kids] = createResource(() => api<PlayerSummary[]>("/players"));
  const [sum] = createResource(() => api<AttendanceSummary>("/attendance/summary"));
  const [sessions] = createResource(() => api<GuardianSession[]>("/guardian/sessions"));

  const upcoming = createMemo(() => (sessions() ?? []).filter((s) => s.sessionDate >= today()));
  const recent = createMemo(() =>
    (sessions() ?? [])
      .filter((s) => s.sessionDate < today())
      .slice(-5)
      .reverse(),
  );
  const next = () => upcoming()[0];
  const later = () => upcoming().slice(1);
  const many = () => (kids()?.length ?? 0) > 1;
  const stat = (id: string) => sum()?.players.find((p) => p.playerId === id);
  const persen = (v: number) => String(v).replace(".", ",");

  const detail = (s: GuardianSession) => [many() ? s.playerName : "", s.ageGroup.name, s.location?.name].filter(Boolean).join(", ");
  const kapan = (s: GuardianSession) => `${hari(s.sessionDate)}${s.startTime ? `, jam ${s.startTime}` : ""}`;

  const riwayat = (s: GuardianSession) => (
    <li class="ortu-riwayat" data-status={s.status ?? "belum"}>
      <span class="ortu-bulat" aria-hidden="true">
        <Show when={s.status === "hadir"} fallback={<span>{s.status ? statusLabel[s.status][0] : "?"}</span>}>
          <Ikon nama="centang" ukuran={18} />
        </Show>
      </span>
      <div class="ortu-teks">
        <strong>{kapan(s)}</strong>
        <span class="petunjuk">{detail(s)}</span>
      </div>
      <span class="status-ortu" data-status={s.status ?? "belum"}>
        {s.status ? statusLabel[s.status] : "Belum dicatat"}
      </span>
    </li>
  );

  return (
    <>
      <Show when={kids.error || sum.error || sessions.error}>
        <div class="peringatan" role="alert">
          Sebagian data tidak bisa dimuat. Muat ulang halaman.
        </div>
      </Show>

      <section class="ortu-bagian" aria-label="Anak Anda">
        <h2>Anak Anda</h2>
        <Show when={kids.state === "ready" && (kids()?.length ?? 0) === 0}>
          <p class="kosong">Belum ada anak yang terhubung ke akun ini. Minta admin SSB menautkan anak Anda.</p>
        </Show>
        <For each={kids()}>
          {(k) => (
            <article class="ortu-anak">
              <A class="ortu-profil" href={`/pemain/${k.id}`}>
                <span class="ortu-foto" aria-hidden="true">
                  {inisial(k.fullName)}
                </span>
                <span class="ortu-teks">
                  <span class="petunjuk">{k.memberNo ?? "Belum ada nomor"}</span>
                  <strong>{k.fullName}</strong>
                  <span class="petunjuk">{k.ageGroup?.name ?? "Belum ada KU"}</span>
                </span>
              </A>
              <div class="ortu-metrik">
                <div class="ortu-angka">
                  <span class="petunjuk">Kehadiran</span>
                  <Show when={stat(k.id)?.percent != null} fallback={<span class="ortu-besar">–</span>}>
                    <span class="ortu-besar">
                      {persen(stat(k.id)!.percent!)}
                      <small>%</small>
                    </span>
                  </Show>
                  <span class="petunjuk">
                    <Show when={stat(k.id)?.recorded} fallback="Belum ada catatan kehadiran">
                      {`${stat(k.id)!.hadir} dari ${stat(k.id)!.recorded} sesi`}
                    </Show>
                  </span>
                </div>
                <A class="ortu-rekap" href="/kehadiran">
                  Lihat rekap
                  <Ikon nama="panah" ukuran={16} />
                </A>
              </div>
              <div class="ortu-aksi">
                <A class="tombol utama-rumput" href={`/nilai/${k.id}`}>
                  <Ikon nama="buku" ukuran={18} />
                  Penilaian
                </A>
                <A class="tombol sekunder" href={`/kartu/${k.id}`}>
                  <Ikon nama="kartu" ukuran={18} />
                  Kartu pemain
                </A>
              </div>
            </article>
          )}
        </For>
      </section>

      <section class="ortu-terdekat" aria-label="Jadwal latihan mendatang">
        <div class="ortu-kepala">
          <span class="ortu-judul-kecil">
            <Ikon nama="bola" ukuran={20} />
            Latihan terdekat
          </span>
          <Show when={next()}>{(s) => <span class="ortu-lencana">{hariLagi(s().sessionDate)}</span>}</Show>
        </div>
        <Show when={next()} fallback={<p class="ortu-kosong">Belum ada jadwal latihan baru. Admin SSB yang menjadwalkan; jadwal akan muncul di sini.</p>}>
          {(s) => (
            <div class="ortu-isi-putih">
              <div class="ortu-baris">
                <Ikon nama="kalender" />
                <div>
                  <strong>{hari(s().sessionDate)}</strong>
                  <Show when={s().startTime}>
                    <div class="petunjuk">Pukul {s().startTime}</div>
                  </Show>
                </div>
              </div>
              <Show when={s().location}>
                {(l) => (
                  <div class="ortu-baris">
                    <Ikon nama="lokasi" />
                    <span>{l().name}</span>
                  </div>
                )}
              </Show>
              <div class="ortu-baris">
                <Ikon nama="daftar" />
                <span>{[many() ? s().playerName : "", s().ageGroup.name].filter(Boolean).join(", ")}</span>
              </div>
            </div>
          )}
        </Show>
        <Show when={later().length > 0}>
          <ul class="ortu-lanjut">
            <For each={later()}>
              {(s) => (
                <li>
                  <strong>{kapan(s)}</strong>
                  <span>{detail(s)}</span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <Show when={recent().length > 0}>
        <section class="ortu-bagian" aria-label="Latihan terakhir">
          <h2>Riwayat sesi terakhir</h2>
          <ul class="ortu-daftar">
            <For each={recent()}>{riwayat}</For>
          </ul>
          <p>
            <A class="tombol tipis" href="/kehadiran">
              Lihat rekap kehadiran
            </A>
          </p>
        </section>
      </Show>
    </>
  );
}
