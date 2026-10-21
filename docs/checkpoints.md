# Checkpoint progres

Satu baris per checkpoint, yang terbaru di atas. Hash commit menjadi acuan utama, karena tag git belum bisa dikirim ke GitHub dari lingkungan kerja ini. Tag dengan nama yang sama tersedia di salinan lokal, dan bisa dibuat di GitHub dari hash yang tercatat.

| Checkpoint | Commit | Tanggal | Isi |
| --- | --- | --- | --- |
| `cp-0-rancangan-v1` | `34a4182` | 2026-10-17 | Rancangan awal: visi, scope MVP, modul, model assessment, model data, paket, roadmap termasuk mobile, fitur mobile, kebutuhan non-fungsional, usulan tech stack |
| cp-1-keputusan-stack | `6fed54d` | 2026-10-17 | Hono + Bun diputuskan; benchmark backend dan frontend; keputusan frontend menunggu |
| cp-2-keputusan-frontend | `42f483f` | 2026-10-17 | SolidStart diputuskan untuk frontend |
| cp-3-kerangka-monorepo | `9013d73` | 2026-10-17 | Monorepo Bun workspaces: apps/api (Hono), apps/web (SolidStart), packages/shared (Zod); typecheck, test, build lolos |
| cp-4-skema-db | `8fd00d7` | 2026-10-17 | Skema PostgreSQL inti dengan Drizzle, RLS dan FORCE, FK komposit lintas tenant, 6 test isolasi |
| cp-5-checklist | `a9e9a99` | 2026-10-17 | Checklist pengerjaan terukur (69 butir) dan skrip kemajuan |
| cp-6-autentikasi | `6a18f4e` | 2026-10-17 | Autentikasi API: daftar SSB, login, sesi, logout, ganti sandi, guard role, validasi env; 13 test di api |
| cp-7-akun-global-google | `f012f9b` | 2026-10-17 | Akun global + keanggotaan per SSB, login Google (OIDC + PKCE), undangan sekali pakai; 24 test api |
| cp-8-layar-auth-web | `105f888` | 2026-10-17 | Layar masuk, daftar, undangan, pilih SSB, akun di web (360 px); proxy `/api`; e2e Playwright dengan Google tiruan |
| cp-9-matriks-izin | `e61f235` | 2026-10-17 | Matriks izin satu sumber (`permissions`), `requirePermission`, docs/izin.md dibuat dari kode, test per role dan test cakupan penjaga; 30 test api |
| cp-10-data-master | `d0cc18c` | 2026-10-17 | KU (tanpa tumpang tindih), periode, lokasi: API + layar admin (360 px); migrasi 0006; 43 test api |
| cp-11-pemain-api | `7632a34` | 2026-10-17 | Pemain (nomor anggota otomatis, riwayat KU/status), orang tua, penugasan pelatih, batas data per role; migrasi 0007; 55 test api |
| cp-12-pemain-web | `085b5cd` | 2026-10-17 | Layar pemain (daftar, cari, filter, tambah, ubah, riwayat, orang tua) dan penugasan pelatih; e2e 360 px termasuk tampilan pelatih |
| cp-13-jadwal-absensi-api | `46f42a0` | 2026-10-17 | Jadwal latihan (berulang mingguan), absensi massal, batas role; lokasi jadi FK; migrasi 0008-0011; 66 test api |
| cp-14-jadwal-absensi-web | `79ff4cd` | 2026-10-17 | Layar jadwal (admin: tambah, ubah, hapus, berulang) dan absensi sekali ketuk untuk pelatih; e2e 360 px |
| cp-15-rekap-kehadiran-api | `d1ebb93` | 2026-10-17 | Endpoint rekap kehadiran per pemain, periode, KU; batas role; 67 test api |
| cp-16-rekap-kehadiran-web | `7cff270` | 2026-10-17 | Layar kehadiran (filter periode dan KU, persentase, tampilan pelatih); e2e 360 px; checklist 31/75 |
| cp-17-portal-ortu-api | `96fb89d` | 2026-10-17 | Endpoint jadwal KU anak dengan status anak; izin `guardian.sessions`; 68 test api |
| cp-18-portal-ortu-web | `b32f488` | 2026-10-17 | Beranda orang tua (anak, persentase hadir, latihan mendatang dan terakhir); e2e 360 px; checklist 32/75 |
| cp-19-kartu-pemain-qr | `7062986` | 2026-10-17 | Kartu pemain (nomor anggota, KU, posisi, status, QR ke profil), tautan dari profil dan beranda orang tua; e2e membaca QR; checklist 33/75 |
| cp-20-assessment-api | `ace6a5e` | 2026-10-17 | Assessment skala 1-10: indikator per KU (usulan awal 14), penilaian per pemain per periode, jejak skor, penerbitan ke orang tua; migrasi 0012; 73 test api; checklist 37/75 |
| cp-21-assessment-web | `4f487b9` | 2026-10-17 | Layar penilaian skor 1-10 di HP, layar admin indikator (16 usulan awal), penerbitan, orang tua membaca; e2e 360 px; checklist 39/75 |
| cp-22-fondasi-tooling | `4031a1a` | 2026-10-17 | Lint/format Biome, logging terstruktur (reqId), workflow CI di tools/ci (belum aktif), Docker Compose lokal (belum dijalankan); 76 test api; checklist 41/75 |
| cp-23-grafik-nilai | `76b1572` | 2026-10-17 | Radar 6 aspek (periode terpilih vs sebelumnya) dan garis perkembangan antar periode, tabel angka; staf (lipat) dan orang tua; e2e dua periode 360 px; checklist 42/75 |
| cp-24-rapor-pdf | `b5724ad` | 2026-10-17 | Rapor PDF A4 (identitas, rata-rata, radar, skor per indikator, kehadiran, catatan) dari HTML lewat Node + Chromium, 1,4 dtk; unduh dari halaman penilaian (staf dan orang tua terbit); 80 test api; checklist 44/75 |
| cp-25-development-plan | `8fac4cb` | 2026-10-17 | Rencana pengembangan per pemain per periode: tabel + RLS (0013), GET/PUT, layar edit di HP, orang tua membaca setelah terbit, ikut rapor PDF; 81 test api; checklist 45/75 |
| cp-26-portal-profil-rancangan | (isi setelah commit) | 2026-10-21 | Rancangan portal profil publik akademi (fase 3) dan PWA serta aplikasi native (fase 2-3), plus catatan setup email domain di zukelabs; checklist 60/121 |
