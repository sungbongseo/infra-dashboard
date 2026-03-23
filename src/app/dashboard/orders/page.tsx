"use client";

import { lazy, Suspense, useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiSkeleton, PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractMonth } from "@/lib/utils";
import { calcO2CPipeline, calcMonthlyConversion } from "@/lib/analysis/pipeline";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { useFilterStore } from "@/stores/filterStore";
import { useFilteredOrders, useFilteredSales, useFilteredCollections, useFilteredInventory, useFilteredReceivables } from "@/lib/hooks/useFilteredData";

const StatusTab = lazy(() => import("./tabs/StatusTab").then(m => ({ default: m.StatusTab })));
const AnalysisTab = lazy(() => import("./tabs/AnalysisTab").then(m => ({ default: m.AnalysisTab })));
const OrgTab = lazy(() => import("./tabs/OrgTab").then(m => ({ default: m.OrgTab })));
const PipelineTab = lazy(() => import("./tabs/PipelineTab").then(m => ({ default: m.PipelineTab })));
const O2CFlowTab = lazy(() => import("./tabs/O2CFlowTab").then(m => ({ default: m.O2CFlowTab })));
const ConversionTab = lazy(() => import("./tabs/ConversionTab").then(m => ({ default: m.ConversionTab })));
const InventoryTab = lazy(() => import("./tabs/InventoryTab").then(m => ({ default: m.InventoryTab })));

