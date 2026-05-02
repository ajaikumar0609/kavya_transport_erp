import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Shield, AlertTriangle, TrendingUp, TrendingDown, Truck,
  Receipt, Users, Wrench, Clock, MapPin, Fuel, ArrowRight,
  CheckCircle, XCircle, Activity,
} from 'lucide-react';
import { auditorService } from '../../services/dataService';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';

const today = new Date();
const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const todayStr = today.toISOString().slice(0, 10);

interface Period { from: string; to: string }

const fmt = (n: number) =>
  n >= 1_00_00_000 ? `₹${(n / 1_00_00_000).toFixed(2)}Cr`
  : n >= 1_00_000 ? `₹${(n / 1_00_000).toFixed(2)}L`
  : `₹${n.toLocaleString('en-IN')}`;

const RiskBadge = ({ level }: { level: string }) => {
  const cfg: Record<string, string> = {
    LOW: 'bg-green-100 text-green-700 border-green-200',
    MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    HIGH: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold border ${cfg[level] ?? cfg.LOW}`}>
      {level} RISK
    </span>
  );
};

const KpiCard = ({
  label, value, sub, icon: Icon, color, to,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; to?: string;
}) => {
  const inner = (
    <div className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${to ? 'cursor-pointer' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon size={20} />
        </div>
        {to && <ArrowRight size={16} className="text-gray-400 mt-1" />}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-600 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
};

const ExceptionRow = ({
  icon: Icon, label, value, severity,
}: { icon: React.ElementType; label: string; value: number; severity: 'ok' | 'warn' | 'danger' }) => {
  const dot = severity === 'ok' ? 'bg-green-400' : severity === 'warn' ? 'bg-yellow-400' : 'bg-red-500';
  return (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <Icon size={15} className="text-gray-500" />
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      <span className={`text-sm font-bold ${value === 0 ? 'text-green-600' : severity === 'danger' ? 'text-red-600' : 'text-yellow-600'}`}>
        {value}
      </span>
    </div>
  );
};

export default function AuditorDashboardPage() {
  const [from, setFrom] = useState(thisMonthStart);
  const [to, setTo] = useState(todayStr);

  const { data, isLoading, error } = useQuery({
    queryKey: ['auditor-dashboard', from, to],
    queryFn: () => auditorService.getDashboard({ from_date: from, to_date: to }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load audit dashboard. Please try again.
      </div>
    );
  }

  const { risk_score, risk_level, kpis, exceptions, monthly_trend } = data;

  const riskColor =
    risk_level === 'HIGH' ? 'text-red-600' : risk_level === 'MEDIUM' ? 'text-yellow-600' : 'text-green-600';
  const riskBg =
    risk_level === 'HIGH' ? 'bg-red-50 border-red-200' : risk_level === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200';

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 rounded-xl">
            <Shield className="text-indigo-600" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Dashboard</h1>
            <p className="text-sm text-gray-500">Operational risk overview & exception monitoring</p>
          </div>
        </div>
        {/* Date range */}
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>

      {/* Risk Score Banner */}
      <div className={`rounded-xl border p-5 ${riskBg} flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div className="flex items-center gap-4">
          <div className={`text-5xl font-black ${riskColor}`}>{risk_score}</div>
          <div>
            <div className="text-sm text-gray-500 font-medium">Composite Risk Score</div>
            <RiskBadge level={risk_level} />
            <div className="text-xs text-gray-400 mt-1">
              Based on trip delays, empty runs, expense anomalies, overdue receivables
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-bold text-gray-900">{kpis.total_trips}</div>
            <div className="text-xs text-gray-500">Total Trips</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{fmt(kpis.total_revenue)}</div>
            <div className="text-xs text-gray-500">Revenue</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{fmt(kpis.total_expense)}</div>
            <div className="text-xs text-gray-500">Expenses</div>
          </div>
          <div>
            <div className={`text-lg font-bold ${kpis.net_profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {kpis.net_profit >= 0 ? '+' : ''}{fmt(kpis.net_profit)}
            </div>
            <div className="text-xs text-gray-500">Net P&L</div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Delayed Trips" value={exceptions.delayed_trips} icon={Clock}
          color="bg-orange-100 text-orange-600" to="/auditor/trips?flag=delayed"
          sub={`~${exceptions.avg_delay_minutes}m avg`} />
        <KpiCard label="Route Deviations" value={exceptions.deviated_trips} icon={MapPin}
          color="bg-yellow-100 text-yellow-600" to="/auditor/trips?flag=deviated" />
        <KpiCard label="Empty Runs" value={exceptions.empty_runs} icon={Truck}
          color="bg-red-100 text-red-600" to="/auditor/trips?flag=empty_run" />
        <KpiCard label="Flagged Expenses" value={exceptions.flagged_expenses} icon={AlertTriangle}
          color="bg-rose-100 text-rose-600" to="/auditor/expenses?flag=anomaly" />
        <KpiCard label="No Receipt" value={exceptions.no_receipt_expenses} icon={Receipt}
          color="bg-purple-100 text-purple-600" to="/auditor/expenses?flag=no_receipt" />
        <KpiCard label="Overdue Invoices" value={fmt(exceptions.overdue_invoices_amount)} icon={Users}
          color="bg-blue-100 text-blue-600" to="/auditor/clients" />
      </div>

      {/* 2-col layout: Exceptions + Vehicle Compliance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Exception Summary */}
        <div className="lg:col-span-2 bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Activity size={18} className="text-indigo-500" /> Exception Summary
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Operations</div>
              <ExceptionRow icon={Clock} label="Delayed trips" value={exceptions.delayed_trips}
                severity={exceptions.delayed_trips === 0 ? 'ok' : exceptions.delayed_trips > 5 ? 'danger' : 'warn'} />
              <ExceptionRow icon={MapPin} label="Route deviations" value={exceptions.deviated_trips}
                severity={exceptions.deviated_trips === 0 ? 'ok' : 'warn'} />
              <ExceptionRow icon={Truck} label="Empty runs" value={exceptions.empty_runs}
                severity={exceptions.empty_runs === 0 ? 'ok' : exceptions.empty_runs > 3 ? 'danger' : 'warn'} />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Finance</div>
              <ExceptionRow icon={AlertTriangle} label="Anomaly-flagged expenses" value={exceptions.flagged_expenses}
                severity={exceptions.flagged_expenses === 0 ? 'ok' : 'danger'} />
              <ExceptionRow icon={Receipt} label="Expenses without receipt" value={exceptions.no_receipt_expenses}
                severity={exceptions.no_receipt_expenses === 0 ? 'ok' : 'warn'} />
              <ExceptionRow icon={XCircle} label="Disputed invoices" value={exceptions.disputed_invoices}
                severity={exceptions.disputed_invoices === 0 ? 'ok' : 'danger'} />
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Compliance</div>
              <ExceptionRow icon={Wrench} label="Vehicles: docs overdue" value={exceptions.vehicles_docs_overdue}
                severity={exceptions.vehicles_docs_overdue === 0 ? 'ok' : 'danger'} />
              <ExceptionRow icon={CheckCircle} label="Service overdue" value={exceptions.service_overdue}
                severity={exceptions.service_overdue === 0 ? 'ok' : 'warn'} />
            </div>
          </div>
        </div>

        {/* Quick Nav */}
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Audit Modules</h2>
          <div className="space-y-2">
            {[
              { to: '/auditor/trips', icon: Truck, label: 'Trip Audit', desc: 'Delay · Deviation · Empty Run' },
              { to: '/auditor/lr-profitability', icon: TrendingUp, label: 'LR Profitability', desc: 'Per-LR margin analysis' },
              { to: '/auditor/fuel', icon: Fuel, label: 'Fuel Efficiency', desc: 'Mileage vs benchmark' },
              { to: '/auditor/expenses', icon: Receipt, label: 'Expense Audit', desc: 'Anomaly & receipt check' },
              { to: '/auditor/clients', icon: Users, label: 'Client Risk', desc: 'Overdue aging & risk scores' },
              { to: '/auditor/maintenance', icon: Wrench, label: 'Maintenance Audit', desc: 'Tyre & service health' },
              { to: '/auditor/payment-proofs', icon: CheckCircle, label: 'Payment Proofs', desc: 'Invoice proof review' },
            ].map(({ to, icon: Icon, label, desc }) => (
              <Link key={to} to={to}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-indigo-50 transition-colors group">
                <div className="p-1.5 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                  <Icon size={16} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </div>
                <ArrowRight size={14} className="text-gray-300 group-hover:text-indigo-400 transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      {monthly_trend && monthly_trend.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-indigo-500" /> 6-Month Revenue vs Expense Trend
          </h2>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly_trend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f43f5e" fill="url(#expGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* P&L Bar */}
      {monthly_trend && monthly_trend.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={18} className="text-indigo-500" /> Monthly Profit / Loss
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthly_trend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `₹${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Bar dataKey="profit" name="Profit / Loss"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                // Negative bars show as red
                label={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
