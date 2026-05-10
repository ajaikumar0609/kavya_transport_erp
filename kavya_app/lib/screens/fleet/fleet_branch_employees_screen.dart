import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../providers/fleet_dashboard_provider.dart';
import '../../providers/pump_dashboard_provider.dart';

// ─── Providers ───────────────────────────────────────────────────────────────

/// Pump operators assigned to a specific branch.
final _branchOperatorsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, int>(
        (ref, branchId) async {
  final api = ref.read(apiServiceProvider);
  final res =
      await api.get('/users/pump-operators', queryParameters: {'branch_id': branchId});
  final payload = res['data'] ?? res;
  if (payload is List) return payload.cast<Map<String, dynamic>>();
  return [];
});

/// All pump operators NOT yet assigned to any branch (for the add sheet).
final _unassignedOperatorsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.read(apiServiceProvider);
  final res =
      await api.get('/users/pump-operators', queryParameters: {'unassigned': true});
  final payload = res['data'] ?? res;
  if (payload is List) return payload.cast<Map<String, dynamic>>();
  return [];
});

// ─── Screen ──────────────────────────────────────────────────────────────────

class FleetBranchEmployeesScreen extends ConsumerWidget {
  final Branch branch;
  const FleetBranchEmployeesScreen({super.key, required this.branch});

  void _showAddSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddOperatorSheet(
        branch: branch,
        onAssigned: () {
          ref.invalidate(_branchOperatorsProvider(branch.id));
          ref.invalidate(_unassignedOperatorsProvider);
        },
      ),
    );
  }

  Future<void> _unassign(BuildContext context, WidgetRef ref, int userId, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Remove Operator'),
        content: Text('Remove $name from ${branch.name}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: KTColors.danger),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final api = ref.read(apiServiceProvider);
      await api.patch('/users/pump-operators/$userId/assign-branch',
          data: {'branch_id': null});
      ref.invalidate(_branchOperatorsProvider(branch.id));
      ref.invalidate(_unassignedOperatorsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$name removed from ${branch.name}'),
            backgroundColor: KTColors.success,
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to remove operator: $e'),
            backgroundColor: KTColors.danger,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final operatorsAsync = ref.watch(_branchOperatorsProvider(branch.id));

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddSheet(context, ref),
        backgroundColor: const Color(0xFF00897B),
        icon: const Icon(Icons.person_add_rounded, color: Colors.white),
        label: const Text('Add Operator',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
      ),
      appBar: AppBar(
        backgroundColor: KTColors.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: KTColors.textHeading),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Pump Employees',
                style: KTTextStyles.h3.copyWith(
                    color: KTColors.textHeading, decoration: TextDecoration.none)),
            Text(branch.name,
                style: KTTextStyles.labelSmall.copyWith(
                    color: KTColors.textMuted, decoration: TextDecoration.none)),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_branchOperatorsProvider(branch.id)),
        child: operatorsAsync.when(
          loading: () => _OperatorSkeleton(),
          error: (e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, color: Colors.red, size: 36),
                const SizedBox(height: 8),
                const Text('Could not load employees',
                    style: TextStyle(color: Colors.red)),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(_branchOperatorsProvider(branch.id)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (operators) {
            if (operators.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.badge_outlined,
                          size: 56, color: KTColors.borderColor),
                      const SizedBox(height: 14),
                      const Text('No operators assigned',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: KTColors.textHeading,
                              decoration: TextDecoration.none)),
                      const SizedBox(height: 6),
                      const Text(
                          'Tap "Add Operator" to assign pump operators to this branch.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 13,
                              color: KTColors.textMuted,
                              decoration: TextDecoration.none)),
                    ],
                  ),
                ),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              itemCount: operators.length,
              itemBuilder: (ctx, i) {
                final op = operators[i];
                final firstName = op['first_name'] as String? ?? '';
                final lastName = op['last_name'] as String? ?? '';
                final fullName = '$firstName $lastName'.trim();
                final email = op['email'] as String? ?? '';
                final phone = op['phone'] as String? ?? '';
                final userId = op['id'] as int;

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: KTColors.surface,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: KTColors.borderColor),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.04),
                        blurRadius: 8,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      // Avatar
                      CircleAvatar(
                        radius: 24,
                        backgroundColor:
                            const Color(0xFF00897B).withOpacity(0.12),
                        child: Text(
                          fullName.isNotEmpty ? fullName[0].toUpperCase() : 'O',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF00897B),
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      // Info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(fullName,
                                style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                    color: KTColors.textHeading)),
                            if (phone.isNotEmpty)
                              Text(phone,
                                  style: const TextStyle(
                                      fontSize: 12, color: KTColors.textMuted)),
                            if (email.isNotEmpty)
                              Text(email,
                                  style: const TextStyle(
                                      fontSize: 12, color: KTColors.textMuted),
                                  overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      // Remove button
                      IconButton(
                        onPressed: () =>
                            _unassign(context, ref, userId, fullName),
                        icon: const Icon(Icons.person_remove_rounded,
                            color: KTColors.danger, size: 22),
                        tooltip: 'Remove from branch',
                      ),
                    ],
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

