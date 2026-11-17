import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'api.dart';
import 'config.dart';
import 'models_players.dart';

/// Akses data profil siswa, penilaian, rencana, lencana, dan cedera. Izin dan batas data
/// (KU pelatih, anak orang tua, hanya yang terbit) ditegakkan server.
class PlayersRepo {
  PlayersRepo(this.api, {http.Client? client}) : _client = client ?? http.Client();

  final ApiClient api;
  final http.Client _client;

  Future<PlayerDetail> player(String id) async => PlayerDetail.fromJson(await api.get('/players/${Uri.encodeComponent(id)}') as Map<String, dynamic>);

  Future<List<Period>> periods() async => [for (final e in await api.get('/periods') as List) Period.fromJson(e as Map<String, dynamic>)];

  Future<List<Indicator>> indicators(String ageGroupId) async => [
        for (final e in await api.get('/assessment-indicators', query: {'ageGroupId': ageGroupId}) as List) Indicator.fromJson(e as Map<String, dynamic>),
      ];

  Future<List<Assessment>> assessments(String playerId) async => parseAssessments(await api.get('/players/$playerId/assessments'));

  Future<List<PlanItem>> plan(String playerId, String periodId) async => parsePlan(await api.get('/players/$playerId/development-plan/$periodId'));

  Future<List<HistoryRow>> history(String playerId, String periodId) async => [
        for (final e in await api.get('/players/$playerId/assessments/$periodId/history') as List) HistoryRow.fromJson(e as Map<String, dynamic>),
      ];

  /// Menerbitkan atau menarik penilaian; mengembalikan penilaian terbaru.
  Future<Assessment> publish(String playerId, String periodId, {required bool on}) async {
    final path = '/players/$playerId/assessments/$periodId/publish';
    final j = on ? await api.post(path) : await api.delete(path);
    return Assessment.fromJson(j as Map<String, dynamic>);
  }

  Future<List<PlayerBadge>> badges(String playerId) async => [
        for (final e in await api.get('/players/$playerId/badges') as List) PlayerBadge.fromJson(e as Map<String, dynamic>),
      ];

  Future<void> awardBadge(String playerId, String code) => api.post('/players/$playerId/badges', {'badge': code});

  Future<void> revokeBadge(String playerId, String badgeId) => api.delete('/players/$playerId/badges/$badgeId');

  Future<List<PlayerInjury>> injuries(String playerId) async => parseInjuries(await api.get('/players/$playerId/injuries'));

  Future<List<PlayerInjury>> addInjury(String playerId, Map<String, dynamic> body) async => parseInjuries(await api.post('/players/$playerId/injuries', body));

  Future<List<PlayerInjury>> updateInjury(String playerId, String id, Map<String, dynamic> body) async =>
      parseInjuries(await api.patch('/players/$playerId/injuries/$id', body));

  Future<List<PlayerInjury>> recoverInjury(String playerId, String id) async => parseInjuries(await api.post('/players/$playerId/injuries/$id/recover'));

  Future<MviView> marketValue(String playerId) async => MviView.fromJson(await api.get('/players/$playerId/market-value') as Map<String, dynamic>);

  /// Rating terakhir tiap siswa, `playerId -> ringkasan`. Hanya pelengkap daftar, jadi galat tidak dilempar.
  Future<Map<String, PlayerOverview>> overview() async {
    try {
      final out = <String, PlayerOverview>{};
      for (final e in await api.get('/players-overview') as List) {
        final o = PlayerOverview.fromJson(e as Map<String, dynamic>);
        if (o != null) out[o.playerId] = o;
      }
      return out;
    } on ApiException {
      return {};
    }
  }

  /// Rapor PDF satu periode. `503 report_unavailable` (pembuat PDF belum aktif di server) dijadikan pesan ramah.
  Future<Uint8List> reportPdf(String playerId, String periodId) async {
    final res = await _get('/players/$playerId/assessments/$periodId/report');
    if (res.statusCode == 200) return res.bodyBytes;
    final e = _errorOf(res);
    if (e.code == 'report_unavailable' || e.status == 503) {
      throw ApiException(503, 'report_unavailable', 'Pembuat rapor PDF sedang tidak tersedia di server. Coba lagi nanti atau lihat rapor di layar.');
    }
    throw e;
  }

  /// Unduhan biner (PDF) tidak lewat `ApiClient`, yang hanya membaca JSON; header dan penanganan 401 tetap sama.
  Future<http.Response> _get(String path) async {
    final req = http.Request('GET', Uri.parse('$apiUrl$path'))..headers.addAll(api.authHeaders);
    try {
      return await http.Response.fromStream(await _client.send(req).timeout(const Duration(seconds: 30)));
    } on TimeoutException {
      throw ApiException(0, 'timeout', 'Koneksi terlalu lambat. Coba lagi.');
    } on http.ClientException {
      throw ApiException(0, 'network', 'Tidak ada koneksi ke server. Periksa sinyal Anda.');
    }
  }

  ApiException _errorOf(http.Response res) {
    dynamic data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      data = null;
    }
    final err = data is Map ? data['error'] : null;
    final e = ApiException(
      res.statusCode,
      err is Map ? '${err['code']}' : 'error',
      err is Map && err['message'] is String ? err['message'] as String : 'Terjadi kesalahan. Coba lagi.',
    );
    if (e.isUnauthorized && api.token != null) api.onUnauthorized?.call();
    return e;
  }
}
