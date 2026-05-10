import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/kt_colors.dart';
import '../../../providers/fleet_dashboard_provider.dart';
import '../providers/admin_providers.dart';

final _employeeDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
        (ref, userId) async {
  final api = ref.read(apiServiceProvider);
  final response = await api.get('/users/$userId');
  if (response is Map<String, dynamic> && response['data'] != null) {
    return Map<String, dynamic>.from(response['data'] as Map);
  }
  if (response is Map<String, dynamic>) return response;
  return {};
});

class AdminEmployeeDetailScreen extends ConsumerWidget {
  final String userId;
  const AdminEmployeeDetailScreen({super.key, required this.userId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(_employeeDetailProvider(userId));

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: Container(
          color: KTColors.surface,
          child: SafeArea(
            bottom: false,
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: KTColors.borderColor)),
              ),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_rounded,
                        color: KTColors.textHeading, size: 22),
                    onPressed: () => context.pop(),
                  ),
                  const Expanded(
                    child: Text('Employee Details',
                        style: TextStyle(
                            color: KTColors.textHeading,
                            fontSize: 17,
                            fontWeight: FontWeight.w600)),
                  ),
                  detail.whenOrNull(
                    data: (d) {
                      final isActive = d['is_active'] == true;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: (isActive ? KTColors.success : KTColors.danger)
                                .withAlpha(20),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            isActive ? 'Active' : 'Inactive',
                            style: TextStyle(
                              color: isActive ? KTColors.success : KTColors.danger,
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      );
                    },
                  ) ??
                      const SizedBox.shrink(),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded,
                        color: KTColors.primary, size: 20),
                    onPressed: () =>
                        ref.invalidate(_employeeDetailProvider(userId)),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: detail.when(
        data: (d) {
          if (d.isEmpty) {
            return const Center(
                child: Text('Employee not found',
                    style: TextStyle(color: KTColors.textMuted)));
          }
          return _buildBody(context, ref, d);
        },
        loading: () => const Center(
            child: CircularProgressIndicator(color: KTColors.primary)),
        error: (e, _) => Center(
            child: Text('Error: $e',
                style: const TextStyle(color: KTColors.textMuted))),
      ),
    );
  }

  Widget _buildBody(
      BuildContext context, WidgetRef ref, Map<String, dynamic> d) {
    final firstName = (d['first_name'] ?? '').toString();
    final lastName = (d['last_name'] ?? '').toString();
    final name =
        [firstName, lastName].where((s) => s.isNotEmpty).join(' ');
    final roles = d['roles'] as List? ?? [];
    final roleDisplay =
        roles.isNotEmpty ? roles.first.toString() : '—';
    final email = (d['email'] ?? '—').toString();
    final isActive = d['is_active'] == true;
    final initials = name.isNotEmpty
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
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: KTColors.primary.withAlpha(50),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(initials,
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 20)),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name.isNotEmpty ? name : 'Unknown',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 17,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 3),
                    Text(email,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12)),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: isActive
                            ? KTColors.success.withAlpha(50)
                            : KTColors.danger.withAlpha(50),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        isActive ? '● Active' : '● Inactive',
                        style: TextStyle(
                            color: isActive
                                ? KTColors.success
                                : KTColors.danger,
                            fontSize: 11,
                            fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // ── Personal Information ──
        _buildSection('PERSONAL INFORMATION', [
          _row('First Name', firstName.isNotEmpty ? firstName : '—'),
          _row('Last Name', lastName.isNotEmpty ? lastName : '—'),
          _row('Date of Birth',
              _fmtDate(d['date_of_birth'], dateOnly: true)),
          _row('Gender', _cap(d['gender'])),
          _row('Date of Joining',
              _fmtDate(d['joining_date'], dateOnly: true)),
          _row('Employee ID',
              (d['employee_id'] ?? '—').toString()),
          _row('Address', (d['address'] ?? '—').toString()),
        ]),
        const SizedBox(height: 12),

        // ── Contact Details ──
        _buildSection('CONTACT DETAILS', [
          _row('Email', email),
          _row('Phone', (d['phone'] ?? '—').toString()),
        ]),
        const SizedBox(height: 12),

        // ── Emergency Contact ──
        if ((d['emergency_contact_name'] ?? '').toString().isNotEmpty ||
            (d['emergency_contact_phone'] ?? '')
                .toString()
                .isNotEmpty) ...[
          _buildSection(
            'EMERGENCY CONTACT',
            [
              _row('Contact Name',
                  (d['emergency_contact_name'] ?? '—').toString()),
              _row('Contact Phone',
                  (d['emergency_contact_phone'] ?? '—').toString()),
            ],
            accentColor: const Color(0xFFFFF9E6),
            borderColor: const Color(0xFFFFDA6A),
          ),
          const SizedBox(height: 12),
        ],

        // ── Role & Account ──
        _buildSection('ROLE & ACCOUNT', [
          _row('Role', roleDisplay),
          _row('Status', isActive ? 'Active' : 'Inactive'),
          _row('Account Created', _fmtDate(d['created_at'])),
          if (d['last_login'] != null)
            _row('Last Login', _fmtDate(d['last_login'])),
        ]),
        const SizedBox(height: 12),

        // ── Bank Details ──
        if (_hasBankDetails(d)) ...[
          _buildSection('BANK DETAILS', [
            _row('Account Holder',
                (d['bank_account_holder'] ?? '—').toString()),
            _row('Bank Name', (d['bank_name'] ?? '—').toString()),
            _row('Account Number',
                (d['account_number'] ?? '—').toString(),
                mono: true),
            _row('IFSC Code',
                (d['ifsc_code'] ?? '—').toString(),
                mono: true),
            _row('Account Type', _cap(d['account_type'])),
            if ((d['upi_id'] ?? '').toString().isNotEmpty)
              _row('UPI ID', (d['upi_id'] ?? '—').toString()),
          ]),
          const SizedBox(height: 12),
        ],

        // ── Documents ──
        _buildDocumentsSection(context, d),
        const SizedBox(height: 20),

        // ── Admin Actions ──
        _sectionLabel('ADMIN ACTIONS'),
        const SizedBox(height: 8),
        _actionBtn('Edit Role', Icons.admin_panel_settings_rounded,
            KTColors.amber600,
            () => _showEditRole(context, ref, d, roleDisplay)),
        const SizedBox(height: 8),
        _actionBtn(
          isActive
              ? 'Deactivate Employee'
              : 'Reactivate Employee',
          isActive
              ? Icons.block_rounded
              : Icons.check_circle_outline_rounded,
          isActive ? KTColors.danger : KTColors.success,
          () => _toggleActive(context, ref, d, isActive),
        ),
      ],
    );
  }

  bool _hasBankDetails(Map<String, dynamic> d) =>
      (d['bank_account_holder'] ?? '').toString().isNotEmpty ||
      (d['bank_name'] ?? '').toString().isNotEmpty ||
      (d['account_number'] ?? '').toString().isNotEmpty;

  Widget _buildSection(String title, List<Widget> rows,
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
            child: Text(title,
                style: const TextStyle(
                    color: KTColors.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8)),
          ),
          ...rows.map((row) => Column(children: [
                const Divider(
                    height: 1,
                    color: KTColors.borderColor,
                    indent: 16),
                row,
              ])),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool mono = false}) {
    return Padding(
      padding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label,
                style: const TextStyle(
                    color: KTColors.textMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(
                    color: KTColors.textHeading,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    fontFamily: mono ? 'monospace' : null)),
          ),
        ],
      ),
    );
  }

  Widget _buildDocumentsSection(
      BuildContext context, Map<String, dynamic> d) {
    final docs = <_DocEntry>[];
    if ((d['aadhaar_file_url'] ?? d['aadhaar_file_name'] ?? '')
        .toString()
        .isNotEmpty) {
      docs.add(_DocEntry(
          'Aadhaar Card',
          d['aadhaar_file_name']?.toString() ?? '',
          d['aadhaar_file_url']?.toString() ?? ''));
    }
    if ((d['pan_file_url'] ?? d['pan_file_name'] ?? '')
        .toString()
        .isNotEmpty) {
      docs.add(_DocEntry(
          'PAN Card',
          d['pan_file_name']?.toString() ?? '',
          d['pan_file_url']?.toString() ?? ''));
    }
    if ((d['passbook_file_url'] ?? d['passbook_file_name'] ?? '')
        .toString()
        .isNotEmpty) {
      docs.add(_DocEntry(
          'Bank Passbook / Statement',
          d['passbook_file_name']?.toString() ?? '',
          d['passbook_file_url']?.toString() ?? ''));
    }
    if ((d['dl_file_url'] ?? d['dl_file_name'] ?? '')
        .toString()
        .isNotEmpty) {
      final dlSub = [
        if ((d['dl_number'] ?? '').toString().isNotEmpty)
          d['dl_number'].toString(),
        if ((d['dl_expiry_date'] ?? '').toString().isNotEmpty)
          'Exp: ${d['dl_expiry_date']}',
      ].join(' · ');
      docs.add(_DocEntry(
          'Driving License',
          dlSub.isNotEmpty
              ? dlSub
              : (d['dl_file_name']?.toString() ?? ''),
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
                style: TextStyle(
                    color: KTColors.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8)),
          ),
          if (docs.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 8, 16, 20),
              child: Text('No documents uploaded.',
                  style: TextStyle(
                      color: KTColors.textMuted, fontSize: 13)),
            )
          else
            ...docs.map((doc) => Column(children: [
                  const Divider(
                      height: 1,
                      color: KTColors.borderColor,
                      indent: 16),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    child: Row(children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: KTColors.primary.withAlpha(18),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.description_rounded,
                            color: KTColors.primary, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text(doc.label,
                                style: const TextStyle(
                                    color: KTColors.textHeading,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600)),
                            if (doc.subtitle.isNotEmpty)
                              Text(doc.subtitle,
                                  style: const TextStyle(
                                      color: KTColors.textMuted,
                                      fontSize: 11),
                                  maxLines: 1,
                                  overflow:
                                      TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      if (doc.url.isNotEmpty)
                        TextButton.icon(
                          style: TextButton.styleFrom(
                            foregroundColor: KTColors.primary,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 6),
                            shape: RoundedRectangleBorder(
                                borderRadius:
                                    BorderRadius.circular(8),
                                side: const BorderSide(
                                    color: KTColors.borderColor)),
                            backgroundColor: KTColors.lightBg,
                          ),
                          icon: const Icon(
                              Icons.open_in_new_rounded,
                              size: 14),
                          label: const Text('View File',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600)),
                          onPressed: () =>
                              _viewDocument(context, doc.url),
                        )
                      else
                        const Text('Not uploaded',
                            style: TextStyle(
                                color: KTColors.textMuted,
                                fontSize: 11)),
                    ]),
                  ),
                ])),
        ],
      ),
    );
  }

  void _viewDocument(BuildContext context, String url) {
    if (url.isEmpty) return;
    if (url.startsWith('data:')) {
      _showDataUrlDialog(context, url);
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
              child: Image.network(
                url,
                fit: BoxFit.contain,
                loadingBuilder: (_, child, progress) {
                  if (progress == null) return child;
                  return const SizedBox(
                      height: 200,
                      child: Center(
                          child: CircularProgressIndicator(
                              color: Colors.white)));
                },
                errorBuilder: (_, __, ___) =>
                    _previewError(ctx, url),
              ),
            ),
            Positioned(
              top: 8,
              right: 8,
              child: Row(children: [
                _overlayBtn(Icons.open_in_new_rounded, () async {
                  final uri = Uri.parse(url);
                  if (await canLaunchUrl(uri)) {
                    launchUrl(uri,
                        mode: LaunchMode.externalApplication);
                  }
                }),
                const SizedBox(width: 6),
                _overlayBtn(Icons.close_rounded,
                    () => Navigator.pop(ctx)),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  void _showDataUrlDialog(BuildContext context, String dataUrl) {
    try {
      final base64Data =
          dataUrl.contains(',') ? dataUrl.split(',')[1] : dataUrl;
      final bytes = base64Decode(base64Data);
      showDialog(
        context: context,
        builder: (ctx) => Dialog(
          backgroundColor: Colors.black,
          insetPadding: const EdgeInsets.all(12),
          child: Stack(children: [
            ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(bytes, fit: BoxFit.contain)),
            Positioned(
                top: 8,
                right: 8,
                child: _overlayBtn(
                    Icons.close_rounded, () => Navigator.pop(ctx))),
          ]),
        ),
      );
    } catch (_) {}
  }

  Widget _previewError(BuildContext ctx, String url) {
    return Container(
      height: 200,
      color: Colors.black,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.broken_image_outlined,
              color: Colors.white54, size: 48),
          const SizedBox(height: 8),
          const Text('Preview unavailable',
              style:
                  TextStyle(color: Colors.white54, fontSize: 13)),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () async {
              final uri = Uri.parse(url);
              if (await canLaunchUrl(uri)) {
                launchUrl(uri,
                    mode: LaunchMode.externalApplication);
              }
            },
            child: const Text('Open in browser',
                style:
                    TextStyle(color: Colors.lightBlueAccent)),
          ),
        ],
      ),
    );
  }

  Widget _overlayBtn(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(20)),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _sectionLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text,
            style: const TextStyle(
                color: KTColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8)),
      );

  Widget _actionBtn(
      String label, IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        decoration: BoxDecoration(
          color: color.withAlpha(15),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: color.withAlpha(40)),
        ),
        child: Row(children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 10),
          Text(label,
              style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w600,
                  fontSize: 14)),
        ]),
      ),
    );
  }

  String _cap(dynamic val) {
    if (val == null || val.toString().isEmpty) return '—';
    final s = val.toString();
    return s[0].toUpperCase() + s.substring(1);
  }

  String _fmtDate(dynamic val, {bool dateOnly = false}) {
    if (val == null || val.toString().isEmpty) return '—';
    try {
      final dt = DateTime.parse(val.toString());
      const months = [
        '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      if (dateOnly) {
        return '${dt.day.toString().padLeft(2, '0')} '
            '${months[dt.month]} ${dt.year}';
      }
      return '${dt.day.toString().padLeft(2, '0')} '
          '${months[dt.month]} ${dt.year}, '
          '${dt.hour.toString().padLeft(2, '0')}:'
          '${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return val.toString();
    }
  }

  void _toggleActive(BuildContext context, WidgetRef ref,
      Map<String, dynamic> d, bool isActive) {
    final fn = (d['first_name'] ?? '').toString();
    final ln = (d['last_name'] ?? '').toString();
    final name = [fn, ln].where((s) => s.isNotEmpty).join(' ');
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: KTColors.surface,
        title: Text(
            isActive ? 'Deactivate $name?' : 'Reactivate $name?',
            style: const TextStyle(color: KTColors.textHeading)),
        content: Text(
            isActive
                ? 'They will be logged out immediately.'
                : 'They will regain access.',
            style: const TextStyle(color: KTColors.textMuted)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final api = ref.read(apiServiceProvider);
              try {
                await api.put('/users/$userId',
                    data: {'is_active': !isActive});
                ref.invalidate(_employeeDetailProvider(userId));
                ref.invalidate(adminEmployeesProvider);
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                          content: Text(isActive
                              ? 'Deactivated'
                              : 'Reactivated')));
                }
              } catch (_) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                          content: Text('Failed to update')));
                }
              }
            },
            child: Text(
                isActive ? 'Deactivate' : 'Reactivate',
                style: TextStyle(
                    color: isActive
                        ? KTColors.danger
                        : KTColors.success)),
          ),
        ],
      ),
    );
  }

  void _showEditRole(BuildContext context, WidgetRef ref,
      Map<String, dynamic> d, String currentRole) {
    const roles = [
      'MANAGER', 'PROJECT_ASSOCIATE', 'FLEET_MANAGER',
      'ACCOUNTANT', 'DRIVER', 'ADMIN'
    ];
    String selected = currentRole.toUpperCase();

    showModalBottomSheet(
      context: context,
      backgroundColor: KTColors.surface,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Change Role',
                    style: TextStyle(
                        color: KTColors.textHeading,
                        fontSize: 16,
                        fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                ...roles.map((r) => RadioListTile<String>(
                      title: Text(r,
                          style: const TextStyle(
                              color: KTColors.textHeading,
                              fontSize: 14)),
                      value: r,
                      groupValue: selected,
                      activeColor: KTColors.primary,
                      onChanged: (v) =>
                          setState(() => selected = v!),
                    )),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: KTColors.primary,
                      padding: const EdgeInsets.symmetric(
                          vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(10)),
                    ),
                    onPressed: () async {
                      Navigator.pop(ctx);
                      final api = ref.read(apiServiceProvider);
                      try {
                        await api.put('/users/$userId',
                            data: {'role_names': [selected]});
                        ref.invalidate(
                            _employeeDetailProvider(userId));
                        ref.invalidate(adminEmployeesProvider);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context)
                              .showSnackBar(SnackBar(
                                  content: Text(
                                      'Role updated to $selected')));
                        }
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context)
                              .showSnackBar(const SnackBar(
                                  content: Text(
                                      'Failed to update role')));
                        }
                      }
                    },
                    child: const Text('Save',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.bold,
                            fontSize: 15)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DocEntry {
  final String label;
  final String subtitle;
  final String url;
  const _DocEntry(this.label, this.subtitle, this.url);
}
