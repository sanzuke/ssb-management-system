import 'package:go_router/go_router.dart';

import '../../core/models.dart';
import 'absence_page.dart';
import 'calendar_page.dart';
import 'card_page.dart';
import 'documents_page.dart';
import 'donations_page.dart';
import 'invoice_detail_page.dart';
import 'scan_page.dart';

/// Rute fitur tambahan: kalender, donasi, berkas, kartu QR, pemindai, izin, rincian tagihan.
final List<RouteBase> extrasRoutes = [
  GoRoute(path: '/pindai', builder: (_, _) => const ScanPage()),
  GoRoute(path: '/kalender', builder: (_, _) => const CalendarPage()),
  GoRoute(path: '/donasi', builder: (_, _) => const CampaignsPage()),
  GoRoute(path: '/donasi/:id', builder: (_, s) => CampaignDetailPage(id: s.pathParameters['id']!)),
  GoRoute(path: '/berkas/:id', builder: (_, s) => DocumentsPage(playerId: s.pathParameters['id']!)),
  GoRoute(path: '/kartu/:id', builder: (_, s) => PlayerCardPage(playerId: s.pathParameters['id']!)),
  GoRoute(path: '/izin', builder: (_, _) => const AbsencePage()),
  // `extra` boleh membawa Invoice dari kartu tagihan; tanpa itu rincian dimuat dari server.
  GoRoute(
    path: '/tagihan/:id',
    builder: (_, s) => InvoiceDetailPage(invoice: s.extra is Invoice ? s.extra as Invoice : null, invoiceId: s.pathParameters['id']),
  ),
];
