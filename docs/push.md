# Notifikasi push (aplikasi mobile)

Aplikasi Flutter (`apps/mobile`) menerima push lewat Firebase Cloud Messaging (FCM HTTP v1). Push bersifat tambahan; WhatsApp (`docs/fonnte.md`) tetap jalur utama untuk tagihan.

## Konfigurasi server

Isi `FCM_SERVICE_ACCOUNT` di `.env` dengan isi JSON akun layanan Firebase atau jalur ke berkasnya (peran: Firebase Cloud Messaging API Admin). Kosong berarti push tidak aktif: pengiriman dilewati dan dicatat di log, permintaan bisnis tidak terpengaruh. Token akses OAuth dibuat dari JWT RS256 (`node:crypto`) dan disimpan sampai mendekati kedaluwarsa. Perangkat yang dijawab FCM `UNREGISTERED` atau 404 dihapus otomatis.

## Konfigurasi aplikasi

1. Buat proyek Firebase, tambahkan aplikasi Android (`id.familyunitedfa.ssb_mobile`) dan iOS.
2. Taruh `google-services.json` di `apps/mobile/android/app/` dan `GoogleService-Info.plist` di `apps/mobile/ios/Runner/`. Tanpa berkas itu push mati dan aplikasi tetap berjalan (plugin Gradle Google Services hanya dipasang bila berkasnya ada).
3. iOS: unggah kunci APNs (.p8) di Firebase, aktifkan kapabilitas Push Notifications dan Background Modes di Xcode.

## Perangkat

`POST /push/devices {token, platform}` (android, ios, web) mendaftarkan perangkat akun yang sedang masuk; `DELETE /push/devices {token}` mencabutnya. Aplikasi mendaftar setelah login dan mencabut saat keluar.

## Peristiwa

Isi data tiap pesan: `{type, route}`; `route` dibuka aplikasi saat notifikasi diketuk.

| Peristiwa | Penerima | Rute |
|---|---|---|
| Jadwal dibuat, diubah, atau dihapus | Orang tua siswa di KU itu | `/?tab=jadwal` |
| Rapor diterbitkan | Orang tua siswa itu | `/siswa/<id>/rapor` |
| Tagihan SPP terbit, atau pengingat | Orang tua siswa itu | `/?tab=tagihan` |
| Orang tua mengajukan izin atau sakit | Pelatih dan korlas KU itu | `/absensi/<sesi>` |
| Latihan 30 menit lagi (interval di `index.ts`, sekali per sesi) | Pelatih dan korlas KU itu | `/absensi/<sesi>` |

## Yang belum diuji

Pengiriman nyata ke FCM dan APNs belum diuji karena butuh kredensial; tes memakai pengirim tiruan.
