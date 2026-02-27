"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractMonth } from "@/lib/utils";
import { calcO2CPipeline, calcMonthlyConversion } from "@/lib/analysis/pipeline";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { useFilterStore } from "@/stores/filterStore";
import { useFilteredOrders, useFilteredSales, useFilteredCollections } from "@/lib/hooks/useFilteredData";

import { StatusTab } from "./tabs/StatusTab";
import { AnalysisTab } from "./tabs/AnalysisTab";
import { OrgTab } from "./tabs/OrgTab";
import { PipelineTab } from "./tabs/PipelineTab";
import { O2CFlowTab } from "./tabs/O2CFlowTab";

export default function OrdersAnalysisPage() {
  const isLoading = useDataStore((s) => s.isLoading);
  const { filteredOrders } = useFilteredOrders();
  const { filteredSales } = useFilteredSales();
  const { filteredCollections } = useFilteredCollections();
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
  const conversionRate = totalOrders > 0 ? (totalSales / totalOrders) * 100 : 0;
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
        전환율: d.수주 > 0 ? (d.매출 / d.수주) * 100 : 0,
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
      if (days <= 7) bin = "~7일";
      else if (days <= 14) bin = "~14일";
      else if (days <= 30) bin = "~30일";
      else if (days <= 60) bin = "~60일";
      else if (days <= 90) bin = "~90일";
      else bin = "90일+";
      bins.set(bin, (bins.get(bin) || 0) + 1);
    }
    const order = ["~7일", "~14일", "~30일", "~60일", "~90일", "90일+"];
    return order.map((bin) => ({ bin, count: bins.get(bin) || 0 }));
  }, [filteredOrders]);

  // O2C 파이프라인 데이터
  const pipelineResult = useMemo(
    () => calcO2CPipeline(filteredOrders, filteredSales, filteredCollections),
    [filteredOrders, filteredSales, filteredCollections]
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
  if (filteredOrders.length === 0) return <EmptyState />;

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

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="status">수주 현황</TabsTrigger>
          <TabsTrigger value="analysis">수주 분석</TabsTrigger>
          <TabsTrigger value="org">조직 분석</TabsTrigger>
          <TabsTrigger value="pipeline">O2C 파이프라인</TabsTrigger>
          <TabsTrigger value="o2c-flow">O2C 플로우</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <ErrorBoundary>
            <StatusTab
              totalOrders={totalOrders}
              conversionRate={conversionRate}
              outstandingOrders={outstandingOrders}
              orderCount={filteredOrders.length}
              monthlyOrders={monthlyOrders}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <ErrorBoundary>
            <AnalysisTab orderTypes={orderTypes} leadTimes={leadTimes} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <ErrorBoundary>
            <OrgTab orgOrders={orgOrders} monthlyGap={monthlyGap} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-6">
          <ErrorBoundary>
            <PipelineTab
              orderToSalesRate={orderToSalesRate}
              salesToCollectionRate={salesToCollectionRate}
              outstandingAmount={outstandingAmount}
              pipelineResult={pipelineResult}
              pipelineStages={pipelineStages}
              monthlyConversion={monthlyConversion}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="o2c-flow" className="space-y-6">
          <ErrorBoundary>
            <O2CFlowTab
              pipelineStages={pipelineStages}
              salesToCollectionRate={salesToCollectionRate}
              prepaymentAmount={pipelineResult.prepaymentAmount}
              grossCollections={pipelineResult.grossCollections}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
