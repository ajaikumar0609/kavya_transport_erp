import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import ErrorBoundary from '@/components/common/ErrorBoundary';

// Layout
import DashboardLayout from '@/components/layout/DashboardLayout';
import AuthGuard from '@/components/auth/AuthGuard';

// Auth pages
import LoginPage from '@/pages/auth/LoginPage';

// Dashboard
import DashboardPage from '@/pages/dashboard/DashboardPage';

// Master pages
import ClientsPage from '@/pages/clients/ClientsPage';
import ClientDetailPage from '@/pages/clients/ClientDetailPage';
import VehiclesPage from '@/pages/vehicles/VehiclesPage';
import VehicleDetailPage from '@/pages/vehicles/VehicleDetailPage';
import DriversPage from '@/pages/drivers/DriversPage';
import DriverDetailPage from '@/pages/drivers/DriverDetailPage';
import DriverDashboardPage from '@/pages/drivers/DriverDashboardPage';
import DriverTripsPage from '@/pages/driver/DriverTripsPage';
import DriverAttendancePage from '@/pages/driver/DriverAttendancePage';
import DriverExpensesPage from '@/pages/driver/DriverExpensesPage';
import DriverDocumentsPage from '@/pages/driver/DriverDocumentsPage';
import UploadDocumentPage from '@/pages/documents/UploadDocumentPage';
import DriverTyreDashboardPage from '@/pages/driver/DriverTyreDashboardPage';
import DriverInspectPage from '@/pages/driver/DriverInspectPage';
import DriverTyreHistoryPage from '@/pages/driver/DriverTyreHistoryPage';

// Operations
import LRListPage from '@/pages/lr/LRListPage';
import LRDetailPage from '@/pages/lr/LRDetailPage';
import CreateLRPage from '@/pages/lr/CreateLRPage';
import EwayBillListPage from '@/pages/eway-bill/EwayBillListPage';
import EwayBillDetailPage from '@/pages/eway-bill/EwayBillDetailPage';
import GenerateEwayBillPage from '@/pages/eway-bill/GenerateEwayBillPage';
import TripsPage from '@/pages/trips/TripsPage';
import TripDetailPage from '@/pages/trips/TripDetailPage';
import CreateTripPage from '@/pages/trips/CreateTripPage';

// Finance Hub
import FinanceHubPage from '@/pages/finance/FinanceHubPage';

// Banking Module
import BankingPage from '@/pages/banking/BankingPage';

// Tracking
import LiveTrackingPage from '@/pages/tracking/LiveTrackingPage';
import GPSLiveMapPage from '@/pages/tracking/GPSLiveMapPage';
import TripReplayPage from '@/pages/tracking/TripReplayPage';
import UnifiedTrackingPage from '@/pages/tracking/UnifiedTrackingPage';

// Reports
import ReportsPage from '@/pages/reports/ReportsPage';
import AuditorReportPage from '@/pages/reports/AuditorReportPage';

// Auditor Pages
import AuditorDashboardPage from '@/pages/auditor/AuditorDashboardPage';
import AuditorTripsPage from '@/pages/auditor/AuditorTripsPage';
import AuditorExpensesPage from '@/pages/auditor/AuditorExpensesPage';
import AuditorLRProfitabilityPage from '@/pages/auditor/AuditorLRProfitabilityPage';
import AuditorFuelPage from '@/pages/auditor/AuditorFuelPage';
import AuditorClientsPage from '@/pages/auditor/AuditorClientsPage';
import AuditorMaintenancePage from '@/pages/auditor/AuditorMaintenancePage';

// Clerk Pages
import ClerkDashboardPage from '@/pages/clerk/ClerkDashboardPage';
import ClerkLRsPage from '@/pages/clerk/ClerkLRsPage';
import ClerkPODPage from '@/pages/clerk/ClerkPODPage';
import ClerkAttendancePage from '@/pages/clerk/ClerkAttendancePage';

// Compliance & Tools
import VehicleCompliancePage from '@/pages/fleet/VehicleCompliancePage';
import DriverCompliancePage from '@/pages/fleet/DriverCompliancePage';
import GSTVerificationPage from '@/pages/fleet/GSTVerificationPage';
import FuelPricePage from '@/pages/fleet/FuelPricePage';
import RouteCalculatorPage from '@/pages/trips/RouteCalculatorPage';
import PaymentLinkPage from '@/pages/finance/PaymentLinkPage';
import PaymentsHubPage from '@/pages/finance/PaymentsHubPage';
import AuditorReviewPage from '@/pages/finance/AuditorReviewPage';
import NotificationCenterPage from '@/pages/settings/NotificationCenterPage';
// Settings
import SettingsPage from '@/pages/settings/SettingsPage';
import ProfilePage from '@/pages/settings/ProfilePage';

