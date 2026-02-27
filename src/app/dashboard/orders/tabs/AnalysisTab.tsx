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
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface AnalysisTabProps {
  orderTypes: { name: string; value: number }[];
  leadTimes: { bin: string; count: number }[];
  isDateFiltered?: boolean;
}

export function AnalysisTab({ orderTypes, leadTimes, isDateFiltered }: AnalysisTabProps) {
  return (
    <>
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="수주유형별 분석"
        formula="수주유형(내수/수출/프로젝트 등)별 장부금액 합계"
        description="수주를 유형별로 나누어 금액 비중을 보여줍니다."
        benchmark="단일 수주유형 의존도가 70% 이상이면 포트폴리오 다변화를 검토하세요"
        reason="수주 유형별 비중을 분석하여 특정 유형 의존도를 파악하고, 포트폴리오 다변화 전략을 수립합니다."
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
              label={({ name, percent }: any) => {
                const n = truncateLabel(String(name), 8);
                return `${n} ${((percent || 0) * 100).toFixed(1)}%`;
              }}
              labelLine={{ strokeWidth: 1 }}
            >
              {orderTypes.slice(0, 6).map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
          </PieChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="납품 리드타임 분포"
        formula="리드타임(일) = 납품요청일 − 수주일"
        description="주문 후 납품까지의 기간을 구간별로 보여줍니다."
        benchmark="30일 이내가 일반적인 납품 기간이며, 90일 이상은 장기 프로젝트로 분류됩니다"
        reason="납품 리드타임 패턴을 분석하여 생산 계획 수립과 고객 납기 약속의 현실성을 점검합니다."
      >
        <ChartContainer height="h-56 md:h-72">
          <BarChart data={leadTimes}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bin" tick={{ fontSize: 11 }} interval={0} />
            <YAxis tick={{ fontSize: 11 }} />
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => `${value}건`} />
            <Bar dataKey="count" fill={CHART_COLORS[2]} name="건수" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
