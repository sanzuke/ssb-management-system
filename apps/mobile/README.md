# SSB App (aplikasi mobile)

Aplikasi Flutter untuk pelatih/korlas dan orang tua. Admin tetap memakai web. Rancangan, peta layar, dan tahapan: `docs/mobile-rancangan.md`. Izin ditegakkan server (`docs/izin.md`); aplikasi hanya memilih tab menurut role.

## Prasyarat

- Flutter SDK (Dart `^3.13`), Android SDK (compileSdk 36, minSdk 24) untuk Android, Xcode untuk iOS (hanya di macOS).
- API berjalan (`bun apps/api/src/index.ts`, port 3000 bawaan) atau alamat API produksi.
- Akun contoh lokal (kata sandi `ContohSSB-2026`): `korlas@`, `budi@`, `sari@`, `ortu01@` s.d. `ortu23@` dengan domain `@familyunitedfa.com`.

## Alamat server (`--dart-define`)

| Variabel | Fungsi | Bawaan |
|---|---|---|
| `API_URL` | Alamat API | Rilis: `https://app.familyunitedfa.com/api` (produksi, server fufa). Debug Android: `http://10.0.2.2:3000` (emulator ke mesin host); debug lainnya `http://localhost:3000` |
| `WEB_URL` | Alamat web untuk "Lupa kata sandi" dan "Punya tautan undangan" | `https://app.familyunitedfa.com` |

Rilis wajib HTTPS: `usesCleartextTraffic` hanya ada di manifest debug Android, dan iOS hanya mengizinkan HTTP ke jaringan lokal (`NSAllowsLocalNetworking`).

`flutter build apk --release` tanpa flag sudah mengarah ke produksi. `ssb-ms.zukelabs.web.id` melayani backend yang sama (satu server dan satu database), jadi tidak ada lingkungan staging terpisah. Untuk mencoba tanpa menyentuh data produksi, jalankan API lokal dan beri `--dart-define=API_URL=http://<ip-komputer>:3000`.

```
flutter run --release   # produksi; tambahkan --dart-define=API_URL=... untuk alamat lain
```

Ponsel fisik tidak bisa memakai `10.0.2.2`; pakai alamat IP komputer di jaringan yang sama atau alamat produksi.

## Perintah

Jalankan dari `apps/mobile`.

```
flutter pub get
flutter analyze
flutter test
flutter run --dart-define=API_URL=...
flutter build apk --release --dart-define=API_URL=... --dart-define=WEB_URL=...
flutter build appbundle --release --dart-define=API_URL=...   # Play Store
flutter build ipa --release --dart-define=API_URL=...         # macOS, App Store/TestFlight
```

Catatan Windows: di shell bash agen, jalankan Flutter lewat PowerShell: `powershell -NoProfile -Command "& 'C:\Users\<nama>\flutter\bin\flutter.bat' <argumen>"`.

Ikon dan splash dibuat dari `assets/branding/icon.png` (salinan `apps/web/public/icon-512.png`). Setelah mengganti gambar:

```
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

Warna latar ikon adaptif dan splash (`#1B6B3A`) sama dengan seed tema di `lib/app.dart`.

## Login

- Email + kata sandi: `POST /auth/token`.
- Google: tombol "Masuk dengan Google" membuka `${API_URL}/auth/google/start?intent=login&mobile=1` di browser. Setelah selesai, API mengalihkan ke `ssbapp://auth?code=<kode sekali pakai>` (atau `?error=<kode>`), aplikasi menukarnya lewat `POST /auth/mobile-exchange`. Server Google harus sudah dikonfigurasi (`docs/auth.md`); tanpa itu API menjawab 501.
- Skema tautan `ssbapp` didaftarkan di `AndroidManifest.xml` (intent-filter) dan `Info.plist` (`CFBundleURLTypes`). Penanganan tautan bawaan Flutter dimatikan (`flutter_deeplinking_enabled` / `FlutterDeepLinkingEnabled`) karena tautan ini diproses `app_links`, bukan router.
- Uji tautan di emulator Android: `adb shell am start -a android.intent.action.VIEW -d "ssbapp://auth?error=akun_belum_terdaftar"`.
- Undangan dan lupa kata sandi dilanjutkan di web (`WEB_URL/undangan/<token>`, `WEB_URL/lupa-sandi`).

