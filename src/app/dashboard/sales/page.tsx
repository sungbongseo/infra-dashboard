"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcTopCustomers } from "@/lib/analysis/kpi";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
  Bar,
} from "recharts";
import { DollarSign, Users, BarChart3, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { formatCurrency, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomerRanking } from "@/lib/analysis/customerProfitAnalysis";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR, getMarginColor } from "@/components/charts";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { useFilterStore } from "@/stores/filterStore";
import { useFilterContext, useFilteredSales } from "@/lib/hooks/useFilteredData";
import { ChannelTab } from "./tabs/ChannelTab";
import { RfmTab } from "./tabs/RfmTab";
import { ClvTab } from "./tabs/ClvTab";
import { MigrationTab } from "./tabs/MigrationTab";
import { FxTab } from "./tabs/FxTab";
import { AnomalyTab } from "./tabs/AnomalyTab";
import { CohortTab } from "./tabs/CohortTab";
import { ChurnTab } from "./tabs/ChurnTab";
import { DecompositionTab } from "./tabs/DecompositionTab";
import { ItemTab } from "./tabs/ItemTab";
import { TypeTab } from "./tabs/TypeTab";
import { ProductGroupTab } from "./tabs/ProductGroupTab";

export default function SalesAnalysisPage() {
  const orgProfit = useDataStore((s) => s.orgProfit);
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const isLoading = useDataStore((s) => s.isLoading);
  const { effectiveOrgNames } = useFilterContext();
  const { filteredSales } = useFilteredSales();
  const dateRange = useFilterStore((s) => s.dateRange);
  const isDateFiltered = !!(dateRange?.from && dateRange?.to);

  const topCustomers = useMemo(() => calcTopCustomers(filteredSales, 15), [filteredSales]);

  // CLV 분석에 필요한 조직별 손익 필터
  const filteredOrgProfit = useMemo(
    () => filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀"),
    [orgProfit, effectiveOrgNames]
  );

  // 품목군 분석에 필요한 customerItemDetail 필터
  const filteredCustomerItemDetail = useMemo(() => {
    const orgFiltered = filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀");
    if (!dateRange || !dateRange.from || !dateRange.to) return orgFiltered;
    return filterByDateRange(orgFiltered, dateRange, "매출연월");
  }, [customerItemDetail, effectiveOrgNames, dateRange]);

  // 303 거래처 손익 연계
  const filteredOrgCustProfit = useMemo(
    () => filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀"),
    [orgCustomerProfit, effectiveOrgNames]
  );
  const customerRanking = useMemo(
    () => calcCustomerRanking(filteredOrgCustProfit, "sales").slice(0, 20),
    [filteredOrgCustProfit]
  );

  const topCustomersExport = useMemo(
    () => topCustomers.map((c) => ({ 거래처코드: c.code, 거래처명: c.name, 매출액: c.amount })),
    [topCustomers]
  );

  const paretoData = useMemo(() => {
    const total = topCustomers.reduce((s, c) => s + c.amount, 0);
    let cum = 0;
    return topCustomers.map((c) => {
      cum += c.amount;
      return {
        name: c.name || c.code,
        amount: c.amount,
        cumPercent: total > 0 ? (cum / total) * 100 : 0,
      };
    });
  }, [topCustomers]);

  // KPI 데이터
  const totalSalesAmount = useMemo(() => filteredSales.reduce((s, r) => s + r.장부금액, 0), [filteredSales]);
  const uniqueCustomers = useMemo(() => new Set(filteredSales.map(r => r.매출처).filter(Boolean)).size, [filteredSales]);
  const avgPerTransaction = filteredSales.length > 0 ? totalSalesAmount / filteredSales.length : 0;
  const top1Share = useMemo(() => {
    if (topCustomers.length === 0 || totalSalesAmount === 0) return 0;
    return (topCustomers[0].amount / totalSalesAmount) * 100;
  }, [topCustomers, totalSalesAmount]);

  if (isLoading) return <PageSkeleton />;
  if (filteredSales.length === 0) return <EmptyState requiredFiles={["매출리스트"]} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">매출 분석</h2>
        <p className="text-muted-foreground">거래처/품목별 매출 상세 분석</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      <Tabs defaultValue="customer" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          {/* 기본 분석 */}
          <TabsTrigger value="customer">거래처</TabsTrigger>
          <TabsTrigger value="item">품목</TabsTrigger>
          <TabsTrigger value="type">유형별</TabsTrigger>
          <TabsTrigger value="channel">채널</TabsTrigger>
          <TabsTrigger value="productGroup" disabled={filteredCustomerItemDetail.length === 0}>품목군</TabsTrigger>
          <span className="hidden sm:inline-flex self-center mx-0.5 h-4 w-px bg-border" />
          {/* 고급 분석 */}
          <TabsTrigger value="rfm">RFM</TabsTrigger>
          <TabsTrigger value="clv">CLV</TabsTrigger>
          <TabsTrigger value="migration">거래처 이동</TabsTrigger>
          <TabsTrigger value="fx">FX</TabsTrigger>
          <TabsTrigger value="anomaly">이상치</TabsTrigger>
          <TabsTrigger value="cohort">코호트</TabsTrigger>
          <TabsTrigger value="churn">이탈 예측</TabsTrigger>
          <TabsTrigger value="decomposition">시계열</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          <ErrorBoundary>
          <ChartCard
            title="거래처별 매출 (ABC 분석)"
            dataSourceType="period"
            isDateFiltered={isDateFiltered}
            formula="누적 비율(%) = 누적 매출 ÷ 총 매출 × 100"
            description="거래처를 매출액이 큰 순서대로 나열하고, 누적 비율에 따라 A등급(상위 80%까지), B등급(80~95%), C등급(95~100%)으로 분류합니다. 소수의 핵심 거래처가 대부분의 매출을 차지하는 '파레토 법칙'을 확인할 수 있습니다."
            benchmark="상위 20% 거래처가 매출의 80%를 차지하면 전형적인 파레토 분포 (80:20 법칙)"
            reason="핵심 거래처 매출 집중도를 파악하여 주요 거래처 이탈 시 영향을 사전에 예측하고, 거래처 다각화 전략을 수립합니다."
            action={<ExportButton data={topCustomersExport} fileName="거래처별매출" />}
          >
            <ChartContainer height="h-72 md:h-96">
                <ComposedChart data={paretoData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
                    name === "cumPercent" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                  } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                  <Line yAxisId="right" type="monotone" dataKey="cumPercent" stroke={CHART_COLORS[4]} strokeWidth={2} name="누적비율" dot={{ r: 3 }} />
                  {/* ABC 등급 경계선 */}
                  <ReferenceLine yAxisId="right" y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "A (80%)", position: "right", fontSize: 10, fill: "hsl(142, 76%, 36%)" }} />
                  <ReferenceLine yAxisId="right" y={95} stroke="hsl(38, 92%, 50%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "B (95%)", position: "right", fontSize: 10, fill: "hsl(38, 92%, 50%)" }} />
                </ComposedChart>
            </ChartContainer>
          </ChartCard>

          {/* 303 거래처 손익 연계 테이블 */}
          {customerRanking.length > 0 && (
            <ChartCard
              title="거래처별 수익성 연계 (303 데이터)"
              dataSourceType="snapshot"
              isDateFiltered={isDateFiltered}
              formula="303 조직별 거래처별 손익 데이터에서 매출액 상위 20개 거래처의 매출총이익률/영업이익률 표시"
              description="매출 상위 거래처의 수익성을 함께 분석합니다. 매출은 크지만 마진이 낮은 거래처는 가격 재협상이나 원가 절감이 필요합니다."
              benchmark="영업이익률 5% 이상이면 양호, 음수이면 거래 조건 재검토 필요"
              reason="매출 규모와 수익성을 동시에 파악하여 매출만 크고 이익이 없는 거래처를 식별하고, 수익성 중심의 거래처 전략을 수립합니다"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 px-3 font-medium">거래처</th>
                      <th className="py-2 px-3 font-medium">조직</th>
                      <th className="py-2 px-3 font-medium text-right">매출액</th>
                      <th className="py-2 px-3 font-medium text-right">매출총이익</th>
                      <th className="py-2 px-3 font-medium text-right">매출총이익률</th>
                      <th className="py-2 px-3 font-medium text-right">영업이익률</th>
                      <th className="py-2 px-3 font-medium text-right">계획달성률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerRanking.map((c) => (
                      <tr key={c.code} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-1.5 px-3 font-medium">{c.name}</td>
                        <td className="py-1.5 px-3 text-muted-foreground text-xs">{c.org}</td>
                        <td className="py-1.5 px-3 text-right">{formatCurrency(c.sales)}</td>
                        <td className="py-1.5 px-3 text-right">{formatCurrency(c.grossProfit)}</td>
                        <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(c.grossMargin)}`}>
                          {isFinite(c.grossMargin) ? c.grossMargin.toFixed(1) : "0"}%
                        </td>
                        <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(c.opMargin)}`}>
                          {isFinite(c.opMargin) ? c.opMargin.toFixed(1) : "0"}%
                        </td>
                        <td className="py-1.5 px-3 text-right">
                          {isFinite(c.planAchievement) ? `${c.planAchievement.toFixed(0)}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="item" className="space-y-6">
          <ErrorBoundary>
            <ItemTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="type" className="space-y-6">
          <ErrorBoundary>
            <TypeTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="channel" className="space-y-6">
          <ErrorBoundary>
            <ChannelTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="rfm" className="space-y-6">
          <ErrorBoundary>
            <RfmTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="clv" className="space-y-6">
          <ErrorBoundary>
            <ClvTab filteredSales={filteredSales} filteredOrgProfit={filteredOrgProfit} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="migration" className="space-y-6">
          <ErrorBoundary>
            <MigrationTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="fx" className="space-y-6">
          <ErrorBoundary>
            <FxTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="anomaly" className="space-y-6">
          <ErrorBoundary>
            <AnomalyTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="cohort" className="space-y-6">
          <ErrorBoundary>
            <CohortTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="churn" className="space-y-6">
          <ErrorBoundary>
            <ChurnTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="decomposition" className="space-y-6">
          <ErrorBoundary>
            <DecompositionTab filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="productGroup" className="space-y-6">
          <ErrorBoundary>
            <ProductGroupTab filteredCustomerItemDetail={filteredCustomerItemDetail} isDateFiltered={isDateFiltered} />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
