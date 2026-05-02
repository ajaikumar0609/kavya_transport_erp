import api from './api';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FinanceDashboardSummary {
  expenses: { pending_count: number; pending_amount_paise: number };
  salary: { total_staff: number; paid_count: number; paid_paise: number };
  payables: { overdue_count: number; due_this_week_count: number; due_this_week_paise: number };
  razorpay_balance_paise: number;
  month: string;
}

export interface SalaryStaffItem {
  employee_id: number;
  name: string;
  designation: string;
  bank_last4: string | null;
  bank_name: string | null;
  salary_paise: number;
  status: string;
  payout_id: number | null;
  utr: string | null;
  paid_at: string | null;
  has_bank_account: boolean;
}

export interface SalarySummary {
  month: string;
  staff: SalaryStaffItem[];
  total_due_paise: number;
  paid_count: number;
  unpaid_count: number;
  paid_paise: number;
  remaining_paise: number;
  deadline_day: number;
  is_overdue: boolean;
  days_remaining: number | null;
}

export interface ExpenseSubmission {
  id: number;
  submitted_by: number;
  submitter_name: string;
  driver_name: string | null;
  driver_id: number | null;
  category: string;
  amount_paise: number;
  payment_method: string;
  upi_ref_number: string | null;
  receipt_image_s3: string | null;
  receipt_url: string | null;
  description: string | null;
  status: string;
  trip_id: number | null;
  vehicle_id: number | null;
  submitted_at: string | null;
  created_at: string | null;
  rejection_reason: string | null;
}

export interface PaymentScheduleItem {
  id: number;
  schedule_type: string;
  payment_type: string;
  label: string;
  description: string | null;
  payee_name: string | null;
  vendor_name: string | null;
  amount_paise: number;
  frequency: string;
  next_due_date: string | null;
  days_until_due: number | null;
  urgency: string;
  vehicle_id: number | null;
  last_paid_at: string | null;
}

export interface PayoutItem {
  id: number;
  payout_type: string;
  recipient_name: string | null;
  amount_paise: number;
  payment_method: string | null;
  status: string;
  utr: string | null;
  narration: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string | null;
  processed_at: string | null;
  failure_reason: string | null;
  razorpay_payout_id: string | null;
}

export interface PaymentContactItem {
  id: number;
  contact_type: string;
  entity_id: number;
  entity_name: string;
  bank_name: string | null;
  bank_last4: string | null;
  ifsc: string | null;
  upi_id: string | null;
  is_verified: boolean;
  preferred_method: string;
  razorpay_contact_id: string | null;
  razorpay_fund_account_id: string | null;
}

export interface TripExpenseItem {
  id: number;
  trip_id: number;
  trip_number: string;
  origin: string;
  destination: string;
  vehicle_registration: string | null;
  driver_name: string | null;
  category: string;
  sub_category: string | null;
  description: string | null;
  amount: number;
  payment_mode: string;
  reference_number: string | null;
  receipt_url: string | null;
  expense_status: string;
  is_verified: boolean;
  entry_source: string;
  expense_date: string | null;
  created_at: string | null;
  paid_at: string | null;
  paid_by_name: string | null;
  payment_proof_url?: string | null;
}

export interface PendingAdvanceTripItem {
  id: number;
  trip_number: string;
  origin: string;
  destination: string;
  trip_date: string | null;
  status: string;
  driver_name: string;
  driver_id: number | null;
  vehicle_registration: string | null;
  loaded_image_url: string;
  advance_amount: number;
}

export interface DriverAdvanceRequest {
  id: number;
  driver_id: number;
  driver_name: string;
  trip_id: number | null;
  trip_number: string | null;
  amount: number;
  status: string; // PENDING | APPROVED | REJECTED
  review_note: string | null;
  created_at: string;
}

export interface PaymentHistoryItem {
  type: 'TRIP_ADVANCE' | 'DRIVER_ADVANCE' | 'TRIP_EXPENSE' | 'FUEL_REFILL';
  title: string;
  subtitle: string;
  amount_rupees: number;
  detail: string;
  date: string | null;
  payment_proof_url?: string | null;
}

// ─── API calls ─────────────────────────────────────────────────────────────────

const BASE = '/finance-manager';

