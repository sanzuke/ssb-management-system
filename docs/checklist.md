# Checklist pengerjaan

Daftar kerja terukur untuk MVP (fase 1) dan fondasinya. Tiap butir punya kriteria selesai yang bisa diperiksa. Centang `[x]` hanya bila kriterianya terpenuhi dan terbukti (test lolos, endpoint dicoba, atau dokumen ada). Hitung kemajuan dengan `bun run progress`.

Butir bertanda **(butuh keputusan)** terhambat oleh pertanyaan terbuka di `docs/rancangan.md`.

## A. Fondasi

- [x] Dokumen rancangan lengkap (visi, scope, modul, model data, roadmap, tech stack)
- [x] Repo GitHub dan konvensi checkpoint (`docs/checkpoints.md`)
- [x] Keputusan stack: Hono + Bun (backend), SolidStart (frontend), PostgreSQL + Drizzle
- [x] Benchmark backend dan frontend tersimpan di `tools/bench`
- [x] Monorepo Bun workspaces: `apps/api`, `apps/web`, `packages/shared`, `packages/db`
- [x] `bun run typecheck`, `test`, `build` lolos di semua paket
- [x] Skema inti: ssb, app_user, age_group, period, player, player_guardian, coach_assignment, training_session, attendance
- [x] RLS aktif dan dipaksa di semua tabel; 6 test isolasi tenant lolos
- [ ] CI (GitHub Actions): typecheck + test + build tiap push, dengan service PostgreSQL untuk test RLS (workflow sudah ditulis di `tools/ci/ci.yml` dan alurnya disimulasikan lokal; belum aktif karena token sesi tidak boleh mendorong ke `.github/workflows`, dan belum pernah berjalan di GitHub)
- [x] Lint dan format (satu perintah `bun run lint`, Biome; lolos lokal, masuk workflow CI)
- [x] Konfigurasi lingkungan: validasi env saat start (gagal bila `DATABASE_URL` kosong)
- [x] Logging terstruktur dan penanganan error seragam di API (format error baku di `packages/shared`)
- [ ] Docker Compose untuk pengembangan lokal (PostgreSQL + API + web), `docker compose up` cukup untuk mulai (berkas sudah ditulis dan sintaksnya valid; belum dijalankan karena lingkungan sesi tidak punya Docker daemon)

## B. Akun dan tenant

- [x] Putuskan identitas pengguna: akun global (`account`) dengan keanggotaan per SSB (`app_user`); satu akun bisa menjadi anggota beberapa SSB
- [ ] Jalur admin platform untuk membuat SSB baru tanpa konteks tenant
- [x] Daftar SSB baru: membuat akun + SSB + admin pertama dalam satu transaksi (test); akun yang sudah ada bisa membuat SSB tambahan
- [x] Autentikasi: login, sesi aman (cookie HttpOnly, hash token di database, argon2id), logout, ganti kata sandi (test)
- [x] Lupa dan reset kata sandi: tautan sekali pakai (hash di DB; 1 jam lewat email SMTP opsional, 24 jam bila dibuat admin atau lewat `bun run auth:reset`), sesi akun dicabut setelah reset, jawaban lupa-sandi seragam dan dijarangkan; admin tidak bisa mereset akun yang juga anggota SSB lain (test)
- [x] Middleware tenant: `ssb_id` dari sesi, bukan dari input klien (test: input `ssbId` palsu diabaikan)
- [x] Guard role untuk empat role; matriks izin tertulis (`docs/izin.md`, dibuat dari kode) dan diuji per endpoint (test per role; test gagal bila ada endpoint tanpa penjaga)
- [x] Undang pelatih, korlas, dan orang tua lewat tautan sekali pakai yang kedaluwarsa dalam 7 hari; undangan orang tua langsung menghubungkan ke pemain (test)
- [x] Kelola anggota (admin): daftar bersaring dan cari, ubah nama, WhatsApp, dan peran dengan penjaga (peran sendiri, orang tua berkaitan anak, penugasan KU), keluarkan anggota, tautan reset kata sandi; test
- [x] Kelola undangan di web (admin): buat, daftar dengan status (menunggu, diterima, kedaluwarsa), cabut, buat ulang tautan, salin dan kirim lewat WhatsApp manual; test API
- [x] Login dan daftar dengan Google (OIDC, authorization code + PKCE, `email_verified` wajib, tanpa tautan otomatis lewat email); diuji dengan penyedia Google tiruan
- [ ] Uji alur Google sungguhan: kredensial OAuth dari Google Cloud diisi di env, lalu coba daftar, login, dan terima undangan dari browser
- [ ] Tautkan Google ke akun kata sandi (dan sebaliknya) dari pengaturan akun
- [x] Penghapusan akun: akun menghapus diri sendiri dengan konfirmasi kata sandi (atau email untuk akun Google), ditolak bila satu-satunya admin di suatu SSB; keanggotaan, penugasan, dan kaitan anak ikut lepas sementara riwayat tetap (pencatat dikosongkan, migrasi 0017); test
- [ ] Kirim tautan undangan lewat WhatsApp otomatis (fase 2; fase 1 admin menyalin tautan)
- [x] Layar login (tombol Google + email), halaman terima undangan, pemilih SSB, dan pengaturan akun di web, nyaman di layar 360 px

