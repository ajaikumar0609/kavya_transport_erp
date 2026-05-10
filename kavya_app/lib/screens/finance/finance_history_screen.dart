import 'dart:collection';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../providers/fleet_dashboard_provider.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

final _financeHistoryProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/finance-manager/payment-history?limit=500');
  if (res is Map) {
    final data = res['data'];
    if (data is List) return data.cast<Map<String, dynamic>>();
  }
  return [];
});

// ─── Screen ───────────────────────────────────────────────────────────────────

class FinanceHistoryScreen extends ConsumerStatefulWidget {
  const FinanceHistoryScreen({super.key});

  @override
  ConsumerState<FinanceHistoryScreen> createState() =>
      _FinanceHistoryScreenState();
}

class _FinanceHistoryScreenState extends ConsumerState<FinanceHistoryScreen> {
  String _filter = 'ALL';

  static const _filters = [
    ('ALL', 'All Payments'),
    ('SALARY', 'Salary'),
    ('TRIP_EXPENSE', 'Trip Expenses'),
    ('FUEL_REFILL', 'Fuel Refills'),
    ('TRIP_ADVANCE', 'Advances'),
    ('DRIVER_ADVANCE', 'Driver Advances'),
  ];

  @override
  Widget build(BuildContext context) {
    final asyncItems = ref.watch(_financeHistoryProvider);

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      body: Column(
        children: [
          // ── Filter chips ─────────────────────────────────────────────
          Container(
            color: KTColors.surface,
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: _filters.map((f) {
                  final selected = _filter == f.$1;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(f.$2),
                      selected: selected,
                      onSelected: (_) => setState(() => _filter = f.$1),
                      selectedColor:
                          const Color(0xFF7C3AED).withValues(alpha: 0.15),
                      checkmarkColor: const Color(0xFF7C3AED),
                      labelStyle: TextStyle(
                        color: selected
                            ? const Color(0xFF7C3AED)
                            : KTColors.textMuted,
                        fontWeight:
                            selected ? FontWeight.w600 : FontWeight.w400,
                        fontSize: 12,
                      ),
                      side: BorderSide(
                        color: selected
                            ? const Color(0xFF7C3AED)
                            : Colors.transparent,
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),

          // ── Content ──────────────────────────────────────────────────
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(_financeHistoryProvider),
              child: asyncItems.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    const SizedBox(height: 80),
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline,
                              color: Colors.red, size: 40),
                          const SizedBox(height: 12),
                          Padding(
                            padding:
                                const EdgeInsets.symmetric(horizontal: 24),
                            child: Text(
                              'Failed to load history\n$e',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.red, fontSize: 13),
                            ),
                          ),
                          const SizedBox(height: 16),
                          OutlinedButton(
                            onPressed: () =>
                                ref.invalidate(_financeHistoryProvider),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                data: (all) {
                  final items = _filter == 'ALL'
                      ? all
                      : all
                          .where((i) => i['type'] == _filter)
                          .toList();

                  if (items.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        const SizedBox(height: 80),
                        Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.all(18),
                                decoration: const BoxDecoration(
                                  color: KTColors.lightBg,
                                  shape: BoxShape.circle,
                                ),
                                child: const Icon(Icons.history_rounded,
                                    color: KTColors.textMuted, size: 36),
                              ),
                              const SizedBox(height: 14),
                              const Text(
                                'No payments recorded yet',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: KTColors.textMuted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'Marked-as-paid payments will appear here.',
                                style: TextStyle(
                                    fontSize: 12, color: KTColors.textMuted),
                              ),
                            ],
                          ),
                        ),
                      ],
                    );
                  }

                  // Group by month
                  final grouped = _groupByMonth(items);

                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                    children: [
                      // Summary badge
                      _SummaryBar(items: all, filtered: items),
                      const SizedBox(height: 12),
                      for (final entry in grouped.entries) ...[
                        _MonthHeader(label: entry.key),
                        const SizedBox(height: 8),
                        ...entry.value.map((item) => _HistoryCard(item: item)),
                        const SizedBox(height: 16),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Groups items by "MMM YYYY" month label, preserving descending order.
  LinkedHashMap<String, List<Map<String, dynamic>>> _groupByMonth(
      List<Map<String, dynamic>> items) {
    final map = LinkedHashMap<String, List<Map<String, dynamic>>>();
    for (final item in items) {
      final dateStr = (item['date'] as String?) ?? '';
      String monthKey = 'Unknown';
      if (dateStr.isNotEmpty) {
        try {
          final dt = DateTime.parse(dateStr);
          const months = [
            '',
            'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
          ];
          monthKey = '${months[dt.month]} ${dt.year}';
        } catch (_) {}
      }
      map.putIfAbsent(monthKey, () => []).add(item);
    }
    return map;
  }
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

class _SummaryBar extends StatelessWidget {
  final List<Map<String, dynamic>> items;
  final List<Map<String, dynamic>> filtered;

  const _SummaryBar({required this.items, required this.filtered});

  static String _fmt(double amt) {
    if (amt >= 100000) return '₹${(amt / 100000).toStringAsFixed(1)}L';
    if (amt >= 1000) return '₹${(amt / 1000).toStringAsFixed(1)}K';
    return '₹${amt.toStringAsFixed(0)}';
  }

  @override
  Widget build(BuildContext context) {
    final totalAmt = filtered.fold<double>(
        0, (s, i) => s + ((i['amount_rupees'] as num?)?.toDouble() ?? 0));
    final count = filtered.length;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF4C1D95), Color(0xFF7C3AED)],
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.history_rounded, color: Colors.white, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$count payment${count == 1 ? '' : 's'}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                Text(
                  'Total paid: ${_fmt(totalAmt)}',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.8),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Month Header ─────────────────────────────────────────────────────────────

class _MonthHeader extends StatelessWidget {
  final String label;
  const _MonthHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: KTColors.textMuted,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(child: Divider(color: Colors.grey.shade200, height: 1)),
      ],
    );
  }
}

