import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../core/widgets/kt_loading_shimmer.dart';
import '../../providers/fleet_dashboard_provider.dart';

// ─── Provider ───────────────────────────────────────────────────────────────

final _driverAttendanceProvider = FutureProvider.autoDispose
    .family<Map<String, dynamic>, _AttendanceParams>((ref, params) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get(
    '/drivers/${params.driverId}/attendance',
    queryParameters: {'month': params.month},
  );
  final data = res['data'] as Map<String, dynamic>? ?? {};
  return data;
});

class _AttendanceParams {
  final int driverId;
  final String month;
  const _AttendanceParams(this.driverId, this.month);
  @override
  bool operator ==(Object o) =>
      o is _AttendanceParams && o.driverId == driverId && o.month == month;
  @override
  int get hashCode => Object.hash(driverId, month);
}

// ─── Screen ─────────────────────────────────────────────────────────────────

class FleetDriverAttendanceHistoryScreen extends ConsumerStatefulWidget {
  final int driverId;
  final String driverName;

  const FleetDriverAttendanceHistoryScreen({
    super.key,
    required this.driverId,
    required this.driverName,
  });

  @override
  ConsumerState<FleetDriverAttendanceHistoryScreen> createState() => _State();
}

class _State extends ConsumerState<FleetDriverAttendanceHistoryScreen> {
  late DateTime _selectedMonth;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _selectedMonth = DateTime(now.year, now.month);
  }

  String get _monthKey =>
      '${_selectedMonth.year}-${_selectedMonth.month.toString().padLeft(2, '0')}';

  String get _monthLabel {
    const months = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return '${months[_selectedMonth.month]} ${_selectedMonth.year}';
  }

  bool get _isCurrentMonth {
    final now = DateTime.now();
    return _selectedMonth.year == now.year && _selectedMonth.month == now.month;
  }

  void _prevMonth() => setState(
      () => _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month - 1));

  void _nextMonth() {
    if (!_isCurrentMonth) {
      setState(() =>
          _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1));
    }
  }

  Color _statusColor(String? s) {
    switch (s) {
      case 'present': return KTColors.success;
      case 'late': return const Color(0xFFF59E0B);
      case 'absent': return KTColors.danger;
      case 'leave': return KTColors.info;
      case 'weekly_off': return KTColors.textMuted;
      default: return KTColors.textMuted;
    }
  }

  String _statusLabel(String? s) {
    switch (s) {
      case 'present': return 'Present';
      case 'late': return 'Late';
      case 'absent': return 'Absent';
      case 'leave': return 'On Leave';
      case 'weekly_off': return 'Day Off';
      default: return s ?? '—';
    }
  }

  IconData _statusIcon(String? s) {
    switch (s) {
      case 'present': return Icons.check_circle_rounded;
      case 'late': return Icons.schedule_rounded;
      case 'absent': return Icons.cancel_rounded;
      case 'leave': return Icons.event_busy_rounded;
      case 'weekly_off': return Icons.weekend_rounded;
      default: return Icons.help_outline_rounded;
    }
  }

  /// Format ISO datetime string to "08:30 AM"
  String _fmtTime(String? iso) {
    if (iso == null) return '—';
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour;
      final m = dt.minute.toString().padLeft(2, '0');
      final period = h >= 12 ? 'PM' : 'AM';
      final hour12 = h % 12 == 0 ? 12 : h % 12;
      return '$hour12:$m $period';
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    final params = _AttendanceParams(widget.driverId, _monthKey);
    final asyncData = ref.watch(_driverAttendanceProvider(params));

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        foregroundColor: KTColors.textHeading,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Attendance History',
                style: KTTextStyles.h2.copyWith(
                    color: KTColors.textHeading, fontSize: 16)),
            Text(widget.driverName,
                style: KTTextStyles.bodySmall.copyWith(
                    color: KTColors.textMuted)),
          ],
        ),
      ),
      body: Column(
        children: [
          // ─── Month Selector ───────────────────────────────────────
          Container(
            color: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Row(
              children: [
                IconButton(
                  onPressed: _prevMonth,
                  icon: const Icon(Icons.chevron_left_rounded, size: 26),
                  color: KTColors.textHeading,
                ),
                Expanded(
                  child: Center(
                    child: Text(_monthLabel,
                        style: KTTextStyles.bodyMedium.copyWith(
                            fontWeight: FontWeight.w700,
                            color: KTColors.textHeading)),
                  ),
                ),
                IconButton(
                  onPressed: _isCurrentMonth ? null : _nextMonth,
                  icon: Icon(Icons.chevron_right_rounded, size: 26,
                      color: _isCurrentMonth
                          ? KTColors.borderColor
                          : KTColors.textHeading),
                ),
              ],
            ),
          ),

          Expanded(
            child: asyncData.when(
              loading: () => const Padding(
                padding: EdgeInsets.all(16),
                child: KTLoadingShimmer(type: ShimmerType.list),
              ),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline_rounded,
                        size: 48, color: KTColors.danger),
                    const SizedBox(height: 12),
                    Text('Failed to load attendance',
                        style: KTTextStyles.body
                            .copyWith(color: KTColors.textMuted)),
                    TextButton(
                      onPressed: () =>
                          ref.invalidate(_driverAttendanceProvider(params)),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (data) {
                final summary =
                    data['summary'] as Map<String, dynamic>? ?? {};
                final items = (data['items'] as List? ?? [])
                    .cast<Map<String, dynamic>>();

                return RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(_driverAttendanceProvider(params)),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
                    children: [
                      // ── Summary Card ──────────────────────────────
                      Container(
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: KTColors.borderColor),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.04),
                              blurRadius: 8,
                              offset: const Offset(0, 2),
                            )
                          ],
                        ),
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.bar_chart_rounded,
                                    size: 18, color: KTColors.primary),
                                const SizedBox(width: 8),
                                Text('Monthly Summary',
                                    style: KTTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.w700,
                                        color: KTColors.textHeading)),
                                const Spacer(),
                                _AttendanceBadge(
                                    pct: summary['attendance_pct'] ?? 0),
                              ],
                            ),
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                _SummaryTile(
                                  label: 'Present',
                                  value: '${summary['present_days'] ?? 0}',
                                  color: KTColors.success,
                                  icon: Icons.check_circle_rounded,
                                ),
                                const SizedBox(width: 8),
                                _SummaryTile(
                                  label: 'Late',
                                  value: '${summary['late_days'] ?? 0}',
                                  color: const Color(0xFFF59E0B),
                                  icon: Icons.schedule_rounded,
                                ),
                                const SizedBox(width: 8),
                                _SummaryTile(
                                  label: 'Absent',
                                  value: '${summary['absent_days'] ?? 0}',
                                  color: KTColors.danger,
                                  icon: Icons.cancel_rounded,
                                ),
                                const SizedBox(width: 8),
                                _SummaryTile(
                                  label: 'Leave',
                                  value: '${summary['leave_days'] ?? 0}',
                                  color: KTColors.info,
                                  icon: Icons.event_busy_rounded,
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                const Icon(Icons.access_time_rounded,
                                    size: 14, color: KTColors.textMuted),
                                const SizedBox(width: 4),
                                Text(
                                  'Total hours this month: ${summary['total_hours'] ?? 0}h',
                                  style: KTTextStyles.bodySmall
                                      .copyWith(color: KTColors.textMuted),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 16),

                      // ── Daily Records ─────────────────────────────
                      if (items.isEmpty)
                        Center(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 40),
                            child: Text('No records for this month',
                                style: KTTextStyles.body
                                    .copyWith(color: KTColors.textMuted)),
                          ),
                        )
                      else
                        ...items.map((item) => _DayCard(
                              item: item,
                              statusColor: _statusColor(
                                  item['status']?.toString()),
                              statusLabel: _statusLabel(
                                  item['status']?.toString()),
                              statusIcon: _statusIcon(
                                  item['status']?.toString()),
                              fmtTime: _fmtTime,
                            )),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Day Card ────────────────────────────────────────────────────────────────

