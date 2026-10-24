# Status dan rencana lanjut

Diperbarui 24 Oktober 2026 (akhir hari). Alur kerja: langsung ke `main`, tanpa cabang/PR, sampai pemilik menyatakan proyek matang.

## Selesai hari ini

- Artikel/berita live di SSB MS (`/artikel`) dan landing (`/berita`), HTML SEO dari API, sitemap. Commit `f265fcb`, `b15de0b`.
- Editor visual Tiptap di halaman tulis artikel (mode Visual, Markdown, Pratinjau; gambar; tautan). Commit `ea26ba2`. Dideploy ke `app.familyunitedfa.com` dan diuji di produksi lewat API dan halaman SEO.
- Uji model gratis untuk subagen, hasil di `docs/model-gratis.md` (Kimi K2.6 terbaik; GLM-4.7-flash hanya untuk baca kode; Qwen3-Coder gratis dan DeepSeek di Kilo tidak tersedia).

## Kondisi sekarang

- Produksi: server `fufa` (`124.156.192.17`), commit `ea26ba2`; tidak ada artikel terbit.
- Agen `task` disetel ke `kilo/moonshotai/kimi-k2.6:free` hanya untuk sesi (belum disimpan); bawaan kembali saat sesi baru.
- Belum di-commit sengaja: `docs/logo.png`, `.claude/`; `docs/Lencana Elang Football Club Transparan.png` terhapus di folder kerja (bukan oleh agen).

## Belum diuji

- Editor visual di browser produksi (hanya API dan SEO yang diuji di sana).
- Editor pada artikel lama dengan gambar di produksi; artikel dengan teks bercampur gaya tanpa spasi (`halo**dunia**`).

## Rencana besok

1. Coba editor di `https://app.familyunitedfa.com/artikel/baru`: tulis artikel sungguhan, unggah sampul dan gambar, terbitkan, cek `/berita`.
2. Daftarkan `https://familyunitedfa.com/sitemap.xml` di Google Search Console (tindakan pemilik).
3. Isi konten asli landing lewat `/situs` (sekarang konten awal seed).
4. Uji model gratis lain bila perlu (Nemotron, MiniMax M3, Laguna, GLM 5.2, Gemma 4) dan putuskan menyimpan bawaan agen `task`.

## Tindakan pemilik yang tertunda

- Record Brevo (domain authentication) dan PTR; ganti CNAME `mail` menjadi A di Domainesia.
- Deploy key repo landing `ssb-family-united`.
- Ganti kata sandi contoh `ContohSSB-2026` dan kuatkan SSH server (kata sandi `ubuntu`, login sandi).
- Cadangan `pg_dump` terjadwal (ditunda sampai keluar dari tahap penjajakan).
