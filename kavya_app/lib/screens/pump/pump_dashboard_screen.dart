import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/fuel.dart';
import '../../models/attendance.dart';
import '../../providers/pump_dashboard_provider.dart';
import '../../providers/attendance_provider.dart';
import '../../utils/indian_format.dart';

/// Pump Operator Dashboard — day timeline, attendance, checklist, daily reports.
class PumpDashboardScreen extends ConsumerStatefulWidget {
  const PumpDashboardScreen({super.key});

  @override
  ConsumerState<PumpDashboardScreen> createState() => _PumpDashboardScreenState();
}

class _PumpDashboardScreenState extends ConsumerState<PumpDashboardScreen> {
  static const _amber = Color(0xFFEA580C);
  static const _green = Color(0xFF10B981);
  static const _red = Color(0xFFEF4444);
  static const _blue = Color(0xFF3B82F6);
  static const _textPrimary = Color(0xFF0D1B2A);
  static const _textSecondary = Color(0xFF8494A4);
  static const _cardColor = Color(0xFFFFFFFF);

  final _checklistNotesCtrl = TextEditingController();

  @override
  void dispose() {
    _checklistNotesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(pumpDashboardDateProvider);
    final dateStr = _fmtDate(selectedDate);
    final statsAsync = ref.watch(pumpStatsByDateProvider(dateStr));
    final issuesAsync = ref.watch(pumpFuelIssuesByDateProvider(dateStr));
    final tanksAsync = ref.watch(fuelTanksProvider);
    final attendanceAsync = ref.watch(attendanceProvider);
    final checklist = ref.watch(pumpChecklistProvider);
    final isToday = _isToday(selectedDate);

    return RefreshIndicator(
      color: _amber,
      onRefresh: () async {
        ref.invalidate(pumpStatsByDateProvider(dateStr));
        ref.invalidate(pumpFuelIssuesByDateProvider(dateStr));
        ref.invalidate(fuelTanksProvider);
        ref.invalidate(attendanceProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          // ─── Day Timeline ───
          _buildTimelineRow(selectedDate),
          const SizedBox(height: 16),

          // ─── Attendance card (today only) ───
          if (isToday) ...[
            attendanceAsync.when(
              data: (att) => _buildAttendanceCard(att),
              loading: () => _shimmer(148),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 16),
          ],

          // ─── Checklist (today only) ───
          if (isToday) ...[
            _buildChecklist(checklist),
            const SizedBox(height: 20),
          ],

          // ─── Quick Actions (today only) ───
          if (isToday) ...[
            Row(
              children: [
                _actionChip(Icons.price_change_outlined, 'Update Rate', () {
                  showModalBottomSheet(
                    context: context,
                    backgroundColor: Colors.transparent,
                    isScrollControlled: true,
                    builder: (_) => const _UpdateRateSheet(),
                  );
                }),
              ],
            ),
            const SizedBox(height: 20),
          ],

          // ─── Daily KPI Summary ───
          _section(isToday ? 'Today\'s Summary' : 'Summary — ${_displayDate(selectedDate)}'),
          const SizedBox(height: 10),
          ref.watch(pumpDashboardProvider).maybeWhen(
            data: (dash) => dash.branchName != null
                ? Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.location_on_rounded, size: 14, color: _amber),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            dash.branchName!,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: _amber,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                : const SizedBox.shrink(),
            orElse: () => const SizedBox.shrink(),
          ),
          statsAsync.when(
            data: (s) => _kpiRow(s),
            loading: () => _shimmer(88),
            error: (_, __) => _errorTile('Failed to load stats'),
          ),
          const SizedBox(height: 20),

          // ─── Tank Levels ───
          _section('Tank Levels'),
          const SizedBox(height: 10),
          tanksAsync.when(
            data: (tanks) => tanks.isEmpty
                ? _emptyCard('No fuel tanks configured')
                : Column(children: tanks.map(_tankGauge).toList()),
            loading: () => _shimmer(100),
            error: (_, __) => _errorTile('Failed to load tanks'),
          ),
          const SizedBox(height: 20),

          // ─── Fuel Log for this day ───
          _section('Fuel Log'),
          const SizedBox(height: 10),
          issuesAsync.when(
            data: (issues) => issues.isEmpty
                ? _emptyCard('No fuel entries for this day')
                : Column(children: issues.take(15).map(_issueCard).toList()),
            loading: () => _shimmer(120),
            error: (_, __) => _errorTile('Failed to load fuel log'),
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Day Timeline
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildTimelineRow(DateTime selected) {
    final today = DateTime.now();
    final days = List.generate(7, (i) => today.subtract(Duration(days: 6 - i)));

    return SizedBox(
      height: 68,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: days.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final d = days[i];
          final isSel = _fmtDate(d) == _fmtDate(selected);
          final isT = _isToday(d);
          return GestureDetector(
            onTap: () => ref.read(pumpDashboardDateProvider.notifier).state = d,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: 46,
              decoration: BoxDecoration(
                color: isSel ? _amber : _cardColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isSel ? _amber : const Color(0xFFE2E8F0),
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(_weekday(d),
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: isSel ? Colors.white : _textSecondary)),
                  const SizedBox(height: 3),
                  Text('${d.day}',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: isSel ? Colors.white : _textPrimary)),
                  if (isT)
                    Container(
                      margin: const EdgeInsets.only(top: 3),
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(
                        color: isSel ? Colors.white : _amber,
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Attendance Card (driver-style, amber theme)
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildAttendanceCard(Attendance? att) {
    final isCheckedIn = att?.checkInTime != null;
    final now = DateTime.now();
    final dateLabel =
        '${now.day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.month - 1]} ${now.year}';

    String checkInDisplay = '--:--';
    if (att?.checkInTime != null) {
      try {
        final dt = DateTime.parse(att!.checkInTime!).toLocal();
        checkInDisplay = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      } catch (_) {
        checkInDisplay = att!.checkInTime!;
      }
    }

    final isLate = att?.status == 'late';
    final statusColor = isCheckedIn
        ? (isLate ? const Color(0xFFF59E0B) : _green)
        : _textSecondary;
    final statusLabel = isCheckedIn
        ? (isLate ? 'Late' : 'Present')
        : 'Not Checked In';

    return Container(
      decoration: BoxDecoration(
        color: isCheckedIn ? const Color(0xFFEAFAF1) : _cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isCheckedIn
              ? _green.withValues(alpha: 0.4)
              : const Color(0xFFE2E8F0),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header row ──
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                  ),
                  child: Icon(
                    isCheckedIn ? Icons.how_to_reg_rounded : Icons.fingerprint_rounded,
                    color: statusColor,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Attendance',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _amber,
                        ),
                      ),
                      Text(
                        dateLabel,
                        style: const TextStyle(
                          fontSize: 12,
                          color: _textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                // Status badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: statusColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 16),
            const Divider(color: Color(0xFFE2E8F0), height: 1),
            const SizedBox(height: 16),

            if (isCheckedIn) ...[  
              // ── Checked-in details ──
              Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: _green.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: _green.withValues(alpha: 0.2)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.login_rounded, color: _green, size: 16),
                          const SizedBox(height: 4),
                          const Text('Check-in Time',
                              style: TextStyle(fontSize: 10, color: _textSecondary)),
                          const SizedBox(height: 2),
                          Text(checkInDisplay,
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: _green)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: statusColor.withValues(alpha: 0.2)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(Icons.verified_user_outlined, color: statusColor, size: 16),
                          const SizedBox(height: 4),
                          const Text('Status',
                              style: TextStyle(fontSize: 10, color: _textSecondary)),
                          const SizedBox(height: 2),
                          Text((att?.status ?? 'present').toUpperCase(),
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                  color: statusColor)),
                        ],
                      ),
                    ),
                  ),
                  if (att?.checkInPhotoUrl != null) ...[  
                    const SizedBox(width: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.memory(
                        base64Decode(
                          att!.checkInPhotoUrl!.contains(',')
                              ? att.checkInPhotoUrl!.split(',')[1]
                              : att.checkInPhotoUrl!,
                        ),
                        width: 52,
                        height: 52,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          width: 52,
                          height: 52,
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.photo,
                              color: _textSecondary, size: 20),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ] else ...[  
              // ── Not checked in — CTA ──
              const Row(
                children: [
                  Icon(Icons.info_outline, color: _textSecondary, size: 16),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Take a selfie to mark your attendance for today.',
                      style: TextStyle(fontSize: 12, color: _textSecondary),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _startCheckIn,
                  icon: const Icon(Icons.camera_alt_rounded, size: 18),
                  label: const Text('Mark Attendance'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _amber,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _startCheckIn() async {
    final notifier = ref.read(attendanceProvider.notifier);
    final picker = ImagePicker();
    final photo = await picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 60,
      maxWidth: 800,
    );
    if (photo == null || !mounted) return;
    final bytes = await File(photo.path).readAsBytes();
    final b64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
    final pos = await notifier.getLocation();
    if (!mounted) return;
    final msg = await notifier.checkIn(
      photoDataUrl: b64,
      lat: pos?.latitude,
      lng: pos?.longitude,
    );
    if (!mounted) return;
    if (msg != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: _green),
      );
    } else {
      // Show error from state if available
      final attState = ref.read(attendanceProvider);
      final errMsg = attState.hasError
          ? attState.error.toString().replaceAll('Exception: ', '')
          : 'Attendance check-in failed. Please try again.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(errMsg),
          backgroundColor: _red,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
      // Reset to data(null) so the card is visible again
      ref.invalidate(attendanceProvider);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Checklist Card (driver-style)
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _buildChecklist(Set<String> done) {
    final total = kPumpChecklistItems.length;
    final completedCount = done.length;
    final progress = total > 0 ? completedCount / total : 0.0;
    final allDone = completedCount >= total;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Progress card ──
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFF7F9FC),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Items Completed',
                      style: TextStyle(fontSize: 13, color: _textSecondary)),
                  Text(
                    '$completedCount/$total (${(progress * 100).toStringAsFixed(0)}%)',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: allDone ? _green : _amber,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 8,
                  backgroundColor: const Color(0xFFE2E8F0),
                  valueColor: AlwaysStoppedAnimation<Color>(allDone ? _green : _amber),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // ── Item tiles ──
        ...kPumpChecklistItems.map((item) => _checklistItemTile(item, done)),

        if (!allDone) ...[  
          const SizedBox(height: 10),
          Text(
            'Complete all items to unlock the Log tab',
            style: TextStyle(fontSize: 11, color: _amber.withValues(alpha: 0.7)),
          ),
        ],
      ],
    );
  }

  Widget _checklistItemTile(String item, Set<String> done) {
    final isDone = done.contains(item);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: isDone ? _green.withValues(alpha: 0.07) : const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDone
              ? _green.withValues(alpha: 0.4)
              : const Color(0xFFE2E8F0),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
            child: Row(
              children: [
                // Label
                Expanded(
                  child: Text(
                    item,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: isDone ? _textSecondary : _textPrimary,
                      decoration:
                          isDone ? TextDecoration.lineThrough : null,
                      decorationColor: _textSecondary,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                // DONE button
                GestureDetector(
                    onTap: () {
                            final notifier =
                                ref.read(pumpChecklistProvider.notifier);
                            if (isDone) {
                              notifier.unmark(item);
                            } else {
                              notifier.markDone(item);
                            }
                          },
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        color: isDone
                            ? _green.withValues(alpha: 0.15)
                            : _red.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isDone ? _green : _red,
                          width: 1.5,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            isDone
                                ? Icons.check_rounded
                                : Icons.close_rounded,
                            size: 15,
                            color: isDone ? _green : _red,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            'DONE',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: isDone ? _green : _red,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ],
                      ),
                    ),
                ),
              ],
            ),
          ),

        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Quick action chips
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _actionChip(IconData icon, String label, VoidCallback onTap) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: _cardColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: _amber.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              Icon(icon, color: _amber, size: 24),
              const SizedBox(height: 6),
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w600, color: _textPrimary)),
            ],
          ),
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // KPI Row
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _kpiRow(Map<String, dynamic> s) {
    return Row(
      children: [
        _kpi(Icons.local_gas_station, IndianFormat.litres(s['total_litres'] as double), 'Litres', _amber),
        const SizedBox(width: 8),
        _kpi(Icons.directions_car, '${s['vehicle_count']}', 'Vehicles', _green),
        const SizedBox(width: 8),
        _kpi(Icons.currency_rupee, IndianFormat.currencyCompact(s['total_cost'] as double), 'Cost', _blue),
      ],
    );
  }

  Widget _kpi(IconData icon, String value, String label, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 4),
        decoration: BoxDecoration(
          color: _cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.25)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 6),
            Text(value,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color),
                textAlign: TextAlign.center),
            const SizedBox(height: 2),
            Text(label,
                style: const TextStyle(fontSize: 10, color: _textSecondary),
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tank Gauge
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _tankGauge(FuelTank t) {
    final pct = t.stockPercent / 100;
    final color = pct < 0.25 ? _red : pct < 0.5 ? _amber : _green;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _cardColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t.name,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: _textPrimary)),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(
              value: pct.clamp(0.0, 1.0),
              backgroundColor: const Color(0xFFE2E8F0),
              valueColor: AlwaysStoppedAnimation(color),
              minHeight: 10,
            ),
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${t.currentStockLitres.toStringAsFixed(0)} L',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: color)),
              Text('${t.stockPercent.toStringAsFixed(1)}% of ${t.capacityLitres.toStringAsFixed(0)} L',
                  style: const TextStyle(fontSize: 12, color: _textSecondary)),
            ],
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Issue Card
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _issueCard(FuelIssue i) {
    final time = i.issuedAt.toLocal();
    final timeStr = '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _cardColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: i.isFlagged ? _red.withValues(alpha: 0.3) : const Color(0xFFE2E8F0),
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: (i.isFlagged ? _red : _amber).withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              i.isFlagged ? Icons.warning_amber_rounded : Icons.local_gas_station_rounded,
              color: i.isFlagged ? _red : _amber,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(i.vehicleRegistration ?? 'Vehicle #${i.vehicleId}',
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700, color: _textPrimary)),
                const SizedBox(height: 2),
                Text('${i.quantityLitres.toStringAsFixed(1)} L  •  ${IndianFormat.currency(i.totalAmount)}',
                    style: const TextStyle(fontSize: 12, color: _textSecondary)),
              ],
            ),
          ),
          Text(timeStr,
              style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w600, color: _textSecondary)),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════════
  Widget _section(String t) => Text(t,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: _textPrimary));

  Widget _emptyCard(String msg) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
            color: _cardColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE2E8F0))),
        child: Center(child: Text(msg, style: const TextStyle(fontSize: 13, color: _textSecondary))),
      );

  Widget _errorTile(String msg) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
            color: _red.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(10)),
        child: Text(msg, style: const TextStyle(color: _red, fontSize: 13)),
      );

  Widget _shimmer(double h) => Container(
        height: h,
        decoration: BoxDecoration(color: const Color(0xFFE2E8F0), borderRadius: BorderRadius.circular(12)),
      );

  String _fmtDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _displayDate(DateTime d) => '${d.day}/${d.month}/${d.year}';
  bool _isToday(DateTime d) {
    final n = DateTime.now();
    return d.year == n.year && d.month == n.month && d.day == n.day;
  }

  String _weekday(DateTime d) => const ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d.weekday - 1];
}

