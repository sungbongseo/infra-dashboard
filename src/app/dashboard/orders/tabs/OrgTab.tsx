"use client";

import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface OrgTabProps {
  orgOrders: { org: string; amount: number }[];
  monthlyGap: { month: string; 수주: number; 매출: number; 갭: number; 전환율: number }[];
}

export function OrgTab({ orgOrders, monthlyGap }: OrgTabProps) {
  return (
    <>
      <ChartCard
        title="조직별 수주 비중"
        formula="영업조직별 장부금액 합계를 구한 뒤 금액 순으로 정렬"
        description="영업조직별 수주 금액 순위를 보여줍니다. 특정 조직에 수주가 지나치게 집중되어 있다면 매출 리스크를 분산하는 전략이 필요합니다."
        benchmark="상위 3개 조직이 전체 수주의 60% 이상이면 집중도가 높은 편입니다"
      >
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={orgOrders.slice(0, 10)}
              layout="vertical"
              margin={{ left: 80 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
              />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any) => formatCurrency(Number(value))}
              />
              <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} name="수주액" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="월별 수주 vs 매출 전환 갭"
        formula="갭(원) = 수주금액 − 매출금액\n양수이면 수주잔고가 쌓이는 중, 음수이면 과거 수주를 소진하는 중"
        description="매월 수주금액과 매출금액의 차이를 비교합니다. 갭이 양수이면 주문이 매출보다 많아 수주잔고가 늘어나는 것이고, 음수이면 과거에 받은 주문을 납품하며 잔고를 줄이고 있다는 뜻입니다."
        benchmark="갭이 꾸준히 양수이면 매출 파이프라인이 건전한 상태입니다"
      >
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthlyGap}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) =>
                  name === "전환율" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="수주" fill={CHART_COLORS[1]} name="수주" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="매출" fill={CHART_COLORS[0]} name="매출" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="전환율"
                stroke={CHART_COLORS[4]}
                strokeWidth={2}
                name="전환율"
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </>
  );
}
