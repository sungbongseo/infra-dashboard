"use client";

import { lazy, Suspense, useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiSkeleton, PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcTopCustomers } from "@/lib/analysis/kpi";
import { DollarSign, Users, BarChart3, Target, Percent, Hash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TabGroup, type TabGroupDef } from "@/components/dashboard/TabGroup";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { extractMonth, filterByOrg, filterByMonth, filterOrgProfitLeafOnly, aggregateOrgProfit, aggregateItemProfitability, aggregateCustomerItemDetail, aggregateOrgCustomerProfit, aggregateItemCostDetail } from "@/lib/utils";
import type { SalesRecord } from "@/types";
import { calcCustomerRanking } from "@/lib/analysis/customerProfitAnalysis";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { useFilterStore } from "@/stores/filterStore";
import { useUIStore } from "@/stores/uiStore";
import { useFilterContext, useFilteredSales, useFilteredCollections, useFilteredOrders, useFilteredInventory } from "@/lib/hooks/useFilteredData";

const CustomerTab = lazy(() => import("./tabs/CustomerTab").then(m => ({ default: m.CustomerTab })));
const ChannelTab = lazy(() => import("./tabs/ChannelTab").then(m => ({ default: m.ChannelTab })));
const RfmTab = lazy(() => import("./tabs/RfmTab").then(m => ({ default: m.RfmTab })));
const ClvTab = lazy(() => import("./tabs/ClvTab").then(m => ({ default: m.ClvTab })));
const MigrationTab = lazy(() => import("./tabs/MigrationTab").then(m => ({ default: m.MigrationTab })));
const FxTab = lazy(() => import("./tabs/FxTab").then(m => ({ default: m.FxTab })));
const AnomalyTab = lazy(() => import("./tabs/AnomalyTab").then(m => ({ default: m.AnomalyTab })));
const CohortTab = lazy(() => import("./tabs/CohortTab").then(m => ({ default: m.CohortTab })));
const ChurnTab = lazy(() => import("./tabs/ChurnTab").then(m => ({ default: m.ChurnTab })));
const DecompositionTab = lazy(() => import("./tabs/DecompositionTab").then(m => ({ default: m.DecompositionTab })));
const ItemTab = lazy(() => import("./tabs/ItemTab").then(m => ({ default: m.ItemTab })));
const TypeTab = lazy(() => import("./tabs/TypeTab").then(m => ({ default: m.TypeTab })));
const ProductGroupTab = lazy(() => import("./tabs/ProductGroupTab").then(m => ({ default: m.ProductGroupTab })));
const Customer360Tab = lazy(() => import("./tabs/Customer360Tab").then(m => ({ default: m.Customer360Tab })));
const OrgScorecardTab = lazy(() => import("./tabs/OrgScorecardTab").then(m => ({ default: m.OrgScorecardTab })));
const MarginTab = lazy(() => import("./tabs/MarginTab").then(m => ({ default: m.MarginTab })));