export const financeManagerService = {
  // Dashboard
  getDashboardSummary: () => api.get<{ data: FinanceDashboardSummary }>(`${BASE}/dashboard/summary`).then(r => r.data),

  // Salary
  getSalarySummary: (month?: string) => api.get<{ data: SalarySummary }>(`${BASE}/salary-summary`, { params: { month } }).then(r => r.data),
  paySalary: (employee_id: number, month: string, amount_paise: number) =>
    api.post(`${BASE}/payments/salary`, { employee_id, month, amount_paise }),
  paySalaryBulk: (payments: { employee_id: number; amount_paise: number }[], month: string) =>
    api.post(`${BASE}/payments/salary/bulk`, { payments, month }),

  // Advances
  issueAdvance: (driver_id: number, trip_id?: number, amount_paise?: number) =>
    api.post(`${BASE}/payments/advance`, { driver_id, trip_id, amount_paise: amount_paise || 150000 }),
  getDriverAdvances: (driver_id: number, month?: string) =>
    api.get<{ data: any }>(`${BASE}/drivers/${driver_id}/advances`, { params: { month } }).then(r => r.data),

  // Expense queue
  getExpenseQueue: (status?: string, category?: string, page?: number) =>
    api.get<{ data: ExpenseSubmission[] }>(`${BASE}/expense-queue`, { params: { status, category, page } }).then(r => r.data),
  submitExpense: (data: any) => api.post(`${BASE}/expense-submissions`, data),
  approveExpense: (id: number, reimburse_now?: boolean) =>
    api.patch(`${BASE}/expense-submissions/${id}/approve`, { reimburse_now }),
  rejectExpense: (id: number, reason: string) =>
    api.patch(`${BASE}/expense-submissions/${id}/reject`, { reason }),

  // Trip Expense Queue
  getTripExpenseQueue: (status?: string, trip_id?: number, category?: string, page?: number) =>
    api.get(`${BASE}/trip-expense-queue`, {
      params: { status, trip_id, category, page },
    }).then((r: any) => (r.data as TripExpenseItem[]) ?? []),
  payTripExpense: (id: number, notes?: string, proofUrl?: string | null, proofS3Key?: string | null) =>
    api.patch(`${BASE}/trip-expenses/${id}/pay`, { notes: notes ?? null, proof_url: proofUrl ?? null, proof_s3_key: proofS3Key ?? null }, {
      headers: { 'Content-Type': 'application/json' },
    }),
  uploadPaymentProof: (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`${BASE}/trip-expenses/${id}/upload-proof`, formData);
  },
  rejectTripExpense: (id: number, reason: string) =>
    api.patch(`${BASE}/trip-expenses/${id}/reject`, reason, { headers: { 'Content-Type': 'application/json' } }),

  // Fuel Entries
  getFuelEntries: (is_verified?: boolean) =>
    api.get(`${BASE}/fuel-entries`, { params: { is_verified } }).then((r: any) => (r.data as any[]) ?? []),
  markFuelEntryPaid: (id: number) =>
    api.patch(`${BASE}/fuel-entries/${id}/mark-paid`),

  // Payment Contacts
  getPaymentContacts: (entity_type?: string, entity_id?: number) =>
    api.get<{ data: PaymentContactItem[] }>(`${BASE}/payment-contacts`, { params: { entity_type, entity_id } }).then(r => r.data),
  createPaymentContact: (data: any) => api.post(`${BASE}/payment-contacts`, data),

  // Payment Schedules
  getPaymentSchedules: (schedule_type?: string, due_within_days?: number) =>
    api.get<{ data: PaymentScheduleItem[] }>(`${BASE}/payment-schedules`, { params: { schedule_type, due_within_days }}).then(r => r.data),
  createPaymentSchedule: (data: any) => api.post(`${BASE}/payment-schedules`, data),
  deletePaymentSchedule: (id: number) => api.delete(`${BASE}/payment-schedules/${id}`),

  // Vendor Payments
  payVendor: (data: any) => api.post(`${BASE}/payments/vendor`, data),

  // Payouts
  getPayouts: (payout_type?: string, status?: string, page?: number) =>
    api.get<{ data: PayoutItem[] }>(`${BASE}/payouts`, { params: { payout_type, status, page } }).then(r => r.data),

  // Razorpay Balance
  getRazorpayBalance: () => api.get<{ data: { balance_paise: number } }>(`${BASE}/razorpay/balance`).then(r => r.data),

  // Driver Advance (post-loading ₹1500)
  getPendingAdvanceTrips: (page?: number) =>
    api.get<{ data: PendingAdvanceTripItem[] }>(`${BASE}/pending-advance-trips`, { params: { page } }).then(r => r.data),
  payTripAdvance: (tripId: number) =>
    api.post<{ data: { trip_id: number; trip_number: string; advance_amount: number; paid_by: string; paid_at: string } }>(
      `${BASE}/trips/${tripId}/pay-advance`
    ).then(r => r.data),

  // Driver-requested advances (via "Request Advance" button in driver app)
  getDriverAdvanceRequests: () =>
    api.get<{ data: DriverAdvanceRequest[] }>('/driver-requests/advance-requests/fleet').then(r => r.data),
  acknowledgeAdvanceRequest: (advanceId: number, note?: string) =>
    api.post(`/driver-requests/advance-requests/${advanceId}/acknowledge`, { note: note ?? '' }).then(r => r.data),

  // Unified payment history (fuel, expenses, advances)
  getPaymentHistory: (limit = 200) =>
    api.get<{ data: PaymentHistoryItem[] }>(`${BASE}/payment-history`, { params: { limit } }).then(r => r.data),
};
