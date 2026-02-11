"use client";

import { useMemo, useEffect } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { useAlertStore } from "@/stores/alertStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { calcOverviewKpis, calcMonthlyTrends, calcOrgRanking, calcForecastAccuracy, calcCollectionEfficiency, calcOperatingLeverage, calcContributionMarginRate, calcGrossProfitMargin, calcCollectionRateDetail } from "@/lib/analysis/kpi";
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
  ResponsiveContainer,
  ComposedChart,
  Legend,
} from "recharts";
import { TrendingUp, ShoppingCart, Wallet, CreditCard, Target, Package, Percent, Gauge, PieChart, BarChart3, AlertCircle, CheckCircle2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, filterByDateRange, filterOrgProfitLeafOnly, aggregateOrgProfit, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { ExportButton } from "@/components/dashboard/ExportButton";

export default function OverviewPage() {
  const { salesList, orderList, collectionList, orgProfit, teamContribution, receivableAging, orgNames, isLoading } = useDataStore();
  const { selectedOrgs, dateRange, comparisonRange } = useFilterStore();
  const evaluate = useAlertStore((s) => s.evaluate);

  // Use filterStore.selectedOrgs if set, otherwise fall back to dataStore.orgNames
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

  const filteredOrgProfit = useMemo(() => {
    const filtered = filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀");
    const leafOnly = filterOrgProfitLeafOnly(filtered);
    return aggregateOrgProfit(leafOnly);
  }, [orgProfit, effectiveOrgNames]);

  // Flatten receivableAging Map → array, filtered by org
  const flattenedAging = useMemo(() => {
    const all: import("@/types").ReceivableAgingRecord[] = [];
    receivableAging.forEach((records) => all.push(...records));
    if (effectiveOrgNames.size === 0) return all;
    return all.filter((r) => effectiveOrgNames.has(r.영업조직));
  }, [receivableAging, effectiveOrgNames]);

  const kpis = useMemo(
    () => calcOverviewKpis(filteredSales, filteredOrders, filteredCollections, filteredOrgProfit, flattenedAging),
    [filteredSales, filteredOrders, filteredCollections, filteredOrgProfit, flattenedAging]
  );

  const trends = useMemo(
    () => calcMonthlyTrends(filteredSales, filteredOrders, filteredCollections),
    [filteredSales, filteredOrders, filteredCollections]
  );

  const orgRanking = useMemo(() => calcOrgRanking(filteredSales), [filteredSales]);

  const forecastAccuracy = useMemo(() => calcForecastAccuracy(filteredOrgProfit), [filteredOrgProfit]);
  const collectionEfficiency = useMemo(() => {
    const totalSales = kpis.totalSales;
    const totalCollections = kpis.totalCollection;
    const totalReceivables = kpis.totalReceivables;
    return calcCollectionEfficiency(totalSales, totalCollections, totalReceivables);
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

  const filteredTeamContrib = useMemo(
    () => filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀"),
    [teamContribution, effectiveOrgNames]
  );

  const overallCcc = useMemo(() => {
    if (overallDso === undefined) return undefined;
    const dpo = estimateDPO(filteredTeamContrib);
    return overallDso - dpo;
  }, [overallDso, filteredTeamContrib]);

  const insights = useMemo(
    () =>
      generateInsights({
        kpis,
        netCollectionRate: collectionRateDetail.netCollectionRate,
        dso: overallDso,
        ccc: overallCcc,
        forecastAccuracy,
        contributionMarginRate,
      }),
    [kpis, collectionRateDetail.netCollectionRate, overallDso, overallCcc, forecastAccuracy, contributionMarginRate]
  );

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
    return calcOverviewKpis(compSales, compOrders, compCollections, filteredOrgProfit, flattenedAging);
  }, [comparisonRange, compSales, compOrders, compCollections, filteredOrgProfit, flattenedAging]);

  // ─── Sparkline data (last 6 months from trends) ────────────────
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">영업 실적 Overview</h2>
          <p className="text-muted-foreground">인프라 사업본부 영업 현황 요약</p>
        </div>
        <ExportButton
          data={trends.map((t) => ({
            월: t.month,
            매출: t.매출,
            수주: t.수주,
            수금: t.수금,
          }))}
          fileName="영업실적_Overview"
          sheetName="월별 추이"
        />
      </div>

      {/* Executive Insight Summary */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {insights.slice(0, 4).map((insight) => {
            const styles: Record<InsightSeverity, string> = {
              critical: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
              warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
              positive: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
              neutral: "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700",
            };
            const iconColors: Record<InsightSeverity, string> = {
              critical: "text-red-600 dark:text-red-400",
              warning: "text-amber-600 dark:text-amber-400",
              positive: "text-green-600 dark:text-green-400",
              neutral: "text-gray-500 dark:text-gray-400",
            };
            return (
              <div
                key={insight.id}
                className={`rounded-lg border p-3 ${styles[insight.severity]}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {insight.severity === "critical" || insight.severity === "warning" ? (
                    <AlertCircle className={`h-4 w-4 flex-shrink-0 ${iconColors[insight.severity]}`} />
                  ) : (
                    <CheckCircle2 className={`h-4 w-4 flex-shrink-0 ${iconColors[insight.severity]}`} />
                  )}
                  <span className={`text-sm font-semibold ${iconColors[insight.severity]}`}>
                    {insight.title}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed ml-6">
                  {insight.message}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Tabs defaultValue="core-kpi" className="space-y-4">
        <TabsList>
          <TabsTrigger value="core-kpi">핵심 지표</TabsTrigger>
          <TabsTrigger value="org-analysis">조직 분석</TabsTrigger>
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
              description="선택한 영업조직에서 발생한 전체 매출 금액의 합계입니다. 회사의 전체 영업 규모를 가장 직관적으로 보여주는 핵심 지표입니다."
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
              description="선택한 영업조직에서 확보한 전체 수주 금액의 합계입니다. 수주는 아직 매출로 전환되지 않은 계약 금액으로, 향후 매출의 선행지표 역할을 합니다."
              benchmark="매출액 대비 수주액이 100% 이상이면 성장 기반 확보"
            />
            <KpiCard
              title="수주잔고"
              value={kpis.totalOrders - kpis.totalSales > 0 ? kpis.totalOrders - kpis.totalSales : 0}
              previousValue={compKpis ? (compKpis.totalOrders - compKpis.totalSales > 0 ? compKpis.totalOrders - compKpis.totalSales : 0) : undefined}
              format="currency"
              icon={<Package className="h-5 w-5" />}
              formula="수주잔고 = 총 수주액 − 총 매출액"
              description="계약은 체결되었지만 아직 매출로 잡히지 않은 남은 금액입니다. 이 금액이 클수록 앞으로 매출로 전환될 파이프라인이 풍부하다는 의미입니다."
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
                ? "100%를 넘는 경우는 이전 기간에 발생한 미수금을 이번 기간에 수금했거나, 선수금(미리 받은 돈)이 포함된 경우입니다."
                : "매출 중 실제로 현금이 회수된 비율입니다. 선수금(미리 받은 돈)도 포함됩니다. 이 비율이 높을수록 현금흐름이 건강합니다."
              }
              benchmark="80% 이상이면 양호, 60% 미만이면 수금 관리 점검 필요"
            />
            <KpiCard
              title="수금율 (순수)"
              value={collectionRateDetail.netCollectionRate}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="순수 수금율(%) = (총 수금액 − 선수금) ÷ 총 매출액 × 100"
              description={`선수금(미리 받은 돈) ${formatCurrency(collectionRateDetail.prepaymentAmount)}을 제외한 순수 수금율입니다. 실제 매출에 대한 현금 회수 성과를 더 정확하게 보여줍니다.`}
              benchmark="총 수금율보다 낮은 것이 정상이며, 차이가 클수록 선수금 비중이 높음"
            />
          </div>
          {/* KPI Cards - Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="미수금 합계"
              value={kpis.totalReceivables}
              previousValue={compKpis?.totalReceivables}
              format="currency"
              icon={<CreditCard className="h-5 w-5" />}
              formula={flattenedAging.length > 0 ? "미수금 합계 = 미수금 에이징의 모든 장부금액 합산" : "미수금 합계(추정) = 총 매출액 − 총 수금액"}
              description={flattenedAging.length > 0
                ? "업로드된 미수금 에이징 데이터를 기반으로 정확하게 산출한 값입니다. 아직 받지 못한 대금이 얼마인지 보여줍니다."
                : "미수금 에이징 파일이 없어서 매출에서 수금을 차감한 추정치입니다. 정확한 값을 위해 에이징 파일을 업로드해 주세요."
              }
              benchmark="미수금이 월 매출의 2배를 넘으면 현금흐름 위험 신호"
            />
            <KpiCard
              title="영업이익율"
              value={kpis.operatingProfitRate}
              previousValue={compKpis?.operatingProfitRate}
              format="percent"
              icon={<Percent className="h-5 w-5" />}
              formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100"
              description="영업이익율은 매출에서 제품 원가, 직원 인건비, 판매/관리에 드는 비용을 모두 제외한 뒤 남은 금액의 비율입니다. 이 수치가 높을수록 본업에서 효율적으로 돈을 벌고 있다는 뜻입니다."
              benchmark="인프라 업종 평균 약 7~8%. 10% 이상이면 양호, 5% 미만이면 비용 구조 점검 필요"
            />
            <KpiCard
              title="매출 계획 달성율"
              value={kpis.salesPlanAchievement}
              previousValue={compKpis?.salesPlanAchievement}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="매출 계획 달성율(%) = 매출 실적 ÷ 매출 계획 × 100"
              description="연초에 세운 매출 목표 대비 실제 달성한 비율입니다. 영업 조직의 목표 달성 능력을 평가하는 핵심 관리지표입니다."
              benchmark="100%가 목표. 90% 이상이면 양호, 80% 미만이면 원인 분석 필요"
            />
            <KpiCard
              title="수주 건수"
              value={filteredOrders.length}
              previousValue={compKpis ? compOrders.length : undefined}
              format="number"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="기간 내 수주 리스트의 총 건수"
              description="선택한 분석 기간 동안 발생한 수주의 총 건수입니다. 건수가 많을수록 영업 활동이 활발하다는 의미이며, 건당 평균 수주액과 함께 보면 영업 패턴을 파악할 수 있습니다."
              benchmark="전기 대비 건수가 증가하면 영업 활동 활발, 건수는 줄고 금액이 늘면 대형화 추세"
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
              description="매출 계획과 실적이 얼마나 가까운지를 보여줍니다. 100%에 가까울수록 예측이 정확했다는 뜻이며, 낮을수록 계획과 실적의 괴리가 크다는 의미입니다."
              benchmark="90% 이상이면 우수한 예측력, 70% 미만이면 계획 수립 프로세스 개선 필요"
            />
            <KpiCard
              title="수금 효율성"
              value={collectionEfficiency}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="수금 효율성(%) = 수금액 ÷ (기말미수금 + 매출액) × 100"
              description="기간 초에 남아있던 미수금과 새로 발생한 매출을 합친 총 채권 금액 중에서 실제로 수금한 비율입니다. 수금율(총)과 달리 이전 미수금도 고려하므로 더 정확한 수금 능력을 보여줍니다."
              benchmark="80% 이상이면 양호한 수금 관리 수준"
            />
            <KpiCard
              title="영업레버리지"
              value={operatingLeverage}
              format="percent"
              icon={<Gauge className="h-5 w-5" />}
              formula="영업레버리지(%) = 실적 영업이익율 ÷ 계획 영업이익율 × 100"
              description="계획했던 영업이익율 대비 실제 달성한 영업이익율의 비율입니다. 100%를 넘으면 계획보다 수익성이 좋다는 뜻이고, 미만이면 비용이 예상보다 많이 들었다는 신호입니다."
              benchmark="100% 이상이면 계획 초과 달성, 80% 미만이면 비용 관리 점검 필요"
            />
            <KpiCard
              title="공헌이익율"
              value={contributionMarginRate}
              format="percent"
              icon={<PieChart className="h-5 w-5" />}
              formula="공헌이익율(%) = 공헌이익 ÷ 매출액 × 100"
              description="매출에서 재료비, 외주비 등 변동비(물건을 만들수록 늘어나는 비용)를 차감한 금액의 비율입니다. 이 돈으로 임대료, 인건비 등 고정비를 충당하고 남으면 이익이 됩니다. 높을수록 고정비 부담 능력이 우수합니다."
              benchmark="30% 이상이면 건전한 수익 구조, 20% 미만이면 원가 절감 필요"
            />
            <KpiCard
              title="매출총이익율"
              value={grossProfitMargin}
              format="percent"
              icon={<BarChart3 className="h-5 w-5" />}
              formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
              description="매출에서 직접적인 제조원가(재료비, 노무비, 경비)만 차감한 이익의 비율입니다. 제품 자체의 수익성을 보여주며, 판매관리비를 차감하기 전 단계의 마진입니다. 높을수록 제품의 원가 경쟁력이 우수합니다."
              benchmark="인프라 업종 기준 20% 이상이면 양호, 15% 미만이면 원가 경쟁력 저하"
            />
          </div>

          {/* Monthly Trend */}
          <ChartCard
            title="월별 매출/수주/수금 추이"
            formula="월별로 매출, 수주, 수금 금액을 각각 합산하여 비교"
            description="매월 매출(막대), 수주(막대), 수금(선)의 변화를 한눈에 비교합니다. 수주가 매출보다 높으면 향후 매출 성장이 기대되며, 수금이 매출보다 낮으면 미수금이 쌓이고 있다는 신호입니다."
            benchmark="수금선이 매출 막대 위에 있으면 현금흐름 양호"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                  />
                  <RechartsTooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    {...TOOLTIP_STYLE}
                  />
                  <Legend />
                  <Bar dataKey="매출" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="수주" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="수금"
                    stroke={CHART_COLORS[4]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {forecast && forecast.points.length > 3 && (
            <ChartCard
              title="매출 추이 및 예측"
              formula={`매월 ${formatCurrency(forecast.stats.slope, true)}씩 변동하는 추세선 (설명력 ${(forecast.stats.r2 * 100).toFixed(0)}%)`}
              description={`과거 매출 데이터를 바탕으로 향후 3개월을 예측합니다. 현재 추세는 ${forecast.stats.trend === "up" ? "상승" : forecast.stats.trend === "down" ? "하락" : "횡보"}이며, 월평균 ${forecast.stats.avgGrowthRate.toFixed(1)}% 성장률을 보이고 있습니다. 점선은 예측값, 음영은 예측 범위입니다.`}
              benchmark="설명력(R제곱)이 70% 이상이면 예측 신뢰도 높음"
            >
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={forecast.points}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip formatter={(v: any) => v != null ? formatCurrency(Number(v)) : "–"} {...TOOLTIP_STYLE} />
                    <Legend />
                    <Bar dataKey="actual" name="실적" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="movingAvg3" name="3개월 이동평균" stroke={CHART_COLORS[3]} strokeWidth={1.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="forecast" name="예측" stroke={CHART_COLORS[4]} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                    <Area type="monotone" dataKey="upperBound" name="상한" stroke="none" fill={CHART_COLORS[4]} fillOpacity={0.1} connectNulls />
                    <Area type="monotone" dataKey="lowerBound" name="하한" stroke="none" fill={CHART_COLORS[4]} fillOpacity={0.05} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}
        </TabsContent>

        <TabsContent value="org-analysis" className="space-y-6">
          {/* Org Ranking */}
          <ChartCard
            title="영업조직별 매출 순위"
            formula="조직별 매출액 합계를 큰 순서대로 정렬 (상위 10개)"
            description="각 영업조직의 매출 기여도를 순위로 보여줍니다. 상위 조직과 하위 조직 간 격차가 크면 조직별 맞춤 전략이 필요하다는 신호입니다."
            benchmark="상위 3개 조직이 전체 매출의 60% 이상 차지하면 집중도 높음"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={orgRanking.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                  />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
                  <RechartsTooltip
                    formatter={(value: any) => formatCurrency(Number(value))}
                    {...TOOLTIP_STYLE}
                  />
                  <Bar dataKey="sales" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} name="매출액" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Plan vs Actual from orgProfit */}
          {filteredOrgProfit.length > 0 && (
            <ChartCard
              title="조직별 계획 대비 실적"
              description="각 조직의 매출 목표(계획)와 실제 달성(실적)을 나란히 비교합니다. 실적 막대가 계획 막대보다 높으면 목표 초과 달성, 낮으면 미달입니다. 조직별 성과 차이를 직관적으로 파악할 수 있습니다."
              formula="달성율(%) = 실적 ÷ 계획 × 100"
              benchmark="모든 조직이 90% 이상 달성이면 양호, 조직 간 편차가 20%p 이상이면 불균형"
            >
              <div className="h-56 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredOrgProfit.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="영업조직팀" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip
                      formatter={(value: any) => formatCurrency(Number(value))}
                      {...TOOLTIP_STYLE}
                    />
                    <Legend />
                    <Bar dataKey="매출액.계획" fill={CHART_COLORS[5]} name="계획" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="매출액.실적" fill={CHART_COLORS[0]} name="실적" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
