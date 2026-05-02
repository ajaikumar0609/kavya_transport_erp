/**
 * Trip Expenses Page
 * Shows all driver-submitted expenses from completed trips.
 * Finance manager can pay or reject them.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Truck, IndianRupee, XCircle, ThumbsDown, CheckCircle2,
  RefreshCw, Search, Eye, ChevronRight, Calendar, MapPin,
  User, Hash, FileText, BadgeCheck, Clock, CreditCard, Tag,
} from 'lucide-react';
import { financeManagerService, type TripExpenseItem } from '@/services/financeManagerService';

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const CATEGORY_LABELS: Record<string, string> = {
  FUEL: 'Fuel', TOLL: 'Toll', FOOD: 'Food', PARKING: 'Parking',
  LOADING: 'Loading', UNLOADING: 'Unloading', POLICE: 'Police',
  RTO: 'RTO Fine', REPAIR: 'Repair', TYRE: 'Tyre', MISC: 'Misc',
  ADVANCE: 'Advance',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  PAID: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const STATUS_TABS = ['PENDING', 'PAID', 'REJECTED', 'ALL'] as const;
type StatusTab = typeof STATUS_TABS[number];

export default function TripExpensesPage() {
  const qc = useQueryClient();
  const [statusTab, setStatusTab] = useState<StatusTab>('PENDING');
  const [search, setSearch] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [payConfirmId, setPayConfirmId] = useState<number | null>(null);
  const [payNotes, setPayNotes] = useState('');
  const [payProofUrl, setPayProofUrl] = useState<string | null>(null);
  const [payProofS3Key, setPayProofS3Key] = useState<string | null>(null);
  const [payProofUploading, setPayProofUploading] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<TripExpenseItem | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trip-expense-queue', statusTab],
    queryFn: () =>
      financeManagerService.getTripExpenseQueue(statusTab === 'ALL' ? undefined : statusTab),
    refetchInterval: 30_000,
  });

  const allItems: TripExpenseItem[] = data ?? [];

  const items = allItems.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.trip_number?.toLowerCase().includes(q) ||
      e.driver_name?.toLowerCase().includes(q) ||
      e.origin?.toLowerCase().includes(q) ||
      e.destination?.toLowerCase().includes(q) ||
      (CATEGORY_LABELS[e.category] || e.category).toLowerCase().includes(q)
    );
  });

  const totalPending = allItems.reduce((s, e) => s + (e.expense_status === 'PENDING' ? e.amount : 0), 0);

  const payMutation = useMutation({
    mutationFn: (id: number) => financeManagerService.payTripExpense(id, payNotes || undefined, payProofUrl ?? undefined, payProofS3Key ?? undefined),
    onSuccess: () => {
      toast.success('Expense marked as paid');
      qc.invalidateQueries({ queryKey: ['trip-expense-queue'] });
      setPayConfirmId(null);
      setPayNotes('');
      setPayProofUrl(null);
      setPayProofS3Key(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Payment failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => financeManagerService.rejectTripExpense(id, rejectReason || 'Rejected by finance'),
    onSuccess: () => {
      toast.success('Expense rejected');
      qc.invalidateQueries({ queryKey: ['trip-expense-queue'] });
      setRejectId(null);
      setRejectReason('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Rejection failed'),
  });

  const pendingItem = payConfirmId ? allItems.find((e) => e.id === payConfirmId) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={22} className="text-blue-600" />
            Trip Expenses
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Driver-submitted expenses from completed trips — review and pay
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Summary strip */}
      {statusTab === 'PENDING' && allItems.length > 0 && (
        <div className="flex items-center gap-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <IndianRupee size={16} className="text-amber-600" />
          <span className="text-sm font-semibold text-amber-800">
            {allItems.length} pending expense{allItems.length > 1 ? 's' : ''} totalling{' '}
            <span className="text-amber-900">{fmt(totalPending)}</span> awaiting payment
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Status tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors capitalize ${
                statusTab === s ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trip, driver, route…"
            className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No {statusTab !== 'ALL' ? statusTab.toLowerCase() : ''} trip expenses</p>
            {statusTab === 'PENDING' && (
              <p className="text-xs mt-1 text-gray-300">Expenses appear here once drivers complete trips</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="px-4 py-3 text-left font-medium">Trip</th>
                  <th className="px-4 py-3 text-left font-medium">Driver</th>
                  <th className="px-4 py-3 text-left font-medium">Route</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Mode</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Receipt</th>
                  {statusTab === 'PENDING' && (
                    <th className="px-4 py-3 text-center font-medium">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((exp) => (
                  <tr
                    key={exp.id}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => setSelectedExpense(exp)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                        {exp.trip_number}
                      </span>
                      {exp.vehicle_registration && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{exp.vehicle_registration}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{exp.driver_name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      <p className="truncate max-w-[140px]">{exp.origin} → {exp.destination}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {CATEGORY_LABELS[exp.category] || exp.category}
                      </span>
                      {exp.sub_category && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{exp.sub_category}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {exp.expense_date
                        ? new Date(exp.expense_date).toLocaleDateString('en-IN')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmt(exp.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 capitalize">{exp.payment_mode || 'cash'}</span>
                      {exp.reference_number && (
                        <p className="text-[10px] text-gray-400">{exp.reference_number}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[exp.expense_status] || 'bg-gray-100 text-gray-600'}`}>
                        {exp.expense_status}
                      </span>
                      {exp.paid_at && (
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {exp.paid_by_name
                            ? `${exp.paid_by_name} · ${new Date(exp.paid_at).toLocaleDateString('en-IN')}`
                            : new Date(exp.paid_at).toLocaleDateString('en-IN')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {exp.receipt_url ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewingReceipt(exp.receipt_url!); }}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Eye size={11} /> View
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    {statusTab === 'PENDING' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setPayConfirmId(exp.id); }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 transition-colors"
                          >
                            <IndianRupee size={11} /> Mark as Paid
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setRejectId(exp.id); }}
                            className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-lg hover:bg-red-100 transition-colors"
                            title="Reject"
                          >
                            <ThumbsDown size={11} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay Confirmation Modal */}
      {payConfirmId !== null && pendingItem && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => { setPayConfirmId(null); setPayNotes(''); setPayProofUrl(null); setPayProofS3Key(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-green-500" />
              <h3 className="text-base font-semibold">Confirm Payment</h3>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Trip</span>
                <span className="font-mono font-semibold text-blue-700">{pendingItem.trip_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Driver</span>
                <span className="font-medium">{pendingItem.driver_name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Category</span>
                <span>{CATEGORY_LABELS[pendingItem.category] || pendingItem.category}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5">
                <span className="text-gray-500 font-medium">Amount</span>
                <span className="font-bold text-green-700 text-base">{fmt(pendingItem.amount)}</span>
              </div>
            </div>

            {/* Payment proof upload */}
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-600 mb-1.5">Payment Proof (optional)</p>
              {payProofUrl ? (
                <div className="relative w-full h-28 rounded-lg overflow-hidden border border-green-200">
                  <img src={payProofUrl} alt="Payment proof" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setPayProofUrl(null); setPayProofS3Key(null); }}
                    className="absolute top-1.5 right-1.5 bg-black/50 text-white rounded-full p-0.5 hover:bg-black/70"
                  >
                    <XCircle size={14} />
                  </button>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${payProofUploading ? 'border-gray-200 bg-gray-50' : 'border-gray-300 hover:border-green-400 hover:bg-green-50'}`}>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={payProofUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file || !payConfirmId) return;
                      setPayProofUploading(true);
                      try {
                        const res = await financeManagerService.uploadPaymentProof(payConfirmId, file);
                        const d = (res as any)?.data;
                        setPayProofUrl(d?.proof_url ?? null);
                        setPayProofS3Key(d?.proof_s3_key ?? null);
                      } catch {
                        toast.error('Photo upload failed');
                      } finally {
                        setPayProofUploading(false);
                      }
                    }}
                  />
                  {payProofUploading ? (
                    <span className="text-xs text-gray-500">Uploading…</span>
                  ) : (
                    <>
                      <span className="text-lg">📸</span>
                      <span className="text-xs text-gray-500 mt-0.5">Tap to add photo or receipt</span>
                    </>
                  )}
                </label>
              )}
            </div>

            <textarea
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Payment notes (optional)…"
              className="w-full border border-gray-200 rounded-lg p-2.5 text-sm h-16 resize-none focus:outline-none focus:ring-2 focus:ring-green-300 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setPayConfirmId(null); setPayNotes(''); setPayProofUrl(null); setPayProofS3Key(null); }}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => payMutation.mutate(payConfirmId!)}
                disabled={payMutation.isPending || payProofUploading}
                className="flex-1 bg-green-500 text-white rounded-lg py-2 text-sm font-semibold hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <IndianRupee size={14} />
                {payMutation.isPending ? 'Processing…' : `Mark as Paid ${fmt(pendingItem.amount)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId !== null && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={() => { setRejectId(null); setRejectReason(''); }}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              <XCircle size={20} className="text-red-500" />
              <h3 className="text-base font-semibold">Reject Expense</h3>
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              className="w-full border border-gray-200 rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setRejectId(null); setRejectReason(''); }}
                className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => rejectMutation.mutate(rejectId!)}
                disabled={rejectMutation.isPending}
                className="flex-1 bg-red-500 text-white rounded-lg py-2 text-sm font-semibold hover:bg-red-600 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Viewer Modal */}
      {viewingReceipt && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setViewingReceipt(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="font-semibold text-sm">Receipt</span>
              <button onClick={() => setViewingReceipt(null)}>
                <XCircle size={18} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="p-4">
              <img src={viewingReceipt} alt="Expense receipt" className="w-full rounded-lg border" />
            </div>
          </div>
        </div>
      )}

      {/* Expense Detail Drawer */}
      {selectedExpense && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex justify-end"
          onClick={() => setSelectedExpense(null)}
        >
          <div
            className="bg-white w-full max-w-md shadow-2xl flex flex-col h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 shrink-0">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-blue-600" />
                <h2 className="font-semibold text-gray-900">Expense Detail</h2>
              </div>
              <button onClick={() => setSelectedExpense(null)} className="p-1.5 hover:bg-gray-200 rounded-lg transition">
                <XCircle size={18} className="text-gray-400" />
              </button>
            </div>

            {/* Trip badge + amount hero */}
            <div className="px-5 pt-5 pb-4 border-b">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                    {selectedExpense.trip_number}
                  </span>
                  {selectedExpense.vehicle_registration && (
                    <p className="text-xs text-gray-400 mt-1">{selectedExpense.vehicle_registration}</p>
                  )}
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[selectedExpense.expense_status] || 'bg-gray-100 text-gray-600'}`}>
                  {selectedExpense.expense_status}
                </span>
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-3">{fmt(selectedExpense.amount)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {CATEGORY_LABELS[selectedExpense.category] || selectedExpense.category}
                {selectedExpense.sub_category && ` · ${selectedExpense.sub_category}`}
              </p>
            </div>

            {/* Detail fields */}
            <div className="px-5 py-4 space-y-3 flex-1">

              {/* Driver */}
              <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Driver</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{selectedExpense.driver_name || '—'}</p>
                </div>
              </div>

              {/* Route */}
              <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Route</p>
                  <p className="text-sm text-gray-900 mt-0.5 flex items-center gap-1.5">
                    {selectedExpense.origin}
                    <ChevronRight size={12} className="text-gray-400 shrink-0" />
                    {selectedExpense.destination}
                  </p>
                </div>
              </div>

              {/* Category */}
              <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                <Tag size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Category</p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    {CATEGORY_LABELS[selectedExpense.category] || selectedExpense.category}
                    {selectedExpense.sub_category && (
                      <span className="text-gray-400"> · {selectedExpense.sub_category}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Description */}
              {selectedExpense.description && (
                <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                  <FileText size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Description</p>
                    <p className="text-sm text-gray-700 mt-0.5">{selectedExpense.description}</p>
                  </div>
                </div>
              )}

              {/* Payment Mode */}
              <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                <CreditCard size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Payment Mode</p>
                  <p className="text-sm text-gray-900 mt-0.5 capitalize">{selectedExpense.payment_mode || 'Cash'}</p>
                </div>
              </div>

              {/* Reference Number */}
              {selectedExpense.reference_number && (
                <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                  <Hash size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Reference No.</p>
                    <p className="text-sm font-mono text-gray-900 mt-0.5">{selectedExpense.reference_number}</p>
                  </div>
                </div>
              )}

              {/* Date */}
              <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                <Calendar size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Expense Date</p>
                  <p className="text-sm text-gray-900 mt-0.5">
                    {selectedExpense.expense_date
                      ? new Date(selectedExpense.expense_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Submitted at */}
              {selectedExpense.created_at && (
                <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                  <Clock size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Submitted At</p>
                    <p className="text-sm text-gray-900 mt-0.5">
                      {new Date(selectedExpense.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              )}

              {/* Paid at + paid by */}
              {selectedExpense.paid_at && (
                <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                  <BadgeCheck size={15} className="text-green-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Payment Settlement</p>
                    <p className="text-sm text-green-700 font-medium mt-0.5">
                      {selectedExpense.paid_by_name
                        ? `Paid by ${selectedExpense.paid_by_name} (Finance Manager)`
                        : 'Paid by Finance Manager'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(selectedExpense.paid_at).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              )}

              {/* Verified badge */}
              <div className="flex items-start gap-3 py-2.5 border-b border-gray-100">
                <BadgeCheck size={15} className={`mt-0.5 shrink-0 ${selectedExpense.is_verified ? 'text-green-500' : 'text-gray-300'}`} />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Verified</p>
                  <p className={`text-sm mt-0.5 font-medium ${selectedExpense.is_verified ? 'text-green-700' : 'text-gray-400'}`}>
                    {selectedExpense.is_verified ? 'Yes — verified' : 'Not yet verified'}
                  </p>
                </div>
              </div>

              {/* Entry Source */}
              <div className="flex items-start gap-3 py-2.5">
                <FileText size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Entry Source</p>
                  <p className="text-sm text-gray-600 mt-0.5 capitalize">{selectedExpense.entry_source || '—'}</p>
                </div>
              </div>

              {/* Receipt */}
              {selectedExpense.receipt_url && (
                <div className="mt-2 rounded-xl overflow-hidden border border-gray-200">
                  <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Receipt</span>
                    <button
                      onClick={() => setViewingReceipt(selectedExpense.receipt_url!)}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Eye size={11} /> Full view
                    </button>
                  </div>
                  <img
                    src={selectedExpense.receipt_url}
                    alt="Receipt"
                    className="w-full max-h-52 object-contain bg-white cursor-pointer"
                    onClick={() => setViewingReceipt(selectedExpense.receipt_url!)}
                  />
                </div>
              )}
            </div>

            {/* Drawer actions (only for PENDING) */}
            {selectedExpense.expense_status === 'PENDING' && (
              <div className="px-5 py-4 border-t bg-gray-50 flex gap-2 shrink-0">
                <button
                  onClick={() => { setSelectedExpense(null); setPayConfirmId(selectedExpense.id); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-600 transition-colors"
                >
                  <IndianRupee size={14} /> Pay {fmt(selectedExpense.amount)}
                </button>
                <button
                  onClick={() => { setSelectedExpense(null); setRejectId(selectedExpense.id); }}
                  className="flex items-center justify-center gap-1.5 px-4 bg-red-50 text-red-600 border border-red-200 rounded-lg py-2.5 text-sm font-semibold hover:bg-red-100 transition-colors"
                >
                  <ThumbsDown size={14} /> Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
