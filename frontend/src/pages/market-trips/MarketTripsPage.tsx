import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { marketTripService } from '@/services/dataService';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { getStatusColor, getStatusLabel } from '@/services/workflowService';
import { safeArray } from '@/utils/helpers';
import { handleApiError } from '../../utils/handleApiError';
import type { MarketTrip, MarketTripStatus } from '@/types';
import {
  Search, Filter, Truck, TrendingUp, Loader2,
  CheckCircle, ChevronDown, ChevronUp, User,
} from 'lucide-react';

const STATUS_OPTIONS: { value: MarketTripStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'settled', label: 'Settled' },
  { value: 'cancelled', label: 'Cancelled' },
];

const VEHICLE_TYPES = ['Truck', 'Trailer', 'Tanker', 'Container', 'LCV', 'HCV', 'Tipper', 'Other'];

export default function MarketTripsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState<MarketTrip | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['market-trips', search, statusFilter],
    queryFn: () => marketTripService.list({ search, status: statusFilter || undefined } as any),
  });

  const trips = safeArray<MarketTrip>((data as any)?.data ?? data);

  const cancelMutation = useMutation({
    mutationFn: (id: number) => marketTripService.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['market-trips'] });
      toast.success('Market trip cancelled');
      setCancelTarget(null);
    },
    onError: (error) => handleApiError(error, 'Failed to cancel'),
  });

  const totalTrips = trips.length;
  const activeTrips = trips.filter((t) => ['assigned', 'in_transit'].includes(t.status)).length;
  const totalMargin = trips.reduce((sum, t) => sum + (Number((t as any).margin) || (Number(t.client_rate) - Number(t.contractor_rate))), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Trips</h1>
          <p className="text-sm text-gray-500 mt-1">Manage hired/market truck trips</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
            <Truck size={20} className="text-orange-600" />
          </div>
          <div><p className="text-xs text-gray-500">Total Trips</p><p className="text-lg font-bold text-gray-900">{totalTrips}</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <Truck size={20} className="text-blue-600" />
          </div>
          <div><p className="text-xs text-gray-500">Active Trips</p><p className="text-lg font-bold text-gray-900">{activeTrips}</p></div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <TrendingUp size={20} className="text-green-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Margin</p>
            <p className={`text-lg font-bold ${totalMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>₹{totalMargin.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by job, vehicle, supplier..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm appearance-none">
            {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      {/* Trip Table */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-primary-500" /></div>
      ) : trips.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Truck size={28} className="text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">No market trips found</p>
          <p className="text-xs text-gray-400">Market trips are created when you use Market Trip mode in Create LR</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Job</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Vehicle</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Driver</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Supplier</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Client Rate</th>
                <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-4 py-3">Margin</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {trips.map((trip) => {
                const sc = getStatusColor(trip.status);
                const margin = Number(trip.client_rate || 0) - Number(trip.contractor_rate || 0);
                return (
                  <tr key={trip.id} onClick={() => navigate(`/market-trips/${trip.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-3">
                      {trip.job_id
                        ? <span className="font-semibold text-sm text-primary-600">Job #{trip.job_id}</span>
                        : <span className="text-sm text-gray-400 italic">No job</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Truck size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-800 font-medium">
                          {trip.vehicle_registration || '—'}
                        </span>
                        {(trip as any).vehicle_make && (
                          <span className="text-xs text-gray-400">· {(trip as any).vehicle_make} {(trip as any).vehicle_model || ''}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <User size={14} className="text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-gray-800">{trip.driver_name || '—'}</p>
                          {trip.driver_phone && <p className="text-xs text-gray-400">{trip.driver_phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{(trip as any).supplier?.name || (trip.supplier_id ? `#${trip.supplier_id}` : '—')}</span>
                    </td>
                    <td className="px-4 py-3">
                      {(trip as any).pod_uploaded ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Completed
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                          {getStatusLabel(trip.status)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-800">₹{Number(trip.client_rate || 0).toLocaleString('en-IN')}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-semibold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ₹{margin.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {['pending', 'assigned'].includes(trip.status) && (
                        <button onClick={(e) => { e.stopPropagation(); setCancelTarget(trip); }}
                          className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cancel Confirm */}
      <ConfirmDialog
        isOpen={!!cancelTarget}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
        title="Cancel Market Trip"
        message={`Are you sure you want to cancel the market trip${cancelTarget?.job_id ? ` for Job #${cancelTarget.job_id}` : ''}?`}
        confirmLabel="Cancel Trip"
        isDangerous
      />
    </div>
  );
}
