import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/format.dart';
import '../../core/models_players.dart';

/// Warna pita skor (1 sampai 5). Dipasangkan dengan kata pita agar tidak bergantung pada warna saja.
Color bandColor(int code) => switch (code) {
      1 => const Color(0xFFC62828),
      2 => const Color(0xFFEF6C00),
      3 => const Color(0xFFB8861B),
      4 => const Color(0xFF43A047),
      _ => const Color(0xFF1B6B3A),
    };

const _prevColor = Color(0xFFB8861B);

String _short(String s, [int n = 11]) => s.length > n ? '${s.substring(0, n - 1)}…' : s;

/// Radar enam aspek: periode terpilih (garis penuh) dibanding periode sebelumnya (putus-putus).
/// Aspek tanpa skor dilewati (bentuk menyambung aspek yang terisi); cincin tiap 2 poin.
class RadarChart extends StatelessWidget {
  const RadarChart({super.key, required this.current, this.previous});

  final Assessment current;
  final Assessment? previous;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Radar rata-rata skor enam aspek, ${current.period.name}',
      child: AspectRatio(
        aspectRatio: 1.15,
        child: CustomPaint(
          painter: _RadarPainter(
            current: {for (final a in Aspect.values) a: current.averageOf(a)},
            previous: previous == null ? null : {for (final a in Aspect.values) a: previous!.averageOf(a)},
            grid: scheme.outlineVariant,
            fill: scheme.primary,
            labelStyle: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
          ),
        ),
      ),
    );
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter({required this.current, required this.previous, required this.grid, required this.fill, required this.labelStyle});

  final Map<Aspect, double?> current;
  final Map<Aspect, double?>? previous;
  final Color grid;
  final Color fill;
  final TextStyle labelStyle;

  static const _count = 6;

  Path _shape(Map<Aspect, double?> v, Offset c, double radius) {
    final path = Path();
    var started = false;
    for (var i = 0; i < _count; i++) {
      final value = v[Aspect.values[i]];
      if (value == null) continue;
      final p = radarPoint(i, _count, value, radius);
      final o = Offset(c.dx + p.dx, c.dy + p.dy);
      if (started) {
        path.lineTo(o.dx, o.dy);
      } else {
        path.moveTo(o.dx, o.dy);
        started = true;
      }
    }
    if (started) path.close();
    return path;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final c = size.center(Offset.zero);
    // Sisakan ruang untuk label di tepi.
    final radius = (size.shortestSide / 2) - 34;
    final line = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = grid;
    for (final ring in const [2, 4, 6, 8, 10]) {
      final path = Path();
      for (var i = 0; i < _count; i++) {
        final p = radarPoint(i, _count, ring.toDouble(), radius);
        final o = Offset(c.dx + p.dx, c.dy + p.dy);
        i == 0 ? path.moveTo(o.dx, o.dy) : path.lineTo(o.dx, o.dy);
      }
      canvas.drawPath(path..close(), line);
    }
    for (var i = 0; i < _count; i++) {
      final end = radarPoint(i, _count, scoreMax.toDouble(), radius);
      canvas.drawLine(c, Offset(c.dx + end.dx, c.dy + end.dy), line);
      final lp = radarPoint(i, _count, scoreMax + 2.3, radius);
      final tp = TextPainter(
        text: TextSpan(text: _short(Aspect.values[i].label), style: labelStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(c.dx + lp.dx - tp.width / 2, c.dy + lp.dy - tp.height / 2));
    }
    if (previous != null) {
      _dashed(canvas, _shape(previous!, c, radius), Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..color = _prevColor);
    }
    final shape = _shape(current, c, radius);
    canvas.drawPath(shape, Paint()..color = fill.withValues(alpha: 0.16));
    canvas.drawPath(
        shape,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.2
          ..color = fill);
  }

  /// Garis putus-putus 5 px garis, 4 px jeda.
  void _dashed(Canvas canvas, Path path, Paint paint) {
    for (final m in path.computeMetrics()) {
      var d = 0.0;
      while (d < m.length) {
        canvas.drawPath(m.extractPath(d, math.min(d + 5, m.length)), paint);
        d += 9;
      }
    }
  }

  @override
  bool shouldRepaint(_RadarPainter old) => old.current != current || old.previous != previous || old.grid != grid || old.fill != fill;
}

/// Garis rata-rata keseluruhan tiap periode (tertua ke terbaru); minimal dua periode bernilai.
class TrendChart extends StatelessWidget {
  const TrendChart({super.key, required this.list, this.selectedId});

