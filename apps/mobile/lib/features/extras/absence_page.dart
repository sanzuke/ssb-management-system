import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/dialogs.dart';
import '../../core/widgets.dart';

/// Pengajuan izin atau sakit untuk sesi latihan anak yang akan datang (orang tua).
class AbsencePage extends StatefulWidget {
  const AbsencePage({super.key});

  @override
  State<AbsencePage> createState() => _AbsencePageState();
}

class _AbsencePageState extends State<AbsencePage> {
  final _listKey = GlobalKey<LoadViewState<List<AbsenceRequest>>>();

  Future<void> _new() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _RequestForm(),
    );
    if (saved == true) {
      _listKey.currentState?.reload();
      if (mounted) showMessage(context, 'Pengajuan terkirim ke pelatih');
    }
  }

  Future<void> _delete(AbsenceRequest r) async {
    final ok = await showConfirm(
      context,
      icon: Icons.event_busy_outlined,
      title: 'Batalkan pengajuan?',
      message: '${r.playerName}, ${shortDay(r.sessionDate)}. Pelatih tidak akan lagi melihat pengajuan ini.',
      confirmLabel: 'Ya, batalkan pengajuan',
      cancelLabel: 'Tidak',
      destructive: true,
    );
    if (!ok || !mounted) return;
    try {
      await ExtrasRepository.of(context).deleteAbsenceRequest(r.id);
      _listKey.currentState?.reload();
      if (mounted) showMessage(context, 'Pengajuan dibatalkan');
    } catch (e) {
      if (mounted) showMessage(context, errorText(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final repo = ExtrasRepository.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Izin latihan')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _new, icon: const Icon(Icons.add), label: const Text('Ajukan izin')),
      body: LoadView<List<AbsenceRequest>>(
        key: _listKey,
        load: repo.absenceRequests,
        builder: (context, list) {
          if (list.isEmpty) return const EmptyState('Belum ada pengajuan izin. Ketuk "Ajukan izin" bila anak tidak bisa hadir latihan.');
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
            children: [for (final r in list) _RequestCard(r, onDelete: daysFromToday(r.sessionDate) >= 0 ? () => _delete(r) : null)],
          );
        },
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard(this.r, {required this.onDelete});

  final AbsenceRequest r;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final c = statusColor(context, r.kind.status);
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.playerName, style: Theme.of(context).textTheme.titleSmall),
                  Text('${relativeDay(r.sessionDate)} · ${shortDay(r.sessionDate)}', style: TextStyle(color: scheme.primary, fontSize: 13, fontWeight: FontWeight.w600)),
                  Text(sessionLine(ageGroup: r.ageGroup, time: r.startTime), style: TextStyle(color: scheme.outline, fontSize: 13)),
                  if (r.note != null && r.note!.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(r.note!)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(20)),
                    child: Text(r.kind.label, style: TextStyle(color: c, fontSize: 12, fontWeight: FontWeight.w600)),
                  ),
                ],
              ),
            ),
            if (onDelete != null) IconButton(onPressed: onDelete, icon: const Icon(Icons.delete_outline), tooltip: 'Batalkan pengajuan'),
          ],
        ),
      ),
    );
  }
}

/// Formulir pengajuan: pilih sesi anak yang akan datang, jenis, dan catatan.
class _RequestForm extends StatefulWidget {
  const _RequestForm();

  @override
  State<_RequestForm> createState() => _RequestFormState();
}

class _RequestFormState extends State<_RequestForm> {
  late final ExtrasRepository _repo = ExtrasRepository.of(context);
  final _note = TextEditingController();
  List<GuardianSession>? _sessions;
  Object? _loadError;
  GuardianSession? _picked;
  AbsenceKind _kind = AbsenceKind.izin;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final all = await _repo.upcomingGuardianSessions();
      if (mounted) setState(() => _sessions = all);
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  Future<void> _submit() async {
    final s = _picked;
    if (s == null) {
      setState(() => _error = 'Pilih dulu sesi latihan yang akan dilewatkan.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _repo.saveAbsenceRequest(sessionId: s.sessionId, playerId: s.playerId, kind: _kind, note: _note.text);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException && e.isNetwork ? e.message : errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _label(GuardianSession s) => '${s.playerName} · ${shortDay(s.date)}${s.startTime == null ? '' : ' ${s.startTime}'} · ${s.ageGroup.name}';

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final sessions = _sessions;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Ajukan izin latihan', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            if (_loadError != null) ...[
              Text(errorText(_loadError!)),
              const SizedBox(height: 8),
              FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi')),
            ] else if (sessions == null)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else if (sessions.isEmpty)
              Text('Tidak ada jadwal latihan anak dalam 60 hari ke depan.', style: TextStyle(color: scheme.outline))
            else ...[
              if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(_error!, style: TextStyle(color: scheme.error))),
              DropdownButtonFormField<GuardianSession>(
                isExpanded: true,
                initialValue: _picked,
                decoration: const InputDecoration(labelText: 'Sesi latihan', border: OutlineInputBorder()),
                items: [for (final s in sessions) DropdownMenuItem(value: s, child: Text(_label(s), overflow: TextOverflow.ellipsis))],
                onChanged: _busy ? null : (s) => setState(() => _picked = s),
              ),
              const SizedBox(height: 12),
              SegmentedButton<AbsenceKind>(
                segments: [for (final k in AbsenceKind.values) ButtonSegment(value: k, label: Text(k.label))],
                selected: {_kind},
                onSelectionChanged: _busy ? null : (s) => setState(() => _kind = s.first),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _note,
                enabled: !_busy,
                maxLength: 200,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Catatan untuk pelatih (boleh dikosongkan)', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Kirim pengajuan'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
