# Database

PostgreSQL 16, Drizzle ORM (`packages/db`). Isolasi antar SSB dijaga di level database dengan Row Level Security (RLS).

## Cara kerja isolasi tenant

- Semua tabel punya kolom `ssb_id` (tabel `ssb` memakai `id`) dan RLS yang aktif plus FORCE.
- Policy hanya mengizinkan baris dengan `ssb_id = current_setting('app.ssb_id')`. Tanpa konteks, tidak ada baris yang terlihat (gagal tertutup).
- Aplikasi memakai role `ssb_app` (bukan pemilik tabel, tanpa BYPASSRLS). Konteks diatur per transaksi lewat `withTenant(db, ssbId, fn)`, yang memakai `set_config(..., true)` sehingga aman untuk connection pool.
- Foreign key komposit `(ssb_id, x_id)` mencegah relasi lintas SSB, misalnya pemain dengan KU milik SSB lain.
- Pemilik tabel (`ssb_owner`) hanya untuk migrasi. Karena FORCE RLS dan policy hanya untuk `ssb_app`, pemilik pun tidak bisa membaca data tenant. Operasi platform (admin platform) perlu jalur terpisah; belum dirancang.

## Menyiapkan database lokal

Jalankan sekali sebagai superuser:

```sql
CREATE ROLE ssb_owner LOGIN CREATEROLE PASSWORD '...';
CREATE ROLE ssb_app LOGIN PASSWORD '...';
CREATE DATABASE ssb OWNER ssb_owner;
-- di dalam database ssb:
GRANT CREATE ON SCHEMA public TO ssb_owner;
```

Lalu:

```
export DATABASE_URL_OWNER=postgres://ssb_owner:...@localhost:5432/ssb
export DATABASE_URL=postgres://ssb_app:...@localhost:5432/ssb
bun run db:migrate
bun run test            # test RLS jalan bila DATABASE_URL diatur, selain itu dilewati
```

Mengubah skema: edit `packages/db/src/schema.ts`, lalu `bun run db:generate` dan tinjau SQL di `packages/db/drizzle`.

## Tabel saat ini

`ssb`, `app_user`, `age_group`, `period`, `player`, `player_guardian`, `coach_assignment`, `training_session`, `attendance`.

Belum ada: template assessment, assessment, skor, dan development plan. Tabel ini menunggu keputusan skala nilai dan frekuensi assessment (lihat pertanyaan terbuka di rancangan).

## Keputusan yang tertunda

- Login lintas SSB: email unik per SSB, sehingga satu orang tua di dua SSB punya dua akun. Perlu rancangan identitas global bila itu penting.
- Jalur admin platform untuk membuat dan mengelola SSB tanpa konteks tenant.
