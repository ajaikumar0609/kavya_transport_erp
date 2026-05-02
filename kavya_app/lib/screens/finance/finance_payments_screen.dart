import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:io';
import '../../core/theme/kt_colors.dart';
import '../../providers/fleet_dashboard_provider.dart';
import '../../providers/pump_dashboard_provider.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final _upcomingSchedulesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res =
      await api.get('/finance-manager/payment-schedules?due_within_days=30');
  if (res['success'] == true) {
    return List<Map<String, dynamic>>.from(res['data'] ?? []);
  }
  throw Exception(res['message'] ?? 'Failed to load payment schedules');
});

final _pendingAdvancesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res =
      await api.get('/finance-manager/pending-advance-trips?limit=50');
  final data = (res is Map) ? res['data'] : res;
  if (data is List) return data.cast<Map<String, dynamic>>();
  return [];
});

final _pendingTripExpensesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get(
      '/finance-manager/trip-expense-queue?status=PENDING&limit=200');
  if (res['success'] == true) {
    return List<Map<String, dynamic>>.from(res['data'] ?? []);
  }
  return [];
});

final _pendingFuelEntriesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/finance-manager/fuel-entries?is_verified=false');
  if (res['success'] == true) {
    return List<Map<String, dynamic>>.from(res['data'] ?? []);
  }
  return [];
});

class FinancePaymentsScreen extends ConsumerWidget {
  const FinancePaymentsScreen({super.key});

  static String _rupees(dynamic paise) {
    if (paise == null) return '₹0';
    final d = (paise is int ? paise : int.tryParse(paise.toString()) ?? 0);
    final r = d / 100;
    if (r >= 100000) return '₹${(r / 100000).toStringAsFixed(2)}L';
    if (r >= 1000) return '₹${(r / 1000).toStringAsFixed(1)}K';
    return '₹${r.toStringAsFixed(0)}';
  }

