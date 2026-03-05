"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, ReferenceLine,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { TrendingDown, TrendingUp, Percent } from "lucide-react";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcStandardCostVariance,
  calcCostVarianceSummary,
  calcCostVarianceByOrg,
} from "@/lib/analysis/standardCostVariance";
import type { ItemProfitabilityRecord } from "@/types";

interface StandardCostTabProps {
  isDateFiltered?: boolean;
  filteredItemProfitability: ItemProfitabilityRecord[];
}

export function StandardCostTab({ isDateFiltered, filteredItemProfitability }: StandardCostTabProps) {
  const summary = useMemo(
    () => calcCostVarianceSummary(filteredItemProfitability),
    [filteredItemProfitability]
  );

  const top20Items = useMemo(() => {
    const all = calcStandardCostVariance(filteredItemProfitability);
    return all.slice(0, 20).map((item) => ({
      name: truncateLabel(item.product, 18),
      fullName: `${item.product} (${item.org})`,
      차이: item.variance,
      isOver: item.variance > 0,
    }));
  }, [filteredItemProfitability]);

  const accountTypeData = useMemo(() =>
    summary.byAccountType.map((a) => ({
      name: a.accountType,
      평균차이율: a.avgVarianceRate,
      isOver: a.avgVarianceRate > 0,
    })),
    [summary.byAccountType]
  );

  const orgData = useMemo(() => {
    const orgs = calcCostVarianceByOrg(filteredItemProfitability);
    return orgs.map((o) => ({
      name: truncateLabel(o.org, 10),
      fullName: o.org,
      평균차이율: o.avgVarianceRate,
      isOver: o.avgVarianceRate > 0,
      품목수: o.itemCount,
      초과: o.overCount,
      절감: o.underCount,
    }));
  }, [filteredItemProfitability]);

  if (filteredItemProfitability.length === 0 || summary.totalItems === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* 스냅샷 데이터 안내 */}
      {isDateFiltered && (
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-400">
          표준원가 데이터(200)는 스냅샷 보고서로 기간 필터가 적용되지 않습니다. 표시된 수치는 보고서 전체 기간의 누적 데이터입니다.
        </div>
      )}

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="원가 초과 품목"
          value={summary.overCount}
          format="number"
          icon={<TrendingUp className="h-5 w-5" />}
          description={`${summary.totalItems}개 품목 중 ${summary.overCount}개가 표준원가보다 실적원가가 높습니다. 초과 금액 합계: ${formatCurrency(summary.overAmount, true)}`}
          formula="실적매출원가 > 표준매출원가인 품목 수"
          benchmark="전체의 30% 미만이면 양호, 50% 이상이면 원가 관리 체계 점검 필요"
          reason="표준원가를 초과한 품목을 식별하여 원가 상승 원인(원재료 가격, 생산 비효율 등)을 분석하고 개선 방안을 도출합니다"
        />
        <KpiCard
          title="원가 절감 품목"
          value={summary.underCount}
          format="number"
          icon={<TrendingDown className="h-5 w-5" />}
          description={`${summary.totalItems}개 품목 중 ${summary.underCount}개가 표준원가보다 실적원가가 낮습니다. 절감 금액 합계: ${formatCurrency(summary.underAmount, true)}`}
          formula="실적매출원가 < 표준매출원가인 품목 수"
          benchmark="절감 품목이 많을수록 원가 관리 우수. 절감 요인을 다른 품목에 전파 가능"
          reason="원가 절감에 성공한 품목의 요인을 분석하여 우수 사례를 다른 품목에 확대 적용합니다"
        />
        <KpiCard
          title="전체 평균 차이율"
          value={summary.avgVarianceRate}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          description="전체 품목의 표준원가 대비 실적원가 차이율입니다. 양수면 전반적으로 원가가 초과, 음수면 절감"
          formula="(전체 실적원가 합계 - 전체 표준원가 합계) / |전체 표준원가 합계| x 100"
          benchmark="±3% 이내 양호, ±5% 이내 주의, 5% 초과 시 긴급 원인 분석 필요"
          reason="전체적인 원가 관리 수준을 한 눈에 파악하여 경영진 보고와 원가 전략 수립의 기초 지표로 활용합니다"
        />
      </div>

      {/* 원가 차이 Top 20 품목 */}
      <ChartCard
        title="표준원가 차이 Top 20 품목"
        isEmpty={top20Items.length === 0}
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="실적매출원가 - 표준매출원가 차이의 절대값이 큰 순서로 상위 20개 품목 추출"
        description="표준원가 대비 실적원가의 차이가 가장 큰 20개 품목입니다. 빨간색=원가 초과(실적 > 표준), 초록색=원가 절감(실적 < 표준). 가장 큰 차이를 보이는 품목부터 원인 분석이 필요합니다"
        benchmark="A등급 주력 품목이 초과 목록에 포함되면 매출총이익 영향이 크므로 즉시 대응"
        reason="차이 금액이 큰 품목부터 우선 분석하여 원가 절감 효과가 가장 큰 영역에 관리 자원을 집중합니다"
      >
        <ChartContainer minHeight={Math.max(top20Items.length * 28, 400)}>
          <BarChart
            data={top20Items}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 8 }} interval={0} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.fullName || ""}
              formatter={(v: any, _name: any) => [formatCurrency(Number(v)), "원가 차이"]}
            />
            <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
            <Bar dataKey="차이" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
              {top20Items.map((entry, idx) => (
                <Cell key={idx} fill={entry.isOver ? "hsl(0, 65%, 55%)" : "hsl(145, 60%, 42%)"} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 계정구분별 평균 차이율 */}
        <ChartCard
          title="계정구분별 평균 차이율"
          isEmpty={accountTypeData.length === 0}
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="계정구분별 (실적원가 합계 - 표준원가 합계) / |표준원가 합계| x 100"
          description="제품/상품/원자재/부재료 등 계정구분별 표준원가 차이율입니다. 어떤 유형의 품목에서 원가 초과/절감이 발생하는지 파악합니다"
          benchmark="제품 계정의 차이율이 가장 중요 (매출 비중 최대). ±5% 이내 정상"
          reason="계정구분별 원가 관리 성과를 비교하여 특정 유형에서 구조적 원가 문제가 있는지 파악합니다"
        >
          <ChartContainer minHeight={300}>
            <BarChart data={accountTypeData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, _name: any) => [`${Number(v).toFixed(1)}%`, "평균 차이율"]}
              />
              <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
              <Bar dataKey="평균차이율" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {accountTypeData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isOver ? "hsl(0, 65%, 55%)" : "hsl(145, 60%, 42%)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 조직별 원가관리 성과 */}
        <ChartCard
          title="조직별 원가관리 성과"
          isEmpty={orgData.length === 0}
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="조직별 (실적원가 합계 - 표준원가 합계) / |표준원가 합계| x 100"
          description="각 영업조직팀의 표준원가 대비 실적원가 차이율입니다. 음수(초록)일수록 원가 절감을 잘 하고 있고, 양수(빨강)일수록 원가 관리 개선이 필요합니다"
          benchmark="조직 간 차이율 편차가 10%p 이상이면 원가 관리 격차 개선 필요"
          reason="조직 간 원가관리 성과를 비교하여 우수 조직의 노하우를 전파하고 부진 조직의 개선점을 도출합니다"
        >
          <ChartContainer minHeight={300}>
            <BarChart data={orgData} margin={{ top: 10, right: 20, left: 10, bottom: 50 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md">
                      <p className="font-semibold">{d.fullName}</p>
                      <p className={d.isOver ? "text-red-600" : "text-green-600"}>
                        차이율: {d.isOver ? "+" : ""}{isFinite(d.평균차이율) ? d.평균차이율.toFixed(1) : "0"}%
                      </p>
                      <p>품목 수: {d.품목수}개 (초과 {d.초과} / 절감 {d.절감})</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
              <Bar dataKey="평균차이율" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {orgData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isOver ? "hsl(0, 65%, 55%)" : "hsl(145, 60%, 42%)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>
    </>
  );
}
