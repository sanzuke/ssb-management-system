# Pengiriman WhatsApp otomatis (Fonnte)

Pengingat tagihan SPP bisa dikirim langsung dari server lewat **Fonnte** (WhatsApp Business API). Semua pengaturan Fonnte ada di menu **WhatsApp** (khusus admin SSB, `/whatsapp`), bukan di halaman SPP. Admin cukup menempelkan token API Fonnte sekali di sana; setelah itu tombol **Kirim otomatis** di **SPP > Pengingat** mengirim pesan tanpa perlu membuka WhatsApp.

Dokumentasi Fonnte: <https://docs.fonnte.com/api-send-message/>

## Cara memakai

1. Daftar di <https://fonnte.com>, lalu hubungkan WhatsApp yang dipakai SSB (Device > Tambah Device, pindai QR).
2. Ambil token API: di Fonnte, **Device > device Anda > Edit > Token** (token disalin otomatis).
3. Di SSB App, buka menu **WhatsApp > Koneksi Fonnte dan pengingat SPP**, tempel token, lalu tekan **Simpan pengaturan**.
4. Tekan **Periksa token**. Server memanggil API profil Fonnte untuk memastikan token sah dan perangkat terhubung. Keluaran menampilkan nama perangkat, status koneksi, sisa kuota, dan masa berlaku paket.
5. Opsional: kirim **pesan uji** ke nomor Anda sendiri untuk memastikan isi pesan sampai.

Nomor tujuan wali diambil dari data anggota. Nomor lokal `08...` otomatis diubah ke format internasional `62...`; kode negara bisa diubah di pengaturan untuk negara lain.

## Yang disimpan server

- Token API disimpan **terenkripsi** (AES-256-GCM) di tabel `whatsapp_setting`, dengan kunci diturunkan dari `TOKEN_SECRET` (atau `SESSION_SECRET` bila `TOKEN_SECRET` tidak diisi).
- Token tidak pernah dikirim balik ke peramban. Respons API hanya memberi tahu `hasToken: true` atau `false`.
- Menghapus token (mengirim kolom token kosong) sekaligus mematikan pengiriman otomatis.

`TOKEN_SECRET` boleh diisi terpisah dari `SESSION_SECRET`. Kalau diisi, nilainya harus minimal 32 karakter dan **tidak boleh diubah** setelah token disimpan, karena token lama tidak akan bisa didekripsi lagi.

## Endpoint

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET /whatsapp/settings` | `fee.manage` | Status pengaturan: `hasToken`, `countryCode`, `autoReminder`. |
| `PUT /whatsapp/settings` | `fee.manage` | Simpan token (terenkripsi), kode negara, dan mode otomatis. Token kosong menghapus token. |
| `POST /whatsapp/settings/check` | `fee.manage` | Periksa token: memanggil `POST https://api.fonnte.com/device`. |
| `POST /whatsapp/test` | `fee.manage` | Kirim pesan uji ke satu nomor. |
| `POST /invoices/:id/remind` | `fee.manage` | Kirim pengingat tagihan ke semua wali yang punya nomor, lalu catat `last_reminded_at` bila ada yang berhasil terkirim. |

## Batasan

- Pengiriman lewat Fonnte memakai satu perangkat WhatsApp. kuota dan masa berlaku ikut paket Fonnte.
- Token perangkat harus terhubung; kalau tidak, Fonnte menolak permintaan dan alasannya ("device disconnected") diteruskan ke admin.
- Pengiriman otomatis penuh (terjadwal, tanpa admin menekan) belum ada. Saat ini admin menekan **Kirim otomatis** per tagihan; opsi `autoReminder` disimpan untuk langkah berikutnya.
- Pengiriman hanya ke nomor WhatsApp wali. Wali tanpa nomor dilewati; bila semua wali tanpa nomor, permintaan ditolak dengan `no_whatsapp`.
- Isi pesan memakai templat yang sama dengan pengiriman manual: kata `{wali}`, `{anak}`, `{bulan}`, `{sisa}`, `{status}`, `{ssb}` diisi otomatis.

## Yang belum ada

Pengiriman otomatis terjadwal (cron harian), laporan status pengiriman per pesan, dan pengiriman melalui penyedia lain (Twilio, Meta Cloud API). Lapisan di server dibuat netral: `apps/api/src/fonnte.ts` satu-satunya bagian yang tahu Fonnte, jadi menambah penyedia lain berarti menambah satu modul serupa.

## Pesan untuk pendaftar trial (migrasi 0035, baru pengaturan)

Di bagian **Pesan untuk pendaftar trial** pada menu **WhatsApp** (tombol **Pengaturan WhatsApp** di halaman Pendaftar membukanya) tersimpan pengaturan pesan lewat Fonnte untuk pendaftar trial. Token yang dipakai sama dengan bagian koneksi di halaman yang sama; tanpa token, pengaturan tidak bisa dinyalakan (409 `no_token`), dan menghapus token mematikan semuanya.

**Yang belum ada: server belum mengirim pesan apa pun ke pendaftar.** Pengaturan ini hanya disimpan, siap dipakai saat pengiriman otomatis dipasang di `POST /public/site/:slug/trial`. Satu-satunya pengiriman nyata di layar ini adalah tombol "Kirim pesan uji ke nomor admin", yang memakai `POST /whatsapp/test`.

| Pengaturan | Kolom `whatsapp_setting` | Isi |
|---|---|---|
| Konfirmasi ke orang tua | `trial_reply_enabled`, `trial_reply_template` | Aktif atau tidak, dan templat pesan (kosong = templat bawaan di `packages/shared`, maksimal 1000 karakter) |
| Pemberitahuan ke admin | `trial_notify_enabled`, `trial_notify_number` | Aktif atau tidak, dan nomor WhatsApp admin (8 sampai 15 angka; wajib bila aktif, dijaga CHECK) |

Kata di templat: `{wali}`, `{anak}`, `{kode}`, `{ssb}` (diisi lewat `renderTrialMessage`). Kata yang tidak dikenal dibiarkan apa adanya dan layar pengaturan memberi peringatan. Templat yang sama dengan bawaan disimpan kosong supaya perubahan bawaan di versi berikut ikut berlaku.

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET /whatsapp/trial-settings` | `trial.manage` | `hasToken`, `replyEnabled`, `replyTemplate` (yang berlaku), `replyTemplateDefault`, `notifyEnabled`, `notifyNumber` |
| `PUT /whatsapp/trial-settings` | `trial.manage` | Simpan keempat pengaturan; menyalakan tanpa token ditolak (409), pemberitahuan tanpa nomor ditolak (400) |