  static Map<int, Map<String, dynamic>> _groupByTrip(
      List<Map<String, dynamic>> items) {
    final Map<int, Map<String, dynamic>> grouped = {};
    for (final item in items) {
      final tid = item['trip_id'] as int? ?? 0;
      if (!grouped.containsKey(tid)) {
        grouped[tid] = {
          'trip_id': tid,
          'trip_number': item['trip_number'] ?? '',
          'driver_name': item['driver_name'] ?? '',
          'origin': item['origin'] ?? '',
          'destination': item['destination'] ?? '',
          'vehicle_registration': item['vehicle_registration'] ?? '',
          'expenses': <Map<String, dynamic>>[],
        };
      }
      (grouped[tid]!['expenses'] as List<Map<String, dynamic>>).add(item);
    }
    return grouped;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final schedulesAsync = ref.watch(_upcomingSchedulesProvider);
    final advancesAsync = ref.watch(_pendingAdvancesProvider);
    final tripExpensesAsync = ref.watch(_pendingTripExpensesProvider);
    final fuelEntriesAsync = ref.watch(_pendingFuelEntriesProvider);
    final topUpsAsync = ref.watch(pendingTopUpRequestsProvider);
    final paidTopUpsAsync = ref.watch(paidTopUpRequestsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_upcomingSchedulesProvider);
        ref.invalidate(_pendingAdvancesProvider);
        ref.invalidate(_pendingTripExpensesProvider);
        ref.invalidate(_pendingFuelEntriesProvider);
        ref.invalidate(pendingTopUpRequestsProvider);
        ref.invalidate(paidTopUpRequestsProvider);
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          // ── Driver Advance Requests ──────────────────────────────────
          _SectionHeader(
            icon: Icons.currency_rupee_rounded,
            label: 'Driver Advance Requests',
            color: const Color(0xFFD97706),
            count: advancesAsync.valueOrNull?.length ?? 0,
          ),
          const SizedBox(height: 10),
          advancesAsync.when(
            loading: () => const _Shimmer(count: 2),
            error: (e, _) => _ErrorTile(msg: e.toString()),
            data: (trips) {
              if (trips.isEmpty) {
                return const _EmptyTile(
                  icon: Icons.check_circle_outline_rounded,
                  color: KTColors.success,
                  message: 'No pending driver advances.',
                );
              }
              return Column(
                children: trips.map((t) => _AdvanceCard(trip: t)).toList(),
              );
            },
          ),

          const SizedBox(height: 28),

          // ── Trip Expense Payments ────────────────────────────────────
          _SectionHeader(
            icon: Icons.receipt_long_rounded,
            label: 'Trip Expense Payments',
            color: const Color(0xFF7C3AED),
            count: _groupByTrip(
                    tripExpensesAsync.valueOrNull ?? [])
                .length,
          ),
          const SizedBox(height: 10),
          tripExpensesAsync.when(
            loading: () => const _Shimmer(count: 2),
            error: (e, _) => _ErrorTile(msg: e.toString()),
            data: (expenses) {
              if (expenses.isEmpty) {
                return const _EmptyTile(
                  icon: Icons.check_circle_outline_rounded,
                  color: KTColors.success,
                  message: 'No pending trip expense payments.',
                );
              }
              final grouped = _groupByTrip(expenses);
              return Column(
                children: grouped.values
                    .map((g) => _TripExpenseGroup(group: g))
                    .toList(),
              );
            },
          ),

          const SizedBox(height: 28),

          // ── Trip Fuel Entry Payments ─────────────────────────────────
          _SectionHeader(
            icon: Icons.local_gas_station_rounded,
            label: 'Trip Fuel Entry Payments',
            color: const Color(0xFFE65100),
            count: fuelEntriesAsync.valueOrNull?.length ?? 0,
          ),
          const SizedBox(height: 10),
          fuelEntriesAsync.when(
            loading: () => const _Shimmer(count: 2),
            error: (e, _) => _ErrorTile(msg: e.toString()),
            data: (entries) {
              if (entries.isEmpty) {
                return const _EmptyTile(
                  icon: Icons.check_circle_outline_rounded,
                  color: KTColors.success,
                  message: 'No pending fuel entry payments.',
                );
              }
              return Column(
                children: entries
                    .map((e) => _FuelEntryPaymentCard(entry: e))
                    .toList(),
              );
            },
          ),

          const SizedBox(height: 28),

          // ── Fuel Top-Up Payments ─────────────────────────────────────
          _SectionHeader(
            icon: Icons.local_gas_station_rounded,
            label: 'Fuel Tank Refill Payments',
            color: const Color(0xFF00897B),
            count: topUpsAsync.valueOrNull?.length ?? 0,
          ),
          const SizedBox(height: 10),
          topUpsAsync.when(
            loading: () => const _Shimmer(count: 2),
            error: (e, _) => _ErrorTile(msg: e.toString()),
            data: (topUps) {
              if (topUps.isEmpty) {
                return const _EmptyTile(
                  icon: Icons.check_circle_outline_rounded,
                  color: KTColors.success,
                  message: 'No pending fuel refill payments.',
                );
              }
              return Column(
                children: topUps.map((r) => _FuelTopUpPaymentCard(request: r)).toList(),
              );
            },
          ),

          const SizedBox(height: 28),

          // ── Fuel Refill Payment History ──────────────────────────────
          _SectionHeader(
            icon: Icons.history_rounded,
            label: 'Fuel Refill Payment History',
            color: const Color(0xFF00897B),
            count: paidTopUpsAsync.valueOrNull?.length ?? 0,
          ),
          const SizedBox(height: 10),
          paidTopUpsAsync.when(
            loading: () => const _Shimmer(count: 2),
            error: (e, _) => _ErrorTile(msg: e.toString()),
            data: (paidTopUps) {
              if (paidTopUps.isEmpty) {
                return const _EmptyTile(
                  icon: Icons.check_circle_outline_rounded,
                  color: KTColors.success,
                  message: 'No fuel refill payments recorded yet.',
                );
              }
              return Column(
                children: paidTopUps.map((r) => _PaidFuelRefillCard(request: r)).toList(),
              );
            },
          ),

          const SizedBox(height: 28),

          // ── Upcoming Payments ────────────────────────────────────────
          schedulesAsync.when(
            loading: () => const Column(
              children: [
                _SectionHeader(
                  icon: Icons.calendar_today_rounded,
                  label: 'Upcoming Payments',
                  color: Color(0xFF7C3AED),
                  count: 0,
                ),
                SizedBox(height: 10),
                _Shimmer(count: 3),
              ],
            ),
            error: (e, _) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionHeader(
                  icon: Icons.calendar_today_rounded,
                  label: 'Upcoming Payments',
                  color: Color(0xFF7C3AED),
                  count: 0,
                ),
                const SizedBox(height: 10),
                _ErrorTile(msg: e.toString()),
              ],
            ),
            data: (items) {
              final overdue =
                  items.where((s) => s['urgency'] == 'overdue').toList();
              final urgent =
                  items.where((s) => s['urgency'] == 'urgent').toList();
              final normal =
                  items.where((s) => s['urgency'] == 'normal').toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionHeader(
                    icon: Icons.calendar_today_rounded,
                    label: 'Upcoming Payments',
                    color: const Color(0xFF7C3AED),
                    count: items.length,
                  ),
                  const SizedBox(height: 10),
                  if (items.isEmpty)
                    const _EmptyTile(
                      icon: Icons.event_available_rounded,
                      color: KTColors.success,
                      message: 'No payments due in the next 30 days.',
                    )
                  else ...[
                    ...overdue
                        .map((s) => _ScheduleCard(item: s, fmt: _rupees)),
                    ...urgent
                        .map((s) => _ScheduleCard(item: s, fmt: _rupees)),
                    ...normal
                        .map((s) => _ScheduleCard(item: s, fmt: _rupees)),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─── Section Header ────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final int count;

  const _SectionHeader({
    required this.icon,
    required this.label,
    required this.color,
    required this.count,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: KTColors.textHeading,
            ),
          ),
        ),
        if (count > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }
}

// ─── Driver Advance Card ───────────────────────────────────────────────────────

class _AdvanceCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> trip;
  const _AdvanceCard({required this.trip});

