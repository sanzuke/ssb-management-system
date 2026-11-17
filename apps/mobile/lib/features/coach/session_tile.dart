import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/format.dart';
import '../../core/models.dart';
import '../../core/outbox.dart';
import '../../core/widgets.dart';
import '../extras/attendance_logic.dart';

/// Satu sesi latihan dengan ringkasan absensi; ketuk membuka layar absensi.
class SessionTile extends StatelessWidget {
  const SessionTile(this.s, {super.key, this.showDate = true});

  final TrainingSession s;
  final bool showDate;

  @override
  Widget build(BuildContext context) {
    final c = s.counts;
    final total = c.hadir + c.izin + c.sakit + c.alpa + c.belum;
    final done = total - c.belum;
    final scheme = Theme.of(context).colorScheme;
    // Absensi yang masih antre di perangkat belum terlihat di hitungan server.
    final waiting = context.select<Outbox, bool>((o) => o.has(attendanceOutboxKey(s.id)));
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () async {
          final owner = context.findAncestorStateOfType<LoadViewState<List<TrainingSession>>>();
          await context.push('/absensi/${s.id}');
          owner?.reload();
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (showDate) Text('${relativeDay(s.date)} · ${shortDay(s.date)}', style: TextStyle(color: scheme.primary, fontWeight: FontWeight.w600, fontSize: 13)),
                    Text(
                      sessionLine(ageGroup: s.ageGroup.name, location: s.location?.name, time: s.startTime),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      total == 0
                          ? 'Belum ada siswa aktif'
                          : done == 0
                              ? 'Absensi belum diisi'
                              : '$done dari $total tercatat · ${c.hadir} hadir',
                      style: TextStyle(color: scheme.outline),
                    ),
                    if (waiting)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.cloud_upload_outlined, size: 14, color: scheme.tertiary),
                            const SizedBox(width: 4),
                            Text('menunggu sinyal', style: TextStyle(color: scheme.tertiary, fontSize: 12, fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Icon(done == total && total > 0 ? Icons.check_circle : Icons.chevron_right, color: done == total && total > 0 ? statusColor(context, AttendanceStatus.hadir) : scheme.outline),
            ],
          ),
        ),
      ),
    );
  }
}
