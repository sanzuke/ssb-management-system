import 'dart:math' as math;

import 'package:flutter_test/flutter_test.dart';
import 'package:ssb_mobile/core/models_players.dart';

// Contoh JSON disalin dari jawaban API lokal (budi@, siswa "Cakra Pratama"), skor dipangkas empat butir.
const _detail = {
  'id': '1ffd8d93-abca-4376-8d02-d07f429f41b7',
  'memberNo': 'P0001',
  'fullName': 'Cakra Pratama',
  'birthDate': '2016-01-03',
  'position': 'FW',
  'school': 'SDN Cilandak 03',
  'status': 'aktif',
  'ageGroup': {'id': '09707284-5557-468c-8b10-7c38f90a2bea', 'name': 'KU-10'},
  'photoV': '09465f59',
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

Map<String, dynamic> _assessment({String id = 'a1', String periodId = 'p2', String name = 'Musim 2026/27', String start = '2026-07-01', double? overall = 7.6, String? publishedAt = '2026-10-10T03:00:00.000Z'}) => {
      'id': id,
      'period': {'id': periodId, 'name': name, 'startDate': start, 'endDate': '2027-06-30'},
      'ageGroup': {'id': '09707284-5557-468c-8b10-7c38f90a2bea', 'name': 'KU-10'},
      'assessedOn': '2026-10-10',
      'note': 'Menunjukkan peningkatan passing yang bagus.',
      'assessor': 'Budi Santoso',
      'publishedAt': publishedAt,
      'scores': [
        {'indicatorId': '4aa4e6c7', 'aspect': 'mental', 'name': 'Fokus', 'score': 7},
        {'indicatorId': '177a6a3e', 'aspect': 'physical', 'name': 'Kecepatan', 'score': 8},
        {'indicatorId': '02223ef9', 'aspect': 'technical', 'name': 'Kontrol bola', 'score': 9},
        {'indicatorId': '5763abb3', 'aspect': 'movement', 'name': 'Koordinasi', 'score': 7},
      ],
      'aspects': [
        {'aspect': 'technical', 'average': 9},
        {'aspect': 'physical', 'average': 8},
        {'aspect': 'mental', 'average': 7},
        {'aspect': 'movement', 'average': 7},
      ],
      'overall': overall,
    };

Assessment _a(String id, String start, double? overall) => Assessment.fromJson(_assessment(id: id, periodId: 'per-$id', name: 'P $id', start: start, overall: overall));

void main() {
  group('parsing', () {
    test('detail siswa membaca ringkasan dan data lengkap', () {
      final p = PlayerDetail.fromJson(_detail);
      expect(p.fullName, 'Cakra Pratama');
      expect(p.summary.ageGroup?.name, 'KU-10');
      expect(p.summary.position, 'FW');
      expect(p.heightCm, 140);
      expect(p.weightKg, 36.0);
      expect(p.guardianName, 'Ibu Ratna Dewi');
      expect(p.medicalNote, 'Alergi debu');
      expect(p.jerseyNo, 1);
    });

    test('detail siswa tanpa foto dan KU tidak gagal', () {
      final p = PlayerDetail.fromJson({..._detail, 'photoV': null, 'ageGroup': null, 'position': null, 'heightCm': null, 'weightKg': null});
      expect(p.summary.photoV, isNull);
      expect(p.summary.ageGroup, isNull);
      expect(p.heightCm, isNull);
      expect(p.weightKg, isNull);
    });

    test('penilaian: skor, rata-rata aspek, dan overall', () {
      final a = Assessment.fromJson(_assessment());
      expect(a.period.name, 'Musim 2026/27');
      expect(a.published, isTrue);
      expect(a.overall, 7.6);
      expect(a.scores, hasLength(4));
      expect(a.scores.first.aspect, Aspect.mental);
      expect(a.averageOf(Aspect.technical), 9);
      expect(a.averageOf(Aspect.tactical), isNull);
      expect(a.scoresOf(Aspect.physical).single.name, 'Kecepatan');
    });

    test('penilaian draf (belum terbit) dan belum ada skor', () {
      final a = Assessment.fromJson({..._assessment(publishedAt: null, overall: null), 'scores': [], 'aspects': [], 'note': null});
      expect(a.published, isFalse);
      expect(a.overall, isNull);
      expect(a.note, isNull);
      expect(a.aspects, isEmpty);
    });

    test('rencana pengembangan', () {
      final items = parsePlan({
        'items': [
          {'id': 'd91fbabe', 'aspect': 'technical', 'area': 'Kaki kiri', 'target': 'Latihan dribbling dan passing kaki kiri 2 kali seminggu', 'note': null},
          {'id': 'c1ad20da', 'aspect': null, 'area': 'Ketenangan di depan gawang', 'target': null, 'note': 'Sering terburu-buru'},
        ],
      });
      expect(items, hasLength(2));
      expect(items.first.aspect, Aspect.technical);
      expect(items.first.note, isNull);
      expect(items.last.aspect, isNull);
      expect(items.last.note, 'Sering terburu-buru');
    });

    test('lencana dan katalognya', () {
      final b = PlayerBadge.fromJson({'id': '6daa4f0a', 'badge': 'kaki_kanan_kuat', 'awardedAt': '2026-10-29T05:53:12.470Z', 'awardedBy': 'Hasanzuke'});
      expect(b.label, 'Kaki kanan kuat');
      expect(b.group, BadgeGroup.teknik);
      expect(badgeCatalog, hasLength(17));
      expect({for (final x in badgeCatalog) x.code}, hasLength(17));
      // Kode tak dikenal tetap tampil memakai kodenya.
      expect(PlayerBadge.fromJson({'id': 'x', 'badge': 'baru', 'awardedAt': '2026-01-01T00:00:00.000Z', 'awardedBy': null}).label, 'baru');
    });

    test('cedera berjalan dan sudah pulih', () {
      final list = parseInjuries([
        {'id': 'i1', 'bodyPart': 'lutut', 'startedOn': '2026-11-01', 'expectedReturnOn': '2026-11-20', 'recoveredOn': null, 'note': 'Terkilir', 'recordedBy': 'Budi Santoso'},
        {'id': 'i2', 'bodyPart': 'pergelangan_kaki', 'startedOn': '2026-09-01', 'expectedReturnOn': null, 'recoveredOn': '2026-09-10', 'note': null, 'recordedBy': null},
      ]);
      expect(list.first.ongoing, isTrue);
      expect(list.last.ongoing, isFalse);
      expect(bodyPartLabel(list.last.bodyPart), 'Pergelangan kaki');
      expect(bodyPartLabel('tidak-ada'), 'tidak-ada');
    });

    test('indeks nilai untuk staf dan orang tua', () {
      final staff = MviView.fromJson({
        'role': 'staff',
        'items': [
          {
            'period': {'id': 'p', 'name': 'Musim 2026/27'},
            'ageGroup': {'id': 'k', 'name': 'KU-10'},
            'mvi': 71.4,
            'category': 'Berkembang',
            'coverage': 80,
            'components': [
              {'key': 'assessment', 'label': 'Penilaian pelatih', 'weight': 50, 'score': 76.0, 'detail': 'Rata-rata 7,6'},
              {'key': 'matches', 'label': 'Statistik laga', 'weight': 30, 'score': null, 'detail': 'Belum ada'},
            ],
          },
        ],
      });
      expect(staff.staff, isTrue);
      expect(staff.items.single.mvi, 71.4);
      expect(staff.items.single.components.last.score, isNull);

      final guardian = MviView.fromJson({
        'role': 'guardian',
        'items': [
          {'period': {'id': 'p', 'name': 'Musim 2026/27'}, 'category': 'Menonjol'},
        ],
      });
      expect(guardian.staff, isFalse);
      expect(guardian.items.single.category, 'Menonjol');
      expect(guardian.items.single.mvi, isNull);
      expect(guardian.items.single.components, isEmpty);
    });

    test('ringkasan penilaian terakhir untuk daftar', () {
      final o = PlayerOverview.fromJson({
        'playerId': '1ffd8d93',
        'guardian': null,
        'latestAssessment': {'periodName': 'Musim 2026/27', 'overall': 7.6, 'assessedOn': '2026-10-10', 'published': true},
      });
      expect(o?.overall, 7.6);
      expect(o?.published, isTrue);
      expect(PlayerOverview.fromJson({'playerId': 'x', 'guardian': null, 'latestAssessment': null}), isNull);
    });
  });

  group('skor dan pita', () {
    test('scoreText memakai koma dan membuang ,0', () {
      expect(scoreText(7), '7');
      expect(scoreText(7.0), '7');
      expect(scoreText(7.3), '7,3');
      expect(scoreText(7.25), '7,3');
    });

    test('scoreBand mengikuti batas eksklusif pita web', () {
      expect(scoreBand(1).label, 'Baru mulai');
      expect(scoreBand(2.9).code, 1);
      expect(scoreBand(3).label, 'Berkembang');
      expect(scoreBand(5).label, 'Cukup');
      expect(scoreBand(7).label, 'Baik');
      expect(scoreBand(8.9).code, 4);
      expect(scoreBand(9).label, 'Menonjol');
      expect(scoreBand(10).code, 5);
    });
  });

  group('periode', () {
    final periods = [
      Period(id: 'baru', name: 'Musim 2026/27', startDate: '2026-07-01', endDate: '2027-06-30'),
      Period(id: 'lama', name: 'Musim 2025/26', startDate: '2025-07-01', endDate: '2026-06-30'),
    ];

    test('memilih periode yang memuat hari ini', () {
      expect(defaultPeriod(periods, '2026-11-17')?.id, 'baru');
      expect(defaultPeriod(periods, '2026-03-01')?.id, 'lama');
    });

    test('di luar semua periode memakai yang paling akhir; kosong menghasilkan null', () {
      expect(defaultPeriod(periods, '2030-01-01')?.id, 'baru');
      expect(defaultPeriod([], '2026-11-17'), isNull);
    });
  });

  group('pemilihan penilaian dan tren', () {
    final old = _a('old', '2025-07-01', 6.0);
    final mid = _a('mid', '2026-01-01', 6.5);
    final cur = _a('cur', '2026-07-01', 7.6);
    final draft = _a('draft', '2027-01-01', null);

    test('urut terbaru dulu dan default memilih yang terbaru bernilai', () {
      final list = [old, cur, draft, mid];
      expect(newestFirst(list).map((a) => a.id), ['draft', 'cur', 'mid', 'old']);
      expect(pickAssessment(list, null)?.id, 'cur');
      expect(pickAssessment(list, 'per-mid')?.id, 'mid');
      expect(pickAssessment(list, 'tidak-ada')?.id, 'cur');
      expect(pickAssessment([draft], null)?.id, 'draft');
      expect(pickAssessment([], null), isNull);
    });

    test('pembanding adalah periode bernilai sebelumnya dan selisihnya satu desimal', () {
      final list = [old, mid, cur, draft];
      expect(previousScored(list, cur)?.id, 'mid');
      expect(previousScored(list, old), isNull);
      // Draf tanpa skor dilewati sebagai pembanding.
      expect(previousScored(list, draft)?.id, 'cur');
      expect(overallDelta(cur, mid), 1.1);
      expect(overallDelta(draft, cur), isNull);
      expect(overallDelta(cur, null), isNull);
    });

    test('tren butuh dua periode; pembanding rata-rata dua periode sebelumnya', () {
      expect(computeTrend([7]).direction, TrendDirection.baru);
      expect(computeTrend([7]).delta, isNull);
      // 8,0 - rata-rata(6,0; 7,0) = 1,5 (naik)
      final up = computeTrend([6.0, 7.0, 8.0]);
      expect(up.direction, TrendDirection.naik);
      expect(up.delta, 1.5);
      // Hanya dua periode terakhir sebelum yang terbaru yang dipakai.
      expect(computeTrend([1.0, 6.0, 6.0, 6.0]).direction, TrendDirection.tetap);
      expect(computeTrend([8.0, 7.0]).direction, TrendDirection.turun);
      expect(computeTrend([8.0, 7.0]).delta, -1.0);
      expect(computeTrend([7.0, 7.2]).direction, TrendDirection.tetap);
      expect(computeTrend([7.0, 7.3]).direction, TrendDirection.naik);
    });

    test('tren dihitung sampai periode yang dipilih', () {
      final list = [old, mid, cur, draft];
      expect(trendUpTo(list, cur).direction, TrendDirection.naik);
      expect(trendUpTo(list, old).direction, TrendDirection.baru);
      expect(trendUpTo(list, mid).delta, 0.5);
      expect(trendUpTo([], null).direction, TrendDirection.baru);
    });
  });

  group('radar', () {
    test('aspek pertama di puncak, searah jarum jam', () {
      final top = radarPoint(0, 6, 10, 100);
      expect(top.dx, closeTo(0, 1e-9));
      expect(top.dy, closeTo(-100, 1e-9));
      final bottom = radarPoint(3, 6, 10, 100);
      expect(bottom.dx, closeTo(0, 1e-9));
      expect(bottom.dy, closeTo(100, 1e-9));
      final right = radarPoint(1, 6, 10, 100);
      expect(right.dx, closeTo(100 * math.cos(-math.pi / 6), 1e-9));
      expect(right.dy, closeTo(-50, 1e-9));
    });

    test('jarak dari pusat sebanding dengan skor', () {
      for (var i = 0; i < 6; i++) {
        final p = radarPoint(i, 6, 5, 80);
        expect(math.sqrt(p.dx * p.dx + p.dy * p.dy), closeTo(40, 1e-9));
      }
      final zero = radarPoint(2, 6, 0, 80);
      expect(zero.dx, 0);
      expect(zero.dy, 0);
    });
  });

  group('badan permintaan penilaian', () {
    final indicators = [
      Indicator(id: 'i1', aspect: Aspect.technical, name: 'Kontrol bola', sortOrder: 0, active: true),
      Indicator(id: 'i2', aspect: Aspect.physical, name: 'Kecepatan', sortOrder: 1, active: true),
      Indicator(id: 'i3', aspect: Aspect.mental, name: 'Fokus', sortOrder: 2, active: true),
    ];

    test('hanya indikator yang sudah dinilai, urut sesuai indikator', () {
      final body = assessmentBody(indicators: indicators, scores: {'i3': 7, 'i1': 9}, note: '  Bagus  ');
      expect(body, {
        'note': 'Bagus',
        'scores': [
          {'indicatorId': 'i1', 'score': 9},
          {'indicatorId': 'i3', 'score': 7},
        ],
      });
    });

    test('catatan kosong menjadi null dan skor di luar indikator aktif dibuang', () {
      expect(assessmentBody(indicators: indicators, scores: {'i2': 4, 'lama': 10}, note: '   ')['note'], isNull);
      expect(assessmentBody(indicators: indicators, scores: {'i2': 4, 'lama': 10})['scores'], [
        {'indicatorId': 'i2', 'score': 4},
      ]);
    });

    test('isi antrean offline bisa dibaca kembali untuk memulihkan draf', () {
      final body = assessmentBody(indicators: indicators, scores: {'i1': 9, 'i2': 5}, note: 'Catatan');
      expect(scoresFromBody(body), {'i1': 9, 'i2': 5});
      expect(noteFromBody(body), 'Catatan');
      expect(scoresFromBody(null), isNull);
      expect(scoresFromBody({'note': 'x'}), isNull);
      expect(noteFromBody(assessmentBody(indicators: indicators, scores: {'i1': 1})), isNull);
    });

    test('rata-rata sementara hanya dari yang terisi', () {
      expect(runningAverage(indicators, {}), isNull);
      expect(runningAverage(indicators, {'i1': 9, 'i2': 8}), 8.5);
      expect(runningAverage(indicators, {'i1': 7, 'i2': 7, 'i3': 8}), 7.3);
    });
  });

  group('badan permintaan rencana', () {
    test('butir tanpa area dibuang, teks dipangkas, kosong menjadi null', () {
      final body = planBody(const [
        PlanDraft(aspect: Aspect.mental, area: '  Tenang di depan gawang ', target: '', note: ' 1 lawan 1 '),
        PlanDraft(area: '   ', target: 'abaikan'),
        PlanDraft(area: 'Kaki kiri', target: 'Latihan 2x seminggu'),
      ]);
      expect(body, {
        'items': [
          {'aspect': 'mental', 'area': 'Tenang di depan gawang', 'target': null, 'note': '1 lawan 1'},
          {'aspect': null, 'area': 'Kaki kiri', 'target': 'Latihan 2x seminggu', 'note': null},
        ],
      });
    });

    test('daftar kosong tetap dikirim agar rencana terhapus', () {
      expect(planBody(const []), {'items': <Object>[]});
    });

    test('draf dari antrean offline dipulihkan', () {
      final body = planBody(const [PlanDraft(aspect: Aspect.technical, area: 'Kaki kiri', target: 'T', note: 'N')]);
      final drafts = planDraftsFromBody(body)!;
      expect(drafts.single.aspect, Aspect.technical);
      expect(drafts.single.area, 'Kaki kiri');
      expect(drafts.single.target, 'T');
      expect(planDraftsFromBody({'bentuk': 'lain'}), isNull);
      expect(planDraftsFromBody(null), isNull);
      expect(PlanDraft.fromItem(parsePlan({'items': [{'id': '1', 'aspect': null, 'area': 'A', 'target': null, 'note': null}]}).single).target, '');
    });
  });

  group('badan permintaan cedera', () {
    test('catat cedera: kolom kosong menjadi null', () {
      expect(injuryCreateBody(bodyPart: 'lutut', startedOn: '2026-11-17'), {'bodyPart': 'lutut', 'startedOn': '2026-11-17', 'expectedReturnOn': null, 'note': null});
      expect(injuryCreateBody(bodyPart: 'paha', startedOn: '2026-11-17', expectedReturnOn: '2026-12-01', note: ' Tertarik '), {
        'bodyPart': 'paha',
        'startedOn': '2026-11-17',
        'expectedReturnOn': '2026-12-01',
        'note': 'Tertarik',
      });
    });

    test('ubah cedera hanya mengirim perkiraan pulih dan catatan; kosong menghapusnya', () {
      expect(injuryUpdateBody(expectedReturnOn: '', note: ''), {'expectedReturnOn': null, 'note': null});
      expect(injuryUpdateBody(expectedReturnOn: '2026-12-01', note: 'Membaik'), {'expectedReturnOn': '2026-12-01', 'note': 'Membaik'});
    });
  });

  test('nama berkas rapor hanya huruf dan angka', () {
    expect(reportFileName('Cakra Pratama', 'Musim 2026/27'), 'rapor-Cakra-Pratama-Musim-2026-27.pdf');
    expect(reportFileName("D'Angelo  Ñoño", '(Semester 1)'), 'rapor-D-Angelo-Ñoño-Semester-1.pdf');
  });
}
