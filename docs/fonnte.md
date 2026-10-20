# Pengiriman WhatsApp otomatis (Fonnte)

Pengingat tagihan SPP bisa dikirim langsung dari server lewat **Fonnte** (WhatsApp Business API). Admin cukup menempelkan token API Fonnte sekali di tab **SPP > Pengaturan**; setelah itu tombol **Kirim otomatis** di tab **Pengingat** mengirim pesan tanpa perlu membuka WhatsApp.

Dokumentasi Fonnte: <https://docs.fonnte.com/api-send-message/>

## Cara memakai

1. Daftar di <https://fonnte.com>, lalu hubungkan WhatsApp yang dipakai SSB (Device > Tambah Device, pindai QR).
2. Ambil token API: di Fonnte, **Device > device Anda > Edit > Token** (token disalin otomatis).
3. Di SSB App, buka **SPP > Pengaturan > Pengiriman WhatsApp (Fonnte)**, tempel token, lalu tekan **Simpan pengaturan**.
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
