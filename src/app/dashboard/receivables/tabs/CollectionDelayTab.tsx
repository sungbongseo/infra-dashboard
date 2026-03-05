"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  ChartContainer,
  GRID_PROPS,
  BAR_RADIUS_TOP,
  ACTIVE_BAR,
  ANIMATION_CONFIG,
  getMarginColor,
} from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import {
  calcCollectionDelay,
  calcOrgCollectionDelay,
  calcMonthlyCollectionDelay,
  calcCollectionDelaySummary,
  calcPaymentMethodAnalysis,
} from "@/lib/analysis/collectionDelay";
import type { SalesRecord, CollectionRecord } from "@/types";

interface CollectionDelayTabProps {
  filteredSales: SalesRecord[];
  filteredCollections: CollectionRecord[];
  isDateFiltered?: boolean;
}

export function CollectionDelayTab({
  filteredSales,
  filteredCollections,
  isDateFiltered,
}: CollectionDelayTabProps) {
  const entries = useMemo(
    () => calcCollectionDelay(filteredSales, filteredCollections),
    [filteredSales, filteredCollections]
  );

  const summary = useMemo(
    () => calcCollectionDelaySummary(entries),
    [entries]
  );

  const orgDelay = useMemo(
    () => calcOrgCollectionDelay(entries),
    [entries]
  );

  const monthlyDelay = useMemo(
    () => calcMonthlyCollectionDelay(filteredSales, filteredCollections),
    [filteredSales, filteredCollections]
  );

  const paymentMethods = useMemo(
    () => calcPaymentMethodAnalysis(filteredCollections),
    [filteredCollections]
  );

  if (entries.length === 0) return <EmptyState />;

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="평균 수금 소요일"
          value={summary.avgDaysToCollect}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="매출일 → 최초 수금일 사이의 평균 일수"
          description={`매출 발생 후 실제 수금까지 평균 ${summary.avgDaysToCollect.toFixed(0)}일 소요됩니다. DSO와 유사하지만 실제 거래 데이터 기반으로 산출합니다.`}
          benchmark="30일 이내 양호, 60일 이상 수금 관리 강화 필요"
          reason="실제 수금 소요일을 파악하여 자금 회전 효율을 진단하고, 수금 지연 거래처를 식별합니다"
        />
        <KpiCard
          title="수금 지연 거래처"
          value={summary.delayedCustomerCount}
          format="number"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          formula="수금예정일 대비 실제 수금이 늦은 거래처 수"
          description={`전체 ${summary.totalCustomerCount}개 거래처 중 ${summary.delayedCustomerCount}개(${summary.delayRate.toFixed(1)}%)가 수금예정일을 초과했습니다.`}
          benchmark="지연율 20% 이내이면 양호, 40% 초과 시 여신 정책 점검"
          reason="수금 지연 거래처를 조기에 식별하여 독촉, 여신한도 조정 등 선제 조치를 취합니다"
        />
        <KpiCard
          title="전체 수금률"
          value={summary.overallCollectionRate}
          format="percent"
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
          formula="수금 총액 / 매출 총액 × 100"
          description={`매출 ${formatCurrency(summary.totalSalesAmount, true)} 대비 수금 ${formatCurrency(summary.totalCollectedAmount, true)}`}
          benchmark="수금률 90% 이상이면 양호"
          reason="매출 대비 실제 수금 비율을 추적하여 미수금 증가 추세를 모니터링합니다"
        />
        <KpiCard
          title="평균 지연일"
          value={summary.avgDelayDays}
          format="number"
          icon={<Clock className="h-5 w-5 text-red-600" />}
          formula="(실제 수금일 - 수금예정일)의 평균 (양수=지연)"
          description="수금예정일 대비 실제 수금이 얼마나 지연되었는지를 나타냅니다. 양수면 지연, 음수면 조기 수금."
          benchmark="0일 이하(조기 수금)가 이상적, 15일 초과 시 수금 관리 강화"
          reason="예정일 대비 실제 지연 정도를 파악하여 현금흐름 예측 정확도를 높이고 지연 원인을 분석합니다"
        />
      </div>

      {/* 월별 수금 추세 */}
      <ChartCard
        title="월별 매출 vs 수금 추세"
        isEmpty={monthlyDelay.length === 0}
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="월별 매출액과 수금액을 비교, 수금률(%) = 수금액/매출액 × 100"
        description="월별 매출과 수금의 추이를 비교합니다. 매출 대비 수금이 지속적으로 낮으면 미수금이 누적되고 있음을 의미합니다."
        benchmark="수금률이 매출의 90% 이상을 유지하면 양호한 수금 패턴"
        reason="월별 수금 패턴을 분석하여 계절적 수금 지연이나 구조적 미수금 증가를 감지합니다"
      >
        <ChartContainer height="h-72 md:h-96">
          <ComposedChart data={monthlyDelay}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${v}%`} domain={[0, 120]} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any, name: any) => {
                const n = String(name);
                if (n === "수금률") return `${Number(v).toFixed(1)}%`;
                if (n === "지연일") return `${Number(v).toFixed(0)}일`;
                return formatCurrency(Number(v));
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="salesAmount" name="매출액" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Bar yAxisId="left" dataKey="collectedAmount" name="수금액" fill={CHART_COLORS[2]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            <Line yAxisId="right" type="monotone" dataKey="collectionRate" name="수금률" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 조직별 수금 성과 */}
        <ChartCard
          title="조직별 수금 성과"
          isEmpty={orgDelay.length === 0}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="조직별 수금률(%), 평균 지연일, 지연 거래처 비율"
          description="각 영업조직의 수금 성과를 비교합니다. 수금률이 낮고 지연일이 긴 조직은 수금 관리 개선이 필요합니다."
          benchmark="조직 간 수금률 편차가 20%p 이상이면 수금 프로세스 표준화 필요"
          reason="조직별 수금 성과 차이를 파악하여 우수 조직의 수금 노하우를 전파하고 부진 조직을 개선합니다"
        >
          <ChartContainer height="h-72 md:h-80">
            <BarChart data={orgDelay} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold">{d.org}</p>
                      <p>수금률: {d.collectionRate.toFixed(1)}%</p>
                      <p>평균 소요일: {d.avgDaysToCollect.toFixed(0)}일</p>
                      <p>평균 지연일: {d.avgDelayDays.toFixed(0)}일</p>
                      <p>거래처: {d.customerCount}개 (지연 {d.delayedCustomerCount}개)</p>
                      <p>매출: {formatCurrency(d.totalSalesAmount, true)}</p>
                    </div>
                  );
                }}
              />
              <Legend />
              <Bar dataKey="collectionRate" name="수금률" fill={CHART_COLORS[2]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="delayRate" name="지연율" fill="hsl(0, 65%, 55%)" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 결제방법별 수금 분석 */}
        <ChartCard
          title="결제방법별 수금 비중"
          isEmpty={paymentMethods.length === 0}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="결재방법별 수금액 합산 및 비중 계산"
          description="현금, 어음, 기타 등 결제수단별 수금 비중입니다. 어음 비중이 높으면 현금화 지연 리스크가 큽니다."
          benchmark="현금/계좌이체 비중 70% 이상이면 양호한 수금 구조"
          reason="결제수단별 수금 구성을 분석하여 현금흐름 예측 정확도를 높이고 어음 의존도를 관리합니다"
        >
          <ChartContainer height="h-72 md:h-80">
            <PieChart>
              <Pie
                data={paymentMethods}
                cx="50%"
                cy="50%"
                innerRadius="35%"
                outerRadius="65%"
                dataKey="amount"
                nameKey="method"
                label={(props: any) => `${props.method} ${props.share.toFixed(1)}%`}
                {...ANIMATION_CONFIG}
              >
                {paymentMethods.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
              />
              <Legend />
            </PieChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* 수금 지연 Top 15 거래처 */}
      {summary.topDelayedCustomers.length > 0 && (
        <ChartCard
          title="수금 지연 Top 거래처"
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="수금예정일 대비 실제 수금 지연일이 큰 순서로 정렬"
          description="수금예정일을 초과한 거래처를 지연일 순으로 나열합니다. 지연일이 클수록 자금 회전에 부정적이며 대손 리스크가 높아집니다."
          benchmark="30일 이상 지연 거래처는 즉시 독촉, 60일 이상은 여신 재검토"
          reason="지연이 심한 거래처를 우선 관리하여 미수금 악화를 방지하고 수금 성과를 개선합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">거래처</th>
                  <th className="py-2 px-3 font-medium">조직</th>
                  <th className="py-2 px-3 font-medium text-right">매출액</th>
                  <th className="py-2 px-3 font-medium text-right">수금액</th>
                  <th className="py-2 px-3 font-medium text-right">수금률</th>
                  <th className="py-2 px-3 font-medium text-right">소요일</th>
                  <th className="py-2 px-3 font-medium text-right">지연일</th>
                </tr>
              </thead>
              <tbody>
                {summary.topDelayedCustomers.map((e) => (
                  <tr key={e.customer} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-1.5 px-3 font-medium">{e.customer}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{e.org}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(e.salesAmount)}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(e.collectedAmount)}</td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(e.collectionRate - 80)}`}>
                      {e.collectionRate.toFixed(1)}%
                    </td>
                    <td className="py-1.5 px-3 text-right">{e.avgDaysToCollect}일</td>
                    <td className="py-1.5 px-3 text-right font-medium text-red-600">
                      +{e.avgDelayDays}일
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </>
  );
}
