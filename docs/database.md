# Database

PostgreSQL 16, Drizzle ORM (`packages/db`). Isolasi antar SSB dijaga di level database dengan Row Level Security (RLS).

## Cara kerja isolasi tenant

- Semua tabel punya kolom `ssb_id` (tabel `ssb` memakai `id`) dan RLS yang aktif plus FORCE.
- Policy hanya mengizinkan baris dengan `ssb_id = current_setting('app.ssb_id')`. Tanpa konteks, tidak ada baris yang terlihat (gagal tertutup).
- Aplikasi memakai role `ssb_app` (bukan pemilik tabel, tanpa BYPASSRLS). Konteks diatur per transaksi lewat `withTenant(db, ssbId, fn)`, yang memakai `set_config(..., true)` sehingga aman untuk connection pool.
- Foreign key komposit `(ssb_id, x_id)` mencegah relasi lintas SSB, misalnya pemain dengan KU milik SSB lain.
- Pemilik tabel (`ssb_owner`) hanya untuk migrasi. Karena FORCE RLS dan policy hanya untuk `ssb_app`, pemilik pun tidak bisa membaca data tenant. Operasi platform (admin platform) perlu jalur terpisah; belum dirancang.

## Menyiapkan database lokal

Jalankan sekali sebagai superuser (isinya sama dengan `tools/db/init.sql`, yang dipakai Docker Compose dan CI; kata sandinya hanya untuk lokal):

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

Assessment, development plan, dan rapor PDF ada di bagian berikut.

## Keputusan yang tertunda

- Penghapusan akun: keanggotaan ikut terhapus, tetapi kaitan seperti pembuat undangan dan pencatat absensi masih memakai foreign key tanpa aksi hapus; perlu ditangani sebelum fitur hapus akun dibuat.
- Jalur admin platform untuk membuat dan mengelola SSB tanpa konteks tenant.
- Migrasi tabel merchandise: tidak ada migrasi SQL yang membuat `merchandise_product`, `merchandise_order`, dan `merchandise_order_item`; `0028_eager_corsair.sql` hanya menambah kolom `hpp` ke tabel yang diasumsikan sudah ada (tabelnya dibuat dengan skrip manual di luar `packages/db/drizzle`). Database baru, atau server yang belum menjalankan skrip itu, gagal di migrasi 0028. Perlu migrasi pembuat tabel yang aman dijalankan ulang (`CREATE TABLE IF NOT EXISTS`) sebelum migrasi ini dipakai di server.
- Rantai snapshot drizzle: berkas `meta/0028_snapshot.json` dan `0029_snapshot.json` di git saling bertukar urutan (snapshot 0029 lama punya `id` yang menjadi induk snapshot 0028). `prevId` keduanya sudah diluruskan menjadi 0027, 0028, 0029 supaya `db:generate` berjalan; snapshot 0028 berisi tabel merchandise yang tidak dibuat migrasi mana pun.

## Data master

`age_group` (KU, rentang usia 0-30, `max >= min` dijaga CHECK), `period` (`end_date >= start_date` dijaga CHECK, nama unik per SSB), dan `location` (lokasi latihan, nama unik per SSB). Semuanya bertenant dengan RLS FORCE.
Rentang usia KU tidak boleh tumpang tindih dalam satu SSB: dicek di API dalam transaksi dengan `pg_advisory_xact_lock` per SSB, supaya dua perubahan serentak tidak lolos bersamaan. Menghapus KU atau periode yang masih dipakai (pemain, penugasan, jadwal) dijawab 409 `in_use`. `training_session.location` masih teks bebas; menautkannya ke `location` dikerjakan bersama jadwal latihan.

## Pemain