## C. Master data

- [x] CRUD KU (nama, rentang usia) dengan validasi rentang tidak tumpang tindih (409 `age_overlap`, kunci advisory per SSB; test)
- [x] CRUD periode (musim atau semester) dengan validasi tanggal
- [x] CRUD lokasi latihan
- [x] Layar admin untuk ketiganya di web

## D. Pemain dan pelatih

- [x] CRUD pemain: biodata, posisi, sekolah, status; nomor anggota otomatis dan unik per SSB (penghitung atomik per SSB; test serentak)
- [x] Riwayat perubahan KU dan status tersimpan (tabel riwayat + test)
- [x] Unggah, ganti, dan hapus foto pemain: disimpan di folder lokal (`UPLOAD_DIR`), JPG/PNG/WebP maksimal 2 MB, tipe dicek dari isi berkas, dibaca hanya lewat API dengan batas data per role (test); tampil di tabel, profil, kartu, dan portal orang tua
- [ ] Unggah dokumen pemain dan pindah penyimpanan ke S3-compatible bila SSB banyak (foto saat ini di folder lokal)
- [ ] Persetujuan orang tua untuk foto dan dokumen tercatat
- [x] Hubungkan orang tua ke satu atau beberapa anak (lewat undangan atau manual oleh admin)
- [x] Penugasan pelatih dan korlas ke KU per periode, API dan layar admin (profil pelatih memakai nama anggota; kontak dan lisensi menyusul bila dibutuhkan)
- [x] Pelatih hanya melihat pemain di KU yang ditugaskan pada periode berjalan (test: KU lain 404, daftar kosong tanpa penugasan; korlas sama, orang tua hanya anaknya)
- [x] Layar daftar, detail, dan formulir pemain di web; pencarian dan filter KU (dicoba di 360 px, termasuk tampilan pelatih)
- [ ] Impor pemain dari CSV dengan laporan baris gagal

## E. Latihan dan absensi

- [x] Jadwal latihan: buat, ubah, hapus; jadwal berulang mingguan (API + layar admin; pelatih melihat KU-nya)
- [x] Endpoint absensi massal per sesi (satu permintaan untuk satu KU; boleh diulang untuk koreksi; sesi yang belum berlangsung ditolak)
- [x] Pelatih hanya bisa mengisi absensi KU yang ditugaskan (test: KU lain 404; admin boleh semua)
- [ ] Layar absensi sekali ketuk: 20 pemain terisi dalam kurang dari 60 detik pada uji di HP (layar sudah jadi dan lolos e2e di 360 px; butuh uji manusia di HP untuk kriteria waktu)
- [x] Rekap kehadiran per pemain dan per periode (API + layar; persentase diuji terhadap data uji; pelatih hanya KU-nya, orang tua hanya anaknya)
- [ ] Absensi dengan scan QR dari kamera browser

## F. Assessment dan rapor

