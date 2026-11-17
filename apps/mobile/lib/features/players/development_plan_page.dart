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

/// Satu butir yang sedang disunting; pengendali teks dipegang di sini supaya ikut dibuang bersama butirnya.
class _Item {
  _Item(PlanDraft d)
      : aspect = d.aspect,
        area = TextEditingController(text: d.area),
        target = TextEditingController(text: d.target),
        note = TextEditingController(text: d.note);

  Aspect? aspect;
  final TextEditingController area, target, note;

  PlanDraft get draft => PlanDraft(aspect: aspect, area: area.text, target: target.text, note: note.text);

  void dispose() {
    area.dispose();
    target.dispose();
    note.dispose();
  }
}

/// Rencana pengembangan siswa per periode (padanan `/rencana/[id]` di web). Disimpan lewat antrean offline;
/// korlas hanya membaca.
class DevelopmentPlanPage extends StatefulWidget {
  const DevelopmentPlanPage({super.key, required this.playerId});

  final String playerId;

  @override
  State<DevelopmentPlanPage> createState() => _DevelopmentPlanPageState();
}

class _DevelopmentPlanPageState extends State<DevelopmentPlanPage> {
  late final PlayersRepo _repo = PlayersRepo(context.read<ApiClient>());
  late final Outbox _outbox = context.read<Outbox>();
  late final Role? _role = context.read<SessionController>().role;

  PlayerDetail? _player;
  List<Period> _periods = [];
  String? _periodId;
  List<_Item> _items = [];
  List<PlanItem> _saved = [];
  bool _planLoading = false;
  bool _dirty = false;
  bool _saving = false;
  bool _hadPending = false;
  Object? _loadError;
  String? _planError;
  String? _notice;
  String? _error;

  bool get _canWrite => _role == Role.pelatih || _role == Role.adminSsb;
  String get _key => 'plan:${widget.playerId}:$_periodId';

  @override
  void initState() {
    super.initState();
    _outbox.addListener(_onOutbox);
    _load();
  }

  @override
  void dispose() {
    _outbox.removeListener(_onOutbox);
    for (final i in _items) {
      i.dispose();
    }
    super.dispose();
  }

