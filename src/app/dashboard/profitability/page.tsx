"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiSkeleton, PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { TabGroup, type TabGroupDef } from "@/components/dashboard/TabGroup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { filterByOrg, filterByDateRange, filterByMonth, aggregateToCustomerLevel, filterOrgProfitLeafOnly, aggregateTeamContribution, aggregateProfitabilityAnalysis, aggregateItemProfitability, aggregateOrgCustomerProfit, aggregateHqCustomerItemProfit, aggregateCustomerItemDetail, aggregateItemCostDetail, CHART_COLORS } from "@/lib/utils";
import { useFilterContext, useFilteredOrgProfit } from "@/lib/hooks/useFilteredData";
import { calcMonthlyTrend, calcMoMGrowth, padActual } from "@/lib/analysis/monthlyTrend";
import {
  calcCostStructure,
  calcOrgRatioMetrics,
  calcPlanVsActualHeatmap,
} from "@/lib/analysis/kpi";
import { truncateLabel } from "@/components/charts";
import {
  calcProductProfitability,
  calcCustomerProfitability,
} from "@/lib/analysis/profitability";
import {
  calcPlanAchievementSummary,
  calcOrgAchievement,
  calcTopContributors,
  calcMarginDrift,
  checkPlanDataQuality,
  calcOrgGapContribution,
  generatePlanInsight,
} from "@/lib/analysis/planAchievement";
import { calcOrgBreakeven, calcOrgBreakevenFromTeam, calcBreakevenChart, calcWeightedBep } from "@/lib/analysis/breakeven";
import { calcMarginErosion } from "@/lib/analysis/detailedProfitAnalysis";
import {
  calcItemCostSummary,
  calcCostCategoryVariance,
  calcProductContributionRanking,
  calcTeamCostEfficiency,
  calcContributionWaterfall,
  calcCostBucketBreakdown,
  calcItemVarianceRanking,
  calcPlanAchievementQuadrant,
  calcUnitCostAnalysis,
  calcCostDriverAnalysis,
} from "@/lib/analysis/itemCostAnalysis";

const PnlTab = lazy(() => import("./tabs/PnlTab").then(m => ({ default: m.PnlTab })));
const OrgTab = lazy(() => import("./tabs/OrgTab").then(m => ({ default: m.OrgTab })));
const ContribTab = lazy(() => import("./tabs/ContribTab").then(m => ({ default: m.ContribTab })));
const CostTab = lazy(() => import("./tabs/CostTab").then(m => ({ default: m.CostTab })));
const PlanTab = lazy(() => import("./tabs/PlanTab").then(m => ({ default: m.PlanTab })));
const ProductTab = lazy(() => import("./tabs/ProductTab").then(m => ({ default: m.ProductTab })));
const VarianceTab = lazy(() => import("./tabs/VarianceTab").then(m => ({ default: m.VarianceTab })));
const BreakevenTab = lazy(() => import("./tabs/BreakevenTab").then(m => ({ default: m.BreakevenTab })));
const RiskTab = lazy(() => import("./tabs/RiskTab").then(m => ({ default: m.RiskTab })));
const WhatIfTab = lazy(() => import("./tabs/WhatIfTab").then(m => ({ default: m.WhatIfTab })));
const CustProfitTab = lazy(() => import("./tabs/CustProfitTab").then(m => ({ default: m.CustProfitTab })));
const CustItemTab = lazy(() => import("./tabs/CustItemTab").then(m => ({ default: m.CustItemTab })));
const DetailedProfitTab = lazy(() => import("./tabs/DetailedProfitTab"));
const SensitivityTab = lazy(() => import("./tabs/SensitivityTab").then(m => ({ default: m.SensitivityTab })));
const ItemCostTab = lazy(() => import("./tabs/ItemCostTab").then(m => ({ default: m.ItemCostTab })));
const CostVarianceTab = lazy(() => import("./tabs/CostVarianceTab").then(m => ({ default: m.CostVarianceTab })));
const StandardCostTab = lazy(() => import("./tabs/StandardCostTab").then(m => ({ default: m.StandardCostTab })));
const CustomerRiskMatrixTab = lazy(() => import("./tabs/CustomerRiskMatrixTab").then(m => ({ default: m.CustomerRiskMatrixTab })));
const SgaBreakdownTab = lazy(() => import("./tabs/SgaBreakdownTab").then(m => ({ default: m.SgaBreakdownTab })));
const PortfolioTab = lazy(() => import("./tabs/PortfolioTab").then(m => ({ default: m.PortfolioTab })));
const PricingSimTab = lazy(() => import("./tabs/PricingSimTab").then(m => ({ default: m.PricingSimTab })));
const OffsetEffectTab = lazy(() => import("./tabs/OffsetEffectTab").then(m => ({ default: m.OffsetEffectTab })));
const CostTrueVarianceTab = lazy(() => import("./tabs/CostTrueVarianceTab").then(m => ({ default: m.CostTrueVarianceTab })));

