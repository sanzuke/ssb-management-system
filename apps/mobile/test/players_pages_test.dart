import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ssb_mobile/core/api.dart';
import 'package:ssb_mobile/core/outbox.dart';
import 'package:ssb_mobile/core/repository.dart';
import 'package:ssb_mobile/core/session.dart';
import 'package:ssb_mobile/features/players/assessment_input_page.dart';
import 'package:ssb_mobile/features/players/development_plan_page.dart';
import 'package:ssb_mobile/features/players/player_profile_page.dart';
import 'package:ssb_mobile/features/players/report_page.dart';

const _pid = '1ffd8d93-abca-4376-8d02-d07f429f41b7';
const _ku = '09707284-5557-468c-8b10-7c38f90a2bea';
const _per = 'ddbde0d1-f6ac-4beb-bcc8-8e2604b833bc';

http.Response _json(Object? body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> _me(String role) => {
      'accountId': 'a1',
      'name': 'Uji',
      'email': 'uji@uji.test',
      'hasPassword': true,
      'whatsapp': null,
      'active': {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': role},
      'memberships': [
        {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': role},
      ],
    };

final _detail = {
  'id': _pid,
  'memberNo': 'P0001',
  'fullName': 'Cakra Pratama',
  'birthDate': '2016-01-03',
  'position': 'FW',
  'school': 'SDN Cilandak 03',
  'status': 'aktif',
  'ageGroup': {'id': _ku, 'name': 'KU-10'},
  'photoV': null,
  'nisn': '3142186000',
  'birthPlace': 'Jakarta',
  'guardianName': 'Ibu Ratna Dewi',
  'guardianWhatsapp': '081230000000',
  'documentStatus': 'belum',
  'heightCm': 140,
  'weightKg': 36,
  'medicalNote': 'Alergi debu',
  'jerseyNo': 1,
  'jerseySize': 'M',
  'shoeSize': 36,
  'history': [],
};

Map<String, dynamic> _assessment({String id = 'a1', String periodId = _per, String name = 'Musim 2026/27', String start = '2026-07-01', double overall = 7.6, String? publishedAt}) => {
      'id': id,
      'period': {'id': periodId, 'name': name, 'startDate': start, 'endDate': '2027-06-30'},
      'ageGroup': {'id': _ku, 'name': 'KU-10'},
      'assessedOn': '2026-10-10',
      'note': 'Cepat belajar, perlu lebih tenang.',
      'assessor': 'Budi Santoso',
      'publishedAt': publishedAt,
      'scores': [
        {'indicatorId': 'i-kontrol', 'aspect': 'technical', 'name': 'Kontrol bola', 'score': 9},
        {'indicatorId': 'i-cepat', 'aspect': 'physical', 'name': 'Kecepatan', 'score': 8},
        {'indicatorId': 'i-fokus', 'aspect': 'mental', 'name': 'Fokus', 'score': 7},
      ],
      'aspects': [
        {'aspect': 'technical', 'average': 9},
        {'aspect': 'physical', 'average': 8},
        {'aspect': 'mental', 'average': 7},
      ],
      'overall': overall,
    };

final _indicators = [
  {'id': 'i-kontrol', 'ageGroupId': _ku, 'aspect': 'technical', 'name': 'Kontrol bola', 'sortOrder': 0, 'active': true},
  {'id': 'i-cepat', 'ageGroupId': _ku, 'aspect': 'physical', 'name': 'Kecepatan', 'sortOrder': 1, 'active': true},
  {'id': 'i-fokus', 'ageGroupId': _ku, 'aspect': 'mental', 'name': 'Fokus', 'sortOrder': 2, 'active': true},
];

final _period = {'id': _per, 'name': 'Musim 2026/27', 'startDate': '2026-07-01', 'endDate': '2027-06-30'};

typedef _Handler = Future<http.Response> Function(http.Request req);

class _Env {
  _Env(this.api, this.session, this.outbox);

  final ApiClient api;
  final SessionController session;
  final Outbox outbox;
}

/// Menyiapkan klien tiruan, sesi dengan peran [role], dan antrean offline. [routes] dicocokkan `METODE /jalur`.
Future<_Env> _env(WidgetTester t, String role, Map<String, _Handler> routes) async {
  FlutterSecureStorage.setMockInitialValues({'ssb_token': 'tok'});
  SharedPreferences.setMockInitialValues({});
  return (await t.runAsync(() async {
    final api = ApiClient(
      client: MockClient((req) async {
        if (req.url.path == '/auth/me') return _json(_me(role));
        final h = routes['${req.method} ${req.url.path}'];
        if (h == null) return _json({'error': {'code': 'not_found', 'message': 'tidak ada'}}, 404);
        return h(req);
      }),
    );
    final session = SessionController(api);
    await session.start();
    return _Env(api, session, Outbox(api, await SharedPreferences.getInstance()));
  }))!;
}

Widget _app(_Env e, Widget page) => MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: e.api),
        Provider<Repository>.value(value: Repository(e.api)),
        ChangeNotifierProvider<Outbox>.value(value: e.outbox),
        ChangeNotifierProvider<SessionController>.value(value: e.session),
      ],
      child: MaterialApp(home: page),
    );

