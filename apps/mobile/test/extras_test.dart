import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ssb_mobile/core/api.dart';
import 'package:ssb_mobile/core/models.dart';
import 'package:ssb_mobile/core/models_extras.dart';
import 'package:ssb_mobile/core/repo_extras.dart';
import 'package:ssb_mobile/features/extras/attendance_logic.dart';

const _p1 = '11111111-1111-4111-8111-111111111111';
const _p2 = '22222222-2222-4222-8222-222222222222';
const _p3 = '33333333-3333-4333-8333-333333333333';

RosterPlayer _player(String id, {AttendanceStatus? status, String? note}) => RosterPlayer(playerId: id, fullName: 'Siswa $id'.substring(0, 8), memberNo: null, status: status, note: note, injured: false);

AttendanceRoster _roster(String sessionId, String? time, List<RosterPlayer> players) => AttendanceRoster(
      session: TrainingSession(id: sessionId, date: '2026-11-17', startTime: time, ageGroup: NamedRef('ku', 'KU-10'), location: null, counts: AttendanceCounts()),
      players: players,
    );

void main() {
  group('overlay antrean pada daftar server', () {
    test('tanpa antrean, tanda server dipakai apa adanya', () {
      final o = overlayQueued([_player(_p1, status: AttendanceStatus.hadir), _player(_p2)], null);
      expect(o.marks, {_p1: AttendanceStatus.hadir});
    });

    test('antrean menimpa server dan menambah siswa yang belum ditandai', () {
      final body = {
        'entries': [
          {'playerId': _p1, 'status': 'alpa', 'note': 'telat'},
          {'playerId': _p2, 'status': 'hadir', 'note': null},
        ],
      };
      final o = overlayQueued([_player(_p1, status: AttendanceStatus.hadir, note: 'lama'), _player(_p2), _player(_p3, status: AttendanceStatus.izin)], body);
      expect(o.marks, {_p1: AttendanceStatus.alpa, _p2: AttendanceStatus.hadir, _p3: AttendanceStatus.izin});
      expect(o.notes[_p1], 'telat');
      // Catatan server dipertahankan bila entri antrean tidak membawa catatan.
      expect(overlayQueued([_player(_p2, note: 'bawa botol')], body).notes[_p2], 'bawa botol');
    });

    test('entri antrean untuk siswa di luar daftar dan isi rusak diabaikan', () {
      final body = {
        'entries': [
          {'playerId': _p3, 'status': 'hadir'},
          {'playerId': _p1, 'status': 'bukan-status'},
          'sampah',
        ],
      };
      expect(overlayQueued([_player(_p1)], body).marks, isEmpty);
      expect(queuedEntries('bukan map'), isEmpty);
      expect(queuedEntries({'entries': 5}), isEmpty);
    });

    test('attendanceBody hanya memuat siswa yang sudah ditandai', () {
      final b = attendanceBody({_p1: AttendanceStatus.sakit}, {_p1: 'demam', _p2: null});
      expect(b['entries'], [
        {'playerId': _p1, 'status': 'sakit', 'note': 'demam'},
      ]);
    });
  });

  group('mergeQueuedEntry', () {
    test('menambah entri tanpa menghapus yang sudah antre', () {
      final queued = {
        'entries': [
          {'playerId': _p1, 'status': 'izin', 'note': 'acara keluarga'},
        ],
      };
      final merged = mergeQueuedEntry(queued, playerId: _p2, status: AttendanceStatus.hadir);
      final parsed = queuedEntries(merged);
      expect(parsed[_p1]!.status, AttendanceStatus.izin);
      expect(parsed[_p1]!.note, 'acara keluarga');
      expect(parsed[_p2]!.status, AttendanceStatus.hadir);
    });

    test('mengganti entri siswa yang sama dan mulai dari kosong bila tidak ada antrean', () {
      final merged = mergeQueuedEntry(
        {
          'entries': [
            {'playerId': _p1, 'status': 'alpa'},
          ],
        },
        playerId: _p1,
        status: AttendanceStatus.hadir,
        note: 'terlambat',
      );
      expect((merged['entries'] as List).length, 1);
      expect(queuedEntries(merged)[_p1]!.status, AttendanceStatus.hadir);
      expect(queuedEntries(mergeQueuedEntry(null, playerId: _p3, status: AttendanceStatus.hadir)).keys, [_p3]);
    });
  });

  group('findScanTarget', () {
    test('memilih sesi paling awal yang memuat siswa', () {
      final sore = _roster('s-sore', '16:00', [_player(_p1)]);
      final pagi = _roster('s-pagi', '08:00', [_player(_p1)]);
      expect(findScanTarget(_p1, [sore, pagi])!.roster.session.id, 's-pagi');
    });

    test('siswa di luar semua sesi hari ini menghasilkan null', () {
      expect(findScanTarget(_p3, [_roster('s', '08:00', [_player(_p1)])]), isNull);
    });
  });

  group('payload QR', () {
    test('sama dengan web: <origin>/pemain/<id>', () {
      expect(playerQrPayload('https://ssb.example.id', _p1), 'https://ssb.example.id/pemain/$_p1');
    });

    test('alamat web diturunkan dari alamat API', () {
      expect(webOriginOf('https://ssb.example.id/api'), 'https://ssb.example.id');
      expect(webOriginOf('https://ssb.example.id/api/'), 'https://ssb.example.id');
      expect(webOriginOf('http://10.0.2.2:3000'), 'http://10.0.2.2:3000');
    });

    test('parsePlayerQr membaca URL profil, id polos, dan menolak selain itu', () {
      expect(parsePlayerQr('https://ssb.example.id/pemain/$_p1'), _p1);
      expect(parsePlayerQr('  https://ssb.example.id/pemain/${_p1.toUpperCase()}?x=1  '), _p1);
      expect(parsePlayerQr('https://ssb.example.id/siswa/$_p2'), _p2);
      expect(parsePlayerQr(_p3), _p3);
      expect(parsePlayerQr('https://ssb.example.id/pemain/bukan-uuid'), isNull);
      expect(parsePlayerQr('https://contoh.id/halaman'), isNull);
      expect(parsePlayerQr('hello'), isNull);
      expect(parsePlayerQr(''), isNull);
      expect(parsePlayerQr(null), isNull);
    });

    test('isi QR yang dibuat kartu bisa dibaca pemindai', () {
      expect(parsePlayerQr(playerQrPayload(webOriginOf('https://ssb.example.id/api'), _p2)), _p2);
    });
  });

  group('model', () {
    test('pengajuan izin orang tua', () {
      final r = AbsenceRequest.fromJson({
        'id': 'a1',
        'sessionId': 's1',
        'sessionDate': '2026-11-18',
        'startTime': '16:00:00',
        'ageGroup': {'id': 'k', 'name': 'KU-10'},
        'playerId': _p1,
        'playerName': 'Budi Kecil',
        'kind': 'sakit',
        'note': 'demam',
        'createdAt': '2026-11-17T01:00:00.000Z',
      });
      expect(r.kind, AbsenceKind.sakit);
      expect(r.kind.status, AttendanceStatus.sakit);
      expect(r.startTime, '16:00');
      expect(r.ageGroup, 'KU-10');
    });

    test('pengajuan untuk pelatih per sesi', () {
      final q = SessionAbsenceRequest.fromJson({'id': 'a', 'playerId': _p1, 'playerName': 'Budi', 'kind': 'izin', 'note': null, 'createdAt': 'x'});
      expect(q.kind.status, AttendanceStatus.izin);
      expect(q.note, isNull);
    });

    test('berkas siswa: jenis tak dikenal dilewati', () {
      expect(PlayerDocument.tryParse({'id': 'd', 'kind': 'aneh', 'label': null, 'originalName': 'x.pdf', 'mime': 'application/pdf', 'sizeBytes': 1, 'uploadedAt': 'z'}), isNull);
      final d = PlayerDocument.tryParse({'id': 'd', 'kind': 'kartu_keluarga', 'label': null, 'originalName': 'kk.jpg', 'mime': 'image/jpeg', 'sizeBytes': 2048, 'uploadedAt': '2026-11-17T00:00:00.000Z'})!;
      expect(d.kind, DocKind.kartuKeluarga);
      expect(d.isImage, isTrue);
      expect(formatBytes(2048), '2 KB');
      expect(formatBytes(1572864), '1,5 MB');
    });

    test('berkas: ekstensi yang diterima', () {
      expect(isAllowedDocumentName('KK.PDF'), isTrue);
      expect(isAllowedDocumentName('foto.webp'), isTrue);
      expect(isAllowedDocumentName('virus.exe'), isFalse);
      expect(isAllowedDocumentName('tanpaekstensi'), isFalse);
    });

    test('nominal dan persentase donasi', () {
      expect(parseAmount('150000'), 150000);
      expect(parseAmount('1.500.000'), 1500000);
      expect(parseAmount(''), isNull);
      expect(parseAmount('0'), isNull);
      expect(parseAmount('abc'), isNull);
      expect(fundPercent(50, 200), 25);
      expect(fundPercent(500, 200), 100);
      expect(fundPercent(10, null), isNull);
    });

    test('kampanye dan sumbangan', () {
      final k = Campaign.fromJson({
        'id': 'c',
        'title': 'Seragam',
        'description': '',
        'event': {'id': 'e', 'title': 'Turnamen', 'startDate': '2026-12-01'},
        'targetAmount': 1000,
        'raised': 250,
        'supporters': 3,
        'deadline': null,
        'status': 'aktif',
        'open': false,
        'paymentInfo': 'BCA 1',
      });
      expect(k.percent, 25);
      expect(k.statusLabel, 'Lewat batas akhir');
      final p = Pledge.fromJson({'id': 'p', 'kind': 'sponsor', 'amount': 5000, 'message': '', 'isAnonymous': true, 'donorName': null, 'status': 'menunggu', 'receivedOn': null, 'createdAt': '2026-11-17T00:00:00.000Z', 'mine': false, 'packageName': null});
      expect(p.donorName, isNull);
      expect(p.kind, PledgeKind.sponsor);
      expect(p.statusLabel, 'Menunggu konfirmasi');
    });

    test('kegiatan kalender dikelompokkan per tanggal dan yang mulai sebelum bulan masuk hari pertama', () {
      CalendarEvent ev(String id, String start, [String? end]) => CalendarEvent.fromJson({'id': id, 'title': id, 'description': '', 'eventType': 'acara', 'startDate': start, 'endDate': end, 'startTime': '09:00:00', 'endTime': null, 'location': ''});
      final days = groupCalendarByDay([ev('a', '2026-10-30', '2026-11-02'), ev('b', '2026-11-01'), ev('c', '2026-11-05')], '2026-11-01');
      expect(days.map((d) => d.key), ['2026-11-01', '2026-11-05']);
      expect(days.first.value.map((e) => e.title), ['a', 'b']);
      expect(days.first.value.first.multiDay, isTrue);
      expect(days.first.value.first.startTime, '09:00');
    });

    test('tagihan dengan riwayat pembayaran', () {
      final d = InvoiceDetail.fromJson({
        'id': 'i',
        'player': {'id': _p1, 'name': 'Budi', 'memberNo': null, 'ageGroup': 'KU-10'},
        'month': '2026-11-01',
        'amount': 150000,
        'paid': 50000,
        'remaining': 100000,
        'dueOn': '2026-11-10',
        'status': 'sebagian',
        'overdue': false,
        'payments': [
          {'id': 'p', 'amount': 50000, 'paidOn': '2026-11-03', 'method': 'transfer', 'note': null, 'recordedBy': null},
        ],
      });
      expect(d.invoice.open, isTrue);
      expect(d.payments.single.methodLabel, 'Transfer');
    });
  });

  group('unggah berkas (multipart)', () {
    test('kolom form sama dengan web: kind, label (raport), file', () async {
      final req = buildDocumentUpload(Uri.parse('http://x/players/$_p1/documents'), {'authorization': 'Bearer t'}, kind: DocKind.raport, label: 'Semester 1', bytes: utf8.encode('%PDF-1.4 isi'), filename: 'rapor.pdf');
      expect(req.headers['authorization'], 'Bearer t');
      expect(req.fields, {'kind': 'raport', 'label': 'Semester 1'});
      final body = utf8.decode(await req.finalize().toBytes());
      expect(body, contains('name="kind"'));
      expect(body, contains('name="file"; filename="rapor.pdf"'));
      expect(body, contains('%PDF-1.4 isi'));
    });

    test('label tidak dikirim untuk jenis selain raport', () {
      final req = buildDocumentUpload(Uri.parse('http://x/d'), const {}, kind: DocKind.nisn, label: 'abaikan', bytes: [1, 2, 3], filename: 'n.png');
      expect(req.fields, {'kind': 'nisn'});
    });

    test('mengirim dengan token bearer dan memetakan galat server', () async {
      http.BaseRequest? seen;
      var status = 201;
      final client = MockClient((req) async {
        seen = req;
        return status == 201
            ? http.Response(jsonEncode({'id': 'd', 'kind': 'nisn', 'label': null, 'originalName': 'n.png', 'mime': 'image/png', 'sizeBytes': 3, 'uploadedAt': '2026-11-17T00:00:00.000Z'}), 201)
            : http.Response(jsonEncode({'error': {'code': 'document_too_large', 'message': 'Berkas terlalu besar (maksimal 5 MB)'}}), 413);
      });
      final api = ApiClient()..token = 'tok';
      final repo = ExtrasRepository(api, client: client);

      final doc = await repo.uploadDocument(_p1, kind: DocKind.nisn, bytes: [1, 2, 3], filename: 'n.png');
      expect(doc!.kind, DocKind.nisn);
      expect(seen!.headers['authorization'], 'Bearer tok');
      expect(seen!.headers['content-type'], startsWith('multipart/form-data'));
      expect(seen!.url.path, endsWith('/players/$_p1/documents'));

      status = 413;
      await expectLater(
        repo.uploadDocument(_p1, kind: DocKind.nisn, bytes: [1], filename: 'n.png'),
        throwsA(isA<ApiException>().having((e) => e.status, 'status', 413).having((e) => e.message, 'message', contains('5 MB'))),
      );
    });

    test('unduhan berkas membawa token dan mengembalikan tipe isi', () async {
      final client = MockClient((req) async {
        expect(req.headers['authorization'], 'Bearer tok');
        return http.Response.bytes([1, 2, 3], 200, headers: {'content-type': 'image/png'});
      });
      final repo = ExtrasRepository(ApiClient()..token = 'tok', client: client);
      final f = await repo.downloadDocument(_p1, 'doc');
      expect(f.mime, 'image/png');
      expect(f.bytes, [1, 2, 3]);
    });
  });
}
