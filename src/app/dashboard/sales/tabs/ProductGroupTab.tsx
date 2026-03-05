"use client";

import { useMemo } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  LabelList,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ChartContainer,
  GRID_PROPS,
  BAR_RADIUS_TOP,
  ACTIVE_BAR,
  ANIMATION_CONFIG,
  XAXIS_ANGLED,
  getMarginColor,
} from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcProductGroupProfitability,
  calcFactoryPerformance,
} from "@/lib/analysis/accountTypeAnalysis";
import type { CustomerItemDetailRecord } from "@/types";

interface ProductGroupTabProps {
  filteredCustomerItemDetail: CustomerItemDetailRecord[];
  isDateFiltered?: boolean;
}

export function ProductGroupTab({
  filteredCustomerItemDetail,
  isDateFiltered,
}: ProductGroupTabProps) {
  // 1. 품목군별 수익성 Pareto
  const productGroupData = useMemo(
    () => calcProductGroupProfitability(filteredCustomerItemDetail),
    [filteredCustomerItemDetail]
  );

  const paretoData = useMemo(() => {
    if (productGroupData.length === 0) return [];
    const totalSales = productGroupData.reduce((s, d) => s + d.sales, 0);
    let cumSales = 0;
    return productGroupData.map((d) => {
      cumSales += d.sales;
      return {
        name: d.productGroup,
        sales: d.sales,
        grossProfit: d.grossProfit,
        grossMargin: d.grossMargin,
        cumPercent: totalSales > 0 ? (cumSales / totalSales) * 100 : 0,
      };
    });
  }, [productGroupData]);

  // 2. 공장별 성과
  const factoryData = useMemo(
    () => calcFactoryPerformance(filteredCustomerItemDetail),
    [filteredCustomerItemDetail]
  );

  if (filteredCustomerItemDetail.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* 1. 품목군 Pareto */}
      <ChartCard
        title="품목군별 매출/이익 Pareto 분석"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        isEmpty={paretoData.length === 0}
        formula="품목군(34종)별 매출액 합산 후 내림차순 정렬, 누적비율 계산"
        description="품목군을 매출이 큰 순서대로 나열하고, 누적 비율 곡선을 통해 핵심 품목군을 파악합니다. 막대는 매출액, 선은 누적 매출 비중(%)입니다."
        benchmark="상위 20% 품목군이 매출의 80%를 차지하면 파레토 법칙에 부합"
        reason="주력 품목군과 비주력 품목군을 구분하여 자원 배분 우선순위를 결정하고, 품목 포트폴리오 다각화 필요성을 판단합니다."
      >
        <ChartContainer height="h-72 md:h-96">
          <ComposedChart data={paretoData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="name"
              {...XAXIS_ANGLED}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => formatCurrency(v, true)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
              domain={[0, 100]}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                const n = String(name);
                if (n === "누적비율" || n === "매출총이익률")
                  return `${Number(value).toFixed(1)}%`;
                return formatCurrency(Number(value));
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="sales"
              fill={CHART_COLORS[0]}
              name="매출액"
              radius={BAR_RADIUS_TOP}
              activeBar={ACTIVE_BAR}
              {...ANIMATION_CONFIG}
            />
            <Bar
              yAxisId="left"
              dataKey="grossProfit"
              fill={CHART_COLORS[2]}
              name="매출총이익"
              radius={BAR_RADIUS_TOP}
              {...ANIMATION_CONFIG}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumPercent"
              stroke={CHART_COLORS[4]}
              strokeWidth={2}
              name="누적비율"
              dot={{ r: 3 }}
            />
            <ReferenceLine
              yAxisId="right"
              y={80}
              stroke="hsl(142, 76%, 36%)"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: "80%",
                position: "right",
                fontSize: 10,
                fill: "hsl(142, 76%, 36%)",
              }}
            />
            <ReferenceLine
              yAxisId="right"
              y={95}
              stroke="hsl(38, 92%, 50%)"
              strokeDasharray="5 5"
              strokeWidth={1.5}
              label={{
                value: "95%",
                position: "right",
                fontSize: 10,
                fill: "hsl(38, 92%, 50%)",
              }}
            />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {/* 품목군별 마진율 요약 테이블 */}
      {productGroupData.length > 0 && (
        <ChartCard
          title="품목군별 수익성 요약"
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="매출총이익률(%) = 매출총이익 / 매출액 x 100"
          description="각 품목군의 매출액, 매출총이익, 매출총이익률, 영업이익률을 테이블로 정리합니다."
          reason="품목군별 수익성을 한눈에 비교하여 고마진/저마진 품목군을 식별하고, 전략적 품목 포트폴리오를 구성합니다."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">품목군</th>
                  <th className="py-2 px-3 font-medium text-right">매출액</th>
                  <th className="py-2 px-3 font-medium text-right">매출총이익</th>
                  <th className="py-2 px-3 font-medium text-right">매출총이익률</th>
                  <th className="py-2 px-3 font-medium text-right">영업이익률</th>
                  <th className="py-2 px-3 font-medium text-right">건수</th>
                </tr>
              </thead>
              <tbody>
                {productGroupData.slice(0, 20).map((d) => (
                  <tr key={d.productGroup} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-1.5 px-3 font-medium">{d.productGroup}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(d.sales)}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(d.grossProfit)}</td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(d.grossMargin)}`}>
                      {d.grossMargin.toFixed(1)}%
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(d.operatingMargin)}`}>
                      {d.operatingMargin.toFixed(1)}%
                    </td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">
                      {d.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* 2. 공장별 성과 비교 */}
      <ChartCard
        title="공장별 성과 비교"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        isEmpty={factoryData.length === 0}
        formula="공장별 매출액, 매출총이익, 매출원가율 집계"
        description="5개 생산공장별 매출액과 매출총이익을 비교합니다. 공장 간 수익성 차이를 파악하여 생산 효율이 낮은 공장의 개선 방향을 도출합니다."
        benchmark="매출원가율 70% 이하이면 양호, 85% 이상이면 원가 관리 필요"
        reason="공장별 생산 효율과 수익성을 비교하여, 고원가 공장의 원인을 분석하고 개선 우선순위를 결정합니다."
      >
        <ChartContainer height="h-64 md:h-80">
          <BarChart data={factoryData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="factory" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => formatCurrency(v, true)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                const n = String(name);
                if (n === "매출원가율" || n === "매출총이익률")
                  return `${Number(value).toFixed(1)}%`;
                return formatCurrency(Number(value));
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="sales"
              fill={CHART_COLORS[0]}
              name="매출액"
              radius={BAR_RADIUS_TOP}
              activeBar={ACTIVE_BAR}
              {...ANIMATION_CONFIG}
            />
            <Bar
              yAxisId="left"
              dataKey="grossProfit"
              fill={CHART_COLORS[2]}
              name="매출총이익"
              radius={BAR_RADIUS_TOP}
              {...ANIMATION_CONFIG}
            >
              <LabelList
                dataKey="grossMargin"
                position="top"
                formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
