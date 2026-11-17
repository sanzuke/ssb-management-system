import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../core/repository.dart';
import '../../core/widgets.dart';
import 'kid_selection.dart';

/// Isi tab untuk satu anak: kalau orang tua punya lebih dari satu anak, ada pilihan anak di atas
/// (seperti pemilih siswa pada "Mobile App Hub" di landing). Pilihannya dibagi dengan tab lain lewat [KidSelection].
class KidTab extends StatefulWidget {
  const KidTab({super.key, required this.builder});

  final Widget Function(BuildContext context, PlayerSummary kid) builder;

  @override
  State<KidTab> createState() => _KidTabState();
}

class _KidTabState extends State<KidTab> {
  late final Future<List<PlayerSummary>> _kids = context.read<Repository>().players();

  @override
  Widget build(BuildContext context) {
    final selection = context.watch<KidSelection>();
    return FutureBuilder<List<PlayerSummary>>(
      future: _kids,
      builder: (context, snap) {
        if (snap.connectionState != ConnectionState.done) return const SkeletonList(count: 3);
        if (snap.hasError) return EmptyState(errorText(snap.error!), icon: Icons.cloud_off);
        final kids = snap.data!;
        if (kids.isEmpty) return const EmptyState('Belum ada anak yang terhubung ke akun ini.', icon: Icons.child_care_outlined);
        final kid = selection.pick(kids);
        return Column(
          children: [
            KidChips(kids: kidOptions(kids), selectedId: kid.id, onSelect: (id) => selection.select(id!)),
            Expanded(child: KeyedSubtree(key: ValueKey(kid.id), child: widget.builder(context, kid))),
          ],
        );
      },
    );
  }
}
