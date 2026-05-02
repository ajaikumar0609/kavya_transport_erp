# Permission Middleware
# Transport ERP - Role-Based Access Control

from typing import List, Union

from fastapi import Depends, HTTPException, status

from app.core.security import TokenData, get_current_user


# Define all permissions
class Permissions:
    """All system permissions."""
    
    # Client Management
    CLIENT_CREATE = "client:create"
    CLIENT_READ = "client:read"
    CLIENT_UPDATE = "client:update"
    CLIENT_DELETE = "client:delete"
    
    # Job Management
    JOB_CREATE = "job:create"
    JOB_READ = "job:read"
    JOB_UPDATE = "job:update"
    JOB_DELETE = "job:delete"
    JOB_APPROVE = "job:approve"
    
    # LR Management
    LR_CREATE = "lr:create"
    LR_READ = "lr:read"
    LR_UPDATE = "lr:update"
    LR_DELETE = "lr:delete"
    
    # Trip Management
    TRIP_CREATE = "trip:create"
    TRIP_READ = "trip:read"
    TRIP_UPDATE = "trip:update"
    TRIP_DELETE = "trip:delete"
    TRIP_START = "trip:start"
    TRIP_COMPLETE = "trip:complete"
    
    # Vehicle Management
    VEHICLE_CREATE = "vehicle:create"
    VEHICLE_READ = "vehicle:read"
    VEHICLE_UPDATE = "vehicle:update"
    VEHICLE_DELETE = "vehicle:delete"
    
    # Driver Management
    DRIVER_CREATE = "driver:create"
    DRIVER_READ = "driver:read"
    DRIVER_UPDATE = "driver:update"
    DRIVER_DELETE = "driver:delete"
    
    # Finance - Invoice
    INVOICE_CREATE = "invoice:create"
    INVOICE_READ = "invoice:read"
    INVOICE_UPDATE = "invoice:update"
    INVOICE_DELETE = "invoice:delete"
    INVOICE_APPROVE = "invoice:approve"
    
    # Finance - Payment
    PAYMENT_CREATE = "payment:create"
    PAYMENT_READ = "payment:read"
    PAYMENT_UPDATE = "payment:update"
    PAYMENT_DELETE = "payment:delete"
    PAYMENT_PROOF_UPLOAD = "payment_proof:upload"
    PAYMENT_PROOF_READ = "payment_proof:read"
    PAYMENT_PROOF_REVIEW = "payment_proof:review"
    
    # Finance - Ledger
    LEDGER_READ = "ledger:read"
    LEDGER_EXPORT = "ledger:export"

    # Finance - Banking / Reconciliation
    BANKING_READ = "banking:read"
    BANKING_RECONCILE = "banking:reconcile"
    BANKING_IMPORT = "banking:import"

    # Finance - Settlements
    SETTLEMENT_READ = "settlement:read"
    SETTLEMENT_CREATE = "settlement:create"
    SETTLEMENT_APPROVE = "settlement:approve"
    
    # Reports
    REPORT_VIEW = "report:view"
    REPORT_EXPORT = "report:export"
    
    # Tracking
    TRACKING_VIEW = "tracking:view"
    TRACKING_LIVE = "tracking:live"
    
    # Alerts
    ALERT_VIEW = "alert:view"
    ALERT_MANAGE = "alert:manage"
    
    # Admin
    ADMIN_USERS = "admin:users"
    ADMIN_ROLES = "admin:roles"
    ADMIN_SETTINGS = "admin:settings"
    ADMIN_AUDIT = "admin:audit"
    
    # Fuel
    FUEL_CREATE = "fuel:create"
    FUEL_READ = "fuel:read"
    FUEL_APPROVE = "fuel:approve"
    FUEL_ISSUE = "fuel:issue"
    FUEL_STOCK_VIEW = "fuel:stock_view"
    FUEL_STOCK_EDIT = "fuel:stock_edit"
    FUEL_REPORTS = "fuel:reports"
    
    # Maintenance
    MAINTENANCE_CREATE = "maintenance:create"
    MAINTENANCE_READ = "maintenance:read"
    MAINTENANCE_APPROVE = "maintenance:approve"
    
    # Expense
    EXPENSE_CREATE = "expense:create"
    EXPENSE_READ = "expense:read"
    EXPENSE_UPDATE = "expense:update"
    EXPENSE_DELETE = "expense:delete"
    EXPENSE_APPROVE = "expense:approve"
    
    # User Management
    USER_CREATE = "user:create"
    USER_READ = "user:read"
    USER_UPDATE = "user:update"
    USER_DELETE = "user:delete"
    
    # E-way Bill
    EWAY_CREATE = "eway:create"
    EWAY_READ = "eway:read"
    EWAY_UPDATE = "eway:update"
    EWAY_DELETE = "eway:delete"
    EWAY_BILL_CREATE = "eway:create"
    EWAY_BILL_READ = "eway:read"
    EWAY_BILL_UPDATE = "eway:update"
    
    # Expense verify
    EXPENSE_VERIFY = "expense:approve"
    
    # Documents
    DOCUMENT_CREATE = "document:create"
    DOCUMENT_READ = "document:read"
    DOCUMENT_UPDATE = "document:update"
    DOCUMENT_DELETE = "document:delete"
    DOCUMENT_APPROVE = "document:approve"

    # Intelligence & Scoring (Section 3 RBAC+ matrix)
    GPS_DATA_READ = "gps:read"
    DRIVER_SCORE_READ = "driver_score:read"
    AUDIT_LOG_READ = "audit:read"
    AUDIT_LOG_EXPORT = "audit:export"
    SYSTEM_CONFIG_READ = "config:read"
    SYSTEM_CONFIG_UPDATE = "config:update"
    INTELLIGENCE_VIEW = "intelligence:view"
    EVENT_BUS_READ = "event:read"
    EVENT_BUS_ACK = "event:acknowledge"

    # GPS / Tracking
    GPS_PING_CREATE = "gps:ping_create"

    # Compliance
    COMPLIANCE_READ = "compliance:read"
    COMPLIANCE_MANAGE = "compliance:manage"

    # SOS
    SOS_TRIGGER = "sos:trigger"

    # Sync
    SYNC_CREATE = "sync:create"

