import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ActiveDotProps } from 'recharts/types/util/types';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

export interface ElevationPoint {
  /** Distance from start in metres */
  distanceM: number;
  /** Elevation in metres */
  elevationM: number;
}

interface ElevationProfileChartProps {
  data: ElevationPoint[];
  /** Called when the user clicks an active dot on the chart. Stub — vertex
   *  highlighting is out of scope for this prototype. */
  onPointClick?: (point: ElevationPoint) => void;
}

const chartConfig = {
  elevationM: {
    label: 'Elevation (m)',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

/** Formats metres as "0.0 km" for distances ≥ 1 000 m, otherwise "Xm". */
function formatDistanceLabel(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function ElevationProfileChart({
  data,
  onPointClick,
}: ElevationProfileChartProps) {
  function ActiveDot(props: ActiveDotProps) {
    const { cx, cy, payload } = props;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--color-elevationM)"
        stroke="white"
        strokeWidth={2}
        style={{ cursor: onPointClick ? 'pointer' : 'default' }}
        onClick={() => onPointClick?.(payload as ElevationPoint)}
      />
    );
  }

  return (
    <ChartContainer config={chartConfig} className="h-40 w-full">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
          dataKey="distanceM"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatDistanceLabel}
          minTickGap={40}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={40}
          tickFormatter={(v: number) => `${v}m`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                if (!payload?.length) return '';
                const d = (payload[0].payload as ElevationPoint).distanceM;
                return formatDistanceLabel(d);
              }}
              formatter={(value) => [`${value} m`, 'Elevation']}
            />
          }
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
  );
}
