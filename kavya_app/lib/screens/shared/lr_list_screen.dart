import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../providers/fleet_dashboard_provider.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final lrListProvider =
    FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  // Backend route prefix is /lr (singular) — fleet LRs only
  final res = await api.get('/lr', queryParameters: {'limit': 200, 'page': 1});
  if (res is Map<String, dynamic>) {
    final data = res['data'];
    if (data is List) return data;
    if (data is Map && data['items'] is List) return data['items'] as List;
  }
  return [];
});

final marketTripsLRProvider =
    FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res =
      await api.get('/market-trips', queryParameters: {'limit': 500, 'page': 1});
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
  // 'All' | 'fleet' | 'market'
  String _tripFilter = 'All';

  @override
  Widget build(BuildContext context) {
    final lrsAsync = ref.watch(lrListProvider);
    final marketAsync = ref.watch(marketTripsLRProvider);

    // Combine loading state
    final isLoading =
        lrsAsync.isLoading || (_tripFilter != 'fleet' && marketAsync.isLoading);

    // Build the combined + filtered list
    List<Map<String, dynamic>> _buildRows() {
      final fleetRows = lrsAsync.valueOrNull
              ?.map((e) => {...(e as Map<String, dynamic>), '_kind': 'fleet'})
              .toList() ??
          [];
      final marketRows = marketAsync.valueOrNull
              ?.map((e) => {...(e as Map<String, dynamic>), '_kind': 'market'})
              .toList() ??
          [];

      List<Map<String, dynamic>> rows;
      if (_tripFilter == 'fleet') {
        rows = fleetRows;
      } else if (_tripFilter == 'market') {
        rows = marketRows;
      } else {
        rows = [...fleetRows, ...marketRows];
      }

      if (_search.isEmpty) return rows;
      return rows.where((m) {
        final s = _search;
        return (m['lr_number'] ?? '').toString().toLowerCase().contains(s) ||
            (m['consignor_name'] ?? '').toString().toLowerCase().contains(s) ||
            (m['consignee_name'] ?? '').toString().toLowerCase().contains(s) ||
            (m['origin'] ?? '').toString().toLowerCase().contains(s) ||
            (m['destination'] ?? '').toString().toLowerCase().contains(s) ||
            (m['vehicle_registration'] ?? '').toString().toLowerCase().contains(s) ||
            (m['driver_name'] ?? '').toString().toLowerCase().contains(s);
      }).toList();
    }

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
            onPressed: () {
              ref.invalidate(lrListProvider);
              ref.invalidate(marketTripsLRProvider);
            },
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

          // ── Trip type tabs ──────────────────────────────────────────────
          Container(
            color: KTColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: [
                _tripTab('All', Icons.list_rounded),
                const SizedBox(width: 8),
                _tripTab('fleet', Icons.local_shipping_rounded),
                const SizedBox(width: 8),
                _tripTab('market', Icons.handshake_outlined),
              ],
            ),
          ),
          const SizedBox(height: 4),

          // ── LR list ─────────────────────────────────────────────────────
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator())
                : Builder(builder: (_) {
                    // Show error only when the relevant provider has an error
                    final hasFleetError = _tripFilter != 'market' && lrsAsync.hasError;
                    final hasMarketError = _tripFilter != 'fleet' && marketAsync.hasError;
                    if (hasFleetError || hasMarketError) {
                      final err = hasFleetError ? lrsAsync.error : marketAsync.error;
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.error_outline, color: KTColors.danger, size: 40),
                            const SizedBox(height: 10),
                            Text('Failed to load LRs',
                                style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
                            const SizedBox(height: 4),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 32),
                              child: Text(err.toString(),
                                  style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted),
                                  textAlign: TextAlign.center),
                            ),
                            const SizedBox(height: 8),
                            TextButton(
                              onPressed: () {
                                ref.invalidate(lrListProvider);
                                ref.invalidate(marketTripsLRProvider);
                              },
                              child: const Text('Retry'),
                            ),
                          ],
                        ),
                      );
                    }

                    final filtered = _buildRows();

                    if (filtered.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.receipt_long_outlined, size: 48, color: KTColors.textMuted),
                            const SizedBox(height: 12),
                            Text('No LRs found',
                                style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
                          ],
                        ),
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: () async {
                        ref.invalidate(lrListProvider);
                        ref.invalidate(marketTripsLRProvider);
                      },
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                        itemCount: filtered.length,
                        itemBuilder: (context, index) {
                          final lr = filtered[index];
                          final kind = lr['_kind'] as String? ?? 'fleet';
                          return _LRCard(
                            lr: lr,
                            // Market trips don't have their own PDF — hide print/download
                            onPrint: kind == 'market'
                                ? null
                                : () => _printLR(lr['id'], lr['lr_number']),
                            onDownload: kind == 'market'
                                ? null
                                : () => _downloadLR(lr['id'], lr['lr_number']),
                          );
                        },
                      ),
                    );
                  }),
          ),
        ],
      ),
    );
  }

  // Build a single trip-type tab pill
  Widget _tripTab(String filter, IconData icon) {
    final selected = _tripFilter == filter;
    final label = filter == 'All'
        ? 'All'
        : filter == 'fleet'
            ? 'Fleet Trip'
            : 'Market Trip';
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _tripFilter = filter),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: selected ? KTColors.primary : KTColors.lightBg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: selected ? KTColors.primary : KTColors.borderColor),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 14,
                  color: selected ? Colors.white : KTColors.textMuted),
              const SizedBox(width: 5),
              Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color:
                          selected ? Colors.white : KTColors.textMuted)),
            ],
          ),
        ),
      ),
    );
  }

  /// Print LR — downloads PDF and opens the OS share/print sheet so the user
  /// can choose WhatsApp, Gmail, a print app, etc.
  Future<void> _printLR(dynamic lrId, dynamic lrNumber) async {
    if (lrId == null) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      const SnackBar(
          content: Text('Preparing PDF…'),
          duration: Duration(seconds: 3)),
    );
    try {
      final api = ref.read(apiServiceProvider);
      final bytes = await api.downloadBytes('/lr/$lrId/pdf/download');
      if (bytes.isEmpty) throw Exception('Empty PDF');

      final dir = await getTemporaryDirectory();
      final safeNum = (lrNumber ?? lrId).toString().replaceAll('/', '-');
      final file = File('${dir.path}/$safeNum.pdf');
      await file.writeAsBytes(bytes, flush: true);

      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'application/pdf')],
          text: 'Lorry Receipt: $safeNum',
        ),
      );
    } catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
              content: Text(
                  'Could not prepare PDF: ${e.toString().split(':').first}')),
        );
      }
    }
  }

  /// Download LR PDF — saves directly to the device Downloads folder without
  /// showing the share sheet.
  Future<void> _downloadLR(dynamic lrId, dynamic lrNumber) async {
    if (lrId == null) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      const SnackBar(
          content: Text('Downloading PDF…'),
          duration: Duration(seconds: 3)),
    );
    try {
      final api = ref.read(apiServiceProvider);
      final bytes = await api.downloadBytes('/lr/$lrId/pdf/download');
      if (bytes.isEmpty) throw Exception('Empty PDF');

      final safeNum = (lrNumber ?? lrId).toString().replaceAll('/', '-');

      // Try the public Downloads directory first (Android)
      Directory saveDir;
      if (Platform.isAndroid) {
        final downloadsDir = Directory('/storage/emulated/0/Download');
        saveDir = (await downloadsDir.exists()) ? downloadsDir : await getApplicationDocumentsDirectory();
      } else {
        saveDir = await getApplicationDocumentsDirectory();
      }

      final file = File('${saveDir.path}/$safeNum.pdf');
      await file.writeAsBytes(bytes, flush: true);

      if (mounted) {
        messenger.clearSnackBars();
        messenger.showSnackBar(
          SnackBar(
            content: Text('Saved: ${file.path.split('/').last}'),
            backgroundColor: KTColors.success,
            duration: const Duration(seconds: 4),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        messenger.showSnackBar(
          SnackBar(
              content: Text(
                  'Download failed: ${e.toString().split(':').first}')),
        );
      }
    }
  }
}

