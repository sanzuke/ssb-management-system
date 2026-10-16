# Benchmark

Skrip dan hasil benchmark untuk keputusan tech stack (lihat docs/rancangan.md).
Jalankan dari salinan kerja yang punya dependensi terpasang; server dipin ke core 0, pengukur ke core 1 (`taskset -c 1 node ...`).

- backend/: Hono vs NestJS (Express/Fastify) di Node dan Bun. Dependensi: hono, @nestjs/*, express, autocannon.
- frontend/: halaman absensi 200 pemain di Next.js 16 dan SolidStart 2 (hanya sumber halaman, bukan proyek lengkap).
