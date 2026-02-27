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
  isDateFiltered?: boolean;
}

export function StatusTab({
  totalOrders,
  conversionRate,
  outstandingOrders,
  orderCount,
  monthlyOrders,
  isDateFiltered,
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
          reason="수주 총액은 향후 매출의 선행지표로, 파이프라인 규모를 파악하여 선제적 영업 전략을 수립하는 데 필수적입니다."
        />
        <KpiCard
          title="수주에서 매출 전환율"
          value={conversionRate}
          format="percent"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="수주→매출 전환율(%) = 총 매출액 ÷ 총 수주액 × 100"
          description="수주 금액 중 실제 매출로 전환된 비율입니다."
          benchmark="80~120% 범위가 정상적인 수준입니다"
          reason="수주가 매출로 전환되는 속도를 파악하여, 납기 지연이나 수주 취소 리스크를 조기에 감지하고 대응합니다."
        />
        <KpiCard
          title="미출고 수주잔"
          value={outstandingOrders > 0 ? outstandingOrders : 0}
          format="currency"
          icon={<Package className="h-5 w-5" />}
          formula="미출고 수주잔(원) = 총 수주액 − 총 매출액"
          description="주문 후 아직 출고되지 않은 금액입니다."
          benchmark="수주잔이 월 매출의 1~3배이면 적정, 과다하면 납기 지연 리스크"
          reason="미출고 잔고 규모로 생산·물류 부하를 예측하고, 과다 시 납기 지연 방지 대책을 수립합니다."
        />
        <KpiCard
          title="수주 건수"
          value={orderCount}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="기간 내 수주 리스트의 총 건수"
          description="현재 기간 내 접수된 총 수주 건수입니다. 건수와 금액을 함께 분석하면 수주 패턴의 변화(대형→소형 전환 등)를 파악할 수 있습니다."
          benchmark="수주 건수 증가 + 건당 금액 감소이면 수익성 점검"
          reason="건수 추이로 영업 활동량의 변화를 감지하고, 건당 단가와 결합하여 수주 구조 변화를 분석합니다."
        />
      </div>

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="월별 수주 추이"
        formula="월별 수주 건수와 수주 금액(장부금액 합계)을 각각 집계"
        description="기간별 수주 금액과 매출 전환 현황을 비교합니다. 수주가 매출보다 지속적으로 높으면 미래 매출 파이프라인이 충분합니다."
        benchmark="수주잔고가 월 매출의 2배 이상이면 파이프라인 충분"
        reason="수주 잔고와 신규 수주 추이를 파악하여 향후 매출 파이프라인 규모를 예측하고, 수주 감소 시 선제적 영업 활동을 전개합니다."
      >
        <ChartContainer>
          <ComposedChart data={monthlyOrders}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
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