  @override
  ConsumerState<_AdvanceCard> createState() => _AdvanceCardState();
}

class _AdvanceCardState extends ConsumerState<_AdvanceCard> {
  bool _paying = false;

  Future<void> _payAdvance() async {
    final tripId = widget.trip['id'];
    final driverName = widget.trip['driver_name'] ?? 'Driver';

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Pay Driver Advance'),
        content: Text(
          'Pay \u20b91,500 advance to $driverName for trip ${widget.trip['trip_number']}?\n\n'
          'This will be sent directly to the driver\'s registered bank account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFD97706),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Pay \u20b91,500'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;
    setState(() => _paying = true);

    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.post(
          '/finance-manager/trips/$tripId/pay-advance',
          data: {});
      if (!mounted) return;
      final success = (res is Map) && res['success'] == true;
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('\u20b91,500 advance paid to $driverName'),
            backgroundColor: KTColors.success,
          ),
        );
        ref.invalidate(_pendingAdvancesProvider);
      } else {
        final msg = (res is Map)
            ? (res['message'] ?? 'Payment failed')
            : 'Payment failed';
        _showError(msg.toString());
      }
    } catch (e) {
      if (mounted) _showError(e.toString());
    }
    if (mounted) setState(() => _paying = false);
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: KTColors.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.trip;
    final driverName = t['driver_name'] ?? 'Driver';
    final tripNum = t['trip_number'] ?? '--';
    final origin = t['origin'] ?? '';
    final dest = t['destination'] ?? '';
    final vehicle = t['vehicle_registration'] ?? '';
    final tripDate = t['trip_date'] ?? '';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: const Color(0xFFD97706).withValues(alpha: 0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor:
                      const Color(0xFFD97706).withValues(alpha: 0.15),
                  child: Text(
                    driverName.isNotEmpty ? driverName[0].toUpperCase() : 'D',
                    style: const TextStyle(
                      color: Color(0xFFD97706),
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        driverName,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: KTColors.textHeading,
                        ),
                      ),
                      Text(
                        '$tripNum  \u2022  $origin \u2192 $dest',
                        style: const TextStyle(
                            fontSize: 12, color: KTColors.textSecondary),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFFD97706).withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text(
                    '\u20b91,500',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFFD97706),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.directions_car_outlined,
                    size: 13, color: KTColors.textMuted),
                const SizedBox(width: 4),
                Text(vehicle,
                    style: const TextStyle(
                        fontSize: 11, color: KTColors.textMuted)),
                const SizedBox(width: 10),
                const Icon(Icons.calendar_today_outlined,
                    size: 13, color: KTColors.textMuted),
                const SizedBox(width: 4),
                Text(tripDate,
                    style: const TextStyle(
                        fontSize: 11, color: KTColors.textMuted)),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'Loading photo uploaded \u2014 advance payment required',
              style: TextStyle(
                fontSize: 11,
                color: const Color(0xFFD97706).withValues(alpha: 0.85),
                fontStyle: FontStyle.italic,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 38,
              child: ElevatedButton.icon(
                onPressed: _paying ? null : _payAdvance,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFD97706),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                icon: _paying
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded, size: 16),
                label: Text(
                  _paying ? 'Processing...' : 'Pay \u20b91,500 to Driver',
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Upcoming Schedule Card ────────────────────────────────────────────────────

class _ScheduleCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> item;
  final String Function(dynamic) fmt;
  const _ScheduleCard({required this.item, required this.fmt});

  @override
  ConsumerState<_ScheduleCard> createState() => _ScheduleCardState();
}

