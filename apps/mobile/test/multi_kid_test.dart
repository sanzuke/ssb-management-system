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
import 'package:ssb_mobile/core/repository.dart';
import 'package:ssb_mobile/core/session.dart';
import 'package:ssb_mobile/features/parent/kid_selection.dart';
import 'package:ssb_mobile/features/parent/kid_tab.dart';
import 'package:ssb_mobile/features/parent/parent_home_page.dart';

http.Response _json(Object? body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

Map<String, dynamic> _kid(String id, String name) => {'id': id, 'memberNo': null, 'fullName': name, 'birthDate': '2016-01-01', 'position': null, 'ageGroup': null, 'photoV': null};

Map<String, dynamic> _inv(String id, String kidId, String kid, int sisa) => {
      'id': id,
      'player': {'id': kidId, 'name': kid, 'memberNo': null, 'ageGroup': 'KU-10'},
      'month': '2026-11-01',
      'amount': sisa,
      'paid': 0,
      'remaining': sisa,
      'dueOn': '2026-11-10',
      'status': 'belum',
      'overdue': false,
      'payments': [],
    };

const _me = {
  'accountId': 'a1',
  'name': 'Orang Tua',
  'email': 'o@uji.test',
  'hasPassword': true,
  'whatsapp': null,
  'active': {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'orang_tua'},
  'memberships': [
    {'ssbId': 's1', 'userId': 'u1', 'ssbName': 'SSB Uji', 'role': 'orang_tua'},
  ],
};

void main() {
  setUpAll(() => initializeDateFormatting('id_ID'));

  Future<Widget> app(WidgetTester t, Widget child, KidSelection selection) async {
    t.view.physicalSize = const Size(400, 1400);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    FlutterSecureStorage.setMockInitialValues({'ssb_token': 'tok'});
    SharedPreferences.setMockInitialValues({});
    final session = (await t.runAsync(() async {
      final api = ApiClient(
        client: MockClient((req) async => switch (req.url.path) {
              '/auth/me' => _json(_me),
              '/players' => _json([_kid('k1', 'Dimas Arya'), _kid('k2', 'Rara Ayu')]),
              '/invoices' => _json([_inv('i1', 'k1', 'Dimas Arya', 150000), _inv('i2', 'k2', 'Rara Ayu', 200000)]),
              '/fees/public-info' => _json({'bankInfo': 'BCA 123'}),
              _ => _json(<dynamic>[]),
            }),
      );
      final s = SessionController(api);
      await s.start();
      return s;
    }))!;
    return MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: session.api),
        Provider<Repository>.value(value: Repository(session.api)),
        ChangeNotifierProvider<SessionController>.value(value: session),
        ChangeNotifierProvider<KidSelection>.value(value: selection),
      ],
      child: MaterialApp(home: Scaffold(body: child)),
    );
  }

  Future<void> settle(WidgetTester t) async {
    for (var i = 0; i < 8; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
      await t.pump(const Duration(milliseconds: 50));
    }
  }

  testWidgets('dua anak: memilih anak di satu tab berlaku di tab lain', (t) async {
    final selection = KidSelection();
    final widget = await app(
      t,
      Column(
        children: [
          Expanded(child: KidTab(key: const Key('kartu'), builder: (_, k) => Text('KARTU ${k.fullName}'))),
          Expanded(child: KidTab(key: const Key('rapor'), builder: (_, k) => Text('RAPOR ${k.fullName}'))),
        ],
      ),
      selection,
    );
    await t.pumpWidget(widget);
    await settle(t);
    expect(find.text('KARTU Dimas Arya'), findsOneWidget);
    expect(find.text('RAPOR Dimas Arya'), findsOneWidget);

    await t.tap(find.widgetWithText(ChoiceChip, 'Rara').first);
    await settle(t);
    expect(find.text('KARTU Rara Ayu'), findsOneWidget);
    expect(find.text('RAPOR Rara Ayu'), findsOneWidget);
  });

  testWidgets('SPP dua anak: total semua anak, lalu disaring per anak', (t) async {
    final widget = await app(t, const InvoicesPage(), KidSelection());
    await t.pumpWidget(widget);
    await settle(t);
    expect(find.textContaining('350.000'), findsOneWidget);
    expect(find.text('2 tagihan'), findsOneWidget);

    await t.tap(find.widgetWithText(ChoiceChip, 'Rara'));
    await settle(t);
    expect(find.textContaining('200.000'), findsWidgets);
    expect(find.text('1 tagihan'), findsOneWidget);
    expect(find.text('Dimas Arya'), findsNothing);

    await t.tap(find.widgetWithText(ChoiceChip, 'Semua anak'));
    await settle(t);
    expect(find.text('2 tagihan'), findsOneWidget);
  });
}
