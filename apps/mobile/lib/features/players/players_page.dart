import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_players.dart';
import '../../core/repo_players.dart';
import '../../core/repository.dart';
import '../../core/widgets.dart';
import 'player_widgets.dart';

typedef _Roster = ({List<PlayerSummary> players, Map<String, PlayerOverview> overview});

/// Daftar siswa. Pelatih melihat siswa di KU yang ditugaskan, orang tua melihat anaknya;
/// pembatasan itu dilakukan server. Rating terakhir tiap siswa dari `/players-overview`.
class PlayersPage extends StatefulWidget {
  const PlayersPage({super.key});

  @override
  State<PlayersPage> createState() => _PlayersPageState();
}

class _PlayersPageState extends State<PlayersPage> {
  late final Repository _repo = context.read<Repository>();
  late final PlayersRepo _players = PlayersRepo(context.read<ApiClient>());
  String _q = '';

  Future<_Roster> _load() async {
    // Rating hanya pelengkap: `overview()` tidak melempar, jadi daftar tetap tampil bila ringkasan gagal.
    final results = await Future.wait<Object>([_repo.players(), _players.overview()]);
    return (players: results[0] as List<PlayerSummary>, overview: results[1] as Map<String, PlayerOverview>);
  }

  @override
  Widget build(BuildContext context) {
    return LoadView<_Roster>(
      load: _load,
      builder: (context, data) {
        final all = data.players;
        final q = _q.trim().toLowerCase();
        final list = q.isEmpty ? all : all.where((p) => p.fullName.toLowerCase().contains(q) || (p.memberNo ?? '').toLowerCase().contains(q)).toList();
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            if (all.length > 6)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  onChanged: (v) => setState(() => _q = v),
                  decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Cari nama atau nomor anggota', border: OutlineInputBorder()),
                ),
              ),
            if (list.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Tidak ada siswa.'))),
            for (final p in list)
              Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  leading: PlayerAvatar(id: p.id, name: p.fullName, photoV: p.photoV),
                  title: Text(p.fullName),
                  subtitle: Text([?p.ageGroup?.name, ?p.position, '${ageOf(p.birthDate)} th'].join(' · ')),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _RatingChip(data.overview[p.id]),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                  onTap: () => context.push('/siswa/${Uri.encodeComponent(p.id)}', extra: p),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Rating terakhir siswa; kosong bila belum ada nilai.
class _RatingChip extends StatelessWidget {
  const _RatingChip(this.overview);

  final PlayerOverview? overview;

  @override
  Widget build(BuildContext context) {
    final o = overview?.overall;
    if (o == null) return const SizedBox.shrink();
    final color = bandColor(scoreBand(o).code);
    return Semantics(
      label: 'Rata-rata nilai ${scoreText(o)} dari 10',
      excludeSemantics: true,
      child: Container(
        margin: const EdgeInsets.only(right: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
        child: Text(scoreText(o), style: TextStyle(color: color, fontWeight: FontWeight.w800)),
      ),
    );
  }
}
