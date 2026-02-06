"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { calcOverviewKpis, calcMonthlyTrends, calcOrgRanking, calcForecastAccuracy, calcCollectionEfficiency, calcOperatingLeverage, calcContributionMarginRate, calcGrossProfitMargin } from "@/lib/analysis/kpi";
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
} from "recharts";
import { TrendingUp, ShoppingCart, Wallet, CreditCard, Target, Package, Percent, Gauge, PieChart, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";

export default function OverviewPage() {
  const { salesList, orderList, collectionList, orgProfit, orgNames, isLoading } = useDataStore();
  const { selectedOrgs, dateRange } = useFilterStore();

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

  const filteredOrgProfit = useMemo(
    () => filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀"),
    [orgProfit, effectiveOrgNames]
  );

  const kpis = useMemo(
    () => calcOverviewKpis(filteredSales, filteredOrders, filteredCollections, filteredOrgProfit),
    [filteredSales, filteredOrders, filteredCollections, filteredOrgProfit]
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

  const hasData = filteredSales.length > 0 || filteredOrders.length > 0;

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">영업 실적 Overview</h2>
        <p className="text-muted-foreground">인프라 사업본부 영업 현황 요약</p>
      </div>

      <Tabs defaultValue="core-kpi" className="space-y-4">
        <TabsList>
          <TabsTrigger value="core-kpi">핵심 지표</TabsTrigger>
          <TabsTrigger value="org-analysis">조직 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="core-kpi" className="space-y-6">
          {/* KPI Cards - Row 1 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 매출액"
              value={kpis.totalSales}
              format="currency"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="SUM(매출리스트.장부금액)"
              description="필터된 영업조직의 전체 매출 합계"
            />
            <KpiCard
              title="총 수주액"
              value={kpis.totalOrders}
              format="currency"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="SUM(수주리스트.장부금액)"
              description="필터된 영업조직의 전체 수주 합계"
            />
            <KpiCard
              title="수주잔고"
              value={kpis.totalOrders - kpis.totalSales > 0 ? kpis.totalOrders - kpis.totalSales : 0}
              format="currency"
              icon={<Package className="h-5 w-5" />}
              formula="총수주액 - 총매출액"
              description="수주는 되었으나 아직 매출로 전환되지 않은 잔액입니다. 향후 매출 파이프라인을 나타냅니다."
              benchmark="매출 대비 50% 이상이면 양호한 파이프라인"
            />
            <KpiCard
              title="수금율"
              value={kpis.collectionRate}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="총수금액 / 총매출액 × 100"
              description={kpis.collectionRate > 100
                ? "100% 초과는 전기 이월 미수금 수금 또는 선수금 포함 시 발생합니다."
                : "총 매출 대비 수금된 비율입니다."
              }
              benchmark="80% 이상이면 양호"
            />
          </div>
          {/* KPI Cards - Row 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="미수금 합계"
              value={kpis.totalReceivables}
              format="currency"
              icon={<CreditCard className="h-5 w-5" />}
              formula="총매출액 - 총수금액"
              description="아직 회수되지 않은 매출채권 잔액입니다."
            />
            <KpiCard
              title="영업이익율"
              value={kpis.operatingProfitRate}
              format="percent"
              icon={<Percent className="h-5 w-5" />}
              formula="영업이익 / 매출액 × 100"
              description="매출에서 모든 영업비용을 차감한 실질 수익률입니다."
              benchmark="10% 이상 양호, 5% 미만 주의"
            />
            <KpiCard
              title="매출 계획 달성율"
              value={kpis.salesPlanAchievement}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="매출실적 / 매출계획 × 100"
              benchmark="100% 달성이 목표"
            />
            <KpiCard
              title="수주 건수"
              value={filteredOrders.length}
              format="number"
              icon={<ShoppingCart className="h-5 w-5" />}
              description="분석 기간 내 총 수주 건수입니다."
            />
          </div>

          {/* 고급 KPI Cards - Row 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard
              title="예측 정확도"
              value={forecastAccuracy}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="100 - |실적 - 계획| / |계획| × 100"
              description="매출 계획 대비 실적의 예측 정확도. 100%에 가까울수록 정확"
              benchmark="90% 이상 우수"
            />
            <KpiCard
              title="수금 효율성"
              value={collectionEfficiency}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="수금액 / (기초미수금 + 매출액) × 100"
              description="발생한 채권 대비 실제 수금 비율"
              benchmark="80% 이상 양호"
            />
            <KpiCard
              title="영업레버리지"
              value={operatingLeverage}
              format="percent"
              icon={<Gauge className="h-5 w-5" />}
              formula="실적영업이익율 / 계획영업이익율 × 100"
              description="계획 대비 실제 영업이익율 달성도"
              benchmark="100% 이상이면 계획 초과 달성"
            />
            <KpiCard
              title="공헌이익율"
              value={contributionMarginRate}
              format="percent"
              icon={<PieChart className="h-5 w-5" />}
              formula="공헌이익 / 매출액 × 100"
              description="변동비 차감 후 고정비 회수에 기여하는 비율"
              benchmark="30% 이상 건전"
            />
            <KpiCard
              title="매출총이익율"
              value={grossProfitMargin}
              format="percent"
              icon={<BarChart3 className="h-5 w-5" />}
              formula="매출총이익 / 매출액 × 100"
              description="원가 차감 후 매출이익 비율"
              benchmark="20% 이상 양호"
            />
          </div>

          {/* Monthly Trend */}
          <ChartCard
            title="월별 매출/수주/수금 추이"
            description="월별 금액 추이 비교"
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
        </TabsContent>

        <TabsContent value="org-analysis" className="space-y-6">
          {/* Org Ranking */}
          <ChartCard
            title="영업조직별 매출 순위"
            description="조직별 매출액 기준 정렬"
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
              description="매출액 계획 vs 실적 비교"
              formula="달성율 = 실적 / 계획 × 100"
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