- `player.member_no` (ID siswa) boleh diisi admin (mis. `SSB-001`; huruf, angka, titik, strip, garis miring; unik per SSB, bentrok dijawab 409 `member_no_taken`). Bila kosong, nomor otomatis `P0001`, `P0002`, ... per SSB dari penghitung `ssb.member_seq` yang dinaikkan atomik di transaksi yang sama dengan pembuatan pemain (unik walau serentak; nomor tidak dipakai ulang, dan nomor yang sudah dipakai ID buatan sendiri dilewati). Saat ubah, ID kosong berarti tidak diubah.
- Data siswa (migrasi 0024): `nisn` (10 angka, unik per SSB, 409 `nisn_taken`), `birth_place`, `guardian_name` dan `guardian_whatsapp` (kontak orang tua sebagai teks, terpisah dari akun wali di `player_guardian`; awalan 8 dilengkapi menjadi 08), `document_status` (`lengkap`, `sebagian`, `belum`; KK dan akta), `height_cm` (50 sampai 230), `weight_kg` (10 sampai 200), `medical_note` (maksimal 500 karakter), `jersey_no` (0 sampai 99), `jersey_size`, `shoe_size` (15 sampai 50); batasnya dijaga CHECK. Semua kolom baru boleh kosong kecuali `document_status` (bawaan `belum`). Hanya muncul di detail pemain (`GET /players/:id`), tidak di daftar. Catatan medis adalah data kesehatan anak: terlihat oleh admin, pelatih KU-nya, dan orang tua anak itu (aturan `visibleTo` yang sama).
- Di tabel Pemain, kolom wali memakai akun wali yang terhubung; pemain tanpa akun wali memakai `guardian_name` dan `guardian_whatsapp` (hanya admin).
- Impor (`POST /players/import`, izin `player.write`): `{ rows: [{ nomor, data }], dryRun }`, maksimal 500 baris. Tiap `data` divalidasi dengan `playerFormSchema` yang sama dengan formulir dan disimpan dalam savepoint sendiri, jadi baris gagal (isian salah, ID atau NISN ganda, termasuk ganda di dalam berkas) tidak menggagalkan yang lain. `dryRun` menjalankan semuanya lalu membatalkan transaksi. Respons: `{ dryRun, created, gagal: [{ nomor, nama, galat[] }] }`. Pemetaan lembar ke isian (judul kolom, tanggal, KU, posisi) ada di `packages/shared/src/impor.ts`, dipakai halaman web sebelum mengirim.
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

## Assessment (skala 1 sampai 10)

Tabel (semua RLS dan FORCE RLS, migrasi 0012): `assessment_indicator` (indikator per KU, enam aspek: technical, physical, tactical, mental, movement, game_intelligence; nama unik per KU; `active` untuk menonaktifkan), `assessment` (satu baris per pemain per periode, KU dicatat saat dinilai, `published_at` untuk penerbitan ke orang tua), `assessment_score` (CHECK `score between 1 and 10`), `assessment_score_log` (jejak: nilai lama dan baru, siapa, kapan; hanya ditambah). `assessor_id` dan `changed_by` memakai `ON DELETE SET NULL (kolom)` seperti `attendance.recorded_by` (migrasi 0012 sudah menulisnya manual; jangan terima hasil `db:generate` yang mengembalikannya).

Endpoint:

- `GET/POST /assessment-indicators`, `POST /assessment-indicators/defaults` (memasang 16 indikator usulan awal untuk satu KU; aman diulang), `PATCH/DELETE /assessment-indicators/:id`. Baca: `master.read`; ubah: `master.write` (admin). Hapus ditolak 409 `in_use` bila sudah dipakai skor; nonaktifkan saja.
- `PUT /players/:playerId/assessments/:periodId` (izin `assessment.write`: admin dan pelatih; pelatih hanya KU yang ditugaskan). Isi: `scores` (1 sampai 10, bilangan bulat, tanpa duplikat, indikator harus aktif dan milik KU pemain), `note`, `assessedOn`. Skor yang tidak berubah tidak masuk jejak.
- `GET /players/:playerId/assessments` (izin `assessment.read`): skor, rata-rata per aspek, rata-rata keseluruhan. Orang tua hanya melihat penilaian anaknya yang sudah diterbitkan.
- `POST` dan `DELETE /players/:playerId/assessments/:periodId/publish` (izin `report.publish`: admin dan korlas, sementara): terbitkan dan tarik kembali.
- `GET /players/:playerId/assessments/:periodId/history`: jejak perubahan skor (tidak untuk orang tua).

