/**
 * Auditor Review Page
 *
 * Read-only view of all invoices that have manual payment proof uploaded.
 * Auditors can mark each proof as APPROVED or FLAGGED.
 *
 * Route: /auditor/payment-proofs
 * Access: auditor role only
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '@/services/api';
import { Modal } from '@/components/common/Modal';
import { SubmitButton } from '@/components/common/SubmitButton';
import { handleApiError } from '@/utils/handleApiError';
import { safeArray } from '@/utils/helpers';
import {
  ShieldCheck, Flag, FileImage, Clock, User, BadgeCheck,
  AlertTriangle, Eye, IndianRupee,
} from 'lucide-react';

type ProofInvoice = {
  id: number;
  invoice_number: string;
  client_name?: string;
  total_amount: number;
  payment_method_manual?: string;
  payment_proof_url?: string;
  payment_proof_filename?: string;
  payment_proof_note?: string;
  marked_paid_at?: string;
  marked_paid_by_user_id?: number;
  auditor_review_status?: string; // APPROVED | FLAGGED | null
  auditor_reviewed_at?: string;
};

const STATUS_STYLES: Record<string, string> = {
  APPROVED: 'bg-green-50 text-green-700 border-green-200',
  FLAGGED:  'bg-red-50 text-red-700 border-red-200',
  PENDING:  'bg-amber-50 text-amber-700 border-amber-200',
};

function ReviewStatusBadge({ status }: { status?: string }) {
  const s = status ?? 'PENDING';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[s] ?? STATUS_STYLES.PENDING}`}>
      {s === 'APPROVED' && <BadgeCheck size={11} />}
      {s === 'FLAGGED'  && <AlertTriangle size={11} />}
      {s === 'PENDING'  && <Clock size={11} />}
      {s}
    </span>
  );
}

export default function AuditorReviewPage() {
  const qc = useQueryClient();
  const [reviewTarget, setReviewTarget] = useState<ProofInvoice | null>(null);
  const [reviewStatus, setReviewStatus] = useState<'APPROVED' | 'FLAGGED'>('APPROVED');
  const [reviewNote, setReviewNote] = useState('');
  const [previewInvoice, setPreviewInvoice] = useState<ProofInvoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'FLAGGED'>('ALL');

  // Fetch invoices that have payment proof uploaded
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices-with-proof'],
    queryFn: () =>
      api.get('/finance/invoices', {
        params: { has_payment_proof: true, limit: 200 },
      }),
  });

  const reviewMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('status', reviewStatus);
      fd.append('note', reviewNote);
      return api.post(`/finance/invoices/${reviewTarget!.id}/auditor-review`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices-with-proof'] });
      toast.success(`Invoice marked as ${reviewStatus.toLowerCase()}.`);
      setReviewTarget(null);
      setReviewNote('');
    },
    onError: (e) => handleApiError(e, 'Review submission failed'),
  });

  const allInvoices = safeArray<ProofInvoice>(
    (data as any)?.data?.items ?? (data as any)?.data ?? (data as any)?.items ?? data,
  );

  const invoices = allInvoices.filter((inv) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING') return !inv.auditor_review_status;
    return inv.auditor_review_status === statusFilter;
  });

  const pendingCount  = allInvoices.filter((i) => !i.auditor_review_status).length;
  const approvedCount = allInvoices.filter((i) => i.auditor_review_status === 'APPROVED').length;
  const flaggedCount  = allInvoices.filter((i) => i.auditor_review_status === 'FLAGGED').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <ShieldCheck size={22} className="text-primary-600" /> Auditor Payment Review
          </h1>
          <p className="page-subtitle">Review manual payment proofs submitted by the finance team</p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => refetch()}>Refresh</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Review', count: pendingCount, color: 'text-amber-600 bg-amber-50', filter: 'PENDING' as const },
          { label: 'Approved',       count: approvedCount, color: 'text-green-600 bg-green-50', filter: 'APPROVED' as const },
          { label: 'Flagged',        count: flaggedCount,  color: 'text-red-600 bg-red-50',   filter: 'FLAGGED' as const },
        ].map(({ label, count, color, filter }) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(statusFilter === filter ? 'ALL' : filter)}
            className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${statusFilter === filter ? 'ring-2 ring-primary-400 border-primary-300' : 'border-gray-200 bg-white'}`}
          >
            <p className={`text-2xl font-bold ${color.split(' ')[0]}`}>{count}</p>
            <p className="text-sm text-gray-600 mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* Invoice list */}
      {isLoading ? (
        <div className="text-center py-10 text-gray-400">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShieldCheck size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No invoices to review</p>
          <p className="text-sm mt-1">
            {statusFilter !== 'ALL' ? `No ${statusFilter.toLowerCase()} proofs.` : 'No payment proofs uploaded yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                <IndianRupee size={18} className="text-primary-600" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-sm text-primary-700">{inv.invoice_number}</span>
                  <ReviewStatusBadge status={inv.auditor_review_status} />
                </div>
                <p className="text-sm text-gray-600 mt-0.5">
                  {inv.client_name ?? `Invoice #${inv.id}`}
                  {' · '}
                  <span className="font-semibold text-gray-800">₹{Number(inv.total_amount || 0).toLocaleString('en-IN')}</span>
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  {inv.payment_method_manual && (
                    <span className="flex items-center gap-1">
                      <BadgeCheck size={11} />
                      {inv.payment_method_manual.replace(/_/g, ' ')}
                    </span>
                  )}
                  {inv.payment_proof_note && (
                    <span className="flex items-center gap-1 font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                      {inv.payment_proof_note}
                    </span>
                  )}
                  {inv.marked_paid_at && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(inv.marked_paid_at).toLocaleString('en-IN')}
                    </span>
                  )}
                  {inv.marked_paid_by_user_id && (
                    <span className="flex items-center gap-1">
                      <User size={11} /> User #{inv.marked_paid_by_user_id}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* View proof */}
                {inv.payment_proof_url && (
                  <button
                    title="View proof"
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500"
                    onClick={() => setPreviewInvoice(inv)}
                  >
                    <Eye size={15} />
                  </button>
                )}
                {/* Approve */}
                <button
                  title="Approve"
                  className="p-2 rounded-lg border border-green-200 hover:bg-green-50 text-green-600"
                  onClick={() => { setReviewTarget(inv); setReviewStatus('APPROVED'); }}
                >
                  <ShieldCheck size={15} />
                </button>
                {/* Flag */}
                <button
                  title="Flag"
                  className="p-2 rounded-lg border border-red-200 hover:bg-red-50 text-red-600"
                  onClick={() => { setReviewTarget(inv); setReviewStatus('FLAGGED'); }}
                >
                  <Flag size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proof preview modal */}
      <Modal
        isOpen={!!previewInvoice}
        onClose={() => setPreviewInvoice(null)}
        title={`Payment Proof — ${previewInvoice?.invoice_number}`}
        size="lg"
      >
        {previewInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500">Payment method</p>
                <p className="font-medium capitalize">{previewInvoice.payment_method_manual?.replace(/_/g, ' ') ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Amount</p>
                <p className="font-semibold">₹{Number(previewInvoice.total_amount || 0).toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Reference / Note</p>
                <p className="font-mono text-xs">{previewInvoice.payment_proof_note ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Marked paid at</p>
                <p>{previewInvoice.marked_paid_at ? new Date(previewInvoice.marked_paid_at).toLocaleString('en-IN') : '—'}</p>
              </div>
            </div>

            {previewInvoice.payment_proof_url && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Proof attachment</p>
                {previewInvoice.payment_proof_filename?.toLowerCase().endsWith('.pdf') ? (
                  <a
                    href={previewInvoice.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-2 w-max"
                  >
                    <FileImage size={14} /> Open PDF
                  </a>
                ) : (
                  <img
                    src={previewInvoice.payment_proof_url}
                    alt="Payment proof"
                    className="max-h-96 w-full object-contain rounded-lg border border-gray-200"
                  />
                )}
              </div>
            )}

            {previewInvoice.auditor_review_status && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-200">
                <ReviewStatusBadge status={previewInvoice.auditor_review_status} />
                {previewInvoice.auditor_reviewed_at && (
                  <span className="text-xs text-gray-500">
                    on {new Date(previewInvoice.auditor_reviewed_at).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                className="btn-secondary flex items-center gap-1 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => { setPreviewInvoice(null); setReviewTarget(previewInvoice); setReviewStatus('APPROVED'); }}
              >
                <ShieldCheck size={14} /> Approve
              </button>
              <button
                className="btn-secondary flex items-center gap-1 text-red-700 border-red-200 hover:bg-red-50"
                onClick={() => { setPreviewInvoice(null); setReviewTarget(previewInvoice); setReviewStatus('FLAGGED'); }}
              >
                <Flag size={14} /> Flag Issue
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Submit review modal */}
      <Modal
        isOpen={!!reviewTarget}
        onClose={() => { setReviewTarget(null); setReviewNote(''); }}
        title={reviewStatus === 'APPROVED' ? 'Approve Payment Proof' : 'Flag Payment Issue'}
        size="sm"
      >
        {reviewTarget && (
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); reviewMutation.mutate(); }}
          >
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm font-medium ${STATUS_STYLES[reviewStatus]}`}>
              {reviewStatus === 'APPROVED'
                ? <><BadgeCheck size={15} /> Marking proof as APPROVED for {reviewTarget.invoice_number}</>
                : <><AlertTriangle size={15} /> Flagging proof for {reviewTarget.invoice_number}</>
              }
            </div>

            <div>
              <label className="label">Auditor Note (optional)</label>
              <textarea
                className="input-field min-h-[80px] resize-none"
                placeholder={reviewStatus === 'APPROVED' ? 'Any notes for records...' : 'Describe the issue (e.g. blurry image, amount mismatch, wrong UTR)'}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" className="btn-secondary" onClick={() => { setReviewTarget(null); setReviewNote(''); }}>Cancel</button>
              <SubmitButton
                isLoading={reviewMutation.isPending}
                label={reviewStatus === 'APPROVED' ? 'Confirm Approve' : 'Confirm Flag'}
                loadingLabel="Saving..."
              />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
