import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'session_tile.dart';

/// Beranda pelatih: latihan hari ini dan yang berikutnya.
class TodayPage extends StatelessWidget {
  const TodayPage({super.key});

  @override
  Widget build(BuildContext context) {
    final repo = context.read<Repository>();
    final name = context.read<SessionController>().me?.name ?? '';
    return LoadView<List<TrainingSession>>(
      load: () => repo.sessions(from: today(), to: isoDate(DateTime.now().add(const Duration(days: 14)))),
      builder: (context, all) {
        final now = all.where((s) => s.date == today()).toList();
        final next = all.where((s) => s.date != today()).take(5).toList();
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text('Halo, ${name.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
            Text(dayLabel(today()), style: TextStyle(color: Theme.of(context).colorScheme.outline)),
            const SizedBox(height: 20),
            _Heading('Latihan hari ini'),
            if (now.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('Tidak ada latihan hari ini.')),
            for (final s in now) SessionTile(s, showDate: false),
            if (next.isNotEmpty) ...[
              const SizedBox(height: 16),
              _Heading('Berikutnya'),
              for (final s in next) SessionTile(s),
            ],
          ],
        );
      },
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: Theme.of(context).colorScheme.outline, fontWeight: FontWeight.w700)),
      );
}
