import { A, useNavigate } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import KepalaHalaman from "~/components/KepalaHalaman";
import { createSignal, onMount, Show } from "solid-js";
import MasterSection from "~/components/MasterSection";
import Memuat from "~/components/Memuat";
import { getMe, type Me } from "~/lib/api";

const tgl = (s: unknown) => new Date(`${s}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function Master() {
  const nav = useNavigate();
  const [me, setMe] = createSignal<Me | null>(null);

  onMount(async () => {
    const m = await getMe().catch(() => null);
    if (!m) return nav("/masuk", { replace: true });
    if (!m.active || m.active.role === "orang_tua") return nav("/", { replace: true }); // data master hanya untuk staf
    setMe(m);
  });

  const role = () => me()?.active?.role;
  const canRead = () => role() === "admin_ssb" || role() === "pelatih" || role() === "korlas";

  return (
    <Show when={me()} fallback={<Memuat halaman />}>
      <Title>Data master · SSB App</Title>
      <main class="halaman">
        <KepalaHalaman
          chip="Pengaturan"
          judul="Data master"
          sub={`Kelompok usia, periode, dan lokasi latihan dipakai di data pemain dan jadwal.${role() === "admin_ssb" ? "" : " Hanya admin SSB yang bisa mengubahnya."}`}
        />
        <Show when={canRead()} fallback={<p>Halaman ini hanya untuk admin, pelatih, dan koordinator.</p>}>
          <MasterSection
            title="Kelompok usia (KU)"
            path="/age-groups"
            canWrite={role() === "admin_ssb"}
            addLabel="Tambah KU"
            empty="Belum ada KU. Tambahkan KU pertama, misalnya KU-10 untuk usia 9 sampai 10 tahun."
            fields={[
              { key: "name", label: "Nama KU", required: true, maxlength: 80 },
              { key: "minAge", label: "Usia minimal (tahun)", type: "number", required: true },
              { key: "maxAge", label: "Usia maksimal (tahun)", type: "number", required: true, hint: "Rentang usia antar KU tidak boleh tumpang tindih." },
            ]}
            summary={(i) => `${i.name}, usia ${i.minAge} sampai ${i.maxAge} tahun`}
          />
          <MasterSection
            title="Periode"
            path="/periods"
            canWrite={role() === "admin_ssb"}
            addLabel="Tambah periode"
            empty="Belum ada periode. Tambahkan musim atau semester, misalnya Musim 2026/27."
            fields={[
              { key: "name", label: "Nama periode", required: true, maxlength: 80 },
              { key: "startDate", label: "Tanggal mulai", type: "date", required: true },
              { key: "endDate", label: "Tanggal selesai", type: "date", required: true },
            ]}
            summary={(i) => `${i.name}, ${tgl(i.startDate)} sampai ${tgl(i.endDate)}`}
          />
          <Show when={role() === "admin_ssb"}>
            <p>
              <A href="/penugasan">Atur penugasan pelatih ke KU</A>
            </p>
          </Show>
          <MasterSection
            title="Lokasi latihan"
            path="/locations"
            canWrite={role() === "admin_ssb"}
            addLabel="Tambah lokasi"
            empty="Belum ada lokasi. Tambahkan lapangan tempat latihan."
            fields={[
              { key: "name", label: "Nama lokasi", required: true, maxlength: 80 },
              { key: "address", label: "Alamat (boleh dikosongkan)", maxlength: 200 },
            ]}
            summary={(i) => (i.address ? `${i.name}, ${i.address}` : String(i.name))}
          />
        </Show>
      </main>
    </Show>
  );
}