// Fleet Manager
import FleetDashboardPage from '@/pages/fleet/FleetDashboardPage';
import FleetVehiclesPage from '@/pages/fleet/FleetVehiclesPage';
import FleetAssignDriverPage from '@/pages/fleet/FleetAssignDriverPage';
import FleetDriversPage from '@/pages/fleet/FleetDriversPage';
import FleetTrackingPage from '@/pages/fleet/FleetTrackingPage';
import FleetMaintenancePage from '@/pages/fleet/FleetMaintenancePage';
import FleetFuelPage from '@/pages/fleet/FleetFuelPage';
import FleetAlertsPage from '@/pages/fleet/FleetAlertsPage';
import FleetReportsPage from '@/pages/fleet/FleetReportsPage';
import TyreTrackerPage from '@/pages/fleet/TyreTrackerPage';
import FleetPumpManagementPage from '@/pages/fleet/FleetPumpManagementPage';
import GeofenceManagementPage from '@/pages/fleet/GeofenceManagementPage';
import ComplianceDashboardPage from '@/pages/fleet/ComplianceDashboardPage';
import TPMSDashboardPage from '@/pages/fleet/TPMSDashboardPage';
import CustomerLoginPage from '@/pages/portal/CustomerLoginPage';
import CustomerDashboardPage from '@/pages/portal/CustomerDashboardPage';
import CustomerTrackingPage from '@/pages/portal/CustomerTrackingPage';
import SupplierLoginPage from '@/pages/portal/SupplierLoginPage';
import SupplierDashboardPage from '@/pages/portal/SupplierDashboardPage';
import RoutesPage from '@/pages/masters/RoutesPage';
import SuppliersPage from '@/pages/suppliers/SuppliersPage';
import SupplierDetailPage from '@/pages/suppliers/SupplierDetailPage';
import MarketTripsPage from '@/pages/market-trips/MarketTripsPage';
import MarketTripDetailPage from '@/pages/market-trips/MarketTripDetailPage';

// Pump Operator
import PumpDashboardPage from '@/pages/pump/PumpDashboardPage';
import PumpIssueFuelPage from '@/pages/pump/PumpIssueFuelPage';
import PumpFuelLogPage from '@/pages/pump/PumpFuelLogPage';
import PumpStockPage from '@/pages/pump/PumpStockPage';
import PumpAlertsPage from '@/pages/pump/PumpAlertsPage';
import PumpReportsPage from '@/pages/pump/PumpReportsPage';
import FuelVerificationPage from '@/pages/pump/FuelVerificationPage';

// Accountant
import AccountantDashboardPage from '@/pages/accountant/AccountantDashboardPage';
import AccountantInvoicesPage from '@/pages/accountant/AccountantInvoicesPage';
import AccountantReceivablesPage from '@/pages/accountant/AccountantReceivablesPage';
import AccountantPayablesPage from '@/pages/accountant/AccountantPayablesPage';
import AccountantExpensesPage from '@/pages/accountant/AccountantExpensesPage';
import AccountantDriverPaymentsPage from '@/pages/accountant/AccountantDriverPaymentsPage';
import AccountantFuelExpensePage from '@/pages/accountant/AccountantFuelExpensePage';
import AccountantBankingPage from '@/pages/accountant/AccountantBankingPage';
import AccountantLedgerPage from '@/pages/accountant/AccountantLedgerPage';
import AccountantReportsPage from '@/pages/accountant/AccountantReportsPage';
// Finance Manager
import FinanceManagerDashboardPage from '@/pages/finance-manager/FinanceManagerDashboardPage';
import SalaryPaymentsPage from '@/pages/finance-manager/SalaryPaymentsPage';
import ExpenseApprovalsPage from '@/pages/finance-manager/ExpenseApprovalsPage';
import PayablesDashboardPage from '@/pages/finance-manager/PayablesDashboardPage';
import PayoutHistoryPage from '@/pages/finance-manager/PayoutHistoryPage';
import TripExpensesPage from '@/pages/finance-manager/TripExpensesPage';
import TripAdvancePaymentsPage from '@/pages/finance-manager/TripAdvancePaymentsPage';

// IFIAS (Accountant)
import InvoiceWorkspacePage from '@/pages/finance/InvoiceWorkspacePage';

