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

      {/* 판관비 항목별 계획 vs 실적 */}
      <ChartCard
        title="판관비 항목별 계획 vs 실적"
        isEmpty={chartData.length === 0}
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="13개 판관비 세부항목의 계획/실적 대비 및 차이율"
        description="판관비를 구성하는 13개 세부항목(변동 10개 + 고정 3개)의 계획 대비 실적을 비교합니다. 초과 항목은 원가 관리 개선 대상입니다."
        benchmark="전체 판관비율 15% 이내이면 양호, 항목별 차이율 ±10% 이내 정상"
        reason="판관비 초과/절감 항목을 식별하여 비용 절감 우선순위를 결정하고 예산 편성의 정확도를 높입니다"
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
          formula="조직별 변동 판관비 vs 고정 판관비 비교"
          description="각 영업조직의 판관비를 변동비와 고정비로 분류하여 비교합니다. 고정비 비중이 높으면 매출 감소 시 이익 악화 폭이 큽니다."
          benchmark="변동비 비중이 60% 이상이면 매출 연동 구조로 리스크 낮음"
          reason="조직별 비용 구조(변동/고정)를 파악하여 매출 변동 시 이익 영향을 예측하고 비용 최적화 방향을 수립합니다"
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
                      <p>판관비율: {d.sgaRate.toFixed(1)}%</p>
                      <p>변동비: {formatCurrency(d.variableSga, true)} ({d.variableRatio.toFixed(0)}%)</p>
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
          formula="각 항목의 실적금액 / 전체 판관비 실적 × 100"
          description="전체 판관비에서 각 항목이 차지하는 비중입니다. 상위 3개 항목이 전체의 70% 이상을 차지하면 집중 관리 대상입니다."
          benchmark="직접판매운반비, 지급수수료가 상위 항목이면 영업 활동 비용 구조"
          reason="판관비의 주요 구성 항목을 파악하여 비용 절감 효과가 큰 항목부터 우선 관리합니다"
        >
          <ChartContainer height="h-72 md:h-80">
            <BarChart data={sgaItems} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="item" tick={{ fontSize: 8 }} angle={-35} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
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
          formula="거래처별 판관비 세부 13개 항목 합산, 판관비율 = 판관비/매출 × 100"
          description="판관비 부담이 가장 큰 20개 거래처입니다. 판관비율이 높은 거래처는 영업 비용 효율이 낮으므로 거래 조건 재검토가 필요합니다."
          benchmark="거래처별 판관비율이 전체 평균의 2배 이상이면 비용 구조 점검"
          reason="거래처별 판관비 부담을 비교하여 비용 대비 수익이 낮은 거래처를 식별하고 영업 효율을 개선합니다"
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
                      {c.sgaRate.toFixed(1)}%
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(c.opMargin)}`}>
                      {c.opMargin.toFixed(1)}%
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
