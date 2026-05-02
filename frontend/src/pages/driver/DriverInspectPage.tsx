/**
 * DriverInspectPage — Driver selects tyres via SVG diagram and submits readings.
 * Route: /driver/inspect/:vehicleId
 */
import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { tyreTrackerService } from '@/services/dataService';
import VehicleTyreDiagram, { layoutForVehicleType, mapDbPositions, POSITION_MAP } from '@/components/fleet/VehicleTyreDiagram';
import ReadingDrawer from '@/components/tyres/ReadingDrawer';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface VehicleDetail {
  id: number;
  registration_number: string;
  vehicle_type: string;
  make?: string;
  model?: string;
}

interface TyreRow {
  id: number;
  position: string;
  last_psi?: number;
  tread_depth_mm?: number;
  brand?: string;
  size?: string;
}

export default function DriverInspectPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const vid = Number(vehicleId);
  const navigate = useNavigate();

  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [completedPositions, setCompletedPositions] = useState<Set<string>>(new Set());
  const [odometer, setOdometer] = useState('');

  // Fetch vehicle info
  const { data: vehicleData, isLoading: vehicleLoading } = useQuery({
    queryKey: ['vehicle-detail', vid],
    queryFn: async () => {
      const res = await api.get(`/vehicle/${vid}`);
      return (res as any)?.data || res;
    },
    enabled: !!vid,
  });

  // Fetch tyres for this vehicle
  const { data: tyresData } = useQuery({
    queryKey: ['vehicle-tyres', vid],
    queryFn: () => tyreTrackerService.getVehicleTyres(vid),
    enabled: !!vid,
  });

  const vehicle: VehicleDetail | null = vehicleData || null;
  const tyreRows: TyreRow[] = tyresData?.items || tyresData || [];

  // Build tyre map for diagram
  const tyreMap = React.useMemo(() => {
    const m = new Map<string, any>();
    tyreRows.forEach(t => {
      const dbPos = t.position?.toUpperCase() || '';
      const val = {
        has_sensor: false,
        life_percent: t.tread_depth_mm ? Math.min(100, (t.tread_depth_mm / 10) * 100) : 80,
        pressure: t.last_psi,
        last_psi: t.last_psi,
        tread_depth_mm: t.tread_depth_mm,
        id: t.id,
        position: dbPos,
        inspected: completedPositions.has(dbPos),
      };
      m.set(dbPos, val);
    });
    return mapDbPositions(m);
  }, [tyreRows, completedPositions]);

  const layout = vehicle ? layoutForVehicleType(vehicle.vehicle_type, tyreRows.length) : 'TRUCK_2AXLE';

  const handleTyreClick = useCallback((diagramPos: string) => {
    // Reverse map diagram position back to DB position
    const dbPos = Object.entries(POSITION_MAP).find(([_, v]) => v === diagramPos)?.[0] || diagramPos;
    setSelectedPosition(dbPos);
  }, []);

  const handleDrawerSaved = useCallback(() => {
    if (selectedPosition) {
      setCompletedPositions(prev => new Set([...prev, selectedPosition]));
    }
    setSelectedPosition(null);
    toast.success('Reading saved!');
  }, [selectedPosition]);

  const selectedTyre = tyreRows.find(t => t.position?.toUpperCase() === selectedPosition?.toUpperCase());

  const allInspected = tyreRows.length > 0 && completedPositions.size >= tyreRows.length;

  if (vehicleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading vehicle...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">
            {vehicle?.registration_number || `Vehicle #${vid}`}
          </h1>
          <p className="text-xs text-gray-500">{vehicle?.vehicle_type} inspection</p>
        </div>
        <div className="ml-auto text-xs font-medium text-gray-500">
          {completedPositions.size}/{tyreRows.length} done
        </div>
      </div>

      <div className="px-4 py-4 max-w-lg mx-auto space-y-5">
        {/* Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
          Tap a tyre on the diagram below to submit a reading for that position.
          Inspected tyres turn green.
        </div>

        {/* Odometer input */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Current Odometer (km)</label>
          <input
            type="number"
            min="0"
            value={odometer}
            onChange={e => setOdometer(e.target.value)}
            placeholder="e.g. 145230"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tyre diagram */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 overflow-auto">
          <p className="text-xs text-gray-500 mb-3 text-center">Tap a tyre to inspect it</p>
          <VehicleTyreDiagram
            vehicleType={layout}
            tyres={tyreMap}
            onTyreClick={handleTyreClick}
            selectedPosition={selectedPosition ? (POSITION_MAP[selectedPosition] || selectedPosition) : null}
          />
        </div>

        {/* Progress list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Tyre Positions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tyreRows.map(t => {
              const pos = t.position?.toUpperCase() || '';
              const done = completedPositions.has(pos);
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedPosition(pos)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition ${
                    done
                      ? 'bg-green-50 border-green-400 text-green-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-blue-400'
                  }`}
                >
                  {done ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                  <span className="font-medium uppercase">{pos}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Submit all */}
        {allInspected && (
          <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-green-800 text-sm">All tyres inspected!</p>
              <p className="text-xs text-green-700">Great work. Inspection complete for this vehicle.</p>
            </div>
            <button
              onClick={() => navigate('/driver/tyre')}
              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
            >
              <Send className="w-4 h-4" />
              Done
            </button>
          </div>
        )}
      </div>

      {/* Reading drawer */}
      <ReadingDrawer
        isOpen={!!selectedPosition}
        onClose={() => setSelectedPosition(null)}
        position={selectedPosition || ''}
        vehicleId={vid}
        vehicleReg={vehicle?.registration_number || `#${vid}`}
        lastPsi={selectedTyre?.last_psi}
        lastTread={selectedTyre?.tread_depth_mm}
        onSaved={handleDrawerSaved}
      />
    </div>
  );
}