export default function OrdersAnalysisPage() {
  const isLoading = useDataStore((s) => s.isLoading);
  const { filteredOrders } = useFilteredOrders();
  const { filteredSales } = useFilteredSales();
  const { filteredCollections } = useFilteredCollections();
  const { filteredInventoryRecords } = useFilteredInventory();
  const { filteredRecords: filteredAgingRecords } = useFilteredReceivables();
  const dateRange = useFilterStore((s) => s.dateRange);
  const isDateFiltered = !!(dateRange?.from && dateRange?.to);

  const monthlyOrders = useMemo(() => {
    const map = new Map<string, { month: string; 수주금액: number; 수주건수: number }>();
    for (const r of filteredOrders) {
      const m = extractMonth(r.수주일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주금액: 0, 수주건수: 0 };
      entry.수주금액 += r.장부금액;
      entry.수주건수 += 1;
      map.set(m, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOrders]);

  const orderTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrders) {
      const type = r.수주유형명 || r.수주유형 || "기타";
      map.set(type, (map.get(type) || 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  const totalOrders = filteredOrders.reduce((s, r) => s + r.장부금액, 0);
  const totalSales = filteredSales.reduce((s, r) => s + r.장부금액, 0);
  // 매출/수주 비율: 동일 기간 매출액÷수주액. 수주 건별 전환 추적이 아닌 기간 비율이므로 100% 초과 가능
  const salesOrderRatio = totalOrders > 0 ? (totalSales / totalOrders) * 100 : 0;
  const outstandingOrders = totalOrders - totalSales;

  // 조직별 수주 분석
  const orgOrders = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrders) {
      const org = r.영업조직 || "미분류";
      map.set(org, (map.get(org) || 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .map(([org, amount]) => ({ org, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredOrders]);

  // 수주→매출 전환 갭 (월별)
  const monthlyGap = useMemo(() => {
    const map = new Map<string, { month: string; 수주: number; 매출: number }>();
    for (const r of filteredOrders) {
      const m = extractMonth(r.수주일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주: 0, 매출: 0 };
      entry.수주 += r.장부금액;
      map.set(m, entry);
    }
    for (const r of filteredSales) {
      const m = extractMonth(r.매출일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주: 0, 매출: 0 };
      entry.매출 += r.장부금액;
      map.set(m, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((d) => ({
        ...d,
        갭: d.수주 - d.매출,
        매출전환율: d.수주 > 0 ? (d.매출 / d.수주) * 100 : 0,
      }));
  }, [filteredOrders, filteredSales]);

  const leadTimes = useMemo(() => {
    const bins = new Map<string, number>();
    for (const r of filteredOrders) {
      if (!r.수주일 || !r.납품요청일) continue;
      const orderDate = new Date(r.수주일);
      const deliveryDate = new Date(r.납품요청일);
      if (isNaN(orderDate.getTime()) || isNaN(deliveryDate.getTime())) continue;
      const days = Math.round((deliveryDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      let bin = "";
      if (days < 0) bin = "음수(확인필요)";
      else if (days <= 7) bin = "~7일";
      else if (days <= 14) bin = "~14일";
      else if (days <= 30) bin = "~30일";
      else if (days <= 60) bin = "~60일";
      else if (days <= 90) bin = "~90일";
      else bin = "90일+";
      bins.set(bin, (bins.get(bin) || 0) + 1);
    }
    const order = ["음수(확인필요)", "~7일", "~14일", "~30일", "~60일", "~90일", "90일+"];
    return order.map((bin) => ({ bin, count: bins.get(bin) || 0 }));
  }, [filteredOrders]);

  // receivableAging 실제 미수금 총액
  const agingTotal = useMemo(() => {
    if (filteredAgingRecords.length === 0) return undefined;
    let total = 0;
    for (const r of filteredAgingRecords) {
      total += r.합계.장부금액;
    }
    return total > 0 ? total : undefined;
  }, [filteredAgingRecords]);

  // O2C 파이프라인 데이터
  const pipelineResult = useMemo(
    () => calcO2CPipeline(filteredOrders, filteredSales, filteredCollections, agingTotal),
    [filteredOrders, filteredSales, filteredCollections, agingTotal]
  );
  const pipelineStages = pipelineResult.stages;

  const monthlyConversion = useMemo(
    () => calcMonthlyConversion(filteredOrders, filteredSales, filteredCollections),
    [filteredOrders, filteredSales, filteredCollections]
  );

  // O2C KPI 값 계산
  const orderToSalesRate = pipelineStages.find((s) => s.stage === "매출전환")?.percentage ?? 0;
  const salesToCollectionRate = useMemo(() => {
    const totalSalesAmt = filteredSales.reduce((s, r) => s + r.장부금액, 0);
    const netCollAmt = pipelineResult.netCollections;
    return totalSalesAmt > 0 ? (netCollAmt / totalSalesAmt) * 100 : 0;
  }, [filteredSales, pipelineResult]);
  const outstandingAmount = pipelineStages.find((s) => s.stage === "미수잔액")?.amount ?? 0;

  if (isLoading) return <PageSkeleton />;
  if (filteredOrders.length === 0) return <EmptyState requiredFiles={["수주리스트"]} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">수주 분석</h2>
        <p className="text-muted-foreground">수주 파이프라인 및 전환율 분석</p>
      </div>

      <div className="flex items-center justify-between">
        <div />
        <ExportButton
          data={filteredOrders.map((r) => ({
            수주일: r.수주일,
            영업조직: r.영업조직,
            수주유형: r.수주유형명 || r.수주유형 || "",
            판매처: r.판매처명 || r.판매처 || "",
            장부금액: r.장부금액,
            납품요청일: r.납품요청일 || "",
          }))}
          fileName="수주분석"
          sheetName="수주 데이터"
        />
      </div>

      <Tabs defaultValue="status" onValueChange={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="status">수주 현황</TabsTrigger>
          <TabsTrigger value="analysis">수주 분석</TabsTrigger>
          <TabsTrigger value="org">조직 분석</TabsTrigger>
          <TabsTrigger value="pipeline">O2C 파이프라인</TabsTrigger>
          <TabsTrigger value="o2c-flow">O2C 플로우</TabsTrigger>
          <TabsTrigger value="conversion">전환율</TabsTrigger>
          {filteredInventoryRecords.length > 0 && (
            <TabsTrigger value="inventory">재고 분석</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <StatusTab
              totalOrders={totalOrders}
              salesOrderRatio={salesOrderRatio}
              outstandingOrders={outstandingOrders}
              orderCount={filteredOrders.length}
              monthlyOrders={monthlyOrders}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <AnalysisTab orderTypes={orderTypes} leadTimes={leadTimes} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <OrgTab orgOrders={orgOrders} monthlyGap={monthlyGap} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PipelineTab
              orderToSalesRate={orderToSalesRate}
              salesToCollectionRate={salesToCollectionRate}
              outstandingAmount={outstandingAmount}
              pipelineResult={pipelineResult}
              pipelineStages={pipelineStages}
              monthlyConversion={monthlyConversion}
              isDateFiltered={isDateFiltered}
              isAgingBased={pipelineResult.isAgingBased}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="o2c-flow" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <O2CFlowTab
              pipelineStages={pipelineStages}
              salesToCollectionRate={salesToCollectionRate}
              prepaymentAmount={pipelineResult.prepaymentAmount}
              grossCollections={pipelineResult.grossCollections}
              isAgingBased={pipelineResult.isAgingBased}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="conversion" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ConversionTab filteredOrders={filteredOrders} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        {filteredInventoryRecords.length > 0 && (
          <TabsContent value="inventory" className="space-y-6">
            <Suspense fallback={<KpiSkeleton />}>
            <ErrorBoundary>
              <InventoryTab data={filteredInventoryRecords} isDateFiltered={isDateFiltered} />
            </ErrorBoundary>
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
