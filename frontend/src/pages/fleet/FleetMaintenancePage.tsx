import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar, ClipboardList, Package, CircleDot, Battery, AlertTriangle, TrendingUp,
  CheckCircle2, Play, X, Loader2, Plus, Pencil
} from 'lucide-react';
import DataTable, { Column } from '@/components/common/DataTable';
import { KPICard, StatusBadge } from '@/components/common/Modal';
import { fleetService, tpmsService } from '@/services/dataService';
import api from '@/services/api';
import type { MaintenanceScheduleItem, WorkOrder, PartInventory, TyreRecord, BatteryRecord, MaintenancePrediction } from '@/types';
import { safeArray } from '@/utils/helpers';

type TabKey = 'schedule' | 'work-orders' | 'parts' | 'tyres' | 'battery' | 'predictive';

const tabs = [
  { key: 'schedule' as TabKey, label: 'Service Schedule', icon: Calendar },
  { key: 'work-orders' as TabKey, label: 'Work Orders', icon: ClipboardList },
  { key: 'parts' as TabKey, label: 'Parts Inventory', icon: Package },
  { key: 'tyres' as TabKey, label: 'Tyre Management', icon: CircleDot },
  { key: 'battery' as TabKey, label: 'Battery Health', icon: Battery },
  { key: 'predictive' as TabKey, label: 'Predictive', icon: TrendingUp },
];

