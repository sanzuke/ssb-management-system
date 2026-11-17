import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart' show BarcodeCapture, BarcodeFormat, DetectionSpeed, MobileScanner, MobileScannerController, MobileScannerErrorCode, MobileScannerException;
import 'package:provider/provider.dart';

import '../../core/api.dart';
import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/models_extras.dart';
import '../../core/outbox.dart';
import '../../core/repo_extras.dart';
import '../../core/repository.dart';
import '../../core/session.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import 'attendance_logic.dart';

enum _Outcome { ok, already, error }

class _ScanResult {
  _ScanResult(this.outcome, this.title, this.detail);

  final _Outcome outcome;
  final String title;
  final String? detail;
}

/// Pemindai QR kartu siswa untuk pelatih: menandai hadir pada sesi hari ini milik KU siswa.
/// Pemindaian terus berjalan; kode yang sama diabaikan beberapa detik. Daftar sesi hari ini
/// dimuat di awal (dan disalin di perangkat) supaya tetap bisa dipakai tanpa sinyal.
class ScanPage extends StatefulWidget {
  const ScanPage({super.key});

  @override
  State<ScanPage> createState() => _ScanPageState();
}

class _ScanPageState extends State<ScanPage> {
  static const _repeatGap = Duration(seconds: 4);

  late final Repository _repo = context.read<Repository>();
  late final ExtrasRepository _extras = ExtrasRepository.of(context);
  late final Outbox _outbox = context.read<Outbox>();
  late final String _userId = context.read<SessionController>().me?.active?.userId ?? '';
  final MobileScannerController _camera = MobileScannerController(formats: const [BarcodeFormat.qrCode], detectionSpeed: DetectionSpeed.normal, detectionTimeoutMs: 400);

  List<AttendanceRoster>? _rosters;
  Object? _loadError;
  bool _offline = false;
  bool _busy = false;
  String? _lastKey;
  DateTime _lastAt = DateTime.fromMillisecondsSinceEpoch(0);
  final List<_ScanResult> _log = [];

  @override
  void initState() {
    super.initState();
    _loadToday();
  }

  @override
  void dispose() {
    _camera.dispose();
    super.dispose();
  }

  Future<void> _loadToday() async {
    setState(() {
      _loadError = null;
      _rosters = null;
    });
    final date = today();
    RosterCache? cache;
    try {
      cache = await RosterCache.open(_userId);
    } on Object {
      cache = null;
    }
    try {
      final sessions = await _repo.sessions(from: date, to: date);
      final raws = await Future.wait([for (final s in sessions) _extras.rawRoster(s.id)]);
      if (cache != null) {
        for (var i = 0; i < sessions.length; i++) {
          await cache.putRoster(sessions[i].id, raws[i]);
        }
        await cache.putToday(date, [for (final s in sessions) s.id]);
      }
      if (mounted) {
        setState(() {
          _rosters = [for (final r in raws) AttendanceRoster.fromJson(r)];
          _offline = false;
        });
      }
    } catch (e) {
      final saved = e is ApiException && e.isNetwork && cache != null ? [for (final id in cache.today(date)) ?cache.roster(id)] : <AttendanceRoster>[];
      if (!mounted) return;
      if (saved.isNotEmpty) {
        setState(() {
          _rosters = saved;
          _offline = true;
        });
      } else {
        setState(() => _loadError = e);
      }
    }
  }

  void _onDetect(BarcodeCapture cap) {
    final rosters = _rosters;
    if (_busy || rosters == null || rosters.isEmpty) return;
    final raw = cap.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
    if (raw == null) return;
    final id = parsePlayerQr(raw);
    final key = id ?? raw;
    final now = DateTime.now();
    // Kartu yang masih di depan kamera akan terbaca berulang; abaikan kode yang sama sesaat.
    if (key == _lastKey && now.difference(_lastAt) < _repeatGap) return;
    _lastKey = key;
    _lastAt = now;
    _handle(id);
  }

  Future<void> _handle(String? playerId) async {
    _busy = true;
    try {
      final _ScanResult r;
      if (playerId == null) {
        r = _ScanResult(_Outcome.error, 'Bukan kartu siswa', 'Kode QR ini tidak berasal dari kartu siswa SSB.');
      } else {
        r = await _markPresent(playerId);
      }
      _report(r);
    } finally {
      _busy = false;
    }
  }

  Future<_ScanResult> _markPresent(String playerId) async {
    final rosters = _rosters!;
    final target = findScanTarget(playerId, rosters);
    if (target == null) return _notFoundToday(playerId);
    final s = target.roster.session;
    final key = attendanceOutboxKey(s.id);
    final queued = queuedEntries(_outbox.bodyFor(key))[playerId];
    final name = target.player.fullName;
    if ((queued?.status ?? target.player.status) == AttendanceStatus.hadir) {
      return _ScanResult(_Outcome.already, '$name sudah hadir', 'Sudah tercatat hadir di sesi ${s.ageGroup.name}.');
    }
    // Antrean absensi satu sesi hanya satu per kunci; entri yang sudah antre ikut dibawa agar tidak hilang.
    final body = mergeQueuedEntry(_outbox.bodyFor(key), playerId: playerId, status: AttendanceStatus.hadir, note: queued?.note ?? target.player.note);
    try {
      final res = await _outbox.submit(OutboxItem(key: key, path: '/sessions/${s.id}/attendance', body: body, label: 'Absensi ${s.ageGroup.name}, ${shortDay(s.date)}'));
      if (!mounted) return _ScanResult(_Outcome.ok, '$name hadir', null);
      setState(() {
        final cur = _rosters ?? rosters;
        final i = cur.indexWhere((r) => r.session.id == s.id);
        if (i < 0) return;
        _rosters = [...cur]..[i] = !res.queued && res.data is Map<String, dynamic> ? AttendanceRoster.fromJson(res.data as Map<String, dynamic>) : _withPresent(cur[i], playerId);
      });
      return _ScanResult(
        _Outcome.ok,
        '$name hadir',
        res.queued ? 'Tersimpan di perangkat, menunggu sinyal · ${s.ageGroup.name}' : 'Tercatat di sesi ${s.ageGroup.name}${s.startTime == null ? '' : ' jam ${s.startTime}'}',
      );
    } on ApiException catch (e) {
      return _ScanResult(_Outcome.error, 'Gagal mencatat $name', e.message);
    }
  }

