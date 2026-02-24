"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Users, Repeat, Crown } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCohortAnalysis } from "@/lib/analysis/cohortAnalysis";
import type { SalesRecord } from "@/types";

interface CohortTabProps {
  filteredSales: SalesRecord[];
}

/** Retention rate -> background color gradient (green=high, red=low) */
function retentionColor(rate: number): string {
  if (rate >= 80) return "rgba(16, 185, 129, 0.7)";  // emerald
  if (rate >= 60) return "rgba(16, 185, 129, 0.5)";
  if (rate >= 40) return "rgba(245, 158, 11, 0.5)";   // amber
  if (rate >= 20) return "rgba(245, 158, 11, 0.35)";
  if (rate > 0) return "rgba(239, 68, 68, 0.35)";     // red
  return "transparent";
}

const MAX_PERIOD_COLUMNS = 12;

export function CohortTab({ filteredSales }: CohortTabProps) {
  const cohortResult = useMemo(() => calcCohortAnalysis(filteredSales), [filteredSales]);

  // Build heatmap matrix: rows = cohort months, columns = period index
  const heatmapData = useMemo(() => {
    if (cohortResult.cohorts.length === 0) return [];

    const cellMap = new Map<string, Map<number, number>>(); // cohortMonth -> periodIndex -> retentionRate
    for (const cell of cohortResult.cells) {
      let periodMap = cellMap.get(cell.cohortMonth);
      if (!periodMap) {
        periodMap = new Map<number, number>();
        cellMap.set(cell.cohortMonth, periodMap);
      }
      periodMap.set(cell.periodIndex, cell.retentionRate);
    }

    return cohortResult.cohorts.map((c) => ({
      month: c.month,
      size: c.size,
      periods: cellMap.get(c.month) || new Map<number, number>(),
    }));
  }, [cohortResult]);

  // Max period index across all cohorts (capped)
  const maxPeriod = useMemo(() => {
    let max = 0;
    for (const cell of cohortResult.cells) {
      if (cell.periodIndex > max) max = cell.periodIndex;
    }
    return Math.min(max, MAX_PERIOD_COLUMNS - 1);
  }, [cohortResult]);

  // Average retention by period for chart
  const avgRetentionData = useMemo(() => {
    return cohortResult.avgRetentionByPeriod
      .filter((p) => p.period <= MAX_PERIOD_COLUMNS - 1)
      .map((p) => ({
        period: `P${p.period}`,
        rate: isFinite(p.rate) ? Math.round(p.rate * 10) / 10 : 0,
      }));
  }, [cohortResult]);

  // KPI values
  const totalCohorts = cohortResult.cohorts.length;
  const avgRetentionP1 = cohortResult.avgRetentionByPeriod.find((p) => p.period === 1);
  const largestCohort = cohortResult.cohorts.reduce(
    (max, c) => (c.size > max ? c.size : max),
    0
  );

  if (totalCohorts === 0) return <EmptyState />;

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="코호트 수"
          value={totalCohorts}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="거래처의 최초 구매 월을 기준으로 그룹화한 수"
          description="코호트(동일 시기 첫 거래 고객 그룹) 수입니다. 각 코호트는 같은 월에 처음 거래를 시작한 고객들로 구성됩니다."
          benchmark="코호트 수가 6개 이상이면 추세 분석에 충분"
        />
        <KpiCard
          title="P1 평균 재구매율"
          value={avgRetentionP1?.rate ?? 0}
          format="percent"
          icon={<Repeat className="h-5 w-5" />}
          formula="P1 재구매율 = 첫 거래 다음 달에 다시 거래한 고객 수 ÷ 코호트 전체 고객 수 × 100"
          description="첫 거래 이후 1개월 뒤 재구매한 고객 비율의 전체 코호트 평균입니다. 초기 재구매율이 높을수록 고객 정착률이 좋습니다."
          benchmark="B2B 재구매율 P1이 40% 이상이면 양호"
        />
        <KpiCard
          title="최대 코호트 규모"
          value={largestCohort}
          format="number"
          icon={<Crown className="h-5 w-5" />}
          formula="코호트 중 최대 고객 수"
          description="가장 많은 신규 고객이 유입된 코호트의 고객 수입니다. 마케팅 캠페인이나 계절적 요인으로 특정 월에 대량 유입이 발생할 수 있습니다."
        />
      </div>

      {/* Cohort heatmap table */}
      <ChartCard
        title="코호트 리텐션 히트맵"
        formula="리텐션율(%) = 해당 기간에 재구매한 고객 수 ÷ 코호트 전체 고객 수 × 100"
        description="각 코호트(행)의 경과 기간(열)별 고객 유지율을 색상 농도로 표현합니다. 녹색이 진할수록 유지율이 높고, 붉은색일수록 이탈이 많습니다."
        benchmark="P3 이후 유지율이 30% 이상이면 안정적인 고객 기반"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-2 px-2 text-left font-medium border-b sticky left-0 bg-card z-10 min-w-[80px]">코호트</th>
                <th className="py-2 px-2 text-center font-medium border-b min-w-[40px]">규모</th>
                {Array.from({ length: maxPeriod + 1 }, (_, i) => (
                  <th key={i} className="py-2 px-1 text-center font-medium border-b min-w-[48px]">
                    P{i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapData.map((row) => (
                <tr key={row.month} className="hover:bg-muted/30 transition-colors">
                  <td className="py-1.5 px-2 font-medium border-b sticky left-0 bg-card z-10">{row.month}</td>
                  <td className="py-1.5 px-2 text-center border-b text-muted-foreground">{row.size}</td>
                  {Array.from({ length: maxPeriod + 1 }, (_, i) => {
                    const rate = row.periods.get(i);
                    const hasValue = rate !== undefined;
                    return (
                      <td
                        key={i}
                        className="py-1.5 px-1 text-center border-b font-mono"
                        style={{
                          backgroundColor: hasValue ? retentionColor(rate) : "transparent",
                          color: hasValue && rate >= 40 ? "white" : undefined,
                        }}
                      >
                        {hasValue ? `${isFinite(rate) ? rate.toFixed(0) : 0}%` : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Average retention by period line chart */}
      <ChartCard
        title="기간별 평균 리텐션율 추이"
        formula="각 기간(P0, P1, P2...)의 모든 코호트 리텐션율 평균"
        description="첫 거래 이후 시간이 경과함에 따라 고객 유지율이 어떻게 변화하는지 보여줍니다. 급격한 하락 구간이 고객 이탈의 핵심 시점입니다."
        benchmark="P3 이후 리텐션 하락이 완만해지면 안정적 고객층 형성"
      >
        <ChartContainer height="h-64 md:h-80">
          <LineChart data={avgRetentionData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => [`${Number(value).toFixed(1)}%`, "평균 리텐션율"]}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke={CHART_COLORS[0]}
              strokeWidth={2.5}
              dot={{ r: 4, fill: CHART_COLORS[0] }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              name="평균 리텐션율"
              {...ANIMATION_CONFIG}
            />
          </LineChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
