// Clerk — Attendance History Page
// Shows full attendance log for the current clerk
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, RefreshCw, CheckCircle2, XCircle, AlertCircle, Calendar } from 'lucide-react';
import api from '@/services/api';
import { safeArray } from '@/utils/helpers';

interface AttendanceRow {
  id: number;
  date?: string;
  status?: string;
  check_in_time?: string;
  check_out_time?: string;
  remarks?: string;
  photo_url?: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  present: <CheckCircle2 size={15} className="text-green-500" />,
  absent: <XCircle size={15} className="text-red-400" />,
  late: <AlertCircle size={15} className="text-amber-500" />,
  half_day: <Clock size={15} className="text-blue-400" />,
};

const STATUS_STYLE: Record<string, string> = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-600',
  late: 'bg-amber-100 text-amber-700',
  half_day: 'bg-blue-100 text-blue-700',
};

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
}

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getMonthRange(offset: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return { from, to, label };
}

export default function ClerkAttendancePage() {
  const [monthOffset, setMonthOffset] = useState(0);
  const { from, to, label } = getMonthRange(monthOffset);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clerk-attendance-history', from, to],
    queryFn: () =>
      api.get('/attendance', {
        params: { date_from: from, date_to: to, limit: 100 },
      }),
  });

  const rows = safeArray<AttendanceRow>(
    (data as any)?.data?.items ?? (data as any)?.items ?? data,
  ).sort((a, b) => {
    const da = a.date ?? '';
    const db = b.date ?? '';
    return db.localeCompare(da); // newest first
  });

  // Summary counts
  const summary = rows.reduce<Record<string, number>>(
    (acc, r) => {
      const s = r.status ?? 'unknown';
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Attendance History</h1>
          <p className="page-subtitle">{label}</p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMonthOffset((o) => o - 1)}
          className="btn-secondary text-sm px-3 py-1.5"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <Calendar size={14} /> {label}
        </span>
        <button
          onClick={() => setMonthOffset((o) => o + 1)}
          disabled={monthOffset >= 0}
          className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
        {monthOffset !== 0 && (
          <button onClick={() => setMonthOffset(0)} className="text-xs text-primary-600 hover:underline">
            This month
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(summary).map(([status, count]) => (
          <div
            key={status}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {STATUS_ICON[status] ?? <Clock size={14} />}
            <span className="capitalize">{status.replace('_', ' ')}</span>
            <span className="font-bold">{count}</span>
          </div>
        ))}
        {rows.length === 0 && !isLoading && (
          <p className="text-sm text-gray-400">No records for this month.</p>
        )}
      </div>

      {/* Attendance table */}
      <div className="card overflow-hidden p-0">
        {isLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <Clock size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No attendance records found for {label}.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-In</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-Out</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remarks</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Photo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{fmtDate(row.date)}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[row.status ?? ''] ?? 'bg-gray-100 text-gray-600'}`}
                    >
                      {STATUS_ICON[row.status ?? ''] ?? <Clock size={12} />}
                      <span className="capitalize">{(row.status ?? 'unknown').replace('_', ' ')}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{fmtTime(row.check_in_time)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{fmtTime(row.check_out_time)}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                    {row.remarks || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.photo_url ? (
                      <a href={row.photo_url} target="_blank" rel="noreferrer">
                        <img
                          src={row.photo_url}
                          alt="Check-in"
                          className="w-8 h-8 rounded-full object-cover border border-gray-200 inline-block hover:opacity-80 transition"
                        />
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
