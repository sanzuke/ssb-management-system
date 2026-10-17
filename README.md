# SSB App

Aplikasi manajemen dan pengembangan pemain untuk Sekolah Sepak Bola (SSB) dan akademi usia dini. MVP berfokus pada pengembangan pemain: data pemain, absensi, assessment, rapor, dan portal orang tua.

Status saat ini: rancangan selesai, kerangka monorepo sudah berjalan. Fitur MVP belum dibangun.

## Struktur repositori

```
docs/               Dokumen rancangan dan catatan checkpoint
apps/api/           Hono di Bun (API)
apps/web/           SolidStart (PWA)
packages/shared/    Skema Zod dan tipe yang dipakai bersama
packages/db/        Skema Drizzle, migrasi, dan RLS (lihat docs/database.md)
tools/bench/        Skrip benchmark untuk keputusan tech stack
```

## Menjalankan

Butuh Bun (>= 1.4). Build web memakai Vite; menjalankan hasil build butuh Node.

```
bun install
bun run dev:api        # http://localhost:3000/health
bun run dev:web
bun run lint           # Biome: format dan lint (CI menjalankan ini)
bun run format         # rapikan format otomatis
bun run typecheck
bun run test
bun run build
```

### Dengan Docker Compose

```
docker compose up --build          # PostgreSQL, migrasi, API (3000), web (3001)
docker compose up --watch          # sama, dan menyinkronkan perubahan kode
```

Database dibuat otomatis (role dan kata sandi lokal ada di `tools/db/init.sql`). Untuk login Google, isi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, dan `SESSION_SECRET` di file `.env` (lihat `docs/auth.md`).

### Data contoh (seed)

Mengisi SSB contoh lengkap: 1 admin, 1 korlas, 2 pelatih, 23 orang tua, 24 pemain (KU-8, KU-10, KU-12), jadwal, absensi, penilaian, dan rencana pengembangan. Butuh `.env` (lihat `.env.example`) dan database yang sudah dimigrasi.

```
bun run db:setup             # migrasi lalu seed
bun run db:seed              # hanya seed; berhenti bila SSB contoh sudah ada
bun run db:seed -- --reset   # hapus SSB contoh dan akunnya, lalu buat ulang
docker compose --profile seed run --rm seed   # lewat Docker Compose
```

Akun contoh (domain `garudamuda.test`): `admin@`, `korlas@`, `budi@` (KU-10), `sari@` (KU-12 dan KU-8), `ortu01@` sampai `ortu23@`. Kata sandi semuanya `SEED_PASSWORD`; bawaan lokal ada di `tools/seed.ts`.

Di server demo atau staging: `NODE_ENV=production ALLOW_SEED=1 SEED_PASSWORD=<kata sandi kuat> bun run db:seed`. Tanpa `ALLOW_SEED=1` skrip menolak jalan saat `NODE_ENV=production`, dan `SEED_PASSWORD` wajib diisi. Jangan dijalankan di database produksi yang berisi data sungguhan.

### Rapor PDF

Endpoint `GET /players/:id/assessments/:periodId/report` membuat PDF dari HTML lewat proses Node + Chromium (`playwright-core`, `apps/api/src/report/render-pdf.mjs`). Butuh `node` di PATH dan Chromium: atur `CHROMIUM_PATH` ke berkas Chrome/Chromium, atau pasang bawaan Playwright (`bunx playwright-core install chromium`). Tanpa itu, endpoint menjawab 503 `report_unavailable` dan tes PDF dilewati (tes akses tetap jalan).

### CI

Workflow GitHub Actions ada di `tools/ci/ci.yml` (lint, typecheck, test dengan PostgreSQL, build). Salin ke `.github/workflows/ci.yml` agar aktif.

### Log API

Satu baris JSON per permintaan (`reqId`, `method`, `path`, `status`, `ms`) ke stdout; error tak terduga dicatat sebagai `unhandled_error` dengan `reqId` yang sama dengan header `X-Request-Id` di respons. Query string, isi permintaan, dan cookie tidak dicatat.

Catatan: SolidStart 2 meminta Node >= 24 untuk menjalankan hasil build. Di Node 22 build dan jalan normal pada uji awal, tetapi gunakan Node 24 untuk produksi.

## Cara kerja checkpoint

- Tiap langkah penting menjadi satu atau beberapa commit dengan pesan yang jelas.
- Tiap checkpoint diberi nama dengan format `cp-<nomor>-<nama>`, misalnya `cp-0-rancangan-v1`.
- Nama, hash commit, dan ringkasan tiap checkpoint dicatat di `docs/checkpoints.md`. Catatan ini menjadi acuan utama.
- Melihat perubahan antar checkpoint: `git diff <hash-lama> <hash-baru>`.
- Tag git dengan nama yang sama dibuat di salinan lokal. Bila ingin tag muncul di GitHub, buat dari hash yang tercatat (Releases atau `git tag <nama> <hash>` lalu `git push origin <nama>`).