Indikator usulan awal berasal dari rancangan dan perlu divalidasi pelatih berlisensi sebelum dikunci.

Layar: `/indikator` (admin mengatur template per KU; pelatih dan korlas hanya melihat), `/nilai/<id pemain>` (pelatih dan admin mengisi skor 1-10 per indikator dengan catatan; admin dan korlas menerbitkan atau menarik; korlas hanya membaca; orang tua melihat semua penilaian anaknya yang sudah diterbitkan). Konstanta aspek ada di `@ssb/shared/aspects` (tanpa zod) agar bundel web tidak ikut memuat zod.

## Rapor PDF

Tidak ada tabel baru. `GET /players/:playerId/assessments/:periodId/report` (izin `assessment.read`) menyusun data dari penilaian yang sama dengan layar penilaian, ditambah rekap kehadiran pemain pada sesi berperiode itu, lalu membuat HTML mandiri (`apps/api/src/report/html.ts`, semua teks di-escape, tanpa skrip dan tanpa sumber luar) dan mengubahnya menjadi PDF lewat proses Node + Chromium (`render-pdf.mjs`: JavaScript dimatikan, semua permintaan jaringan ditolak). Paling banyak dua render sekaligus, batas 30 detik. Orang tua hanya bisa mengunduh penilaian yang sudah terbit dan hanya untuk anaknya (selain itu 404). Respons `Cache-Control: private, no-store`.

## Rencana pengembangan (migrasi 0013)

Tabel `development_plan_item`: satu baris per butir rencana untuk satu pemain pada satu periode (`area`, `aspect` opsional, `target`, `note`, `sort_order`). RLS dipaksa; FK komposit ke pemain (hapus pemain menghapus rencananya) dan periode; `created_by` memakai `ON DELETE SET NULL (created_by)` (manual, jangan dikembalikan oleh `db:generate`).

API: `GET` dan `PUT /players/:playerId/development-plan/:periodId`. `PUT` mengganti seluruh daftar (maksimal 8 butir, daftar kosong menghapus) dalam satu transaksi. Menulis: `assessment.write` (admin, pelatih KU-nya). Membaca: `assessment.read`; orang tua hanya bila penilaian pemain itu pada periode tersebut sudah terbit (selain itu 404), sehingga menarik penerbitan juga menutup rencananya. Rencana tidak punya status terbit sendiri.

## Lencana pemain (migrasi 0022)

Tabel `player_badge`: satu baris per lencana yang diberikan (`badge` = kode dari `badgeCatalog` di `packages/shared/src/badges.ts`, `awarded_by`, `awarded_at`, `revoked_by`, `revoked_at`). RLS dipaksa; FK komposit ke pemain (hapus pemain menghapus lencananya); `awarded_by` dan `revoked_by` memakai `ON DELETE SET NULL (kolom)` yang ditulis manual di migrasi. Mencabut hanya mengisi `revoked_at`, jadi riwayat tetap ada; indeks unik parsial `player_badge_active` (pemain + kode, hanya baris yang belum dicabut) mencegah lencana aktif ganda, dan lencana yang pernah dicabut boleh diberikan lagi.

Katalog ada di kode, bukan tabel master, dan kodenya tidak dikunci di database (kode di luar katalog ditolak API dengan 400). Mengubah daftar tidak butuh migrasi; kode yang dihapus dari katalog meninggalkan baris lama yang tidak dikenal, jadi cabut dulu atau pertahankan kodenya.

API: `GET /players/:playerId/badges` (izin `badge.read`; lencana aktif, urut waktu), `POST` `{ badge }` (izin `badge.write`: admin dan pelatih KU-nya; 409 `badge_exists` atau 409 `badge_limit` bila sudah ada 5 aktif), `DELETE /players/:playerId/badges/:badgeId` (mencabut, 204). Batas `BADGE_MAX` = 5 dijaga di transaksi dengan `pg_advisory_xact_lock` per pemain, sehingga pemberian serentak tidak melewatinya. Pemain di luar batas peran dijawab 404; orang tua hanya membaca lencana anaknya.

