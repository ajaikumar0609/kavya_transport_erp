import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/kt_colors.dart';
import '../../../core/theme/kt_text_styles.dart';
import '../../../providers/fleet_dashboard_provider.dart'; // apiServiceProvider

// â”€â”€â”€ Entity types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

enum _EntityType { driver, truck, employee, client }

extension _EntityTypeExt on _EntityType {
  String get label {
    switch (this) {
      case _EntityType.driver:   return 'Drivers';
      case _EntityType.truck:    return 'Trucks';
      case _EntityType.employee: return 'Employees';
      case _EntityType.client:   return 'Clients';
    }
  }

  String get endpoint {
    switch (this) {
      case _EntityType.driver:   return '/drivers';
      case _EntityType.truck:    return '/vehicles';
      case _EntityType.employee: return '/users';
      case _EntityType.client:   return '/clients';
    }
  }

  String get nameKey {
    switch (this) {
      case _EntityType.driver:   return 'name';
      case _EntityType.truck:    return 'registration_number';
      case _EntityType.employee: return 'name';
      case _EntityType.client:   return 'name';
    }
  }

  String get apiEntityType {
    switch (this) {
      case _EntityType.driver:   return 'driver';
      case _EntityType.truck:    return 'vehicle';
      case _EntityType.employee: return 'user';
      case _EntityType.client:   return 'client';
    }
  }

  IconData get icon {
    switch (this) {
      case _EntityType.driver:   return Icons.person_rounded;
      case _EntityType.truck:    return Icons.local_shipping_rounded;
      case _EntityType.employee: return Icons.badge_rounded;
      case _EntityType.client:   return Icons.business_rounded;
    }
  }
}

// â”€â”€â”€ Driver doc-type metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class _DriverDocMeta {
  final String   type;
  final String   label;
  final IconData icon;
  final Color    color;
  const _DriverDocMeta(this.type, this.label, this.icon, this.color);
}

const _driverDocTypes = [
  _DriverDocMeta('driving_license', 'Driving License',  Icons.credit_card_rounded,          Color(0xFF2563EB)),
  _DriverDocMeta('aadhaar_card',    'Aadhaar Card',     Icons.perm_identity_rounded,         Color(0xFF7C3AED)),
  _DriverDocMeta('pan_card',        'PAN Card',         Icons.account_balance_wallet_rounded, Color(0xFFD97706)),
  _DriverDocMeta('bank_passbook',   'Bank Passbook',    Icons.account_balance_rounded,       Color(0xFF059669)),
  _DriverDocMeta('medical_fitness', 'Medical Fitness',  Icons.medical_services_rounded,      Color(0xFFDC2626)),
  _DriverDocMeta('driver_badge',    'Driver Badge',     Icons.badge_rounded,                 Color(0xFF0891B2)),
];

class _VehicleDocMeta {
  final String   type;
  final String   label;
  final IconData icon;
  final Color    color;
  final bool     required;
  const _VehicleDocMeta(this.type, this.label, this.icon, this.color, {this.required = true});
}

const _vehicleDocTypes = [
  _VehicleDocMeta('rc',          'Registration Certificate (RC)', Icons.article_rounded,      Color(0xFF2563EB)),
  _VehicleDocMeta('insurance',   'Insurance Certificate',         Icons.security_rounded,     Color(0xFF7C3AED)),
  _VehicleDocMeta('fitness',     'Fitness Certificate',           Icons.verified_rounded,      Color(0xFF059669)),
  _VehicleDocMeta('puc',         'PUC Certificate',               Icons.eco_rounded,          Color(0xFF0891B2)),
  _VehicleDocMeta('permit',      'Permit',                        Icons.assignment_rounded,   Color(0xFFD97706), required: false),
  _VehicleDocMeta('tax_receipt', 'Road Tax Receipt',              Icons.receipt_long_rounded, Color(0xFFDC2626), required: false),
];


// --- Client doc-type metadata ---

class _ClientDocMeta {
  final String   type;
  final String   label;
  final IconData icon;
  final Color    color;
  final bool     required;
  const _ClientDocMeta(this.type, this.label, this.icon, this.color, {this.required = true});
}

const _clientDocTypes = [
  _ClientDocMeta('pan_card', 'PAN Card', Icons.credit_card_rounded, Color(0xFFD97706), required: false),
];
// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class AdminUploadDocScreen extends ConsumerStatefulWidget {
  const AdminUploadDocScreen({super.key});

  @override
  ConsumerState<AdminUploadDocScreen> createState() => _AdminUploadDocScreenState();
}

class _AdminUploadDocScreenState extends ConsumerState<AdminUploadDocScreen> {
  _EntityType?  _selectedType;
  List<dynamic> _members        = [];
  bool          _loadingMembers = false;
  String        _searchQuery    = '';
  dynamic       _selectedMember;
  List<dynamic> _docs           = [];
  bool          _loadingDocs    = false;
  // Per-docType upload loading (key = doc type string, or '__generic__' for others)
  final Map<String, bool> _uploading = {};

  int get _step {
    if (_selectedType == null)   return 1;
    if (_selectedMember == null) return 2;
    return 3;
  }

  // â”€â”€ Step 1 â†’ Step 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Future<void> _selectType(_EntityType type) async {
    setState(() {
      _selectedType   = type;
      _selectedMember = null;
      _members        = [];
      _searchQuery    = '';
      _loadingMembers = true;
    });
    try {
      final api = ref.read(apiServiceProvider);
      final res = await api.get(type.endpoint, queryParameters: {'limit': 200});
      final list = res is Map ? (res['data'] ?? res['items'] ?? []) : (res is List ? res : []);
      if (mounted) setState(() { _members = list as List; _loadingMembers = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingMembers = false);
    }
  }