# Role-Permission Mapping
ROLE_PERMISSIONS = {
    "admin": [
        # Admin has all permissions
        "*"  # Wildcard for all
    ],
    
    "manager": [
        # Client
        Permissions.CLIENT_CREATE, Permissions.CLIENT_READ, 
        Permissions.CLIENT_UPDATE, Permissions.CLIENT_DELETE,
        # Job
        Permissions.JOB_CREATE, Permissions.JOB_READ, 
        Permissions.JOB_UPDATE, Permissions.JOB_DELETE, Permissions.JOB_APPROVE,
        # LR
        Permissions.LR_CREATE, Permissions.LR_READ, Permissions.LR_UPDATE, Permissions.LR_DELETE,
        # E-way Bill
        Permissions.EWAY_CREATE, Permissions.EWAY_READ, Permissions.EWAY_UPDATE, Permissions.EWAY_DELETE,
        # Trip
        Permissions.TRIP_CREATE, Permissions.TRIP_READ, Permissions.TRIP_UPDATE, Permissions.TRIP_DELETE,
        # Vehicle
        Permissions.VEHICLE_CREATE, Permissions.VEHICLE_READ, 
        Permissions.VEHICLE_UPDATE, Permissions.VEHICLE_DELETE,
        # Driver
        Permissions.DRIVER_CREATE, Permissions.DRIVER_READ, 
        Permissions.DRIVER_UPDATE, Permissions.DRIVER_DELETE,
        # Invoice
        Permissions.INVOICE_CREATE, Permissions.INVOICE_READ,
        Permissions.INVOICE_UPDATE, Permissions.INVOICE_DELETE, Permissions.INVOICE_APPROVE,
        # Payment
        Permissions.PAYMENT_CREATE, Permissions.PAYMENT_READ,
        Permissions.PAYMENT_UPDATE, Permissions.PAYMENT_DELETE,
        # Ledger
        Permissions.LEDGER_READ, Permissions.LEDGER_EXPORT,
        # Fuel
        Permissions.FUEL_CREATE, Permissions.FUEL_READ, Permissions.FUEL_APPROVE,
        # Maintenance / Service
        Permissions.MAINTENANCE_CREATE, Permissions.MAINTENANCE_READ, Permissions.MAINTENANCE_APPROVE,
        # Expense
        Permissions.EXPENSE_CREATE, Permissions.EXPENSE_READ,
        Permissions.EXPENSE_UPDATE, Permissions.EXPENSE_DELETE, Permissions.EXPENSE_APPROVE,
        # Reports
        Permissions.REPORT_VIEW, Permissions.REPORT_EXPORT,
        # Tracking
        Permissions.TRACKING_VIEW, Permissions.TRACKING_LIVE,
        # Alerts
        Permissions.ALERT_VIEW, Permissions.ALERT_MANAGE,
        # Documents
        Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ,
        Permissions.DOCUMENT_UPDATE, Permissions.DOCUMENT_DELETE, Permissions.DOCUMENT_APPROVE,
        # User Management
        Permissions.USER_CREATE, Permissions.USER_READ, Permissions.USER_UPDATE,
        # Intelligence
        Permissions.GPS_DATA_READ, Permissions.DRIVER_SCORE_READ,
        Permissions.INTELLIGENCE_VIEW, Permissions.EVENT_BUS_READ, Permissions.EVENT_BUS_ACK,
        # Compliance
        Permissions.COMPLIANCE_READ, Permissions.COMPLIANCE_MANAGE,
    ],
    
    "fleet_manager": [
        # Trip
        Permissions.TRIP_CREATE, Permissions.TRIP_READ, 
        Permissions.TRIP_UPDATE, Permissions.TRIP_START, Permissions.TRIP_COMPLETE,
        # Job (read-only, needed to link trips to jobs)
        Permissions.JOB_READ,
        # E-way Bill (view only)
        Permissions.EWAY_BILL_READ,
        # Vehicle
        Permissions.VEHICLE_CREATE, Permissions.VEHICLE_READ, Permissions.VEHICLE_UPDATE,
        # Driver
        Permissions.DRIVER_CREATE, Permissions.DRIVER_READ, Permissions.DRIVER_UPDATE,
        # Client (read-only, needed to fill consignee on LR creation)
        Permissions.CLIENT_READ,
        # LR
        Permissions.LR_READ,
        # Invoice (view only for trip reference)
        Permissions.INVOICE_READ,
        # Fuel
        Permissions.FUEL_CREATE, Permissions.FUEL_READ, Permissions.FUEL_APPROVE,
        Permissions.FUEL_STOCK_VIEW, Permissions.FUEL_STOCK_EDIT, Permissions.FUEL_ISSUE,
        Permissions.FUEL_REPORTS,
        # Maintenance
        Permissions.MAINTENANCE_CREATE, Permissions.MAINTENANCE_READ, 
        Permissions.MAINTENANCE_APPROVE,
        # Expense (fuel/maintenance + view only; approvals handled by finance)
        Permissions.EXPENSE_CREATE, Permissions.EXPENSE_READ, Permissions.EXPENSE_UPDATE,
        # Tracking
        Permissions.TRACKING_VIEW, Permissions.TRACKING_LIVE,
        # Alerts
        Permissions.ALERT_VIEW, Permissions.ALERT_MANAGE,
        # Reports
        Permissions.REPORT_VIEW,
        # Documents
        Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ, Permissions.DOCUMENT_UPDATE,
        # User (read — needed for driver/user cross-reference in drivers dashboard and attendance)
        Permissions.USER_READ,
        # Intelligence
        Permissions.GPS_DATA_READ, Permissions.DRIVER_SCORE_READ,
        Permissions.INTELLIGENCE_VIEW, Permissions.EVENT_BUS_READ, Permissions.EVENT_BUS_ACK,
        # Compliance
        Permissions.COMPLIANCE_READ, Permissions.COMPLIANCE_MANAGE,
    ],
    
    "accountant": [
        # Invoice
        Permissions.INVOICE_CREATE, Permissions.INVOICE_READ, 
        Permissions.INVOICE_UPDATE, Permissions.INVOICE_DELETE,
        # Payment
        Permissions.PAYMENT_CREATE, Permissions.PAYMENT_READ, 
        Permissions.PAYMENT_UPDATE,
        # Ledger
        Permissions.LEDGER_READ, Permissions.LEDGER_EXPORT,
        # Banking
        Permissions.BANKING_READ, Permissions.BANKING_RECONCILE, Permissions.BANKING_IMPORT,
        # Settlements
        Permissions.SETTLEMENT_READ, Permissions.SETTLEMENT_CREATE, Permissions.SETTLEMENT_APPROVE,
        # Client (read only for billing)
        Permissions.CLIENT_READ,
        # Trip (read only for invoicing)
        Permissions.TRIP_READ,
        # Job (read only - needed for banking/invoicing dropdowns and Finance Hub)
        Permissions.JOB_READ,
        # E-way Bill (read only - needed for Finance Hub expiry alerts)
        Permissions.EWAY_BILL_READ,
        # Reports
        Permissions.REPORT_VIEW, Permissions.REPORT_EXPORT,
        # Expense
        Permissions.EXPENSE_CREATE, Permissions.EXPENSE_READ,
        Permissions.EXPENSE_UPDATE, Permissions.EXPENSE_DELETE,
        Permissions.EXPENSE_APPROVE,
        # Fuel & Maintenance (read for overview)
        Permissions.FUEL_READ,
        Permissions.MAINTENANCE_READ,
        # Vehicle & Driver (read only - needed for Finance Hub / expense dropdowns)
        Permissions.VEHICLE_READ,
        Permissions.DRIVER_READ,
        # User (read only - needed for employee dropdowns and user pages)
        Permissions.USER_READ,
        # Documents (read for vehicle/driver compliance view)
        Permissions.DOCUMENT_READ,
        # Alerts / Notifications
        Permissions.ALERT_VIEW,
    ],
    
    "project_associate": [
        # LR
        Permissions.LR_CREATE, Permissions.LR_READ, Permissions.LR_UPDATE,
        # E-way Bill
        Permissions.EWAY_CREATE, Permissions.EWAY_READ, Permissions.EWAY_UPDATE,
        # Trip
        Permissions.TRIP_CREATE, Permissions.TRIP_READ, Permissions.TRIP_UPDATE,
        # Job
        Permissions.JOB_CREATE, Permissions.JOB_READ, Permissions.JOB_UPDATE,
        # Invoice (generate after trip + view)
        Permissions.INVOICE_CREATE, Permissions.INVOICE_READ,
        # Expense (trip-related create + view)
        Permissions.EXPENSE_CREATE, Permissions.EXPENSE_READ,
        Permissions.EXPENSE_UPDATE, Permissions.EXPENSE_DELETE,
        # Ledger (limited view)
        Permissions.LEDGER_READ,
        # Banking (create entries + read own + view approved)
        Permissions.BANKING_READ, Permissions.BANKING_RECONCILE,
        # Client
        Permissions.CLIENT_READ,
        # Vehicle
        Permissions.VEHICLE_READ,
        # Driver
        Permissions.DRIVER_READ,
        # User (read — needed for driver user cross-reference on Create LR and Attendance)
        Permissions.USER_READ,
        # Documents
        Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ, Permissions.DOCUMENT_UPDATE,
        # Alerts / Notifications
        Permissions.ALERT_VIEW,
    ],
    
    "driver": [
        # Trip (own trips only)
        Permissions.TRIP_READ, Permissions.TRIP_UPDATE, Permissions.TRIP_START, Permissions.TRIP_COMPLETE,
        # Expense (own expenses)
        Permissions.EXPENSE_CREATE, Permissions.EXPENSE_READ,
        # Fuel (own entries)
        Permissions.FUEL_CREATE, Permissions.FUEL_READ,
        # LR (read own)
        Permissions.LR_READ,
        # Documents (upload receipts, read own)
        Permissions.DOCUMENT_CREATE, Permissions.DOCUMENT_READ,
        # Alerts / Notifications
        Permissions.ALERT_VIEW,
        # Intelligence (own data only — enforced in endpoints)
        Permissions.GPS_DATA_READ, Permissions.DRIVER_SCORE_READ,
        # GPS ping (own trip only — enforced in endpoint)
        Permissions.GPS_PING_CREATE,
        # SOS
        Permissions.SOS_TRIGGER,
        # Offline sync
        Permissions.SYNC_CREATE,
    ],

    "finance_manager": [
        # Payment (full access for payroll, payouts)
        Permissions.PAYMENT_CREATE, Permissions.PAYMENT_READ,
        Permissions.PAYMENT_UPDATE, Permissions.PAYMENT_DELETE,
        # Expense (approve / reimburse)
        Permissions.EXPENSE_READ, Permissions.EXPENSE_APPROVE,
        Permissions.EXPENSE_CREATE, Permissions.EXPENSE_UPDATE,
        # Invoice (read for context)
        Permissions.INVOICE_READ,
        # Ledger (read)
        Permissions.LEDGER_READ, Permissions.LEDGER_EXPORT,
        # Banking
        Permissions.BANKING_READ,
        # Settlements
        Permissions.SETTLEMENT_READ, Permissions.SETTLEMENT_CREATE, Permissions.SETTLEMENT_APPROVE,
        # Trip & Job (read only - needed for Finance Hub / expense context)
        Permissions.TRIP_READ,
        Permissions.JOB_READ,
        # Driver / Vehicle (read for salary / advance context)
        Permissions.DRIVER_READ,
        Permissions.VEHICLE_READ,
        # E-way Bill (read only - needed for Finance Hub expiry alerts)
        Permissions.EWAY_BILL_READ,
        # Fuel (approve top-up payments, read stock)
        Permissions.FUEL_READ, Permissions.FUEL_APPROVE, Permissions.FUEL_STOCK_EDIT,
        # Reports
        Permissions.REPORT_VIEW, Permissions.REPORT_EXPORT,
        # User (read for employee list)
        Permissions.USER_READ,
        # Documents
        Permissions.DOCUMENT_READ,
        # Alerts
        Permissions.ALERT_VIEW,
    ],

    "pump_operator": [
        # Fuel management (core responsibility)
        Permissions.FUEL_ISSUE, Permissions.FUEL_CREATE, Permissions.FUEL_READ,
        Permissions.FUEL_STOCK_VIEW, Permissions.FUEL_STOCK_EDIT,
        Permissions.FUEL_REPORTS,
        # Vehicle (read only for dispensing)
        Permissions.VEHICLE_READ,
        # Driver (read only for dispensing)
        Permissions.DRIVER_READ,
        # Alerts / Notifications
        Permissions.ALERT_VIEW,
    ],

    "tyre_inspector": [
        # Vehicle (read — browse fleet; update — fit/move/remove tyres)
        Permissions.VEHICLE_READ,
        Permissions.VEHICLE_UPDATE,
        # Driver (read — context for trip/vehicle assignment)
        Permissions.DRIVER_READ,
        # Alerts / Notifications
        Permissions.ALERT_VIEW,
    ],

    "auditor": [
        # Core read access for all auditable data
        Permissions.REPORT_VIEW,
        Permissions.TRIP_READ,
        Permissions.EXPENSE_READ,
        Permissions.CLIENT_READ,
        Permissions.VEHICLE_READ,
        Permissions.DRIVER_READ,
        Permissions.LR_READ,
        Permissions.INVOICE_READ,
        Permissions.PAYMENT_READ,
        Permissions.PAYMENT_PROOF_READ,
        Permissions.PAYMENT_PROOF_REVIEW,
        Permissions.FUEL_READ,
        Permissions.MAINTENANCE_READ,
        Permissions.DOCUMENT_READ,
        Permissions.AUDIT_LOG_READ,
        Permissions.AUDIT_LOG_EXPORT,
        Permissions.ALERT_VIEW,
    ],

    "clerk": [
        # Clerks can create and read LRs, and mark their own attendance
        Permissions.LR_CREATE,
        Permissions.LR_READ,
        Permissions.LR_UPDATE,
        # Needed to populate dropdowns on the Create LR form
        Permissions.CLIENT_READ,
        Permissions.VEHICLE_READ,
        Permissions.DRIVER_READ,
        Permissions.TRIP_READ,
        Permissions.ALERT_VIEW,
        Permissions.ATTENDANCE_CREATE,
        Permissions.ATTENDANCE_READ,
    ],
}


