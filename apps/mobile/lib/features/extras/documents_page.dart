import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/format.dart';
import '../../core/models_extras.dart';
import '../../core/repo_extras.dart';
import '../../core/widgets.dart';

/// Berkas siswa untuk orang tua: kartu keluarga, akta kelahiran, NISN, dan raport
/// (PDF atau gambar, maksimal 5 MB). Selain raport, unggahan baru menggantikan yang lama.
class DocumentsPage extends StatefulWidget {
  const DocumentsPage({super.key, required this.playerId});

  final String playerId;

  @override
  State<DocumentsPage> createState() => _DocumentsPageState();
}

class _DocumentsPageState extends State<DocumentsPage> {
  late final ExtrasRepository _repo = ExtrasRepository.of(context);
  final _raportLabel = TextEditingController();
  List<PlayerDocument>? _docs;
  Object? _loadError;

  /// Jenis berkas atau id berkas yang sedang diproses; selama itu tombol lain dinonaktifkan.
  String? _busy;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _raportLabel.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await _repo.documents(widget.playerId);
      if (mounted) {
        setState(() {
          _docs = d;
          _loadError = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loadError = e);
    }
  }

  List<PlayerDocument> _of(DocKind k) => [for (final d in _docs ?? const <PlayerDocument>[]) if (d.kind == k) d];

  Future<void> _upload(DocKind kind) async {
    final label = _raportLabel.text.trim();
    if (kind == DocKind.raport && label.isEmpty) {
      setState(() => _error = 'Isi keterangan raport dulu, mis. Semester 1 2025/2026.');
      return;
    }
    setState(() => _error = null);
    final PlatformFile? file;
    try {
      file = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: documentExtensions);
    } on Object {
      if (mounted) setState(() => _error = 'Berkas tidak bisa dipilih. Periksa izin akses berkas di pengaturan perangkat.');
      return;
    }
    if (file == null || !mounted) return;
    if (!isAllowedDocumentName(file.name)) {
      setState(() => _error = 'Berkas harus berformat PDF, JPG, PNG, atau WebP.');
      return;
    }
    setState(() => _busy = kind.wire);
    try {
      final bytes = await file.readAsBytes();
      if (bytes.length > documentMaxBytes) throw const _Rejected('Berkas terlalu besar. Maksimal 5 MB.');
      await _repo.uploadDocument(widget.playerId, kind: kind, label: kind == DocKind.raport ? label : null, bytes: bytes, filename: file.name);
      if (kind == DocKind.raport) _raportLabel.clear();
      await _load();
      if (mounted) showMessage(context, '${kind.label} berhasil diunggah');
    } catch (e) {
      if (mounted) setState(() => _error = e is _Rejected ? e.message : errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _delete(PlayerDocument d) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Hapus ${d.kind.label}${d.label == null ? '' : ' (${d.label})'}?'),
        content: const Text('Berkas tidak bisa dikembalikan.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Hapus')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() {
      _busy = d.id;
      _error = null;
    });
    try {
      await _repo.deleteDocument(widget.playerId, d.id);
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// Gambar tampil di dalam aplikasi; PDF dibuka dengan aplikasi pembaca di perangkat.
  Future<void> _view(PlayerDocument d) async {
    setState(() {
      _busy = d.id;
      _error = null;
    });
    try {
      final f = await _repo.downloadDocument(widget.playerId, d.id);
      if (!mounted) return;
      if (d.isImage) {
        await showDialog<void>(
          context: context,
          builder: (c) => Dialog.fullscreen(
            child: Scaffold(
              appBar: AppBar(title: Text(d.originalName, overflow: TextOverflow.ellipsis)),
              body: InteractiveViewer(maxScale: 5, child: Center(child: Image.memory(f.bytes, errorBuilder: (_, _, _) => const Text('Gambar tidak bisa ditampilkan.')))),
            ),
          ),
        );
      } else {
        final dir = await getTemporaryDirectory();
        final path = '${dir.path}${Platform.pathSeparator}${d.id}.pdf';
        await File(path).writeAsBytes(f.bytes, flush: true);
        final res = await OpenFilex.open(path, type: 'application/pdf');
        if (res.type != ResultType.done && mounted) setState(() => _error = 'Tidak ada aplikasi untuk membuka PDF di perangkat ini.');
      }
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Berkas siswa')),
      body: RefreshIndicator(onRefresh: _load, child: _body()),
    );
  }

  Widget _body() {
    final scheme = Theme.of(context).colorScheme;
    if (_docs == null) {
      if (_loadError != null) {
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 48),
            Text(errorText(_loadError!), textAlign: TextAlign.center),
            const SizedBox(height: 16),
            Center(child: FilledButton.tonal(onPressed: _load, child: const Text('Coba lagi'))),
          ],
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final raports = _of(DocKind.raport);
    final idle = _busy == null;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'PDF, JPG, PNG, atau WebP, maksimal 5 MB per berkas. Hanya admin SSB dan orang tua anak ini yang bisa melihat. Pelatih tidak.',
          style: TextStyle(color: scheme.outline, fontSize: 13),
        ),
        if (_error != null)
          Card(
            color: scheme.errorContainer,
            child: Padding(padding: const EdgeInsets.all(12), child: Text(_error!, style: TextStyle(color: scheme.onErrorContainer))),
          ),
        const SizedBox(height: 8),
        for (final k in [DocKind.kartuKeluarga, DocKind.aktaKelahiran, DocKind.nisn])
          _DocCard(
            title: k.label,
            doc: _of(k).firstOrNull,
            uploading: _busy == k.wire,
            enabled: idle,
            onUpload: () => _upload(k),
            onView: _view,
            onDelete: _delete,
            deleting: _busy == _of(k).firstOrNull?.id,
          ),
        const SizedBox(height: 8),
        Text('Raport', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
        if (raports.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text('Belum diunggah.', style: TextStyle(color: scheme.outline))),
        for (final d in raports)
          _DocCard(title: 'Raport: ${d.label ?? '-'}', doc: d, uploading: false, enabled: idle, onUpload: null, onView: _view, onDelete: _delete, deleting: _busy == d.id),
        const SizedBox(height: 8),
        if (raports.length >= raportMax)
          Text('Raport sudah $raportMax berkas. Hapus yang lama untuk menambah.', style: TextStyle(color: scheme.outline))
        else ...[
          TextField(
            controller: _raportLabel,
            enabled: idle,
            maxLength: documentLabelMax,
            decoration: const InputDecoration(labelText: 'Tambah raport', hintText: 'mis. Semester 1 2025/2026', helperText: 'Keterangan wajib diisi dulu, lalu pilih berkasnya.', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: idle ? () => _upload(DocKind.raport) : null,
            icon: _busy == DocKind.raport.wire ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.upload_file),
            label: Text(_busy == DocKind.raport.wire ? 'Mengunggah…' : 'Pilih berkas raport'),
          ),
        ],
      ],
    );
  }
}