- [x] Putuskan skala nilai dan frekuensi assessment: skala 1 sampai 10 (diputuskan pemilik); frekuensi: satu penilaian per pemain per periode, boleh diperbarui (asumsi kerja, bisa diubah)
- [ ] Putuskan rujukan indikator dan pelibatan pelatih berlisensi **(butuh keputusan)**
- [x] Tabel indikator, assessment, skor, dan jejak skor (migrasi 0012 + RLS + test); development plan dikerjakan di butir tersendiri di bawah
- [x] Template indikator per KU (aspek, indikator, skala): API dan layar admin (usulan awal 16 indikator, tambah, nonaktifkan, hapus bila belum dipakai); lolos e2e 360 px
- [x] Input penilaian per pemain per periode; skor di luar skala ditolak (test: 0, 11, -1, 5,5, teks, null ditolak; 1 dan 10 sah; juga dijaga CHECK di database)
- [x] Jejak perubahan skor (siapa, kapan, nilai lama dan baru; test)
- [x] Layar input penilaian ramah sentuh di HP (tombol skor 1-10 setinggi 48 px, simpan di bar bawah; pelatih menilai, admin dan korlas menerbitkan, orang tua membaca; lolos e2e 360 px; uji waktu isi di HP oleh manusia belum)
- [x] Grafik perkembangan dan radar chart per pemain (SVG sendiri, tanpa pustaka; radar butuh minimal 3 aspek terisi; lolos e2e 360 px, tabel angka tersedia)
- [x] Development plan per pemain per periode (migrasi 0013 + RLS; maksimal 8 butir: area, aspek, target, catatan; pelatih dan admin menulis, korlas membaca, orang tua membaca setelah penilaian periode itu terbit; ikut di rapor PDF; lolos tes dan e2e 360 px)
- [x] Rapor PDF dari HTML dengan Playwright di Node; satu rapor selesai dalam kurang dari 10 detik (terukur 1,3 sampai 1,4 dtk di e2e; isi: identitas, rata-rata, radar, skor per indikator, kehadiran periode, catatan; memuat rencana pengembangan; Node 22 di sesi ini, produksi Node 24)
- [ ] Wewenang Korlas atas rapor diputuskan dan diterapkan **(butuh keputusan)**

## G. Portal orang tua dan kartu pemain

- [x] Orang tua hanya melihat data anak sendiri (test: anak, sesi, roster absensi, dan rekap anak orang lain ditolak atau tidak muncul)
- [ ] Halaman beranda orang tua: jadwal, absensi, rapor (jadwal dan kehadiran sudah jadi dan lolos e2e 360 px; rapor sudah bisa diunduh dari halaman penilaian, tetapi beranda belum menampilkan ringkasan rapor)
- [x] Unduh rapor PDF dari portal (orang tua hanya yang terbit dan hanya anaknya; e2e mengunduh dan membaca isi PDF)
- [x] Kartu pemain digital dengan QR (nomor anggota, KU, posisi, status); QR dibaca dengan decoder kamera di e2e dan menunjuk profil pemain; kartu anak lain tertutup
- [ ] PWA dapat dipasang di layar HP (manifest, ikon, uji pasang di Android)

## H. Kualitas dan keamanan

- [ ] Uji end-to-end alur utama dengan Playwright: daftar SSB, tambah pemain, absen, nilai, lihat rapor sebagai orang tua
- [ ] Uji beban dasar pada API (target ditetapkan bersama pilot)
- [ ] Audit akses: tiap endpoint punya test untuk role yang tidak berhak
- [ ] Pembatasan laju (rate limit) pada login dan undangan
- [ ] Header keamanan dan CORS dikonfigurasi
- [ ] Tinjauan aspek hukum UU Pelindungan Data Pribadi untuk data anak
- [ ] Cadangan `pg_dump` terjadwal dan uji pemulihan tercatat

## I. Rilis dan pilot

- [ ] Server produksi (VPS), Docker Compose, Caddy atau Nginx, HTTPS
- [ ] Node 24 untuk web dan worker PDF; versi dikunci
- [ ] Pilih satu SSB percontohan dan tetapkan kriteria keberhasilan pilot **(butuh keputusan)**
- [ ] Data nyata pilot dimuat (impor CSV) dan dipakai satu siklus latihan penuh
- [ ] Umpan balik pelatih dan orang tua dicatat; daftar perbaikan diprioritaskan
- [ ] Kriteria lanjut ke fase 2 ditetapkan **(butuh keputusan)**

