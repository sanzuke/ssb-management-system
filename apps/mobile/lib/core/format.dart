import 'package:intl/intl.dart';

String _pad(int n) => n.toString().padLeft(2, '0');

String isoDate(DateTime d) => '${d.year}-${_pad(d.month)}-${_pad(d.day)}';

/// Tanggal hari ini menurut jam perangkat, bukan UTC.
String today() => isoDate(DateTime.now());

DateTime parseDate(String iso) => DateTime.parse('${iso.substring(0, 10)}T00:00:00');

int daysFromToday(String iso) => parseDate(iso).difference(parseDate(today())).inDays;

String dayLabel(String iso) => DateFormat('EEEE, d MMMM', 'id_ID').format(parseDate(iso));

String shortDay(String iso) => DateFormat('EEE, d MMM', 'id_ID').format(parseDate(iso));

String monthLabel(String iso) => DateFormat('MMMM yyyy', 'id_ID').format(parseDate(iso));

String relativeDay(String iso) {
  final n = daysFromToday(iso);
  if (n == 0) return 'Hari ini';
  if (n == 1) return 'Besok';
  if (n == -1) return 'Kemarin';
  return n > 0 ? '$n hari lagi' : '${-n} hari lalu';
}

final _rupiah = NumberFormat.decimalPattern('id_ID');

String rupiah(int n) => 'Rp ${_rupiah.format(n)}';

/// Usia dalam tahun dari tanggal lahir.
int ageOf(String birthIso) {
  final b = parseDate(birthIso);
  final n = DateTime.now();
  var a = n.year - b.year;
  if (n.month < b.month || (n.month == b.month && n.day < b.day)) a--;
  return a;
}

String initials(String name) {
  final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final first = parts.first[0];
  return (parts.length == 1 ? first : first + parts.last[0]).toUpperCase();
}
