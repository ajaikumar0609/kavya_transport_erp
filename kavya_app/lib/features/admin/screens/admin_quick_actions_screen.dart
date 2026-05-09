import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/kt_colors.dart';
import '../widgets/quick_action_tile.dart';

class AdminQuickActionsScreen extends StatelessWidget {
  const AdminQuickActionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: KTColors.darkBg,
      appBar: AppBar(
        backgroundColor: KTColors.darkSurface,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => context.pop(),
        ),
        title: const Text('Quick Actions',
            style: TextStyle(color: KTColors.darkTextPrimary)),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('Documents', [
            QuickActionTile(
                label: 'Create LR',
                color: KTColors.info,
                onTap: () => context.push('/admin/lr/create')),
            QuickActionTile(
                label: 'Lorry Receipts',
                color: const Color(0xFF7C4DFF),
                onTap: () => context.push('/admin/lr')),
            QuickActionTile(
                label: 'Upload doc',
                color: Colors.teal,
                onTap: () => context.push('/pa/jobs')),
          ]),
          const SizedBox(height: 20),
          _section('Operations', [
            QuickActionTile(
                label: 'Create job',
                color: KTColors.info,
                onTap: () => context.push('/manager/jobs/create')),
            QuickActionTile(
                label: 'Assign job',
                color: Colors.orange,
                onTap: () => context.push('/manager/jobs')),
            QuickActionTile(
                label: 'Track fleet',
                color: KTColors.success,
                onTap: () => context.push('/manager/fleet')),
          ]),
          const SizedBox(height: 20),
          _section('Finance', [
            QuickActionTile(
                label: 'Invoices',
                color: KTColors.amber600,
                onTap: () => context.push('/accountant/invoices')),
            QuickActionTile(
                label: 'Payments',
                color: KTColors.success,
                onTap: () => context.push('/accountant/payments')),
            QuickActionTile(
                label: 'GST',
                color: Colors.purple,
                onTap: () => context.push('/accountant/gst')),
          ]),
          const SizedBox(height: 20),
          _section('System', [
            QuickActionTile(
                label: 'Add user',
                color: KTColors.info,
                onTap: () => context.push('/admin/employees/create')),
            QuickActionTile(
                label: 'Branches',
                color: Colors.indigo,
                onTap: () => context.push('/admin/branches')),
            QuickActionTile(
                label: 'Settings',
                color: KTColors.darkTextSecondary,
                onTap: () => context.pop()),
          ]),
          const SizedBox(height: 30),
        ],
      ),
    );
  }

  Widget _section(String title, List<Widget> tiles) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title,
            style: const TextStyle(
                color: KTColors.amber600,
                fontSize: 13,
                fontWeight: FontWeight.w600)),
        const SizedBox(height: 10),
        Row(
          children: tiles
              .map((t) => Expanded(child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: t,
                  )))
              .toList(),
        ),
      ],
    );
  }
}
