"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface AnalysisTabProps {
  orderTypes: { name: string; value: number }[];
  leadTimes: { bin: string; count: number }[];
}

export function AnalysisTab({ orderTypes, leadTimes }: AnalysisTabProps) {
  return (
    <>
      <ChartCard
        title="수주유형별 분석"
        formula="수주유형(내수/수출/프로젝트 등)별 장부금액 합계"
        description="수주를 유형별로 나누어 금액 비중을 보여줍니다."
        benchmark="단일 수주유형 의존도가 70% 이상이면 포트폴리오 다변화를 검토하세요"
      >
        <ChartContainer height="h-72 md:h-96">
          <PieChart>
            <Pie
              data={orderTypes.slice(0, 6)}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={130}
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
            >
              {orderTypes.slice(0, 6).map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
          </PieChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title="납품 리드타임 분포"
        formula="리드타임(일) = 납품요청일 − 수주일"
        description="주문 후 납품까지의 기간을 구간별로 보여줍니다."
        benchmark="30일 이내가 일반적인 납품 기간이며, 90일 이상은 장기 프로젝트로 분류됩니다"
      >
        <ChartContainer height="h-56 md:h-72">
          <BarChart data={leadTimes}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => `${value}건`} />
            <Bar dataKey="count" fill={CHART_COLORS[2]} name="건수" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
