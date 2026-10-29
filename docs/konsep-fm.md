# Konsep pemain ala Football Manager

Dokumen konsep, belum ada kode. Tujuannya: profil pemain di SSB MS terasa seperti profil di Football Manager (FM), yaitu angka yang bisa dibaca sekilas, ada arah perkembangan, dan ada peran di lapangan. Pelatih dan anak mendapat "layar pemain" yang menarik; orang tua mendapat gambaran perkembangan yang jelas.

Dasarnya tetap model yang sudah diputuskan di `docs/rancangan.md`: enam aspek, skala 1 sampai 10, satu penilaian per pemain per periode, jejak perubahan skor. Konsep ini **menurunkan** tampilan baru dari data itu, bukan mengganti data.

## Yang dipinjam dari FM, dan yang tidak

FM adalah simulasi dengan pemain dewasa profesional. Akademi usia dini berbeda: yang dinilai anak-anak, datanya nyata, dan dibaca orang tua. Jadi tidak semua fitur FM ikut.

| Konsep FM | Dipakai? | Bentuk di SSB MS |
| --- | --- | --- |
| Atribut per kategori (Technical, Mental, Physical) | Ya | Enam aspek yang sudah ada, dengan indikator per KU |
| Skala atribut 1-20 | Tidak | Tetap 1-10 (keputusan pemilik, 17 Okt 2026) |
| Warna atribut (merah, kuning, hijau) | Ya | Pita warna dari skor; lihat "Warna" |
| Current Ability (CA) | Ya, diubah | **Rating Umum** (rata-rata berbobot per posisi) |
| Potential Ability (PA) | Ya, hati-hati | **Proyeksi** berupa rentang, hanya untuk pelatih; lihat "Potensi" |
| Posisi dan rating per posisi | Ya | **Kecocokan posisi** dari indikator yang relevan |
| Peran dan duty | Sebagian | **Profil peran** sederhana (mis. Pengumpan, Pelari, Penjaga ruang) |
| Heksagon atribut | Ya | Radar enam aspek (sudah ada) |
| Form (performa terbaru) | Ya | **Tren** dari 3 periode terakhir |
| Kondisi, kebugaran, cedera | Sebagian | Status cedera dan catatan istirahat; tanpa persentase kebugaran |
| Moral | Tidak otomatis | Catatan pelatih; tidak dihitung dari angka |
| Kepribadian dan hidden attributes | Tidak | Terlalu mudah melabeli anak; diganti **sifat yang diamati** |
| Player traits (PPM) | Ya, diubah | **Lencana** yang diberikan pelatih |
| Scouting report dengan bintang | Ya, untuk pendaftar | Laporan seleksi untuk calon pemain (trial) |
| Training focus | Ya | **Fokus latihan** = development plan yang sudah ada |
| Kontrak, nilai pasar, transfer | Tidak | Tidak relevan dan tidak pantas untuk anak |
| Peringkat liga antar pemain | Tidak (default) | Lihat "Perbandingan" |

## Prinsip

1. **Angka untuk membantu, bukan memberi cap.** Profil menunjukkan di mana anak sekarang dan ke mana arahnya, bukan "bakat atau bukan".
2. **Perkembangan dibandingkan dengan dirinya sendiri.** Pembanding utama adalah periode sebelumnya, bukan anak lain.
3. **Potensi tidak ditampilkan ke orang tua sebagai angka.** Anak usia 8 sampai 12 tumbuh tidak linear (lonjakan tinggi badan, kematangan biologis). Proyeksi hanya alat pelatih dan selalu berupa rentang.
4. **Satu sumber data.** Semua tampilan baru dihitung dari skor assessment yang sudah ada. Tidak ada angka yang diisi terpisah.
5. **Bisa dijelaskan.** Setiap angka turunan punya rumus tertulis dan bisa ditelusuri ke skor mentahnya.

## Layar pemain

Satu halaman profil, urutan dari atas, dirancang untuk 360 px lebih dulu.

1. **Kepala kartu**: foto, nama, nomor anggota, KU, posisi utama, status (aktif, cuti, keluar), lencana cedera bila ada.
2. **Rating Umum** besar di sudut kartu, seperti rating pemain FM, dengan panah tren (naik, tetap, turun) dan selisih dari periode lalu.
3. **Enam aspek** sebagai radar (sudah ada) dan daftar indikator di bawahnya, tiap indikator berwarna menurut skor.
4. **Posisi**: lapangan mini dengan zona hijau (cocok), kuning (bisa), abu-abu (belum). Lihat "Kecocokan posisi".
5. **Lencana** (maksimal 5 aktif).
6. **Perkembangan**: grafik garis rating tiap periode dan perubahan per aspek.
7. **Fokus latihan**: development plan periode berjalan (maksimal 8 butir, sudah ada).
8. **Kehadiran** periode ini (sudah ada).
9. **Catatan pelatih**.

