"use client";

import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomer360 } from "@/lib/analysis/crossAnalysis";
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

interface Customer360ModalProps {
  customerName: string | null;
  onClose: () => void;
  salesList: SalesRecord[];
  collectionList: CollectionRecord[];
  orderList: OrderRecord[];
  agingRecords: ReceivableAgingRecord[];
  orgCustProfit: OrgCustomerProfitRecord[];
}

export function Customer360Modal({
  customerName,
  onClose,
  salesList,
  collectionList,
  orderList,
  agingRecords,
  orgCustProfit,
}: Customer360ModalProps) {
  const customer360 = useMemo(() => {
    if (!customerName) return null;
    return calcCustomer360(customerName, salesList, collectionList, orderList, agingRecords, orgCustProfit);
  }, [customerName, salesList, collectionList, orderList, agingRecords, orgCustProfit]);

  return (
    <Dialog open={!!customerName} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{customerName} — 거래처 360° 뷰</DialogTitle>
          <DialogDescription>매출, 수금, 미수금, 수익성을 종합 조회합니다.</DialogDescription>
        </DialogHeader>

        {customer360 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard title="총 매출" value={customer360.totalSales} format="currency" icon={<DollarSign className="h-5 w-5" />} />
              <KpiCard title="수금율" value={customer360.collectionRate} format="percent" icon={<Percent className="h-5 w-5" />} />
              <KpiCard title="거래 건수" value={customer360.salesCount} format="number" icon={<ShoppingCart className="h-5 w-5" />} />
              <KpiCard title="미수 잔액" value={customer360.totalReceivable} format="currency" icon={<AlertTriangle className="h-5 w-5" />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="월별 매출 추이" dataSourceType="period" isDateFiltered={false}>
                <ChartContainer height="h-48">
                  {customer360.salesTrend.length > 0 ? (
                    <LineChart data={customer360.salesTrend}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                      <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => formatCurrency(Number(v))} />
                      <Line type="monotone" dataKey="amount" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} name="매출액" {...ANIMATION_CONFIG} />
                    </LineChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터 없음</div>
                  )}
                </ChartContainer>
              </ChartCard>

              <ChartCard title="미수금 Aging" dataSourceType="snapshot" isDateFiltered={false}>
                <ChartContainer height="h-48">
                  {customer360.agingBuckets.length > 0 ? (
                    <BarChart data={customer360.agingBuckets}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                      <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => formatCurrency(Number(v))} />
                      <Bar dataKey="amount" name="미수 잔액" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} {...ANIMATION_CONFIG} />
                    </BarChart>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">데이터 없음</div>
                  )}
                </ChartContainer>
              </ChartCard>
            </div>

            {customer360.gpRate !== undefined && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <KpiCard title="매출총이익" value={customer360.grossProfit ?? 0} format="currency" />
                <KpiCard title="매출총이익률" value={customer360.gpRate ?? 0} format="percent" />
                <KpiCard title="영업이익" value={customer360.operatingProfit ?? 0} format="currency" />
                <KpiCard title="영업이익률" value={customer360.opRate ?? 0} format="percent" />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
