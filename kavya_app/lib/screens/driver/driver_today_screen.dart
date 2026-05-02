import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import '../../models/trip.dart';
import '../../models/attendance.dart';
import '../../providers/trip_provider.dart';
import '../../providers/fleet_dashboard_provider.dart'; // apiServiceProvider
import '../../providers/attendance_provider.dart';
import '../../providers/recent_activity_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/intelligence_provider.dart';
import '../../core/theme/kt_colors.dart';
import '../../services/api_service.dart';

import 'package:shimmer/shimmer.dart';
import '../../core/widgets/section_header.dart';
import '../../core/localization/locale_provider.dart';
import '../../core/localization/driver_strings.dart';
import '../../providers/checklist_provider.dart';
import 'driver_request_advance_sheet.dart';
import 'driver_salary_advance_sheet.dart';

class DriverTodayScreen extends ConsumerStatefulWidget {
  const DriverTodayScreen({super.key});

  @override
  ConsumerState<DriverTodayScreen> createState() => _DriverTodayScreenState();
}

class _DriverTodayScreenState extends ConsumerState<DriverTodayScreen> {
  final Set<int> _loadingTripIds = {};
  S get s => ref.read(sProvider);

  @override
  void initState() {
    super.initState();
    // Refresh trips every time the Today screen is shown
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(driverMyTripsProvider.notifier).refresh();
    });
  }

  Future<void> _submitLRAndEway(Trip trip) async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: KTColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _LREwaySheet(tripNumber: trip.tripNumber),
    );
    if (result == null) return;

    setState(() => _loadingTripIds.add(trip.id));
    try {
      final api = ref.read(apiServiceProvider);
      await api.submitTripLRAndEway(
        trip.id,
        lrFile: result['lr_file'] as File?,
        ewayFile: result['eway_file'] as File?,
      );
      ref.read(driverMyTripsProvider.notifier).refresh();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('LR & E-way submitted. Trip started!'), backgroundColor: KTColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: KTColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingTripIds.remove(trip.id));
    }
  }

  /// Shows a dialog for the driver to enter an odometer reading.
  /// Returns the entered value, or null if cancelled.
  /// Pass [minValue] to enforce a minimum (with an error message).
  Future<double?> _showOdometerDialog({
    required String title,
    required String hint,
    double? prefill,
    double? minValue,
    String? minValueLabel,
  }) async {
    final ctrl = TextEditingController(
      text: prefill != null ? prefill.toStringAsFixed(0) : '',
    );
    String? errorMsg;
    return showDialog<double>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Row(children: [
            const Icon(Icons.speed_rounded, color: KTColors.driverAccent, size: 20),
            const SizedBox(width: 8),
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ]),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (minValue != null && minValueLabel != null) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: KTColors.driverAccent.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(children: [
                    const Icon(Icons.info_outline_rounded, size: 14, color: KTColors.driverAccent),
                    const SizedBox(width: 6),
                    Text(minValueLabel,
                        style: const TextStyle(fontSize: 12, color: KTColors.driverAccent, fontWeight: FontWeight.w600)),
                  ]),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: ctrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: false),
                autofocus: true,
                decoration: InputDecoration(
                  labelText: hint,
                  suffixText: 'km',
                  errorText: errorMsg,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: KTColors.driverAccent, width: 2),
                  ),
                ),
                onChanged: (_) {
                  if (errorMsg != null) setDialogState(() => errorMsg = null);
                },
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel', style: TextStyle(color: KTColors.textMuted)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: KTColors.driverAccent,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () {
                final raw = double.tryParse(ctrl.text.trim());
                if (raw == null || raw <= 0) {
                  setDialogState(() => errorMsg = 'Enter a valid odometer reading');
                  return;
                }
                if (minValue != null && raw < minValue) {
                  setDialogState(() => errorMsg =
                      'Must be ≥ ${minValue.toStringAsFixed(0)} km');
                  return;
                }
                Navigator.pop(ctx, raw);
              },
              child: const Text('Confirm'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _captureAndUpdate(Trip trip, String action) async {
    // For 'loaded': ask for departure odometer before photo
    double? startOdometer;
    if (action == 'loaded') {
      final vehicleOdo = trip.vehicleOdometer;
      startOdometer = await _showOdometerDialog(
        title: 'Departure Odometer',
        hint: 'Current odometer reading',
        prefill: vehicleOdo,
        minValue: vehicleOdo,
        minValueLabel: vehicleOdo != null
            ? 'Vehicle odometer: ${vehicleOdo.toStringAsFixed(0)} km'
            : null,
      );
      if (startOdometer == null || !mounted) return;
    }

    // For 'reached': ask for arrival odometer before photo
    double? endOdometer;
    if (action == 'reached') {
      final departureOdo = trip.startOdometer;
      endOdometer = await _showOdometerDialog(
        title: 'Arrival Odometer',
        hint: 'Odometer reading at destination',
        prefill: departureOdo,
        minValue: departureOdo,
        minValueLabel: departureOdo != null
            ? 'Departure reading: ${departureOdo.toStringAsFixed(0)} km'
            : null,
      );
      if (endOdometer == null || !mounted) return;
    }

    final picker = ImagePicker();
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 70,
      maxWidth: 1200,
    );
    if (photo == null || !mounted) return;

    setState(() => _loadingTripIds.add(trip.id));
    try {
      final api = ref.read(apiServiceProvider);
      final file = File(photo.path);
      switch (action) {
        case 'loaded':
          await api.markTripLoaded(trip.id, file, startOdometer: startOdometer);
          break;
        case 'reached':
          await api.markTripReached(trip.id, file, endOdometer: endOdometer);
          break;
        case 'unloaded':
          await api.markTripUnloaded(trip.id, file);
          break;
        case 'pod':
          await api.markTripPOD(trip.id, file);
          break;
      }
      ref.read(driverMyTripsProvider.notifier).refresh();
      final msg = action == 'loaded'
          ? 'Truck marked as LOADED ✓  Finance Manager has been notified to pay your ₹1,500 advance.'
          : action == 'reached'
              ? 'Destination reached confirmed'
              : action == 'pod'
                  ? 'Proof of Delivery uploaded. Trip completed!'
                  : 'Trip completed! Truck UN-LOADED — please upload Proof of Delivery next';
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: KTColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: KTColors.danger),
        );
      }
    } finally {
      if (mounted) setState(() => _loadingTripIds.remove(trip.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final myTripsAsync = ref.watch(driverMyTripsProvider);
    final attendanceAsync = ref.watch(attendanceProvider);
    final recentExpense = ref.watch(recentExpenseProvider);
    final user = ref.watch(authProvider).user;
    final s = ref.watch(sProvider);
    final driverId = int.tryParse(user?.id ?? '') ?? 0;

    // Derive active trip from driver's own trips for SOS button
    final allMyTrips = myTripsAsync.maybeWhen(
      data: (trips) => trips,
      orElse: () => <Trip>[],
    );
    final activeTripForSos = allMyTrips.where((t) => t.isActive).firstOrNull;

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(driverMyTripsProvider.notifier).refresh();
        ref.invalidate(attendanceProvider);
      },
      child: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Attendance Status Card
          attendanceAsync.when(
            data: (attendance) => _attendanceCard(context, ref, attendance),
            loading: () => Shimmer.fromColors(
              baseColor: Colors.grey.shade800,
              highlightColor: Colors.grey.shade600,
              child: Container(
                height: 120,
                decoration: BoxDecoration(
                  color: Colors.grey.shade800,
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
            error: (e, st) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Error loading attendance: $e', style: const TextStyle(color: KTColors.danger)),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // ─── Driver Score Badge ───
          if (driverId > 0) _buildScoreBadge(ref, driverId),
          const SizedBox(height: 16),

          // Recent Expense Feedback Card
          if (recentExpense != null)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: KTColors.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: KTColors.success.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: KTColors.success,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.check, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Recent: Expense Added ✓',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: KTColors.success,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '₹${recentExpense.amount.toStringAsFixed(0)} ${recentExpense.category} — just now',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    iconSize: 20,
                    onPressed: () {
                      ref.read(recentExpenseProvider.notifier).clearRecentExpense();
                    },
                    icon: const Icon(Icons.close, color: KTColors.textMuted),
                  ),
                ],
              ),
            ),
          if (recentExpense != null) const SizedBox(height: 20),
          const SizedBox(height: 20),

          // My Trips Section
          const SectionHeader(title: 'My Trips'),
          const SizedBox(height: 12),
          myTripsAsync.when(
            data: (trips) {
              final activeTrips = trips
                  .where((t) => t.status != 'completed' && t.status != 'cancelled')
                  .toList();              if (activeTrips.isEmpty) {
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Center(
                      child: Column(
                        children: [
                          Icon(Icons.local_shipping_outlined, color: Colors.grey.shade400, size: 48),
                          const SizedBox(height: 12),
                          Text(s.noTripsAvailable, style: const TextStyle(color: KTColors.textSecondary)),
                          const SizedBox(height: 4),
                          const Text('Fleet manager will assign trips here', style: TextStyle(color: KTColors.textMuted, fontSize: 12)),
                        ],
                      ),
                    ),
                  ),
                );
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: activeTrips
                    .map((trip) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _tripWorkflowCard(context, ref, trip),
                        ))
                    .toList(),
              );
            },
            loading: () => Column(
              children: List.generate(
                2,
                (index) => Padding(
                  padding: EdgeInsets.only(bottom: index == 1 ? 0 : 8),
                  child: Shimmer.fromColors(
                    baseColor: Colors.grey.shade800,
                    highlightColor: Colors.grey.shade600,
                    child: Container(
                      height: 120,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade800,
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            error: (e, st) => Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text('Error loading trips: $e', style: const TextStyle(color: KTColors.danger)),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Quick Actions
          SectionHeader(title: s.quickActions),
          const SizedBox(height: 12),
          _SalaryAdvanceButton(s: s),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.beach_access_rounded,
                  s.applyLeave,
                  () => context.push('/driver/leave'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.account_balance_wallet_rounded,
                  s.requestAdvance,
                  () {
                    final activeTrip = ref
                        .read(driverMyTripsProvider)
                        .valueOrNull
                        ?.where((t) => t.isActive)
                        .firstOrNull;
                    showRequestAdvanceSheet(context, ref, activeTrip: activeTrip);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.receipt_long,
                  s.addExpense,
                  () => context.go('/driver/expenses'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.checklist,
                  s.checklist,
                  () => context.push('/driver/checklist'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.description,
                  s.documents,
                  () => context.push('/driver/documents'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.notifications_active,
                  s.notifications,
                  () => context.push('/driver/notifications'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.account_balance_wallet,
                  s.myEarnings,
                  () => context.push('/driver/settlement'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _quickActionButton(
                  context,
                  Icons.local_shipping,
                  s.vehicle,
                  () => context.push('/driver/vehicle'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // --- SOS Button (D-08) — Always visible, 3-sec hold ---
          _SOSButton(tripId: activeTripForSos?.id),
        ],
      ),
    ),
    );
  }

  Widget _attendanceCard(BuildContext context, WidgetRef ref, Attendance? attendance) {
    final isCheckedIn = attendance?.checkInTime != null;
    final now = DateTime.now();
    final dateLabel =
        '${now.day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.month - 1]} ${now.year}';

    // Format check-in time for display
    String checkInDisplay = '--:--';
    if (attendance?.checkInTime != null) {
      try {
        final dt = DateTime.parse(attendance!.checkInTime!).toLocal();
        final hh = dt.hour.toString().padLeft(2, '0');
        final mm = dt.minute.toString().padLeft(2, '0');
        checkInDisplay = '$hh:$mm';
      } catch (_) {
        checkInDisplay = attendance!.checkInTime!;
      }
    }

    final statusColor = isCheckedIn
        ? (attendance!.status == 'late' ? KTColors.warning : KTColors.success)
        : KTColors.textMuted;
    final s = ref.watch(sProvider);
    final statusLabel = isCheckedIn
        ? (attendance!.status == 'late' ? s.late_ : s.present)
        : s.notCheckedIn;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isCheckedIn
              ? [KTColors.successBg, KTColors.successBg]
              : [KTColors.surface, KTColors.surface],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isCheckedIn
              ? KTColors.success.withValues(alpha: 0.4)
              : KTColors.borderColor,
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
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
            // Header row
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
                      Text(
                        s.attendance,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: KTColors.driverAccent,
                        ),
                      ),
                      Text(
                        dateLabel,
                        style: const TextStyle(
                          fontSize: 12,
                          color: KTColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: statusColor.withValues(alpha: 0.5)),
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
            const Divider(color: KTColors.borderColor, height: 1),
            const SizedBox(height: 16),

            if (isCheckedIn) ...
              [
                // Check-in details row
                Row(
                  children: [
                    _attendanceInfoTile(
                      icon: Icons.login_rounded,
                      label: s.checkInTime,
                      value: checkInDisplay,
                      color: KTColors.success,
                    ),
                    const SizedBox(width: 12),
                    _attendanceInfoTile(
                      icon: Icons.verified_user_outlined,
                      label: s.status,
                      value: attendance!.status.toUpperCase(),
                      color: statusColor,
                    ),
                    if (attendance.checkInPhotoUrl != null) ...
                      [
                        const SizedBox(width: 12),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.memory(
                            base64Decode(
                              attendance.checkInPhotoUrl!.contains(',') ? attendance.checkInPhotoUrl!.split(',')[1] : attendance.checkInPhotoUrl!,
                            ),
                            width: 52,
                            height: 52,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              width: 52,
                              height: 52,
                              decoration: BoxDecoration(
                                color: KTColors.surface,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(Icons.photo, color: KTColors.textMuted, size: 20),
                            ),
                          ),
                        ),
                      ],
                  ],
                ),
              ]
            else ...
              [
                // Not checked in — show CTA
                Row(
                  children: [
                    const Icon(Icons.info_outline, color: KTColors.textMuted, size: 16),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Take a selfie to mark your attendance for today.',
                        style: TextStyle(fontSize: 12, color: KTColors.textMuted),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: () => _startCheckInFlow(context, ref),
                    icon: const Icon(Icons.camera_alt_rounded, size: 18),
                    label: Text(s.markAttendance),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KTColors.driverAccent,
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

  Widget _attendanceInfoTile({
    required IconData icon,
    required String label,
    required String value,
    required Color color,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 16),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 10, color: KTColors.textMuted)),
            const SizedBox(height: 2),
            Text(value,
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      ),
    );
  }

  Future<void> _startCheckInFlow(BuildContext context, WidgetRef ref) async {
    final picker = ImagePicker();
    // Open camera for selfie
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.front,
      imageQuality: 60,
      maxWidth: 800,
    );
    if (photo == null) return;
    if (!context.mounted) return;

    // Show confirmation bottom sheet
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: KTColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _AttendanceConfirmSheet(
        photoFile: File(photo.path),
        notifier: ref.read(attendanceProvider.notifier),
        onSuccess: () {
          ref.invalidate(attendanceProvider);
        },
      ),
    );
  }

  Widget _tripWorkflowCard(BuildContext context, WidgetRef ref, Trip trip) {
    final isLoading = _loadingTripIds.contains(trip.id);
    final progress = _getProgressPercentage(trip.status);
    final statusColor = _getStatusColor(trip.status);

    // Determine the next action
    String? actionLabel;
    IconData? actionIcon;
    Color? actionColor;
    VoidCallback? onAction;

    if (trip.isAssigned) {
      actionLabel = 'Submit LR & E-way';
      actionIcon = Icons.upload_file;
      actionColor = KTColors.info;
      onAction = () => _submitLRAndEway(trip);
    } else if (trip.awaitingLoad) {
      actionLabel = 'LOADED';
      actionIcon = Icons.local_shipping;
      actionColor = KTColors.success;
      // Check checklist completion
      final preChecklistState = ref.watch(
        checklistProvider((tripId: trip.id, type: 'checklist')),
      );
      final preTripDone = preChecklistState.valueOrNull?.completedAt != null;
      onAction = preTripDone ? () => _captureAndUpdate(trip, 'loaded') : null;
    } else if (trip.awaitingReach) {
      actionLabel = 'REACHED';
      actionIcon = Icons.location_on;
      actionColor = KTColors.warning;
      onAction = () => _captureAndUpdate(trip, 'reached');
    } else if (trip.awaitingUnload) {
      actionLabel = 'UN-LOADED';
      actionIcon = Icons.inventory_2;
      actionColor = KTColors.danger;
      onAction = () => _captureAndUpdate(trip, 'unloaded');
    } else if (trip.awaitingPOD) {
      actionLabel = 'Proof of Delivery';
      actionIcon = Icons.assignment_turned_in;
      actionColor = KTColors.success;
      onAction = () => _captureAndUpdate(trip, 'pod');
    }

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            statusColor.withValues(alpha: 0.10),
            statusColor.withValues(alpha: 0.03),
          ],
        ),
        border: Border.all(color: statusColor.withValues(alpha: 0.3), width: 1.5),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header: trip number + status badge
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: KTColors.driverAccent.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.local_shipping, color: KTColors.driverAccent, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Trip', style: TextStyle(fontSize: 11, color: KTColors.textMuted)),
                      Text(trip.tripNumber, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: statusColor.withValues(alpha: 0.4)),
                  ),
                  child: Text(
                    trip.status.replaceAll('_', ' ').toUpperCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor, letterSpacing: 0.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Route
            Row(
              children: [
                Column(
                  children: [
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: KTColors.success, shape: BoxShape.circle)),
                    Container(width: 2, height: 22, color: KTColors.textMuted.withValues(alpha: 0.3)),
                    Container(width: 8, height: 8, decoration: BoxDecoration(color: KTColors.danger, shape: BoxShape.circle)),
                  ],
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(trip.origin ?? 'Origin', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),
                      Text(trip.destination ?? 'Destination', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
                if (trip.startDate != null)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Icon(Icons.calendar_today, size: 12, color: KTColors.textMuted),
                      const SizedBox(height: 4),
                      Text(_formatTripDate(trip.startDate!), style: const TextStyle(fontSize: 11, color: KTColors.textMuted)),
                    ],
                  ),
              ],
            ),
            const SizedBox(height: 12),

            // Progress bar
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(value: progress, minHeight: 5, color: statusColor),
            ),
            const SizedBox(height: 14),

            if (trip.awaitingLoad) ...[
              Builder(builder: (_) {                final checklistState = ref.watch(
                  checklistProvider((tripId: trip.id, type: 'checklist')),
                );
                final preTripDone = checklistState.valueOrNull?.completedAt != null;
                return GestureDetector(
                  onTap: preTripDone
                      ? null
                      : () => context.push('/driver/checklist?tripId=${trip.id}&type=checklist'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: preTripDone
                          ? KTColors.success.withValues(alpha: 0.10)
                          : KTColors.warning.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: preTripDone
                            ? KTColors.success.withValues(alpha: 0.4)
                            : KTColors.warning.withValues(alpha: 0.5),
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          preTripDone ? Icons.check_circle_rounded : Icons.checklist_rounded,
                          size: 18,
                          color: preTripDone ? KTColors.success : KTColors.warning,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            preTripDone
                                ? 'Checklist completed'
                                : 'Complete checklist to unlock LOADED',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: preTripDone ? KTColors.success : KTColors.warning,
                            ),
                          ),
                        ),
                        if (!preTripDone)
                          const Icon(Icons.arrow_forward_ios_rounded,
                              size: 13, color: KTColors.warning),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 12),
            ],

            if (trip.awaitingPOD) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: KTColors.success.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: KTColors.success.withValues(alpha: 0.4)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.assignment_turned_in_rounded, size: 18, color: KTColors.success),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Truck unloaded \u2714  Take a Proof of Delivery photo to complete the trip.',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: KTColors.success),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],

            // Advance payment status banner (shown whenever loading photo is uploaded)
            if (trip.loadedImageUrl != null) ...[
              trip.advancePaid
                  ? Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF22C55E).withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF22C55E).withValues(alpha: 0.4)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.currency_rupee_rounded, size: 18, color: Color(0xFF16A34A)),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Advance of ₹1,500 Received',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF16A34A)),
                                ),
                                if (trip.advancePaidByName != null)
                                  Text(
                                    'Paid by ${trip.advancePaidByName}',
                                    style: const TextStyle(fontSize: 11, color: Color(0xFF166534)),
                                  ),
                              ],
                            ),
                          ),
                          const Icon(Icons.check_circle_rounded, size: 18, color: Color(0xFF16A34A)),
                        ],
                      ),
                    )
                  : Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF59E0B).withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFF59E0B).withValues(alpha: 0.4)),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.currency_rupee_rounded, size: 18, color: Color(0xFFD97706)),
                          SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              'Advance of ₹1,500 pending — Finance Manager will process it shortly.',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF92400E)),
                            ),
                          ),
                          Icon(Icons.hourglass_bottom_rounded, size: 16, color: Color(0xFFD97706)),
                        ],
                      ),
                    ),
              const SizedBox(height: 12),
            ],

            // Action buttons row
            Row(
              children: [
                // View Details (always shown)
                Expanded(
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: KTColors.driverAccent,
                      side: const BorderSide(color: KTColors.driverAccent, width: 1.5),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.info_outline, size: 16),
                    label: const Text('Details', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                    onPressed: () => context.push('/driver/trip/${trip.id}'),
                  ),
                ),

                // Context-specific action button
                if (actionLabel != null) ...[
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: isLoading
                        ? const Center(child: Padding(padding: EdgeInsets.all(10), child: CircularProgressIndicator(strokeWidth: 2)))
                        : Opacity(
                            opacity: onAction != null ? 1.0 : 0.4,
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: actionColor,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                elevation: 0,
                              ),
                              icon: Icon(actionIcon, size: 17),
                              label: Text(actionLabel, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                              onPressed: onAction,
                            ),
                          ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _quickActionButton(BuildContext context, IconData icon, String label, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: KTColors.driverAccent, size: 28),
              const SizedBox(height: 8),
              Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
            ],
          ),
        ),
      ),
    );
  }

  String _formatTripDate(String raw) {
    try {
      final dt = DateTime.parse(raw);
      final months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day.toString().padLeft(2, '0')} ${months[dt.month - 1]} ${dt.year}';
    } catch (_) {
      return raw.split('T').first;
    }
  }

  double _getProgressPercentage(String status) {
    switch (status) {
      case 'planned': return 0.1;
      case 'vehicle_assigned': return 0.15;
      case 'driver_assigned': return 0.2;
      case 'ready': return 0.25;
      case 'started': return 0.35;
      case 'loading': return 0.55;
      case 'in_transit': return 0.7;
      case 'unloading': return 0.85;
      case 'pod_pending': return 0.92; // awaitingPOD sub-state
      case 'completed': return 1.0;
      default: return 0.0;
    }
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'planned': return KTColors.textMuted;
      case 'vehicle_assigned': return KTColors.warning;
      case 'driver_assigned': return KTColors.warning;
      case 'ready': return KTColors.info;
      case 'started': return KTColors.info;
      case 'loading': return KTColors.driverAccent;
      case 'in_transit': return KTColors.driverAccent;
      case 'unloading': return KTColors.warning;
      case 'completed': return KTColors.success;
      default: return KTColors.textMuted;
    }
  }

  Widget _buildScoreBadge(WidgetRef ref, int driverId) {
    final scoreAsync = ref.watch(driverScoreProvider(driverId));
    return scoreAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (data) {
        final score = (data['current_score'] as num?)?.toDouble() ?? 0;
        final tier = (data['tier'] ?? 'unknown').toString();
        final Color tierColor;
        final IconData tierIcon;
        switch (tier) {
          case 'elite':
            tierColor = KTColors.success;
            tierIcon = Icons.star;
          case 'good':
            tierColor = KTColors.driverAccent;
            tierIcon = Icons.thumb_up;
          case 'needs_attention':
            tierColor = KTColors.warning;
            tierIcon = Icons.info_outline;
          case 'high_risk':
            tierColor = KTColors.danger;
            tierIcon = Icons.warning;
          default:
            tierColor = KTColors.textMuted;
            tierIcon = Icons.help_outline;
        }

        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [tierColor.withAlpha(30), tierColor.withAlpha(10)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: tierColor.withAlpha(80)),
          ),
          child: Row(
            children: [
              Container(
                width: 48, height: 48,
                decoration: BoxDecoration(
                  color: tierColor.withAlpha(40),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    score.toStringAsFixed(0),
                    style: TextStyle(color: tierColor, fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(tierIcon, color: tierColor, size: 16),
                        const SizedBox(width: 6),
                        Text(
                          tier.replaceAll('_', ' ').toUpperCase(),
                          style: TextStyle(color: tierColor, fontSize: 12, fontWeight: FontWeight.w600, letterSpacing: 0.5),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text('Driver Score', style: TextStyle(color: KTColors.textMuted, fontSize: 11)),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Salary Advance Button (only active on days 23–31) ──────────────────────

class _SalaryAdvanceButton extends ConsumerWidget {
  final dynamic s; // DriverStrings
  const _SalaryAdvanceButton({required this.s});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = DateTime.now().day;
    final isActive = day >= 23;
    final lockMsg = 'Available from the 23rd of each month';

    return InkWell(
      onTap: isActive
          ? () => showSalaryAdvanceSheet(context, ref)
          : () {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(lockMsg),
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                backgroundColor: KTColors.textMuted,
              ));
            },
      borderRadius: BorderRadius.circular(12),
      child: Opacity(
        opacity: isActive ? 1.0 : 0.45,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.payments_rounded,
                    color: isActive ? KTColors.driverAccent : KTColors.textMuted,
                    size: 24),
                const SizedBox(width: 10),
                Text(s.salaryAdvance,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: isActive
                            ? KTColors.textHeading
                            : KTColors.textMuted)),
                if (!isActive) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: KTColors.warningBg,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text('From 23rd',
                        style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: KTColors.warning)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// SOS panic button — hold for 3 seconds to trigger emergency alert.
class _SOSButton extends StatefulWidget {
  final int? tripId;
  const _SOSButton({this.tripId});
  @override
  State<_SOSButton> createState() => _SOSButtonState();
}

class _SOSButtonState extends State<_SOSButton> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  bool _triggered = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    );
    _controller.addStatusListener((status) {
      if (status == AnimationStatus.completed && !_triggered) {
        _triggered = true;
        _triggerSOS();
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _triggerSOS() async {
    if (widget.tripId == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No active trip. SOS requires an active trip.'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
        setState(() => _triggered = false);
      }
      return;
    }

    try {
      final apiService = ApiService();
      // Attempt to get current location
      double? lat;
      double? lng;
      try {
        final position = await _getCurrentPosition();
        lat = position?.$1;
        lng = position?.$2;
      } catch (_) {
        // Location unavailable — send SOS anyway
      }

      // Reverse-geocode the coordinates into a human-readable address
      String? locationName;
      if (lat != null && lng != null) {
        locationName = await _reverseGeocode(lat, lng);
      }

      final response = await apiService.triggerSOS(
        widget.tripId!,
        latitude: lat,
        longitude: lng,
        locationName: locationName,
      );

      if (mounted) {
        // Extract details from response
        final data = (response['data'] is Map)
            ? response['data'] as Map
            : <String, dynamic>{};
        final tripNumber = data['trip_number'] ?? '';
        final driverName = data['driver_name'] ?? '';
        final vehicleReg = data['vehicle_registration'] ?? '';
        final origin = data['origin'] ?? '';
        final destination = data['destination'] ?? '';
        final ecName = data['emergency_contact_name'];
        final ecPhone = data['emergency_contact_phone'];

        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (dialogCtx) => AlertDialog(
            backgroundColor: const Color(0xFF1E1B2E),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: Row(
              children: const [
                Icon(Icons.emergency, color: Color(0xFFEF4444), size: 28),
                SizedBox(width: 10),
                Text('🆘 SOS Alert Sent!',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Admin & Fleet Managers have been notified immediately.',
                    style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 13)),
                const SizedBox(height: 16),
                _sosInfoRow(Icons.local_shipping, 'Trip', tripNumber),
                _sosInfoRow(Icons.person, 'Driver', driverName),
                _sosInfoRow(Icons.directions_car, 'Vehicle', vehicleReg),
                _sosInfoRow(Icons.route, 'Route', '$origin → $destination'),
                if (ecName != null && ecName.toString().isNotEmpty)
                  _sosInfoRow(Icons.phone_in_talk, 'Emergency Contact', '$ecName: $ecPhone'),
                if (locationName != null)
                  _sosInfoRow(Icons.location_on, 'Location', locationName)
                else if (lat != null)
                  _sosInfoRow(Icons.location_on, 'Location', '${lat.toStringAsFixed(5)}, ${lng!.toStringAsFixed(5)}'),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFEF4444).withValues(alpha: 0.3)),
                  ),
                  child: const Text(
                    'Stay calm. Help is on the way. Use your emergency contacts if needed.',
                    style: TextStyle(color: Color(0xFFEF4444), fontSize: 12),
                  ),
                ),
              ],
            ),
            actions: [
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEF4444),
                  foregroundColor: Colors.white,
                ),
                onPressed: () => Navigator.pop(dialogCtx),
                child: const Text('OK, I understand'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        showDialog(
          context: context,
          builder: (dialogCtx) => AlertDialog(
            backgroundColor: const Color(0xFF1E1B2E),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Text('SOS Failed', style: TextStyle(color: Colors.white)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.warning_amber_rounded, color: Color(0xFFEF4444), size: 48),
                const SizedBox(height: 12),
                const Text(
                  'Could not send SOS alert automatically.\nPlease call emergency contacts directly.',
                  style: TextStyle(color: Color(0xFF9CA3AF)),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(dialogCtx),
                child: const Text('OK', style: TextStyle(color: Color(0xFFEF4444))),
              ),
            ],
          ),
        );
      }
    } finally {
      Future.delayed(const Duration(seconds: 3), () {
        if (mounted) setState(() => _triggered = false);
      });
    }
  }

  Widget _sosInfoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: const Color(0xFF6B7280)),
          const SizedBox(width: 8),
          Expanded(
            child: RichText(
              text: TextSpan(
                children: [
                  TextSpan(text: '$label: ', style: const TextStyle(color: Color(0xFF6B7280), fontSize: 12)),
                  TextSpan(text: value, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Calls OpenStreetMap Nominatim to convert GPS coordinates into a
  /// human-readable address string sent to Admin/Fleet Manager with the SOS.
  Future<String?> _reverseGeocode(double lat, double lng) async {
    try {
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 6),
        headers: {'User-Agent': 'KavyaTransportERP/1.0 (emergency_sos)'},
      ));
      final response = await dio.get<Map<String, dynamic>>(
        'https://nominatim.openstreetmap.org/reverse',
        queryParameters: {'lat': lat, 'lon': lng, 'format': 'json'},
      );
      final data = response.data;
      if (data != null) {
        final addr = data['address'] as Map?;
        if (addr != null) {
          final parts = <String>[];
          final road = addr['road'] ?? addr['suburb'] ?? addr['neighbourhood'];
          if (road != null) parts.add(road.toString());
          final city = addr['city'] ?? addr['town'] ?? addr['village'] ?? addr['county'];
          if (city != null) parts.add(city.toString());
          final state = addr['state'];
          if (state != null) parts.add(state.toString());
          if (parts.isNotEmpty) return parts.join(', ');
        }
        return data['display_name']?.toString();
      }
    } catch (e) {
      debugPrint('[SOS] Reverse geocode failed: $e');
    }
    return null;
  }

  Future<(double, double)?> _getCurrentPosition() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 5),
        ),
      );
      return (pos.latitude, pos.longitude);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return GestureDetector(
          onLongPressStart: (_) => _controller.forward(from: 0),
          onLongPressEnd: (_) {
            if (!_triggered) _controller.reset();
          },
          child: Container(
            width: double.infinity,
            height: 64,
            decoration: BoxDecoration(
              color: _triggered
                  ? const Color(0xFFEF4444)
                  : Color.lerp(const Color(0xFF7F1D1D), const Color(0xFFEF4444), _controller.value),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFEF4444).withValues(alpha: 0.3 + _controller.value * 0.4),
                  blurRadius: 12 + _controller.value * 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Stack(
              children: [
                // Progress overlay
                if (_controller.value > 0 && !_triggered)
                  Positioned.fill(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: FractionallySizedBox(
                          widthFactor: _controller.value,
                          child: Container(color: const Color(0xFFEF4444).withValues(alpha: 0.5)),
                        ),
                      ),
                    ),
                  ),
                Center(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.sos, color: Colors.white, size: 28),
                      const SizedBox(width: 8),
                      Text(
                        _triggered ? 'SOS SENT!' : 'HOLD FOR SOS',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.5,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Bottom sheet for submitting LR and E-way bill files.
class _LREwaySheet extends StatefulWidget {
  final String tripNumber;
  const _LREwaySheet({required this.tripNumber});

  @override
  State<_LREwaySheet> createState() => _LREwaySheetState();
}

class _LREwaySheetState extends State<_LREwaySheet> {
  File? _lrFile;
  String? _lrFileName;
  File? _ewayFile;
  String? _ewayFileName;

  Future<void> _captureImage(bool isLR) async {
    final picker = ImagePicker();
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 1600,
    );
    if (photo == null) return;
    setState(() {
      if (isLR) {
        _lrFile = File(photo.path);
        _lrFileName = photo.name;
      } else {
        _ewayFile = File(photo.path);
        _ewayFileName = photo.name;
      }
    });
  }

  Future<void> _pickFile(bool isLR) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (result == null || result.files.single.path == null) return;
    final file = File(result.files.single.path!);
    final name = result.files.single.name;
    setState(() {
      if (isLR) {
        _lrFile = file;
        _lrFileName = name;
      } else {
        _ewayFile = file;
        _ewayFileName = name;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: KTColors.driverAccent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.upload_file, color: KTColors.driverAccent, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Submit LR & E-way Bill', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    Text(widget.tripNumber, style: const TextStyle(fontSize: 12, color: KTColors.textMuted)),
                  ],
                ),
              ),
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
            ],
          ),
          const SizedBox(height: 20),
          const Divider(height: 1, color: KTColors.borderColor),
          const SizedBox(height: 16),

          // LR Document
          const Text('LR Document *', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          _captureAndUploadRow(isLR: true),

          const SizedBox(height: 16),

          // E-way Bill
          const Text('E-way Bill (optional)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          _captureAndUploadRow(isLR: false),

          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: KTColors.driverAccent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              icon: const Icon(Icons.check_circle_outline, size: 20),
              label: const Text('Submit & Start Trip', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              onPressed: () {
                Navigator.pop(context, {
                  'lr_file': _lrFile,
                  'eway_file': _ewayFile,
                });
              },
            ),
          ),
        ],
      ),
    );
  }

  /// Renders the "Capture Image" + "Upload File" pair for LR or E-way.
  Widget _captureAndUploadRow({required bool isLR}) {
    final picked = isLR ? _lrFile != null : _ewayFile != null;
    final fileName = isLR ? _lrFileName : _ewayFileName;
    final uploadLabel = isLR ? 'Upload LR (PDF / JPG / PNG)' : 'Upload E-way Bill (PDF / JPG / PNG)';
    final uploadIcon = isLR ? Icons.picture_as_pdf : Icons.receipt_long;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Capture Image button
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: KTColors.driverAccent,
              side: BorderSide(
                color: picked ? KTColors.success.withValues(alpha: 0.5) : KTColors.driverAccent.withValues(alpha: 0.5),
              ),
              padding: const EdgeInsets.symmetric(vertical: 11),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            icon: const Icon(Icons.camera_alt_outlined, size: 18),
            label: Text(
              picked ? 'Retake Photo' : 'Capture Image',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
            onPressed: () => _captureImage(isLR),
          ),
        ),
        const SizedBox(height: 6),
        // Upload from files tile
        _fileTile(
          label: fileName ?? uploadLabel,
          icon: uploadIcon,
          picked: picked,
          onTap: () => _pickFile(isLR),
        ),
      ],
    );
  }

  Widget _fileTile({required String label, required IconData icon, required bool picked, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: picked ? KTColors.success.withValues(alpha: 0.08) : KTColors.cardSurface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: picked ? KTColors.success.withValues(alpha: 0.4) : KTColors.borderColor,
            width: picked ? 1.5 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(picked ? Icons.check_circle : icon, color: picked ? KTColors.success : KTColors.textMuted, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 13,
                  color: picked ? KTColors.success : KTColors.textSecondary,
                  fontWeight: picked ? FontWeight.w600 : FontWeight.normal,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(picked ? Icons.edit_outlined : Icons.upload_outlined, size: 16, color: KTColors.textMuted),
          ],
        ),
      ),
    );
  }
}