  /// Antrean terkirim: ambil rencana dari server bila pengguna tidak sedang menyunting.
  void _onOutbox() {
    final pending = _periodId != null && _outbox.has(_key);
    if (_hadPending && !pending && !_dirty) _loadPlan();
    _hadPending = pending;
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final player = await _repo.player(widget.playerId);
      final periods = await _repo.periods();
      if (!mounted) return;
      setState(() {
        _player = player;
        _periods = periods;
        _periodId ??= defaultPeriod(periods, today())?.id;
      });
      await _loadPlan();
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  /// Pengendali dibuang setelah frame, karena TextField lamanya masih terpasang sampai build berikutnya.
  void _disposeAfterFrame(List<_Item> old) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final i in old) {
        i.dispose();
      }
    });
  }

  void _setItems(List<PlanDraft> drafts) {
    _disposeAfterFrame(_items);
    _items = [for (final d in drafts) _Item(d)];
    _dirty = false;
  }

  /// Memuat rencana periode terpilih; draf di antrean offline didahulukan karena itu yang terakhir disunting.
  Future<void> _loadPlan() async {
    final id = _periodId;
    if (id == null) return;
    final queued = planDraftsFromBody(_outbox.bodyFor(_key));
    setState(() {
      _planLoading = true;
      _planError = null;
    });
    try {
      final items = await _repo.plan(widget.playerId, id);
      if (!mounted || id != _periodId) return;
      setState(() {
        _saved = items;
        _setItems(queued ?? [for (final x in items) PlanDraft.fromItem(x)]);
        _hadPending = _outbox.has(_key);
      });
    } catch (e) {
      if (!mounted || id != _periodId) return;
      setState(() {
        if (queued != null) {
          _setItems(queued);
          _hadPending = true;
        } else {
          _planError = errorText(e);
        }
      });
    } finally {
      if (mounted && id == _periodId) setState(() => _planLoading = false);
    }
  }

  Future<void> _pickPeriod(String id) async {
    if (id == _periodId) return;
    if (_dirty) {
      final leave = await confirmAction(context, title: 'Perubahan belum disimpan', message: 'Butir yang Anda sunting akan hilang jika ganti periode.', action: 'Ganti periode');
      if (!leave || !mounted) return;
    }
    setState(() {
      _periodId = id;
      _notice = null;
      _error = null;
    });
    await _loadPlan();
  }

  void _touch(VoidCallback change) => setState(() {
        change();
        _dirty = true;
        _notice = null;
        _error = null;
      });

  Future<void> _save() async {
    final name = _player!.fullName;
    setState(() {
      _saving = true;
      _error = null;
      _notice = null;
    });
    try {
      final res = await _outbox.submit(OutboxItem(
        key: _key,
        path: '/players/${widget.playerId}/development-plan/$_periodId',
        body: planBody([for (final i in _items) i.draft]),
        label: 'Rencana $name',
      ));
      if (!mounted) return;
      setState(() {
        if (res.queued) {
          _dirty = false;
          _notice = 'Tersimpan di perangkat. Dikirim otomatis begitu ada sinyal.';
        } else {
          _saved = parsePlan(res.data);
          _setItems([for (final x in _saved) PlanDraft.fromItem(x)]);
          _notice = 'Rencana disimpan. Anda masih bisa mengubahnya.';
        }
        _hadPending = _outbox.has(_key);
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<Outbox>();
    final p = _player;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final nav = Navigator.of(context);
        final leave = await confirmAction(context, title: 'Perubahan belum disimpan', message: 'Butir yang Anda sunting akan hilang jika keluar.', action: 'Keluar');
        if (leave) nav.pop();
      },
      child: Scaffold(
        appBar: AppBar(title: Text(p == null ? 'Rencana pengembangan' : 'Rencana ${p.fullName}')),
        body: _body(),
        bottomNavigationBar: p != null && _canWrite && _periodId != null ? _saveBar() : null,
      ),
    );
  }

  Widget _saveBar() {
    final filled = _items.where((i) => i.area.text.trim().isNotEmpty).length;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            Expanded(child: Text('$filled butir terisi', style: const TextStyle(fontWeight: FontWeight.w600))),
            FilledButton.icon(
              onPressed: (_dirty && !_saving && !_planLoading) ? _save : null,
              style: FilledButton.styleFrom(minimumSize: const Size(160, 52)),
              icon: _saving ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save),
              label: Text(_dirty ? 'Simpan rencana' : 'Tersimpan'),
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
    if (_periods.isEmpty) return const EmptyState('Belum ada periode. Admin perlu menambahkannya di Data master.');
    final scheme = Theme.of(context).colorScheme;
    final pending = _periodId != null && _outbox.has(_key);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Text('Area yang dilatih lebih lanjut pada periode ini. Orang tua melihatnya setelah penilaian periode ini diterbitkan.', style: TextStyle(color: scheme.outline)),
        const SizedBox(height: 12),
        if (pending) const PendingBanner('Menunggu sinyal. Rencana tersimpan di perangkat dan dikirim otomatis begitu ada sinyal.'),
        if (_error != null) _Notice(_error!, error: true),
        if (_notice != null) _Notice(_notice!),
        DropdownButtonFormField<String>(
          initialValue: _periodId,
          decoration: const InputDecoration(labelText: 'Periode', border: OutlineInputBorder()),
          items: [for (final x in _periods) DropdownMenuItem(value: x.id, child: Text(x.name))],
          onChanged: (v) => v == null ? null : _pickPeriod(v),
        ),
        const SizedBox(height: 12),
        if (_planLoading)
          const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
        else if (_planError != null)
          Column(children: [
            Text(_planError!, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            FilledButton.tonal(onPressed: _loadPlan, child: const Text('Coba lagi')),
          ])
        else if (!_canWrite)
          PlanList(_saved, emptyText: 'Belum ada rencana pengembangan untuk periode ini.')
        else ...[
          if (_items.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text('Belum ada butir. Tambahkan area yang ingin dikembangkan, misalnya "Tenang di depan gawang".', style: TextStyle(color: scheme.outline))),
          for (var n = 0; n < _items.length; n++) _itemCard(n),
          OutlinedButton.icon(
            onPressed: _items.length >= planMaxItems ? null : () => _touch(() => _items.add(_Item(const PlanDraft()))),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            icon: const Icon(Icons.add),
            label: Text(_items.length >= planMaxItems ? 'Maksimal $planMaxItems butir' : 'Tambah butir'),
          ),
        ],
        const SizedBox(height: 8),
        TextButton(onPressed: () => context.push('/siswa/${Uri.encodeComponent(p.id)}/nilai'), child: const Text('Ke penilaian')),
      ],
    );
  }

  Widget _itemCard(int n) {
    final it = _items[n];
    return Card(
      key: ObjectKey(it),
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('Butir ${n + 1}', style: const TextStyle(fontWeight: FontWeight.w700))),
                IconButton(
                  tooltip: 'Hapus butir ${n + 1}',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _touch(() => _disposeAfterFrame([_items.removeAt(n)])),
                ),
              ],
            ),
            TextField(
              controller: it.area,
              maxLength: 120,
              onChanged: (_) => _touch(() {}),
              decoration: const InputDecoration(labelText: 'Area pengembangan', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<Aspect?>(
              initialValue: it.aspect,
              decoration: const InputDecoration(labelText: 'Aspek terkait (boleh dikosongkan)', border: OutlineInputBorder()),
              items: [
                const DropdownMenuItem<Aspect?>(value: null, child: Text('Tidak terkait aspek tertentu')),
                for (final a in Aspect.values) DropdownMenuItem<Aspect?>(value: a, child: Text(a.label)),
              ],
              onChanged: (v) => _touch(() => it.aspect = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: it.target,
              maxLength: 200,
              onChanged: (_) => _touch(() {}),
              decoration: const InputDecoration(labelText: 'Target (boleh dikosongkan)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: it.note,
              maxLength: 500,
              maxLines: 2,
              onChanged: (_) => _touch(() {}),
              decoration: const InputDecoration(labelText: 'Catatan (boleh dikosongkan)', border: OutlineInputBorder()),
            ),
          ],
        ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text, {this.error = false});

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
