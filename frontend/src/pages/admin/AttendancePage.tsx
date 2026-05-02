import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar, Users, CheckCircle, Clock, ChevronLeft, ChevronRight,
  Search, Download, RefreshCw, XCircle, AlertCircle, Eye, X,
} from 'lucide-react';
import api from '@/services/api';
import { safeArray } from '@/utils/helpers';
import { exportTableToPdf } from '@/utils/pdfExport';

interface AttendanceRecord {
  id: number;
  user_id?: number;
  employee_name: string;
  employee_email?: string;
  employee_role: string;
  date: string;
  check_in_time?: string;
  status: string;
  check_in_photo_url?: string;
  remarks?: string;
}

const STATUS_STYLE: Record<string, string> = {
  present:  'bg-green-100 text-green-700',
  late:     'bg-amber-100 text-amber-700',
  absent:   'bg-red-100 text-red-600',
  half_day: 'bg-blue-100 text-blue-700',
};

const ROLE_COLORS: Record<string, string> = {
  driver:          'bg-blue-100 text-blue-700',
  clerk:           'bg-purple-100 text-purple-700',
  manager:         'bg-indigo-100 text-indigo-700',
  fleet_manager:   'bg-cyan-100 text-cyan-700',
  accountant:      'bg-teal-100 text-teal-700',
  pump_operator:   'bg-orange-100 text-orange-700',
  admin:           'bg-gray-200 text-gray-700',
};

