import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { vehicleService } from '@/services/dataService';
import { StatusBadge, LoadingPage, Modal } from '@/components/common/Modal';
import { SubmitButton } from '@/components/common/SubmitButton';
import {
  ArrowLeft, Edit, ChevronRight, Truck, Cpu, Fuel, Gauge,
  Hash, Calendar, Weight, Navigation, ShieldCheck, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { OwnershipType, VehicleStatus } from '@/types';
import { DocumentChecklist } from '@/components/documents/DocumentChecklist';

function InfoItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
      <div className="mt-0.5 text-blue-500 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    make: '',
    model: '',
    fuel_type: 'diesel',
    capacity_tons: 0,
    ownership_type: 'owned' as OwnershipType,
    status: 'available' as VehicleStatus,
  });

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => vehicleService.get(Number(id)),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: () => vehicleService.update(Number(id), editForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicle', id] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Vehicle updated successfully');
      setIsEditOpen(false);
    },
    onError: () => {
      toast.error('Failed to update vehicle');
    },
  });

  useEffect(() => {
    if (!vehicle) return;
    setEditForm({
      make: vehicle.make || '',
      model: vehicle.model || '',
      fuel_type: vehicle.fuel_type || 'diesel',
      capacity_tons: Number(vehicle.capacity_tons || 0),
      ownership_type: (vehicle.ownership_type || 'owned') as OwnershipType,
      status: (vehicle.status || 'available') as VehicleStatus,
    });
  }, [vehicle]);

  if (isLoading) return <LoadingPage />;
  if (!vehicle) return <div className="text-center py-16 text-gray-400">Vehicle not found</div>;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="breadcrumb">
        <Link to="/dashboard">Dashboard</Link>
        <ChevronRight size={14} className="breadcrumb-separator" />
        <Link to="/vehicles">Vehicles</Link>
        <ChevronRight size={14} className="breadcrumb-separator" />
        <span className="text-gray-900 font-medium">{vehicle.registration_number}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/vehicles')} className="btn-icon">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title">{vehicle.registration_number}</h1>
            <StatusBadge status={vehicle.status} />
          </div>
          <p className="text-gray-500 text-sm mt-0.5">
            {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''} &bull; {(vehicle.vehicle_type || '').replace(/_/g, ' ')}
          </p>
        </div>
        <button onClick={() => setIsEditOpen(true)} className="btn-secondary flex items-center gap-2">
          <Edit size={15} /> Edit
        </button>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Identity */}
        <div className="card space-y-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Truck size={16} className="text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Identity</h3>
          </div>
          <InfoItem icon={<Truck size={15} />} label="Make" value={vehicle.make} />
          <InfoItem icon={<Truck size={15} />} label="Model" value={vehicle.model} />
          <InfoItem icon={<Calendar size={15} />} label="Year" value={vehicle.year || vehicle.year_of_manufacture} />
          <InfoItem icon={<Truck size={15} />} label="Vehicle Type" value={(vehicle.vehicle_type || '').replace(/_/g, ' ')} />
          <InfoItem icon={<Truck size={15} />} label="Size / Class" value={(vehicle.vehicle_size_class || '').replace(/_/g, ' ')} />
          <InfoItem icon={<Gauge size={15} />} label="Axle / Wheels" value={(vehicle.axle_wheel_type || '').toUpperCase()} />
        </div>

        {/* Technical */}
        <div className="card space-y-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Cpu size={16} className="text-purple-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Technical</h3>
          </div>
          <InfoItem icon={<Hash size={15} />} label="Chassis No." value={vehicle.chassis_number} />
          <InfoItem icon={<Cpu size={15} />} label="Engine No." value={vehicle.engine_number} />
          <InfoItem icon={<Weight size={15} />} label="Capacity" value={vehicle.capacity_tons ? `${vehicle.capacity_tons} Tons` : null} />
          <InfoItem icon={<Fuel size={15} />} label="Fuel Type" value={vehicle.fuel_type} />
          <InfoItem icon={<Gauge size={15} />} label="Mileage" value={vehicle.mileage_per_liter ? `${vehicle.mileage_per_liter} km/L` : null} />
          <InfoItem icon={<Gauge size={15} />} label="Total KM" value={`${Number(vehicle.total_km_run || 0).toLocaleString('en-IN')} km`} />
        </div>

        {/* Ownership & GPS */}
        <div className="card space-y-1">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <ShieldCheck size={16} className="text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Ownership & Status</h3>
          </div>
          <InfoItem icon={<ShieldCheck size={15} />} label="Ownership" value={(vehicle.ownership_type || '').replace(/_/g, ' ')} />
          <InfoItem
            icon={<Navigation size={15} />}
            label="GPS Tracking"
            value={
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${vehicle.gps_enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                {vehicle.gps_enabled ? 'Active' : 'Inactive'}
              </span>
            }
          />
        </div>
      </div>

      {/* Documents */}
      <div className="card">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <FileText size={16} className="text-amber-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Documents</h3>
        </div>
        <DocumentChecklist
          entityType="vehicle"
          entityId={vehicle.id}
        />
      </div>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit Vehicle" size="md">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Make</label>
              <input className="input-field" value={editForm.make} onChange={(e) => setEditForm((p) => ({ ...p, make: e.target.value }))} />
            </div>
            <div>
              <label className="label">Model</label>
              <input className="input-field" value={editForm.model} onChange={(e) => setEditForm((p) => ({ ...p, model: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fuel Type</label>
              <input className="input-field" value={editForm.fuel_type} onChange={(e) => setEditForm((p) => ({ ...p, fuel_type: e.target.value }))} />
            </div>
            <div>
              <label className="label">Capacity (Tons)</label>
              <input type="number" className="input-field" value={editForm.capacity_tons} onChange={(e) => setEditForm((p) => ({ ...p, capacity_tons: Number(e.target.value) || 0 }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Ownership</label>
              <select className="input-field" value={editForm.ownership_type} onChange={(e) => setEditForm((p) => ({ ...p, ownership_type: e.target.value as OwnershipType }))}>
                <option value="owned">Owned</option>
                <option value="leased">Leased</option>
                <option value="attached">Attached</option>
                <option value="market">Market</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input-field" value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as VehicleStatus }))}>
                <option value="available">Available</option>
                <option value="on_trip">On Trip</option>
                <option value="maintenance">Maintenance</option>
                <option value="breakdown">Breakdown</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button type="button" className="btn-secondary" onClick={() => setIsEditOpen(false)}>Cancel</button>
            <SubmitButton isLoading={updateMutation.isPending} label="Save Changes" />
          </div>
        </form>
      </Modal>
    </div>
  );
}