// ---------------------------------------------------------------------------
// Update Rate Bottom Sheet
// ---------------------------------------------------------------------------

class _UpdateRateSheet extends ConsumerStatefulWidget {
  const _UpdateRateSheet();

  @override
  ConsumerState<_UpdateRateSheet> createState() => _UpdateRateSheetState();
}

class _UpdateRateSheetState extends ConsumerState<_UpdateRateSheet> {
  static const _bg = Color(0xFFF7F9FC);
  static const _card = Color(0xFFFFFFFF);
  static const _amber = Color(0xFFEA580C);
  static const _petrolColor = Color(0xFF10B981);
  static const _textPrimary = Color(0xFF0D1B2A);
  static const _textSecondary = Color(0xFF8494A4);

  final _dieselCtrl = TextEditingController();
  final _petrolCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    final currentDiesel = ref.read(pumpRatePerLitreProvider);
    _dieselCtrl.text = currentDiesel.toStringAsFixed(2);
    final currentPetrol = ref.read(pumpPetrolRatePerLitreProvider);
    _petrolCtrl.text = currentPetrol.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _dieselCtrl.dispose();
    _petrolCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE8EEF4),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text('Update Fuel Rate',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _textPrimary)),
            const SizedBox(height: 4),
            const Text('Set the current rate per litre for new dispensing entries',
                style: TextStyle(fontSize: 13, color: _textSecondary)),
            const SizedBox(height: 20),
            // ── Diesel ──
            Row(children: [
              Container(
                width: 10, height: 10,
                decoration: const BoxDecoration(color: _amber, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              const Text('Diesel',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _textPrimary)),
            ]),
            const SizedBox(height: 8),
            TextFormField(
              controller: _dieselCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              autofocus: true,
              style: const TextStyle(color: _textPrimary, fontSize: 22, fontWeight: FontWeight.w700),
              decoration: InputDecoration(
                hintText: 'e.g. 97.50',
                hintStyle: const TextStyle(color: _textSecondary),
                prefixText: '₹ ',
                prefixStyle: const TextStyle(
                    color: _amber, fontWeight: FontWeight.w700, fontSize: 22),
                suffixText: '/L',
                suffixStyle: const TextStyle(color: _textSecondary, fontSize: 16),
                filled: true,
                fillColor: _card,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _amber, width: 2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            // ── Petrol ──
            Row(children: [
              Container(
                width: 10, height: 10,
                decoration: const BoxDecoration(color: _petrolColor, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
              const Text('Petrol',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: _textPrimary)),
            ]),
            const SizedBox(height: 8),
            TextFormField(
              controller: _petrolCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              style: const TextStyle(color: _textPrimary, fontSize: 22, fontWeight: FontWeight.w700),
              decoration: InputDecoration(
                hintText: 'e.g. 104.00',
                hintStyle: const TextStyle(color: _textSecondary),
                prefixText: '₹ ',
                prefixStyle: const TextStyle(
                    color: _petrolColor, fontWeight: FontWeight.w700, fontSize: 22),
                suffixText: '/L',
                suffixStyle: const TextStyle(color: _textSecondary, fontSize: 16),
                filled: true,
                fillColor: _card,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: _petrolColor, width: 2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final dieselRate = double.tryParse(_dieselCtrl.text);
                  final petrolRate = double.tryParse(_petrolCtrl.text);
                  if (dieselRate == null || dieselRate <= 0 ||
                      petrolRate == null || petrolRate <= 0) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Enter valid rates for both Diesel and Petrol'), backgroundColor: Color(0xFFEF4444)),
                    );
                    return;
                  }
                  ref.read(pumpRatePerLitreProvider.notifier).state = dieselRate;
                  ref.read(pumpPetrolRatePerLitreProvider.notifier).state = petrolRate;
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                          'Diesel ₹${dieselRate.toStringAsFixed(2)}/L · Petrol ₹${petrolRate.toStringAsFixed(2)}/L'),
                      backgroundColor: const Color(0xFF10B981),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: _amber,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                child: const Text('Save Rates'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