def _is_admin_role(user_roles: List[str]) -> bool:
    """Check whether the user has an admin role."""
    return any(role.lower() == "admin" for role in user_roles)


def has_permission(user_roles: List[str], required_permission: str) -> bool:
    """Check if any of user's roles has the required permission."""
    for role in user_roles:
        role = role.lower()
        if role in ROLE_PERMISSIONS:
            role_perms = ROLE_PERMISSIONS[role]
            # Wildcard check (admin)
            if "*" in role_perms:
                return True
            # Direct permission check
            if required_permission in role_perms:
                return True
    return False


def has_any_permission(user_roles: List[str], required_permissions: List[str]) -> bool:
    """Check if user has ANY of the required permissions."""
    for permission in required_permissions:
        if has_permission(user_roles, permission):
            return True
    return False


def has_all_permissions(user_roles: List[str], required_permissions: List[str]) -> bool:
    """Check if user has ALL of the required permissions."""
    for permission in required_permissions:
        if not has_permission(user_roles, permission):
            return False
    return True


def require_permission(permission: Union[str, List[str]]):
    """
    Dependency factory for requiring a specific permission.
    
    Usage:
        @app.get("/clients")
        async def list_clients(
            current_user: TokenData = Depends(require_permission(Permissions.CLIENT_READ))
        ):
            ...
    """
    async def permission_checker(
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        required_permissions = [permission] if isinstance(permission, str) else permission

        # Explicit admin bypass for resilience across permission models.
        if _is_admin_role(current_user.roles):
            return current_user

        # Prefer explicit permissions from JWT when present.
        user_permissions = set(current_user.permissions or [])
        if user_permissions:
            if "*" in user_permissions or any(req in user_permissions for req in required_permissions):
                return current_user

        # Backward-compatible fallback to role-permission map.
        if not has_any_permission(current_user.roles, required_permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required any of: {required_permissions}"
            )
        return current_user
    
    return permission_checker


def require_any_permission(permissions: List[str]):
    """
    Dependency factory for requiring ANY of the specified permissions.
    """
    async def permission_checker(
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        if _is_admin_role(current_user.roles):
            return current_user

        user_permissions = set(current_user.permissions or [])
        if user_permissions:
            if "*" in user_permissions or any(req in user_permissions for req in permissions):
                return current_user

        if not has_any_permission(current_user.roles, permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required any of: {permissions}"
            )
        return current_user
    
    return permission_checker


def require_all_permissions(permissions: List[str]):
    """
    Dependency factory for requiring ALL specified permissions.
    """
    async def permission_checker(
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        if _is_admin_role(current_user.roles):
            return current_user

        user_permissions = set(current_user.permissions or [])
        if user_permissions:
            if "*" in user_permissions or all(req in user_permissions for req in permissions):
                return current_user

        if not has_all_permissions(current_user.roles, permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied. Required all of: {permissions}"
            )
        return current_user
    
    return permission_checker


def require_role(roles: Union[str, List[str]]):
    """
    Dependency factory for requiring specific role(s).
    
    Usage:
        @app.get("/admin/users")
        async def admin_users(
            current_user: TokenData = Depends(require_role("admin"))
        ):
            ...
    """
    if isinstance(roles, str):
        roles = [roles]
    
    roles_lower = [r.lower() for r in roles]
    
    async def role_checker(
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        user_roles_lower = [r.lower() for r in current_user.roles]
        
        if not any(role in user_roles_lower for role in roles_lower):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role required: {roles}"
            )
        return current_user
    
    return role_checker


class PermissionChecker:
    """
    Class-based permission checker for more complex scenarios.
    
    Usage:
        permission = PermissionChecker(Permissions.CLIENT_READ)
        
        @app.get("/clients")
        async def list_clients(
            current_user: TokenData = Depends(permission)
        ):
            ...
    """
    
    def __init__(
        self,
        required_permissions: Union[str, List[str]],
        require_all: bool = False
    ):
        if isinstance(required_permissions, str):
            required_permissions = [required_permissions]
        self.required_permissions = required_permissions
        self.require_all = require_all
    
    async def __call__(
        self,
        current_user: TokenData = Depends(get_current_user)
    ) -> TokenData:
        if _is_admin_role(current_user.roles):
            return current_user

        user_permissions = set(current_user.permissions or [])

        if self.require_all:
            if user_permissions:
                has_required = "*" in user_permissions or all(
                    req in user_permissions for req in self.required_permissions
                )
            else:
                has_required = has_all_permissions(current_user.roles, self.required_permissions)

            if not has_required:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )
        else:
            if user_permissions:
                has_required = "*" in user_permissions or any(
                    req in user_permissions for req in self.required_permissions
                )
            else:
                has_required = has_any_permission(current_user.roles, self.required_permissions)

            if not has_required:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )
        
        return current_user


def get_user_permissions(roles: List[str]) -> List[str]:
    """Get all permissions for given roles."""
    permissions = set()
    
    for role in roles:
        role = role.lower()
        if role in ROLE_PERMISSIONS:
            role_perms = ROLE_PERMISSIONS[role]
            if "*" in role_perms:
                # Return all permissions for admin
                return list(set(
                    value for name, value in vars(Permissions).items() 
                    if not name.startswith('_')
                ))
            permissions.update(role_perms)
    
    return list(permissions)
