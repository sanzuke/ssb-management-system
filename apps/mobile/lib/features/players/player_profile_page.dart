import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_players.dart';
import '../../core/repo_players.dart';
import '../../core/repository.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'player_widgets.dart';
import 'profile_sections.dart';
import 'sheets.dart';

class _ProfileData {
  _ProfileData({required this.player, required this.assessments, required this.injuries, required this.badges, required this.mvi, required this.attendance});

  final PlayerDetail player;
  final List<Assessment> assessments;
  final List<PlayerInjury> injuries;
  final List<PlayerBadge> badges;
  final MviView? mvi;
  final AttendanceRow? attendance;

  _ProfileData copyWith({List<PlayerInjury>? injuries, List<PlayerBadge>? badges}) =>
      _ProfileData(player: player, assessments: assessments, injuries: injuries ?? this.injuries, badges: badges ?? this.badges, mvi: mvi, attendance: attendance);
}

/// Profil siswa: rating, radar enam aspek, tren, lencana, cedera, indeks nilai, dan kehadiran
/// (padanan `/pemain/[id]` di web). Bisa dibuka dengan [initial] dari daftar atau hanya dengan id.
class PlayerProfilePage extends StatefulWidget {
  const PlayerProfilePage({super.key, required this.playerId, this.initial});

  final String playerId;
  final PlayerSummary? initial;

  @override
  State<PlayerProfilePage> createState() => _PlayerProfilePageState();
}

class _PlayerProfilePageState extends State<PlayerProfilePage> {
  late final PlayersRepo _repo = PlayersRepo(context.read<ApiClient>());
  late final Repository _core = context.read<Repository>();
  _ProfileData? _data;
  Object? _error;
  String? _periodId;

  Role? get _role => context.read<SessionController>().role;

  /// Pelatih (dan admin) mengisi nilai, mencatat cedera, dan memberi lencana; izin sebenarnya dijaga server.
  bool get _canWrite => _role == Role.pelatih || _role == Role.adminSsb;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Hanya detail siswa yang wajib; bagian lain yang gagal dimuat tampil kosong, seperti di web.
  Future<T> _soft<T>(Future<T> f, T fallback) => f.catchError((Object e) {
        if (e is ApiException && e.isUnauthorized) throw e;
        return fallback;
      });

