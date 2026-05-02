import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Users, AlertTriangle, TrendingDown, ExternalLink } from 'lucide-react';
import { auditorService } from '../../services/dataService';

const fmt = (n: number) =>
  n >= 1_00_00_000 ? `₹${(n / 1_00_00_000).toFixed(2)}Cr`
  : n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(2)}L`
  : `₹${n.toLocaleString('en-IN')}`;

const RiskBadge = ({ level }: { level: string }) => {
  const cfg: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700 border-red-200',
    MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    LOW: 'bg-green-100 text-green-700 border-green-200',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg[level] ?? cfg.LOW}`}>
      {level}
    </span>
  );
};

const CreditBar = ({ pct }: { pct: number }) => {
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-400' : 'bg-blue-400';
  return (
    <div className="mt-1">
      <div className="flex justify-between text-xs text-gray-400 mb-0.5">
        <span>Credit Used</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
};

const OverdueRow = ({ label, amount }: { label: string; amount: number }) => (
  <div className="flex justify-between text-xs py-0.5">
    <span className="text-gray-500">{label}</span>
    <span className={`font-medium ${amount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
      {amount > 0 ? fmt(amount) : '—'}
    </span>
  </div>
);

export default function AuditorClientsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['auditor-client-risk'],
    queryFn: () => auditorService.getClientRisk(),
  });

  const clients = data?.clients ?? [];
  const summary = data?.summary ?? { total_clients: 0, high_risk: 0, medium_risk: 0, low_risk: 0, total_outstanding: 0 };

  const byLevel = {
    HIGH: clients.filter((c: any) => c.risk_level === 'HIGH'),
    MEDIUM: clients.filter((c: any) => c.risk_level === 'MEDIUM'),
    LOW: clients.filter((c: any) => c.risk_level === 'LOW'),
  };

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-blue-100 rounded-xl">
          <Users className="text-blue-600" size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Client Risk Scoring</h1>
          <p className="text-sm text-gray-500">Overdue aging · Credit utilization · Dispute analysis</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="text-2xl font-bold text-gray-900">{summary.total_clients}</div>
          <div className="text-xs text-gray-500">Total Clients</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600">{summary.high_risk}</div>
          <div className="text-xs text-gray-500">High Risk</div>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">{summary.medium_risk}</div>
          <div className="text-xs text-gray-500">Medium Risk</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <div className="text-2xl font-bold text-green-600">{summary.low_risk}</div>
          <div className="text-xs text-gray-500">Low Risk</div>
        </div>
        <div className="bg-white rounded-xl border p-4 sm:col-span-1 col-span-2">
          <div className="text-xl font-bold text-gray-900">{fmt(summary.total_outstanding)}</div>
          <div className="text-xs text-gray-500">Total Outstanding</div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : clients.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <div>No client risk data available</div>
        </div>
      ) : (
        /* Cards grouped by risk level */
        <div className="space-y-6">
          {(['HIGH', 'MEDIUM', 'LOW'] as const).map(level => {
            const group = byLevel[level];
            if (!group.length) return null;
            const headerColor = level === 'HIGH' ? 'text-red-700 bg-red-50 border-red-200'
              : level === 'MEDIUM' ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
              : 'text-green-700 bg-green-50 border-green-200';
            return (
              <div key={level}>
                <div className={`flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg border w-fit mb-3 ${headerColor}`}>
                  {level === 'HIGH' ? <AlertTriangle size={14} /> : level === 'MEDIUM' ? <TrendingDown size={14} /> : null}
                  {level} RISK — {group.length} client{group.length > 1 ? 's' : ''}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.map((c: any) => (
                    <div key={c.client_id}
                      className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${
                        level === 'HIGH' ? 'border-red-200' : level === 'MEDIUM' ? 'border-yellow-200' : ''
                      }`}>
                      {/* Client header */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-bold text-gray-900">{c.client_name}</div>
                          <div className="text-xs text-gray-400">{c.client_code}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className={`text-2xl font-black ${
                              level === 'HIGH' ? 'text-red-600' : level === 'MEDIUM' ? 'text-yellow-600' : 'text-green-600'
                            }`}>{c.risk_score}</div>
                            <RiskBadge level={c.risk_level} />
                          </div>
                          <Link to={`/clients/${c.client_id}`} className="text-gray-300 hover:text-blue-500">
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </div>

                      {/* Outstanding */}
                      <div className="mb-2">
                        <div className="text-xs text-gray-500">Total Outstanding</div>
                        <div className="font-bold text-gray-900">{fmt(c.total_outstanding)}</div>
                      </div>

                      {/* Credit Bar */}
                      <CreditBar pct={c.credit_utilization_pct} />

                      {/* Overdue aging */}
                      <div className="mt-3 pt-2 border-t">
                        <div className="text-xs font-semibold text-gray-400 uppercase mb-1">Overdue Aging</div>
                        <OverdueRow label="> 30 days" amount={c.overdue_30d} />
                        <OverdueRow label="> 60 days" amount={c.overdue_60d} />
                        <OverdueRow label="> 90 days" amount={c.overdue_90d} />
                      </div>

                      {/* Disputes */}
                      {c.disputes > 0 && (
                        <div className="mt-2 px-2 py-1 bg-red-50 rounded text-xs text-red-700 flex items-center gap-1">
                          <AlertTriangle size={12} />
                          {c.disputes} disputed invoice{c.disputes > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
