"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ScatterChart,
  Scatter,
} from "recharts";
import { TrendingUp, Users, BarChart3, Crown } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcClv, calcClvSummary } from "@/lib/analysis/clv";
import type { SalesRecord } from "@/types";
import type { OrgProfitRecord } from "@/types/profitability";

interface ClvTabProps {
  filteredSales: SalesRecord[];
  filteredOrgProfit: OrgProfitRecord[];
}

export function ClvTab({ filteredSales, filteredOrgProfit }: ClvTabProps) {
  const clvResults = useMemo(() => calcClv(filteredSales, filteredOrgProfit), [filteredSales, filteredOrgProfit]);
  const clvSummary = useMemo(() => calcClvSummary(clvResults), [clvResults]);

  if (clvResults.length === 0) return <EmptyState />;

  return (
    <>
      {/* CLV KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 CLV(고객생애가치)"
          value={clvSummary.totalClv}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="모든 고객의 예상 생애가치를 합산"
          description="CLV(고객생애가치)란 한 고객이 거래 기간 동안 가져다줄 것으로 예상되는 총 수익입니다. 총 CLV는 모든 고객의 예상 가치를 합한 것으로, 고객 자산의 전체 규모를 보여줍니다."
          benchmark="총 CLV가 현재 매출의 3배 이상이면 장기 성장 기반 확보"
        />
        <KpiCard
          title="평균 CLV(고객생애가치)"
          value={clvSummary.avgClv}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="평균 CLV(원) = 총 CLV ÷ 고객 수"
          description="고객 1곳당 평균적으로 기대되는 생애가치입니다. 이 금액이 높을수록 고객 1곳이 장기적으로 더 큰 수익을 가져다준다는 의미입니다."
          benchmark="평균 CLV가 고객 획득 비용의 3배 이상이면 건전한 수준"
        />
        <KpiCard
          title="Top 고객 CLV"
          value={clvSummary.topCustomerClv}
          format="currency"
          icon={<Crown className="h-5 w-5" />}
          formula="고객별 CLV 중 가장 큰 값"
          description="가장 높은 생애가치를 가진 최우수 고객의 CLV입니다. 이 고객은 장기적으로 가장 큰 수익을 가져다줄 것으로 예상되므로, 특별 관리가 필요합니다."
          benchmark="Top 고객 CLV가 총 CLV의 30% 이상이면 의존도 과다"
        />
        <KpiCard
          title="분석 고객 수"
          value={clvSummary.customerCount}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="중복 없이 매출처 수를 세기"
          description="CLV(고객생애가치)가 산출된 고유 고객 수입니다. 최소 2회 이상 거래가 있어야 의미 있는 CLV를 계산할 수 있으므로, 전체 거래처 수보다 적을 수 있습니다."
          benchmark="분석 고객 수가 전체 거래처의 70% 이상이면 데이터 커버리지 양호"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 15 CLV 고객 */}
        <ChartCard
          title="Top 15 고객 생애가치 (CLV)"
          formula="CLV(고객생애가치) = 평균 거래액 × 연간 거래빈도 × 이익률 × 예상 거래기간"
          description="고객 생애가치가 높은 상위 15개 고객입니다. CLV가 높다는 것은 해당 고객이 장기적으로 꾸준히 수익을 가져다줄 가능성이 크다는 의미이며, 이들에 대한 맞춤형 관리가 중요합니다."
          benchmark="상위 20% 고객의 CLV가 전체의 80% 이상이면 핵심 고객 집중 관리 필요"
        >
          <ChartContainer height="h-72 md:h-96">
              <BarChart
                data={clvResults.slice(0, 15).map((c) => ({
                  name: c.customerName || c.customer,
                  clv: c.clv,
                }))}
                layout="vertical"
                margin={{ left: 10 }}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={85}
                  tickFormatter={(v) => (String(v).length > 10 ? String(v).substring(0, 10) + "..." : v)}
                />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any) => [formatCurrency(Number(value)), "CLV"]}
                />
                <Bar dataKey="clv" name="CLV" fill={CHART_COLORS[1]} radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* CLV vs 현재 매출 산점도 */}
        <ChartCard
          title="CLV vs 현재 매출"
          formula="가로축: 현재 매출액, 세로축: 예상 생애가치(CLV)"
          description="현재 매출과 장기 예상 가치를 비교합니다. 대각선 위쪽 고객은 현재 매출은 적지만 장기 가치가 높아 적극 육성 대상입니다. 대각선 아래쪽 고객은 현재 매출은 많지만 장기 가치가 낮아 관계 강화가 필요합니다."
          benchmark="CLV가 현재 매출의 1.5배 이상이면 고성장 잠재 고객으로 분류"
        >
          <ChartContainer height="h-72 md:h-96">
              <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  type="number"
                  dataKey="currentSales"
                  name="현재 매출"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, true)}
                  label={{ value: "현재 매출", position: "insideBottom", offset: -5, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="clv"
                  name="CLV"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, true)}
                  width={60}
                />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                  labelFormatter={(label: any) => {
                    const item = clvResults.find((c) => c.currentSales === label);
                    return item ? item.customerName || item.customer : "";
                  }}
                />
                <Scatter
                  name="고객"
                  data={clvResults}
                  fill={CHART_COLORS[2]}
                  fillOpacity={0.7}
                />
              </ScatterChart>
          </ChartContainer>
        </ChartCard>
      </div>
    </>
  );
}
