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
import 'package:ssb_mobile/core/theme.dart';
import 'package:ssb_mobile/features/coach/attendance_page.dart';

http.Response _json(Object? body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

const _me = {
  'accountId': 'a1',
  'name': 'Uji',
  'email': 'uji@uji.test',
  'hasPassword': true,
  'whatsapp': null,
  'active': {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'pelatih'},
  'memberships': [
    {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'pelatih'},
  ],
};

final _roster = {
  'session': {
    'id': 'sesi-1',
    'sessionDate': '2026-11-18',
    'startTime': '16:00',
    'ageGroup': {'id': 'k1', 'name': 'KU-10'},
    'location': {'id': 'l1', 'name': 'Lapangan Utama Cilandak'},
    'period': null,
    'attendance': {'hadir': 0, 'izin': 0, 'sakit': 0, 'alpa': 0, 'belum': 3},
  },
  'players': [
    {'playerId': 'p1', 'fullName': 'Muhammad Arkan Zidan Pratama Putra Wijaya', 'memberNo': 'P0008', 'status': null, 'note': null, 'injury': null},
    {'playerId': 'p2', 'fullName': 'Beni', 'memberNo': null, 'status': 'hadir', 'note': null, 'injury': {'id': 'c1'}},
    {'playerId': 'p3', 'fullName': 'Cakra Pratama', 'memberNo': 'P0001', 'status': 'sakit', 'note': null, 'injury': null},
  ],
};

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  // Ponsel kecil (320dp) dengan teks sistem diperbesar: tata letak tidak boleh meluap.
  for (final scale in [1.0, 1.6]) {
    testWidgets('absensi: tanpa overflow di 320dp dengan skala teks $scale; empat status terbaca sebagai teks', (t) async {
      t.view.physicalSize = const Size(320, 1100);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      FlutterSecureStorage.setMockInitialValues({'ssb_token': 'tok'});
      SharedPreferences.setMockInitialValues({});
      final env = (await t.runAsync(() async {
        final api = ApiClient(
          client: MockClient((req) async {
            if (req.url.path == '/auth/me') return _json(_me);
            if (req.url.path == '/sessions/sesi-1/attendance') return _json(_roster);
            return _json(<dynamic>[]);
          }),
        );
        final s = SessionController(api);
        await s.start();
        return (api, s, Outbox(api, await SharedPreferences.getInstance()));
      }))!;
      await t.pumpWidget(
        MultiProvider(
          providers: [
            Provider<ApiClient>.value(value: env.$1),
            Provider<Repository>.value(value: Repository(env.$1)),
            ChangeNotifierProvider<Outbox>.value(value: env.$3),
            ChangeNotifierProvider<SessionController>.value(value: env.$2),
          ],
          child: MaterialApp(
            theme: buildTheme(),
            builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
            home: const AttendancePage(sessionId: 'sesi-1'),
          ),
        ),
      );
      for (var i = 0; i < 8; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
        await t.pump(const Duration(milliseconds: 50));
      }
      // Daftar dibangun malas, jadi di layar kecil tidak semua baris ada; cukup bukti bahwa label teks tampil.
      expect(find.text('Hadir'), findsAtLeastNWidgets(1));
      expect(find.text('Alpa'), findsAtLeastNWidgets(1));
      expect(t.takeException(), isNull);
      // Tombol status minimal 48dp.
      final tombol = find.ancestor(of: find.text('Hadir').first, matching: find.byType(InkWell)).first;
      expect(t.getSize(tombol).height, greaterThanOrEqualTo(48));
    });
  }
}
