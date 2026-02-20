"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcRfmScores, calcRfmSegmentSummary } from "@/lib/analysis/rfm";

const RFM_COLORS: Record<string, string> = {
  VIP: "#059669",
  Loyal: "#3b82f6",
  Potential: "#8b5cf6",
  "At-risk": "#f59e0b",
  Dormant: "#6b7280",
  Lost: "#ef4444",
};

import type { SalesRecord } from "@/types";

interface RfmTabProps {
  filteredSales: SalesRecord[];
}

export function RfmTab({ filteredSales }: RfmTabProps) {
  const rfmScores = useMemo(() => calcRfmScores(filteredSales), [filteredSales]);
  const rfmSummary = useMemo(() => calcRfmSegmentSummary(rfmScores), [rfmScores]);

  if (rfmScores.length === 0) return <EmptyState />;

  return (
    <>
      {/* 세그먼트 분포 & 세그먼트별 매출 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="RFM 세그먼트 분포 (거래처 수)"
          formula="고객별 최근성, 빈도, 금액을 5단계로 점수화한 뒤 세그먼트 분류"
          description="RFM 분석은 고객을 3가지 기준으로 평가합니다. R(최근성): 마지막 거래가 얼마나 최근인지, F(빈도): 얼마나 자주 거래하는지, M(금액): 총 거래 금액이 얼마인지. 이 점수를 조합하여 VIP(최우수), Loyal(충성), Potential(잠재), At-risk(위험), Dormant(휴면), Lost(이탈) 등 6개 그룹으로 나눕니다."
          benchmark="VIP + Loyal 거래처가 전체의 30% 이상이면 건전한 고객 포트폴리오"
        >
          <ChartContainer height="h-72 md:h-80">
              <PieChart>
                <Pie
                  data={rfmSummary}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  dataKey="count"
                  nameKey="segment"
                  label={
                    rfmSummary.length <= 6
                      ? (props: any) => {
                          const { cx, cy, midAngle, outerRadius: or, segment, count } = props;
                          const RADIAN = Math.PI / 180;
                          const radius = (or || 110) + 25;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="hsl(var(--foreground))"
                              textAnchor={x > cx ? "start" : "end"}
                              dominantBaseline="central"
                              fontSize={11}
                            >
                              {segment} ({count})
                            </text>
                          );
                        }
                      : false
                  }
                >
                  {rfmSummary.map((entry) => (
                    <Cell
                      key={entry.segment}
                      fill={RFM_COLORS[entry.segment] || CHART_COLORS[0]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) => [
                    `${Number(value).toLocaleString()}개사`,
                    name,
                  ]}
                />
                {rfmSummary.length > 6 && <Legend />}
              </PieChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard
          title="세그먼트별 매출 비중"
          formula="세그먼트별로 고객 매출액(M값)을 합산"
          description="각 고객 등급(세그먼트)이 전체 매출에서 차지하는 금액을 비교합니다. 보통 VIP 소수 고객이 전체 매출의 대부분을 차지하며, 이들의 이탈 방지가 매출 유지의 핵심입니다."
          benchmark="VIP 세그먼트 매출 비중이 60% 이상이면 핵심 고객 관리 프로그램 강화 필요"
        >
          <ChartContainer height="h-72 md:h-80">
              <BarChart data={rfmSummary} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="segment" tick={{ fontSize: 11 }} width={65} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any) => [formatCurrency(Number(value)), "매출액"]}
                />
                <Bar dataKey="totalSales" name="매출액" radius={BAR_RADIUS_RIGHT}>
                  {rfmSummary.map((entry) => (
                    <Cell
                      key={entry.segment}
                      fill={RFM_COLORS[entry.segment] || CHART_COLORS[0]}
                    />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Recency vs Monetary 산점도 */}
      <ChartCard
        title="Recency vs Monetary 분포"
        formula="가로축: 마지막 거래 후 경과 개월, 세로축: 총 매출액, 점 크기: 거래 빈도"
        description="고객을 최근성(가로축)과 매출 규모(세로축)로 배치한 산점도입니다. 점이 클수록 거래 빈도가 높은 고객입니다. 왼쪽 위(최근 거래 + 높은 매출)에 있는 고객이 VIP이고, 오른쪽 아래(오래된 거래 + 낮은 매출)에 있는 고객은 이탈 위험군입니다."
        benchmark="왼쪽 위에 큰 점이 많을수록 건전한 고객 구조"
      >
        <ChartContainer height="h-72 md:h-96">
            <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                type="number"
                dataKey="recency"
                name="최근성(개월)"
                tick={{ fontSize: 11 }}
                label={{ value: "최근 거래 경과(개월)", position: "insideBottom", offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="monetary"
                name="총매출"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
                width={60}
              />
              <ZAxis type="number" dataKey="frequency" range={[30, 400]} name="거래빈도" />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "총매출") return [formatCurrency(Number(value)), name];
                  if (name === "최근성(개월)") return [`${value}개월`, name];
                  if (name === "거래빈도") return [`${value}건`, name];
                  return [value, name];
                }}
                labelFormatter={(label: any) => {
                  const item = rfmScores.find((s) => s.recency === label);
                  return item ? `${item.customerName || item.customer} (${item.rfmSegment})` : "";
                }}
              />
              <Scatter
                name="고객"
                data={rfmScores}
                fill={CHART_COLORS[0]}
                fillOpacity={0.6}
              >
                {rfmScores.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={RFM_COLORS[entry.rfmSegment] || CHART_COLORS[0]}
                  />
                ))}
              </Scatter>
            </ScatterChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
