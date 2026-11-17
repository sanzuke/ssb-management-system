import 'package:flutter/material.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models_players.dart';
import '../../core/repo_players.dart';
import '../../core/widgets.dart';
import 'player_widgets.dart';

/// Lembar "Catat cedera" (baru) atau "Ubah cedera" ([edit], hanya perkiraan pulih dan catatan).
/// Mengembalikan daftar cedera terbaru dari server, atau null bila dibatalkan.
Future<List<PlayerInjury>?> showInjurySheet(BuildContext context, {required PlayersRepo repo, required String playerId, PlayerInjury? edit}) {
  return showModalBottomSheet<List<PlayerInjury>>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _InjurySheet(repo: repo, playerId: playerId, edit: edit),
  );
}

class _InjurySheet extends StatefulWidget {
  const _InjurySheet({required this.repo, required this.playerId, this.edit});

  final PlayersRepo repo;
  final String playerId;
  final PlayerInjury? edit;

  @override
  State<_InjurySheet> createState() => _InjurySheetState();
}

class _InjurySheetState extends State<_InjurySheet> {
  late String _bodyPart = widget.edit?.bodyPart ?? 'lutut';
  late String _startedOn = widget.edit?.startedOn ?? today();
  late String? _expected = widget.edit?.expectedReturnOn;
  late final TextEditingController _note = TextEditingController(text: widget.edit?.note ?? '');
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _pick({required bool expected}) async {
    final start = parseDate(_startedOn);
    final initial = expected ? (_expected == null ? start : parseDate(_expected!)) : start;
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: expected ? start : DateTime(2000),
      lastDate: expected ? DateTime(start.year + 2, start.month, start.day) : DateTime.now().add(const Duration(days: 1)),
      helpText: expected ? 'Perkiraan pulih' : 'Mulai cedera',
      cancelText: 'Batal',
      confirmText: 'Pilih',
    );
    if (picked == null) return;
    setState(() {
      if (expected) {
        _expected = isoDate(picked);
      } else {
        _startedOn = isoDate(picked);
        // Perkiraan pulih tidak boleh sebelum tanggal mulai.
        if (_expected != null && _expected!.compareTo(_startedOn) < 0) _expected = null;
      }
    });
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final e = widget.edit;
      final list = e == null
          ? await widget.repo.addInjury(widget.playerId, injuryCreateBody(bodyPart: _bodyPart, startedOn: _startedOn, expectedReturnOn: _expected, note: _note.text))
          : await widget.repo.updateInjury(widget.playerId, e.id, injuryUpdateBody(expectedReturnOn: _expected, note: _note.text));
      if (mounted) Navigator.pop(context, list);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.edit != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.viewInsetsOf(context).bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(editing ? 'Ubah cedera: ${bodyPartLabel(widget.edit!.bodyPart)}' : 'Catat cedera', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            if (!editing) ...[
              DropdownButtonFormField<String>(
                initialValue: _bodyPart,
                decoration: const InputDecoration(labelText: 'Bagian tubuh', border: OutlineInputBorder()),
                items: [for (final b in bodyParts) DropdownMenuItem(value: b.code, child: Text(b.label))],
                onChanged: (v) => setState(() => _bodyPart = v ?? _bodyPart),
              ),
              const SizedBox(height: 12),
              _DateField(label: 'Mulai cedera', value: _startedOn, onTap: () => _pick(expected: false)),
              const SizedBox(height: 12),
            ],
            _DateField(
              label: 'Perkiraan pulih (boleh dikosongkan)',
              value: _expected,
              onTap: () => _pick(expected: true),
              onClear: _expected == null ? null : () => setState(() => _expected = null),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _note,
              maxLength: injuryNoteMax,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Catatan (boleh dikosongkan)', border: OutlineInputBorder()),
            ),
            if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
            FilledButton(
              onPressed: _busy ? null : _save,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
              child: Text(_busy ? 'Menyimpan…' : 'Simpan'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.value, required this.onTap, this.onClear});

  final String label;
  final String? value;
  final VoidCallback onTap;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: InputDecorator(
          decoration: InputDecoration(
            labelText: label,
            border: const OutlineInputBorder(),
            suffixIcon: onClear == null ? const Icon(Icons.event) : IconButton(icon: const Icon(Icons.clear), tooltip: 'Kosongkan', onPressed: onClear),
          ),
          child: Text(value == null ? 'Belum ditentukan' : dateText(value!)),
        ),
      );
}

