# Portal profil publik SSB (company profile)

Rancangan halaman profil publik untuk sebuah SSB: identitas akademi, lokasi, program, tim, dan cara mendaftar. Berbeda dari portal orang tua (privat, di dalam aplikasi) dan dari dasbor admin.

Status: rancangan. Belum ada implementasi.

## Untuk siapa dan masalah apa

Orang tua yang sedang mencari "SSB di kota saya" butuh dua hal: memastikan akademi ini benar ada dan punya program yang cocok untuk anaknya, lalu tahu cara mendaftar. Aplikasi SSB App menjawab pertanyaan "bagaimana perkembangan anak saya", bukan "akademi ini bagus atau tidak". Portal profil menjawab pertanyaan kedua, lalu mengarahkannya ke pendaftaran di aplikasi.

Catatan desain: profil adalah halaman yang bisa di-index mesin pencari. Data SSB yang tidak ingin dipublikasikan tidak boleh bocor. Jadi yang tampil hanya yang admin SSB pilih untuk terbit.

## Bentuk halaman

Tiga bentuk yang dipertimbangkan:

| Bentuk | Contoh alamat | Kelebihan | Kekurangan |
|---|---|---|---|
| Sub-path di aplikasi | `ssb-ms.zukelabs.web.id/s/garuda-muda` | Satu deploy, satu sertifikat, murah operasional | Host milik platform, kurang terlihat sebagai brand akademi |
| Subdomain per SSB | `garuda-muda.ssb-ms.zukelabs.web.id` | Host terlihat milik akademi | Perlu sertifikat wildcard dan DNS per SSB |
| Domain sendiri | `familyunitedfa.com` | Penuh milik SSB, alamat paling dipercaya | Setup DNS dan TLS per SSB, lebih banyak kerja operasional |

Usulan untuk fase pertama: sub-path (`/s/<slug>`) dengan satu domain, supaya tidak menambah beban operasional per SSB. Bentuk domain sendiri dibuka sebagai fase lanjut.

Agar pindah ke domain sendiri tidak mengubah tautan, satu SSB punya `slug` yang stabil, dan `custom_domain` opsional yang mengalihkan ke slug bila diisi. Fase domain sendiri tinggal mengisi satu kolom.

## Isi halaman

| Bagian | Isi | Sumber | Publik? |
|---|---|---|---|
| Identitas | Nama lengkap, nama singkat, logo, foto sampul | Profil SSB | ya |
| Lokasi | Kota, provinsi, alamat, peta | Profil SSB | ya |
| Kontak | WhatsApp, telepon, email domain akademi | Profil SSB | ya |
| Program | Daftar program (mis. KU-8, KU-10), rentang usia, jadwal latihan | Data KU dan sesi latihan | ya |
| Fasilitas | Lapangan, alamat latihan, foto | Lokasi dan unggahan | ya |
| Tim | Nama pelatih dan korlas, foto, lisensi bila ada | Anggota SSB | ya, setelah disetujui anggota |
| Galeri | Foto latihan dan pemain | Unggahan | ya, hanya yang ditandai terbit |
| Pendaftaran | Langkah pendaftaran, tombol ke daftar akun | Konten statis | ya |
| Prestasi | Turnamen, piala, capaian | Konten statis | ya |
| Jadwal dan SPP | Jadwal latihan, tarif SPP | Data SSB | opsional per SSB |

Batas yang jelas: halaman profil tidak memuat nama pemain, foto pemain, absensi, nilai, rapor, atau tagihan. Data pemain tidak pernah tampil publik, apa pun pengaturan SSB. Nama pelatih hanya tampil bila anggota yang bersangkutan menyetujui lewat kolom publik untuk anggota.

## Data

Tabel baru:

- `ssb_profile`: `ssb_id` (PK, FK ke `ssb`), `tagline`, `deskripsi`, `alamat`, `telepon`, `email_publik`, `logo_path`, `cover_path`, `program_summary`, `pendaftaran_url`, `terbit` (boolean), `dibuat_pada`, `diperbarui_pada`.
- `ssb_domain`: `ssb_id` (PK, FK ke `ssb`), `domain` (unik, huruf kecil), `diverifikasi_at`. Kosong berarti belum ada domain sendiri.
- `ssb_gallery`: `id`, `ssb_id`, `path`, `keterangan`, `urutan`, `terbit`. Menunjuk berkas pada penyimpanan yang sama dengan foto pemain, dengan aturan privat yang sama.

