import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_extras.dart';
import '../../core/outbox.dart';
import '../../core/repo_extras.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import '../extras/attendance_logic.dart';

/// Absensi satu sesi: ketuk H/I/S/A per siswa, lalu simpan sekali (sama dengan /absensi/[id] di web).
/// Simpan lewat [Outbox]: tanpa sinyal, tanda tersimpan di perangkat dan dikirim saat sinyal kembali.
class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key, required this.sessionId});

  final String sessionId;

  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  late final ExtrasRepository _extras = ExtrasRepository.of(context);
  late final Outbox _outbox = context.read<Outbox>();
  late final String _userId = context.read<SessionController>().me?.active?.userId ?? '';
  AttendanceRoster? _roster;
  Object? _loadError;
  Map<String, AttendanceStatus> _marks = {};
  Map<String, String?> _notes = {};

  /// Tanda pada keadaan tersimpan/antre terakhir; "belum disimpan" berarti [_marks] berbeda darinya.
  Map<String, AttendanceStatus> _baseline = {};
  List<SessionAbsenceRequest> _requests = [];
  bool _saving = false;

  /// Ada draf di antrean perangkat yang belum terkirim.
  bool _queued = false;

  /// Daftar siswa berasal dari salinan di perangkat karena server tidak terjangkau.
  bool _stale = false;

  String get _key => attendanceOutboxKey(widget.sessionId);
  bool get _dirty => !mapEquals(_marks, _baseline);

  @override
  void initState() {
    super.initState();
    _outbox.addListener(_onOutbox);
    _load();
  }

  @override
  void dispose() {
    _outbox.removeListener(_onOutbox);
    super.dispose();
  }

  /// Setelah antrean terkirim, muat ulang agar tampilan sama dengan server.
  void _onOutbox() {
    if (!mounted || _saving) return;
    final has = _outbox.has(_key);
    if (_queued && !has) {
      _load();
    } else if (_queued != has) {
      setState(() => _queued = has);
    }
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final raw = await _extras.rawRoster(widget.sessionId);
      final r = AttendanceRoster.fromJson(raw);
      await _cacheRoster(raw);
      if (!mounted) return;
      setState(() => _applyServer(r, stale: false));
      _loadRequests();
    } catch (e) {
      final cached = e is ApiException && e.isNetwork ? await _cached() : null;
      if (!mounted) return;
      if (cached != null) {
        setState(() => _applyServer(cached, stale: true));
      } else {
        setState(() => _loadError = e);
      }
    }
  }

  Future<void> _cacheRoster(Map<String, dynamic> raw) async {
    try {
      await (await RosterCache.open(_userId)).putRoster(widget.sessionId, raw);
    } on Object {
      // Salinan hanya untuk jaga-jaga; gagal menyimpan tidak boleh menggagalkan layar.
    }
  }

  Future<AttendanceRoster?> _cached() async {
    try {
      return (await RosterCache.open(_userId)).roster(widget.sessionId);
    } on Object {
      return null;
    }
  }

  Future<void> _loadRequests() async {
    try {
      final list = await _extras.sessionAbsenceRequests(widget.sessionId);
      if (mounted) setState(() => _requests = list);
    } on Object {
      // Pengajuan izin hanya tambahan informasi; galatnya diabaikan.
    }
  }

  /// Memasang daftar dari server (atau salinan) dan menimpa tanda dengan draf antrean.
  /// Tanda yang sedang diedit dan belum disimpan dipertahankan kecuali [keepEdits] false.
  void _applyServer(AttendanceRoster r, {required bool stale, bool keepEdits = true}) {
    final keep = keepEdits && _roster != null && _dirty;
    final o = overlayQueued(r.players, _outbox.bodyFor(_key));
    _roster = r;
    _baseline = o.marks;
    _notes = o.notes;
    if (!keep) _marks = Map.of(o.marks);
    _queued = _outbox.has(_key);
    _stale = stale;
  }

  void _mark(String playerId, AttendanceStatus s) {
    setState(() {
      // Ketuk status yang sama sekali lagi mengosongkannya.
      if (_marks[playerId] == s) {
        _marks.remove(playerId);
      } else {
        _marks[playerId] = s;
      }
    });
  }

  void _allPresent() {
    setState(() {
      for (final p in _roster!.players) {
        _marks.putIfAbsent(p.playerId, () => AttendanceStatus.hadir);
      }
    });
  }

  /// Menerapkan status dari pengajuan orang tua; pelatih tetap bisa mengubahnya sebelum menyimpan.
  void _apply(SessionAbsenceRequest q) => setState(() => _marks[q.playerId] = q.kind.status);

  void _applyAll(Iterable<SessionAbsenceRequest> list) => setState(() {
        for (final q in list) {
          _marks[q.playerId] = q.kind.status;
        }
      });

  Future<void> _save() async {
    final s = _roster!.session;
    setState(() => _saving = true);
    try {
      final res = await _outbox.submit(OutboxItem(
        key: _key,
        path: '/sessions/${widget.sessionId}/attendance',
        body: attendanceBody(_marks, _notes),
        label: 'Absensi ${s.ageGroup.name}, ${shortDay(s.date)}',
      ));
      if (!mounted) return;
      if (res.queued) {
        setState(() {
          _baseline = Map.of(_marks);
          _queued = true;
        });
        showMessage(context, 'Tersimpan di perangkat, menunggu sinyal');
      } else {
        final raw = res.data as Map<String, dynamic>;
        await _cacheRoster(raw);
        if (!mounted) return;
        setState(() => _applyServer(AttendanceRoster.fromJson(raw), stale: false, keepEdits: false));
        showMessage(context, 'Absensi tersimpan');
      }
    } catch (e) {
      if (mounted) showMessage(context, errorText(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<bool> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Perubahan belum disimpan'),
        content: const Text('Absensi yang Anda tandai akan hilang jika keluar.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Tetap di sini')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Keluar')),
        ],
      ),
    );
    return leave ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final r = _roster;
    final s = r?.session;
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final nav = Navigator.of(context);
        if (await _confirmLeave()) nav.pop();
      },
      child: Scaffold(
        appBar: AppBar(
          title: Text(s == null ? 'Absensi' : 'Absensi ${s.ageGroup.name}'),
          actions: [
            if (r != null)
              TextButton(onPressed: _saving ? null : _allPresent, child: const Text('Semua hadir')),
          ],
        ),
        body: _body(),
        floatingActionButton: r == null
            ? null
            : FloatingActionButton.extended(
                onPressed: (!_dirty || _saving) ? null : _save,
                icon: _saving
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : Icon(!_dirty && _queued ? Icons.cloud_upload_outlined : Icons.save),
                label: Text(_dirty ? 'Simpan (${_marks.length}/${r.players.length})' : (_queued ? 'Menunggu sinyal' : 'Tersimpan')),
              ),
      ),
    );
  }

  Widget _body() {
    if (_loadError != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(errorText(_loadError!)),
            const SizedBox(height: 12),
            FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi')),
          ],
        ),
      );
    }
    final r = _roster;
    if (r == null) return const Center(child: CircularProgressIndicator());
    final s = r.session;
    if (r.players.isEmpty) return const EmptyState('Belum ada siswa aktif di KU ini.');
    final byPlayer = {for (final q in _requests) q.playerId: q};
    final names = {for (final p in r.players) p.playerId};
    final pending = _requests.where((q) => names.contains(q.playerId) && _marks[q.playerId] != q.kind.status).toList();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            '${dayLabel(s.date)} · ${sessionLine(ageGroup: s.ageGroup.name, location: s.location?.name, time: s.startTime)}',
            style: TextStyle(color: Theme.of(context).colorScheme.outline),
          ),
        ),
        if (_queued && !_dirty)
          _Banner(
            icon: Icons.cloud_upload_outlined,
            text: 'Tersimpan di perangkat, menunggu sinyal',
            action: 'Kirim sekarang',
            onAction: _outbox.flush,
          ),
        if (_stale)
          _Banner(
            icon: Icons.cloud_off,
            text: 'Tidak ada sinyal. Daftar siswa dari salinan terakhir di perangkat; tanda yang Anda simpan dikirim nanti.',
            action: 'Muat ulang',
            onAction: _load,
          ),
        if (pending.isNotEmpty)
          _Banner(
            icon: Icons.mail_outline,
            text: '${pending.length} siswa diajukan izin atau sakit oleh orang tua.',
            action: 'Terapkan semua',
            onAction: () => _applyAll(pending),
          ),
        for (final p in r.players)
          _PlayerRow(
            player: p,
            status: _marks[p.playerId],
            onMark: (st) => _mark(p.playerId, st),
            request: byPlayer[p.playerId],
            onApply: byPlayer[p.playerId] == null ? null : () => _apply(byPlayer[p.playerId]!),
          ),
      ],
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.text, required this.action, required this.onAction});

  final IconData icon;
  final String text;
  final String action;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      color: scheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Row(
          children: [
            Icon(icon, color: scheme.onSecondaryContainer),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: TextStyle(color: scheme.onSecondaryContainer))),
            TextButton(onPressed: onAction, child: Text(action)),
          ],
        ),
      ),
    );
  }
}