## J. Fase 2: tagihan SPP

Detail di `docs/spp.md`. Dikerjakan lebih awal dari rencana karena SSB percontohan membutuhkannya.

- [x] Tarif SPP per KU (admin), tagihan bulanan per pemain dibuat idempoten, status dihitung (belum, sebagian, lunas, dibatalkan, terlambat menurut tanggal WIB); test
- [x] Catat pembayaran (sebagian atau penuh) dan batalkan tagihan; orang tua hanya melihat tagihan anaknya; test
- [x] Pengingat jatuh tempo lewat WhatsApp: daftar tunggakan, pesan siap kirim (tautan wa.me), penanda sudah diingatkan dan jumlah pengingat; test
- [x] SPP di dasbor admin: panel bulan berjalan, tindakan, pintasan; banner tagihan di portal orang tua
- [x] Pengaturan SPP di server: tanggal jatuh tempo bawaan, templat pesan bersama, info rekening, jeda pengingat (tab Pengaturan); test
- [x] Tarif khusus per pemain (keringanan atau saudara kandung); tarif 0 berarti tidak ditagih; test
- [x] Ubah nominal tagihan yang sudah dibuat; tagihan yang dibatalkan bisa dibuat ulang; test
- [x] Pengiriman WhatsApp lewat Fonnte: token API disimpan terenkripsi di server, periksa token dan profil perangkat, pesan uji, dan tombol kirim otomatis per tagihan; test (`docs/fonnte.md`)
- [ ] Pengiriman WhatsApp terjadwal harian tanpa admin menekan tombol

## K. Landing page akademi (situs terpisah, konten dari SSB MS)

Detail di `docs/profil.md`. Dikerjakan lebih awal dari rencana karena akademi pertama membutuhkannya. Landing berdiri sendiri di domain akademi; isinya disunting di SSB MS lewat API publik.

- [x] Putuskan bentuk: landing terpisah dari SSB MS, konten diatur di SSB MS (diputuskan pemilik, 23 Okt 2026)
- [x] Skema Zod untuk konten situs dan trial di `packages/shared/src/site.ts`, dipakai API (dan nanti SSB MS dan landing); dua bahasa ID dan EN, batas panjang dan jumlah; test validasi per kolom
- [x] Tabel `site_content` (draf dan terbit) dan `trial_registration` (migrasi 0020, RLS dipaksa); test isolasi antar SSB. `site_gallery` dan `site_domain` ditunda
- [x] Endpoint publik `GET /public/site/:slug`: hanya versi terbit, 404 bila belum terbit, bentuk respons tetap tanpa data pemain; test
- [x] Endpoint admin `GET/PUT /site`, `POST /site/publish` dan `/site/unpublish`; izin `site.manage`; penanda `dirty`; test alur dan test per role
- [ ] Galeri: unggah, hapus, urutkan, tandai terbit; jalur baca publik hanya untuk galeri (foto pemain tetap privat)
- [x] `POST /public/site/:slug/trial` dengan batas laju (5 per jam per IP, 100 per jam per SSB), kolom jebakan bot, dan CORS hanya untuk origin landing; test
- [x] API kotak masuk Pendaftar: `GET /trials`, `PATCH /trials/:id`; izin `trial.manage`; test. Halaman Pendaftar (`/pendaftar`): daftar, saring status, hubungi lewat WhatsApp, ubah status dan catatan. Tombol jadikan undangan orang tua belum
- [x] Halaman Konten situs di SSB MS (`/situs`): sembilan bagian, kolom ID dan EN, validasi per kolom, simpan draf, Terbitkan dan Tarik dari publik dengan konfirmasi. Pratinjau draf belum ada
- [ ] Program, pelatih, dan fasilitas diturunkan dari KU, anggota, dan lokasi, bisa ditimpa admin; pelatih hanya tampil setelah setuju
- [x] Landing: desain tim (`ssb-family-united`) dipasang apa adanya di `https://familyunitedfa.com` dengan foto yang ikut ter-build (commit `de1586a` di repo landing); data masih tertulis di kode dan formulir trial belum tersambung
- [x] Landing (`ssb-family-united`, commit `e6a51cb`): konten dibaca dari `GET /public/site/:slug` saat halaman dibuka (timeout 8 dtk, cadangan data bawaan bila 404 atau offline); formulir trial terkirim ke `POST /public/site/:slug/trial` dengan kode TRL tampil ke orang tua; lintas origin diuji. Terpasang di familyunitedfa.com
- [x] Landing: tidak perlu build ulang saat Terbitkan karena konten dibaca saat halaman dibuka (cache 60 detik). Konsekuensi: mesin pencari yang tidak menjalankan JavaScript melihat data bawaan; prarender bisa ditambah nanti bila SEO penting
- [x] Artikel dan berita: tabel `site_post` dan `site_media` (migrasi 0021, RLS dipaksa), izin `post.write`, API admin dan publik, unggah gambar, halaman Artikel di SSB MS (daftar, editor Markdown, pratinjau, terbit), bagian Berita di landing, dan HTML SEO untuk /berita dan sitemap dari API; test per role, kepemilikan, isolasi, gambar, dan escape HTML
- [ ] Artikel: pasang di server (env LANDING_URL dan LANDING_INDEX_PATH, lokasi Nginx /berita dan /sitemap.xml) dan daftarkan sitemap di Google Search Console
- [ ] Isi asli dari tim menggantikan data contoh (klaim pemain, beasiswa, lisensi, alamat, email) dan foto milik akademi **(butuh keputusan)**
- [ ] Putuskan nama pelatih dan biaya SPP tampil publik atau tidak **(butuh keputusan)**