/// Lembar "Beri lencana": katalog per kelompok, maksimal [badgeMax] aktif. [onChanged] dipanggil
/// dengan daftar terbaru setiap kali lencana diberikan atau dicabut, jadi profil di belakangnya ikut segar.
Future<void> showBadgeSheet(
  BuildContext context, {
  required PlayersRepo repo,
  required String playerId,
  required List<PlayerBadge> current,
  required ValueChanged<List<PlayerBadge>> onChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _BadgeSheet(repo: repo, playerId: playerId, initial: current, onChanged: onChanged),
  );
}

class _BadgeSheet extends StatefulWidget {
  const _BadgeSheet({required this.repo, required this.playerId, required this.initial, required this.onChanged});

  final PlayersRepo repo;
  final String playerId;
  final List<PlayerBadge> initial;
  final ValueChanged<List<PlayerBadge>> onChanged;

  @override
  State<_BadgeSheet> createState() => _BadgeSheetState();
}

class _BadgeSheetState extends State<_BadgeSheet> {
  late List<PlayerBadge> _badges = widget.initial;
  bool _busy = false;
  String? _error;

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
    // Muat ulang apa pun hasilnya agar sama dengan server (mis. batas lima lencana).
    try {
      final list = await widget.repo.badges(widget.playerId);
      if (!mounted) return;
      setState(() => _badges = list);
      widget.onChanged(list);
    } catch (_) {
      // Daftar lama tetap tampil; galat aksi di atas sudah menjelaskan masalahnya.
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final full = _badges.length >= badgeMax;
    bool has(String code) => _badges.any((b) => b.code == code);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          shrinkWrap: true,
          children: [
            Text('Beri lencana', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text('Perilaku positif yang Anda amati. ${_badges.length} dari $badgeMax terpakai.', style: TextStyle(color: scheme.outline)),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: scheme.error))),
            if (_badges.isNotEmpty) ...[
              const SectionTitle('Lencana aktif'),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final b in _badges)
                    InputChip(
                      label: Text(b.label),
                      onDeleted: _busy ? null : () => _run(() => widget.repo.revokeBadge(widget.playerId, b.id)),
                      deleteButtonTooltipMessage: 'Cabut lencana ${b.label}',
                    ),
                ],
              ),
            ],
            for (final g in BadgeGroup.values) ...[
              SectionTitle(g.label),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final b in badgeCatalog.where((x) => x.group == g))
                    FilterChip(
                      label: Text(b.label),
                      selected: has(b.code),
                      onSelected: _busy || has(b.code) || full ? null : (_) => _run(() => widget.repo.awardBadge(widget.playerId, b.code)),
                    ),
                ],
              ),
            ],
            if (full)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text('Sudah $badgeMax lencana. Cabut satu untuk memberi yang baru.', style: TextStyle(color: scheme.outline)),
              ),
          ],
        ),
      ),
    );
  }
}

/// Konfirmasi singkat sebelum tindakan yang tidak mudah dibatalkan.
Future<bool> confirmAction(BuildContext context, {required String title, required String message, required String action}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
        TextButton(onPressed: () => Navigator.pop(c, true), child: Text(action)),
      ],
    ),
  );
  return ok ?? false;
}

/// Pesan galat untuk [ApiException] dengan status tertentu, mis. 403 pada terbit rapor.
String publishErrorText(Object e) => e is ApiException && e.status == 403 ? 'Anda tidak punya izin untuk menerbitkan rapor ini.' : errorText(e);
