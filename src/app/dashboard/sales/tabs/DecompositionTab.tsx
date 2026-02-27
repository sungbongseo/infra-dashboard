"use client";

import { useMemo } from "react";
import {
  Line,
  Bar,
  BarChart,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Activity, Waves, Info } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, extractMonth, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { decomposeTimeSeries } from "@/lib/analysis/timeSeriesDecomposition";
import type { SalesRecord } from "@/types";

interface DecompositionTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

const TREND_ICONS: Record<string, React.ReactNode> = {
  up: <TrendingUp className="h-5 w-5" />,
  down: <TrendingDown className="h-5 w-5" />,
  flat: <Minus className="h-5 w-5" />,
};

const TREND_LABELS: Record<string, string> = {
  up: "상승",
  down: "하락",
  flat: "보합",
};

const MONTH_LABELS = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

export function DecompositionTab({ filteredSales, isDateFiltered }: DecompositionTabProps) {
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

  // Decompose time series
  const decomposition = useMemo(() => decomposeTimeSeries(monthlyData), [monthlyData]);

  // Seasonal pattern bar chart data
  const seasonalBarData = useMemo(() => {
    return decomposition.seasonalPattern.map((p) => ({
      month: MONTH_LABELS[p.monthIndex - 1] || `${p.monthIndex}월`,
      factor: isFinite(p.factor) ? p.factor : 0,
    }));
  }, [decomposition]);

  // KPI: trend direction as number for display (1=up, -1=down, 0=flat)
  const trendValue = decomposition.trendDirection === "up" ? 1 : decomposition.trendDirection === "down" ? -1 : 0;

  if (monthlyData.length === 0) return <EmptyState />;

  // Not enough data for decomposition
  if (decomposition.points.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground gap-2">
        <Activity className="h-8 w-8 text-muted-foreground/50" />
        <p>시계열 분해에는 최소 13개월 이상의 데이터가 필요합니다.</p>
        <p className="text-xs">현재 {monthlyData.length}개월 데이터가 있습니다.</p>
      </div>
    );
  }

  return (
    <>
      {/* Data quality warning */}
      {decomposition.dataQuality === "limited" && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">데이터 부족 주의:</span>{" "}
            현재 {monthlyData.length}개월 데이터로 분석 중입니다. 시계열 분해의 신뢰도를 높이려면 24개월 이상의 데이터가 권장됩니다.
            계절성 패턴은 참고 수준으로 활용하세요.
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="추세 방향"
          value={trendValue}
          format="number"
          icon={TREND_ICONS[decomposition.trendDirection]}
          formula="전반기 평균 추세 vs 후반기 평균 추세 비교 (±5% 기준)"
          description={`현재 매출 추세가 ${TREND_LABELS[decomposition.trendDirection]}세입니다. 이동평균 기반으로 전반기와 후반기의 추세 수준을 비교하여 방향을 판단합니다.`}
          benchmark="상승 추세 유지가 건전한 성장의 기본"
          reason="매출의 장기적 성장/하락 방향을 파악하여 일시적 변동과 구조적 추세를 구분하고, 전략적 의사결정의 기본 방향을 설정합니다."
        />
        <KpiCard
          title="계절성 강도"
          value={decomposition.seasonalStrength * 100}
          format="percent"
          icon={<Waves className="h-5 w-5" />}
          formula="계절성 강도 = 1 - Var(잔차) / Var(비추세) × 100"
          description="매출 변동 중 계절적 패턴이 차지하는 비중입니다. 높을수록 특정 월에 매출이 집중되는 경향이 강합니다."
          benchmark="50% 이상이면 뚜렷한 계절성, 자원 배분 시 고려 필요"
          reason="계절적 변동의 영향력을 정량화하여 성수기/비수기 자원 배분(인력, 재고, 예산) 계획의 근거를 마련합니다."
        />
        <KpiCard
          title="분석 데이터 수"
          value={decomposition.points.length}
          format="number"
          icon={<Activity className="h-5 w-5" />}
          formula="월별 매출 데이터 포인트 수"
          description="시계열 분해에 사용된 월별 데이터 포인트 수입니다. 많을수록 분해 결과의 신뢰도가 높아집니다."
          benchmark="24개월 이상이면 계절성 분석 신뢰도 양호"
          reason="시계열 분해의 통계적 신뢰도를 판단하여 분석 결과의 활용 범위를 결정하고, 데이터 축적 기간의 충분성을 점검합니다."
        />
      </div>

      {/* Original + Trend overlay */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="원본 매출 & 추세"
        formula="추세 = 중심 이동평균(12개월 윈도우)"
        description="원본 월별 매출(막대)과 이동평균 기반 추세선(라인)을 겹쳐 보여줍니다. 추세선은 단기 변동을 제거한 장기적 매출 방향을 나타냅니다."
        benchmark="추세선이 지속적으로 우상향하면 성장세 유지"
        reason="매출 시계열을 추세선과 함께 시각화하여 진정한 성장 추세와 일시적 변동을 구분하고, 정확한 수요 예측 기반을 마련합니다."
      >
        <ChartContainer height="h-64 md:h-80">
          <ComposedChart data={decomposition.points} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
            />
            <Legend />
            <Bar dataKey="original" name="원본 매출" fill={CHART_COLORS[0]} fillOpacity={0.5} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            <Line
              type="monotone"
              dataKey="trend"
              name="추세"
              stroke={CHART_COLORS[4]}
              strokeWidth={2.5}
              dot={false}
              {...ANIMATION_CONFIG}
            />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Seasonal component */}
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="계절 성분"
          formula="계절 성분 = 비추세(원본-추세)의 동일 월 평균"
          description="각 월의 계절적 기여도입니다. 양수이면 해당 월이 연평균 이상의 매출을 보이는 시기이고, 음수이면 비수기입니다. 자원 배분(인력, 재고)에 활용하세요."
          benchmark="계절 성분 편차가 월 매출의 20% 이상이면 계절성 뚜렷"
          reason="월별 계절적 영향을 분리하여 성수기/비수기 패턴을 정확히 파악하고, 인력 배치와 재고 관리 등 자원 배분 계획에 반영합니다."
        >
          <ChartContainer height="h-56 md:h-72">
            <ComposedChart data={decomposition.points} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any) => [formatCurrency(Number(value)), "계절 성분"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="seasonal"
                name="계절 성분"
                stroke={CHART_COLORS[2]}
                strokeWidth={2}
                dot={{ r: 3 }}
                {...ANIMATION_CONFIG}
              />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>

        {/* Residual component */}
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="잔차 성분"
          formula="잔차 = 원본 - 추세 - 계절"
          description="추세와 계절성으로 설명되지 않는 불규칙 변동입니다. 잔차가 크면 예상치 못한 이벤트(특수 계약, 시장 변화 등)의 영향입니다."
          benchmark="잔차의 표준편차가 작을수록 예측 가능한 매출 패턴"
          reason="추세와 계절성으로 설명되지 않는 돌발 변동을 분리하여 특수 이벤트(대형 계약, 시장 충격 등)의 영향을 식별하고, 예측 모델의 정확도를 개선합니다."
        >
          <ChartContainer height="h-56 md:h-72">
            <ComposedChart data={decomposition.points} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any) => [formatCurrency(Number(value)), "잔차"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="residual"
                name="잔차"
                stroke={CHART_COLORS[3]}
                strokeWidth={1.5}
                dot={{ r: 2 }}
                {...ANIMATION_CONFIG}
              />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Monthly seasonal pattern */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="월별 계절 패턴"
        formula="각 월(1-12)의 계절 성분 평균값 (합계=0으로 정규화)"
        description="12개월 기준 각 월의 평균 계절적 영향을 보여줍니다. 양수 월은 계절적으로 매출이 높고, 음수 월은 낮은 시기입니다."
        benchmark="Q4(10-12월) 계절 효과가 양수이면 전형적인 B2B 패턴"
        reason="12개월 기준 계절 패턴을 요약하여 연간 영업 계획 수립 시 월별 목표를 현실적으로 배분하고, 비수기 대응 전략을 사전에 준비합니다."
      >
        <ChartContainer height="h-56 md:h-72">
          <BarChart data={seasonalBarData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => [formatCurrency(Number(value)), "계절 요인"]}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <Bar dataKey="factor" name="계절 요인" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
              {seasonalBarData.map((entry, idx) => (
                <Cell key={idx} fill={entry.factor >= 0 ? CHART_COLORS[1] : CHART_COLORS[4]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