class _DayCard extends StatelessWidget {
  final Map<String, dynamic> item;
  final Color statusColor;
  final String statusLabel;
  final IconData statusIcon;
  final String Function(String?) fmtTime;

  const _DayCard({
    required this.item,
    required this.statusColor,
    required this.statusLabel,
    required this.statusIcon,
    required this.fmtTime,
  });

  @override
  Widget build(BuildContext context) {
    final status = item['status']?.toString();
    final isOff = status == 'weekly_off';
    final isPresent = status == 'present' || status == 'late';
    final photoUrl = item['photo_url']?.toString();
    final location = item['location']?.toString();
    final checkIn = item['check_in_time']?.toString();
    final dateStr = (item['date'] ?? '').toString();
    final day = (item['day'] ?? '').toString();
    final dayNum = dateStr.isNotEmpty ? dateStr.split('-').last : '?';
    final dayShort = day.length >= 3 ? day.substring(0, 3) : day;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: isOff ? KTColors.lightBg : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: isOff ? KTColors.borderColor : statusColor.withOpacity(0.25),
            width: isOff ? 1 : 1.2),
      ),
      child: Column(
        children: [
          // ── Top row: date block + check-in time (or status for absent/off) ──
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                // Date block
                Container(
                  width: 48,
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  decoration: BoxDecoration(
                    color: isOff
                        ? KTColors.borderColor.withOpacity(0.5)
                        : statusColor.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    children: [
                      Text(dayNum,
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: isOff ? KTColors.textMuted : statusColor,
                          )),
                      Text(dayShort,
                          style: TextStyle(
                              fontSize: 10, color: KTColors.textMuted)),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                if (isPresent && checkIn != null) ...[
                  Icon(Icons.login_rounded,
                      size: 15,
                      color: statusColor.withOpacity(0.8)),
                  const SizedBox(width: 5),
                  Text(fmtTime(checkIn),
                      style: KTTextStyles.bodyMedium.copyWith(
                        fontWeight: FontWeight.w700,
                        color: statusColor,
                      )),
                ] else ...[
                  Icon(statusIcon, size: 16, color: statusColor),
                  const SizedBox(width: 6),
                  Text(statusLabel,
                      style: KTTextStyles.bodySmall.copyWith(
                          fontWeight: FontWeight.w600, color: statusColor)),
                ],
              ],
            ),
          ),

          // ── Photo + location row (only for present/late with data) ─────────
          if (isPresent && (photoUrl != null || location != null)) ...[
            Divider(height: 1, color: KTColors.borderColor),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  if (photoUrl != null) ...[
                    GestureDetector(
                      onTap: () => _showPhotoDialog(context, photoUrl),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: _buildPhoto(photoUrl, 60, 60),
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                  if (location != null)
                    Expanded(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.location_on_rounded,
                              size: 14, color: Color(0xFFE53E3E)),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              _formatLocation(location),
                              style: KTTextStyles.labelSmall
                                  .copyWith(color: KTColors.textMuted),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// Renders a photo from either a base64 data URL or an http URL.
  Widget _buildPhoto(String photoUrl, double width, double height) {
    if (photoUrl.startsWith('data:image/')) {
      try {
        final b64 = photoUrl.split(',').last;
        final bytes = base64Decode(b64);
        return Image.memory(bytes,
            width: width, height: height, fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => _photoError(width, height));
      } catch (_) {
        return _photoError(width, height);
      }
    }
    return Image.network(photoUrl,
        width: width, height: height, fit: BoxFit.cover,
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : _photoLoading(width, height),
        errorBuilder: (_, __, ___) => _photoError(width, height));
  }

  Widget _photoLoading(double w, double h) => Container(
        width: w, height: h, color: KTColors.borderColor,
        child: const Center(
            child: SizedBox(
                width: 18, height: 18,
                child: CircularProgressIndicator(strokeWidth: 2))),
      );

  Widget _photoError(double w, double h) => Container(
        width: w, height: h, color: KTColors.borderColor,
        child: const Icon(Icons.broken_image_rounded,
            color: KTColors.textMuted, size: 24),
      );

  /// Format "37.421998, -122.084000" → "37.4220°N  122.0840°W"
  String _formatLocation(String raw) {
    final parts = raw.split(',');
    if (parts.length == 2) {
      final lat = double.tryParse(parts[0].trim());
      final lng = double.tryParse(parts[1].trim());
      if (lat != null && lng != null) {
        final latStr =
            '${lat.abs().toStringAsFixed(4)}°${lat >= 0 ? 'N' : 'S'}';
        final lngStr =
            '${lng.abs().toStringAsFixed(4)}°${lng >= 0 ? 'E' : 'W'}';
        return '$latStr  $lngStr';
      }
    }
    return raw;
  }

  void _showPhotoDialog(BuildContext context, String photoUrl) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(16),
          child: photoUrl.startsWith('data:image/')
              ? () {
                  try {
                    final bytes = base64Decode(photoUrl.split(',').last);
                    return Image.memory(bytes, fit: BoxFit.contain);
                  } catch (_) {
                    return const SizedBox();
                  }
                }()
              : Image.network(photoUrl, fit: BoxFit.contain),
        ),
      ),
    );
  }
}

// ─── Summary Tile ────────────────────────────────────────────────────────────

class _SummaryTile extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const _SummaryTile({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(height: 4),
            Text(value,
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: color)),
            const SizedBox(height: 2),
            Text(label,
                style:
                    TextStyle(fontSize: 10, color: color.withOpacity(0.8))),
          ],
        ),
      ),
    );
  }
}

// ─── Attendance % Badge ──────────────────────────────────────────────────────

class _AttendanceBadge extends StatelessWidget {
  final int pct;
  const _AttendanceBadge({required this.pct});

  Color get _color {
    if (pct >= 90) return KTColors.success;
    if (pct >= 75) return const Color(0xFFF59E0B);
    return KTColors.danger;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: _color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: _color.withOpacity(0.3)),
      ),
      child: Text('$pct%',
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: _color)),
    );
  }
}