class _ScheduleCardState extends ConsumerState<_ScheduleCard> {
  bool _paying = false;

  Future<void> _payVendor() async {
    final s = widget.item;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirm Payment'),
        content: Text(
            'Pay ${widget.fmt(s['amount_paise'])} to ${s['payee_name'] ?? 'Vendor'}?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Mark as Paid'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _paying = true);
    try {
      final api = ref.read(apiServiceProvider);
      final res =
          await api.post('/finance-manager/payments/vendor', data: {
        'vendor_name': s['payee_name'] ?? 'Vendor',
        'amount_paise': s['amount_paise'],
        'payment_type': s['schedule_type'] ?? 'vendor',
        'description': s['description'] ?? '',
        'vehicle_id': s['vehicle_id'],
      });
      if (!mounted) return;
      if (res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Payment initiated'),
            backgroundColor: KTColors.success));
        ref.invalidate(_upcomingSchedulesProvider);
      } else {
        _showError(res['message'] ?? 'Payment failed');
      }
    } catch (e) {
      if (mounted) _showError(e.toString());
    }
    if (mounted) setState(() => _paying = false);
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: KTColors.danger));
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.item;
    final urgency = s['urgency'] as String? ?? 'normal';
    final daysUntil = s['days_until_due'] as int?;

    Color urgencyColor;
    switch (urgency) {
      case 'overdue':
        urgencyColor = KTColors.danger;
        break;
      case 'urgent':
        urgencyColor = KTColors.warning;
        break;
      default:
        urgencyColor = const Color(0xFF7C3AED);
    }

    String dueLine;
    if (daysUntil == null) {
      dueLine = 'No due date';
    } else if (daysUntil < 0) {
      dueLine = '${-daysUntil} days overdue';
    } else if (daysUntil == 0) {
      dueLine = 'Due today';
    } else {
      dueLine = 'Due in $daysUntil days';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: urgencyColor.withValues(alpha: 0.2)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 4,
              height: 52,
              decoration: BoxDecoration(
                color: urgencyColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s['payee_name'] ?? 'Unknown',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      color: KTColors.textHeading,
                    ),
                  ),
                  Text(
                    s['description'] ?? s['schedule_type'] ?? '',
                    style: const TextStyle(
                        color: KTColors.textMuted, fontSize: 12),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '$dueLine  \u00b7  ${(s['frequency'] ?? '').toString().toUpperCase()}',
                    style: TextStyle(
                        color: urgencyColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  widget.fmt(s['amount_paise']),
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: KTColors.textHeading,
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  height: 28,
                  child: ElevatedButton(
                    onPressed: _paying ? null : _payVendor,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF7C3AED),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(6)),
                      textStyle: const TextStyle(fontSize: 11),
                    ),
                    child: _paying
                        ? const SizedBox(
                            width: 12,
                            height: 12,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Mark as Paid'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Trip Expense Group Card ───────────────────────────────────────────────────

class _TripExpenseGroup extends ConsumerStatefulWidget {
  final Map<String, dynamic> group;
  const _TripExpenseGroup({required this.group});

  @override
  ConsumerState<_TripExpenseGroup> createState() => _TripExpenseGroupState();
}

class _TripExpenseGroupState extends ConsumerState<_TripExpenseGroup> {
  bool _expanded = true;
  final Set<int> _paying = {};

  static String _fmtAmt(dynamic amount) {
    if (amount == null) return '₹0';
    final d = (amount is num ? amount : double.tryParse(amount.toString()) ?? 0.0);
    if (d >= 1000) return '₹${(d / 1000).toStringAsFixed(1)}K';
    return '₹${d.toStringAsFixed(0)}';
  }

  static Color _catColor(String? cat) {
    switch (cat?.toLowerCase()) {
      case 'fuel': return Colors.orange;
      case 'toll': return Colors.blue;
      case 'food': return Colors.green;
      case 'repair': return Colors.red;
      case 'loading': return Colors.teal;
      case 'unloading': return Colors.teal;
      case 'parking': return Colors.indigo;
      default: return Colors.grey;
    }
  }

  /// Capture a payment proof photo. Returns null if user skips.
  Future<String?> _captureProofAndUpload(int expId) async {
    final picker = ImagePicker();

    // Show camera/gallery/skip bottom sheet
    final source = await showModalBottomSheet<ImageSource?>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(color: Colors.grey[300], borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 16),
            const Text('Add Payment Proof', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 4),
            const Text('Take a photo of the payment receipt or proof', style: TextStyle(color: Colors.grey, fontSize: 13)),
            const SizedBox(height: 16),
            ListTile(
              leading: const CircleAvatar(backgroundColor: Color(0xFFEDE9FE), child: Icon(Icons.camera_alt, color: Color(0xFF7C3AED))),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const CircleAvatar(backgroundColor: Color(0xFFE0F2FE), child: Icon(Icons.photo_library, color: Colors.blue)),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
            ListTile(
              leading: const CircleAvatar(backgroundColor: Colors.grey, child: Icon(Icons.skip_next, color: Colors.white)),
              title: const Text('Skip (no photo)'),
              onTap: () => Navigator.pop(context, null),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    // null means sheet dismissed without picking (treat as skip)
    if (!mounted) return null;
    // If user tapped Skip (explicitly null from tap)
    if (source == null) return null;

    final XFile? photo = await picker.pickImage(
      source: source,
      imageQuality: 75,
      maxWidth: 1200,
    );
    if (photo == null || !mounted) return null;

    // Upload
    try {
      final api = ref.read(apiServiceProvider);
      final bytes = await File(photo.path).readAsBytes();
      final formData = FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: 'proof_$expId.jpg', contentType: DioMediaType('image', 'jpeg')),
      });
      final uploadRes = await api.postMultipart(
        '/finance-manager/trip-expenses/$expId/upload-proof',
        formData,
      );
      if (uploadRes is Map && uploadRes['success'] == true) {
        return uploadRes['data']?['proof_url'] as String?;
      }
    } catch (e) {
      // Upload failed — continue without proof
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Photo upload failed, marking paid without proof.'), backgroundColor: Colors.orange),
        );
      }
    }
    return null;
  }

  Future<void> _payExpense(int expId, String amtStr) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Pay Expense'),
        content: Text(
          'Pay $amtStr for this expense?\n\nThis will be sent directly to the driver\'s registered bank account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text('Pay $amtStr'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    // Capture proof photo
    final proofUrl = await _captureProofAndUpload(expId);
    if (!mounted) return;

    setState(() => _paying.add(expId));
    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.patch(
          '/finance-manager/trip-expenses/$expId/pay',
          data: proofUrl != null ? {'proof_url': proofUrl} : {});
      if (!mounted) return;
      if ((res is Map) && res['success'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$amtStr paid to driver'),
            backgroundColor: KTColors.success,
          ),
        );
        ref.invalidate(_pendingTripExpensesProvider);
      } else {
        final msg = (res is Map) ? (res['message'] ?? 'Failed') : 'Failed';
        _showError(msg.toString());
      }
    } catch (e) {
      if (mounted) _showError(e.toString());
    }
    if (mounted) setState(() => _paying.remove(expId));
  }

  Future<void> _payAllExpenses() async {
    final expenses =
        widget.group['expenses'] as List<Map<String, dynamic>>;
    final tripNum = widget.group['trip_number'] ?? '';
    final driverName = widget.group['driver_name'] ?? 'Driver';
    final total = expenses.fold<double>(
      0,
      (s, e) => s + ((e['amount'] as num?)?.toDouble() ?? 0),
    );
    final totalStr = _fmtAmt(total);

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Mark All as Paid'),
        content: Text(
          'Mark all ${expenses.length} expenses ($totalStr) as paid for trip $tripNum to $driverName?\n\nPayments will be sent directly to the driver\'s registered bank account.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text('Mark as Paid $totalStr'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    // Capture one proof photo for all expenses in this trip group
    // Use the first expense ID for the upload endpoint
    final firstId = expenses.isNotEmpty ? (expenses.first['id'] as int?) : null;
    String? sharedProofUrl;
    if (firstId != null) {
      sharedProofUrl = await _captureProofAndUpload(firstId);
    }
    if (!mounted) return;

    final api = ref.read(apiServiceProvider);
    bool anyFailed = false;
    for (final e in expenses) {
      final id = e['id'] as int?;
      if (id == null) continue;
      if (mounted) setState(() => _paying.add(id));
      try {
        await api.patch('/finance-manager/trip-expenses/$id/pay',
            data: sharedProofUrl != null ? {'proof_url': sharedProofUrl} : {});
      } on DioException catch (e) {
        // 400 means already paid — treat as success, skip
        if (e.response?.statusCode != 400) anyFailed = true;
      } catch (_) {
        anyFailed = true;
      }
      if (mounted) setState(() => _paying.remove(id));
    }
    if (!mounted) return;
    if (anyFailed) {
      _showError('Some payments failed. Please retry.');
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('All expenses paid for trip $tripNum'),
          backgroundColor: KTColors.success,
        ),
      );
    }
    ref.invalidate(_pendingTripExpensesProvider);
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: KTColors.danger),
    );
  }

  @override
  Widget build(BuildContext context) {
    final expenses =
        widget.group['expenses'] as List<Map<String, dynamic>>;
    final tripNum = widget.group['trip_number'] as String;
    final driverName = widget.group['driver_name'] as String;
    final origin = widget.group['origin'] as String;
    final destination = widget.group['destination'] as String;
    final vehicle = widget.group['vehicle_registration'] as String;
    final total = expenses.fold<double>(
      0,
      (s, e) => s + ((e['amount'] as num?)?.toDouble() ?? 0),
    );

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: const Color(0xFF7C3AED).withValues(alpha: 0.25)),
      ),
      child: Column(
        children: [
          // ── Trip header ──────────────────────────────────────────────
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              child: Row(
                children: [
                  // Trip badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color:
                          const Color(0xFF7C3AED).withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      tripNum,
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF7C3AED),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '$origin → $destination',
                      style: const TextStyle(
                        fontSize: 12,
                        color: KTColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    color: KTColors.textMuted,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),
          // Driver + vehicle row
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
            child: Row(
              children: [
                const Icon(Icons.person_outline_rounded,
                    size: 13, color: KTColors.textMuted),
                const SizedBox(width: 4),
                Text(driverName,
                    style: const TextStyle(
                        fontSize: 12, color: KTColors.textMuted)),
                const SizedBox(width: 10),
                const Icon(Icons.directions_car_outlined,
                    size: 13, color: KTColors.textMuted),
                const SizedBox(width: 4),
                Text(vehicle,
                    style: const TextStyle(
                        fontSize: 12, color: KTColors.textMuted)),
                const Spacer(),
                Text(
                  '${expenses.length} expense${expenses.length == 1 ? '' : 's'}  ·  ${_fmtAmt(total)}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: KTColors.textHeading,
                  ),
                ),
              ],
            ),
          ),

          // ── Expense rows ─────────────────────────────────────────────
          if (_expanded) ...[
            const Divider(height: 1),
            ...expenses.map((e) {
              final id = e['id'] as int? ?? 0;
              final cat =
                  (e['category'] ?? '').toString().toUpperCase();
              final amt = _fmtAmt(e['amount']);
              final method = e['payment_mode']?.toString() ?? '';
              final dateFull = (e['expense_date'] ?? e['created_at'] ?? '').toString();
              final date = dateFull.length >= 10 ? dateFull.substring(0, 10) : '';
              final isPaying = _paying.contains(id);
              final catColor =
                  _catColor(e['category']?.toString());

              return Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                decoration: const BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: Color(0xFFF0F0F0)),
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Category badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: catColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        cat,
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: catColor,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Pay mode + date
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (method.isNotEmpty) ...[
                                const Icon(Icons.payment,
                                    size: 11, color: KTColors.textMuted),
                                const SizedBox(width: 3),
                                Text(method,
                                    style: const TextStyle(
                                        fontSize: 10,
                                        color: KTColors.textMuted)),
                                const SizedBox(width: 8),
                              ],
                              if (date.isNotEmpty)
                                Text(date,
                                    style: const TextStyle(
                                        fontSize: 10,
                                        color: KTColors.textMuted)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    // Amount + Pay button
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          amt,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: KTColors.textHeading,
                          ),
                        ),
                        const SizedBox(height: 6),
                        GestureDetector(
                          onTap: isPaying ? null : () => _payExpense(id, amt),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: isPaying
                                  ? Colors.grey.shade300
                                  : const Color(0xFF7C3AED),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: isPaying
                                ? const SizedBox(
                                    width: 12,
                                    height: 12,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white))
                                : const Text(
                                    'Mark as Paid',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.white,
                                        fontWeight: FontWeight.w600),
                                  ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),

            // ── Pay All button ───────────────────────────────────────
            if (expenses.length > 1) ...[
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 36,
                  child: ElevatedButton.icon(
                    onPressed:
                        _paying.isNotEmpty ? null : _payAllExpenses,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF7C3AED),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                    ),
                    icon: _paying.isNotEmpty
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Icon(Icons.payments_rounded, size: 16),
                    label: Text(
                      'Mark All as Paid  ·  ${_fmtAmt(total)}',
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
            ] else
              const SizedBox(height: 4),
          ] else
            const SizedBox(height: 4),
        ],
      ),
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

