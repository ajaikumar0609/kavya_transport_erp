import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { auditorService } from '../../services/dataService';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

type SortKey = 'profit' | 'revenue' | 'margin';

const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN')}`;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export default function AuditorLRProfitabilityPage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [sortBy, setSortBy] = useState<SortKey>('profit');
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [from, to, sortBy]);

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-lr', from, to, sortBy, page],
    queryFn: () => auditorService.getLRProfitability({ from_date: from, to_date: to, sort_by: sortBy, page, per_page: 50 }),
  });

  const items = data?.items ?? [];
  const summary = data?.summary ?? { total_lrs: 0, total_revenue: 0, total_profit: 0, avg_margin_pct: 0, loss_making_lrs: 0 };
  const total = data?.total ?? 0;

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => setSortBy(k)}
      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${
        sortBy === k ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-100 rounded-xl">
            <TrendingUp className="text-indigo-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">LR Profitability</h1>
            <p className="text-sm text-gray-500">Per-LR freight income vs trip cost attribution</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button
            onClick={() => auditorService.exportReport('lr', { from_date: from, to_date: to })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total LRs', value: summary.total_lrs, color: 'text-gray-900' },
          { label: 'Total Revenue', value: fmt(summary.total_revenue), color: 'text-blue-700' },
          { label: 'Total Profit', value: fmt(summary.total_profit), color: summary.total_profit >= 0 ? 'text-green-700' : 'text-red-600' },
          { label: 'Avg Margin', value: pct(summary.avg_margin_pct), color: summary.avg_margin_pct >= 0 ? 'text-green-700' : 'text-red-600' },
          { label: 'Loss-Making LRs', value: summary.loss_making_lrs, color: summary.loss_making_lrs > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border p-4">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 font-medium">Sort by:</span>
        <SortBtn k="profit" label="Profit" />
        <SortBtn k="revenue" label="Revenue" />
        <SortBtn k="margin" label="Margin %" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
            <div>No LR data for the selected period</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">LR No</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Route</th>
                  <th className="px-4 py-3 text-left">Consignor → Consignee</th>
                  <th className="px-4 py-3 text-left">Trip</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Expense</th>
                  <th className="px-4 py-3 text-right">Profit</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r: any) => (
                  <tr key={r.id}
                    className={`border-b transition-colors ${
                      r.is_loss ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                    }`}>
                    <td className="px-4 py-3 font-medium text-indigo-700">{r.lr_number}</td>
                    <td className="px-4 py-3 text-gray-600">{r.lr_date}</td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">{r.origin}</div>
                      <div className="text-gray-400 text-xs">→ {r.destination}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700 text-xs">{r.consignor || '—'}</div>
                      <div className="text-gray-400 text-xs">→ {r.consignee || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-600 text-xs">{r.trip_number || '—'}</div>
                      <div className="text-gray-400 text-xs">{r.vehicle || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-blue-700 font-medium">{fmt(r.total_revenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{fmt(r.trip_expense)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold flex items-center justify-end gap-1 ${r.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {r.profit >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        {fmt(r.profit)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${r.margin_pct >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {pct(r.margin_pct)}
                        {r.is_loss && <span className="ml-1 text-xs bg-red-100 text-red-600 px-1 rounded">LOSS</span>}
                      </span>
                    </td>
                  </tr>
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
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Prev</button>
            <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
