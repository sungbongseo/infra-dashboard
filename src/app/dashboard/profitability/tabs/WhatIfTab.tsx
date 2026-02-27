"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcWhatIfScenario, calcScenarioSummary, calcSensitivity } from "@/lib/analysis/whatif";
import type { ScenarioParams } from "@/lib/analysis/whatif";

interface WhatIfTabProps {
  isDateFiltered?: boolean;
  filteredOrgProfit: any[];
}

export function WhatIfTab({ filteredOrgProfit, isDateFiltered }: WhatIfTabProps) {
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    salesChangePercent: 0,
    costRateChangePoints: 0,
    sgaChangePercent: 0,
  });
  const scenarioResults = useMemo(
    () => calcWhatIfScenario(filteredOrgProfit, scenarioParams),
    [filteredOrgProfit, scenarioParams]
  );
  const scenarioSummary = useMemo(
    () => calcScenarioSummary(scenarioResults),
    [scenarioResults]
  );
  const sensitivityData = useMemo(
    () => calcSensitivity(filteredOrgProfit, "sales", [-20, -15, -10, -5, 0, 5, 10, 15, 20]),
    [filteredOrgProfit]
  );

  return (
    <>
      {/* Scenario Sliders */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">시나리오 파라미터 조정</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium">매출 변동: {scenarioParams.salesChangePercent > 0 ? "+" : ""}{scenarioParams.salesChangePercent}%</label>
              <input type="range" min={-30} max={30} step={1} value={scenarioParams.salesChangePercent}
                onChange={(e) => setScenarioParams(p => ({ ...p, salesChangePercent: Number(e.target.value) }))}
                className="w-full accent-primary" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">원가율 변동: {scenarioParams.costRateChangePoints > 0 ? "+" : ""}{scenarioParams.costRateChangePoints}%p</label>
              <input type="range" min={-10} max={10} step={0.5} value={scenarioParams.costRateChangePoints}
                onChange={(e) => setScenarioParams(p => ({ ...p, costRateChangePoints: Number(e.target.value) }))}
                className="w-full accent-primary" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium">판관비 변동: {scenarioParams.sgaChangePercent > 0 ? "+" : ""}{scenarioParams.sgaChangePercent}%</label>
              <input type="range" min={-30} max={30} step={1} value={scenarioParams.sgaChangePercent}
                onChange={(e) => setScenarioParams(p => ({ ...p, sgaChangePercent: Number(e.target.value) }))}
                className="w-full accent-primary" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scenario KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="시나리오 매출" value={scenarioSummary.scenarioTotalSales} previousValue={scenarioSummary.baseTotalSales} format="currency" formula="시나리오 매출 = 기준 매출 × (1 + 매출 변동률)" description="위에서 설정한 매출 변동률을 적용했을 때의 예상 매출액입니다. 기준(Base) 매출 대비 증감 화살표로 변화를 확인할 수 있습니다." benchmark="기준 대비 증감률 ±10% 이내가 현실적인 시나리오 범위입니다" reason="매출 변동 시나리오별 예상 금액을 확인하여 영업 목표 설정과 자원 배분 계획의 근거를 마련합니다" />
        <KpiCard title="시나리오 영업이익" value={scenarioSummary.scenarioTotalOperatingProfit} previousValue={scenarioSummary.baseTotalOperatingProfit} format="currency" formula="시나리오 영업이익 = 시나리오 매출 - 시나리오 원가 - 시나리오 판관비" description="매출, 원가율, 판관비를 모두 변동시켰을 때의 예상 영업이익입니다. 기준 대비 얼마나 이익이 늘거나 줄어드는지 보여줍니다." benchmark="시나리오 영업이익이 양수면 수익성 유지, 음수 전환 시 비용 구조 재검토 필요" reason="복합 변수 변동 시 영업이익의 변화를 사전에 시뮬레이션하여 의사결정의 재무적 영향을 검증합니다" />
        <KpiCard title="시나리오 영업이익율" value={scenarioSummary.scenarioAvgMargin} previousValue={scenarioSummary.baseAvgMargin} format="percent" formula="시나리오 영업이익율(%) = 시나리오 영업이익 ÷ 시나리오 매출 × 100" description="시나리오 적용 후 예상되는 영업이익율입니다. 기준 대비 이익율 변화를 통해 수익 구조 변화를 확인할 수 있습니다." benchmark="영업이익율 5% 이상 유지가 최소 목표, 10% 이상이면 양호한 수익 구조" reason="시나리오별 이익율 변화를 비교하여 수익 구조가 어느 수준까지 유지되는지 한계점을 파악합니다" />
        <KpiCard title="분석 조직 수" value={scenarioResults.length} format="number" formula="손익 데이터가 있는 조직 중 시나리오 변수 적용이 가능한 조직 수" description="시나리오 분석 대상이 되는 조직의 수입니다." benchmark="전체 조직이 모두 포함되어야 정확한 시나리오 비교가 가능합니다" reason="분석 대상 범위를 확인하여 시나리오 결과의 신뢰성과 대표성을 판단합니다" />
      </div>

      {/* Base vs Scenario comparison bar */}
      <ChartCard title="조직별 Base vs 시나리오 영업이익" dataSourceType="snapshot" isDateFiltered={isDateFiltered} formula="회색 막대 = 기준(Base) 영업이익, 파란 막대 = 시나리오 영업이익" description="각 조직의 현재 영업이익(Base)과 시나리오 적용 후 예상 영업이익을 나란히 비교합니다. 두 막대 차이가 클수록 해당 시나리오 변수에 민감한 조직이며, 시나리오 막대가 더 크면 개선 효과, 더 작으면 악화 효과입니다." benchmark="시나리오 막대가 Base보다 크면 긍정적 효과, 작으면 부정적 효과입니다" reason="조직별 시나리오 민감도 차이를 비교하여 변동에 취약한 조직을 식별하고, 리스크 대비 조치의 우선순위를 설정합니다">
        <ChartContainer height="h-64 md:h-80">
            <BarChart data={scenarioResults.slice(0, 10)}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="baseOperatingProfit" name="Base" fill={CHART_COLORS[5]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="scenarioOperatingProfit" name="시나리오" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* Sensitivity chart */}
      <ChartCard title="매출 변동 민감도 분석" dataSourceType="snapshot" isDateFiltered={isDateFiltered} formula="매출이 -20%에서 +20%까지 변할 때 영업이익과 영업이익율의 변화" description="매출이 일정 비율로 증가하거나 감소할 때 영업이익(막대)과 영업이익율(꺾은선)이 어떻게 변하는지 보여줍니다. 막대와 꺾은선의 기울기가 가파를수록 매출 변동에 민감한 수익 구조입니다. 매출 감소 시 영업이익이 급격히 줄어드는 구간을 주의해야 합니다." benchmark="매출 10% 감소 시에도 영업이익이 양수이면 비교적 안전한 수익 구조입니다" reason="매출 변동에 따른 이익의 민감도를 파악하여 경기 변동 시 이익이 어떻게 달라지는지 사전에 대비하고, 영업이익이 0이 되는 임계점을 확인합니다">
        <ChartContainer height="h-64 md:h-80">
            <ComposedChart data={sensitivityData}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="paramValue" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <RechartsTooltip formatter={(v: any, name: any) => name === "operatingMargin" ? `${Number(v).toFixed(1)}%` : formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="operatingProfit" name="영업이익" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Line type="monotone" dataKey="operatingMargin" name="영업이익율(%)" stroke={CHART_COLORS[3]} strokeWidth={2} yAxisId="right" activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
            </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