class _Shimmer extends StatelessWidget {
  final int count;
  const _Shimmer({required this.count});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        count,
        (_) => Container(
          height: 76,
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
              color: KTColors.surface,
              borderRadius: BorderRadius.circular(12)),
          child: const Center(
              child: CircularProgressIndicator(strokeWidth: 2)),
        ),
      ),
    );
  }
}

class _EmptyTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String message;
  const _EmptyTile(
      {required this.icon, required this.color, required this.message});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: KTColors.surface,
          borderRadius: BorderRadius.circular(10)),
      child: Row(
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message,
                style: const TextStyle(
                    fontSize: 12, color: KTColors.textSecondary)),
          ),
        ],
      ),
    );
  }
}

class _ErrorTile extends StatelessWidget {
  final String msg;
  const _ErrorTile({required this.msg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: KTColors.danger.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(10)),
      child: Text('Error: $msg',
          style: const TextStyle(fontSize: 12, color: KTColors.danger)),
    );
  }
}

// ─── Trip Fuel Entry Payment Card ─────────────────────────────────────────────

class _FuelEntryPaymentCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> entry;
  const _FuelEntryPaymentCard({required this.entry});

  @override
  ConsumerState<_FuelEntryPaymentCard> createState() =>
      _FuelEntryPaymentCardState();
}

