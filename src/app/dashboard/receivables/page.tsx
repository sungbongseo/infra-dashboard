"use client";

import { lazy, Suspense, useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiSkeleton, PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcAgingSummary, calcAgingByOrg, calcAgingByPerson, calcRiskAssessments } from "@/lib/analysis/aging";
import { calcPrepaymentSummary, calcOrgPrepayments, calcMonthlyPrepayments } from "@/lib/analysis/prepayment";
import { calcPersonPortfolio, calcPersonHealthData, calcCustomerRepDetail } from "@/lib/analysis/receivableInsight";
import { calcCustomerAgingProfile, calcCurrencyExposure, calcOrgInvoiceBookGap, calcWeightedAgingDays } from "@/lib/analysis/receivableDetail";
import { calcLongTermSummary, calcLongTermCustomers, calcLongTermByOrg, calcBadDebtProvision } from "@/lib/analysis/longTermReceivable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { useFilterStore } from "@/stores/filterStore";
import { useFilteredReceivables, useFilteredSales, useFilteredTeamContribution, useFilteredCollections, useFilteredInventory } from "@/lib/hooks/useFilteredData";

const StatusTab = lazy(() => import("./tabs/StatusTab").then(m => ({ default: m.StatusTab })));
const RiskTab = lazy(() => import("./tabs/RiskTab").then(m => ({ default: m.RiskTab })));
const CreditTab = lazy(() => import("./tabs/CreditTab").then(m => ({ default: m.CreditTab })));
const DsoTab = lazy(() => import("./tabs/DsoTab").then(m => ({ default: m.DsoTab })));
const PrepaymentTab = lazy(() => import("./tabs/PrepaymentTab").then(m => ({ default: m.PrepaymentTab })));
const PersonInsightTab = lazy(() => import("./tabs/PersonInsightTab").then(m => ({ default: m.PersonInsightTab })));
const DetailTab = lazy(() => import("./tabs/DetailTab").then(m => ({ default: m.DetailTab })));
const LongTermTab = lazy(() => import("./tabs/LongTermTab").then(m => ({ default: m.LongTermTab })));
const CollectionDelayTab = lazy(() => import("./tabs/CollectionDelayTab").then(m => ({ default: m.CollectionDelayTab })));

