# Matriks izin

Dibuat dari `packages/shared/src/index.ts` (`permissions`) oleh `bun run docs:izin`; jangan diedit tangan, test akan gagal bila tidak sinkron.
Endpoint dijaga dengan `requirePermission(<izin>)`. Pembatasan data per baris (pelatih hanya KU yang ditugaskan, orang tua hanya anaknya) ditegakkan di query dan RLS, bukan di sini.

| Izin | Keterangan | admin_ssb | pelatih | korlas | orang_tua |
|---|---|:-:|:-:|:-:|:-:|
| `user.list` | Melihat daftar anggota SSB | ya | - | - | - |
| `invitation.create` | Membuat tautan undangan | ya | - | - | - |
| `fee.manage` | Mengatur tarif SPP, membuat tagihan, dan mencatat atau mengoreksi pembayaran | ya | - | - | - |
| `invoice.read` | Melihat tagihan SPP dan riwayat pembayarannya (orang tua: anaknya) | ya | - | - | ya |
| `member.reset_password` | Membuat tautan reset kata sandi untuk anggota SSB (akun yang hanya anggota SSB ini) | ya | - | - | - |
| `invitation.manage` | Melihat daftar undangan, mencabut, dan membuat ulang tautan yang belum diterima | ya | - | - | - |
| `master.read` | Melihat KU, periode, dan lokasi | ya | ya | ya | - |
| `master.write` | Mengubah KU, periode, dan lokasi | ya | - | - | - |
| `player.read` | Melihat pemain (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya) | ya | ya | ya | ya |
| `player.write` | Menambah dan mengubah pemain | ya | - | - | - |
| `player.photo` | Mengunggah dan menghapus foto pemain (pelatih dan korlas: KU yang ditugaskan) | ya | ya | ya | - |
| `attendance.record` | Mencatat absensi latihan | ya | ya | ya | - |
| `attendance.read` | Melihat absensi (orang tua: anaknya) | ya | ya | ya | ya |
| `assessment.write` | Mengisi penilaian pemain dan rencana pengembangannya | ya | ya | - | - |
| `assessment.read` | Melihat penilaian dan rencana pengembangan (orang tua: anaknya, setelah terbit) | ya | ya | ya | ya |
| `session.manage` | Menjadwalkan, mengubah, dan menghapus sesi latihan | ya | - | - | - |
| `guardian.sessions` | Portal orang tua: jadwal KU anak sendiri beserta status kehadiran anak, tanpa daftar pemain lain (admin tidak punya anak, jadi daftarnya kosong) | ya | - | - | ya |
| `session.read` | Melihat jadwal sesi latihan (pelatih dan korlas: KU yang ditugaskan) | ya | ya | ya | - |
| `assignment.manage` | Menugaskan pelatih dan korlas ke KU per periode | ya | - | - | - |
| `report.publish` | Menerbitkan rapor ke orang tua (wewenang korlas: menunggu keputusan) | ya | - | ya | - |
