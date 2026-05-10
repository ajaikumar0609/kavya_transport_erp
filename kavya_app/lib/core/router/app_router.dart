import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'page_transitions.dart';
// Screens for auth and role-based navigation
import '../../screens/auth/login_screen.dart'; 
import '../../screens/auth/web_only_screen.dart';
// Driver screens
import '../../screens/driver/driver_home_screen.dart';
import '../../screens/driver/driver_today_screen.dart';
import '../../screens/driver/driver_trip_list_screen.dart';
import '../../screens/driver/driver_trip_detail_screen.dart';
import '../../screens/driver/driver_expense_list_screen.dart';
import '../../screens/driver/driver_expense_trips_screen.dart';
import '../../screens/driver/driver_checklist_screen.dart';
import '../../screens/driver/driver_documents_screen.dart';
import '../../screens/driver/driver_vehicle_screen.dart';
import '../../screens/driver/driver_notifications_screen.dart';
import '../../screens/driver/driver_add_expense_screen.dart';
import '../../screens/driver/driver_profile_screen.dart';
import '../../screens/driver/driver_gps_tracking_screen.dart';
import '../../screens/driver/driver_epod_screen.dart';
import '../../screens/driver/language_settings_screen.dart';
import '../../screens/driver/driver_apply_leave_screen.dart';
import '../../screens/driver/driver_fuel_entry_screen.dart';
import '../../screens/fleet/fleet_driver_approvals_screen.dart';
// Fleet Manager screens
import '../../screens/fleet/fleet_home_screen.dart';
import '../../screens/fleet/fleet_live_map_screen.dart';
import '../../screens/fleet/fleet_vehicles_screen.dart';
import '../../screens/fleet/fleet_analytics_screen.dart';
import '../../screens/fleet/fleet_driver_list_screen.dart';
import '../../screens/fleet/fleet_trip_management_screen.dart';
import '../../screens/fleet/fleet_profile_screen.dart';
import '../../screens/fleet/fleet_add_vehicle_screen.dart';
import '../../screens/fleet/fleet_edit_vehicle_screen.dart';
import '../../screens/fleet/fleet_vehicle_hub_screen.dart';
import '../../screens/fleet/fleet_driver_detail_screen.dart';
import '../../screens/fleet/fleet_add_driver_screen.dart';
import '../../screens/fleet/fleet_create_trip_screen.dart';
import '../../screens/fleet/fleet_create_lr_screen.dart';
import '../../screens/fleet/fleet_service_log_screen.dart';
import '../../screens/fleet/fleet_tyre_event_screen.dart';
import '../../screens/fleet/fleet_assign_driver_screen.dart';
import '../../screens/fleet/fleet_notifications_screen.dart';
import '../../screens/fleet/fleet_fuel_tanks_screen.dart';
import '../../screens/fleet/fleet_attendance_drivers_screen.dart';
import '../../screens/fleet/fleet_attendance_pump_operators_screen.dart';
import '../../screens/fleet/fleet_driver_attendance_history_screen.dart';
import '../../screens/fleet/fleet_pump_operator_attendance_history_screen.dart';
import '../../screens/fleet/fleet_fuel_employees_screen.dart';
// Accountant screens
import '../../screens/accountant/accountant_home_screen.dart';
import '../../screens/accountant/accountant_shell_screen.dart';
import '../../screens/accountant/accountant_more_screen.dart';
import '../../screens/accountant/accountant_invoices_screen.dart';
import '../../screens/accountant/accountant_invoice_detail_screen.dart';
import '../../screens/accountant/accountant_payments_screen.dart';
import '../../screens/accountant/accountant_receivables_screen.dart';
import '../../screens/accountant/accountant_payables_screen.dart';
import '../../screens/accountant/accountant_ledger_screen.dart';
import '../../screens/accountant/accountant_gst_screen.dart';
import '../../screens/accountant/accountant_vouchers_screen.dart';
import '../../screens/accountant/accountant_statements_screen.dart';
import '../../screens/accountant/accountant_expense_approval_screen.dart';
import '../../screens/accountant/accountant_settlement_screen.dart';
import '../../screens/accountant/accountant_banking_screen.dart';
import '../../screens/accountant/auditor_report_screen.dart';
import '../../screens/accountant/accountant_payments_hub_screen.dart';
// Driver settlement
import '../../screens/driver/driver_settlement_screen.dart';
// Pump Shift screen
import '../../screens/pump/pump_shift_screen.dart';
// Branch Manager screens
import '../../screens/branch/branch_home_screen.dart';
import '../../screens/branch/branch_dashboard_screen.dart';
import '../../screens/branch/branch_trips_screen.dart';
import '../../screens/branch/branch_drivers_screen.dart';
import '../../screens/branch/branch_reports_screen.dart';
// Project Associate screens (legacy)
// import '../../screens/associate/associate_home_screen.dart'; // replaced by PA screens
// PA (new full workflow) screens
import '../../screens/pa/pa_shell_screen.dart';
import '../../screens/pa/pa_dashboard_screen.dart';
import '../../screens/pa/pa_job_list_screen.dart';
import '../../screens/pa/pa_job_detail_screen.dart';
import '../../screens/pa/pa_create_lr_screen.dart';
import '../../screens/pa/pa_ewb_list_screen.dart';
import '../../screens/pa/pa_ewb_detail_screen.dart';
import '../../screens/pa/pa_banking_screen.dart';
import '../../screens/pa/pa_create_trip_sheet_screen.dart';
import '../../screens/pa/pa_documents_screen.dart';
import '../../screens/pa/pa_trip_closure_screen.dart';
import '../../screens/pa/pa_notifications_screen.dart';
// Admin screens (new feature module)
import '../../features/admin/widgets/admin_shell_screen.dart';
import '../../features/admin/screens/admin_dashboard_screen.dart';
import '../../features/admin/screens/admin_operations_screen.dart';
import '../../features/admin/screens/admin_finance_overview_screen.dart';
import '../../features/admin/screens/admin_employees_screen.dart';
import '../../features/admin/screens/admin_settings_screen.dart';
import '../../features/admin/screens/admin_masters_screen.dart';
import '../../features/admin/screens/admin_compliance_screen.dart';
import '../../features/admin/screens/admin_quick_actions_screen.dart';
import '../../features/admin/screens/admin_create_employee_screen.dart';
import '../../features/admin/screens/admin_employee_detail_screen.dart';
import '../../features/admin/screens/admin_branches_screen.dart';
import '../../features/admin/screens/admin_job_detail_screen.dart';
import '../../features/admin/screens/admin_trip_detail_screen.dart';
import '../../features/admin/screens/admin_client_detail_screen.dart';
import '../../features/admin/screens/admin_vehicle_detail_screen.dart';
import '../../features/admin/screens/admin_driver_detail_screen.dart';
import '../../features/admin/screens/admin_invoice_detail_screen.dart';
import '../../features/admin/screens/admin_compliance_detail_screen.dart';
import '../../features/admin/screens/admin_create_trip_screen.dart';
import '../../features/admin/screens/admin_upload_doc_screen.dart';
import '../../features/admin/screens/admin_reports_screen.dart';
// Pump Operator screens
import '../../screens/pump/pump_home_screen.dart';
import '../../screens/pump/pump_dashboard_screen.dart';
import '../../screens/pump/pump_fuel_log_screen.dart';
import '../../screens/pump/pump_history_screen.dart';
import '../../screens/pump/pump_vehicles_screen.dart';
import '../../screens/pump/pump_tank_refill_screen.dart';
import '../../screens/pump/pump_create_tank_screen.dart';
// Manager screens
import '../../features/manager/widgets/manager_shell_screen.dart';
import '../../features/manager/screens/manager_dashboard_screen.dart';
import '../../features/manager/screens/manager_job_list_screen.dart';
import '../../features/manager/screens/manager_job_detail_screen.dart';
import '../../features/manager/screens/manager_create_job_screen.dart';
import '../../features/manager/screens/manager_assign_screen.dart';
import '../../features/manager/screens/manager_clients_screen.dart';
import '../../features/manager/screens/manager_create_client_screen.dart';
import '../../features/manager/screens/manager_client_detail_screen.dart';
import '../../features/manager/screens/manager_fleet_screen.dart';
import '../../features/manager/screens/manager_vehicle_detail_screen.dart';
import '../../features/manager/screens/manager_reports_screen.dart';
import '../../features/manager/screens/manager_approvals_screen.dart';
import '../../features/manager/screens/manager_notifications_screen.dart';
// Finance Manager screens
import '../../screens/finance/finance_shell_screen.dart';
import '../../screens/finance/finance_home_screen.dart';
import '../../screens/finance/finance_expenses_screen.dart';
import '../../screens/finance/finance_drivers_screen.dart';
import '../../screens/finance/finance_salary_screen.dart';
import '../../screens/finance/finance_payments_screen.dart';
import '../../screens/finance/finance_notifications_screen.dart';
import '../../screens/finance/finance_history_screen.dart';
// Market Driver screens
import '../../screens/market_driver/market_driver_otp_screen.dart';
import '../../screens/market_driver/market_driver_trips_screen.dart';
import '../../screens/market_driver/market_driver_trip_detail_screen.dart';
// Tyre Inspector screens
import '../../screens/tyre/tyre_shell_screen.dart';
import '../../screens/tyre/tyre_dashboard_screen.dart';
import '../../screens/tyre/tyre_inspections_screen.dart';
import '../../screens/tyre/tyre_vehicles_screen.dart';
import '../../screens/tyre/tyre_history_screen.dart';
import '../../screens/tyre/tyre_inventory_screen.dart';
import '../../screens/tyre/tyre_profile_screen.dart';
import '../../screens/tyre/tyre_vehicle_detail_screen.dart';

final appNavigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  const storage = FlutterSecureStorage();

  return GoRouter(
    navigatorKey: appNavigatorKey,
    initialLocation: '/login',
    redirect: (BuildContext context, GoRouterState state) async {
      final token = await storage.read(key: 'access_token');
      final role = await storage.read(key: 'primary_role');
      final isLoginPage = state.matchedLocation == '/login' ||
          state.matchedLocation == '/market-driver-login';

      if (token == null && !isLoginPage) {
        return '/login';
      }
      
      if (token != null && isLoginPage) {
        // Redirect to correct home for this role
        switch (role) {
          case 'driver': return '/driver/today';
          case 'fleet_manager': return '/fleet/home';
          case 'accountant': return '/accountant/home';
          case 'finance_manager':
          case 'FINANCE_MANAGER': return '/finance/home';
          case 'project_associate': return '/pa/dashboard';
          case 'admin':
          case 'super_admin': return '/admin/dashboard';
          case 'pump_operator': return '/pump/home';
          case 'manager': return '/manager/dashboard';
          case 'branch_manager': return '/branch/home';
          case 'market_driver': return '/market-driver/trips';
          case 'tyre_inspector': return '/tyre/dashboard';
          default: return '/web-only';
        }
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => PageTransitionPreset.standard(
          context: context,
          state: state,
          child: const LoginScreen(),
        ),
      ),
      GoRoute(
        path: '/web-only',
        pageBuilder: (context, state) => PageTransitionPreset.standard(
          context: context,
          state: state,
          child: const WebOnlyScreen(),
        ),
      ),
      
      // --- DRIVER ROUTES --- (Stateful shell with bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => DriverHomeScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/driver/today',
              pageBuilder: (context, state) => PageTransitionPreset.fast(
                context: context,
                state: state,
                child: const DriverTodayScreen(),
              ),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/driver/trips',
              pageBuilder: (context, state) => PageTransitionPreset.fast(
                context: context,
                state: state,
                child: const DriverTripListScreen(),
              ),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/driver/fuel',
              pageBuilder: (context, state) => PageTransitionPreset.fast(
                context: context,
                state: state,
                child: const DriverFuelEntryScreen(),
              ),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/driver/expenses',
              pageBuilder: (context, state) => PageTransitionPreset.fast(
                context: context,
                state: state,
                child: const DriverExpenseTripsScreen(),
              ),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/driver/profile',
              pageBuilder: (context, state) => PageTransitionPreset.fast(
                context: context,
                state: state,
                child: const DriverProfileScreen(),
              ),
            ),
          ]),
        ],
      ),
      
      // Driver modal routes (outside shell)
      GoRoute(
        path: '/driver/expenses/:tripId',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) {
          final tripId = int.parse(state.pathParameters['tripId'] ?? '0');
          final tripNumber = state.uri.queryParameters['trip'] ?? '';
          final origin = state.uri.queryParameters['origin'];
          final destination = state.uri.queryParameters['destination'];
          return PageTransitionPreset.modal(
            context: context,
            state: state,
            child: DriverExpenseListScreen(
              tripId: tripId,
              tripNumber: tripNumber.isNotEmpty ? tripNumber : null,
              origin: (origin?.isNotEmpty == true) ? Uri.decodeComponent(origin!) : null,
              destination: (destination?.isNotEmpty == true) ? Uri.decodeComponent(destination!) : null,
            ),
          );
        },
      ),
      GoRoute(
        path: '/driver/add-expense',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: const DriverAddExpenseScreen(),
        ),
      ),
      GoRoute(
        path: '/driver/trip/:id',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: DriverTripDetailScreen(tripId: int.parse(state.pathParameters['id'] ?? '0')),
        ),
      ),
      GoRoute(
        path: '/driver/trip/:id/epod',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: DriverEpodScreen(tripId: int.parse(state.pathParameters['id'] ?? '0')),
        ),
      ),
      GoRoute(
        path: '/driver/tracking/:id',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: DriverGpsTrackingScreen(tripId: int.parse(state.pathParameters['id'] ?? '0')),
        ),
      ),
      GoRoute(
        path: '/driver/checklist',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) {
          final tripId = int.tryParse(state.uri.queryParameters['tripId'] ?? '');
          final type = state.uri.queryParameters['type'];
          return PageTransitionPreset.modal(
            context: context,
            state: state,
            child: DriverChecklistScreen(tripId: tripId, initialType: type),
          );
        },
      ),
      GoRoute(
        path: '/driver/vehicle',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: const DriverVehicleScreen(),
        ),
      ),
      GoRoute(
        path: '/driver/documents',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: const DriverDocumentsScreen(),
        ),
      ),
      GoRoute(
        path: '/driver/notifications',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: const DriverNotificationsScreen(),
        ),
      ),
      GoRoute(
        path: '/driver/language-settings',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: const LanguageSettingsScreen(),
        ),
      ),
      GoRoute(
        path: '/driver/leave',
        parentNavigatorKey: appNavigatorKey,
        pageBuilder: (context, state) => PageTransitionPreset.modal(
          context: context,
          state: state,
          child: const DriverApplyLeaveScreen(),
        ),
      ),
      
      // --- Fleet Routes ---
      GoRoute(path: '/fleet/home', builder: (context, state) => const FleetHomeScreen()),
      GoRoute(path: '/fleet/vehicles', builder: (context, state) => const FleetVehiclesScreen()),
      GoRoute(path: '/fleet/analytics', builder: (context, state) => const FleetAnalyticsScreen()),
      GoRoute(path: '/fleet/map', builder: (context, state) => const FleetLiveMapScreen()),
      GoRoute(path: '/fleet/drivers', builder: (context, state) => const FleetDriverListScreen()),
      GoRoute(path: '/fleet/trips', builder: (context, state) => const FleetTripManagementScreen()),
      GoRoute(path: '/fleet/profile', builder: (context, state) => const FleetProfileScreen()),
      GoRoute(path: '/fleet/vehicle/add', builder: (context, state) => const FleetAddVehicleScreen()),
      GoRoute(
        path: '/fleet/vehicle/:id/edit',
        builder: (context, state) => FleetEditVehicleScreen(
          vehicleId: int.parse(state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/fleet/vehicle/:id',
        builder: (context, state) => FleetVehicleHubScreen(
          vehicleId: int.parse(state.pathParameters['id']!),
        ),
      ),
      GoRoute(path: '/fleet/driver/add', builder: (context, state) => const FleetAddDriverScreen()),
      GoRoute(
        path: '/fleet/driver/:id',
        builder: (context, state) => FleetDriverDetailScreen(
          driverId: int.parse(state.pathParameters['id']!),
        ),
      ),
      GoRoute(path: '/fleet/trip/create', builder: (context, state) => const FleetCreateTripScreen()),
      GoRoute(path: '/fleet/lr/create', builder: (context, state) => const FleetCreateLRScreen()),
      GoRoute(path: '/fleet/expenses', builder: (context, state) => const Scaffold()),
      GoRoute(path: '/fleet/service/new', builder: (context, state) => const FleetServiceLogScreen()),
      GoRoute(path: '/fleet/tyre/new', builder: (context, state) => const FleetTyreEventScreen()),
      GoRoute(path: '/fleet/approvals', builder: (context, state) => const FleetDriverApprovalsScreen()),
      GoRoute(path: '/fleet/assign', builder: (context, state) => const FleetAssignDriverScreen()),
      GoRoute(path: '/fleet/notifications', builder: (context, state) => const FleetNotificationsScreen()),
      GoRoute(path: '/fleet/fuel/tanks', builder: (context, state) => const FleetFuelTanksScreen()),
      GoRoute(path: '/fleet/attendance/drivers', builder: (context, state) => const FleetAttendanceDriversScreen()),
      GoRoute(path: '/fleet/attendance/pump-operators', builder: (context, state) => const FleetAttendancePumpOperatorsScreen()),
      GoRoute(
        path: '/fleet/attendance/driver/:driverId',
        builder: (context, state) {
          final driverId = int.parse(state.pathParameters['driverId']!);
          final driverName = state.uri.queryParameters['name'] ?? 'Driver';
          return FleetDriverAttendanceHistoryScreen(driverId: driverId, driverName: driverName);
        },
      ),
      GoRoute(
        path: '/fleet/attendance/pump-operator/:userId',
        builder: (context, state) {
          final userId = int.parse(state.pathParameters['userId']!);
          final name = state.uri.queryParameters['name'] ?? 'Pump Operator';
          return FleetPumpOperatorAttendanceHistoryScreen(userId: userId, operatorName: name);
        },
      ),
      GoRoute(path: '/fleet/fuel/employees', builder: (context, state) => const FleetFuelEmployeesScreen()),
      
      // --- Accountant Routes --- (Stateful shell with bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AccountantShellScreen(navigationShell: navigationShell),
        branches: [
          // index 0 → Dashboard
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/accountant/home',
              builder: (context, state) => const AccountantHomeScreen(),
            ),
          ]),
          // index 1 → Invoices
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/accountant/invoices',
              builder: (context, state) => const AccountantInvoicesScreen(),
            ),
          ]),
          // index 2 → Ledger
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/accountant/ledger',
              builder: (context, state) => const AccountantLedgerScreen(),
            ),
          ]),
          // index 3 → Statements / Reports
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/accountant/statements',
              builder: (context, state) => const AccountantStatementsScreen(),
            ),
          ]),
          // index 4 → More
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/accountant/more',
              builder: (context, state) => const AccountantMoreScreen(),
            ),
          ]),
        ],
      ),
      // Accountant modal / detail routes (outside shell)
      GoRoute(
        path: '/accountant/invoice/:id',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AccountantInvoiceDetailScreen(
          id: state.pathParameters['id'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/accountant/payments',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantPaymentsScreen(),
      ),
      GoRoute(
        path: '/accountant/receivables',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantReceivablesScreen(),
      ),
      GoRoute(
        path: '/accountant/payables',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantPayablesScreen(),
      ),
      GoRoute(
        path: '/accountant/gst',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantGSTScreen(),
      ),
      GoRoute(
        path: '/accountant/vouchers',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantVouchersScreen(),
      ),
      GoRoute(
        path: '/accountant/approvals',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantExpenseApprovalScreen(),
      ),
      GoRoute(
        path: '/accountant/expenses',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantExpenseApprovalScreen(),
      ),
      GoRoute(
        path: '/accountant/settlements',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantSettlementScreen(),
      ),
      GoRoute(
        path: '/accountant/banking',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantBankingScreen(),
      ),
      GoRoute(
        path: '/accountant/auditor-report',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AuditorReportScreen(),
      ),
      GoRoute(
        path: '/accountant/payments-hub',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AccountantPaymentsHubScreen(),
      ),
      
      // --- Finance Manager Routes ---
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            FinanceShellScreen(navigationShell: navigationShell),
        branches: [
          // index 0 → Dashboard
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance/home',
              builder: (context, state) => const FinanceHomeScreen(),
            ),
          ]),
          // index 1 → Expenses
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance/expenses',
              builder: (context, state) => const FinanceExpensesScreen(),
            ),
          ]),
          // index 2 → Drivers
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance/drivers',
              builder: (context, state) => const FinanceDriversScreen(),
            ),
          ]),
          // index 3 → Salary
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance/salary',
              builder: (context, state) => const FinanceSalaryScreen(),
            ),
          ]),
          // index 4 → Payments
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance/payments',
              builder: (context, state) => const FinancePaymentsScreen(),
            ),
          ]),
          // index 5 → History
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/finance/history',
              builder: (context, state) => const FinanceHistoryScreen(),
            ),
          ]),
        ],
      ),

      // Finance notifications (pushed on top of shell)
      GoRoute(
        path: '/finance/notifications',
        builder: (context, state) => const FinanceNotificationsScreen(),
      ),

      // --- Associate Routes (legacy redirects → PA screens) ---
      GoRoute(path: '/associate/home',        redirect: (context, state) => '/pa/dashboard'),
      GoRoute(path: '/associate/jobs',         redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/lr/create',    redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/lr/list',      redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/ewb/create',   redirect: (context, state) => '/pa/ewb'),
      GoRoute(path: '/associate/ewb/list',     redirect: (context, state) => '/pa/ewb'),
      GoRoute(path: '/associate/trip/close',   redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/upload',       redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/trips',        redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/documents',    redirect: (context, state) => '/pa/jobs'),
      GoRoute(path: '/associate/banking',      redirect: (context, state) => '/pa/banking'),

      // --- PA Routes (full workflow with bottom nav shell) ---
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            PAShellScreen(navigationShell: navigationShell),
        branches: [
          // index 0 → Dashboard
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/pa/dashboard',
              builder: (context, state) => const PADashboardScreen(),
            ),
          ]),
          // index 1 → Jobs
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/pa/jobs',
              builder: (context, state) => const PAJobListScreen(),
            ),
          ]),
          // index 2 → EWB
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/pa/ewb',
              builder: (context, state) => const PAEWBListScreen(),
            ),
          ]),
          // index 3 → Banking
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/pa/banking',
              builder: (context, state) => const PABankingScreen(),
            ),
          ]),
        ],
      ),
      // PA push/modal routes (outside shell)
      GoRoute(
        path: '/pa/jobs/:jobId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => PAJobDetailScreen(
          jobId: int.parse(state.pathParameters['jobId'] ?? '0'),
        ),
      ),
      GoRoute(
        path: '/pa/jobs/:jobId/lr',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => PACreateLRScreen(
          jobId: int.parse(state.pathParameters['jobId'] ?? '0'),
        ),
      ),
      GoRoute(
        path: '/pa/jobs/:jobId/trip',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => PATripSheetScreen(
          jobId: int.parse(state.pathParameters['jobId'] ?? '0'),
        ),
      ),
      GoRoute(
        path: '/pa/ewb/:ewbId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => PAEWBDetailScreen(
          ewbId: int.parse(state.pathParameters['ewbId'] ?? '0'),
        ),
      ),
      GoRoute(
        path: '/pa/trips/:tripId/docs',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => PADocumentsScreen(
          tripId: int.parse(state.pathParameters['tripId'] ?? '0'),
        ),
      ),
      GoRoute(
        path: '/pa/trips/:tripId/close',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => PATripClosureScreen(
          tripId: int.parse(state.pathParameters['tripId'] ?? '0'),
        ),
      ),
      GoRoute(
        path: '/pa/notifications',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const PANotificationsScreen(),
      ),
      GoRoute(
        path: '/project_associate/notifications',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const PANotificationsScreen(),
      ),

      // --- Admin Routes --- (Stateful shell with 5-tab bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AdminShellScreen(navigationShell: navigationShell),
        branches: [
          // index 0 → Dashboard (Home)
          StatefulShellBranch(routes: [
            GoRoute(path: '/admin/dashboard', builder: (context, state) => const AdminDashboardScreen()),
          ]),
          // index 1 → Operations
          StatefulShellBranch(routes: [
            GoRoute(path: '/admin/operations', builder: (context, state) => const AdminOperationsScreen()),
          ]),
          // index 2 → Finance
          StatefulShellBranch(routes: [
            GoRoute(path: '/admin/finance', builder: (context, state) => const AdminFinanceScreen()),
          ]),
          // index 3 → People (Employees)
          StatefulShellBranch(routes: [
            GoRoute(path: '/admin/employees', builder: (context, state) => const AdminEmployeesScreen()),
          ]),
          // index 4 → Settings
          StatefulShellBranch(routes: [
            GoRoute(path: '/admin/settings', builder: (context, state) => const AdminSettingsScreen()),
          ]),
        ],
      ),
      // Admin push/modal routes (outside shell)
      // Legacy admin route redirects (for users with old navigation state)
      GoRoute(
        path: '/admin/home',
        redirect: (_, __) => '/admin/dashboard',
      ),
      GoRoute(
        path: '/admin/fleet',
        parentNavigatorKey: appNavigatorKey,
        redirect: (_, __) => '/admin/operations',
      ),
      GoRoute(
        path: '/admin/team',
        parentNavigatorKey: appNavigatorKey,
        redirect: (_, __) => '/admin/employees',
      ),
      GoRoute(
        path: '/admin/alerts',
        parentNavigatorKey: appNavigatorKey,
        redirect: (_, __) => '/admin/compliance',
      ),
      GoRoute(
        path: '/admin/masters',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminMastersScreen(),
      ),
      GoRoute(
        path: '/admin/compliance',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminComplianceScreen(),
      ),
      GoRoute(
        path: '/admin/quick-actions',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminQuickActionsScreen(),
      ),
      GoRoute(
        path: '/admin/employees/create',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminCreateEmployeeScreen(),
      ),
      GoRoute(
        path: '/admin/employees/:userId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminEmployeeDetailScreen(
          userId: state.pathParameters['userId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/branches',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminBranchesScreen(),
      ),
      GoRoute(
        path: '/admin/jobs/:jobId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminJobDetailScreen(
          jobId: state.pathParameters['jobId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/trips/:tripId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminTripDetailScreen(
          tripId: state.pathParameters['tripId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/clients/:clientId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminClientDetailScreen(
          clientId: state.pathParameters['clientId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/vehicles/:vehicleId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminVehicleDetailScreen(
          vehicleId: state.pathParameters['vehicleId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/drivers/:driverId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminDriverDetailScreen(
          driverId: state.pathParameters['driverId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/invoices/:invoiceId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminInvoiceDetailScreen(
          invoiceId: state.pathParameters['invoiceId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/compliance/:alertId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => AdminComplianceDetailScreen(
          alertId: state.pathParameters['alertId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/admin/lr/create',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const FleetCreateLRScreen(),
      ),
      GoRoute(
        path: '/admin/trip/create',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminCreateTripScreen(),
      ),
      GoRoute(
        path: '/admin/upload-doc',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminUploadDocScreen(),
      ),
      GoRoute(
        path: '/admin/ewb',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const PAEWBListScreen(),
      ),
      GoRoute(
        path: '/admin/reports',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const AdminReportsScreen(),
      ),

      // --- Pump Operator Routes --- (Stateful shell with bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => PumpHomeScreen(navigationShell: navigationShell),
        branches: [
          // index 0 → Dashboard
          StatefulShellBranch(routes: [
            GoRoute(path: '/pump/home', builder: (context, state) => const PumpDashboardScreen()),
          ]),
          // index 1 → Log
          StatefulShellBranch(routes: [
            GoRoute(path: '/pump/log', builder: (context, state) => const PumpFuelLogScreen()),
          ]),
          // index 2 → History
          StatefulShellBranch(routes: [
            GoRoute(path: '/pump/history', builder: (context, state) => const PumpHistoryScreen()),
          ]),
          // index 3 → Vehicles
          StatefulShellBranch(routes: [
            GoRoute(path: '/pump/vehicles', builder: (context, state) => const PumpVehiclesScreen()),
          ]),
        ],
      ),
      // Standalone pump screens (no bottom nav)
      GoRoute(
        path: '/pump/shift',
        builder: (context, state) => const PumpShiftScreen(),
      ),
      GoRoute(
        path: '/pump/refill',
        builder: (context, state) => const PumpTankRefillScreen(),
      ),
      // Standalone create tank screen (no bottom nav)
      GoRoute(
        path: '/pump/create-tank',
        builder: (context, state) => const PumpCreateTankScreen(),
      ),

      // Driver settlement (standalone, no shell)
      GoRoute(
        path: '/driver/settlement',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const DriverSettlementScreen(),
      ),

      // --- Manager Routes --- (Stateful shell with 5-tab bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            ManagerShellScreen(navigationShell: navigationShell),
        branches: [
          // index 0 → Dashboard (Home)
          StatefulShellBranch(routes: [
            GoRoute(path: '/manager/dashboard', builder: (context, state) => const ManagerDashboardScreen()),
          ]),
          // index 1 → Jobs
          StatefulShellBranch(routes: [
            GoRoute(path: '/manager/jobs', builder: (context, state) => const ManagerJobListScreen()),
          ]),
          // index 2 → Clients
          StatefulShellBranch(routes: [
            GoRoute(path: '/manager/clients', builder: (context, state) => const ManagerClientsScreen()),
          ]),
          // index 3 → Fleet
          StatefulShellBranch(routes: [
            GoRoute(path: '/manager/fleet', builder: (context, state) => const ManagerFleetScreen()),
          ]),
          // index 4 → Reports
          StatefulShellBranch(routes: [
            GoRoute(path: '/manager/reports', builder: (context, state) => const ManagerReportsScreen()),
          ]),
        ],
      ),
      // Manager push/modal routes (outside shell)
      GoRoute(
        path: '/manager/jobs/create',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const ManagerCreateJobScreen(),
      ),
      GoRoute(
        path: '/manager/jobs/:jobId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => ManagerJobDetailScreen(
          jobId: state.pathParameters['jobId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/manager/jobs/:jobId/assign',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => ManagerAssignScreen(
          jobId: state.pathParameters['jobId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/manager/clients/create',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const ManagerCreateClientScreen(),
      ),
      GoRoute(
        path: '/manager/clients/:clientId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => ManagerClientDetailScreen(
          clientId: state.pathParameters['clientId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/manager/fleet/:vehicleId',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => ManagerVehicleDetailScreen(
          vehicleId: state.pathParameters['vehicleId'] ?? '0',
        ),
      ),
      GoRoute(
        path: '/manager/approvals',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const ManagerApprovalsScreen(),
      ),
      GoRoute(
        path: '/manager/notifications',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const ManagerNotificationsScreen(),
      ),

      // --- Branch Manager Routes --- (Stateful shell with bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            BranchHomeScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/branch/home', builder: (context, state) => const BranchDashboardScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/branch/trips', builder: (context, state) => const BranchTripsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/branch/drivers', builder: (context, state) => const BranchDriversScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/branch/reports', builder: (context, state) => const BranchReportsScreen()),
          ]),
        ],
      ),

      // --- Tyre Inspector Routes --- (Stateful shell with bottom nav)
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            TyreShellScreen(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/tyre/dashboard', builder: (context, state) => const TyreDashboardScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/tyre/vehicles', builder: (context, state) => const TyreVehiclesScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/tyre/inspections', builder: (context, state) => const TyreInspectionsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/tyre/history', builder: (context, state) => const TyreHistoryScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/tyre/inventory', builder: (context, state) => const TyreInventoryScreen()),
          ]),
        ],
      ),
      GoRoute(
        path: '/tyre/profile',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) => const TyreProfileScreen(),
      ),
      GoRoute(
        path: '/tyre/vehicle/:id',
        parentNavigatorKey: appNavigatorKey,
        builder: (context, state) {
          final id = int.parse(state.pathParameters['id']!);
          final extra = state.extra as Map<String, dynamic>? ?? {};
          return TyreVehicleDetailScreen(
            vehicleId: id,
            registrationNumber: extra['registration_number'] ?? '',
            axleWheelType: extra['axle_wheel_type'] ?? '6w',
            source: extra['source'] ?? 'vehicles',
          );
        },
      ),

      // --- Market Driver Routes (phone OTP login → trips → detail) ---
      GoRoute(
        path: '/market-driver-login',
        builder: (context, state) => const MarketDriverOtpScreen(),
      ),
      GoRoute(
        path: '/market-driver/trips',
        builder: (context, state) => const MarketDriverTripsScreen(),
      ),
      GoRoute(
        path: '/market-driver/trip/:id',
        builder: (context, state) {
          final id = int.tryParse(state.pathParameters['id'] ?? '0') ?? 0;
          final extra = state.extra as Map<String, dynamic>?;
          return MarketDriverTripDetailScreen(tripId: id, initialData: extra);
        },
      ),
    ],
  );
});