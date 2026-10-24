# Model gratis untuk subagen

Catatan hasil uji model gratis yang bisa dipakai agen `task` (subagen) supaya pekerjaan yang jelas batasnya tidak memakai model berbayar. Diuji 24 Oktober 2026.

## Aturan kerja

- Model gratis hanya mengerjakan bagian yang spesifikasinya jelas dan hasilnya bisa diperiksa (komponen UI, CSS, tes, fungsi murni). Rancangan, kontrak, dan keputusan keamanan tetap dari orkestrator.
- Model gratis TIDAK boleh commit, push, deploy, atau menyentuh server. Tulis larangan ini di `context` tiap tugas.
- Setiap hasil direview orkestrator sebelum dipakai: baca `git diff`, jalankan `bun run format`, `lint`, `typecheck`, dan tes, lalu uji di browser untuk perubahan tampilan. Laporan agen ("tes lolos") tidak dianggap bukti sampai dijalankan ulang.
- Berikan batas berkas ("hanya ubah X, Y"), kriteria selesai yang bisa dijalankan, dan batas waktu. Setelah selesai, cek `git status` untuk berkas tak terduga.

## Cara memilih model

Model subagen diatur per nama agen di `task.agentModelOverrides` (parameter `model` pada alat `task` hanya untuk agen `seance`). Nilai dibaca saat agen dimulai, jadi bisa diganti di antara dua pemanggilan `task`.

```
write cfg://task/agentModelOverrides   {"task":"kilo/moonshotai/kimi-k2.6:free"}        # hanya sesi ini
write cfg://task/agentModelOverrides/save   {"task":"kilo/moonshotai/kimi-k2.6:free"}   # permanen
write cfg://task/agentModelOverrides   {}                                               # kembali ke bawaan
```

Penyedia yang sudah login di mesin ini: anthropic, kilo, openrouter, zai. Daftar model di `~/.omp/agent/models.db` bisa basi; id yang ada di daftar belum tentu hidup.

## Hasil uji

Tugas uji kode: fungsi murni `menitBaca(blocks, kataPerMenit)` dengan spesifikasi tertulis, berkas + tes, lalu jalankan tes. Diperiksa ulang dengan 6 tes milik orkestrator yang tidak dilihat model.

| Model | Hasil | Waktu | Catatan |
|---|---|---|---|
| `kilo/moonshotai/kimi-k2.6:free` | lolos 6/6; 10 tes sendiri lolos | 4 menit | Kode rapi (switch per jenis blok), laporan jujur. Terbaik dari yang diuji |
| `kilo/kilo-auto/free` | lolos 6/6; 16 tes sendiri lolos | 7 menit | Benar tetapi paling lambat; model dipilih otomatis oleh Kilo sehingga bisa berubah-ubah |
| `zai/glm-4.7-flash` | gagal 4/6 (menghitung spasi, bukan kata); tes sendiri gagal 2 | 13 menit, tanpa laporan akhir | Bagus untuk tugas baca/jelaskan kode (benar semua pada uji baca `seo.ts`, 1 menit), tidak untuk menulis kode |
| `openrouter/qwen/qwen3-coder:free` | tidak jalan | 2 detik | 404: versi gratis sudah tidak ada ("use qwen/qwen3-coder" berbayar) |
| `kilo/deepseek/deepseek-v4-flash:free` | tidak jalan | 2 detik | 404: id tidak ada di Kilo walau ada di cache lokal |

Belum diuji: `openrouter/nvidia/nemotron-3-super-120b-a12b:free`, `openrouter/minimax/minimax-m3:free`, `openrouter/poolside/laguna-m.1:free`, `kilo/z-ai/glm-5.2:free`, `openrouter/google/gemma-4-31b-it:free`. Uji dengan tugas yang sama sebelum dipakai.

## Peringatan

- Layanan gratis punya batas permintaan dan bisa berubah atau hilang tanpa pemberitahuan (dua dari lima uji gagal karena itu). Siapkan model cadangan dan periksa galat 404 atau 429 di hasil agen.
- Kebijakan data tiap layanan gratis berbeda; sebagian memakai prompt untuk pelatihan. Jangan kirim kredensial, data pemain, atau isi `.env` ke model gratis. Tugas yang butuh data itu dikerjakan sendiri oleh orkestrator.
- Model gratis cenderung kurang teliti pada tugas berurutan panjang (GLM habis 13 menit tanpa hasil). Beri tugas kecil dan batasi dengan kriteria yang bisa dijalankan.
