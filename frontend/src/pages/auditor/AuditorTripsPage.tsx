import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { Truck, Clock, MapPin, Download, ExternalLink, AlertTriangle } from 'lucide-react';
import { auditorService } from '../../services/dataService';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

type FlagType = 'all' | 'delayed' | 'deviated' | 'empty_run';

const tabs: { key: FlagType; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'all', label: 'All Trips', icon: Truck, color: 'text-gray-600' },
  { key: 'delayed', label: 'Delayed', icon: Clock, color: 'text-orange-600' },
  { key: 'deviated', label: 'Deviated', icon: MapPin, color: 'text-yellow-600' },
  { key: 'empty_run', label: 'Empty Runs', icon: AlertTriangle, color: 'text-red-600' },
];

const formatMins = (m: number) => {
  if (!m) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
};

const fmt = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN')}${n < 0 ? ' CR' : ''}`;

function RowHighlight({ children, isDelayed, isDeviated, isEmpty }: {
  children: React.ReactNode; isDelayed: boolean; isDeviated: boolean; isEmpty: boolean;
}) {
  const cls = isEmpty ? 'bg-red-50 hover:bg-red-100' :
    isDelayed ? 'bg-orange-50 hover:bg-orange-100' :
    isDeviated ? 'bg-yellow-50 hover:bg-yellow-100' :
    'hover:bg-gray-50';
  return <tr className={`border-b transition-colors ${cls}`}>{children}</tr>;
}

export default function AuditorTripsPage() {
  const [searchParams] = useSearchParams();
  const initialFlag = (searchParams.get('flag') || 'all') as FlagType;
  const [activeFlag, setActiveFlag] = useState<FlagType>(initialFlag);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [activeFlag, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-trips', from, to, activeFlag, page],
    queryFn: () =>
      auditorService.getTrips({
        from_date: from,
        to_date: to,
        flag: activeFlag === 'all' ? undefined : activeFlag,
        page,
        per_page: 50,
      }),
  });

  const items = data?.items ?? [];
  const summary = data?.summary ?? { total_trips: 0, delayed: 0, deviated: 0, empty_runs: 0 };
  const total = data?.total ?? 0;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl">
            <Truck className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Trip Audit</h1>
            <p className="text-sm text-gray-500">Delay · Distance deviation · Empty run detection</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button
            onClick={() => auditorService.exportReport('trips', { from_date: from, to_date: to })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-3">
        {[
          { label: 'Total', value: summary.total_trips, color: 'bg-gray-100 text-gray-700' },
          { label: 'Delayed', value: summary.delayed, color: 'bg-orange-100 text-orange-700' },
          { label: 'Deviated', value: summary.deviated, color: 'bg-yellow-100 text-yellow-700' },
          { label: 'Empty Runs', value: summary.empty_runs, color: 'bg-red-100 text-red-700' },
        ].map(c => (
          <div key={c.label} className={`px-4 py-2 rounded-lg text-sm font-medium ${c.color}`}>
            {c.label}: <span className="font-bold">{c.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => setActiveFlag(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFlag === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={14} className={activeFlag === t.key ? t.color : ''} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Truck size={40} className="mx-auto mb-3 opacity-30" />
            <div>No trips found for the selected filter</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Trip</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Route</th>
                  <th className="px-4 py-3 text-left">Driver / Vehicle</th>
                  <th className="px-4 py-3 text-right">Planned KM</th>
                  <th className="px-4 py-3 text-right">Actual KM</th>
                  <th className="px-4 py-3 text-right">Deviation</th>
                  <th className="px-4 py-3 text-right">Delay</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Expense</th>
                  <th className="px-4 py-3 text-right">Profit</th>
                  <th className="px-4 py-3 text-center">Flags</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((t: any) => (
                  <RowHighlight key={t.id} isDelayed={t.is_delayed} isDeviated={t.is_deviated} isEmpty={t.is_empty_run}>
                    <td className="px-4 py-3 font-medium text-blue-700">{t.trip_number}</td>
                    <td className="px-4 py-3 text-gray-600">{t.trip_date}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{t.origin}</div>
                      <div className="text-gray-400 text-xs">→ {t.destination}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{t.driver || '—'}</div>
                      <div className="text-gray-400 text-xs">{t.vehicle || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{t.planned_km ? `${t.planned_km} km` : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{t.actual_km ? `${t.actual_km} km` : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {t.planned_km && t.actual_km ? (
                        <span className={`font-medium ${t.is_deviated ? 'text-yellow-600' : 'text-gray-600'}`}>
                          {t.distance_deviation_pct > 0 ? '+' : ''}{t.distance_deviation_pct}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.is_delayed ? (
                        <span className="text-orange-600 font-medium">{formatMins(t.delay_minutes)}</span>
                      ) : (
                        <span className="text-green-600">On time</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-800">
                      {t.is_empty_run ? <span className="text-red-500">₹0 (Empty)</span> : fmt(t.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(t.total_expense)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${t.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {t.profit >= 0 ? '+' : ''}{fmt(t.profit)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-center flex-wrap">
                        {t.is_delayed && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">LATE</span>}
                        {t.is_deviated && <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">DEV</span>}
                        {t.is_empty_run && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">EMPTY</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/trips/${t.id}`} className="text-blue-500 hover:text-blue-700">
                        <ExternalLink size={14} />
                      </Link>
                    </td>
                  </RowHighlight>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Prev</button>
            <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
