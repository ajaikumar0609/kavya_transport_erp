import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Receipt, AlertTriangle, X, Download } from 'lucide-react';
import { auditorService } from '../../services/dataService';

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

type FlagType = 'all' | 'anomaly' | 'no_receipt';

const tabs: { key: FlagType; label: string }[] = [
  { key: 'all', label: 'All Expenses' },
  { key: 'anomaly', label: 'Anomaly Flagged' },
  { key: 'no_receipt', label: 'No Receipt' },
];

const CategoryBadge = ({ cat }: { cat: string }) => {
  const colors: Record<string, string> = {
    fuel: 'bg-blue-100 text-blue-700',
    toll: 'bg-purple-100 text-purple-700',
    maintenance: 'bg-orange-100 text-orange-700',
    driver: 'bg-teal-100 text-teal-700',
    other: 'bg-gray-100 text-gray-700',
  };
  const cls = colors[cat.toLowerCase()] ?? colors.other;
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{cat}</span>;
};

export default function AuditorExpensesPage() {
  const [searchParams] = useSearchParams();
  const initialFlag = (searchParams.get('flag') || 'all') as FlagType;
  const [activeFlag, setActiveFlag] = useState<FlagType>(initialFlag);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => setPage(1), [activeFlag, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ['auditor-expenses', from, to, activeFlag, page],
    queryFn: () =>
      auditorService.getExpenses({
        from_date: from,
        to_date: to,
        flag: activeFlag === 'all' ? undefined : activeFlag,
        page,
        per_page: 50,
      }),
  });

  const items = data?.items ?? [];
  const summary = data?.summary ?? { total: 0, anomaly_flagged: 0, no_receipt: 0, high_variance: 0, total_amount: 0 };
  const total = data?.total ?? 0;

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-100 rounded-xl">
            <Receipt className="text-rose-600" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Expense Audit</h1>
            <p className="text-sm text-gray-500">Anomaly detection · Receipt compliance · Variance analysis</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
          <button
            onClick={() => auditorService.exportReport('expenses', { from_date: from, to_date: to })}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Expenses', value: summary.total, color: 'bg-gray-50' },
          { label: 'Anomaly Flagged', value: summary.anomaly_flagged, color: 'bg-red-50' },
          { label: 'No Receipt', value: summary.no_receipt, color: 'bg-orange-50' },
          { label: 'High Variance', value: summary.high_variance, color: 'bg-yellow-50' },
        ].map(c => (
          <div key={c.label} className={`${c.color} rounded-xl p-4 border`}>
            <div className="text-2xl font-bold text-gray-900">{c.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key}
            onClick={() => setActiveFlag(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeFlag === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-rose-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <Receipt size={40} className="mx-auto mb-3 opacity-30" />
            <div>No expenses found for the selected filter</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Trip / Driver</th>
                  <th className="px-4 py-3 text-left">Category</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Avg</th>
                  <th className="px-4 py-3 text-right">Variance</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-center">Receipt</th>
                  <th className="px-4 py-3 text-center">Anomaly</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e: any) => (
                  <tr key={e.id}
                    className={`border-b transition-colors ${
                      e.is_anomaly ? 'bg-red-50 hover:bg-red-100' :
                      !e.has_receipt ? 'bg-orange-50 hover:bg-orange-100' :
                      e.is_high_variance ? 'bg-yellow-50 hover:bg-yellow-100' :
                      'hover:bg-gray-50'
                    }`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{e.trip_number || '—'}</div>
                      <div className="text-xs text-gray-400">{e.driver || '—'}</div>
                    </td>
                    <td className="px-4 py-3"><CategoryBadge cat={e.category} /></td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      ₹{Number(e.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs">
                      ₹{Number(e.category_avg).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${
                        e.is_high_variance ? 'text-yellow-600' : 'text-gray-500'
                      }`}>
                        {e.variance_pct > 0 ? '+' : ''}{e.variance_pct}%
                        {e.is_high_variance && ' ⚠'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {e.expense_date ? e.expense_date.slice(0, 10) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.has_receipt ? (
                        <button
                          onClick={() => setPreviewUrl(e.receipt_url)}
                          className="text-blue-500 hover:text-blue-700 text-xs underline">
                          View
                        </button>
                      ) : (
                        <span className="text-red-400 text-xs font-medium">Missing</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {e.is_anomaly ? (
                        <span title={e.anomaly_reason} className="flex items-center gap-1 justify-center text-red-600">
                          <AlertTriangle size={14} />
                          <span className="text-xs max-w-[100px] truncate">{e.anomaly_reason || 'Flagged'}</span>
                        </span>
                      ) : (
                        <span className="text-green-500 text-xs">OK</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px] truncate" title={e.description}>
                      {e.description || '—'}
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

      {/* Receipt Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}>
          <div className="bg-white rounded-2xl overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-800">Receipt Preview</h3>
              <button onClick={() => setPreviewUrl(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="overflow-auto p-4 flex-1 flex items-center justify-center bg-gray-50">
              {previewUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                <img src={previewUrl} alt="Receipt" className="max-w-full max-h-full rounded-lg" />
              ) : (
                <div className="text-center">
                  <Receipt size={48} className="mx-auto text-gray-300 mb-3" />
                  <a href={previewUrl} target="_blank" rel="noreferrer"
                    className="text-blue-600 underline text-sm">
                    Open receipt in new tab
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
