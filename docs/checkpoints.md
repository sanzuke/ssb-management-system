# Checkpoint progres

Satu baris per checkpoint, yang terbaru di atas. Hash commit menjadi acuan utama, karena tag git belum bisa dikirim ke GitHub dari lingkungan kerja ini. Tag dengan nama yang sama tersedia di salinan lokal, dan bisa dibuat di GitHub dari hash yang tercatat.

| Checkpoint | Commit | Tanggal | Isi |
| --- | --- | --- | --- |
| `cp-0-rancangan-v1` | `34a4182` | 2026-10-17 | Rancangan awal: visi, scope MVP, modul, model assessment, model data, paket, roadmap termasuk mobile, fitur mobile, kebutuhan non-fungsional, usulan tech stack |
| cp-1-keputusan-stack | `6fed54d` | 2026-10-17 | Hono + Bun diputuskan; benchmark backend dan frontend; keputusan frontend menunggu |
| cp-2-keputusan-frontend | `42f483f` | 2026-10-17 | SolidStart diputuskan untuk frontend |
| cp-3-kerangka-monorepo | `9013d73` | 2026-10-17 | Monorepo Bun workspaces: apps/api (Hono), apps/web (SolidStart), packages/shared (Zod); typecheck, test, build lolos |
| cp-4-skema-db | `8fd00d7` | 2026-10-17 | Skema PostgreSQL inti dengan Drizzle, RLS dan FORCE, FK komposit lintas tenant, 6 test isolasi |
| cp-5-checklist | (diisi setelah commit) | 2026-10-17 | Checklist pengerjaan terukur (69 butir) dan skrip kemajuan |
