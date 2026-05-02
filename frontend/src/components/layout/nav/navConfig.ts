// Enterprise Navigation Configuration
// Defines the horizontal nav menu structure with role-based visibility

import type { RoleType } from '@/types';

export interface NavMenuItem {
  label: string;
  path: string;
  route?: string;
  icon?: string;
  description?: string;
  permission?: string;
  roles?: RoleType[];
}

export interface NavMenuGroup {
  label: string;
  path?: string;              // direct link (no dropdown)
  items?: NavMenuItem[];      // dropdown children
  permission?: string;
  roles?: RoleType[];
}

export type HeaderNavRole = 'ADMIN' | 'MANAGER' | 'FLEET_MANAGER' | 'ACCOUNTANT' | 'FINANCE_MANAGER' | 'PROJECT_ASSOCIATES' | 'DRIVER' | 'PUMP_OPERATOR' | 'AUDITOR' | 'TYRE_INSPECTOR' | 'CLERK';

export interface HeaderNavItem {
  label: string;
  route: string;
  icon: string;
  description: string;
  badge?: string;
}

export interface HeaderNavSection {
  label: string;
  items: HeaderNavItem[];
}

export const NAV_CONFIG: Record<HeaderNavRole, { sections: HeaderNavSection[] }> = {
  ADMIN: {
    sections: [
      { label: 'Overview', items: [{ label: 'Dashboard', route: '/dashboard', icon: 'home', description: 'Company overview and quick KPIs' }] },
      {
        label: 'Masters',
        items: [
          { label: 'Clients', route: '/clients', icon: 'users', description: 'Manage client records and contacts' },
          { label: 'Vehicles', route: '/vehicles', icon: 'truck', description: 'Fleet vehicle inventory and documents' },
          { label: 'Drivers', route: '/drivers', icon: 'id', description: 'Driver profiles, licences and compliance' },
          { label: 'Driver Dashboard', route: '/drivers/dashboard', icon: 'dashboard', description: 'Driver performance dashboard' },
          { label: 'Suppliers', route: '/suppliers', icon: 'truck', description: 'Manage supplier/contractor records' },
        ],
      },
      {
        label: 'Operations',
        items: [
          { label: 'Market Trips', route: '/market-trips', icon: 'truck', description: 'Hired truck trips and P&L' },
          { label: 'Lorry Receipts', route: '/lr', icon: 'file', description: 'Generate and manage LR documents' },
          { label: 'Trips', route: '/trips', icon: 'map', description: 'Trip execution and monitoring' },
        ],
      },
      {
        label: 'Monitoring',
        items: [
          { label: 'Fleet Tracking', route: '/tracking', icon: 'pin', description: 'Unified GPS tracking — all providers' },
          { label: 'Alerts', route: '/alerts', icon: 'alert', description: 'System alerts and notifications' },
          { label: 'Reports', route: '/reports', icon: 'chart', description: 'Analytics and business reports' },
        ],
      },
      {
        label: 'Fleet Manager',
        items: [
          { label: 'Fleet Dashboard', route: '/fleet', icon: 'gauge', description: 'Fleet overview and KPIs' },
          { label: 'Fleet Vehicles', route: '/fleet/vehicles', icon: 'truck', description: 'Vehicle health and maintenance' },
          { label: 'Fleet Drivers', route: '/fleet/drivers', icon: 'user', description: 'Driver performance and compliance' },
          { label: 'Maintenance', route: '/fleet/maintenance', icon: 'wrench', description: 'Service records and schedules' },
          { label: 'Fuel Mgmt', route: '/fleet/fuel', icon: 'fuel', description: 'Fuel entries and efficiency tracking' },
          { label: 'Tyres', route: '/fleet/tyres', icon: 'circle', description: 'Real-time tyre monitoring, stock & retreading' },
          { label: 'Fleet Alerts', route: '/fleet/alerts', icon: 'bell', description: 'Compliance and service alerts' },
          { label: 'Fleet Reports', route: '/fleet/reports', icon: 'chart', description: 'Fleet analytics and reports' },
          { label: 'Assign Drivers', route: '/fleet/assign-drivers', icon: 'user', description: 'Assign a default driver to each vehicle' },
          { label: 'Pump Management', route: '/fleet/pump-management', icon: 'fuel', description: 'Bunks, tanks, pumps and pump employee activity' },
          { label: 'Driver Approvals', route: '/fleet/approvals', icon: 'check', description: 'Review and action driver leave and advance requests', badge: 'approvals' },
        ],
      },
      {
        label: 'Tools',
        items: [
          { label: 'Notifications', route: '/settings/notifications', icon: 'bell', description: 'Send SMS, WhatsApp, Push notifications' },
        ],
      },
      {
        label: 'Quick Actions',
        items: [
          { label: 'Create LR', route: '/lr/new', icon: 'fileplus', description: 'Create a new lorry receipt' },
          { label: 'Upload Doc', route: '/documents/upload', icon: 'upload', description: 'Upload operational documents' },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Employees', route: '/admin/employees', icon: 'users', description: 'Manage employees and user accounts' },
          { label: 'Attendance', route: '/admin/attendance', icon: 'calendar', description: 'View all employee attendance' },
          { label: 'Settings', route: '/settings', icon: 'settings', description: 'System settings and preferences' },
        ],
      },
    ],
  },
  MANAGER: {
    sections: [
      {
        label: 'Overview',
        items: [
          { label: 'Dashboard', route: '/dashboard', icon: 'home', description: 'Company overview and quick KPIs' },
        ],
      },
      {
        label: 'Masters',
        items: [
          { label: 'Clients', route: '/clients', icon: 'users', description: 'Manage client records and contacts' },
          { label: 'Vehicles', route: '/vehicles', icon: 'truck', description: 'Fleet vehicle inventory and documents' },
          { label: 'Drivers', route: '/drivers', icon: 'id', description: 'Driver profiles, licences and compliance' },
          { label: 'Driver Dashboard', route: '/drivers/dashboard', icon: 'dashboard', description: 'Driver performance dashboard' },
          { label: 'Suppliers', route: '/suppliers', icon: 'truck', description: 'Manage supplier/contractor records' },
        ],
      },
      {
        label: 'Operations',
        items: [
          { label: 'Lorry Receipts', route: '/lr', icon: 'file', description: 'Generate and manage LR documents' },
          { label: 'Market Trips', route: '/market-trips', icon: 'truck', description: 'Hired truck trips and P&L' },
        ],
      },
      {
        label: 'Fleet Manager',
        items: [
          { label: 'Fleet Dashboard', route: '/fleet', icon: 'gauge', description: 'Fleet overview and KPIs' },
          { label: 'Fleet Vehicles', route: '/fleet/vehicles', icon: 'truck', description: 'Vehicle health and maintenance' },
          { label: 'Fleet Drivers', route: '/fleet/drivers', icon: 'user', description: 'Driver performance and compliance' },
          { label: 'Maintenance', route: '/fleet/maintenance', icon: 'wrench', description: 'Service records and schedules' },
          { label: 'Fuel Mgmt', route: '/fleet/fuel', icon: 'fuel', description: 'Fuel entries and efficiency tracking' },
          { label: 'Tyres', route: '/fleet/tyres', icon: 'circle', description: 'Real-time tyre monitoring, stock & retreading' },
          { label: 'Fleet Alerts', route: '/fleet/alerts', icon: 'bell', description: 'Compliance and service alerts' },
          { label: 'Fleet Reports', route: '/fleet/reports', icon: 'chart', description: 'Fleet analytics and reports' },
        ],
      },
      {
        label: 'Quick Actions',
        items: [
          { label: 'Create LR', route: '/lr/new', icon: 'fileplus', description: 'Create a new lorry receipt' },
          { label: 'Upload Doc', route: '/documents/upload', icon: 'upload', description: 'Upload operational documents' },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Attendance', route: '/my-work/attendance', icon: 'clock', description: 'Mark daily attendance with camera check-in' },
          { label: 'Settings', route: '/settings', icon: 'settings', description: 'System settings and preferences' },
        ],
      },
    ],
  },
  FLEET_MANAGER: {
    sections: [
      { label: 'Overview', items: [{ label: 'Dashboard', route: '/fleet/dashboard', icon: 'home', description: 'Fleet KPIs and operational overview' }] },
      {
        label: 'Operations',
        items: [
          { label: 'Lorry Receipts', route: '/lr', icon: 'file', description: 'Generate and manage LR documents' },
          { label: 'Trips', route: '/trips', icon: 'map', description: 'Track and manage vehicle trips' },
          { label: 'Market Trips', route: '/market-trips', icon: 'truck', description: 'Hired truck trips and P&L' },
        ],
      },
      {
        label: 'Fleet Manager',
        items: [
          { label: 'Fleet Dashboard', route: '/fleet', icon: 'gauge', description: 'Fleet overview and KPIs' },
          { label: 'Fleet Vehicles', route: '/fleet/vehicles', icon: 'truck', description: 'Vehicle health and maintenance' },
          { label: 'Fleet Drivers', route: '/fleet/drivers', icon: 'user', description: 'Driver performance and compliance' },
          { label: 'Maintenance', route: '/fleet/maintenance', icon: 'wrench', description: 'Service records and schedules' },
          { label: 'Fuel Mgmt', route: '/fleet/fuel', icon: 'fuel', description: 'Fuel entries and efficiency tracking' },
          { label: 'Tyres', route: '/fleet/tyres', icon: 'circle', description: 'Real-time tyre monitoring, stock & retreading' },
          { label: 'Fleet Alerts', route: '/fleet/alerts', icon: 'bell', description: 'Compliance and service alerts' },
          { label: 'Fleet Reports', route: '/fleet/reports', icon: 'chart', description: 'Fleet analytics and reports' },
          { label: 'Assign Drivers', route: '/fleet/assign-drivers', icon: 'user', description: 'Assign a default driver to each vehicle' },
          { label: 'Pump Management', route: '/fleet/pump-management', icon: 'fuel', description: 'Bunks, tanks, pumps and pump employee activity' },
          { label: 'Driver Approvals', route: '/fleet/approvals', icon: 'check', description: 'Review and action driver leave and advance requests', badge: 'approvals' },
        ],
      },
      {
        label: 'Attendance',
        items: [
          { label: 'Drivers', route: '/fleet/attendance/drivers', icon: 'user', description: 'Driver list with current status and assignment' },
          { label: 'Pump Operators', route: '/fleet/pump-operators', icon: 'fuel', description: 'Pump operator attendance and day-by-day fuel activity' },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Attendance', route: '/my-work/attendance', icon: 'clock', description: 'Mark daily attendance with camera check-in' },
          { label: 'Settings', route: '/settings', icon: 'settings', description: 'System settings and preferences' },
        ],
      },
    ],
  },
  FINANCE_MANAGER: {
    sections: [
      {
        label: 'OVERVIEW',
        items: [
          { label: 'Finance Manager', route: '/fm/dashboard', icon: 'gauge', description: 'Payment control center — salary, advances, vendor payments' },
        ],
      },
      {
        label: 'PAYMENTS',
        items: [
          { label: 'Salary Payments', route: '/fm/salary', icon: 'users', description: 'Pay staff salaries for the month' },
          { label: 'Trip Expenses', route: '/finance?tab=transactions&sub=trip-expenses', icon: 'receipt', description: 'Pending driver field expenses from trips — pay & verify' },
          { label: 'GPay Expense Approvals', route: '/fm/expenses', icon: 'wallet', description: 'Review and reimburse driver GPay receipts' },
          { label: 'Driver Advances', route: '/fm/advances', icon: 'pay', description: 'Issue post-loading and on-request driver advances' },
          { label: 'Payables & Schedules', route: '/fm/payables', icon: 'calendar', description: 'Recurring fixed payments — rent, insurance, tax, permits, EMI' },
        ],
      },
      {
        label: 'HISTORY',
        items: [
          { label: 'Payout History', route: '/fm/history', icon: 'clock', description: 'All Razorpay outgoing payment records' },
        ],
      },
      {
        label: 'REVIEW',
        items: [
          { label: 'Finance Overview', route: '/finance', icon: 'arrowup', description: 'Read-only view of invoices, banker & reports', badge: 'alerts' },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { label: 'Settings', route: '/settings', icon: 'settings', description: 'Account settings and preferences' },
        ],
      },
    ],
  },
  ACCOUNTANT: {
    sections: [
      {
        label: 'OVERVIEW',
        items: [
          { label: 'Accountant Dashboard', route: '/accountant/dashboard', icon: 'gauge', description: 'IFIAS batch status & quick actions' },
        ],
      },
      {
        label: 'INVOICING',
        items: [
          { label: 'Invoice Workspace', route: '/accountant/invoice-workspace', icon: 'file', description: 'IFIAS — Britannia OneDrive Excel → parse, validate, LR writeback', badge: 'new' },
          { label: 'Invoices', route: '/accountant/invoices', icon: 'invoice', description: 'View and manage all invoices' },
        ],
      },
      {
        label: 'REVIEW',
        items: [
          { label: 'Finance Overview', route: '/finance', icon: 'arrowup', description: 'Invoices, transactions, banking & reports', badge: 'alerts' },
          { label: 'Payables Review', route: '/finance?tab=transactions&sub=payables', icon: 'arrowdown', description: 'Review vendor payables' },
          { label: 'Expense Review', route: '/finance?tab=transactions&sub=expenses', icon: 'receipt', description: 'Review approved expenses' },
        ],
      },
      {
        label: 'BANKING',
        items: [
          { label: 'Bank Accounts & Txns', route: '/accountant/banking', icon: 'bank', description: 'View accounts, upload statements & reconcile with Tally' },
        ],
      },
      {
        label: 'TOOLS',
        items: [
          { label: 'GST Verification', route: '/fleet/gst-verify', icon: 'shield', description: 'Verify GSTIN and GST filing status' },
        ],
      },
      {
        label: 'SYSTEM',
        items: [
          { label: 'Settings', route: '/settings', icon: 'settings', description: 'Account settings and preferences' },
        ],
      },
    ],
  },
  PROJECT_ASSOCIATES: {
    sections: [
      { label: 'Overview', items: [{ label: 'Dashboard', route: '/dashboard', icon: 'home', description: 'Company overview and quick KPIs' }] },
      {
        label: 'Operations',
        items: [
          { label: 'Lorry Receipts', route: '/lr', icon: 'file', description: 'Generate and manage LR documents' },
        ],
      },
      {
        label: 'Finance',
        items: [
          { label: 'Invoices', route: '/finance/invoices', icon: 'invoice', description: 'Generate invoices after trip completion' },
        ],
      },
      {
        label: 'Quick Actions',
        items: [
          { label: 'Create LR', route: '/lr/new', icon: 'fileplus', description: 'Create a new lorry receipt' },
        ],
      },
      {
        label: 'System',
        items: [
          { label: 'Attendance', route: '/my-work/attendance', icon: 'clock', description: 'Mark daily attendance with camera check-in' },
          { label: 'Settings', route: '/settings', icon: 'settings', description: 'System settings and preferences' },
        ],
      },
    ],
  },
  DRIVER: {
    sections: [
      { label: 'Overview', items: [{ label: 'Dashboard', route: '/dashboard', icon: 'home', description: 'Company overview and quick KPIs' }] },
      {
        label: 'My Work',
        items: [
          { label: 'My Trips', route: '/driver/trips', icon: 'map', description: 'Assigned trips and progress tracking' },
          { label: 'Attendance', route: '/driver/attendance', icon: 'clock', description: 'Daily check-in and attendance logs' },
          { label: 'Expenses', route: '/driver/expenses', icon: 'wallet', description: 'Submit and view trip expenses' },
          { label: 'My Documents', route: '/driver/documents', icon: 'folder', description: 'Personal and trip-related documents' },
        ],
      },
    ],
  },

  TYRE_INSPECTOR: {
    sections: [
      {
        label: 'Tyre Management',
        items: [
          { label: 'Tyres', route: '/fleet/tyres', icon: 'circle', description: 'Tyre lifecycle, stock & retreading' },
        ],
      },
    ],
  },

  PUMP_OPERATOR: {
    sections: [
      { label: 'Overview', items: [{ label: 'Fuel Dashboard', route: '/pump/dashboard', icon: 'gauge', description: 'Fuel stock levels and daily activity' }] },
      {
        label: 'Fuel Operations',
        items: [
          { label: 'Issue Fuel', route: '/pump/issue', icon: 'fuel', description: 'Dispense fuel to vehicles' },
          { label: 'Fuel Log', route: '/pump/log', icon: 'list', description: 'All fuel issue records' },
          { label: 'Tank Stock', route: '/pump/stock', icon: 'database', description: 'Tank levels and refill history' },
        ],
      },
      {
        label: 'Monitoring',
        items: [
          { label: 'Theft Alerts', route: '/pump/alerts', icon: 'alert', description: 'Anomaly detection alerts' },
          { label: 'Reports', route: '/pump/reports', icon: 'chart', description: 'Fuel consumption reports' },
          { label: 'Fuel Audit', route: '/pump/fuel-verification', icon: 'shield', description: 'Cross-verify pump vs driver records' },
        ],
      },
    ],
  },
  AUDITOR: {
    sections: [
      { label: 'Overview', items: [{ label: 'Dashboard', route: '/auditor/dashboard', icon: 'shield', description: 'Audit risk overview and exception summary' }] },
      {
        label: 'Operations',
        items: [
          { label: 'Trip Audit', route: '/auditor/trips', icon: 'truck', description: 'Review delayed, deviated, and empty runs' },
          { label: 'LR Profitability', route: '/auditor/lr-profitability', icon: 'trending-up', description: 'Per-LR revenue and profit margins' },
          { label: 'Fuel Efficiency', route: '/auditor/fuel', icon: 'fuel', description: 'Fuel consumption vs benchmark' },
        ],
      },
      {
        label: 'Finance',
        items: [
          { label: 'Expense Audit', route: '/auditor/expenses', icon: 'receipt', description: 'Anomaly-flagged and no-receipt expenses' },
          { label: 'Client Risk', route: '/auditor/clients', icon: 'users', description: 'Client risk scores and overdue aging' },
        ],
      },
      {
        label: 'Fleet',
        items: [
          { label: 'Maintenance Audit', route: '/auditor/maintenance', icon: 'wrench', description: 'Document expiry and pending services' },
        ],
      },
    ],
  },

  CLERK: {
    sections: [
      {
        label: 'Overview',
        items: [
          { label: 'Dashboard', route: '/clerk/dashboard', icon: 'home', description: 'Attendance and LR summary' },
        ],
      },
      {
        label: 'My Work',
        items: [
          { label: 'Attendance', route: '/clerk/attendance', icon: 'clock', description: 'Attendance history and check-in' },
        ],
      },
      {
        label: 'LR',
        items: [
          { label: 'All Lorry Receipts', route: '/lr', icon: 'file-text', description: 'View all lorry receipts' },
          { label: 'My LRs', route: '/clerk/lrs', icon: 'user', description: 'LRs created by you' },
          { label: 'Upload POD', route: '/clerk/pod', icon: 'upload', description: 'Upload proof of delivery documents' },
          { label: 'Create LR', route: '/lr/new', icon: 'plus', description: 'Create a new lorry receipt' },
        ],
      },
    ],
  },
};

