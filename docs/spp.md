# SPP (fase 2, tahap 1)

Tagihan SPP bulanan dengan **pembayaran dicatat manual oleh admin**. Pembayaran online (QRIS atau virtual account), pengingat WhatsApp otomatis, dan pembukuan menyusul sesuai `docs/rancangan.md`.

## Model data

- `age_group.monthly_fee`: tarif per bulan (rupiah) tiap KU. Kosong berarti pemain KU itu tidak ditagih.
- `invoice`: satu tagihan per pemain per bulan (unik; `month` selalu tanggal 1). Jumlahnya adalah tarif saat tagihan dibuat, jadi mengubah tarif tidak mengubah tagihan lama. Dibatalkan lewat `voided_at`.
- `payment`: pembayaran terhadap satu tagihan, boleh dicicil (`amount`, `paid_on`, cara bayar, catatan, pencatat).

Status tidak disimpan, tetapi dihitung dari pembayaran: `belum`, `sebagian`, `lunas`, `dibatalkan`. "Menunggak" berarti belum lunas dan lewat jatuh tempo (tanggal menurut WIB). Semua tabel memakai RLS per SSB seperti tabel lain.

## Endpoint

| Endpoint | Izin | Fungsi |
|---|---|---|
| `GET/PUT /fees/rates` | `fee.manage` | Tarif tiap KU. PUT atomik: bila ada KU asing, tidak ada yang berubah (422). |
| `POST /invoices/generate` | `fee.manage` | `{ month: "YYYY-MM", dueDay }`: tagihan untuk semua pemain **aktif** di KU bertarif. Aman diulang (yang sudah ada dilewati). Hasil: `created`, `existing`, `withoutRate`. |
| `GET /invoices?month=&playerId=` | `invoice.read` | Daftar tagihan beserta riwayat pembayaran. Orang tua hanya melihat tagihan anaknya. |
| `GET /fees/summary?month=` | `fee.manage` | Ditagih, dibayar, sisa, jumlah menunggak. |
| `POST /invoices/:id/payments` | `fee.manage` | Catat pembayaran. Ditolak bila melebihi sisa (409 `overpaid`), bertanggal masa depan, atau tagihan dibatalkan. Baris tagihan dikunci agar dua pembayaran serentak tidak melampaui sisa. |
| `DELETE /payments/:id` | `fee.manage` | Koreksi: hapus catatan pembayaran. |
| `GET /fees/reminders?days=3` | `fee.manage` | Tagihan belum lunas yang sudah lewat jatuh tempo atau jatuh tempo dalam `days` hari (0-30), terlambat paling atas, beserta nama dan WhatsApp wali. |
| `POST /invoices/:id/reminded` | `fee.manage` | Mencatat satu pengingat terkirim (`last_reminded_at`, `reminder_count`). Ditolak untuk tagihan lunas atau batal. |
| `POST /invoices/:id/void` | `fee.manage` | Batalkan tagihan yang salah; ditolak bila sudah ada pembayaran (hapus pembayarannya dulu). |

## Layar

- Admin: menu **SPP**. Ringkasan bulan, pembuatan tagihan, daftar tagihan bersaring (belum lunas, menunggak, lunas) dengan pencatatan pembayaran, dan tarif per KU.
- Admin, tab **Pengingat**: daftar tagihan menunggak dan yang segera jatuh tempo (3 atau 7 hari), isi pesan yang bisa diubah (kata {wali}, {anak}, {bulan}, {sisa}, {status}, {ssb} diisi otomatis; tersimpan di peramban), dan tombol **Kirim ke <wali>** yang membuka WhatsApp dengan pesan terisi. Admin yang menekan kirim di WhatsApp; setiap penekanan dicatat sebagai satu pengingat.
- Dasbor admin: panel **SPP bulan ini** (ditagih, dibayar, belum dibayar, persen terbayar, jumlah yang perlu diingatkan), kartu "Perlu tindakan" (tagihan bulan ini belum dibuat, SPP menunggak) yang menautkan ke tab Pengingat (`/spp?tab=pengingat`), dan pintasan Tagihan SPP.
- Orang tua: beranda menampilkan kartu peringatan bila ada tagihan belum lunas (merah bila lewat jatuh tempo).
- Orang tua: menu **SPP**. Sisa yang harus dibayar, tagihan per anak, dan riwayat pembayaran. Pembayaran dilakukan langsung ke SSB.
- Pelatih dan korlas tidak punya akses ke data keuangan.

## Belum ada

Pembayaran online, pengingat WhatsApp yang terkirim otomatis (butuh penyedia WhatsApp Business API seperti Fonnte, Twilio, atau Meta Cloud API; saat ini admin menekan kirim sendiri), notifikasi push, diskon atau beasiswa per pemain, tarif berbeda per pemain, bukti pembayaran (foto), ekspor laporan, dan pembukuan.
