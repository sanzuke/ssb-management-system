# Aplikasi mobile untuk pelatih dan orang tua

Rancangan jalur mobile: apa yang dipakai pelatih di lapangan dan orang tua di rumah, dan bagaimana aplikasinya dibangun dari kode web yang sudah ada.

Status: rancangan. Belum ada implementasi.

## Prinsip

- **Satu basis kode, dua jalan keluar.** Peta web SolidStart yang sekarang sudah mobile-first dan bisa dipasang di layar HP. Aplikasi native adalah kemasan di atas kode itu, bukan penulisan ulang.
- **API yang sama.** Semua logika bisnis sudah di backend Hono, jadi aplikasi native memakai endpoint yang sama dengan web. Tidak ada API khusus aplikasi.
- **Pengguna sulit dari lapangan.** Pelatih berdiri di lapangan, satu tangan memegang HP, sinyal tidak selalu bagus. Apa pun yang menambah langkah di lapangan akan gagal dipakai.
- **Orang tua tidak akan membuka aplikasi tiap hari.** Notifikasi harus bekerja, dan isi aplikasi harus bisa dibaca tanpa login ulang.

## Bentuk: PWA dulu, native menyusul

Tiga pilihan:

| Opsi | Cara kerja | Cocok untuk | Risiko |
|---|---|---|---|
| PWA sekarang | Tambah manifest, service worker, dan ikon; pasang lewat "Tambahkan ke layar utama" | Cepat, tanpa toko aplikasi | Push di iOS baru bekerja setelah dipasang ke layar utama (iOS 16.4+) |
| Capacitor | Membungkus PWA yang sama dalam WebView, lalu dikirim ke Play Store dan App Store | Cepat sampai ke toko tanpa menulis ulang | Rasa native masih sedang, mode offline tetap sulit |
| Flutter | Basis kode baru, UI native penuh | Offline penuh dan rasa native | Dua basis kode, biaya upkeep dua kali |

Urutan yang mengusulkan: PWA di fase 2 awal, lalu Capacitor untuk versi toko aplikasi, dan Flutter hanya kalau mode offline terbukti dibutuhkan.

Alasan PWA lebih dulu: sebagian besar kebutuhan pelatih sudah terpenuhi web yang mobile-first. Absensi sekali ketuk, input skor sentuh, dan rapor PDF sudah ada. Yang belum ada hanya pemasangan ke layar HP, notifikasi push, dan mode offline. PWA menutup dua dari tiga itu dengan biaya paling kecil.

Push di PWA: Chrome Android mendukung Web Push penuh. iOS Safari hanya bisa setelah aplikasi dipasang ke layar utama (iOS 16.4+). Jadi notifikasi orang tua di iOS tetap rapuh kalau hanya PWA. Ini salah satu alasan kuat untuk turun ke Capacitor.

## Kebutuhan per pengguna

### Pelatih

| Kebutuhan | Alur | Layar saat ini | Yang perlu |
|---|---|---|---|
| Absensi cepat | Buka sesi hari ini, tandai status satu ketuk per pemain | Sudah ada di `/absensi/[id]` | PWA, shortcut "absensi hari ini", dan simpan draft lokal |
| Scan QR kartu | Kamera, pindai kartu, absensi otomatis | Belum ada | Kamera browser sudah cukup untuk web; native memberi lebih baik |
| Input nilai | Skor 1-10 per indikator, tombol besar | Sudah ada di `/nilai/[id]` | PWA, dan cache indikator agar bisa dibuka tanpa sinyal |
| Jadwal hari ini | Daftar sesi dan lokasi | Sudah ada di `/jadwal` | Widget layar utama: sesi berikutnya |
| Catatan cepat | Foto dan catatan per pemain | Sebagian | Entri baru, masuk riwayat pemain |
| RingkasanKU | Kehadiran, pemain yang perlu perhatian | Sebagian | Layar ringkas per KU |

### Orang tua

| Kebutuhan | Alur | Layar saat ini | Yang perlu |
|---|---|---|---|
| Rapor terbaru | Buka, baca ringkasan dan grafik | Sudah ada di portal | Notifikasi push saat rapor terbit |
| Jadwal | Jadwal latihan berikutnya | Sudah ada | Notifikasi push saat jadwal berubah |
| Kehadiran | Persentase hadir, sesi terakhir | Sudah ada | Ringkasan mingguan |
| Izin | Ajukan izin tidak hadir | Belum ada | Formulir izin yang masuk ke daftar tugas admin |
| Tagihan | Tagihan SPP dan status bayar | Sudah ada (fase 2) | Notifikasi push saat tagihan terbit dan jatuh tempo |
| Absen QR | Scan kartu anak untuk absen sendiri | Belum ada | Opsi untuk orang tua, untuk SSB yang punya kebijakan begitu |

