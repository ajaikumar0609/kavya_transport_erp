// Clerk — My LRs Page
// Full LR list with search, status filter, print, and PDF export
import { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Plus, Search, Printer, Download,
  RefreshCw, Eye, Upload, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { lrService } from '@/services/dataService';
import { safeArray } from '@/utils/helpers';
import { exportTableToPdf } from '@/utils/pdfExport';
import type { LR, LRStatus } from '@/types';

const STATUS_LABELS: Record<LRStatus, string> = {
  draft: 'Draft',
  generated: 'Generated',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  pod_received: 'POD Received',
  cancelled: 'Cancelled',
};

const STATUS_STYLES: Record<LRStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  generated: 'bg-blue-100 text-blue-700',
  in_transit: 'bg-amber-100 text-amber-700',
  delivered: 'bg-green-100 text-green-700',
  pod_received: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-600',
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'generated', label: 'Generated' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'pod_received', label: 'POD Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function ClerkLRsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const statusFilter = searchParams.get('status') ?? '';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clerk-lrs-list', statusFilter],
    queryFn: () =>
      lrService.list({
        my_lrs: true,
        limit: 100,
        ...(statusFilter ? { status: statusFilter } : {}),
      } as any),
  });

  const allRows = safeArray<LR>((data as any)?.items ?? data);

  const filtered = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter(
      (lr) =>
        lr.lr_number?.toLowerCase().includes(q) ||
        lr.consignor_name?.toLowerCase().includes(q) ||
        lr.consignee_name?.toLowerCase().includes(q) ||
        lr.origin?.toLowerCase().includes(q) ||
        lr.destination?.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  const handleExportPdf = () => {
    if (filtered.length === 0) { toast.error('No LRs to export'); return; }
    exportTableToPdf<LR>({
      title: 'My Lorry Receipts',
      fileName: 'my-lrs',
      columns: [
        { header: 'LR Number', accessor: (r) => r.lr_number },
        { header: 'Date', accessor: (r) => r.lr_date ? new Date(r.lr_date).toLocaleDateString('en-IN') : '' },
        { header: 'Consignor', accessor: (r) => r.consignor_name },
        { header: 'Consignee', accessor: (r) => r.consignee_name },
        { header: 'Origin', accessor: (r) => r.origin },
        { header: 'Destination', accessor: (r) => r.destination },
        { header: 'Freight (₹)', accessor: (r) => r.freight_amount },
        { header: 'Status', accessor: (r) => STATUS_LABELS[r.status] ?? r.status },
      ],
      rows: filtered,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">My Lorry Receipts</h1>
          <p className="page-subtitle">{filtered.length} LR{filtered.length !== 1 ? 's' : ''} found</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={handleExportPdf} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download size={14} /> Export PDF
          </button>
          <Link to="/lr/new" className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={14} /> New LR
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by LR number, consignor, consignee, route…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 w-full"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XCircle size={14} />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            if (e.target.value) setSearchParams({ status: e.target.value });
            else setSearchParams({});
          }}
          className="input-field w-full sm:w-48"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <FileText size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No LRs found.</p>
            <Link to="/lr/new" className="text-xs text-primary-600 hover:underline mt-1 inline-block">
              Create a new LR →
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">LR Number</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Consignor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Consignee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Route</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Freight</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">POD</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((lr) => (
                  <tr key={lr.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-primary-600">
                      {lr.lr_number ?? `#${lr.id}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {lr.lr_date ? new Date(lr.lr_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-[140px] truncate">{lr.consignor_name}</td>
                    <td className="px-4 py-3 text-gray-800 max-w-[140px] truncate">{lr.consignee_name}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {lr.origin} → {lr.destination}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      ₹{lr.freight_amount?.toLocaleString('en-IN') ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[lr.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[lr.status] ?? lr.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {lr.pod_uploaded ? (
                        <span className="text-xs text-teal-600 font-medium">✓ Done</span>
                      ) : lr.status === 'delivered' ? (
                        <Link
                          to={`/clerk/pod?lr=${lr.id}`}
                          className="text-xs text-amber-600 font-medium hover:text-amber-800 flex items-center gap-1 justify-center"
                        >
                          <Upload size={12} /> Upload
                        </Link>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link
                          to={`/lr/${lr.id}`}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-primary-600"
                          title="View / Print"
                        >
                          <Eye size={14} />
                        </Link>
                        <a
                          href={`/lr/${lr.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-primary-600"
                          title="Print in new tab"
                        >
                          <Printer size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
