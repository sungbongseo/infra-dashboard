"use client";

import { useMemo, useEffect, useState, lazy, Suspense } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useAlertStore } from "@/stores/alertStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { calcOverviewKpis, calcMonthlyTrends, calcOrgRanking, calcForecastAccuracy, calcCollectionEfficiency, calcOperatingLeverage, calcContributionMarginRate, calcGrossProfitMargin, calcCollectionRateDetail } from "@/lib/analysis/kpi";
import { calcRiskAssessments, calcCreditUtilization } from "@/lib/analysis/aging";
import { calcSalesForecast } from "@/lib/analysis/forecast";
import { generateInsights, type InsightSeverity } from "@/lib/analysis/insightGenerator";
import { calcOverallDSO } from "@/lib/analysis/dso";
import { estimateDPO } from "@/lib/analysis/ccc";
import { calcSalesProcessKpis } from "@/lib/analysis/salesProcess";
import type { PresentationSlide } from "@/components/dashboard/PresentationMode";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from "recharts";
import { TrendingUp, Wallet, Target, Percent, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Zap, Clock, Timer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { PageSkeleton, KpiSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { useFilterContext, useFilteredSales, useFilteredOrders, useFilteredCollections, useFilteredOrgProfit, useFilteredTeamContribution, useFilteredReceivables } from "@/lib/hooks/useFilteredData";
import { useFilterStore } from "@/stores/filterStore";
import { useRouter } from "next/navigation";

const CoreKpiTab = lazy(() => import("./tabs/CoreKpiTab").then(m => ({ default: m.CoreKpiTab })));
const FinancialHealthTab = lazy(() => import("./tabs/FinancialHealthTab").then(m => ({ default: m.FinancialHealthTab })));
const BenchmarkReportTab = lazy(() => import("@/components/dashboard/BenchmarkReportTab").then(m => ({ default: m.BenchmarkReportTab })));
const ExecutiveSummaryTab = lazy(() => import("@/components/dashboard/ExecutiveSummaryTab").then(m => ({ default: m.ExecutiveSummaryTab })));
const PresentationMode = lazy(() => import("@/components/dashboard/PresentationMode").then(m => ({ default: m.PresentationMode })));

const INSIGHT_STYLES: Record<InsightSeverity, string> = {
  critical: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
  positive: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  neutral: "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700",
};

const INSIGHT_ICON_COLORS: Record<InsightSeverity, string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  positive: "text-green-600 dark:text-green-400",
  neutral: "text-gray-500 dark:text-gray-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  매출: "Sales",
  수금: "Collection",
  수익성: "Profit",
  수주: "Orders",
  미수금: "AR",
};

export default function OverviewPage() {
  const isLoading = useDataStore((s) => s.isLoading);
  const evaluate = useAlertStore((s) => s.evaluate);
  const [showAllInsights, setShowAllInsights] = useState(false);
  const router = useRouter();
  const setSelectedOrgs = useFilterStore((s) => s.setSelectedOrgs);

  const { effectiveOrgNames, comparisonRange, dateRange } = useFilterContext();
  const isDateFiltered = !!(dateRange?.from && dateRange?.to);
  const { filteredSales, salesList } = useFilteredSales();
  const { filteredOrders, orderList } = useFilteredOrders();
  const { filteredCollections, collectionList } = useFilteredCollections();
  const { filteredOrgProfit } = useFilteredOrgProfit();
  const { filteredTeamContrib } = useFilteredTeamContribution();
  const { filteredRecords: flattenedAging } = useFilteredReceivables();

  const kpis = useMemo(
    () => calcOverviewKpis(filteredSales, filteredOrders, filteredCollections, filteredOrgProfit, flattenedAging),
    [filteredSales, filteredOrders, filteredCollections, filteredOrgProfit, flattenedAging]
  );

  const highRiskCount = useMemo(
    () => flattenedAging.length > 0 ? calcRiskAssessments(flattenedAging).filter((r) => r.riskGrade === "high").length : 0,
    [flattenedAging]
  );

  const trends = useMemo(
    () => calcMonthlyTrends(filteredSales, filteredOrders, filteredCollections),
    [filteredSales, filteredOrders, filteredCollections]
  );

  const orgRanking = useMemo(() => calcOrgRanking(filteredSales), [filteredSales]);
  const forecastAccuracy = useMemo(() => calcForecastAccuracy(filteredOrgProfit), [filteredOrgProfit]);
  const collectionEfficiency = useMemo(() => {
    return calcCollectionEfficiency(kpis.totalSales, kpis.totalCollection, kpis.totalReceivables);
  }, [kpis]);
  const operatingLeverage = useMemo(() => calcOperatingLeverage(filteredOrgProfit), [filteredOrgProfit]);
  const contributionMarginRate = useMemo(() => calcContributionMarginRate(filteredOrgProfit), [filteredOrgProfit]);
  const grossProfitMargin = useMemo(() => calcGrossProfitMargin(filteredOrgProfit), [filteredOrgProfit]);

  const collectionRateDetail = useMemo(
    () => calcCollectionRateDetail(filteredSales, filteredCollections),
    [filteredSales, filteredCollections]
  );

  const forecast = useMemo(
    () => filteredSales.length > 0 ? calcSalesForecast(filteredSales, 3) : null,
    [filteredSales]
  );

  // ─── Sales Process KPIs ─────────────────────────────────────────
  const salesProcessKpis = useMemo(
    () => filteredOrders.length > 0 ? calcSalesProcessKpis(filteredOrders, filteredSales, filteredCollections) : null,
    [filteredOrders, filteredSales, filteredCollections]
  );

  const top5ConcentrationRate = useMemo(() => {
    if (filteredSales.length === 0) return undefined;
    const byCustomer = new Map<string, number>();
    let total = 0;
    for (const s of filteredSales) {
      const c = (s.매출처 ?? "").trim();
      if (!c) continue;
      const amt = Number(s.장부금액) || 0;
      byCustomer.set(c, (byCustomer.get(c) ?? 0) + amt);
      total += amt;
    }
    if (total <= 0) return undefined;
    const sorted = Array.from(byCustomer.values()).sort((a, b) => b - a);
    const top5Sum = sorted.slice(0, 5).reduce((a, b) => a + b, 0);
    const rate = (top5Sum / total) * 100;
    return isFinite(rate) ? rate : undefined;
  }, [filteredSales]);

  // ─── Executive Insight Generation ─────────────────────────────
  const overallDso = useMemo(() => {
    if (flattenedAging.length === 0 || filteredSales.length === 0) return undefined;
    return calcOverallDSO(flattenedAging, filteredSales);
  }, [flattenedAging, filteredSales]);

  const overallCcc = useMemo(() => {
    if (overallDso === undefined) return undefined;
    const dpo = estimateDPO(filteredTeamContrib);
    return overallDso - dpo;
  }, [overallDso, filteredTeamContrib]);

  const costRatios = useMemo(() => {
    if (filteredTeamContrib.length === 0) return {};
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalRawMaterial = 0;
    let totalOutsourcing = 0;
    for (const tc of filteredTeamContrib) {
      totalRevenue += tc.매출액.실적;
      totalCOGS += tc.실적매출원가.실적;
      totalRawMaterial += tc.제조변동_원재료비.실적 + tc.제조변동_부재료비.실적;
      totalOutsourcing += tc.판관변동_외주가공비.실적 + tc.제조변동_외주가공비.실적;
    }
    if (totalRevenue <= 0) return {};
    return {
      costOfGoodsRatio: (totalCOGS / totalRevenue) * 100,
      materialCostRatio: totalCOGS > 0 ? (totalRawMaterial / totalCOGS) * 100 : 0,
      outsourcingRatio: totalCOGS > 0 ? (totalOutsourcing / totalCOGS) * 100 : 0,
    };
  }, [filteredTeamContrib]);

  const insights = useMemo(
    () =>
      generateInsights({
        kpis,
        netCollectionRate: collectionRateDetail.netCollectionRate,
        dso: overallDso,
        ccc: overallCcc,
        forecastAccuracy,
        contributionMarginRate,
        grossProfitMargin,
        operatingLeverage,
        collectionEfficiency,
        salesTrend: forecast?.stats.trend,
        avgGrowthRate: forecast?.stats.avgGrowthRate,
        winRate: salesProcessKpis?.winRate,
        avgSalesCycle: salesProcessKpis?.avgSalesCycle,
        salesVelocity: salesProcessKpis?.salesVelocity,
        collectionLeadTime: salesProcessKpis?.avgCollectionLeadTime,
        top5ConcentrationRate,
        ...costRatios,
      }),
    [kpis, collectionRateDetail.netCollectionRate, overallDso, overallCcc, forecastAccuracy, contributionMarginRate, grossProfitMargin, operatingLeverage, collectionEfficiency, forecast, salesProcessKpis, top5ConcentrationRate, costRatios]
  );

  // ─── Benchmark + Report 데이터 ────────────────────────────────
  const salesGrowth = useMemo(() => forecast?.stats.avgGrowthRate ?? 0, [forecast]);
  const topBottomOrg = useMemo(() => {
    if (orgRanking.length === 0) return { top: "-", bottom: "-" };
    return { top: orgRanking[0].org, bottom: orgRanking[orgRanking.length - 1].org };
  }, [orgRanking]);
  const uniqueCustomerCount = useMemo(() => new Set(filteredSales.map(r => r.매출처).filter(Boolean)).size, [filteredSales]);

  // ─── Insight 요약 집계 ─────────────────────────────────────────
  const insightSummary = useMemo(() => {
    const counts = { critical: 0, warning: 0, positive: 0, neutral: 0 };
    for (const i of insights) counts[i.severity]++;
    return counts;
  }, [insights]);

  // ─── Financial Health Radar ────────────────────────────────────
  const healthRadar = useMemo(() => {
    const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
    // 벤치마크 기준 정규화: 업종 평균 기준으로 0~100 스케일링
    // 수익성: 업종 평균 8%, 우수 15% → 8%=53점, 15%=100점 (0%=0점)
    const profitScore = clamp((kpis.operatingProfitRate / 15) * 100);
    // 공헌이익율: 업종 평균 25%, 우수 40% → 25%=63점, 40%=100점
    const cmScore = clamp((contributionMarginRate / 40) * 100);
    return [
      { metric: "수금율", value: clamp(collectionRateDetail.netCollectionRate), fullMark: 100 },
      { metric: "수익성", value: profitScore, fullMark: 100 },
      { metric: "계획달성", value: clamp(kpis.salesPlanAchievement), fullMark: 100 },
      { metric: "예측정확도", value: clamp(forecastAccuracy), fullMark: 100 },
      { metric: "현금효율", value: clamp(collectionEfficiency), fullMark: 100 },
      { metric: "공헌이익", value: cmScore, fullMark: 100 },
    ];
  }, [collectionRateDetail.netCollectionRate, kpis.operatingProfitRate, kpis.salesPlanAchievement, forecastAccuracy, collectionEfficiency, contributionMarginRate]);

  // ─── Comparison period data (YoY/MoM) ───────────────────────────
  const compSales = useMemo(() => {
    if (!comparisonRange) return [];
    const byOrg = filterByOrg(salesList, effectiveOrgNames);
    return filterByDateRange(byOrg, comparisonRange, "매출일");
  }, [salesList, effectiveOrgNames, comparisonRange]);

  const compOrders = useMemo(() => {
    if (!comparisonRange) return [];
    const byOrg = filterByOrg(orderList, effectiveOrgNames);
    return filterByDateRange(byOrg, comparisonRange, "수주일");
  }, [orderList, effectiveOrgNames, comparisonRange]);

  const compCollections = useMemo(() => {
    if (!comparisonRange) return [];
    const byOrg = filterByOrg(collectionList, effectiveOrgNames);
    return filterByDateRange(byOrg, comparisonRange, "수금일");
  }, [collectionList, effectiveOrgNames, comparisonRange]);

  const compKpis = useMemo(() => {
    if (!comparisonRange) return null;
    // orgProfit/aging은 스냅샷 데이터라 기간 필터 불가 → 현재 값 재사용 (비교 의미 제한적)
    return calcOverviewKpis(compSales, compOrders, compCollections, filteredOrgProfit, flattenedAging);
  }, [comparisonRange, compSales, compOrders, compCollections, filteredOrgProfit, flattenedAging]);

  // ─── Sparkline data ────────────────────────────────────────────
  const sparklines = useMemo(() => {
    const sorted = [...trends].sort((a, b) => a.month.localeCompare(b.month));
    const recent = sorted.slice(-6);

    // orgProfit 월별 영업이익 sparkline
    const monthlyOP: number[] = [];
    if (filteredOrgProfit.some((r: any) => r.month)) {
      const monthMap = new Map<string, number>();
      for (const r of filteredOrgProfit) {
        const m = (r as any).month;
        if (!m) continue;
        const v = r.영업이익.실적;
        if (isFinite(v)) monthMap.set(m, (monthMap.get(m) || 0) + v);
      }
      const sortedMonths = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
      for (const [, v] of sortedMonths) monthlyOP.push(v);
    }

    return {
      sales: recent.map((t) => t.매출),
      orders: recent.map((t) => t.수주),
      collections: recent.map((t) => t.수금),
      operatingProfit: monthlyOP.length >= 2 ? monthlyOP : undefined,
    };
  }, [trends, filteredOrgProfit]);

  const hasData = filteredSales.length > 0 || filteredOrders.length > 0;

  // ─── Presentation Slides ──────────────────────────────────────
  const presentationSlides: PresentationSlide[] = useMemo(() => {
    if (!hasData) return [];
    const slides: PresentationSlide[] = [
      {
        title: "핵심 KPI 요약",
        content: (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard title="총 매출액" value={kpis.orgProfitSalesSum > 0 ? kpis.orgProfitSalesSum : kpis.totalSales} format="currency" icon={<TrendingUp className="h-5 w-5" />} />
            <KpiCard title="영업이익율" value={kpis.operatingProfitRate} format="percent" icon={<Percent className="h-5 w-5" />} />
            <KpiCard title="수금율" value={collectionRateDetail.netCollectionRate} format="percent" icon={<Wallet className="h-5 w-5" />} />
            <KpiCard title="계획 달성율" value={kpis.salesPlanAchievement} format="percent" icon={<Target className="h-5 w-5" />} />
          </div>
        ),
      },
    ];
    if (salesProcessKpis) {
      slides.push({
        title: "영업 프로세스 KPI",
        content: (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <KpiCard title="Win Rate" value={salesProcessKpis.winRate} format="percent" icon={<Target className="h-5 w-5" />} />
            <KpiCard title="평균 영업주기" value={salesProcessKpis.avgSalesCycle} format="number" icon={<Clock className="h-5 w-5" />} trendPositive={false} />
            <KpiCard title="Sales Velocity" value={salesProcessKpis.salesVelocity} format="currency" icon={<Zap className="h-5 w-5" />} />
            <KpiCard title="수금 리드타임" value={salesProcessKpis.avgCollectionLeadTime} format="number" icon={<Timer className="h-5 w-5" />} trendPositive={false} />
          </div>
        ),
      });
    }
    if (insights.length > 0) {
      slides.push({
        title: "경영 진단 인사이트",
        content: (
          <div className="space-y-3 max-w-3xl mx-auto">
            {insights.slice(0, 8).map((insight) => (
              <div key={insight.id} className={`rounded-lg border p-4 ${INSIGHT_STYLES[insight.severity]}`}>
                <div className="flex items-center gap-2 mb-1">
                  {insight.severity === "critical" || insight.severity === "warning" ? (
                    <AlertCircle className={`h-4 w-4 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                  ) : (
                    <CheckCircle2 className={`h-4 w-4 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                  )}
                  <span className={`text-base font-semibold ${INSIGHT_ICON_COLORS[insight.severity]}`}>{insight.title}</span>
                </div>
                <p className="text-sm text-muted-foreground ml-6">{insight.message}</p>
                {insight.action && (
                  <p className="text-sm font-medium text-primary mt-1 ml-6">{"-> "}{insight.action}</p>
                )}
              </div>
            ))}
          </div>
        ),
      });
    }
    return slides;
  }, [hasData, kpis, collectionRateDetail.netCollectionRate, salesProcessKpis, insights]);

  // ─── 여신사용률 (전체 가중평균) ──────────────────────────────────
  const overallCreditUsageRate = useMemo(() => {
    if (flattenedAging.length === 0) return undefined;
    const utils = calcCreditUtilization(flattenedAging);
    if (utils.length === 0) return undefined;
    let totalUsed = 0;
    let totalLimit = 0;
    for (const u of utils) {
      totalUsed += u.총미수금;
      totalLimit += u.여신한도;
    }
    return totalLimit > 0 ? (totalUsed / totalLimit) * 100 : undefined;
  }, [flattenedAging]);

  // ─── Alert evaluation ──────────────────────────────────────────
  useEffect(() => {
    if (hasData) {
      evaluate({
        collectionRate: kpis.collectionRate,
        operatingProfitRate: kpis.operatingProfitRate,
        salesPlanAchievement: kpis.salesPlanAchievement,
      }, overallDso, overallCreditUsageRate);
    }
  }, [kpis, hasData, evaluate, overallDso, overallCreditUsageRate]);

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  const displayedInsights = showAllInsights ? insights : insights.slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">영업 실적 Overview</h2>
          <p className="text-muted-foreground">인프라 사업본부 영업 현황 요약</p>
        </div>
        <ExportButton
          data={trends.map((t) => ({ 월: t.month, 매출: t.매출, 수주: t.수주, 수금: t.수금 }))}
          fileName="영업실적_Overview"
          sheetName="월별 추이"
        />
      </div>

      {/* Executive Insight Panel (Enhanced) */}
      {insights.length > 0 && (
        <div className="space-y-3">
          {/* 요약 바 */}
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium text-muted-foreground">진단 결과</span>
            {insightSummary.critical > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 font-medium">
                <AlertCircle className="h-3 w-3" /> 위험 {insightSummary.critical}
              </span>
            )}
            {insightSummary.warning > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 font-medium">
                <AlertCircle className="h-3 w-3" /> 주의 {insightSummary.warning}
              </span>
            )}
            {insightSummary.positive > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400 font-medium">
                <CheckCircle2 className="h-3 w-3" /> 양호 {insightSummary.positive}
              </span>
            )}
          </div>

          {/* 인사이트 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {displayedInsights.map((insight) => (
              <div key={insight.id} className={`rounded-lg border p-3 ${INSIGHT_STYLES[insight.severity]}`}>
                <div className="flex items-center gap-2 mb-1">
                  {insight.severity === "critical" || insight.severity === "warning" ? (
                    <AlertCircle className={`h-4 w-4 flex-shrink-0 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                  ) : (
                    <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                  )}
                  <span className={`text-sm font-semibold ${INSIGHT_ICON_COLORS[insight.severity]}`}>
                    {insight.title}
                  </span>
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted-foreground font-mono">
                    {CATEGORY_LABELS[insight.category] || insight.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed ml-6">
                  {insight.message}
                </p>
                {insight.action && (
                  <p className="text-xs font-medium text-primary mt-1 ml-6">
                    {"-> "}{insight.action}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* 더 보기 버튼 */}
          {insights.length > 4 && (
            <button
              onClick={() => setShowAllInsights(!showAllInsights)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              {showAllInsights ? (
                <><ChevronUp className="h-3.5 w-3.5" /> 접기</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> {insights.length - 4}개 더 보기</>
              )}
            </button>
          )}
        </div>
      )}

      <Tabs defaultValue="core-kpi" onValueChange={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="core-kpi">핵심 지표</TabsTrigger>
          <TabsTrigger value="org-analysis">조직 분석</TabsTrigger>
          <TabsTrigger value="financial-health">재무 건전성</TabsTrigger>
          <TabsTrigger value="benchmark-report">벤치마크 (추정치)</TabsTrigger>
          <TabsTrigger value="executive-summary">경영진 보고</TabsTrigger>
        </TabsList>

        <TabsContent value="core-kpi" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
            <CoreKpiTab
              kpis={kpis}
              compKpis={compKpis}
              compOrdersLength={compOrders.length}
              sparklines={sparklines}
              collectionRateDetail={collectionRateDetail}
              forecastAccuracy={forecastAccuracy}
              collectionEfficiency={collectionEfficiency}
              operatingLeverage={operatingLeverage}
              contributionMarginRate={contributionMarginRate}
              grossProfitMargin={grossProfitMargin}
              salesProcessKpis={salesProcessKpis}
              filteredOrdersLength={filteredOrders.length}
              hasAgingData={flattenedAging.length > 0}
              trends={trends}
              forecast={forecast}
              isDateFiltered={isDateFiltered}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="org-analysis" className="space-y-6">
          <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
            title="영업조직별 매출 순위"
            formula="조직별 매출액 합계를 큰 순서대로 정렬 (상위 10개)"
            description="각 영업조직의 매출 기여도를 순위로 보여줍니다."
            benchmark="상위 3개 조직이 전체 매출의 60% 이상 차지하면 집중도 높음"
            reason="조직별 핵심 지표를 비교하여 성과 격차를 파악하고, 자원 재배분 의사결정을 지원합니다."
          >
            <ChartContainer>
              <BarChart data={orgRanking.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} {...TOOLTIP_STYLE} />
                <Bar dataKey="sales" fill={CHART_COLORS[0]} radius={BAR_RADIUS_RIGHT} name="매출액" activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}
                  cursor="pointer"
                  onClick={(data: any) => {
                    if (data?.org) {
                      setSelectedOrgs([data.org]);
                      router.push("/dashboard/sales");
                    }
                  }}
                />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          {filteredOrgProfit.length > 0 && (
            <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
              title="조직별 계획 대비 실적"
              description="각 조직의 매출 목표와 실제 달성을 비교합니다."
              formula="달성율(%) = 실적 ÷ 계획 × 100"
              benchmark="모든 조직 90% 이상 달성이면 양호"
              reason="조직별 목표 달성도를 비교하여 실행력이 부족한 조직을 식별하고, 지원·개선 방향을 설정합니다."
            >
              <ChartContainer height="h-56 md:h-72">
                <BarChart data={filteredOrgProfit.slice(0, 10)}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="영업조직팀" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} {...TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="매출액.계획" fill={CHART_COLORS[5]} name="계획" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                  <Bar dataKey="매출액.실적" fill={CHART_COLORS[0]} name="실적" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                </BarChart>
              </ChartContainer>
            </ChartCard>
          )}
        </TabsContent>

        <TabsContent value="financial-health" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
            <FinancialHealthTab
              kpis={kpis}
              collectionRateDetail={collectionRateDetail}
              grossProfitMargin={grossProfitMargin}
              forecastAccuracy={forecastAccuracy}
              overallDso={overallDso}
              overallCcc={overallCcc}
              costRatios={costRatios}
              healthRadar={healthRadar}
              insights={insights}
              isDateFiltered={isDateFiltered}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="benchmark-report" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <BenchmarkReportTab
            kpis={kpis}
            gpRate={grossProfitMargin}
            dso={overallDso}
            salesGrowth={salesGrowth}
            topOrg={topBottomOrg.top}
            bottomOrg={topBottomOrg.bottom}
            atRiskCustomers={highRiskCount}
            totalCustomers={uniqueCustomerCount}
            contributionMarginRate={contributionMarginRate}
            isDateFiltered={isDateFiltered}
          />
          </Suspense>
        </TabsContent>

        <TabsContent value="executive-summary" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ExecutiveSummaryTab
            totalSales={kpis.totalSales}
            totalOrders={kpis.totalOrders}
            totalCollections={kpis.totalCollection}
            collectionRate={kpis.collectionRate}
            gpRate={grossProfitMargin}
            opRate={kpis.operatingProfitRate}
            planAchievement={kpis.salesPlanAchievement}
            dso={overallDso ?? 0}
            salesGrowth={salesGrowth}
            topOrg={topBottomOrg.top}
            bottomOrg={topBottomOrg.bottom}
            atRiskCustomers={highRiskCount}
            totalCustomers={uniqueCustomerCount}
            prevTotalSales={compKpis?.totalSales}
            prevTotalOrders={compKpis?.totalOrders}
            prevCollectionRate={compKpis?.collectionRate}
            prevOpRate={compKpis?.operatingProfitRate}
            winRate={salesProcessKpis?.winRate}
            avgSalesCycle={salesProcessKpis?.avgSalesCycle}
            salesVelocity={salesProcessKpis?.salesVelocity}
            insights={insights}
          />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* Presentation Mode */}
      <Suspense fallback={null}>
        <PresentationMode slides={presentationSlides} />
      </Suspense>
    </div>
  );
}
