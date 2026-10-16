# Autentikasi dan otorisasi

Status: login, sesi, logout, ganti kata sandi, dan guard role sudah berjalan di `apps/api`. Undangan, reset kata sandi, dan layar web belum ada (lihat `docs/checklist.md`, bagian B).

## Model akun

Akun global: satu orang satu akun (`account`), dengan login email + kata sandi, Google, atau keduanya. Akun menjadi anggota satu atau beberapa SSB lewat `app_user` (keanggotaan: nama tampilan, kontak, role di SSB itu). Orang tua yang anaknya ada di dua SSB cukup satu akun.

Tabel `account` sengaja tanpa RLS karena dicari sebelum konteks tenant ada. Keanggotaan lintas SSB dibaca lewat konteks akun (`withAccount`), yang hanya memberi akses baca ke keanggotaan dan SSB milik akun itu. Data akun lain hanya tampil lewat join dengan keanggotaan di dalam konteks tenant.

## Alur email + kata sandi

- `POST /auth/register-ssb`: akun baru + SSB + admin pertama dalam satu transaksi, lalu login.
- `POST /auth/login`: email + kata sandi, kode SSB opsional. Satu keanggotaan langsung terpilih; bila banyak dan tanpa kode SSB, sesi belum punya SSB aktif sampai `POST /auth/select`. Semua sebab gagal menghasilkan respons yang sama dan hash tetap diverifikasi (hash tiruan bila akun tidak ada).
- `POST /auth/logout`, `GET /auth/me`, `POST /auth/select`, `POST /auth/ssb` (akun membuat SSB tambahan), `POST /auth/change-password` (mencabut sesi lain; akun yang hanya login Google boleh menambahkan kata sandi tanpa kata sandi lama).
- `GET /users`: contoh endpoint khusus `admin_ssb`.

## Login dan daftar dengan Google

Authorization code + PKCE, validasi ID token (tanda tangan lewat JWKS Google, penerbit, audience, kedaluwarsa, nonce). Status alur disimpan di cookie bertanda tangan (`oauth_tx`, 10 menit).

- `GET /auth/google/start?intent=login`, `intent=register&ssbName=...&slug=...`, atau `intent=invite&invite=<token>`.
- `GET /auth/google/callback`: setelah selesai, mengalihkan ke `WEB_URL/?login=ok` atau `WEB_URL/?error=<kode>`.
- Akun dicari lewat `sub` Google. Email dipercaya hanya bila `email_verified`. Email yang sudah dipakai akun kata sandi tidak ditautkan otomatis (`email_sudah_terdaftar`); tautan manual belum dibuat.
- Login Google untuk akun yang belum ada ditolak (`akun_belum_terdaftar`); akun baru dibuat hanya lewat daftar SSB atau undangan.
- Tanpa `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, endpoint Google mengembalikan 501.

### Menyiapkan Google

1. Di Google Cloud Console buat project, atur layar persetujuan OAuth, lalu buat OAuth client ID bertipe Web application.
2. Tambahkan redirect URI: `<PUBLIC_API_URL>/auth/google/callback` (lokal: `http://localhost:3000/auth/google/callback`).
3. Isi env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` (minimal 32 karakter acak), `PUBLIC_API_URL`, `WEB_URL`.
4. Selama aplikasi berstatus "Testing", hanya pengguna uji yang terdaftar yang bisa masuk; publikasikan sebelum dipakai umum. Syarat Google bisa berubah, jadi cek dokumentasinya.

## Undangan

Admin SSB membuat undangan (`POST /invitations`) untuk role pelatih, korlas, atau orang tua; untuk orang tua bisa menyertakan `playerId` agar langsung terhubung ke pemain. Token berbentuk `<ssb_id>.<rahasia>`, hanya hash rahasia yang disimpan, berlaku 7 hari, dan sekali pakai (penerimaan atomik). Token ditampilkan sekali saat dibuat.

- `GET /invitations/:token`: pratinjau publik (nama SSB, role, masa berlaku).
- `POST /invitations/:token/accept`: akun yang sedang login langsung bergabung; selain itu body `{name, email, password}` membuat akun baru. Email yang sudah terdaftar mendapat 409 dan diminta masuk dulu.
- Lewat Google: `intent=invite`.

## Sesi

- Token acak 256 bit di cookie `ssb_session` (HttpOnly, SameSite=Lax, Secure di produksi, 7 hari). Database hanya menyimpan hash SHA-256 token. Sesi milik akun; SSB aktif (`ssb_id`, `user_id`) diisi saat login atau `POST /auth/select`.
- `ssb_id` selalu berasal dari sesi di server. Header atau query `ssbId` dari klien diabaikan (ada test).
- Kata sandi memakai argon2id bawaan Bun, tanpa modul native.

## Otorisasi

`requireAccount` butuh sesi login; `requireMember` butuh SSB aktif; `requireRole(...)` menolak role yang tidak berhak (403). RLS di database tetap menjadi lapisan kedua.

## Belum ada

Pembatasan laju login, reset kata sandi lewat email, tautan manual Google, penghapusan akun, CORS untuk web di origin berbeda, matriks izin per endpoint.
