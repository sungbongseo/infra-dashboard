"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
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
        description="수주를 유형별로 나누어 금액 비중을 보여줍니다. 어떤 유형의 수주가 주력인지, 특정 유형에 지나치게 의존하고 있지는 않은지 확인할 수 있습니다."
        benchmark="단일 수주유형 의존도가 70% 이상이면 포트폴리오 다변화를 검토하세요"
      >
        <div className="h-72 md:h-96">
          <ResponsiveContainer width="100%" height="100%">
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
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="납품 리드타임 분포"
        formula="리드타임(일) = 납품요청일 − 수주일"
        description="주문을 받은 날부터 납품을 요청받은 날까지 며칠이 걸리는지 구간별로 보여줍니다. 리드타임이 짧은 건이 많으면 긴급 납품 부담이 크고, 긴 건이 많으면 장기 프로젝트 비중이 높다는 뜻입니다."
        benchmark="30일 이내가 일반적인 납품 기간이며, 90일 이상은 장기 프로젝트로 분류됩니다"
      >
        <div className="h-56 md:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leadTimes}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => `${value}건`} />
              <Bar dataKey="count" fill={CHART_COLORS[2]} name="건수" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </>
  );
}
