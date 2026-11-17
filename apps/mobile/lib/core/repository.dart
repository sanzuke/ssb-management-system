import 'api.dart';
import 'models.dart';

/// Akses data per layar. Semua endpoint sudah ada di API web; izin dan batas data
/// (KU pelatih, anak orang tua) ditegakkan server.
class Repository {
  Repository(this.api);

  final ApiClient api;

  List<T> _list<T>(dynamic data, T Function(Map<String, dynamic>) f) => [for (final e in data as List) f(e as Map<String, dynamic>)];

  Future<List<TrainingSession>> sessions({required String from, required String to}) async =>
      _list(await api.get('/sessions', query: {'from': from, 'to': to}), TrainingSession.fromJson);

  Future<AttendanceRoster> roster(String sessionId) async =>
      AttendanceRoster.fromJson(await api.get('/sessions/$sessionId/attendance') as Map<String, dynamic>);

  /// Menyimpan hanya siswa yang sudah ditandai, sama seperti web.
  Future<AttendanceRoster> saveAttendance(String sessionId, Map<String, AttendanceStatus> marks, {Map<String, String?> notes = const {}}) async {
    final entries = [
      for (final e in marks.entries) {'playerId': e.key, 'status': e.value.wire, 'note': notes[e.key]},
    ];
    return AttendanceRoster.fromJson(await api.put('/sessions/$sessionId/attendance', {'entries': entries}) as Map<String, dynamic>);
  }

  Future<List<PlayerSummary>> players() async => _list(await api.get('/players'), PlayerSummary.fromJson);

  Future<List<GuardianSession>> guardianSessions() async => _list(await api.get('/guardian/sessions'), GuardianSession.fromJson);

  Future<List<AttendanceRow>> attendanceSummary() async {
    final j = await api.get('/attendance/summary') as Map<String, dynamic>;
    return [for (final p in j['players'] as List) AttendanceRow.fromJson(p as Map<String, dynamic>)];
  }

  Future<List<Invoice>> invoices() async => _list(await api.get('/invoices'), Invoice.fromJson);
}