class _FuelEntryPaymentCardState
    extends ConsumerState<_FuelEntryPaymentCard> {
  bool _paying = false;

  String _fmt(dynamic v) {
    final d = (v is num) ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;
    return '₹${d.toStringAsFixed(0)}';
  }

  Future<void> _markPaid() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Mark Fuel Entry as Paid'),
        content: Text(
          'Mark fuel entry of ${_fmt(widget.entry['total_amount'])} for '
          '${widget.entry['driver_name'] ?? 'Driver'} as paid?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text('Mark as Paid ${_fmt(widget.entry['total_amount'])}'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    setState(() => _paying = true);
    try {
      final api = ref.read(apiServiceProvider);
      final id = widget.entry['id'];
      await api.patch('/finance-manager/fuel-entries/$id/mark-paid', data: null);
      if (mounted) {
        ref.invalidate(_pendingFuelEntriesProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Fuel entry marked as paid'), backgroundColor: Color(0xFF16A34A)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _paying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = widget.entry;
    final litres = (e['quantity_litres'] as num?)?.toDouble() ?? 0;
    final rate = (e['rate_per_litre'] as num?)?.toDouble() ?? 0;
    final fuelType = (e['fuel_type'] ?? 'diesel').toString();
    final date = e['fuel_date'] != null
        ? DateTime.tryParse(e['fuel_date'].toString())
        : null;
    final dateStr = date != null
        ? '${date.day} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.month - 1]} ${date.year}'
        : '';

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: const Color(0xFFE65100).withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFE65100).withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  e['trip_number']?.toString() ?? 'Trip',
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFFE65100)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  e['driver_name']?.toString() ?? '',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                _fmt(e['total_amount']),
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: Color(0xFFE65100)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.local_gas_station_rounded, size: 13, color: KTColors.textSecondary),
              const SizedBox(width: 4),
              Text(
                '${litres.toStringAsFixed(1)} L × ₹${rate.toStringAsFixed(0)}/L · $fuelType',
                style: const TextStyle(fontSize: 12, color: KTColors.textSecondary),
              ),
              if (e['pump_name'] != null && e['pump_name'] != 'N/A') ...[
                const Text(' · ', style: TextStyle(color: KTColors.textSecondary)),
                Text(e['pump_name'].toString(),
                    style: const TextStyle(fontSize: 12, color: KTColors.textSecondary)),
              ],
            ],
          ),
          if (dateStr.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(dateStr, style: const TextStyle(fontSize: 11, color: KTColors.textSecondary)),
          ],
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            height: 34,
            child: ElevatedButton(
              onPressed: _paying ? null : _markPaid,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7C3AED),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: _paying
                  ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Mark as Paid', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Fuel Top-Up Payment Card ─────────────────────────────────────────────────

