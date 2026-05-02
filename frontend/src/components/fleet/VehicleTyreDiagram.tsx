/**
 * VehicleTyreDiagram — SVG top-down vehicle diagram with live tyre data
 * Enhanced: condition-based colours, hover tooltips, pulse animations, tread display
 */
import React, { memo, useState, useCallback } from 'react';
import type { TyreData } from '@/types';

export type VehicleLayout = 'LCV_4' | 'TRUCK_2AXLE' | 'TRUCK_3AXLE' | 'TRAILER_3AXLE' | 'BUS_5AXLE' | 'TRUCK_12W' | 'TRUCK_14W';

/**
 * Map raw DB position codes (FL, FR, RL1 …) to diagram positions (1L0, 1R0, 2L0 …).
 * Call this before passing tyres to the diagram.
 */
export const POSITION_MAP: Record<string, string> = {
  FL: '1L0', FR: '1R0',
  RL1: '2L0', RR1: '2R0', RL2: '2L1', RR2: '2R1',
  RL3: '3L0', RR3: '3R0', RL4: '3L1', RR4: '3R1',
};

export function mapDbPositions(tyres: Map<string, any>): Map<string, any> {
  const mapped = new Map<string, any>();
  tyres.forEach((val, key) => {
    const diagramKey = POSITION_MAP[key] || key;
    mapped.set(diagramKey, { ...val, position: diagramKey, db_position: key });
  });
  return mapped;
}

/** Pick the best diagram layout from API vehicle_type string. */
export function layoutForVehicleType(vehicleType: string, tyreCount?: number): VehicleLayout {
  const t = (vehicleType || '').toUpperCase();
  if (t === 'LCV' || t === 'MINI_TRUCK') return 'LCV_4';
  if (t === 'TANKER' || t === 'CONTAINER') return 'TRUCK_3AXLE';
  if (t === 'TRAILER') return 'TRAILER_3AXLE';
  if (t === 'BUS') return 'BUS_5AXLE';
  // TRUCK — decide by tyre count
  if (tyreCount && tyreCount > 6) return 'TRUCK_3AXLE';
  return 'TRUCK_2AXLE';
}

interface Props {
  vehicleType: VehicleLayout;
  tyres: Map<string, Partial<TyreData>>;
  onTyreClick: (position: string) => void;
  selectedPosition?: string | null;
}

// ── Color helpers ───────────────────────────────────────

export function getTyreColor(tyre: Partial<TyreData>): string {
  // Tread depth — primary signal (most accurate)
  const treadMm = (tyre as any)?.tread_depth_mm;
  if (treadMm != null) {
    if (treadMm <= 2.5) return '#ef4444';  // critical
    if (treadMm <= 5)   return '#f97316';  // worn
    if (treadMm <= 8)   return '#eab308';  // average
    return '#22c55e';                       // good
  }
  // Alert-based overrides
  if (tyre.alert === 'critical_pressure') return '#dc2626';
  if (tyre.alert === 'low_pressure') return '#f97316';
  if (tyre.alert === 'high_temp') return '#ef4444';
  // Condition-based fallback
  const condition = String((tyre as any).condition || '').toLowerCase();
  if (condition === 'damaged') return '#ef4444';
  if (condition === 'worn') return '#f97316';
  if (condition === 'average') return '#eab308';
  // Life-percent fallback
  const life = tyre.life_percent ?? 100;
  if (life >= 70) return '#22c55e';
  if (life >= 50) return '#84cc16';
  if (life >= 30) return '#eab308';
  return '#ef4444';
}

export function tyreLifeColor(life: number): string {
  if (life >= 90) return '#4CAF50';
  if (life >= 70) return '#8BC34A';
  if (life >= 50) return '#CDDC39';
  if (life >= 30) return '#FFC107';
  if (life >= 10) return '#FF9800';
  return '#F44336';
}

