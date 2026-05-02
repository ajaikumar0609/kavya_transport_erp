import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { lrService } from '@/services/dataService';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import DataTable, { Column } from '@/components/common/DataTable';
import { Modal, StatusBadge } from '@/components/common/Modal';
import { SubmitButton } from '@/components/common/SubmitButton';
import { useAuthStore } from '@/store/authStore';
import type { LR, FilterParams } from '@/types';
import { CheckCircle, Pencil, Trash2, XCircle, Truck, ShoppingCart } from 'lucide-react';
import { safeArray } from '@/utils/helpers';
import { exportTableToPdf } from '@/utils/pdfExport';
import { handleApiError } from '../../utils/handleApiError';

export default function LRListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const { hasPermission, hasRole } = useAuthStore();
  const isAdmin = hasRole('admin');
  const isClerk = hasRole('clerk');
  const [filters, setFilters] = useState<FilterParams>({ page: 1, page_size: 20 });
  const [transportTab, setTransportTab] = useState<'' | 'fleet' | 'market'>('');
  const [myLrs, setMyLrs] = useState<boolean>(searchParams.get('my_lrs') === 'true');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<LR | null>(null);
  const [editItem, setEditItem] = useState<LR | null>(null);
  const [createForm, setCreateForm] = useState({
    job_id: '',
    consignor_name: '',
    consignor_gstin: '',
    consignee_name: '',
    consignee_gstin: '',
    goods_description: '',
    packages: '',
    actual_weight: '',
    charged_weight: '',
    freight_amount: '',
    payment_type: 'PAID',
    vehicle_number: '',
    driver_name: '',
    loading_date: new Date().toISOString().slice(0, 10),
  });
  const [editForm, setEditForm] = useState({
    consignor_name: '',
    consignee_name: '',
    origin: '',
    destination: '',
    freight_amount: '',
    payment_mode: 'to_pay',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['lr', filters, transportTab, myLrs],
    queryFn: () => lrService.list({ ...filters, transport_type: transportTab || undefined, my_lrs: myLrs || undefined } as any),
  });

  const { data: jobsData } = useQuery({
    queryKey: ['lr-create-jobs'],
    queryFn: () => lrService.getJobs(),
    enabled: isCreateOpen && hasPermission('lr:create'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => lrService.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lr'] });
      toast.success('LR deleted successfully.');
    },
    onError: (error) => {
      handleApiError(error, 'Operation failed');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => lrService.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lr'] });
      toast.success('LR status updated to cancelled.');
    },
    onError: (error) => {
      handleApiError(error, 'Operation failed');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => lrService.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lr'] });
      toast.success('LR updated successfully.');
      setEditItem(null);
    },
    onError: (error) => {
      handleApiError(error, 'Operation failed');
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => {
      const selectedJob = safeArray<any>((jobsData as any)?.items ?? jobsData).find((job: any) => String(job.id) === String(payload.job_id));
      const paymentModeMap: Record<string, string> = {
        PAID: 'paid',
        TO_PAY: 'to_pay',
        TO_BE_BILLED: 'to_be_billed',
      };
      return lrService.create({
        lr_date: payload.loading_date,
        job_id: Number(payload.job_id),
        consignor_name: payload.consignor_name,
        consignor_gstin: payload.consignor_gstin || null,
        consignee_name: payload.consignee_name,
        consignee_gstin: payload.consignee_gstin || null,
        origin: selectedJob?.origin || selectedJob?.origin_city || createForm.consignor_name,
        destination: selectedJob?.destination || selectedJob?.destination_city || createForm.consignee_name,
        vehicle_id: selectedJob?.vehicle_id ? Number(selectedJob.vehicle_id) : null,
        driver_id: selectedJob?.driver_id ? Number(selectedJob.driver_id) : null,
        payment_mode: paymentModeMap[payload.payment_type] || 'paid',
        freight_amount: Number(payload.freight_amount || 0),
        items: [
          {
            description: payload.goods_description,
            packages: Number(payload.packages || 1),
            actual_weight: Number(payload.actual_weight || 0),
            charged_weight: Number(payload.charged_weight || payload.actual_weight || 0),
            amount: Number(payload.freight_amount || 0),
          },
        ],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lr'] });
      toast.success('LR created successfully.');
      setIsCreateOpen(false);
      setCreateForm({
        job_id: '',
        consignor_name: '',
        consignor_gstin: '',
        consignee_name: '',
        consignee_gstin: '',
        goods_description: '',
        packages: '',
        actual_weight: '',
        charged_weight: '',
        freight_amount: '',
        payment_type: 'PAID',
        vehicle_number: '',
        driver_name: '',
        loading_date: new Date().toISOString().slice(0, 10),
      });
    },
    onError: (error) => {
      handleApiError(error, 'Operation failed');
    },
  });

  const handleDelete = (lr: LR) => setDeleteItem(lr);
  const handleEdit = (lr: LR) => {
    setEditItem(lr);
    setEditForm({
      consignor_name: lr.consignor_name || '',
      consignee_name: lr.consignee_name || '',
      origin: lr.origin || '',
      destination: lr.destination || '',
      freight_amount: String(lr.freight_amount || ''),
      payment_mode: lr.payment_mode || 'to_pay',
    });
  };

  const columns: Column<LR>[] = [
    {
      key: 'lr_number',
      header: 'LR Number',
      sortable: true,
      render: (lr) => <span className="font-mono text-sm font-medium text-primary-600">{lr.lr_number}</span>,
    },
    {
      key: 'consignor_name',
      header: 'Consignor',
      render: (lr) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{lr.consignor_name}</p>
          {lr.consignor_gstin && <p className="text-xs text-gray-400">GST: {lr.consignor_gstin}</p>}
        </div>
      ),
    },
    {
      key: 'consignee_name',
      header: 'Consignee',
      render: (lr) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{lr.consignee_name}</p>
          {lr.consignee_gstin && <p className="text-xs text-gray-400">GST: {lr.consignee_gstin}</p>}
        </div>
      ),
    },
    {
      key: 'route',
      header: 'Route',
      render: (lr) => (
        <div className="flex items-center gap-1 text-sm">
          <span>{lr.origin}</span>
          <span className="text-gray-300">→</span>
          <span>{lr.destination}</span>
        </div>
      ),
    },
    {
      key: 'freight_amount',
      header: 'Freight',
      sortable: true,
      render: (lr) => `₹${Number((lr.freight_amount || 0) ?? 0).toLocaleString('en-IN')}`,
    },
    {
      key: 'payment_mode',
      header: 'Payment Mode',
      render: (lr) => <span className="capitalize text-sm">{lr.payment_mode?.replace('_', ' ')}</span>,
    },
    {
      key: 'pod_uploaded',
      header: 'POD',
      render: (lr) => (
        <div className="flex items-center gap-1">
          {lr.status === 'pod_received' ? (
            <span className="badge-success flex items-center gap-1"><CheckCircle size={12} /> Received</span>
          ) : lr.pod_uploaded ? (
            <span className="badge-warning">Uploaded</span>
          ) : (
            <span className="badge-gray">Pending</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (lr) => <StatusBadge status={lr.status} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (lr) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleEdit(lr)} className="p-1.5 rounded-md hover:bg-gray-100" title="Edit">
            <Pencil size={14} className="text-gray-600" />
          </button>
          {lr.status !== 'cancelled' && lr.status !== 'delivered' && (
            <button onClick={() => cancelMutation.mutate(lr.id)} className="p-1.5 rounded-md hover:bg-amber-50" title="Cancel LR">
              <XCircle size={14} className="text-amber-600" />
            </button>
          )}
          <button onClick={() => handleDelete(lr)} className="p-1.5 rounded-md hover:bg-red-50" title="Delete">
            <Trash2 size={14} className="text-red-600" />
          </button>
        </div>
      ),
    },
  ];

  const rows = safeArray<LR>(data);

  const handleExportPdf = () => {
    exportTableToPdf({
      title: 'Lorry Receipts Report',
      fileName: `lr-${new Date().toISOString().slice(0, 10)}.pdf`,
      rows,
      columns: [
        { header: 'LR Number', accessor: (lr) => lr.lr_number },
        { header: 'Consignor', accessor: (lr) => lr.consignor_name },
        { header: 'Consignee', accessor: (lr) => lr.consignee_name },
        { header: 'Origin', accessor: (lr) => lr.origin },
        { header: 'Destination', accessor: (lr) => lr.destination },
        { header: 'Freight', accessor: (lr) => `INR ${Number((lr.freight_amount || 0) ?? 0).toLocaleString('en-IN')}` },
        { header: 'Payment Mode', accessor: (lr) => lr.payment_mode?.replace('_', ' ') },
        { header: 'Status', accessor: (lr) => lr.status },
      ],
    });
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lorry Receipts</h1>
          <p className="page-subtitle">Manage LR generation, tracking, and POD verification</p>
        </div>
      </div>

      {/* Fleet / Market tabs + My LRs toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-1">
        <div className="flex gap-1">
          {([
            { key: '' as const, label: 'All LRs', icon: null },
            { key: 'fleet' as const, label: 'Fleet Trips', icon: Truck },
            { key: 'market' as const, label: 'Market Trips', icon: ShoppingCart },
          ] as { key: '' | 'fleet' | 'market'; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setTransportTab(key); setFilters({ ...filters, page: 1 }); }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                transportTab === key
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {Icon && <Icon size={14} />}
              {label}
            </button>
          ))}
        </div>
        {/* My LRs toggle — visible to clerk and any user who wants to filter their own */}
        <button
          onClick={() => { setMyLrs((v) => !v); setFilters({ ...filters, page: 1 }); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            myLrs
              ? 'bg-primary-50 border-primary-400 text-primary-700'
              : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
          }`}
          title="Show only LRs created by you"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M3 21v-2a9 9 0 0 1 18 0v2"/></svg>
          My LRs
        </button>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        total={data?.total || 0}
        page={filters.page}
        pageSize={filters.page_size}
        isLoading={isLoading}
        searchPlaceholder="Search LR number, consignor..."
        onSearch={(q) => setFilters({ ...filters, search: q, page: 1 })}
        onPageChange={(p) => setFilters({ ...filters, page: p })}
        onSort={(key, order) => setFilters({ ...filters, sort_by: key, sort_order: order })}
        onRowClick={(lr) => navigate(`/lr/${lr.id}`)}
        onAdd={!isAdmin && hasPermission('lr:create') ? () => setIsCreateOpen(true) : undefined}
        addLabel="Create LR"
        onRefresh={() => refetch()}
        onExport={isAdmin ? undefined : handleExportPdf}
      />

      <ConfirmDialog
        isOpen={!!deleteItem}
        title="Delete LR"
        message={deleteItem ? `Delete LR ${deleteItem.lr_number}? This action cannot be undone.` : ''}
        confirmLabel="Delete"
        isDangerous={true}
        onConfirm={() => {
          if (!deleteItem) return;
          deleteMutation.mutate(deleteItem.id);
          setDeleteItem(null);
        }}
        onCancel={() => setDeleteItem(null)}
      />

      <Modal
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        title="Edit LR"
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!editItem) return;
            updateMutation.mutate({
              id: editItem.id,
              payload: {
                consignor_name: editForm.consignor_name,
                consignee_name: editForm.consignee_name,
                origin: editForm.origin,
                destination: editForm.destination,
                freight_amount: Number(editForm.freight_amount || 0),
                payment_mode: editForm.payment_mode,
              },
            });
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Consignor Name</label>
              <input className="input-field" value={editForm.consignor_name} onChange={(e) => setEditForm((p) => ({ ...p, consignor_name: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Consignee Name</label>
              <input className="input-field" value={editForm.consignee_name} onChange={(e) => setEditForm((p) => ({ ...p, consignee_name: e.target.value }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Origin</label>
              <input className="input-field" value={editForm.origin} onChange={(e) => setEditForm((p) => ({ ...p, origin: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Destination</label>
              <input className="input-field" value={editForm.destination} onChange={(e) => setEditForm((p) => ({ ...p, destination: e.target.value }))} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Freight Amount</label>
              <input type="number" className="input-field" value={editForm.freight_amount} onChange={(e) => setEditForm((p) => ({ ...p, freight_amount: e.target.value }))} required />
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <select className="input-field" value={editForm.payment_mode} onChange={(e) => setEditForm((p) => ({ ...p, payment_mode: e.target.value }))}>
                <option value="to_pay">To Pay</option>
                <option value="paid">Paid</option>
                <option value="to_be_billed">To Be Billed</option>
                <option value="fod">FOD</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setEditItem(null)}>Cancel</button>
            <SubmitButton isLoading={updateMutation.isPending} label="Save Changes" />
          </div>
        </form>
      </Modal>

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create LR" size="lg">
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
          if (createForm.consignor_gstin && !gstPattern.test(createForm.consignor_gstin.toUpperCase())) {
            toast.error('Consignor GSTIN format is invalid.');
            return;
          }
          if (createForm.consignee_gstin && !gstPattern.test(createForm.consignee_gstin.toUpperCase())) {
            toast.error('Consignee GSTIN format is invalid.');
            return;
          }
          const payload = {
            job_id: Number(createForm.job_id),
            consignor_name: createForm.consignor_name,
            consignor_gstin: createForm.consignor_gstin || '',
            consignee_name: createForm.consignee_name,
            consignee_gstin: createForm.consignee_gstin || '',
            goods_description: createForm.goods_description,
            packages: Number(createForm.packages) || 1,
            actual_weight: Number(createForm.actual_weight) || 0,
            charged_weight: Number(createForm.charged_weight) || Number(createForm.actual_weight) || 0,
            freight_amount: Number(createForm.freight_amount) || 0,
            payment_type: createForm.payment_type || 'PAID',
            vehicle_number: createForm.vehicle_number || '',
            driver_name: createForm.driver_name || '',
            loading_date: createForm.loading_date || new Date().toISOString().split('T')[0],
          };

          createMutation.mutate(payload);
        }}>
          <div>
            <label className="label">Job</label>
            <select
              className="input-field"
              value={createForm.job_id}
              onChange={(e) => {
                const selectedFromData = safeArray<any>((jobsData as any)?.items ?? jobsData).find((job: any) => String(job.id) === e.target.value);
                setCreateForm((p) => ({
                  ...p,
                  job_id: e.target.value,
                  vehicle_number: selectedFromData?.vehicle?.registration_number || selectedFromData?.vehicle_registration || '',
                  driver_name: selectedFromData?.driver?.full_name || selectedFromData?.driver_name || '',
                }));
              }}
              required
            >
              <option value="">Select job</option>
              {safeArray<any>((jobsData as any)?.items ?? jobsData).map((job: any) => (
                <option key={job.id} value={job.id}>{job.job_number || `Job #${job.id}`}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Consignor Name</label><input className="input-field" value={createForm.consignor_name} onChange={(e) => setCreateForm((p) => ({ ...p, consignor_name: e.target.value }))} required /></div>
            <div><label className="label">Consignee Name</label><input className="input-field" value={createForm.consignee_name} onChange={(e) => setCreateForm((p) => ({ ...p, consignee_name: e.target.value }))} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Consignor GSTIN</label><input className="input-field" value={createForm.consignor_gstin} onChange={(e) => setCreateForm((p) => ({ ...p, consignor_gstin: e.target.value.toUpperCase() }))} /></div>
            <div><label className="label">Consignee GSTIN</label><input className="input-field" value={createForm.consignee_gstin} onChange={(e) => setCreateForm((p) => ({ ...p, consignee_gstin: e.target.value.toUpperCase() }))} /></div>
          </div>
          <div>
            <label className="label">Goods Description</label>
            <input className="input-field" value={createForm.goods_description} onChange={(e) => setCreateForm((p) => ({ ...p, goods_description: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Packages</label><input type="number" min="1" className="input-field" value={createForm.packages} onChange={(e) => setCreateForm((p) => ({ ...p, packages: e.target.value }))} required /></div>
            <div><label className="label">Actual Weight</label><input type="number" min="0" step="0.01" className="input-field" value={createForm.actual_weight} onChange={(e) => setCreateForm((p) => ({ ...p, actual_weight: e.target.value, charged_weight: p.charged_weight || e.target.value }))} required /></div>
            <div><label className="label">Charged Weight</label><input type="number" min="0" step="0.01" className="input-field" value={createForm.charged_weight} onChange={(e) => setCreateForm((p) => ({ ...p, charged_weight: e.target.value }))} required /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Freight Amount</label><input type="number" min="0" step="0.01" className="input-field" value={createForm.freight_amount} onChange={(e) => setCreateForm((p) => ({ ...p, freight_amount: e.target.value }))} required /></div>
            <div>
              <label className="label">Payment Type</label>
              <select className="input-field" value={createForm.payment_type} onChange={(e) => setCreateForm((p) => ({ ...p, payment_type: e.target.value }))}>
                <option value="PAID">PAID</option>
                <option value="TO_PAY">TO_PAY</option>
                <option value="TO_BE_BILLED">TO_BE_BILLED</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="label">Vehicle Number</label><input className="input-field" value={createForm.vehicle_number} onChange={(e) => setCreateForm((p) => ({ ...p, vehicle_number: e.target.value }))} /></div>
            <div><label className="label">Driver Name</label><input className="input-field" value={createForm.driver_name} onChange={(e) => setCreateForm((p) => ({ ...p, driver_name: e.target.value }))} /></div>
            <div><label className="label">Loading Date</label><input type="date" className="input-field" value={createForm.loading_date} onChange={(e) => setCreateForm((p) => ({ ...p, loading_date: e.target.value }))} required /></div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
            <SubmitButton isLoading={createMutation.isPending} label="Create LR" loadingLabel="Creating..." disabled={!createForm.job_id || !createForm.consignor_name || !createForm.consignee_name || !createForm.goods_description} />
          </div>
        </form>
      </Modal>
    </div>
  );
}

