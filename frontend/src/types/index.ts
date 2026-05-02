// ============================================================
// Transport ERP - TypeScript Type Definitions
// ============================================================

// ---- Enums ----
export type RoleType = 'admin' | 'manager' | 'fleet_manager' | 'accountant' | 'finance_manager' | 'project_associate' | 'driver' | 'pump_operator' | 'auditor' | 'tyre_inspector' | 'clerk';

export type VehicleType = 'truck' | 'trailer' | 'tanker' | 'container' | 'mini_truck' | 'lcv' | 'pickup' | 'other';
export type VehicleStatus = 'available' | 'on_trip' | 'maintenance' | 'breakdown' | 'inactive';
export type OwnershipType = 'owned' | 'leased' | 'attached' | 'market';

export type DriverStatus = 'available' | 'on_trip' | 'on_leave' | 'suspended' | 'inactive';
export type LicenseType = 'LMV' | 'HMV' | 'HGMV' | 'HTV' | 'other';

export type JobStatus = 'draft' | 'pending_approval' | 'approved' | 'documentation' | 'trip_created' | 'in_progress' | 'in_transit' | 'delivered' | 'closure_pending' | 'closed' | 'completed' | 'cancelled' | 'on_hold';
export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ContractType = 'spot' | 'contract' | 'dedicated';
export type JobType = 'own' | 'market';

export type LRStatus = 'draft' | 'generated' | 'in_transit' | 'delivered' | 'pod_received' | 'cancelled';
export type PaymentMode = 'to_pay' | 'paid' | 'to_be_billed' | 'fod';

export type EwayBillStatus = 'draft' | 'generated' | 'active' | 'in_transit' | 'cancelled' | 'completed' | 'expired' | 'extended';
export type TransactionType = 'outward' | 'inward';
export type EwayDocumentType = 'tax_invoice' | 'bill_of_supply' | 'bill_of_entry' | 'delivery_challan' | 'credit_note' | 'others';
export type TransportMode = 'road' | 'rail' | 'air' | 'ship';
export type VehicleCategory = 'regular' | 'over_dimensional_cargo';

export type TripStatus = 'planned' | 'vehicle_assigned' | 'driver_assigned' | 'ready' | 'started' | 'loading' | 'in_transit' | 'unloading' | 'completed' | 'cancelled';
export type ExpenseCategory = 'fuel' | 'toll' | 'food' | 'parking' | 'loading' | 'unloading' | 'police' | 'rto' | 'repair' | 'tyre' | 'misc' | 'advance';

export type InvoiceStatus = 'draft' | 'pending' | 'sent' | 'partial' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'disputed';
export type InvoiceType = 'tax_invoice' | 'proforma' | 'credit_note' | 'debit_note';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'reversed';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'card' | 'neft' | 'rtgs' | 'adjustment';
export type LedgerType = 'receivable' | 'payable' | 'income' | 'expense' | 'asset' | 'liability' | 'debit' | 'credit';

// Banking Module Types
export type BankingEntryType = 'PAYMENT_RECEIVED' | 'PAYMENT_MADE' | 'BANK_TRANSFER' | 'CASH_DEPOSIT' | 'CASH_WITHDRAWAL' | 'JOURNAL_ENTRY';
export type CSVMatchStatus = 'MATCHED' | 'UNMATCHED' | 'EXCEPTION' | 'IGNORED';
export type ReconciliationStatus = 'unmatched' | 'matched' | 'exception' | 'manual' | 'ignored';

export interface BankingEntry {
  id: number;
  entry_no: string;
  account_id: number;
  account_name?: string;
  entry_date: string;
  entry_type: BankingEntryType;
  amount_paise: number;
  payment_method?: PaymentMethod;
  reference_no?: string;
  client_id?: number;
  client_name?: string;
  job_id?: number;
  invoice_id?: number;
  transfer_to_account_id?: number;
  description?: string;
  reconciled: boolean;
  created_by?: number;
  created_at: string;
}

export interface BankBalance {
  account_id: number;
  account_name: string;
  bank_name: string;
  account_number: string;
  current_balance: number;
  opening_balance_paise?: number;
  alert_threshold_paise?: number;
}

export interface BankBalanceSummary {
  accounts: BankBalance[];
  total_balance_paise: number;
  total_balance_rupees: number;
}

export interface CSVImportPreview {
  import_id: number;
  filename: string;
  bank_detected: string;
  total_rows: number;
  matched: number;
  unmatched: number;
  exceptions: number;
}

export interface CSVTransaction {
  id: number;
  import_id: number;
  txn_date: string;
  description: string;
  reference_no?: string;
  debit_paise: number;
  credit_paise: number;
  balance_paise: number;
  match_status: CSVMatchStatus;
  matched_entry_id?: number;
  matched_invoice_id?: number;
}

export interface EWBComplianceResult {
  compliant: boolean;
  reason?: string;
  bills: Array<{
    id: number;
    ewb_number: string;
    status: string;
    valid_until?: string;
    hours_remaining: number;
    is_valid: boolean;
    is_expired: boolean;
  }>;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type MarketTripStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'settled' | 'cancelled';
export type SupplierType = 'broker' | 'fleet_owner' | 'individual';

export type GeofenceType = 'route' | 'zone' | 'loading' | 'unloading' | 'fuel_station' | 'restricted';
export type DriverEventType = 'harsh_brake' | 'harsh_accel' | 'overspeed' | 'night_driving' | 'excessive_idle' | 'geofence_breach' | 'unauthorized_halt' | 'sos';
export type ComplianceAlertType = 'expired' | 'critical' | 'warning' | 'info';
export type ComplianceAlertSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AuditNoteStatus = 'open' | 'resolved';

// ---- Auth ----
export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  role: RoleType;
}

// ---- User ----
export interface User {
  id: number;
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  is_active?: boolean;
  roles: string[];  // Backend returns string array like ["admin"]
  permissions: string[];
  branch_id?: number;
  tenant_id?: number;
  redirect_to?: string;
  created_at?: string;
  updated_at?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;
  joining_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  bank_account_holder?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_type?: string;
  upi_id?: string;
  salary_amount?: string;
  pay_type?: string;
  aadhaar_file_url?: string;
  aadhaar_file_name?: string;
}

