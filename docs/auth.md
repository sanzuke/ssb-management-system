# Autentikasi dan otorisasi

Status: login, sesi, logout, ganti kata sandi, dan guard role sudah berjalan di `apps/api`. Undangan, reset kata sandi, dan layar web belum ada (lihat `docs/checklist.md`, bagian B).

## Model akun (sementara)

Akun per SSB. Login memakai kode SSB (slug), email, dan kata sandi. Kode SSB dicari di `ssb_directory`, lalu pengguna dicari dalam konteks tenant itu. Konsekuensinya, orang tua yang anaknya ada di dua SSB punya dua akun. Keputusan akun global masih terbuka.

## Alur

- `POST /auth/register-ssb`: membuat SSB, kode SSB, dan admin pertama dalam satu transaksi, lalu login.
- `POST /auth/login`: kode SSB + email + kata sandi. Semua sebab gagal menghasilkan respons yang sama, dan hash tetap diverifikasi (hash tiruan bila akun tidak ada) agar waktu respons tidak membocorkan akun.
- `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` (mencabut sesi lain).
- `GET /users`: contoh endpoint khusus `admin_ssb`.

## Sesi

- Token acak 256 bit di cookie `ssb_session` (HttpOnly, SameSite=Lax, Secure di produksi, 7 hari). Database hanya menyimpan hash SHA-256 token.
- `ssb_id` selalu berasal dari sesi di server. Header atau query `ssbId` dari klien diabaikan (ada test).
- Kata sandi memakai argon2id bawaan Bun, tanpa modul native.

## Otorisasi

`requireAuth` menolak tanpa sesi (401). `requireRole(...)` menolak role yang tidak berhak (403). RLS di database tetap menjadi lapisan kedua: bahkan bila guard salah pasang, data SSB lain tidak terbaca.

## Belum ada

Pembatasan laju login, reset kata sandi, undangan pengguna, CORS untuk web di origin berbeda, matriks izin per endpoint.
