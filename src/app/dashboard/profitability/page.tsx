"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { filterByOrg, filterByDateRange, aggregateToCustomerLevel, CHART_COLORS } from "@/lib/utils";
import { useFilterContext, useFilteredOrgProfit } from "@/lib/hooks/useFilteredData";
import {
  calcCostStructure,
  calcOrgRatioMetrics,
  calcPlanVsActualHeatmap,
} from "@/lib/analysis/kpi";
import type { CostProfileType } from "@/lib/analysis/kpi";
import {
  calcProductProfitability,
  calcCustomerProfitability,
} from "@/lib/analysis/profitability";
import { calcPlanAchievementSummary, calcOrgAchievement, calcTopContributors, calcMarginDrift } from "@/lib/analysis/planAchievement";
import { calcOrgBreakeven, calcOrgBreakevenFromTeam, calcBreakevenChart } from "@/lib/analysis/breakeven";
import { calcMarginErosion } from "@/lib/analysis/detailedProfitAnalysis";

import { PnlTab } from "./tabs/PnlTab";
import { OrgTab } from "./tabs/OrgTab";
import { ContribTab } from "./tabs/ContribTab";
import { CostTab } from "./tabs/CostTab";
import { PlanTab } from "./tabs/PlanTab";
import { ProductTab } from "./tabs/ProductTab";
import { VarianceTab } from "./tabs/VarianceTab";
import { BreakevenTab } from "./tabs/BreakevenTab";
import { RiskTab } from "./tabs/RiskTab";
import { WhatIfTab } from "./tabs/WhatIfTab";
import { CustProfitTab } from "./tabs/CustProfitTab";
import { CustItemTab } from "./tabs/CustItemTab";

