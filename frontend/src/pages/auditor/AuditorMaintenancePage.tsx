import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Wrench, AlertTriangle, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { auditorService } from '../../services/dataService';

const DocStatusBadge = ({ status, days }: { status: string; days: number }) => {
  const isExpired = status === 'EXPIRED';
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
      isExpired ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
    }`}>
      {status} {isExpired ? `${days}d ago` : `in ${days}d`}
    </span>
  );
};

export default function AuditorMaintenancePage() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-maintenance'],
    queryFn: () => auditorService.getMaintenance(),
  });

  const vehicles = data?.vehicles ?? [];
  const summary = data?.summary ?? { total_vehicles: 0, vehicles_with_doc_alerts: 0, vehicles_with_overdue_service: 0, vehicles_with_tyre_alerts: 0, total_tyre_alerts: 0 };

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-orange-100 rounded-xl">
          <Wrench className="text-orange-600" size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Maintenance Audit</h1>
          <p className="text-sm text-gray-500">Document compliance · Service overdue · Tyre health</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total Vehicles', value: summary.total_vehicles, color: 'bg-white' },
          { label: 'Doc Alerts', value: summary.vehicles_with_doc_alerts, color: 'bg-red-50 border-red-200 text-red-700' },
          { label: 'Overdue Service', value: summary.vehicles_with_overdue_service, color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'Tyre Alerts', value: summary.vehicles_with_tyre_alerts, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
          { label: 'Total Tyre Issues', value: summary.total_tyre_alerts, color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.color}`}>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600" />
        </div>
      ) : vehicles.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Wrench size={40} className="mx-auto mb-3 opacity-30" />
          <div>No vehicle data available</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <th className="px-4 py-3 text-left">Make / Model</th>
                <th className="px-4 py-3 text-center">Doc Alerts</th>
                <th className="px-4 py-3 text-center">Pending Services</th>
                <th className="px-4 py-3 text-center">Tyre Alerts</th>
                <th className="px-4 py-3 text-center">Total Alerts</th>
                <th className="px-4 py-3 text-left">Last Service</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v: any) => {
                const isExpanded = expanded.has(v.vehicle_id);
                const alertColor = v.total_alerts === 0 ? '' : v.total_alerts >= 5 ? 'bg-red-50' : 'bg-yellow-50';
                return (
                  <React.Fragment key={v.vehicle_id}>
                    <tr className={`border-b hover:bg-opacity-80 transition-colors cursor-pointer ${alertColor}`}
                      onClick={() => toggle(v.vehicle_id)}>
                      <td className="px-4 py-3 font-bold text-gray-900">{v.registration}</td>
                      <td className="px-4 py-3 text-gray-500">{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {v.doc_alert_count > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                            {v.doc_alert_count}
                          </span>
                        ) : <span className="text-green-500 text-xs">OK</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {v.pending_services > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                            {v.pending_services}
                          </span>
                        ) : <span className="text-green-500 text-xs">OK</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {v.tyre_alert_count > 0 ? (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                            {v.tyre_alert_count}
                          </span>
                        ) : <span className="text-green-500 text-xs">OK</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-bold text-base ${v.total_alerts === 0 ? 'text-green-600' : v.total_alerts >= 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                          {v.total_alerts}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{v.last_service || '—'}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b">
                        <td colSpan={8} className="px-6 py-4 bg-gray-50">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Doc Alerts */}
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Document Compliance</div>
                              {v.doc_alerts.length === 0 ? (
                                <div className="text-xs text-green-600">All documents valid</div>
                              ) : (
                                <div className="space-y-1">
                                  {v.doc_alerts.map((d: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between">
                                      <span className="text-sm text-gray-700">{d.doc}</span>
                                      <DocStatusBadge status={d.status} days={d.days} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            {/* Pending services */}
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Service Status</div>
                              {v.pending_services === 0 ? (
                                <div className="text-xs text-green-600">No pending services</div>
                              ) : (
                                <div className="flex items-center gap-2 text-orange-700">
                                  <AlertTriangle size={14} />
                                  <span className="text-sm">{v.pending_services} service(s) overdue</span>
                                </div>
                              )}
                            </div>
                            {/* Tyre alerts */}
                            <div>
                              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Tyre Health</div>
                              {v.tyre_alerts.length === 0 ? (
                                <div className="text-xs text-green-600">All tyres in good condition</div>
                              ) : (
                                <div className="space-y-1">
                                  {v.tyre_alerts.map((t: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <XCircle size={12} className="text-red-500 flex-shrink-0" />
                                      <span className="text-xs text-gray-700">
                                        Tyre #{t.tyre} ({t.pos}): <strong>{t.issue}</strong>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
