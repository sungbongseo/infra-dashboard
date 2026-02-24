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
} from "recharts";
import { AlertTriangle, Users, DollarSign, ShieldAlert } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { predictChurn } from "@/lib/analysis/churnPrediction";
import type { SalesRecord } from "@/types";

interface ChurnTabProps {
  filteredSales: SalesRecord[];
}

const RISK_LEVEL_COLORS: Record<string, string> = {
  critical: CHART_COLORS[4], // red
  high: CHART_COLORS[3],     // orange
  medium: CHART_COLORS[5],   // cyan
  low: CHART_COLORS[1],      // green
};

const RISK_LEVEL_LABELS: Record<string, string> = {
  critical: "위험",
  high: "주의",
  medium: "관찰",
  low: "양호",
};

export function ChurnTab({ filteredSales }: ChurnTabProps) {
  const churnSummary = useMemo(() => predictChurn(filteredSales), [filteredSales]);

  // Risk distribution for pie chart
  const pieData = useMemo(() => {
    return churnSummary.riskDistribution
      .filter((d) => d.count > 0)
      .map((d) => ({
        name: RISK_LEVEL_LABELS[d.level] || d.level,
        level: d.level,
        value: d.count,
        revenue: d.revenue,
      }));
  }, [churnSummary]);

  // Top 20 at-risk customers for horizontal bar chart
  const topAtRisk = useMemo(() => {
    return churnSummary.customers
      .filter((c) => c.churnScore > 0)
      .slice(0, 20)
      .map((c) => ({
        name: c.customerName || c.customer,
        score: c.churnScore,
        riskLevel: c.riskLevel,
      }));
  }, [churnSummary]);

  // At-risk revenue percentage
  const atRiskRevenueRate = useMemo(() => {
    const totalRev = churnSummary.customers.reduce((s, c) => s + c.totalAmount, 0);
    if (totalRev === 0) return 0;
    return (churnSummary.atRiskRevenue / totalRev) * 100;
  }, [churnSummary]);

  const criticalCount = churnSummary.riskDistribution.find(
    (d) => d.level === "critical"
  )?.count ?? 0;

  if (churnSummary.totalCustomers === 0) return <EmptyState />;

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="전체 거래처"
          value={churnSummary.totalCustomers}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="매출 데이터에서 중복 없이 매출처 수 집계"
          description="거래 이력이 있는 전체 거래처 수입니다. 이탈 분석의 모집단이 되며, 이 수 대비 위험 등급 비율로 포트폴리오 건전성을 판단합니다."
          benchmark="활성 거래처가 50개 미만이면 소수 의존 리스크"
        />
        <KpiCard
          title="이탈 위험 거래처"
          value={churnSummary.atRiskCustomers}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="이탈 점수 기준 '위험' 또는 '주의' 등급 거래처 수"
          description="이탈 위험도가 높은(critical + high) 거래처 수입니다. 최근 거래가 뜸하고, 거래 빈도가 낮으며, 거래량이 감소하는 고객이 포함됩니다."
          benchmark="전체 대비 20% 이하면 정상 수준"
        />
        <KpiCard
          title="위험 매출 비중"
          value={atRiskRevenueRate}
          format="percent"
          icon={<DollarSign className="h-5 w-5" />}
          formula="위험 등급 거래처 매출 합계 ÷ 전체 매출 × 100"
          description="이탈 위험이 높은 거래처가 차지하는 매출 비중입니다. 높을수록 매출 기반이 불안정하다는 뜻입니다."
          benchmark="30% 이하면 안정적, 50% 이상이면 긴급 대응 필요"
        />
        <KpiCard
          title="위험 등급 거래처"
          value={criticalCount}
          format="number"
          icon={<ShieldAlert className="h-5 w-5" />}
          formula="이탈 점수 60점 이상인 거래처 수"
          description="가장 높은 이탈 위험을 가진 거래처 수입니다. 6개월 이상 미거래이며 거래 빈도가 극히 낮은 고객이 해당됩니다."
          benchmark="주요 거래처가 포함되어 있으면 즉시 대응 필요"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk distribution pie chart */}
        <ChartCard
          title="이탈 위험도 분포"
          formula="거래처별 최근성/빈도/금액 기반 이탈 점수(0-100) 산출 후 등급 분류"
          description="위험(60+), 주의(40-59), 관찰(20-39), 양호(0-19) 4단계로 분류한 거래처 분포입니다."
          benchmark="양호+관찰 비중이 70% 이상이면 건전한 포트폴리오"
        >
          <ChartContainer height="h-64 md:h-80">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={105}
                dataKey="value"
                nameKey="name"
                label={
                  pieData.length <= 6
                    ? (props: any) => {
                        const { cx, cy, midAngle, outerRadius: or, name, value } = props;
                        const RADIAN = Math.PI / 180;
                        const radius = (or || 105) + 25;
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
                            {name} ({value})
                          </text>
                        );
                      }
                    : false
                }
              >
                {pieData.map((entry) => (
                  <Cell key={entry.level} fill={RISK_LEVEL_COLORS[entry.level] || CHART_COLORS[0]} />
                ))}
              </Pie>
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any, item: any) => {
                  const rev = item?.payload?.revenue;
                  return [
                    `${Number(value).toLocaleString()}개사 (매출 ${formatCurrency(rev ?? 0, true)})`,
                    name,
                  ];
                }}
              />
              {pieData.length > 6 && <Legend />}
            </PieChart>
          </ChartContainer>
        </ChartCard>

        {/* Top 20 at-risk customers bar chart */}
        <ChartCard
          title="이탈 점수 상위 20 거래처"
          formula="이탈 점수 = 최근성(0-40) + 빈도(0-30) + 감소추세(0-30)"
          description="이탈 위험 점수가 높은 상위 20개 거래처입니다. 점수가 높을수록 이탈 가능성이 큽니다."
          benchmark="주요 매출처가 포함된 경우 즉시 방문 상담 권장"
          isEmpty={topAtRisk.length === 0}
        >
          <ChartContainer height="h-72 md:h-[28rem]">
            <BarChart data={topAtRisk} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}점`} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10 }}
                width={85}
                tickFormatter={(v) => (String(v).length > 10 ? String(v).substring(0, 10) + "..." : v)}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any) => [`${Number(value)}점`, "이탈 점수"]}
              />
              <Bar dataKey="score" name="이탈 점수" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {topAtRisk.map((entry, idx) => (
                  <Cell key={idx} fill={RISK_LEVEL_COLORS[entry.riskLevel] || CHART_COLORS[0]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* At-risk customer detail table */}
      <ChartCard
        title="이탈 위험 거래처 상세"
        description="이탈 점수 20점 이상 거래처의 상세 정보와 이탈 신호를 보여줍니다."
        isEmpty={churnSummary.customers.filter((c) => c.churnScore >= 20).length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 px-3 font-medium">거래처명</th>
                <th className="py-2 px-3 font-medium text-center">마지막 거래</th>
                <th className="py-2 px-3 font-medium text-right">이탈 점수</th>
                <th className="py-2 px-3 font-medium text-center">등급</th>
                <th className="py-2 px-3 font-medium text-right">누적 매출</th>
                <th className="py-2 px-3 font-medium">이탈 신호</th>
              </tr>
            </thead>
            <tbody>
              {churnSummary.customers
                .filter((c) => c.churnScore >= 20)
                .slice(0, 30)
                .map((c) => (
                  <tr key={c.customer} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="py-2 px-3 font-medium max-w-[160px] truncate">
                      {c.customerName || c.customer}
                    </td>
                    <td className="py-2 px-3 text-center">{c.lastPurchaseMonth}</td>
                    <td className="py-2 px-3 text-right font-mono">{c.churnScore}</td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: RISK_LEVEL_COLORS[c.riskLevel] || CHART_COLORS[0] }}
                      >
                        {RISK_LEVEL_LABELS[c.riskLevel] || c.riskLevel}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{formatCurrency(c.totalAmount, true)}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs max-w-[200px]">
                      {c.signals.join(", ")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
