import 'package:flutter/material.dart';

/// Kunci ScaffoldMessenger global agar pesan (galat antrean offline, notifikasi saat aplikasi terbuka)
/// bisa tampil dari luar pohon widget halaman.
final GlobalKey<ScaffoldMessengerState> rootMessengerKey = GlobalKey<ScaffoldMessengerState>();
