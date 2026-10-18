import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import AuthShell from "~/components/AuthShell";

export default function NotFound() {
  return (
    <AuthShell gaya="buku">
      <Title>Halaman tidak ditemukan · SSB App</Title>
      <h1>Halaman tidak ditemukan</h1>
      <p>Alamat yang Anda buka tidak ada atau sudah dipindah.</p>
      <A class="tombol utama" href="/">
        Ke beranda
      </A>
    </AuthShell>
  );
}
