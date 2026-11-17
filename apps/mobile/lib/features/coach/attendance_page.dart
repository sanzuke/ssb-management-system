import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/dialogs.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_extras.dart';
import '../../core/outbox.dart';
import '../../core/repo_extras.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
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
        label: 'Absensi ${kuShort(s.ageGroup.name)}, ${shortDay(s.date)}',
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

  Future<bool> _confirmLeave() => showConfirm(
        context,
        icon: Icons.warning_amber_rounded,
        title: 'Perubahan belum disimpan',
        message: 'Absensi yang Anda tandai akan hilang jika keluar dari layar ini.',
        confirmLabel: 'Keluar tanpa menyimpan',
        cancelLabel: 'Tetap di sini',
        destructive: true,
      );

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
          title: Text(s == null ? 'Absensi' : 'Absensi ${kuShort(s.ageGroup.name)}'),
          actions: const [],
        ),
        body: _body(),
        bottomNavigationBar: r == null
            ? null
            : _SaveBar(
                done: _marks.length,
                total: r.players.length,
                dirty: _dirty,
                queued: _queued,
                saving: _saving,
                locked: s!.date.compareTo(today()) > 0,
                onSave: _save,
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
    if (r == null) return const SkeletonList();
    final s = r.session;
    if (r.players.isEmpty) return const EmptyState('Belum ada siswa aktif di KU ini.');
    final byPlayer = {for (final q in _requests) q.playerId: q};
    final names = {for (final p in r.players) p.playerId};
    final pending = _requests.where((q) => names.contains(q.playerId) && _marks[q.playerId] != q.kind.status).toList();
    final counts = {for (final st in AttendanceStatus.values) st: r.players.where((p) => _marks[p.playerId] == st).length};
    final blank = r.players.where((p) => _marks[p.playerId] == null).length;
    final locked = s.date.compareTo(today()) > 0;
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
          child: Text(
            '${dayLabel(s.date)} · ${sessionLine(ageGroup: kuShort(s.ageGroup.name), location: s.location?.name, time: s.startTime)}',
            style: TextStyle(color: Theme.of(context).colorScheme.outline),
          ),
        ),
        if (locked)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Brand.merahMuda, borderRadius: BorderRadius.circular(Space.radius), border: Border.all(color: Brand.merah.withValues(alpha: 0.35))),
            child: const Row(
              children: [
                Icon(Icons.lock_clock, color: Brand.merah),
                SizedBox(width: 10),
                Expanded(child: Text('Sesi ini belum berlangsung. Absensi baru bisa diisi pada hari latihan.', style: TextStyle(fontWeight: FontWeight.w600))),
              ],
            ),
          ),
        Row(
          children: [
            for (final st in AttendanceStatus.values) ...[
              Expanded(child: _CountTile(label: st.label.toUpperCase(), value: counts[st] ?? 0, color: statusColor(context, st))),
              const SizedBox(width: Space.gap),
            ],
            Expanded(child: _CountTile(label: 'KOSONG', value: blank, color: Brand.redup)),
          ],
        ),
        const SizedBox(height: Space.gap),
        FilledButton.icon(
          style: ledgerButton(),
          onPressed: (_saving || locked) ? null : _allPresent,
          icon: const Icon(Icons.done_all, size: 20),
          label: Text('Tandai semua hadir (${r.players.length} anak)'),
        ),
        const SizedBox(height: 12),
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
          IgnorePointer(
            ignoring: locked,
            child: Opacity(
              opacity: locked ? 0.45 : 1,
              child: _PlayerRow(
                player: p,
                status: _marks[p.playerId],
                onMark: (st) => _mark(p.playerId, st),
                request: byPlayer[p.playerId],
                onApply: byPlayer[p.playerId] == null ? null : () => _apply(byPlayer[p.playerId]!),
              ),
            ),
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
        padding: const EdgeInsets.all(12),
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
                      if (player.memberNo != null) Text(player.memberNo!, style: TextStyle(color: scheme.outline, fontSize: 13)),
                    ],
                  ),
                ),
                if (player.injured)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(color: scheme.errorContainer, borderRadius: BorderRadius.circular(20)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.healing, size: 14, color: scheme.error),
                      const SizedBox(width: 4),
                      Text('Cedera', style: TextStyle(color: scheme.error, fontSize: 12, fontWeight: FontWeight.w600)),
                    ]),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                for (final st in AttendanceStatus.values) ...[
                  if (st != AttendanceStatus.values.first) const SizedBox(width: Space.gap),
                  Expanded(child: _StatusButton(status: st, selected: status == st, onTap: () => onMark(st))),
                ],
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

/// Tombol status selebar kolom: ikon + teks (bukan huruf tunggal), tinggi 48dp, dan tidak bergantung pada warna saja.
class _StatusButton extends StatelessWidget {
  const _StatusButton({required this.status, required this.selected, required this.onTap});

  final AttendanceStatus status;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(context, status);
    final fg = selected ? Colors.white : color;
    return Semantics(
      button: true,
      selected: selected,
      label: status.label,
      excludeSemantics: true,
      child: Material(
        color: selected ? color : Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius), side: BorderSide(color: selected ? color : Brand.garis, width: 1.5)),
        child: InkWell(
          onTap: onTap,
          customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(Space.radius)),
          child: SizedBox(
            height: Space.touch,
            child: Center(
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(selected ? Icons.check : statusIcon(status), size: 16, color: fg),
                    const SizedBox(width: 4),
                    Text(status.label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: fg)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Satu kotak ringkasan di atas daftar: jumlah siswa per status.
class _CountTile extends StatelessWidget {
  const _CountTile({required this.label, required this.value, required this.color});

  final String label;
  final int value;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(Space.radius), border: Border.all(color: Brand.garis)),
        child: Column(
          children: [
            FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Brand.redup))),
            Text('$value', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color, fontFeatures: const [FontFeature.tabularFigures()])),
          ],
        ),
      );
}

/// Bilah simpan yang menempel di bawah: kemajuan "x dari y terdata" dan tombol kuning.
class _SaveBar extends StatelessWidget {
  const _SaveBar({required this.done, required this.total, required this.dirty, required this.queued, required this.saving, required this.locked, required this.onSave});

  final int done;
  final int total;
  final bool dirty;
  final bool queued;
  final bool saving;

  /// Sesi belum berlangsung: server menolak absensi (422), jadi tombol dikunci.
  final bool locked;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final waiting = !dirty && queued;
    return Material(
      color: Colors.white,
      child: DecoratedBox(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Brand.garis))),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(child: Text('$done dari $total terdata', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                    if (waiting) const Text('Menunggu sinyal', style: TextStyle(color: Brand.sakit, fontWeight: FontWeight.w700, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(borderRadius: BorderRadius.circular(4), child: LinearProgressIndicator(value: total == 0 ? 0 : done / total, minHeight: 6, backgroundColor: Brand.garis.withValues(alpha: 0.5), color: Brand.rumput)),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: (!dirty || saving || locked) ? null : onSave,
                    icon: saving ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : Icon(waiting ? Icons.cloud_upload_outlined : Icons.save_outlined),
                    label: Text(locked ? 'Belum bisa diisi' : (dirty ? 'Simpan presensi sesi ini' : (waiting ? 'Tersimpan di perangkat' : (done == 0 ? 'Tandai kehadiran dulu' : 'Tersimpan')))),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