// ─── Add Operator Bottom Sheet ────────────────────────────────────────────────

class _AddOperatorSheet extends ConsumerStatefulWidget {
  final Branch branch;
  final VoidCallback onAssigned;
  const _AddOperatorSheet({required this.branch, required this.onAssigned});

  @override
  ConsumerState<_AddOperatorSheet> createState() => _AddOperatorSheetState();
}

class _AddOperatorSheetState extends ConsumerState<_AddOperatorSheet> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  final Set<int> _assigning = {};

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _assign(Map<String, dynamic> op) async {
    final userId = op['id'] as int;
    setState(() => _assigning.add(userId));
    try {
      final api = ref.read(apiServiceProvider);
      await api.patch('/users/pump-operators/$userId/assign-branch',
          data: {'branch_id': widget.branch.id});
      widget.onAssigned();
      if (mounted) {
        final firstName = op['first_name'] as String? ?? '';
        final lastName = op['last_name'] as String? ?? '';
        final fullName = '$firstName $lastName'.trim();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$fullName assigned to ${widget.branch.name}'),
            backgroundColor: KTColors.success,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to assign: $e'),
            backgroundColor: KTColors.danger,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _assigning.remove(userId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final allAsync = ref.watch(_unassignedOperatorsProvider);

    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: const BoxDecoration(
        color: KTColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Handle
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: KTColors.borderColor,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          // Title
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Add Operator',
                          style: KTTextStyles.h3
                              .copyWith(color: KTColors.textHeading)),
                      Text('Assign to ${widget.branch.name}',
                          style: KTTextStyles.labelSmall
                              .copyWith(color: KTColors.textMuted)),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded,
                      color: KTColors.textMuted),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          const Divider(height: 20),
          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _query = v.toLowerCase()),
              decoration: InputDecoration(
                hintText: 'Search operators…',
                hintStyle:
                    KTTextStyles.body.copyWith(color: KTColors.textMuted),
                prefixIcon: const Icon(Icons.search_rounded,
                    color: KTColors.textMuted),
                suffixIcon: _query.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear_rounded, size: 18),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _query = '');
                        },
                      )
                    : null,
                filled: true,
                fillColor: KTColors.lightBg,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide:
                        const BorderSide(color: KTColors.borderColor)),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide:
                        const BorderSide(color: KTColors.borderColor)),
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(
                        color: KTColors.primary, width: 1.5)),
              ),
            ),
          ),
          const SizedBox(height: 8),
          // List
          Expanded(
            child: allAsync.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(color: Color(0xFF00897B))),
              error: (e, _) => Center(
                child: Text('Failed to load operators',
                    style: TextStyle(color: KTColors.danger)),
              ),
              data: (operators) {
                final filtered = _query.isEmpty
                    ? operators
                    : operators.where((op) {
                        final name =
                            '${op['first_name']} ${op['last_name']}'.toLowerCase();
                        final phone =
                            (op['phone'] as String? ?? '').toLowerCase();
                        return name.contains(_query) ||
                            phone.contains(_query);
                      }).toList();

                if (filtered.isEmpty) {
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.badge_outlined,
                              size: 48, color: KTColors.borderColor),
                          const SizedBox(height: 12),
                          Text(
                            _query.isNotEmpty
                                ? 'No matching operators'
                                : 'All operators are already assigned',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: KTColors.textMuted),
                          ),
                        ],
                      ),
                    ),
                  );
                }

                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  itemCount: filtered.length,
                  itemBuilder: (ctx, i) {
                    final op = filtered[i];
                    final userId = op['id'] as int;
                    final firstName = op['first_name'] as String? ?? '';
                    final lastName = op['last_name'] as String? ?? '';
                    final fullName = '$firstName $lastName'.trim();
                    final phone = op['phone'] as String? ?? '';
                    final isAssigning = _assigning.contains(userId);

                    return ListTile(
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                      leading: CircleAvatar(
                        backgroundColor:
                            const Color(0xFF00897B).withOpacity(0.12),
                        child: Text(
                          fullName.isNotEmpty
                              ? fullName[0].toUpperCase()
                              : 'O',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF00897B)),
                        ),
                      ),
                      title: Text(fullName,
                          style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              color: KTColors.textHeading)),
                      subtitle: phone.isNotEmpty
                          ? Text(phone,
                              style: const TextStyle(
                                  fontSize: 12, color: KTColors.textMuted))
                          : null,
                      trailing: isAssigning
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFF00897B)))
                          : TextButton(
                              onPressed: () => _assign(op),
                              style: TextButton.styleFrom(
                                backgroundColor:
                                    const Color(0xFF00897B).withOpacity(0.1),
                                foregroundColor: const Color(0xFF00897B),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(8)),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 8),
                              ),
                              child: const Text('Assign',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13)),
                            ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

class _OperatorSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: List.generate(
        4,
        (_) => Container(
          margin: const EdgeInsets.only(bottom: 12),
          height: 76,
          decoration: BoxDecoration(
            color: KTColors.borderColor.withOpacity(0.4),
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }
}
