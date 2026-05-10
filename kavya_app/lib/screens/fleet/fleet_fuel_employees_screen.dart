import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../core/theme/kt_text_styles.dart';
import '../../providers/pump_dashboard_provider.dart';
import 'fleet_branch_employees_screen.dart';

class FleetFuelEmployeesScreen extends ConsumerWidget {
  const FleetFuelEmployeesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchesAsync = ref.watch(branchesProvider);

    return Scaffold(
      backgroundColor: KTColors.lightBg,
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
                    color: KTColors.textHeading,
                    decoration: TextDecoration.none)),
            Text('Select a bunk to manage',
                style: KTTextStyles.labelSmall.copyWith(
                    color: KTColors.textMuted,
                    decoration: TextDecoration.none)),
          ],
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(branchesProvider),
        child: branchesAsync.when(
          loading: () => _BranchSkeleton(),
          error: (e, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, color: Colors.red, size: 36),
                const SizedBox(height: 8),
                const Text('Could not load branches',
                    style: TextStyle(color: Colors.red)),
                TextButton(
                  onPressed: () => ref.invalidate(branchesProvider),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (branches) {
            if (branches.isEmpty) {
              return const Center(
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.badge_outlined,
                          size: 52, color: KTColors.borderColor),
                      SizedBox(height: 12),
                      Text('No branches found',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: KTColors.textHeading,
                              decoration: TextDecoration.none)),
                      SizedBox(height: 6),
                      Text('Add branches from the Tanks section first.',
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
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              children: branches
                  .map((b) => _BranchCard(
                        branch: b,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => FleetBranchEmployeesScreen(branch: b),
                            ),
                          );
                        },
                      ))
                  .toList(),
            );
          },
        ),
      ),
    );
  }
}

// ─── Branch card ───────────────────────────────────────────────────────────

class _BranchCard extends StatelessWidget {
  final Branch branch;
  final VoidCallback onTap;

  const _BranchCard({required this.branch, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: KTColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: KTColors.borderColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF00897B).withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.badge_rounded,
                  size: 22, color: Color(0xFF00897B)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(branch.name,
                      style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: KTColors.textHeading)),
                  if (branch.city != null && branch.city!.isNotEmpty)
                    Text(branch.city!,
                        style: const TextStyle(
                            fontSize: 12, color: KTColors.textMuted)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded,
                color: KTColors.textMuted, size: 20),
          ],
        ),
      ),
    );
  }
}

// ─── Skeleton ──────────────────────────────────────────────────────────────

class _BranchSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: List.generate(
        5,
        (_) => Container(
          margin: const EdgeInsets.only(bottom: 14),
          height: 72,
          decoration: BoxDecoration(
            color: KTColors.borderColor.withOpacity(0.5),
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
    );
  }
}
