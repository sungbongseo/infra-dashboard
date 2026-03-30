"use client";

import { useMemo } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
  Bar,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR, getMarginColor } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface CustomerRankingItem {
  code: string;
  name: string;
  org: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  opMargin: number;
  planAchievement: number;
}

interface CustomerTabProps {
  topCustomers: Array<{ code: string; name: string; amount: number }>;
  customerRanking: CustomerRankingItem[];
  isDateFiltered: boolean;
  onCustomer360Navigate: (name: string) => void;
}

export function CustomerTab({
  topCustomers,
  customerRanking,
  isDateFiltered,
  onCustomer360Navigate,
}: CustomerTabProps) {
  const topCustomersExport = useMemo(
    () => topCustomers.map((c) => ({ 거래처코드: c.code, 거래처명: c.name, 매출액: c.amount })),
    [topCustomers]
  );

  const paretoData = useMemo(() => {
    const total = topCustomers.reduce((s, c) => s + c.amount, 0);
    let cum = 0;
    const result = topCustomers.map((c) => {
      cum += c.amount;
      return {
        name: c.name || c.code,
        amount: c.amount,
        cumPercent: total > 0 ? (cum / total) * 100 : 0,
      };
    });
    if (result.length > 0) {
      result[result.length - 1].cumPercent = 100;
    }
    return result;
  }, [topCustomers]);

  return (
    <ErrorBoundary>
      <ChartCard
        title="거래처별 매출 (ABC 분석)"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="누적 비율(%) = 누적 매출 ÷ 총 매출 × 100"
        description="거래처를 매출액이 큰 순서대로 나열하고, 누적 비율에 따라 A등급(상위 80%까지), B등급(80~95%), C등급(95~100%)으로 분류합니다. 소수의 핵심 거래처가 대부분의 매출을 차지하는 '파레토 법칙'을 확인할 수 있습니다."
        benchmark="상위 20% 거래처가 매출의 80%를 차지하면 전형적인 파레토 분포 (80:20 법칙)"
        reason="핵심 거래처 매출 집중도를 파악하여 주요 거래처 이탈 시 영향을 사전에 예측하고, 거래처 다각화 전략을 수립합니다."
        action={<ExportButton data={topCustomersExport} fileName="거래처별매출" />}
      >
        <ChartContainer height="h-72 md:h-96">
            <ComposedChart data={paretoData}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
                name === "cumPercent" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
              } />
              <Legend />
              <Bar yAxisId="left" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Line yAxisId="right" type="monotone" dataKey="cumPercent" stroke={CHART_COLORS[4]} strokeWidth={2} name="누적비율" dot={{ r: 3 }} />
              <ReferenceLine yAxisId="right" y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "A (80%)", position: "right", fontSize: 10, fill: "hsl(142, 76%, 36%)" }} />
              <ReferenceLine yAxisId="right" y={95} stroke="hsl(38, 92%, 50%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "B (95%)", position: "right", fontSize: 10, fill: "hsl(38, 92%, 50%)" }} />
            </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {customerRanking.length > 0 && (
        <ChartCard
          title="거래처별 수익성 연계 (303 데이터)"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="303 조직별 거래처별 손익 데이터에서 매출액 상위 20개 거래처의 매출총이익률/영업이익률 표시"
          description="매출 상위 거래처의 수익성을 함께 분석합니다. 매출은 크지만 마진이 낮은 거래처는 가격 재협상이나 원가 절감이 필요합니다."
          benchmark="영업이익률 5% 이상이면 양호, 음수이면 거래 조건 재검토 필요"
          reason="매출 규모와 수익성을 동시에 파악하여 매출만 크고 이익이 없는 거래처를 식별하고, 수익성 중심의 거래처 전략을 수립합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium">조직</th>
                  <th className="py-2 px-3 font-medium text-right">매출액</th>
                  <th className="py-2 px-3 font-medium text-right">매출총이익</th>
                  <th className="py-2 px-3 font-medium text-right">매출총이익률</th>
                  <th className="py-2 px-3 font-medium text-right">영업이익률</th>
                  <th className="py-2 px-3 font-medium text-right">계획달성률</th>
                </tr>
              </thead>
              <tbody>
                {customerRanking.map((c) => (
                  <tr key={c.code} className="border-b border-border/50 hover:bg-muted/50 cursor-pointer" onClick={() => c.name && onCustomer360Navigate(c.name)}>
                    <td className="py-1.5 px-3 font-medium text-primary hover:underline">{c.name}</td>
                    <td className="py-1.5 px-3 text-muted-foreground text-xs">{c.org}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(c.sales)}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(c.grossProfit)}</td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(c.grossMargin)}`}>
                      {isFinite(c.grossMargin) ? c.grossMargin.toFixed(1) : "0"}%
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(c.opMargin)}`}>
                      {isFinite(c.opMargin) ? c.opMargin.toFixed(1) : "0"}%
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {isFinite(c.planAchievement) ? `${c.planAchievement.toFixed(0)}%` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </ErrorBoundary>
  );
}
