"use client";

import { useMemo } from "react";
import {
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { AlertTriangle, BarChart3, Target, TrendingDown } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, extractMonth, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { detectAnomalies } from "@/lib/analysis/anomalyDetection";
import type { SalesRecord } from "@/types";

interface AnomalyTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

export function AnomalyTab({ filteredSales, isDateFiltered }: AnomalyTabProps) {
  // Build monthly aggregated data
  const monthlyData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredSales) {
      const month = extractMonth(r.매출일);
      if (!month) continue;
      map.set(month, (map.get(month) ?? 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .map(([month, value]) => ({ month, value }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredSales]);

  // Detect anomalies
  const stats = useMemo(() => detectAnomalies(monthlyData), [monthlyData]);

  // Merge anomaly info into chart data
  const chartData = useMemo(() => {
    const anomalyMonths = new Set(stats.anomalies.map((a) => a.month));
    return monthlyData.map((d) => ({
      ...d,
      isAnomaly: anomalyMonths.has(d.month),
    }));
  }, [monthlyData, stats]);

  if (monthlyData.length === 0) return <EmptyState />;

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="이상치 건수"
          value={stats.anomalies.length}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="IQR 범위(Q1-1.5*IQR ~ Q3+1.5*IQR) 벗어난 월 수"
          description="사분위수 범위(IQR) 기반으로 탐지된 월별 매출 이상치 건수입니다. 이상치는 정상적인 매출 변동 범위를 크게 벗어난 월을 의미합니다."
          benchmark="전체 데이터의 5% 이내면 정상적인 변동 범위"
          reason="매출 데이터의 이상치를 자동 탐지하여 입력 오류, 비정상 거래, 급변 추세를 조기 발견하고, 데이터 품질을 확보합니다."
        />
        <KpiCard
          title="이상치 비율"
          value={stats.anomalyRate}
          format="percent"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="이상치 비율(%) = 이상치 월 수 ÷ 전체 월 수 × 100"
          description="전체 분석 기간 중 이상치로 판정된 월의 비율입니다. 높을수록 매출 변동이 불안정하다는 신호입니다."
          benchmark="10% 이하면 안정적, 20% 이상이면 원인 분석 필요"
          reason="이상치 발생 빈도를 파악하여 매출 변동의 안정성을 평가하고, 높은 비율일 경우 구조적 원인(시장 변화, 특수 거래 등)을 조사합니다."
        />
        <KpiCard
          title="Q1 (하위 25%)"
          value={stats.q1}
          format="currency"
          icon={<TrendingDown className="h-5 w-5" />}
          formula="월별 매출을 오름차순 정렬 후 25번째 백분위값"
          description="월별 매출의 1사분위수(Q1)입니다. 이 값 아래로 떨어지면 매출이 하위 25%에 해당합니다."
          reason="매출 하한 기준선을 설정하여 월 매출이 이 수준 이하로 떨어질 때 비수기 또는 이상 상황을 인지하고, 선제적 영업 활동을 전개합니다."
        />
        <KpiCard
          title="Q3 (상위 25%)"
          value={stats.q3}
          format="currency"
          icon={<Target className="h-5 w-5" />}
          formula="월별 매출을 오름차순 정렬 후 75번째 백분위값"
          description="월별 매출의 3사분위수(Q3)입니다. 이 값을 넘으면 매출이 상위 25%에 해당합니다."
          reason="매출 상한 기준선을 파악하여 월 매출이 이 수준을 초과할 때 특수 요인(대형 계약, 일시적 수요 등)을 식별하고, 지속 가능성을 검증합니다."
        />
      </div>

      {/* Main chart: monthly sales with anomaly highlighting and reference lines */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="월별 매출 이상치 탐지"
        formula="IQR 방식: Q1-1.5×IQR 미만 또는 Q3+1.5×IQR 초과 시 이상치"
        description="각 월의 매출액을 막대그래프로 표시하고, IQR 기반 상한/하한 경계를 기준선으로 나타냅니다. 빨간색 막대는 경계를 벗어난 이상치입니다."
        benchmark="이상치가 연속 2개월 이상 나타나면 구조적 문제 점검 필요"
        reason="통계적 기법으로 정상 매출 범위를 시각화하여 비정상적 월을 즉시 식별하고, 원인 규명을 통해 반복 방지 또는 성공 요인 확산에 활용합니다."
      >
        <ChartContainer height="h-72 md:h-96">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                if (name === "매출액") return [formatCurrency(Number(value)), name];
                return [value, name];
              }}
              labelFormatter={(label: any) => {
                const item = chartData.find((d) => d.month === label);
                return item?.isAnomaly ? `${label} (이상치)` : label;
              }}
            />
            <Bar dataKey="value" name="매출액" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
              {chartData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.isAnomaly ? CHART_COLORS[4] : CHART_COLORS[0]}
                />
              ))}
            </Bar>
            {stats.upperFence > 0 && (
              <ReferenceLine
                y={stats.upperFence}
                stroke={CHART_COLORS[4]}
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{ value: "상한", position: "insideTopRight", fontSize: 11, fill: CHART_COLORS[4] }}
              />
            )}
            {stats.lowerFence > 0 && (
              <ReferenceLine
                y={stats.lowerFence}
                stroke={CHART_COLORS[3]}
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{ value: "하한", position: "insideBottomRight", fontSize: 11, fill: CHART_COLORS[3] }}
              />
            )}
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {/* Anomaly detail table */}
      {stats.anomalies.length > 0 && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="이상치 상세 목록"
          description="탐지된 이상치의 월, 매출액, 유형, 경계 이탈 금액을 보여줍니다."
          reason="이상치 발생 월별 상세 정보를 제공하여 개별 이상치의 원인(특수 계약, 시장 이벤트, 데이터 오류 등)을 추적하고, 후속 조치 우선순위를 결정합니다."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-3 font-medium">월</th>
                  <th className="py-2 px-3 font-medium text-right">매출액</th>
                  <th className="py-2 px-3 font-medium text-center">유형</th>
                  <th className="py-2 px-3 font-medium text-right">이탈 금액</th>
                </tr>
              </thead>
              <tbody>
                {stats.anomalies.map((a) => (
                  <tr key={a.month} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-2 px-3 font-medium">{a.month}</td>
                    <td className="py-2 px-3 text-right">{formatCurrency(a.value)}</td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.type === "upper"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        }`}
                      >
                        {a.type === "upper" ? "상한 초과" : "하한 미달"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{formatCurrency(a.deviation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </>
  );
}
