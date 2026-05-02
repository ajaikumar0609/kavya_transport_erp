import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Package, FileText, CreditCard, Truck, Plus, ExternalLink, LogOut,
  MapPin, Calendar, Eye, Download, ChevronDown, ChevronUp, Search,
  CheckCircle, AlertCircle, IndianRupee,
} from 'lucide-react';
import { customerPortalService } from '@/services/dataService';
import type {
  CustomerBooking, CustomerInvoice, CustomerPayment, BookingRequest,
} from '@/types';
import { safeArray } from '@/utils/helpers';

type Tab = 'bookings' | 'invoices' | 'payments' | 'new-booking';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-yellow-100 text-yellow-700',
  delivered: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  partial: 'bg-orange-100 text-orange-700',
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

function Badge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full capitalize ${cls}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

export default function CustomerDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const portalName = localStorage.getItem('portal_name') || 'Customer';
  const [activeTab, setActiveTab] = useState<Tab>('bookings');

  // ── Data queries ─────────────────────────────────────────
  const { data: bookingsRaw, isLoading: bookingsLoading } = useQuery({
    queryKey: ['portal-customer-bookings'],
    queryFn: () => customerPortalService.getBookings({ limit: 50 }),
  });
  const bookings = safeArray<CustomerBooking>(bookingsRaw);

  const { data: invoicesRaw, isLoading: invoicesLoading } = useQuery({
    queryKey: ['portal-customer-invoices'],
    queryFn: () => customerPortalService.getInvoices({ limit: 50 }),
  });
  const invoices = safeArray<CustomerInvoice>(invoicesRaw);

  const { data: paymentsRaw, isLoading: paymentsLoading } = useQuery({
    queryKey: ['portal-customer-payments'],
    queryFn: () => customerPortalService.getPayments({ limit: 50 }),
  });
  const payments = safeArray<CustomerPayment>(paymentsRaw);

  // ── KPI computations ────────────────────────────────────
  const activeShipments = bookings.filter(b => ['confirmed', 'in_transit'].includes(b.status)).length;
  const totalDue = invoices.reduce((sum, i) => sum + (i.amount_due || 0), 0);
  const totalPaid = payments.filter(p => p.status === 'success').reduce((s, p) => s + p.amount, 0);

  const handleLogout = () => {
    sessionStorage.removeItem('portal_token');
    sessionStorage.removeItem('portal_role');
    sessionStorage.removeItem('portal_name');
    sessionStorage.removeItem('access_token');
    navigate('/portal/customer');
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'bookings', label: 'Shipments', icon: <Package className="w-4 h-4" /> },
    { key: 'new-booking', label: 'New Booking', icon: <Plus className="w-4 h-4" /> },
    { key: 'invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" /> },
    { key: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Customer Portal</h1>
              <p className="text-xs text-gray-500">Welcome, {portalName}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI icon={<Package className="w-5 h-5" />} label="Total Shipments" value={bookings.length} color="blue" />
          <KPI icon={<Truck className="w-5 h-5" />} label="Active Shipments" value={activeShipments} color="yellow" />
          <KPI icon={<IndianRupee className="w-5 h-5" />} label="Amount Due" value={`₹${totalDue.toLocaleString()}`} color="red" />
          <KPI icon={<CheckCircle className="w-5 h-5" />} label="Total Paid" value={`₹${totalPaid.toLocaleString()}`} color="green" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === t.key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl border border-gray-200">
          {activeTab === 'bookings' && (
            <BookingsTab bookings={bookings} loading={bookingsLoading} />
          )}
          {activeTab === 'new-booking' && (
            <NewBookingTab onSuccess={() => { setActiveTab('bookings'); queryClient.invalidateQueries({ queryKey: ['portal-customer-bookings'] }); }} />
          )}
          {activeTab === 'invoices' && (
            <InvoicesTab invoices={invoices} loading={invoicesLoading} />
          )}
          {activeTab === 'payments' && (
            <PaymentsTab payments={payments} loading={paymentsLoading} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ── KPI Mini Card ─────────────────────────────────────────── */

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color] || colors.blue}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{typeof value === 'number' ? value : value}</p>
      </div>
    </div>
  );
}

