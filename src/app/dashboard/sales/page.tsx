"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { calcTopCustomers, calcItemSales, calcSalesByType } from "@/lib/analysis/kpi";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Treemap,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import { formatCurrency, CHART_COLORS } from "@/lib/utils";

export default function SalesAnalysisPage() {
  const { salesList } = useDataStore();

  const topCustomers = useMemo(() => calcTopCustomers(salesList, 15), [salesList]);
  const itemSales = useMemo(() => calcItemSales(salesList), [salesList]);
  const salesByType = useMemo(() => calcSalesByType(salesList), [salesList]);

  // Pareto data for ABC analysis
  const paretoData = useMemo(() => {
    const total = topCustomers.reduce((s, c) => s + c.amount, 0);
    let cum = 0;
    return topCustomers.map((c) => {
      cum += c.amount;
      return {
        name: c.name || c.code,
        amount: c.amount,
        cumPercent: total > 0 ? (cum / total) * 100 : 0,
      };
    });
  }, [topCustomers]);

  // Donut data
  const donutData = useMemo(() => [
    { name: "내수", value: salesByType.domestic },
    { name: "수출", value: salesByType.exported },
  ], [salesByType]);

  // Treemap data
  const treemapData = useMemo(() =>
    itemSales.slice(0, 20).map((item) => ({
      name: item.name,
      size: item.amount,
    })),
    [itemSales]
  );

  if (salesList.length === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">매출 분석</h2>
        <p className="text-muted-foreground">거래처/품목별 매출 상세 분석</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Customers Pareto */}
        <ChartCard
          title="거래처별 매출 (ABC 분석)"
          description="상위 거래처 매출과 누적 비율"
          formula="누적비율 = 누적매출 / 총매출 × 100"
          benchmark="상위 20% 거래처가 80% 매출 차지 시 전형적 파레토 분포"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={paretoData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                <RechartsTooltip formatter={(value: any, name: any) =>
                  name === "cumPercent" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                } />
                <Legend />
                <Bar yAxisId="left" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="cumPercent" stroke={CHART_COLORS[4]} strokeWidth={2} name="누적비율" dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Sales by Type Donut */}
        <ChartCard
          title="내수/수출 비중"
          description="매출 유형별 비중 분석"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                >
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i]} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Item Treemap */}
      <ChartCard
        title="품목별 매출 비중"
        description="대분류 기준 품목별 매출 비중 (Treemap)"
      >
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="hsl(var(--background))"
              content={(props: any) => {
                const { x, y, width, height, name, value } = props;
                if (width < 40 || height < 25) return <g />;
                return (
                  <g>
                    <rect x={x} y={y} width={width} height={height} fill={CHART_COLORS[0]} opacity={0.85} rx={4} />
                    <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>
                      {String(name).length > 8 ? String(name).substring(0, 8) + "..." : name}
                    </text>
                    <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>
                      {formatCurrency(value, true)}
                    </text>
                  </g>
                );
              }}
            />
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