## L. PWA dan aplikasi mobile

Detail di `docs/mobile.md`. Fase 2 untuk PWA dan push, fase 3 untuk aplikasi native.

- [ ] PWA: manifest, service worker, ikon, mode standalone, tombol pasang; terpasang di layar HP
- [ ] PWA: cache aset aplikasi supaya halaman terbuka tanpa sinyal; data tetap dari server
- [ ] Notifikasi push: tabel langganan perangkat, endpoint FCM, dan layar pengaturan notifikasi per pengguna
- [ ] Notifikasi push untuk orang tua: jadwal berubah, rapor terbit, tagihan baru, tagihan mendekati jatuh tempo
- [ ] Notifikasi push untuk pelatih: sesi hari ini, absensi belum terisi
- [ ] Shortcut aplikasi: absensi hari ini, jadwal hari ini, rapor terbaru
- [ ] Formulir izin tidak hadir dari orang tua, masuk ke daftar tugas admin
- [ ] Widget layar utama: sesi berikutnya untuk pelatih, rapor terbaru untuk orang tua
- [ ] Aplikasi native dengan Capacitor: build Android dan iOS, penandatanganan, dan listing toko
- [ ] Mode offline: antrean perubahan di perangkat, sinkron per entitas, status terlihat oleh pengguna
- [ ] Aturan konflik offline: overwrite per entitas, jejak perubahan di server tetap utuh
- [ ] Uji aplikasi di perangkat nyata: iPhone dan Android kelas bawah, bukan hanya emulator **(butuh keputusan)**
- [ ] Putuskan bentuk native: Capacitor atau Flutter, dan apakah mode offline wajib **(butuh keputusan)**

## M. Email domain akademi

Detail di `docs/email.md`. Server email milik sendiri di zukelabs (`mail.zukelabs.web.id`) sudah melayani beberapa domain.

