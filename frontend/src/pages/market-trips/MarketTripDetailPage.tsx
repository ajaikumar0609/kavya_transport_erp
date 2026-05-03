import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { marketTripService, lrService } from '@/services/dataService';
import { Modal } from '@/components/common/Modal';
import { SubmitButton } from '@/components/common/SubmitButton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { handleApiError } from '../../utils/handleApiError';
import { openDocumentUrl } from '@/utils/helpers';
import {
  ArrowLeft, Truck, User, IndianRupee,
  CheckCircle, XCircle, Play, PackageCheck, CreditCard,
  FileText, X, ExternalLink, Building2, Upload, Printer
} from 'lucide-react';

export default function MarketTripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [assignOpen, setAssignOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [viewDoc, setViewDoc] = useState<{ url: string; title: string } | null>(null);
  const podFileRef = useRef<HTMLInputElement>(null);

  const [assignPayload, setAssignPayload] = useState({
    vehicle_registration: '',
    driver_name: '',
    driver_phone: '',
    driver_license: '',
  });
  const [settlePayload, setSettlePayload] = useState({
    settlement_reference: '',
    settlement_remarks: '',
  });

  const { data: trip, isLoading } = useQuery({
    queryKey: ['market-trip', id],
    queryFn: () => marketTripService.get(Number(id)),
    enabled: !!id,
  });

  const { data: pnl } = useQuery({
    queryKey: ['market-trip-pnl', id],
    queryFn: () => marketTripService.getPnl(Number(id)),
    enabled: !!id,
  });

  const { data: jobLRs } = useQuery({
    queryKey: ['market-trip-lrs', trip?.job_id],
    queryFn: async () => {
      const data = await lrService.list({ job_id: (trip as any)?.job_id, limit: 10 });
      // Backend returns { success, data: [...], pagination }
      return Array.isArray((data as any)?.data) ? (data as any).data
        : (data as any)?.data?.items ?? (data as any)?.items ?? (Array.isArray(data) ? data : []);
    },
    enabled: !!(trip as any)?.job_id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['market-trip', id] });
    qc.invalidateQueries({ queryKey: ['market-trip-pnl', id] });
    qc.invalidateQueries({ queryKey: ['market-trips'] });
  };

  const assignMutation = useMutation({
    mutationFn: () => marketTripService.assign(Number(id), assignPayload),
    onSuccess: () => { invalidate(); toast.success('Vehicle & driver assigned'); setAssignOpen(false); },
    onError: (error) => handleApiError(error, 'Failed to assign'),
  });

  const startMutation = useMutation({
    mutationFn: () => marketTripService.startTransit(Number(id)),
    onSuccess: () => { invalidate(); toast.success('Trip started — In Transit'); },
    onError: (error) => handleApiError(error, 'Failed to start transit'),
  });

  const deliverMutation = useMutation({
    mutationFn: () => marketTripService.deliver(Number(id)),
    onSuccess: () => { invalidate(); toast.success('Delivery completed'); },
    onError: (error) => handleApiError(error, 'Failed to mark delivered'),
  });

  const settleMutation = useMutation({
    mutationFn: () => marketTripService.settle(Number(id), settlePayload),
    onSuccess: () => { invalidate(); toast.success('Trip settled'); setSettleOpen(false); },
    onError: (error) => handleApiError(error, 'Failed to settle'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => marketTripService.cancel(Number(id)),
    onSuccess: () => { invalidate(); toast.success('Trip cancelled'); setCancelConfirm(false); },
    onError: (error) => handleApiError(error, 'Failed to cancel'),
  });

  const uploadPodMutation = useMutation({
    mutationFn: (file: File) => marketTripService.uploadPod(Number(id), file),
    onSuccess: () => { invalidate(); toast.success('POD uploaded successfully'); },
    onError: (error) => handleApiError(error, 'Failed to upload POD'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  }

  if (!trip) {
    return <div className="text-center py-12 text-gray-500">Market trip not found</div>;
  }

  const t: any = trip;
  const p: any = pnl;
  const lrs: any[] = Array.isArray(jobLRs) ? jobLRs : [];
  const firstLR: any = lrs[0] ?? null;
  const margin = Number(t.client_rate || 0) - Number(t.contractor_rate || 0);

  const handlePrint = async () => {
    if (!firstLR?.id) { toast.error('No LR linked to this market trip'); return; }
    try {
      const printData = await lrService.print(firstLR.id);
      const printWindow = window.open('', '_blank', 'width=800,height=1100');
      if (!printWindow) { toast.error('Pop-up blocked — allow pop-ups and try again'); return; }
      printWindow.document.write(generateLRPrintHTML(printData));
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch {
      toast.error('Failed to load print data');
    }
  };

  // Document chip — image thumbnail or PDF icon, opens lightbox
  const DocChip = ({ url, label }: { url: string; label: string }) => {
    const isImg = /\.(jpe?g|png|gif|webp|heic)$/i.test(url);
    return (
      <button
        onClick={() => setViewDoc({ url, title: label })}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium shadow-sm"
      >
        {isImg
          ? <img src={url} alt={label} className="w-5 h-5 object-cover rounded" />
          : <FileText size={13} className="text-red-500 flex-shrink-0" />
        }
        <span className="max-w-[120px] truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Document Lightbox */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75" onClick={() => setViewDoc(null)}>
          <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <p className="font-semibold text-sm text-gray-900">{viewDoc.title}</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => openDocumentUrl(viewDoc.url)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <ExternalLink size={12} /> Open in new tab
                </button>
                <button onClick={() => setViewDoc(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 flex items-center justify-center bg-gray-50">
              {/\.(jpe?g|png|gif|webp|heic)$/i.test(viewDoc.url) ? (
                <img src={viewDoc.url} alt={viewDoc.title} className="max-w-full max-h-[80vh] object-contain p-2" />
              ) : (
                <iframe src={viewDoc.url} className="w-full h-[80vh] border-0" title={viewDoc.title} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/market-trips')} className="p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Market Trip #{t.id}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span className="font-mono">Job #{t.job_id}</span>
              <span>•</span>
              <span>{t.supplier?.name || `Supplier #${t.supplier_id}`}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {t.status === 'pending' && (
            <button onClick={() => setAssignOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium">
              <User size={16} /> Assign Vehicle
            </button>
          )}
          {t.status === 'assigned' && (
            <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium disabled:opacity-50">
              <Play size={16} /> Start Transit
            </button>
          )}
          {t.status === 'in_transit' && (
            <button onClick={() => deliverMutation.mutate()} disabled={deliverMutation.isPending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 text-sm font-medium disabled:opacity-50">
              <PackageCheck size={16} /> Mark Delivered
            </button>
          )}
          {t.status === 'delivered' && (
            <button onClick={() => setSettleOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 text-white hover:bg-orange-700 text-sm font-medium">
              <CreditCard size={16} /> Settle
            </button>
          )}
          {['pending', 'assigned'].includes(t.status) && (
            <button onClick={() => setCancelConfirm(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium">
              <XCircle size={16} /> Cancel
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            <Printer size={16} /> Print LR
          </button>
        </div>
      </div>

      {t.status === 'cancelled' && (
        <div className="p-3 bg-red-50 rounded-lg text-sm text-red-600 font-medium border border-red-200">
          This trip has been cancelled.
        </div>
      )}

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vehicle & Driver Info */}
        <div className="space-y-4">
          {/* Vehicle Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><Truck size={15} /> Vehicle Details</h3>
            <div className="space-y-2.5 text-sm">
              {t.vehicle_registration && <div className="flex justify-between"><span className="text-gray-500">Reg. Number</span><span className="font-mono font-semibold">{t.vehicle_registration}</span></div>}
              {(t as any).vehicle_make && <div className="flex justify-between"><span className="text-gray-500">Make / Model</span><span className="font-medium">{(t as any).vehicle_make} {(t as any).vehicle_model || ''}</span></div>}
              {(t as any).vehicle_type && <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{(t as any).vehicle_type}</span></div>}
              {(t as any).fuel_type && <div className="flex justify-between"><span className="text-gray-500">Fuel</span><span>{(t as any).fuel_type}</span></div>}
              {(t as any).year_of_manufacture && <div className="flex justify-between"><span className="text-gray-500">Year</span><span>{(t as any).year_of_manufacture}</span></div>}
              {(t as any).chassis_number && <div className="flex justify-between"><span className="text-gray-500">Chassis</span><span className="font-mono text-xs">{(t as any).chassis_number}</span></div>}
              {(t as any).engine_number && <div className="flex justify-between"><span className="text-gray-500">Engine</span><span className="font-mono text-xs">{(t as any).engine_number}</span></div>}
              {(t as any).rc_file_url && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500">RC Document</span>
                  <DocChip url={(t as any).rc_file_url} label="RC" />
                </div>
              )}
              {!(t.vehicle_registration || (t as any).vehicle_make) && <p className="text-gray-400 text-xs italic">No vehicle details yet</p>}
            </div>
          </div>
          {/* Driver Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              Driver Details
            </h3>
            <div className="space-y-2.5 text-sm">
              {t.driver_name && <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium">{t.driver_name}</span></div>}
              {t.driver_phone && <div className="flex justify-between"><span className="text-gray-500">Phone</span><span>{t.driver_phone}</span></div>}
              {(t as any).driver_alt_phone && <div className="flex justify-between"><span className="text-gray-500">Alt Phone</span><span>{(t as any).driver_alt_phone}</span></div>}
              {t.driver_license && <div className="flex justify-between"><span className="text-gray-500">DL Number</span><span className="font-mono text-xs">{t.driver_license}</span></div>}
              {(t as any).driver_license_issue && <div className="flex justify-between"><span className="text-gray-500">DL Issued</span><span>{(t as any).driver_license_issue}</span></div>}
              {(t as any).driver_license_valid && <div className="flex justify-between"><span className="text-gray-500">DL Valid Until</span><span>{(t as any).driver_license_valid}</span></div>}
              {(t as any).driver_address && <div className="flex flex-col gap-0.5"><span className="text-gray-500">Address</span><span className="text-xs text-gray-700">{(t as any).driver_address}</span></div>}
              {(t as any).dl_file_url && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-gray-500">DL Document</span>
                  <DocChip url={(t as any).dl_file_url} label="Driving License" />
                </div>
              )}
              {!(t.driver_name || t.driver_phone) && <p className="text-gray-400 text-xs italic">No driver details yet</p>}
            </div>
          </div>
          {/* POD Section */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2"><FileText size={15} /> POD Status</h3>
            <div className="flex flex-col items-center py-2">
              {t.pod_uploaded && t.pod_file_url ? (
                <div className="w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={15} className="text-green-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-700 text-sm leading-tight">POD Uploaded</p>
                      {t.pod_uploaded_at && <p className="text-xs text-gray-400">{new Date(t.pod_uploaded_at).toLocaleDateString('en-IN')}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => void openDocumentUrl(t.pod_file_url)}
                    className="w-full mt-1 rounded-lg overflow-hidden border border-green-200 hover:border-green-400 transition-colors group relative"
                  >
                    <div className="w-full h-20 flex flex-col items-center justify-center bg-green-50 gap-1">
                      <FileText size={28} className="text-green-400" />
                      <span className="text-xs text-green-600">View POD Document</span>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity rounded-lg">
                      <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">Click to view</span>
                    </div>
                  </button>
                  <button
                    onClick={() => podFileRef.current?.click()}
                    disabled={uploadPodMutation.isPending}
                    className="mt-2 w-full text-xs text-gray-500 hover:text-gray-700 underline text-center disabled:opacity-50"
                  >
                    Replace POD
                  </button>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                    <Upload size={22} className="text-gray-400" />
                  </div>
                  <p className="font-semibold text-gray-500 text-sm">No POD yet</p>
                  <p className="text-xs text-gray-400 mt-0.5 mb-3">Upload proof of delivery</p>
                  <button
                    onClick={() => podFileRef.current?.click()}
                    disabled={uploadPodMutation.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 disabled:opacity-50"
                  >
                    <Upload size={14} />
                    {uploadPodMutation.isPending ? 'Uploading…' : 'Upload POD'}
                  </button>
                </>
              )}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                ref={podFileRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPodMutation.mutate(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          {/* Timestamps */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Timeline</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Created</span><span>{t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : '—'}</span></div>
              {t.assigned_at && <div className="flex justify-between"><span className="text-gray-500">Assigned</span><span>{new Date(t.assigned_at).toLocaleDateString('en-IN')}</span></div>}
              {t.delivered_at && <div className="flex justify-between"><span className="text-gray-500">Delivered</span><span>{new Date(t.delivered_at).toLocaleDateString('en-IN')}</span></div>}
              {t.settled_at && <div className="flex justify-between"><span className="text-gray-500">Settled</span><span>{new Date(t.settled_at).toLocaleDateString('en-IN')}</span></div>}
              {t.settlement_reference && <div className="flex justify-between"><span className="text-gray-500">Settlement Ref</span><span className="font-mono">{t.settlement_reference}</span></div>}
            </div>
          </div>
        </div>

        {/* Right column: P&L + Consignor/Consignee */}
        <div className="space-y-6">
          {/* P&L Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><IndianRupee size={16} /> Profit & Loss</h3>
          {p ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Client Rate</span><span className="font-medium text-green-600">+ ₹{Number(p.client_rate || 0).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Contractor Rate</span><span className="font-medium text-red-600">- ₹{Number(p.contractor_rate || 0).toLocaleString('en-IN')}</span></div>
              {Number(p.advance_amount) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Advance</span><span className="font-medium text-red-500">- ₹{Number(p.advance_amount).toLocaleString('en-IN')}</span></div>
              )}
              {Number(p.loading_charges) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Loading Charges</span><span className="font-medium text-red-500">- ₹{Number(p.loading_charges).toLocaleString('en-IN')}</span></div>
              )}
              {Number(p.unloading_charges) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Unloading Charges</span><span className="font-medium text-red-500">- ₹{Number(p.unloading_charges).toLocaleString('en-IN')}</span></div>
              )}
              {Number(p.other_charges) > 0 && (
                <div className="flex justify-between"><span className="text-gray-500">Other Charges</span><span className="font-medium text-red-500">- ₹{Number(p.other_charges).toLocaleString('en-IN')}</span></div>
              )}
              <div className="border-t pt-3 flex justify-between">
                <span className="text-gray-500">TDS ({p.tds_rate || 0}%)</span>
                <span className="font-medium text-blue-600">₹{Number(p.tds_amount || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Net Payable</span>
                <span className="font-medium">₹{Number(p.net_payable || 0).toLocaleString('en-IN')}</span>
              </div>
              <div className="border-t pt-3 flex justify-between text-base">
                <span className="font-semibold text-gray-900">Margin</span>
                <span className={`font-bold ${Number(p.margin || margin) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ₹{Number(p.margin || margin).toLocaleString('en-IN')}
                  {p.margin_pct != null && <span className="text-sm ml-1">({Number(p.margin_pct).toFixed(1)}%)</span>}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Client Rate</span><span className="font-medium text-green-600">+ ₹{Number(t.client_rate || 0).toLocaleString('en-IN')}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Contractor Rate</span><span className="font-medium text-red-600">- ₹{Number(t.contractor_rate || 0).toLocaleString('en-IN')}</span></div>
              <div className="border-t pt-3 flex justify-between text-base">
                <span className="font-semibold text-gray-900">Margin</span>
                <span className={`font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{margin.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}
          </div>

          {/* Consignor / Consignee from linked LR */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 size={15} /> Consignor
            </h3>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{firstLR?.consignor_name || '—'}</p>
              {firstLR?.consignor_address && <p className="text-gray-500 text-xs">{firstLR.consignor_address}</p>}
              {firstLR?.consignor_gstin && <p className="text-gray-400 text-xs">GST: {firstLR.consignor_gstin}</p>}
              {firstLR?.consignor_phone && <p className="text-gray-400 text-xs">Ph: {firstLR.consignor_phone}</p>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Building2 size={15} /> Consignee
            </h3>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-gray-900">{firstLR?.consignee_name || '—'}</p>
              {firstLR?.consignee_address && <p className="text-gray-500 text-xs">{firstLR.consignee_address}</p>}
              {firstLR?.consignee_gstin && <p className="text-gray-400 text-xs">GST: {firstLR.consignee_gstin}</p>}
              {firstLR?.consignee_phone && <p className="text-gray-400 text-xs">Ph: {firstLR.consignee_phone}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      <Modal isOpen={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Vehicle & Driver">
        <form onSubmit={(e) => { e.preventDefault(); assignMutation.mutate(); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Registration *</label>
            <input type="text" required value={assignPayload.vehicle_registration} onChange={(e) => setAssignPayload({ ...assignPayload, vehicle_registration: e.target.value.toUpperCase() })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" placeholder="e.g. TN01AB1234" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name *</label>
              <input type="text" required value={assignPayload.driver_name} onChange={(e) => setAssignPayload({ ...assignPayload, driver_name: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Phone *</label>
              <input type="text" required value={assignPayload.driver_phone} onChange={(e) => setAssignPayload({ ...assignPayload, driver_phone: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Driver License</label>
            <input type="text" value={assignPayload.driver_license} onChange={(e) => setAssignPayload({ ...assignPayload, driver_license: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setAssignOpen(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <SubmitButton isLoading={assignMutation.isPending} label="Assign" />
          </div>
        </form>
      </Modal>

      {/* Settle Modal */}
      <Modal isOpen={settleOpen} onClose={() => setSettleOpen(false)} title="Settle Market Trip">
        <form onSubmit={(e) => { e.preventDefault(); settleMutation.mutate(); }} className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between"><span className="text-gray-500">Contractor Rate</span><span className="font-medium">₹{Number(t.contractor_rate || 0).toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">TDS ({t.tds_rate || 0}%)</span><span className="font-medium text-red-500">-₹{Number(t.tds_amount || 0).toLocaleString('en-IN')}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="text-gray-900 font-semibold">Net Payable</span><span className="font-bold text-green-600">₹{Number(t.net_payable || 0).toLocaleString('en-IN')}</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Reference *</label>
            <input type="text" required value={settlePayload.settlement_reference} onChange={(e) => setSettlePayload({ ...settlePayload, settlement_reference: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" placeholder="e.g. UTR/NEFT/Cheque No." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
            <textarea value={settlePayload.settlement_remarks} onChange={(e) => setSettlePayload({ ...settlePayload, settlement_remarks: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" rows={2} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={() => setSettleOpen(false)} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
            <SubmitButton isLoading={settleMutation.isPending} label="Confirm Settlement" />
          </div>
        </form>
      </Modal>

      {/* Cancel Confirm */}
      <ConfirmDialog
        isOpen={cancelConfirm}
        onCancel={() => setCancelConfirm(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel Market Trip"
        message={`Are you sure you want to cancel this market trip (Job #${t.job_id})?`}
        confirmLabel="Cancel Trip"
        isDangerous
      />
    </div>
  );
}

function generateLRPrintHTML(data: any): string {
  const items = data.items || [];
  const itemRows = items.map((item: any, idx: number) => `
    <tr>
      <td style="border:1px solid #ccc;padding:6px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid #ccc;padding:6px">${item.description || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:center">${item.packages || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:center">${item.package_type || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.actual_weight || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.charged_weight || ''}</td>
      <td style="border:1px solid #ccc;padding:6px">${item.invoice_number || ''}</td>
      <td style="border:1px solid #ccc;padding:6px;text-align:right">${item.invoice_value ? '₹' + Number(item.invoice_value ?? 0).toLocaleString('en-IN') : ''}</td>
    </tr>
  `).join('');
  const terms = (data.terms || []).map((t: string) => `<li style="margin-bottom:4px">${t}</li>`).join('');
  return `<!DOCTYPE html><html><head><title>Lorry Receipt - ${data.lr_number || ''}</title>
  <style>
    body{font-family:'Segoe UI',Arial,sans-serif;margin:0;padding:20px;font-size:13px;color:#333}
    .header{text-align:center;border-bottom:3px double #333;padding-bottom:15px;margin-bottom:15px}
    .header h1{margin:0;font-size:22px;letter-spacing:2px}
    .header p{margin:3px 0;font-size:12px;color:#666}
    .lr-number{font-size:16px;font-weight:bold;color:#1a56db}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px}
    .box{border:1px solid #ccc;border-radius:4px;padding:12px}
    .box h3{margin:0 0 8px 0;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:5px}
    .box p{margin:3px 0}.box .label{color:#888;font-size:11px}.box .value{font-weight:600}
    table{width:100%;border-collapse:collapse;margin:15px 0}
    th{background:#f5f5f5;border:1px solid #ccc;padding:8px;font-size:11px;text-transform:uppercase}
    .summary{text-align:right;margin-top:10px}.summary td{padding:4px 10px}
    .total-row{font-size:16px;font-weight:bold;border-top:2px solid #333}
    .terms{font-size:11px;color:#666;margin-top:20px}
    .signatures{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:50px;text-align:center}
    .signatures div{border-top:1px solid #999;padding-top:8px;font-size:12px}
    @media print{body{margin:0;padding:10px}}
  </style></head><body>
  <div class="header">
    <h1>${data.company_name || 'TRANSPORT ERP'}</h1>
    <p>${data.company_address || ''}</p>
    <p>GSTIN: ${data.company_gstin || ''} | Phone: ${data.company_phone || ''}</p>
    <div style="margin-top:10px"><span style="font-size:18px;font-weight:bold;letter-spacing:3px">LORRY RECEIPT / CONSIGNMENT NOTE</span></div>
  </div>
  <div class="grid-2">
    <div>
      <span class="lr-number">${data.lr_number || ''}</span>
      <p><span class="label">Date:</span> <span class="value">${data.lr_date || ''}</span></p>
      <p><span class="label">Job Ref:</span> <span class="value">${data.job_number || ''}</span></p>
    </div>
    <div style="text-align:right">
      <p><span class="label">Vehicle No:</span> <span class="value">${data.vehicle_number || 'N/A'}</span></p>
      <p><span class="label">Driver:</span> <span class="value">${data.driver_name || 'N/A'}</span></p>
      <p><span class="label">E-way Bill:</span> <span class="value">${data.eway_bill_number || 'N/A'}</span></p>
    </div>
  </div>
  <div class="grid-2">
    <div class="box">
      <h3>Consignor (From)</h3>
      <p class="value">${data.consignor_name || ''}</p>
      <p>${data.consignor_address || ''}</p>
      <p><span class="label">GSTIN:</span> ${data.consignor_gstin || 'N/A'}</p>
      <p><span class="label">Phone:</span> ${data.consignor_phone || 'N/A'}</p>
      <p><span class="label">Origin:</span> ${data.origin || ''}, ${data.origin_state || ''}</p>
    </div>
    <div class="box">
      <h3>Consignee (To)</h3>
      <p class="value">${data.consignee_name || ''}</p>
      <p>${data.consignee_address || ''}</p>
      <p><span class="label">GSTIN:</span> ${data.consignee_gstin || 'N/A'}</p>
      <p><span class="label">Phone:</span> ${data.consignee_phone || 'N/A'}</p>
      <p><span class="label">Destination:</span> ${data.destination || ''}, ${data.destination_state || ''}</p>
    </div>
  </div>
  <table><thead><tr>
    <th style="width:40px">S.No</th><th>Description</th><th style="width:60px">Pkgs</th>
    <th style="width:80px">Type</th><th style="width:90px">Act. Wt (Kg)</th>
    <th style="width:90px">Chg. Wt (Kg)</th><th style="width:100px">Invoice No.</th><th style="width:100px">Invoice Value</th>
  </tr></thead><tbody>
    ${itemRows || '<tr><td colspan="8" style="text-align:center;padding:20px;color:#999">No items</td></tr>'}
  </tbody></table>
  <div style="display:grid;grid-template-columns:1fr 300px;gap:20px">
    <div>
      <p><span class="label">Payment Mode:</span> <span class="value" style="text-transform:uppercase">${(data.payment_mode || '').replace(/_/g,' ')}</span></p>
      ${data.remarks ? `<p><span class="label">Remarks:</span> ${data.remarks}</p>` : ''}
      ${data.insurance_company ? `<p><span class="label">Insurance:</span> ${data.insurance_company} (₹${Number(data.insurance_amount ?? 0).toLocaleString('en-IN')})</p>` : ''}
      ${data.declared_value ? `<p><span class="label">Declared Value:</span> ₹${Number(data.declared_value ?? 0).toLocaleString('en-IN')}</p>` : ''}
    </div>
    <table class="summary">
      <tr><td class="label">Freight:</td><td>₹${Number(data.freight_amount ?? 0).toLocaleString('en-IN')}</td></tr>
      ${data.loading_charges ? `<tr><td class="label">Loading:</td><td>₹${Number(data.loading_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.unloading_charges ? `<tr><td class="label">Unloading:</td><td>₹${Number(data.unloading_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.detention_charges ? `<tr><td class="label">Detention:</td><td>₹${Number(data.detention_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      ${data.other_charges ? `<tr><td class="label">Other:</td><td>₹${Number(data.other_charges ?? 0).toLocaleString('en-IN')}</td></tr>` : ''}
      <tr><td class="label" style="border-top:1px solid #ccc;padding-top:6px"><strong>Subtotal:</strong></td><td style="border-top:1px solid #ccc;padding-top:6px"><strong>₹${Number(data.subtotal ?? 0).toLocaleString('en-IN')}</strong></td></tr>
      <tr><td class="label">GST (${data.gst_percentage || 5}%):</td><td>₹${Number(data.gst_amount ?? 0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>
      <tr class="total-row"><td style="padding-top:8px"><strong>TOTAL:</strong></td><td style="padding-top:8px"><strong>₹${Number(data.total_amount ?? 0).toLocaleString('en-IN',{minimumFractionDigits:2})}</strong></td></tr>
    </table>
  </div>
  <div class="terms"><strong>Terms &amp; Conditions:</strong><ol style="padding-left:18px;margin-top:5px">${terms}</ol></div>
  <div class="signatures"><div>Consignor's Signature</div><div>Transport Company</div><div>Consignee's Signature</div></div>
  <p style="text-align:center;font-size:10px;color:#999;margin-top:30px">Computer-generated document. Printed on ${new Date().toLocaleString('en-IN')}</p>
</body></html>`;
}