export function getPSIStatus(psi: number, target: number): { label: string; color: string } {
  const diff = ((target - psi) / target) * 100;
  if (diff > 20) return { label: 'CRITICAL', color: '#F44336' };
  if (diff > 10) return { label: 'LOW', color: '#FF9800' };
  if (diff < -10) return { label: 'HIGH', color: '#2196F3' };
  return { label: 'NORMAL', color: '#4CAF50' };
}

// ── Layout definitions ──────────────────────────────────

interface TyrePosition {
  position: string;
  x: number;
  y: number;
}

function getLayout(type: VehicleLayout): { positions: TyrePosition[]; width: number; height: number; bodyPath: string } {
  const W = 320;
  const tyreW = 48;
  const leftX = 30;
  const rightX = W - 30 - tyreW;
  const leftInner = leftX + tyreW + 4;
  const rightInner = rightX - tyreW - 4;

  switch (type) {
    case 'LCV_4':
      // Light commercial / mini-truck — 4 single tyres, 2 axles
      return {
        width: W, height: 250,
        bodyPath: `M${leftX + tyreW + 10},20 h${rightX - leftX - tyreW - 20} q20,0 20,20 v170 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-170 q0,-20 20,-20 z`,
        positions: [
          { position: '1L0', x: leftX, y: 40 },
          { position: '1R0', x: rightX, y: 40 },
          { position: '2L0', x: leftX, y: 150 },
          { position: '2R0', x: rightX, y: 150 },
        ],
      };
    case 'TRUCK_2AXLE':
      return {
        width: W, height: 280,
        bodyPath: `M${leftX + tyreW + 10},20 h${rightX - leftX - tyreW - 20} q20,0 20,20 v200 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-200 q0,-20 20,-20 z`,
        positions: [
          { position: '1L0', x: leftX, y: 40 },
          { position: '1R0', x: rightX, y: 40 },
          { position: '2L0', x: leftX, y: 170 },
          { position: '2L1', x: leftInner, y: 170 },
          { position: '2R1', x: rightInner, y: 170 },
          { position: '2R0', x: rightX, y: 170 },
        ],
      };
    case 'TRUCK_3AXLE':
      return {
        width: W, height: 400,
        bodyPath: `M${leftX + tyreW + 10},20 h${rightX - leftX - tyreW - 20} q20,0 20,20 v320 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-320 q0,-20 20,-20 z`,
        positions: [
          { position: '1L0', x: leftX, y: 40 },
          { position: '1R0', x: rightX, y: 40 },
          { position: '2L0', x: leftX, y: 190 },
          { position: '2L1', x: leftInner, y: 190 },
          { position: '2R1', x: rightInner, y: 190 },
          { position: '2R0', x: rightX, y: 190 },
          { position: '3L0', x: leftX, y: 270 },
          { position: '3L1', x: leftInner, y: 270 },
          { position: '3R1', x: rightInner, y: 270 },
          { position: '3R0', x: rightX, y: 270 },
        ],
      };
    case 'TRUCK_12W':
      // Double Steering — 1 dual steer axle (4) + 2 dual drive axles (4+4) = 12 tyres
      return {
        width: W, height: 400,
        bodyPath: `M${leftX + tyreW + 10},20 h${rightX - leftX - tyreW - 20} q20,0 20,20 v320 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-320 q0,-20 20,-20 z`,
        positions: [
          { position: '1L1', x: leftX,      y: 40 },
          { position: '1L0', x: leftInner,  y: 40 },
          { position: '1R0', x: rightInner, y: 40 },
          { position: '1R1', x: rightX,     y: 40 },
          { position: '2L1', x: leftX,      y: 180 },
          { position: '2L0', x: leftInner,  y: 180 },
          { position: '2R0', x: rightInner, y: 180 },
          { position: '2R1', x: rightX,     y: 180 },
          { position: '3L1', x: leftX,      y: 270 },
          { position: '3L0', x: leftInner,  y: 270 },
          { position: '3R0', x: rightInner, y: 270 },
          { position: '3R1', x: rightX,     y: 270 },
        ],
      };
    case 'TRUCK_14W':
      // 14W — 1 single steer + 3 dual drive rear = 14 tyres
      return {
        width: W, height: 460,
        bodyPath: `M${leftX + tyreW + 10},20 h${rightX - leftX - tyreW - 20} q20,0 20,20 v380 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-380 q0,-20 20,-20 z`,
        positions: [
          { position: '1L0', x: leftX, y: 40 },
          { position: '1R0', x: rightX, y: 40 },
          { position: '2L0', x: leftX, y: 160 },
          { position: '2L1', x: leftInner, y: 160 },
          { position: '2R1', x: rightInner, y: 160 },
          { position: '2R0', x: rightX, y: 160 },
          { position: '3L0', x: leftX, y: 255 },
          { position: '3L1', x: leftInner, y: 255 },
          { position: '3R1', x: rightInner, y: 255 },
          { position: '3R0', x: rightX, y: 255 },
          { position: '4L0', x: leftX, y: 350 },
          { position: '4L1', x: leftInner, y: 350 },
          { position: '4R1', x: rightInner, y: 350 },
          { position: '4R0', x: rightX, y: 350 },
        ],
      };
    case 'TRAILER_3AXLE':
      return {
        width: W, height: 360,
        bodyPath: `M${leftX + tyreW + 10},14 h${rightX - leftX - tyreW - 20} q20,0 20,20 v280 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-280 q0,-20 20,-20 z`,
        positions: [
          { position: '1L0', x: leftX, y: 40 },
          { position: '1L1', x: leftInner, y: 40 },
          { position: '1R1', x: rightInner, y: 40 },
          { position: '1R0', x: rightX, y: 40 },
          { position: '2L0', x: leftX, y: 150 },
          { position: '2L1', x: leftInner, y: 150 },
          { position: '2R1', x: rightInner, y: 150 },
          { position: '2R0', x: rightX, y: 150 },
          { position: '3L0', x: leftX, y: 260 },
          { position: '3L1', x: leftInner, y: 260 },
          { position: '3R1', x: rightInner, y: 260 },
          { position: '3R0', x: rightX, y: 260 },
        ],
      };
    case 'BUS_5AXLE':
    default:
      return {
        width: W, height: 560,
        bodyPath: `M${leftX + tyreW + 10},14 h${rightX - leftX - tyreW - 20} q20,0 20,20 v480 q0,20 -20,20 h-${rightX - leftX - tyreW - 20} q-20,0 -20,-20 v-480 q0,-20 20,-20 z`,
        positions: [
          { position: '1L0', x: leftX, y: 30 },
          { position: '1R0', x: rightX, y: 30 },
          { position: '2L0', x: leftX, y: 130 },
          { position: '2R0', x: rightX, y: 130 },
          { position: '3L0', x: leftX, y: 230 },
          { position: '3R0', x: rightX, y: 230 },
          { position: '4L0', x: leftX, y: 340 },
          { position: '4L1', x: leftInner, y: 340 },
          { position: '4R1', x: rightInner, y: 340 },
          { position: '4R0', x: rightX, y: 340 },
          { position: '5L0', x: leftX, y: 420 },
          { position: '5L1', x: leftInner, y: 420 },
          { position: '5R1', x: rightInner, y: 420 },
          { position: '5R0', x: rightX, y: 420 },
        ],
      };
  }
}

