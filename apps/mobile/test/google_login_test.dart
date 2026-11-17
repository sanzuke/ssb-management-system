import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ssb_mobile/core/api.dart';
import 'package:ssb_mobile/core/session.dart';
import 'package:ssb_mobile/features/platform/google_login.dart';
import 'package:ssb_mobile/features/platform/links.dart';
import 'package:ssb_mobile/features/platform/push_service.dart';

const _me = {
  'accountId': 'a1',
  'name': 'Sari Pelatih',
  'email': 'sari@uji.test',
  'hasPassword': false,
  'whatsapp': null,
  'active': {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'pelatih'},
  'memberships': [
    {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'pelatih'},
  ],
};

http.Response _json(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('loginWithGoogleCode menukar kode, menyimpan token, dan memuat akun', () async {
    final seen = <String, String?>{};
    final api = ApiClient(
      client: MockClient((req) async {
        seen['${req.method} ${req.url.path}'] = req.headers['authorization'];
        if (req.url.path == '/auth/mobile-exchange') {
          expect(jsonDecode(req.body), {'code': 'kode-1'});
          return _json({'token': 'tok-g', 'selected': true, 'memberships': []});
        }
        return _json(_me);
      }),
    );
    final s = SessionController(api);
    await s.loginWithGoogleCode('kode-1');

    expect(s.status, AuthStatus.ready);
    expect(s.hasPassword, isFalse);
    expect(seen['POST /auth/mobile-exchange'], isNull);
    expect(seen['GET /auth/me'], 'Bearer tok-g');
    expect(await const FlutterSecureStorage().read(key: 'ssb_token'), 'tok-g');
  });

  test('kode yang ditolak server tidak menyimpan token', () async {
    final api = ApiClient(client: MockClient((_) async => _json({'error': {'code': 'invalid_code', 'message': 'Kode tidak berlaku'}}, 400)));
    final s = SessionController(api);
    await expectLater(s.loginWithGoogleCode('basi'), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Kode tidak berlaku')));
    expect(api.token, isNull);
    expect(await const FlutterSecureStorage().read(key: 'ssb_token'), isNull);
  });

  test('loginWithToken menyimpan token apa adanya', () async {
    final api = ApiClient(client: MockClient((_) async => _json(_me)));
    final s = SessionController(api);
    await s.loginWithToken('tok-x');
    expect(s.status, AuthStatus.ready);
    expect(api.token, 'tok-x');
  });

  test('parseAuthLink membaca kode dan galat, mengabaikan tautan lain', () {
    expect(parseAuthLink(Uri.parse('ssbapp://auth?code=abc'))?.code, 'abc');
    expect(parseAuthLink(Uri.parse('ssbapp://auth?error=akun_belum_terdaftar'))?.error, 'akun_belum_terdaftar');
    expect(parseAuthLink(Uri.parse('ssbapp://auth')), isNull);
    expect(parseAuthLink(Uri.parse('https://auth?code=abc')), isNull);
    expect(parseAuthLink(Uri.parse('ssbapp://lain?code=abc')), isNull);
  });

  test('googleErrorMessage berbahasa Indonesia dan punya cadangan untuk kode baru', () {
    expect(googleErrorMessage('akun_belum_terdaftar'), contains('belum terdaftar'));
    expect(googleErrorMessage('email_sudah_terdaftar'), contains('kata sandi'));
    expect(googleErrorMessage('kode_baru'), contains('kode_baru'));
  });

  test('parseInvitationToken menerima tautan lengkap atau token polos', () {
    const token = 'AbCdEf0123456789_-AbCdEf0123456789';
    expect(parseInvitationToken('https://ssb-ms.zukelabs.web.id/undangan/$token'), token);
    expect(parseInvitationToken('  $token  '), token);
    expect(parseInvitationToken('https://contoh.id/lain'), isNull);
    expect(parseInvitationToken('pendek'), isNull);
    expect(invitationUrl(token).path, '/undangan/$token');
  });

  test('googleStartUrl memakai intent=login&mobile=1', () {
    final u = googleStartUrl('http://10.0.2.2:3000');
    expect(u.path, '/auth/google/start');
    expect(u.queryParameters, {'intent': 'login', 'mobile': '1'});
  });

  group('GoogleLoginController', () {
    test('tautan dengan kode masuk sekali; tautan ganda diabaikan', () async {
      var exchanges = 0;
      final api = ApiClient(
        client: MockClient((req) async {
          if (req.url.path == '/auth/mobile-exchange') {
            exchanges++;
            return _json({'token': 'tok-g'});
          }
          return _json(_me);
        }),
      );
      final s = SessionController(api);
      final links = StreamController<Uri>();
      final c = GoogleLoginController(s, links: links.stream)..start();

      links.add(Uri.parse('ssbapp://auth?code=satu'));
      await pumpEventQueue();
      expect(s.status, AuthStatus.ready);
      expect(exchanges, 1);

      s.status = AuthStatus.anonymous;
      links.add(Uri.parse('ssbapp://auth?code=satu'));
      await pumpEventQueue();
      expect(exchanges, 1);
      c.dispose();
      await links.close();
    });

    test('tautan galat menampilkan pesan Indonesia', () async {
      final s = SessionController(ApiClient(client: MockClient((_) async => _json(_me))));
      final links = StreamController<Uri>();
      final c = GoogleLoginController(s, links: links.stream)..start();
      links.add(Uri.parse('ssbapp://auth?error=email_sudah_terdaftar'));
      await pumpEventQueue();
      expect(c.error, googleErrorMessage('email_sudah_terdaftar'));
      expect(s.status, AuthStatus.loading);
      c.dispose();
      await links.close();
    });

    test('kode ditolak server: pesan server tampil dan tidak masuk', () async {
      final api = ApiClient(client: MockClient((_) async => _json({'error': {'code': 'invalid_code', 'message': 'Kode tidak berlaku'}}, 400)));
      final s = SessionController(api);
      final links = StreamController<Uri>();
      final c = GoogleLoginController(s, links: links.stream)..start();
      links.add(Uri.parse('ssbapp://auth?code=basi'));
      await pumpEventQueue();
      expect(c.error, 'Kode tidak berlaku');
      expect(c.busy, isFalse);
      c.dispose();
      await links.close();
    });

    test('open membuka alamat start dan melaporkan kegagalan', () async {
      Uri? opened;
      final s = SessionController(ApiClient(client: MockClient((_) async => _json(_me))));
      final ok = GoogleLoginController(
        s,
        launch: (u) async {
          opened = u;
          return true;
        },
      );
      await ok.open();
      expect(opened!.path, '/auth/google/start');
      expect(ok.error, isNull);

      final gagal = GoogleLoginController(s, launch: (_) async => false);
      await gagal.open();
      expect(gagal.error, isNotNull);
    });
  });

  test('safePushRoute hanya menerima rute aplikasi yang dikenal', () {
    expect(safePushRoute('/?tab=jadwal'), '/?tab=jadwal');
    expect(safePushRoute('/?tab=tagihan'), '/?tab=tagihan');
    expect(safePushRoute('/absensi/abc-123'), '/absensi/abc-123');
    expect(safePushRoute('/siswa/p1/rapor'), '/siswa/p1/rapor');
    expect(safePushRoute('/'), '/');
    expect(safePushRoute('/?tab=rahasia'), isNull);
    expect(safePushRoute('/siswa/p1/nilai'), isNull);
    expect(safePushRoute('//evil.com'), isNull);
    expect(safePushRoute('https://evil.com/absensi/1'), isNull);
    expect(safePushRoute('absensi/1'), isNull);
    expect(safePushRoute('/absensi/1?x=2'), isNull);
    expect(safePushRoute(null), isNull);
  });
}