class _FuelTopUpPaymentCard extends ConsumerWidget {
  final Map<String, dynamic> request;
  const _FuelTopUpPaymentCard({required this.request});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tankName = request['tank_name'] ?? 'Tank ${request['tank_id']}';
    final branchName = request['branch_name'] ?? '';
    final qty = (request['quantity_litres'] as num?)?.toDouble() ?? 0.0;
    final totalAmount = request['total_amount'] != null
        ? (request['total_amount'] as num).toDouble()
        : null;
    final remarks = (request['remarks'] ?? '').toString();
    final isLoading = ref.watch(markTopUpPaidProvider) is AsyncLoading;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: const Color(0xFF00897B).withValues(alpha: 0.25)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.03),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: const Color(0xFF00897B).withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.local_gas_station_rounded,
                    color: Color(0xFF00897B), size: 16),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tankName,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: KTColors.textHeading,
                      ),
                    ),
                    if (branchName.isNotEmpty)
                      Text(
                        branchName,
                        style: const TextStyle(fontSize: 12, color: KTColors.textMuted),
                      ),
                  ],
                ),
              ),
              if (totalAmount != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF00897B).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '₹${totalAmount.toStringAsFixed(0)}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: Color(0xFF00897B),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.water_drop_outlined, size: 14, color: KTColors.textMuted),
              const SizedBox(width: 4),
              Text(
                '${qty.toStringAsFixed(0)} L required',
                style: const TextStyle(fontSize: 12, color: KTColors.textMuted),
              ),
            ],
          ),
          if (remarks.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              remarks,
              style: const TextStyle(fontSize: 12, color: KTColors.textMuted),
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: isLoading
                  ? null
                  : () async {
                      final id = request['id'] as int;
                      final error = await ref
                          .read(markTopUpPaidProvider.notifier)
                          .markPaid(id);
                      if (!context.mounted) return;
                      if (error == null) {
                        ref.invalidate(pendingTopUpRequestsProvider);
                        ref.invalidate(paidTopUpRequestsProvider);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Payment recorded & tank stock updated'),
                            backgroundColor: Colors.green,
                          ),
                        );
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(error),
                            backgroundColor: Colors.red,
                          ),
                        );
                      }
                    },
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF00897B),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              child: isLoading
                  ? const SizedBox(
                      height: 16,
                      width: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Text(
                      'Mark as Paid',
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 14),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Paid Fuel Refill Card ───────────────────────────────────────────────────────────

class _PaidFuelRefillCard extends StatelessWidget {
  final Map<String, dynamic> request;
  const _PaidFuelRefillCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final tankName = request['tank_name'] ?? 'Tank ${request['tank_id']}';
    final branchName = (request['branch_name'] ?? '').toString();
    final qty = (request['quantity_litres'] as num?)?.toDouble() ?? 0.0;
    final totalAmount = request['total_amount'] != null
        ? (request['total_amount'] as num).toDouble()
        : null;
    final creatorName = (request['creator_name'] ?? '').toString();
    final paidAt = request['paid_at']?.toString() ?? '';

    String dateLabel = '';
    if (paidAt.isNotEmpty) {
      try {
        final dt = DateTime.parse(paidAt).toLocal();
        const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateLabel = '${dt.day} ${months[dt.month]} ${dt.year}, '
            '${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
      } catch (_) {
        dateLabel = paidAt.substring(0, 10);
      }
    }

    const teal = Color(0xFF00897B);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: teal.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.02),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: teal.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.local_gas_station_rounded, color: teal, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        tankName,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: KTColors.textHeading,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (totalAmount != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: teal.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '₹${totalAmount.toStringAsFixed(0)}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: teal,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 3),
                if (branchName.isNotEmpty)
                  Text(
                    branchName,
                    style: const TextStyle(fontSize: 12, color: KTColors.textMuted),
                  ),
                const SizedBox(height: 3),
                Text(
                  '${qty.toStringAsFixed(0)} L  •  Requested by $creatorName',
                  style: const TextStyle(fontSize: 12, color: KTColors.textSecondary),
                ),
                if (dateLabel.isNotEmpty) ...[const SizedBox(height: 2),
                  Text(
                    'Paid on $dateLabel',
                    style: const TextStyle(fontSize: 11, color: KTColors.textMuted),
                  )],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: teal.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Text(
              'PAID',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: teal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