  Future<void> _load() async {
    try {
      final id = widget.playerId;
      final player = await _repo.player(id);
      final results = await Future.wait<Object?>([
        _soft<List<Assessment>>(_repo.assessments(id), []),
        _soft<List<PlayerInjury>>(_repo.injuries(id), []),
        _soft<List<PlayerBadge>>(_repo.badges(id), []),
        _soft<MviView?>(_repo.marketValue(id), null),
        _soft<List<AttendanceRow>>(_core.attendanceSummary(), []),
      ]);
      if (!mounted) return;
      setState(() {
        _error = null;
        _data = _ProfileData(
          player: player,
          assessments: results[0]! as List<Assessment>,
          injuries: results[1]! as List<PlayerInjury>,
          badges: results[2]! as List<PlayerBadge>,
          mvi: results[3] as MviView?,
          attendance: (results[4]! as List<AttendanceRow>).where((r) => r.playerId == id).firstOrNull,
        );
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _open(String path) async {
    await context.push(path);
    if (mounted) await _load();
  }

  Future<void> _addInjury() async {
    final list = await showInjurySheet(context, repo: _repo, playerId: widget.playerId);
    if (list != null && mounted) setState(() => _data = _data!.copyWith(injuries: list));
  }

  Future<void> _editInjury(PlayerInjury i) async {
    final list = await showInjurySheet(context, repo: _repo, playerId: widget.playerId, edit: i);
    if (list != null && mounted) setState(() => _data = _data!.copyWith(injuries: list));
  }

  Future<void> _recover(PlayerInjury i) async {
    final ok = await confirmAction(context, title: 'Tandai pulih', message: 'Cedera ${bodyPartLabel(i.bodyPart)} ditandai pulih hari ini. Catatannya tetap tersimpan di riwayat.', action: 'Tandai pulih');
    if (!ok || !mounted) return;
    try {
      final list = await _repo.recoverInjury(widget.playerId, i.id);
      if (mounted) setState(() => _data = _data!.copyWith(injuries: list));
    } catch (e) {
      if (mounted) showMessage(context, errorText(e));
    }
  }

  Future<void> _addBadge() => showBadgeSheet(
        context,
        repo: _repo,
        playerId: widget.playerId,
        current: _data!.badges,
        onChanged: (list) {
          if (mounted) setState(() => _data = _data!.copyWith(badges: list));
        },
      );

  Future<void> _revokeBadge(PlayerBadge b) async {
    try {
      await _repo.revokeBadge(widget.playerId, b.id);
      final list = await _repo.badges(widget.playerId);
      if (mounted) setState(() => _data = _data!.copyWith(badges: list));
    } catch (e) {
      if (mounted) showMessage(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _data?.player.fullName ?? widget.initial?.fullName ?? 'Profil siswa';
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: _body(),
    );
  }

  Widget _body() {
    final err = _error;
    if (err != null && _data == null) {
      final notFound = err is ApiException && err.status == 404;
      return ListView(
        padding: const EdgeInsets.all(32),
        children: [
          const SizedBox(height: 48),
          Icon(notFound ? Icons.person_off : Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.outline),
          const SizedBox(height: 12),
          Text(notFound ? 'Siswa tidak ditemukan, atau bukan bagian dari KU atau anak yang bisa Anda akses.' : errorText(err), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          if (!notFound) Center(child: FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi'))),
        ],
      );
    }
    final d = _data;
    if (d == null) {
      final p = widget.initial;
      return Center(
        child: p == null ? const CircularProgressIndicator() : Column(mainAxisSize: MainAxisSize.min, children: [PlayerAvatar(id: p.id, name: p.fullName, photoV: p.photoV, radius: 40), const SizedBox(height: 16), const CircularProgressIndicator()]),
      );
    }
    final role = _role;
    final staff = role != Role.orangTua;
    final cur = pickAssessment(d.assessments, _periodId);
    final prev = cur == null ? null : previousScored(d.assessments, cur);
    final trend = trendUpTo(d.assessments, cur);
    final delta = cur == null ? null : overallDelta(cur, prev);
    final activeInjury = d.injuries.where((i) => i.ongoing).firstOrNull;
    final scored = d.assessments.where((a) => a.overall != null).length;
    final scheme = Theme.of(context).colorScheme;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _Header(player: d.player, assessment: cur, trend: trend, injury: activeInjury, staff: staff),
          const SizedBox(height: 12),
          _Actions(
            role: role,
            playerId: d.player.id,
            onOpen: _open,
          ),
          if (cur == null) ...[
            const SectionTitle('Penilaian'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(staff ? 'Belum ada penilaian untuk siswa ini.' : 'Belum ada penilaian untuk siswa ini, atau belum diterbitkan oleh SSB.', style: TextStyle(color: scheme.outline)),
              ),
            ),
          ] else ...[
            if (d.assessments.length > 1) ...[
              const SizedBox(height: 16),
              PeriodChips(names: [for (final a in newestFirst(d.assessments)) (id: a.period.id, name: a.period.name)], selected: cur.period.id, onSelect: (id) => setState(() => _periodId = id)),
            ],
            SectionTitle(
              'Radar performa',
              trailing: delta == null
                  ? null
                  : Text(
                      '${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}${scoreText(delta)} rata-rata',
                      style: TextStyle(color: delta < 0 ? scheme.error : const Color(0xFF2E7D32), fontWeight: FontWeight.w600),
                    ),
            ),
            Card(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                child: Column(
                  children: [
                    if (cur.aspects.length >= 3) RadarChart(current: cur, previous: prev) else Padding(padding: const EdgeInsets.all(16), child: Text('Radar muncul bila minimal tiga aspek sudah punya skor. Saat ini ${cur.aspects.length} aspek terisi.', style: TextStyle(color: scheme.outline))),
                    Wrap(
                      spacing: 16,
                      children: [
                        _Legend(color: scheme.primary, label: cur.period.name),
                        if (prev != null) _Legend(color: const Color(0xFFB8861B), label: prev.period.name, dashed: true),
                      ],
                    ),
                    if (staff && !cur.published)
                      Padding(padding: const EdgeInsets.only(top: 8), child: Text('Belum diterbitkan ke orang tua.', style: TextStyle(color: scheme.outline, fontSize: 12))),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            _AspectTiles(assessment: cur),
            if (scored > 1) ...[
              const SectionTitle('Perkembangan'),
              Card(child: Padding(padding: const EdgeInsets.fromLTRB(8, 12, 8, 8), child: TrendChart(list: d.assessments, selectedId: cur.period.id))),
            ],
            if (cur.note != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text.rich(TextSpan(children: [const TextSpan(text: 'Catatan pelatih: ', style: TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: cur.note)])),
              ),
          ],
          BadgesSection(
            badges: d.badges,
            onAward: _canWrite ? _addBadge : null,
            onRevoke: _canWrite ? _revokeBadge : null,
          ),
          InjuriesSection(
            injuries: d.injuries,
            onAdd: _canWrite ? _addInjury : null,
            onEdit: _canWrite ? _editInjury : null,
            onRecover: _canWrite ? _recover : null,
          ),
          MviSection(view: d.mvi),
          AttendanceSection(row: d.attendance),
          PlayerInfoCard(player: d.player),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.player, required this.assessment, required this.trend, required this.injury, required this.staff});

  final PlayerDetail player;
  final Assessment? assessment;
  final Trend trend;
  final PlayerInjury? injury;
  final bool staff;

  @override
  Widget build(BuildContext context) {
    final s = player.summary;
    final scheme = Theme.of(context).colorScheme;
    final pos = s.position == null ? null : positionLabel[s.position] ?? s.position;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                PlayerAvatar(id: s.id, name: s.fullName, photoV: s.photoV, radius: 38),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(s.fullName, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                      if (s.memberNo != null) Text(s.memberNo!, style: TextStyle(color: scheme.outline)),
                      const SizedBox(height: 4),
                      Text([s.ageGroup?.name ?? 'Belum ada KU', ?pos, '${ageOf(s.birthDate)} th'].join(' · ')),
                    ],
                  ),
                ),
                OverallBadge(assessment?.overall),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (assessment?.overall != null) TrendChip(trend),
                if (injury != null)
                  Chip(
                    avatar: Icon(Icons.healing, size: 18, color: scheme.error),
                    label: Text('Cedera: ${bodyPartLabel(injury!.bodyPart)}', style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600)),
                    visualDensity: VisualDensity.compact,
                  ),
                if (player.status != 'aktif') Chip(label: Text(playerStatusLabel[player.status] ?? player.status), visualDensity: VisualDensity.compact),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Tombol aksi menurut peran: pelatih mengisi nilai dan rencana, korlas menerbitkan, orang tua membuka berkas dan kartu.
class _Actions extends StatelessWidget {
  const _Actions({required this.role, required this.playerId, required this.onOpen});

  final Role? role;
  final String playerId;
  final Future<void> Function(String path) onOpen;

  @override
  Widget build(BuildContext context) {
    final id = Uri.encodeComponent(playerId);
    Widget button(IconData icon, String label, String path, {bool primary = false}) {
      final child = Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 20), const SizedBox(width: 8), Text(label)]);
      final style = FilledButton.styleFrom(minimumSize: const Size(0, 48));
      return primary ? FilledButton(style: style, onPressed: () => onOpen(path), child: child) : FilledButton.tonal(style: style, onPressed: () => onOpen(path), child: child);
    }

    final buttons = switch (role) {
      Role.orangTua => [
          button(Icons.description_outlined, 'Rapor', '/siswa/$id/rapor', primary: true),
          button(Icons.folder_open, 'Berkas', '/berkas/$id'),
          button(Icons.qr_code_2, 'Kartu QR', '/kartu/$id'),
        ],
      Role.korlas => [
          button(Icons.fact_check_outlined, 'Penilaian dan terbit', '/siswa/$id/nilai', primary: true),
          button(Icons.description_outlined, 'Rapor', '/siswa/$id/rapor'),
        ],
      _ => [
          button(Icons.edit_note, 'Input nilai', '/siswa/$id/nilai', primary: true),
          button(Icons.flag_outlined, 'Rencana pengembangan', '/siswa/$id/rencana'),
          button(Icons.description_outlined, 'Rapor', '/siswa/$id/rapor'),
        ],
    };
    return Wrap(spacing: 8, runSpacing: 8, children: buttons);
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label, this.dashed = false});

  final Color color;
  final String label;
  final bool dashed;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(dashed ? '- - ' : '—— ', style: TextStyle(color: color, fontWeight: FontWeight.w800)),
          Text(label, style: const TextStyle(fontSize: 12)),
        ],
      );
}

/// Enam rata-rata aspek dengan warna dan kata pita.
class _AspectTiles extends StatelessWidget {
  const _AspectTiles({required this.assessment});

  final Assessment assessment;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, c) {
        final w = (c.maxWidth - 16) / 3;
        return Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final a in Aspect.values)
              SizedBox(
                width: w,
                child: Builder(builder: (context) {
                  final v = assessment.averageOf(a);
                  final color = v == null ? scheme.outline : bandColor(scoreBand(v).code);
                  return Semantics(
                    label: v == null ? '${a.label}: belum ada nilai' : '${a.label}: ${scoreText(v)} dari 10, ${scoreBand(v).label}',
                    excludeSemantics: true,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
                      decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withValues(alpha: 0.4))),
                      child: Column(
                        children: [
                          Text(a.short, style: TextStyle(fontSize: 12, color: scheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
                          Text(v == null ? '–' : scoreText(v), style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
                          Text(v == null ? '' : scoreBand(v).label, style: TextStyle(fontSize: 11, color: color)),
                        ],
                      ),
                    ),
                  );
                }),
              ),
          ],
        );
      },
    );
  }
}
