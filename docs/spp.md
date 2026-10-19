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
| `POST /invoices/:id/void` | `fee.manage` | Batalkan tagihan yang salah; ditolak bila sudah ada pembayaran (hapus pembayarannya dulu). |

## Layar

- Admin: menu **SPP**. Ringkasan bulan, pembuatan tagihan, daftar tagihan bersaring (belum lunas, menunggak, lunas) dengan pencatatan pembayaran, dan tarif per KU.
- Orang tua: menu **SPP**. Sisa yang harus dibayar, tagihan per anak, dan riwayat pembayaran. Pembayaran dilakukan langsung ke SSB.
- Pelatih dan korlas tidak punya akses ke data keuangan.

## Belum ada

Pembayaran online, pengingat jatuh tempo lewat WhatsApp, diskon atau beasiswa per pemain, tarif berbeda per pemain, bukti pembayaran (foto), ekspor laporan, dan pembukuan.