Future<void> _settle(WidgetTester t) async {
  // Permintaan tiruan selesai lewat microtask; beberapa putaran cukup untuk rantai muat berurutan.
  for (var i = 0; i < 8; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
    await t.pump(const Duration(milliseconds: 50));
  }
}

Map<String, _Handler> _coachRoutes({List<Map<String, dynamic>> assessments = const [], _Handler? put}) => {
      'GET /players/$_pid': (_) async => _json(_detail),
      'GET /players/$_pid/assessments': (_) async => _json(assessments),
      'GET /periods': (_) async => _json([_period]),
      'GET /assessment-indicators': (_) async => _json(_indicators),
      'GET /players/$_pid/assessments/$_per/history': (_) async => _json([]),
      'PUT /players/$_pid/assessments/$_per': ?put,
    };

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  void bigScreen(WidgetTester t) {
    t.view.physicalSize = const Size(800, 3200);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
  }

  testWidgets('pelatih: nilai yang gagal terkirim diantre, banner tampil, dan draf pulih saat dibuka lagi', (t) async {
    bigScreen(t);
    final e = await _env(t, 'pelatih', _coachRoutes(put: (_) async => throw http.ClientException('tanpa sinyal')));
    await t.pumpWidget(_app(e, const AssessmentInputPage(playerId: _pid)));
    await _settle(t);

    expect(find.text('Penilaian Cakra Pratama'), findsOneWidget);
    expect(find.text('Kontrol bola'), findsOneWidget);
    expect(find.textContaining('Menunggu sinyal'), findsNothing);

    await t.tap(find.byTooltip('Tambah skor Kontrol bola'));
    await t.pump();
    await t.tap(find.text('Simpan'));
    await _settle(t);

    final key = 'assessment:$_pid:$_per';
    expect(e.outbox.has(key), isTrue);
    expect((e.outbox.bodyFor(key) as Map)['scores'], [
      {'indicatorId': 'i-kontrol', 'score': 5},
    ]);
    expect(find.textContaining('Menunggu sinyal'), findsOneWidget);

    // Buka lagi: draf dipulihkan dari antrean dan banner tetap tampil.
    await t.pumpWidget(const SizedBox());
    await t.pumpWidget(_app(e, const AssessmentInputPage(playerId: _pid)));
    await _settle(t);
    expect(find.textContaining('Menunggu sinyal'), findsOneWidget);
    expect(find.text('1 dari 3 indikator terisi'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('pelatih: simpan berhasil memperbarui hasil dari jawaban server', (t) async {
    bigScreen(t);
    final e = await _env(t, 'pelatih', _coachRoutes(assessments: [_assessment()], put: (req) async {
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      expect(body['scores'], hasLength(3));
      return _json(_assessment(overall: 8.0));
    }));
    await t.pumpWidget(_app(e, const AssessmentInputPage(playerId: _pid)));
    await _settle(t);

    expect(find.text('3 dari 3 indikator terisi'), findsOneWidget);
    await t.tap(find.byTooltip('Tambah skor Fokus'));
    await t.pump();
    await t.tap(find.text('Simpan'));
    await _settle(t);

    expect(find.textContaining('Penilaian disimpan'), findsOneWidget);
    expect(e.outbox.pending, 0);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('korlas: melihat hasil dan menerbitkan ke orang tua tanpa form nilai', (t) async {
    bigScreen(t);
    final routes = _coachRoutes(assessments: [_assessment()]);
    routes['POST /players/$_pid/assessments/$_per/publish'] = (_) async => _json(_assessment(publishedAt: '2026-11-17T01:00:00.000Z'));
    final e = await _env(t, 'korlas', routes);
    await t.pumpWidget(_app(e, const AssessmentInputPage(playerId: _pid)));
    await _settle(t);

    expect(find.byTooltip('Tambah skor Fokus'), findsNothing);
    expect(find.text('Belum diterbitkan ke orang tua.'), findsOneWidget);
    await t.tap(find.text('Terbitkan ke orang tua'));
    await t.pumpAndSettle();
    await t.tap(find.text('Terbitkan').last);
    await _settle(t);

    expect(find.textContaining('Penilaian diterbitkan'), findsOneWidget);
    expect(find.text('Tarik dari orang tua'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('korlas: 403 saat menerbitkan ditampilkan sebagai pesan izin', (t) async {
    bigScreen(t);
    final routes = _coachRoutes(assessments: [_assessment()]);
    routes['POST /players/$_pid/assessments/$_per/publish'] = (_) async => _json({'error': {'code': 'forbidden', 'message': 'x'}}, 403);
    final e = await _env(t, 'korlas', routes);
    await t.pumpWidget(_app(e, const AssessmentInputPage(playerId: _pid)));
    await _settle(t);

    await t.tap(find.text('Terbitkan ke orang tua'));
    await t.pumpAndSettle();
    await t.tap(find.text('Terbitkan').last);
    await _settle(t);

    expect(find.text('Anda tidak punya izin untuk menerbitkan rapor ini.'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('pelatih: rencana pengembangan dimuat, disunting, dan disimpan lewat antrean', (t) async {
    bigScreen(t);
    Map<String, dynamic>? sent;
    final e = await _env(t, 'pelatih', {
      ..._coachRoutes(),
      'GET /players/$_pid/development-plan/$_per': (_) async => _json({
            'items': [
              {'id': 'd1', 'aspect': 'technical', 'area': 'Kaki kiri', 'target': 'Latihan 2 kali seminggu', 'note': null},
            ],
          }),
      'PUT /players/$_pid/development-plan/$_per': (req) async {
        sent = jsonDecode(req.body) as Map<String, dynamic>;
        return _json({
          'items': [
            {'id': 'd1', 'aspect': 'technical', 'area': 'Kaki kiri', 'target': 'Latihan 3 kali seminggu', 'note': null},
          ],
        });
      },
    });
    await t.pumpWidget(_app(e, const DevelopmentPlanPage(playerId: _pid)));
    await _settle(t);

    expect(find.text('Rencana Cakra Pratama'), findsOneWidget);
    expect(find.text('Kaki kiri'), findsOneWidget);
    expect(find.text('1 butir terisi'), findsOneWidget);

    await t.enterText(find.widgetWithText(TextField, 'Target (boleh dikosongkan)'), 'Latihan 3 kali seminggu');
    await t.pump();
    await t.tap(find.text('Simpan rencana'));
    await _settle(t);

    expect(sent, {
      'items': [
        {'aspect': 'technical', 'area': 'Kaki kiri', 'target': 'Latihan 3 kali seminggu', 'note': null},
      ],
    });
    expect(find.textContaining('Rencana disimpan'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('orang tua: rapor menampilkan hasil, rencana, dan tombol unduh PDF', (t) async {
    bigScreen(t);
    final e = await _env(t, 'orang_tua', {
      'GET /players/$_pid': (_) async => _json(_detail),
      'GET /players/$_pid/assessments': (_) async => _json([
            _assessment(publishedAt: '2026-10-10T03:00:00.000Z'),
            _assessment(id: 'a0', periodId: 'per-lama', name: 'Musim 2025/26', start: '2025-07-01', overall: 6.5, publishedAt: '2026-05-10T03:00:00.000Z'),
          ]),
      'GET /players/$_pid/development-plan/$_per': (_) async => _json({
            'items': [
              {'id': 'd1', 'aspect': 'mental', 'area': 'Ketenangan di depan gawang', 'target': null, 'note': null},
            ],
          }),
    });
    await t.pumpWidget(_app(e, const ReportPage(playerId: _pid)));
    await _settle(t);

    expect(find.text('Rapor Cakra Pratama'), findsOneWidget);
    expect(find.text('Unduh PDF'), findsOneWidget);
    expect(find.text('Musim 2026/27'), findsWidgets);
    expect(find.text('Musim 2025/26'), findsWidgets);
    expect(find.textContaining('Catatan pelatih'), findsOneWidget);
    expect(find.text('Ketenangan di depan gawang'), findsOneWidget);
    // Orang tua tidak melihat label draf milik staf.
    expect(find.textContaining('Belum diterbitkan ke orang tua'), findsNothing);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('orang tua tanpa rapor terbit melihat pesan kosong', (t) async {
    bigScreen(t);
    final e = await _env(t, 'orang_tua', {
      'GET /players/$_pid': (_) async => _json(_detail),
      'GET /players/$_pid/assessments': (_) async => _json([]),
    });
    await t.pumpWidget(_app(e, const ReportPage(playerId: _pid)));
    await _settle(t);

    expect(find.textContaining('Belum ada rapor yang diterbitkan'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('profil pelatih: rating, radar, lencana, cedera, dan aksi tersedia tanpa extra', (t) async {
    bigScreen(t);
    final e = await _env(t, 'pelatih', {
      ..._coachRoutes(assessments: [
        _assessment(publishedAt: '2026-10-10T03:00:00.000Z'),
        _assessment(id: 'a0', periodId: 'per-lama', name: 'Musim 2025/26', start: '2025-07-01', overall: 6.5, publishedAt: '2026-05-10T03:00:00.000Z'),
      ]),
      'GET /players/$_pid/badges': (_) async => _json([
            {'id': 'b1', 'badge': 'kaki_kanan_kuat', 'awardedAt': '2026-10-29T05:53:12.470Z', 'awardedBy': 'Hasanzuke'},
          ]),
      'GET /players/$_pid/injuries': (_) async => _json([
            {'id': 'i1', 'bodyPart': 'lutut', 'startedOn': '2026-11-01', 'expectedReturnOn': null, 'recoveredOn': null, 'note': 'Terkilir', 'recordedBy': 'Budi'},
          ]),
      'GET /players/$_pid/market-value': (_) async => _json({'role': 'staff', 'items': []}),
      'GET /attendance/summary': (_) async => _json({
            'players': [
              {'playerId': _pid, 'hadir': 9, 'recorded': 10, 'percent': 90},
            ],
          }),
    });
    await t.pumpWidget(_app(e, const PlayerProfilePage(playerId: _pid)));
    await _settle(t);

    expect(find.text('Cakra Pratama'), findsWidgets);
    expect(find.text('Radar performa'), findsOneWidget);
    expect(find.text('Input nilai'), findsOneWidget);
    expect(find.text('Rencana pengembangan'), findsOneWidget);
    expect(find.text('Rapor'), findsOneWidget);
    expect(find.text('Kaki kanan kuat'), findsOneWidget);
    expect(find.text('Cedera: Lutut'), findsOneWidget);
    expect(find.text('Beri lencana'), findsOneWidget);
    expect(find.text('Catat cedera'), findsOneWidget);
    expect(find.text('Tandai pulih'), findsOneWidget);
    expect(find.text('90%'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('profil orang tua: tombol rapor, berkas, kartu; tanpa tombol ubah', (t) async {
    bigScreen(t);
    final e = await _env(t, 'orang_tua', {
      'GET /players/$_pid': (_) async => _json(_detail),
      'GET /players/$_pid/assessments': (_) async => _json([_assessment(publishedAt: '2026-10-10T03:00:00.000Z')]),
      'GET /players/$_pid/badges': (_) async => _json([]),
      'GET /players/$_pid/injuries': (_) async => _json([]),
      'GET /players/$_pid/market-value': (_) async => _json({
            'role': 'guardian',
            'items': [
              {'period': {'id': _per, 'name': 'Musim 2026/27'}, 'category': 'Berkembang'},
            ],
          }),
      'GET /attendance/summary': (_) async => _json({'players': []}),
    });
    await t.pumpWidget(_app(e, const PlayerProfilePage(playerId: _pid)));
    await _settle(t);

    expect(find.text('Rapor'), findsOneWidget);
    expect(find.text('Berkas'), findsOneWidget);
    expect(find.text('Kartu QR'), findsOneWidget);
    expect(find.text('Input nilai'), findsNothing);
    expect(find.text('Beri lencana'), findsNothing);
    expect(find.text('Catat cedera'), findsNothing);
    expect(find.text('Berkembang'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });

  testWidgets('profil: siswa di luar akses (404) menampilkan pesan, bukan layar kosong', (t) async {
    bigScreen(t);
    final e = await _env(t, 'pelatih', {});
    await t.pumpWidget(_app(e, const PlayerProfilePage(playerId: _pid)));
    await _settle(t);

    expect(find.textContaining('Siswa tidak ditemukan'), findsOneWidget);

    await t.pumpWidget(const SizedBox());
    e.outbox.dispose();
  });
}
