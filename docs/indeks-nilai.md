# Indeks nilai siswa (MVI)

Angka 0 sampai 100 dan kategori yang merangkum perkembangan siswa dibanding teman satu KU. **Bukan harga, tidak pernah dalam rupiah, dan bukan peringkat resmi.** Rumus ada di `packages/shared/src/market-value.ts` dan diuji di `market-value.test.ts`.

Keputusan lingkup (6 Nov 2026): indeks saja tanpa nilai rupiah (harga untuk anak sensitif dan angka rupiah di rancangan lama tidak punya dasar); data dari penilaian pelatih, kehadiran, usia, posisi, ditambah statistik laga dan tes kebugaran yang diisi pelatih; orang tua hanya melihat kategori anaknya sendiri.

## Komponen

| Komponen | Bobot | Sumber | Dihitung bila |
|---|---:|---|---|
| Penilaian pelatih | 35 | rata-rata skor indikator periode itu (1 sampai 10, dikali 10) | ada penilaian |
| Performa laga | 25 | statistik laga periode itu | minimal 3 laga |
| Kebugaran | 20 | tes terbaru dalam 12 bulan sebelum akhir periode | minimal 5 siswa satu KU punya hasil yang sama |
| Kehadiran latihan | 10 | hadir dibagi semua catatan kehadiran pada sesi periode itu | minimal 5 catatan |
| Usia relatif di KU | 10 | usia pada akhir periode terhadap rentang usia KU | selalu |

- **Performa laga**: kontribusi gol dan assist per laga menurut posisi (bobot 50; penyerang 1,0 per laga dianggap penuh, gelandang 0,6, bek 0,3), keikutsertaan sebagai starter (30), dan disiplin (20; kartu kuning 1, merah 3 per laga). Kiper dan siswa tanpa posisi tidak dinilai dari gol; bobot sisanya dihitung ulang.
- **Kebugaran**: persentil di antara teman satu KU (peringkat tengah untuk nilai sama; waktu lari lebih kecil lebih baik). Rata-rata metrik yang tersedia: lari 30 m, zig-zag, lompat vertikal, bleep test. Karena relatif, indeks dibandingkan dalam KU yang sama, bukan antar KU.
- **Usia relatif**: yang termuda di rentang KU mendapat 100, yang tertua 0; KU satu usia bernilai 50.

## Aturan data kurang

Komponen yang datanya belum ada **dikeluarkan** dan bobot sisanya dihitung ulang; tidak ada nilai netral. Indeks hanya keluar bila penilaian pelatih ada **dan** minimal satu dari performa laga atau kebugaran terisi. Selain itu hasilnya "belum cukup data" beserta daftar yang belum ada. Karena bobot dihitung ulang, pada data minimal usia berbobot lebih besar (sampai 14%); pada data lengkap selisih terbesarnya 10 poin.

Rumus lama di branch `feature/player-market-value` memberi pemain tanpa data apa pun nilai 55,5 ("Baik") pada usia 8 tahun karena nilai netral dan bonus usia; itu sebabnya dibangun ulang.

## Kategori

| Indeks | Kategori |
|---|---|
| 0 sampai 25 | Sangat Rendah |
| 26 sampai 50 | Rendah |
| 51 sampai 75 | Baik |
| 76 sampai 90 | Sangat Baik |
| 91 sampai 100 | Elit |

Indeks dibulatkan lebih dulu agar tidak ada celah di antara 25 dan 26.

## Siapa melihat apa

- Admin, pelatih, dan korlas: angka, kategori, dan rincian komponen (pelatih dan korlas hanya KU yang ditugaskan). Peringkat satu KU di halaman Indeks nilai.
- Orang tua: hanya kategori anaknya, untuk periode yang penilaiannya sudah diterbitkan (indeks diturunkan dari penilaian itu). Tidak pernah angka atau rincian.
- Mengisi statistik laga dan tes kebugaran, dan menghitung ulang: admin dan pelatih (KU yang ditugaskan).

## Cara memakai

1. Isi penilaian di halaman Penilaian seperti biasa.
2. Di **Indeks nilai**, pilih KU dan periode, tekan **Isi data** pada siswa untuk statistik laga periode itu dan hasil tes kebugaran.
3. Tekan **Hitung ulang**. Hasil disimpan per siswa dan periode sebagai foto saat dihitung; perubahan data tidak mengubah indeks sampai dihitung ulang.

## Yang masih perlu divalidasi

Bobot, ambang (minimal 3 laga, 5 teman, 5 catatan kehadiran, 12 bulan), batas kontribusi gol per posisi, dan rumus disiplin adalah titik awal yang masuk akal, **bukan standar baku**. Perlu ditinjau pelatih berlisensi sebelum angkanya dijadikan dasar keputusan seleksi. Tim nasional dan prestasi dari rancangan lama tidak dipakai karena aplikasi belum punya data itu; kualitas akademi (grade SSB) tidak dipakai karena nilainya sama untuk semua siswa dalam satu SSB sehingga tidak membedakan.
