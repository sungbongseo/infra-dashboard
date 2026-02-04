"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { calcOverviewKpis, calcMonthlyTrends, calcOrgRanking } from "@/lib/analysis/kpi";
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
import { TrendingUp, ShoppingCart, Wallet, CreditCard, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg } from "@/lib/utils";
import { CHART_COLORS } from "@/lib/utils";

export default function OverviewPage() {
  const { salesList, orderList, collectionList, orgProfit, orgNames } = useDataStore();

  const filteredSales = useMemo(() => filterByOrg(salesList, orgNames), [salesList, orgNames]);
  const filteredOrders = useMemo(() => filterByOrg(orderList, orgNames), [orderList, orgNames]);
  const filteredCollections = useMemo(() => filterByOrg(collectionList, orgNames), [collectionList, orgNames]);
  const filteredOrgProfit = useMemo(() => filterByOrg(orgProfit, orgNames, "영업조직팀"), [orgProfit, orgNames]);

  const hasData = filteredSales.length > 0 || filteredOrders.length > 0;

  const kpis = useMemo(
    () => calcOverviewKpis(filteredSales, filteredOrders, filteredCollections, filteredOrgProfit),
    [filteredSales, filteredOrders, filteredCollections, filteredOrgProfit]
  );

  const trends = useMemo(
    () => calcMonthlyTrends(filteredSales, filteredOrders, filteredCollections),
    [filteredSales, filteredOrders, filteredCollections]
  );

  const orgRanking = useMemo(() => calcOrgRanking(filteredSales), [filteredSales]);

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
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            />
            <KpiCard
              title="수금율"
              value={kpis.collectionRate}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="총수금액 / 총매출액 × 100"
              benchmark="80% 이상이면 양호"
            />
            <KpiCard
              title="미수금 합계"
              value={kpis.totalReceivables}
              format="currency"
              icon={<CreditCard className="h-5 w-5" />}
              formula="총매출액 - 총수금액"
            />
            <KpiCard
              title="매출 계획 달성율"
              value={kpis.salesPlanAchievement}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="매출실적 / 매출계획 × 100"
              benchmark="100% 달성이 목표"
            />
          </div>

          {/* Monthly Trend */}
          <ChartCard
            title="월별 매출/수주/수금 추이"
            description="월별 금액 추이 비교"
          >
            <div className="h-80">
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
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
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
            <div className="h-80">
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
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
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
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={filteredOrgProfit.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="영업조직팀" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip
                      formatter={(value: any) => formatCurrency(Number(value))}
                      contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
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
