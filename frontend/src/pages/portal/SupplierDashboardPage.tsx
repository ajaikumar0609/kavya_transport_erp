import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Truck, CreditCard, LogOut, IndianRupee, MapPin,
  ChevronDown, ChevronUp, Search, Clock, AlertCircle,
  Package, Send, BarChart3,
} from 'lucide-react';
import { supplierPortalService } from '@/services/dataService';
import type { SupplierTrip, SupplierPayment, SupplierStatement } from '@/types';
import { safeArray } from '@/utils/helpers';

type Tab = 'trips' | 'payments' | 'statement';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  delivered: 'bg-green-100 text-green-700',
  settled: 'bg-emerald-100 text-emerald-700',
  pending: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700',
};

function Badge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status?.toLowerCase()] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full capitalize ${cls}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

export default function SupplierDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const portalName = localStorage.getItem('portal_name') || 'Supplier';
  const [activeTab, setActiveTab] = useState<Tab>('trips');

  // ── Data queries ─────────────────────────────────────────
  const { data: tripsRaw, isLoading: tripsLoading } = useQuery({
    queryKey: ['portal-supplier-trips'],
    queryFn: () => supplierPortalService.getTrips({ limit: 50 }),
  });
  const trips = safeArray<SupplierTrip>(tripsRaw);

  const { data: paymentsRaw, isLoading: paymentsLoading } = useQuery({
    queryKey: ['portal-supplier-payments'],
    queryFn: () => supplierPortalService.getPayments({ limit: 50 }),
  });
  const payments = safeArray<SupplierPayment>(paymentsRaw);

  const { data: statement, isLoading: statementLoading } = useQuery<SupplierStatement>({
    queryKey: ['portal-supplier-statement'],
    queryFn: () => supplierPortalService.getStatement(),
  });

  // ── KPIs ─────────────────────────────────────────────────
  const activeTrips = trips.filter(t => ['active', 'in_transit'].includes(t.status)).length;
  const totalEarned = statement?.total_earned ?? 0;
  const pendingAmount = statement?.pending_amount ?? 0;

  const handleLogout = () => {
    sessionStorage.removeItem('portal_token');
    sessionStorage.removeItem('portal_role');
    sessionStorage.removeItem('portal_name');
    sessionStorage.removeItem('access_token');
    navigate('/portal/supplier');
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'trips', label: 'My Trips', icon: <Truck className="w-4 h-4" /> },
    { key: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
    { key: 'statement', label: 'Statement', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Supplier Portal</h1>
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
          <KPI icon={<Truck className="w-5 h-5" />} label="Total Trips" value={trips.length} color="emerald" />
          <KPI icon={<Package className="w-5 h-5" />} label="Active Trips" value={activeTrips} color="yellow" />
          <KPI icon={<IndianRupee className="w-5 h-5" />} label="Total Earned" value={`₹${totalEarned.toLocaleString()}`} color="green" />
          <KPI icon={<Clock className="w-5 h-5" />} label="Pending Amount" value={`₹${pendingAmount.toLocaleString()}`} color="red" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition ${
                activeTab === t.key
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-xl border border-gray-200">
          {activeTab === 'trips' && (
            <TripsTab trips={trips} loading={tripsLoading} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['portal-supplier-trips'] })} />
          )}
          {activeTab === 'payments' && (
            <PaymentsTab payments={payments} loading={paymentsLoading} />
          )}
          {activeTab === 'statement' && (
            <StatementTab statement={statement || null} loading={statementLoading} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ── KPI ───────────────────────────────────────────────────── */

function KPI({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color] || colors.emerald}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

/* ── Trips Tab ─────────────────────────────────────────────── */

function TripsTab({ trips, loading, onRefresh }: { trips: SupplierTrip[]; loading: boolean; onRefresh: () => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [invoiceTripId, setInvoiceTripId] = useState<number | null>(null);

  const filtered = trips.filter(t =>
    !search || t.job_number?.toLowerCase().includes(search.toLowerCase())
      || t.origin?.toLowerCase().includes(search.toLowerCase())
      || t.destination?.toLowerCase().includes(search.toLowerCase())
      || t.vehicle_number?.toLowerCase().includes(search.toLowerCase())
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
            placeholder="Search trips..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <Truck className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="font-medium">No trips found</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map(trip => (
            <div key={trip.id}>
              <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition"
                onClick={() => setExpandedId(expandedId === trip.id ? null : trip.id)}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Truck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{trip.job_number || `Trip #${trip.id}`}</p>
                    <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {trip.origin || '—'} → {trip.destination || '—'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge status={trip.status} />
                  {expandedId === trip.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
              {expandedId === trip.id && (
                <div className="px-4 pb-4 pl-[4.5rem] grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {trip.vehicle_number && (
                    <div>
                      <p className="text-xs text-gray-500">Vehicle</p>
                      <p className="font-medium text-gray-700">{trip.vehicle_number}</p>
                    </div>
                  )}
                  {trip.contractor_rate != null && (
                    <div>
                      <p className="text-xs text-gray-500">Rate</p>
                      <p className="font-medium text-gray-700">₹{trip.contractor_rate.toLocaleString()}</p>
                    </div>
                  )}
                  {trip.net_payable != null && (
                    <div>
                      <p className="text-xs text-gray-500">Net Payable</p>
                      <p className="font-medium text-emerald-700">₹{trip.net_payable.toLocaleString()}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-500">Date</p>
                    <p className="font-medium text-gray-700">{new Date(trip.created_at).toLocaleDateString()}</p>
                  </div>
                  {['completed', 'delivered'].includes(trip.status) && (
                    <div className="col-span-2 sm:col-span-4 mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setInvoiceTripId(trip.id); }}
                        className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-800 font-medium"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit Invoice
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invoice Modal */}
      {invoiceTripId !== null && (
        <InvoiceModal
          tripId={invoiceTripId}
          onClose={() => setInvoiceTripId(null)}
          onSuccess={() => { setInvoiceTripId(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

/* ── Invoice Submit Modal ──────────────────────────────────── */

function InvoiceModal({ tripId, onClose, onSuccess }: { tripId: number; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) { setError('Please enter a valid amount'); return; }
    setError('');
    setSubmitting(true);
    try {
      await supplierPortalService.submitInvoice(tripId, {
        amount: Number(amount),
        invoice_number: invoiceNumber || undefined,
        remarks: remarks || undefined,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to submit invoice');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Submit Invoice — Trip #{tripId}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 25000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2024-001"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
              placeholder="Any notes..."
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Submitting...' : 'Submit Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Payments Tab ──────────────────────────────────────────── */

function PaymentsTab({ payments, loading }: { payments: SupplierPayment[]; loading: boolean }) {
  if (loading) return <LoadingSkeleton />;
  if (payments.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        <CreditCard className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="font-medium">No payment records yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left p-3 font-medium text-gray-600">Job</th>
            <th className="text-right p-3 font-medium text-gray-600">Amount</th>
            <th className="text-left p-3 font-medium text-gray-600">Settlement Ref</th>
            <th className="text-center p-3 font-medium text-gray-600">Status</th>
            <th className="text-left p-3 font-medium text-gray-600">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map(p => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="p-3 font-medium text-gray-900">{p.job_number || `#${p.id}`}</td>
              <td className="p-3 text-right text-emerald-700 font-medium">₹{p.net_payable.toLocaleString()}</td>
              <td className="p-3 text-gray-600">{p.settlement_reference || '—'}</td>
              <td className="p-3 text-center"><Badge status={p.status} /></td>
              <td className="p-3 text-gray-600">{p.settled_at ? new Date(p.settled_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Statement Tab ─────────────────────────────────────────── */

function StatementTab({ statement, loading }: { statement: SupplierStatement | null; loading: boolean }) {
  if (loading) return <LoadingSkeleton />;
  if (!statement) {
    return (
      <div className="p-12 text-center text-gray-500">
        <BarChart3 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
        <p className="font-medium">No statement data available</p>
      </div>
    );
  }

  const items = [
    { label: 'Total Trips', value: statement.total_trips, color: 'text-gray-900' },
    { label: 'Total Earned', value: `₹${statement.total_earned.toLocaleString()}`, color: 'text-gray-900' },
    { label: 'Settled Trips', value: statement.settled_trips, color: 'text-emerald-700' },
    { label: 'Settled Amount', value: `₹${statement.settled_amount.toLocaleString()}`, color: 'text-emerald-700' },
    { label: 'Pending Amount', value: `₹${statement.pending_amount.toLocaleString()}`, color: 'text-red-700' },
  ];

  return (
    <div className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Summary</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(item => (
          <div key={item.label} className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Progress bar: settled vs total */}
      {statement.total_earned > 0 && (
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Payment Progress</span>
            <span>{Math.round((statement.settled_amount / statement.total_earned) * 100)}% settled</span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, (statement.settled_amount / statement.total_earned) * 100)}%` }}
            />
          </div>
        </div>
      )}
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