Pelatih dan admin melihat semua bagian. Orang tua tidak melihat bagian Proyeksi dan tidak melihat perbandingan dengan anak lain.

## Warna atribut

Skor 1-10 dipetakan ke lima pita, supaya anak dan orang tua membaca tanpa angka.

| Skor | Pita | Kata |
| --- | --- | --- |
| 1-2 | merah | Baru mulai |
| 3-4 | oranye | Berkembang |
| 5-6 | kuning | Cukup |
| 7-8 | hijau | Baik |
| 9-10 | hijau tua | Menonjol |

Warna selalu disertai teks atau angka (aksesibilitas, buta warna). Kata dipilih agar skor rendah terbaca sebagai tahap, bukan kegagalan.

## Rating Umum (adaptasi CA)

Rating Umum adalah satu angka 1.0 sampai 10.0 untuk ringkasan cepat.

- Dihitung dari rata-rata berbobot skor indikator pada penilaian periode itu.
- Bobot dasar: keenam aspek sama (1/6). Bobot per posisi dipakai untuk "Rating di posisi" (lihat di bawah).
- Dibulatkan satu desimal. Hanya dihitung bila minimal 4 dari 6 aspek terisi; selain itu tampil "belum cukup data".
- Penilaian yang belum terbit (draf) tidak masuk hitungan di sisi orang tua.

Rating dibandingkan **terhadap periode sebelumnya milik pemain yang sama**. Perbandingan antar pemain hanya untuk pelatih (lihat "Perbandingan").

## Kecocokan posisi

FM menghitung rating per posisi dari atribut yang berbobot untuk posisi itu. Di sini sama, tetapi sederhana dan bisa diatur.

- Posisi: kiper, bek, gelandang, penyerang (sayap dan tengah dibedakan bila KU sudah usia 12 ke atas).
- Tiap posisi punya tabel bobot per indikator (mis. kiper: refleks, penempatan, distribusi bola; gelandang: passing, penempatan posisi, membaca permainan).
- Kecocokan = rata-rata berbobot indikator posisi itu, dibagi ke tiga zona: cocok (>= 7), bisa (5 sampai < 7), belum (< 5).
- Tabel bobot disimpan sebagai data per SSB, dengan bawaan; admin dan pelatih bisa menyesuaikan, seperti template indikator.
- Posisi utama di profil tetap dipilih manusia. Kecocokan hanya saran, dan untuk KU di bawah 10 tahun sengaja ditampilkan sebagai "coba semua posisi" agar anak tidak dikunci terlalu dini.

## Lencana (adaptasi player traits)

Lencana adalah label perilaku yang **diamati pelatih**, bukan hasil hitungan. Contoh:

| Kelompok | Contoh lencana |
| --- | --- |
| Teknik | Kaki kiri kuat, Dribel lincah, Umpan terobosan |
| Fisik | Pelari cepat, Stamina tinggi |
| Mental | Pantang menyerah, Pemimpin, Suka membantu teman |
| Sikap | Disiplin latihan, Cepat belajar |

Aturan: diberikan oleh pelatih, bisa dicabut, tercatat siapa dan kapan; maksimal 5 aktif; tidak ada lencana negatif. Hal yang perlu diperbaiki masuk ke fokus latihan, bukan lencana.

## Tren (adaptasi form)

Tren = arah rating dalam tiga periode terakhir.

- Naik: selisih rating terbaru dikurangi rata-rata dua periode sebelumnya >= +0.3
- Turun: <= -0.3
- Tetap: di antaranya
- Pemain dengan kurang dari dua periode: "baru"

Turun tidak ditampilkan merah kepada orang tua; teksnya "Perlu perhatian" dan menampilkan fokus latihan terkait. Pelatih diberi tahu bila tren turun dua periode berturut-turut, agar mencari sebabnya (cedera, kelelahan, masalah di rumah atau sekolah).

## Potensi (adaptasi PA) dan perkembangan

Di FM, PA adalah plafon tersembunyi. Untuk anak, plafon semacam itu keliru dan merugikan. Yang dipakai:

- **Laju perkembangan** per aspek: kemiringan skor beberapa periode terakhir.
- **Proyeksi** satu periode ke depan sebagai rentang (mis. 6.2 sampai 7.0), bukan satu angka, dengan label "perkiraan".
- Hanya muncul setelah minimal 3 periode, dan hanya di tampilan pelatih dan admin.
- Tidak pernah dipakai untuk menolak, mencoret, atau menyeleksi anak otomatis. Keputusan seleksi tetap di manusia.
- Faktor yang mengaburkan dicatat sebagai bendera: usia relatif dalam KU (lahir awal atau akhir tahun), lonjakan pertumbuhan, cedera, absen panjang.

