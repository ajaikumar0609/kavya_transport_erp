/**
 * Unified Fleet Tracking — premium white theme
 * Tabs: Live Tracking · Fleet Map · Trip Replay · Alerts
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────

interface UnifiedVehicle {
  id: number;
  registration_number: string;
  make: string | null;
  model: string | null;
  vehicle_type: string;
  gps_provider: string;
  gps_provider_name: string;
  gps_provider_status: string;
  provider_live: boolean;
  lat: number | null;
  lng: number | null;
  speed: number;
  heading: number;
  odometer: number;
  ignition_on: boolean;
  engine_on: boolean;
  fuel_level: number | null;
  battery_voltage: number | null;
  status: string;
  last_update: string | null;
  minutes_since_update: number | null;
  trip_id: number | null;
  trip_number: string | null;
  driver_name: string | null;
  route: string | null;
  origin: string | null;
  destination: string | null;
  trip_status: string | null;
}

interface ProviderStatus {
  id: string;
  name: string;
  status: string;
  enabled: boolean;
  vehicle_count: number;
  last_poll_at: string | null;
  last_poll_status: string | null;
  error_message: string | null;
}

interface Summary {
  total: number;
  moving: number;
  stopped: number;
  idle: number;
  offline: number;
  no_gps: number;
}

interface UnifiedResponse {
  vehicles: UnifiedVehicle[];
  providers: ProviderStatus[];
  summary: Summary;
}

// ── Design tokens ────────────────────────────────────────────────

const S: Record<string, { bg: string; border: string; text: string; dot: string; fill: string }> = {
  moving:   { bg:'#f0fdf4', border:'#bbf7d0', text:'#16a34a', dot:'#22c55e', fill:'#22c55e' },
  idle:     { bg:'#fffbeb', border:'#fde68a', text:'#d97706', dot:'#f59e0b', fill:'#f59e0b' },
  stopped:  { bg:'#fff1f2', border:'#fecdd3', text:'#e11d48', dot:'#f43f5e', fill:'#f43f5e' },
  offline:  { bg:'#f8fafc', border:'#e2e8f0', text:'#64748b', dot:'#94a3b8', fill:'#94a3b8' },
  'no-gps': { bg:'#faf5ff', border:'#e9d5ff', text:'#9333ea', dot:'#a855f7', fill:'#a855f7' },
};

const P: Record<string, { bg: string; border: string; text: string; label: string }> = {
  ialert:      { bg:'#f0fdf4', border:'#bbf7d0', text:'#16a34a', label:'iALERT'    },
  tata_gps:    { bg:'#eff6ff', border:'#bfdbfe', text:'#2563eb', label:'Tata GPS'  },
  third_party: { bg:'#faf5ff', border:'#e9d5ff', text:'#9333ea', label:'3rd-Party' },
  none:        { bg:'#f8fafc', border:'#e2e8f0', text:'#64748b', label:'None'      },
};

const STATUS_LABEL: Record<string, string> = {
  moving:'Moving', idle:'Idle', stopped:'Stopped', offline:'Offline', 'no-gps':'No GPS',
};

// ── Marker builder ────────────────────────────────────────────────

function mkMarker(v: UnifiedVehicle): L.DivIcon {
  const s = S[v.status] ?? S.offline;
  const ring = v.provider_live ? '#22c55e' : '#f59e0b';
  const pulse = v.status === 'moving'
    ? `<circle cx="16" cy="16" r="14" fill="${s.fill}" opacity=".12"><animate attributeName="r" from="10" to="20" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" from=".2" to="0" dur="1.8s" repeatCount="indefinite"/></circle>` : '';
  const spd = v.status === 'moving' && v.speed > 0
    ? `<text x="16" y="20" text-anchor="middle" font-family="Inter,sans-serif" font-size="7" font-weight="700" fill="white">${Math.round(v.speed)}</text>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40">${pulse}<circle cx="16" cy="16" r="14" fill="white" stroke="${ring}" stroke-width="2.5"/><circle cx="16" cy="16" r="9" fill="${s.fill}"/>${spd}<polygon points="12,30 16,40 20,30" fill="${s.fill}" opacity=".7"/></svg>`;
  return L.divIcon({ className:'', html:svg, iconSize:[32,40], iconAnchor:[16,38] });
}

// ── Map fly helper ────────────────────────────────────────────────

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], 13, { animate:true, duration:0.9 }); }, [lat, lng, map]);
  return null;
}

// ── API helpers ───────────────────────────────────────────────────

const unwrap = (d: any) => d?.data ?? d;
async function fetchUnified(p?: Record<string,string>): Promise<UnifiedResponse> {
  return unwrap(await api.get('/tracking/unified/vehicles', { params: p }));
}
async function fetchPath(vehicleId: string, hours = 24) {
  return unwrap(await api.get(`/tracking/gps/path/${vehicleId}`, { params:{ hours } }));
}
async function fetchAlerts() {
  return unwrap(await api.get('/tracking/alerts'));
}

// ══════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ══════════════════════════════════════════════════════════════════════

export default function UnifiedTrackingPage() {
  const [tab, setTab]                   = useState<'live'|'fleet'|'replay'|'alerts'>('live');
  const [statusFilter, setStatusFilter] = useState<string|null>(null);
  const [provFilter, setProvFilter]     = useState<string|null>(null);
  const [search, setSearch]             = useState('');
  const [selected, setSelected]         = useState<UnifiedVehicle|null>(null);
  const [flyTo, setFlyTo]               = useState<{lat:number;lng:number}|null>(null);
  const [rightTab, setRightTab]         = useState<'detail'|'timeline'|'alerts'>('detail');
  const [syncTime, setSyncTime]         = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const t = setInterval(() => setSyncTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: unified, refetch, isFetching } = useQuery({
    queryKey: ['unified', statusFilter, provFilter, search],
    queryFn: () => {
      const p: Record<string,string> = {};
      if (statusFilter) p.status   = statusFilter;
      if (provFilter)   p.provider = provFilter;
      if (search)       p.search   = search;
      return fetchUnified(p);
    },
    refetchInterval: tab === 'live' ? 15000 : tab === 'fleet' ? 10000 : false,
  });

  const { data: alertsRaw } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 60000,
  });

  const vehicles  = unified?.vehicles  ?? [];
  const providers = unified?.providers ?? [];
  const sum       = unified?.summary   ?? { total:0, moving:0, stopped:0, idle:0, offline:0, no_gps:0 };
  const alerts    = Array.isArray(alertsRaw) ? alertsRaw : [];
  const pending   = providers.filter(p => p.status !== 'active');
  const activeRate = sum.total > 0 ? Math.round(((sum.moving + sum.idle) / sum.total) * 100) : 0;
  const withGps   = useMemo(() => vehicles.filter(v => v.lat && v.lng), [vehicles]);

  const [selectedPath, setSelectedPath] = useState<[number,number][]>([]);

  const pick = useCallback((v: UnifiedVehicle) => {
    setSelected(v);
    setRightTab('detail');
    if (v.lat && v.lng) setFlyTo({ lat: v.lat, lng: v.lng });
    // Load GPS trail — show past path on map when truck is tapped
    setSelectedPath([]);
    fetchPath(String(v.id), 24)
      .then((data: any) => {
        const pts: [number,number][] = (data?.points ?? []).map((p: any) => [p.lat as number, p.lng as number]);
        setSelectedPath(pts);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="flex flex-col bg-gray-50"
      style={{ height:'calc(100vh - 64px)', marginTop:'-24px', marginLeft:'-24px', marginRight:'-24px', fontSize:13 }}
    >
      {/* ── PENDING BANNER ── */}
      {pending.length > 0 && (
        <div className="flex items-center gap-2.5 px-5 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] flex-shrink-0">
          <span className="flex h-2 w-2 relative flex-shrink-0">
            <span className="animate-ping absolute h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span>
            <strong>{pending.length} GPS provider{pending.length>1?'s':''} awaiting API keys:</strong>{' '}
            {pending.map(p=>p.name).join(' · ')} — showing last known positions.
          </span>
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div className="flex items-center gap-3 px-5 bg-white border-b border-gray-200 flex-shrink-0 z-50" style={{ height:52 }}>
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.8"/>
              <circle cx="10" cy="10" r="3" fill="white"/>
              <line x1="10" y1="1" x2="10" y2="4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="10" y1="16" x2="10" y2="19" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="1" y1="10" x2="4" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
              <line x1="16" y1="10" x2="19" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-black text-gray-900 text-[14px] tracking-tight">
            Fleet<span className="text-blue-600">Pulse</span>
          </span>
        </div>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Tabs */}
        <nav className="flex gap-px bg-gray-100 rounded-xl p-1 flex-shrink-0">
          {([
            { id:'live',   icon:'📍', label:'Live Tracking' },
            { id:'fleet',  icon:'🗺',  label:'Fleet Map'    },
            { id:'replay', icon:'⏮',  label:'Trip Replay'  },
            { id:'alerts', icon:'🔔', label:'Alerts'       },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-white/60'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {t.id === 'alerts' && alerts.length > 0 && (
                <span className="ml-0.5 px-1.5 py-px text-[9px] font-black rounded-full bg-red-50 text-red-600 ring-1 ring-red-200">
                  {alerts.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Provider pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap flex-shrink-0">GPS</span>
          {providers.map(prov => {
            const isActive = prov.status === 'active';
            const ps = P[prov.id] ?? P.none;
            const isFiltered = provFilter === prov.id;
            return (
              <button key={prov.id} onClick={() => setProvFilter(isFiltered ? null : prov.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border flex-shrink-0 transition-all ${
                  isFiltered ? 'ring-2 ring-offset-1 ring-blue-400 shadow-sm' : ''
                }`}
                style={{ color:ps.text, background:ps.bg, borderColor:ps.border }}
              >
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  {isActive && <span className="animate-ping absolute h-full w-full rounded-full opacity-50" style={{ background:ps.text }} />}
                  <span className="relative rounded-full h-2 w-2 inline-flex" style={{ background:ps.text }} />
                </span>
                {ps.label}
                <span className="font-black">{prov.vehicle_count}</span>
                {!isActive && <span className="text-[9px] opacity-50 ml-0.5">⏳</span>}
              </button>
            );
          })}
        </div>

        {/* Sync status */}
        <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            {isFetching
              ? <span className="w-3 h-3 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
              : <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            }
            <span className="hidden sm:inline">{syncTime}</span>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-blue-600 transition-all">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M14 8A6 6 0 1 1 8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8 0v4l3-2-3-2z" fill="currentColor"/>
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI STRIP ── */}
      <div className="flex bg-white border-b border-gray-200 flex-shrink-0 overflow-x-auto">
        {[
          { key:null,       val:sum.total,   label:'Total Fleet',  sub:`${providers.length} providers`,  color:'#2563eb', light:'#eff6ff', icon:'🚛' },
          { key:'moving',   val:sum.moving,  label:'Moving',       sub:'on active trips',                color:'#16a34a', light:'#f0fdf4', icon:'🟢' },
          { key:'idle',     val:sum.idle,    label:'Idle',         sub:'engine running',                 color:'#d97706', light:'#fffbeb', icon:'🟡' },
          { key:'stopped',  val:sum.stopped, label:'Stopped',      sub:'> 30 minutes',                  color:'#e11d48', light:'#fff1f2', icon:'🔴' },
          { key:'offline',  val:sum.offline, label:'Offline',      sub:'> 2 hrs silent',                color:'#64748b', light:'#f8fafc', icon:'⚫' },
          { key:'no-gps',   val:sum.no_gps,  label:'No GPS',       sub:'key pending',                   color:'#9333ea', light:'#faf5ff', icon:'🟣' },
        ].map(k => (
          <button key={k.label}
            onClick={() => setStatusFilter(statusFilter === k.key ? null : k.key)}
            className={`flex-1 min-w-[110px] px-4 py-3 flex flex-col gap-0.5 border-r border-gray-100 transition-all cursor-pointer text-left ${
              statusFilter === k.key ? 'ring-inset ring-2 ring-blue-500' : 'hover:bg-gray-50'
            }`}
            style={ statusFilter === k.key ? { background:k.light } : {} }
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black leading-none tabular-nums" style={{ color:k.color }}>{k.val}</span>
            </div>
            <div className="text-[11px] font-bold text-gray-700 mt-0.5">{k.label}</div>
            <div className="text-[10px] text-gray-400">{k.sub}</div>
            <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{
                background: k.color,
                width: sum.total > 0 ? `${(k.val / sum.total)*100}%` : '0%',
                opacity: 0.6,
              }} />
            </div>
          </button>
        ))}
        <div className="flex-1 min-w-[110px] px-4 py-3 flex flex-col gap-0.5 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 border-r border-gray-100">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black leading-none tabular-nums text-blue-600">{activeRate}%</span>
          </div>
          <div className="text-[11px] font-bold text-gray-700 mt-0.5">Active Rate</div>
          <div className="text-[10px] text-gray-400">moving + idle</div>
          <div className="mt-1.5 h-1 rounded-full bg-blue-100 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500" style={{ width:`${activeRate}%` }} />
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      {tab === 'live'   && <LiveView    vehicles={vehicles} withGps={withGps} selected={selected} onSelect={pick} search={search} onSearch={setSearch} flyTo={flyTo} rightTab={rightTab} onRightTab={setRightTab} alerts={alerts} selectedPath={selectedPath} />}
      {tab === 'fleet'  && <FleetView   vehicles={withGps} onSelect={pick} selectedPath={selectedPath} />}
      {tab === 'replay' && <ReplayView  vehicles={vehicles} />}
      {tab === 'alerts' && <AlertsView  alerts={alerts} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LIVE TRACKING VIEW
// ══════════════════════════════════════════════════════════════════════

function LiveView({
  vehicles, withGps, selected, onSelect, search, onSearch,
  flyTo, rightTab, onRightTab, alerts, selectedPath,
}: {
  vehicles: UnifiedVehicle[]; withGps: UnifiedVehicle[];
  selected: UnifiedVehicle|null; onSelect: (v:UnifiedVehicle)=>void;
  search: string; onSearch: (s:string)=>void;
  flyTo: {lat:number;lng:number}|null;
  rightTab: string; onRightTab: (t:'detail'|'timeline'|'alerts')=>void;
  alerts: any[];
  selectedPath: [number,number][];
}) {
  return (
    <div className="flex flex-1 overflow-hidden">

      {/* LEFT: vehicle list */}
      <div className="w-[296px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input type="text" placeholder="Search vehicle, driver, route…"
              value={search} onChange={e => onSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth:'thin', scrollbarColor:'#e2e8f0 transparent' }}>
          {vehicles.map(v => (
            <VehicleCard key={v.id} v={v} selected={selected?.id === v.id} onClick={() => onSelect(v)} />
          ))}
          {vehicles.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
              <div className="text-4xl opacity-40">🔍</div>
              <div className="text-xs font-semibold text-gray-500">No vehicles match</div>
            </div>
          )}
        </div>

        <div className="px-3.5 py-2 border-t border-gray-100 bg-gray-50 flex justify-between items-center text-[10px] text-gray-400 flex-shrink-0">
          <span className="font-bold text-gray-600">{vehicles.length} vehicles</span>
          <span>⟳ auto 15s</span>
        </div>
      </div>

      {/* CENTER: map */}
      <div className="flex-1 relative overflow-hidden">
        <MapContainer center={[10.5, 78.5]} zoom={7} zoomControl={false} attributionControl={false}
          style={{ width:'100%', height:'100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
          {flyTo && <FlyTo lat={flyTo.lat} lng={flyTo.lng} />}

          {/* GPS trail for selected vehicle — tap any truck to load its past path */}
          {selectedPath.length > 1 && (
            <>
              <Polyline positions={selectedPath}
                pathOptions={{ color:'#93c5fd', weight:3.5, opacity:0.6, dashArray:'8,5' }} />
              <CircleMarker center={selectedPath[0]} radius={7}
                pathOptions={{ color:'#15803d', fillColor:'#22c55e', fillOpacity:1, weight:2 }}>
                <Popup><span style={{ fontFamily:'Inter,sans-serif', fontWeight:700, fontSize:11 }}>🟢 Trip Start</span></Popup>
              </CircleMarker>
              <CircleMarker center={selectedPath[selectedPath.length-1]} radius={7}
                pathOptions={{ color:'#1d4ed8', fillColor:'#3b82f6', fillOpacity:1, weight:2 }}>
                <Popup><span style={{ fontFamily:'Inter,sans-serif', fontWeight:700, fontSize:11 }}>📍 Last Known Position</span></Popup>
              </CircleMarker>
            </>
          )}

          {withGps.map(v => (
            <Marker key={v.id} position={[v.lat!, v.lng!]} icon={mkMarker(v)} eventHandlers={{ click: () => onSelect(v) }}>
              <Popup>
                <div style={{ minWidth:190, fontFamily:'Inter,sans-serif', padding:'2px 0' }}>
                  <div style={{ fontWeight:900, fontSize:15, marginBottom:2, color:'#0f172a' }}>{v.registration_number}</div>
                  {v.driver_name && <div style={{ color:'#64748b', fontSize:11, marginBottom:6 }}>👤 {v.driver_name}</div>}
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    <span style={{
                      background: S[v.status]?.bg ?? '#f8fafc',
                      color: S[v.status]?.text ?? '#64748b',
                      border: `1px solid ${S[v.status]?.border ?? '#e2e8f0'}`,
                      borderRadius:99, padding:'2px 8px', fontSize:10, fontWeight:700,
                    }}>{STATUS_LABEL[v.status] ?? v.status}</span>
                    {v.speed > 0 && (
                      <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:99, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
                        {Math.round(v.speed)} km/h
                      </span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Legend overlay */}
        <div className="absolute bottom-4 left-4 z-[1000]">
          <div className="bg-white/96 backdrop-blur-sm border border-gray-200 rounded-2xl px-3.5 py-3 shadow-xl shadow-gray-200/60" style={{ minWidth:158 }}>
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Status</div>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 py-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: S[key]?.dot ?? '#94a3b8' }} />
                <span className="text-[11px] text-gray-600 font-medium">{label}</span>
              </div>
            ))}
            <div className="my-2 border-t border-gray-100" />
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Provider ring</div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-green-500 flex-shrink-0" />
              <span className="text-[11px] text-gray-600">Live API</span>
            </div>
            <div className="flex items-center gap-2 py-0.5">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-400 flex-shrink-0" />
              <span className="text-[11px] text-gray-600">Pending</span>
            </div>
          </div>
        </div>

        {/* GPS count badge */}
        <div className="absolute top-3 right-3 z-[1000]">
          <div className="bg-white/96 backdrop-blur-sm border border-gray-200 rounded-xl px-3 py-1.5 shadow text-[11px] text-gray-600 font-semibold">
            {withGps.length} on map
          </div>
        </div>

        {/* Selected vehicle quick-info bar */}
        {selected && (
          <div className="absolute bottom-4 right-4 z-[1000] max-w-xs">
            <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-xl shadow-gray-200/60">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-black text-gray-900 text-[13px]">{selected.registration_number}</span>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: S[selected.status]?.dot }} />
                <span className="text-[10px] font-bold" style={{ color: S[selected.status]?.text }}>
                  {STATUS_LABEL[selected.status]}
                </span>
              </div>
              {selected.driver_name && <div className="text-[11px] text-gray-500">👤 {selected.driver_name}</div>}
              {selected.route && <div className="text-[11px] text-gray-500 truncate mt-0.5">📦 {selected.route}</div>}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT: detail panel */}
      <div className="w-[274px] flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
        <div className="flex border-b border-gray-100 flex-shrink-0">
          {(['detail','timeline','alerts'] as const).map(t => (
            <button key={t} onClick={() => onRightTab(t)}
              className={`flex-1 py-2.5 text-center text-[11px] font-bold border-b-2 transition-all ${
                rightTab === t ? 'text-blue-600 border-blue-500 bg-blue-50/40' : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'detail' ? '📋 Info' : t === 'timeline' ? '🕐 Timeline' : '🔔 Alerts'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth:'thin', scrollbarColor:'#e2e8f0 transparent' }}>
          {rightTab === 'detail'   && <DetailPanel v={selected} />}
          {rightTab === 'timeline' && <TimelinePanel v={selected} />}
          {rightTab === 'alerts'   && <VehicleAlertsPanel v={selected} alerts={alerts} />}
        </div>
      </div>
    </div>
  );
}

// ── Vehicle card ──────────────────────────────────────────────────────

function VehicleCard({ v, selected, onClick }: { v: UnifiedVehicle; selected: boolean; onClick: ()=>void }) {
  const s = S[v.status] ?? S.offline;
  const p = P[v.gps_provider] ?? P.none;
  return (
    <div onClick={onClick}
      className={`px-3.5 py-3 border-b border-gray-100 cursor-pointer transition-all ${
        selected
          ? 'bg-blue-50 border-l-[3px] border-l-blue-500 shadow-sm'
          : 'border-l-[3px] border-l-transparent hover:bg-gray-50/80'
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[13px] font-extrabold leading-none flex-1 truncate ${selected ? 'text-blue-700' : 'text-gray-900'}`}>
          {v.registration_number}
        </span>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border tracking-wider uppercase flex-shrink-0"
          style={{ color:p.text, background:p.bg, borderColor:p.border }}>
          {p.label}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-bold flex-shrink-0" style={{ color:s.text }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background:s.dot }} />
          {STATUS_LABEL[v.status]}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 truncate mb-1.5">
        {v.route || (v.lat ? `${v.lat.toFixed(3)}, ${v.lng?.toFixed(3)}` : 'No location')}
        {v.speed > 0 && <span className="ml-2 font-bold text-gray-800">{Math.round(v.speed)} km/h</span>}
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        {v.driver_name && <span className="text-gray-400 truncate max-w-[90px]">👤 {v.driver_name}</span>}
        {v.fuel_level != null && (
          <span style={{ color: v.fuel_level < 25 ? '#e11d48' : v.fuel_level < 50 ? '#d97706' : '#16a34a', fontWeight:600 }}>
            ⛽ {v.fuel_level}%
          </span>
        )}
        <span className={`font-semibold ${
          v.minutes_since_update == null || v.minutes_since_update <= 2 ? 'text-green-600' : 'text-amber-600'
        }`}>
          {v.minutes_since_update == null || v.minutes_since_update <= 2
            ? '● Live'
            : `○ ${Math.round(v.minutes_since_update)}m ago`
          }
        </span>
      </div>
      {v.trip_id && (
        <div className="mt-2 h-1 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ width:'45%' }} />
        </div>
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────

function DetailPanel({ v }: { v: UnifiedVehicle|null }) {
  if (!v) return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl shadow-inner">🚛</div>
      <div>
        <div className="font-bold text-gray-700 text-sm mb-1">No vehicle selected</div>
        <div className="text-[11px] text-gray-400 leading-relaxed">Click a vehicle in the list<br/>or tap a map marker</div>
      </div>
    </div>
  );

  const s = S[v.status] ?? S.offline;
  const p = P[v.gps_provider] ?? P.none;

  return (
    <div>
      {/* Hero header card */}
      <div className="rounded-2xl p-4 mb-4 border shadow-sm" style={{ background:s.bg, borderColor:s.border }}>
        <div className="text-xl font-black text-gray-900 tracking-wider mb-0.5">{v.registration_number}</div>
        <div className="text-[11px] text-gray-500 mb-3">
          {[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'} · {v.vehicle_type}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <Chip color={s.text} bg="white" border={s.border} dot={s.dot}>{STATUS_LABEL[v.status]}</Chip>
          <Chip color={p.text} bg="white" border={p.border}>{p.label}</Chip>
          <Chip color={v.provider_live?'#16a34a':'#d97706'} bg="white" border={v.provider_live?'#bbf7d0':'#fde68a'}>
            {v.provider_live ? '● Live GPS' : '○ Last known'}
          </Chip>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <MetricTile
          value={String(Math.round(v.speed))} unit="km/h" label="Speed"
          color={v.speed > 80 ? '#e11d48' : v.speed > 0 ? '#16a34a' : '#94a3b8'}
          warn={v.speed > 80}
        />
        <MetricTile
          value={v.fuel_level != null ? `${v.fuel_level}%` : '—'} label="Fuel Level"
          color={v.fuel_level == null ? '#94a3b8' : v.fuel_level < 25 ? '#e11d48' : v.fuel_level < 50 ? '#d97706' : '#16a34a'}
          bar={v.fuel_level ?? undefined}
        />
      </div>

      <InfoSection title="📍 Position">
        <InfoRow label="Latitude"    value={v.lat?.toFixed(6) ?? '—'} />
        <InfoRow label="Longitude"   value={v.lng?.toFixed(6) ?? '—'} />
        <InfoRow label="Heading"     value={v.heading ? `${v.heading}°` : '—'} />
        <InfoRow
          label="Last update"
          value={
            v.minutes_since_update == null ? '—'
            : v.minutes_since_update <= 2  ? 'Just now'
            : `${Math.round(v.minutes_since_update)} min ago`
          }
          color={
            v.minutes_since_update == null        ? '#94a3b8'
            : v.minutes_since_update <= 2         ? '#16a34a'
            : v.minutes_since_update <= 30        ? '#d97706'
            : '#e11d48'
          }
        />
      </InfoSection>

      <InfoSection title="🚛 Vehicle">
        <InfoRow label="Make / Model" value={[v.make,v.model].filter(Boolean).join(' ') || '—'} />
        <InfoRow label="Odometer"     value={v.odometer > 0 ? `${v.odometer.toLocaleString()} km` : '—'} />
        <InfoRow label="Engine"    value={v.engine_on ? 'Running' : 'Off'} color={v.engine_on?'#16a34a':'#e11d48'} />
        <InfoRow label="Ignition"  value={v.ignition_on ? 'On' : 'Off'} />
        {v.battery_voltage != null && <InfoRow label="Battery" value={`${v.battery_voltage} V`} />}
      </InfoSection>

      {v.fuel_level != null && (
        <InfoSection title="⛽ Fuel">
          <InfoRow label="Level" value={`${v.fuel_level}%`}
            color={v.fuel_level<25?'#e11d48':v.fuel_level<50?'#d97706':'#16a34a'} />
          <div className="px-3 pb-2.5 pt-0.5">
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width:`${v.fuel_level}%`, background:v.fuel_level<25?'#f43f5e':v.fuel_level<50?'#f59e0b':'#22c55e' }} />
            </div>
          </div>
        </InfoSection>
      )}

      {v.trip_id && (
        <InfoSection title="📦 Active Trip">
          <InfoRow label="Trip #"  value={v.trip_number || '—'} />
          <InfoRow label="Route"   value={v.route || '—'} />
          <InfoRow label="Status"  value={v.trip_status || '—'} />
          {v.origin      && <InfoRow label="From" value={v.origin} />}
          {v.destination && <InfoRow label="To"   value={v.destination} />}
        </InfoSection>
      )}

      <InfoSection title="📡 GPS Provider">
        <InfoRow label="Provider"   value={v.gps_provider_name} />
        <InfoRow label="API Status" value={v.gps_provider_status}
          color={v.gps_provider_status==='active'?'#16a34a':'#d97706'} />
        <InfoRow label="Data Feed"  value={v.provider_live ? 'Real-time' : 'Last known'}
          color={v.provider_live?'#16a34a':'#d97706'} />
      </InfoSection>
    </div>
  );
}

// ── Shared small atoms ────────────────────────────────────────────────

function Chip({ children, color, bg, border, dot }: {
  children: React.ReactNode; color: string; bg: string; border: string; dot?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-sm"
      style={{ color, background:bg, borderColor:border }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background:dot }} />}
      {children}
    </span>
  );
}

function MetricTile({ value, unit, label, warn, color, bar }: {
  value: string; unit?: string; label: string; warn?: boolean; color?: string; bar?: number;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3.5 py-3 shadow-sm">
      <div className="flex items-baseline gap-1 mb-0.5">
        <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: warn ? '#e11d48' : (color || '#0f172a') }}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-gray-400 font-bold">{unit}</span>}
      </div>
      <div className="text-[10px] font-semibold text-gray-500">{label}</div>
      {bar != null && (
        <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width:`${bar}%`, background: color || '#2563eb' }} />
        </div>
      )}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">{title}</div>
      <div className="rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden shadow-sm">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center px-3.5 py-2 border-b border-gray-100 last:border-0 text-[11px]">
      <span className="text-gray-500 font-medium flex-shrink-0">{label}</span>
      <span className="font-semibold text-right ml-3 truncate" style={{ color: color || '#0f172a' }}>{value}</span>
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────

function TimelinePanel({ v }: { v: UnifiedVehicle|null }) {
  const { data: pathData, isLoading } = useQuery({
    queryKey: ['timeline', v?.id],
    queryFn: () => fetchPath(String(v!.id), 8),
    enabled: !!v,
    staleTime: 30000,
  });

  if (!v) return <EmptyState icon="🕐" title="No vehicle selected" sub="Select a vehicle to view its timeline" />;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-10 text-gray-400 text-[12px]">
      <span className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      Loading timeline…
    </div>
  );

  const pts: any[] = (pathData?.points ?? []).slice(-20).reverse(); // most recent first

  if (pts.length === 0) return (
    <EmptyState icon="📭" title="No GPS history" sub={`No telemetry found for ${v.registration_number} in the last 8 hrs`} />
  );

  return (
    <div>
      <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
        Last {pts.length} positions · 8 hr window
      </div>
      <div className="relative pl-5">
        <div className="absolute left-[14px] top-2 bottom-2 w-px bg-gray-200" />
        {pts.map((pt: any, i: number) => {
          const spd = pt.speed ?? 0;
          const ign = pt.ignition_on ?? false;
          const ev = spd > 80 ? { color:'#ef4444', icon:'⚡', label:`Overspeed — ${Math.round(spd)} km/h` }
            : spd > 2  ? { color:'#22c55e', icon:'▶',  label:`Moving — ${Math.round(spd)} km/h` }
            : ign      ? { color:'#f59e0b', icon:'⏸',  label:'Idling — engine on' }
            :             { color:'#94a3b8', icon:'⏹',  label:'Stopped — engine off' };
          const t = pt.timestamp
            ? new Date(pt.timestamp).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false })
            : '—';
          return (
            <div key={i} className="relative flex gap-3 pb-3">
              <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-black text-white ring-4 ring-white shadow-sm z-10"
                style={{ background: ev.color }}>
                {ev.icon}
              </div>
              <div className="flex-1 rounded-xl border bg-white shadow-sm px-3 py-2" style={{ borderColor:'#e2e8f0' }}>
                <div className="text-[10px] font-black text-gray-400 mb-0.5">{t}</div>
                <div className="text-[12px] font-semibold text-gray-800">{ev.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">
                  {pt.lat?.toFixed(4)}, {pt.lng?.toFixed(4)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-gray-400 text-center mt-1">
        {pathData?.points?.length ?? 0} total GPS points in window
      </div>
    </div>
  );
}

function VehicleAlertsPanel({ v, alerts }: { v: UnifiedVehicle|null; alerts: any[] }) {
  if (!v) return <EmptyState icon="🔔" title="Select a vehicle" sub="to view its alerts" />;
  const va = alerts.filter(a => a.vehicle === v.registration_number);
  if (!va.length) return <EmptyState icon="✅" title="No alerts" sub="This vehicle has no active alerts" />;
  return (
    <div className="flex flex-col gap-2">
      {va.map((a:any, i:number) => (
        <div key={i} className="rounded-xl border bg-white p-3 shadow-sm" style={{ borderLeftWidth:3, borderLeftColor:a.severity==='critical'?'#ef4444':'#f59e0b' }}>
          <div className="font-bold text-gray-800 text-[12px] mb-0.5">{a.title}</div>
          <div className="text-[11px] text-gray-500">{a.message}</div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-3xl">{icon}</div>
      <div className="font-bold text-gray-600">{title}</div>
      <div className="text-[11px] text-gray-400">{sub}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// FLEET MAP
// ══════════════════════════════════════════════════════════════════════

function FleetView({ vehicles, onSelect, selectedPath }: {
  vehicles: UnifiedVehicle[];
  onSelect: (v: UnifiedVehicle) => void;
  selectedPath: [number,number][];
}) {
  const [fleetSelected, setFleetSelected] = useState<UnifiedVehicle|null>(null);

  const handleClick = (v: UnifiedVehicle) => {
    setFleetSelected(v);
    onSelect(v);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-5 py-2.5 bg-white border-b border-gray-200 flex items-center gap-2.5 flex-shrink-0 flex-wrap">
        <span className="font-bold text-gray-800">Fleet Overview</span>
        <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-[11px] text-gray-500 font-semibold">
          {vehicles.length} vehicles with GPS
        </span>
        <span className="text-[11px] text-gray-400">Ring = provider liveness · Fill = status · Auto-refresh 10s</span>
        {fleetSelected && (
          <span className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-700 font-semibold">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: S[fleetSelected.status]?.dot ?? '#94a3b8' }} />
            {fleetSelected.registration_number}
            {fleetSelected.driver_name && <span className="text-blue-400">· {fleetSelected.driver_name}</span>}
            {selectedPath.length > 0 && <span className="text-blue-400 font-normal">· {selectedPath.length} GPS pts</span>}
          </span>
        )}
      </div>
      <div className="flex-1 relative overflow-hidden">
        <MapContainer center={[10.5, 78.5]} zoom={6} zoomControl={false} attributionControl={false} style={{ width:'100%', height:'100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
          {fleetSelected?.lat && fleetSelected?.lng && <FlyTo lat={fleetSelected.lat} lng={fleetSelected.lng} />}

          {/* GPS trail for selected vehicle */}
          {selectedPath.length > 1 && (
            <>
              <Polyline positions={selectedPath}
                pathOptions={{ color:'#3b82f6', weight:3.5, opacity:0.7, dashArray:'8,5' }} />
              <CircleMarker center={selectedPath[0]} radius={8}
                pathOptions={{ color:'#15803d', fillColor:'#22c55e', fillOpacity:1, weight:2 }}>
                <Popup><span style={{ fontFamily:'Inter,sans-serif', fontWeight:700 }}>\ud83d\udfe2 Trip Start</span></Popup>
              </CircleMarker>
              <CircleMarker center={selectedPath[selectedPath.length-1]} radius={8}
                pathOptions={{ color:'#1d4ed8', fillColor:'#3b82f6', fillOpacity:1, weight:2 }}>
                <Popup><span style={{ fontFamily:'Inter,sans-serif', fontWeight:700 }}>\ud83d\udccd Last Known</span></Popup>
              </CircleMarker>
            </>
          )}

          {vehicles.map(v => (
            <Marker key={v.id} position={[v.lat!, v.lng!]} icon={mkMarker(v)}
              eventHandlers={{ click: () => handleClick(v) }}>
              <Popup>
                <div style={{ minWidth:180, fontFamily:'Inter,sans-serif', padding:'2px 0' }}>
                  <div style={{ fontWeight:900, fontSize:14, marginBottom:3, color:'#0f172a' }}>{v.registration_number}</div>
                  <div style={{ display:'flex', gap:5, marginBottom:5, flexWrap:'wrap' }}>
                    <span style={{ background:S[v.status]?.bg, color:S[v.status]?.text, border:`1px solid ${S[v.status]?.border}`, borderRadius:99, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
                      {STATUS_LABEL[v.status]}
                    </span>
                    <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:99, padding:'2px 8px', fontSize:10, fontWeight:600 }}>
                      {P[v.gps_provider]?.label ?? v.gps_provider}
                    </span>
                  </div>
                  {v.speed > 0 && <div style={{ fontSize:11, color:'#16a34a', fontWeight:700, marginBottom:2 }}>{Math.round(v.speed)} km/h</div>}
                  {v.driver_name && <div style={{ fontSize:11, color:'#64748b', marginBottom:2 }}>👤 {v.driver_name}</div>}
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:4, fontStyle:'italic' }}>Click to load GPS trail</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TRIP REPLAY
// ══════════════════════════════════════════════════════════════════════

function ReplayView({ vehicles }: { vehicles: UnifiedVehicle[] }) {
  const [vid, setVid]         = useState('');
  const [hours, setHours]     = useState(24);
  const [playing, setPlaying] = useState(false);
  const [progress, setProg]   = useState(0);
  const ticker = useRef<any>(null);

  const { data: pathData } = useQuery({
    queryKey: ['path', vid, hours],
    queryFn: () => fetchPath(vid, hours),
    enabled: !!vid,
  });

  const pts: [number,number][] = (pathData?.points ?? []).map((p:any) => [p.lat, p.lng]);

  // Compute distance + speed stats from GPS points
  const replayStats = useMemo(() => {
    if (pts.length < 2) return { dist: 0, maxSpd: 0, avgSpd: 0 };
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      const [la1,lo1] = pts[i-1]; const [la2,lo2] = pts[i];
      const dLa=(la2-la1)*Math.PI/180, dLo=(lo2-lo1)*Math.PI/180;
      const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
      dist+=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    }
    const rawPts = (pathData?.points ?? []) as {speed?:number}[];
    const speeds = rawPts.map(p=>p.speed??0).filter(s=>s>0);
    return {
      dist,
      maxSpd: speeds.length ? Math.max(...speeds) : 0,
      avgSpd: speeds.length ? speeds.reduce((a,b)=>a+b,0)/speeds.length : 0,
    };
  }, [pts, pathData]);

  const toggle = () => {
    if (playing) { clearInterval(ticker.current); setPlaying(false); }
    else {
      setPlaying(true);
      ticker.current = setInterval(() => {
        setProg(p => { if (p >= 100) { clearInterval(ticker.current); setPlaying(false); return 0; } return p+1; });
      }, 150);
    }
  };
  const stop = () => { clearInterval(ticker.current); setPlaying(false); setProg(0); };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-2.5 flex-shrink-0 flex-wrap">
        <span className="font-bold text-gray-800 mr-1">Trip Replay</span>
        <select value={vid} onChange={e => setVid(e.target.value)}
          className="px-3 py-1.5 rounded-xl text-xs bg-gray-50 border border-gray-200 text-gray-700 font-semibold outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          style={{ width:200 }}>
          <option value="">— Select Vehicle —</option>
          {vehicles.map(v => (
            <option key={v.id} value={String(v.id)}>
              {v.registration_number}{v.driver_name ? ` · ${v.driver_name}` : ''}
            </option>
          ))}
        </select>
        <select value={hours} onChange={e => setHours(Number(e.target.value))}
          className="px-3 py-1.5 rounded-xl text-xs bg-gray-50 border border-gray-200 text-gray-700 outline-none focus:ring-2 focus:ring-blue-200">
          {[[6,'Last 6 hrs'],[12,'Last 12 hrs'],[24,'Last 24 hrs'],[72,'Last 3 days'],[168,'Last 7 days']].map(([v,l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button onClick={toggle}
          className={`px-4 py-1.5 rounded-xl text-[12px] font-bold shadow-sm transition-all ${
            playing
              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
          }`}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button onClick={stop}
          className="px-4 py-1.5 rounded-xl text-[12px] font-bold bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 shadow-sm transition-all">
          ⏹ Stop
        </button>
        <div className="flex-1 min-w-[140px]">
          <input type="range" min={0} max={100} value={progress} onChange={e => setProg(Number(e.target.value))}
            className="w-full accent-blue-600 h-1 rounded-full" style={{ cursor:'pointer' }} />
        </div>
        <span className="text-[12px] font-bold text-blue-600 whitespace-nowrap">
          {vid ? `${pts.length} pts · ${Math.round(progress)}%` : 'Select a vehicle'}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <MapContainer center={[10.5, 78.5]} zoom={7} zoomControl={false} attributionControl={false} style={{ flex:1 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
          {pts.length > 0 && (
            <Polyline positions={pts} pathOptions={{ color:'#bfdbfe', weight:3, opacity:0.7 }} />
          )}
          {pts.length > 0 && progress > 0 && (
            <Polyline
              positions={pts.slice(0, Math.floor(pts.length * progress / 100))}
              pathOptions={{ color:'#2563eb', weight:4.5, opacity:0.95 }}
            />
          )}

          {/* Animated cursor marker that follows the scrubber */}
          {pts.length > 0 && (() => {
            const idx = Math.max(0, Math.min(Math.floor(pts.length * progress / 100), pts.length-1));
            const pt = pts[idx];
            if (!pt) return null;
            const icon = L.divIcon({
              className: '',
              html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="32" height="40">
                <circle cx="16" cy="16" r="14" fill="white" stroke="#2563eb" stroke-width="2.5"/>
                <circle cx="16" cy="16" r="9" fill="#2563eb"/>
                <text x="16" y="21" text-anchor="middle" font-family="Inter,sans-serif" font-size="9" font-weight="900" fill="white">▶</text>
                <polygon points="12,30 16,40 20,30" fill="#2563eb" opacity=".7"/>
              </svg>`,
              iconSize: [32, 40],
              iconAnchor: [16, 38],
            });
            return <Marker position={pt} icon={icon} />;
          })()}
        </MapContainer>

        {/* Stats sidebar */}
        <div className="w-56 bg-white border-l border-gray-200 p-4 overflow-y-auto flex-shrink-0 flex flex-col gap-3">
          <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Replay Stats</div>
          <StatsCard icon="📍" label="GPS Points"   value={String(pts.length)} />
          <StatsCard icon="⏱"  label="Time window"  value={`${hours}h`} />
          <StatsCard icon="▶"  label="Progress"     value={`${Math.round(progress)}%`} />
          {replayStats.dist > 0    && <StatsCard icon="📏" label="Distance"    value={`${replayStats.dist.toFixed(1)} km`} />}
          {replayStats.maxSpd > 0  && <StatsCard icon="⚡" label="Max Speed"   value={`${Math.round(replayStats.maxSpd)} km/h`} />}
          {replayStats.avgSpd > 0  && <StatsCard icon="🏃" label="Avg Speed"   value={`${Math.round(replayStats.avgSpd)} km/h`} />}
          {!vid && (
            <div className="mt-1 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-700 leading-relaxed">
              Select a vehicle above to load and replay its GPS path.
            </div>
          )}
          {vid && pts.length === 0 && (
            <div className="mt-1 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-700 leading-relaxed">
              No GPS data found for this vehicle in the selected time window.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3.5 py-3 flex items-center gap-3 shadow-sm">
      <span className="text-xl">{icon}</span>
      <div>
        <div className="font-black text-gray-900 text-[16px] leading-none tabular-nums">{value}</div>
        <div className="text-[10px] text-gray-400 font-semibold mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ALERTS VIEW
// ══════════════════════════════════════════════════════════════════════

function AlertsView({ alerts }: { alerts: any[] }) {
  const [filter, setFilter] = useState('');

  const shown = alerts.filter(a =>
    !filter ||
    a.vehicle?.toLowerCase().includes(filter.toLowerCase()) ||
    a.type?.toLowerCase().includes(filter.toLowerCase()) ||
    a.message?.toLowerCase().includes(filter.toLowerCase())
  );

  const sevStyle = (s: string) =>
    s === 'critical' ? { bg:'#fff1f2', border:'#fecdd3', text:'#e11d48' }
    : s === 'warning' ? { bg:'#fffbeb', border:'#fde68a', text:'#d97706' }
    : { bg:'#eff6ff', border:'#bfdbfe', text:'#2563eb' };

  const typeColor: Record<string,string> = {
    overspeed:'#e11d48', document_expiry:'#e11d48',
    maintenance_due:'#d97706', geofence:'#d97706',
    idle:'#2563eb', fuel:'#9333ea', trip_status:'#2563eb',
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center gap-3 flex-shrink-0">
        <span className="font-bold text-gray-800 text-[14px]">Live Alerts</span>
        {alerts.length > 0 && (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-red-50 text-red-600 border border-red-200 shadow-sm">
            {alerts.length} active
          </span>
        )}
        <div className="flex-1 max-w-sm relative ml-2">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input type="text" placeholder="Filter by vehicle, type, message…" value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all" />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        {shown.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
            <div className="text-5xl">✅</div>
            <div className="font-bold text-gray-700 text-lg">No active alerts</div>
            <div className="text-[13px] text-gray-400">All systems operating normally</div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                {['Time','Vehicle','Type','Message','Severity','Action'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((a:any, i:number) => {
                const sc = sevStyle(a.severity);
                return (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <td className="px-4 py-3 text-[11px] text-gray-400 font-mono whitespace-nowrap">
                      {a.created_at?.slice(11,19) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-extrabold text-gray-900 text-[12px]">{a.vehicle || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold"
                        style={{ color:typeColor[a.type]||'#64748b', background:(typeColor[a.type]||'#94a3b8')+'18' }}>
                        {a.type?.replace(/_/g,' ') ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-600 max-w-[220px]">
                      <div className="truncate">{a.message || a.title || '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black border shadow-sm"
                        style={{ color:sc.text, background:sc.bg, borderColor:sc.border }}>
                        {a.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="px-3 py-1.5 rounded-xl text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                        Acknowledge
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
