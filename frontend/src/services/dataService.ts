import api from './api';
import type {
  Client, Vehicle, Driver, Job, LR, Trip, TripExpense,
  Invoice, Payment, LedgerEntry, Receivable, Payable,
  VehicleTracking, TripTrail, Alert, DashboardStats,
  Notification, ChartDataPoint, PaginatedResponse, FilterParams,
  Route, EwayBill, Document, DocumentStats,
  Supplier, MarketTrip,
  Geofence, ComplianceAlertRecord, DriverEvent, AuditNote,
  AIS140CheckResult, FleetComplianceReport, ComplianceAlertSummary, DriverEventSummary
} from '@/types';

const unwrap = <T = any>(payload: any): T => (payload?.data ?? payload) as T;

// ---- Clients ----
export const clientService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Client>> => {
    const data = await api.get('/clients', { params });
    return data;
  },
  get: async (id: number): Promise<Client> => {
    const data = await api.get(`/clients/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Client>): Promise<Client> => {
    const data = await api.post('/clients', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Client>): Promise<Client> => {
    const data = await api.put(`/clients/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/clients/${id}`);
  },
  getJobs: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/clients/${id}/jobs`, { params });
    return data;
  },
  getInvoices: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/clients/${id}/invoices`, { params });
    return data;
  },
  getLedger: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/clients/${id}/ledger`, { params });
    return data;
  },
  getOutstanding: async (id: number) => {
    const data = await api.get(`/clients/${id}/outstanding`);
    return data;
  },
};

// ---- Vehicles ----
export const vehicleService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Vehicle>> => {
    const normalizedParams = params
      ? {
          ...params,
          limit: (params as any).limit ?? params.page_size,
        }
      : undefined;
    const data = await api.get('/vehicles', { params: normalizedParams });
    return data;
  },
  getSummary: async () => {
    const data = await api.get('/vehicles/summary');
    return unwrap(data);
  },
  get: async (id: number): Promise<Vehicle> => {
    const data = await api.get(`/vehicles/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Vehicle>): Promise<Vehicle> => {
    const data = await api.post('/vehicles', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Vehicle>): Promise<Vehicle> => {
    const data = await api.put(`/vehicles/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/vehicles/${id}`);
  },
  getOverview: async (id: number) => {
    const data = await api.get(`/vehicles/${id}/overview`);
    return data;
  },
  getTrips: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/vehicles/${id}/trips`, { params });
    return data;
  },
  getMaintenance: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/vehicles/${id}/maintenance`, { params });
    return data;
  },
  addMaintenance: async (id: number, payload: any) => {
    const data = await api.post(`/vehicles/${id}/maintenance`, payload);
    return data;
  },
  getDocuments: async (id: number) => {
    const data = await api.get(`/vehicles/${id}/documents`);
    return data;
  },
  getHealthScore: async (id: number) => {
    const data = await api.get(`/vehicles/${id}/health-score`);
    return data;
  },
};

// ---- Drivers ----
export const driverService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Driver>> => {
    const data = await api.get('/drivers', { params });
    return data;
  },
  get: async (id: number): Promise<Driver> => {
    const data = await api.get(`/drivers/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Driver>): Promise<Driver> => {
    const data = await api.post('/drivers', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Driver>): Promise<Driver> => {
    const data = await api.put(`/drivers/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/drivers/${id}`);
  },
  getAvailable: async () => {
    const data = await api.get('/drivers/available');
    return data;
  },
  getTrips: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/drivers/${id}/trips`, { params });
    return data;
  },
  getMyTrips: async (params?: { page?: number; page_size?: number }) => {
    const data = await api.get('/drivers/me/trips', { params });
    return data;
  },
  getMyTripDetail: async (tripId: number) => {
    const data = await api.get(`/drivers/me/trips/${tripId}`);
    return unwrap(data);
  },
  getMyDocuments: async () => {
    const data = await api.get('/drivers/me/documents');
    return unwrap(data);
  },
  completeMyTrip: async (tripId: number, payload?: { end_odometer?: number; remarks?: string }) => {
    const data = await api.put(`/drivers/me/trips/${tripId}/complete`, payload ?? {});
    return data;
  },
  getAttendance: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/drivers/${id}/attendance`, { params });
    return unwrap(data);
  },
  getPerformance: async (id: number) => {
    const data = await api.get(`/drivers/${id}/performance`);
    return unwrap(data);
  },
  getDashboard: async () => {
    const data = await api.get('/drivers/dashboard');
    return data.data ?? data;
  },
  getBehaviour: async (id: number, period?: string) => {
    const data = await api.get(`/drivers/${id}/behaviour`, { params: { period } });
    return unwrap(data);
  },
  getDocuments: async (id: number) => {
    const data = await api.get(`/drivers/${id}/documents`);
    return unwrap(data);
  },
  getAlerts: async (params?: { alert_type?: string; severity?: string }) => {
    const data = await api.get('/drivers/alerts/all', { params });
    return data;
  },
  assign: async (id: number, payload: { vehicle_id?: number; trip_id?: number }) => {
    const data = await api.post(`/drivers/${id}/assign`, payload);
    return data;
  },
  unassign: async (id: number) => {
    const data = await api.post(`/drivers/${id}/unassign`);
    return data;
  },
  updateStatus: async (id: number, status: string) => {
    const data = await api.post(`/drivers/${id}/status`, null, { params: { status } });
    return data;
  },
  markAttendance: async (id: number, payload: { status: string; remarks?: string }) => {
    const data = await api.post(`/drivers/${id}/attendance`, payload);
    return data;
  },
};