## Bobot posisi (migrasi 0023)

Tabel `position_weight`: bobot indikator per posisi buatan SSB (`position`, `indicator` = nama indikator, `weight` 0 sampai 5 dijaga CHECK; unik per SSB, posisi, dan indikator). RLS dipaksa. Hanya baris yang berbeda dari bobot awal (`defaultPositionWeights` di `packages/shared/src/posisi.ts`) yang disimpan; tanpa baris berarti memakai bobot awal, dan indikator yang tidak ada di bobot awal berbobot 0. Nama indikator dicocokkan sebagai teks, jadi mengganti nama indikator membuat bobotnya tidak berlaku lagi.

API: `GET /position-weights` (izin `assessment.read`; bobot yang berlaku, bawaan ditimpa baris SSB), `PUT` (izin `master.write`; `{ weights }` mengganti seluruh bobot buatan SSB, posisi atau indikator yang tidak dikirim kembali ke bawaan), `DELETE` (kembali ke bawaan, 204). Kecocokan dihitung di sisi klien dengan `hitungKecocokan` dari skor periode yang tampil; tidak ada angka yang disimpan.

## Cedera (migrasi 0025)

Tabel `player_injury`: satu baris per cedera (`body_part` = kode dari `bodyParts` di `packages/shared/src/injuries.ts`, `started_on`, `expected_return_on`, `recovered_on`, `note` maksimal 500 karakter, `recorded_by`, `recovered_by`). `recovered_on` kosong berarti masih berjalan; menandai pulih hanya mengisinya, jadi riwayat tetap ada. CHECK menjaga perkiraan dan tanggal pulih tidak mendahului tanggal mulai. RLS dipaksa; FK komposit ke siswa (hapus siswa menghapus catatannya); `recorded_by` dan `recovered_by` memakai `ON DELETE SET NULL (kolom)` yang ditulis manual di migrasi. Kode bagian tubuh tidak dikunci di database; daftar bisa ditambah tanpa migrasi.

API: `GET /players/:playerId/injuries` (izin `injury.read`), `POST` (izin `injury.write`; `bodyPart`, `startedOn`, `expectedReturnOn`, `note`), `PATCH /players/:playerId/injuries/:id` (perkiraan pulih dan catatan, hanya cedera yang masih berjalan; 409 `already_recovered` bila sudah pulih), `POST .../recover` (`recoveredOn` bawaan hari ini WIB). Semuanya mengembalikan daftar terbaru: yang berjalan dulu, lalu yang terbaru. Tanggal mulai dan pulih boleh sampai besok (selisih UTC dan WIB). Akses: admin; pelatih dan korlas hanya KU yang ditugaskan (korlas hanya membaca); orang tua hanya anaknya dan hanya membaca. Di luar batas dijawab 404 seperti rute siswa lain.

Catatan (`note`) hanya keluar dari endpoint cedera. `GET /squad` dan roster absensi hanya membawa tanda `injury` (`bodyPart` dan `expectedReturnOn`, dari cedera berjalan terbaru) tanpa catatan.

## Galeri artikel (migrasi 0027)

Tabel `site_article_gallery`: satu baris per foto galeri pada satu artikel (`post_id` FK komposit ke `site_post`, `media_id` FK ke `siteMedia`). `sort_order` menentukan urutan tampilan; `is_cover` menandai foto mana yang jadi sampul utama (header) di landing. Satu artikel boleh punya banyak foto; satu foto medium hanya boleh digunakan sekali per artikel (unik `(ssb_id, post_id, media_id)` implicitly melalui FK + index). RLS dipaksa dengan `ssb_id`; semua baris milik SSB yang sama. Bila foto medium dihapus, `media_id` diosongkan (SET NULL) supaya artikel dan galeri-nya tidak ikut terhapus.

