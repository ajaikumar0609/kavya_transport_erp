/**
 * Payments Page — INCOMING CLIENT PAYMENTS
 *
 * Two parallel flows for collecting client invoice payments:
 *   A) Send Razorpay payment link (existing flow — requires Razorpay plan)
 *   B) Mark as Paid with proof upload (manual — no Razorpay required)
 *
 * Company OUTGOING expenses (salaries, GPay, etc.) are managed in
 * AccountantExpensesPage (/accountant/expenses).
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/services/api';
import DataTable, { Column } from '@/components/common/DataTable';
import { Modal, StatusBadge } from '@/components/common/Modal';
import { SubmitButton } from '@/components/common/SubmitButton';
import type { Payment, FilterParams } from '@/types';
import { safeArray } from '@/utils/helpers';
import { handleApiError } from '@/utils/handleApiError';
import { SendHorizonal, CreditCard, IndianRupee, Info, CheckCircle2, Upload, FileImage } from 'lucide-react';
import { financeService } from '@/services/dataService';

const PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank Transfer (NEFT/IMPS/RTGS)' },
  { value: 'cheque',        label: 'Cheque' },
  { value: 'upi',           label: 'UPI / GPay / PhonePe' },
  { value: 'neft',          label: 'NEFT' },
  { value: 'rtgs',          label: 'RTGS' },
  { value: 'cash',          label: 'Cash' },
  { value: 'other',         label: 'Other' },
];

export default function PaymentsPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<FilterParams>({ page: 1, page_size: 20 });

  // ── Send payment link state ──────────────────────────────────────────────
  const [isSendLinkOpen, setIsSendLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ invoice_id: '', client_phone: '', notes: '' });

  // ── Mark as paid state ───────────────────────────────────────────────────
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [markForm, setMarkForm] = useState({
    invoice_id: '',
    payment_method: 'bank_transfer',
    note: '',
  });
  const [proofFile, setProofFile] = useState<File | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['payments', filters],
    queryFn: () => financeService.listPayments(filters),
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices-unpaid'],
    queryFn: () => api.get('/finance/invoices', { params: { status: 'sent', limit: 100 } }),
    enabled: isSendLinkOpen || isMarkPaidOpen,
  });

  // ── Send Razorpay link mutation ──────────────────────────────────────────
  const sendLinkMutation = useMutation({
    mutationFn: () =>
      api.post('/finance/payment-links', {
        invoice_id: parseInt(linkForm.invoice_id),
        ...(linkForm.client_phone ? { client_phone: linkForm.client_phone } : {}),
        ...(linkForm.notes ? { notes: linkForm.notes } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices-unpaid'] });
      toast.success('Payment link sent to client.');
      setIsSendLinkOpen(false);
      setLinkForm({ invoice_id: '', client_phone: '', notes: '' });
    },
    onError: (e) => handleApiError(e, 'Failed to send payment link'),
  });

  // ── Mark as paid mutation ────────────────────────────────────────────────
  const markPaidMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('proof_file', proofFile!);
      fd.append('note', markForm.note);
      fd.append('payment_method', markForm.payment_method);
      return api.post(`/finance/invoices/${markForm.invoice_id}/mark-paid`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices-unpaid'] });
      toast.success('Invoice marked as paid. Proof saved for auditor review.');
      setIsMarkPaidOpen(false);
      setMarkForm({ invoice_id: '', payment_method: 'bank_transfer', note: '' });
      setProofFile(null);
    },
    onError: (e) => handleApiError(e, 'Failed to mark invoice as paid'),
  });

  const payments = safeArray<Payment>((data as any)?.data ?? (data as any)?.items ?? data);
  const invoices = safeArray<any>((invoicesData as any)?.data?.items ?? (invoicesData as any)?.data ?? invoicesData);

  const columns: Column<Payment>[] = [
    {
      key: 'payment_number',
      header: 'Payment No.',
      sortable: true,
      render: (p) => <span className="font-mono text-sm font-medium text-primary-600">{p.payment_number}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      render: (p) => <span className="font-semibold">₹{Number(p.amount || 0).toLocaleString('en-IN')}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (p) => (
        <span className="inline-flex items-center gap-1 text-sm">
          <CreditCard size={12} className="text-gray-400" />
          {((p as any).payment_method || p.method || 'Razorpay').toString().replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'payment_date',
      header: 'Date',
      sortable: true,
      render: (p) => p.payment_date ? new Date(p.payment_date).toLocaleDateString('en-IN') : '—',
    },
    {
      key: 'reference_number',
      header: 'Ref / UTR',
      render: (p) => {
        const ref = (p as any).transaction_ref || p.reference_number;
        return ref ? <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{ref}</span> : <span className="text-gray-400 text-xs">—</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <IndianRupee size={22} className="text-primary-600" /> Client Payments
          </h1>
          <p className="page-subtitle">Incoming payments from client invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsMarkPaidOpen(true)} className="btn-secondary flex items-center gap-2">
            <CheckCircle2 size={15} /> Mark as Paid
          </button>
          <button onClick={() => setIsSendLinkOpen(true)} className="btn-primary flex items-center gap-2">
            <SendHorizonal size={15} /> Send Payment Link
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          Use <strong>Send Payment Link</strong> to collect via Razorpay, or{' '}
          <strong>Mark as Paid</strong> to record offline payments (bank transfer, cheque, cash) with
          proof upload for auditor review.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={payments}
        total={(data as any)?.pagination?.total || (data as any)?.total || payments.length}
        page={filters.page}
        pageSize={filters.page_size}
        isLoading={isLoading}
        searchPlaceholder="Search by ref or client..."
        onSearch={(q) => setFilters({ ...filters, search: q, page: 1 })}
        onPageChange={(p) => setFilters({ ...filters, page: p })}
        onRefresh={() => refetch()}
      />

      {/* ── Send Payment Link Modal ─────────────────────────────────────────── */}
      <Modal isOpen={isSendLinkOpen} onClose={() => setIsSendLinkOpen(false)} title="Send Payment Link to Client" size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!linkForm.invoice_id) { toast.error('Select an invoice'); return; }
            sendLinkMutation.mutate();
          }}
        >
          <div>
            <label className="label">Invoice *</label>
            <select
              className="input-field"
              value={linkForm.invoice_id}
              onChange={(e) => setLinkForm({ ...linkForm, invoice_id: e.target.value })}
              required
            >
              <option value="">Select unpaid invoice...</option>
              {invoices.map((inv: any) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.client_name || `Client #${inv.client_id}`} — ₹{Number(inv.total_amount || 0).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Client WhatsApp / Phone (optional)</label>
            <input
              type="tel"
              className="input-field"
              placeholder="+91 98765 43210"
              value={linkForm.client_phone}
              onChange={(e) => setLinkForm({ ...linkForm, client_phone: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">If provided, the link will be sent via WhatsApp.</p>
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input
              type="text"
              className="input-field"
              placeholder="Description shown on payment link"
              value={linkForm.notes}
              onChange={(e) => setLinkForm({ ...linkForm, notes: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsSendLinkOpen(false)}>Cancel</button>
            <SubmitButton isLoading={sendLinkMutation.isPending} label="Send Link via Razorpay" loadingLabel="Sending..." />
          </div>
        </form>
      </Modal>

      {/* ── Mark as Paid Modal ──────────────────────────────────────────────── */}
      <Modal isOpen={isMarkPaidOpen} onClose={() => setIsMarkPaidOpen(false)} title="Mark Invoice as Paid" size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!markForm.invoice_id) { toast.error('Select an invoice'); return; }
            if (!proofFile) { toast.error('Upload a payment proof (screenshot or receipt)'); return; }
            markPaidMutation.mutate();
          }}
        >
          <div>
            <label className="label">Invoice *</label>
            <select
              className="input-field"
              value={markForm.invoice_id}
              onChange={(e) => setMarkForm({ ...markForm, invoice_id: e.target.value })}
              required
            >
              <option value="">Select unpaid invoice...</option>
              {invoices.map((inv: any) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} — {inv.client_name || `Client #${inv.client_id}`} — ₹{Number(inv.total_amount || 0).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Payment Method *</label>
            <select
              className="input-field"
              value={markForm.payment_method}
              onChange={(e) => setMarkForm({ ...markForm, payment_method: e.target.value })}
              required
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Payment Reference / Note</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. UTR: 4039201832, Cheque no. 001234"
              value={markForm.note}
              onChange={(e) => setMarkForm({ ...markForm, note: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">UTR number, cheque number, or any reference for the auditor.</p>
          </div>

          <div>
            <label className="label">Payment Proof * <span className="text-xs font-normal text-gray-400">(screenshot, bank statement, cheque copy — JPEG/PNG/PDF, max 10 MB)</span></label>
            <div
              className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {proofFile ? (
                <div className="flex items-center justify-center gap-2 text-sm text-primary-700">
                  <FileImage size={16} />
                  <span className="font-medium">{proofFile.name}</span>
                  <span className="text-gray-400">({(proofFile.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <Upload size={20} />
                  <span className="text-sm">Click to upload proof</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <Info size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800">
              This will mark the invoice as <strong>PAID</strong> and submit the proof for auditor review.
              The action is logged with your name and timestamp.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => { setIsMarkPaidOpen(false); setProofFile(null); }}>Cancel</button>
            <SubmitButton isLoading={markPaidMutation.isPending} label="Mark as Paid" loadingLabel="Saving..." />
          </div>
        </form>
      </Modal>
    </div>
  );
}

