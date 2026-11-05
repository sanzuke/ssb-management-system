# Integrasi Galeri Foto Artikel ke Landing Page (`ssb-family-united`)

## Prasyarat

Backend SSB MS (`ssb-ms`) sudah menyediakan field `galleryUrls` di respons API publik:

| Endpoint | Field baru |
|---|---|
| `GET /public/site/:slug/posts/:postSlug` | `galleryUrls: string[]` |
| `GET /public/site/:slug/posts` | `galleryUrls: string[]` (tiap artikel) |

File-file berikut adalah **referensi** yang perlu disalin ke repo landing `ssb-family-united` (repositori terpisah dari `ssb-ms`):

```
tools/ref/landing-carousel/
├── artikel-galeri.css   -- Styling carousel + thumbnail
├── artikel-galeri.js    -- Logika carousel (vanilla JS)
└── contoh.html          -- Contoh halaman detail artikel
```

## Langkah Integrasi

### 1. Salin file ke repo landing

Letakkan di folder aset landing, misal:

```
ssb-family-united/
├── assets/css/artikel-galeri.css
├── assets/js/artikel-galeri.js
└── pages/berita/[slug].html   (atau template yang dipakai)
```

### 2. Sertakan CSS dan JS di halaman detail artikel

```html
<link rel="stylesheet" href="/assets/css/artikel-galeri.css">
<script src="/assets/js/artikel-galeri.js"></script>
```

### 3. Buat container galeri di halaman detail artikel

Gunakan atribut data untuk inisialisasi otomatis saat `DOMContentLoaded`:

```html
<div
  id="galeri-foto"
  data-artikel-galeri
  data-cover-url="{{ artikel.coverUrl }}"
  data-cover-alt="{{ artikel.coverAlt }}"
  data-gallery-urls='{{ artikel.galleryUrls | json_encode }}'
></div>
```

Contoh respons API yang diterima landing:

```json
{
  "slug": "prestasi-u13",
  "title": { "id": "Prestasi KU-13", "en": "KU-13 Achievement" },
  "coverUrl": "https://api.ssb-ms.zukelabs.web.id/public/site/ssb/media/uuid-1",
  "coverAlt": "Pemain KU-13 bertanding",
  "galleryUrls": [
    "https://api.ssb-ms.zukelabs.web.id/public/site/ssb/media/uuid-1",
    "https://api.ssb-ms.zukelabs.web.id/public/site/ssb/media/uuid-2",
    "https://api.ssb-ms.zukelabs.web.id/public/site/ssb/media/uuid-3"
  ],
  "blocks": [...]
}
```

### 4. Atau inisialisasi manual (jika pakai SPA/framework)

```js
new ArtikelGaleri({
  containerId: "galeri-foto",
  galleryUrls: artikel.galleryUrls,
  coverUrl: artikel.coverUrl,
  coverAlt: artikel.coverAlt,
});
```

### 5. Deploy landing

- Build lokal lalu kirim berkas ke server (`/var/www/landing` di `124.156.192.17`, alias SSH `fufa`)
- Atau lewat deploy key GitHub jika sudah diatur (lihat checklist butir K-12)

## Fitur Carousel

- Foto utama besar di atas (header/carousel) dengan navigasi kiri-kanan
- Thumbnail di bawahnya; klik thumbnail ganti foto utama tanpa reload halaman
- Titik indikator menunjukkan foto mana yang aktif
- Navigasi keyboard (panah kiri/kanan)
- Responsif: aspect ratio 16:9 di desktop, 4:3 di mobile
- Aksesibilitas: `aria-label`, `aria-pressed`, `aria-selected`, keyboard nav

## Catatan

- Foto pertama dalam `galleryUrls` (atau `coverUrl` jika ada) ditampilkan sebagai foto utama awal
- Jika `galleryUrls` kosong tapi `coverUrl` tersedia, hanya tampil satu foto tanpa navigasi
- Jika keduanya kosong, tampilkan teks "Belum ada foto artikel."
- Gambar di-escape otomatis untuk mencegah XSS lewat `data-gallery-urls`