## Push notification (Firebase Cloud Messaging)

Tanpa konfigurasi Firebase aplikasi tetap terbangun dan berjalan normal; push mati diam-diam (saklar Notifikasi di Akun menampilkan "Belum tersedia di versi aplikasi ini").

1. Buat project di Firebase Console, tambahkan app Android `id.familyunitedfa.ssb_mobile` dan app iOS `id.familyunitedfa.ssbMobile` (iOS tidak boleh memakai garis bawah).
2. Android: unduh `google-services.json` ke `android/app/google-services.json`. Plugin Gradle `com.google.gms.google-services` hanya dipasang bila berkas itu ada (`android/app/build.gradle.kts`).
3. iOS: unduh `GoogleService-Info.plist`, tambahkan ke target Runner lewat Xcode (centang "Copy items if needed"; harus masuk grup Runner dan target Runner).
4. iOS: di Apple Developer buat APNs Authentication Key (`.p8`), unggah ke Firebase Console > Project settings > Cloud Messaging. Di Xcode, target Runner > Signing & Capabilities harus menunjukkan Push Notifications dan Background Modes > Remote notifications. Berkas `ios/Runner/Runner.entitlements` dan `UIBackgroundModes` sudah ada di proyek dan `project.pbxproj` merujuknya; bila Xcode tidak menampilkannya, tambahkan kapabilitasnya sekali secara manual.
5. Server mengirim lewat FCM HTTP v1 (akun layanan diatur di sisi API). Pesan membawa `data.route` yang diterima aplikasi hanya bila berbentuk `/?tab=<hari-ini|siswa|jadwal|beranda|anak|tagihan|akun>`, `/absensi/<id>`, atau `/siswa/<id>/rapor`.
6. Berkas konfigurasi dikecualikan dari git (`.gitignore`); sediakan di mesin build/CI.

Perangkat didaftarkan (`POST /push/devices`) saat akun siap, dan dicabut (`DELETE /push/devices`) saat keluar. Izin notifikasi diminta pertama kali setelah masuk, bukan saat aplikasi dibuka. Notifikasi yang tiba saat aplikasi terbuka tampil sebagai pesan singkat dengan tombol "Buka".

## Penandatanganan Android

Tanpa `android/key.properties` build rilis memakai kunci debug (cukup untuk uji, tidak untuk Play Store). Untuk rilis:

```
keytool -genkey -v -keystore android/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Buat `android/key.properties` (jangan di-commit; `key.properties` dan `*.jks` ada di `.gitignore`):

```
storeFile=upload-keystore.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` relatif terhadap folder `android/`. Simpan keystore dan sandinya di tempat aman; kehilangannya menutup jalur pembaruan di Play Store (kecuali memakai Play App Signing).

## Penandatanganan iOS

Atur Team dan profil di Xcode (Runner > Signing & Capabilities) lalu `flutter build ipa`. Bundle ID `id.familyunitedfa.ssbMobile`. `aps-environment` di entitlements bernilai `development`; Xcode menggantinya dengan `production` untuk arsip distribusi.

## Yang sudah diverifikasi dan yang belum

Diverifikasi di mesin pengembangan: `flutter analyze`, `flutter test` (sesi, login Google, validasi rute notifikasi), `flutter build apk --debug`.

Belum diuji di perangkat (butuh perangkat/akun nyata): penerimaan push FCM dan APNs, ketukan notifikasi dari kondisi mati, izin notifikasi Android 13+/iOS, tautan balik `ssbapp://` dari browser setelah login Google sungguhan, build dan arsip iOS (tidak ada macOS), kapabilitas Push di Xcode, penandatanganan rilis dengan keystore asli, Play Store/TestFlight.
