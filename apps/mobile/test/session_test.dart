import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ssb_mobile/core/api.dart';
import 'package:ssb_mobile/core/models.dart';
import 'package:ssb_mobile/core/repository.dart';
import 'package:ssb_mobile/core/session.dart';

const _me = {
  'accountId': 'a1',
  'name': 'Budi Pelatih',
  'email': 'budi@uji.test',
  'hasPassword': true,
  'whatsapp': null,
  'active': {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'pelatih'},
  'memberships': [
    {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'pelatih'},
  ],
};

http.Response _json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('login menyimpan token, memuat akun, dan mengirim bearer di permintaan berikutnya', () async {
    final seen = <String, String?>{};
    final api = ApiClient(
      client: MockClient((req) async {
        seen['${req.method} ${req.url.path}'] = req.headers['authorization'];
        if (req.url.path == '/auth/token') {
          expect(jsonDecode(req.body), {'email': 'budi@uji.test', 'password': 'rahasia'});
          return _json({'token': 'tok-1', 'selected': true, 'memberships': []});
        }
        return _json(_me);
      }),
    );
    final s = SessionController(api);
    await s.login(' budi@uji.test ', 'rahasia');

    expect(s.status, AuthStatus.ready);
    expect(s.role, Role.pelatih);
    expect(seen['POST /auth/token'], isNull);
    expect(seen['GET /auth/me'], 'Bearer tok-1');
    expect(await const FlutterSecureStorage().read(key: 'ssb_token'), 'tok-1');
  });

  test('token tersimpan yang ditolak server (401) menghapus sesi', () async {
    FlutterSecureStorage.setMockInitialValues({'ssb_token': 'basi'});
    final api = ApiClient(client: MockClient((_) async => _json({'error': {'code': 'unauthorized', 'message': 'Silakan masuk'}}, 401)));
    final s = SessionController(api);
    await s.start();

    expect(s.status, AuthStatus.anonymous);
    expect(api.token, isNull);
    expect(await const FlutterSecureStorage().read(key: 'ssb_token'), isNull);
  });

  test('login salah menampilkan pesan server dan tidak menghapus apa pun', () async {
    final api = ApiClient(client: MockClient((_) async => _json({'error': {'code': 'invalid_credentials', 'message': 'Email atau kata sandi salah'}}, 401)));
    final s = SessionController(api);
    await expectLater(s.login('x@y.z', 'salah'), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Email atau kata sandi salah')));
    expect(s.status, AuthStatus.loading); // belum pernah start; tidak berubah menjadi anonymous lewat callback 401
  });

  test('tanpa jaringan saat memulai: status offline dan token tetap tersimpan', () async {
    FlutterSecureStorage.setMockInitialValues({'ssb_token': 'tok'});
    final api = ApiClient(client: MockClient((_) async => throw http.ClientException('gagal')));
    final s = SessionController(api);
    await s.start();

    expect(s.status, AuthStatus.offline);
    expect(await const FlutterSecureStorage().read(key: 'ssb_token'), 'tok');
  });

  test('simpan absensi hanya mengirim siswa yang ditandai', () async {
    late Map<String, dynamic> sent;
    final api = ApiClient(
      client: MockClient((req) async {
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        expect(req.method, 'PUT');
        expect(req.url.path, '/sessions/sesi-1/attendance');
        return _json({
          'session': {
            'id': 'sesi-1',
            'sessionDate': '2026-11-17',
            'startTime': '16:00:00',
            'ageGroup': {'id': 'k1', 'name': 'KU-10'},
            'location': null,
            'period': null,
            'attendance': {'hadir': 1, 'izin': 0, 'sakit': 1, 'alpa': 0, 'belum': 0},
          },
          'players': [
            {'playerId': 'p1', 'fullName': 'Andi', 'memberNo': null, 'status': 'hadir', 'note': null, 'injury': null},
            {'playerId': 'p2', 'fullName': 'Beni', 'memberNo': null, 'status': 'sakit', 'note': 'demam', 'injury': null},
          ],
        });
      }),
    );
    final r = await Repository(api).saveAttendance('sesi-1', {'p1': AttendanceStatus.hadir, 'p2': AttendanceStatus.sakit}, notes: {'p2': 'demam'});

    expect(sent['entries'], [
      {'playerId': 'p1', 'status': 'hadir', 'note': null},
      {'playerId': 'p2', 'status': 'sakit', 'note': 'demam'},
    ]);
    expect(r.session.startTime, '16:00');
    expect(r.players.last.status, AttendanceStatus.sakit);
  });
}