class _Rejected implements Exception {
  const _Rejected(this.message);

  final String message;
}

class _DocCard extends StatelessWidget {
  const _DocCard({required this.title, required this.doc, required this.uploading, required this.enabled, required this.onUpload, required this.onView, required this.onDelete, required this.deleting});

  final String title;
  final PlayerDocument? doc;
  final bool uploading;
  final bool deleting;
  final bool enabled;
  final VoidCallback? onUpload;
  final ValueChanged<PlayerDocument> onView;
  final ValueChanged<PlayerDocument> onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final d = doc;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(d == null ? Icons.radio_button_unchecked : Icons.check_circle, color: d == null ? scheme.outline : const Color(0xFF2E7D32), size: 20),
                const SizedBox(width: 8),
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall)),
                if (uploading || deleting) const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
              ],
            ),
            const SizedBox(height: 4),
            if (d == null)
              Text('Belum diunggah', style: TextStyle(color: scheme.outline))
            else ...[
              InkWell(
                onTap: enabled ? () => onView(d) : null,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      Icon(d.isImage ? Icons.image_outlined : Icons.picture_as_pdf_outlined, size: 18, color: scheme.primary),
                      const SizedBox(width: 6),
                      Expanded(child: Text(d.originalName, overflow: TextOverflow.ellipsis, style: TextStyle(color: scheme.primary))),
                    ],
                  ),
                ),
              ),
              Text('${formatBytes(d.sizeBytes)} · diunggah ${shortDay(isoDate(DateTime.parse(d.uploadedAt).toLocal()))}', style: TextStyle(color: scheme.outline, fontSize: 12)),
            ],
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (d != null) TextButton(onPressed: enabled ? () => onDelete(d) : null, child: const Text('Hapus')),
                if (onUpload != null) FilledButton.tonal(onPressed: enabled ? onUpload : null, child: Text(d == null ? 'Unggah' : 'Ganti')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