// ── Tooltip data type ───────────────────────────────────

interface TooltipData {
  pos: string;
  tyre: Partial<TyreData> | undefined;
  x: number;
  y: number;
}

// ── Single tyre SVG ─────────────────────────────────────

const TyreRect = memo(function TyreRect({
  pos, tyre, x, y, isSelected, onClick, onHover,
}: {
  pos: string;
  tyre: Partial<TyreData> | undefined;
  x: number;
  y: number;
  isSelected: boolean;
  onClick: () => void;
  onHover: (d: TooltipData | null) => void;
}) {
  const w = 48, h = 64;
  const color = tyre ? getTyreColor(tyre) : '#9ca3af';
  const condition = String((tyre as any)?.condition || '').toLowerCase();
  const psi = tyre?.psi;
  const treadMm = (tyre as any)?.tread_depth_mm;
  const temp = tyre?.temperature;
  const isCritical = tyre &&
    (tyre.alert === 'critical_pressure' ||
     condition === 'damaged' || condition === 'worn' || (tyre.life_percent ?? 100) < 20 ||
     (treadMm != null && treadMm <= 2.5));

  return (
    <g
      onClick={onClick}
      onMouseEnter={() => onHover({ pos, tyre, x, y })}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}
    >
      {/* Pulse animation ring for critical/damaged tyres */}
      {isCritical && (
        <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx={10}
          fill="none" stroke="#dc2626" strokeWidth={2} opacity={0.85}>
          <animate attributeName="opacity" values="0.85;0.15;0.85" dur="1.5s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Selected ring */}
      {isSelected && !isCritical && (
        <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={9}
          fill="none" stroke="#1d4ed8" strokeWidth={2.5} />
      )}

      {/* Tyre body */}
      <rect x={x} y={y} width={w} height={h} rx={7}
        fill={color}
        stroke={isSelected ? '#1d4ed8' : 'rgba(0,0,0,0.2)'}
        strokeWidth={isSelected ? 2 : 1}
        opacity={0.93}
      />

      {/* Position label */}
      <text x={x + w / 2} y={y + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
        {pos}
      </text>

      {/* Primary reading: PSI if sensor, else tread depth, else dashes */}
      {tyre?.has_sensor && psi !== undefined && psi > 0 ? (
        <>
          <text x={x + w / 2} y={y + 34} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
            {psi.toFixed(0)}
          </text>
          <text x={x + w / 2} y={y + 46} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.75)">PSI</text>
        </>
      ) : treadMm != null ? (
        <>
          <text x={x + w / 2} y={y + 34} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff">
            {Number(treadMm).toFixed(1)}
          </text>
          <text x={x + w / 2} y={y + 46} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.75)">mm</text>
        </>
      ) : (
        <text x={x + w / 2} y={y + 38} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)">—</text>
      )}

      {/* Condition bottom label */}
      {condition && condition !== 'good' && condition !== 'new' && (
        <text x={x + w / 2} y={y + h - 6} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.8)">
          {condition.slice(0, 4).toUpperCase()}
        </text>
      )}

      {/* Temperature badge (sensor-based) */}
      {tyre?.has_sensor && temp !== undefined && temp > 0 && (
        <text x={x + w / 2} y={y + h - 6} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.85)">
          {temp.toFixed(0)}°
        </text>
      )}
    </g>
  );
});