function roleStyle(role: string) {
  const key = role.toLowerCase().replace(/\s+/g, '_');
  return ROLE_COLORS[key] ?? 'bg-gray-100 text-gray-600';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function shiftDate(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);

const ALL_ROLES = ['All', 'Driver', 'Clerk', 'Manager', 'Fleet Manager', 'Accountant', 'Pump Operator'];

export default function AttendancePage() {
  const [dateFilter, setDateFilter] = useState(TODAY);
  const [roleFilter, setRoleFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [photoModal, setPhotoModal] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-attendance', dateFilter],
    queryFn: () => api.get('/attendance', { params: { page: 1, limit: 500, date: dateFilter } }),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['all-users-attendance'],
    queryFn: () => api.get('/users', { params: { page: 1, limit: 500 } }),
    staleTime: 5 * 60 * 1000,
  });

  const rows = safeArray<any>((data as any)?.data?.items ?? (data as any)?.items ?? data);
  const allUsers = safeArray<any>((usersData as any)?.data?.items ?? (usersData as any)?.items ?? usersData);

  // Build set of user_ids who marked attendance
  const markedUserIds = new Set(rows.map((r: any) => Number(r.user_id)));

  const attendedRecords: AttendanceRecord[] = rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    employee_name: r.employee_name || `Employee #${r.user_id}`,
    employee_email: r.employee_email,
    employee_role: (r.employee_role || '').trim() || 'Unknown',
    date: r.date || dateFilter,
    check_in_time: r.check_in_time,
    status: r.status || 'present',
    check_in_photo_url: r.check_in_photo_url,
    remarks: r.remarks,
  }));

  // Synthetic absent records for users who didn't mark attendance
  const absentRecords: AttendanceRecord[] = allUsers
    .filter((u: any) => {
      // Skip admin users and inactive/system accounts
      const role = (u.role || u.roles?.[0] || '').toLowerCase();
      if (role === 'admin') return false;
      return !markedUserIds.has(Number(u.id));
    })
    .map((u: any, idx: number) => ({
      id: -(idx + 1), // negative id to distinguish from real records
      user_id: u.id,
      employee_name: u.full_name || u.name || u.email || `Employee #${u.id}`,
      employee_email: u.email,
      employee_role: (u.role || u.roles?.[0] || 'Unknown').replace(/_/g, ' '),
      date: dateFilter,
      check_in_time: undefined,
      status: 'absent',
      check_in_photo_url: undefined,
      remarks: undefined,
    }));

  const records: AttendanceRecord[] = [...attendedRecords, ...absentRecords];

  // Client-side role + search filter
  const filtered = useMemo(() => {
    let result = records;
    if (roleFilter !== 'All') {
      const key = roleFilter.toLowerCase().replace(/\s+/g, '_');
      result = result.filter((r) =>
        r.employee_role.toLowerCase().replace(/\s+/g, '_').includes(key),
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.employee_name.toLowerCase().includes(q) ||
          r.employee_email?.toLowerCase().includes(q) ||
          r.employee_role.toLowerCase().includes(q),
      );
    }
    return result;
  }, [records, roleFilter, search]);

  // KPI counts (on full unfiltered records)
  const presentCount  = records.filter((r) => r.status === 'present').length;
  const lateCount     = records.filter((r) => r.status === 'late').length;
  const absentCount   = records.filter((r) => r.status === 'absent').length;
  const halfDayCount  = records.filter((r) => r.status === 'half_day').length;
  const checkedIn     = presentCount + lateCount + halfDayCount;
  const onTimePct     = checkedIn > 0 ? Math.round((presentCount / checkedIn) * 100) : 0;

  // Role breakdown for the summary bar
  const roleBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    records.forEach((r) => {
      const role = r.employee_role || 'Unknown';
      map[role] = (map[role] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [records]);

  const handleExportPdf = () => {
    exportTableToPdf<AttendanceRecord>({
      title: `Attendance — ${fmtDate(dateFilter)}`,
      fileName: `attendance-${dateFilter}`,
      columns: [
        { header: 'Name',     accessor: (r) => r.employee_name },
        { header: 'Role',     accessor: (r) => r.employee_role },
        { header: 'Status',   accessor: (r) => r.status },
        { header: 'Check-In', accessor: (r) => fmtTime(r.check_in_time) },
        { header: 'Remarks',  accessor: (r) => r.remarks ?? '' },
      ],
      rows: filtered,
    });
  };

  const isToday = dateFilter === TODAY;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Daily Attendance</h1>
          <p className="page-subtitle">All employees — drivers, clerks, managers & more</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-secondary flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={handleExportPdf} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download size={14} /> Export PDF
          </button>
        </div>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setDateFilter((d) => shiftDate(d, -1))}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
        >
          <ChevronLeft size={16} />
        </button>
        <input
          type="date"
          value={dateFilter}
          max={TODAY}
          onChange={(e) => setDateFilter(e.target.value)}
          className="input-field text-sm"
        />
        <button
          onClick={() => setDateFilter((d) => shiftDate(d, 1))}
          disabled={isToday}
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
        {!isToday && (
          <button onClick={() => setDateFilter(TODAY)} className="text-xs text-primary-600 hover:underline">
            Back to Today
          </button>
        )}
        <span className="text-sm text-gray-500 hidden sm:block">{fmtDate(dateFilter)}</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: records.length, icon: <Users size={16} />, style: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: 'Present', value: presentCount, icon: <CheckCircle size={16} />, style: 'bg-green-50 text-green-700 border-green-200' },
          { label: 'Late', value: lateCount, icon: <AlertCircle size={16} />, style: 'bg-amber-50 text-amber-700 border-amber-200' },
          { label: 'Absent', value: absentCount, icon: <XCircle size={16} />, style: 'bg-red-50 text-red-700 border-red-200' },
          { label: 'On-time %', value: `${onTimePct}%`, icon: <Clock size={16} />, style: 'bg-purple-50 text-purple-700 border-purple-200' },
        ].map((kpi) => (
          <div key={kpi.label} className={`border rounded-xl p-4 flex items-center gap-3 ${kpi.style}`}>
            <div className="shrink-0">{kpi.icon}</div>
            <div>
              <p className="text-xs font-medium opacity-70">{kpi.label}</p>
              <p className="text-xl font-bold">{kpi.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Role breakdown chips */}
      {roleBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {roleBreakdown.map(([role, count]) => (
            <span
              key={role}
              className={`text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer border ${
                roleFilter === role ? 'ring-2 ring-offset-1 ring-primary-400' : ''
              } ${roleStyle(role)}`}
              onClick={() => setRoleFilter(roleFilter === role ? 'All' : role)}
              title={`Filter by ${role}`}
            >
              {role} ({count})
            </span>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 w-full"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <XCircle size={14} />
            </button>
          )}
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="input-field w-full sm:w-44"
        >
          {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            {roleFilter !== 'All' || search ? ' (filtered)' : ''}
          </span>
          {(roleFilter !== 'All' || search) && (
            <button onClick={() => { setRoleFilter('All'); setSearch(''); }} className="text-xs text-primary-600 hover:underline">
              Clear filters
            </button>
          )}
        </div>

        {isLoading || usersLoading ? (
          <div className="py-16 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center text-gray-400">
            <Calendar size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No attendance records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Check-In (IST)</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Remarks</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${roleStyle(r.employee_role)}`}>
                          {r.employee_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{r.employee_name}</p>
                          {r.employee_email && <p className="text-xs text-gray-400">{r.employee_email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${roleStyle(r.employee_role)}`}>
                        {r.employee_role.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 font-medium">
                      {fmtTime(r.check_in_time)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                      {r.remarks || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.check_in_photo_url ? (
                        <button onClick={() => setPhotoModal(r.check_in_photo_url!)} title="View photo">
                          <img
                            src={r.check_in_photo_url}
                            alt="check-in"
                            className="w-9 h-9 rounded-lg object-cover border border-gray-200 inline-block hover:opacity-80 transition"
                          />
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo modal */}
      {photoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPhotoModal(null)}
        >
          <div className="relative max-w-sm w-full bg-white rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPhotoModal(null)}
              className="absolute top-3 right-3 bg-white/80 rounded-full p-1 hover:bg-white"
            >
              <X size={18} />
            </button>
            <img src={photoModal} alt="Check-in photo" className="w-full object-contain max-h-[80vh]" />
            <div className="px-4 py-3 flex items-center justify-between border-t">
              <p className="text-xs text-gray-500">Check-in photo</p>
              <a href={photoModal} target="_blank" rel="noreferrer" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                <Eye size={12} /> Open full size
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