export default function ProfitabilityPage() {
  const teamContribution = useDataStore((s) => s.teamContribution);
  const profitabilityAnalysis = useDataStore((s) => s.profitabilityAnalysis);
  const receivableAging = useDataStore((s) => s.receivableAging);
  const salesList = useDataStore((s) => s.salesList);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const hqCustomerItemProfit = useDataStore((s) => s.hqCustomerItemProfit);
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);
  const isLoading = useDataStore((s) => s.isLoading);

  const { effectiveOrgNames, dateRange } = useFilterContext();
  const { filteredOrgProfit } = useFilteredOrgProfit();
  const filteredTeamContribution = useMemo(() => {
    const orgFiltered = filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀");
    return orgFiltered.filter((r: any) => {
      const person = String(r.영업담당사번 || "").trim();
      return person !== "";
    });
  }, [teamContribution, effectiveOrgNames]);
  const { filteredProfAnalysis, profAnalysisIsFallback } = useMemo(() => {
    const filtered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
    const hasSales = filtered.some((r) => r.매출액?.실적 !== 0);
    const isFallback = profitabilityAnalysis.length > 0 && filtered.length > 0 && !hasSales;
    const data = (filtered.length > 0 && hasSales) ? filtered
      : isFallback ? profitabilityAnalysis
      : filtered;
    return { filteredProfAnalysis: data, profAnalysisIsFallback: isFallback };
  }, [profitabilityAnalysis, effectiveOrgNames]);
  const filteredSales = useMemo(() => filterByDateRange(filterByOrg(salesList, effectiveOrgNames), dateRange, "매출일"), [salesList, effectiveOrgNames, dateRange]);
  const allReceivableRecords = useMemo(() => Array.from(receivableAging.values()).flat(), [receivableAging]);

  // ─── 신규 데이터 타입 필터링 ──────────────────────────────
  const filteredOrgCustProfit = useMemo(() => filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀"), [orgCustomerProfit, effectiveOrgNames]);
  const filteredHqCustItemProfit = useMemo(() => filterByOrg(hqCustomerItemProfit, effectiveOrgNames, "영업조직팀"), [hqCustomerItemProfit, effectiveOrgNames]);

  // ─── customerItemDetail 기간 필터 (스마트 데이터소스) ──────────────────
  const filteredCustItemDetail = useMemo(() => {
    const orgFiltered = filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀");
    if (!dateRange || !dateRange.from || !dateRange.to) return orgFiltered;
    return filterByDateRange(orgFiltered, dateRange, "매출연월");
  }, [customerItemDetail, effectiveOrgNames, dateRange]);

  const isDateFilterActive = !!(dateRange?.from && dateRange?.to);
  const hasCustItemData = filteredCustItemDetail.length > 0;
  const isUsingDateFiltered = isDateFilterActive && hasCustItemData;

  const effectiveProfAnalysis = useMemo(() => {
    if (isUsingDateFiltered) return filteredCustItemDetail as any[];
    return filteredProfAnalysis;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredProfAnalysis]);

  const effectiveHqCustItemProfit = useMemo(() => {
    if (isUsingDateFiltered) return filteredCustItemDetail as any[];
    return filteredHqCustItemProfit;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredHqCustItemProfit]);

  const effectiveOrgCustProfit = useMemo(() => {
    if (isUsingDateFiltered) return aggregateToCustomerLevel(filteredCustItemDetail);
    return filteredOrgCustProfit;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredOrgCustProfit]);

  const hasData = filteredOrgProfit.length > 0 || filteredOrgCustProfit.length > 0 || filteredHqCustItemProfit.length > 0 || hasCustItemData;

  // ─── 손익 Waterfall 데이터 ──────────────────────────────
  const waterfallData = useMemo(() => {
    if (filteredOrgProfit.length === 0) return [];
    const totals = filteredOrgProfit.reduce(
      (acc, r) => ({
        매출액: acc.매출액 + r.매출액.실적,
        매출원가: acc.매출원가 + r.실적매출원가.실적,
        매출총이익: acc.매출총이익 + r.매출총이익.실적,
        판관비: acc.판관비 + r.판매관리비.실적,
        영업이익: acc.영업이익 + r.영업이익.실적,
        공헌이익: acc.공헌이익 + r.공헌이익.실적,
      }),
      { 매출액: 0, 매출원가: 0, 매출총이익: 0, 판관비: 0, 영업이익: 0, 공헌이익: 0 }
    );

    const items: Array<{ name: string; base: number; value: number; fill: string; type: "start" | "decrease" | "subtotal" }> = [];
    items.push({ name: "매출액", base: Math.min(0, totals.매출액), value: Math.abs(totals.매출액), fill: CHART_COLORS[0], type: "start" });
    items.push({ name: "매출원가", base: Math.min(totals.매출액, totals.매출총이익), value: Math.abs(totals.매출원가), fill: CHART_COLORS[4], type: "decrease" });
    items.push({ name: "매출총이익", base: Math.min(0, totals.매출총이익), value: Math.abs(totals.매출총이익), fill: totals.매출총이익 >= 0 ? CHART_COLORS[1] : CHART_COLORS[4], type: "subtotal" });
    items.push({ name: "판관비", base: Math.min(totals.매출총이익, totals.영업이익), value: Math.abs(totals.판관비), fill: CHART_COLORS[3], type: "decrease" });
    items.push({ name: "영업이익", base: Math.min(0, totals.영업이익), value: Math.abs(totals.영업이익), fill: totals.영업이익 >= 0 ? CHART_COLORS[0] : CHART_COLORS[4], type: "subtotal" });
    return items;
  }, [filteredOrgProfit]);

  // ─── 조직 수익성 데이터 ──────────────────────────────
  const bubbleData = useMemo(() =>
    filteredOrgProfit.map((r) => ({
      name: r.영업조직팀,
      x: r.매출액.실적,
      y: r.영업이익율.실적,
      z: Math.max(r.매출총이익.실적, 0),
      grossProfit: r.매출총이익.실적,
    })),
    [filteredOrgProfit]
  );

  // ─── 기여도 분석 데이터 ──────────────────────────────
  const contribRanking = useMemo(() =>
    [...filteredTeamContribution]
      .filter((r) => (r.공헌이익?.실적 || 0) !== 0 || (r.매출액?.실적 || 0) !== 0)
      .sort((a, b) => (b.공헌이익?.실적 || 0) - (a.공헌이익?.실적 || 0))
      .map((r) => {
        const org = (r.영업조직팀 || "").trim();
        const person = (r.영업담당사번 || "").trim();
        return {
          name: person,
          displayName: person ? `${org}_${person}`.substring(0, 15) : org.substring(0, 15),
          org: r.영업조직팀,
          사번: r.영업담당사번,
          공헌이익: r.공헌이익?.실적 ?? 0,
          공헌이익율: r.공헌이익율?.실적 ?? 0,
        };
      }),
    [filteredTeamContribution]
  );

  const contribByRate = useMemo(
    () => [...contribRanking].sort((a, b) => b.공헌이익율 - a.공헌이익율),
    [contribRanking]
  );

  const orgContribPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrgProfit) {
      const org = r.영업조직팀;
      if (!org) continue;
      map.set(org, (map.get(org) || 0) + r.공헌이익.실적);
    }
    const all = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    return all.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredOrgProfit]);
  const excludedNegativeContribCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrgProfit) {
      const org = r.영업조직팀;
      if (!org) continue;
      map.set(org, (map.get(org) || 0) + r.공헌이익.실적);
    }
    return Array.from(map.values()).filter((v) => v <= 0).length;
  }, [filteredOrgProfit]);

  // ─── 비용 구조 데이터 ──────────────────────────────
  const costStructure = useMemo(
    () => calcCostStructure(filteredTeamContribution),
    [filteredTeamContribution]
  );

  const costBarData = useMemo(() => {
    return costStructure
      .sort((a, b) => Math.abs(b.매출액) - Math.abs(a.매출액))
      .slice(0, 20)
      .map((r) => ({
        name: r.id ? `${(r.org || "").trim()}_${r.id}`.substring(0, 15) : (r.org || "").substring(0, 15),
        사번: r.id,
        조직: r.org,
        원재료비: r.원재료비,
        상품매입: r.상품매입,
        외주가공비: r.외주가공비,
        운반비: r.운반비,
        지급수수료: r.지급수수료,
        노무비: r.노무비,
        기타변동비: r.기타변동비,
        고정비: r.고정비,
      }));
  }, [costStructure]);

  const profileDist = useMemo(() => {
    const counts: Record<CostProfileType, number> = {
      자체생산형: 0, 구매직납형: 0, 외주의존형: 0, 혼합형: 0,
    };
    for (const r of costStructure) {
      counts[r.profileType]++;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value,
        fill: ({
          자체생산형: CHART_COLORS[0],
          구매직납형: CHART_COLORS[2],
          외주의존형: CHART_COLORS[3],
          혼합형: CHART_COLORS[5],
        } as Record<string, string>)[name] || CHART_COLORS[5],
      }));
  }, [costStructure]);

  const costEfficiency = useMemo(() => {
    if (costStructure.length === 0) return [];
    const orgMap = new Map<string, { count: number; 원재료비율: number; 상품매입비율: number; 외주비율: number }>();
    for (const r of costStructure) {
      const entry = orgMap.get(r.org) || { count: 0, 원재료비율: 0, 상품매입비율: 0, 외주비율: 0 };
      entry.count++;
      entry.원재료비율 += r.원재료비율;
      entry.상품매입비율 += r.상품매입비율;
      entry.외주비율 += r.외주비율;
      orgMap.set(r.org, entry);
    }
    const orgAvg = new Map<string, { 원재료비율: number; 상품매입비율: number; 외주비율: number }>();
    Array.from(orgMap.entries()).forEach(([org, e]) => {
      orgAvg.set(org, {
        원재료비율: e.원재료비율 / e.count,
        상품매입비율: e.상품매입비율 / e.count,
        외주비율: e.외주비율 / e.count,
      });
    });
    return costStructure
      .sort((a, b) => Math.abs(b.매출액) - Math.abs(a.매출액))
      .slice(0, 15)
      .map((r) => {
        const avg = orgAvg.get(r.org) || { 원재료비율: 0, 상품매입비율: 0, 외주비율: 0 };
        return { ...r, orgAvg: avg };
      });
  }, [costStructure]);

  // ─── 레이더 & 히트맵 데이터 ──────────────────────────────
  const orgRatioMetrics = useMemo(
    () => calcOrgRatioMetrics(filteredOrgProfit),
    [filteredOrgProfit]
  );

  const heatmapData = useMemo(
    () => calcPlanVsActualHeatmap(filteredOrgProfit),
    [filteredOrgProfit]
  );

  // ─── 제품/거래처 수익성 분석 (스마트 데이터소스 활용) ──────
  const productProfitability = useMemo(
    () => calcProductProfitability(effectiveProfAnalysis),
    [effectiveProfAnalysis]
  );

  const productPieData = useMemo(() => {
    const top10 = productProfitability.slice(0, 10);
    const others = productProfitability.slice(10);
    const othersSales = others.reduce((s, p) => s + p.sales, 0);
    const chartData = top10.map((p) => ({
      name: p.product.length > 15 ? p.product.substring(0, 15) + "..." : p.product,
      fullName: p.product,
      value: p.sales,
      margin: p.grossMargin,
    }));
    if (othersSales > 0) {
      chartData.push({ name: "기타", fullName: `기타 ${others.length}개 품목`, value: othersSales, margin: 0 });
    }
    return chartData;
  }, [productProfitability]);

  const customerProfitability = useMemo(
    () => calcCustomerProfitability(effectiveProfAnalysis),
    [effectiveProfAnalysis]
  );

  // ─── 계획 달성 분석 ──────────────────────────────
  const planSummary = useMemo(() => calcPlanAchievementSummary(effectiveProfAnalysis), [effectiveProfAnalysis]);
  const orgAchievement = useMemo(() => calcOrgAchievement(effectiveProfAnalysis), [effectiveProfAnalysis]);
  const topContributors = useMemo(() => calcTopContributors(effectiveProfAnalysis, 10), [effectiveProfAnalysis]);
  const marginDriftItems = useMemo(() => calcMarginDrift(effectiveProfAnalysis, 15), [effectiveProfAnalysis]);

  // ─── 손익분기점 (Break-even / CVP) ──────────────────────────────
  const bepFromTeam = filteredTeamContribution.length > 0;
  const orgBreakeven = useMemo(() => {
    if (filteredTeamContribution.length > 0) {
      return calcOrgBreakevenFromTeam(filteredTeamContribution);
    }
    return calcOrgBreakeven(filteredOrgProfit);
  }, [filteredTeamContribution, filteredOrgProfit]);

  const bepChartData = useMemo(() => {
    if (orgBreakeven.length === 0) return [];
    const totalFixed = orgBreakeven.reduce((s, r) => s + r.fixedCosts, 0);
    const totalSales = orgBreakeven.reduce((s, r) => s + r.sales, 0);
    const totalVariable = orgBreakeven.reduce((s, r) => s + r.variableCosts, 0);
    const varRatio = totalSales > 0 ? totalVariable / totalSales : 0;
    return calcBreakevenChart(totalFixed, varRatio, totalSales * 1.3);
  }, [orgBreakeven]);

  const bepKpiSummary = useMemo(() => {
    const totalBep = orgBreakeven.reduce((s, r) => s + (isFinite(r.bepSales) ? r.bepSales : 0), 0);
    const finiteSafety = orgBreakeven.filter(r => isFinite(r.safetyMarginRate));
    const avgSafetyMargin = finiteSafety.length > 0 ? finiteSafety.reduce((s, r) => s + r.safetyMarginRate, 0) / finiteSafety.length : 0;
    const avgContribMarginRatio = orgBreakeven.length > 0 ? orgBreakeven.reduce((s, r) => s + r.contributionMarginRatio, 0) / orgBreakeven.length * 100 : 0;
    return { totalBep, avgSafetyMargin, avgContribMarginRatio };
  }, [orgBreakeven]);

  // ─── 마진 침식 분석 ──────────────────────────────
  const marginErosion = useMemo(() => calcMarginErosion(effectiveProfAnalysis, "product", 20), [effectiveProfAnalysis]);

  // ─── KPI 합계 ──────────────────────────────
  const { totalGP, totalContrib, opRate, gpRate } = useMemo(() => {
    const sales = filteredOrgProfit.reduce((s, r) => s + r.매출액.실적, 0);
    const op = filteredOrgProfit.reduce((s, r) => s + r.영업이익.실적, 0);
    const gp = filteredOrgProfit.reduce((s, r) => s + r.매출총이익.실적, 0);
    const contrib = filteredOrgProfit.reduce((s, r) => s + r.공헌이익.실적, 0);
    return {
      totalGP: gp, totalContrib: contrib,
      opRate: sales > 0 ? (op / sales) * 100 : 0,
      gpRate: sales > 0 ? (gp / sales) * 100 : 0,
    };
  }, [filteredOrgProfit]);

  const productWeightedGPRate = useMemo(() => {
    const s = productProfitability.reduce((sum, p) => sum + p.sales, 0);
    const g = productProfitability.reduce((sum, p) => sum + p.grossProfit, 0);
    return s > 0 ? (g / s) * 100 : 0;
  }, [productProfitability]);

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">수익성 분석</h2>
          <p className="text-muted-foreground">손익 구조 및 조직별 수익성 비교</p>
        </div>
        <ExportButton
          data={filteredOrgProfit.map((r) => ({
            영업조직: r.영업조직팀,
            매출액_계획: r.매출액.계획,
            매출액_실적: r.매출액.실적,
            매출총이익_실적: r.매출총이익.실적,
            영업이익_실적: r.영업이익.실적,
            영업이익율: r.영업이익율.실적,
          }))}
          fileName="수익성분석"
          sheetName="조직별 수익성"
        />
      </div>

      <Tabs defaultValue="pnl" className="space-y-4">
        <TooltipProvider delayDuration={300}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="pnl">손익 현황</TabsTrigger>
          <TabsTrigger value="org">조직 수익성</TabsTrigger>
          <TabsTrigger value="contrib" disabled={filteredTeamContribution.length === 0}>팀원별 공헌이익</TabsTrigger>
          <TabsTrigger value="cost" disabled={filteredTeamContribution.length === 0}>비용 구조</TabsTrigger>
          <TabsTrigger value="plan" disabled={filteredOrgProfit.length === 0}>계획 달성</TabsTrigger>
          <TabsTrigger value="product" disabled={effectiveProfAnalysis.length === 0}>
            제품 수익성{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
          <TabsTrigger value="risk" disabled={filteredOrgProfit.length === 0}>수익성x리스크</TabsTrigger>
          <TabsTrigger value="variance" disabled={effectiveProfAnalysis.length === 0}>
            계획 달성 분석{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
          <TabsTrigger value="breakeven" disabled={filteredOrgProfit.length === 0}>손익분기</TabsTrigger>
          <TabsTrigger value="whatif" disabled={filteredOrgProfit.length === 0}>시나리오</TabsTrigger>
          <TabsTrigger value="custProfit" disabled={effectiveOrgCustProfit.length === 0}>
            거래처 손익{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
          <TabsTrigger value="custItem" disabled={effectiveHqCustItemProfit.length === 0}>
            거래처×품목{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
        </TabsList>
        </TooltipProvider>

        <TabsContent value="pnl" className="space-y-6">
          <PnlTab totalGP={totalGP} gpRate={gpRate} opRate={opRate} totalContrib={totalContrib} waterfallData={waterfallData} />
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <OrgTab bubbleData={bubbleData} />
        </TabsContent>

        <TabsContent value="contrib" className="space-y-6">
          <ContribTab contribRanking={contribRanking} contribByRate={contribByRate} orgContribPie={orgContribPie} excludedNegativeContribCount={excludedNegativeContribCount} />
        </TabsContent>

        <TabsContent value="cost" className="space-y-6">
          <CostTab costBarData={costBarData} profileDist={profileDist} costEfficiency={costEfficiency} />
        </TabsContent>

        <TabsContent value="plan" className="space-y-6">
          <PlanTab orgRatioMetrics={orgRatioMetrics} heatmapData={heatmapData} />
        </TabsContent>

        <TabsContent value="product" className="space-y-6">
          <ProductTab
            productProfitability={productProfitability}
            productPieData={productPieData}
            customerProfitability={customerProfitability}
            productWeightedGPRate={productWeightedGPRate}
            marginErosion={marginErosion}
            isUsingDateFiltered={isUsingDateFiltered}
            profAnalysisIsFallback={profAnalysisIsFallback}
            dateRange={dateRange}
            hasData={effectiveProfAnalysis.length > 0}
          />
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <RiskTab filteredOrgProfit={filteredOrgProfit} allReceivableRecords={allReceivableRecords} filteredSales={filteredSales} />
        </TabsContent>

        <TabsContent value="variance" className="space-y-6">
          <VarianceTab
            planSummary={planSummary}
            orgAchievement={orgAchievement}
            topContributors={topContributors}
            marginDriftItems={marginDriftItems}
            isUsingDateFiltered={isUsingDateFiltered}
            dateRange={dateRange}
          />
        </TabsContent>

        <TabsContent value="breakeven" className="space-y-6">
          <BreakevenTab orgBreakeven={orgBreakeven} bepChartData={bepChartData} bepKpiSummary={bepKpiSummary} bepFromTeam={bepFromTeam} />
        </TabsContent>

        <TabsContent value="whatif" className="space-y-6">
          <WhatIfTab filteredOrgProfit={filteredOrgProfit} />
        </TabsContent>

        <TabsContent value="custProfit" className="space-y-6">
          <CustProfitTab effectiveOrgCustProfit={effectiveOrgCustProfit} effectiveProfAnalysis={effectiveProfAnalysis} isUsingDateFiltered={isUsingDateFiltered} dateRange={dateRange} />
        </TabsContent>

        <TabsContent value="custItem" className="space-y-6">
          <CustItemTab effectiveHqCustItemProfit={effectiveHqCustItemProfit} isUsingDateFiltered={isUsingDateFiltered} dateRange={dateRange} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
