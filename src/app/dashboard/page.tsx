"use client";

import { useMemo, useEffect, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useAlertStore } from "@/stores/alertStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { calcOverviewKpis, calcMonthlyTrends, calcOrgRanking, calcForecastAccuracy, calcCollectionEfficiency, calcOperatingLeverage, calcContributionMarginRate, calcGrossProfitMargin, calcCollectionRateDetail } from "@/lib/analysis/kpi";
import { calcRiskAssessments } from "@/lib/analysis/aging";
import { calcSalesForecast } from "@/lib/analysis/forecast";
import { generateInsights, type InsightSeverity } from "@/lib/analysis/insightGenerator";
import { calcOverallDSO } from "@/lib/analysis/dso";
import { estimateDPO } from "@/lib/analysis/ccc";
import {
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ComposedChart,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { TrendingUp, ShoppingCart, Wallet, CreditCard, Target, Package, Percent, Gauge, PieChart, BarChart3, AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE, formatPercent } from "@/lib/utils";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { useFilterContext, useFilteredSales, useFilteredOrders, useFilteredCollections, useFilteredOrgProfit, useFilteredTeamContribution, useFilteredReceivables } from "@/lib/hooks/useFilteredData";
import { BenchmarkReportTab } from "@/components/dashboard/BenchmarkReportTab";

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

  const { effectiveOrgNames, comparisonRange } = useFilterContext();
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
        ...costRatios,
      }),
    [kpis, collectionRateDetail.netCollectionRate, overallDso, overallCcc, forecastAccuracy, contributionMarginRate, grossProfitMargin, operatingLeverage, collectionEfficiency, forecast, costRatios]
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
    return [
      { metric: "수금율", value: clamp(collectionRateDetail.netCollectionRate), fullMark: 100 },
      { metric: "수익성", value: clamp(kpis.operatingProfitRate * 5, 0, 100), fullMark: 100 },
      { metric: "계획달성", value: clamp(kpis.salesPlanAchievement), fullMark: 100 },
      { metric: "예측정확도", value: clamp(forecastAccuracy), fullMark: 100 },
      { metric: "현금효율", value: clamp(collectionEfficiency), fullMark: 100 },
      { metric: "공헌이익", value: clamp(contributionMarginRate * 2, 0, 100), fullMark: 100 },
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
    return calcOverviewKpis(compSales, compOrders, compCollections, [], []);
  }, [comparisonRange, compSales, compOrders, compCollections]);

  // ─── Sparkline data ────────────────────────────────────────────
  const sparklines = useMemo(() => {
    const sorted = [...trends].sort((a, b) => a.month.localeCompare(b.month));
    const recent = sorted.slice(-6);
    return {
      sales: recent.map((t) => t.매출),
      orders: recent.map((t) => t.수주),
      collections: recent.map((t) => t.수금),
    };
  }, [trends]);

  const hasData = filteredSales.length > 0 || filteredOrders.length > 0;

  // ─── Alert evaluation ──────────────────────────────────────────
  useEffect(() => {
    if (hasData) {
      evaluate({
        collectionRate: kpis.collectionRate,
        operatingProfitRate: kpis.operatingProfitRate,
        salesPlanAchievement: kpis.salesPlanAchievement,
      });
    }
  }, [kpis, hasData, evaluate]);

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

      <Tabs defaultValue="core-kpi" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="core-kpi">핵심 지표</TabsTrigger>
          <TabsTrigger value="org-analysis">조직 분석</TabsTrigger>
          <TabsTrigger value="financial-health">재무 건전성</TabsTrigger>
          <TabsTrigger value="benchmark-report">벤치마크/보고서</TabsTrigger>
        </TabsList>

        <TabsContent value="core-kpi" className="space-y-6">
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              title="총 매출액"
              value={kpis.totalSales}
              previousValue={compKpis?.totalSales}
              sparklineData={sparklines.sales}
              format="currency"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="매출리스트의 모든 장부금액을 합산"
              description="선택한 영업조직에서 발생한 전체 매출 금액의 합계입니다."
              benchmark="전년 동기 대비 10% 이상 성장이면 양호"
            />
            <KpiCard
              title="총 수주액"
              value={kpis.totalOrders}
              previousValue={compKpis?.totalOrders}
              sparklineData={sparklines.orders}
              format="currency"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="수주리스트의 모든 장부금액을 합산"
              description="확보한 전체 수주 금액의 합계입니다. 향후 매출의 선행지표입니다."
              benchmark="매출액 대비 수주액이 100% 이상이면 성장 기반 확보"
            />
            <KpiCard
              title="수주잔고"
              value={kpis.totalOrders - kpis.totalSales > 0 ? kpis.totalOrders - kpis.totalSales : 0}
              previousValue={compKpis ? (compKpis.totalOrders - compKpis.totalSales > 0 ? compKpis.totalOrders - compKpis.totalSales : 0) : undefined}
              format="currency"
              icon={<Package className="h-5 w-5" />}
              formula="수주잔고 = 총 수주액 − 총 매출액"
              description="계약 체결 후 아직 매출로 전환되지 않은 파이프라인 금액입니다."
              benchmark="매출 대비 50% 이상이면 양호한 파이프라인 보유"
            />
            <KpiCard
              title="수금율 (총)"
              value={collectionRateDetail.totalCollectionRate}
              previousValue={compKpis?.collectionRate}
              sparklineData={sparklines.collections}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="수금율(%) = 총 수금액 ÷ 총 매출액 × 100"
              description={collectionRateDetail.totalCollectionRate > 100
                ? "100%를 넘는 경우는 이전 기간 미수금 회수 또는 선수금이 포함된 경우입니다."
                : "매출 중 실제로 현금이 회수된 비율입니다. 선수금도 포함됩니다."
              }
              benchmark="80% 이상이면 양호, 60% 미만이면 수금 관리 점검 필요"
            />
            <KpiCard
              title="수금율 (순수)"
              value={collectionRateDetail.netCollectionRate}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="순수 수금율(%) = (총 수금액 − 선수금) ÷ 총 매출액 × 100"
              description={`선수금 ${formatCurrency(collectionRateDetail.prepaymentAmount)}을 제외한 순수 수금율입니다.`}
              benchmark="총 수금율보다 낮은 것이 정상이며, 차이가 클수록 선수금 비중이 높음"
            />
          </div>

          {/* KPI Cards - Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="미수금 합계"
              value={kpis.totalReceivables}
              format="currency"
              icon={<CreditCard className="h-5 w-5" />}
              formula={flattenedAging.length > 0 ? "미수금 합계 = 미수금 에이징의 모든 장부금액 합산" : "미수금 합계(추정) = 총 매출액 − 총 수금액"}
              description={flattenedAging.length > 0
                ? "업로드된 미수금 에이징 데이터 기반 정확한 값입니다."
                : "미수금 에이징 파일이 없어 매출−수금 추정치입니다."
              }
              benchmark="미수금이 월 매출의 2배를 넘으면 현금흐름 위험 신호"
            />
            <KpiCard
              title="영업이익율"
              value={kpis.operatingProfitRate}
              format="percent"
              icon={<Percent className="h-5 w-5" />}
              formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100"
              description="매출에서 원가, 인건비, 판관비를 모두 제외한 이익 비율입니다."
              benchmark="인프라 업종 평균 7~8%. 10% 이상 양호, 5% 미만 점검 필요"
            />
            <KpiCard
              title="매출 계획 달성율"
              value={kpis.salesPlanAchievement}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="매출 계획 달성율(%) = 매출 실적 ÷ 매출 계획 × 100"
              description="매출 목표 대비 실제 달성 비율입니다."
              benchmark="100%가 목표. 90% 이상 양호, 80% 미만 원인 분석 필요"
            />
            <KpiCard
              title="수주 건수"
              value={filteredOrders.length}
              previousValue={compKpis ? compOrders.length : undefined}
              format="number"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="기간 내 수주 리스트의 총 건수"
              description="분석 기간 내 발생한 수주의 총 건수입니다."
              benchmark="전기 대비 건수 증가면 영업 활발, 건수↓ 금액↑이면 대형화 추세"
            />
          </div>

          {/* 고급 KPI Cards - Row 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              title="예측 정확도"
              value={forecastAccuracy}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="예측 정확도(%) = 100 − |실적 − 계획| ÷ 계획 × 100"
              description="매출 계획과 실적의 일치도를 보여줍니다."
              benchmark="90% 이상 우수, 70% 미만 계획 프로세스 개선 필요"
            />
            <KpiCard
              title="수금 효율성"
              value={collectionEfficiency}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="수금 효율성(%) = 수금액 ÷ (기말미수금 + 매출액) × 100"
              description="총 채권 금액 중 실제 수금한 비율입니다. 이전 미수금도 고려합니다."
              benchmark="80% 이상이면 양호한 수금 관리 수준"
            />
            <KpiCard
              title="영업레버리지"
              value={operatingLeverage}
              format="percent"
              icon={<Gauge className="h-5 w-5" />}
              formula="영업레버리지(%) = 실적 영업이익율 ÷ 계획 영업이익율 × 100"
              description="계획 대비 실제 수익성 달성 비율입니다."
              benchmark="100% 이상 계획 초과, 80% 미만 비용 관리 점검 필요"
            />
            <KpiCard
              title="공헌이익율"
              value={contributionMarginRate}
              format="percent"
              icon={<PieChart className="h-5 w-5" />}
              formula="공헌이익율(%) = 공헌이익 ÷ 매출액 × 100"
              description="변동비를 차감한 이익 비율입니다. 고정비 부담 능력을 보여줍니다."
              benchmark="30% 이상 건전한 구조, 20% 미만 원가 절감 필요"
            />
            <KpiCard
              title="매출총이익율"
              value={grossProfitMargin}
              format="percent"
              icon={<BarChart3 className="h-5 w-5" />}
              formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
              description="직접 제조원가만 차감한 이익 비율입니다."
              benchmark="인프라 업종 20% 이상 양호, 15% 미만 원가 경쟁력 저하"
            />
          </div>

          {/* Monthly Trend - ChartContainer 적용 */}
          <ChartCard
            title="월별 매출/수주/수금 추이"
            formula="월별로 매출, 수주, 수금 금액을 각각 합산하여 비교"
            description="매월 매출(막대), 수주(막대), 수금(선)의 변화를 비교합니다."
            benchmark="수금선이 매출 막대 위에 있으면 현금흐름 양호"
          >
            <ChartContainer>
              <ComposedChart data={trends}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} {...TOOLTIP_STYLE} />
                <Legend />
                <Bar dataKey="매출" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Bar dataKey="수주" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Line type="monotone" dataKey="수금" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
              </ComposedChart>
            </ChartContainer>
          </ChartCard>

          {forecast && forecast.points.length > 3 && (
            <ChartCard
              title="매출 추이 및 예측"
              formula={`매월 ${formatCurrency(forecast.stats.slope, true)}씩 변동하는 추세선 (설명력 ${(forecast.stats.r2 * 100).toFixed(0)}%)`}
              description={`현재 추세: ${forecast.stats.trend === "up" ? "상승" : forecast.stats.trend === "down" ? "하락" : "횡보"}, 월평균 ${forecast.stats.avgGrowthRate.toFixed(1)}% 성장률`}
              benchmark="설명력(R제곱)이 70% 이상이면 예측 신뢰도 높음"
            >
              <ChartContainer>
                <ComposedChart data={forecast.points}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip formatter={(v: any) => v != null ? formatCurrency(Number(v)) : "–"} {...TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="actual" name="실적" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                  <Line type="monotone" dataKey="movingAvg3" name="3개월 이동평균" stroke={CHART_COLORS[3]} strokeWidth={1.5} dot={false} connectNulls activeDot={{ r: 5, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
                  <Line type="monotone" dataKey="forecast" name="예측" stroke={CHART_COLORS[4]} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls {...ANIMATION_CONFIG} />
                  <Area type="monotone" dataKey="upperBound" name="상한" stroke="none" fill={CHART_COLORS[4]} fillOpacity={0.1} connectNulls />
                  <Area type="monotone" dataKey="lowerBound" name="하한" stroke="none" fill={CHART_COLORS[4]} fillOpacity={0.05} connectNulls />
                </ComposedChart>
              </ChartContainer>
            </ChartCard>
          )}
        </TabsContent>

        <TabsContent value="org-analysis" className="space-y-6">
          <ChartCard
            title="영업조직별 매출 순위"
            formula="조직별 매출액 합계를 큰 순서대로 정렬 (상위 10개)"
            description="각 영업조직의 매출 기여도를 순위로 보여줍니다."
            benchmark="상위 3개 조직이 전체 매출의 60% 이상 차지하면 집중도 높음"
          >
            <ChartContainer>
              <BarChart data={orgRanking.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} {...TOOLTIP_STYLE} />
                <Bar dataKey="sales" fill={CHART_COLORS[0]} radius={BAR_RADIUS_RIGHT} name="매출액" activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          {filteredOrgProfit.length > 0 && (
            <ChartCard
              title="조직별 계획 대비 실적"
              description="각 조직의 매출 목표와 실제 달성을 비교합니다."
              formula="달성율(%) = 실적 ÷ 계획 × 100"
              benchmark="모든 조직 90% 이상 달성이면 양호"
            >
              <ChartContainer height="h-56 md:h-72">
                <BarChart data={filteredOrgProfit.slice(0, 10)}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="영업조직팀" tick={{ fontSize: 11 }} />
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

        {/* 재무 건전성 탭 (신규) */}
        <TabsContent value="financial-health" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 재무 건전성 레이더 */}
            <ChartCard
              title="재무 건전성 레이더"
              formula="각 지표를 0~100 점수로 정규화하여 레이더 차트로 표시"
              description="수금율, 수익성, 계획달성, 예측정확도, 현금효율, 공헌이익 6개 축으로 재무 건전성을 종합 평가합니다."
              benchmark="모든 축이 60점 이상이면 건전, 40점 미만 축은 개선 필요"
            >
              <ChartContainer>
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={healthRadar}>
                  <PolarGrid className="stroke-muted" />
                  <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                  <Radar name="현재" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                </RadarChart>
              </ChartContainer>
            </ChartCard>

            {/* 핵심 재무 지표 요약 */}
            <div className="space-y-4">
              <ChartCard
                title="핵심 재무 지표 요약"
                formula="각 지표별 현재값을 산업 평균 기준(양호/경고)으로 색상 분류"
                description="DSO, CCC, 수금율, 이익율 등 핵심 재무 지표를 한눈에 보여줍니다. 녹색은 양호, 황색은 보통, 적색은 주의가 필요한 상태입니다."
                benchmark="7개 지표 중 5개 이상 양호(녹색)이면 재무 건전성 우수"
              >
                <div className="divide-y">
                  {[
                    { label: "DSO (매출채권 회수기간)", value: overallDso, format: (v: number) => `${v.toFixed(0)}일`, good: 30, warning: 60 },
                    { label: "CCC (현금순환주기)", value: overallCcc, format: (v: number) => `${v.toFixed(0)}일`, good: 0, warning: 60 },
                    { label: "순수 수금율", value: collectionRateDetail.netCollectionRate, format: (v: number) => formatPercent(v), good: 85, warning: 70 },
                    { label: "영업이익율", value: kpis.operatingProfitRate, format: (v: number) => formatPercent(v), good: 10, warning: 5 },
                    { label: "매출총이익율", value: grossProfitMargin, format: (v: number) => formatPercent(v), good: 20, warning: 15 },
                    { label: "예측 정확도", value: forecastAccuracy, format: (v: number) => formatPercent(v), good: 90, warning: 70 },
                    { label: "매출원가율", value: costRatios.costOfGoodsRatio, format: (v: number) => formatPercent(v), good: 70, warning: 85, inverted: true },
                  ].map(({ label, value, format: fmt, good, warning, inverted }) => {
                    const v = value ?? 0;
                    const isValid = value !== undefined && isFinite(v);
                    const isGood = inverted ? v <= good : v >= good;
                    const isWarning = inverted ? v > warning : v < warning;
                    const color = !isValid ? "text-muted-foreground" : isGood ? "text-emerald-600 dark:text-emerald-400" : isWarning ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
                    return (
                      <div key={label} className="flex items-center justify-between py-2.5 px-1">
                        <span className="text-sm text-muted-foreground">{label}</span>
                        <span className={`text-sm font-semibold tabular-nums ${color}`}>
                          {isValid ? fmt(v) : "-"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ChartCard>
            </div>
          </div>

          {/* 인사이트 전체 목록 */}
          {insights.length > 0 && (
            <ChartCard
              title="경영 진단 인사이트"
              formula="매출, 수금, 수익성, 수주, 미수금 5개 영역에 대해 규칙 기반 자동 진단"
              description={`총 ${insights.length}개의 진단 결과가 발견되었습니다. 위험/주의 항목이 있으면 우선적으로 대응하고, 양호 항목은 현 수준을 유지합니다.`}
              benchmark="위험(빨강) 0건 + 주의(황색) 2건 이하이면 안정적 경영 상태"
            >
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {insights.map((insight) => (
                  <div key={insight.id} className={`rounded-md border p-3 flex items-start gap-3 ${INSIGHT_STYLES[insight.severity]}`}>
                    <div className="flex-shrink-0 mt-0.5">
                      {insight.severity === "critical" || insight.severity === "warning" ? (
                        <AlertCircle className={`h-4 w-4 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                      ) : (
                        <CheckCircle2 className={`h-4 w-4 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${INSIGHT_ICON_COLORS[insight.severity]}`}>{insight.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted-foreground font-mono">
                          {insight.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{insight.message}</p>
                    </div>
                    {insight.value !== undefined && isFinite(insight.value) && (
                      <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${INSIGHT_ICON_COLORS[insight.severity]}`}>
                        {insight.value.toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ChartCard>
          )}
        </TabsContent>

        <TabsContent value="benchmark-report" className="space-y-6">
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