  /// Siswa tidak ada di sesi hari ini milik pelatih: bedakan "bukan KU Anda" dari "KU tidak latihan hari ini".
  Future<_ScanResult> _notFoundToday(String playerId) async {
    try {
      final p = await _extras.playerCard(playerId);
      final ku = p.ageGroup?.name;
      return _ScanResult(_Outcome.error, '${p.fullName}: tidak ada sesi hari ini', ku == null ? 'Siswa belum punya KU.' : 'KU $ku tidak punya latihan hari ini, atau siswa tidak aktif.');
    } on ApiException catch (e) {
      if (e.status == 404) return _ScanResult(_Outcome.error, 'Bukan siswa KU Anda', 'Siswa ini tidak terdaftar di KU yang Anda tangani.');
      if (e.isNetwork) return _ScanResult(_Outcome.error, 'Siswa tidak ada di sesi hari ini', 'Tidak ada sinyal untuk memeriksa lebih jauh. Pastikan ini siswa KU Anda.');
      return _ScanResult(_Outcome.error, 'Siswa tidak bisa dicatat', e.message);
    }
  }

  AttendanceRoster _withPresent(AttendanceRoster r, String playerId) => AttendanceRoster(
        session: r.session,
        players: [
          for (final p in r.players)
            p.playerId == playerId ? RosterPlayer(playerId: p.playerId, fullName: p.fullName, memberNo: p.memberNo, status: AttendanceStatus.hadir, note: p.note, injured: p.injured) : p,
        ],
      );

  void _report(_ScanResult r) {
    switch (r.outcome) {
      case _Outcome.ok:
        HapticFeedback.mediumImpact();
      case _Outcome.already:
        HapticFeedback.lightImpact();
      case _Outcome.error:
        HapticFeedback.heavyImpact();
    }
    if (!mounted) return;
    setState(() {
      _log.insert(0, r);
      if (_log.length > 8) _log.removeLast();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pindai kartu QR'),
        actions: [
          IconButton(onPressed: _camera.toggleTorch, icon: const Icon(Icons.flashlight_on_outlined), tooltip: 'Senter'),
          IconButton(onPressed: _loadToday, icon: const Icon(Icons.refresh), tooltip: 'Muat ulang sesi hari ini'),
        ],
      ),
      body: _body(),
    );
  }

  Widget _body() {
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(errorText(_loadError!), textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.tonal(onPressed: _loadToday, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
    }
    final rosters = _rosters;
    if (rosters == null) return const Center(child: CircularProgressIndicator());
    if (rosters.isEmpty) return const EmptyState('Tidak ada latihan hari ini untuk dipindai.');
    final scheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        if (_offline)
          Container(
            width: double.infinity,
            color: scheme.secondaryContainer,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Text('Tidak ada sinyal. Memakai daftar sesi terakhir; hadir yang dipindai dikirim saat sinyal kembali.', style: TextStyle(color: scheme.onSecondaryContainer, fontSize: 13)),
          ),
        Expanded(
          flex: 3,
          child: Stack(
            fit: StackFit.expand,
            children: [
              MobileScanner(
                controller: _camera,
                onDetect: _onDetect,
                errorBuilder: (context, e) => _CameraError(e),
              ),
              IgnorePointer(
                child: Center(
                  child: Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(border: Border.all(color: Colors.white, width: 3), borderRadius: BorderRadius.circular(16)),
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          flex: 2,
          child: _log.isEmpty
              ? Center(child: Padding(padding: const EdgeInsets.all(16), child: Text('Arahkan kamera ke kode QR pada kartu siswa. Hadir tercatat otomatis.', textAlign: TextAlign.center, style: TextStyle(color: scheme.outline))))
              : ListView(padding: const EdgeInsets.all(12), children: [for (final r in _log) _ResultTile(r)]),
        ),
      ],
    );
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile(this.r);

  final _ScanResult r;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (r.outcome) {
      _Outcome.ok => (Icons.check_circle, Brand.hadir),
      _Outcome.already => (Icons.info_outline, Brand.izin),
      _Outcome.error => (Icons.error_outline, Brand.alpa),
    };
    return Card(
      child: ListTile(
        dense: true,
        leading: Icon(icon, color: color),
        title: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: r.detail == null ? null : Text(r.detail!),
      ),
    );
  }
}

class _CameraError extends StatelessWidget {
  const _CameraError(this.error);

  final MobileScannerException error;

  @override
  Widget build(BuildContext context) {
    final denied = error.errorCode == MobileScannerErrorCode.permissionDenied;
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            denied ? 'Izin kamera ditolak. Aktifkan izin kamera untuk aplikasi ini di pengaturan perangkat.' : 'Kamera tidak bisa dibuka di perangkat ini.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white),
          ),
        ),
      ),
    );
  }
}