const PROFIT_TAB_GROUPS: TabGroupDef[] = [
  { id: "basic", label: "기본 분석", tabs: ["pnl", "org", "contrib", "cost", "plan"] },
  { id: "advanced", label: "심화 분석", tabs: ["product", "risk", "variance", "breakeven", "whatif", "sensitivity", "offset"] },
  { id: "customer", label: "거래처 분석", tabs: ["custProfit", "custItem", "detailed", "custRiskMatrix", "sgaBreakdown"] },
  { id: "cost", label: "원가 분석", tabs: ["itemCost", "costVariance", "standardCost", "costTrueVariance", "portfolio", "pricingSim"] },
];

export default function ProfitabilityPage() {
  const [activeTab, setActiveTab] = useState("pnl");
  const activeGroup = PROFIT_TAB_GROUPS.find((g) => g.tabs.includes(activeTab)) || PROFIT_TAB_GROUPS[0];
  const visibleTabs = new Set(activeGroup.tabs);

  const teamContribution = useDataStore((s) => s.teamContribution);
  const profitabilityAnalysis = useDataStore((s) => s.profitabilityAnalysis);
  const receivableAging = useDataStore((s) => s.receivableAging);
  const salesList = useDataStore((s) => s.salesList);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const hqCustomerItemProfit = useDataStore((s) => s.hqCustomerItemProfit);
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);
  const itemCostDetail = useDataStore((s) => s.itemCostDetail);
  const itemProfitability = useDataStore((s) => s.itemProfitability);
  const standardCostBook = useDataStore((s) => s.standardCostBook);
  const manufacturingCost = useDataStore((s) => s.manufacturingCost);
  const isLoading = useDataStore((s) => s.isLoading);

  const orgProfit = useDataStore((s) => s.orgProfit);
  const { effectiveOrgNames, dateRange } = useFilterContext();
  const { filteredOrgProfit } = useFilteredOrgProfit();

  // 데이터 무결성 경고: 영업이익 > 매출총이익인 조직 감지
  const integrityWarnings = useMemo(() => {
    return filteredOrgProfit.filter(
      (r) => r.영업이익.실적 > r.매출총이익.실적 && r.매출액.실적 !== 0
    ).map((r) => r.영업조직팀);
  }, [filteredOrgProfit]);

  // 월별 트렌드: orgProfit에 month 필드가 있을 때만 계산
  const monthlyTrendData = useMemo(() => {
    const orgFiltered = filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀");
    const leafOnly = filterOrgProfitLeafOnly(orgFiltered);
    if (!leafOnly.some((r: any) => r.month)) return null;
    return calcMonthlyTrend(leafOnly, {
      salesField: "매출액",
      costField: "실적매출원가",
      grossField: "매출총이익",
      opField: "영업이익",
      valueAccessor: padActual,
    });
  }, [orgProfit, effectiveOrgNames]);

  const monthlyGrowth = useMemo(() => {
    if (!monthlyTrendData) return undefined;
    return calcMoMGrowth(monthlyTrendData);
  }, [monthlyTrendData]);

  const filteredTeamContribution = useMemo(() => {
    const orgFiltered = filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    const personFiltered = monthFiltered.filter((r: any) => {
      const person = String(r.영업담당사번 || "").trim();
      return person !== "";
    });
    // 월별 시트 concat으로 동일 (사번, 조직)이 월 수만큼 중복되므로 합산
    return aggregateTeamContribution(personFiltered);
  }, [teamContribution, effectiveOrgNames, dateRange]);
  // 폴백 로직 제거: 필터링 결과가 매출 0이어도 전체 데이터로 대체하지 않음
  // 대신 hasNoSales 플래그로 UI 경고 표시
  const { filteredProfAnalysis, profAnalysisHasNoSales, profAnalysisIsFallback } = useMemo(() => {
    const orgFiltered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    const aggregated = aggregateProfitabilityAnalysis(monthFiltered);
    const hasSales = aggregated.some((r) => r.매출액?.실적 !== 0);
    const hasNoSales = aggregated.length > 0 && !hasSales;
    return {
      filteredProfAnalysis: aggregated,
      profAnalysisHasNoSales: hasNoSales,
      profAnalysisIsFallback: false,
    };
  }, [profitabilityAnalysis, effectiveOrgNames, dateRange]);
  const filteredSales = useMemo(() => filterByDateRange(filterByOrg(salesList, effectiveOrgNames), dateRange, "매출일"), [salesList, effectiveOrgNames, dateRange]);
  const allReceivableRecords = useMemo(() => {
    const allRecords = Array.from(receivableAging.values()).flat();
    return filterByOrg(allRecords, effectiveOrgNames, "영업조직");
  }, [receivableAging, effectiveOrgNames]);

  // ─── 신규 데이터 타입 필터링 + 월별 중복 합산 ──────────────────────────────
  const filteredOrgCustProfit = useMemo(() => {
    const monthFiltered = filterByMonth(filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀"), dateRange);
    return aggregateOrgCustomerProfit(monthFiltered);
  }, [orgCustomerProfit, effectiveOrgNames, dateRange]);
  const filteredHqCustItemProfit = useMemo(() => {
    const monthFiltered = filterByMonth(filterByOrg(hqCustomerItemProfit, effectiveOrgNames, "영업조직팀"), dateRange);
    return aggregateHqCustomerItemProfit(monthFiltered);
  }, [hqCustomerItemProfit, effectiveOrgNames, dateRange]);

  // ─── customerItemDetail 기간 필터 + 합산 (스마트 데이터소스) ──────────────────
  const filteredCustItemDetail = useMemo(() => {
    const orgFiltered = filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀");
    const dateFiltered = (!dateRange || !dateRange.from || !dateRange.to) ? orgFiltered : filterByDateRange(orgFiltered, dateRange, "매출연월");
    return aggregateCustomerItemDetail(dateFiltered);
  }, [customerItemDetail, effectiveOrgNames, dateRange]);

  const isDateFilterActive = !!(dateRange?.from && dateRange?.to);
  const hasCustItemData = filteredCustItemDetail.length > 0;
  // 데이터가 있더라도 profit 필드가 모두 0이면 스냅샷 데이터(profitabilityAnalysis) 사용
  const hasProfitData = useMemo(() => {
    if (!hasCustItemData) return false;
    return filteredCustItemDetail.some((r: any) =>
      (r.매출총이익?.실적 ?? r.매출총이익 ?? 0) !== 0 ||
      (r.영업이익?.실적 ?? r.영업이익 ?? 0) !== 0
    );
  }, [filteredCustItemDetail, hasCustItemData]);
  const isUsingDateFiltered = isDateFilterActive && hasCustItemData && hasProfitData;

  const effectiveProfAnalysis = useMemo((): (typeof filteredProfAnalysis[number] | typeof filteredCustItemDetail[number])[] => {
    if (isUsingDateFiltered) return filteredCustItemDetail;
    return filteredProfAnalysis;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredProfAnalysis]);

  const effectiveHqCustItemProfit = useMemo((): (typeof filteredHqCustItemProfit[number] | typeof filteredCustItemDetail[number])[] => {
    if (isUsingDateFiltered) return filteredCustItemDetail;
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
      z: Math.abs(r.매출총이익.실적) || 1,
      grossProfit: r.매출총이익.실적,
    })),
    [filteredOrgProfit]
  );

  // ─── 기여도 분석 데이터 (filteredTeamContribution은 이미 사번별 합산됨) ──────────────────
  const contribRanking = useMemo(() =>
    [...filteredTeamContribution]
      .filter((r) => (r.공헌이익?.실적 || 0) !== 0 || (r.매출액?.실적 || 0) !== 0)
      .sort((a, b) => (b.공헌이익?.실적 || 0) - (a.공헌이익?.실적 || 0))
      .map((r) => {
        const org = (r.영업조직팀 || "").trim();
        const person = (r.영업담당사번 || "").trim();
        return {
          name: person,
          displayName: truncateLabel(person ? `${org}_${person}` : org, 15),
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

  // 민감도 분석용: teamContribution에서 SGA 변동비 비율 역산
  // 변동비합계 / 매출 = 변동비율 → SGA 중 변동비 비율 = 1 - (고정비 / 판관비)
  const estimatedSgaVarRatio = useMemo(() => {
    if (filteredTeamContribution.length === 0) return 0.3; // 데이터 없으면 기본값
    let totalFixed = 0;
    let totalSGA = 0;
    for (const r of filteredTeamContribution) {
      totalFixed +=
        (r.판관고정_감가상각비?.실적 || 0) +
        (r.판관고정_기타경비?.실적 || 0) +
        (r.판관고정_노무비?.실적 || 0);
      // SGA = 공헌이익 - 영업이익 (판관비 전체)
      totalSGA += (r.공헌이익?.실적 || 0) - (r.영업이익?.실적 || 0);
    }
    if (totalSGA <= 0) return 0.3; // 판관비가 0 이하이면 기본값
    const fixedRatio = totalFixed / totalSGA;
    const varRatio = 1 - Math.min(Math.max(fixedRatio, 0), 1); // [0, 1] 클램핑
    return Math.round(varRatio * 100) / 100; // 소수점 2자리
  }, [filteredTeamContribution]);

  // ContribTab 가중평균 공헌이익율 계산
  const contribTotals = useMemo(() => {
    const sales = filteredTeamContribution.reduce((s, r) => s + (r.매출액?.실적 || 0), 0);
    const contrib = filteredTeamContribution.reduce((s, r) => s + (r.공헌이익?.실적 || 0), 0);
    return { sales, contrib, rate: sales > 0 ? (contrib / sales) * 100 : 0 };
  }, [filteredTeamContribution]);

  const orgContribPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredTeamContribution) {
      const org = (r.영업조직팀 || "").trim();
      if (!org) continue;
      map.set(org, (map.get(org) || 0) + (r.공헌이익?.실적 || 0));
    }
    const all = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    return all.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredTeamContribution]);
  const excludedNegativeContribCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredTeamContribution) {
      const org = (r.영업조직팀 || "").trim();
      if (!org) continue;
      map.set(org, (map.get(org) || 0) + (r.공헌이익?.실적 || 0));
    }
    return Array.from(map.values()).filter((v) => v <= 0).length;
  }, [filteredTeamContribution]);

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
        name: truncateLabel(r.id ? `${(r.org || "").trim()}_${r.id}` : (r.org || ""), 15),
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

  const costEfficiency = useMemo(() => {
    if (costStructure.length === 0) return [];
    // 매출 가중 평균: Σ(비율_i × 매출_i) / Σ(매출_i)
    const orgMap = new Map<string, { totalSales: number; w원재료: number; w상품매입: number; w외주: number }>();
    for (const r of costStructure) {
      const abs = Math.abs(r.매출액);
      const entry = orgMap.get(r.org) || { totalSales: 0, w원재료: 0, w상품매입: 0, w외주: 0 };
      entry.totalSales += abs;
      entry.w원재료 += r.원재료비율 * abs;
      entry.w상품매입 += r.상품매입비율 * abs;
      entry.w외주 += r.외주비율 * abs;
      orgMap.set(r.org, entry);
    }
    const orgAvg = new Map<string, { 원재료비율: number; 상품매입비율: number; 외주비율: number }>();
    Array.from(orgMap.entries()).forEach(([org, e]) => {
      const s = e.totalSales || 1;
      orgAvg.set(org, {
        원재료비율: e.w원재료 / s,
        상품매입비율: e.w상품매입 / s,
        외주비율: e.w외주 / s,
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

  // 파이차트 전용: 매출 기준 정렬 + 누적 85% 동적 커트오프 (최소 5, 최대 20)
  const productBySales = useMemo(
    () => calcProductProfitability(effectiveProfAnalysis, { sortBy: "sales" }),
    [effectiveProfAnalysis]
  );

  const productPieData = useMemo(() => {
    const totalSales = productBySales.reduce((s, p) => s + p.sales, 0);
    if (totalSales <= 0) return [];
    let cumSales = 0;
    let cutoff = 0;
    for (const p of productBySales) {
      cumSales += p.sales;
      cutoff++;
      if (cumSales / totalSales >= 0.85 || cutoff >= 20) break;
    }
    cutoff = Math.max(cutoff, Math.min(5, productBySales.length));
    const topN = productBySales.slice(0, cutoff);
    const others = productBySales.slice(cutoff);
    const othersSales = others.reduce((s, p) => s + p.sales, 0);
    const othersGP = others.reduce((s, p) => s + p.grossProfit, 0);
    const chartData = topN.map((p) => ({
      name: truncateLabel(p.product, 15),
      fullName: p.product,
      value: p.sales,
      margin: p.grossMargin,
    }));
    if (othersSales > 0) {
      chartData.push({
        name: "기타",
        fullName: `기타 ${others.length}개 품목`,
        value: othersSales,
        margin: othersSales > 0 ? (othersGP / othersSales) * 100 : 0,
      });
    }
    return chartData;
  }, [productBySales]);

  const customerProfitability = useMemo(
    () => calcCustomerProfitability(effectiveProfAnalysis),
    [effectiveProfAnalysis]
  );

  // ─── 계획 달성 분석 ──────────────────────────────
  // 계획 데이터 소스: effectiveProfAnalysis에 계획 데이터가 없으면 filteredProfAnalysis로 폴백
  const planDataSource = useMemo(() => {
    if (!isUsingDateFiltered) return effectiveProfAnalysis;
    const quality = checkPlanDataQuality(effectiveProfAnalysis);
    if (quality.planQualityLevel === "none") return filteredProfAnalysis;
    return effectiveProfAnalysis;
  }, [isUsingDateFiltered, effectiveProfAnalysis, filteredProfAnalysis]);

  const isPlanDataFallback = planDataSource !== effectiveProfAnalysis;

  const planSummary = useMemo(() => calcPlanAchievementSummary(planDataSource), [planDataSource]);
  const orgAchievement = useMemo(() => calcOrgAchievement(planDataSource), [planDataSource]);
  const topContributors = useMemo(() => calcTopContributors(planDataSource, 10), [planDataSource]);
  const marginDriftResult = useMemo(() => calcMarginDrift(planDataSource, 15), [planDataSource]);
  const planQuality = useMemo(() => checkPlanDataQuality(planDataSource), [planDataSource]);
  const orgGapContribution = useMemo(() => calcOrgGapContribution(planDataSource), [planDataSource]);
  const planInsight = useMemo(() => generatePlanInsight(planSummary, orgAchievement, planQuality), [planSummary, orgAchievement, planQuality]);

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

  const weightedBep = useMemo(() => calcWeightedBep(orgBreakeven), [orgBreakeven]);

  const bepKpiSummary = useMemo(() => {
    // 가중평균 BEP 사용 (조직별 BEP 단순합산 대신)
    const totalBep = weightedBep.weightedBepSales;
    const finiteSafety = orgBreakeven.filter(r => isFinite(r.safetyMarginRate));
    const avgSafetyMargin = finiteSafety.length > 0 ? finiteSafety.reduce((s, r) => s + r.safetyMarginRate, 0) / finiteSafety.length : 0;
    const avgContribMarginRatio = orgBreakeven.length > 0 ? orgBreakeven.reduce((s, r) => s + r.contributionMarginRatio, 0) / orgBreakeven.length * 100 : 0;
    const unachievableCount = orgBreakeven.filter(r => !r.canBreakEven).length;
    return { totalBep, avgSafetyMargin, avgContribMarginRatio, unachievableCount };
  }, [orgBreakeven, weightedBep]);

  // ─── 마진 침식 분석 ──────────────────────────────
  const marginErosion = useMemo(() => calcMarginErosion(effectiveProfAnalysis, "product", 20), [effectiveProfAnalysis]);

  // ─── 품목별 매출원가 분석 (501) — 월별 중복 합산 ──────────────
  const filteredItemCostDetail = useMemo(
    () => aggregateItemCostDetail(filterByMonth(filterByOrg(itemCostDetail, effectiveOrgNames, "영업조직팀"), dateRange)),
    [itemCostDetail, effectiveOrgNames, dateRange]
  );
  const itemCostSummary = useMemo(() => calcItemCostSummary(filteredItemCostDetail), [filteredItemCostDetail]);
  const costCategoryVariance = useMemo(() => calcCostCategoryVariance(filteredItemCostDetail), [filteredItemCostDetail]);
  const productContribRanking = useMemo(() => calcProductContributionRanking(filteredItemCostDetail), [filteredItemCostDetail]);
  const teamCostEfficiency = useMemo(() => calcTeamCostEfficiency(filteredItemCostDetail), [filteredItemCostDetail]);
  const contribWaterfall = useMemo(() => calcContributionWaterfall(filteredItemCostDetail), [filteredItemCostDetail]);
  const costBucketBreakdown = useMemo(() => calcCostBucketBreakdown(filteredItemCostDetail), [filteredItemCostDetail]);
  const itemVarianceRanking = useMemo(() => calcItemVarianceRanking(filteredItemCostDetail, 15), [filteredItemCostDetail]);
  const planAchievementQuadrant = useMemo(() => calcPlanAchievementQuadrant(filteredItemCostDetail), [filteredItemCostDetail]);
  const unitCostAnalysis = useMemo(() => calcUnitCostAnalysis(filteredItemCostDetail, 30), [filteredItemCostDetail]);
  const costDriverAnalysis = useMemo(() => calcCostDriverAnalysis(filteredItemCostDetail), [filteredItemCostDetail]);

  // ─── 품목별 수익성 분석 (200) + 월별 합산 ──────────────────────────────
  // rawItemProfit: aggregate 전 원본 (month 포함) — 성장률 계산용
  const rawItemProfit = useMemo(() => {
    const orgFiltered = filterByOrg(itemProfitability, effectiveOrgNames, "영업조직팀");
    return filterByMonth(orgFiltered, dateRange);
  }, [itemProfitability, effectiveOrgNames, dateRange]);
  const filteredItemProfitability = useMemo(
    () => aggregateItemProfitability(rawItemProfit),
    [rawItemProfit]
  );

  // 품목→대분류 매핑 (단가 시뮬레이션용): 200 보고서 + salesList에서 구축
  const pricingCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    // Source 1: ItemProfitabilityRecord (200) — 품목 필드가 "[CODE] NAME" 형식
    for (const r of filteredItemProfitability) {
      const cat = ((r as any).대분류 || "").trim();
      if (!cat) continue;
      const raw = ((r as any).품목 || "").trim();
      if (raw) map.set(raw, cat);
      // 코드만 추출하여 매핑
      const m = raw.match(/^\[([^\]]+)\]/);
      if (m) map.set(m[1].trim(), cat);
    }
    // Source 2: salesList — 품목코드 + 품목명
    for (const s of filteredSales) {
      const cat = ((s as any).대분류 || "").trim();
      if (!cat) continue;
      if (s.품목) map.set(s.품목.trim(), cat);
      if (s.품목명) map.set(s.품목명.trim(), cat);
    }
    return map;
  }, [filteredItemProfitability, filteredSales]);

  // ─── KPI 합계 ──────────────────────────────
  const { totalGP, totalContrib, opRate, gpRate, totalSales, totalOp } = useMemo(() => {
    const sales = filteredOrgProfit.reduce((s, r) => s + r.매출액.실적, 0);
    const op = filteredOrgProfit.reduce((s, r) => s + r.영업이익.실적, 0);
    const gp = filteredOrgProfit.reduce((s, r) => s + r.매출총이익.실적, 0);
    const contrib = filteredOrgProfit.reduce((s, r) => s + r.공헌이익.실적, 0);
    return {
      totalGP: gp, totalContrib: contrib,
      opRate: sales > 0 ? (op / sales) * 100 : 0,
      gpRate: sales > 0 ? (gp / sales) * 100 : 0,
      totalSales: sales, totalOp: op,
    };
  }, [filteredOrgProfit]);

  const productWeightedGPRate = useMemo(() => {
    const s = productProfitability.reduce((sum, p) => sum + p.sales, 0);
    const g = productProfitability.reduce((sum, p) => sum + p.grossProfit, 0);
    return s > 0 ? (g / s) * 100 : 0;
  }, [productProfitability]);

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState requiredFiles={["조직별 손익", "수익성분석(901)"]} />;

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

      {isUsingDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">📊 스마트 데이터소스 활성</span>
            <span>기간 필터 적용 → 거래처별품목별 손익(100) 데이터 기준으로 분석</span>
          </div>
          <p className="text-blue-700 dark:text-blue-400">
            전체 기간 보기 시에는 수익성분석(901) 데이터를 사용합니다. 두 보고서는 집계 방식이 달라 수치 차이가 있을 수 있습니다.
          </p>
        </div>
      )}

      {profAnalysisHasNoSales && !isUsingDateFiltered && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <span className="font-medium">⚠️ 데이터 없음</span>
          <span>선택한 조직의 수익성분석 데이터에 매출이 없습니다. 조직 필터를 확인하거나 다른 데이터 파일을 업로드해주세요.</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="space-y-4">
        <TooltipProvider delayDuration={300}>
        {/* 2-level navigation: category pills + sub-tabs */}
        <TabGroup groups={PROFIT_TAB_GROUPS} activeTab={activeTab} onGroupChange={(gid) => {
          const group = PROFIT_TAB_GROUPS.find((g) => g.id === gid);
          if (group) setActiveTab(group.tabs[0]);
        }} />
        {integrityWarnings.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 text-xs text-amber-800 dark:text-amber-300 mb-2">
            데이터 무결성 주의: {integrityWarnings.slice(0, 3).join(", ")}{integrityWarnings.length > 3 ? ` 외 ${integrityWarnings.length - 3}개` : ""} 조직에서 영업이익이 매출총이익보다 큽니다 (판관비 음수 반제 가능성).
          </div>
        )}
        <TabsList className="flex flex-wrap h-auto gap-1">
          {/* 기본 분석 */}
          {visibleTabs.has("pnl") && <TabsTrigger value="pnl">손익 현황</TabsTrigger>}
          {visibleTabs.has("org") && <TabsTrigger value="org">조직 수익성</TabsTrigger>}
          {visibleTabs.has("contrib") && <TabsTrigger value="contrib" disabled={filteredTeamContribution.length === 0}>팀원별 공헌이익</TabsTrigger>}
          {visibleTabs.has("cost") && <TabsTrigger value="cost" disabled={filteredTeamContribution.length === 0}>비용 구조</TabsTrigger>}
          {visibleTabs.has("plan") && <TabsTrigger value="plan" disabled={filteredOrgProfit.length === 0}>계획 달성</TabsTrigger>}
          {/* 심화 분석 */}
          {visibleTabs.has("product") && <TabsTrigger value="product" disabled={effectiveProfAnalysis.length === 0}>
            제품 수익성<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span>
          </TabsTrigger>}
          {visibleTabs.has("risk") && <TabsTrigger value="risk" disabled={filteredOrgProfit.length === 0}>수익성×리스크</TabsTrigger>}
          {visibleTabs.has("variance") && <TabsTrigger value="variance" disabled={effectiveProfAnalysis.length === 0}>
            계획달성<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span>
          </TabsTrigger>}
          {visibleTabs.has("breakeven") && <TabsTrigger value="breakeven" disabled={filteredOrgProfit.length === 0}>손익분기</TabsTrigger>}
          {visibleTabs.has("whatif") && <TabsTrigger value="whatif" disabled={filteredOrgProfit.length === 0}>시나리오</TabsTrigger>}
          {visibleTabs.has("sensitivity") && <TabsTrigger value="sensitivity" disabled={filteredOrgProfit.length === 0}>민감도</TabsTrigger>}
          {visibleTabs.has("offset") && <TabsTrigger value="offset" disabled={filteredCustItemDetail.length === 0}>저가수주 상계효과</TabsTrigger>}
          {/* 거래처 분석 */}
          {visibleTabs.has("custProfit") && <TabsTrigger value="custProfit" disabled={effectiveOrgCustProfit.length === 0}>
            거래처 손익<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span>
          </TabsTrigger>}
          {visibleTabs.has("custItem") && <TabsTrigger value="custItem" disabled={effectiveHqCustItemProfit.length === 0}>
            거래처×품목<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span>
          </TabsTrigger>}
          {visibleTabs.has("detailed") && <TabsTrigger value="detailed" disabled={filteredCustItemDetail.length === 0}>
            상세수익<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span>
          </TabsTrigger>}
          {visibleTabs.has("custRiskMatrix") && <TabsTrigger value="custRiskMatrix" disabled={filteredOrgCustProfit.length === 0}>거래처리스크</TabsTrigger>}
          {visibleTabs.has("sgaBreakdown") && <TabsTrigger value="sgaBreakdown" disabled={filteredOrgCustProfit.length === 0}>판관비세부</TabsTrigger>}
          {/* 원가 분석 */}
          {visibleTabs.has("itemCost") && <TabsTrigger value="itemCost" disabled={filteredItemCostDetail.length === 0}>품목원가<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span></TabsTrigger>}
          {visibleTabs.has("costVariance") && <TabsTrigger value="costVariance" disabled={filteredItemCostDetail.length === 0}>원가차이<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">기간조회</span></TabsTrigger>}
          {visibleTabs.has("standardCost") && <TabsTrigger value="standardCost" disabled={filteredItemProfitability.length === 0}>표준원가</TabsTrigger>}
          {visibleTabs.has("costTrueVariance") && <TabsTrigger value="costTrueVariance" disabled={filteredCustItemDetail.length === 0}>3-Way 원가<span className="ml-1 text-[10px] text-blue-500 dark:text-blue-400 font-normal">신규</span></TabsTrigger>}
          {visibleTabs.has("portfolio") && <TabsTrigger value="portfolio" disabled={filteredItemProfitability.length === 0}>포트폴리오</TabsTrigger>}
          {visibleTabs.has("pricingSim") && <TabsTrigger value="pricingSim" disabled={filteredItemCostDetail.length === 0}>단가 시뮬레이션</TabsTrigger>}
        </TabsList>
        </TooltipProvider>

        <TabsContent value="pnl" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PnlTab totalGP={totalGP} gpRate={gpRate} opRate={opRate} totalContrib={totalContrib} waterfallData={waterfallData} isDateFiltered={isDateFilterActive} monthlyTrend={monthlyTrendData} monthlyGrowth={monthlyGrowth} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <OrgTab bubbleData={bubbleData} isDateFiltered={isDateFilterActive} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="contrib" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ContribTab contribRanking={contribRanking} contribByRate={contribByRate} orgContribPie={orgContribPie} excludedNegativeContribCount={excludedNegativeContribCount} contribTotals={contribTotals} isDateFiltered={isDateFilterActive} monthlyTrend={monthlyTrendData} monthlyGrowth={monthlyGrowth} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="cost" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CostTab costBarData={costBarData} costEfficiency={costEfficiency} isDateFiltered={isDateFilterActive} monthlyTrend={monthlyTrendData} monthlyGrowth={monthlyGrowth} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="plan" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PlanTab orgRatioMetrics={orgRatioMetrics} heatmapData={heatmapData} isDateFiltered={isDateFilterActive} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="product" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ProductTab
              productProfitability={productProfitability}
              productBySales={productBySales}
              productPieData={productPieData}
              customerProfitability={customerProfitability}
              productWeightedGPRate={productWeightedGPRate}
              marginErosion={marginErosion}
              isUsingDateFiltered={isUsingDateFiltered}
              profAnalysisIsFallback={profAnalysisIsFallback}
              dateRange={dateRange}
              hasData={effectiveProfAnalysis.length > 0}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <RiskTab filteredOrgProfit={filteredOrgProfit} allReceivableRecords={allReceivableRecords} filteredSales={filteredSales} isDateFiltered={isDateFilterActive} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="variance" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <VarianceTab
              planSummary={planSummary}
              orgAchievement={orgAchievement}
              topContributors={topContributors}
              marginDriftResult={marginDriftResult}
              planQuality={planQuality}
              orgGapContribution={orgGapContribution}
              planInsight={planInsight}
              isUsingDateFiltered={isUsingDateFiltered}
              isPlanDataFallback={isPlanDataFallback}
              dateRange={dateRange}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="breakeven" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <BreakevenTab orgBreakeven={orgBreakeven} bepChartData={bepChartData} bepKpiSummary={bepKpiSummary} bepFromTeam={bepFromTeam} isDateFiltered={isDateFilterActive} weightedBep={weightedBep} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="whatif" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <WhatIfTab filteredOrgProfit={filteredOrgProfit} isDateFiltered={isDateFilterActive} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="custProfit" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CustProfitTab effectiveOrgCustProfit={effectiveOrgCustProfit} effectiveProfAnalysis={effectiveProfAnalysis} isUsingDateFiltered={isUsingDateFiltered} dateRange={dateRange} isDateFiltered={isDateFilterActive} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="custItem" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CustItemTab effectiveHqCustItemProfit={effectiveHqCustItemProfit} isUsingDateFiltered={isUsingDateFiltered} dateRange={dateRange} isDateFiltered={isDateFilterActive} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="detailed" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <DetailedProfitTab data={filteredCustItemDetail} isDateFiltered={isUsingDateFiltered} dateRange={dateRange} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="sensitivity" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <SensitivityTab
              baseSales={isUsingDateFiltered ? effectiveProfAnalysis.reduce((s, r) => s + (r.매출액?.실적 ?? 0), 0) : totalSales}
              baseGrossProfit={isUsingDateFiltered ? effectiveProfAnalysis.reduce((s, r) => s + (r.매출총이익?.실적 ?? 0), 0) : totalGP}
              baseOpProfit={isUsingDateFiltered ? effectiveProfAnalysis.reduce((s, r) => s + (r.영업이익?.실적 ?? 0), 0) : totalOp}
              isDateFiltered={isDateFilterActive}
              estimatedSgaVarRatio={estimatedSgaVarRatio}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="offset" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <OffsetEffectTab
              filteredCustItemDetail={filteredCustItemDetail}
              filteredItemProfitability={filteredItemProfitability}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="itemCost" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ItemCostTab
              summary={itemCostSummary}
              ranking={productContribRanking}
              teamEfficiency={teamCostEfficiency}
              waterfall={contribWaterfall}
              bucketBreakdown={costBucketBreakdown}
              planAchievementQuadrant={planAchievementQuadrant}
              unitCost={unitCostAnalysis}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="costVariance" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CostVarianceTab
              variance={costCategoryVariance}
              teamEfficiency={teamCostEfficiency}
              itemVarianceRanking={itemVarianceRanking}
              costDrivers={costDriverAnalysis}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="standardCost" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <StandardCostTab
              filteredItemProfitability={filteredItemProfitability}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="costTrueVariance" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CostTrueVarianceTab
              filteredCustItemDetail={filteredCustItemDetail}
              filteredItemProfitability={filteredItemProfitability}
              standardCostBook={standardCostBook}
              manufacturingCost={manufacturingCost}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="custRiskMatrix" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CustomerRiskMatrixTab
              orgCustomerProfit={filteredOrgCustProfit}
              receivableAging={allReceivableRecords}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="sgaBreakdown" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <SgaBreakdownTab
              filteredOrgCustProfit={filteredOrgCustProfit}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PortfolioTab
              filteredItemProfitability={filteredItemProfitability}
              rawItemProfitability={rawItemProfit}
              filteredSales={filteredSales}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="pricingSim" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <PricingSimTab
              filteredItemCostDetail={filteredItemCostDetail}
              filteredProfAnalysis={effectiveProfAnalysis}
              filteredItemProfitability={filteredItemProfitability}
              categoryMap={pricingCategoryMap}
              isDateFiltered={isDateFilterActive}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

      </Tabs>
    </div>
  );
}
