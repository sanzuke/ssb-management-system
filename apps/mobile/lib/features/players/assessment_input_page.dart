import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_players.dart';
import '../../core/outbox.dart';
import '../../core/repo_players.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'player_widgets.dart';
import 'sheets.dart';

/// Input nilai satu siswa per periode (padanan `/nilai/[id]` di web). Pelatih mengisi skor 1 sampai 10
/// per indikator dan menyimpan lewat antrean offline; korlas melihat hasil dan menerbitkan ke orang tua.
class AssessmentInputPage extends StatefulWidget {
  const AssessmentInputPage({super.key, required this.playerId});

  final String playerId;

  @override
  State<AssessmentInputPage> createState() => _AssessmentInputPageState();
}

class _AssessmentInputPageState extends State<AssessmentInputPage> {
  late final PlayersRepo _repo = PlayersRepo(context.read<ApiClient>());
  late final Outbox _outbox = context.read<Outbox>();
  late final Role? _role = context.read<SessionController>().role;

  PlayerDetail? _player;
  List<Period> _periods = [];
  List<Indicator> _indicators = [];
  List<Assessment> _assessments = [];
  String? _periodId;
  Map<String, int> _scores = {};
  final TextEditingController _note = TextEditingController();
  bool _dirty = false;
  bool _saving = false;
  bool _publishing = false;
  bool _hadPending = false;
  Object? _loadError;
  String? _notice;
  String? _error;
  List<HistoryRow>? _history;

  bool get _canWrite => _role == Role.pelatih || _role == Role.adminSsb;
  bool get _canPublish => _role == Role.korlas || _role == Role.adminSsb;
  String get _key => 'assessment:${widget.playerId}:$_periodId';
  Assessment? get _current => _assessments.where((a) => a.period.id == _periodId).firstOrNull;

  @override
  void initState() {
    super.initState();
    _outbox.addListener(_onOutbox);
    _load();
  }

  @override
  void dispose() {
    _outbox.removeListener(_onOutbox);
    _note.dispose();
    super.dispose();
  }

  /// Saat antrean terkirim (sinyal kembali), ambil penilaian dari server agar tampilan sama dengan data tersimpan.
  void _onOutbox() {
    final pending = _periodId != null && _outbox.has(_key);
    if (_hadPending && !pending) _refreshAssessments();
    _hadPending = pending;
  }

