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
| cp-10-data-master | `HASH10` | 2026-10-17 | KU (tanpa tumpang tindih), periode, lokasi: API + layar admin (360 px); migrasi 0006; 43 test api |