import ConnectivityPage from '@/pages/admin/ConnectivityPage';
import EmployeesPage from '@/pages/admin/EmployeesPage';
import AttendancePage from '@/pages/admin/AttendancePage';
import BranchesPage from '@/pages/admin/BranchesPage';
import BranchDetailPage from '@/pages/admin/BranchDetailPage';
import PumpOperatorsPage from '@/pages/admin/PumpOperatorsPage';
import FleetDriverApprovalsPage from '@/pages/fleet/FleetDriverApprovalsPage';
import FleetDriverAttendancePage from '@/pages/fleet/FleetDriverAttendancePage';
import NotFoundPage from '@/pages/common/NotFoundPage';
import { getRoleHomePage } from '@/utils/roleRouting';

function App() {
  const { fetchUser, isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={
          isAuthenticated ? <Navigate to={getRoleHomePage(user?.roles?.[0])} replace /> : <LoginPage />
        } />

        {/* Protected routes */}
        <Route element={<AuthGuard><DashboardLayout /></AuthGuard>}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Clients */}
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />

          {/* Vehicles */}
          <Route path="/vehicles" element={<VehiclesPage />} />
          <Route path="/vehicles/:id" element={<VehicleDetailPage />} />

          {/* Drivers */}
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/drivers/dashboard" element={<DriverDashboardPage />} />
          <Route path="/drivers/:id" element={<DriverDetailPage />} />

          {/* Driver Work */}
          <Route path="/driver/trips" element={<DriverTripsPage />} />
          <Route path="/driver/attendance" element={<DriverAttendancePage />} />
          <Route path="/my-work/attendance" element={<DriverAttendancePage />} />
          <Route path="/driver/expenses" element={<DriverExpensesPage />} />
          <Route path="/driver/documents" element={<DriverDocumentsPage />} />
          <Route path="/documents/upload" element={<UploadDocumentPage />} />
          <Route path="/documents/upload/:id" element={<UploadDocumentPage />} />
          <Route path="/driver/tyre" element={<DriverTyreDashboardPage />} />
          <Route path="/driver/inspect/:vehicleId" element={<DriverInspectPage />} />
          <Route path="/driver/tyre-history" element={<DriverTyreHistoryPage />} />

          {/* LR */}
          <Route path="/lr" element={<LRListPage />} />
          <Route path="/lr/new" element={<CreateLRPage />} />
          <Route path="/lr/:id/edit" element={<CreateLRPage />} />
          <Route path="/lr/:id" element={<LRDetailPage />} />

          {/* E-Way Bills */}
          <Route path="/lr/eway-bill" element={<EwayBillListPage />} />
          <Route path="/lr/eway-bill/new" element={<GenerateEwayBillPage />} />
          <Route path="/lr/eway-bill/:id/edit" element={<GenerateEwayBillPage />} />
          <Route path="/lr/eway-bill/:id" element={<EwayBillDetailPage />} />

          {/* Trips */}
          <Route path="/trips" element={<TripsPage />} />
          <Route path="/trips/new" element={<CreateTripPage />} />
          <Route path="/trips/:id/edit" element={<CreateTripPage />} />
          <Route path="/trips/:id" element={<TripDetailPage />} />

          {/* Finance Hub — single route with tab-based navigation */}
          <Route path="/finance" element={<FinanceHubPage />} />
          {/* Backward-compat redirects from old finance routes */}
          <Route path="/finance/invoices" element={<Navigate to="/finance?tab=invoices" replace />} />
          <Route path="/finance/invoice-workspace" element={<Navigate to="/finance?tab=invoices" replace />} />
          <Route path="/finance/payments" element={<Navigate to="/finance?tab=transactions&sub=receivables" replace />} />
          <Route path="/finance/receivables" element={<Navigate to="/finance?tab=transactions&sub=receivables" replace />} />
          <Route path="/finance/payables" element={<Navigate to="/finance?tab=transactions&sub=payables" replace />} />
          <Route path="/finance/ledger" element={<Navigate to="/finance?tab=banking&view=ledger" replace />} />
          <Route path="/finance/reconciliation" element={<Navigate to="/finance?tab=banking&view=reconciliation" replace />} />
          <Route path="/finance/settlements" element={<Navigate to="/finance?tab=transactions&sub=settlements" replace />} />
          <Route path="/finance/alerts" element={<Navigate to="/finance?tab=overview" replace />} />
          <Route path="/finance/reports" element={<Navigate to="/finance?tab=reports" replace />} />
          {/* Banking entry form stays as dedicated page */}
          <Route path="/finance/banking/new" element={<Navigate to="/finance?tab=banking" replace />} />


          {/* Banking Module */}
          <Route path="/banking" element={<BankingPage />} />

          {/* Tracking */}
          <Route path="/tracking" element={<UnifiedTrackingPage />} />
          <Route path="/tracking/unified" element={<UnifiedTrackingPage />} />
          <Route path="/tracking/live" element={<LiveTrackingPage />} />
          <Route path="/tracking/gps" element={<GPSLiveMapPage />} />
          <Route path="/tracking/replay" element={<TripReplayPage />} />
          <Route path="/alerts" element={<FleetAlertsPage />} />

          {/* Reports */}
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/auditor" element={<AuditorReportPage />} />
          <Route path="/auditor/payment-proofs" element={<AuthGuard requiredPermission="payment:proof:read"><AuditorReviewPage /></AuthGuard>} />

          {/* Auditor Role Pages */}
          <Route path="/auditor/dashboard" element={<AuditorDashboardPage />} />
          <Route path="/auditor/trips" element={<AuditorTripsPage />} />
          <Route path="/auditor/expenses" element={<AuditorExpensesPage />} />
          <Route path="/auditor/lr-profitability" element={<AuditorLRProfitabilityPage />} />
          <Route path="/auditor/fuel" element={<AuditorFuelPage />} />
          <Route path="/auditor/clients" element={<AuditorClientsPage />} />
          <Route path="/auditor/maintenance" element={<AuditorMaintenancePage />} />

          {/* Clerk Role Pages */}
          <Route path="/clerk/dashboard" element={<ClerkDashboardPage />} />
          <Route path="/clerk/lrs" element={<ClerkLRsPage />} />
          <Route path="/clerk/pod" element={<ClerkPODPage />} />
          <Route path="/clerk/attendance" element={<ClerkAttendancePage />} />

          {/* Settings */}
          <Route path="/settings" element={<SettingsPage />} />

          {/* Compliance & Tools */}
          <Route path="/fleet/vehicle-compliance" element={<VehicleCompliancePage />} />
          <Route path="/fleet/driver-compliance" element={<DriverCompliancePage />} />
          <Route path="/fleet/gst-verify" element={<GSTVerificationPage />} />
          <Route path="/fleet/fuel-prices" element={<FuelPricePage />} />
          <Route path="/trips/route-calculator" element={<RouteCalculatorPage />} />
          <Route path="/finance/payment-link" element={<PaymentLinkPage />} />
          <Route path="/finance/payments-hub" element={<PaymentsHubPage />} />
          <Route path="/settings/notifications" element={<NotificationCenterPage />} />


          {/* Fleet Manager */}
          <Route path="/fleet/dashboard" element={<FleetDashboardPage />} />
          <Route path="/fleet" element={<FleetDashboardPage />} />
          <Route path="/fleet/vehicles" element={<FleetVehiclesPage />} />
          <Route path="/fleet/vehicles/:id" element={<FleetVehiclesPage />} />
          <Route path="/fleet/drivers" element={<FleetDriversPage />} />
          <Route path="/fleet/drivers/:id" element={<FleetDriversPage />} />
          <Route path="/fleet/tracking" element={<Navigate to="/tracking" replace />} />
          <Route path="/fleet/maintenance" element={<FleetMaintenancePage />} />
          <Route path="/fleet/fuel" element={<FleetFuelPage />} />
          <Route path="/fleet/tyres" element={<TyreTrackerPage />} />
          <Route path="/fleet/alerts" element={<FleetAlertsPage />} />
          <Route path="/fleet/reports" element={<FleetReportsPage />} />
          <Route path="/fleet/geofences" element={<GeofenceManagementPage />} />
          <Route path="/fleet/compliance" element={<ComplianceDashboardPage />} />
          <Route path="/fleet/tpms" element={<TPMSDashboardPage />} />
          <Route path="/fleet/assign-drivers" element={<FleetAssignDriverPage />} />

          {/* Masters */}
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/suppliers" element={<SuppliersPage />} />
          <Route path="/suppliers/:id" element={<SupplierDetailPage />} />

          {/* Market Trips */}
          <Route path="/market-trips" element={<MarketTripsPage />} />
          <Route path="/market-trips/:id" element={<MarketTripDetailPage />} />

          {/* Accountant */}
          <Route path="/accountant/dashboard" element={<AccountantDashboardPage />} />
          <Route path="/accountant" element={<AccountantDashboardPage />} />
          <Route path="/accountant/invoice-workspace" element={<InvoiceWorkspacePage />} />
          <Route path="/accountant/invoices" element={<AuthGuard requiredPermission="invoice:read"><AccountantInvoicesPage /></AuthGuard>} />
          <Route path="/accountant/receivables" element={<AuthGuard requiredPermission="invoice:read"><AccountantReceivablesPage /></AuthGuard>} />
          <Route path="/accountant/payables" element={<AuthGuard requiredPermission="payment:read"><AccountantPayablesPage /></AuthGuard>} />
          <Route path="/accountant/expenses" element={<AuthGuard requiredPermission="expense:read"><AccountantExpensesPage /></AuthGuard>} />
          <Route path="/accountant/payments" element={<AuthGuard requiredPermission="payment:read"><AccountantDriverPaymentsPage /></AuthGuard>} />
          <Route path="/accountant/fuel" element={<AccountantFuelExpensePage />} />
          <Route path="/accountant/banking" element={<AccountantBankingPage />} />
          <Route path="/accountant/ledger" element={<AuthGuard requiredPermission="ledger:read"><AccountantLedgerPage /></AuthGuard>} />
          <Route path="/accountant/reports" element={<AccountantReportsPage />} />

          {/* Finance Manager */}
          <Route path="/fm/dashboard" element={<FinanceManagerDashboardPage />} />
          <Route path="/fm" element={<FinanceManagerDashboardPage />} />
          <Route path="/fm/salary" element={<SalaryPaymentsPage />} />
          <Route path="/fm/advances" element={<TripAdvancePaymentsPage />} />
          <Route path="/fm/trip-advances" element={<TripAdvancePaymentsPage />} />
          <Route path="/fm/expenses" element={<ExpenseApprovalsPage />} />
          <Route path="/fm/trip-expenses" element={<TripExpensesPage />} />
          <Route path="/fm/payables" element={<PayablesDashboardPage />} />
          <Route path="/fm/history" element={<PayoutHistoryPage />} />

          {/* Pump Operator */}
          <Route path="/pump/dashboard" element={<PumpDashboardPage />} />
          <Route path="/pump" element={<PumpDashboardPage />} />
          <Route path="/pump/issue" element={<PumpIssueFuelPage />} />
          <Route path="/pump/log" element={<PumpFuelLogPage />} />
          <Route path="/pump/stock" element={<PumpStockPage />} />
          <Route path="/pump/alerts" element={<PumpAlertsPage />} />
          <Route path="/pump/reports" element={<PumpReportsPage />} />
          <Route path="/pump/fuel-verification" element={<FuelVerificationPage />} />

          {/* Profile page */}
          <Route path="/profile" element={<ProfilePage />} />

          {/* Admin */}
          <Route
            path="/admin/connectivity"
            element={
              <AuthGuard requiredRole="admin">
                <ConnectivityPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AuthGuard requiredRole="admin">
                <EmployeesPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/employees"
            element={
              <AuthGuard requiredRole="admin">
                <EmployeesPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/attendance"
            element={
              <AuthGuard requiredRole="admin">
                <AttendancePage />
              </AuthGuard>
            }
          />
          <Route path="/fleet/pump-management" element={<FleetPumpManagementPage />} />
          <Route path="/fleet/pump-operators" element={<PumpOperatorsPage />} />
          <Route path="/fleet/approvals" element={<FleetDriverApprovalsPage />} />
          <Route path="/fleet/attendance/drivers" element={<FleetDriverAttendancePage />} />
          <Route
            path="/admin/pump-operators"
            element={
              <AuthGuard requiredRole="admin">
                <PumpOperatorsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/branches"
            element={
              <AuthGuard requiredRole="admin">
                <BranchesPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/branches/:id"
            element={
              <AuthGuard requiredRole="admin">
                <BranchDetailPage />
              </AuthGuard>
            }
          />
        </Route>

        {/* Portal routes (standalone, no AuthGuard/DashboardLayout) */}
        <Route path="/portal/customer" element={<CustomerLoginPage />} />
        <Route path="/portal/customer/dashboard" element={<CustomerDashboardPage />} />
        <Route path="/portal/track/:token" element={<CustomerTrackingPage />} />
        <Route path="/portal/supplier" element={<SupplierLoginPage />} />
        <Route path="/portal/supplier/dashboard" element={<SupplierDashboardPage />} />

        {/* Root redirect — send each role to their home page */}
        <Route path="/" element={
          isAuthenticated
            ? <Navigate to={getRoleHomePage(user?.roles?.[0])} replace />
            : <Navigate to="/login" replace />
        } />

        {/* Catch all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