  Future<void> _refreshAssessments() async {
    try {
      final list = await _repo.assessments(widget.playerId);
      if (!mounted) return;
      setState(() {
        _assessments = list;
        if (!_dirty) _fill();
        _resetHistory();
      });
    } on ApiException {
      // Tampilan lama tetap dipakai; layar bisa ditarik untuk muat ulang.
    }
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final player = await _repo.player(widget.playerId);
      final results = await Future.wait<Object>([
        _repo.assessments(widget.playerId),
        _repo.periods(),
        if (_canWrite && player.summary.ageGroup != null) _repo.indicators(player.summary.ageGroup!.id),
      ]);
      if (!mounted) return;
      setState(() {
        _player = player;
        _assessments = results[0] as List<Assessment>;
        _periods = results[1] as List<Period>;
        _indicators = results.length > 2 ? [for (final i in results[2] as List<Indicator>) if (i.active) i] : [];
        _periodId ??= defaultPeriod(_periods, today())?.id;
        _fill();
      });
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  /// Mengisi form dari draf antrean offline bila ada, kalau tidak dari penilaian tersimpan.
  void _fill() {
    final queued = _periodId == null ? null : _outbox.bodyFor(_key);
    final queuedScores = scoresFromBody(queued);
    final cur = _current;
    if (queuedScores != null) {
      _scores = queuedScores;
      _note.text = noteFromBody(queued) ?? '';
    } else {
      _scores = {for (final s in cur?.scores ?? const <AssessmentScore>[]) s.indicatorId: s.score};
      _note.text = cur?.note ?? '';
    }
    _dirty = false;
    _hadPending = _periodId != null && _outbox.has(_key);
  }

  Future<bool> _confirmLeave() => confirmAction(context, title: 'Perubahan belum disimpan', message: 'Skor yang Anda isi akan hilang jika keluar.', action: 'Keluar');

  Future<void> _pickPeriod(String id) async {
    if (id == _periodId) return;
    if (_dirty && !await _confirmLeave()) return;
    if (!mounted) return;
    setState(() {
      _periodId = id;
      _history = null;
      _notice = null;
      _error = null;
      _fill();
    });
  }

  void _setScore(String indicatorId, int v) => setState(() {
        _scores = {..._scores, indicatorId: v.clamp(scoreMin, scoreMax)};
        _dirty = true;
        _notice = null;
        _error = null;
      });

  Future<void> _save() async {
    final player = _player!;
    final periodId = _periodId!;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      final res = await _outbox.submit(OutboxItem(
        key: _key,
        path: '/players/${widget.playerId}/assessments/$periodId',
        body: assessmentBody(indicators: _indicators, scores: _scores, note: _note.text),
        label: 'Nilai ${player.fullName}',
      ));
      if (!mounted) return;
      setState(() {
        _dirty = false;
        if (res.queued) {
          _notice = 'Tersimpan di perangkat. Dikirim otomatis begitu ada sinyal.';
        } else {
          final saved = Assessment.fromJson(res.data as Map<String, dynamic>);
          _assessments = [saved, for (final a in _assessments) if (a.period.id != saved.period.id) a];
          _resetHistory();
          _notice = 'Penilaian disimpan. Anda masih bisa mengubahnya.';
        }
        _hadPending = _outbox.has(_key);
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _publish(bool on) async {
    final ok = await confirmAction(
      context,
      title: on ? 'Terbitkan ke orang tua' : 'Tarik dari orang tua',
      message: on ? 'Orang tua bisa melihat penilaian periode ini setelah diterbitkan.' : 'Orang tua tidak akan lagi melihat penilaian periode ini.',
      action: on ? 'Terbitkan' : 'Tarik',
    );
    if (!ok || !mounted) return;
    setState(() {
      _publishing = true;
      _error = null;
      _notice = null;
    });
    try {
      final a = await _repo.publish(widget.playerId, _periodId!, on: on);
      if (!mounted) return;
      setState(() {
        _assessments = [a, for (final x in _assessments) if (x.period.id != a.period.id) x];
        _notice = on ? 'Penilaian diterbitkan. Orang tua sekarang bisa melihatnya.' : 'Penilaian ditarik. Orang tua tidak lagi melihatnya.';
      });
    } catch (e) {
      if (mounted) setState(() => _error = publishErrorText(e));
    } finally {
      if (mounted) setState(() => _publishing = false);
    }
  }

  void _resetHistory() {
    if (_history == null) return;
    _history = null;
    _fetchHistory();
  }

  Future<void> _loadHistory(bool open) async {
    if (open && _history == null) await _fetchHistory();
  }

  Future<void> _fetchHistory() async {
    try {
      final h = await _repo.history(widget.playerId, _periodId!);
      if (mounted) setState(() => _history = h);
    } on ApiException {
      if (mounted) setState(() => _history = []);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Memantau antrean agar banner "Menunggu sinyal" hilang sendiri setelah terkirim.
    context.watch<Outbox>();
    final p = _player;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final nav = Navigator.of(context);
        if (await _confirmLeave()) nav.pop();
      },
      child: Scaffold(
        appBar: AppBar(title: Text(p == null ? 'Penilaian' : 'Penilaian ${p.fullName}')),
        body: _body(),
        bottomNavigationBar: p != null && _canWrite && _indicators.isNotEmpty && _periodId != null ? _saveBar() : null,
      ),
    );
  }

  Widget _saveBar() {
    final filled = _indicators.where((i) => _scores[i.id] != null).length;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('$filled dari ${_indicators.length} indikator terisi', style: const TextStyle(fontWeight: FontWeight.w600)),
                  Text('Rata-rata sementara: ${runningAverage(_indicators, _scores) == null ? '–' : scoreText(runningAverage(_indicators, _scores)!)}', style: TextStyle(color: Theme.of(context).colorScheme.outline, fontSize: 12)),
                ],
              ),
            ),
            FilledButton.icon(
              onPressed: (_dirty && filled > 0 && !_saving) ? _save : null,
              style: FilledButton.styleFrom(minimumSize: const Size(140, 52)),
              icon: _saving ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save),
              label: Text(_dirty ? 'Simpan' : 'Tersimpan'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body() {
    if (_loadError != null) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(errorText(_loadError!), textAlign: TextAlign.center),
          const SizedBox(height: 12),
          FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi')),
        ]),
      );
    }
    final p = _player;
    if (p == null) return const Center(child: CircularProgressIndicator());
    final scheme = Theme.of(context).colorScheme;
    final cur = _current;
    final pending = _periodId != null && _outbox.has(_key);

    if (_periods.isEmpty) return const EmptyState('Belum ada periode. Admin perlu menambahkannya di Data master.');

    return RefreshIndicator(
      onRefresh: () async {
        if (_dirty) return;
        await _load();
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          Text([p.summary.memberNo, p.summary.ageGroup?.name ?? 'Belum ada KU', 'skala 1 sampai 10'].whereType<String>().join(' · '), style: TextStyle(color: scheme.outline)),
          const SizedBox(height: 12),
          if (pending) const PendingBanner('Menunggu sinyal. Nilai tersimpan di perangkat dan dikirim otomatis begitu ada sinyal.'),
          if (_error != null) _Message(_error!, error: true),
          if (_notice != null) _Message(_notice!),
          DropdownButtonFormField<String>(
            initialValue: _periodId,
            decoration: const InputDecoration(labelText: 'Periode', border: OutlineInputBorder()),
            items: [for (final x in _periods) DropdownMenuItem(value: x.id, child: Text(x.name))],
            onChanged: (v) => v == null ? null : _pickPeriod(v),
          ),
          const SizedBox(height: 12),
          if (cur != null) ...[
            Text(cur.published ? 'Sudah diterbitkan ke orang tua pada ${dateText(cur.publishedAt!)}.' : 'Belum diterbitkan ke orang tua.', style: TextStyle(color: scheme.outline)),
            if (_canPublish)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: cur.published
                    ? OutlinedButton(
                        onPressed: _publishing ? null : () => _publish(false),
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                        child: const Text('Tarik dari orang tua'),
                      )
                    : FilledButton(
                        onPressed: _publishing ? null : () => _publish(true),
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                        child: Text(_publishing ? 'Memproses…' : 'Terbitkan ke orang tua'),
                      ),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(onPressed: () => context.push('/siswa/${Uri.encodeComponent(p.id)}/rapor'), icon: const Icon(Icons.description_outlined), label: const Text('Rapor')),
                if (_canWrite) OutlinedButton.icon(onPressed: () => context.push('/siswa/${Uri.encodeComponent(p.id)}/rencana'), icon: const Icon(Icons.flag_outlined), label: const Text('Rencana pengembangan')),
              ],
            ),
          ],
          if (_canWrite) ..._form(p) else ..._readOnly(cur),
          if (cur != null)
            ExpansionTile(
              key: ValueKey(_periodId),
              tilePadding: EdgeInsets.zero,
              title: const Text('Riwayat perubahan skor'),
              onExpansionChanged: _loadHistory,
              children: [
                if (_history == null)
                  const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()))
                else if (_history!.isEmpty)
                  Padding(padding: const EdgeInsets.all(8), child: Text('Belum ada perubahan.', style: TextStyle(color: scheme.outline)))
                else
                  for (final h in _history!)
                    ListTile(
                      dense: true,
                      contentPadding: EdgeInsets.zero,
                      title: Text('${h.indicator}: ${h.from == null ? 'diisi' : '${h.from} menjadi'} ${h.to}'),
                      subtitle: Text('${dateText(h.at)}${h.by == null ? '' : ', ${h.by}'}'),
                    ),
              ],
            ),
        ],
      ),
    );
  }

  List<Widget> _readOnly(Assessment? cur) {
    if (cur == null) return [const Padding(padding: EdgeInsets.symmetric(vertical: 24), child: Center(child: Text('Belum ada penilaian pada periode ini.')))];
    return [
      const SectionTitle('Hasil penilaian'),
      Row(children: [
        OverallBadge(cur.overall),
        const SizedBox(width: 16),
        Expanded(child: Text('Dinilai ${dateText(cur.assessedOn)}${cur.assessor == null ? '' : ' oleh ${cur.assessor}'}')),
      ]),
      const SizedBox(height: 12),
      AspectScoreCards(cur),
      if (cur.note != null) Text.rich(TextSpan(children: [const TextSpan(text: 'Catatan pelatih: ', style: TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: cur.note)])),
    ];
  }

  List<Widget> _form(PlayerDetail p) {
    final scheme = Theme.of(context).colorScheme;
    if (_indicators.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Text(
            p.summary.ageGroup == null ? 'Siswa ini belum punya KU, jadi belum bisa dinilai.' : 'KU ${p.summary.ageGroup!.name} belum punya indikator penilaian. Minta admin SSB menyiapkannya.',
            style: TextStyle(color: scheme.outline),
          ),
        ),
      ];
    }
    final groups = [
      for (final a in Aspect.values)
        (aspect: a, items: [for (final i in _indicators) if (i.aspect == a) i]),
    ].where((g) => g.items.isNotEmpty);
    final filled = _indicators.where((i) => _scores[i.id] != null).length;
    return [
      const SizedBox(height: 8),
      ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: filled / _indicators.length, minHeight: 6)),
      for (final g in groups) ...[
        SectionTitle(g.aspect.label, trailing: Text('${g.items.where((i) => _scores[i.id] != null).length}/${g.items.length} terisi', style: TextStyle(color: scheme.outline, fontSize: 12))),
        for (final i in g.items) _ScoreRow(indicator: i, score: _scores[i.id], onChanged: (v) => _setScore(i.id, v)),
      ],
      const SizedBox(height: 16),
      TextField(
        controller: _note,
        maxLength: 1000,
        maxLines: 3,
        onChanged: (_) => setState(() {
          _dirty = true;
          _notice = null;
        }),
        decoration: const InputDecoration(labelText: 'Catatan pelatih (boleh dikosongkan)', border: OutlineInputBorder()),
      ),
    ];
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text, {this.error = false});

  final String text;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: error ? scheme.errorContainer : scheme.secondaryContainer, borderRadius: BorderRadius.circular(12)),
      child: Text(text, style: TextStyle(color: error ? scheme.onErrorContainer : scheme.onSecondaryContainer)),
    );
  }
}

