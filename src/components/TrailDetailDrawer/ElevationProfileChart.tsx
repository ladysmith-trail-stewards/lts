import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActiveDotProps } from 'recharts/types/util/types';
import { ArrowUp, ArrowDown, ArrowRight, Mountain } from 'lucide-react';

import type { ElevationPoint } from '@/lib/map/elevationProfile';

export type { ElevationPoint };

interface ElevationProfileChartProps {
  data: ElevationPoint[];
  /** Called when hovering a point — used to sync the map marker. */
  onHoverPoint?: (point: ElevationPoint | null) => void;
  onPointClick?: (point: ElevationPoint) => void;
}

// Elevation chart colour — matches --chart-1 from the theme.
const ELEV_COLOR = 'var(--chart-1)';

function formatKm(km: number): string {
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

export function ElevationProfileChart({
  data,
  onHoverPoint,
  onPointClick,
}: ElevationProfileChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<ElevationPoint | null>(null);
  // Stable ref so the Tooltip content callback doesn't need to be recreated.
  const onHoverPointRef = useRef(onHoverPoint);
  useEffect(() => {
    onHoverPointRef.current = onHoverPoint;
  });

  const minElevation =
    data.length > 0 ? Math.min(...data.map((p) => p.elevationM)) : 0;
  const yMin = minElevation > 50 ? Math.floor(minElevation - 50) : 0;
  const startElevationM = data.length > 0 ? data[0].elevationM : 0;

  // Pure render — no setState.
  const ActiveDot = useCallback(
    (props: ActiveDotProps) => {
      const { cx, cy, payload } = props;
      const point = payload as ElevationPoint;
      return (
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill={ELEV_COLOR}
          stroke="white"
          strokeWidth={2}
          style={{ cursor: onPointClick ? 'pointer' : 'default' }}
          onClick={() => onPointClick?.(point)}
        />
      );
    },
    [onPointClick]
  );

  // Recharts calls this on every hover tick with the nearest data point.
  // Returning null renders no tooltip UI, but we get reliable active payload.
  const TooltipContent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ active, payload }: any) => {
      const point: ElevationPoint | null =
        active && payload?.length
          ? (payload[0].payload as ElevationPoint)
          : null;
      // Schedule state update outside render via setTimeout(0).
      const next = point ?? null;
      setTimeout(() => {
        setHoveredPoint((prev) => {
          if (prev?.index === next?.index) return prev;
          onHoverPointRef.current?.(next);
          return next;
        });
      }, 0);
      return null;
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
    onHoverPoint?.(null);
  }, [onHoverPoint]);

  const deltaFromStart = hoveredPoint
    ? hoveredPoint.elevationM - startElevationM
    : null;

  return (
    <div>
      {/* Hover data display row — empty when nothing is hovered */}
      <div className="flex items-center justify-end gap-3 px-1 pb-1 text-xs select-none h-5">
        {hoveredPoint && deltaFromStart !== null && (
          <>
            <span className="font-medium text-slate-600 flex items-center gap-0.5">
              <ArrowRight className="w-3 h-3" />
              {formatKm(hoveredPoint.distanceKm)}
            </span>
            <span className="font-medium text-slate-600 flex items-center gap-0.5">
              {deltaFromStart >= 0 ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )}
              {Math.abs(Math.round(deltaFromStart))} m
            </span>
            <span className="font-medium text-slate-600 flex items-center gap-1">
              <Mountain className="w-3 h-3" />
              {Math.round(hoveredPoint.elevationM)} m
            </span>
          </>
        )}
      </div>
      <div className="h-40 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient
                id="elevationGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={ELEV_COLOR} stopOpacity={0.4} />
                <stop offset="95%" stopColor={ELEV_COLOR} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <Tooltip
              content={TooltipContent}
              cursor={false}
              isAnimationActive={false}
            />
            <XAxis
              dataKey="distanceKm"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v: number) => formatKm(v)}
              minTickGap={40}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={40}
              tickFormatter={(v: number) => `${v}m`}
              domain={[yMin, 'auto']}
            />
            <Area
              type="monotone"
              dataKey="elevationM"
              stroke={ELEV_COLOR}
              strokeWidth={2}
              fill="url(#elevationGradient)"
              dot={false}
              activeDot={ActiveDot}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