  final List<Assessment> list;
  final String? selectedId;

  @override
  Widget build(BuildContext context) {
    final scored = [for (final a in newestFirst(list).reversed) if (a.overall != null) a];
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Grafik rata-rata skor per periode',
      child: SizedBox(
        height: 170,
        child: CustomPaint(
          size: Size.infinite,
          painter: _TrendPainter(
            names: [for (final a in scored) a.period.name],
            values: [for (final a in scored) a.overall!],
            selected: scored.indexWhere((a) => a.period.id == selectedId),
            grid: scheme.outlineVariant,
            line: scheme.primary,
            labelStyle: TextStyle(color: scheme.onSurfaceVariant, fontSize: 10),
            valueStyle: TextStyle(color: scheme.onSurface, fontSize: 11, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter({required this.names, required this.values, required this.selected, required this.grid, required this.line, required this.labelStyle, required this.valueStyle});

  final List<String> names;
  final List<double> values;
  final int selected;
  final Color grid, line;
  final TextStyle labelStyle, valueStyle;

  @override
  void paint(Canvas canvas, Size size) {
    const left = 26.0, right = 14.0, top = 22.0, bottom = 34.0;
    final w = size.width - left - right;
    final h = size.height - top - bottom;
    double x(int i) => left + (values.length == 1 ? w / 2 : i * w / (values.length - 1));
    double y(double v) => top + h * (1 - v / scoreMax);
    final gridPaint = Paint()
      ..strokeWidth = 1
      ..color = grid;
    for (final v in const [0, 5, 10]) {
      canvas.drawLine(Offset(left, y(v.toDouble())), Offset(size.width - right, y(v.toDouble())), gridPaint);
      final tp = TextPainter(text: TextSpan(text: '$v', style: labelStyle), textDirection: TextDirection.ltr)..layout();
      tp.paint(canvas, Offset(left - 6 - tp.width, y(v.toDouble()) - tp.height / 2));
    }
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      i == 0 ? path.moveTo(x(i), y(values[i])) : path.lineTo(x(i), y(values[i]));
    }
    canvas.drawPath(
        path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.5
          ..color = line);
    for (var i = 0; i < values.length; i++) {
      final active = i == selected || (selected < 0 && i == values.length - 1);
      canvas.drawCircle(Offset(x(i), y(values[i])), active ? 6 : 4.5, Paint()..color = active ? line : Colors.white);
      canvas.drawCircle(
          Offset(x(i), y(values[i])),
          active ? 6 : 4.5,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = line);
      final vp = TextPainter(text: TextSpan(text: scoreText(values[i]), style: valueStyle), textDirection: TextDirection.ltr)..layout();
      vp.paint(canvas, Offset(x(i) - vp.width / 2, y(values[i]) - 20));
      final np = TextPainter(
        text: TextSpan(text: names[i], style: labelStyle),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: (w / values.length).clamp(40, 120).toDouble());
      np.paint(canvas, Offset(x(i) - np.width / 2, size.height - bottom + 12));
    }
  }

  @override
  bool shouldRepaint(_TrendPainter old) => old.values != values || old.names != names || old.selected != selected;
}

/// Judul bagian di dalam halaman.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
        child: Row(
          children: [
            Expanded(child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
            ?trailing,
          ],
        ),
      );
}

/// Pilihan periode (chip bergulir) dari daftar penilaian.
class PeriodChips extends StatelessWidget {
  const PeriodChips({super.key, required this.names, required this.selected, required this.onSelect});

  /// `id -> nama`, urut tampil.
  final List<({String id, String name})> names;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final p in names)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: Text(p.name), selected: p.id == selected, onSelected: (_) => onSelect(p.id)),
              ),
          ],
        ),
      );
}

/// Rata-rata keseluruhan dalam lingkaran, dengan warna pita skor.
class OverallBadge extends StatelessWidget {
  const OverallBadge(this.overall, {super.key, this.size = 72});

  final double? overall;
  final double size;