// ── LR Card ───────────────────────────────────────────────────────────────────

class _LRCard extends StatelessWidget {
  const _LRCard(
      {required this.lr, required this.onPrint, required this.onDownload});
  final Map<String, dynamic> lr;
  final VoidCallback? onPrint;   // null for market trips
  final VoidCallback? onDownload; // null for market trips

  @override
  Widget build(BuildContext context) {
    final kind = lr['_kind'] as String? ?? 'fleet';
    final isMarket = kind == 'market';

    final status = lr['status'] as String? ?? 'draft';

    // For fleet LRs use lr_number; for market trips use "Job #<id>"
    final lrNumber = isMarket
        ? (lr['job_id'] != null ? 'Job #${lr['job_id']}' : '#${lr['id']}')
        : (lr['lr_number'] as String? ?? 'N/A');

    final origin = lr['origin'] as String? ?? '';
    final destination = lr['destination'] as String? ?? '';

    // Fleet: consignor/consignee | Market: vehicle/driver as primary info
    final consignorName = isMarket
        ? (lr['vehicle_registration'] as String? ?? '')
        : (lr['consignor_name'] as String? ?? '');
    final consigneeName = isMarket
        ? (lr['driver_name'] as String? ?? '')
        : (lr['consignee_name'] as String? ?? '');

    final vehicleReg = lr['vehicle_registration'] as String? ?? '';
    final driverName = lr['driver_name'] as String? ?? '';
    final driverPhone = lr['driver_phone'] as String? ?? '';

    // Market trips use client_rate as freight
    final totalFreight = isMarket
        ? lr['client_rate']
        : (lr['total_freight'] ?? lr['freight_amount']);

    final lrDate = (lr['lr_date'] ?? lr['trip_date'] ?? lr['created_at'] ?? '') as String;
    final jobNumber = lr['job_number'] as String? ?? '';
    final ewb = lr['eway_bill_number'] as String? ?? '';
    final paymentMode = (lr['payment_mode'] as String? ?? '')
        .replaceAll('_', ' ')
        .toUpperCase();

    final (statusColor, statusLabel) = _statusInfo(status);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isMarket
              ? KTColors.warning.withValues(alpha: 0.4)
              : KTColors.borderColor,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          // ── Header ───────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
            child: Row(
              children: [
                // Kind badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    color: isMarket
                        ? KTColors.warning.withValues(alpha: 0.15)
                        : KTColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    isMarket ? 'MARKET' : 'FLEET',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: isMarket ? KTColors.warning : KTColors.primary,
                    ),
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(lrNumber,
                          style: KTTextStyles.body.copyWith(
                              fontWeight: FontWeight.w700,
                              color: KTColors.primary)),
                      if (!isMarket && jobNumber.isNotEmpty)
                        Text('Job: $jobNumber',
                            style: KTTextStyles.labelSmall
                                .copyWith(color: KTColors.textMuted)),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(statusLabel,
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: statusColor)),
                ),
                // Only show print/download for fleet LRs
                if (onPrint != null) ...[
                  const SizedBox(width: 4),
                  IconButton(
                    onPressed: onPrint,
                    icon: const Icon(Icons.print_rounded,
                        size: 20, color: KTColors.primary),
                    tooltip: 'Print LR',
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                  ),
                ],
                if (onDownload != null) ...[
                  const SizedBox(width: 2),
                  IconButton(
                    onPressed: onDownload,
                    icon: const Icon(Icons.download_rounded,
                        size: 20, color: KTColors.success),
                    tooltip: 'Download LR',
                    padding: const EdgeInsets.all(4),
                    constraints: const BoxConstraints(),
                  ),
                ],
              ],
            ),
          ),

          // ── Route ────────────────────────────────────────────────────────
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 14),
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: KTColors.primary.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(Icons.trip_origin_rounded,
                    size: 13, color: KTColors.primary),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(origin.isNotEmpty ? origin : '—',
                      style: KTTextStyles.bodySmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: KTColors.textHeading),
                      overflow: TextOverflow.ellipsis),
                ),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Icon(Icons.arrow_forward_rounded,
                      size: 14, color: KTColors.textMuted),
                ),
                Expanded(
                  child: Text(destination.isNotEmpty ? destination : '—',
                      style: KTTextStyles.bodySmall.copyWith(
                          fontWeight: FontWeight.w600,
                          color: KTColors.textHeading),
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right),
                ),
                const SizedBox(width: 6),
                const Icon(Icons.location_on_rounded,
                    size: 13, color: KTColors.success),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // ── Consignor / Consignee row (fleet) or Vehicle / Driver row (market) ───
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                Expanded(
                    child: _chip(
                        isMarket
                            ? Icons.local_shipping_outlined
                            : Icons.person_outline_rounded,
                        isMarket ? 'Vehicle' : 'Consignor',
                        consignorName)),
                const SizedBox(width: 8),
                Expanded(
                    child: _chip(
                        isMarket
                            ? Icons.badge_outlined
                            : Icons.person_pin_outlined,
                        isMarket ? 'Driver' : 'Consignee',
                        isMarket && driverPhone.isNotEmpty
                            ? '$consigneeName  •  $driverPhone'
                            : consigneeName)),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // ── Vehicle / Driver row (fleet only) ──────────────────────────────
          if (!isMarket && (vehicleReg.isNotEmpty || driverName.isNotEmpty)) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  if (vehicleReg.isNotEmpty)
                    Expanded(
                        child: _chip(Icons.local_shipping_outlined,
                            'Vehicle', vehicleReg)),
                  if (vehicleReg.isNotEmpty && driverName.isNotEmpty)
                    const SizedBox(width: 8),
                  if (driverName.isNotEmpty)
                    Expanded(
                        child: _chip(
                            Icons.badge_outlined,
                            'Driver',
                            driverPhone.isNotEmpty
                                ? '$driverName  •  $driverPhone'
                                : driverName)),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],

          // ── Footer ────────────────────────────────────────────────────────
          Container(
            margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: KTColors.lightBg,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total Freight',
                        style: KTTextStyles.labelSmall
                            .copyWith(color: KTColors.textMuted, fontSize: 9)),
                    Text(_fmtAmount(totalFreight),
                        style: KTTextStyles.body.copyWith(
                            fontWeight: FontWeight.w700,
                            color: KTColors.textHeading,
                            fontSize: 13)),
                  ],
                ),
                const Spacer(),
                if (ewb.isNotEmpty) ...[
                  _badge('EWB', KTColors.success),
                  const SizedBox(width: 6),
                ],
                if (paymentMode.isNotEmpty) ...[
                  _badge(paymentMode, KTColors.info),
                  const SizedBox(width: 6),
                ],
                if (lrDate.isNotEmpty)
                  Text(lrDate,
                      style: KTTextStyles.labelSmall
                          .copyWith(color: KTColors.textMuted)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 13, color: KTColors.textMuted),
        const SizedBox(width: 4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: KTTextStyles.labelSmall.copyWith(
                      color: KTColors.textMuted, fontSize: 9)),
              Text(value.isNotEmpty ? value : '—',
                  style: KTTextStyles.bodySmall.copyWith(
                      color: KTColors.textBody,
                      fontWeight: FontWeight.w600,
                      fontSize: 11),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 2),
            ],
          ),
        ),
      ],
    );
  }

  Widget _badge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(text,
          style: TextStyle(
              fontSize: 9, fontWeight: FontWeight.w700, color: color)),
    );
  }

  String _fmtAmount(dynamic amount) {
    if (amount == null) return '₹0';
    final v = double.tryParse(amount.toString()) ?? 0;
    if (v >= 100000) return '₹${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000) return '₹${(v / 1000).toStringAsFixed(1)}K';
    return '₹${v.toStringAsFixed(0)}';
  }

  (Color, String) _statusInfo(String status) {
    return switch (status) {
      'draft' => (KTColors.textMuted, 'DRAFT'),
      'generated' => (KTColors.info, 'GENERATED'),
      'in_transit' => (KTColors.warning, 'IN TRANSIT'),
      'delivered' => (KTColors.success, 'DELIVERED'),
      'pod_received' => (KTColors.success, 'POD RECEIVED'),
      'cancelled' => (KTColors.danger, 'CANCELLED'),
      _ => (KTColors.textMuted, status.replaceAll('_', ' ').toUpperCase()),
    };
  }
}
