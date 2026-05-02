import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../providers/fleet_dashboard_provider.dart';

final financeDashboardProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/finance-manager/dashboard/summary');
  if (res is Map<String, dynamic>) {
    final data = res['data'];
    if (data is Map<String, dynamic>) return data;
    return res;
  }
  return {};
});

final financePaymentHistoryProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/finance-manager/payment-history');
  if (res is Map) {
    final data = res['data'];
    if (data is List) return data.cast<Map<String, dynamic>>();
  }
  return [];
});

class FinanceHomeScreen extends ConsumerStatefulWidget {
  const FinanceHomeScreen({super.key});

  @override
  ConsumerState<FinanceHomeScreen> createState() => _FinanceHomeScreenState();
}

class _FinanceHomeScreenState extends ConsumerState<FinanceHomeScreen> {
  @override
  Widget build(BuildContext context) {
    final dashAsync = ref.watch(financeDashboardProvider);
    final histAsync = ref.watch(financePaymentHistoryProvider);
    final now = DateTime.now();
    final monthLabel = '${_monthName(now.month)} ${now.year}';

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(financeDashboardProvider);
          ref.invalidate(financePaymentHistoryProvider);
        },
        child: CustomScrollView(
          slivers: [
            // ── Stats header ─────────────────────────────────────────
            SliverToBoxAdapter(
              child: _buildStats(dashAsync, monthLabel),
            ),
            // ── "History" label bar (pinned) ─────────────────────────
            SliverPersistentHeader(
              pinned: true,
              delegate: _TabBarDelegate(),
            ),
            // ── History content ──────────────────────────────────────
            ..._buildHistorySlivers(histAsync),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildHistorySlivers(
      AsyncValue<List<Map<String, dynamic>>> histAsync) {
    return histAsync.when(
      loading: () => [
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
        ),
      ],
      error: (e, _) => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline,
                    color: KTColors.danger, size: 36),
                const SizedBox(height: 10),
                Text(
                  'Failed to load history',
                  style: TextStyle(
                      color: KTColors.textMuted, fontSize: 13),
                ),
                const SizedBox(height: 12),
                OutlinedButton(
                  onPressed: () =>
                      ref.invalidate(financePaymentHistoryProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        ),
      ],
      data: (items) {
        if (items.isEmpty) {
          return [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 60),
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
                      'No payment history yet',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: KTColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Approved payments will appear here.',
                      style: TextStyle(
                          fontSize: 12, color: KTColors.textMuted),
                    ),
                  ],
                ),
              ),
            ),
          ];
        }
        return [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            sliver: SliverList(
              delegate: SliverChildBuilderDelegate(
                (ctx, i) => _HistoryItem(item: items[i]),
                childCount: items.length,
              ),
            ),
          ),
        ];
      },
    );
  }

  Widget _buildStats(
      AsyncValue<Map<String, dynamic>> dashAsync, String monthLabel) {
    return dashAsync.when(
      loading: () => const SizedBox(
        height: 240,
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, color: KTColors.danger, size: 40),
            const SizedBox(height: 10),
            Text(
              'Failed to load dashboard',
              style: KTTextStyles.body.copyWith(
                color: KTColors.textMuted,
                decoration: TextDecoration.none,
              ),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () => ref.invalidate(financeDashboardProvider),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
      data: (data) {
        final expenses = (data['expenses'] as Map<String, dynamic>?) ?? {};
        final salary = (data['salary'] as Map<String, dynamic>?) ?? {};
        final payables = (data['payables'] as Map<String, dynamic>?) ?? {};
        final razorpayPaise = _parseInt(data['razorpay_balance_paise']);

        final pendingCount = _parseInt(expenses['pending_count']);
        final pendingAmt = _parseDouble(expenses['pending_amount_paise']) / 100;

        final totalStaff = _parseInt(salary['total_staff']);
        final paidCount = _parseInt(salary['paid_count']);
        final salaryPaidAmt = _parseDouble(salary['paid_paise']) / 100;

        final overdueCount = _parseInt(payables['overdue_count']);
        final dueWeekCount = _parseInt(payables['due_this_week_count']);
        final dueWeekAmt = _parseDouble(payables['due_this_week_paise']) / 100;

        final razorpayAmt = razorpayPaise / 100;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Hero gradient header ──────────────────────────────────
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFF4C1D95),
                    Color(0xFF6D28D9),
                    Color(0xFF7C3AED),
                  ],
                ),
              ),
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Text(
                        'Finance Overview',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          decoration: TextDecoration.none,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          monthLabel,
                          style: const TextStyle(
                            fontSize: 11,
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            decoration: TextDecoration.none,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  // ── Quick stats row inside hero ───────────────────────
                  Row(
                    children: [
                      _HeroStat(
                        label: 'Pending Expenses',
                        value: pendingCount.toString(),
                        unit: 'items',
                        icon: Icons.receipt_long_rounded,
                      ),
                      _heroDivider(),
                      _HeroStat(
                        label: 'Salary Coverage',
                        value: totalStaff > 0
                            ? '$paidCount/$totalStaff'
                            : '—',
                        unit: 'staff paid',
                        icon: Icons.people_rounded,
                      ),
                      _heroDivider(),
                      _HeroStat(
                        label: 'Razorpay',
                        value: _fmtAmt(razorpayAmt),
                        unit: 'wallet',
                        icon: Icons.account_balance_rounded,
                      ),
                    ],
                  ),
                ],
              ),
            ),

            // ── Cards section ─────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'At a Glance',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: KTColors.textMuted,
                      letterSpacing: 0.8,
                      decoration: TextDecoration.none,
                    ),
                  ),
                  const SizedBox(height: 12),

                  // ── KPI Grid ───────────────────────────────────────
                  GridView.count(
                    crossAxisCount: 2,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 12,
                    childAspectRatio: 1.55,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    children: [
                      _KpiCard(
                        label: 'Pending Expenses',
                        value: '$pendingCount',
                        sub: pendingAmt > 0
                            ? _fmtAmt(pendingAmt)
                            : 'submissions',
                        icon: Icons.receipt_long_rounded,
                        color: KTColors.warning,
                      ),
                      _KpiCard(
                        label: 'Salary Paid',
                        value: '$paidCount / $totalStaff',
                        sub: _fmtAmt(salaryPaidAmt),
                        icon: Icons.people_rounded,
                        color: KTColors.success,
                      ),
                      _KpiCard(
                        label: 'Payables Due',
                        value: '$dueWeekCount',
                        sub: overdueCount > 0
                            ? '$overdueCount overdue'
                            : 'None overdue',
                        icon: Icons.calendar_today_rounded,
                        color: overdueCount > 0
                            ? KTColors.danger
                            : KTColors.info,
                      ),
                      _KpiCard(
                        label: 'Razorpay Balance',
                        value: _fmtAmt(razorpayAmt),
                        sub: 'Payout wallet',
                        icon: Icons.account_balance_rounded,
                        color: const Color(0xFF6D28D9),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // ── Summary rows ──────────────────────────────────
                  if (dueWeekAmt > 0) ...[
                    _SummaryRow(
                      icon: Icons.warning_amber_rounded,
                      color: KTColors.warning,
                      label: 'Due this week',
                      value: _fmtAmt(dueWeekAmt),
                    ),
                    const SizedBox(height: 10),
                  ],
                  _SummaryRow(
                    icon: Icons.check_circle_rounded,
                    color: KTColors.success,
                    label: 'Salary paid this month',
                    value: _fmtAmt(salaryPaidAmt),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  static int _parseInt(dynamic v) {
    if (v == null) return 0;
    if (v is int) return v;
    if (v is double) return v.toInt();
    return int.tryParse(v.toString()) ?? 0;
  }

  static double _parseDouble(dynamic v) {
    if (v == null) return 0;
    if (v is num) return v.toDouble();
    return double.tryParse(v.toString()) ?? 0;
  }

  static String _fmtAmt(double amt) {
    if (amt >= 10000000) return '₹${(amt / 10000000).toStringAsFixed(1)}Cr';
    if (amt >= 100000) return '₹${(amt / 100000).toStringAsFixed(1)}L';
    if (amt >= 1000) return '₹${(amt / 1000).toStringAsFixed(1)}k';
    return '₹${amt.toStringAsFixed(0)}';
  }

  static String _monthName(int m) {
    const names = [
      '', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return names[m];
  }
}

// ─── Tab Bar Persistent Header Delegate ───────────────────────────────────────
class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  const _TabBarDelegate();

  static const _height = 44.0;

  @override
  double get minExtent => _height;
  @override
  double get maxExtent => _height;

  @override
  Widget build(
      BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      height: _height,
      decoration: BoxDecoration(
        color: KTColors.surface,
        boxShadow: overlapsContent
            ? [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                )
              ]
            : null,
      ),
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'History',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: Color(0xFF6D28D9),
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 3),
          Container(
            width: 40,
            height: 3,
            decoration: BoxDecoration(
              color: const Color(0xFF6D28D9),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => false;
}

// ─── Hero Stat Widget ──────────────────────────────────────────────────────────
class _HeroStat extends StatelessWidget {
  final String label;
  final String value;
  final String unit;
  final IconData icon;

  const _HeroStat({
    required this.label,
    required this.value,
    required this.unit,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: Colors.white.withValues(alpha: 0.85), size: 16),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              decoration: TextDecoration.none,
              height: 1,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            unit,
            style: TextStyle(
              fontSize: 10,
              color: Colors.white.withValues(alpha: 0.7),
              fontWeight: FontWeight.w500,
              decoration: TextDecoration.none,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 9,
              color: Colors.white.withValues(alpha: 0.55),
              decoration: TextDecoration.none,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

Widget _heroDivider() => Container(
      width: 1,
      height: 40,
      color: Colors.white.withValues(alpha: 0.25),
    );

// ─── KPI Card ──────────────────────────────────────────────────────────────────
class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  final IconData icon;
  final Color color;

  const _KpiCard({
    required this.label,
    required this.value,
    required this.sub,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.10),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Stack(
          children: [
            // Top color accent bar
            Positioned(
              top: 0, left: 0, right: 0,
              child: Container(
                height: 3,
                color: color,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 16, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          label,
                          style: TextStyle(
                            fontSize: 10,
                            color: KTColors.textMuted,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.2,
                            decoration: TextDecoration.none,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.all(7),
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.10),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(icon, color: color, size: 16),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    value,
                    style: TextStyle(
                      fontSize: 18,
                      color: KTColors.textHeading,
                      fontWeight: FontWeight.w800,
                      decoration: TextDecoration.none,
                      height: 1,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    sub,
                    style: TextStyle(
                      fontSize: 10,
                      color: color,
                      fontWeight: FontWeight.w600,
                      decoration: TextDecoration.none,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Summary Row ───────────────────────────────────────────────────────────────
class _SummaryRow extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String label;
  final String value;

  const _SummaryRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 16),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: KTColors.textBody,
                fontWeight: FontWeight.w500,
                decoration: TextDecoration.none,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 15,
              color: color,
              fontWeight: FontWeight.w800,
              decoration: TextDecoration.none,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── History Item Card ─────────────────────────────────────────────────────────

class _HistoryItem extends StatelessWidget {
  final Map<String, dynamic> item;
  const _HistoryItem({required this.item});

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
    final amtRupees = (item['amount_rupees'] as num?)?.toDouble() ?? 0.0;
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
            '${dt.day} ${_months[dt.month]} ${dt.year}  ${dt.hour}:${dt.minute.toString().padLeft(2, '0')}';
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
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
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
                    decoration: TextDecoration.none,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 11,
                      color: KTColors.textSecondary,
                      decoration: TextDecoration.none,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                if (detail.isNotEmpty && detail != subtitle) ...[
                  const SizedBox(height: 1),
                  Text(
                    detail,
                    style: const TextStyle(
                      fontSize: 11,
                      color: KTColors.textMuted,
                      decoration: TextDecoration.none,
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
                          decoration: TextDecoration.none,
                        ),
                      ),
                    ),
                    if (dateLabel.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(
                        dateLabel,
                        style: const TextStyle(
                          fontSize: 10,
                          color: KTColors.textMuted,
                          decoration: TextDecoration.none,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Amount
          if (amtRupees > 0)
            Text(
              amtLabel,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: color,
                decoration: TextDecoration.none,
              ),
            ),
          // Proof photo icon
          if (proofUrl != null && proofUrl.isNotEmpty) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => _showProof(context, proofUrl),
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFFEDE9FE),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(Icons.receipt_long, color: Color(0xFF7C3AED), size: 16),
              ),
            ),
          ],
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
                child: Center(child: Icon(Icons.broken_image, size: 48, color: Colors.white)),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static Color _color(String type) {
    switch (type) {
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
      case 'FUEL_REFILL':
        return 'FUEL PAID';
      case 'TRIP_EXPENSE':
        return 'EXPENSE PAID';
      case 'TRIP_ADVANCE':
        return 'TRIP ADVANCE';
      case 'DRIVER_ADVANCE':
        return 'ADVANCE';
      default:
        return 'PAID';
    }
  }
}
