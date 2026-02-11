"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ShoppingCart, TrendingUp, Clock, Package } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface StatusTabProps {
  totalOrders: number;
  conversionRate: number;
  outstandingOrders: number;
  orderCount: number;
  monthlyOrders: { month: string; 수주금액: number; 수주건수: number }[];
}

export function StatusTab({
  totalOrders,
  conversionRate,
  outstandingOrders,
  orderCount,
  monthlyOrders,
}: StatusTabProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 수주액"
          value={totalOrders}
          format="currency"
          icon={<ShoppingCart className="h-5 w-5" />}
          formula="수주 리스트의 모든 장부금액을 합산"
          description="인프라 사업본부 담당 조직이 고객으로부터 주문받은 총 금액입니다. 수주는 매출이 발생하기 전 단계로, 향후 매출로 전환될 예정인 파이프라인입니다."
          benchmark="매출액 대비 수주액이 100% 이상이면 파이프라인 양호"
        />
        <KpiCard
          title="수주에서 매출 전환율"
          value={conversionRate}
          format="percent"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="수주→매출 전환율(%) = 총 매출액 ÷ 총 수주액 × 100"
          description="수주한 금액 중 실제로 매출(출고/납품)로 전환된 비율입니다. 100%를 초과하면 이전 기간에 수주했던 물량이 금기에 매출로 반영된 것을 의미합니다."
          benchmark="80~120% 범위가 정상적인 수준입니다"
        />
        <KpiCard
          title="미출고 수주잔"
          value={outstandingOrders > 0 ? outstandingOrders : 0}
          format="currency"
          icon={<Package className="h-5 w-5" />}
          formula="미출고 수주잔(원) = 총 수주액 − 총 매출액"
          description="고객이 주문했지만 아직 출고(납품)되지 않은 금액입니다. 이 금액이 크면 향후 매출로 전환될 여지가 많다는 뜻이지만, 납기 관리에 주의가 필요합니다."
          benchmark="수주잔이 월 매출의 1~3배이면 적정, 과다하면 납기 지연 리스크"
        />
        <KpiCard
          title="수주 건수"
          value={orderCount}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="기간 내 수주 리스트의 총 건수"
          description="분석 기간 내에 접수된 총 수주 건수입니다. 건수와 금액을 함께 보면 건당 평균 수주 규모를 파악할 수 있습니다."
          benchmark="전기 대비 건수가 증가하면 영업 활동 활발, 건수는 줄고 금액이 늘면 대형화 추세"
        />
      </div>

      <ChartCard
        title="월별 수주 추이"
        formula="월별 수주 건수와 수주 금액(장부금액 합계)을 각각 집계"
        description="매월 수주가 얼마나 들어왔는지 건수(선)와 금액(막대)으로 보여줍니다. 건수 대비 금액이 유난히 높은 달은 대형 수주가 포함된 것입니다."
        benchmark="수주 금액이 매출 금액과 동등하거나 높으면 파이프라인이 양호한 상태입니다"
      >
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyOrders}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
                name === "수주건수" ? `${value}건` : formatCurrency(Number(value))
              } />
              <Legend />
              <Bar yAxisId="left" dataKey="수주금액" fill={CHART_COLORS[1]} name="수주금액" radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="수주건수" stroke={CHART_COLORS[4]} strokeWidth={2} name="수주건수" dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </>
  );
}
