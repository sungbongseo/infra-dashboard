"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, cn, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomer360 } from "@/lib/analysis/crossAnalysis";
import * as Popover from "@radix-ui/react-popover";
import { DollarSign, Percent, ShoppingCart, AlertTriangle, ChevronsUpDown, Search, Check } from "lucide-react";
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
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 매출 금액순 거래처 리스트 (검색용)
  const customerList = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    for (const s of salesList) {
      if (!s.매출처명) continue;
      const e = map.get(s.매출처명) || { amount: 0, count: 0 };
      e.amount += Math.abs(s.장부금액);
      e.count++;
      map.set(s.매출처명, e);
    }
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, amount: v.amount, count: v.count }))
      .sort((a, b) => b.amount - a.amount);
  }, [salesList]);

  const customerNames = useMemo(() => customerList.map(c => c.name), [customerList]);

  // 검색 필터링
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customerList;
    const q = searchQuery.trim().toLowerCase();
    return customerList.filter(c => c.name.toLowerCase().includes(q));
  }, [customerList, searchQuery]);

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
      <EmptyState message="거래처 데이터가 없습니다. 매출/손익 데이터를 업로드해 주세요." />
    );
  }

  return (
    <div className="space-y-6">
      {/* Customer Selector — 검색 가능한 Popover */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">거래처 선택:</span>
        <Popover.Root open={selectorOpen} onOpenChange={setSelectorOpen}>
          <Popover.Trigger asChild>
            <button className="inline-flex items-center justify-between w-[340px] rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent">
              <span className={selectedCustomer ? "" : "text-muted-foreground"}>
                {selectedCustomer || "거래처를 선택하세요"}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="z-50 w-[380px] rounded-md border bg-popover p-0 shadow-md"
              align="start"
              sideOffset={4}
            >
              {/* 검색 입력 */}
              <div className="flex items-center border-b px-3 py-2">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  placeholder="거래처명 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
              {/* 거래처 리스트 (매출순) */}
              <div className="max-h-[300px] overflow-y-auto p-1">
                {filteredCustomers.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    검색 결과가 없습니다
                  </div>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => {
                        setSelectedCustomer(c.name);
                        setSelectorOpen(false);
                        setSearchQuery("");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                        c.name === selectedCustomer && "bg-accent"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {c.name === selectedCustomer && <Check className="h-3.5 w-3.5 text-primary" />}
                        <span className={c.name === selectedCustomer ? "font-medium" : ""}>{c.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatCurrency(c.amount, true)} · {c.count}건
                      </span>
                    </button>
                  ))
                )}
              </div>
              {/* 하단 거래처 수 표시 */}
              <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
                {filteredCustomers.length === customerList.length
                  ? `전체 ${customerList.length}개 거래처`
                  : `${filteredCustomers.length} / ${customerList.length}개 거래처`}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {selectedCustomer && (
          <button
            onClick={() => setSelectedCustomer("")}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            선택 해제
          </button>
        )}
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