API: `POST/PUT /posts` menerima `galleryMediaIds` (array UUID media) untuk menyimpan galeri sekaligus artikel; foto pertama dalam daftar dijadikan cover default bila belum ada. Endpoint terpisah untuk mengelola galeri (tambah, hapus, urutkan, ganti cover) menyusul. Respons publik artikel menyertakan daftar URL foto galeri agar landing page bisa menampilkan carousel/header foto dengan thumbnail di bawahnya.

## Kalender akademi (migrasi 0029)

Tabel `calendar_event`: satu baris per kegiatan (`title`, `description`, `event_type` = `pertandingan`, `latihan`, `acara`, `libur`, `lainnya`, `start_date`, `end_date` opsional, `start_time` dan `end_time` opsional, `location`, `is_public`, `created_by`). Beda dari `training_session` (jadwal latihan per KU). CHECK menjaga jenis dan `end_date >= start_date`. RLS dipaksa; `created_by` memakai `ON DELETE SET NULL (created_by)` yang ditulis manual di migrasi.

API: `GET /calendar?from=&to=` (izin `calendar.read`, semua role) mengembalikan kegiatan yang beririsan dengan rentang, jadi kegiatan multi-hari yang mulai sebelum `from` tetap ikut; tanpa `from` daftar dimulai hari ini (WIB); maksimal 500 baris. `POST`, `PUT /calendar/:id`, dan `DELETE` memakai izin `calendar.manage` (admin). `GET /public/site/:slug/calendar` tanpa sesi hanya mengembalikan kegiatan `is_public`, dengan `cache-control: public, max-age=60`.

## Donasi crowdfunding (migrasi 0030)

Dua tabel dengan RLS dipaksa. `fundraising_campaign`: kampanye per kegiatan atau kebutuhan (`title`, `description`, `calendar_event_id` opsional ke `calendar_event`, `target_amount` opsional, `deadline` opsional, `status` = `draft`, `aktif`, `selesai`, `is_public`, `payment_info`, `created_by`). `fundraising_pledge`: satu sumbangan atau komitmen sponsor (`donor_id` opsional ke `app_user`, `donor_name` disalin saat dibuat, `donor_whatsapp`, `kind` = `donasi` atau `sponsor`, `amount` rupiah 1 sampai 1 miliar dijaga CHECK, `message`, `is_anonymous`, `status` = `menunggu`, `diterima`, `ditolak`, `received_on`, `admin_note`). CHECK `fundraising_pledge_received_pair` menjaga `received_on` terisi tepat bila status `diterima`. Hapus kampanye menghapus sumbangannya; `calendar_event_id`, `created_by`, dan `donor_id` memakai `ON DELETE SET NULL (kolom)` yang ditulis manual di migrasi.

Alur uang tetap manual, seperti SPP: pembayaran lewat transfer ke `payment_info`, lalu admin mengonfirmasi. Dana terkumpul dan jumlah pendukung hanya dihitung dari sumbangan `diterima`. Hanya kampanye `aktif` dan belum lewat `deadline` (hari itu masih termasuk) yang menerima sumbangan baru; satu anggota maksimal 5 sumbangan `menunggu` per kampanye. Kampanye atau sumbangan yang sudah `diterima` tidak bisa dihapus, dan kampanye yang sudah punya dana diterima tidak bisa dikembalikan ke `draft` (409); koreksi dilakukan dengan menolak sumbangan lebih dulu. Belum ada payment gateway.

### Paket dan donasi publik (migrasi 0033)

`fundraising_campaign.packages` (jsonb, maksimal 8, nama unik tanpa membedakan huruf besar): paket pilihan donatur, masing-masing `name`, `amount` (rupiah), dan `description`; diatur admin di form kampanye. `fundraising_pledge` menambah `package_name` (salinan nama paket saat menyumbang; paket boleh diubah kemudian tanpa mengubah catatan lama, kosong = nominal bebas) dan `from_landing` (dikirim donatur umum tanpa akun, `donor_id` kosong, WhatsApp wajib).