class _PlayerRow extends StatelessWidget {
  const _PlayerRow({required this.player, required this.status, required this.onMark, required this.request, required this.onApply});

  final RosterPlayer player;
  final AttendanceStatus? status;
  final ValueChanged<AttendanceStatus> onMark;
  final SessionAbsenceRequest? request;
  final VoidCallback? onApply;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final q = request;
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(player.fullName, style: Theme.of(context).textTheme.titleSmall),
                      if (player.memberNo != null) Text(player.memberNo!, style: TextStyle(color: scheme.outline, fontSize: 12)),
                      if (player.injured)
                        Row(children: [
                          Icon(Icons.healing, size: 14, color: scheme.error),
                          const SizedBox(width: 4),
                          Text('Sedang cedera', style: TextStyle(color: scheme.error, fontSize: 12)),
                        ]),
                    ],
                  ),
                ),
                for (final st in AttendanceStatus.values)
                  Padding(
                    padding: const EdgeInsets.only(left: 6),
                    child: _StatusButton(status: st, selected: status == st, onTap: () => onMark(st)),
                  ),
              ],
            ),
            if (q != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  _RequestChip(q.kind),
                  const SizedBox(width: 8),
                  if (q.note != null && q.note!.isNotEmpty) Expanded(child: Text(q.note!, style: TextStyle(color: scheme.outline, fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis)) else const Spacer(),
                  if (status == q.kind.status)
                    Text('Diterapkan', style: TextStyle(color: scheme.outline, fontSize: 12))
                  else
                    TextButton(onPressed: onApply, child: const Text('Terapkan')),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RequestChip extends StatelessWidget {
  const _RequestChip(this.kind);

  final AbsenceKind kind;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(context, kind.status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
      child: Text('${kind.label} diajukan', style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
    );
  }
}

class _StatusButton extends StatelessWidget {
  const _StatusButton({required this.status, required this.selected, required this.onTap});

  final AttendanceStatus status;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(context, status);
    return Semantics(
      button: true,
      selected: selected,
      label: status.label,
      child: InkResponse(
        onTap: onTap,
        radius: 28,
        child: Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: selected ? color : Colors.transparent,
            border: Border.all(color: selected ? color : Theme.of(context).colorScheme.outlineVariant, width: 1.5),
          ),
          child: Text(status.label[0], style: TextStyle(fontWeight: FontWeight.w700, color: selected ? Colors.white : color)),
        ),
      ),
    );
  }
}
