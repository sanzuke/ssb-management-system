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

## Jadwal dan absensi

- `training_session.location_id` menautkan sesi ke `location` (FK komposit; lokasi yang dipakai jadwal tidak bisa dihapus, 409). Kolom teks `location` lama dihapus.
- Jadwal berulang mingguan membuat sesi biasa yang berdiri sendiri (tanpa entitas seri), maksimal 100 sesi per permintaan. Periode sesi diisi otomatis dari tanggalnya. Sesi tidak boleh ganda untuk KU, tanggal, dan jam yang sama.
- Absensi disimpan lewat upsert massal per sesi. KU sesi terkunci dan sesi tidak bisa dihapus setelah ada absensi (409). Sesi di masa depan tidak bisa diisi absensinya (toleransi satu hari untuk zona waktu).
- `attendance.recorded_by` memakai `ON DELETE SET NULL (recorded_by)` (migrasi manual 0011, PostgreSQL 15+): menghapus keanggotaan pencatat tidak menghapus riwayat absensi. Drizzle belum bisa menyatakannya di `schema.ts`; jangan menerima hasil `db:generate` yang mengembalikannya ke NO ACTION.

### Rekap kehadiran

`GET /attendance/summary?periodId=&ageGroupId=` (izin `attendance.read`). Per pemain: jumlah hadir, izin, sakit, alpa, `recorded` (jumlah keempatnya) dan `percent` = hadir / recorded x 100 satu desimal (`null` bila belum ada catatan). Sesi tanpa satu pun catatan tidak dihitung; pemain tanpa catatan pada sesi tertentu tidak dihitung hadir maupun alpa untuk sesi itu. `sessionsHeld` = sesi pada rentang yang sudah punya catatan. Pemain tidak aktif hanya tampil bila punya catatan pada rentang itu. Pembatasan akses sama dengan daftar pemain (pelatih/korlas: KU ditugaskan, orang tua: anaknya).

### Portal orang tua

`GET /guardian/sessions?from=&to=` (izin `guardian.sessions`, default 30 hari ke belakang dan ke depan, maksimal 300 baris). Satu baris per anak per sesi di KU anak itu: tanggal, jam, KU, lokasi, dan status kehadiran anak (`null` bila belum dicatat). Orang tua tidak pernah menerima daftar pemain lain; `/sessions` dan roster absensi tetap tertutup untuk mereka (404/403). Admin juga memegang izin ini (aturan: admin memegang semua izin) tetapi daftarnya kosong karena admin tidak punya anak.

### Kartu pemain

Halaman `/kartu/<id>` memakai `GET /players/:id`, jadi batas aksesnya sama dengan profil (admin semua; pelatih dan korlas KU yang ditugaskan; orang tua anaknya). Isi QR adalah alamat profil `<asal web>/pemain/<id>` (UUID, bukan nomor anggota yang berurutan). QR tidak membawa data pribadi: profil tetap butuh login dan hak akses. QR digambar di browser dari matriks pustaka `qrcode` sebagai SVG, tanpa layanan luar. Untuk absensi scan QR nanti, pemindai cukup mengambil UUID dari alamat ini.