// ---- Jobs ----
export const jobService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Job>> => {
    const data = await api.get('/jobs', { params });
    return data;
  },
  get: async (id: number): Promise<Job> => {
    const data = await api.get(`/jobs/${id}`);
    return unwrap(data);
  },
  create: async (payload: any): Promise<any> => {
    const data = await api.post('/jobs', payload);
    return data;
  },
  update: async (id: number, payload: any): Promise<any> => {
    const data = await api.put(`/jobs/${id}`, payload);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/jobs/${id}`);
  },
  submitForApproval: async (id: number): Promise<any> => {
    const data = await api.post(`/jobs/${id}/submit-for-approval`);
    return data;
  },
  approve: async (id: number, payload: { action: string; remarks?: string }): Promise<any> => {
    const data = await api.post(`/jobs/${id}/approve`, payload);
    return data;
  },
  assign: async (id: number): Promise<any> => {
    const data = await api.put(`/jobs/${id}/assign`);
    return data;
  },
  assignVehicle: async (id: number, vehicleId: number): Promise<Job> => {
    const data = await api.post(`/jobs/${id}/assign-vehicle`, { vehicle_id: vehicleId });
    return data;
  },
  assignDriver: async (id: number, driverId: number): Promise<Job> => {
    const data = await api.post(`/jobs/${id}/assign-driver`, { driver_id: driverId });
    return data;
  },
  // Lookups
  getClients: async (search?: string): Promise<any> => {
    const data = await api.get('/jobs/lookup/clients', { params: { search } });
    return data;
  },
  getRoutes: async (search?: string): Promise<any> => {
    const data = await api.get('/jobs/lookup/routes', { params: { search } });
    return unwrap(data);
  },
  getVehicleTypes: async (): Promise<any> => {
    const data = await api.get('/jobs/lookup/vehicle-types');
    return unwrap(data);
  },
  getStates: async (): Promise<any> => {
    const data = await api.get('/jobs/lookup/states');
    return unwrap(data);
  },
  getNextJobNumber: async (): Promise<{ job_number: string }> => {
    const data = await api.get('/jobs/next-job-number');
    return unwrap(data);
  },
};

// ---- LR ----
export const lrService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<LR>> => {
    const data = await api.get('/lr', { params });
    return data;
  },
  get: async (id: number): Promise<LR> => {
    const data = await api.get(`/lr/${id}`);
    return unwrap(data);
  },
  create: async (payload: any): Promise<any> => {
    const data = await api.post('/lr', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: any): Promise<any> => {
    const data = await api.put(`/lr/${id}`, payload);
    return unwrap(data);
  },
  generate: async (id: number): Promise<any> => {
    const data = await api.post(`/lr/${id}/generate`);
    return data;
  },
  cancel: async (id: number): Promise<any> => {
    const data = await api.post(`/lr/${id}/cancel`);
    return data;
  },
  print: async (id: number) => {
    const data = await api.get(`/lr/${id}/print`);
    return unwrap(data);
  },
  getStatusHistory: async (id: number) => {
    const data = await api.get(`/lr/${id}/status-history`);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/lr/${id}`);
  },
  getNextEwayNumber: async (): Promise<string> => {
    const data = await api.get('/lr/next-eway-bill-number');
    return unwrap(data)?.next_eway_bill_number ?? '';
  },
  // Lookups — reuse trip lookup endpoints (same data shape)
  getJobs: async (search?: string): Promise<any> => {
    const data = await api.get('/trips/lookup/jobs', { params: { search } });
    return unwrap(data);
  },
  getVehicles: async (search?: string): Promise<any> => {
    const data = await api.get('/trips/lookup/vehicles', { params: { search } });
    return unwrap(data);
  },
  getDrivers: async (search?: string): Promise<any> => {
    const data = await api.get('/trips/lookup/drivers', { params: { search } });
    return unwrap(data);
  },
  getPackageTypes: async (): Promise<any> => {
    const data = await api.get('/lr/lookup/package-types');
    return unwrap(data);
  },
  getQuantityUnits: async (): Promise<any> => {
    const data = await api.get('/lr/lookup/quantity-units');
    return unwrap(data);
  },
  getNextLRNumber: async (): Promise<{ lr_number: string }> => {
    const data = await api.get('/lr/next-lr-number');
    return unwrap(data);
  },
  uploadPOD: async (id: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const data = await api.post(`/lr/${id}/pod`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  verifyPOD: async (id: number) => {
    const data = await api.post(`/lr/${id}/pod/verify`);
    return data;
  },
};

// ---- E-way Bills ----
export const ewayBillService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<EwayBill>> => {
    const data = await api.get('/eway-bills', { params });
    return data;
  },
  get: async (id: number): Promise<EwayBill> => {
    const data = await api.get(`/eway-bills/${id}`);
    return unwrap(data);
  },
  create: async (payload: any): Promise<any> => {
    const data = await api.post('/eway-bills', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: any): Promise<any> => {
    const data = await api.put(`/eway-bills/${id}`, payload);
    return unwrap(data);
  },
  generate: async (id: number): Promise<any> => {
    const data = await api.post('/eway-bills/api/generate', { eway_bill_id: id });
    return data;
  },
  cancel: async (id: number, payload: { reason: string }): Promise<any> => {
    const data = await api.post(`/eway-bills/${id}/cancel`, payload);
    return data;
  },
  extend: async (id: number, payload: { reason: string; remaining_distance_km?: number }): Promise<any> => {
    const data = await api.post(`/eway-bills/${id}/extend`, payload);
    return data;
  },
  print: async (id: number) => {
    const data = await api.get(`/eway-bills/${id}/print`);
    return data;
  },
  getStatusHistory: async (id: number) => {
    const data = await api.get(`/eway-bills/${id}/status-history`);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/eway-bills/${id}`);
  },
  // Lookups
  getJobs: async (search?: string): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/jobs', { params: { search } });
    return data;
  },
  getLRs: async (jobId?: number, search?: string): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/lrs', { params: { job_id: jobId, search } });
    return data;
  },
  getStates: async (): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/states');
    return data;
  },
  getHSNCodes: async (search?: string): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/hsn-codes', { params: { search } });
    return data;
  },
  getUQCCodes: async (): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/uqc-codes');
    return data;
  },
  getDocumentTypes: async (): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/document-types');
    return data;
  },
  getTransactionTypes: async (): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/transaction-types');
    return data;
  },
  getGSTRates: async (): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/gst-rates');
    return data;
  },
  getVehicles: async (search?: string): Promise<any> => {
    const data = await api.get('/eway-bills/lookup/vehicles', { params: { search } });
    return data;
  },
  getNextEwayNumber: async (): Promise<{ eway_bill_number: string }> => {
    const data = await api.get('/eway-bills/next-eway-number');
    return data;
  },
  // Phase 1 local endpoints
  getActive: async (): Promise<any> => {
    const data = await api.get('/eway-bills/active');
    return unwrap(data);
  },
  getExpiring: async (hours: number = 8): Promise<any> => {
    const data = await api.get('/eway-bills/expiring', { params: { hours } });
    return unwrap(data);
  },
  getTripCompliance: async (tripId: number): Promise<any> => {
    const data = await api.get(`/eway-bills/trip/${tripId}/compliance`);
    return unwrap(data);
  },
  calculateValidity: async (distanceKm: number, isOdc: boolean = false): Promise<any> => {
    const data = await api.get('/eway-bills/validity-calculator', { params: { distance_km: distanceKm, is_odc: isOdc } });
    return unwrap(data);
  },
};

// ---- Banking Module ----
export const bankingService = {
  // Entries CRUD
  listEntries: async (params?: FilterParams) => {
    const data = await api.get('/banking/entries', { params });
    return data;
  },
  getEntry: async (id: number) => {
    const data = await api.get(`/banking/entries/${id}`);
    return unwrap(data);
  },
  createEntry: async (payload: any) => {
    const data = await api.post('/banking/entries', payload);
    return unwrap(data);
  },
  updateEntry: async (id: number, payload: any) => {
    const data = await api.put(`/banking/entries/${id}`, payload);
    return unwrap(data);
  },
  deleteEntry: async (id: number) => {
    await api.delete(`/banking/entries/${id}`);
  },

  // Balance
  getBalance: async () => {
    const data = await api.get('/banking/balance');
    return unwrap(data);
  },
  getBalanceHistory: async (params?: { account_id?: number; days?: number }) => {
    const data = await api.get('/banking/balance/history', { params });
    return unwrap(data);
  },

  // CSV Reconciliation
  importCSV: async (accountId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const data = await api.post(`/banking/reconciliation/import?account_id=${accountId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
  listCSVTransactions: async (importId: number, params?: FilterParams) => {
    const data = await api.get('/banking/reconciliation', { params: { import_id: importId, ...params } });
    return data;
  },
  matchCSVTransaction: async (csvTransactionId: number, payload: { invoice_id?: number; entry_id?: number }) => {
    const data = await api.post('/banking/reconciliation/match', { csv_transaction_id: csvTransactionId, ...payload });
    return unwrap(data);
  },
  getExceptions: async (importId: number) => {
    const data = await api.get('/banking/reconciliation/exceptions', { params: { import_id: importId } });
    return unwrap(data);
  },
  ignoreCSVTransaction: async (csvTransactionId: number) => {
    const data = await api.post('/banking/reconciliation/ignore', { csv_transaction_id: csvTransactionId });
    return unwrap(data);
  },
};

// ---- Trips ----
export const tripService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Trip>> => {
    const data = await api.get('/trips', { params });
    return data;
  },
  get: async (id: number): Promise<Trip> => {
    const data = await api.get(`/trips/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Trip>): Promise<Trip> => {
    const data = await api.post('/trips', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Trip>): Promise<Trip> => {
    const data = await api.put(`/trips/${id}`, payload);
    return unwrap(data);
  },
  start: async (id: number, payload: { start_odometer: number }) => {
    const data = await api.put(`/trips/${id}/start`, payload);
    return data;
  },
  updateStatus: async (id: number, status: string) => {
    const data = await api.post(`/trips/${id}/status`, { status });
    return data;
  },
  complete: async (id: number, payload: { end_odometer: number; notes?: string }) => {
    const data = await api.post(`/trips/${id}/complete`, payload);
    return data;
  },
  close: async (id: number) => {
    const data = await api.put(`/trips/${id}/close`);
    return data;
  },
  reach: async (id: number) => {
    const data = await api.put(`/trips/${id}/reach`);
    return data;
  },
  // Expenses
  getExpenses: async (id: number): Promise<TripExpense[]> => {
    // Fetch from both sources: trip_expenses table AND general expenses linked by trip_id
    const toArr = (v: any) => Array.isArray(v) ? v : [];
    const [tripExpData, generalExpData] = await Promise.allSettled([
      api.get(`/trips/${id}/expenses`),
      api.get('/expenses', { params: { trip_id: id, limit: 200 } }),
    ]);
    const tripItems: any[] = tripExpData.status === 'fulfilled'
      ? toArr((tripExpData.value as any)?.data ?? tripExpData.value)
      : [];
    const generalItems: any[] = generalExpData.status === 'fulfilled'
      ? toArr((generalExpData.value as any)?.data ?? generalExpData.value)
      : [];
    // Normalize general expense fields to match trip expense shape
    const normalizedGeneral = generalItems.map((e: any) => ({
      ...e,
      category: e.expense_category,
      amount: e.amount_rupees ?? (e.amount_paise ? e.amount_paise / 100 : 0),
      receipt_url: e.receipt_image_url,
      payment_mode: e.payment_method,
      entry_source: 'app',
    }));
    return [...tripItems, ...normalizedGeneral] as TripExpense[];
  },
  addExpense: async (id: number, payload: Partial<TripExpense>): Promise<TripExpense> => {
    const data = await api.post(`/trips/${id}/expenses`, payload);
    return data;
  },
  verifyExpense: async (tripId: number, expenseId: number) => {
    const data = await api.post(`/trips/${tripId}/expenses/${expenseId}/verify`);
    return data;
  },
  // LRs linked to this trip
  getTripLRs: async (tripId: number): Promise<any[]> => {
    const data = await api.get('/lr', { params: { trip_id: tripId, limit: 100 } });
    // Backend returns { success, data: [...], pagination } — so data.data is the array
    const items = Array.isArray((data as any)?.data) ? (data as any).data
      : (data as any)?.data?.items ?? (data as any)?.items ?? (Array.isArray(data) ? data : []);
    return items;
  },
  getTripInvoices: async (tripId: number): Promise<any[]> => {
    const data = await api.get('/finance/invoices', { params: { trip_id: tripId, limit: 100 } });
    const items = (data as any)?.data?.items ?? (data as any)?.items ?? (Array.isArray(data) ? data : []);
    return items;
  },
  getFuelEntries: async (tripId: number): Promise<any[]> => {
    const data = await api.get(`/trips/${tripId}/fuel`);
    const items = (data as any)?.data ?? (data as any)?.items ?? (Array.isArray(data) ? data : []);
    return Array.isArray(items) ? items : [];
  },
  getChecklist: async (tripId: number, type: string): Promise<any | null> => {
    const data = await api.get(`/trips/${tripId}/checklist`, { params: { type } });
    return (data as any)?.data ?? null;
  },
  // Fuel
  addFuelEntry: async (id: number, payload: any) => {
    const data = await api.post(`/trips/${id}/fuel`, payload);
    return data;
  },
  // Tracking
  getTracking: async (id: number): Promise<TripTrail> => {
    const data = await api.get(`/trips/${id}/tracking`);
    return data;
  },
  getAlerts: async (id: number): Promise<Alert[]> => {
    const data = await api.get(`/trips/${id}/alerts`);
    return data;
  },
  // Lookups
  getNextTripNumber: async () => {
    const data = await api.get('/trips/next-trip-number');
    return unwrap(data);
  },
  getJobs: async (search?: string) => {
    const data = await api.get('/trips/lookup/jobs', { params: { search } });
    return data;
  },
  getVehicles: async (search?: string) => {
    const data = await api.get('/trips/lookup/vehicles', { params: { search } });
    return data;
  },
  getDrivers: async (search?: string) => {
    const data = await api.get('/trips/lookup/drivers', { params: { search } });
    const items = unwrap<any[]>(data) ?? [];
    return items.map((d: any) => ({
      ...d,
      full_name: d.full_name || d.name || [d.first_name, d.last_name].filter(Boolean).join(' ').trim() || `Driver #${d.id}`,
      employee_id: d.employee_id || d.employee_code || `DRV${String(d.id).padStart(5, '0')}`,
      status: String(d.status || 'available').toLowerCase(),
      rating: Number(d.rating ?? 0),
      total_trips: Number(d.total_trips ?? 0),
      total_km: Number(d.total_km ?? 0),
      city: d.city || '',
      license_number: d.license_number || '',
      license_expiry: d.license_expiry || null,
      license_type: d.license_type || '',
    }));
  },
  getLRs: async (jobId?: number, search?: string) => {
    const data = await api.get('/trips/lookup/lrs', { params: { job_id: jobId, search } });
    return data;
  },
  getRoutes: async (search?: string) => {
    const data = await api.get('/trips/lookup/routes', { params: { search } });
    return unwrap(data);
  },
  getTripTypes: async () => {
    const data = await api.get('/trips/lookup/trip-types');
    return unwrap(data);
  },
  getPriorities: async () => {
    const data = await api.get('/trips/lookup/priorities');
    return unwrap(data);
  },
  getPaymentModes: async () => {
    const data = await api.get('/trips/lookup/payment-modes');
    return unwrap(data);
  },
  getExpenseCategories: async () => {
    const data = await api.get('/trips/lookup/expense-categories');
    return data;
  },
  getDocumentTypes: async () => {
    const data = await api.get('/trips/lookup/document-types');
    return data;
  },
  dispatch: async (id: number) => {
    const data = await api.post(`/trips/${id}/dispatch`);
    return data;
  },
  approvePayment: async (id: number) => {
    const data = await api.post(`/trips/${id}/approve-payment`);
    return data;
  },
  getTripDocuments: async (tripId: number): Promise<any[]> => {
    const data = await api.get(`/trips/${tripId}/trip-documents`);
    const items = (data as any)?.data ?? (Array.isArray(data) ? data : []);
    return Array.isArray(items) ? items : [];
  },
  getTripPhotos: async (tripId: number): Promise<any[]> => {
    const data = await api.get(`/trips/${tripId}/trip-photos`);
    const items = (data as any)?.data ?? (Array.isArray(data) ? data : []);
    return Array.isArray(items) ? items : [];
  },
};