/// Bottom sheet shown after the driver takes a selfie.
/// Captures location, shows preview, and submits attendance.
class _AttendanceConfirmSheet extends StatefulWidget {
  final File photoFile;
  final AttendanceNotifier notifier;
  final VoidCallback onSuccess;

  const _AttendanceConfirmSheet({
    required this.photoFile,
    required this.notifier,
    required this.onSuccess,
  });

  @override
  State<_AttendanceConfirmSheet> createState() => _AttendanceConfirmSheetState();
}

class _AttendanceConfirmSheetState extends State<_AttendanceConfirmSheet> {
  bool _loading = false;
  Position? _position;
  String? _errorMsg;

  @override
  void initState() {
    super.initState();
    _fetchLocation();
  }

  Future<void> _fetchLocation() async {
    final pos = await widget.notifier.getLocation();
    if (mounted) setState(() => _position = pos);
  }

  Future<void> _submit() async {
    setState(() { _loading = true; _errorMsg = null; });

    // Convert photo to base64 data URL
    final bytes = await widget.photoFile.readAsBytes();
    final b64 = base64Encode(bytes);
    final photoDataUrl = 'data:image/jpeg;base64,$b64';

    final message = await widget.notifier.checkIn(
      photoDataUrl: photoDataUrl,
      lat: _position?.latitude,
      lng: _position?.longitude,
    );

    if (!mounted) return;
    if (message != null) {
      widget.onSuccess();
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(message)),
            ],
          ),
          backgroundColor: KTColors.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
    } else {
      setState(() {
        _loading = false;
        _errorMsg = 'Failed to mark attendance. Please try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final locationText = _position != null
        ? '${_position!.latitude.toStringAsFixed(5)}, ${_position!.longitude.toStringAsFixed(5)}'
        : 'Fetching location...';

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: KTColors.borderColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Confirm Attendance',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Review your selfie and location before submitting.',
                  style: TextStyle(fontSize: 12, color: KTColors.textMuted),
                ),
                const SizedBox(height: 16),

                // Photo preview
                ClipRRect(
                  borderRadius: BorderRadius.circular(14),
                  child: Image.file(
                    widget.photoFile,
                    height: 200,
                    width: double.infinity,
                    fit: BoxFit.cover,
                  ),
                ),
                const SizedBox(height: 16),

                // Location info
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: KTColors.surface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: KTColors.borderColor),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _position != null ? Icons.location_on : Icons.location_searching,
                        color: _position != null ? KTColors.driverAccent : KTColors.textMuted,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Location',
                              style: TextStyle(fontSize: 11, color: KTColors.textMuted),
                            ),
                            Text(
                              locationText,
                              style: const TextStyle(fontSize: 13, color: Colors.white, fontWeight: FontWeight.w500),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

                if (_errorMsg != null) ...[
                  const SizedBox(height: 10),
                  Text(_errorMsg!, style: const TextStyle(color: KTColors.danger, fontSize: 13)),
                ],

                const SizedBox(height: 16),

                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _loading ? null : () => Navigator.of(context).pop(),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Color(0xFF475569)),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                        child: const Text('Retake'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton.icon(
                        onPressed: _loading ? null : _submit,
                        icon: _loading
                            ? const SizedBox(
                                width: 16, height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                              )
                            : const Icon(Icons.check_rounded, size: 18),
                        label: Text(_loading ? 'Submitting...' : 'Submit Attendance'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: KTColors.driverAccent,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
