import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/widgets.dart';
import 'session_tile.dart';

/// Jadwal latihan: 7 hari lalu sampai 30 hari ke depan, terbaru di atas yang terlewat.
class SchedulePage extends StatelessWidget {
  const SchedulePage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final now = DateTime.now();
    return LoadView<List<TrainingSession>>(
      load: () => repo.sessions(from: isoDate(now.subtract(const Duration(days: 7))), to: isoDate(now.add(const Duration(days: 30)))),
      builder: (context, all) {
        if (all.isEmpty) return const EmptyState('Belum ada jadwal latihan.');
        final upcoming = all.where((s) => s.date.compareTo(today()) >= 0).toList();
        final past = all.where((s) => s.date.compareTo(today()) < 0).toList().reversed.toList();
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            for (final s in upcoming) SessionTile(s),
            if (past.isNotEmpty) ...[
              Padding(
                padding: const EdgeInsets.only(top: 16, bottom: 8),
                child: Text('Sudah lewat', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Theme.of(context).colorScheme.outline, fontWeight: FontWeight.w700)),
              ),
              for (final s in past) SessionTile(s),
            ],
          ],
        );
      },
    );
  }
}