// ---- Finance ----
export const financeService = {
  // Invoices
  listInvoices: async (params?: FilterParams): Promise<PaginatedResponse<Invoice>> => {
    const data = await api.get('/finance/invoices', { params });
    return data;
  },
  getInvoice: async (id: number): Promise<Invoice> => {
    const data = await api.get(`/finance/invoices/${id}`);
    return data;
  },
  createInvoice: async (payload: Partial<Invoice>): Promise<Invoice> => {
    const data = await api.post('/finance/invoices', payload);
    return data;
  },
  updateInvoice: async (id: number, payload: Partial<Invoice>): Promise<Invoice> => {
    const data = await api.put(`/finance/invoices/${id}`, payload);
    return data;
  },
  generateInvoicePDF: async (id: number) => {
    const data = await api.get(`/finance/invoices/${id}/pdf`, { responseType: 'blob' });
    return data;
  },
  sendInvoice: async (id: number) => {
    const data = await api.post(`/finance/invoices/${id}/send`);
    return data;
  },
  markInvoicePaid: async (id: number) => {
    const data = await api.post(`/finance/invoices/${id}/mark-paid`);
    return data;
  },
  generateInvoiceFromTrip: async (tripId: number) => {
    const data = await api.post(`/finance/invoices/generate-from-trip/${tripId}`);
    return data;
  },
  deleteInvoice: async (id: number) => {
    const data = await api.delete(`/finance/invoices/${id}`);
    return data;
  },

  // Payments
  listPayments: async (params?: FilterParams): Promise<PaginatedResponse<Payment>> => {
    const data = await api.get('/finance/payments', { params });
    return data;
  },
  createPayment: async (payload: Partial<Payment>): Promise<Payment> => {
    const data = await api.post('/finance/payments', payload);
    return data;
  },

  // Ledger
  getLedger: async (params?: FilterParams): Promise<LedgerEntry[]> => {
    const data = await api.get('/finance/ledger', { params });
    return Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
  },

  // GST
  getGSTSummary: async (params?: { from_date: string; to_date: string }) => {
    const data = await api.get('/finance/gst/summary', { params });
    return data;
  },
  getGSTR1: async (params?: { month: number; year: number }) => {
    const data = await api.get('/finance/gst/gstr1', { params });
    return data;
  },
  getGSTR3B: async (params?: { month: number; year: number }) => {
    const data = await api.get('/finance/gst/gstr3b', { params });
    return data;
  },

  // Receivables / Payables
  getReceivables: async (params?: FilterParams): Promise<Receivable[]> => {
    const data = await api.get('/finance/receivables', { params });
    return unwrap(data);
  },
  getPayables: async (params?: FilterParams): Promise<Payable[]> => {
    const data = await api.get('/finance/payables', { params });
    return unwrap(data);
  },
  getProfitLoss: async (params?: { from_date: string; to_date: string }) => {
    const data = await api.get('/finance/profit-loss', { params });
    return data;
  },

  // Banking Entries
  listBankingEntries: async (params?: FilterParams) => {
    const data = await api.get('/finance/banking/entries', { params });
    return unwrap(data);
  },
  createBankingEntry: async (payload: any) => {
    const data = await api.post('/finance/banking/entries', payload);
    return data;
  },
  getBankingEntry: async (id: number) => {
    const data = await api.get(`/finance/banking/entries/${id}`);
    return data;
  },
  getBankAccounts: async () => {
    const data = await api.get('/finance/banking/accounts');
    return unwrap(data);
  },
  getNextBankingEntryNumber: async () => {
    const data = await api.get('/finance/banking/next-entry-number');
    return unwrap(data);
  },

  // ── Finance Automation ──

  // Payment Links
  createPaymentLink: async (invoiceId: number) => {
    const data = await api.post('/finance/payment-links', { invoice_id: invoiceId });
    return unwrap(data);
  },
  listPaymentLinks: async (params?: FilterParams) => {
    const data = await api.get('/finance/payment-links', { params });
    return data;
  },
  resendPaymentLink: async (linkId: number) => {
    const data = await api.post(`/finance/payment-links/${linkId}/resend`);
    return data;
  },

  // Bank Reconciliation
  importBankStatement: async (accountId: number, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const data = await api.post(`/finance/bank-statements/import?account_id=${accountId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
  autoReconcile: async (statementId: number) => {
    const data = await api.post(`/finance/bank-statements/${statementId}/reconcile`);
    return unwrap(data);
  },
  getReconciliationSummary: async (statementId: number) => {
    const data = await api.get(`/finance/bank-statements/${statementId}/summary`);
    return unwrap(data);
  },
  listStatementLines: async (statementId: number, params?: FilterParams) => {
    const data = await api.get(`/finance/bank-statements/${statementId}/lines`, { params });
    return data;
  },
  manualMatchLine: async (lineId: number, payload: { payment_id?: number; invoice_id?: number }) => {
    const data = await api.post(`/finance/bank-statements/lines/${lineId}/match`, payload);
    return data;
  },
  ignoreStatementLine: async (lineId: number) => {
    const data = await api.post(`/finance/bank-statements/lines/${lineId}/ignore`);
    return data;
  },

  // Driver Settlements
  createSettlement: async (payload: { driver_id: number; period_from: string; period_to: string }) => {
    const data = await api.post('/finance/settlements', payload);
    return unwrap(data);
  },
  listSettlements: async (params?: FilterParams) => {
    const data = await api.get('/finance/settlements', { params });
    return data;
  },
  approveSettlement: async (id: number) => {
    const data = await api.post(`/finance/settlements/${id}/approve`);
    return data;
  },
  listDriverSettlements: async (params?: FilterParams) => {
    const data = await api.get('/payables', { params });
    return data;
  },
  approveDriverSettlement: async (id: number) => {
    const data = await api.patch(`/payables/${id}/approve`);
    return data;
  },
  payDriverSettlement: async (id: number, paymentData: {
    payment_method: string;
    reference_number?: string;
    paid_date?: string;
  }) => {
    const data = await api.patch(`/payables/${id}/mark-paid`, paymentData);
    return data;
  },
  paySettlement: async (id: number) => {
    const data = await api.post(`/finance/settlements/${id}/pay`);
    return data;
  },

  // Trip Expenses
  listExpenses: async (params?: FilterParams) => {
    const data = await api.get('/accountant/expenses', { params });
    return data;
  },
  approveExpense: async (id: number) => {
    const data = await api.put(`/accountant/expenses/${id}/approve`);
    return data;
  },
  rejectExpense: async (id: number, reason?: string) => {
    const data = await api.put(`/accountant/expenses/${id}/reject`, reason ? { reason } : undefined);
    return data;
  },
  payExpense: async (id: number, paymentData: {
    payment_mode: string;
    reference_number?: string;
  }) => {
    const data = await api.put(`/accountant/expenses/${id}/mark-paid`, paymentData);
    return data;
  },

  // Supplier Payables
  createSupplierPayable: async (payload: any) => {
    const data = await api.post('/finance/supplier-payables', payload);
    return unwrap(data);
  },
  listSupplierPayables: async (params?: FilterParams) => {
    const data = await api.get('/finance/supplier-payables', { params });
    return data;
  },
  paySupplierPayable: async (id: number, paymentData: {
    payment_method: string;
    reference_number?: string;
    paid_date?: string;
  }) => {
    const data = await api.post(`/finance/supplier-payables/${id}/pay`, paymentData);
    return data;
  },

  // Market Trips (hired/contracted vehicles)
  listMarketTrips: async (params?: FilterParams) => {
    const data = await api.get('/market-trips', { params });
    return data;
  },
  settleMarketTrip: async (id: number, paymentData: {
    settlement_reference: string;
    settlement_remarks?: string;
  }) => {
    const data = await api.post(`/market-trips/${id}/settle`, paymentData);
    return data;
  },

  // Razorpay
  razorpayStatus: async () => {
    const data = await api.get('/finance/razorpay/status');
    return data;
  },
  createRazorpayLink: async (payload: {
    invoice_id: number;
  }) => {
    const data = await api.post('/finance/payment-links', payload);
    return unwrap(data);
  },

  // FASTag
  listFASTagTransactions: async (params?: FilterParams) => {
    const data = await api.get('/finance/fastag', { params });
    return data;
  },

  // Finance Alerts
  listFinanceAlerts: async (params?: FilterParams) => {
    const data = await api.get('/finance/alerts', { params });
    return data;
  },
  markAlertRead: async (id: number) => {
    const data = await api.post(`/finance/alerts/${id}/read`);
    return data;
  },
  resolveAlert: async (id: number) => {
    const data = await api.post(`/finance/alerts/${id}/resolve`);
    return data;
  },

  // Finance Reports
  getDailyDigest: async (reportDate?: string) => {
    const data = await api.get('/finance/reports/daily-digest', { params: reportDate ? { report_date: reportDate } : undefined });
    return unwrap(data);
  },
  getWeeklyPL: async (weekEnding?: string) => {
    const data = await api.get('/finance/reports/weekly-pl', { params: weekEnding ? { week_ending: weekEnding } : undefined });
    return unwrap(data);
  },
  getMonthlyClose: async (year: number, month: number) => {
    const data = await api.get('/finance/reports/monthly-close', { params: { year, month } });
    return unwrap(data);
  },
  getGSTR1Report: async (year: number, month: number) => {
    const data = await api.get('/finance/reports/gstr1', { params: { year, month } });
    return unwrap(data);
  },

  // Automation Checks
  checkDuplicateBilling: async (clientId: number, tripId: number) => {
    const data = await api.get('/finance/automation/duplicate-check', { params: { client_id: clientId, trip_id: tripId } });
    return unwrap(data);
  },
  checkFreightLeakage: async (invoiceId: number) => {
    const data = await api.get(`/finance/automation/freight-leakage/${invoiceId}`);
    return unwrap(data);
  },
  getPartialPayments: async () => {
    const data = await api.get('/finance/automation/partial-payments');
    return unwrap(data);
  },
};

// ---- Tracking ----
export const trackingService = {
  getLiveVehicles: async (): Promise<VehicleTracking[]> => {
    const data = await api.get('/tracking/live');
    return unwrap(data);
  },
  getVehicleTracking: async (vehicleId: number): Promise<VehicleTracking> => {
    const data = await api.get(`/tracking/vehicle/${vehicleId}`);
    return unwrap(data);
  },
  getTripTrail: async (tripId: number): Promise<TripTrail> => {
    const data = await api.get(`/tracking/trip/${tripId}/trail`);
    return data;
  },
  getAlerts: async (params?: FilterParams): Promise<Alert[]> => {
    const data = await api.get('/tracking/alerts', { params });
    return unwrap(data);
  },
  acknowledgeAlert: async (id: string) => {
    const data = await api.post(`/tracking/alerts/${id}/acknowledge`);
    return data;
  },
};

// ---- Reports ----
const buildReportParams = (params?: FilterParams) => {
  const reportParams: any = { ...(params || {}) };
  const from = (reportParams as any).from;
  const to = (reportParams as any).to;

  if (!from) {
    delete (reportParams as any).from;
  }
  if (!to) {
    delete (reportParams as any).to;
  }

  return Object.keys(reportParams).length ? reportParams : undefined;
};

export const reportService = {
  dashboard: async () => {
    const data = await api.get('/reports/dashboard');
    return unwrap(data);
  },
  tripSummary: async (params?: FilterParams) => {
    const data = await api.get('/reports/trip-summary', { params: buildReportParams(params) });
    return data;
  },
  vehiclePerformance: async (params?: FilterParams) => {
    const data = await api.get('/reports/vehicle-performance', { params: buildReportParams(params) });
    return data;
  },
  driverPerformance: async (params?: FilterParams) => {
    const data = await api.get('/reports/driver-performance', { params: buildReportParams(params) });
    return data;
  },
  fuelAnalysis: async (params?: FilterParams) => {
    const data = await api.get('/reports/fuel-analysis', { params: buildReportParams(params) });
    return data;
  },
  revenueAnalysis: async (params?: FilterParams) => {
    const data = await api.get('/reports/revenue-analysis', { params: buildReportParams(params) });
    return data;
  },
  expenseAnalysis: async (params?: FilterParams) => {
    const data = await api.get('/reports/expense-analysis', { params: buildReportParams(params) });
    return data;
  },
  routeAnalysis: async (params?: FilterParams) => {
    const data = await api.get('/reports/route-analysis', { params: buildReportParams(params) });
    return data;
  },
  clientOutstanding: async (params?: FilterParams) => {
    const data = await api.get('/reports/client-outstanding', { params: buildReportParams(params) });
    return data;
  },
  maintenanceReport: async (params?: FilterParams) => {
    const data = await api.get('/reports/maintenance', { params: buildReportParams(params) });
    return data;
  },
  exportReport: async (reportType: string, format: string, params?: FilterParams) => {
    const data = await api.get(`/reports/export/${reportType}`, {
      params: { format, ...params },
      responseType: 'blob',
    });
    return data;
  },
  auditorReport: async (params?: { from_date?: string; to_date?: string; ledger_page?: number; ledger_per_page?: number }) => {
    const data = await api.get('/reports/auditor', { params });
    return data;
  },
  exportAuditorReport: async (format: 'csv' | 'pdf', params?: { from_date?: string; to_date?: string }) => {
    const data = await api.get('/reports/auditor/export', {
      params: { format, ...params },
      responseType: 'blob',
    });
    return data;
  },
};

// ---- Dashboard ----
// Note: Backend returns { success, data, message } wrapper
export const dashboardService = {
  getOverview: async (): Promise<DashboardStats> => {
    const data = await api.get('/dashboard/overview');
    return data.data ?? data;
  },
  getFleetStats: async () => {
    const data = await api.get('/dashboard/fleet-stats');
    return data.data ?? data;
  },
  getTripStats: async () => {
    const data = await api.get('/dashboard/trip-stats');
    return data.data ?? data;
  },
  getFinanceStats: async () => {
    const data = await api.get('/dashboard/finance-stats');
    return data.data ?? data;
  },
  getRevenueTrend: async (params?: { period?: string }): Promise<ChartDataPoint[]> => {
    const data = await api.get('/dashboard/charts/revenue-trend', { params });
    return data.data ?? data;
  },
  getExpenseBreakdown: async (): Promise<ChartDataPoint[]> => {
    const data = await api.get('/dashboard/charts/expense-breakdown');
    return data.data ?? data;
  },
  getFleetUtilization: async (): Promise<ChartDataPoint[]> => {
    const data = await api.get('/dashboard/charts/fleet-utilization');
    return data.data ?? data;
  },
  getNotifications: async (): Promise<Notification[]> => {
    const data = await api.get('/dashboard/notifications');
    const items = data.data ?? data;
    return Array.isArray(items) ? items : (items?.alerts ?? []);
  },
  markNotificationRead: async (id: string) => {
    await api.post(`/dashboard/notifications/${id}/read`);
  },

  // Project Associate Dashboard
  getPAKpis: async (params?: { date_filter?: string; from_date?: string; to_date?: string }) => {
    const data = await api.get('/dashboard/pa/kpis', { params });
    return data.data ?? data;
  },
  getPAActionCenter: async () => {
    const data = await api.get('/dashboard/pa/action-center');
    return data.data ?? data;
  },
  getPAJobPipeline: async () => {
    const data = await api.get('/dashboard/pa/job-pipeline');
    return data.data ?? data;
  },
  getPARecentActivity: async (limit?: number) => {
    const data = await api.get('/dashboard/pa/recent-activity', { params: { limit } });
    return data.data ?? data;
  },
  getPABankingStatus: async () => {
    const data = await api.get('/dashboard/pa/banking-status');
    return data.data ?? data;
  },

  // PA-specific: Fleet, Compliance, Trip Workflow, Alerts, Revenue
  getPAFleetStatus: async () => {
    const data = await api.get('/dashboard/pa/fleet-status');
    return data.data ?? data;
  },
  getPAComplianceAlerts: async () => {
    const data = await api.get('/dashboard/pa/compliance-alerts');
    return data.data ?? data;
  },
  getPATripWorkflow: async () => {
    const data = await api.get('/dashboard/pa/trip-workflow');
    return data.data ?? data;
  },
  getPASystemAlerts: async () => {
    const data = await api.get('/dashboard/pa/system-alerts');
    return data.data ?? data;
  },
  getPARevenueSnapshot: async (params?: { period?: string }) => {
    const data = await api.get('/dashboard/pa/revenue-snapshot', { params });
    return data.data ?? data;
  },

  // Role-specific stats (shared with mobile app)
  getAdminStats: async () => {
    const data = await api.get('/admin/dashboard/stats');
    return data.data ?? data;
  },
  getManagerStats: async () => {
    const data = await api.get('/manager/dashboard/stats');
    return data.data ?? data;
  },
};

// ---- Documents ----
export const documentService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Document>> => {
    const data = await api.get('/documents', { params });
    return data;
  },
  get: async (id: number): Promise<Document> => {
    const data = await api.get(`/documents/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Document>): Promise<Document> => {
    const data = await api.post('/documents', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Document>): Promise<Document> => {
    const data = await api.put(`/documents/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/documents/${id}`);
  },
  submit: async (id: number): Promise<Document> => {
    const data = await api.post(`/documents/${id}/submit`);
    return data;
  },
  approve: async (id: number): Promise<Document> => {
    const data = await api.post(`/documents/${id}/approve`);
    return data;
  },
  reject: async (id: number, reason: string): Promise<Document> => {
    const data = await api.post(`/documents/${id}/reject`, null, { params: { reason } });
    return data;
  },
  stats: async (): Promise<DocumentStats> => {
    const data = await api.get('/documents/stats');
    return unwrap(data);
  },
  getNextDocNumber: async (): Promise<string> => {
    const data = await api.get('/documents/next-doc-number');
    return unwrap<{ doc_number: string }>(data).doc_number;
  },
  lookupDocumentTypes: async () => {
    return [
      { value: 'rc', label: 'Registration Certificate (RC)' },
      { value: 'insurance', label: 'Insurance' },
      { value: 'fitness', label: 'Fitness Certificate' },
      { value: 'license', label: 'Driving License' },
      { value: 'pollution', label: 'Pollution (PUC)' },
      { value: 'invoice', label: 'Invoice' },
      { value: 'eway_bill', label: 'E-Way Bill' },
      { value: 'lr_copy', label: 'LR Copy' },
      { value: 'permit', label: 'Permit' },
      { value: 'contract', label: 'Contract' },
      { value: 'pod', label: 'Proof of Delivery (POD)' },
      { value: 'tax_receipt', label: 'Tax Receipt' },
      { value: 'other', label: 'Other' },
    ];
  },
  lookupEntityTypes: async () => {
    return [
      { value: 'vehicle', label: 'Vehicle' },
      { value: 'driver', label: 'Driver' },
      { value: 'trip', label: 'Trip' },
      { value: 'client', label: 'Client' },
      { value: 'finance', label: 'Finance' },
    ];
  },
  lookupEntities: async (entityType: string, search?: string) => {
    const data = await api.get('/documents/lookup/entities', { params: { entity_type: entityType, search } });
    const items = unwrap<{ items?: Array<{ id: number; name?: string; label?: string; type?: string }> }>(data).items ?? [];
    return items.map((item) => ({
      id: item.id,
      label: item.label ?? item.name ?? '',
      type: item.type ?? entityType,
    }));
  },
  lookupComplianceCategories: async () => {
    const data = await api.get('/documents/lookup/compliance-categories');
    return unwrap<{ items: any[] }>(data).items;
  },
  lookupReminderOptions: async () => {
    const data = await api.get('/documents/lookup/reminder-options');
    return unwrap<{ items: any[] }>(data).items;
  },
  lookupApprovalStatuses: async () => {
    const data = await api.get('/documents/lookup/approval-statuses');
    return data.items;
  },
  lookupReviewers: async () => {
    const data = await api.get('/documents/lookup/reviewers');
    return unwrap<{ items: any[] }>(data).items;
  },
  // ── Extraction helpers ──────────────────────────────────────────────────
  extract: async (formData: FormData): Promise<{ extracted: boolean; data: Record<string, any>; entity_type?: string; message?: string }> => {
    const data = await api.post('/documents/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // AI extraction can take up to 2 minutes
    });
    return unwrap<any>(data);
  },
  getRequirements: async (entityType: string): Promise<Record<string, any>> => {
    const data = await api.get('/documents/requirements', { params: { entity_type: entityType } });
    return unwrap(data);
  },
  listForEntity: async (entityId: number, entityType: string): Promise<Document[]> => {
    if ((entityType || '').toLowerCase() === 'driver') {
      const data = await api.get(`/drivers/${entityId}/documents`);
      const payload = unwrap<any>(data);
      const items = payload?.items ?? payload ?? [];
      return (items as any[]).map((item) => ({
        ...item,
        document_type: (item.document_type ?? item.doc_type ?? '').toLowerCase(),
        created_at: item.created_at ?? item.uploaded_at ?? null,
        expiry_date: item.expiry_date ?? null,
      })) as Document[];
    }

    const data = await api.get('/documents', { params: { entity_id: entityId, entity_type: entityType, page: 1, limit: 500 } });
    const items = unwrap<any>(data);
    return (Array.isArray(items) ? items : []) as Document[];
  },
  uploadFile: async (formData: FormData): Promise<Document> => {
    const data = await api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
};

// ---- Routes ----
export const routeService = {
  list: async (params?: FilterParams): Promise<Route[]> => {
    const data = await api.get('/routes', { params });
    return unwrap(data);
  },
  get: async (id: number): Promise<Route> => {
    const data = await api.get(`/routes/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Route>): Promise<Route> => {
    const data = await api.post('/routes', payload);
    return data;
  },
  update: async (id: number, payload: Partial<Route>): Promise<Route> => {
    const data = await api.put(`/routes/${id}`, payload);
    return data;
  },
};

// ---- Fleet Manager ----
export const fleetService = {
  // Dashboard
  getDashboardKPIs: async () => {
    const data = await api.get('/fleet/dashboard/kpis');
    return unwrap(data);
  },
  getFleetUtilizationChart: async (period = 'monthly') => {
    const data = await api.get('/fleet/dashboard/charts/fleet-utilization', { params: { period } });
    return unwrap(data);
  },
  getFuelConsumptionChart: async (period = 'monthly') => {
    const data = await api.get('/fleet/dashboard/charts/fuel-consumption', { params: { period } });
    return unwrap(data);
  },
  getMaintenanceCostChart: async (period = 'monthly') => {
    const data = await api.get('/fleet/dashboard/charts/maintenance-cost', { params: { period } });
    return unwrap(data);
  },
  getTripEfficiencyChart: async (period = 'monthly') => {
    const data = await api.get('/fleet/dashboard/charts/trip-efficiency', { params: { period } });
    return unwrap(data);
  },
  getRecentAlerts: async (limit = 10) => {
    const data = await api.get('/fleet/dashboard/recent-alerts', { params: { limit } });
    return unwrap(data);
  },
  getExpiringDocuments: async (days = 30) => {
    const data = await api.get('/fleet/dashboard/expiring-documents', { params: { days } });
    return unwrap(data);
  },
  getUpcomingMaintenance: async () => {
    const data = await api.get('/fleet/dashboard/upcoming-maintenance');
    return unwrap(data);
  },
  getActiveTrips: async () => {
    const data = await api.get('/fleet/dashboard/active-trips');
    return unwrap(data);
  },

  // Fleet Vehicles
  getVehicles: async (params?: any) => {
    const data = await api.get('/vehicles', { params });
    return data;
  },
  getVehicleProfile: async (vehicleId: number) => {
    const data = await api.get(`/fleet/vehicles/${vehicleId}/profile`);
    return data;
  },

  // Vehicle-Driver Assignments
  getVehicleAssignments: async () => {
    const data = await api.get('/fleet/vehicle-assignments');
    return unwrap(data);
  },
  assignDriverToVehicle: async (vehicleId: number, driverId: number | null) => {
    const data = await api.post(`/fleet/vehicles/${vehicleId}/assign-driver`, { driver_id: driverId });
    return unwrap(data);
  },

  // Fleet Drivers
  getDrivers: async (params?: any) => {
    const data = await api.get('/fleet/drivers', { params });
    return unwrap(data);
  },
  getDriverProfile: async (driverId: number) => {
    const data = await api.get(`/fleet/drivers/${driverId}/profile`);
    return data;
  },

  // Live Tracking
  getLiveTracking: async () => {
    const data = await api.get('/fleet/tracking/live');
    return unwrap(data);
  },

  // Maintenance
  getMaintenanceSchedule: async (params?: any) => {
    const data = await api.get('/fleet/maintenance/schedule', { params });
    return unwrap(data);
  },
  getWorkOrders: async (params?: any) => {
    const data = await api.get('/fleet/maintenance/work-orders', { params });
    return unwrap(data);
  },
  getPartsInventory: async () => {
    const data = await api.get('/fleet/maintenance/parts-inventory');
    return unwrap(data);
  },
  getTyreManagement: async () => {
    const data = await api.get('/tyre');
    return unwrap(data);
  },
  getBatteryMonitoring: async () => {
    const data = await api.get('/fleet/maintenance/battery');
    return unwrap(data);
  },

  // Fuel
  getFuelRecords: async (params?: any) => {
    const data = await api.get('/fuel', { params });
    return unwrap(data);
  },
  getFuelSummary: async (period = 'this_month') => {
    const data = await api.get('/fleet/fuel/summary', { params: { period } });
    return unwrap(data);
  },

  // Alerts
  getAlerts: async (params?: any) => {
    // Pull alerts from tracking/alerts (richer source: doc expiry, maintenance, fuel, trips)
    let items: any[] = [];
    try {
      const trackingData = await api.get('/tracking/alerts', { params: { severity: params?.severity } });
      const trackingAlerts = unwrap(trackingData) || [];
      items = trackingAlerts.map((a: any) => ({
        id: String(a.id),
        type: a.type || 'system',
        severity: a.severity || 'info',
        title: a.title || 'Alert',
        message: a.message || '',
        vehicle: a.vehicle || '',
        driver: a.driver || '',
        location: a.location || '',
        created_at: a.created_at || new Date().toISOString(),
        acknowledged: !!a.acknowledged,
      }));
    } catch {
      // Fallback to dashboard notifications
      const data = await api.get('/dashboard/notifications');
      items = (unwrap(data) || []).map((a: any) => ({
        id: String(a.id),
        type: a.type === 'warning' ? 'document_expiry' : (a.type || 'system'),
        severity: a.type === 'warning' ? 'warning' : 'info',
        title: a.title || 'Alert',
        message: a.message || '',
        vehicle: a.vehicle || '',
        driver: a.driver || '',
        location: a.location || '',
        created_at: a.timestamp || new Date().toISOString(),
        acknowledged: !!a.read,
      }));
    }

    // Apply client-side filters
    const filtered = items.filter((item: any) => {
      if (params?.alert_type && item.type !== params.alert_type) return false;
      if (params?.severity && item.severity !== params.severity) return false;
      return true;
    });

    const summary = {
      critical: filtered.filter((i: any) => i.severity === 'critical').length,
      warning: filtered.filter((i: any) => i.severity === 'warning').length,
      info: filtered.filter((i: any) => i.severity === 'info').length,
    };

    return { items: filtered, summary, total: filtered.length };
  },
  acknowledgeAlert: async (alertId: string) => {
    const data = await api.post(`/dashboard/notifications/${alertId}/read`);
    return unwrap(data);
  },

  // Reports
  getFleetUtilizationReport: async (params?: any) => {
    const data = await api.get('/fleet/reports/fleet-utilization', { params });
    return unwrap(data);
  },
  getVehicleProfitabilityReport: async (params?: any) => {
    const data = await api.get('/fleet/reports/vehicle-profitability', { params });
    return unwrap(data);
  },
  getDriverPerformanceReport: async (params?: any) => {
    const data = await api.get('/fleet/reports/driver-performance', { params });
    return unwrap(data);
  },
  getMaintenanceCostReport: async (params?: any) => {
    const data = await api.get('/fleet/reports/maintenance-cost', { params });
    return unwrap(data);
  },
  getFuelConsumptionReport: async (params?: any) => {
    const data = await api.get('/fleet/reports/fuel-consumption', { params });
    return unwrap(data);
  },
  getTripPerformanceReport: async (params?: any) => {
    const data = await api.get('/fleet/reports/trip-performance', { params });
    return unwrap(data);
  },
  exportReport: async (reportType: string, format = 'csv', params?: any) => {
    const data = await api.get(`/reports/export/${reportType}`, { params: { format, ...params }, responseType: 'blob' });
    return data;
  },
};

// ---- Accountant ----
export const accountantService = {
  // Dashboard
  getDashboardKPIs: async (period = 'this_month') => {
    const data = await api.get('/accountant/dashboard/kpis', { params: { period } });
    return unwrap(data);
  },
  getRevenueTrend: async (period = '6_months') => {
    const data = await api.get('/accountant/dashboard/revenue-trend', { params: { period } });
    return unwrap(data);
  },
  getExpenseBreakdown: async (period = 'this_month') => {
    const data = await api.get('/accountant/dashboard/expense-breakdown', { params: { period } });
    return unwrap(data);
  },
  getCashFlow: async (period = '6_months') => {
    const data = await api.get('/accountant/dashboard/cash-flow', { params: { period } });
    return unwrap(data);
  },
  getReceivablesAging: async () => {
    const data = await api.get('/accountant/dashboard/receivables-aging');
    return data;
  },
  getRecentTransactions: async (limit = 10) => {
    const data = await api.get('/accountant/dashboard/recent-transactions', { params: { limit } });
    return unwrap(data);
  },
  getPendingActions: async () => {
    const data = await api.get('/accountant/dashboard/pending-actions');
    return unwrap(data);
  },

  // Invoices
  listInvoices: async (params?: any) => {
    const data = await api.get('/accountant/invoices', { params });
    return data;
  },
  getInvoiceDetail: async (id: number) => {
    const data = await api.get(`/accountant/invoices/${id}`);
    return data;
  },
  createInvoice: async (payload: any) => {
    const data = await api.post('/accountant/invoices', payload);
    return data;
  },
  updateInvoice: async (id: number, payload: any) => {
    const data = await api.put(`/accountant/invoices/${id}`, payload);
    return data;
  },
  sendInvoice: async (id: number) => {
    const data = await api.post(`/accountant/invoices/${id}/send`);
    return data;
  },
  downloadInvoicePdf: async (id: number) => {
    const data = await api.get(`/accountant/invoices/${id}/pdf`);
    return data;
  },
  getUnbilledTrips: async () => {
    const data = await api.get('/accountant/invoices/unbilled-trips');
    return data;
  },

  // Receivables
  getReceivables: async (params?: any) => {
    const data = await api.get('/accountant/receivables', { params });
    return data;
  },
  sendPaymentReminder: async (clientId: number) => {
    const data = await api.post(`/accountant/receivables/${clientId}/send-reminder`);
    return data;
  },

  // Payables
  getPayables: async (params?: any) => {
    const data = await api.get('/accountant/payables', { params });
    return unwrap(data);
  },
  recordPayablePayment: async (payableId: number, payload: any) => {
    const data = await api.post(`/accountant/payables/${payableId}/pay`, payload);
    return data;
  },

  // Expenses
  listExpenses: async (params?: any) => {
    const data = await api.get('/accountant/expenses', { params });
    return data;
  },
  createExpense: async (payload: any) => {
    const data = await api.post('/accountant/expenses', payload);
    return data;
  },
  approveExpense: async (id: number) => {
    const data = await api.put(`/accountant/expenses/${id}/approve`);
    return data;
  },
  rejectExpense: async (id: number, _reason?: string) => {
    const data = await api.put(`/accountant/expenses/${id}/reject`);
    return data;
  },

  // Fuel Expenses
  listFuelExpenses: async (params?: any) => {
    const data = await api.get('/accountant/fuel-expenses', { params });
    return unwrap(data);
  },
  createFuelExpense: async (payload: any) => {
    const data = await api.post('/accountant/fuel-expenses', payload);
    return data;
  },
  getFuelExpenseSummary: async (period = 'this_month') => {
    const data = await api.get('/accountant/fuel-expenses/summary', { params: { period } });
    return unwrap(data);
  },

  // Banking
  getBankingOverview: async () => {
    const data = await api.get('/accountant/banking/overview');
    return unwrap(data);
  },
  listBankTransactions: async (params?: any) => {
    const data = await api.get('/accountant/banking/transactions', { params });
    return unwrap(data);
  },
  recordDeposit: async (payload: any) => {
    const data = await api.post('/accountant/banking/deposit', payload);
    return data;
  },
  recordWithdrawal: async (payload: any) => {
    const data = await api.post('/accountant/banking/withdrawal', payload);
    return data;
  },
  recordTransfer: async (payload: any) => {
    const data = await api.post('/accountant/banking/transfer', payload);
    return data;
  },

  // Ledger
  getLedgerAccounts: async (params?: any) => {
    const data = await api.get('/accountant/ledger/accounts', { params });
    return unwrap(data);
  },
  getLedgerAccountEntries: async (accountId: number, params?: any) => {
    const data = await api.get(`/accountant/ledger/accounts/${accountId}/entries`, { params });
    return data;
  },

  // Reports
  getProfitLossReport: async (params?: any) => {
    const data = await api.get('/accountant/reports/profit-loss', { params });
    return data;
  },
  getExpenseReport: async (params?: any) => {
    const data = await api.get('/accountant/reports/expense-report', { params });
    return data;
  },
  getRevenueReport: async (params?: any) => {
    const data = await api.get('/accountant/reports/revenue-report', { params });
    return data;
  },
  getTripProfitabilityReport: async (params?: any) => {
    const data = await api.get('/accountant/reports/trip-profitability', { params });
    return data;
  },
  getClientOutstandingReport: async () => {
    const data = await api.get('/accountant/reports/client-outstanding');
    return data;
  },
  getVendorPayablesReport: async () => {
    const data = await api.get('/accountant/reports/vendor-payables');
    return data;
  },
  getFuelCostReport: async (params?: any) => {
    const data = await api.get('/accountant/reports/fuel-cost', { params });
    return data;
  },
  getMonthlySummaryReport: async (params?: any) => {
    const data = await api.get('/accountant/reports/monthly-summary', { params });
    return data;
  },
  exportReport: async (reportType: string, format = 'csv', params?: any) => {
    const data = await api.get(`/reports/export/${reportType}`, { params: { format, ...params }, responseType: 'blob' });
    return data;
  },
  getDriverPayments: async (statusFilter?: string) => {
    const data = await api.get('/accountant/driver-payments', { params: { status_filter: statusFilter } });
    return unwrap(data);
  },
  processDriverPayment: async (paymentId: number, payload: any) => {
    const data = await api.post(`/accountant/driver-payments/${paymentId}/mark-paid`, payload);
    return data;
  },
};


// ---- VAHAN (Vehicle Compliance) ----
export const vahanService = {
  lookupRC: async (regNumber: string) => {
    const data = await api.get(`/vahan/rc/${regNumber}`);
    return unwrap(data);
  },
  checkInsurance: async (regNumber: string) => {
    const data = await api.get(`/vahan/insurance/${regNumber}`);
    return unwrap(data);
  },
  checkFitness: async (regNumber: string) => {
    const data = await api.get(`/vahan/fitness/${regNumber}`);
    return unwrap(data);
  },
  checkPermit: async (regNumber: string) => {
    const data = await api.get(`/vahan/permit/${regNumber}`);
    return unwrap(data);
  },
  checkPUC: async (regNumber: string) => {
    const data = await api.get(`/vahan/puc/${regNumber}`);
    return unwrap(data);
  },
  fullCheck: async (regNumber: string) => {
    const data = await api.get(`/vahan/full-check/${regNumber}`);
    return unwrap(data);
  },
};

// ---- Sarathi (DL Verification) ----
export const sarathiService = {
  verifyDL: async (dlNumber: string, dob: string) => {
    const data = await api.get(`/sarathi/verify/${dlNumber}`, { params: { dob } });
    return unwrap(data);
  },
  getDLDetails: async (dlNumber: string) => {
    const data = await api.get(`/sarathi/details/${dlNumber}`);
    return unwrap(data);
  },
};

// ---- eChallan ----
export const echallanService = {
  getByVehicle: async (regNumber: string) => {
    const data = await api.get(`/echallan/vehicle/${regNumber}`);
    return unwrap(data);
  },
  getByDriver: async (dlNumber: string) => {
    const data = await api.get(`/echallan/driver/${dlNumber}`);
    return unwrap(data);
  },
  getStatus: async (challanNumber: string) => {
    const data = await api.get(`/echallan/status/${challanNumber}`);
    return unwrap(data);
  },
};

// ---- GST Verification ----
export const gstService = {
  verifyGSTIN: async (gstin: string) => {
    const data = await api.get(`/gst/verify/${gstin}`);
    return unwrap(data);
  },
};

// ---- Maps ----
export const mapsService = {
  getRouteDistance: async (origin: { lat: number; lng: number }, dest: { lat: number; lng: number }) => {
    const data = await api.get('/maps/route', {
      params: { origin_lat: origin.lat, origin_lng: origin.lng, dest_lat: dest.lat, dest_lng: dest.lng },
    });
    return unwrap(data);
  },
  geocode: async (address: string) => {
    const data = await api.get('/maps/geocode', { params: { address } });
    return unwrap(data);
  },
  reverseGeocode: async (lat: number, lng: number) => {
    const data = await api.get('/maps/reverse-geocode', { params: { lat, lng } });
    return unwrap(data);
  },
};

// ---- GPS Tracking ----
export const gpsTrackingService = {
  getLivePositions: async () => {
    const data = await api.get('/tracking/gps/positions');
    return unwrap(data);
  },
  getVehiclePath: async (vehicleId: string, hours = 24) => {
    const data = await api.get(`/tracking/gps/path/${vehicleId}`, { params: { hours } });
    return unwrap(data);
  },
};

// ---- Unified Tracking ----
export const unifiedTrackingService = {
  getVehicles: async (params?: Record<string, string>) => {
    const data = await api.get('/tracking/unified/vehicles', { params });
    return unwrap(data);
  },
  getProviders: async () => {
    const data = await api.get('/tracking/unified/providers');
    return unwrap(data);
  },
  activateProvider: async (providerId: string, payload: { api_key: string; api_endpoint?: string }) => {
    const data = await api.post(`/tracking/unified/providers/${providerId}/activate`, payload);
    return unwrap(data);
  },
  pollAll: async () => {
    const data = await api.post('/tracking/unified/poll');
    return unwrap(data);
  },
};

// ---- Notifications ----
export const notificationService = {
  sendPush: async (payload: { device_token: string; title: string; body: string; data?: Record<string, any> }) => {
    const data = await api.post('/notifications/push', payload);
    return unwrap(data);
  },
  sendSMS: async (phone: string, message: string) => {
    const data = await api.post('/notifications/sms', { phone, message });
    return unwrap(data);
  },
  sendWhatsApp: async (phone: string, message: string) => {
    const data = await api.post('/notifications/whatsapp', { phone, message });
    return unwrap(data);
  },
};

// ---- Fuel Prices ----
export const fuelPriceService = {
  getPrice: async (city = 'coimbatore') => {
    const data = await api.get('/fuel-prices', { params: { city } });
    return unwrap(data);
  },
  getBulkPrices: async () => {
    const data = await api.get('/fuel-prices/bulk');
    return unwrap(data);
  },
};

// ---- Suppliers ----
export const supplierService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Supplier>> => {
    const data = await api.get('/suppliers', { params });
    return data;
  },
  get: async (id: number): Promise<Supplier> => {
    const data = await api.get(`/suppliers/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Supplier>): Promise<Supplier> => {
    const data = await api.post('/suppliers', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Supplier>): Promise<Supplier> => {
    const data = await api.put(`/suppliers/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/suppliers/${id}`);
  },
  getVehicles: async (id: number) => {
    const data = await api.get(`/suppliers/${id}/vehicles`);
    return unwrap(data);
  },
  addVehicle: async (id: number, payload: { vehicle_id?: number; vehicle_registration?: string; vehicle_type?: string }) => {
    const data = await api.post(`/suppliers/${id}/vehicles`, payload);
    return unwrap(data);
  },
  removeVehicle: async (svId: number): Promise<void> => {
    await api.delete(`/suppliers/vehicles/${svId}`);
  },
  getTrips: async (id: number, params?: FilterParams) => {
    const data = await api.get(`/suppliers/${id}/trips`, { params });
    return data;
  },
  getStatement: async (id: number) => {
    const data = await api.get(`/suppliers/${id}/statement`);
    return unwrap(data);
  },
};

// ---- Market Trips ----
export const marketTripService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<MarketTrip>> => {
    const data = await api.get('/market-trips', { params });
    return data;
  },
  get: async (id: number): Promise<MarketTrip> => {
    const data = await api.get(`/market-trips/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<MarketTrip>): Promise<MarketTrip> => {
    const data = await api.post('/market-trips', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<MarketTrip>): Promise<MarketTrip> => {
    const data = await api.put(`/market-trips/${id}`, payload);
    return unwrap(data);
  },
  assign: async (id: number, payload: { vehicle_registration: string; driver_name: string; driver_phone: string; driver_license?: string }) => {
    const data = await api.put(`/market-trips/${id}/assign`, payload);
    return unwrap(data);
  },
  startTransit: async (id: number) => {
    const data = await api.put(`/market-trips/${id}/start`);
    return unwrap(data);
  },
  deliver: async (id: number) => {
    const data = await api.put(`/market-trips/${id}/deliver`);
    return unwrap(data);
  },
  settle: async (id: number, payload: { settlement_reference: string; settlement_remarks?: string }) => {
    const data = await api.post(`/market-trips/${id}/settle`, payload);
    return unwrap(data);
  },
  cancel: async (id: number) => {
    const data = await api.put(`/market-trips/${id}/cancel`);
    return unwrap(data);
  },
  getPnl: async (id: number) => {
    const data = await api.get(`/market-trips/${id}/pnl`);
    return unwrap(data);
  },
  uploadPod: async (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const data = await api.post(`/market-trips/${id}/pod`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return unwrap(data);
  },
};

// ---- Geofences ----
export const geofenceService = {
  list: async (params?: FilterParams): Promise<PaginatedResponse<Geofence>> => {
    const data = await api.get('/geofences', { params });
    return data;
  },
  get: async (id: number): Promise<Geofence> => {
    const data = await api.get(`/geofences/${id}`);
    return unwrap(data);
  },
  create: async (payload: Partial<Geofence>): Promise<Geofence> => {
    const data = await api.post('/geofences', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Partial<Geofence>): Promise<Geofence> => {
    const data = await api.put(`/geofences/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number): Promise<void> => {
    await api.delete(`/geofences/${id}`);
  },
  getTripGeofences: async (tripId: number): Promise<Geofence[]> => {
    const data = await api.get(`/geofences/trip/${tripId}`);
    return unwrap(data);
  },
  checkPosition: async (payload: { latitude: number; longitude: number; speed_kmph?: number; trip_id?: number }) => {
    const data = await api.post('/geofences/check', payload);
    return unwrap(data);
  },
};

// ---- Compliance ----
export const complianceService = {
  // Alerts
  listAlerts: async (params?: FilterParams): Promise<PaginatedResponse<ComplianceAlertRecord>> => {
    const data = await api.get('/compliance/alerts', { params });
    return data;
  },
  getAlertSummary: async (): Promise<ComplianceAlertSummary> => {
    const data = await api.get('/compliance/alerts/summary');
    return unwrap(data);
  },
  resolveAlert: async (id: number, payload: { notes?: string }): Promise<ComplianceAlertRecord> => {
    const data = await api.put(`/compliance/alerts/${id}/resolve`, payload);
    return unwrap(data);
  },

  // AIS-140
  checkVehicleAIS140: async (vehicleId: number): Promise<AIS140CheckResult> => {
    const data = await api.get(`/compliance/ais140/${vehicleId}`);
    return unwrap(data);
  },
  getFleetComplianceReport: async (): Promise<FleetComplianceReport> => {
    const data = await api.get('/compliance/ais140/report');
    return unwrap(data);
  },

  // Driver Events
  listEvents: async (params?: FilterParams): Promise<PaginatedResponse<DriverEvent>> => {
    const data = await api.get('/compliance/events', { params });
    return data;
  },
  createEvent: async (payload: Partial<DriverEvent>): Promise<DriverEvent> => {
    const data = await api.post('/compliance/events', payload);
    return unwrap(data);
  },
  getDriverEventSummary: async (driverId: number): Promise<DriverEventSummary[]> => {
    const data = await api.get(`/compliance/events/driver/${driverId}/summary`);
    return unwrap(data);
  },

  // Audit Notes
  listAuditNotes: async (params?: FilterParams): Promise<PaginatedResponse<AuditNote>> => {
    const data = await api.get('/compliance/audit-notes', { params });
    return data;
  },
  createAuditNote: async (payload: Partial<AuditNote>): Promise<AuditNote> => {
    const data = await api.post('/compliance/audit-notes', payload);
    return unwrap(data);
  },
  resolveAuditNote: async (id: number): Promise<AuditNote> => {
    const data = await api.put(`/compliance/audit-notes/${id}/resolve`);
    return unwrap(data);
  },
};

// ── Driver Scoring Service (Phase C) ──────────────────────────────
export const driverScoringService = {
  getLeaderboard: async (params?: { month?: number; year?: number; branch_id?: number; skip?: number; limit?: number }) => {
    const data = await api.get('/driver-scoring/leaderboard', { params });
    return unwrap(data);
  },
  getFleetDistribution: async (params?: { month?: number; year?: number }) => {
    const data = await api.get('/driver-scoring/fleet-distribution', { params });
    return unwrap(data);
  },
  getDriverScore: async (driverId: number, params?: { month?: number; year?: number }) => {
    const data = await api.get(`/driver-scoring/${driverId}/score`, { params });
    return unwrap(data);
  },
  getDriverScoreBreakdown: async (driverId: number, params?: { month?: number; year?: number }) => {
    const data = await api.get(`/driver-scoring/${driverId}/score/breakdown`, { params });
    return unwrap(data);
  },
  getDriverScoreTrend: async (driverId: number, months?: number) => {
    const data = await api.get(`/driver-scoring/${driverId}/score/trend`, { params: { months } });
    return unwrap(data);
  },
  getCoachingNotes: async (driverId: number, params?: { skip?: number; limit?: number }) => {
    const data = await api.get(`/driver-scoring/${driverId}/coaching-notes`, { params });
    return unwrap(data);
  },
  addCoachingNote: async (driverId: number, payload: { note_text: string; category?: string }) => {
    const data = await api.post(`/driver-scoring/${driverId}/coaching-notes`, payload);
    return unwrap(data);
  },
};

// ── Customer Portal Service (Phase D) ──────────────────────

export const customerPortalService = {
  login: async (email: string) => {
    const data = await api.post('/portal/customer/login', { email });
    return unwrap(data);
  },
  getBookings: async (params?: { skip?: number; limit?: number }) => {
    const data = await api.get('/portal/customer/bookings', { params });
    return unwrap(data);
  },
  createBooking: async (payload: {
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
  }) => {
    const data = await api.post('/portal/customer/bookings', payload);
    return unwrap(data);
  },
  getTrackingLink: async (jobId: number) => {
    const data = await api.get(`/portal/customer/tracking/${jobId}`);
    return unwrap(data);
  },
  getInvoices: async (params?: { skip?: number; limit?: number }) => {
    const data = await api.get('/portal/customer/invoices', { params });
    return unwrap(data);
  },
  getPayments: async (params?: { skip?: number; limit?: number }) => {
    const data = await api.get('/portal/customer/payments', { params });
    return unwrap(data);
  },
  getPaymentLink: async (invoiceId: number) => {
    const data = await api.get(`/portal/customer/pay/${invoiceId}`);
    return unwrap(data);
  },
};

// ── Supplier Portal Service (Phase D) ──────────────────────

export const supplierPortalService = {
  login: async (email: string) => {
    const data = await api.post('/portal/supplier/login', { email });
    return unwrap(data);
  },
  getTrips: async (params?: { status?: string; skip?: number; limit?: number }) => {
    const data = await api.get('/portal/supplier/trips', { params });
    return unwrap(data);
  },
  getTripDetail: async (tripId: number) => {
    const data = await api.get(`/portal/supplier/trips/${tripId}`);
    return unwrap(data);
  },
  submitInvoice: async (tripId: number, payload: { amount: number; invoice_number?: string; remarks?: string }) => {
    const data = await api.post(`/portal/supplier/trips/${tripId}/invoice`, payload);
    return unwrap(data);
  },
  getPayments: async (params?: { skip?: number; limit?: number }) => {
    const data = await api.get('/portal/supplier/payments', { params });
    return unwrap(data);
  },
  getStatement: async () => {
    const data = await api.get('/portal/supplier/statement');
    return unwrap(data);
  },
};

// ── Public Tracking (no auth) ──────────────────────────────

export const publicTrackingService = {
  getTracking: async (token: string) => {
    const data = await api.get(`/portal/track/${token}`);
    return unwrap(data);
  },
};

// ── Branch Management Service (Phase E) ────────────────────

export const branchService = {
  list: async (params?: { search?: string; is_active?: boolean }) => {
    const data = await api.get('/branches', { params });
    return unwrap(data);
  },
  get: async (id: number) => {
    const data = await api.get(`/branches/${id}`);
    return unwrap(data);
  },
  create: async (payload: {
    name: string; code: string; address?: string; city?: string;
    state?: string; pincode?: string; phone?: string; email?: string;
    is_active?: boolean; tenant_id: number;
  }) => {
    const data = await api.post('/branches', payload);
    return unwrap(data);
  },
  update: async (id: number, payload: Record<string, any>) => {
    const data = await api.put(`/branches/${id}`, payload);
    return unwrap(data);
  },
  delete: async (id: number) => {
    const data = await api.delete(`/branches/${id}`);
    return unwrap(data);
  },
  getResources: async (id: number) => {
    const data = await api.get(`/branches/${id}/resources`);
    return unwrap(data);
  },
  getPnL: async (id: number, params?: { start_date?: string; end_date?: string }) => {
    const data = await api.get(`/branches/${id}/pnl`, { params });
    return unwrap(data);
  },
  getComparison: async (params?: { start_date?: string; end_date?: string }) => {
    const data = await api.get('/branches/comparison', { params });
    return unwrap(data);
  },
};

// ── TPMS + Predictive Maintenance ─────────────────────────

export const tpmsService = {
  ingestReading: async (payload: { sensor_id: string; psi: number; temperature_c?: number; tread_depth_mm?: number }) => {
    const data = await api.post('/tpms/reading', payload);
    return unwrap(data);
  },
  getVehicleDashboard: async (vehicleId: number) => {
    const data = await api.get(`/tpms/vehicle/${vehicleId}`);
    return unwrap(data);
  },
  getFleetHealth: async () => {
    const data = await api.get('/tpms/fleet');
    return unwrap(data);
  },
  getAlerts: async (params?: { hours?: number; limit?: number }) => {
    const data = await api.get('/tpms/alerts', { params });
    return unwrap(data);
  },
  getReadingHistory: async (tyreId: number, params?: { hours?: number }) => {
    const data = await api.get(`/tpms/history/${tyreId}`, { params });
    return unwrap(data);
  },
  predictVehicle: async (vehicleId: number) => {
    const data = await api.get(`/tpms/predict/${vehicleId}`);
    return unwrap(data);
  },
  predictFleet: async () => {
    const data = await api.get('/tpms/predict-fleet');
    return unwrap(data);
  },
};

// ── Tyre Tracker Service ──────────────────────────────────

export const tyreTrackerService = {
  getLifeSummary: async () => {
    const data = await api.get('/tyre/life-summary');
    return unwrap(data);
  },
  getInspectionNeeded: async () => {
    const data = await api.get('/tyre/inspection-needed');
    return unwrap(data);
  },
  getAlerts: async (status: string = 'active') => {
    const data = await api.get('/tyre/alerts', { params: { status } });
    return unwrap(data);
  },
  getCompare: async () => {
    const data = await api.get('/tyre/compare');
    return unwrap(data);
  },
  getStock: async (params?: { type?: string; brand?: string; search?: string }) => {
    const data = await api.get('/tyre/stock', { params });
    return unwrap(data);
  },
  addStock: async (payload: any) => {
    const data = await api.post('/tyre', payload);
    return unwrap(data);
  },
  fitTyre: async (tyreId: number, vehicleId: number, position: string) => {
    const data = await api.patch(`/tyre/${tyreId}/fit`, null, { params: { vehicle_id: vehicleId, position } });
    return unwrap(data);
  },
  moveTyre: async (tyreId: number, newPosition: string) => {
    const data = await api.patch(`/tyre/${tyreId}/move`, null, { params: { new_position: newPosition } });
    return unwrap(data);
  },
  getRetreading: async () => {
    const data = await api.get('/tyre/retreading');
    return unwrap(data);
  },
  submitRetread: async (tyreId: number, payload: any) => {
    const data = await api.post(`/tyre/${tyreId}/retread`, payload);
    return unwrap(data);
  },
  updateRetreadStatus: async (tyreId: number, status: string) => {
    const data = await api.patch(`/tyre/retreading/${tyreId}/status`, null, { params: { status } });
    return unwrap(data);
  },
  getCatalogue: async (brand?: string) => {
    const data = await api.get('/tyre/catalogue', { params: brand ? { brand } : {} });
    return unwrap(data);
  },
  getVehicleTyres: async (vehicleId: number) => {
    const data = await api.get('/tyre', { params: { vehicle_id: vehicleId, limit: 50 } });
    return unwrap(data);
  },
  getAllTyresOverview: async () => {
    const data = await api.get('/tyre', { params: { limit: 500 } });
    return unwrap(data);
  },
  updateTyreDetails: async (tyreId: number, payload: {
    serial_number?: string;
    brand?: string;
    size?: string;
    tread_depth_mm?: number;
    pressure_psi?: number;
  }) => {
    const data = await api.put(`/tyre/${tyreId}`, payload);
    return unwrap(data);
  },
  removeTyre: async (tyreId: number) => {
    const data = await api.patch(`/tyre/${tyreId}/remove`, null);
    return unwrap(data);
  },
  replaceTyre: async (tyreId: number, payload: {
    serial_number: string;
    brand?: string;
    size?: string;
    tread_depth_mm?: number;
    replacement_reason?: string;
    notes?: string;
  }) => {
    const data = await api.post(`/tyre/${tyreId}/replace`, payload);
    return unwrap(data);
  },
  getTyreHistory: async (tyreId: number) => {
    const data = await api.get(`/tyre/${tyreId}/history`);
    return unwrap(data);
  },
  getTyreFullHistory: async (tyreId: number) => {
    const data = await api.get(`/tyre/${tyreId}/full-history`);
    return unwrap(data);
  },
  // ── Field Readings ──
  submitReading: async (payload: any) => {
    const data = await api.post('/tyre/readings', payload);
    return unwrap(data);
  },
  getReadings: async (params?: any) => {
    const data = await api.get('/tyre/readings', { params });
    return unwrap(data);
  },
  getVehicleReadings: async (vehicleId: number) => {
    const data = await api.get(`/tyre/readings/vehicle/${vehicleId}`);
    return unwrap(data);
  },
  getLastTripOdometer: async (vehicleId: number) => {
    const data = await api.get(`/tyre/readings/vehicle/${vehicleId}/last-trip-odometer`);
    return unwrap(data);
  },
  // ── Field Alerts ──
  getFieldAlerts: async (params?: any) => {
    const data = await api.get('/tyre/field-alerts', { params });
    return unwrap(data);
  },
  acknowledgeAlert: async (id: number) => {
    const data = await api.patch(`/tyre/field-alerts/${id}/acknowledge`, {});
    return unwrap(data);
  },
  resolveAlert: async (id: number) => {
    const data = await api.patch(`/tyre/field-alerts/${id}/resolve`, {});
    return unwrap(data);
  },
  // ── Thresholds ──
  getThresholds: async () => {
    const data = await api.get('/tyre/thresholds');
    return unwrap(data);
  },
  createThreshold: async (payload: any) => {
    const data = await api.post('/tyre/thresholds', payload);
    return unwrap(data);
  },
  updateThreshold: async (id: number, payload: any) => {
    const data = await api.put(`/tyre/thresholds/${id}`, payload);
    return unwrap(data);
  },
  // ── Simulation ──
  runSimulation: async (payload: any) => {
    const data = await api.post('/tyre/simulate', payload);
    return unwrap(data);
  },
  getSimulationHistory: async () => {
    const data = await api.get('/tyre/simulate/history');
    return unwrap(data);
  },
  // ── Analytics ──
  getPredictions: async (days = 90) => {
    const data = await api.get('/tyre/analytics/predictions', { params: { days } });
    return unwrap(data);
  },
  getInspectionCoverage: async () => {
    const data = await api.get('/tyre/analytics/inspection-coverage');
    return unwrap(data);
  },
  getDriverCompliance: async () => {
    const data = await api.get('/tyre/analytics/driver-compliance');
    return unwrap(data);
  },
  getInspectionFlags: async () => {
    const data = await api.get('/tyre/inspection-flags');
    return unwrap(data);
  },
  getRetreadFlags: async () => {
    const data = await api.get('/tyre/retread-flags');
    return unwrap(data);
  },
  getLifecycleEvents: async (limit = 100) => {
    const data = await api.get('/tyre/lifecycle-events', { params: { limit } });
    return unwrap(data);
  },
};

// ---- Payment Gateway ----
export const paymentGatewayService = {
  createLink: async (payload: {
    amount: number;
    description: string;
    customer_name: string;
    customer_phone: string;
    customer_email: string;
    reference_id: string;
  }) => {
    const data = await api.post('/finance/payment-gateway/links', payload);
    return unwrap(data);
  },
};

export const auditorService = {
  getDashboard: async (params?: { from_date?: string; to_date?: string }) => {
    const data = await api.get('/auditor/dashboard', { params });
    return unwrap(data);
  },
  getTrips: async (params?: { from_date?: string; to_date?: string; flag?: string; page?: number; per_page?: number }) => {
    const data = await api.get('/auditor/trips', { params });
    return unwrap(data);
  },
  getLRProfitability: async (params?: { from_date?: string; to_date?: string; sort_by?: string; page?: number; per_page?: number }) => {
    const data = await api.get('/auditor/lr-profitability', { params });
    return unwrap(data);
  },
  getFuelEfficiency: async (params?: { from_date?: string; to_date?: string }) => {
    const data = await api.get('/auditor/fuel-efficiency', { params });
    return unwrap(data);
  },
  getExpenses: async (params?: { from_date?: string; to_date?: string; flag?: string; page?: number; per_page?: number }) => {
    const data = await api.get('/auditor/expenses', { params });
    return unwrap(data);
  },
  getClientRisk: async (params?: { from_date?: string; to_date?: string }) => {
    const data = await api.get('/auditor/client-risk', { params });
    return unwrap(data);
  },
  getMaintenance: async () => {
    const data = await api.get('/auditor/maintenance');
    return unwrap(data);
  },
  exportReport: (report_type: string, params?: Record<string, string>) => {
    const query = new URLSearchParams({ report_type, ...params }).toString();
    window.open(`/api/v1/auditor/export/${report_type}?${query}`, '_blank');
  },
};
