import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../core/widgets/kt_loading_shimmer.dart';
import '../../core/widgets/kt_error_state.dart';
import '../../core/widgets/notification_bell_widget.dart';
import 'pa_providers.dart';

const _kPaAccent = KTColors.paAccent;

const _filters = [
  ('Active',  'active'),
  ('Expired', 'expired'),
];

class PAEWBListScreen extends ConsumerWidget {
  const PAEWBListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter   = ref.watch(paEWBFilterProvider);
    final ewbAsync = ref.watch(paEWBListProvider);

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: AppBar(
        backgroundColor: KTColors.surface,
        title: Text('E-Way Bills',
            style: KTTextStyles.h2.copyWith(color: KTColors.textHeading)),
        actions: const [NotificationBellWidget()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(50),
          child: SizedBox(
            height: 50,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: _filters.map((f) {
                final isActive = filter == f.$2;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () =>
                        ref.read(paEWBFilterProvider.notifier).state = f.$2,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 6),
                      decoration: BoxDecoration(
                        color: isActive ? _kPaAccent : Colors.transparent,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isActive ? _kPaAccent : KTColors.borderColor,
                        ),
                      ),
                      child: Text(
                        f.$1,
                        style: TextStyle(
                          color: isActive ? Colors.white : KTColors.textMuted,
                          fontSize: 13,
                          fontWeight:
                              isActive ? FontWeight.w700 : FontWeight.w400,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ),
      ),
      body: ewbAsync.when(
        loading: () => const KTLoadingShimmer(type: ShimmerType.list),
        error: (e, _) => KTErrorState(
          message: e.toString(),
          onRetry: () => ref.invalidate(paEWBListProvider),
        ),
        data: (items) {
          if (items.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.receipt_long_outlined,
                      size: 52,
                      color: KTColors.textMuted.withValues(alpha: 0.35)),
                  const SizedBox(height: 12),
                  Text(
                    filter == 'expired'
                        ? 'No expired E-Way Bills'
                        : 'No active E-Way Bills',
                    style: KTTextStyles.body.copyWith(color: KTColors.textMuted),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            color: _kPaAccent,
            backgroundColor: KTColors.surface,
            onRefresh: () async => ref.invalidate(paEWBListProvider),
            child: ListView.builder(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final ewb = Map<String, dynamic>.from(items[i] as Map);
                return _EWBCard(ewb: ewb);
              },
            ),
          );
        },
      ),
    );
  }
}

// ---------------------------------------------------------------------------

class _EWBCard extends StatelessWidget {
  final Map<String, dynamic> ewb;
  const _EWBCard({required this.ewb});

  String _fmtDate(dynamic val) {
    if (val == null) return '—';
    try {
      final dt = DateTime.parse(val.toString());
      return '${dt.day.toString().padLeft(2, '0')}/'
          '${dt.month.toString().padLeft(2, '0')}/'
          '${dt.year}';
    } catch (_) {
      return val.toString();
    }
  }

  String _validUntilLabel(dynamic val) {
    if (val == null) return '—';
    try {
      final dt = DateTime.parse(val.toString()).toLocal();
      final diff = dt.difference(DateTime.now());
      final dateStr =
          '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}'
          '  ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
      if (diff.isNegative) return '$dateStr  (Expired)';
      if (diff.inHours < 1) return '$dateStr  (${diff.inMinutes}m left)';
      return '$dateStr  (${diff.inHours}h left)';
    } catch (_) {
      return val.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final isExpired = ewb['is_expired'] == true;
    final accent    = isExpired ? KTColors.danger : KTColors.success;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isExpired
              ? KTColors.danger.withValues(alpha: 0.45)
              : KTColors.borderColor,
          width: isExpired ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Route row
            Row(
              children: [
                const Icon(Icons.location_on_outlined,
                    size: 15, color: KTColors.success),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${ewb['origin'] ?? '—'}  →  ${ewb['destination'] ?? '—'}',
                    style: KTTextStyles.body.copyWith(
                      color: KTColors.textHeading,
                      fontWeight: FontWeight.w700,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    isExpired ? 'EXPIRED' : 'ACTIVE',
                    style: TextStyle(
                      color: accent,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),

            const Divider(height: 18, color: KTColors.borderColor),

            _row(
              icon: Icons.tag,
              label: 'EWB Number',
              value: ewb['eway_bill_number'] ?? '—',
              bold: true,
            ),
            const SizedBox(height: 8),
            _row(
              icon: Icons.receipt_outlined,
              label: 'LR Number',
              value: ewb['lr_number'] ?? '—',
            ),
            const SizedBox(height: 8),
            _row(
              icon: Icons.calendar_today_outlined,
              label: 'EWB Date',
              value: _fmtDate(ewb['eway_bill_date']),
            ),
            const SizedBox(height: 8),
            _row(
              icon: Icons.schedule_outlined,
              label: 'Valid Until',
              value: _validUntilLabel(ewb['eway_bill_valid_until']),
              valueColor: isExpired ? KTColors.danger : KTColors.textBody,
            ),
          ],
        ),
      ),
    );
  }

  Widget _row({
    required IconData icon,
    required String label,
    required String value,
    bool bold = false,
    Color? valueColor,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 14, color: KTColors.textMuted),
        const SizedBox(width: 6),
        SizedBox(
          width: 90,
          child: Text(
            label,
            style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: KTTextStyles.bodySmall.copyWith(
              color: valueColor ?? KTColors.textHeading,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}
