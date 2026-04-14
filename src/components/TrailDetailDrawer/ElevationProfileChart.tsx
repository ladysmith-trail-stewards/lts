import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ActiveDotProps } from 'recharts/types/util/types';

import { ChartContainer, type ChartConfig } from '@/components/ui/chart';
import type { ElevationPoint } from '@/lib/map/elevationProfile';

export type { ElevationPoint };

interface ElevationProfileChartProps {
  data: ElevationPoint[];
  /** Called when hovering a point — used to sync the map marker. */
  onHoverPoint?: (point: ElevationPoint | null) => void;
  onPointClick?: (point: ElevationPoint) => void;
}

const chartConfig = {
  elevationM: {
    label: 'Elevation (m)',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

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

  const totalDistanceKm =
    data.length > 0 ? data[data.length - 1].distanceKm : 0;
  const minElevation =
    data.length > 0 ? Math.min(...data.map((p) => p.elevationM)) : 0;
  const elevationGain = data.reduce((gain, point, i) => {
    if (i === 0) return gain;
    const diff = point.elevationM - data[i - 1].elevationM;
    return gain + (diff > 0 ? diff : 0);
  }, 0);
  const yMin = minElevation > 50 ? Math.floor(minElevation - 50) : 0;

  function ActiveDot(props: ActiveDotProps) {
    const { cx, cy, payload } = props;
    const point = payload as ElevationPoint;
    if (hoveredPoint?.index !== point.index) {
      setHoveredPoint(point);
      onHoverPoint?.(point);
    }

    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--color-elevationM)"
        stroke="white"
        strokeWidth={2}
        style={{ cursor: onPointClick ? 'pointer' : 'default' }}
        onClick={() => onPointClick?.(point)}
      />
    );
  }

  function handleMouseLeave() {
    setHoveredPoint(null);
    onHoverPoint?.(null);
  }

  return (
    <div>
      {/* Hover data display row */}
      <div className="flex items-center justify-end gap-3 px-1 pb-1 text-xs select-none h-5">
        {hoveredPoint ? (
          <>
            <span className="font-medium text-slate-600">
              → {formatKm(hoveredPoint.distanceKm)}
            </span>
            <span className="font-medium text-slate-600">
              ↑ {Math.round(hoveredPoint.elevationM)} m
            </span>
            <span
              className={`font-medium ${
                hoveredPoint.elevationDeltaM > 0
                  ? 'text-green-600'
                  : hoveredPoint.elevationDeltaM < 0
                    ? 'text-red-500'
                    : 'text-slate-400'
              }`}
            >
              {hoveredPoint.elevationDeltaM > 0 ? '+' : ''}
              {Math.round(hoveredPoint.elevationDeltaM)} m
            </span>
          </>
        ) : (
          <span className="text-slate-400 italic text-[10px]">
            {`total gain: ${Math.round(elevationGain)} m · ${formatKm(totalDistanceKm)}`}
          </span>
        )}
      </div>
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <AreaChart
          data={data}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="elevationGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-elevationM)"
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor="var(--color-elevationM)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
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
            stroke="var(--color-elevationM)"
            strokeWidth={2}
            fill="url(#elevationGradient)"
            dot={false}
            activeDot={ActiveDot}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