export const enterpriseNavConfig: NavMenuGroup[] = [
  {
    label: 'Overview',
    path: '/dashboard',
  },
  {
    label: 'Masters',
    roles: ['admin', 'manager'],
    items: [
      { label: 'Clients', path: '/clients', permission: 'clients:read' },
      { label: 'Vehicles', path: '/vehicles', permission: 'vehicles:read' },
      { label: 'Drivers', path: '/drivers', permission: 'drivers:read' },
      { label: 'Driver Dashboard', path: '/drivers/dashboard', permission: 'drivers:read' },
    ],
  },
  {
    label: 'Operations',
    roles: ['admin', 'manager', 'fleet_manager', 'project_associate'],
    items: [
      { label: 'Lorry Receipts', path: '/lr', permission: 'lr:read' },
      { label: 'Trips', path: '/trips', permission: 'trips:read' },
    ],
  },
  {
    label: 'Finance',
    roles: ['admin'],
    items: [
      { label: 'Invoices', path: '/finance/invoices', permission: 'invoices:read', roles: ['admin', 'manager', 'fleet_manager', 'project_associate', 'accountant'] },
      { label: 'Payments', path: '/finance/payments', permission: 'payments:read' },
      { label: 'Ledger', path: '/finance/ledger', permission: 'ledger:read' },
      { label: 'Receivables', path: '/finance/receivables', permission: 'receivables:read', roles: ['admin', 'manager', 'accountant'] },
      { label: 'Payables', path: '/finance/payables', permission: 'payables:read', roles: ['admin', 'manager', 'accountant'] },
    ],
  },
  {
    label: 'Monitoring',
    roles: ['admin', 'manager', 'project_associate'],
    items: [
      { label: 'Live Tracking', path: '/tracking', permission: 'tracking:read' },
      { label: 'Alerts', path: '/alerts', permission: 'alerts:read' },
    ],
  },
  {
    label: 'Reports',
    roles: ['admin', 'manager', 'fleet_manager', 'accountant'],
    items: [
      { label: 'Reports', path: '/reports', permission: 'reports:read', roles: ['admin', 'manager', 'fleet_manager'] },
      { label: 'Fleet Reports', path: '/fleet/reports', roles: ['admin', 'fleet_manager'] },
      { label: 'Accountant Reports', path: '/accountant/reports', roles: ['admin', 'accountant'] },
    ],
  },
  {
    label: 'Fleet Manager',
    items: [
      { label: 'Fleet Dashboard', path: '/fleet', roles: ['admin', 'fleet_manager'] },
      { label: 'Fleet Vehicles', path: '/fleet/vehicles', roles: ['admin', 'fleet_manager'] },
      { label: 'Fleet Drivers', path: '/fleet/drivers', roles: ['admin', 'fleet_manager'] },
      { label: 'Live Tracking', path: '/tracking', roles: ['admin', 'fleet_manager'] },
      { label: 'Maintenance', path: '/fleet/maintenance', roles: ['admin', 'fleet_manager'] },
      { label: 'Fuel Mgmt', path: '/fleet/fuel', roles: ['admin', 'fleet_manager'] },
      { label: 'Tyres', path: '/fleet/tyres', roles: ['admin', 'fleet_manager'] },
      { label: 'Fleet Alerts', path: '/fleet/alerts', roles: ['admin', 'fleet_manager'] },
      { label: 'Fleet Reports', path: '/fleet/reports', roles: ['admin', 'fleet_manager'] },
      { label: 'Assign Drivers', path: '/fleet/assign-drivers', roles: ['admin', 'fleet_manager'] },
    ],
    roles: ['admin', 'fleet_manager'],
  },
  {
    label: 'Accountant',
    items: [
      { label: 'Finance Dashboard', path: '/accountant', roles: ['admin', 'accountant'] },
      { label: 'Invoice Workspace', path: '/accountant/invoice-workspace', roles: ['admin', 'accountant'] },
      { label: 'Invoices', path: '/accountant/invoices', roles: ['admin', 'accountant'] },
      { label: 'Receivables', path: '/accountant/receivables', roles: ['admin', 'accountant'] },
      { label: 'Payables', path: '/accountant/payables', roles: ['admin', 'accountant'] },
      { label: 'Expenses', path: '/accountant/expenses', roles: ['admin', 'accountant'] },
      { label: 'Fuel Expenses', path: '/accountant/fuel', roles: ['admin', 'accountant'] },
      { label: 'Banking', path: '/accountant/banking', roles: ['admin', 'accountant'] },
      { label: 'Ledger', path: '/accountant/ledger', roles: ['admin', 'accountant'] },
      { label: 'Reports', path: '/accountant/reports', roles: ['admin', 'accountant'] },
    ],
    roles: ['admin', 'accountant'],
  },
  {
    label: 'Tools',
    roles: ['admin', 'manager', 'fleet_manager', 'accountant'],
    items: [
      { label: 'Notifications', path: '/settings/notifications', roles: ['admin', 'manager'] },
    ],
  },
  {
    label: 'Admin',
    roles: ['admin'],
    items: [
      { label: 'Employees', path: '/admin/employees', roles: ['admin'] },
      { label: 'Attendance', path: '/admin/attendance', roles: ['admin'] },
      { label: 'Settings', path: '/settings', roles: ['admin'] },
    ],
  },
  {
    label: 'My Work',
    roles: ['driver', 'manager', 'fleet_manager', 'accountant', 'project_associate', 'clerk'],
    items: [
      { label: 'My Trips', path: '/driver/trips', roles: ['driver'] },
      { label: 'Attendance', path: '/my-work/attendance', roles: ['driver', 'manager', 'fleet_manager', 'accountant', 'project_associate', 'clerk'] },
      { label: 'Expenses', path: '/driver/expenses', roles: ['driver'] },
      { label: 'My Documents', path: '/driver/documents', roles: ['driver'] },
    ],
  },
  {
    label: 'Audit',
    roles: ['auditor'],
    items: [
      { label: 'Payment Proofs', path: '/auditor/payment-proofs', roles: ['auditor'] },
    ],
  },
  {
    label: 'LR',
    roles: ['clerk'],
    items: [
      { label: 'All Lorry Receipts', path: '/lr', roles: ['clerk'] },
      { label: 'My LRs', path: '/clerk/lrs', roles: ['clerk'] },
      { label: 'Upload POD', path: '/clerk/pod', roles: ['clerk'] },
      { label: 'Create LR', path: '/lr/new', roles: ['clerk'] },
    ],
  },
];