Halaman `/donasi` di landing memakai `POST /public/site/:slug/fundraising/:id/pledge` (tanpa sesi): memilih paket (nominal diambil dari paket di server) atau nominal bebas minimal Rp 10.000, jenis donasi atau sponsor, anonim boleh. Hasilnya sumbangan berstatus `menunggu`, sama seperti sumbangan anggota, dan admin mengonfirmasi di halaman kampanye. Petunjuk transfer (`payment_info`) hanya ada di jawaban POST itu, tidak di daftar kampanye publik. Batas: 10 permintaan per jam per IP dan 200 per SSB (429), maksimal 5 donasi menunggu per nomor WhatsApp per kampanye, kolom jebakan bot `website`; kampanye draf, tidak publik, atau milik SSB lain dijawab 404, yang selesai 409.

API: `GET /fundraising` dan `GET /fundraising/:id` (izin `fundraising.read`; draf hanya terlihat admin; anggota melihat sumbangan yang diterima dan miliknya sendiri; donatur anonim tampil tanpa nama kecuali bagi admin dan pemiliknya). `POST /fundraising/:id/pledges` (izin `fundraising.pledge`, semua role). Izin `fundraising.manage` (admin): `POST`, `PUT`, `DELETE /fundraising`, `POST /fundraising/:id/donations` (mencatat sumbangan di luar aplikasi, langsung `diterima`), `PATCH` dan `DELETE /fundraising/pledges/:id`. `GET /public/site/:slug/fundraising` tanpa sesi: kampanye `is_public` yang bukan draf, dengan dana terkumpul, jumlah pendukung, dan nama donatur atau sponsor yang tidak anonim; tanpa rekening dan tanpa nominal per donatur.

## Indeks nilai siswa (migrasi 0031)

Tiga tabel dengan RLS dipaksa; rumus, bobot, dan aturan di `docs/indeks-nilai.md`. `player_match_stat`: statistik laga satu siswa per periode (`matches_played`, `goals`, `assists`, `starts`, `yellow_cards`, `red_cards`; unik per siswa dan periode; CHECK menjaga rentang dan `starts`, kartu kuning, serta kartu merah tidak melebihi jumlah laga). `player_physical_test`: hasil tes kebugaran satu siswa per tanggal (`speed_30m`, `zig_zag`, `vertical_jump`, `bleep_level`, `note`; unik per siswa dan tanggal; CHECK minimal satu metrik terisi dan rentang tiap metrik). `player_market_value`: hasil indeks per siswa dan periode sebagai foto saat dihitung (`mvi` 0 sampai 100 dan `category` keduanya kosong bila data belum cukup, dijaga CHECK; `coverage` persen bobot yang terisi; `breakdown` jsonb berisi skor, bobot, dan keterangan tiap komponen; `age_group_id` dicatat saat dihitung; `computed_by`). Tidak ada kolom nilai uang. Hapus siswa atau periode menghapus barisnya; `recorded_by` dan `computed_by` memakai `ON DELETE SET NULL (kolom)` yang ditulis manual di migrasi.

API: `POST /market-value/compute` (izin `mvi.write`: admin dan pelatih KU-nya) menghitung ulang seluruh siswa aktif satu KU yang boleh dilihat pemanggil pada satu periode, lalu mengembalikan peringkatnya; satu KU sekaligus karena kebugaran dan usia relatif terhadap teman satu KU. `GET /market-value?ageGroupId=&periodId=` (izin `squad.read`) peringkat satu KU, siswa yang belum dihitung tetap muncul. `GET /players/:id/market-value` (izin `mvi.read`): staf menerima angka dan rincian, orang tua hanya `{ period, category }` untuk periode yang penilaiannya sudah terbit. `PUT /players/:id/match-stats/:periodId` (mengganti seluruh statistik), `GET /players/:id/match-stats`, `POST` dan `GET /players/:id/physical-tests`, `DELETE /physical-tests/:id`; tulis memakai `mvi.write`, baca memakai `squad.read`. Akses siswa memakai `visibleTo` yang sama dengan profil: siswa di luar jangkauan dijawab 404.
