import 'dart:io';

import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/models_players.dart';
import '../../core/repo_players.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'player_widgets.dart';

class _ReportData {
  _ReportData(this.player, this.assessments);

  final PlayerDetail player;
  final List<Assessment> assessments;
}

/// Rapor hasil penilaian per periode: skor, radar, catatan, rencana pengembangan, dan unduh PDF
/// (padanan `HasilNilai` dan halaman penilaian orang tua di web). Orang tua hanya mendapat yang sudah terbit (dijaga server).
class ReportPage extends StatefulWidget {
  const ReportPage({super.key, required this.playerId});

  final String playerId;

  @override
  State<ReportPage> createState() => _ReportPageState();
}

class _ReportPageState extends State<ReportPage> {
  late final PlayersRepo _repo = PlayersRepo(context.read<ApiClient>());
  late final bool _staff = context.read<SessionController>().role != Role.orangTua;
  _ReportData? _data;
  Object? _error;
  String? _periodId;
  List<PlanItem> _plan = [];
  bool _planLoading = false;
  bool _downloading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final player = await _repo.player(widget.playerId);
      final list = await _repo.assessments(widget.playerId);
      if (!mounted) return;
      setState(() {
        _error = null;
        _data = _ReportData(player, list);
      });
      await _loadPlan();
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Assessment? get _current {
    final d = _data;
    return d == null ? null : pickAssessment(d.assessments, _periodId);
  }

  /// Rencana periode yang tampil; bila tidak bisa dimuat dianggap kosong, seperti di web.
  Future<void> _loadPlan() async {
    final cur = _current;
    if (cur == null) return;
    setState(() => _planLoading = true);
    List<PlanItem> items;
    try {
      items = await _repo.plan(widget.playerId, cur.period.id);
    } on ApiException {
      items = [];
    }
    if (mounted && cur.period.id == _current?.period.id) {
      setState(() {
        _plan = items;
        _planLoading = false;
      });
    }
  }

  Future<void> _select(String id) async {
    setState(() {
      _periodId = id;
      _plan = [];
    });
    await _loadPlan();
  }

  Future<void> _download(Assessment cur) async {
    setState(() => _downloading = true);
    try {
      final bytes = await _repo.reportPdf(widget.playerId, cur.period.id);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}${Platform.pathSeparator}${reportFileName(_data!.player.fullName, cur.period.name)}');
      await file.writeAsBytes(bytes, flush: true);
      final res = await OpenFilex.open(file.path, type: 'application/pdf');
      if (!mounted) return;
      if (res.type == ResultType.noAppToOpen) {
        showMessage(context, 'Rapor tersimpan, tetapi tidak ada aplikasi PDF di perangkat ini untuk membukanya.');
      } else if (res.type != ResultType.done) {
        showMessage(context, 'Rapor tersimpan, tetapi tidak bisa dibuka: ${res.message}');
      }
    } on FileSystemException {
      if (mounted) showMessage(context, 'Rapor tidak bisa disimpan di perangkat ini.');
    } catch (e) {
      if (mounted) showMessage(context, errorText(e));
    } finally {
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_data == null ? 'Rapor' : 'Rapor ${_data!.player.fullName}')),
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
          Text(notFound ? 'Siswa tidak ditemukan, atau bukan bagian dari KU atau anak yang bisa Anda akses.' : errorText(err), textAlign: TextAlign.center),
          const SizedBox(height: 16),
          if (!notFound) Center(child: FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi'))),
        ],
      );
    }
    final d = _data;
    if (d == null) return const Center(child: CircularProgressIndicator());
    final scheme = Theme.of(context).colorScheme;
    final cur = _current;
    if (cur == null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: EmptyState(_staff
            ? 'Belum ada penilaian untuk ${d.player.fullName}.'
            : 'Belum ada rapor yang diterbitkan untuk ${d.player.fullName}. Rapor muncul di sini setelah SSB menerbitkannya.'),
      );
    }
    final prev = previousScored(d.assessments, cur);
    final delta = overallDelta(cur, prev);
    final scored = d.assessments.where((a) => a.overall != null).length;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          if (d.assessments.length > 1) ...[
            PeriodChips(names: [for (final a in newestFirst(d.assessments)) (id: a.period.id, name: a.period.name)], selected: cur.period.id, onSelect: _select),
            const SizedBox(height: 12),
          ],
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      OverallBadge(cur.overall, size: 80),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(cur.period.name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                            Text('Dinilai ${dateText(cur.assessedOn)}${cur.assessor == null ? '' : ' oleh ${cur.assessor}'}', style: TextStyle(color: scheme.outline, fontSize: 13)),
                            if (delta != null)
                              Text(
                                '${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '= '}${scoreText(delta)} dari ${prev!.period.name}',
                                style: TextStyle(color: delta < 0 ? scheme.error : const Color(0xFF2E7D32), fontWeight: FontWeight.w600, fontSize: 13),
                              ),
                            if (_staff && !cur.published) Text('Belum diterbitkan ke orang tua', style: TextStyle(color: scheme.outline, fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: _downloading ? null : () => _download(cur),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    icon: _downloading ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.picture_as_pdf),
                    label: Text(_downloading ? 'Menyiapkan rapor…' : 'Unduh PDF'),
                  ),
                ],
              ),
            ),
          ),
          if (cur.aspects.length >= 3) ...[
            const SectionTitle('Profil aspek'),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  children: [
                    RadarChart(current: cur, previous: prev),
                    Text(prev == null ? cur.period.name : '${cur.period.name} (garis penuh) dibanding ${prev.period.name} (putus-putus)', style: TextStyle(color: scheme.outline, fontSize: 12), textAlign: TextAlign.center),
                  ],
                ),
              ),
            ),
          ],
          const SectionTitle('Rincian skor'),
          AspectScoreCards(cur),
          if (cur.note != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text.rich(TextSpan(children: [const TextSpan(text: 'Catatan pelatih: ', style: TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: cur.note)])),
            ),
          if (scored > 1) ...[
            const SectionTitle('Perkembangan'),
            Card(child: Padding(padding: const EdgeInsets.fromLTRB(8, 12, 8, 8), child: TrendChart(list: d.assessments, selectedId: cur.period.id))),
          ],
          if (_planLoading)
            const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
          else if (_plan.isNotEmpty) ...[
            const SectionTitle('Rencana pengembangan'),
            PlanList(_plan),
          ],
        ],
      ),
    );
  }
}