export default function FleetMaintenancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('schedule');
  const [completingWO, setCompletingWO] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState({ odometer: '', actual_cost: '', notes: '' });
  const [woModal, setWoModal] = useState<{ mode: 'create' | 'edit'; wo?: WorkOrder } | null>(null);
  const [woForm, setWoForm] = useState({ vehicle_id: '', service_type: 'oil_change', maintenance_type: 'scheduled', description: '', vendor_name: '', service_date: '', total_cost: '', notes: '' });
  const queryClient = useQueryClient();

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
  };

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<any>({
    queryKey: ['fleet-maintenance-schedule'],
    queryFn: () => fleetService.getMaintenanceSchedule({}),
    enabled: activeTab === 'schedule',
  });

  const { data: workOrderData, isLoading: woLoading } = useQuery<any>({
    queryKey: ['fleet-work-orders'],
    queryFn: () => fleetService.getWorkOrders({}),
    enabled: activeTab === 'work-orders',
  });

  const { data: partsData, isLoading: partsLoading } = useQuery<any>({
    queryKey: ['fleet-parts-inventory'],
    queryFn: fleetService.getPartsInventory,
    enabled: activeTab === 'parts',
  });

  const { data: tyreData, isLoading: tyreLoading } = useQuery<any>({
    queryKey: ['fleet-tyre-management'],
    queryFn: fleetService.getTyreManagement,
    enabled: activeTab === 'tyres',
  });

  const { data: batteryData, isLoading: batteryLoading } = useQuery<any>({
    queryKey: ['fleet-battery-monitoring'],
    queryFn: fleetService.getBatteryMonitoring,
    enabled: activeTab === 'battery',
  });

  const { data: predictData, isLoading: predictLoading } = useQuery<MaintenancePrediction[]>({
    queryKey: ['fleet-predictive-maintenance'],
    queryFn: tpmsService.predictFleet,
    enabled: activeTab === 'predictive',
  });

  const { data: vehiclesList } = useQuery<any[]>({
    queryKey: ['vehicles-lookup-simple'],
    queryFn: async () => {
      const res = await api.get('/trips/lookup/vehicles', { params: { search: '' } });
      const d = (res.data as any)?.data ?? res.data;
      return Array.isArray(d) ? d : d?.items ?? [];
    },
    enabled: !!woModal,
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['fleet-maintenance-schedule'] });
    queryClient.invalidateQueries({ queryKey: ['fleet-work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['fleet-predictive-maintenance'] });
  };

  const completeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await api.patch(`/fleet/maintenance/work-orders/${id}/complete`, data);
      return (res.data as any)?.data ?? res.data;
    },
    onSuccess: () => { setCompletingWO(null); setForm({ odometer: '', actual_cost: '', notes: '' }); refetchAll(); },
  });

  const startMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/fleet/maintenance/work-orders/${id}/start`, {});
      return (res.data as any)?.data ?? res.data;
    },
    onSuccess: refetchAll,
  });

  const openCreate = () => {
    setWoForm({ vehicle_id: '', service_type: 'oil_change', maintenance_type: 'scheduled', description: '', vendor_name: '', service_date: '', total_cost: '', notes: '' });
    setWoModal({ mode: 'create' });
  };

  const openEdit = (r: WorkOrder) => {
    setWoForm({
      vehicle_id: '',
      service_type: (r as any).service_type || 'oil_change',
      maintenance_type: (r as any).maintenance_type || 'scheduled',
      description: r.description || '',
      vendor_name: r.workshop || '',
      service_date: (r as any).service_date || '',
      total_cost: String(r.cost || ''),
      notes: '',
    });
    setWoModal({ mode: 'edit', wo: r });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/fleet/maintenance/work-orders', data);
      return (res.data as any)?.data ?? res.data;
    },
    onSuccess: () => { setWoModal(null); refetchAll(); },
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await api.patch(`/fleet/maintenance/work-orders/${id}/edit`, data);
      return (res.data as any)?.data ?? res.data;
    },
    onSuccess: () => { setWoModal(null); refetchAll(); },
  });

  const submitWoForm = () => {
    if (woModal?.mode === 'create') {
      if (!woForm.vehicle_id) return;
      createMutation.mutate({
        vehicle_id: parseInt(woForm.vehicle_id),
        service_type: woForm.service_type,
        maintenance_type: woForm.maintenance_type,
        description: woForm.description || undefined,
        vendor_name: woForm.vendor_name || undefined,
        service_date: woForm.service_date || undefined,
        total_cost: woForm.total_cost ? parseFloat(woForm.total_cost) : undefined,
        notes: woForm.notes || undefined,
      });
    } else if (woModal?.mode === 'edit' && woModal.wo) {
      editMutation.mutate({
        id: (woModal.wo as any).id,
        data: {
          service_type: woForm.service_type || undefined,
          maintenance_type: woForm.maintenance_type || undefined,
          description: woForm.description || undefined,
          vendor_name: woForm.vendor_name || undefined,
          service_date: woForm.service_date || undefined,
          total_cost: woForm.total_cost ? parseFloat(woForm.total_cost) : undefined,
          notes: woForm.notes || undefined,
        },
      });
    }
  };

  // Schedule columns
  const scheduleColumns: Column<MaintenanceScheduleItem>[] = [
    { key: 'vehicle', header: 'Vehicle', render: (r) => <span className="font-medium">{r.vehicle}</span> },
    { key: 'service_type', header: 'Type', render: (r) => <StatusBadge status={r.service_type} /> },
    { key: 'description', header: 'Description', render: (r) => <span className="text-sm">{r.description}</span> },
    { key: 'due_date', header: 'Due Date', render: (r) => <span className="text-sm">{formatDate(r.due_date)}</span> },
    { key: 'due_km', header: 'Due KM', render: (r) => <span className="text-sm">{(r.due_km ?? 0) > 0 ? Number(r.due_km).toLocaleString('en-IN') : '—'}</span> },
    { key: 'current_km', header: 'Current KM', render: (r) => <span className="text-sm">{(r.current_km ?? 0) > 0 ? Number(r.current_km).toLocaleString('en-IN') : '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'priority', header: 'Priority', render: (r) => <StatusBadge status={r.priority || 'medium'} /> },
    { key: 'estimated_cost', header: 'Est. Cost', render: (r) => <span className="text-sm">₹{(r.estimated_cost ?? 0).toLocaleString('en-IN')}</span> },
    {
      key: 'actions' as any,
      header: '',
      render: (r: any) => (
        <button
          onClick={() => {
            setWoForm({ vehicle_id: '', service_type: r.service_type?.replace('_renewal','') || 'general_service', maintenance_type: 'scheduled', description: r.description || '', vendor_name: '', service_date: r.due_date || '', total_cost: String(r.estimated_cost || ''), notes: '' });
            setWoModal({ mode: 'create' });
            setActiveTab('work-orders');
          }}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-md hover:bg-blue-100 whitespace-nowrap"
        >
          <Plus className="w-3 h-3" /> Create WO
        </button>
      ),
    },
  ];

  // Work Order columns — with Start + Mark Done actions
  const woColumns: Column<WorkOrder>[] = [
    { key: 'work_order_number', header: 'WO #', render: (r) => <span className="font-medium text-blue-600">{r.work_order_number}</span> },
    { key: 'vehicle', header: 'Vehicle', render: (r) => <span className="text-sm">{r.vehicle}</span> },
    { key: 'type', header: 'Type', render: (r) => <StatusBadge status={r.type} /> },
    { key: 'description', header: 'Description', render: (r) => <span className="text-sm truncate max-w-[180px] block">{r.description}</span> },
    { key: 'workshop', header: 'Workshop', render: (r) => <span className="text-sm">{r.workshop}</span> },
    { key: 'expected_completion', header: 'Expected', render: (r) => <span className="text-sm">{formatDate(r.expected_completion)}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'cost', header: 'Cost', render: (r) => <span className="text-sm">₹{(r.cost ?? 0).toLocaleString('en-IN')}</span> },
    {
      key: 'id' as any,
      header: 'Actions',
      render: (r: any) => (
        <div className="flex items-center gap-1.5">
          {r.status === 'pending' && (
            <button
              onClick={() => startMutation.mutate(r.id)}
              disabled={startMutation.isPending}
              title="Mark as In Progress"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> Start
            </button>
          )}
          <button
            onClick={() => openEdit(r)}
            title="Edit"
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
          <button
            onClick={() => { setCompletingWO(r); setForm({ odometer: '', actual_cost: String(r.cost || ''), notes: '' }); }}
            title="Mark as Done"
            className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
          >
            <CheckCircle2 className="w-3 h-3" /> Done
          </button>
        </div>
      ),
    },
  ];

  // Parts columns
  const partsColumns: Column<PartInventory>[] = [
    { key: 'part_name', header: 'Part Name', render: (r) => <span className="font-medium">{r.part_name}</span> },
    { key: 'category', header: 'Category', render: (r) => <span className="text-sm">{r.category}</span> },
    { key: 'quantity', header: 'Qty', render: (r) => <span className={`text-sm font-medium ${r.quantity === 0 ? 'text-red-600' : r.quantity <= r.reorder_level ? 'text-amber-600' : 'text-gray-900'}`}>{r.quantity} {r.unit}</span> },
    { key: 'reorder_level', header: 'Reorder At', render: (r) => <span className="text-sm">{r.reorder_level} {r.unit}</span> },
    { key: 'unit_cost', header: 'Unit Cost', render: (r) => <span className="text-sm">₹{(r.unit_cost ?? 0).toLocaleString('en-IN')}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
  ];

  // Tyre columns
  const tyreColumns: Column<TyreRecord>[] = [
    { key: 'vehicle', header: 'Vehicle', render: (r) => <span className="font-medium">{r.vehicle}</span> },
    { key: 'position', header: 'Position', render: (r) => <span className="text-sm">{r.position}</span> },
    { key: 'brand', header: 'Brand', render: (r) => <span className="text-sm">{r.brand} {r.model}</span> },
    { key: 'installed_date', header: 'Installed', render: (r) => <span className="text-sm">{formatDate(r.installed_date)}</span> },
    { key: 'tread_depth_mm', header: 'Tread (mm)', render: (r) => <span className={`text-sm font-medium ${r.tread_depth_mm < 4 ? 'text-red-600' : r.tread_depth_mm < 6 ? 'text-amber-600' : 'text-green-600'}`}>{r.tread_depth_mm}</span> },
    { key: 'current_km', header: 'KM Run', render: (r) => <span className="text-sm">{Number(r.current_km - r.installed_km).toLocaleString('en-IN')} km</span> },
    { key: 'condition', header: 'Condition', render: (r) => <StatusBadge status={r.condition} /> },
  ];

  // Battery columns
  const batteryColumns: Column<BatteryRecord>[] = [
    { key: 'vehicle', header: 'Vehicle', render: (r) => <span className="font-medium">{r.vehicle}</span> },
    { key: 'brand', header: 'Battery', render: (r) => <span className="text-sm">{r.brand} {r.model}</span> },
    { key: 'installed_date', header: 'Installed', render: (r) => <span className="text-sm">{formatDate(r.installed_date)}</span> },
    { key: 'voltage', header: 'Voltage', render: (r) => <span className={`text-sm font-medium ${r.voltage < 12 ? 'text-red-600' : r.voltage < 12.4 ? 'text-amber-600' : 'text-green-600'}`}>{r.voltage}V</span> },
    { key: 'health_percent', header: 'Health', render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${r.health_percent > 70 ? 'bg-green-500' : r.health_percent > 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${r.health_percent}%` }} />
        </div>
        <span className="text-xs font-medium">{r.health_percent}%</span>
      </div>
    ) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'expected_replacement', header: 'Replace By', render: (r) => <span className="text-sm">{formatDate(r.expected_replacement)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Maintenance Management</h1>
          <p className="page-subtitle">Service schedules, work orders, parts, tyres and battery monitoring</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" /> New Work Order
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'schedule' && (
          <DataTable columns={scheduleColumns} data={safeArray<MaintenanceScheduleItem>((scheduleData as any)?.items ?? scheduleData)} isLoading={scheduleLoading} emptyMessage="No scheduled maintenance" />
        )}
        {activeTab === 'work-orders' && (
          <DataTable columns={woColumns} data={safeArray<WorkOrder>((workOrderData as any)?.items ?? workOrderData)} isLoading={woLoading} emptyMessage="No work orders" />
        )}
        {activeTab === 'parts' && (
          <>
            {partsData && (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <KPICard title="Total Value" value={`₹${Number((partsData.total_value || 0) ?? 0).toLocaleString('en-IN')}`} icon={<Package className="w-5 h-5" />} color="blue" />
                <KPICard title="Low Stock" value={partsData.low_stock_count || 0} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
                <KPICard title="Out of Stock" value={partsData.out_of_stock_count || 0} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
              </div>
            )}
            <DataTable columns={partsColumns} data={safeArray<PartInventory>((partsData as any)?.items ?? partsData)} isLoading={partsLoading} emptyMessage="No parts in inventory" />
          </>
        )}
        {activeTab === 'tyres' && (
          <>
            {tyreData?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <KPICard title="Total Tyres" value={tyreData.summary.total_tyres} icon={<CircleDot className="w-5 h-5" />} color="blue" />
                <KPICard title="Good" value={tyreData.summary.good} icon={<CircleDot className="w-5 h-5" />} color="green" />
                <KPICard title="Fair" value={tyreData.summary.fair} icon={<CircleDot className="w-5 h-5" />} color="amber" />
                <KPICard title="Replace Soon" value={tyreData.summary.replace_soon} icon={<CircleDot className="w-5 h-5" />} color="red" />
                <KPICard title="Critical" value={tyreData.summary.critical} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
              </div>
            )}
            <DataTable columns={tyreColumns} data={safeArray<TyreRecord>((tyreData as any)?.items ?? tyreData)} isLoading={tyreLoading} emptyMessage="No tyre records" />
          </>
        )}
        {activeTab === 'battery' && (
          <DataTable columns={batteryColumns} data={safeArray<BatteryRecord>((batteryData as any)?.items ?? batteryData)} isLoading={batteryLoading} emptyMessage="No battery records" />
        )}
        {activeTab === 'predictive' && (
          <PredictiveTab data={safeArray<MaintenancePrediction>(predictData)} isLoading={predictLoading} />
        )}
      </div>

      {/* ── Create / Edit Work Order Modal ── */}
      {woModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">
                {woModal.mode === 'create' ? 'New Work Order' : `Edit — ${woModal.wo?.work_order_number}`}
              </h3>
              <button onClick={() => setWoModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
            </div>

            <div className="space-y-3">
              {woModal.mode === 'create' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Vehicle <span className="text-red-500">*</span></label>
                  <select
                    value={woForm.vehicle_id}
                    onChange={e => setWoForm(f => ({ ...f, vehicle_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select truck…</option>
                    {(vehiclesList ?? []).map((v: any) => (
                      <option key={v.id} value={v.id}>{v.registration_number}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Service Type</label>
                  <select
                    value={woForm.service_type}
                    onChange={e => setWoForm(f => ({ ...f, service_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {['oil_change','tyre_rotation','brake_service','air_filter','battery_check','greasing','coolant_flush','clutch_service','suspension_check','electrical_check','tyre_change','general_service','other'].map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Maintenance Type</label>
                  <select
                    value={woForm.maintenance_type}
                    onChange={e => setWoForm(f => ({ ...f, maintenance_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="breakdown">Breakdown</option>
                    <option value="accident">Accident</option>
                    <option value="inspection">Inspection</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description / Issue</label>
                <textarea
                  placeholder="Describe the issue or service required…"
                  value={woForm.description}
                  onChange={e => setWoForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Workshop / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. In-house, Gopal Workshop"
                    value={woForm.vendor_name}
                    onChange={e => setWoForm(f => ({ ...f, vendor_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={woForm.service_date}
                    onChange={e => setWoForm(f => ({ ...f, service_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Cost (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 3500"
                  value={woForm.total_cost}
                  onChange={e => setWoForm(f => ({ ...f, total_cost: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">— optional</span></label>
                <textarea
                  placeholder="Any additional notes…"
                  value={woForm.notes}
                  onChange={e => setWoForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {(createMutation.isError || editMutation.isError) && (
              <p className="mt-2 text-xs text-red-600">Failed to save. Please try again.</p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setWoModal(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitWoForm}
                disabled={createMutation.isPending || editMutation.isPending || (woModal.mode === 'create' && !woForm.vehicle_id)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {(createMutation.isPending || editMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {woModal.mode === 'create' ? 'Create Work Order' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete Work Order Modal ── */}
      {completingWO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Mark as Completed</h3>
                <p className="text-xs text-gray-500 mt-0.5">{completingWO.work_order_number} — {completingWO.vehicle}</p>
              </div>
              <button onClick={() => setCompletingWO(null)} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4 text-sm text-blue-800">
              <p className="font-medium">{completingWO.description}</p>
              <p className="text-xs mt-0.5 text-blue-600">Workshop: {completingWO.workshop}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Current Odometer (km) <span className="text-gray-400 font-normal">— optional</span></label>
                <input
                  type="number"
                  placeholder="e.g. 145000"
                  value={form.odometer}
                  onChange={e => setForm(f => ({ ...f, odometer: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Actual Cost (₹)</label>
                <input
                  type="number"
                  placeholder="Actual cost incurred"
                  value={form.actual_cost}
                  onChange={e => setForm(f => ({ ...f, actual_cost: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">— optional</span></label>
                <textarea
                  placeholder="Parts replaced, observations, mechanic name…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setCompletingWO(null)}
                className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={completeMutation.isPending}
                onClick={() => completeMutation.mutate({
                  id: (completingWO as any).id,
                  data: {
                    completed_date: new Date().toISOString().split('T')[0],
                    odometer_reading: form.odometer ? parseFloat(form.odometer) : null,
                    actual_cost: form.actual_cost ? parseFloat(form.actual_cost) : null,
                    notes: form.notes || null,
                  },
                })}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {completeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Confirm Done
              </button>
            </div>

            {completeMutation.isError && (
              <p className="mt-2 text-xs text-red-600 text-center">Failed to complete. Please try again.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Predictive Maintenance Tab ────────────────────── */

function PredictiveTab({ data, isLoading }: { data: MaintenancePrediction[]; isLoading: boolean }) {
  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" /></div>;

  const critical = data.filter(d => d.urgency === 'critical');
  const soon = data.filter(d => d.urgency === 'soon');
  const normal = data.filter(d => d.urgency === 'normal');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 mb-2">
        <KPICard title="Critical" value={critical.length} icon={<AlertTriangle className="w-5 h-5" />} color="bg-red-100 text-red-600" />
        <KPICard title="Due Soon" value={soon.length} icon={<TrendingUp className="w-5 h-5" />} color="bg-yellow-100 text-yellow-600" />
        <KPICard title="Normal" value={normal.length} icon={<Calendar className="w-5 h-5" />} color="bg-green-100 text-green-600" />
      </div>

      <div className="divide-y divide-gray-100">
        {data.map((p, i) => {
          const urgencyMap = {
            critical: { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', label: 'Overdue / Critical' },
            soon: { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', label: 'Due Soon' },
            normal: { bg: 'bg-white border-gray-200', badge: 'bg-green-100 text-green-700', label: 'Normal' },
          };
          const style = urgencyMap[p.urgency];
          return (
            <div key={i} className={`flex items-center gap-4 p-4 rounded-lg border ${style.bg} mb-2`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{p.registration_number}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Last service: {p.last_service_date ? new Date(p.last_service_date).toLocaleDateString('en-IN') : '—'}
                  {p.km_since_last != null && p.km_since_last >= 0 && ` • ${Number(p.km_since_last).toLocaleString()} km since`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {p.predicted_date ? new Date(p.predicted_date).toLocaleDateString('en-IN') : 'N/A'}
                </p>
                {p.km_remaining != null && p.km_remaining >= 0 && (
                  <p className="text-xs text-gray-500">{Number(p.km_remaining).toLocaleString()} km remaining</p>
                )}
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style.badge}`}>{style.label}</span>
            </div>
          );
        })}
        {data.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-400">
            <TrendingUp className="w-10 h-10 mx-auto text-gray-300 mb-2" />
            No predictive maintenance data available yet
          </div>
        )}
      </div>
    </div>
  );
}