function generateSalesInsights(
  filteredSales: SalesRecord[],
  topCustomers: Array<{ code: string; name: string; amount: number }>,
  totalSalesAmount: number
): Array<{ type: "positive" | "warning" | "info"; message: string }> {
  const insights: Array<{ type: "positive" | "warning" | "info"; message: string }> = [];

  // 1. Top1 concentration warning
  if (topCustomers.length > 0 && totalSalesAmount > 0) {
    const top1Share = (topCustomers[0].amount / totalSalesAmount) * 100;
    if (top1Share > 30) {
      insights.push({
        type: "warning",
        message: `Top1 거래처(${topCustomers[0].name || topCustomers[0].code}) 비중이 ${isFinite(top1Share) ? top1Share.toFixed(1) : "0.0"}%로 높습니다. 거래처 다변화를 검토하세요.`,
      });
    }
  }

  // 2. Monthly trend (if enough months)
  const monthlyMap = new Map<string, number>();
  for (const s of filteredSales) {
    const m = extractMonth(s.매출일);
    if (!m) continue;
    monthlyMap.set(m, (monthlyMap.get(m) || 0) + s.장부금액);
  }
  const months = Array.from(monthlyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (months.length >= 3) {
    const last3 = months.slice(-3);
    const isGrowing = last3[2][1] > last3[1][1] && last3[1][1] > last3[0][1];
    const isDecreasing = last3[2][1] < last3[1][1] && last3[1][1] < last3[0][1];
    if (isGrowing) {
      insights.push({ type: "positive", message: "최근 3개월 매출이 연속 증가 추세입니다." });
    } else if (isDecreasing) {
      insights.push({ type: "warning", message: "최근 3개월 매출이 연속 감소 추세입니다. 원인 분석이 필요합니다." });
    }
  }

  // 3. ABC analysis summary
  if (topCustomers.length > 0 && totalSalesAmount > 0) {
    let cum = 0;
    let aCount = 0;
    for (const c of topCustomers) {
      cum += c.amount;
      aCount++;
      if (cum / totalSalesAmount >= 0.8) break;
    }
    insights.push({
      type: "info",
      message: `ABC 분석: A등급 거래처 ${aCount}개가 전체 매출의 80%를 차지합니다.`,
    });
  }

  return insights.slice(0, 3);
}

const SALES_TAB_GROUPS: TabGroupDef[] = [
  { id: "sales", label: "매출 분석", tabs: ["customer", "item", "type", "channel", "productGroup"] },
  { id: "margin", label: "거래처 마진", tabs: ["margin"] },
  { id: "customer-deep", label: "고객 분석", tabs: ["customer360", "rfm", "migration", "activity"] },
  { id: "advanced", label: "고급 분석", tabs: ["fx", "anomaly", "orgScorecard"] },
  { id: "experimental", label: "실험적 분석", tabs: ["clv", "cohort", "decomposition"] },
];

export default function SalesAnalysisPage() {
  const orgProfit = useDataStore((s) => s.orgProfit);
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const itemProfitability = useDataStore((s) => s.itemProfitability);
  const { filteredInventoryMap } = useFilteredInventory();
  const itemCostDetail = useDataStore((s) => s.itemCostDetail);
  const receivableAging = useDataStore((s) => s.receivableAging);
  const isLoading = useDataStore((s) => s.isLoading);
  const setCustomer360Target = useUIStore((s) => s.setCustomer360Target);
  const [activeTab, setActiveTab] = useState("customer");
  const activeGroup = SALES_TAB_GROUPS.find((g) => g.tabs.includes(activeTab)) || SALES_TAB_GROUPS[0];
  const visibleTabs = new Set(activeGroup.tabs);
  const { effectiveOrgNames } = useFilterContext();
  const { filteredSales } = useFilteredSales();
  const { filteredCollections } = useFilteredCollections();
  const { filteredOrders } = useFilteredOrders();
  const dateRange = useFilterStore((s) => s.dateRange);
  const isDateFiltered = !!(dateRange?.from && dateRange?.to);

  const topCustomers = useMemo(() => calcTopCustomers(filteredSales, 15), [filteredSales]);

  // CLV 분석에 필요한 조직별 손익 필터 (leafOnly + aggregate로 소계 이중카운팅 방지)
  const filteredOrgProfit = useMemo(
    () => aggregateOrgProfit(filterOrgProfitLeafOnly(filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀"))),
    [orgProfit, effectiveOrgNames]
  );

  // 품목군 분석에 필요한 customerItemDetail 필터 + 월별 중복 합산
  const filteredCustomerItemDetail = useMemo(() => {
    const orgFiltered = filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateCustomerItemDetail(monthFiltered);
  }, [customerItemDetail, effectiveOrgNames, dateRange]);

  // 품목별 수익성 분석 (200) 필터 + 월별 합산 — ItemTab prop으로 전달
  const filteredItemProfit = useMemo(() => {
    const orgFiltered = filterByOrg(itemProfitability, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateItemProfitability(monthFiltered);
  }, [itemProfitability, effectiveOrgNames, dateRange]);

  // 501 품목별 원가 데이터 — 월별 중복 합산
  const filteredItemCostDetail = useMemo(() => {
    const orgFiltered = filterByOrg(itemCostDetail, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateItemCostDetail(monthFiltered);
  }, [itemCostDetail, effectiveOrgNames, dateRange]);

  // 303 거래처 손익 연계 (월별 시트 데이터 → 날짜 필터 + 월별 중복 합산)
  const filteredOrgCustProfit = useMemo(() => {
    const orgFiltered = filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀");
    const monthFiltered = filterByMonth(orgFiltered, dateRange);
    return aggregateOrgCustomerProfit(monthFiltered);
  }, [orgCustomerProfit, effectiveOrgNames, dateRange]);
  const customerRanking = useMemo(
    () => calcCustomerRanking(filteredOrgCustProfit, "sales").slice(0, 20),
    [filteredOrgCustProfit]
  );

  // 거래처 360° 뷰용 미수금 flat 배열 (조직 필터 적용)
  const flatAging = useMemo(() => {
    const all: import("@/types").ReceivableAgingRecord[] = [];
    Array.from(receivableAging.values()).forEach((arr) => all.push(...arr));
    return filterByOrg(all, effectiveOrgNames, "영업조직");
  }, [receivableAging, effectiveOrgNames]);

  // KPI 데이터
  const totalSalesAmount = useMemo(() => filteredSales.reduce((s, r) => s + r.장부금액, 0), [filteredSales]);
  const uniqueCustomers = useMemo(() => new Set(filteredSales.map(r => r.매출처).filter(Boolean)).size, [filteredSales]);
  const avgPerTransaction = filteredSales.length > 0 ? totalSalesAmount / filteredSales.length : 0;
  const top1Share = useMemo(() => {
    if (topCustomers.length === 0 || totalSalesAmount === 0) return 0;
    return (topCustomers[0].amount / totalSalesAmount) * 100;
  }, [topCustomers, totalSalesAmount]);

  // Top5 비중 및 HHI 지수
  const top5Share = useMemo(() => {
    if (topCustomers.length === 0 || totalSalesAmount === 0) return 0;
    const top5Sum = topCustomers.slice(0, 5).reduce((s, c) => s + c.amount, 0);
    return (top5Sum / totalSalesAmount) * 100;
  }, [topCustomers, totalSalesAmount]);

  const hhiIndex = useMemo(() => {
    if (topCustomers.length === 0 || totalSalesAmount === 0) return 0;
    return topCustomers.reduce((sum, c) => {
      const share = (c.amount / totalSalesAmount) * 100;
      return sum + share * share;
    }, 0);
  }, [topCustomers, totalSalesAmount]);

  const salesInsights = useMemo(
    () => generateSalesInsights(filteredSales, topCustomers, totalSalesAmount),
    [filteredSales, topCustomers, totalSalesAmount]
  );

  if (isLoading) return <PageSkeleton />;
  if (filteredSales.length === 0) return <EmptyState requiredFiles={["매출리스트"]} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">매출 분석</h2>
        <p className="text-muted-foreground">거래처/품목별 매출 상세 분석</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="총 매출액"
          value={totalSalesAmount}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          formula="매출리스트의 모든 장부금액을 합산"
          benchmark="전년 동기 대비 10% 이상 성장이면 양호"
          description="선택한 영업조직의 전체 매출 금액 합계입니다. 이 페이지의 모든 분석은 이 금액을 기준으로 산출됩니다."
          reason="전체 매출 규모를 파악하여 목표 달성률을 모니터링하고, 전년 대비 성장 추이를 확인하여 영업 전략의 실효성을 평가합니다."
        />
        <KpiCard
          title="거래처 수"
          value={uniqueCustomers}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="중복 없이 매출처 수를 세기"
          description="실제로 매출이 발생한 고유 거래처(고객사)의 수입니다. 거래처 수가 많을수록 매출 기반이 다양하고, 특정 거래처에 대한 의존도가 낮아집니다."
          benchmark="거래처 수가 전기 대비 증가하면 신규 고객 확보 성과 양호"
          reason="거래처 다각화 수준을 점검하여 소수 거래처 의존 리스크를 관리하고, 신규 고객 확보 활동의 성과를 추적합니다."
        />
        <KpiCard
          title="건당 평균"
          value={avgPerTransaction}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="건당 평균(원) = 총 매출액 ÷ 매출 건수"
          description="매출 1건당 평균 거래 금액입니다. 건당 평균이 높으면 대형 프로젝트 위주의 영업, 낮으면 소규모 거래 위주의 영업 패턴을 의미합니다."
          benchmark="업종 평균 건당 금액 대비 높으면 고부가가치 영업 구조"
          reason="거래 건당 규모를 파악하여 영업 패턴(대형 프로젝트 vs 소량 다건)을 진단하고, 고부가가치 영업으로의 전환 여부를 판단합니다."
        />
        <KpiCard
          title="Top1 거래처 비중"
          value={top1Share}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="Top1 거래처 비중(%) = 1위 거래처 매출 ÷ 총매출 × 100"
          description="매출 1위 거래처가 전체 매출에서 차지하는 비율입니다. 이 수치가 높으면 해당 거래처에 대한 의존도가 크므로, 거래처 이탈 시 매출 급감 위험이 있습니다."
          benchmark="20% 이내이면 안정적 분산, 30% 초과 시 집중 리스크 경고"
          reason="핵심 거래처 집중도를 모니터링하여 1위 거래처 이탈 시 매출 급감 리스크를 사전에 인지하고, 거래처 다각화 전략의 시급성을 판단합니다."
        />
        <KpiCard
          title="Top5 비중"
          value={top5Share}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          formula="Top5 비중(%) = 상위 5개 거래처 매출 합계 ÷ 총매출 × 100"
          description="매출 상위 5개 거래처가 전체 매출에서 차지하는 비율입니다. 소수 거래처 의존도가 높으면 이탈 리스크가 커집니다."
          benchmark="50% 이내이면 분산 양호, 70% 초과 시 소수 거래처 의존도 과다"
          reason="핵심 거래처 상위 5곳의 매출 집중도를 파악하여 고객 포트폴리오의 안정성을 평가합니다."
        />
        <KpiCard
          title="HHI 지수"
          value={Math.round(hhiIndex)}
          format="number"
          icon={<Hash className="h-5 w-5" />}
          formula="HHI = Σ(거래처 매출 비중²) (비중은 % 단위)"
          description="허핀달-허쉬만 지수(HHI)는 시장 집중도를 측정하는 지표입니다. 값이 클수록 소수 거래처에 매출이 집중되어 있다는 의미입니다."
          benchmark="1,500 미만: 분산, 1,500~2,500: 중간 집중, 2,500 초과: 고집중"
          reason="거래처 매출 집중도를 표준 지표(HHI)로 정량화하여 경쟁도와 의존 리스크를 객관적으로 평가합니다."
        />
      </div>

      {salesInsights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {salesInsights.map((insight, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 ${
                insight.type === "positive"
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : insight.type === "warning"
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                    : "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
              }`}
            >
              <span>{insight.type === "positive" ? "📈" : insight.type === "warning" ? "⚠️" : "ℹ️"}</span>
              {insight.message}
            </div>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="space-y-4">
        <TabGroup groups={SALES_TAB_GROUPS} activeTab={activeTab} onGroupChange={(gid) => {
          const group = SALES_TAB_GROUPS.find((g) => g.id === gid);
          if (group) setActiveTab(group.tabs[0]);
        }} />
        <TabsList className="flex flex-wrap h-auto gap-1">
          {visibleTabs.has("customer") && <TabsTrigger value="customer">거래처</TabsTrigger>}
          {visibleTabs.has("item") && <TabsTrigger value="item">품목</TabsTrigger>}
          {visibleTabs.has("type") && <TabsTrigger value="type">유형별</TabsTrigger>}
          {visibleTabs.has("channel") && <TabsTrigger value="channel">채널</TabsTrigger>}
          {visibleTabs.has("productGroup") && (
            filteredCustomerItemDetail.length === 0 ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild><span><TabsTrigger value="productGroup" disabled>품목군</TabsTrigger></span></TooltipTrigger>
                <TooltipContent>거래처별 품목별 손익(100) 파일을 업로드하세요</TooltipContent>
              </Tooltip>
            ) : <TabsTrigger value="productGroup">품목군</TabsTrigger>
          )}
          {visibleTabs.has("margin") && <TabsTrigger value="margin">거래처 마진</TabsTrigger>}
          {visibleTabs.has("customer360") && <TabsTrigger value="customer360">거래처 360°</TabsTrigger>}
          {visibleTabs.has("rfm") && <TabsTrigger value="rfm">RFM</TabsTrigger>}
          {visibleTabs.has("clv") && <TabsTrigger value="clv">CLV</TabsTrigger>}
          {visibleTabs.has("migration") && <TabsTrigger value="migration">거래처 이동</TabsTrigger>}
          {visibleTabs.has("cohort") && <TabsTrigger value="cohort">신규거래처 재거래율</TabsTrigger>}
          {visibleTabs.has("fx") && <TabsTrigger value="fx">FX</TabsTrigger>}
          {visibleTabs.has("anomaly") && <TabsTrigger value="anomaly">이상치</TabsTrigger>}
          {visibleTabs.has("activity") && <TabsTrigger value="activity">거래 활동</TabsTrigger>}
          {visibleTabs.has("decomposition") && <TabsTrigger value="decomposition">시계열</TabsTrigger>}
          {visibleTabs.has("orgScorecard") && (
            filteredOrgProfit.length === 0 ? (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild><span><TabsTrigger value="orgScorecard" disabled>조직스코어카드</TabsTrigger></span></TooltipTrigger>
                <TooltipContent>조직 손익 파일을 업로드하세요</TooltipContent>
              </Tooltip>
            ) : <TabsTrigger value="orgScorecard">조직스코어카드</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CustomerTab
              topCustomers={topCustomers}
              customerRanking={customerRanking}
              isDateFiltered={isDateFiltered}
              onCustomer360Navigate={setCustomer360Target}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="item" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ItemTab filteredSales={filteredSales} filteredItemProfit={filteredItemProfit} inventoryMovement={filteredInventoryMap} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="type" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <TypeTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="channel" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ChannelTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="rfm" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <RfmTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="clv" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ClvTab filteredSales={filteredSales} filteredOrgProfit={filteredOrgProfit} isDateFiltered={isDateFiltered} onNavigateToRfm={() => setActiveTab("rfm")} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="migration" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <MigrationTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="fx" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <FxTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="anomaly" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <AnomalyTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="cohort" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <CohortTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="activity" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ChurnTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="decomposition" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <DecompositionTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="productGroup" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <ProductGroupTab filteredCustomerItemDetail={filteredCustomerItemDetail} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="margin" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <MarginTab filteredSales={filteredSales} itemCostDetail={filteredItemCostDetail} />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="customer360" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <Customer360Tab
              salesList={filteredSales}
              collectionList={filteredCollections}
              orderList={filteredOrders}
              agingRecords={flatAging}
              orgCustProfit={filteredOrgCustProfit}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>

        <TabsContent value="orgScorecard" className="space-y-6">
          <Suspense fallback={<KpiSkeleton />}>
          <ErrorBoundary>
            <OrgScorecardTab
              orgProfit={filteredOrgProfit}
              salesList={filteredSales}
              collectionList={filteredCollections}
              isDateFiltered={isDateFiltered}
            />
          </ErrorBoundary>
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
