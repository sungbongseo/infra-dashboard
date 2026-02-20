"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { ShoppingCart, TrendingUp, Clock, Package } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
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
          description="고객으로부터 주문받은 총 금액입니다."
          benchmark="매출액 대비 수주액이 100% 이상이면 파이프라인 양호"
        />
        <KpiCard
          title="수주에서 매출 전환율"
          value={conversionRate}
          format="percent"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="수주→매출 전환율(%) = 총 매출액 ÷ 총 수주액 × 100"
          description="수주 금액 중 실제 매출로 전환된 비율입니다."
          benchmark="80~120% 범위가 정상적인 수준입니다"
        />
        <KpiCard
          title="미출고 수주잔"
          value={outstandingOrders > 0 ? outstandingOrders : 0}
          format="currency"
          icon={<Package className="h-5 w-5" />}
          formula="미출고 수주잔(원) = 총 수주액 − 총 매출액"
          description="주문 후 아직 출고되지 않은 금액입니다."
          benchmark="수주잔이 월 매출의 1~3배이면 적정, 과다하면 납기 지연 리스크"
        />
        <KpiCard
          title="수주 건수"
          value={orderCount}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="기간 내 수주 리스트의 총 건수"
          description="분석 기간 내 접수된 총 수주 건수입니다."
          benchmark="전기 대비 건수 증가면 영업 활발, 건수↓ 금액↑이면 대형화 추세"
        />
      </div>

      <ChartCard
        title="월별 수주 추이"
        formula="월별 수주 건수와 수주 금액(장부금액 합계)을 각각 집계"
        description="매월 수주 건수(선)와 금액(막대)을 보여줍니다."
        benchmark="수주 금액이 매출 금액과 동등하거나 높으면 파이프라인 양호"
      >
        <ChartContainer>
          <ComposedChart data={monthlyOrders}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
              name === "수주건수" ? `${value}건` : formatCurrency(Number(value))
            } />
            <Legend />
            <Bar yAxisId="left" dataKey="수주금액" fill={CHART_COLORS[1]} name="수주금액" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Line yAxisId="right" type="monotone" dataKey="수주건수" stroke={CHART_COLORS[4]} strokeWidth={2} name="수주건수" dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