// ── Tooltip overlay ─────────────────────────────────────

function TyreTooltip({ data, svgWidth }: { data: TooltipData; svgWidth: number }) {
  const { pos, tyre, x, y } = data;
  const TW = 48;
  const tipW = 148, tipH = tyre ? 100 : 54;
  const tipX = x + TW + 6 + tipW > svgWidth ? x - tipW - 6 : x + TW + 6;
  const tipY = Math.max(4, y - 10);
  const psi = tyre?.psi ?? 0;
  const treadMm = (tyre as any)?.tread_depth_mm;
  const cond = tyre ? String((tyre as any)?.condition || '—').toUpperCase() : '—';
  const life = tyre?.life_percent != null ? `${tyre.life_percent.toFixed(0)}%` : '—';

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={8} fill="#111827" opacity={0.95} />
      <text x={tipX + 10} y={tipY + 18} fontSize={11} fontWeight={700} fill="#f9fafb">{pos}</text>
      {tyre ? (
        <>
          <text x={tipX + 10} y={tipY + 34} fontSize={9} fill="#d1d5db">
            PSI: {psi > 0 ? psi.toFixed(0) : '—'}
          </text>
          <text x={tipX + 10} y={tipY + 48} fontSize={9} fill="#d1d5db">
            Tread: {treadMm != null ? `${Number(treadMm).toFixed(1)} mm` : '—'}
          </text>
          <text x={tipX + 10} y={tipY + 62} fontSize={9} fill="#d1d5db">Cond: {cond}</text>
          <text x={tipX + 10} y={tipY + 76} fontSize={9} fill="#d1d5db">Life: {life}</text>
          <text x={tipX + 10} y={tipY + 90} fontSize={8} fill="#6b7280">
            {tyre.has_sensor ? 'Sensor data' : 'Manual reading'}
          </text>
        </>
      ) : (
        <text x={tipX + 10} y={tipY + 38} fontSize={9} fill="#6b7280">No tyre data</text>
      )}
    </g>
  );
}