Notifikasi yang masuk daftar: jadwal berubah atau dibatalkan, rapor terbit, tagihan baru, tagihan mendekati jatuh tempo, dan permintaan izin dari orang tua. Satu notifikasi dikirim paling banyak satu kali per peristiwa, dan bisa diklik langsung ke layar yang relevan.

## Arsitektur

```
PWA (SolidStart)  ─┐
                    ├─ HTTPS ─→ Hono API ─→ PostgreSQL (RLS)
Capacitor (native) ┘                    └─→ Object storage (foto)
```

Semua CLIENT Dorado memakai API yang sama. Perbedaan native hanya pada lapisan presentasi dan pada bridge untuk push, kamera, dan penyimpanan lokal.

### Notifikasi push

- Token perangkat disimpan di tabel baru `push_subscription` (per akun, per perangkat, dengan kunci publik yang dibuat browser atau OS).
- Server mengirim lewat FCM (Android, gratis) dan APNs (iOS, perlu akun developer Apple, 99 USD/tahun).
-endpoint Push berada di luar API utama, agar kegagalan push tidak mengganggu alur bisnis.
- Notifikasi untuk orang tua dan pelatih dikirim berdasarkan langganan perangkat, dengan satupreferensi per jenis notifikasi per pengguna.

## Mode offline

Ini bagian yang paling mahal dan belum diputuskan. Yang dibutuhkan pelatih di lapangan: menulis absensi dan nilai tanpa sinyal, lalu tersinkron saat sinyal kembali.

Syarat minimum:

- Antrean perubahan di perangkat (IndexedDB untuk PWA, SQLite untuk native), dengan setiap perubahan punya id idempoten.
- Konflik: satu perubahan untuk satu absensi atau satu nilai. Sifatnya overwrite, bukan merge, dan jejak perubahan di server tetap mencatat nilai lama.
- Sinkron: antrean dikirim per entitas, bukan sekali jalan, supaya satu konflik tidak memblokir sisanya.
- Status terlihat: pengguna harus tahu apa yang sudah tersinkron dan apa yang masih tertunda, supaya tidak mengira datanya sudah aman.

Kapacitor belum menyelesaikan mode offline dengan baik karena WebView masih bergantung pada jaringan untuk hal tertentu. Kalau offline penuh jadi prioritas, Flutter lebih aman. Ini alasan kenapa keputusan bentuk aplikasi tidak dikunci sekarang.

## Struktur kerja

| Tahap | Isi | Keluaran |
|---|---|---|
| PWA dasar | Manifest, service worker, ikon, mode standalone, tombol pasang | Bisa dipasang di layar HP, tampil seperti aplikasi |
| PWA notifikasi | Web Push untuk Chrome Android, layar langganan, pengaturan notifikasi | Notifikasi sampai di Android |
| Toko aplikasi | Capacitor, build pipeline, listing toko, deep link | Aplikasi di Play Store dan App Store |
| Native lengkap | Peringatan native, kamera native, widget, mode offline | Pengalaman native penuh |
| Offline penuh | Antrean lokal dan sinkron, aturan konflik | Absensi dan nilai tersimpan tanpa sinyal |

Risiko: Capacitor menambah satu lapisan build (Android Studio, Xcode, penandatanganan sertifikat) yang belum ada di repo. Perkiraan menambah 2 sampai 3 hari setup, dan tiap rilis store punya proses review.

## Yang belum diputuskan

- [ ] PWA dulu, atau langsung aplikasi native
- [ ] Capacitor atau Flutter, kalau native diputuskan
- [ ] Apakah orang tua boleh absen sendiri lewat QR, atau hanya Orquesta
- [ ] Apakah push memakai FCM saja, atau juga layanan lain seperti OneSignal (memerlukan langganan)
- [ ] Kapan mode offline dianggap wajib, bukan bonus
- [ ] Apakah admin SSB boleh mengirim pengumuman lewat push ke semua anggotanya
- [ ] Bahasa aplikasi: Indonesia saja, atau perlu Inggris

## Di luar lingkup

- Aplikasi untuk admin SSB dengan pembukuan lengkap
- Video streaming dan analisis video (fase 4)
- Chatting antar pelatih dan orang tua
- Aplikasi khusus orang tua yang terpisah dari portal web
