import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/widgets.dart';

/// Kalender akademi per bulan: pertandingan, acara, dan libur (baca saja; pengelolaan di web).
class CalendarPage extends StatefulWidget {
  const CalendarPage({super.key, this.embedded = false});

  /// Tanpa bilah judul sendiri, saat dipakai sebagai isi tab.
  final bool embedded;

  @override
  State<CalendarPage> createState() => _CalendarPageState();
}

class _CalendarPageState extends State<CalendarPage> {
  late final ExtrasRepository _repo = ExtrasRepository.of(context);
  late String _month = today().substring(0, 7);

  /// Bulan `YYYY-MM` digeser [n] bulan.
  String _shift(int n) {
    final d = DateTime(int.parse(_month.substring(0, 4)), int.parse(_month.substring(5, 7)) + n);
    return '${d.year}-${d.month.toString().padLeft(2, '0')}';
  }

  Future<List<CalendarEvent>> _load() {
    final end = DateTime(int.parse(_month.substring(0, 4)), int.parse(_month.substring(5, 7)) + 1, 0);
    return _repo.calendar(from: '$_month-01', to: isoDate(end));
  }

  void _go(String month) => setState(() => _month = month);

  @override
  Widget build(BuildContext context) {
    final thisMonth = today().substring(0, 7);
    return Scaffold(
      appBar: widget.embedded ? null : AppBar(title: const Text('Kalender akademi')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
            child: Row(
              children: [
                IconButton(onPressed: () => _go(_shift(-1)), icon: const Icon(Icons.chevron_left), tooltip: 'Bulan sebelumnya'),
                Expanded(
                  child: Text(monthLabel('$_month-01'), textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                ),
                IconButton(onPressed: () => _go(_shift(1)), icon: const Icon(Icons.chevron_right), tooltip: 'Bulan berikutnya'),
              ],
            ),
          ),
          if (_month != thisMonth) TextButton(onPressed: () => _go(thisMonth), child: const Text('Bulan ini')),
          Expanded(
            // Key per bulan membuat LoadView memuat ulang saat bulan berganti.
            child: LoadView<List<CalendarEvent>>(
              key: ValueKey(_month),
              load: _load,
              builder: (context, events) {
                if (events.isEmpty) return EmptyState('Belum ada kegiatan pada ${monthLabel('$_month-01')}.');
                final days = groupCalendarByDay(events, '$_month-01');
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  children: [for (final d in days) _DayCard(date: d.key, events: d.value)],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({required this.date, required this.events});

  final String date;
  final List<CalendarEvent> events;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(dayLabel(date), style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700))),
                if (daysFromToday(date).abs() <= 1) Text(relativeDay(date), style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600, fontSize: 12)),
              ],
            ),
            for (final e in events) ...[const Divider(height: 24), _EventRow(e)],
          ],
        ),
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow(this.e);

  final CalendarEvent e;

  Color _color(BuildContext context) => switch (e.type) {
        CalendarEventType.pertandingan => const Color(0xFFC62828),
        CalendarEventType.latihan => const Color(0xFF2E7D32),
        CalendarEventType.acara => const Color(0xFF1565C0),
        CalendarEventType.libur => const Color(0xFFEF6C00),
        CalendarEventType.lainnya => Theme.of(context).colorScheme.outline,
      };

  String get _when {
    if (e.multiDay) {
      final range = '${shortDay(e.startDate)} – ${shortDay(e.endDate!)}';
      return e.startTime == null ? range : '$range · ${_time()}';
    }
    return e.startTime == null ? 'Sepanjang hari' : _time();
  }

  String _time() => 'Jam ${e.startTime}${e.endTime == null ? '' : '–${e.endTime}'}';

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = _color(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(e.title, style: Theme.of(context).textTheme.titleSmall)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
              child: Text(e.type.label, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text([_when, if (e.location.isNotEmpty) e.location].join(' · '), style: TextStyle(color: scheme.outline, fontSize: 13)),
        if (e.description.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(e.description, style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13))),
      ],
    );
  }
}
