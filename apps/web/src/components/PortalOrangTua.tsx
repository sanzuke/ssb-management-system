import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { api } from "~/lib/api";
import type { AttendanceSummary, GuardianSession, PlayerSummary } from "@ssb/shared";

const statusLabel = { hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpa: "Alpa" } as const;
const hari = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
const today = () => new Date().toISOString().slice(0, 10);

export default function PortalOrangTua() {
  const [kids] = createResource(() => api<PlayerSummary[]>("/players"));
  const [sum] = createResource(() => api<AttendanceSummary>("/attendance/summary"));
  const [sessions] = createResource(() => api<GuardianSession[]>("/guardian/sessions"));

  const upcoming = createMemo(() => (sessions() ?? []).filter((s) => s.sessionDate >= today()));
  const recent = createMemo(() => (sessions() ?? []).filter((s) => s.sessionDate < today()).slice(-5).reverse());
  const many = () => (kids()?.length ?? 0) > 1;
  const stat = (id: string) => sum()?.players.find((p) => p.playerId === id);

  const row = (s: GuardianSession) => (
    <li class="butir">
      <div class="isi">
        <strong>{hari(s.sessionDate)}{s.startTime ? `, jam ${s.startTime}` : ""}</strong>
        <span class="petunjuk">{[many() ? s.playerName : "", s.ageGroup.name, s.location?.name].filter(Boolean).join(", ")}</span>
      </div>
      <span class="status-ortu" data-status={s.status ?? "belum"}>
        {s.status ? statusLabel[s.status] : s.sessionDate < today() ? "Belum dicatat" : "Terjadwal"}
      </span>
    </li>
  );

  return (
    <>
      <Show when={kids.error || sum.error || sessions.error}>
        <div class="peringatan" role="alert">Sebagian data tidak bisa dimuat. Muat ulang halaman.</div>
      </Show>

      <section class="master" aria-label="Anak Anda">
        <h2>Anak Anda</h2>
        <Show when={kids.state === "ready" && (kids()?.length ?? 0) === 0}>
          <p class="kosong">Belum ada anak yang terhubung ke akun ini. Minta admin SSB menautkan anak Anda.</p>
        </Show>
        <ul class="daftar-butir">
          <For each={kids()}>
            {(k) => (
              <li class="butir">
                <A class="pemain-tautan isi" href={`/pemain/${k.id}`}>
                  <strong>{k.fullName}</strong>
                  <span class="petunjuk">
                    {k.ageGroup?.name ?? "Belum ada KU"}
                    <Show when={stat(k.id)?.recorded} fallback=", belum ada catatan kehadiran">
                      {`, hadir ${stat(k.id)!.hadir} dari ${stat(k.id)!.recorded} sesi`}
                    </Show>
                  </span>
                </A>
                <A class="tombol tipis" href={`/nilai/${k.id}`}>Penilaian</A>
                <A class="tombol tipis" href={`/kartu/${k.id}`}>Kartu</A>
                <Show when={stat(k.id)?.percent != null}>
                  <A class="persen" href="/kehadiran" aria-label={`${stat(k.id)!.percent} persen hadir, lihat rekap`}>{String(stat(k.id)!.percent).replace(".", ",")}%</A>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="master" aria-label="Jadwal latihan mendatang">
        <h2>Latihan mendatang</h2>
        <Show when={sessions.state === "ready" && upcoming().length === 0}>
          <p class="kosong">Belum ada jadwal latihan baru. Admin SSB yang menjadwalkan; jadwal akan muncul di sini.</p>
        </Show>
        <ul class="daftar-butir"><For each={upcoming()}>{row}</For></ul>
      </section>

      <Show when={recent().length > 0}>
        <section class="master" aria-label="Latihan terakhir">
          <h2>Latihan terakhir</h2>
          <ul class="daftar-butir"><For each={recent()}>{row}</For></ul>
          <p><A class="tombol tipis" href="/kehadiran">Lihat rekap kehadiran</A></p>
        </section>
      </Show>
    </>
  );
}
