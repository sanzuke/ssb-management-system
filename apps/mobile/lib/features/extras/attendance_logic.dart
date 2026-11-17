import '../../core/models.dart';

/// Kunci antrean Outbox untuk absensi satu sesi; dipakai halaman absensi, pemindai QR, dan kartu sesi.
String attendanceOutboxKey(String sessionId) => 'attendance:$sessionId';

/// Satu entri absensi yang menunggu dikirim.
class QueuedEntry {
  QueuedEntry(this.status, this.note);

  final AttendanceStatus status;
  final String? note;
}

/// Membaca isi antrean (`{entries: [{playerId, status, note}]}`) menjadi peta per siswa.
/// Isi yang rusak atau status tak dikenal diabaikan.
Map<String, QueuedEntry> queuedEntries(Object? body) {
  final out = <String, QueuedEntry>{};
  if (body is! Map) return out;
  final entries = body['entries'];
  if (entries is! List) return out;
  for (final e in entries) {
    if (e is! Map) continue;
    final id = e['playerId'];
    final status = AttendanceStatus.parse(e['status'] as String?);
    if (id is String && status != null) out[id] = QueuedEntry(status, e['note'] as String?);
  }
  return out;
}

/// Tanda dan catatan yang tampil: data server ditimpa isi antrean lokal, karena itu yang terakhir dilakukan pelatih.
/// Entri antrean untuk siswa yang tidak ada di daftar diabaikan.
({Map<String, AttendanceStatus> marks, Map<String, String?> notes}) overlayQueued(List<RosterPlayer> players, Object? queuedBody) {
  final queued = queuedEntries(queuedBody);
  final marks = <String, AttendanceStatus>{};
  final notes = <String, String?>{};
  for (final p in players) {
    final q = queued[p.playerId];
    if (q != null) {
      marks[p.playerId] = q.status;
      notes[p.playerId] = q.note ?? p.note;
    } else {
      if (p.status != null) marks[p.playerId] = p.status!;
      notes[p.playerId] = p.note;
    }
  }
  return (marks: marks, notes: notes);
}

/// Isi PUT absensi dari tanda yang ada; hanya siswa yang sudah ditandai.
Map<String, dynamic> attendanceBody(Map<String, AttendanceStatus> marks, Map<String, String?> notes) => {
      'entries': [
        for (final e in marks.entries) {'playerId': e.key, 'status': e.value.wire, 'note': notes[e.key]},
      ],
    };

/// Menambah atau mengganti entri satu siswa pada isi antrean yang sudah ada, tanpa menghapus entri lain.
/// Dipakai pemindai: antrean absensi satu sesi hanya satu per kunci, jadi isi lama harus ikut terkirim.
Map<String, dynamic> mergeQueuedEntry(Object? queuedBody, {required String playerId, required AttendanceStatus status, String? note}) {
  final merged = {for (final e in queuedEntries(queuedBody).entries) e.key: (e.value.status, e.value.note)};
  merged[playerId] = (status, note);
  return {
    'entries': [
      for (final e in merged.entries) {'playerId': e.key, 'status': e.value.$1.wire, 'note': e.value.$2},
    ],
  };
}

/// Hasil pencarian siswa pada daftar sesi hari ini.
class ScanTarget {
  ScanTarget(this.roster, this.player);

  final AttendanceRoster roster;
  final RosterPlayer player;
}

/// Sesi pertama (urut jam mulai) yang daftar siswanya memuat [playerId]; null bila tidak ada.
ScanTarget? findScanTarget(String playerId, List<AttendanceRoster> rosters) {
  final sorted = [...rosters]..sort((a, b) => (a.session.startTime ?? '99:99').compareTo(b.session.startTime ?? '99:99'));
  for (final r in sorted) {
    for (final p in r.players) {
      if (p.playerId == playerId) return ScanTarget(r, p);
    }
  }
  return null;
}
