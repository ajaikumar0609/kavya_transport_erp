import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../providers/fleet_dashboard_provider.dart';
import '../../core/localization/locale_provider.dart';

class DriverVehicleScreen extends ConsumerStatefulWidget {
  const DriverVehicleScreen({super.key});

  @override
  ConsumerState<DriverVehicleScreen> createState() => _DriverVehicleScreenState();
}

class _DriverVehicleScreenState extends ConsumerState<DriverVehicleScreen> {
  bool _loading = true;
  String? _error;
  Map<String, dynamic>? _vehicle;
  Map<String, dynamic>? _trip;
  List<dynamic> _documents = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiServiceProvider);
      final data = await api.getMyVehicle();
      if (data == null) {
        setState(() { _vehicle = null; _loading = false; });
        return;
      }
      setState(() {
        _vehicle = data['vehicle'] as Map<String, dynamic>?;
        _trip = data['trip'] as Map<String, dynamic>?;
        _documents = (data['documents'] as List<dynamic>?) ?? [];
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = 'Failed to load vehicle details'; _loading = false; });
    }
  }

  static const _docMeta = <String, _DocDisplay>{
    'rc_book': _DocDisplay('RC Book', Icons.menu_book_outlined, KTColors.info),
    'insurance': _DocDisplay('Vehicle Insurance', Icons.shield_outlined, KTColors.success),
    'pollution_certificate': _DocDisplay('Pollution Certificate', Icons.eco_outlined, Color(0xFF8B5CF6)),
    'fitness_certificate': _DocDisplay('Fitness Certificate', Icons.health_and_safety_outlined, KTColors.danger),
  };

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(sProvider);
    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: AppBar(
        backgroundColor: KTColors.surface,
        surfaceTintColor: Colors.transparent,
        title: Text(
          s.myVehicle,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: KTColors.textHeading, letterSpacing: 0.3),
        ),
        iconTheme: const IconThemeData(color: KTColors.textHeading),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: KTColors.driverAccent))
          : _error != null
              ? _buildError()
              : _vehicle == null
                  ? _buildNoVehicle()
                  : RefreshIndicator(
                      color: KTColors.driverAccent,
                      backgroundColor: KTColors.surface,
                      onRefresh: _loadData,
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 20, 16, 32),
                        children: [
                          _buildVehicleHeader(),
                          const SizedBox(height: 16),
                          _buildTripCard(),
                          const SizedBox(height: 24),
                          // Section title
                          Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: Text(
                              s.vehicleDocuments,
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: KTColors.textHeading),
                            ),
                          ),
                          ..._buildDocumentCards(),
                        ],
                      ),
                    ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.error_outline, size: 48, color: KTColors.danger.withAlpha(180)),
          const SizedBox(height: 12),
          Text(_error!, style: const TextStyle(color: KTColors.textMuted, fontSize: 14)),
          const SizedBox(height: 16),
          TextButton.icon(
            onPressed: _loadData,
            icon: const Icon(Icons.refresh, size: 18),
            label: const Text('Retry'),
            style: TextButton.styleFrom(foregroundColor: KTColors.driverAccent),
          ),
        ],
      ),
    );
  }

  Widget _buildNoVehicle() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: KTColors.surface,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(Icons.local_shipping_outlined, size: 40, color: KTColors.textMuted),
            ),
            const SizedBox(height: 20),
            const Text(
              'No Vehicle Assigned',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: KTColors.textHeading),
            ),
            const SizedBox(height: 8),
            const Text(
              'A vehicle will appear here once the admin allocates a trip to you.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13.5, color: KTColors.textMuted, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVehicleHeader() {
    final regNo = _vehicle?['registration_number'] ?? '—';
    final type = _vehicle?['vehicle_type'] ?? '';
    final make = _vehicle?['make'] ?? '';
    final model = _vehicle?['model'] ?? '';
    final fuel = _vehicle?['fuel_type'] ?? '';

    final subtitle = [
      if (type.toString().isNotEmpty) type.toString().replaceAll('_', ' '),
      if (make.toString().isNotEmpty || model.toString().isNotEmpty)
        '$make $model'.trim(),
    ].where((s) => s.isNotEmpty).join('  •  ');

    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [KTColors.lightBg, KTColors.surface],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: KTColors.driverAccent.withAlpha(50)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            // Vehicle icon
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: KTColors.driverAccent.withAlpha(25),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.local_shipping_rounded, color: KTColors.driverAccent, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    regNo,
                    style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: KTColors.textHeading,
                      letterSpacing: 1.2,
                      fontFamily: 'monospace',
                    ),
                  ),
                  if (subtitle.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: const TextStyle(fontSize: 12.5, color: KTColors.textMuted),
                    ),
                  ],
                  if (fuel.toString().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: KTColors.info.withAlpha(20),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        fuel.toString().toUpperCase(),
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: KTColors.info, letterSpacing: 0.8),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTripCard() {
    if (_trip == null) return const SizedBox.shrink();
    final tripNo = _trip!['trip_number'] ?? '';
    final origin = _trip!['origin'] ?? '';
    final dest = _trip!['destination'] ?? '';
    final status = _trip!['status'] ?? '';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: KTColors.borderColor.withAlpha(100)),
      ),
      child: Row(
        children: [
          Icon(Icons.route_outlined, size: 20, color: KTColors.driverAccent.withAlpha(200)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tripNo,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: KTColors.textHeading),
                ),
                const SizedBox(height: 3),
                Text(
                  '$origin → $dest',
                  style: const TextStyle(fontSize: 12, color: KTColors.textMuted),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: _tripStatusColor(status).withAlpha(25),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              status.toString().replaceAll('_', ' '),
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _tripStatusColor(status), letterSpacing: 0.5),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildDocumentCards() {
    // Show all 4 expected types, marking missing ones
    final docMap = <String, Map<String, dynamic>>{};
    for (final d in _documents) {
      if (d is Map<String, dynamic>) {
        final type = d['document_type'] as String?;
        if (type != null) docMap[type] = d;
      }
    }

    final orderedTypes = ['rc_book', 'insurance', 'pollution_certificate', 'fitness_certificate'];
    return orderedTypes.map((type) {
      final meta = _docMeta[type] ?? _DocDisplay(type.replaceAll('_', ' ').split(' ').map((w) => '${w[0].toUpperCase()}${w.substring(1)}').join(' '), Icons.description_outlined, KTColors.textMuted);
      final doc = docMap[type];
      return _buildSingleDocCard(meta, doc);
    }).toList();
  }

  Widget _buildSingleDocCard(_DocDisplay meta, Map<String, dynamic>? doc) {
    final bool hasDoc = doc != null;
    final verified = doc?['is_verified'] == true;
    final expiryStr = doc?['expiry_date'] as String?;
    final docNumber = doc?['document_number'] as String?;

    // Calculate expiry status
    _ExpiryStatus expiryStatus = _ExpiryStatus.none;
    String expiryLabel = '';
    if (expiryStr != null) {
      try {
        final expiry = DateTime.parse(expiryStr);
        final now = DateTime.now();
        final diff = expiry.difference(now).inDays;
        if (diff < 0) {
          expiryStatus = _ExpiryStatus.expired;
          expiryLabel = 'Expired ${-diff}d ago';
        } else if (diff <= 30) {
          expiryStatus = _ExpiryStatus.expiringSoon;
          expiryLabel = 'Expires in ${diff}d';
        } else {
          expiryStatus = _ExpiryStatus.valid;
          expiryLabel = 'Valid till ${_formatDate(expiryStr)}';
        }
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: !hasDoc
              ? KTColors.textMuted.withAlpha(40)
              : expiryStatus == _ExpiryStatus.expired
                  ? KTColors.danger.withAlpha(60)
                  : expiryStatus == _ExpiryStatus.expiringSoon
                      ? KTColors.warning.withAlpha(60)
                      : KTColors.borderColor,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            // Icon
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: (hasDoc ? meta.color : KTColors.textMuted).withAlpha(22),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(meta.icon, color: hasDoc ? meta.color : KTColors.textMuted, size: 22),
            ),
            const SizedBox(width: 14),
            // Info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    meta.label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: hasDoc ? KTColors.textHeading : KTColors.textMuted,
                      letterSpacing: 0.2,
                    ),
                  ),
                  const SizedBox(height: 3),
                  if (!hasDoc)
                    const Text('Not available', style: TextStyle(fontSize: 12, color: KTColors.textMuted))
                  else ...[
                    if (docNumber != null && docNumber.isNotEmpty)
                      Text(
                        docNumber,
                        style: const TextStyle(fontSize: 12, color: KTColors.textMuted, fontFamily: 'monospace'),
                      ),
                    if (expiryLabel.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        expiryLabel,
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w500,
                          color: expiryStatus == _ExpiryStatus.expired
                              ? KTColors.danger
                              : expiryStatus == _ExpiryStatus.expiringSoon
                                  ? KTColors.warning
                                  : KTColors.success,
                        ),
                      ),
                    ],
                  ],
                ],
              ),
            ),
            // Status badge
            if (hasDoc)
              _expiryBadge(expiryStatus, verified)
            else
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: KTColors.textMuted.withAlpha(20),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'N/A',
                  style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: KTColors.textMuted, letterSpacing: 0.5),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _expiryBadge(_ExpiryStatus status, bool verified) {
    Color color;
    String text;
    IconData icon;
    switch (status) {
      case _ExpiryStatus.expired:
        color = KTColors.danger;
        text = 'EXPIRED';
        icon = Icons.warning_amber_rounded;
        break;
      case _ExpiryStatus.expiringSoon:
        color = KTColors.warning;
        text = 'EXPIRING';
        icon = Icons.schedule;
        break;
      case _ExpiryStatus.valid:
        color = verified ? KTColors.success : KTColors.driverAccent;
        text = verified ? 'VALID' : 'PENDING';
        icon = verified ? Icons.check_circle : Icons.schedule;
        break;
      case _ExpiryStatus.none:
        color = KTColors.textMuted;
        text = '—';
        icon = Icons.help_outline;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withAlpha(22),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color.withAlpha(220)),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color, letterSpacing: 0.5),
          ),
        ],
      ),
    );
  }

  Color _tripStatusColor(String status) {
    switch (status.toUpperCase()) {
      case 'STARTED': return KTColors.info;
      case 'IN_TRANSIT': return KTColors.driverAccent;
      case 'LOADING': case 'UNLOADING': return KTColors.warning;
      case 'COMPLETED': return KTColors.success;
      default: return KTColors.textMuted;
    }
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}/${dt.year}';
    } catch (_) {
      return iso;
    }
  }
}

class _DocDisplay {
  final String label;
  final IconData icon;
  final Color color;
  const _DocDisplay(this.label, this.icon, this.color);
}

enum _ExpiryStatus { none, valid, expiringSoon, expired }