Penanda `terbit` ada karena admin SSB harus memilih sendiri apa yang layak dipublikasikan. Profil yang belum terbit menjawab 404, bukan halaman kosong, supaya tidak ter-index sebagai akun kosong.

Sumber data yang sudah ada dipakai ulang, bukan disalin: program dari tabel KU dan sesi latihan, tim dari `app_user` dengan peran pelatih dan korlas, fasilitas dari `location`. Yang disimpan di `ssb_profile` hanya isi yang tidak ada di tabel lain, yaitu deskripsi, kontak, dan logo.

## Endpoint

Bagian publik di bawah `/public`, tanpa sesi, dengan cache pendek dan tanpa data pemain.

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET /public/ssb/:slug` | publik | Isi profil, program, tim, lokasi |
| `GET /public/ssb/:slug/galeri` | publik | Daftar foto yang terbit |
| `GET /public/ssb/:slug/foto/:id` | publik | Berkas foto galeri, dilewatkan lewat API |
| `GET/PUT /profile` | `profile.manage` | Profil SSB pemanggil; admin SSB menulis |
| `POST /profile/galeri` | `profile.manage` | Unggah foto galeri (JPG/PNG/WebP, maks 2 MB, sama seperti foto pemain) |
| `DELETE /profile/galeri/:id` | `profile.manage` | Hapus foto galeri |
| `POST /profile/terbit` | `profile.manage` | Terbitkan atau tarik profil |
| `GET /profile/domain` | `profile.manage` | Domain sendiri yang dikaitkan |

Izin baru: `profile.manage` untuk admin SSB. Endpoint publik tidak dijaga role karena tidak butuh sesi, tetapi dibatasi isinya: hanya data profil yang sudah ditandai terbit.

## Layar

- Publik: `/s/<slug>`. Satu halaman panjang, mobile-first, bagian demi bagian. Bagian pertama berisi nama, kota, dan tombol **Daftar** yang menuju halaman daftar akun. Nama, logo, dan warna mengikuti desain "Garuda Muda" supaya terasa milik akademi, bukan template platform.
- Admin SSB: tab **Profil** di menu, berisi editor (teks panjang, tautan, unggah logo dan sampul), pratinjau yang meniru halaman publik, dan tombol terbitkan.
- Admin SSB: tab **Galeri** untuk mengunggah, mengurutkan, dan menandai foto yang terbit.

## Domain dan email

Domain akademi seperti `familyunitedfa.com` punya dua peran: host profil dan domain email. Keduanya tidak butuh kode baru, tapi keduanya butuh DNS dan TLS. Bagian email dijelaskan di `docs/email.md`.

Kalau profil memakai domain sendiri, halamannya tetap dirender aplikasi yang sama: server membaca host, mencari `ssb_domain`, lalu merender SSB itu. Tidak ada blog statis terpisah dan tidak ada CMS yang harus disinkronkan.

## Yang belum diputuskan

- [ ] Host profil di sub-path aplikasi, subdomain, atau domain sendiri sebagai bentuk utama
- [ ] Apakah nama pelatih ditampilkan publik, dan bagaimana cara persetujuannya
- [ ] Apakah tarif SPP ditampilkan publik, dan seberapa detail
- [ ] Siapa lagi yang boleh mengedit profil selain admin SSB, misalnya operator platform
- [ ] Galeri berupa halaman penuh atau cukup strip foto
- [ ] Program disimpan manual atau diturunkan dari KU dan sesi latihan

## Di luar lingkup

- Blog dan artikel
- Formulir pendaftaran milik sendiri, karena pendaftaran tetap lewat akun supaya data masuk ke satu tempat
- Ulasan dan testimoni orang tua, karena butuh moderasi dan model datanya belum ada
- SEO multi-bahasa
