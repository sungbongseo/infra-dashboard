"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcAgingSummary, calcAgingByOrg, calcAgingByPerson, calcRiskAssessments } from "@/lib/analysis/aging";
import { calcPrepaymentSummary, calcOrgPrepayments, calcMonthlyPrepayments } from "@/lib/analysis/prepayment";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterByOrg, filterByDateRange } from "@/lib/utils";

import { StatusTab } from "./tabs/StatusTab";
import { RiskTab } from "./tabs/RiskTab";
import { CreditTab } from "./tabs/CreditTab";
import { DsoTab } from "./tabs/DsoTab";
import { PrepaymentTab } from "./tabs/PrepaymentTab";

export default function ReceivablesPage() {
  const { receivableAging, salesList, collectionList, teamContribution, orgNames } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredAgingMap = useMemo(() => {
    const filtered = new Map<string, any[]>();
    for (const [key, records] of Array.from(receivableAging.entries())) {
      const filteredRecords = filterByOrg(records, effectiveOrgNames, "영업조직");
      if (filteredRecords.length > 0) {
        filtered.set(key, filteredRecords);
      }
    }
    return filtered;
  }, [receivableAging, effectiveOrgNames]);

  const allRecords = useMemo(() => {
    const all: any[] = [];
    Array.from(filteredAgingMap.values()).forEach((records) => {
      all.push(...records);
    });
    return all;
  }, [filteredAgingMap]);

  const hasData = allRecords.length > 0;

  // 기존 분석
  const summary = useMemo(() => calcAgingSummary(allRecords), [allRecords]);
  const byOrg = useMemo(() => calcAgingByOrg(filteredAgingMap), [filteredAgingMap]);
  const byPerson = useMemo(() => calcAgingByPerson(allRecords), [allRecords]);
  const risks = useMemo(() => calcRiskAssessments(allRecords), [allRecords]);

  // DSO/CCC 분석용 필터
  const filteredSales = useMemo(
    () => filterByDateRange(filterByOrg(salesList, effectiveOrgNames, "영업조직"), dateRange, "매출일"),
    [salesList, effectiveOrgNames, dateRange]
  );
  const filteredTeamContrib = useMemo(
    () => filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀"),
    [teamContribution, effectiveOrgNames]
  );

  // 선수금 분석
  const filteredCollections = useMemo(
    () => filterByDateRange(filterByOrg(collectionList, effectiveOrgNames, "영업조직"), dateRange, "수금일"),
    [collectionList, effectiveOrgNames, dateRange]
  );

  const prepaymentSummary = useMemo(() => {
    const totalSales = filteredSales.reduce((s, r) => s + r.장부금액, 0);
    return calcPrepaymentSummary(filteredCollections, totalSales);
  }, [filteredCollections, filteredSales]);

  const orgPrepayments = useMemo(() => calcOrgPrepayments(filteredCollections), [filteredCollections]);
  const monthlyPrepayments = useMemo(() => calcMonthlyPrepayments(filteredCollections), [filteredCollections]);

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
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <StatusTab summary={summary} byOrg={byOrg} highRiskCount={highRiskCount} />
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <RiskTab
            byPerson={byPerson}
            risks={risks}
            highRiskCount={highRiskCount}
            mediumRiskCount={mediumRiskCount}
          />
        </TabsContent>

        <TabsContent value="credit" className="space-y-6">
          <CreditTab allRecords={allRecords} />
        </TabsContent>

        <TabsContent value="dso" className="space-y-6">
          <DsoTab
            allRecords={allRecords}
            filteredSales={filteredSales}
            filteredTeamContrib={filteredTeamContrib}
            filteredCollections={filteredCollections}
          />
        </TabsContent>

        <TabsContent value="prepayment" className="space-y-6">
          <PrepaymentTab
            prepaymentSummary={prepaymentSummary}
            orgPrepayments={orgPrepayments}
            monthlyPrepayments={monthlyPrepayments}
            hasCollections={filteredCollections.length > 0}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
