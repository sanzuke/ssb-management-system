# Landing page akademi (company profile)

Situs publik untuk sebuah SSB: identitas akademi, program, tim, fasilitas, galeri, dan pendaftaran trial. Situs ini **berdiri sendiri**, terpisah dari SSB MS, tetapi seluruh isinya diatur dari SSB MS.

Status: rancangan. Desain dari tim ada di https://github.com/sanzuke/ssb-family-united (React + Vite + Tailwind, data masih tertulis di kode).

## Keputusan

- Landing dan SSB MS dipisah. Landing adalah situs statis di domain akademi (mis. `familyunitedfa.com`); SSB MS tetap di domainnya sendiri.
- Konten disunting admin SSB di SSB MS (tab **Konten situs**), lalu **Terbitkan**. Landing hanya membaca versi yang terbit lewat API publik.
- Tiap akademi punya satu landing di satu domain. Banyak akademi berarti banyak landing, dengan pola yang sama.

Alasan: tampilan landing (gelap, merah, amber) berbeda dari aplikasi (Garuda Muda) dan bisa berubah tanpa menyentuh aplikasi; deploy mandiri sehingga landing tidak bisa menjatuhkan login, absensi, atau SPP; halaman statis lebih cepat dan terbaca mesin pencari. Harganya: dua hal yang di-deploy dan satu kontrak API yang harus stabil, jadi bentuk respons didefinisikan dengan Zod di `packages/shared` dan dipakai kedua sisi.

```mermaid
flowchart LR
  A["Admin SSB<br/>tab Konten situs"] -->|simpan draf, lalu Terbitkan| B[("PostgreSQL<br/>konten situs, galeri")]
  B --> C["GET /public/site/:slug<br/>hanya versi terbit"]
  C --> D["Landing statis<br/>dibangun ulang saat terbit"]
  D -->|form trial| E["POST /public/trial<br/>batas laju"]
  E --> F["Kotak masuk Pendaftar<br/>di SSB MS"]
```

## Batas data

Landing tidak pernah memuat nama pemain, foto pemain, absensi, nilai, rapor, atau tagihan. Nama pelatih hanya tampil bila anggota yang bersangkutan menyetujui. Yang tampil hanya yang admin tandai terbit; konten yang belum terbit menjawab 404.

## Konten dan data

Satu dokumen JSON per SSB (kolom `jsonb`), dengan dua salinan: draf dan terbit. Bagian landing berubah-ubah, dan dokumen menghindari migrasi tiap ada bagian baru. Bentuknya divalidasi Zod.

| Bagian | Isi | Sumber |
|---|---|---|
| Identitas dan kontak | Nama, motto, logo, alamat, telepon, email, WhatsApp | Konten situs |
| Hero | Judul, teks, tombol, foto | Konten situs |
| Angka ringkasan | Pemain aktif, alumni, persen beasiswa | Konten situs (pemain aktif bisa dihitung dari data) |
| Yayasan dan beasiswa | Cerita, syarat | Konten situs |
| Program | Nama, rentang usia, jadwal, kurikulum, biaya tampil | KU dan jadwal latihan, teks ditimpa admin |
| Pelatih | Nama, lisensi, pengalaman, foto | Anggota yang setuju tampil |
| Fasilitas | Lapangan, alamat, foto | Lokasi latihan, teks ditimpa admin |
| Pertandingan | Jadwal dan hasil | Daftar manual (event masuk fase 2) |
| Testimoni | Kutipan, nama | Konten situs |
| Galeri | Foto | Unggahan, satu jalur baca publik khusus galeri |

Semua teks punya kolom ID dan EN. Tabel baru:

- `site_content`: `ssb_id` (PK, FK ke `ssb`), `draft` (jsonb), `published` (jsonb), `published_at`, `published_by`, `updated_at`. RLS per SSB.
- `site_gallery`: `id`, `ssb_id`, `path`, `caption`, `sort`, `published`. Foto memakai penyimpanan yang sama dengan foto pemain, tetapi jalur baca publiknya hanya untuk galeri.
- `site_domain`: `ssb_id`, `domain` (unik), `verified_at`. Memetakan domain ke SSB untuk API publik.
- `trial_registration`: `id`, `ssb_id`, data anak dan orang tua, program pilihan, ajukan beasiswa, catatan, `status` (baru, dihubungi, diterima, ditolak), `created_at`. RLS per SSB.

## Endpoint

Bagian publik tanpa sesi, dengan cache pendek.

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET /public/site/:slug` | publik | Konten terbit, program, pelatih yang setuju, fasilitas |
| `GET /public/site/:slug/gallery/:id` | publik | Berkas foto galeri |
| `POST /public/trial` | publik, batas laju | Pendaftaran trial; kolom jebakan bot |
| `GET/PUT /site` | `site.manage` | Baca dan simpan draf |
| `POST /site/publish` | `site.manage` | Terbitkan draf, memicu build landing |
| `POST/DELETE /site/gallery` | `site.manage` | Unggah dan hapus foto galeri |
| `GET /trials`, `PATCH /trials/:id` | `trial.manage` | Kotak masuk pendaftar dan ubah status |

Izin baru: `site.manage` dan `trial.manage` (admin SSB).

## Layar di SSB MS

- **Konten situs:** editor per bagian, bahasa ID dan EN, pratinjau draf, tombol Terbitkan, dan penanda perubahan yang belum terbit.
- **Galeri:** unggah, urutkan, tandai terbit.
- **Pendaftar:** daftar trial dengan status, tombol hubungi lewat WhatsApp, dan ubah menjadi undangan orang tua.

## Landing dan build

Landing memakai desain tim (`ssb-family-united`). Saat **Terbitkan**, server menjalankan build yang mengambil konten dari API dan menghasilkan HTML statis (sekitar 10 detik), disajikan Nginx. Mengambil data di browser pengunjung tidak dipakai karena mesin pencari tidak membaca konten yang dimuat sesudah halaman terbuka.

Perbaikan yang diperlukan pada desain apa adanya: foto ikut ter-build (path sekarang berupa teks `/src/assets/...` sehingga hilang di produksi), formulir trial tersambung ke `POST /public/trial`, data contoh diganti konten asli, dan foto pertandingan berkostum klub lain diganti foto milik akademi.

## Domain

`familyunitedfa.com` dikelola di Domainesia dan sudah mengarah ke server landing. Email domain ini dilayani mail server di zukelabs (lihat `docs/email.md`), jadi record MX, SPF, DKIM, dan DMARC di Domainesia harus menunjuk ke sana.

## Yang belum diputuskan

- [ ] Apakah nama pelatih ditampilkan publik, dan bagaimana persetujuannya
- [ ] Apakah biaya SPP ditampilkan publik
- [ ] Isi asli untuk klaim di desain (jumlah pemain, persen beasiswa, lisensi pelatih, alamat, email)
- [ ] Apakah tab Mobile App di desain tim dipertahankan di landing, atau dipindah ke `docs/mobile.md`
- [ ] Apakah SSB MS ikut dipindah ke server baru, atau tetap di zukelabs

## Di luar lingkup

- Blog dan artikel
- Ulasan orang tua yang butuh moderasi
- Banyak akademi dalam satu landing
