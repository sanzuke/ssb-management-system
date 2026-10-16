# SSB App

Aplikasi manajemen dan pengembangan pemain untuk Sekolah Sepak Bola (SSB) dan akademi usia dini. MVP berfokus pada pengembangan pemain: data pemain, absensi, assessment, rapor, dan portal orang tua.

Status saat ini: rancangan selesai, kerangka monorepo sudah berjalan. Fitur MVP belum dibangun.

## Struktur repositori

```
docs/               Dokumen rancangan dan catatan checkpoint
apps/api/           Hono di Bun (API)
apps/web/           SolidStart (PWA)
packages/shared/    Skema Zod dan tipe yang dipakai bersama
tools/bench/        Skrip benchmark untuk keputusan tech stack
```

## Menjalankan

Butuh Bun (>= 1.4). Build web memakai Vite; menjalankan hasil build butuh Node.

```
bun install
bun run dev:api        # http://localhost:3000/health
bun run dev:web
bun run typecheck
bun run test
bun run build
```

Catatan: SolidStart 2 meminta Node >= 24 untuk menjalankan hasil build. Di Node 22 build dan jalan normal pada uji awal, tetapi gunakan Node 24 untuk produksi.

## Cara kerja checkpoint

- Tiap langkah penting menjadi satu atau beberapa commit dengan pesan yang jelas.
- Tiap checkpoint diberi nama dengan format `cp-<nomor>-<nama>`, misalnya `cp-0-rancangan-v1`.
- Nama, hash commit, dan ringkasan tiap checkpoint dicatat di `docs/checkpoints.md`. Catatan ini menjadi acuan utama.
- Melihat perubahan antar checkpoint: `git diff <hash-lama> <hash-baru>`.
- Tag git dengan nama yang sama dibuat di salinan lokal. Bila ingin tag muncul di GitHub, buat dari hash yang tercatat (Releases atau `git tag <nama> <hash>` lalu `git push origin <nama>`).
