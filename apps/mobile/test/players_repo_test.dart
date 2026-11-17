import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ssb_mobile/core/api.dart';
import 'package:ssb_mobile/core/models_players.dart';
import 'package:ssb_mobile/core/outbox.dart';
import 'package:ssb_mobile/core/repo_players.dart';

http.Response _json(Object? body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

PlayersRepo _repo(MockClient client) {
  final api = ApiClient(client: client)..token = 'tok';
  return PlayersRepo(api, client: client);
}

const _player = '1ffd8d93-abca-4376-8d02-d07f429f41b7';
const _period = 'ddbde0d1-f6ac-4beb-bcc8-8e2604b833bc';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('PATCH cedera dan DELETE lencana membawa bearer dan badan JSON', () async {
    final seen = <String>[];
    final repo = _repo(MockClient((req) async {
      seen.add('${req.method} ${req.url.path} ${req.headers['authorization']} ${req.body}');
      if (req.method == 'DELETE') return http.Response('', 204);
      return _json([
        {'id': 'i1', 'bodyPart': 'lutut', 'startedOn': '2026-11-01', 'expectedReturnOn': '2026-12-01', 'recoveredOn': null, 'note': null, 'recordedBy': null},
      ]);
    }));

    final list = await repo.updateInjury(_player, 'i1', injuryUpdateBody(expectedReturnOn: '2026-12-01', note: ''));
    await repo.revokeBadge(_player, 'b1');

    expect(list.single.expectedReturnOn, '2026-12-01');
    expect(seen[0], 'PATCH /players/$_player/injuries/i1 Bearer tok {"expectedReturnOn":"2026-12-01","note":null}');
    expect(seen[1], 'DELETE /players/$_player/badges/b1 Bearer tok {}');
  });

  test('galat server pada PATCH menjadi ApiException dengan pesan dari API', () async {
    final repo = _repo(MockClient((_) async => _json({'error': {'code': 'already_recovered', 'message': 'Cedera ini sudah ditandai pulih'}}, 409)));
    await expectLater(
      repo.updateInjury(_player, 'i1', injuryUpdateBody(note: 'x')),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'already_recovered').having((e) => e.message, 'message', 'Cedera ini sudah ditandai pulih')),
    );
  });

  test('menerbitkan dan menarik rapor memakai POST dan DELETE ke /publish', () async {
    final methods = <String>[];
    final repo = _repo(MockClient((req) async {
      methods.add('${req.method} ${req.url.path}');
      return _json({
        'id': 'a1',
        'period': {'id': _period, 'name': 'Musim 2026/27', 'startDate': '2026-07-01', 'endDate': '2027-06-30'},
        'ageGroup': {'id': 'k', 'name': 'KU-10'},
        'assessedOn': '2026-10-10',
        'note': null,
        'assessor': null,
        'publishedAt': req.method == 'POST' ? '2026-11-17T01:00:00.000Z' : null,
        'scores': [],
        'aspects': [],
        'overall': null,
      });
    }));

    expect((await repo.publish(_player, _period, on: true)).published, isTrue);
    expect((await repo.publish(_player, _period, on: false)).published, isFalse);
    expect(methods, ['POST /players/$_player/assessments/$_period/publish', 'DELETE /players/$_player/assessments/$_period/publish']);
  });

  test('izin menerbitkan ditolak (403) dilempar apa adanya agar bisa dijelaskan', () async {
    final repo = _repo(MockClient((_) async => _json({'error': {'code': 'forbidden', 'message': 'Anda tidak punya izin untuk tindakan ini'}}, 403)));
    await expectLater(repo.publish(_player, _period, on: true), throwsA(isA<ApiException>().having((e) => e.status, 'status', 403)));
  });

  test('rapor PDF: berhasil mengembalikan byte, 503 menjadi pesan ramah', () async {
    var fail = false;
    final repo = _repo(MockClient((req) async {
      expect(req.url.path, '/players/$_player/assessments/$_period/report');
      expect(req.headers['authorization'], 'Bearer tok');
      if (fail) return _json({'error': {'code': 'report_unavailable', 'message': 'teknis'}}, 503);
      return http.Response.bytes([0x25, 0x50, 0x44, 0x46], 200, headers: {'content-type': 'application/pdf'});
    }));

    expect(await repo.reportPdf(_player, _period), [0x25, 0x50, 0x44, 0x46]);
    fail = true;
    await expectLater(
      repo.reportPdf(_player, _period),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'report_unavailable').having((e) => e.message, 'message', contains('tidak tersedia'))),
    );
  });

  test('ringkasan rating tidak melempar bila gagal, dan menyaring siswa tanpa nilai', () async {
    var ok = true;
    final repo = _repo(MockClient((_) async {
      if (!ok) throw http.ClientException('putus');
      return _json([
        {'playerId': 'p1', 'guardian': null, 'latestAssessment': {'periodName': 'Musim 2026/27', 'overall': 7.6, 'assessedOn': '2026-10-10', 'published': true}},
        {'playerId': 'p2', 'guardian': null, 'latestAssessment': null},
      ]);
    }));

    final map = await repo.overview();
    expect(map.keys, ['p1']);
    expect(map['p1']!.overall, 7.6);
    ok = false;
    expect(await repo.overview(), isEmpty);
  });

  group('antrean offline nilai dan rencana', () {
    late Outbox outbox;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      outbox = Outbox(ApiClient(client: MockClient((_) async => throw http.ClientException('tanpa sinyal'))), await SharedPreferences.getInstance());
    });

    tearDown(() => outbox.dispose());

    test('simpan tanpa sinyal mengantre; draf dipulihkan dari bodyFor', () async {
      final indicators = [Indicator(id: 'i1', aspect: Aspect.technical, name: 'Kontrol bola', sortOrder: 0, active: true)];
      final key = 'assessment:$_player:$_period';
      final res = await outbox.submit(OutboxItem(
        key: key,
        path: '/players/$_player/assessments/$_period',
        body: assessmentBody(indicators: indicators, scores: {'i1': 8}, note: 'Menunggu sinyal'),
        label: 'Nilai Cakra Pratama',
      ));

      expect(res.queued, isTrue);
      expect(outbox.has(key), isTrue);
      expect(scoresFromBody(outbox.bodyFor(key)), {'i1': 8});
      expect(noteFromBody(outbox.bodyFor(key)), 'Menunggu sinyal');
    });

    test('simpan ulang kunci yang sama menggantikan draf lama; rencana punya kunci terpisah', () async {
      final key = 'assessment:$_player:$_period';
      final indicators = [Indicator(id: 'i1', aspect: Aspect.technical, name: 'Kontrol bola', sortOrder: 0, active: true)];
      for (final s in [5, 9]) {
        await outbox.submit(OutboxItem(key: key, path: '/x', body: assessmentBody(indicators: indicators, scores: {'i1': s})));
      }
      await outbox.submit(OutboxItem(key: 'plan:$_player:$_period', path: '/y', body: planBody(const [PlanDraft(area: 'Kaki kiri')])));

      expect(outbox.pending, 2);
      expect(scoresFromBody(outbox.bodyFor(key)), {'i1': 9});
      expect(planDraftsFromBody(outbox.bodyFor('plan:$_player:$_period'))!.single.area, 'Kaki kiri');
    });
  });
}
