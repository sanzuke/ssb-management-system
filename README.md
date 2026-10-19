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

## Instalasi

Prasyarat: [Bun](https://bun.sh) >= 1.4, Node.js >= 24 (untuk menjalankan hasil build web), dan PostgreSQL 16 atau lebih baru. Alternatifnya cukup Docker (lihat "Dengan Docker Compose").

1. Ambil kode dan pasang dependensi.

   ```
   git clone https://github.com/sanzuke/ssb-management-system.git
   cd ssb-management-system
   bun install
   ```

2. Siapkan database. Jalankan sebagai superuser PostgreSQL (`CREATE DATABASE` sekali, lalu `tools/db/init.sql` yang membuat role `ssb_owner` dan `ssb_app`; kata sandi di berkas itu hanya untuk lokal).

   ```
   psql -U postgres -c "CREATE DATABASE ssb"
   psql -U postgres -d ssb -f tools/db/init.sql
   ```

   Di Windows, `psql.exe` ada di `C:\Program Files\PostgreSQL\<versi>\bin`. Untuk server, jangan pakai `init.sql` apa adanya: salin isinya dan ganti kata sandinya (lihat "Menjalankan di server").

3. Buat berkas `.env` dari contoh dan sesuaikan.

   ```
   cp .env.example .env
   ```

   Untuk database dari langkah 2, isinya `DATABASE_URL_OWNER=postgres://ssb_owner:owner@localhost:5432/ssb` dan `DATABASE_URL=postgres://ssb_app:app@localhost:5432/ssb`.

4. Migrasi dan, bila mau, isi data contoh.

   ```
   bun run db:migrate
   bun run db:seed
   ```

   Atau sekaligus: `bun run db:setup`. Penjelasan data contoh dan akunnya ada di bagian "Data contoh (seed)".

5. Jalankan. API di http://localhost:3000, web di http://localhost:3001.

   ```
   bun run dev:api
   bun run dev:web
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

Foto contoh (siluet berwarna) ikut dibuat di folder `uploads/` untuk sebagian besar pemain; sisanya sengaja tanpa foto agar avatar inisial terlihat.

Di server demo atau staging: `NODE_ENV=production ALLOW_SEED=1 SEED_PASSWORD=<kata sandi kuat> bun run db:seed`. Tanpa `ALLOW_SEED=1` skrip menolak jalan saat `NODE_ENV=production`, dan `SEED_PASSWORD` wajib diisi. Jangan dijalankan di database produksi yang berisi data sungguhan.

### Menjalankan di server

Contoh untuk satu server Linux (Bun, Node.js 24, dan PostgreSQL terpasang). Semua nilai di `<...>` diganti sendiri.

1. Database dengan kata sandi sendiri. Jalankan sebagai superuser:

   ```sql
   CREATE ROLE ssb_owner LOGIN CREATEROLE PASSWORD '<kata-sandi-owner>';
   CREATE ROLE ssb_app LOGIN PASSWORD '<kata-sandi-app>';
   CREATE DATABASE ssb OWNER ssb_owner;
   \c ssb
   GRANT CREATE ON SCHEMA public TO ssb_owner;
   ```

2. Berkas `.env` di root repositori (atau `EnvironmentFile` pada systemd). Nilai `WEB_URL`, `ALLOWED_ORIGINS`, dan `PUBLIC_API_URL` harus sama dengan alamat publik yang dipakai pengguna, lengkap dengan `https://`:

   ```
   NODE_ENV=production
   DATABASE_URL_OWNER=postgres://ssb_owner:<kata-sandi-owner>@localhost:5432/ssb
   DATABASE_URL=postgres://ssb_app:<kata-sandi-app>@localhost:5432/ssb
   WEB_URL=https://<domain-web>
   ALLOWED_ORIGINS=https://<domain-web>
   PUBLIC_API_URL=https://<domain-web>/api
   SESSION_SECRET=<acak-minimal-32-karakter>
   UPLOAD_DIR=/var/lib/ssb/uploads
   ```

   `UPLOAD_DIR` adalah folder foto pemain (bawaan `./uploads`). Buat foldernya, pastikan bisa ditulis oleh pengguna yang menjalankan API, dan masukkan ke cadangan bersama database. Foto tidak disimpan di database.

3. Pasang, migrasi, dan build.

   ```
   bun install --frozen-lockfile
   bun run db:migrate
   bun run build
   ```

4. Isi data contoh (hanya untuk server demo atau staging, jangan di database yang berisi data sungguhan). Di `NODE_ENV=production` skrip menolak jalan tanpa `ALLOW_SEED=1` dan `SEED_PASSWORD`:

   ```
   ALLOW_SEED=1 SEED_PASSWORD=<kata-sandi-kuat> bun run db:seed
   ```

   Membuat ulang: tambahkan `-- --reset`. Dengan Docker Compose: `docker compose --profile seed run --rm seed`.

5. Jalankan API dan web sebagai dua proses (di bawah systemd, pm2, atau sejenisnya). Dari root repositori:

   ```
   bun apps/api/src/index.ts                                           # API, port 3000 (ubah dengan PORT)
   PORT=3001 API_URL=http://localhost:3000 node apps/web/.output/server/index.mjs   # web, port 3001
   ```

6. Pasang reverse proxy dengan HTTPS (Caddy atau Nginx) yang meneruskan domain web ke port 3001. Browser hanya bicara ke origin web; permintaan `/api` diteruskan web ke API, jadi port API tidak perlu dibuka ke publik. HTTPS wajib: di `NODE_ENV=production` cookie sesi bertanda `Secure`, sehingga login tidak berjalan lewat HTTP biasa.

Login Google bersifat opsional; cara menyiapkannya ada di `docs/auth.md` (redirect URI: `https://<domain-web>/api/auth/google/callback`).

Pembaruan berikutnya: `git pull`, `bun install --frozen-lockfile`, `bun run db:migrate`, `bun run build`, lalu mulai ulang kedua proses.

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
