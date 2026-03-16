"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, AXIS_TICK, BAR_RADIUS_TOP, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, TOOLTIP_STYLE, CHART_COLORS } from "@/lib/utils";
import type { MonthlyTrendPoint, MoMGrowth } from "@/lib/analysis/monthlyTrend";

interface MonthlyTrendChartProps {
  data: MonthlyTrendPoint[];
  growth?: MoMGrowth[];
  title?: string;
  height?: string;
  metrics?: ("매출액" | "매출총이익" | "영업이익")[];
  showGrowthRate?: boolean;
}

export function MonthlyTrendChart({
  data,
  growth,
  height = "h-64 md:h-80",
  metrics = ["매출액", "매출총이익", "영업이익"],
  showGrowthRate = false,
}: MonthlyTrendChartProps) {
  // MoM 성장률 병합
  const chartData = useMemo(() => {
    if (!showGrowthRate || !growth || growth.length === 0) return data;

    const growthMap = new Map(growth.map((g) => [g.month, g]));
    return data.map((point) => {
      const g = growthMap.get(point.month);
      return {
        ...point,
        매출액증감율: g?.매출액증감율 ?? null,
        영업이익증감율: g?.영업이익증감율 ?? null,
      };
    });
  }, [data, growth, showGrowthRate]);

  if (data.length === 0) return null;

  const showBar = metrics.includes("매출액");
  const showGross = metrics.includes("매출총이익");
  const showOp = metrics.includes("영업이익");

  return (
    <ChartContainer height={height}>
      <ComposedChart data={chartData} margin={{ top: 5, right: showGrowthRate ? 50 : 20, bottom: 5, left: 10 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="monthLabel" tick={AXIS_TICK} />
        <YAxis
          yAxisId="left"
          tick={AXIS_TICK}
          tickFormatter={(v: any) => formatCurrency(Number(v), true)}
        />
        {showGrowthRate && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={AXIS_TICK}
            tickFormatter={(v: any) => `${v}%`}
            domain={["auto", "auto"]}
          />
        )}
        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(v: any, name: any) => {
            if (typeof name === "string" && name.includes("증감율")) {
              return v != null ? [`${Number(v).toFixed(1)}%`, name] : ["-", name];
            }
            return [formatCurrency(Number(v)), name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />

        {showBar && (
          <Bar
            yAxisId="left"
            dataKey="매출액"
            fill={CHART_COLORS[0]}
            radius={BAR_RADIUS_TOP}
            {...ANIMATION_CONFIG}
          />
        )}
        {showGross && (
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="매출총이익"
            stroke={CHART_COLORS[1]}
            strokeWidth={2}
            dot={{ r: 3 }}
            {...ANIMATION_CONFIG}
          />
        )}
        {showOp && (
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="영업이익"
            stroke={CHART_COLORS[2]}
            strokeWidth={2}
            dot={{ r: 3 }}
            {...ANIMATION_CONFIG}
          />
        )}
        {showGrowthRate && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="매출액증감율"
            stroke={CHART_COLORS[3]}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={{ r: 2 }}
            connectNulls
            {...ANIMATION_CONFIG}
          />
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
