import { useQuery } from '@tanstack/react-query';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import api from '@/services/api';
import { dashboardService, branchService } from '@/services/dataService';
import { KPICard, StatusBadge } from '@/components/common/Modal';
import { useRealtimeDashboard } from '@/services/useRealtimeDashboard';
import { safeArray } from '@/utils/helpers';
import {
  Truck, Users, Navigation, DollarSign, AlertTriangle,
  TrendingUp, RefreshCw, FileText, MapPin, ChevronRight,
  Wallet, Activity, Building2, Wrench, ShieldCheck,
  CircleDollarSign, BarChart3, ClipboardList, Bell, ArrowRight
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import ProjectAssociateDashboard from './ProjectAssociateDashboard';
import DriverDashboardPage from '@/pages/driver/DriverDashboardPage';
import FleetDashboardPage from '@/pages/fleet/FleetDashboardPage';
import ManagerDashboardPage from './ManagerDashboardPage';
import SmartSuggestions from '@/components/modules/dashboard/SmartSuggestions';

const CHART_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const fmt = (val: number) => {
  if (val >= 10000000) return `₹${Number(val / 10000000).toFixed(1)}Cr`;
  if (val >= 100000) return `₹${Number(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${Number(val / 1000).toFixed(1)}K`;
  return `₹${val}`;
};

export default function DashboardPage() {
  const { user, hasRole, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  useRealtimeDashboard();

  const isAdmin = hasRole('admin');

  // Use the primary role (first in array) so multi-role users get a consistent dashboard
  const primaryRole = user?.roles?.[0];
  if (primaryRole === 'project_associate') return <ProjectAssociateDashboard />;
  if (primaryRole === 'driver') return <DriverDashboardPage />;
  if (primaryRole === 'fleet_manager') return <FleetDashboardPage />;
  if (primaryRole === 'manager') return <ManagerDashboardPage />;
  if (primaryRole === 'finance_manager') return <Navigate to="/fm/dashboard" replace />;
  if (primaryRole === 'accountant') return <Navigate to="/accountant/dashboard" replace />;
  if (primaryRole === 'tyre_inspector') return <Navigate to="/fleet/tyres" replace />;
  if (primaryRole === 'pump_operator') return <Navigate to="/pump/dashboard" replace />;
  if (primaryRole === 'auditor') return <Navigate to="/auditor/dashboard" replace />;
  if (primaryRole === 'clerk') return <Navigate to="/clerk/dashboard" replace />;

  // ── Data Queries ────────────────────────────────────────────────
  const { data: overview, refetch } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: dashboardService.getOverview,
  });
  const { data: adminStats } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: dashboardService.getAdminStats,
    enabled: isAdmin,
  });
  const { data: fleetStats } = useQuery({
    queryKey: ['dashboard-fleet-stats'],
    queryFn: dashboardService.getFleetStats,
  });
  const { data: financeStats } = useQuery({
    queryKey: ['dashboard-finance-stats'],
    queryFn: dashboardService.getFinanceStats,
    enabled: hasPermission('finance:read'),
  });
  const { data: fleetUtilizationRaw } = useQuery({
    queryKey: ['fleet-utilization'],
    queryFn: dashboardService.getFleetUtilization,
  });
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: dashboardService.getNotifications,
  });
  const { data: employeesResponse } = useQuery({
    queryKey: ['dashboard-employees'],
    queryFn: async () => api.get('/users'),
    enabled: hasPermission('users:read') || isAdmin,
  });
  const { data: recentJobsRaw } = useQuery({
    queryKey: ['recent-jobs'],
    queryFn: async () => api.get('/jobs?limit=6&sort=desc'),
    enabled: hasPermission('jobs:read'),
  });
  const { data: branches } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => branchService.list(),
    enabled: isAdmin,
  });
  const { data: branchComparison } = useQuery({
    queryKey: ['branch-comparison'],
    queryFn: () => branchService.getComparison(),
    enabled: isAdmin,
  });

  // ── Derived Data ────────────────────────────────────────────────
  const employees = safeArray<any>(employeesResponse);
  const activeEmployees = employees.filter((u: any) => u?.is_active !== false).length;
  const totalEmployees = employees.length;
  const totalDrivers = employees.filter((u: any) => {
    const roles = [u?.role, ...(Array.isArray(u?.roles) ? u.roles : [])].filter(Boolean).map((r: string) => String(r).toLowerCase());
    return roles.includes('driver');
  }).length;

  const fleetUtilData: any[] = Array.isArray(fleetUtilizationRaw) ? fleetUtilizationRaw : [];
  const alertItems: any[] = Array.isArray(notifications) ? notifications : [];
  const recentJobs: any[] = safeArray(recentJobsRaw);
  const branchList = Array.isArray(branches) ? branches : [];

  // Merge overview + adminStats for unified KPI source
  const ov: any = { ...overview, ...adminStats };

  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  // Operational pipeline tiles
  const tripPipeline = [
    { label: 'Pending Jobs', count: ov?.pending_jobs ?? 0, color: 'bg-amber-50 text-amber-700 border border-amber-100', dot: 'bg-amber-400' },
    { label: 'Active Jobs', count: ov?.active_jobs ?? 0, color: 'bg-blue-50 text-blue-700 border border-blue-100', dot: 'bg-blue-500' },
    { label: 'Active Trips', count: ov?.active_trips ?? 0, color: 'bg-green-50 text-green-700 border border-green-100', dot: 'bg-green-500' },
    { label: 'Trips This Month', count: ov?.trips_completed_this_month ?? 0, color: 'bg-purple-50 text-purple-700 border border-purple-100', dot: 'bg-purple-500' },
    { label: 'Pending LRs', count: ov?.pending_lrs ?? 0, color: 'bg-orange-50 text-orange-700 border border-orange-100', dot: 'bg-orange-400' },
    { label: 'Overdue Invoices', count: ov?.overdue_invoices ?? 0, color: 'bg-red-50 text-red-700 border border-red-100', dot: 'bg-red-500' },
  ];

  // Fleet bar/pie data
  const fleetBarData = fleetUtilData.length > 0
    ? fleetUtilData.map((d: any) => ({ name: d.name ?? d.label, count: d.value, pct: d.percentage ?? 0 }))
    : [
        { name: 'Available', count: ov?.available_vehicles ?? (fleetStats as any)?.available ?? 0, pct: 0 },
        { name: 'On Trip', count: ov?.active_trips ?? 0, pct: 0 },
        { name: 'Maintenance', count: (fleetStats as any)?.maintenance ?? 0, pct: 0 },
      ];

  const jobStatusColor: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-blue-100 text-blue-700',
    IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
    COMPLETED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  // Module navigation grid
  const navModules = [
    { label: 'Clients', icon: <Users size={18} />, path: '/clients', color: 'bg-sky-50 text-sky-600', desc: `${ov?.total_clients ?? 0} records` },
    { label: 'Vehicles', icon: <Truck size={18} />, path: '/vehicles', color: 'bg-blue-50 text-blue-600', desc: `${ov?.total_vehicles ?? 0} total` },
    { label: 'Drivers', icon: <Navigation size={18} />, path: '/drivers', color: 'bg-indigo-50 text-indigo-600', desc: `${ov?.total_drivers ?? 0} total` },
    { label: 'Jobs', icon: <ClipboardList size={18} />, path: '/jobs', color: 'bg-orange-50 text-orange-600', desc: `${ov?.active_jobs ?? 0} active` },
    { label: 'Lorry Receipts', icon: <FileText size={18} />, path: '/lr', color: 'bg-green-50 text-green-600', desc: `${ov?.pending_lrs ?? 0} pending` },
    { label: 'Trips', icon: <MapPin size={18} />, path: '/trips', color: 'bg-teal-50 text-teal-600', desc: `${ov?.active_trips ?? 0} live` },
    { label: 'Fleet Mgmt', icon: <Wrench size={18} />, path: '/fleet', color: 'bg-purple-50 text-purple-600', desc: 'Maintenance & fuel' },
    { label: 'Compliance', icon: <ShieldCheck size={18} />, path: '/fleet/vehicle-compliance', color: 'bg-rose-50 text-rose-600', desc: 'RC, Permit, PUC' },
    { label: 'Finance', icon: <CircleDollarSign size={18} />, path: '/finance', color: 'bg-emerald-50 text-emerald-600', desc: 'Invoices & banking' },
    { label: 'Reports', icon: <BarChart3 size={18} />, path: '/reports', color: 'bg-violet-50 text-violet-600', desc: 'Analytics' },
    { label: 'Employees', icon: <Users size={18} />, path: '/admin/employees', color: 'bg-cyan-50 text-cyan-600', desc: `${activeEmployees}/${totalEmployees} active` },
    { label: 'Alerts', icon: <Bell size={18} />, path: '/alerts', color: 'bg-red-50 text-red-600', desc: `${alertItems.length} new` },
  ];

  return (
    <div className="space-y-6 pb-10">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Admin'} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          {isAdmin && branchList.length > 0 && (
            <button
              onClick={() => navigate('/admin/branches')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Building2 size={14} />
              {branchList.length} Branches
            </button>
          )}
        </div>
      </div>

      {/* ── Smart Suggestions ─────────────────────────────────────── */}
      <SmartSuggestions overview={overview} />

      {/* ── Top KPI Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Total Vehicles"
          value={ov?.total_vehicles || 0}
          icon={<Truck size={20} className="text-blue-600" />}
          change={`${ov?.available_vehicles || (fleetStats as any)?.available || 0} available`}
          changeType="up"
          color="bg-blue-50"
          onClick={() => navigate('/vehicles')}
        />
        <KPICard
          title="Active Trips"
          value={ov?.active_trips || 0}
          icon={<Navigation size={20} className="text-green-600" />}
          change={`${ov?.active_jobs || 0} active jobs`}
          changeType="up"
          color="bg-green-50"
          onClick={() => navigate('/trips')}
        />
        <KPICard
          title="Drivers"
          value={ov?.total_drivers || ov?.active_drivers || 0}
          icon={<Users size={20} className="text-indigo-600" />}
          change={`${totalDrivers || ov?.available_drivers || 0} available`}
          changeType="neutral"
          color="bg-indigo-50"
          onClick={() => navigate('/drivers')}
        />
        <KPICard
          title="Pending LRs"
          value={ov?.pending_lrs || 0}
          icon={<AlertTriangle size={20} className="text-amber-600" />}
          change={`${alertItems.length} alerts`}
          changeType={alertItems.length > 0 ? 'down' : 'neutral'}
          color="bg-amber-50"
          onClick={() => navigate('/lr')}
        />
      </div>

      {/* ── Finance KPI Row ───────────────────────────────────────── */}
      {hasPermission('finance:read') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPICard
            title="Monthly Revenue"
            value={fmt(ov?.monthly_revenue || (financeStats as any)?.monthly_revenue || 0)}
            icon={<DollarSign size={20} className="text-purple-600" />}
            change={`Collections: ${fmt(ov?.monthly_collections || 0)}`}
            changeType="up"
            color="bg-purple-50"
            onClick={() => navigate('/finance')}
          />
          <KPICard
            title="Receivables"
            value={fmt(ov?.pending_receivables || (financeStats as any)?.pending_receivables || 0)}
            icon={<TrendingUp size={20} className="text-emerald-600" />}
            color="bg-emerald-50"
            onClick={() => navigate('/finance')}
          />
          <KPICard
            title="Monthly Expenses"
            value={fmt(ov?.monthly_expenses || (financeStats as any)?.monthly_expenses || 0)}
            icon={<Wallet size={20} className="text-rose-600" />}
            change={`Profit: ${fmt(ov?.profit || (financeStats as any)?.profit || 0)}`}
            changeType={(ov?.profit || (financeStats as any)?.profit || 0) > 0 ? 'up' : 'down'}
            color="bg-rose-50"
            onClick={() => navigate('/finance')}
          />
          <KPICard
            title="Employees"
            value={`${activeEmployees}/${totalEmployees}`}
            icon={<Users size={20} className="text-cyan-600" />}
            change={`${totalDrivers} drivers`}
            changeType="neutral"
            color="bg-cyan-50"
            onClick={() => navigate('/admin/employees')}
          />
        </div>
      )}

      {/* ── Operational Pipeline + Fleet Status ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Pipeline counters + Recent Jobs */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Operational Pipeline</h3>
          <div className="grid grid-cols-3 gap-3">
            {tripPipeline.map((s) => (
              <div
                key={s.label}
                className={`rounded-xl p-4 flex flex-col gap-1 cursor-pointer hover:opacity-80 transition-opacity ${s.color}`}
                onClick={() => navigate('/jobs')}
              >
                <span className="text-2xl font-bold">{s.count}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                  <span className="text-xs font-medium">{s.label}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Jobs mini-table */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Recent Jobs</h4>
              <button onClick={() => navigate('/jobs')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                View all <ChevronRight size={11} />
              </button>
            </div>
            <div className="space-y-1">
              {recentJobs.slice(0, 5).map((job: any) => (
                <div
                  key={job.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <span className="text-xs font-mono text-gray-400 w-6">#{job.id}</span>
                  <span className="flex-1 text-sm text-gray-700 truncate group-hover:text-blue-700">{job.client_name || job.client || '—'}</span>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${jobStatusColor[job.status] || 'bg-gray-100 text-gray-600'}`}>
                    {(job.status || '').replace(/_/g, ' ')}
                  </span>
                  <ArrowRight size={12} className="text-gray-300 group-hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all" />
                </div>
              ))}
              {recentJobs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No jobs found</p>
              )}
            </div>
          </div>
        </div>

        {/* Fleet Status Donut + Bar */}
        <div className="card flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Fleet Status</h3>
            <button onClick={() => navigate('/vehicles')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              View all <ChevronRight size={11} />
            </button>
          </div>

          <ResponsiveContainer width="100%" height={170}>
            <PieChart>
              <Pie
                data={fleetBarData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={72}
                innerRadius={45}
                paddingAngle={3}
                strokeWidth={0}
              >
                {fleetBarData.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any, n: any) => [`${v} vehicles`, n]}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="space-y-2 mt-2">
            {fleetBarData.map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-gray-600">{item.name}</span>
                <span className="ml-auto font-semibold text-gray-900">{item.count}</span>
                {item.pct > 0 && <span className="text-xs text-gray-400">{Number(item.pct).toFixed(0)}%</span>}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-50 flex-1">
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={fleetBarData} barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: any) => [`${v} vehicles`]}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', fontSize: 11 }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {fleetBarData.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Module Navigation Grid ────────────────────────────────── */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Navigation</h3>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {navModules.map((m) => (
            <button
              key={m.label}
              onClick={() => navigate(m.path)}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all group text-center"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.color} group-hover:scale-110 transition-transform`}>
                {m.icon}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-700 group-hover:text-blue-700 transition-colors leading-tight">{m.label}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Alerts + Finance/Branch ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Alerts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Recent Alerts</h3>
              {alertItems.length > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">{alertItems.length}</span>
              )}
            </div>
            <button onClick={() => navigate('/alerts')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
              View all <ChevronRight size={11} />
            </button>
          </div>
          <div className="space-y-1">
            {alertItems.slice(0, 6).map((n: any, i: number) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  n.type === 'critical' ? 'bg-red-50 text-red-500' :
                  n.type === 'warning' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-500'
                }`}>
                  <Activity size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 font-medium truncate group-hover:text-blue-700">{n.title || n.message}</p>
                  {n.message && n.title && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{n.message}</p>}
                </div>
              </div>
            ))}
            {alertItems.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-5">No alerts — all clear!</p>
            )}
          </div>
        </div>

        {/* Branch Comparison (admin) or Finance Summary */}
        {isAdmin && Array.isArray(branchComparison) && branchComparison.length > 0 ? (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Branch Comparison</h3>
              </div>
              <button onClick={() => navigate('/admin/branches')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                Manage <ChevronRight size={11} />
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-medium text-gray-500">Branch</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Vehicles</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Drivers</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Revenue</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-gray-500">Collection</th>
                  </tr>
                </thead>
                <tbody>
                  {(branchComparison as any[]).slice(0, 6).map((b: any) => {
                    const collectPct = b.revenue > 0 ? Math.round((b.collected / b.revenue) * 100) : 0;
                    return (
                      <tr
                        key={b.branch_id}
                        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => navigate(`/admin/branches/${b.branch_id}`)}
                      >
                        <td className="py-2 px-2 font-medium text-gray-800">{b.branch_name}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{b.vehicles}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{b.drivers}</td>
                        <td className="py-2 px-2 text-right font-medium text-gray-800">{fmt(b.revenue)}</td>
                        <td className="py-2 px-2 text-right">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                            collectPct >= 75 ? 'bg-green-100 text-green-700' :
                            collectPct >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                          }`}>{collectPct}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : hasPermission('finance:read') ? (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Finance Summary</h3>
              <button onClick={() => navigate('/finance')} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                Finance Hub <ChevronRight size={11} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Monthly Revenue', value: fmt(ov?.monthly_revenue || 0), color: 'text-green-600', bg: 'bg-green-50', icon: <TrendingUp size={14} /> },
                { label: 'Collections', value: fmt(ov?.monthly_collections || 0), color: 'text-blue-600', bg: 'bg-blue-50', icon: <CircleDollarSign size={14} /> },
                { label: 'Pending Receivables', value: fmt(ov?.pending_receivables || 0), color: 'text-amber-600', bg: 'bg-amber-50', icon: <AlertTriangle size={14} /> },
                { label: 'Monthly Expenses', value: fmt(ov?.monthly_expenses || 0), color: 'text-red-600', bg: 'bg-red-50', icon: <Wallet size={14} /> },
                { label: 'Net Profit', value: fmt(ov?.profit || 0), color: (ov?.profit || 0) >= 0 ? 'text-green-700' : 'text-red-600', bg: (ov?.profit || 0) >= 0 ? 'bg-green-50' : 'bg-red-50', icon: <BarChart3 size={14} /> },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${row.bg} ${row.color}`}>{row.icon}</div>
                  <span className="flex-1 text-sm text-gray-600">{row.label}</span>
                  <span className={`text-sm font-bold ${row.color}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

    </div>
  );
}
