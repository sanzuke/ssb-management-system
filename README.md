# SSB App

Aplikasi manajemen dan pengembangan pemain untuk Sekolah Sepak Bola (SSB) dan akademi usia dini. MVP berfokus pada pengembangan pemain: data pemain, absensi, assessment, rapor, dan portal orang tua.

Status saat ini: tahap rancangan, belum ada kode.

## Struktur repositori

```
docs/
  rancangan.md      Dokumen rancangan (visi, scope, modul, model data, roadmap, tech stack)
  checkpoints.md    Catatan checkpoint progres
```

Struktur kode yang direncanakan (monorepo pnpm workspace, mengikuti usulan di rancangan):

```
apps/web/           SolidJS (SolidStart), PWA
apps/api/           Node.js + TypeScript
packages/shared/    Skema, tipe, dan validasi yang dipakai bersama
```

Folder kode baru dibuat saat pekerjaan kodenya dimulai.

## Cara kerja checkpoint

- Tiap langkah penting menjadi satu atau beberapa commit dengan pesan yang jelas.
- Tiap checkpoint diberi tag dengan format `cp-<nomor>-<nama>`, misalnya `cp-0-rancangan-v1`.
- Ringkasan tiap checkpoint dicatat di `docs/checkpoints.md`.
- Melihat daftar checkpoint: `git tag --list 'cp-*'`.
- Melihat perubahan antar checkpoint: `git diff cp-0-rancangan-v1 cp-1-<nama>`.