/* ── Bookings Tab ──────────────────────────────────────────── */

function BookingsTab({ bookings, loading }: { bookings: CustomerBooking[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const filtered = bookings.filter(b =>
    !search || b.job_number?.toLowerCase().includes(search.toLowerCase())
      || b.origin?.toLowerCase().includes(search.toLowerCase())
      || b.destination?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingSkeleton />;

  return (
    <div>
      <div className="p-4 border-b border-gray-100">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search shipments..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="font-medium">No shipments found</p>
          <p className="text-sm mt-1">Your bookings will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map(b => (
            <div key={b.id}>
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Truck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{b.job_number}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {b.origin} → {b.destination}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge status={b.status} />
                  {expandedId === b.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
              {expandedId === b.id && (
                <div className="px-4 pb-4 pl-[4.5rem] grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {b.pickup_date && (
                    <div>
                      <p className="text-xs text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Pickup</p>
                      <p className="font-medium text-gray-700">{new Date(b.pickup_date).toLocaleDateString()}</p>
                    </div>
                  )}
                  {b.material_type && (
                    <div>
                      <p className="text-xs text-gray-500">Material</p>
                      <p className="font-medium text-gray-700">{b.material_type}</p>
                    </div>
                  )}
                  {b.vehicle_type && (
                    <div>
                      <p className="text-xs text-gray-500">Vehicle</p>
                      <p className="font-medium text-gray-700">{b.vehicle_type}</p>
                    </div>
                  )}
                  {b.total_amount != null && (
                    <div>
                      <p className="text-xs text-gray-500">Amount</p>
                      <p className="font-medium text-gray-700">₹{b.total_amount.toLocaleString()}</p>
                    </div>
                  )}
                  <div className="col-span-2 sm:col-span-4 mt-1">
                    <TrackButton jobId={b.id} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackButton({ jobId }: { jobId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleTrack = async () => {
    setLoading(true);
    try {
      const res = await customerPortalService.getTrackingLink(jobId);
      setUrl(res.tracking_url);
    } catch { /* ignore */ }
    setLoading(false);
  };

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium">
        <ExternalLink className="w-3.5 h-3.5" /> Open Live Tracking
      </a>
    );
  }
  return (
    <button onClick={handleTrack} disabled={loading} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50">
      <Eye className="w-3.5 h-3.5" /> {loading ? 'Loading...' : 'Get Tracking Link'}
    </button>
  );
}

/* ── New Booking Tab ───────────────────────────────────────── */

function NewBookingTab({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState<BookingRequest>({ origin_city: '', destination_city: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const update = (field: keyof BookingRequest, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.origin_city || !form.destination_city) {
      setError('Origin and destination cities are required'); return;
    }
    setError('');
    setSubmitting(true);
    try {
      await customerPortalService.createBooking(form);
      setSuccess(true);
      setTimeout(onSuccess, 1500);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to create booking');
    }
    setSubmitting(false);
  };

  if (success) {
    return (
      <div className="p-12 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Booking Submitted!</h3>
        <p className="text-gray-500 mt-1">Our team will confirm your shipment shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 max-w-2xl space-y-5">
      <h3 className="text-lg font-semibold text-gray-900">Request New Shipment</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Origin City *" value={form.origin_city} onChange={v => update('origin_city', v)} placeholder="e.g. Mumbai" />
        <FormField label="Destination City *" value={form.destination_city} onChange={v => update('destination_city', v)} placeholder="e.g. Delhi" />
        <FormField label="Origin Address" value={form.origin_address || ''} onChange={v => update('origin_address', v)} placeholder="Full pickup address" />
        <FormField label="Destination Address" value={form.destination_address || ''} onChange={v => update('destination_address', v)} placeholder="Full delivery address" />
        <FormField label="Pickup Date" value={form.pickup_date || ''} onChange={v => update('pickup_date', v)} type="date" />
        <FormField label="Material Type" value={form.material_type || ''} onChange={v => update('material_type', v)} placeholder="e.g. Steel coils" />
        <FormField label="Quantity" value={form.quantity?.toString() || ''} onChange={v => update('quantity', v ? Number(v) : undefined)} type="number" placeholder="e.g. 20" />
        <FormField label="Unit" value={form.quantity_unit || ''} onChange={v => update('quantity_unit', v)} placeholder="e.g. MT" />
        <FormField label="Vehicle Type" value={form.vehicle_type_required || ''} onChange={v => update('vehicle_type_required', v)} placeholder="e.g. 32ft Trailer" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Special Requirements</label>
        <textarea
          value={form.special_requirements || ''}
          onChange={e => update('special_requirements', e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          placeholder="Any special instructions..."
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {submitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus className="w-4 h-4" />}
        Submit Booking
      </button>
    </form>
  );
}

function FormField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
      />
    </div>
  );
}

/* ── Invoices Tab ──────────────────────────────────────────── */

function InvoicesTab({ invoices, loading }: { invoices: CustomerInvoice[]; loading: boolean }) {
  if (loading) return <LoadingSkeleton />;
  if (invoices.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="font-medium">No invoices yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left p-3 font-medium text-gray-600">Invoice #</th>
            <th className="text-left p-3 font-medium text-gray-600">Date</th>
            <th className="text-right p-3 font-medium text-gray-600">Total</th>
            <th className="text-right p-3 font-medium text-gray-600">Paid</th>
            <th className="text-right p-3 font-medium text-gray-600">Due</th>
            <th className="text-center p-3 font-medium text-gray-600">Status</th>
            <th className="text-center p-3 font-medium text-gray-600">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {invoices.map(inv => (
            <tr key={inv.id} className="hover:bg-gray-50">
              <td className="p-3 font-medium text-gray-900">{inv.invoice_number}</td>
              <td className="p-3 text-gray-600">{inv.date ? new Date(inv.date).toLocaleDateString() : '—'}</td>
              <td className="p-3 text-right text-gray-900">₹{inv.total_amount.toLocaleString()}</td>
              <td className="p-3 text-right text-green-700">₹{inv.amount_paid.toLocaleString()}</td>
              <td className="p-3 text-right font-medium text-red-700">₹{inv.amount_due.toLocaleString()}</td>
              <td className="p-3 text-center"><Badge status={inv.status} /></td>
              <td className="p-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  {inv.pdf_url && (
                    <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {inv.amount_due > 0 && <PayButton invoiceId={inv.id} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayButton({ invoiceId }: { invoiceId: number }) {
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    setLoading(true);
    try {
      const res = await customerPortalService.getPaymentLink(invoiceId);
      if (res?.short_url) {
        window.open(res.short_url, '_blank');
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <button onClick={handlePay} disabled={loading} className="text-xs bg-green-600 text-white px-3 py-1 rounded-md hover:bg-green-700 disabled:opacity-50 transition">
      {loading ? '...' : 'Pay Now'}
    </button>
  );
}

/* ── Payments Tab ──────────────────────────────────────────── */

function PaymentsTab({ payments, loading }: { payments: CustomerPayment[]; loading: boolean }) {
  if (loading) return <LoadingSkeleton />;
  if (payments.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <CreditCard className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="font-medium">No payments yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left p-3 font-medium text-gray-600">Payment #</th>
            <th className="text-left p-3 font-medium text-gray-600">Date</th>
            <th className="text-right p-3 font-medium text-gray-600">Amount</th>
            <th className="text-left p-3 font-medium text-gray-600">Method</th>
            <th className="text-center p-3 font-medium text-gray-600">Status</th>
            <th className="text-left p-3 font-medium text-gray-600">Reference</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map(p => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="p-3 font-medium text-gray-900">{p.payment_number}</td>
              <td className="p-3 text-gray-600">{new Date(p.date).toLocaleDateString()}</td>
              <td className="p-3 text-right text-gray-900">₹{p.amount.toLocaleString()}</td>
              <td className="p-3 text-gray-600 capitalize">{p.payment_method || '—'}</td>
              <td className="p-3 text-center"><Badge status={p.status} /></td>
              <td className="p-3 text-gray-600">{p.reference_number || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Loading Skeleton ──────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="animate-pulse flex items-center gap-4">
          <div className="w-10 h-10 bg-gray-200 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/3" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
