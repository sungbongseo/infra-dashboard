"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcPerformanceScores, calcCostEfficiency, calcRepTrend, calcRepProductPortfolio } from "@/lib/analysis/profiling";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { filterByOrg, filterByDateRange, CHART_COLORS } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { ReceivableAgingRecord } from "@/types";

import { PerformanceTab } from "./tabs/PerformanceTab";
import { RankingTab } from "./tabs/RankingTab";
import { CostTab } from "./tabs/CostTab";
import { TrendTab } from "./tabs/TrendTab";
import { ProductTab } from "./tabs/ProductTab";

export default function ProfilesPage() {
  const { salesList, orderList, collectionList, teamContribution, customerItemDetail, receivableAging, orgNames } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredSales = useMemo(() => {
    const byOrg = filterByOrg(salesList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "매출일");
  }, [salesList, effectiveOrgNames, dateRange]);
  const filteredOrders = useMemo(() => {
    const byOrg = filterByOrg(orderList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "수주일");
  }, [orderList, effectiveOrgNames, dateRange]);
  const filteredCollections = useMemo(() => {
    const byOrg = filterByOrg(collectionList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "수금일");
  }, [collectionList, effectiveOrgNames, dateRange]);
  const filteredTeamContribution = useMemo(() => filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀"), [teamContribution, effectiveOrgNames]);
  const filteredCustomerItemDetail = useMemo(() => filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀"), [customerItemDetail, effectiveOrgNames]);

  // 미수채권연령: Map의 모든 values를 flat()하여 단일 배열로 + orgNames 필터
  const allAgingRecords: ReceivableAgingRecord[] = useMemo(() => {
    const allRecords: ReceivableAgingRecord[] = [];
    for (const records of Array.from(receivableAging.values())) {
      allRecords.push(...records);
    }
    return filterByOrg(allRecords, effectiveOrgNames, "영업조직");
  }, [receivableAging, effectiveOrgNames]);

  const hasAgingData = allAgingRecords.length > 0;

  const profiles = useMemo(
    () => calcPerformanceScores(
      filteredSales,
      filteredOrders,
      filteredCollections,
      filteredTeamContribution,
      hasAgingData ? allAgingRecords : undefined
    ),
    [filteredSales, filteredOrders, filteredCollections, filteredTeamContribution, allAgingRecords, hasAgingData]
  );

  const hasData = profiles.length > 0;
  const selected = selectedPerson ? profiles.find((p) => p.id === selectedPerson) : profiles[0];

  // 축별 만점 (5축이면 20, 4축이면 25)
  const axisMax = hasAgingData ? 20 : 25;

  const radarData = useMemo(() => {
    if (!selected) return [];
    const acc = { 매출: 0, 수주: 0, 수익성: 0, 수금: 0, 미수금건전성: 0 };
    for (const p of profiles) {
      acc.매출 += p.score.salesScore;
      acc.수주 += p.score.orderScore;
      acc.수익성 += p.score.profitScore;
      acc.수금 += p.score.collectionScore;
      acc.미수금건전성 += p.score.receivableScore;
    }
    const n = profiles.length || 1;
    const base = [
      { subject: "매출", value: selected.score.salesScore, avg: acc.매출 / n, fullMark: axisMax },
      { subject: "수주", value: selected.score.orderScore, avg: acc.수주 / n, fullMark: axisMax },
      { subject: "수익성", value: selected.score.profitScore, avg: acc.수익성 / n, fullMark: axisMax },
      { subject: "수금", value: selected.score.collectionScore, avg: acc.수금 / n, fullMark: axisMax },
    ];
    if (hasAgingData) {
      base.push({ subject: "미수금건전성", value: selected.score.receivableScore, avg: acc.미수금건전성 / n, fullMark: axisMax });
    }
    return base;
  }, [selected, profiles, axisMax, hasAgingData]);

  const rankingData = useMemo(
    () => profiles.slice(0, 20).map((p) => ({
      name: p.name || p.id,
      score: Math.round(p.score.totalScore * 10) / 10,
      isSelected: p.id === selected?.id,
    })),
    [profiles, selected]
  );

  // 선택된 사원의 상위 거래처 비중 파이차트 데이터
  const customerPieData = useMemo(() => {
    if (!selected || selected.topCustomers.length === 0) return [];
    const top5 = selected.topCustomers.slice(0, 5);
    const normalizeShare = (s: number) => (s > 1 ? s / 100 : s);
    const topShare = top5.reduce((sum, c) => sum + normalizeShare(c.share), 0);
    const result = top5.map((c, i) => ({
      name: c.name,
      value: Math.round(normalizeShare(c.share) * 1000) / 10,
      amount: c.amount,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
    if (topShare < 1) {
      result.push({
        name: "기타",
        value: Math.round((1 - topShare) * 1000) / 10,
        amount: 0,
        fill: "hsl(0, 0%, 75%)",
      });
    }
    return result;
  }, [selected]);

  // Tab 3: 비용 효율 분석
  const costEfficiencyData = useMemo(
    () => calcCostEfficiency(filteredTeamContribution),
    [filteredTeamContribution]
  );
  const selectedCostData = useMemo(
    () => selected ? costEfficiencyData.find((c) => c.personId === selected.id) : undefined,
    [costEfficiencyData, selected]
  );
  const orgAvgCost = useMemo(() => {
    if (!selectedCostData || costEfficiencyData.length === 0) return null;
    const sameOrg = costEfficiencyData.filter((c) => c.org === selectedCostData.org);
    if (sameOrg.length === 0) return null;
    const n = sameOrg.length;
    return {
      rawMaterialRate: sameOrg.reduce((s, c) => s + c.rawMaterialRate, 0) / n,
      purchaseRate: sameOrg.reduce((s, c) => s + c.purchaseRate, 0) / n,
      outsourcingRate: sameOrg.reduce((s, c) => s + c.outsourcingRate, 0) / n,
      variableCostRate: sameOrg.reduce((s, c) => s + c.variableCostRate, 0) / n,
      mfgVariableCostRate: sameOrg.reduce((s, c) => s + c.mfgVariableCostRate, 0) / n,
      fixedCostRate: sameOrg.reduce((s, c) => s + c.fixedCostRate, 0) / n,
    };
  }, [selectedCostData, costEfficiencyData]);

  // Tab 4: 실적 트렌드
  const repTrend = useMemo(
    () => selected ? calcRepTrend(filteredSales, filteredOrders, filteredCollections, selected.id) : null,
    [selected, filteredSales, filteredOrders, filteredCollections]
  );

  // Tab 5: 제품 포트폴리오
  const productPortfolio = useMemo(
    () => selected ? calcRepProductPortfolio(filteredCustomerItemDetail, selected.id) : null,
    [selected, filteredCustomerItemDetail]
  );

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  const formulaText = hasAgingData
    ? "매출 점수 = 개인 매출액 ÷ 조직 최대 매출 × 20\n수주 점수 = 개인 수주액 ÷ 조직 최대 수주 × 20\n수익성 점수 = 개인 공헌이익률 ÷ 조직 최대율 × 20\n수금 점수 = 수금율 × 20\n미수금건전성 = (1 − 장기연체비율) × 20"
    : "매출 점수 = 개인 매출액 ÷ 조직 최대 매출 × 25\n수주 점수 = 개인 수주액 ÷ 조직 최대 수주 × 25\n수익성 점수 = 개인 공헌이익률 ÷ 조직 최대율 × 25\n수금 점수 = 수금율 × 25";

  const descText = hasAgingData
    ? "5개 항목(매출/수주/수익성/수금/미수금건전성)을 각각 20점 만점으로 평가합니다. 파란색 영역이 개인 성과이고 점선이 조직 평균입니다. 레이더 차트가 둥글고 넓을수록 모든 항목에서 균형 잡힌 성과를 내고 있다는 뜻입니다."
    : "4개 항목(매출/수주/수익성/수금)을 각각 25점 만점으로 평가합니다. 파란색 영역이 개인 성과이고 점선이 조직 평균입니다. 레이더 차트가 둥글고 넓을수록 모든 항목에서 균형 잡힌 성과를 내고 있다는 뜻입니다.";

  const rankFormulaText = hasAgingData
    ? "총점 = 매출(20점) + 수주(20점) + 수익성(20점) + 수금(20점) + 미수금건전성(20점) = 100점 만점\n각 항목 점수 = 개인 값 ÷ 조직 최대 값 × 20"
    : "총점 = 매출(25점) + 수주(25점) + 수익성(25점) + 수금(25점) = 100점 만점\n각 항목 점수 = 개인 값 ÷ 조직 최대 값 × 25";

  // 비용 레이더 데이터 (개인 vs 조직 평균)
  const costRadarData = selectedCostData && orgAvgCost ? [
    { subject: "원재료비", value: selectedCostData.rawMaterialRate, avg: orgAvgCost.rawMaterialRate },
    { subject: "상품매입", value: selectedCostData.purchaseRate, avg: orgAvgCost.purchaseRate },
    { subject: "외주가공", value: selectedCostData.outsourcingRate, avg: orgAvgCost.outsourcingRate },
    { subject: "판관변동", value: selectedCostData.variableCostRate, avg: orgAvgCost.variableCostRate },
    { subject: "제조변동", value: selectedCostData.mfgVariableCostRate, avg: orgAvgCost.mfgVariableCostRate },
    { subject: "판관고정", value: selectedCostData.fixedCostRate, avg: orgAvgCost.fixedCostRate },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">영업사원 성과 프로파일</h2>
          <p className="text-muted-foreground">개인별 성과 스코어카드 및 동료 비교</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={profiles.map((p) => ({
              사번: p.id,
              이름: p.name,
              조직: p.org,
              총점: p.score.totalScore,
              매출점수: p.score.salesScore,
              수주점수: p.score.orderScore,
              수익성점수: p.score.profitScore,
              수금점수: p.score.collectionScore,
              ...(hasAgingData ? { 미수금건전성점수: p.score.receivableScore } : {}),
              매출액: p.salesAmount,
              수주액: p.orderAmount,
              수금액: p.collectionAmount,
              공헌이익율: p.contributionMarginRate,
              거래처수: p.customerCount,
              품목수: p.itemCount,
              HHI: p.hhi,
              HHI리스크: p.hhiRiskLevel,
            }))}
            fileName="영업사원_성과"
            sheetName="성과 프로파일"
          />
          <Select value={selected?.id || ""} onValueChange={setSelectedPerson}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="영업사원 선택" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name || p.id} ({p.org})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="performance">종합 성과</TabsTrigger>
          <TabsTrigger value="ranking">순위 / 거래처</TabsTrigger>
          <TabsTrigger value="cost">비용 효율</TabsTrigger>
          <TabsTrigger value="trend">실적 트렌드</TabsTrigger>
          <TabsTrigger value="product">제품 포트폴리오</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          <PerformanceTab
            selected={selected}
            hasAgingData={hasAgingData}
            axisMax={axisMax}
            radarData={radarData}
            profilesLength={profiles.length}
            formulaText={formulaText}
            descText={descText}
          />
        </TabsContent>

        <TabsContent value="ranking" className="space-y-6">
          <RankingTab
            selected={selected}
            rankingData={rankingData}
            customerPieData={customerPieData}
            rankFormulaText={rankFormulaText}
          />
        </TabsContent>

        <TabsContent value="cost" className="space-y-6">
          <CostTab
            hasTeamContribution={filteredTeamContribution.length > 0}
            selected={selected}
            selectedCostData={selectedCostData}
            costRadarData={costRadarData}
            costEfficiencyData={costEfficiencyData}
          />
        </TabsContent>

        <TabsContent value="trend" className="space-y-6">
          <TrendTab repTrend={repTrend} />
        </TabsContent>

        <TabsContent value="product" className="space-y-6">
          <ProductTab
            hasCustomerItemDetail={filteredCustomerItemDetail.length > 0}
            productPortfolio={productPortfolio}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