  // â”€â”€ Step 2 â†’ Step 3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Future<void> _selectMember(dynamic member) async {
    setState(() { _selectedMember = member; _docs = []; _loadingDocs = true; });
    await _reloadDocs();
  }

  Future<void> _reloadDocs() async {
    if (!mounted) return;
    setState(() => _loadingDocs = true);
    try {
      final api = ref.read(apiServiceProvider);
      List<dynamic> list;
      if (_selectedType == _EntityType.driver) {
        list = await api.getDriverDocumentsAdmin(_selectedMember['id'] as int);
      } else if (_selectedType == _EntityType.truck) {
        list = await api.getVehicleDocumentsForAdmin(_selectedMember['id'] as int);
      } else if (_selectedType == _EntityType.client) {
        list = await api.getClientDocumentsForAdmin(_selectedMember['id'] as int);
      } else {
        final res = await api.get('/documents', queryParameters: {
          'entity_id':   _selectedMember['id'],
          'entity_type': _selectedType!.apiEntityType,
        });
        list = res is Map ? (res['data'] ?? res['items'] ?? []) as List : (res is List ? res : []);
      }
      if (mounted) setState(() { _docs = list; _loadingDocs = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingDocs = false);
    }
  }

  // â”€â”€ Upload driver document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Future<void> _pickAndUploadDriver(String docType) async {
    final source = await _pickSource();
    if (source == null) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 85);
    if (picked == null || !mounted) return;

    setState(() => _uploading[docType] = true);
    try {
      final api      = ref.read(apiServiceProvider);
      final driverId = _selectedMember['id'] as int;
      await api.uploadDriverDocumentForFleet(driverId, File(picked.path), docType);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Document uploaded successfully'),
            backgroundColor: KTColors.success));
        await _reloadDocs();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Upload failed: $e'), backgroundColor: KTColors.danger));
      }
    } finally {
      if (mounted) setState(() => _uploading[docType] = false);
    }
  }

  // â”€â”€ Upload generic document â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Future<void> _pickAndUploadGeneric() async {
    final source = await _pickSource();
    if (source == null) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 80);
    if (picked == null || !mounted) return;
    final docType = await _askDocType();
    if (docType == null || !mounted) return;

    setState(() => _uploading['__generic__'] = true);
    try {
      final api = ref.read(apiServiceProvider);
      await api.uploadDocument(File(picked.path), docType, _selectedMember['id'].toString());
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Document uploaded'), backgroundColor: KTColors.success));
        await _reloadDocs();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Upload failed: $e'), backgroundColor: KTColors.danger));
      }
    } finally {
      if (mounted) setState(() => _uploading['__generic__'] = false);
    }
  }

  Future<ImageSource?> _pickSource() => showModalBottomSheet<ImageSource>(
    context: context,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (_) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        Container(width: 36, height: 4,
            decoration: BoxDecoration(color: KTColors.borderColor,
                borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 8),
        ListTile(
          leading: const Icon(Icons.camera_alt_rounded, color: KTColors.primary),
          title: const Text('Camera'),
          onTap: () => Navigator.pop(context, ImageSource.camera),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_rounded, color: KTColors.primary),
          title: const Text('Gallery'),
          onTap: () => Navigator.pop(context, ImageSource.gallery),
        ),
        const SizedBox(height: 8),
      ],
    ),
  );

  Future<String?> _askDocType() {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Document Type'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'e.g. License, RC, Insurance'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: KTColors.primary),
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  // â”€â”€ Back navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  void _goBack() {
    if (_step == 3) {
      setState(() { _selectedMember = null; _docs = []; });
    } else if (_step == 2) {
      setState(() { _selectedType = null; _members = []; });
    }
  }

  // â”€â”€ Build â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == 1,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _step > 1) _goBack();
      },
      child: Scaffold(
        backgroundColor: KTColors.lightBg,
        appBar: AppBar(
          backgroundColor: KTColors.surface,
          elevation: 0,
          leading: BackButton(
            color: KTColors.textHeading,
            onPressed: _step > 1 ? _goBack : () => Navigator.of(context).pop(),
          ),
          title: Text(_appBarTitle,
              style: KTTextStyles.h2.copyWith(color: KTColors.textHeading)),
          actions: _step == 3
              ? [
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: KTColors.primary),
                    onPressed: _reloadDocs,
                    tooltip: 'Refresh',
                  )
                ]
              : null,
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(1),
            child: Container(height: 1, color: KTColors.borderColor),
          ),
        ),
        body: _buildBody(),
        floatingActionButton: (_step == 3 && _selectedType != _EntityType.driver && _selectedType != _EntityType.truck && _selectedType != _EntityType.client && _selectedType != _EntityType.employee)
            ? FloatingActionButton.extended(
                backgroundColor: KTColors.primary,
                onPressed: (_uploading['__generic__'] == true) ? null : _pickAndUploadGeneric,
                icon: const Icon(Icons.upload_file_rounded, color: Colors.white),
                label: const Text('Upload Doc',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
              )
            : null,
      ),
    );
  }

  String get _appBarTitle {
    if (_step == 1) return 'Upload Document';
    if (_step == 2) return _selectedType!.label;
    if (_selectedType == _EntityType.employee) {
      final fn = (_selectedMember?['first_name'] ?? '').toString();
      final ln = (_selectedMember?['last_name'] ?? '').toString();
      final n = [fn, ln].where((s) => s.isNotEmpty).join(' ');
      return n.isNotEmpty ? n : 'Employee';
    }
    final name = _selectedMember?[_selectedType!.nameKey] ??
        _selectedMember?['full_name'] ?? 'Member';
    return name.toString();
  }

  Widget _buildBody() {
    switch (_step) {
      case 1:  return _buildStep1();
      case 2:  return _buildStep2();
      default: return _buildStep3();
    }
  }

  // â”€â”€ Step 1 â€” entity type grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Widget _buildStep1() => GridView.count(
    padding: const EdgeInsets.all(20),
    crossAxisCount: 2,
    crossAxisSpacing: 16,
    mainAxisSpacing: 16,
    childAspectRatio: 1.2,
    children: _EntityType.values
        .map((t) => _EntityTile(type: t, onTap: () => _selectType(t)))
        .toList(),
  );

  // â”€â”€ Step 2 â€” member list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Widget _buildStep2() {
    if (_loadingMembers) return const Center(child: CircularProgressIndicator());
    final filtered = _members.where((m) {
      final name = (m[_selectedType!.nameKey] ?? m['full_name'] ?? '').toString().toLowerCase();
      return name.contains(_searchQuery.toLowerCase());
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v),
            decoration: InputDecoration(
              hintText: 'Search ${_selectedType!.label.toLowerCase()}...',
              prefixIcon: const Icon(Icons.search_rounded, color: KTColors.textMuted),
              filled: true,
              fillColor: KTColors.surface,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: KTColors.borderColor)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10),
                  borderSide: const BorderSide(color: KTColors.borderColor)),
            ),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const Center(child: Text('No members found',
                  style: TextStyle(color: KTColors.textMuted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final m    = filtered[i];
                    // For employees the API returns first_name + last_name, not a combined 'name'
                    String name;
                    if (_selectedType == _EntityType.employee) {
                      final fn = (m['first_name'] ?? '').toString();
                      final ln = (m['last_name'] ?? '').toString();
                      name = [fn, ln].where((s) => s.isNotEmpty).join(' ');
                      if (name.isEmpty) name = m['email']?.toString() ?? 'Unknown';
                    } else {
                      name = (m[_selectedType!.nameKey] ?? m['full_name'] ?? 'Unknown').toString();
                    }
                    final sub  = m['phone'] ?? m['mobile'] ?? m['email'] ?? '';
                    return ListTile(
                      tileColor: KTColors.surface,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                          side: const BorderSide(color: KTColors.borderColor)),
                      leading: CircleAvatar(
                        backgroundColor: KTColors.primary.withOpacity(0.12),
                        child: Icon(_selectedType!.icon, color: KTColors.primary, size: 20),
                      ),
                      title: Text(name.toString(),
                          style: KTTextStyles.body.copyWith(
                              color: KTColors.textHeading, fontWeight: FontWeight.w600)),
                      subtitle: sub.isNotEmpty
                          ? Text(sub.toString(),
                              style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted))
                          : null,
                      trailing: const Icon(Icons.chevron_right_rounded, color: KTColors.textMuted),
                      onTap: () => _selectMember(m),
                    );
                  },
                ),
        ),
      ],
    );
  }

  // â”€â”€ Step 3 â€” documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Widget _buildStep3() {
    if (_selectedType == _EntityType.employee) return _buildEmployeeDocs();
    if (_loadingDocs) return const Center(child: CircularProgressIndicator());
    if (_selectedType == _EntityType.driver) return _buildDriverDocs();
    if (_selectedType == _EntityType.truck)  return _buildVehicleDocs();
    if (_selectedType == _EntityType.client) return _buildClientDocs();
    return _buildGenericDocs();
  }

  // â”€â”€ Driver document checklist (matches website UI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Widget _buildDriverDocs() {
    final Map<String, Map<String, dynamic>> docMap = {};
    for (final d in _docs) {
      final t = ((d['doc_type'] ?? d['document_type'] ?? '') as String).toLowerCase();
      if (t.isNotEmpty) docMap.putIfAbsent(t, () => Map<String, dynamic>.from(d as Map));
    }
    return RefreshIndicator(
      onRefresh: _reloadDocs,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _buildDocSummary(docMap),
          const SizedBox(height: 20),
          ..._driverDocTypes.map((meta) => _buildDriverDocCard(meta, docMap[meta.type])),
        ],
      ),
    );
  }

  Widget _buildDocSummary(Map<String, Map<String, dynamic>> docMap) {
    final total    = _driverDocTypes.length;
    final uploaded = _driverDocTypes.where((m) {
      final d = docMap[m.type];
      return d != null && (d['file_url'] ?? '').toString().isNotEmpty;
    }).length;
    final missing = total - uploaded;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KTColors.borderColor),
      ),
      child: Row(
        children: [
          _SummaryChip(label: 'Total',    value: '$total',    color: KTColors.textMuted),
          const SizedBox(width: 12),
          _SummaryChip(label: 'Uploaded', value: '$uploaded', color: KTColors.success),
          const SizedBox(width: 12),
          _SummaryChip(
              label: 'Missing',
              value: '$missing',
              color: missing > 0 ? KTColors.danger : KTColors.textMuted),
        ],
      ),
    );
  }

  Widget _buildDriverDocCard(_DriverDocMeta meta, Map<String, dynamic>? doc) {
    final fileUrl    = (doc?['file_url'] ?? '').toString();
    final hasFile    = fileUrl.isNotEmpty;
    final docNumber  = (doc?['doc_number'] ?? doc?['document_number'] ?? '').toString();
    final uploadedAt = (doc?['uploaded_at'] ?? '').toString();
    final dateStr    = uploadedAt.length >= 10 ? uploadedAt.substring(0, 10) : uploadedAt;
    final isLoading  = _uploading[meta.type] == true;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: hasFile ? KTColors.borderColor : KTColors.textMuted.withAlpha(40),
        ),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            child: Row(
              children: [
                Container(
                  width: 44, height: 44,
                  decoration: BoxDecoration(
                    color: (hasFile ? meta.color : KTColors.textMuted).withAlpha(22),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(meta.icon,
                      color: hasFile ? meta.color : KTColors.textMuted, size: 22),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(meta.label,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: hasFile ? KTColors.textHeading : KTColors.textMuted,
                          )),
                      const SizedBox(height: 3),
                      if (!hasFile)
                        const Text('Not uploaded',
                            style: TextStyle(fontSize: 12, color: KTColors.textMuted))
                      else ...[
                        if (docNumber.isNotEmpty)
                          Text(docNumber,
                              style: const TextStyle(fontSize: 12, color: KTColors.textMuted,
                                  fontFamily: 'monospace')),
                        if (dateStr.isNotEmpty)
                          Text('Uploaded $dateStr',
                              style: const TextStyle(fontSize: 11.5, color: KTColors.textMuted)),
                      ],
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: hasFile
                        ? KTColors.success.withAlpha(22)
                        : KTColors.textMuted.withAlpha(20),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    hasFile ? 'UPLOADED' : 'MISSING',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: hasFile ? KTColors.success : KTColors.textMuted,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Action bar
          if (isLoading)
            const Padding(
              padding: EdgeInsets.only(bottom: 14),
              child: SizedBox(height: 24, width: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5)),
            )
          else ...[
            Container(height: 1, color: KTColors.borderColor.withAlpha(80)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: hasFile
                    ? [
                        Expanded(child: _ActionBtn(
                            icon: Icons.visibility_rounded, label: 'View',
                            color: KTColors.primary, onTap: () => _viewDocument(fileUrl))),
                        const SizedBox(width: 8),
                        Expanded(child: _ActionBtn(
                            icon: Icons.refresh_rounded, label: 'Replace',
                            color: KTColors.warning,
                            onTap: () => _pickAndUploadDriver(meta.type))),
                      ]
                    : [
                        Expanded(child: _ActionBtn(
                            icon: Icons.upload_rounded, label: 'Upload',
                            color: KTColors.success,
                            onTap: () => _pickAndUploadDriver(meta.type))),
                      ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  // â”€â”€ Document preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  void _viewDocument(String url) {
    if (url.isEmpty) return;
    if (url.startsWith('data:')) {
      _showDataUrlDialog(url);
      return;
    }
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Colors.black,
        insetPadding: const EdgeInsets.all(12),
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: _buildNetworkPreview(url),
            ),
            Positioned(
              top: 8, right: 8,
              child: Row(
                children: [
                  _OverlayBtn(
                    icon: Icons.open_in_new_rounded,
                    onTap: () async {
                      final uri = Uri.parse(url);
                      if (await canLaunchUrl(uri)) {
                        launchUrl(uri, mode: LaunchMode.externalApplication);
                      }
                    },
                  ),
                  const SizedBox(width: 6),
                  _OverlayBtn(
                    icon: Icons.close_rounded,
                    onTap: () => Navigator.pop(ctx),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showDataUrlDialog(String dataUrl) {
    try {
      final base64Data = dataUrl.contains(',') ? dataUrl.split(',')[1] : dataUrl;
      final bytes = base64Decode(base64Data);
      showDialog(
        context: context,
        builder: (ctx) => Dialog(
          backgroundColor: Colors.black,
          insetPadding: const EdgeInsets.all(12),
          child: Stack(
            children: [
              ClipRRect(borderRadius: BorderRadius.circular(8),
                  child: Image.memory(bytes, fit: BoxFit.contain)),
              Positioned(top: 8, right: 8,
                  child: _OverlayBtn(icon: Icons.close_rounded,
                      onTap: () => Navigator.pop(ctx))),
            ],
          ),
        ),
      );
    } catch (_) {}
  }

  Widget _buildNetworkPreview(String url) {
    return Image.network(
      url,
      fit: BoxFit.contain,
      loadingBuilder: (_, child, progress) {
        if (progress == null) return child;
        return const SizedBox(height: 200,
            child: Center(child: CircularProgressIndicator(color: Colors.white)));
      },
      errorBuilder: (_, __, ___) => _previewError(url),
    );
  }

  Widget _previewError(String url) {
    return Container(
      height: 200, color: Colors.black,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
          const SizedBox(height: 8),
          const Text('Preview unavailable',
              style: TextStyle(color: Colors.white54, fontSize: 13)),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () async {
              final uri = Uri.parse(url);
              if (await canLaunchUrl(uri)) launchUrl(uri, mode: LaunchMode.externalApplication);
            },
            child: const Text('Open in browser',
                style: TextStyle(color: Colors.lightBlueAccent)),
          ),
        ],
      ),
    );
  }

  // â”€â”€ Generic (non-driver) documents list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


  Future<void> _pickAndUploadVehicle(String docType) async {
    final source = await _pickSource();
    if (source == null) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 85);
    if (picked == null || !mounted) return;

    setState(() => _uploading[docType] = true);
    try {
      final api       = ref.read(apiServiceProvider);
      final vehicleId = _selectedMember['id'] as int;
      await api.uploadVehicleDocForAdmin(vehicleId, File(picked.path), docType);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Document uploaded successfully'),
            backgroundColor: KTColors.success));
        await _reloadDocs();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Upload failed: $e'), backgroundColor: KTColors.danger));
      }
    } finally {
      if (mounted) setState(() => _uploading[docType] = false);
    }
  }

  Widget _buildVehicleDocs() {
    final Map<String, Map<String, dynamic>> docMap = {};
    for (final d in _docs) {
      final t = ((d['document_type'] ?? d['doc_type'] ?? '') as String).toLowerCase();
      if (t.isNotEmpty) docMap.putIfAbsent(t, () => Map<String, dynamic>.from(d as Map));
    }
    final reqTypes = _vehicleDocTypes.where((m) => m.required).toList();
    final optTypes = _vehicleDocTypes.where((m) => !m.required).toList();
    return RefreshIndicator(
      onRefresh: _reloadDocs,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _buildVehicleDocSummary(docMap),
          const SizedBox(height: 20),
          _sectionHeader('Required Documents'),
          const SizedBox(height: 10),
          ...reqTypes.map((meta) => _buildVehicleDocCard(meta, docMap[meta.type])),
          const SizedBox(height: 8),
          _sectionHeader('Optional Documents'),
          const SizedBox(height: 10),
          ...optTypes.map((meta) => _buildVehicleDocCard(meta, docMap[meta.type])),
        ],
      ),
    );
  }

  Widget _sectionHeader(String text) => Padding(
    padding: const EdgeInsets.only(left: 2),
    child: Text(text, style: const TextStyle(
      fontSize: 13, fontWeight: FontWeight.w700,
      color: KTColors.textMuted, letterSpacing: 0.5,
    )),
  );

  Widget _buildVehicleDocSummary(Map<String, Map<String, dynamic>> docMap) {
    final total    = _vehicleDocTypes.length;
    final uploaded = _vehicleDocTypes.where((m) {
      final d = docMap[m.type];
      return d != null && (d['file_url'] ?? '').toString().isNotEmpty;
    }).length;
    final missing = total - uploaded;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KTColors.borderColor),
      ),
      child: Row(children: [
        _SummaryChip(label: 'Total',    value: '$total',    color: KTColors.textMuted),
        const SizedBox(width: 12),
        _SummaryChip(label: 'Uploaded', value: '$uploaded', color: KTColors.success),
        const SizedBox(width: 12),
        _SummaryChip(label: 'Missing',  value: '$missing',
            color: missing > 0 ? KTColors.danger : KTColors.textMuted),
      ]),
    );
  }

  Widget _buildVehicleDocCard(_VehicleDocMeta meta, Map<String, dynamic>? doc) {
    final fileUrl   = (doc?['file_url'] ?? '').toString();
    final hasFile   = fileUrl.isNotEmpty;
    final docNumber = (doc?['document_number'] ?? '').toString();
    final expiry    = (doc?['expiry_date'] ?? '').toString();
    final expiryStr = expiry.length >= 10 ? expiry.substring(0, 10) : expiry;
    final isLoading = _uploading[meta.type] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: hasFile ? KTColors.borderColor : KTColors.textMuted.withAlpha(40)),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: (hasFile ? meta.color : KTColors.textMuted).withAlpha(22),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(meta.icon,
                  color: hasFile ? meta.color : KTColors.textMuted, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(child: Text(meta.label, style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600,
                    color: hasFile ? KTColors.textHeading : KTColors.textMuted,
                  ))),
                  if (!meta.required)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: KTColors.textMuted.withAlpha(20),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text('Optional', style: TextStyle(
                          fontSize: 9, color: KTColors.textMuted,
                          fontWeight: FontWeight.w600)),
                    ),
                ]),
                const SizedBox(height: 3),
                if (!hasFile)
                  const Text('Not uploaded',
                      style: TextStyle(fontSize: 12, color: KTColors.textMuted))
                else ...[
                  if (docNumber.isNotEmpty)
                    Text(docNumber, style: const TextStyle(
                        fontSize: 12, color: KTColors.textMuted, fontFamily: 'monospace')),
                  if (expiryStr.isNotEmpty)
                    Text('Expires $expiryStr',
                        style: const TextStyle(fontSize: 11.5, color: KTColors.textMuted)),
                ],
              ],
            )),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: hasFile
                    ? KTColors.success.withAlpha(22)
                    : KTColors.textMuted.withAlpha(20),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                hasFile ? 'UPLOADED' : 'MISSING',
                style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w700,
                  color: hasFile ? KTColors.success : KTColors.textMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ]),
        ),
        if (isLoading)
          const Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: SizedBox(height: 24, width: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5)),
          )
        else ...[
          Container(height: 1, color: KTColors.borderColor.withAlpha(80)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: hasFile
                  ? [
                      Expanded(child: _ActionBtn(
                          icon: Icons.visibility_rounded, label: 'View',
                          color: KTColors.primary, onTap: () => _viewDocument(fileUrl))),
                      const SizedBox(width: 8),
                      Expanded(child: _ActionBtn(
                          icon: Icons.refresh_rounded, label: 'Replace',
                          color: KTColors.warning,
                          onTap: () => _pickAndUploadVehicle(meta.type))),
                    ]
                  : [
                      Expanded(child: _ActionBtn(
                          icon: Icons.upload_rounded, label: 'Upload',
                          color: KTColors.success,
                          onTap: () => _pickAndUploadVehicle(meta.type))),
                    ],
            ),
          ),
        ],
      ]),
    );
  }
  // ── Employee detail view (view-only, reads from /users/{id}) ──────────────────────────

  Widget _buildEmployeeDocs() {
    final userId = _selectedMember?['id']?.toString() ?? '';
    if (userId.isEmpty) return const Center(child: Text('Employee not found'));
    final api = ref.read(apiServiceProvider);
    return FutureBuilder<Map<String, dynamic>>(
      future: api.get('/users/$userId').then((r) {
        if (r is Map<String, dynamic> && r['data'] != null)
          return Map<String, dynamic>.from(r['data'] as Map);
        if (r is Map<String, dynamic>) return r;
        return <String, dynamic>{};
      }),
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator(color: KTColors.primary));
        }
        if (snap.hasError || snap.data == null || snap.data!.isEmpty) {
          return Center(child: Text('Failed to load employee\n${snap.error ?? ""}',
              textAlign: TextAlign.center,
              style: const TextStyle(color: KTColors.textMuted)));
        }
        return _buildEmployeeDetailBody(snap.data!);
      },
    );
  }

  Widget _buildEmployeeDetailBody(Map<String, dynamic> d) {
    final firstName = (d['first_name'] ?? '').toString();
    final lastName  = (d['last_name'] ?? '').toString();
    final name      = [firstName, lastName].where((s) => s.isNotEmpty).join(' ');
    final roles     = d['roles'] as List? ?? [];
    final roleDisplay = roles.isNotEmpty ? roles.first.toString() : '—';
    final email     = (d['email'] ?? '—').toString();
    final isActive  = d['is_active'] == true;
    final initials  = name.isNotEmpty
        ? name.substring(0, name.length.clamp(0, 2)).toUpperCase()
        : '?';

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: [
        // ── Profile header ──
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: const Color(0xFF1E2A3A),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color: KTColors.primary.withAlpha(50),
                shape: BoxShape.circle,
              ),
              child: Center(child: Text(initials,
                  style: const TextStyle(color: Colors.white,
                      fontWeight: FontWeight.bold, fontSize: 20))),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.isNotEmpty ? name : 'Unknown',
                    style: const TextStyle(color: Colors.white,
                        fontSize: 17, fontWeight: FontWeight.bold)),
                const SizedBox(height: 3),
                Text(email, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 6),
                Row(children: [
                  _empBadge(roleDisplay, KTColors.primary),
                  const SizedBox(width: 6),
                  _empBadge(isActive ? 'Active' : 'Inactive',
                      isActive ? KTColors.success : KTColors.danger),
                ]),
              ],
            )),
          ]),
        ),
        const SizedBox(height: 16),

        // ── Personal Information ──
        _empSection('PERSONAL INFORMATION', [
          _empRow('First Name', firstName.isNotEmpty ? firstName : '—'),
          _empRow('Last Name', lastName.isNotEmpty ? lastName : '—'),
          _empRow('Date of Birth', _empFmtDate(d['date_of_birth'])),
          _empRow('Gender', _empCap(d['gender'])),
          _empRow('Date of Joining', _empFmtDate(d['joining_date'])),
          _empRow('Employee ID', (d['employee_id'] ?? '—').toString()),
          _empRow('Address', (d['address'] ?? '—').toString()),
        ]),
        const SizedBox(height: 12),

        // ── Contact Details ──
        _empSection('CONTACT DETAILS', [
          _empRow('Email', email),
          _empRow('Phone', (d['phone'] ?? '—').toString()),
        ]),
        const SizedBox(height: 12),

        // ── Emergency Contact ──
        if ((d['emergency_contact_name'] ?? '').toString().isNotEmpty ||
            (d['emergency_contact_phone'] ?? '').toString().isNotEmpty) ...[
          _empSection('EMERGENCY CONTACT', [
            _empRow('Contact Name', (d['emergency_contact_name'] ?? '—').toString()),
            _empRow('Contact Phone', (d['emergency_contact_phone'] ?? '—').toString()),
          ], accentColor: const Color(0xFFFFF9E6), borderColor: const Color(0xFFFFDA6A)),
          const SizedBox(height: 12),
        ],

        // ── Role & Account ──
        _empSection('ROLE & ACCOUNT', [
          _empRow('Role', roleDisplay),
          _empRow('Status', isActive ? 'Active' : 'Inactive'),
          _empRow('Account Created', _empFmtDateFull(d['created_at'])),
        ]),
        const SizedBox(height: 12),

        // ── Bank Details ──
        if ((d['bank_account_holder'] ?? d['bank_name'] ?? d['account_number'] ?? '')
            .toString().isNotEmpty) ...[
          _empSection('BANK DETAILS', [
            _empRow('Account Holder', (d['bank_account_holder'] ?? '—').toString()),
            _empRow('Bank Name', (d['bank_name'] ?? '—').toString()),
            _empRow('Account Number', (d['account_number'] ?? '—').toString(), mono: true),
            _empRow('IFSC Code', (d['ifsc_code'] ?? '—').toString(), mono: true),
            _empRow('Account Type', _empCap(d['account_type'])),
            if ((d['upi_id'] ?? '').toString().isNotEmpty)
              _empRow('UPI ID', (d['upi_id'] ?? '—').toString()),
          ]),
          const SizedBox(height: 12),
        ],

        // ── Documents (view-only) ──
        _buildEmpDocSection(d),
      ],
    );
  }

  Widget _buildEmpDocSection(Map<String, dynamic> d) {
    final docs = <_EmpDocEntry>[];
    if ((d['aadhaar_file_url'] ?? d['aadhaar_file_name'] ?? '').toString().isNotEmpty)
      docs.add(_EmpDocEntry('Aadhaar Card',
          d['aadhaar_file_name']?.toString() ?? '',
          d['aadhaar_file_url']?.toString() ?? ''));
    if ((d['pan_file_url'] ?? d['pan_file_name'] ?? '').toString().isNotEmpty)
      docs.add(_EmpDocEntry('PAN Card',
          d['pan_file_name']?.toString() ?? '',
          d['pan_file_url']?.toString() ?? ''));
    if ((d['passbook_file_url'] ?? d['passbook_file_name'] ?? '').toString().isNotEmpty)
      docs.add(_EmpDocEntry('Bank Passbook / Statement',
          d['passbook_file_name']?.toString() ?? '',
          d['passbook_file_url']?.toString() ?? ''));
    if ((d['dl_file_url'] ?? d['dl_file_name'] ?? '').toString().isNotEmpty) {
      final dlSub = [
        if ((d['dl_number'] ?? '').toString().isNotEmpty) d['dl_number'].toString(),
        if ((d['dl_expiry_date'] ?? '').toString().isNotEmpty)
          'Exp: ${d['dl_expiry_date']}',
      ].join(' · ');
      docs.add(_EmpDocEntry('Driving License',
          dlSub.isNotEmpty ? dlSub : (d['dl_file_name']?.toString() ?? ''),
          d['dl_file_url']?.toString() ?? ''));
    }

    return Container(
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KTColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Text('DOCUMENTS',
                style: TextStyle(color: KTColors.primary, fontSize: 11,
                    fontWeight: FontWeight.w700, letterSpacing: 0.8)),
          ),
          if (docs.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 4, 16, 18),
              child: Text('No documents uploaded.',
                  style: TextStyle(color: KTColors.textMuted, fontSize: 13)),
            )
          else
            ...docs.map((doc) => Column(children: [
              const Divider(height: 1, color: KTColors.borderColor, indent: 16),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(children: [
                  Container(
                    width: 38, height: 38,
                    decoration: BoxDecoration(
                      color: KTColors.primary.withAlpha(18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.description_rounded,
                        color: KTColors.primary, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(doc.label, style: const TextStyle(
                          color: KTColors.textHeading, fontSize: 13,
                          fontWeight: FontWeight.w600)),
                      if (doc.subtitle.isNotEmpty)
                        Text(doc.subtitle, style: const TextStyle(
                            color: KTColors.textMuted, fontSize: 11),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  )),
                  if (doc.url.isNotEmpty)
                    TextButton.icon(
                      style: TextButton.styleFrom(
                        foregroundColor: KTColors.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8),
                            side: const BorderSide(color: KTColors.borderColor)),
                        backgroundColor: KTColors.lightBg,
                      ),
                      icon: const Icon(Icons.open_in_new_rounded, size: 14),
                      label: const Text('View File', style: TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600)),
                      onPressed: () async {
                        final uri = Uri.parse(doc.url);
                        await launchUrl(uri, mode: LaunchMode.externalApplication);
                      },
                    )
                  else
                    const Text('Not uploaded',
                        style: TextStyle(color: KTColors.textMuted, fontSize: 11)),
                ]),
              ),
            ])),
        ],
      ),
    );
  }

  // ── Employee detail helpers ───────────────────────────────────────────────────────────

  Widget _empBadge(String text, Color color) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: color.withAlpha(50),
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(text, style: TextStyle(
        color: color, fontSize: 10, fontWeight: FontWeight.w600)),
  );

  Widget _empSection(String title, List<Widget> rows,
      {Color? accentColor, Color? borderColor}) {
    return Container(
      decoration: BoxDecoration(
        color: accentColor ?? KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: borderColor ?? KTColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Text(title, style: const TextStyle(
                color: KTColors.primary, fontSize: 11,
                fontWeight: FontWeight.w700, letterSpacing: 0.8)),
          ),
          ...rows.map((row) => Column(children: [
            const Divider(height: 1, color: KTColors.borderColor, indent: 16),
            row,
          ])),
        ],
      ),
    );
  }

  Widget _empRow(String label, String value, {bool mono = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 130, child: Text(label, style: const TextStyle(
            color: KTColors.textMuted, fontSize: 12, fontWeight: FontWeight.w500))),
        Expanded(child: Text(value, style: TextStyle(
            color: KTColors.textHeading, fontSize: 13, fontWeight: FontWeight.w600,
            fontFamily: mono ? 'monospace' : null))),
      ]),
    );
  }

  String _empCap(dynamic val) {
    if (val == null || val.toString().isEmpty) return '—';
    final s = val.toString();
    return s[0].toUpperCase() + s.substring(1);
  }

  String _empFmtDate(dynamic val) {
    if (val == null || val.toString().isEmpty) return '—';
    try {
      final dt = DateTime.parse(val.toString());
      const m = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day.toString().padLeft(2,'0')} ${m[dt.month]} ${dt.year}';
    } catch (_) { return val.toString(); }
  }

  String _empFmtDateFull(dynamic val) {
    if (val == null || val.toString().isEmpty) return '—';
    try {
      final dt = DateTime.parse(val.toString());
      const m = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day.toString().padLeft(2,'0')} ${m[dt.month]} ${dt.year}, '
          '${dt.hour.toString().padLeft(2,'0')}:${dt.minute.toString().padLeft(2,'0')}';
    } catch (_) { return val.toString(); }
  }

  // ── Client doc methods ─────────────────────────────────────────────────────────────────

  Future<void> _pickAndUploadClient(String docType) async {
    final source = await _pickSource();
    if (source == null) return;
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 85);
    if (picked == null || !mounted) return;

    setState(() => _uploading[docType] = true);
    try {
      final api      = ref.read(apiServiceProvider);
      final clientId = _selectedMember['id'] as int;
      await api.uploadClientDocForAdmin(clientId, File(picked.path), docType);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Document uploaded successfully'),
            backgroundColor: KTColors.success));
        await _reloadDocs();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text('Upload failed: $e'), backgroundColor: KTColors.danger));
      }
    } finally {
      if (mounted) setState(() => _uploading[docType] = false);
    }
  }

  Widget _buildClientDocs() {
    final Map<String, Map<String, dynamic>> docMap = {};
    final List<Map<String, dynamic>> otherDocs = [];
    final knownTypes = _clientDocTypes.map((m) => m.type).toSet();
    for (final d in _docs) {
      final t = ((d['document_type'] ?? d['doc_type'] ?? '') as String).toLowerCase();
      if (knownTypes.contains(t)) {
        docMap.putIfAbsent(t, () => Map<String, dynamic>.from(d as Map));
      } else {
        otherDocs.add(Map<String, dynamic>.from(d as Map));
      }
    }
    final reqTypes = _clientDocTypes.where((m) => m.required).toList();
    final optTypes = _clientDocTypes.where((m) => !m.required).toList();
    return RefreshIndicator(
      onRefresh: _reloadDocs,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          _buildClientInfoCard(),
          const SizedBox(height: 16),
          _buildClientDocSummary(docMap),
          const SizedBox(height: 20),
          _sectionHeader('Required Documents'),
          const SizedBox(height: 10),
          ...reqTypes.map((meta) => _buildClientDocCard(meta, docMap[meta.type])),
          const SizedBox(height: 8),
          _sectionHeader('Optional Documents'),
          const SizedBox(height: 10),
          ...optTypes.map((meta) => _buildClientDocCard(meta, docMap[meta.type])),
          ..._buildClientOtherDocs(otherDocs),
        ],
      ),
    );
  }

  Widget _buildClientInfoCard() {
    final name     = (_selectedMember?['name'] ?? '').toString();
    final gstin    = (_selectedMember?['gstin'] ?? '').toString();
    final pan      = (_selectedMember?['pan'] ?? '').toString();
    final phone    = (_selectedMember?['phone'] ?? '').toString();
    final email    = (_selectedMember?['email'] ?? '').toString();
    final city     = (_selectedMember?['city'] ?? '').toString();
    final state    = (_selectedMember?['state'] ?? '').toString();
    final location = [city, state].where((s) => s.isNotEmpty).join(', ');
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KTColors.borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42, height: 42,
                decoration: BoxDecoration(
                  color: KTColors.primary.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.business_rounded, color: KTColors.primary, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w700,
                        color: KTColors.textHeading)),
                    if (location.isNotEmpty)
                      Text(location, style: const TextStyle(
                          fontSize: 12, color: KTColors.textMuted)),
                  ],
                ),
              ),
            ],
          ),
          if (gstin.isNotEmpty || pan.isNotEmpty) ...[
            const SizedBox(height: 12),
            const Divider(height: 1, color: KTColors.borderColor),
            const SizedBox(height: 12),
            Wrap(
              spacing: 16,
              runSpacing: 8,
              children: [
                if (gstin.isNotEmpty)
                  _clientInfoChip(Icons.receipt_long_rounded, 'GSTIN', gstin),
                if (pan.isNotEmpty)
                  _clientInfoChip(Icons.credit_card_rounded, 'PAN', pan),
              ],
            ),
          ],
          if (phone.isNotEmpty || email.isNotEmpty) ...[
            const SizedBox(height: 8),
            if (phone.isNotEmpty) _clientInfoRow(Icons.phone_rounded, phone),
            if (email.isNotEmpty) _clientInfoRow(Icons.email_rounded, email),
          ],
        ],
      ),
    );
  }

  Widget _clientInfoChip(IconData icon, String label, String value) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 13, color: KTColors.textMuted),
      const SizedBox(width: 4),
      Text('$label: ', style: const TextStyle(fontSize: 11, color: KTColors.textMuted)),
      Text(value, style: const TextStyle(
          fontSize: 11, color: KTColors.textHeading,
          fontWeight: FontWeight.w600, fontFamily: 'monospace')),
    ],
  );

  Widget _clientInfoRow(IconData icon, String value) => Padding(
    padding: const EdgeInsets.only(top: 4),
    child: Row(
      children: [
        Icon(icon, size: 13, color: KTColors.textMuted),
        const SizedBox(width: 6),
        Flexible(child: Text(value,
            style: const TextStyle(fontSize: 12, color: KTColors.textMuted))),
      ],
    ),
  );

  Widget _buildClientDocSummary(Map<String, Map<String, dynamic>> docMap) {
    final total    = _clientDocTypes.length;
    final uploaded = _clientDocTypes.where((m) {
      final d = docMap[m.type];
      return d != null && (d['file_url'] ?? '').toString().isNotEmpty;
    }).length;
    final missing = total - uploaded;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: KTColors.borderColor),
      ),
      child: Row(children: [
        _SummaryChip(label: 'Total',    value: '$total',    color: KTColors.textMuted),
        const SizedBox(width: 12),
        _SummaryChip(label: 'Uploaded', value: '$uploaded', color: KTColors.success),
        const SizedBox(width: 12),
        _SummaryChip(label: 'Missing',  value: '$missing',
            color: missing > 0 ? KTColors.danger : KTColors.textMuted),
      ]),
    );
  }

  Widget _buildClientDocCard(_ClientDocMeta meta, Map<String, dynamic>? doc) {
    final fileUrl   = (doc?['file_url'] ?? '').toString();
    final hasFile   = fileUrl.isNotEmpty;
    final docNumber = (doc?['document_number'] ?? '').toString();
    final createdAt = (doc?['created_at'] ?? '').toString();
    final dateStr   = createdAt.length >= 10 ? createdAt.substring(0, 10) : createdAt;
    final isLoading = _uploading[meta.type] == true;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
            color: hasFile ? KTColors.borderColor : KTColors.textMuted.withAlpha(40)),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          child: Row(children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(
                color: (hasFile ? meta.color : KTColors.textMuted).withAlpha(22),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(meta.icon,
                  color: hasFile ? meta.color : KTColors.textMuted, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(child: Text(meta.label, style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600,
                    color: hasFile ? KTColors.textHeading : KTColors.textMuted,
                  ))),
                  if (!meta.required)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: KTColors.textMuted.withAlpha(20),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text('Optional', style: TextStyle(
                          fontSize: 9, color: KTColors.textMuted,
                          fontWeight: FontWeight.w600)),
                    ),
                ]),
                const SizedBox(height: 3),
                if (!hasFile)
                  const Text('Not uploaded',
                      style: TextStyle(fontSize: 12, color: KTColors.textMuted))
                else ...[
                  if (docNumber.isNotEmpty)
                    Text(docNumber, style: const TextStyle(
                        fontSize: 12, color: KTColors.textMuted, fontFamily: 'monospace')),
                  if (dateStr.isNotEmpty)
                    Text('Uploaded $dateStr',
                        style: const TextStyle(fontSize: 11.5, color: KTColors.textMuted)),
                ],
              ],
            )),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: hasFile
                    ? KTColors.success.withAlpha(22)
                    : KTColors.textMuted.withAlpha(20),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                hasFile ? 'UPLOADED' : 'MISSING',
                style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w700,
                  color: hasFile ? KTColors.success : KTColors.textMuted,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ]),
        ),
        if (isLoading)
          const Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: SizedBox(height: 24, width: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5)),
          )
        else if (hasFile) ...[
          Container(height: 1, color: KTColors.borderColor.withAlpha(80)),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              children: [
                Expanded(child: _ActionBtn(
                    icon: Icons.visibility_rounded, label: 'View',
                    color: KTColors.primary, onTap: () => _viewDocument(fileUrl))),
                const SizedBox(width: 8),
                Expanded(child: _ActionBtn(
                    icon: Icons.refresh_rounded, label: 'Replace',
                    color: KTColors.warning,
                    onTap: () => _pickAndUploadClient(meta.type))),
              ],
            ),
          ),
        ],
      ]),
    );
  }

  List<Widget> _buildClientOtherDocs(List<Map<String, dynamic>> otherDocs) {
    if (otherDocs.isEmpty) return [];
    return [
      const SizedBox(height: 8),
      _sectionHeader('Other Documents'),
      const SizedBox(height: 10),
      ...otherDocs.map((doc) {
        final title   = (doc['title'] ?? doc['file_name'] ?? '').toString();
        final type    = (doc['document_type'] ?? 'OTHER').toString();
        final date    = (doc['created_at'] ?? '').toString();
        final dateStr = date.length >= 10 ? date.substring(0, 10) : date;
        final fileUrl = (doc['file_url'] ?? '').toString();
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          decoration: BoxDecoration(
            color: KTColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: KTColors.borderColor),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            leading: Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: KTColors.primary.withOpacity(0.10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.description_rounded,
                  color: KTColors.primary, size: 20),
            ),
            title: Text(title.isNotEmpty ? title : type,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                    color: KTColors.textHeading)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Type: $type',
                    style: const TextStyle(fontSize: 11, color: KTColors.textMuted)),
                if (dateStr.isNotEmpty)
                  Text('Uploaded $dateStr',
                      style: const TextStyle(fontSize: 11, color: KTColors.textMuted)),
              ],
            ),
            trailing: fileUrl.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.open_in_new_rounded,
                        color: KTColors.primary, size: 20),
                    onPressed: () async {
                      final uri = Uri.parse(fileUrl);
                      await launchUrl(uri,
                          mode: LaunchMode.externalApplication);
                    })
                : null,
          ),
        );
      }),
    ];
  }

  Widget _buildGenericDocs() {
    if (_docs.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.folder_open_rounded, color: KTColors.textMuted, size: 56),
            const SizedBox(height: 12),
            Text('No documents uploaded yet',
                style: KTTextStyles.body.copyWith(color: KTColors.textMuted)),
            const SizedBox(height: 80),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
      itemCount: _docs.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final doc     = _docs[i];
        final type    = doc['document_type'] ?? doc['doc_type'] ?? 'Document';
        final date    = (doc['created_at'] ?? doc['uploaded_at'] ?? '').toString();
        final dateStr = date.length >= 10 ? date.substring(0, 10) : '';
        final fileUrl = (doc['file_url'] ?? '').toString();
        return ListTile(
          tileColor: KTColors.surface,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10),
              side: const BorderSide(color: KTColors.borderColor)),
          leading: Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
              color: KTColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.description_rounded, color: KTColors.primary, size: 22),
          ),
          title: Text(type.toString(),
              style: KTTextStyles.body.copyWith(
                  color: KTColors.textHeading, fontWeight: FontWeight.w600)),
          subtitle: dateStr.isNotEmpty
              ? Text('Uploaded $dateStr',
                  style: KTTextStyles.bodySmall.copyWith(color: KTColors.textMuted))
              : null,
          trailing: fileUrl.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.open_in_new_rounded, color: KTColors.primary, size: 20),
                  onPressed: () async {
                    final uri = Uri.parse(fileUrl);
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  })
              : const Icon(Icons.open_in_new_rounded, color: KTColors.textMuted, size: 18),
        );
      },
    );
  }
}

