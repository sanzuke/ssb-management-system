import { A, useLocation } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { roleLabel, type Me } from "~/lib/api";
import { mintaKeluar } from "./DialogKeluar";
import Ikon from "./Ikon";

type Butir = { href: string; label: string; ikon: Parameters<typeof Ikon>[0]["nama"]; end?: boolean };
type Grup = { grup: string; ikon: Butir["ikon"]; butir: Butir[] };
/** Satu baris menu: tautan biasa, atau grup yang punya submenu. */
type Baris = Butir | Grup;

const adalahGrup = (b: Baris): b is Grup => "grup" in b;
/** Halaman yang sedang dibuka termasuk tautan ini (beranda hanya cocok persis). */
const cocok = (path: string, b: Butir) => (b.end ? path === b.href : path === b.href || path.startsWith(`${b.href}/`));

/**
 * Navigasi akun. Di HP berupa bilah atas dengan deretan pil yang bisa digeser (submenu diratakan);
 * di layar lebar (dashboard.css) menjadi sidebar kiri dengan grup yang bisa dibuka dan ditutup.
 */
export default function AppBar(props: { me: Me }) {
  const lokasi = useLocation();
  let daftarMenu: HTMLElement | undefined;
  const [terbuka, setTerbuka] = createSignal<Set<string>>(new Set());

  // Di HP menu bisa digeser; menu halaman yang sedang dibuka dibawa ke tengah supaya selalu terlihat.
  createEffect(() => {
    lokasi.pathname;
    queueMicrotask(() => daftarMenu?.querySelector(".menu.active")?.scrollIntoView({ inline: "center", block: "nearest" }));
  });
  // Nama SSB yang panjang diperkecil dan boleh dua baris; ukuran ditentukan dari jumlah huruf.
  const panjangNama = () => {
    const n = (props.me.active?.ssbName ?? "").length;
    return n > 32 ? "sangat" : n > 18 ? "panjang" : undefined;
  };

  const role = () => props.me.active?.role;
  const staf = () => ["admin_ssb", "pelatih", "korlas"].includes(role() ?? "");
  const admin = () => role() === "admin_ssb";
  const ortu = () => role() === "orang_tua";

  /**
   * Menu menurut peran. Grup yang hanya punya satu butir diratakan jadi tautan biasa, jadi peran dengan menu
   * sedikit (orang tua, pelatih) tidak mendapat grup berisi satu baris.
   */
  const menu = (): Baris[] => {
    const grup = (nama: string, ikon: Butir["ikon"], butir: (Butir | false)[]): Baris[] => {
      const ada = butir.filter((b): b is Butir => b !== false);
      return ada.length > 1 ? [{ grup: nama, ikon, butir: ada }] : ada;
    };
    return [
      { href: "/", label: "Beranda", ikon: "beranda", end: true },
      ...grup("Akademik", "pemain", [
        { href: "/pemain", label: ortu() ? "Anak" : "Siswa", ikon: "pemain" },
        { href: "/kehadiran", label: "Kehadiran", ikon: "absen" },
        staf() && { href: "/jadwal", label: "Jadwal", ikon: "kalender" },
        staf() && { href: "/indeks", label: "Indeks nilai", ikon: "indikator" },
        staf() && { href: "/skuad", label: "Skuad", ikon: "indikator" },
        staf() && { href: "/indikator", label: "Indikator", ikon: "indikator" },
      ]),
      ...grup("Kegiatan", "kalender", [
        { href: "/kalender", label: "Kalender", ikon: "kalender" },
        { href: "/donasi", label: "Donasi", ikon: "kartu" },
      ]),
      ...grup("Keuangan", "kartu", [
        (admin() || ortu()) && { href: "/spp", label: "SPP", ikon: "kartu" },
        admin() && { href: "/merchandise", label: "Merchandise", ikon: "kartu" },
      ]),
      ...grup("Situs dan pendaftaran", "bola", [
        admin() && { href: "/situs", label: "Konten situs", ikon: "bola" },
        staf() && { href: "/artikel", label: "Artikel", ikon: "daftar" },
        admin() && { href: "/pendaftar", label: "Pendaftar", ikon: "profil" },
        admin() && { href: "/undangan", label: "Undangan", ikon: "surat" },
      ]),
      ...grup("Pesan", "surat", [
        admin() && { href: "/whatsapp", label: "WhatsApp", ikon: "surat" },
        admin() && { href: "/email", label: "Email", ikon: "surat" },
      ]),
      ...grup("Pengelolaan", "master", [
        admin() && { href: "/anggota", label: "Anggota", ikon: "profil" },
        staf() && { href: "/master", label: "Data master", ikon: "master" },
      ]),
      { href: "/akun", label: "Akun", ikon: "akun" },
    ];
  };

  const berisiAktif = (g: Grup) => g.butir.some((b) => cocok(lokasi.pathname, b));
  const bukaDi = (g: Grup) => terbuka().has(g.grup) || berisiAktif(g);
  const ganti = (g: Grup) =>
    setTerbuka((s) => {
      const n = new Set(s);
      // Grup yang memuat halaman aktif selalu terbuka, jadi yang bisa diubah hanya yang lain.
      if (bukaDi(g)) n.delete(g.grup);
      else n.add(g.grup);
      return n;
    });

  const Tautan = (p: { b: Butir }) => (
    <A class="tombol tipis menu" href={p.b.href} end={p.b.end}>
      <Ikon nama={p.b.ikon} />
      <span>{p.b.label}</span>
    </A>
  );

  return (
    <header class="bar">
      <div class="merek-bar">
        <img class="logo-bar" src="/logo.png" alt="" width="36" height="39" />
        <div class="merek-teks">
          <div class="nama-ssb" title={props.me.active?.ssbName} attr:data-panjang={panjangNama()}>
            {props.me.active?.ssbName ?? "SSB App"}
          </div>
          <Show when={props.me.active}>
            <div class="peran">{roleLabel[props.me.active!.role]}</div>
          </Show>
        </div>
      </div>
      <nav class="aksi" aria-label="Menu utama" ref={daftarMenu}>
        <Show when={props.me.active}>
          <For each={menu()}>
            {(b) =>
              adalahGrup(b) ? (
                <div class="grup-menu" classList={{ "berisi-aktif": berisiAktif(b) }}>
                  <button
                    class="grup-menu-kepala"
                    type="button"
                    aria-expanded={bukaDi(b)}
                    aria-controls={`grup-${b.grup.replace(/\s+/g, "-")}`}
                    onClick={() => ganti(b)}
                  >
                    <Ikon nama={b.ikon} />
                    <span>{b.grup}</span>
                    <span class="panah-grup" aria-hidden="true">
                      <Ikon nama="panahBawah" />
                    </span>
                  </button>
                  <div class="grup-menu-isi" id={`grup-${b.grup.replace(/\s+/g, "-")}`} hidden={!bukaDi(b)}>
                    <For each={b.butir}>{(t) => <Tautan b={t} />}</For>
                  </div>
                </div>
              ) : (
                <Tautan b={b} />
              )
            }
          </For>
        </Show>
      </nav>
      <div class="aksi bawah">
        <Show when={props.me.memberships.length > 1}>
          <A class="tombol tipis menu" href="/pilih-ssb">
            <Ikon nama="ulang" />
            <span>Ganti SSB</span>
          </A>
        </Show>
        <button class="tombol tipis menu" type="button" onClick={mintaKeluar}>
          <Ikon nama="keluar" />
          <span>Keluar</span>
        </button>
      </div>
    </header>
  );
}