- [x] Domain `familyunitedfa.com` terdaftar di mail stack: domain, 3 mailbox, dan kunci DKIM selektor `family`; email uji keluar dengan tanda tangan DKIM yang benar
- [x] Mail server `mail.familyunitedfa.com` terpasang di fufa (Postfix, Dovecot, OpenDKIM, sertifikat; uji kirim, IMAP, dan DKIM lolos); kirim keluar lewat relay Brevo
- [x] Kunci Brevo terpasang, firewall terbuka, DNS MX, SPF, DKIM `fufa`, dan DMARC terbaca; email masuk dari Gmail diterima di `info@`; `SMTP_URL` SSB sudah ke mail.familyunitedfa.com dan reset sandi terkirim lewat relay Brevo
- [ ] Ganti CNAME `mail` di Domainesia menjadi record A `124.156.192.17`, sahkan domain di Brevo (record Brevo), dan PTR bila penyedia mengizinkan; periksa kotak masuk atau spam penerima untuk email uji
- [x] Domain `familyunitedfa.com` sudah mengarah ke server landing `124.156.192.17` dengan sertifikat Let's Encrypt (terbit 23 Oktober 2026); vhost sementara di zukelabs dihapus
- [x] Situs landing terpasang di `124.156.192.17` (`/var/www/landing`, Nginx, HTTPS, www dan http dialihkan); halaman PHP kosong digantikan, konfigurasi lama dicadangkan di `/root/nginx-app.bak`
- [ ] Pembaruan landing masih manual (build lokal lalu kirim berkas) karena repo `ssb-family-united` privat; perlu deploy key di GitHub agar server bisa menarik sendiri
- [x] `SMTP_URL` dan `MAIL_FROM` untuk SSB MS memakai mail server di zukelabs; email uji terkirim, tautan lupa kata sandi berjalan
- [ ] Atur SPF `zukelabs.web.id` agar menyertakan IP server (sekarang masih `include:spf.kirim.email ~all`)
- [ ] Pengaturan SMTP per SSB, supaya tiap akademi bisa mengirim dari domainnya sendiri
- [ ] Email keluar diuji ke Gmail, Outlook, dan Yahoo (cek folder spam) setelah DNS aktif
- [ ] Akses mailbox lewat IMAP diuji di satu aplikasi email, untuk memastikan membaca email juga benar

## N. Antarmuka dan deploy

- [x] Tampilan memuat: bola sepak memantul untuk halaman penuh, skeleton untuk panel, daftar, dan formulir; animasi mati bila `prefers-reduced-motion`; dicek di browser dev
- [x] Deploy ke server zukelabs (`ssb-ms.zukelabs.web.id`) sampai commit `2be7700`: migrasi 0018 dan 0019, build, restart, health dan HTTPS dicek
- [x] SSB MS dipindah dari zukelabs ke `124.156.192.17` (23 Okt 2026): Node 24, Bun, PostgreSQL 16 dengan role `ssb_owner` dan `ssb_app` berkata sandi baru, migrasi, data disalin (28 akun, 24 pemain, 640 skor, checksum sama), Chromium untuk PDF, systemd, Nginx, HTTPS Let's Encrypt; login, health, dan rapor PDF lolos; tampilan memuat (`4b50669`) ikut terpasang
- [x] SSB MS dihapus dari zukelabs: service, vhost, sertifikat, `/opt/ssb-management-system`, `/var/lib/ssb`, database `ssb`, role `ssb_owner` dan `ssb_app`; cluster PostgreSQL dan aplikasi lain tidak disentuh
- [ ] Ganti kata sandi contoh `ContohSSB-2026` di server SSB MS sebelum data pemain sungguhan masuk (28 akun disetel ke kata sandi itu atas permintaan pemilik; tertulis di repo; sesi lama tidak dicabut)
- [ ] Cadangan `pg_dump` terjadwal di server SSB MS; sekarang baru satu cadangan manual di `/var/backups/ssb/`
- [x] Desain landing dari tim (`ssb-family-united`) ditinjau: dipakai untuk landing terpisah (bagian K), bukan menggantikan tampilan Garuda Muda di SSB MS
- [x] Server landing `124.156.192.17` (Ubuntu 24.04, Nginx, PHP 8.5, PostgreSQL 16 kosong, Certbot) bisa diakses lewat alias SSH `fufa` dengan kunci; kredensial ada di `docs/krendensial.txt` yang diabaikan git
- [ ] Ganti kata sandi pengguna `ubuntu` di server landing dan matikan login sandi SSH (sekarang kata sandi tertulis di berkas teks)
- [x] SSB MS ikut dipindah ke server landing (diputuskan pemilik, 23 Okt 2026)