// â”€â”€â”€ Summary chip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// --- Employee doc entry ---

class _EmpDocEntry {
  final String label;
  final String subtitle;
  final String url;
  const _EmpDocEntry(this.label, this.subtitle, this.url);
}

class _SummaryChip extends StatelessWidget {
  final String label;
  final String value;
  final Color  color;
  const _SummaryChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
        Text(label, style: const TextStyle(fontSize: 11, color: KTColors.textMuted)),
      ],
    );
  }
}

// â”€â”€â”€ Action button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class _ActionBtn extends StatelessWidget {
  final IconData     icon;
  final String       label;
  final Color        color;
  final VoidCallback onTap;
  const _ActionBtn({required this.icon, required this.label,
      required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color.withAlpha(22),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, color: color, size: 16),
              const SizedBox(width: 5),
              Text(label,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
            ],
          ),
        ),
      ),
    );
  }
}

// â”€â”€â”€ Overlay close/open button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class _OverlayBtn extends StatelessWidget {
  final IconData     icon;
  final VoidCallback onTap;
  const _OverlayBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black54,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

// â”€â”€â”€ Entity tile widget â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class _EntityTile extends StatelessWidget {
  final _EntityType  type;
  final VoidCallback onTap;
  const _EntityTile({required this.type, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: KTColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: KTColors.borderColor),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color: KTColors.primary.withOpacity(0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(type.icon, color: KTColors.primary, size: 26),
            ),
            const SizedBox(height: 10),
            Text(type.label,
                style: KTTextStyles.body.copyWith(
                    color: KTColors.textHeading, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