/// Satu indikator: nilai besar, tombol kurang/tambah 48 px, dan slider 1 sampai 10.
/// Indikator yang belum dinilai ditampilkan abu-abu; ketukan pertama mengisi 5.
class _ScoreRow extends StatelessWidget {
  const _ScoreRow({required this.indicator, required this.score, required this.onChanged});

  final Indicator indicator;
  final int? score;
  final ValueChanged<int> onChanged;

  static const _start = 5;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = score;
    final color = s == null ? scheme.outline : bandColor(scoreBand(s).code);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(indicator.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15))),
                if (s != null) Text(scoreBand(s).label, style: TextStyle(color: color, fontSize: 12)),
                const SizedBox(width: 10),
                Text(s == null ? '–' : '$s', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: color)),
              ],
            ),
            Row(
              children: [
                IconButton.filledTonal(
                  iconSize: 26,
                  constraints: const BoxConstraints.tightFor(width: 48, height: 48),
                  tooltip: 'Kurangi skor ${indicator.name}',
                  onPressed: s != null && s <= scoreMin ? null : () => onChanged(s == null ? _start : s - 1),
                  icon: const Icon(Icons.remove),
                ),
                Expanded(
                  child: Slider(
                    min: scoreMin.toDouble(),
                    max: scoreMax.toDouble(),
                    divisions: scoreMax - scoreMin,
                    value: (s ?? _start).toDouble(),
                    label: '${s ?? _start}',
                    activeColor: color,
                    onChanged: (v) => onChanged(v.round()),
                  ),
                ),
                IconButton.filledTonal(
                  iconSize: 26,
                  constraints: const BoxConstraints.tightFor(width: 48, height: 48),
                  tooltip: 'Tambah skor ${indicator.name}',
                  onPressed: s != null && s >= scoreMax ? null : () => onChanged(s == null ? _start : s + 1),
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