// ── Main diagram ────────────────────────────────────────

function VehicleTyreDiagram({ vehicleType, tyres, onTyreClick, selectedPosition }: Props) {
  const layout = getLayout(vehicleType);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const handleHover = useCallback((d: TooltipData | null) => setTooltip(d), []);

  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="w-full max-w-sm mx-auto"
      style={{ maxHeight: layout.height }}
    >
      {/* Vehicle body */}
      <path d={layout.bodyPath} fill="#f8f9fa" stroke="#d1d5db" strokeWidth={1.5} />

      {/* Cab indicator (windshield) — skip for trailers */}
      {vehicleType !== 'TRAILER_3AXLE' && (
        <>
          <rect
            x={layout.width / 2 - 44} y={5} width={88} height={26} rx={7}
            fill="#e9ecef" stroke="#ced4da" strokeWidth={1}
          />
          <line
            x1={layout.width / 2 - 18} y1={8}
            x2={layout.width / 2 - 18} y2={28}
            stroke="#ced4da" strokeWidth={1}
          />
          <line
            x1={layout.width / 2 + 18} y1={8}
            x2={layout.width / 2 + 18} y2={28}
            stroke="#ced4da" strokeWidth={1}
          />
          <text x={layout.width / 2} y={23} textAnchor="middle" fontSize={9} fill="#6b7280" fontWeight={600}>
            {vehicleType === 'BUS_5AXLE' ? 'BUS' : 'CAB'}
          </text>
        </>
      )}
      {vehicleType === 'TRAILER_3AXLE' && (
        <>
          <rect
            x={layout.width / 2 - 44} y={4} width={88} height={20} rx={6}
            fill="#fef3c7" stroke="#f59e0b" strokeWidth={1}
          />
          <text x={layout.width / 2} y={18} textAnchor="middle" fontSize={9} fill="#92400e" fontWeight={600}>TRAILER</text>
        </>
      )}

      {/* Axle lines */}
      {getAxleYPositions(layout.positions).map((ay, i) => (
        <line key={i} x1={52} y1={ay + 32} x2={layout.width - 52} y2={ay + 32}
          stroke="#e5e7eb" strokeWidth={1.5} />
      ))}

      {/* Tyres */}
      {layout.positions.map(p => (
        <TyreRect
          key={p.position}
          pos={p.position}
          tyre={tyres.get(p.position)}
          x={p.x}
          y={p.y}
          isSelected={selectedPosition === p.position}
          onClick={() => onTyreClick(p.position)}
          onHover={handleHover}
        />
      ))}

      {/* Tooltip overlay — rendered last so it's on top */}
      {tooltip && (
        <TyreTooltip data={tooltip} svgWidth={layout.width} />
      )}
    </svg>
  );
}

function getAxleYPositions(positions: TyrePosition[]): number[] {
  const ySet = new Set<number>();
  positions.forEach(p => ySet.add(p.y));
  return Array.from(ySet).sort((a, b) => a - b);
}

export default memo(VehicleTyreDiagram);
