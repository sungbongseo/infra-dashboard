"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcAgingSummary, calcAgingByOrg, calcAgingByPerson, calcRiskAssessments } from "@/lib/analysis/aging";
import { calcPrepaymentSummary, calcOrgPrepayments, calcMonthlyPrepayments } from "@/lib/analysis/prepayment";
import { calcPersonPortfolio, calcPersonHealthData, calcCustomerRepDetail } from "@/lib/analysis/receivableInsight";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { useFilteredReceivables, useFilteredSales, useFilteredTeamContribution, useFilteredCollections } from "@/lib/hooks/useFilteredData";

import { StatusTab } from "./tabs/StatusTab";
import { RiskTab } from "./tabs/RiskTab";
import { CreditTab } from "./tabs/CreditTab";
import { DsoTab } from "./tabs/DsoTab";
import { PrepaymentTab } from "./tabs/PrepaymentTab";
import { PersonInsightTab } from "./tabs/PersonInsightTab";

export default function ReceivablesPage() {
  const isLoading = useDataStore((s) => s.isLoading);
  const { filteredRecords: allRecords, filteredAgingMap } = useFilteredReceivables();
  const { filteredSales } = useFilteredSales();
  const { filteredTeamContrib } = useFilteredTeamContribution();
  const { filteredCollections } = useFilteredCollections();

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

  // 담당자 인사이트 분석
  const personPortfolio = useMemo(() => calcPersonPortfolio(allRecords), [allRecords]);
  const personHealthData = useMemo(() => calcPersonHealthData(allRecords), [allRecords]);
  const customerRepDetail = useMemo(() => calcCustomerRepDetail(allRecords), [allRecords]);

  const highRiskCount = risks.filter((r) => r.riskGrade === "high").length;
  const mediumRiskCount = risks.filter((r) => r.riskGrade === "medium").length;

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">미수금 관리</h2>
        <p className="text-muted-foreground">미수채권 연령 분석 및 리스크 관리</p>
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="status">미수금 현황</TabsTrigger>
          <TabsTrigger value="risk">리스크 관리</TabsTrigger>
          <TabsTrigger value="credit">여신 관리</TabsTrigger>
          <TabsTrigger value="dso">DSO/CCC</TabsTrigger>
          <TabsTrigger value="prepayment">선수금</TabsTrigger>
          <TabsTrigger value="person-insight">담당자 인사이트</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <ErrorBoundary>
            <StatusTab summary={summary} byOrg={byOrg} highRiskCount={highRiskCount} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <ErrorBoundary>
            <RiskTab
              byPerson={byPerson}
              risks={risks}
              highRiskCount={highRiskCount}
              mediumRiskCount={mediumRiskCount}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="credit" className="space-y-6">
          <ErrorBoundary>
            <CreditTab allRecords={allRecords} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="dso" className="space-y-6">
          <ErrorBoundary>
            <DsoTab
              allRecords={allRecords}
              filteredSales={filteredSales}
              filteredTeamContrib={filteredTeamContrib}
              filteredCollections={filteredCollections}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="prepayment" className="space-y-6">
          <ErrorBoundary>
            <PrepaymentTab
              prepaymentSummary={prepaymentSummary}
              orgPrepayments={orgPrepayments}
              monthlyPrepayments={monthlyPrepayments}
              hasCollections={filteredCollections.length > 0}
            />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="person-insight" className="space-y-6">
          <ErrorBoundary>
            <PersonInsightTab
              portfolio={personPortfolio}
              healthData={personHealthData}
              customerRepDetail={customerRepDetail}
            />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