export interface Role {
  id: number;
  name: RoleType;
  display_name: string;
  description?: string;
}

export interface Permission {
  id: number;
  module: string;
  action: string;
  description?: string;
}

export interface Branch {
  id: number;
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  is_active: boolean;
  tenant_id?: number;
  created_at?: string;
}

// ---- Client ----
export interface Client {
  id: number;
  name: string;
  code: string;
  client_type: string;
  contact_person?: string;
  legal_name?: string;
  trade_name?: string;
  nature_of_business?: string;
  designation?: string;
  gst_number?: string;
  gstin?: string;
  pan_number?: string;
  pan?: string;
  tan?: string;
  reg_type?: string;
  date_of_liability?: string;
  assessment_year?: string;
  email?: string;
  phone?: string;
  alt_phone?: string;
  website?: string;
  industry?: string;
  company_size?: string;
  address_line1?: string;
  billing_address?: string;
  city?: string;
  billing_city?: string;
  state?: string;
  billing_state?: string;
  pincode?: string;
  billing_pincode?: string;
  tds_rate?: string;
  tax_exempt?: boolean;
  name_deductor?: string;
  name_deductee?: string;
  pan_deductor?: string;
  pan_deductee?: string;
  nature_payment?: string;
  tds_amount?: string;
  credit_limit: number;
  credit_days: number;
  outstanding_amount: number;
  invoice_frequency?: string;
  payment_method?: string;
  bank_account?: string;
  ifsc_code?: string;
  is_active: boolean;
  contacts: ClientContact[];
  created_at: string;
}

export interface ClientContact {
  id: number;
  name: string;
  designation?: string;
  email?: string;
  phone: string;
  is_primary: boolean;
}

// ---- Vehicle ----
export interface Vehicle {
  id: number;
  registration_number: string;
  vehicle_type: VehicleType;
  vehicle_size_class?: string;
  axle_wheel_type?: string;
  status: VehicleStatus;
  ownership_type: OwnershipType;
  make: string;
  model: string;
  year: number;
  chassis_number?: string;
  engine_number?: string;
  year_of_manufacture?: number;
  capacity_tons: number;
  capacity_volume?: number;
  fuel_type: string;
  mileage_per_liter?: number;
  gps_device_id?: string;
  gps_enabled: boolean;
  current_location?: string;
  fitness_valid_until?: string;
  insurance_valid_until?: string;
  permit_valid_until?: string;
  puc_valid_until?: string;
  current_driver_id?: number;
  total_km_run: number;
  is_active: boolean;
  created_at: string;
}

export interface VehicleDocument {
  id: number;
  vehicle_id: number;
  document_type: string;
  document_number: string;
  issue_date: string;
  expiry_date?: string;
  file_url?: string;
}

export interface VehicleMaintenance {
  id: number;
  vehicle_id: number;
  maintenance_type: string;
  description: string;
  cost: number;
  odometer_reading?: number;
  date: string;
  next_due_date?: string;
  vendor_name?: string;
  status: string;
}

