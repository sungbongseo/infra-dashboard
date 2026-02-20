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
  ComposedChart,
  Line,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcSalesByPaymentTerm,
  calcSalesByCustomerCategory,
  calcSalesByItemCategory,
} from "@/lib/analysis/channel";
import type { SalesRecord } from "@/types";

interface ChannelTabProps {
  filteredSales: SalesRecord[];
}

export function ChannelTab({ filteredSales }: ChannelTabProps) {
  const paymentTermSales = useMemo(() => calcSalesByPaymentTerm(filteredSales), [filteredSales]);
  const customerCategorySales = useMemo(() => calcSalesByCustomerCategory(filteredSales), [filteredSales]);
  const itemCategorySales = useMemo(() => calcSalesByItemCategory(filteredSales), [filteredSales]);

  return (
    <>
      <ChartCard
        title="결제조건별 매출 분포"
        formula="결제조건별로 판매금액을 합산하여 비교"
        description="현금, 30일, 60일 등 결제조건별 매출 분포를 보여줍니다."
        benchmark="현금 및 30일 이내 결제 비중이 50% 이상이면 현금흐름 양호"
      >
        <ChartContainer height="h-72 md:h-96">
          <BarChart data={paymentTermSales.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="term" tick={{ fontSize: 11 }} width={75} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                if (name === "amount") return [formatCurrency(Number(value)), "매출액"];
                if (name === "count") return [Number(value).toLocaleString(), "건수"];
                return [value, name];
              }}
            />
            <Bar dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title="거래처소분류별 매출"
        formula="거래처소분류별로 판매금액을 합산하여 비교"
        description="거래처 유형별 매출 비중을 보여줍니다."
        benchmark="단일 거래처 유형 의존도 60% 이하가 바람직"
      >
        <ChartContainer height="h-72 md:h-96">
          <PieChart>
            <Pie
              data={customerCategorySales}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={130}
              dataKey="amount"
              nameKey="category"
              label={
                customerCategorySales.length <= 8
                  ? (props: any) => {
                      const { cx, cy, midAngle, outerRadius: or, category, share } = props;
                      const RADIAN = Math.PI / 180;
                      const radius = (or || 130) + 25;
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
                          {category} {(share || 0).toFixed(1)}%
                        </text>
                      );
                    }
                  : false
              }
            >
              {customerCategorySales.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => formatCurrency(Number(value))}
            />
            {customerCategorySales.length > 8 && <Legend />}
          </PieChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title="품목범주별 매출 및 평균 단가"
        formula="품목범주별로 판매금액과 평균 단가를 비교"
        description="품목 유형별 매출 규모와 평균 단가를 보여줍니다."
        benchmark="구매직납 비중 30~40%가 적정"
      >
        <ChartContainer height="h-72 md:h-96">
          <ComposedChart data={itemCategorySales}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="category" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={80} />
            <YAxis
              yAxisId="amount"
              orientation="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => formatCurrency(v, true)}
              label={{ value: "매출액", angle: -90, position: "insideLeft", style: { fontSize: 12 } }}
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
              label={{ value: "평균단가", angle: 90, position: "insideRight", style: { fontSize: 12 } }}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name?: string) => {
                if (name === "매출액") return formatCurrency(Number(value));
                if (name === "평균단가") return `${formatCurrency(Number(value))}/개`;
                if (name === "거래건수") return `${Number(value).toLocaleString()}건`;
                return value;
              }}
            />
            <Legend />
            <Bar yAxisId="amount" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={[8, 8, 0, 0]} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Line yAxisId="price" type="monotone" dataKey="avgUnitPrice" stroke={CHART_COLORS[3]} strokeWidth={2} name="평균단가" dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
