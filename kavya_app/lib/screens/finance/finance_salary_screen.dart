import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/kt_colors.dart';
import '../../providers/fleet_dashboard_provider.dart'; // apiServiceProvider

// ─── State ────────────────────────────────────────────────────────────────────

final _expandedStaffProvider = StateProvider.autoDispose<int?>((ref) => null);

final _selectedMonthProvider = StateProvider.autoDispose<String>(
  (_) => DateTime.now().toIso8601String().substring(0, 7),
);

final salarySummaryProvider = FutureProvider.autoDispose<Map<String, dynamic>>(
  (ref) async {
    final month = ref.watch(_selectedMonthProvider);
    final api = ref.read(apiServiceProvider);
    final res = await api.get('/finance-manager/salary-summary?month=$month');
    if (res['success'] == true) {
      return Map<String, dynamic>.from(res['data'] ?? {});
    }
    throw Exception(res['message'] ?? 'Failed to load salary summary');
  },
);

// ─── Screen ───────────────────────────────────────────────────────────────────

class FinanceSalaryScreen extends ConsumerWidget {
  const FinanceSalaryScreen({super.key});

  String _rupees(dynamic paise) {
    if (paise == null) return '₹0';
    final double raw;
    if (paise is int) {
      raw = paise.toDouble();
    } else if (paise is double) {
      raw = paise;
    } else {
      raw = double.tryParse(paise.toString()) ?? 0.0;
    }
    if (!raw.isFinite) return '₹0';
    final d = raw.toInt();
    final r = d / 100;
    if (r >= 100000) return '₹${(r / 100000).toStringAsFixed(2)}L';
    if (r >= 1000) return '₹${(r / 1000).toStringAsFixed(1)}K';
    return '₹${r.toStringAsFixed(0)}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selectedMonth = ref.watch(_selectedMonthProvider);
    final asyncSummary = ref.watch(salarySummaryProvider);

    return Scaffold(
      backgroundColor: KTColors.lightBg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Month picker always visible at top
          _MonthPickerBar(
            selectedMonth: selectedMonth,
            onChanged: (m) => ref.read(_selectedMonthProvider.notifier).state = m,
          ),
          // Content area
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(salarySummaryProvider),
              child: asyncSummary.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  children: [
                    const SizedBox(height: 60),
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.error_outline, color: Colors.red, size: 40),
                          const SizedBox(height: 12),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24),
                            child: Text(
                              '$e',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: Colors.red, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                data: (data) {
                  final staff = List<Map<String, dynamic>>.from(data['staff'] ?? []);
                  final totalDue = data['total_due_paise'] ?? 0;
                  final paidCount = data['paid_count'] ?? 0;
                  final unpaidCount = data['unpaid_count'] ?? 0;
                  final paidPaise = data['paid_paise'] ?? 0;
                  final remainingPaise = data['remaining_paise'] ?? 0;
                  final isOverdue = data['is_overdue'] == true;
                  final daysRemaining = data['days_remaining'] as int?;

                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 80),
                    children: [
                      // ── Deadline banner ──────────────────────────────
                      if (isOverdue && unpaidCount > 0)
                        Container(
                          margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: Colors.red.shade50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.red.shade300),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.warning_rounded, color: Colors.red.shade700, size: 20),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'OVERDUE! Salary payment deadline (10th) has passed. '
                                  '$unpaidCount employee${unpaidCount == 1 ? '' : 's'} still unpaid.',
                                  style: TextStyle(
                                    color: Colors.red.shade800,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        )
                      else if (!isOverdue && daysRemaining != null && daysRemaining <= 10 && unpaidCount > 0)
                        Container(
                          margin: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade50,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.amber.shade400),
                          ),
                          child: Row(
                            children: [
                              Icon(Icons.schedule_rounded, color: Colors.amber.shade800, size: 20),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Pay all salaries by the 10th of this month. '
                                  '$unpaidCount employee${unpaidCount == 1 ? '' : 's'} unpaid — '
                                  '${daysRemaining == 0 ? 'today is the last day!' : '$daysRemaining day${daysRemaining == 1 ? '' : 's'} remaining.'}',
                                  style: TextStyle(
                                    color: Colors.amber.shade900,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      // ── Summary chips ────────────────────────────────
                      Padding(
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                        child: Row(
                          children: [
                            _SummaryChip(label: 'Total', value: _rupees(totalDue), color: KTColors.textHeading),
                            const SizedBox(width: 8),
                            _SummaryChip(label: 'Paid ($paidCount)', value: _rupees(paidPaise), color: Colors.green),
                            const SizedBox(width: 8),
                            _SummaryChip(label: 'Pending ($unpaidCount)', value: _rupees(remainingPaise), color: Colors.orange),
                          ],
                        ),
                      ),
                      // ── Bulk pay ─────────────────────────────────────
                      if (unpaidCount > 0)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                          child: _BulkPayButton(
                            staff: staff,
                            month: selectedMonth,
                            unpaidCount: unpaidCount,
                          ),
                        ),
                      const SizedBox(height: 8),
                      // ── Staff cards ───────────────────────────────────
                      if (staff.isEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 60),
                          child: Center(
                            child: Text(
                              'No staff found for this month',
                              style: TextStyle(color: KTColors.textMuted),
                            ),
                          ),
                        )
                      else
                        ...staff.map((s) => _StaffSalaryCard(
                          staff: s,
                          month: selectedMonth,
                          rupeesFormatter: _rupees,
                        )),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Month Picker ─────────────────────────────────────────────────────────────

class _MonthPickerBar extends StatelessWidget {
  final String selectedMonth;
  final ValueChanged<String> onChanged;

  const _MonthPickerBar({required this.selectedMonth, required this.onChanged});

  String _label(String m) {
    final parts = m.split('-');
    if (parts.length < 2) return m;
    const months = [
      '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final idx = int.tryParse(parts[1]) ?? 0;
    return '${months[idx]} ${parts[0]}';
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final months = List.generate(6, (i) {
      final d = DateTime(now.year, now.month - i);
      return '${d.year}-${d.month.toString().padLeft(2, '0')}';
    });

    return Container(
      color: KTColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: months.map((m) {
            final selected = m == selectedMonth;
            return Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(_label(m)),
                selected: selected,
                onSelected: (_) => onChanged(m),
                selectedColor: const Color(0xFF7C3AED).withValues(alpha: 0.15),
                checkmarkColor: const Color(0xFF7C3AED),
                labelStyle: TextStyle(
                  color: selected ? const Color(0xFF7C3AED) : KTColors.textMuted,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  fontSize: 12,
                ),
                side: BorderSide(
                  color: selected ? const Color(0xFF7C3AED) : Colors.transparent,
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ─── Summary Chip ─────────────────────────────────────────────────────────────

class _SummaryChip extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _SummaryChip({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Text(
              value,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w800,
                fontSize: 14,
              ),
            ),
            Text(
              label,
              style: const TextStyle(color: KTColors.textMuted, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Bulk Pay Button ──────────────────────────────────────────────────────────

class _BulkPayButton extends ConsumerStatefulWidget {
  final List<Map<String, dynamic>> staff;
  final String month;
  final int unpaidCount;

  const _BulkPayButton({
    required this.staff,
    required this.month,
    required this.unpaidCount,
  });

  @override
  ConsumerState<_BulkPayButton> createState() => _BulkPayButtonState();
}

class _BulkPayButtonState extends ConsumerState<_BulkPayButton> {
  bool _loading = false;

  Future<void> _bulkPay() async {
    setState(() => _loading = true);
    final api = ref.read(apiServiceProvider);
    final sm = ScaffoldMessenger.of(context);
    final unpaid = widget.staff
        .where((s) => s['status'] == 'unpaid' && s['has_bank_account'] == true)
        .map((s) {
          final rawPaise = s['salary_paise'];
          final int safePaise;
          if (rawPaise is int) {
            safePaise = rawPaise;
          } else if (rawPaise is double && rawPaise.isFinite) {
            safePaise = rawPaise.toInt();
          } else {
            safePaise = 0;
          }
          return {'employee_id': s['employee_id'], 'amount_paise': safePaise};
        })
        .toList();

    if (unpaid.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No staff with bank accounts to pay')),
      );
      setState(() => _loading = false);
      return;
    }

    try {
      final res = await api.post('/finance-manager/payments/salary/bulk', data: {
        'payments': unpaid,
        'month': widget.month,
      });
      if (res['success'] == true) {
        final d = res['data'];
        sm.showSnackBar(
          SnackBar(
            content: Text('Initiated ${d['initiated']} payments, ${d['failed']} failed'),
            backgroundColor: Colors.green,
          ),
        );
        ref.invalidate(salarySummaryProvider);
      } else {
        sm.showSnackBar(
          SnackBar(content: Text(res['message'] ?? 'Failed'), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      sm.showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
      );
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: _loading ? null : () async {
        final confirm = await showDialog<bool>(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Bulk Pay Salary'),
            content: Text(
              'Pay salary to ${widget.unpaidCount} unpaid staff with bank accounts for ${widget.month}?',
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF7C3AED)),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Mark as Paid', style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        );
        if (confirm == true) _bulkPay();
      },
      icon: _loading
          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
          : const Icon(Icons.check_circle_outline_rounded, size: 16),
      label: Text('Mark All as Paid (${widget.unpaidCount})'),
      style: ElevatedButton.styleFrom(
        backgroundColor: const Color(0xFF7C3AED),
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 40),
      ),
    );
  }
}

// ─── Staff Salary Card (expandable) ──────────────────────────────────────────

class _StaffSalaryCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> staff;
  final String month;
  final String Function(dynamic) rupeesFormatter;

  const _StaffSalaryCard({
    required this.staff,
    required this.month,
    required this.rupeesFormatter,
  });

  @override
  ConsumerState<_StaffSalaryCard> createState() => _StaffSalaryCardState();
}

class _StaffSalaryCardState extends ConsumerState<_StaffSalaryCard> {
  // 0 = salary (fixed), 1 = custom
  int _paymentMode = 0;
  final _salaryController = TextEditingController();
  final _customController = TextEditingController();
  bool _paying = false;

  @override
  void initState() {
    super.initState();
    _prefillSalary();
  }

  void _prefillSalary() {
    final raw = widget.staff['salary_paise'];
    final int paise;
    if (raw is int) {
      paise = raw;
    } else if (raw is double && raw.isFinite) {
      paise = raw.toInt();
    } else {
      paise = 0;
    }
    final rupees = paise / 100;
    _salaryController.text = rupees > 0 ? rupees.toStringAsFixed(0) : '';
  }

  @override
  void dispose() {
    _salaryController.dispose();
    _customController.dispose();
    super.dispose();
  }

  int get _employeeId => (widget.staff['employee_id'] as int?) ?? 0;

  bool get _isExpanded => ref.watch(_expandedStaffProvider) == _employeeId;

  void _toggle() {
    final notifier = ref.read(_expandedStaffProvider.notifier);
    if (_isExpanded) {
      notifier.state = null;
    } else {
      notifier.state = _employeeId;
      _paymentMode = 0;
      _prefillSalary();
      _customController.clear();
    }
  }

  Future<void> _pay() async {
    final amtText = _paymentMode == 0
        ? _salaryController.text.trim()
        : _customController.text.trim();
    final amtRupees = double.tryParse(amtText);
    if (amtRupees == null || amtRupees <= 0) {
      _snack('Enter a valid amount', isError: true);
      return;
    }
    final amtPaise = (amtRupees * 100).round();
    final name = widget.staff['name']?.toString() ?? 'Employee';
    final amtStr = '₹${amtRupees.toStringAsFixed(0)}';
    final typeLabel = _paymentMode == 0 ? 'salary' : 'custom payment';

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Confirm Payment'),
        content: Text(
          'Pay $amtStr to $name as $typeLabel for ${widget.month}?\n\nThis will be recorded immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF7C3AED),
              foregroundColor: Colors.white,
            ),
            onPressed: () => Navigator.pop(context, true),
            child: Text('Pay $amtStr'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;

    setState(() => _paying = true);
    final api = ref.read(apiServiceProvider);
    try {
      final res = await api.post('/finance-manager/payments/salary', data: {
        'employee_id': _employeeId,
        'month': widget.month,
        'amount_paise': amtPaise,
      });
      if (!mounted) return;
      if (res['success'] == true) {
        _snack('Payment recorded for $name');
        ref.invalidate(salarySummaryProvider);
        ref.read(_expandedStaffProvider.notifier).state = null;
      } else {
        _snack(res['message'] ?? 'Failed', isError: true);
      }
    } catch (e) {
      if (mounted) _snack(e.toString(), isError: true);
    }
    if (mounted) setState(() => _paying = false);
  }

  void _snack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: isError ? Colors.red : Colors.green,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.staff;
    final status = s['status'] as String? ?? 'unpaid';
    final hasBankAccount = s['has_bank_account'] == true;
    final name = s['name']?.toString() ?? '';
    final designation = s['designation']?.toString() ?? 'Staff';
    final bankLast4 = s['bank_last4']?.toString() ?? '';
    final bankName = s['bank_name']?.toString() ?? '';
    final upiId = s['upi_id']?.toString() ?? '';
    final paidAt = s['paid_at']?.toString() ?? '';
    final utr = s['utr']?.toString() ?? '';
    final displayPaidAt = paidAt.length >= 10 ? paidAt.substring(0, 10) : paidAt;

    Color statusColor;
    switch (status) {
      case 'processed':
        statusColor = Colors.green;
        break;
      case 'pending':
        statusColor = Colors.orange;
        break;
      case 'failed':
        statusColor = Colors.red;
        break;
      default:
        statusColor = KTColors.textMuted;
    }

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(10),
        side: _isExpanded
            ? const BorderSide(color: Color(0xFF7C3AED), width: 1.5)
            : BorderSide.none,
      ),
      child: Column(
        children: [
          // ── Header ──────────────────────────────────────────
          InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: status == 'unpaid' ? _toggle : null,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor: _isExpanded
                        ? const Color(0xFF7C3AED).withValues(alpha: 0.15)
                        : statusColor.withValues(alpha: 0.12),
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : '?',
                      style: TextStyle(
                        color: _isExpanded
                            ? const Color(0xFF7C3AED)
                            : statusColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                            color: KTColors.textHeading,
                          ),
                        ),
                        Text(
                          designation,
                          style: const TextStyle(
                              color: KTColors.textMuted, fontSize: 11),
                        ),
                        if (bankLast4.isNotEmpty)
                          Text(
                            '${bankName.isNotEmpty ? '$bankName · ' : ''}****$bankLast4',
                            style: const TextStyle(
                                color: KTColors.textMuted, fontSize: 10),
                          )
                        else if (upiId.isNotEmpty)
                          Text(upiId,
                              style: const TextStyle(
                                  fontSize: 10, color: KTColors.textMuted))
                        else if (status == 'unpaid')
                          Row(
                            children: const [
                              Icon(Icons.warning_amber_rounded,
                                  size: 11, color: Colors.orange),
                              SizedBox(width: 3),
                              Text('No bank/UPI info',
                                  style: TextStyle(
                                      fontSize: 10, color: Colors.orange)),
                            ],
                          ),
                        if (status == 'processed' && displayPaidAt.isNotEmpty)
                          Text(
                            'Paid $displayPaidAt${utr.isNotEmpty ? '  ·  UTR: $utr' : ''}',
                            style: const TextStyle(
                                color: Colors.green, fontSize: 10),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  // Status badge / expand arrow
                  if (status == 'processed')
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.check_circle,
                            size: 14, color: Colors.green),
                        const SizedBox(width: 2),
                        Text(
                          widget.rupeesFormatter(s['salary_paise']),
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.green,
                          ),
                        ),
                      ],
                    )
                  else
                    Icon(
                      _isExpanded
                          ? Icons.keyboard_arrow_up
                          : Icons.keyboard_arrow_down,
                      color: _isExpanded
                          ? const Color(0xFF7C3AED)
                          : KTColors.textMuted,
                    ),
                ],
              ),
            ),
          ),

          // ── Expanded payment form ────────────────────────────
          AnimatedSize(
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeInOut,
            child: _isExpanded
                ? _StaffPayForm(
                    staff: s,
                    paymentMode: _paymentMode,
                    salaryController: _salaryController,
                    customController: _customController,
                    hasBankAccount: hasBankAccount,
                    paying: _paying,
                    onModeChanged: (m) => setState(() => _paymentMode = m),
                    onPay: _pay,
                    rupeesFormatter: widget.rupeesFormatter,
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

// ─── Staff Pay Form ───────────────────────────────────────────────────────────

class _StaffPayForm extends StatelessWidget {
  final Map<String, dynamic> staff;
  final int paymentMode;
  final TextEditingController salaryController;
  final TextEditingController customController;
  final bool hasBankAccount;
  final bool paying;
  final ValueChanged<int> onModeChanged;
  final VoidCallback onPay;
  final String Function(dynamic) rupeesFormatter;

  const _StaffPayForm({
    required this.staff,
    required this.paymentMode,
    required this.salaryController,
    required this.customController,
    required this.hasBankAccount,
    required this.paying,
    required this.onModeChanged,
    required this.onPay,
    required this.rupeesFormatter,
  });

  @override
  Widget build(BuildContext context) {
    final bankLast4 = staff['bank_last4']?.toString() ?? '';
    final bankName = staff['bank_name']?.toString() ?? '';
    final bankIfsc = staff['bank_ifsc']?.toString() ?? '';
    final upiId = staff['upi_id']?.toString() ?? '';

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF7C3AED).withValues(alpha: 0.04),
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(10),
          bottomRight: Radius.circular(10),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Divider(height: 1),
          const SizedBox(height: 10),

          // ── Bank info banner ────────────────────────────────
          if (bankLast4.isNotEmpty || upiId.isNotEmpty)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.shade100),
              ),
              child: Row(
                children: [
                  const Icon(Icons.account_balance_rounded,
                      size: 14, color: Colors.blue),
                  const SizedBox(width: 6),
                  Expanded(
                    child: bankLast4.isNotEmpty
                        ? Text(
                            '${bankName.isNotEmpty ? '$bankName  ' : ''}****$bankLast4'
                            '${bankIfsc.isNotEmpty ? '  ·  $bankIfsc' : ''}',
                            style: const TextStyle(
                                fontSize: 11, color: Colors.blue),
                          )
                        : Text(
                            'UPI: $upiId',
                            style: const TextStyle(
                                fontSize: 11, color: Colors.blue),
                          ),
                  ),
                ],
              ),
            )
          else
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              margin: const EdgeInsets.only(bottom: 10),
              decoration: BoxDecoration(
                color: Colors.orange.shade50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.orange.shade200),
              ),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded,
                      size: 14, color: Colors.orange),
                  SizedBox(width: 6),
                  Text('No bank/UPI info on file',
                      style:
                          TextStyle(fontSize: 11, color: Colors.orange)),
                ],
              ),
            ),

          // ── Payment type toggle ─────────────────────────────
          const Text('Payment Type',
              style: TextStyle(
                  fontSize: 11,
                  color: KTColors.textMuted,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Row(
            children: [
              _ModeButton(
                label: 'Salary',
                icon: Icons.account_balance_wallet_outlined,
                selected: paymentMode == 0,
                onTap: () => onModeChanged(0),
              ),
              const SizedBox(width: 8),
              _ModeButton(
                label: 'Custom',
                icon: Icons.edit_outlined,
                selected: paymentMode == 1,
                onTap: () => onModeChanged(1),
              ),
            ],
          ),
          const SizedBox(height: 10),

          // ── Amount field ────────────────────────────────────
          const Text('Amount (₹)',
              style: TextStyle(
                  fontSize: 11,
                  color: KTColors.textMuted,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          TextField(
            controller:
                paymentMode == 0 ? salaryController : customController,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(
                  RegExp(r'^\d+\.?\d{0,2}'))
            ],
            decoration: InputDecoration(
              prefixText: '₹ ',
              hintText: paymentMode == 0
                  ? 'Fixed salary amount'
                  : 'Enter custom amount',
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 10),
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8)),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide:
                    const BorderSide(color: Color(0xFF7C3AED)),
              ),
              helperText: paymentMode == 0
                  ? 'Pre-filled from profile — edit if needed'
                  : null,
              helperStyle: const TextStyle(
                  fontSize: 10, color: KTColors.textMuted),
            ),
            style: const TextStyle(fontSize: 14),
          ),
          const SizedBox(height: 10),

          // ── Pay button ──────────────────────────────────────
          GestureDetector(
            onTap: (!paying && hasBankAccount) ? onPay : null,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                color: hasBankAccount
                    ? const Color(0xFF7C3AED)
                    : Colors.grey.shade300,
                borderRadius: BorderRadius.circular(8),
              ),
              alignment: Alignment.center,
              child: paying
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.send_rounded,
                          size: 15,
                          color: hasBankAccount
                              ? Colors.white
                              : Colors.grey.shade500,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          hasBankAccount
                              ? 'Pay Employee'
                              : 'No Bank/UPI Info',
                          style: TextStyle(
                            color: hasBankAccount
                                ? Colors.white
                                : Colors.grey.shade500,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Mode toggle button ───────────────────────────────────────────────────────

class _ModeButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _ModeButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? const Color(0xFF7C3AED)
                : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: selected
                  ? const Color(0xFF7C3AED)
                  : Colors.grey.shade300,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 14,
                  color: selected ? Colors.white : KTColors.textMuted),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: selected ? Colors.white : KTColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