  @override
  Widget build(BuildContext context) {
    final color = overall == null ? Theme.of(context).colorScheme.outline : bandColor(scoreBand(overall!).code);
    return Semantics(
      label: overall == null ? 'Belum ada nilai' : 'Rata-rata ${scoreText(overall!)} dari 10',
      child: Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color.withValues(alpha: 0.12), border: Border.all(color: color, width: 2.5)),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(overall == null ? '–' : scoreText(overall!), style: TextStyle(fontSize: size * 0.34, fontWeight: FontWeight.w800, color: color, height: 1)),
            Text('RATA', style: TextStyle(fontSize: size * 0.13, color: color, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

/// Chip tren: naik, turun, stabil, atau baru, dengan selisihnya.
class TrendChip extends StatelessWidget {
  const TrendChip(this.trend, {super.key});

  final Trend trend;

  @override
  Widget build(BuildContext context) {
    final (label, icon, color) = switch (trend.direction) {
      TrendDirection.naik => ('Naik', Icons.trending_up, const Color(0xFF2E7D32)),
      TrendDirection.turun => ('Perlu perhatian', Icons.trending_down, const Color(0xFFC62828)),
      TrendDirection.tetap => ('Stabil', Icons.trending_flat, const Color(0xFF546E7A)),
      TrendDirection.baru => ('Baru', Icons.fiber_new, const Color(0xFF546E7A)),
    };
    final d = trend.delta;
    final text = d == null || d == 0 || trend.direction == TrendDirection.baru ? label : '$label (${d > 0 ? '+' : ''}${scoreText(d)})';
    return Chip(
      avatar: Icon(icon, size: 18, color: color),
      label: Text(text, style: TextStyle(color: color, fontWeight: FontWeight.w600)),
      visualDensity: VisualDensity.compact,
      side: BorderSide(color: color.withValues(alpha: 0.4)),
      backgroundColor: color.withValues(alpha: 0.08),
    );
  }
}

/// Skor per aspek: rata-rata aspek dan batang tiap indikator, dengan kata pita.
class AspectScoreCards extends StatelessWidget {
  const AspectScoreCards(this.assessment, {super.key});

  final Assessment assessment;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        for (final avg in assessment.aspects)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text(avg.aspect.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                      Text('rata-rata ${scoreText(avg.average)}', style: TextStyle(color: scheme.outline, fontSize: 13)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  for (final s in assessment.scoresOf(avg.aspect)) _ScoreBar(name: s.name, score: s.score),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _ScoreBar extends StatelessWidget {
  const _ScoreBar({required this.name, required this.score});

  final String name;
  final int score;

  @override
  Widget build(BuildContext context) {
    final band = scoreBand(score);
    final color = bandColor(band.code);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Semantics(
        label: '$name: $score dari 10, ${band.label}',
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(name)),
                Text(band.label, style: TextStyle(color: color, fontSize: 12)),
                const SizedBox(width: 8),
                Text('$score', style: TextStyle(color: color, fontWeight: FontWeight.w800, fontSize: 16)),
              ],
            ),
            const SizedBox(height: 3),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(value: score / scoreMax, minHeight: 6, color: color, backgroundColor: color.withValues(alpha: 0.12)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rencana pengembangan satu periode (baca saja).
class PlanList extends StatelessWidget {
  const PlanList(this.items, {super.key, this.emptyText});

  final List<PlanItem> items;

  /// Pesan bila kosong; null berarti tidak menampilkan apa pun.
  final String? emptyText;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (items.isEmpty) {
      return emptyText == null ? const SizedBox.shrink() : Padding(padding: const EdgeInsets.all(8), child: Text(emptyText!, style: TextStyle(color: scheme.outline)));
    }
    return Column(
      children: [
        for (final x in items)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: Icon(Icons.flag_outlined, color: scheme.primary),
              title: Text(x.area, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: [
                if (x.target != null) 'Target: ${x.target}',
                if (x.note != null) x.note!,
              ].isEmpty
                  ? null
                  : Text([if (x.target != null) 'Target: ${x.target}', if (x.note != null) x.note!].join('\n')),
              trailing: x.aspect == null ? null : Chip(label: Text(x.aspect!.label), visualDensity: VisualDensity.compact),
            ),
          ),
      ],
    );
  }
}

/// Banner "Menunggu sinyal" untuk perubahan yang tersimpan di perangkat dan belum terkirim.
class PendingBanner extends StatelessWidget {
  const PendingBanner(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: scheme.tertiaryContainer, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Icon(Icons.cloud_off, color: scheme.onTertiaryContainer),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: TextStyle(color: scheme.onTertiaryContainer))),
        ],
      ),
    );
  }
}

/// Tanggal singkat dari ISO (yyyy-MM-dd atau waktu penuh): "17 Nov 2026".
String dateText(String iso) => DateFormat('d MMM yyyy', 'id_ID').format(parseDate(iso));