// ─── History Card ─────────────────────────────────────────────────────────────

class _HistoryCard extends StatelessWidget {
  final Map<String, dynamic> item;
  const _HistoryCard({required this.item});

  static const _months = [
    '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  @override
  Widget build(BuildContext context) {
    final type = (item['type'] as String?) ?? '';
    final title = (item['title'] as String?) ?? '';
    final subtitle = (item['subtitle'] as String?) ?? '';
    final detail = (item['detail'] as String?) ?? '';
    final amtRupees =
        (item['amount_rupees'] as num?)?.toDouble() ?? 0.0;
    final dateStr = (item['date'] as String?) ?? '';
    final proofUrl = item['payment_proof_url'] as String?;

    final color = _color(type);
    final icon = _icon(type);
    final badge = _badge(type);

    String dateLabel = '';
    if (dateStr.isNotEmpty) {
      try {
        final dt = DateTime.parse(dateStr).toLocal();
        dateLabel =
            '${dt.day} ${_months[dt.month]} ${dt.year}  ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      } catch (_) {
        dateLabel = dateStr.substring(0, dateStr.length.clamp(0, 10));
      }
    }

    final amtLabel = amtRupees >= 100000
        ? '₹${(amtRupees / 100000).toStringAsFixed(1)}L'
        : amtRupees >= 1000
            ? '₹${(amtRupees / 1000).toStringAsFixed(1)}k'
            : '₹${amtRupees.toStringAsFixed(0)}';

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.025),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Icon
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          // Text
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: KTColors.textHeading,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle.isNotEmpty && subtitle != detail) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: KTColors.textSecondary,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                if (detail.isNotEmpty &&
                    detail != subtitle &&
                    detail != title) ...[
                  const SizedBox(height: 1),
                  Text(
                    detail,
                    style: const TextStyle(
                      fontSize: 11,
                      color: KTColors.textMuted,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 5),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text(
                        badge,
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: color,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                    if (dateLabel.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          dateLabel,
                          style: const TextStyle(
                            fontSize: 10,
                            color: KTColors.textMuted,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Amount + proof
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (amtRupees > 0)
                Text(
                  amtLabel,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              if (proofUrl != null && proofUrl.isNotEmpty) ...[
                const SizedBox(height: 4),
                GestureDetector(
                  onTap: () => _showProof(context, proofUrl),
                  child: Container(
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEDE9FE),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(Icons.receipt_long,
                        color: Color(0xFF7C3AED), size: 14),
                  ),
                ),
              ],
              const SizedBox(height: 4),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: Colors.green.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'PAID',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: Colors.green,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showProof(BuildContext context, String url) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        child: GestureDetector(
          onTap: () => Navigator.pop(context),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              url,
              fit: BoxFit.contain,
              loadingBuilder: (ctx, child, progress) {
                if (progress == null) return child;
                return const SizedBox(
                  height: 200,
                  child: Center(child: CircularProgressIndicator()),
                );
              },
              errorBuilder: (_, __, ___) => const SizedBox(
                height: 200,
                child: Center(
                    child: Icon(Icons.broken_image,
                        size: 48, color: Colors.white)),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static Color _color(String type) {
    switch (type) {
      case 'SALARY':
        return const Color(0xFF0369A1);
      case 'FUEL_REFILL':
        return const Color(0xFF00897B);
      case 'TRIP_EXPENSE':
        return const Color(0xFF7C3AED);
      case 'TRIP_ADVANCE':
        return const Color(0xFFD97706);
      case 'DRIVER_ADVANCE':
        return const Color(0xFF2563EB);
      default:
        return KTColors.textMuted;
    }
  }

  static IconData _icon(String type) {
    switch (type) {
      case 'SALARY':
        return Icons.people_rounded;
      case 'FUEL_REFILL':
        return Icons.local_gas_station_rounded;
      case 'TRIP_EXPENSE':
        return Icons.receipt_long_rounded;
      case 'TRIP_ADVANCE':
        return Icons.currency_rupee_rounded;
      case 'DRIVER_ADVANCE':
        return Icons.account_balance_wallet_rounded;
      default:
        return Icons.payment_rounded;
    }
  }

  static String _badge(String type) {
    switch (type) {
      case 'SALARY':
        return 'SALARY';
      case 'FUEL_REFILL':
        return 'FUEL PAID';
      case 'TRIP_EXPENSE':
        return 'EXPENSE PAID';
      case 'TRIP_ADVANCE':
        return 'TRIP ADVANCE';
      case 'DRIVER_ADVANCE':
        return 'ADVANCE PAID';
      default:
        return 'PAID';
    }
  }
}
