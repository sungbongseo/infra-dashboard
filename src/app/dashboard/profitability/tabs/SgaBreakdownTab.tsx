"use client";

import { useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
} from "recharts";
import {
  ChartContainer,
  GRID_PROPS,
  BAR_RADIUS_TOP,
  BAR_RADIUS_RIGHT,
  ACTIVE_BAR,
  ANIMATION_CONFIG,
  getMarginColor,
} from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcSgaBreakdown,
  calcOrgSgaProfile,
  calcCustomerSgaBurden,
} from "@/lib/analysis/sgaBreakdown";
import type { OrgCustomerProfitRecord } from "@/types";

interface SgaBreakdownTabProps {
  filteredOrgCustProfit: OrgCustomerProfitRecord[];
  isDateFiltered?: boolean;
}

export function SgaBreakdownTab({
  filteredOrgCustProfit,
  isDateFiltered,
}: SgaBreakdownTabProps) {
  const sgaItems = useMemo(
    () => calcSgaBreakdown(filteredOrgCustProfit),
    [filteredOrgCustProfit]
  );

  const orgProfile = useMemo(
    () => calcOrgSgaProfile(filteredOrgCustProfit),
    [filteredOrgCustProfit]
  );

  const customerBurden = useMemo(
    () => calcCustomerSgaBurden(filteredOrgCustProfit),
    [filteredOrgCustProfit]
  );

  // 판관비 최대 항목 인사이트
  const sgaInsight = useMemo(() => {
    if (sgaItems.length === 0) return null;
    const totalActual = sgaItems.reduce((s, d) => s + d.actual, 0);
    if (totalActual <= 0) return null;
    const top = sgaItems[0];
    const topPct = (top.actual / totalActual) * 100;
    const overBudget = sgaItems.filter((d) => d.actual > d.plan && d.plan > 0);
    return { topItem: top.item, topPct, overBudgetCount: overBudget.length };
  }, [sgaItems]);

  if (sgaItems.length === 0) {
    return <EmptyState />;
  }

  const chartData = sgaItems.map((d) => ({
    name: d.item,
    실적: d.actual,
    계획: d.plan,
    차이율: d.varianceRate,
    비중: d.share,
    isOver: d.actual > d.plan,
  }));

  return (
    <>
      {/* 스냅샷 안내 */}
      {isDateFiltered && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-400">
          303 데이터는 스냅샷 보고서로 기간 필터가 적용되지 않습니다. 표시된 수치는 보고서 전체 기간의 누적 데이터입니다.
        </div>
      )}

      {sgaInsight && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
          <p className="font-medium">판관비 핵심 요약</p>
          <p className="text-muted-foreground">
            최대 항목: {sgaInsight.topItem} (전체의 {sgaInsight.topPct.toFixed(1)}%)
            {sgaInsight.overBudgetCount > 0 && ` | 예산 초과 항목: ${sgaInsight.overBudgetCount}개 — 초과 원인 분석이 필요합니다.`}
          </p>
        </div>
      )}

      {/* 판관비 항목별 계획 vs 실적 */}
      <ChartCard
        title="판관비 항목별 계획 vs 실적"
        isEmpty={chartData.length === 0}
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="차이율(%) = (실적 - 계획) ÷ |계획| × 100\n빨간색 = 계획 초과(비용 증가), 초록색 = 계획 이하(비용 절감)"
        description="판관비(판매비와 관리비)는 제품을 만드는 비용(원가)을 제외한 영업·관리 활동에 드는 비용입니다. 변동 판관비(10개: 운반비, 수수료 등 매출에 비례)와 고정 판관비(3개: 노무비, 감가상각비, 경비 등 매출과 무관)로 나뉩니다. 빨간색 막대는 계획보다 많이 쓴 항목으로, 비용 절감 우선 대상입니다."
        benchmark="전체 판관비율 15% 이내이면 양호. 항목별 차이율 ±10% 이내이면 정상, ±20% 초과 시 원인 분석 필요"
        reason="어떤 비용 항목이 계획을 초과했는지 한눈에 파악하여, 비용 절감 우선순위를 정하고 다음 분기 예산의 정확도를 높입니다"
      >
        <ChartContainer minHeight={400}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 9 }} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
            />
            <Legend />
            <Bar dataKey="계획" fill={CHART_COLORS[0]} radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG} />
            <Bar dataKey="실적" fill={CHART_COLORS[2]} radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
              {chartData.map((entry, idx) => (
                <Cell key={idx} fill={entry.isOver ? "hsl(0, 65%, 55%)" : "hsl(145, 60%, 42%)"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 조직별 판관비 구조 */}
        <ChartCard
          title="조직별 판관비 구조"
          isEmpty={orgProfile.length === 0}
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="판관비율 = 판관비 합계 ÷ 매출액 × 100\n변동비 비중 = 변동 판관비 ÷ 전체 판관비 × 100"
          description="각 영업조직의 판관비를 변동비(매출에 비례하여 변하는 비용)와 고정비(매출과 무관하게 발생하는 비용)로 나누어 보여줍니다. 고정비 비중이 높은 조직은 매출이 줄어도 비용이 줄지 않아 이익 악화 폭이 크고, 변동비 비중이 높으면 매출 감소 시 비용도 함께 줄어 충격이 적습니다."
          benchmark="변동비 비중이 60% 이상이면 매출 연동 구조로 리스크 낮음. 고정비 비중이 50% 이상이면 구조적 점검 필요"
          reason="조직별 비용 구조(변동/고정 비율)를 파악하여 매출 변동 시 이익 영향을 예측하고, 고정비 비중이 높은 조직의 비용 최적화 방향을 수립합니다"
        >
          <ChartContainer height="h-72 md:h-80">
            <BarChart data={orgProfile} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold">{d.org}</p>
                      <p>판관비율: {isFinite(d.sgaRate) ? d.sgaRate.toFixed(1) : "-"}%</p>
                      <p>변동비: {formatCurrency(d.variableSga, true)} ({isFinite(d.variableRatio) ? d.variableRatio.toFixed(0) : "-"}%)</p>
                      <p>고정비: {formatCurrency(d.fixedSga, true)}</p>
                      <p>최대항목: {d.topItem} ({formatCurrency(d.topItemAmount, true)})</p>
                    </div>
                  );
                }}
              />
              <Legend />
              <Bar dataKey="variableSga" name="변동 판관비" stackId="sga" fill={CHART_COLORS[0]} {...ANIMATION_CONFIG} />
              <Bar dataKey="fixedSga" name="고정 판관비" stackId="sga" fill={CHART_COLORS[3]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 판관비 항목별 비중 */}
        <ChartCard
          title="판관비 항목별 비중"
          isEmpty={sgaItems.length === 0}
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="비중(%) = |항목별 실적금액| ÷ Σ|전체 판관비 실적| × 100"
          description="전체 판관비에서 각 항목이 차지하는 비중입니다. 비중이 높은 항목일수록 절감 시 효과가 크므로 우선 관리 대상입니다. 상위 3개 항목이 전체의 70% 이상이면 집중 관리가 필요합니다."
          benchmark="직접판매운반비, 지급수수료가 상위 항목이면 영업활동 비용 구조. 노무비가 상위이면 인건비 구조 점검"
          reason="판관비 구성 비중을 파악하여, 절감 효과가 가장 큰 항목부터 우선 관리합니다. 파레토 법칙처럼 상위 몇 개 항목에서 대부분의 비용이 발생합니다."
        >
          <ChartContainer height="h-72 md:h-80">
            <BarChart data={sgaItems} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="item" tick={{ fontSize: 8 }} angle={-35} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [`${isFinite(Number(v)) ? Number(v).toFixed(1) : "-"}%`, name]}
              />
              <Bar dataKey="share" name="비중" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* 거래처별 판관비 부담 Top 20 */}
      {customerBurden.length > 0 && (
        <ChartCard
          title="거래처별 판관비 부담 Top 20"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="거래처별 판관비 = 13개 판관비 세부항목 합산\n판관비율 = 판관비 ÷ 매출액 × 100\n영업이익률 = 영업이익 ÷ 매출액 × 100"
          description="판관비 부담이 큰 상위 20개 거래처입니다. 판관비율이 높은 거래처는 매출 대비 영업비용이 많이 드는 거래처이므로, 거래 조건(물류, 수수료 등) 재검토가 필요합니다. 영업이익률이 마이너스인 거래처는 거래할수록 손해가 발생합니다."
          benchmark="거래처별 판관비율이 전체 평균의 2배 이상이면 비용 구조 점검. 영업이익률 마이너스 거래처는 즉시 개선 필요"
          reason="거래처별 판관비 부담을 비교하여 '매출은 크지만 비용도 많이 드는' 거래처를 식별하고, 거래 조건 개선 또는 거래처 재편의 근거를 마련합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium">조직</th>
                  <th className="py-2 px-3 font-medium text-right">매출액</th>
                  <th className="py-2 px-3 font-medium text-right">판관비</th>
                  <th className="py-2 px-3 font-medium text-right">판관비율</th>
                  <th className="py-2 px-3 font-medium text-right">영업이익률</th>
                  <th className="py-2 px-3 font-medium text-right">최대항목</th>
                </tr>
              </thead>
              <tbody>
                {customerBurden.map((c) => (
                  <tr key={c.customer} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-1.5 px-3 font-medium">{c.customer}</td>
                    <td className="py-1.5 px-3 text-muted-foreground text-xs">{c.org}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(c.sales)}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(c.sga)}</td>
                    <td className="py-1.5 px-3 text-right font-medium">
                      {isFinite(c.sgaRate) ? c.sgaRate.toFixed(1) : "-"}%
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(c.opMargin)}`}>
                      {isFinite(c.opMargin) ? c.opMargin.toFixed(1) : "-"}%
                    </td>
                    <td className="py-1.5 px-3 text-right text-xs text-muted-foreground">
                      {c.topSgaItem}
                    </td>
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
