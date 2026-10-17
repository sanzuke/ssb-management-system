# Matriks izin

Dibuat dari `packages/shared/src/index.ts` (`permissions`) oleh `bun run docs:izin`; jangan diedit tangan, test akan gagal bila tidak sinkron.
Endpoint dijaga dengan `requirePermission(<izin>)`. Pembatasan data per baris (pelatih hanya KU yang ditugaskan, orang tua hanya anaknya) ditegakkan di query dan RLS, bukan di sini.

| Izin | Keterangan | admin_ssb | pelatih | korlas | orang_tua |
|---|---|:-:|:-:|:-:|:-:|
| `user.list` | Melihat daftar anggota SSB | ya | - | - | - |
| `invitation.create` | Membuat tautan undangan | ya | - | - | - |
| `master.read` | Melihat KU, periode, dan lokasi | ya | ya | ya | - |
| `master.write` | Mengubah KU, periode, dan lokasi | ya | - | - | - |
| `player.read` | Melihat pemain (pelatih dan korlas: KU yang ditugaskan; orang tua: anaknya) | ya | ya | ya | ya |
| `player.write` | Menambah dan mengubah pemain | ya | - | - | - |
| `attendance.record` | Mencatat absensi latihan | ya | ya | ya | - |
| `attendance.read` | Melihat absensi (orang tua: anaknya) | ya | ya | ya | ya |
| `assessment.write` | Mengisi penilaian pemain | ya | ya | - | - |
| `assessment.read` | Melihat penilaian (orang tua: anaknya, setelah terbit) | ya | ya | ya | ya |
| `report.publish` | Menerbitkan rapor ke orang tua (wewenang korlas: menunggu keputusan) | ya | - | ya | - |
