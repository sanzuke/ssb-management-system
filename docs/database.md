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

`ssb`, `app_user`, `age_group`, `period`, `player`, `player_guardian`, `coach_assignment`, `training_session`, `attendance`, ditambah `account` (akun global), `invitation` (undangan, dengan RLS), `ssb_directory` (kode SSB ke id), dan `user_session` (sesi login). `account`, `ssb_directory`, dan `user_session` sengaja tanpa RLS karena dicari sebelum konteks tenant ada. `app_user` adalah keanggotaan akun di satu SSB dan punya satu policy tambahan agar akun bisa membaca keanggotaannya sendiri lintas SSB (konteks `app.account_id`).

Belum ada: template assessment, assessment, skor, dan development plan. Tabel ini menunggu keputusan skala nilai dan frekuensi assessment (lihat pertanyaan terbuka di rancangan).

## Keputusan yang tertunda

- Penghapusan akun: keanggotaan ikut terhapus, tetapi kaitan seperti pembuat undangan dan pencatat absensi masih memakai foreign key tanpa aksi hapus; perlu ditangani sebelum fitur hapus akun dibuat.
- Jalur admin platform untuk membuat dan mengelola SSB tanpa konteks tenant.

## Data master

`age_group` (KU, rentang usia 0-30, `max >= min` dijaga CHECK), `period` (`end_date >= start_date` dijaga CHECK, nama unik per SSB), dan `location` (lokasi latihan, nama unik per SSB). Semuanya bertenant dengan RLS FORCE.
Rentang usia KU tidak boleh tumpang tindih dalam satu SSB: dicek di API dalam transaksi dengan `pg_advisory_xact_lock` per SSB, supaya dua perubahan serentak tidak lolos bersamaan. Menghapus KU atau periode yang masih dipakai (pemain, penugasan, jadwal) dijawab 409 `in_use`. `training_session.location` masih teks bebas; menautkannya ke `location` dikerjakan bersama jadwal latihan.

## Pemain

- `player.member_no` otomatis `P0001`, `P0002`, ... per SSB dari penghitung `ssb.member_seq` yang dinaikkan atomik di transaksi yang sama dengan pembuatan pemain (unik walau serentak; nomor tidak dipakai ulang).
- `player_history` mencatat perubahan KU dan status (label terbaca saat itu, siapa, kapan).
- Batas data per role ditegakkan di query (`visibleTo` di `apps/api/src/players.ts`): admin semua; pelatih dan korlas hanya KU yang ditugaskan di periode yang tanggalnya mencakup hari ini; orang tua hanya anaknya. Di luar batas dijawab 404, bukan 403, supaya keberadaan pemain tidak bocor.
- Ubah pemain (PATCH) mengganti seluruh isian; klien mengirim formulir lengkap.
