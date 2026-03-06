"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomer360 } from "@/lib/analysis/crossAnalysis";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Percent, ShoppingCart, AlertTriangle } from "lucide-react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  LineChart,
  Line,
} from "recharts";
import type {
  SalesRecord,
  CollectionRecord,
  OrderRecord,
  ReceivableAgingRecord,
  OrgCustomerProfitRecord,
} from "@/types";

interface Customer360TabProps {
  salesList: SalesRecord[];
  collectionList: CollectionRecord[];
  orderList: OrderRecord[];
  agingRecords: ReceivableAgingRecord[];
  orgCustProfit: OrgCustomerProfitRecord[];
  isDateFiltered: boolean;
}

export function Customer360Tab({
  salesList,
  collectionList,
  orderList,
  agingRecords,
  orgCustProfit,
  isDateFiltered,
}: Customer360TabProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");

  const customerNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of salesList) {
      if (s.매출처명) names.add(s.매출처명);
    }
    return Array.from(names).sort();
  }, [salesList]);

  const customer360 = useMemo(() => {
    if (!selectedCustomer) return null;
    return calcCustomer360(
      selectedCustomer,
      salesList,
      collectionList,
      orderList,
      agingRecords,
      orgCustProfit
    );
  }, [selectedCustomer, salesList, collectionList, orderList, agingRecords, orgCustProfit]);

  if (customerNames.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        거래처 데이터가 없습니다. 매출 파일을 업로드해 주세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Customer Selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">거래처 선택:</span>
        <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="거래처를 선택하세요" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {customerNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!customer360 ? (
        <div className="text-center py-12 text-muted-foreground">
          거래처를 선택하면 360° 뷰를 확인할 수 있습니다.
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              title="총 매출"
              value={customer360.totalSales}
              format="currency"
              icon={<DollarSign className="h-5 w-5" />}
              formula="해당 거래처 매출 합계"
            />
            <KpiCard
              title="수금율"
              value={customer360.collectionRate}
              format="percent"
              icon={<Percent className="h-5 w-5" />}
              formula="수금액 ÷ 매출액 × 100"
              benchmark="90% 이상 양호"
            />
            <KpiCard
              title="거래 건수"
              value={customer360.salesCount}
              format="number"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="매출 전표 건수"
            />
            <KpiCard
              title="미수 잔액"
              value={customer360.totalReceivable}
              format="currency"
              icon={<AlertTriangle className="h-5 w-5" />}
              formula="미수금 aging 잔액 합계"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sales Trend */}
            <ChartCard
              title={`${selectedCustomer} 월별 매출 추이`}
              dataSourceType="period"
              isDateFiltered={isDateFiltered}
              formula="월별 매출액 합계"
            >
              <ChartContainer height="h-64">
                {customer360.salesTrend.length > 0 ? (
                  <LineChart data={customer360.salesTrend}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: any) => formatCurrency(Number(v))}
                    />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke={CHART_COLORS[0]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      name="매출액"
                      {...ANIMATION_CONFIG}
                    />
                  </LineChart>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    매출 추이 데이터가 없습니다.
                  </div>
                )}
              </ChartContainer>
            </ChartCard>

            {/* Aging Buckets */}
            <ChartCard
              title={`${selectedCustomer} 미수금 Aging`}
              dataSourceType="snapshot"
              isDateFiltered={isDateFiltered}
              formula="미수금 aging 구간별 잔액"
            >
              <ChartContainer height="h-64">
                {customer360.agingBuckets.length > 0 ? (
                  <BarChart data={customer360.agingBuckets}>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: any) => formatCurrency(Number(v))}
                    />
                    <Bar
                      dataKey="amount"
                      name="미수 잔액"
                      fill={CHART_COLORS[3]}
                      radius={[4, 4, 0, 0]}
                      {...ANIMATION_CONFIG}
                    />
                  </BarChart>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    미수금 데이터가 없습니다.
                  </div>
                )}
              </ChartContainer>
            </ChartCard>
          </div>

          {/* Profitability Section */}
          {customer360.gpRate !== undefined && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                title="매출총이익"
                value={customer360.grossProfit ?? 0}
                format="currency"
                formula="303 조직별 거래처별 손익 데이터"
              />
              <KpiCard
                title="매출총이익률"
                value={customer360.gpRate ?? 0}
                format="percent"
                benchmark="20% 이상 양호"
              />
              <KpiCard
                title="영업이익"
                value={customer360.operatingProfit ?? 0}
                format="currency"
              />
              <KpiCard
                title="영업이익률"
                value={customer360.opRate ?? 0}
                format="percent"
                benchmark="5% 이상 양호"
              />
            </div>
          )}

          {/* Order Summary */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              title="총 수주액"
              value={customer360.totalOrders}
              format="currency"
              formula="해당 거래처 수주 합계"
            />
            <KpiCard
              title="수주 건수"
              value={customer360.orderCount}
              format="number"
              formula="수주 전표 건수"
            />
          </div>
        </>
      )}
    </div>
  );
}