// ---- Driver ----
export interface Driver {
  id: number;
  employee_id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  phone: string;
  alternate_phone?: string;
  email?: string;
  status: DriverStatus | 'rest';
  date_of_birth?: string;
  blood_group?: string;
  photo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  aadhaar_number?: string;
  pan_number?: string;
  license_number: string;
  license_type: LicenseType | string;
  license_expiry: string;
  joining_date: string;
  designation?: string;
  salary_type?: string;
  salary_base: number;
  per_km_rate?: number;
  bank_name?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  is_hazmat_certified?: boolean;
  is_adr_certified?: boolean;
  assigned_vehicle?: string;
  assigned_vehicle_id?: number;
  current_trip?: string;
  current_trip_id?: number;
  current_vehicle_id?: number;
  current_location?: string;
  security_pin?: string;
  total_trips: number;
  total_km: number;
  rating: number;
  performance_score?: number;
  safety_score?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface DriverDashboard {
  kpis: {
    total_drivers: number;
    active_drivers: number;
    on_trip: number;
    available: number;
    on_leave: number;
    resting: number;
    license_expiring_soon: number;
    license_expired: number;
    avg_rating: number;
    avg_safety_score: number;
    total_alerts: number;
  };
  charts: {
    utilization: { label: string; date: string; on_trip: number; available: number; on_leave: number; resting: number }[];
    trips_per_driver: { label: string; value: number; driver_id: number }[];
    performance_trends: { label: string; avg_rating: number; avg_safety_score: number; trips_completed: number; on_time_pct: number }[];
    status_distribution: { label: string; value: number; color: string }[];
  };
  alerts: DriverAlert[];
}

export interface DriverAlert {
  id: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  driver_id: number;
  driver_name: string;
  expiry_date?: string;
  days_overdue?: number;
  days_remaining?: number;
  created_at: string;
}

export interface DriverTrip {
  id: number;
  trip_number: string;
  origin: string;
  destination: string;
  route: string;
  vehicle_registration: string;
  distance_km: number;
  start_date: string;
  end_date?: string;
  status: string;
  earnings: number;
  on_time: boolean;
  rating?: number;
}

export interface DriverBehaviour {
  driver_id: number;
  driver_name: string;
  period: string;
  metrics: {
    safety_score: number;
    safety_grade: string;
    average_speed_kmh: number;
    max_speed_kmh: number;
    harsh_braking_events: number;
    harsh_acceleration_events: number;
    over_speed_alerts: number;
    idle_time_hours: number;
    night_driving_hours: number;
    rest_compliance_pct: number;
    seatbelt_compliance_pct: number;
    fuel_efficiency_kmpl: number;
  };
  daily_trends: { date: string; label: string; safety_score: number; speed_avg: number; harsh_braking: number; idle_minutes: number }[];
  events: Record<string, { count: number; trend: string }>;
  speed_distribution: { range: string; percentage: number }[];
}

export interface DriverDocument {
  id: number;
  document_type: string;
  label: string;
  document_number: string;
  mandatory: boolean;
  status: string;
  approval_status: string;
  file_url?: string;
  issue_date?: string;
  expiry_date?: string;
  expiry_status: string;
  uploaded_at?: string;
  verified: boolean;
  remarks?: string;
}

export interface DriverPerformance {
  driver_id: number;
  driver_name: string;
  overall_score: number;
  grade: string;
  rating: number;
  components: Record<string, { score: number; weight: number; label: string }>;
  monthly_trend: { month: string; overall: number; trips_completed: number; on_time_pct: number; safety_score: number; fuel_efficiency: number; feedback_avg: number }[];
  fleet_comparison: Record<string, number>;
  stats: { total_trips: number; total_km: number; active_days: number; avg_daily_km: number };
}

export interface DriverAttendanceRecord {
  date: string;
  day: string;
  status: string;
  check_in?: string;
  check_out?: string;
  hours_worked: number;
  trip_id?: number;
  remarks?: string;
}

export interface DriverAttendance {
  items: DriverAttendanceRecord[];
  summary: {
    total_days: number;
    present_days: number;
    absent_days: number;
    half_days: number;
    leave_days: number;
    on_trip_days: number;
    weekly_off: number;
    total_hours: number;
    attendance_pct: number;
  };
}

// ---- Job / Order ----
export interface Job {
  id: number;
  job_number: string;
  client_id: number;
  client?: Client;
  status: JobStatus;
  priority: JobPriority;
  contract_type: ContractType;
  job_type: JobType;
  origin: string;
  origin_address?: string;
  origin_city?: string;
  destination: string;
  destination_address?: string;
  destination_city?: string;
  route_id?: number;
  cargo_type: string;
  cargo_description?: string;
  material_type?: string;
  weight_tons?: number;
  volume?: number;
  num_packages?: number;
  quantity?: number;
  quantity_unit?: string;
  rate: number;
  agreed_rate?: number;
  total_amount?: number;
  estimated_cost?: number;
  budget_amount?: number;
  agreed_amount?: number;
  pickup_date: string;
  delivery_date?: string;
  expected_delivery_date?: string;
  special_instructions?: string;
  vehicle_id?: number;
  driver_id?: number;
  assigned_to?: number;
  approved_by?: number;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// ---- Supplier ----
export interface Supplier {
  id: number;
  name: string;
  code: string;
  supplier_type: SupplierType;
  contact_person?: string;
  phone: string;
  email?: string;
  pan?: string;
  gstin?: string;
  aadhaar?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_name?: string;
  rate_card?: Record<string, number>;
  tds_applicable: boolean;
  tds_rate: number;
  credit_limit?: number;
  credit_days?: number;
  is_active: boolean;
  tenant_id?: number;
  branch_id?: number;
  created_at: string;
  updated_at: string;
}

// ---- Market Trip ----
export interface MarketTrip {
  id: number;
  job_id: number;
  job?: Job;
  supplier_id: number;
  supplier?: Supplier;
  vehicle_registration: string;
  driver_name?: string;
  driver_phone?: string;
  driver_license?: string;
  client_rate: number;
  contractor_rate: number;
  margin?: number;
  purchase_invoice_id?: number;
  tds_rate?: number;
  tds_amount?: number;
  net_payable?: number;
  status: MarketTripStatus;
  assigned_at?: string;
  delivered_at?: string;
  settled_at?: string;
  settlement_reference?: string;
  tenant_id?: number;
  branch_id?: number;
  created_at: string;
  updated_at: string;
}

// ---- Geofence ----
export interface Geofence {
  id: number;
  name: string;
  geofence_type: GeofenceType;
  trip_id?: number;
  route_id?: number;
  polygon?: { lat: number; lng: number }[];
  center_lat?: number;
  center_lng?: number;
  radius_meters?: number;
  alert_threshold_meters: number;
  speed_limit_kmph?: number;
  is_active: boolean;
  tenant_id?: number;
  branch_id?: number;
  created_at: string;
  updated_at: string;
}

// ---- Compliance Alert ----
export interface ComplianceAlertRecord {
  id: number;
  document_id?: number;
  vehicle_id?: number;
  driver_id?: number;
  alert_type: ComplianceAlertType;
  severity: ComplianceAlertSeverity;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: number;
  due_date?: string;
  resolved: boolean;
  resolved_by?: number;
  resolved_at?: string;
  tenant_id?: number;
  branch_id?: number;
  created_at: string;
  updated_at: string;
}

// ---- Driver Event ----
export interface DriverEvent {
  id: number;
  driver_id: number;
  trip_id?: number;
  vehicle_id?: number;
  event_type: DriverEventType;
  severity: number;
  latitude?: number;
  longitude?: number;
  location_name?: string;
  speed_kmph?: number;
  details?: Record<string, any>;
  tenant_id?: number;
  branch_id?: number;
  created_at: string;
}

// ---- Audit Note ----
export interface AuditNote {
  id: number;
  resource_type: string;
  resource_id: number;
  note_text: string;
  status: AuditNoteStatus;
  auditor_id: number;
  resolved_by?: number;
  resolved_at?: string;
  tenant_id?: number;
  branch_id?: number;
  created_at: string;
  updated_at: string;
}

// ---- AIS-140 ----
export interface AIS140CheckResult {
  vehicle_id: number;
  registration_number: string;
  checks: {
    gps_device: boolean;
    emergency_button: boolean;
    driver_mapped: boolean;
    position_reporting: boolean;
  };
  compliant: boolean;
  issues: string[];
}

export interface FleetComplianceReport {
  total_vehicles: number;
  compliant: number;
  non_compliant: number;
  compliance_pct: number;
  vehicles: AIS140CheckResult[];
}

export interface ComplianceAlertSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DriverEventSummary {
  event_type: string;
  count: number;
}

// ---- Driver Scoring (Phase C) ----
export type ScoreTier = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' | 'UNSAFE';

export interface DriverScore {
  driver_id: number;
  month: number;
  year: number;
  score: number;
  tier: ScoreTier;
  total_penalty: number;
  total_events: number;
  event_counts: Record<string, number>;
}

export interface DriverScoreBreakdown {
  driver_id: number;
  month: number;
  year: number;
  score: number;
  tier: ScoreTier;
  categories: DriverScoreCategory[];
}

export interface DriverScoreCategory {
  event_type: string;
  count: number;
  penalty: number;
  base_rate: number;
}

export interface DriverScoreTrend {
  driver_id: number;
  trend: DriverScoreTrendPoint[];
}

export interface DriverScoreTrendPoint {
  month: number;
  year: number;
  label: string;
  score: number;
  tier: ScoreTier;
  total_events: number;
}

export interface LeaderboardEntry {
  rank: number;
  driver_id: number;
  driver_name: string;
  employee_code: string;
  phone: string;
  score: number;
  tier: ScoreTier;
  total_events: number;
  total_penalty: number;
}

export interface LeaderboardData {
  month: number;
  year: number;
  total_drivers: number;
  entries: LeaderboardEntry[];
}

export interface FleetScoreDistribution {
  month: number;
  year: number;
  total_drivers: number;
  distribution: Record<ScoreTier, number>;
  average_score: number;
  top5: LeaderboardEntry[];
  bottom5: LeaderboardEntry[];
}

export interface CoachingNote {
  id: number;
  driver_id: number;
  coach_id: number;
  note_text: string;
  category?: string;
  status: string;
  created_at: string;
}

// ---- LR (Lorry Receipt) ----
export interface LR {
  id: number;
  lr_number: string;
  job_id: number;
  job?: Job;
  job_number?: string;
  trip_id?: number;
  status: LRStatus;
  lr_date: string;
  consignor_name: string;
  consignor_address?: string;
  consignor_gstin?: string;
  consignor_gst?: string;
  consignor_phone?: string;
  consignee_name: string;
  consignee_address?: string;
  consignee_gstin?: string;
  consignee_gst?: string;
  consignee_phone?: string;
  origin: string;
  destination: string;
  vehicle_id?: number;
  vehicle_registration?: string;
  driver_id?: number;
  driver_name?: string;
  driver_phone?: string;
  transport_type?: string;
  eway_bill_number?: string;
  eway_bill_date?: string;
  eway_bill_expiry?: string;
  eway_bill_valid_until?: string;
  payment_mode: PaymentMode;
  freight_amount: number;
  total_freight: number;
  advance_amount?: number;
  balance_amount?: number;
  loading_charges?: number;
  unloading_charges?: number;
  detention_charges?: number;
  other_charges?: number;
  total_weight?: number;
  total_packages?: number;
  declared_value?: number;
  pod_uploaded: boolean;
  pod_received?: boolean;
  pod_date?: string;
  pod_file_url?: string;
  items: LRItem[];
  created_at: string;
  updated_at?: string;
}

export interface LRItem {
  id: number;
  lr_id: number;
  description: string;
  quantity: number;
  weight?: number;
  unit: string;
  rate?: number;
  amount?: number;
  invoice_number?: string;
  invoice_value?: number;
}

// ---- E-way Bill ----
export interface EwayBill {
  id: number;
  eway_bill_number: string;
  eway_bill_date: string;
  status: EwayBillStatus;
  transaction_type: TransactionType;
  transaction_sub_type?: string;
  document_type: EwayDocumentType;
  document_number?: string;
  document_date?: string;
  job_id: number;
  job_number?: string;
  lr_id?: number;
  lr_number?: string;
  client_name?: string;
  supplier_name: string;
  supplier_gstin?: string;
  supplier_address?: string;
  supplier_city?: string;
  supplier_state?: string;
  supplier_state_code?: string;
  supplier_pincode?: string;
  supplier_phone?: string;
  recipient_name: string;
  recipient_gstin?: string;
  recipient_address?: string;
  recipient_city?: string;
  recipient_state?: string;
  recipient_state_code?: string;
  recipient_pincode?: string;
  recipient_phone?: string;
  transport_mode: TransportMode;
  vehicle_number?: string;
  vehicle_type: VehicleCategory;
  transporter_name?: string;
  transporter_gstin?: string;
  distance_km?: number;
  approximate_distance?: boolean;
  is_interstate?: boolean;
  total_taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  cess_amount: number;
  total_invoice_value: number;
  valid_from?: string;
  valid_until?: string;
  extended_until?: string;
  extension_count?: number;
  extension_reason?: string;
  validity_days?: number;
  generated_at?: string;
  generated_by?: number;
  cancelled_at?: string;
  cancelled_reason?: string;
  remarks?: string;
  items: EwayItem[];
  created_by?: number;
  created_at: string;
  updated_at?: string;
}

export interface EwayItem {
  id?: number;
  eway_bill_id?: number;
  item_number: number;
  product_name: string;
  product_description?: string;
  hsn_code: string;
  quantity: number;
  quantity_unit: string;
  taxable_value: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  cess_rate: number;
  cess_amount: number;
  total_item_value: number;
  invoice_number?: string;
  invoice_date?: string;
}

// ---- Trip ----
export interface Trip {
  id: number;
  trip_number: string;
  job_id?: number;
  job?: Job;
  vehicle_id: number;
  vehicle?: Vehicle;
  driver_id: number;
  driver?: Driver;
  status: TripStatus;
  route_id?: number;
  origin: string;
  destination: string;
  planned_start: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  start_odometer?: number;
  end_odometer?: number;
  total_distance?: number;
  fuel_issued?: number;
  fuel_consumed?: number;
  total_fuel_cost?: number;
  advance_amount?: number;
  total_expenses?: number;
  revenue?: number;
  profit?: number;
  tracking_id?: string;
  lr_numbers: string[];
  notes?: string;
  payment_approved?: boolean;
  driver_pay?: number;
  status_history?: Array<{ status: string; timestamp: string; note?: string }>;
  unloading_start?: string;
  unloading_end?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface TripExpense {
  id: number;
  trip_id: number;
  category: ExpenseCategory;
  description: string;
  amount: number;
  receipt_url?: string;
  is_verified: boolean;
  verified_by?: number;
  date: string;
}

// ---- Finance ----
export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_type: InvoiceType;
  status: InvoiceStatus;
  client_id: number;
  client?: Client;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  gst_rate: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  notes?: string;
  items: InvoiceItem[];
  created_at: string;
}

export interface InvoiceItem {
  id?: number;
  invoice_id?: number;
  description: string;
  lr_id?: number;
  lr_number?: string;
  quantity: number;
  rate: number;
  amount?: number;
  tax_rate?: number;
  tax_amount?: number;
  trip_id?: number;
  item_number?: number;
}

export interface Payment {
  id: number;
  payment_number: string;
  invoice_id?: number;
  client_id?: number;
  vendor_id?: number;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: number;
  payment_date: string;
  reference_number?: string;
  bank_name?: string;
  notes?: string;
  created_at: string;
}

export interface LedgerEntry {
  id: number;
  ledger_type: LedgerType;
  amount: number;
  balance: number;
  description: string;
  reference_type?: string;
  reference_id?: number;
  client_id?: number;
  vendor_id?: number;
  date: string;
}

export interface Receivable {
  id: number;
  client_id: number;
  client_name: string;
  invoice_id: number;
  invoice_number: string;
  total_amount: number;
  received_amount: number;
  pending_amount: number;
  due_date: string;
  aging_days: number;
  status: string;
}

export interface Payable {
  id: number;
  vendor_id: number;
  vendor_name: string;
  description: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  due_date: string;
  aging_days: number;
  status: string;
}

// ---- Route ----
export interface Route {
  id: number;
  name: string;
  code: string;
  origin: string;
  destination: string;
  distance_km: number;
  estimated_hours: number;
  toll_cost?: number;
  fuel_estimate?: number;
  waypoints?: string[];
  is_active: boolean;
}

export interface RateChart {
  id: number;
  client_id: number;
  route_id?: number;
  vehicle_type: VehicleType;
  contract_type: ContractType;
  rate: number;
  min_weight?: number;
  max_weight?: number;
  effective_from: string;
  effective_to?: string;
  is_active: boolean;
}

// ---- Tracking ----
export interface GPSPoint {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  timestamp: string;
}

export interface VehicleTracking {
  vehicle_id: number;
  registration_number: string;
  driver_name?: string;
  trip_id?: number;
  trip_number?: string;
  status: VehicleStatus;
  current_location: GPSPoint;
  last_updated: string;
  is_moving: boolean;
  current_speed?: number;
}

export interface TripTrail {
  trip_id: number;
  points: GPSPoint[];
  total_distance: number;
  average_speed: number;
  max_speed: number;
  idle_time_minutes: number;
}

export interface Alert {
  id: string;
  vehicle_id: number;
  trip_id?: number;
  driver_id?: number;
  alert_type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  location?: GPSPoint;
  is_acknowledged: boolean;
  acknowledged_by?: number;
  created_at: string;
}

// ---- Dashboard ----
export interface DashboardStats {
  total_vehicles: number;
  active_vehicles: number;
  vehicles_on_trip: number;
  vehicles_maintenance: number;
  total_drivers: number;
  available_drivers: number;
  total_trips_today: number;
  completed_trips_today: number;
  total_active_jobs: number;
  pending_approvals: number;
  total_revenue_month: number;
  total_expense_month: number;
  profit_month: number;
  outstanding_receivables: number;
  outstanding_payables: number;
  alerts_count: number;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  value2?: number;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  is_read: boolean;
  action_url?: string;
  created_at: string;
}

// ---- Common ----
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  pagination?: { total: number; page: number; page_size: number; total_pages: number };
  data?: T[];
}

export interface ApiError {
  detail: string;
  status_code: number;
}

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface FilterParams {
  search?: string;
  status?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  [key: string]: any;
}

// ---- Documents ----
export type DocumentApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type DocumentExpiryStatus = 'valid' | 'expiring_soon' | 'expired' | 'none';
export type DocumentType = 'rc' | 'insurance' | 'fitness' | 'license' | 'pollution' | 'puc' | 'invoice' | 'eway_bill' | 'lr_copy' | 'permit' | 'contract' | 'pod' | 'tax_receipt' | 'driver_badge' | 'medical_fitness' | 'aadhaar' | 'pan_card' | 'gst_certificate' | 'other';
export type EntityType = 'vehicle' | 'driver' | 'trip' | 'client' | 'finance';
export type ComplianceCategory = 'mandatory' | 'optional';

export interface DocumentVersion {
  version: number;
  uploaded_at: string;
  uploaded_by: string;
  file_name: string;
  file_size: number;
  notes: string;
}

export interface DocumentStatusChange {
  status: DocumentApprovalStatus;
  changed_at: string;
  changed_by: string;
}

export interface Document {
  id: number;
  doc_number: string;
  title: string;
  document_type: DocumentType;
  entity_type: EntityType;
  entity_id: number;
  entity_label: string;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  reminder_days: number;
  compliance_category: ComplianceCategory;
  renewal_required: boolean;
  expiry_alert: boolean;
  auto_reminder: boolean;
  notes: string;
  approval_status: DocumentApprovalStatus;
  expiry_status: DocumentExpiryStatus;
  uploaded_by: string;
  reviewed_by: string;
  rejection_reason: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_url: string;
  file_key?: string;
  extracted_data?: Record<string, any>;
  versions: DocumentVersion[];
  status_history: DocumentStatusChange[];
  created_at: string;
  updated_at: string;
}

export interface DocumentStats {
  total: number;
  expired: number;
  expiring_soon: number;
  pending_approval: number;
  approved: number;
}

// ============================================================
// Fleet Manager Types
// ============================================================

export type FleetAlertType = 'overspeed' | 'geofence' | 'idle_engine' | 'fuel_drop' | 'maintenance_due' | 'document_expiry' | 'harsh_braking';
export type FleetAlertSeverity = 'critical' | 'warning' | 'info';
export type MaintenanceType = 'preventive' | 'repair' | 'tyre' | 'battery';
export type MaintenanceStatus = 'upcoming' | 'in_progress' | 'overdue' | 'completed';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical';
export type WorkOrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type FuelPaymentMode = 'fuel_card' | 'cash' | 'bank_transfer';
export type TyreCondition = 'good' | 'fair' | 'replace_soon' | 'critical';
export type BatteryStatus = 'healthy' | 'good' | 'weak' | 'critical';
export type PartStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface FleetDashboardKPIs {
  total_vehicles: number;
  active_vehicles: number;
  vehicles_on_trip: number;
  vehicles_maintenance: number;
  idle_vehicles: number;
  available_drivers: number;
  trips_in_progress: number;
  active_alerts: number;
  breakdown_vehicles: number;
  fuel_cost_today: number;
  avg_fleet_utilization: number;
  on_time_delivery_rate: number;
}

export interface FleetUtilizationData {
  label: string;
  utilization: number;
  on_trip: number;
  idle: number;
  maintenance: number;
}

export interface FuelConsumptionData {
  label: string;
  litres: number;
  cost: number;
  avg_mileage: number;
}

export interface MaintenanceCostData {
  trend: { label: string; preventive: number; repair: number; tyres: number; total: number }[];
  breakdown: { label: string; value: number }[];
}

export interface TripEfficiencyData {
  label: string;
  on_time: number;
  delayed: number;
  cancelled: number;
  avg_trip_hours: number;
}

export interface FleetAlert {
  id: string;
  type: FleetAlertType;
  severity: FleetAlertSeverity;
  title: string;
  message: string;
  vehicle: string | null;
  driver: string | null;
  location?: string | null;
  created_at: string;
  acknowledged?: boolean;
}

export interface FleetVehicle {
  id: number;
  registration_number: string;
  vehicle_type: VehicleType;
  make: string;
  model: string;
  status: VehicleStatus | 'on_trip' | 'inactive';
  assigned_driver: string | null;
  current_trip: string | null;
  last_location: string;
  fuel_efficiency: number;
  last_service_date: string;
  odometer: number;
  gps_enabled: boolean;
}

export interface FleetDriver {
  id: number;
  name: string;
  phone: string;
  license_number: string;
  license_expiry: string;
  assigned_vehicle: string | null;
  trips_completed: number;
  safety_score: number;
  status: 'on_trip' | 'available' | 'rest' | 'inactive';
}

export interface FleetTrackingVehicle {
  id: number;
  registration_number: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  status: 'moving' | 'stopped' | 'idle' | 'offline';
  driver: string | null;
  trip: string | null;
  route: string | null;
  eta: string | null;
  last_update: string;
}

export interface MaintenanceScheduleItem {
  id: number;
  vehicle: string;
  service_type: MaintenanceType;
  description: string;
  due_date: string;
  due_km: number | null;
  current_km: number;
  status: MaintenanceStatus;
  priority: MaintenancePriority;
  estimated_cost: number;
}

export interface WorkOrder {
  id: number;
  work_order_number: string;
  vehicle: string;
  type: MaintenanceType;
  description: string;
  workshop: string;
  assigned_date: string;
  expected_completion: string;
  status: WorkOrderStatus;
  cost: number;
  mechanic: string;
}

export interface PartInventory {
  id: number;
  part_name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  unit_cost: number;
  status: PartStatus;
}

export interface TyreRecord {
  id: number;
  vehicle: string;
  position: string;
  brand: string;
  model: string;
  installed_date: string;
  installed_km: number;
  current_km: number;
  tread_depth_mm: number;
  condition: TyreCondition;
  expected_life_km: number;
}

export interface BatteryRecord {
  id: number;
  vehicle: string;
  brand: string;
  model: string;
  installed_date: string;
  voltage: number;
  health_percent: number;
  status: BatteryStatus;
  expected_replacement: string;
}

export interface FuelRecord {
  id: number;
  date: string;
  vehicle: string;
  driver: string;
  litres: number;
  cost_per_litre: number;
  total_cost: number;
  odometer: number;
  mileage: number;
  station: string;
  payment_mode: FuelPaymentMode;
}

export interface FuelSummary {
  total_litres: number;
  total_cost: number;
  avg_mileage: number;
  best_mileage_vehicle: { vehicle: string; mileage: number };
  worst_mileage_vehicle: { vehicle: string; mileage: number };
  fuel_theft_alerts: number;
  cost_per_km: number;
  by_vehicle: { vehicle: string; litres: number; cost: number; mileage: number }[];
  monthly_trend: { month: string; litres: number; cost: number }[];
}

export interface FleetExpiringDocument {
  id: number;
  entity_type: 'vehicle' | 'driver';
  entity: string;
  document: string;
  expiry_date: string;
  days_remaining: number;
  status: 'expired' | 'expiring_soon';
}

export interface ActiveTripItem {
  id: number;
  trip_number: string;
  vehicle: string;
  driver: string;
  origin: string;
  destination: string;
  status: string;
  progress: number;
  eta: string;
  current_location: string;
  speed: number;
}

// ============================================================
// Accountant Module Types
// ============================================================

export type AccountantExpenseCategory = 'fuel' | 'driver_allowance' | 'toll' | 'vehicle_maintenance' | 'office' | 'miscellaneous';
export type AccountantPayableType = 'vendor' | 'driver' | 'fuel' | 'maintenance' | 'rent' | 'other';
export type AccountantReportType = 'profit_loss' | 'expense' | 'revenue' | 'trip_profitability' | 'client_outstanding' | 'vendor_payables' | 'fuel_cost' | 'monthly_summary';

export interface AccountantDashboardKPIs {
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
  profit_margin: number;
  outstanding_receivables: number;
  pending_payables: number;
  cash_in_hand: number;
  bank_balance: number;
  overdue_invoices: number;
  overdue_amount: number;
  gst_payable: number;
  tds_payable: number;
  total_trips_billed: number;
  unbilled_trips: number;
  fuel_expenses: number;
  driver_payments_pending: number;
  revenue_change: string;
  expense_change: string;
  profit_change: string;
  receivable_change: string;
}

export interface AccountantRevenueTrend {
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface AccountantExpenseBreakdown {
  category: string;
  amount: number;
  percentage: number;
}

export interface AccountantCashFlow {
  label: string;
  inflow: number;
  outflow: number;
  net: number;
}

export interface AccountantReceivablesAging {
  current: { count: number; amount: number };
  days_30: { count: number; amount: number };
  days_60: { count: number; amount: number };
  days_90: { count: number; amount: number };
  over_90: { count: number; amount: number };
  total: { count: number; amount: number };
}

export interface AccountantTransaction {
  id: number;
  type: string;
  description: string;
  amount: number;
  date: string;
  status: string;
}

export interface AccountantPendingAction {
  id: number;
  type: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  link: string;
}

export interface AccountantInvoice {
  id: number;
  invoice_number: string;
  client_name: string;
  client_id: number;
  trip_ref: string;
  job_ref: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: string;
  invoice_type: string;
  gst_rate: number;
}

export interface AccountantInvoiceDetail {
  id: number;
  invoice_number: string;
  client_name: string;
  client_id: number;
  client_gst: string;
  client_address: string;
  invoice_date: string;
  due_date: string;
  invoice_type: string;
  status: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  items: AccountantInvoiceItem[];
  linked_trips: AccountantLinkedTrip[];
  payment_history: AccountantPaymentHistoryEntry[];
  notes: string;
  terms_conditions: string;
  created_by: string;
  created_at: string;
}

export interface AccountantInvoiceItem {
  id: number;
  description: string;
  trip_number: string | null;
  lr_number: string | null;
  quantity: number;
  rate: number;
  amount: number;
  tax_rate: number;
  tax_amount: number;
}

export interface AccountantLinkedTrip {
  id: number;
  trip_number: string;
  vehicle: string;
  driver: string;
  origin: string;
  destination: string;
  status: string;
  freight_amount: number;
}

export interface AccountantPaymentHistoryEntry {
  id: number;
  payment_number: string;
  date: string;
  amount: number;
  method: string;
  reference: string;
  status: string;
}

export interface AccountantUnbilledTrip {
  id: number;
  trip_number: string;
  vehicle: string;
  driver: string;
  client: string;
  origin: string;
  destination: string;
  completed_date: string;
  freight_amount: number;
}

export interface AccountantReceivableItem {
  id: number;
  client_id: number;
  client_name: string;
  total_invoices: number;
  total_amount: number;
  received_amount: number;
  pending_amount: number;
  oldest_due: string;
  aging_days: number;
  credit_limit: number;
  credit_utilization: number;
  last_payment_date: string;
  aging_0_30: number;
  aging_31_60: number;
  aging_61_90: number;
  aging_over_90: number;
}

export interface AccountantPayableItem {
  id: number;
  payable_type: AccountantPayableType;
  entity_name: string;
  entity_id?: number;
  description: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  due_date: string;
  aging_days: number;
  status: string;
  payment_terms?: string;
}

export interface AccountantExpenseItem {
  id: number;
  expense_number: string;
  category: AccountantExpenseCategory;
  description: string;
  trip_ref: string | null;
  vehicle: string | null;
  driver: string | null;
  amount: number;
  date: string;
  payment_method: string;
  vendor: string | null;
  status: string;
  receipt_url: string | null;
}

export interface AccountantFuelExpense {
  id: number;
  date: string;
  vehicle: string;
  vehicle_id: number;
  driver: string;
  trip_ref: string;
  fuel_quantity: number;
  cost_per_litre: number;
  total_cost: number;
  fuel_station: string;
  start_odometer: number;
  end_odometer: number;
  payment_method: string;
  receipt: boolean;
  is_verified: boolean;
  fuel_type?: string;
}

export interface AccountantBankAccount {
  id: number;
  name: string;
  bank: string;
  account_number: string;
  balance: number;
  type: string;
  last_transaction_date: string;
}

export interface AccountantBankingOverview {
  accounts: AccountantBankAccount[];
  total_bank_balance: number;
  total_cash_balance: number;
  total_balance: number;
  todays_inflow: number;
  todays_outflow: number;
  pending_cheques: number;
  pending_cheque_amount: number;
}

export interface AccountantBankTransaction {
  id: number;
  date: string;
  account: string;
  type: 'credit' | 'debit';
  description: string;
  reference: string;
  amount: number;
  balance: number;
  status: string;
}

export interface AccountantLedgerAccount {
  id: number;
  account_type: string;
  name: string;
  entity_id?: number;
  debit_total: number;
  credit_total: number;
  balance: number;
  balance_type?: 'debit' | 'credit';
  last_transaction?: string;
  entries_count: number;
}

export interface AccountantLedgerEntry {
  id: number;
  date: string;
  description: string;
  reference_type: string;
  reference_number: string;
  debit: number;
  credit: number;
  balance: number;
}

// ── Customer & Supplier Portal Types (Phase D) ──────────────

export interface PortalLoginResponse {
  access_token: string;
  token_type: string;
  name: string;
  email: string;
  role: 'customer' | 'supplier';
}

export interface CustomerBooking {
  id: number;
  job_number: string;
  origin: string;
  destination: string;
  status: string;
  pickup_date?: string;
  material_type?: string;
  vehicle_type?: string;
  total_amount?: number;
  created_at: string;
}

export interface CustomerInvoice {
  id: number;
  invoice_number: string;
  date?: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  pdf_url?: string;
}

export interface CustomerPayment {
  id: number;
  payment_number: string;
  date: string;
  amount: number;
  payment_method?: string;
  status: string;
  reference_number?: string;
}

export interface TrackingInfo {
  job_id: number;
  client_id: number;
  tracking_token: string;
  tracking_url: string;
}

export interface PublicTrackingData {
  job_id: number;
  client_id: number;
  generated_at: string;
  status?: string;
  location?: { lat: number; lng: number };
}

export interface BookingRequest {
  origin_city: string;
  destination_city: string;
  origin_address?: string;
  destination_address?: string;
  pickup_date?: string;
  material_type?: string;
  quantity?: number;
  quantity_unit?: string;
  vehicle_type_required?: string;
  special_requirements?: string;
}

export interface SupplierTrip {
  id: number;
  job_id?: number;
  job_number?: string;
  origin?: string;
  destination?: string;
  status: string;
  contractor_rate?: number;
  net_payable?: number;
  vehicle_number?: string;
  created_at: string;
}

export interface SupplierTripDetail extends SupplierTrip {
  job_origin?: string;
  job_destination?: string;
  job_status?: string;
  job_material_type?: string;
}

export interface SupplierPayment {
  id: number;
  job_number?: string;
  net_payable: number;
  settlement_reference?: string;
  status: string;
  settled_at?: string;
}

export interface SupplierStatement {
  total_trips: number;
  total_earned: number;
  settled_trips: number;
  settled_amount: number;
  pending_amount: number;
}

// ── Branch Management Types (Phase E) ──────────────────────

export interface BranchCreate {
  name: string;
  code: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
  tenant_id: number;
}

export interface BranchUpdate {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  is_active?: boolean;
}

export interface BranchResources {
  branch_id: number;
  vehicles: number;
  drivers: number;
  staff: number;
  clients: number;
}

export interface BranchPnL {
  branch_id: number;
  revenue: number;
  collected: number;
  outstanding: number;
  jobs: number;
}

export interface BranchComparison extends BranchResources, BranchPnL {
  id: number;
  name: string;
  code: string;
  city?: string;
}

// ── TPMS + Predictive Maintenance Types (Phase F) ──────────

export interface TPMSWheel {
  tyre_id: number;
  position: string;
  brand?: string;
  size?: string;
  psi: number | null;
  temperature_c: number | null;
  tread_depth_mm: number | null;
  condition: string;
  sensor_id?: string;
  last_reading_at?: string;
  status: 'ok' | 'warning' | 'critical';
}

export interface TPMSVehicleDashboard {
  vehicle_id: number;
  registration_number: string;
  num_tyres: number | null;
  wheels: TPMSWheel[];
}

export interface TPMSFleetHealth {
  total_tyres: number;
  ok: number;
  warning: number;
  critical: number;
  no_sensor: number;
}

export interface TPMSAlert {
  reading_id: number;
  vehicle_id: number;
  registration_number: string;
  position: string;
  psi: number;
  temperature_c: number | null;
  alert_type: string;
  timestamp: string;
}

export interface TPMSReading {
  id: number;
  psi: number;
  temperature_c: number | null;
  tread_depth_mm: number | null;
  timestamp: string;
  alert_triggered: boolean;
  alert_type?: string;
}

export interface MaintenancePrediction {
  vehicle_id?: number;
  registration_number?: string;
  type: string;
  last_service_date?: string;
  last_service_km?: number;
  avg_interval_km?: number;
  avg_interval_days?: number;
  km_since_last?: number;
  predicted_date?: string;
  km_remaining?: number;
  urgency: 'normal' | 'soon' | 'critical';
  note?: string;
}

export interface VehiclePrediction {
  vehicle_id: number;
  registration_number: string;
  current_odometer: number;
  predictions: MaintenancePrediction[];
}

// ── Tyre Tracker Types (Real-Time) ──────────────────────

export type TyreAlertType = 'low_pressure' | 'high_temp' | 'critical_pressure' | null;

export interface TyreData {
  id: number;
  position: string;
  serial_number: string;
  brand: string;
  model: string;
  size: string;
  life_percent: number;
  psi: number;
  target_psi: number;
  temperature: number;
  km_run: number;
  fitted_date: string;
  has_sensor: boolean;
  alert?: TyreAlertType;
  vehicle_id: number;
  vehicle_number?: string;
}

export interface TyreLifeSummary {
  buckets: Record<string, number>;
  items_by_bucket: Record<string, TyreLifeBucketItem[]>;
  status_counts: {
    normal: number;
    low_psi: number;
    critical: number;
    alerts: number;
  };
  total: number;
  mounted?: number;
  in_stock?: number;
}

export interface TyreLifeBucketItem {
  id: number;
  serial_number: string;
  position: string;
  vehicle_number: string;
  vehicle_id: number;
  life_percent: number;
  psi: number;
  km_run: number;
}

export interface TyreAlertItem {
  id: number;
  vehicle_id: number;
  vehicle_number: string;
  serial_number: string;
  position: string;
  psi: number;
  temperature: number;
  alert_type: string;
  timestamp: string;
}

export interface TyreStockItem {
  id: number;
  serial_number: string;
  brand: string;
  size: string;
  condition: string;
  vehicle_number: string;
  vehicle_id: number;
  position: string;
  purchase_date: string | null;
  purchase_cost: number;
  retread_count: number;
  km_run: number;
}

export interface TyreRetreadItem {
  id: number;
  serial_number: string;
  brand: string;
  size: string;
  position: string;
  condition: string;
  vehicle_number: string;
  vehicle_id: number;
  retread_count: number;
  max_retreads: number;
  last_retread_date: string | null;
  total_retread_cost: number;
  km_run: number;
  status: string;
  vendor: string | null;
  notes: string | null;
}

export interface TyreCatalogueItem {
  id: number;
  brand: string;
  model: string;
  sizes: string[];
  image: string;
  category: string;
}

export interface TyreCompareItem {
  brand: string;
  count: number;
  total_km: number;
  total_cost: number;
  cost_per_km: number;
  models: string[];
}

export interface TyreWSPressureUpdate {
  type: 'tyre_pressure_update';
  vehicle_id: number;
  position: string;
  psi: number;
  temperature: number;
  timestamp: string;
}

export interface TyreWSAlert {
  type: 'tyre_alert';
  vehicle_id: number;
  position: string;
  alert_type: string;
  value: number;
  threshold: number;
  timestamp: string;
}

export interface TyreWSLifeUpdate {
  type: 'tyre_life_update';
  vehicle_id: number;
  position: string;
  life_percent: number;
  km_run: number;
  timestamp: string;
}