export default function ReceivablesPage() {
  const isLoading = useDataStore((s) => s.isLoading);
  const { filteredInventoryMap } = useFilteredInventory();
  const { filteredRecords: allRecords, filteredAgingMap } = useFilteredReceivables();
  const { filteredSales } = useFilteredSales();
  const { filteredTeamContrib } = useFilteredTeamContribution();
  const { filteredCollections } = useFilteredCollections();
  const dateRange = useFilterStore((s) => s.dateRange);
  const isDateFiltered = !!(dateRange?.from && dateRange?.to);

  const hasData = allRecords.length > 0;

  // 기존 분석
  const summary = useMemo(() => calcAgingSummary(allRecords), [allRecords]);
  const byOrg = useMemo(() => calcAgingByOrg(filteredAgingMap), [filteredAgingMap]);
  const byPerson = useMemo(() => calcAgingByPerson(allRecords), [allRecords]);
  const risks = useMemo(() => calcRiskAssessments(allRecords), [allRecords]);

  const prepaymentSummary = useMemo(() => {
    const totalSales = filteredSales.reduce((s, r) => s + r.장부금액, 0);
    return calcPrepaymentSummary(filteredCollections, totalSales);
  }, [filteredCollections, filteredSales]);

  const orgPrepayments = useMemo(() => calcOrgPrepayments(filteredCollections), [filteredCollections]);
  const monthlyPrepayments = useMemo(() => calcMonthlyPrepayments(filteredCollections), [filteredCollections]);

  // 채권 상세 분석
  const customerProfiles = useMemo(() => calcCustomerAgingProfile(allRecords), [allRecords]);
  const currencyExposure = useMemo(() => calcCurrencyExposure(allRecords), [allRecords]);
  const orgInvoiceBookGap = useMemo(() => calcOrgInvoiceBookGap(allRecords), [allRecords]);
  const weightedAgingDays = useMemo(() => calcWeightedAgingDays(allRecords), [allRecords]);

  // 장기 미수 분석
  const longTermSummary = useMemo(() => calcLongTermSummary(allRecords), [allRecords]);
  const longTermCustomers = useMemo(() => calcLongTermCustomers(allRecords), [allRecords]);
  const longTermByOrg = useMemo(() => calcLongTermByOrg(allRecords), [allRecords]);
  const badDebtProvision = useMemo(() => calcBadDebtProvision(allRecords), [allRecords]);

  // 담당자 인사이트 분석
  const personPortfolio = useMemo(() => calcPersonPortfolio(allRecords), [allRecords]);
  const personHealthData = useMemo(() => calcPersonHealthData(allRecords), [allRecords]);
  const customerRepDetail = useMemo(() => calcCustomerRepDetail(allRecords), [allRecords]);

  const highRiskCount = risks.filter((r) => r.riskGrade === "high").length;
  const mediumRiskCount = risks.filter((r) => r.riskGrade === "medium").length;

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState requiredFiles={["미수채권연령"]} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">미수금 관리</h2>
          <p className="text-muted-foreground">미수채권 연령 분석 및 리스크 관리</p>
        </div>
        <ExportButton
          data={allRecords.map((r) => ({
            영업조직: r.영업조직,
            담당자: r.담당자,
            판매처: r.판매처,
            판매처명: r.판매처명,
            합계_장부금액: r.합계?.장부금액 ?? 0,
            여신한도: r.여신한도,
          }))}
          fileName="미수금현황"
          sheetName="미수금"
        />
      </div>

      <Tabs defaultValue="status" onValueChange={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="status">미수금 현황</TabsTrigger>
          <TabsTrigger value="risk">리스크 관리</TabsTrigger>
          <TabsTrigger value="credit">여신 관리</TabsTrigger>
          <TabsTrigger value="dso">매출채권회전(DSO/CCC)<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span></TabsTrigger>
          <TabsTrigger value="detail">채권 상세</TabsTrigger>
          <TabsTrigger value="longterm">장기 미수</TabsTrigger>
          <TabsTrigger value="prepayment">선수금<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span></TabsTrigger>
          <TabsTrigger value="person-insight">담당자 인사이트</TabsTrigger>
          <TabsTrigger value="collection-delay" disabled={filteredSales.length === 0 || filteredCollections.length === 0}>수금지연<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span></TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <StatusTab summary={summary} byOrg={byOrg} highRiskCount={highRiskCount} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <RiskTab
              byPerson={byPerson}
              risks={risks}
              highRiskCount={highRiskCount}
              mediumRiskCount={mediumRiskCount}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="credit" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CreditTab allRecords={allRecords} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="dso" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <DsoTab
              allRecords={allRecords}
              filteredSales={filteredSales}
              filteredTeamContrib={filteredTeamContrib}
              filteredCollections={filteredCollections}
              inventoryData={filteredInventoryMap}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="detail" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <DetailTab
              profiles={customerProfiles}
              currencyExposure={currencyExposure}
              orgGap={orgInvoiceBookGap}
              weightedDays={weightedAgingDays}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="longterm" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <LongTermTab
              summary={longTermSummary}
              customers={longTermCustomers}
              byOrg={longTermByOrg}
              provision={badDebtProvision}
              allRecords={allRecords}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="prepayment" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PrepaymentTab
              prepaymentSummary={prepaymentSummary}
              orgPrepayments={orgPrepayments}
              monthlyPrepayments={monthlyPrepayments}
              filteredCollections={filteredCollections}
              hasCollections={filteredCollections.length > 0}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="person-insight" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PersonInsightTab
              portfolio={personPortfolio}
              healthData={personHealthData}
              customerRepDetail={customerRepDetail}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="collection-delay" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CollectionDelayTab
              filteredSales={filteredSales}
              filteredCollections={filteredCollections}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
