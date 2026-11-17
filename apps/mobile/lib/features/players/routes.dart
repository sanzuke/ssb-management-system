import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/models.dart';
import '../../core/session.dart';
import 'assessment_input_page.dart';
import 'development_plan_page.dart';
import 'player_profile_page.dart';
import 'report_page.dart';

/// Rute siswa: profil, input nilai, rencana pengembangan, rapor. Semuanya bisa dibuka hanya dengan id
/// (mis. dari notifikasi); `extra` pada profil hanya mempercepat tampilan awal.
///
/// Orang tua tidak mengisi nilai atau rencana: kedua rute itu menampilkan rapor, sama seperti web yang
/// mengarahkan orang tua dari `/rencana/[id]` ke halaman penilaian untuk dibaca.
final List<RouteBase> playersRoutes = [
  GoRoute(
    path: '/siswa/:id',
    builder: (_, s) => PlayerProfilePage(playerId: s.pathParameters['id']!, initial: s.extra is PlayerSummary ? s.extra! as PlayerSummary : null),
  ),
  GoRoute(
    path: '/siswa/:id/nilai',
    builder: (c, s) {
      final id = s.pathParameters['id']!;
      return c.read<SessionController>().role == Role.orangTua ? ReportPage(playerId: id) : AssessmentInputPage(playerId: id);
    },
  ),
  GoRoute(
    path: '/siswa/:id/rencana',
    builder: (c, s) {
      final id = s.pathParameters['id']!;
      return c.read<SessionController>().role == Role.orangTua ? ReportPage(playerId: id) : DevelopmentPlanPage(playerId: id);
    },
  ),
  GoRoute(path: '/siswa/:id/rapor', builder: (_, s) => ReportPage(playerId: s.pathParameters['id']!)),
];