## Perbandingan

- Pelatih dan admin: tabel skuad per KU yang bisa diurutkan menurut rating, aspek, atau posisi (seperti layar skuad FM), untuk menyusun tim dan menemukan siapa yang perlu didorong. Memakai warna pita yang sama.
- Orang tua: hanya anaknya sendiri, dibandingkan dengan periode sebelumnya. Tidak ada peringkat, tidak ada nama anak lain.
- Tampilan tabel skuad tidak boleh dibagikan keluar sebagai tangkapan layar publik; ini ditulis di panduan pelatih.

## Cedera dan kondisi

- Status cedera: tanggal mulai, bagian tubuh (daftar pilihan), perkiraan pulih, catatan. Pemain cedera ditandai di absensi dan daftar skuad.
- Tidak ada persentase kebugaran atau "moral" otomatis. Catatan pelatih cukup.
- Data kesehatan anak sensitif: hanya admin, pelatih KU terkait, dan orang tua anak itu yang melihat.

## Laporan seleksi (adaptasi scouting report)

Untuk pendaftar dari landing (`docs/profil.md`): pelatih mengisi laporan singkat saat sesi percobaan memakai enam aspek yang sama, ditambah rekomendasi KU. Hasilnya menempel pada pendaftar; bila diterima, skor awal menjadi penilaian periode pertama. Bintang ala FM tidak dipakai; cukup rekomendasi tertulis.

## Gamifikasi untuk anak (opsional, belakangan)

Dari FM hanya yang aman untuk anak: kartu pemain dengan rating dan lencana yang bisa dibagikan keluarga (sudah ada kartu QR), serta pencapaian pribadi seperti "5 latihan berturut-turut" atau "naik satu aspek". Tidak ada papan peringkat.

## Dampak pada model data

Sebagian besar turunan dihitung saat dibaca dari tabel yang sudah ada. Tambahan yang diperlukan:

| Tabel baru | Isi | Catatan |
| --- | --- | --- |
| `position_weight` | ssb_id, posisi, indikator, bobot | Bawaan global, dapat ditimpa per SSB; RLS |
| `player_badge` | ssb_id, player_id, lencana, diberikan oleh, tanggal, dicabut | Daftar lencana tetap di kode atau tabel master |
| `player_injury` | ssb_id, player_id, mulai, selesai, bagian, catatan | Akses terbatas (data kesehatan) |
| `trial_report` | ssb_id, trial_id, skor enam aspek, rekomendasi KU | Menempel ke `trial_registration` |

Rating, tren, kecocokan posisi, dan proyeksi **tidak disimpan**; dihitung dari skor. Bila lambat di daftar skuad, tambahkan kolom turunan di-cache per penilaian. Semua tabel baru memakai RLS yang dipaksa seperti tabel lain, dan izin baru ditambahkan di matriks `docs/izin.md` (dibuat dari kode).

## Tahap pengerjaan (usulan)

1. (selesai) Warna pita, kata tahap, dan tren di profil pemain (tanpa tabel baru).
2. (selesai) Tabel skuad yang bisa diurutkan dan disaring per KU (`/skuad`, endpoint `GET /squad`, izin `squad.read`; pelatih dan korlas hanya KU yang ditugaskan).
3. (selesai) Lencana: katalog 17 lencana di kode, tabel `player_badge`, panel di profil pemain (admin dan pelatih memberi dan mencabut, orang tua membaca).
4. Kecocokan posisi dan tabel bobot.
5. Cedera.
6. Proyeksi (khusus pelatih).
7. Laporan seleksi untuk pendaftar.

Tahap 1 sampai 2 tidak butuh migrasi dan bisa dicoba langsung dengan data seed.

## Pertanyaan terbuka

- [ ] Bobot dasar enam aspek sama rata, atau dibedakan per KU (mis. Mental lebih berat di KU kecil)?
- [ ] Daftar lencana awal: divalidasi pelatih berlisensi, sejalan dengan butir rujukan indikator di `docs/checklist.md`.
- [ ] Apakah orang tua boleh melihat Rating Umum sebagai angka, atau hanya pita warna dan kata?
- [ ] Ambang tren (+/- 0.3) dan zona posisi (7 dan 5) perlu diuji dengan data nyata pilot.
- [ ] Posisi spesifik di bawah KU-10: ditampilkan atau disembunyikan sama sekali?
- [ ] Persetujuan orang tua untuk data cedera dan kesehatan (terkait butir hukum UU PDP di checklist).
