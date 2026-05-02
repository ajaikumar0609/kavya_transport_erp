import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Fuel, TrendingDown, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { auditorService } from '../../services/dataService';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

type ViewMode = 'vehicles' | 'trips';

export default function AuditorFuelPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [view, setView] = useState<ViewMode>('vehicles');

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-fuel', from, to],
    queryFn: () => auditorService.getFuelEfficiency({ from_date: from, to_date: to }),
  });

  const trips = data?.trips ?? [];
  const vehicles = data?.vehicle_summary ?? [];
  const summary = data?.summary ?? { total_trips_analyzed: 0, inefficient_trips: 0, avg_mileage_kmpl: 0 };

  const effBg = (e: number) => {
    if (e === 0) return 'text-gray-400';
    if (e < -15) return 'text-red-600 font-bold';
    if (e < 0) return 'text-orange-500';
    return 'text-green-600';
  };

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-100 rounded-xl">
            <Fuel className="text-teal-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fuel Efficiency Audit</h1>
            <p className="text-sm text-gray-500">Mileage vs benchmark · Actual vs estimated litres</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.total_trips_analyzed}</div>
          <div className="text-xs text-gray-500">Trips Analyzed</div>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.avg_mileage_kmpl} <span className="text-sm text-gray-400">km/l</span></div>
          <div className="text-xs text-gray-500">Avg Fleet Mileage</div>
        </div>
        <div className={`rounded-xl border p-4 ${summary.inefficient_trips > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`text-2xl font-bold ${summary.inefficient_trips > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {summary.inefficient_trips}
          </div>
          <div className="text-xs text-gray-500">Inefficient Trips (&lt;−15% vs benchmark)</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setView('vehicles')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'vehicles' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Vehicle Summary
        </button>
        <button onClick={() => setView('trips')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${view === 'trips' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Trip Detail
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
        </div>
      ) : view === 'vehicles' ? (
        /* Vehicle Summary Cards */
        vehicles.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Fuel size={40} className="mx-auto mb-3 opacity-30" />
            <div>No fuel data for the selected period</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicles.map((v: any) => (
              <div key={v.vehicle} className={`rounded-xl border p-4 ${
                v.avg_mileage_kmpl > 0 && v.avg_mileage_kmpl < 5 ? 'border-red-200 bg-red-50' : 'bg-white'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-gray-900">{v.vehicle}</div>
                  {v.avg_mileage_kmpl > 0 && v.avg_mileage_kmpl < 5 && (
                    <AlertTriangle size={16} className="text-red-500" />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-gray-400 text-xs">Trips</div>
                    <div className="font-medium text-gray-800">{v.trips}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Total KM</div>
                    <div className="font-medium text-gray-800">{Math.round(v.total_km)} km</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Total Litres</div>
                    <div className="font-medium text-gray-800">{v.total_litres.toFixed(1)} L</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Avg Mileage</div>
                    <div className={`font-bold text-lg ${effBg(v.avg_mileage_kmpl - 5)}`}>
                      {v.avg_mileage_kmpl} <span className="text-xs font-normal text-gray-400">km/l</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-gray-400 text-xs">Fuel Cost</div>
                    <div className="font-medium text-gray-800">₹{v.total_cost.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* Trip Detail Table */
        <div className="bg-white rounded-xl border overflow-hidden">
          {trips.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <Fuel size={40} className="mx-auto mb-3 opacity-30" />
              <div>No trip-level fuel data for the selected period</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Trip</th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Vehicle</th>
                    <th className="px-4 py-3 text-right">KM Run</th>
                    <th className="px-4 py-3 text-right">Actual (L)</th>
                    <th className="px-4 py-3 text-right">Est. (L)</th>
                    <th className="px-4 py-3 text-right">Variance</th>
                    <th className="px-4 py-3 text-right">Actual km/l</th>
                    <th className="px-4 py-3 text-right">Benchmark</th>
                    <th className="px-4 py-3 text-right">Efficiency</th>
                    <th className="px-4 py-3 text-right">Fuel Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map((t: any) => (
                    <tr key={t.trip_id} className={`border-b transition-colors ${
                      t.is_inefficient ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                    }`}>
                      <td className="px-4 py-3 font-medium text-gray-800">{t.trip_number}</td>
                      <td className="px-4 py-3 text-gray-600">{t.trip_date}</td>
                      <td className="px-4 py-3 text-gray-700">{t.vehicle}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{t.km_run}</td>
                      <td className="px-4 py-3 text-right text-gray-800 font-medium">{t.actual_litres}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{t.estimated_litres || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {t.estimated_litres > 0 ? (
                          <span className={t.fuel_variance_litres > 0 ? 'text-orange-600' : 'text-green-600'}>
                            {t.fuel_variance_litres > 0 ? '+' : ''}{t.fuel_variance_litres} L
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{t.actual_mileage_kmpl || '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{t.benchmark_mileage_kmpl || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {t.benchmark_mileage_kmpl > 0 ? (
                          <span className={effBg(t.efficiency_pct)}>
                            {t.efficiency_pct > 0 ? '+' : ''}{t.efficiency_pct}%
                            {t.is_inefficient && ' ⚠'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">₹{t.fuel_cost.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
