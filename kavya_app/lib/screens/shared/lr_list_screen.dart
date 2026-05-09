import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../providers/fleet_dashboard_provider.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final lrListProvider =
    FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res = await api.get('/lrs', queryParameters: {'limit': 100, 'page': 1});
  if (res is Map<String, dynamic>) {
    final data = res['data'];
    if (data is List) return data;
  }
  return [];
});

// ── Screen ────────────────────────────────────────────────────────────────────

class LRListScreen extends ConsumerStatefulWidget {
  const LRListScreen({super.key});

  @override
  ConsumerState<LRListScreen> createState() => _LRListScreenState();
}

class _LRListScreenState extends ConsumerState<LRListScreen> {
  String _search = '';
  String _statusFilter = 'All';

  static const _statuses = ['All', 'draft', 'generated', 'in_transit', 'delivered', 'pod_received', 'cancelled'];

  @override
  Widget build(BuildContext context) {
    final lrsAsync = ref.watch(lrListProvider);
    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: AppBar(
        backgroundColor: KTColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          color: KTColors.textHeading,
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Lorry Receipts',
          style: KTTextStyles.h3.copyWith(
            color: KTColors.textHeading,
            decoration: TextDecoration.none,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 20),
            color: KTColors.textMuted,
            onPressed: () => ref.invalidate(lrListProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Search bar ──────────────────────────────────────────────────
          Container(
            color: KTColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              decoration: InputDecoration(
                hintText: 'Search LR number, consignor, consignee...',
                hintStyle: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted),
                prefixIcon: const Icon(Icons.search_rounded, size: 18, color: KTColors.textMuted),
                filled: true,
                fillColor: KTColors.lightBg,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: KTColors.borderColor),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: KTColors.borderColor),
                ),
              ),
              onChanged: (v) => setState(() => _search = v.toLowerCase()),
            ),
          ),

          // ── Status filter chips ─────────────────────────────────────────
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _statuses.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final s = _statuses[i];
                final selected = _statusFilter == s;
                return ChoiceChip(
                  label: Text(
                    s == 'All' ? 'All' : s.replaceAll('_', ' ').toUpperCase(),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: selected ? Colors.white : KTColors.textMuted,
                    ),
                  ),
                  selected: selected,
                  onSelected: (_) => setState(() => _statusFilter = s),
                  selectedColor: KTColors.primary,
                  backgroundColor: KTColors.surface,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  side: BorderSide(color: selected ? KTColors.primary : KTColors.borderColor),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                );
              },
            ),
          ),
          const SizedBox(height: 8),

          // ── LR list ─────────────────────────────────────────────────────
          Expanded(
            child: lrsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, color: KTColors.danger, size: 40),
                    const SizedBox(height: 10),
                    Text('Failed to load LRs', style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: () => ref.invalidate(lrListProvider),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
              data: (lrs) {
                final filtered = lrs.where((lr) {
                  final m = lr as Map<String, dynamic>;
                  if (_statusFilter != 'All' && (m['status'] ?? '') != _statusFilter) return false;
                  if (_search.isEmpty) return true;
                  return (m['lr_number'] ?? '').toString().toLowerCase().contains(_search) ||
                      (m['consignor_name'] ?? '').toString().toLowerCase().contains(_search) ||
                      (m['consignee_name'] ?? '').toString().toLowerCase().contains(_search) ||
                      (m['origin'] ?? '').toString().toLowerCase().contains(_search) ||
                      (m['destination'] ?? '').toString().toLowerCase().contains(_search);
                }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.receipt_long_outlined, size: 48, color: KTColors.textMuted),
                        const SizedBox(height: 12),
                        Text('No LRs found', style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
                      ],
                    ),
                  );
                }

                return RefreshIndicator(
                  onRefresh: () async => ref.invalidate(lrListProvider),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                    itemCount: filtered.length,
                    itemBuilder: (context, index) {
                      final lr = filtered[index] as Map<String, dynamic>;
                      return _LRCard(
                        lr: lr,
                        onPrint: () => _printLR(lr['id'], lr['lr_number']),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _printLR(dynamic lrId, dynamic lrNumber) async {
    if (lrId == null) return;
    try {
      final api = ref.read(apiServiceProvider);
      final resp = await api.get('/lrs/$lrId/pdf');
      final url = resp?['data']?['url'] ?? resp?['url'];
      if (url != null && url.toString().isNotEmpty) {
        final uri = Uri.parse(url.toString());
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
          return;
        }
      }
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open PDF. Try from the website.')),
      );
    }
  }
}

// ── LR Card ───────────────────────────────────────────────────────────────────

class _LRCard extends StatelessWidget {
  const _LRCard({required this.lr, required this.onPrint});
  final Map<String, dynamic> lr;
  final VoidCallback onPrint;

  @override
  Widget build(BuildContext context) {
    final status = lr['status'] as String? ?? 'draft';
    final lrNumber = lr['lr_number'] as String? ?? 'N/A';
    final origin = lr['origin'] as String? ?? '';
    final destination = lr['destination'] as String? ?? '';
    final consignee = lr['consignee_name'] as String? ?? '';
    final freight = lr['freight_amount'];
    final lrDate = lr['lr_date'] as String? ?? '';

    final (statusColor, statusLabel) = _statusInfo(status);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KTColors.borderColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(lrNumber,
                      style: KTTextStyles.body.copyWith(
                          fontWeight: FontWeight.w700, color: KTColors.primary)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(statusLabel,
                      style: TextStyle(
                          fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
                ),
                const SizedBox(width: 6),
                InkWell(
                  onTap: onPrint,
                  borderRadius: BorderRadius.circular(20),
                  child: const Padding(
                    padding: EdgeInsets.all(6),
                    child: Icon(Icons.print_rounded, size: 18, color: KTColors.primary),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.location_on_outlined, size: 14, color: KTColors.textMuted),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    origin.isNotEmpty && destination.isNotEmpty
                        ? '$origin → $destination'
                        : origin.isNotEmpty
                            ? origin
                            : destination,
                    style: KTTextStyles.bodySmall.copyWith(color: KTColors.textBody),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            if (consignee.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.business_outlined, size: 14, color: KTColors.textMuted),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(consignee,
                        style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted),
                        overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                if (freight != null) ...[
                  const Icon(Icons.currency_rupee_rounded, size: 13, color: KTColors.textMuted),
                  Text(
                    _fmt(freight),
                    style: KTTextStyles.bodySmall.copyWith(
                        fontWeight: FontWeight.w600, color: KTColors.textBody),
                  ),
                  const Spacer(),
                ],
                if (lrDate.isNotEmpty)
                  Text(lrDate,
                      style: KTTextStyles.labelSmall.copyWith(color: KTColors.textMuted)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _fmt(dynamic amount) {
    final v = double.tryParse(amount.toString()) ?? 0;
    if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
    return '₹${v.toStringAsFixed(0)}';
  }

  (Color, String) _statusInfo(String status) {
    return switch (status) {
      'draft' => (KTColors.textMuted, 'Draft'),
      'generated' => (KTColors.info, 'Generated'),
      'in_transit' => (KTColors.warning, 'In Transit'),
      'delivered' => (KTColors.success, 'Delivered'),
      'pod_received' => (KTColors.success, 'POD Received'),
      'cancelled' => (KTColors.danger, 'Cancelled'),
      _ => (KTColors.textMuted, status.replaceAll('_', ' ').toUpperCase()),
    };
  }
}
