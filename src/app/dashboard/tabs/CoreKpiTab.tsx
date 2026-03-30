"use client";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import {
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ComposedChart,
  Legend,
} from "recharts";
import { TrendingUp, ShoppingCart, Wallet, CreditCard, Target, Package, Percent, Gauge, PieChart, BarChart3, Clock, Timer, Zap } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed } from "@/lib/utils";
import type { OverviewKpis, MonthlyTrend, CollectionRateDetail } from "./types";
import type { ForecastPoint, ForecastStats } from "@/lib/analysis/forecast";
import type { SalesProcessKpis } from "@/lib/analysis/salesProcess";

interface CoreKpiTabProps {
  kpis: OverviewKpis;
  compKpis: OverviewKpis | null;
  compOrdersLength: number;
  sparklines: {
    sales: number[];
    orders: number[];
    collections: number[];
    operatingProfit?: number[];
  };
  collectionRateDetail: CollectionRateDetail;
  forecastAccuracy: number;
  collectionEfficiency: number;
  operatingLeverage: number;
  contributionMarginRate: number;
  grossProfitMargin: number;
  salesProcessKpis: SalesProcessKpis | null;
  filteredOrdersLength: number;
  hasAgingData: boolean;
  trends: MonthlyTrend[];
  forecast: { points: ForecastPoint[]; stats: ForecastStats } | null;
  isDateFiltered: boolean;
}

export function CoreKpiTab({
  kpis,
  compKpis,
  compOrdersLength,
  sparklines,
  collectionRateDetail,
  forecastAccuracy,
  collectionEfficiency,
  operatingLeverage,
  contributionMarginRate,
  grossProfitMargin,
  salesProcessKpis,
  filteredOrdersLength,
  hasAgingData,
  trends,
  forecast,
  isDateFiltered,
}: CoreKpiTabProps) {
  return (
    <div className="space-y-6">
      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="총 매출액"
          value={kpis.orgProfitSalesSum > 0 ? kpis.orgProfitSalesSum : kpis.totalSales}
          previousValue={compKpis?.totalSales}
          sparklineData={sparklines.sales}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula={
            kpis.orgProfitSalesSum > 0
              ? `조직별손익(303) 매출액.실적 합산 [기준 데이터: 조직별손익]\n※ 매출리스트 기준: ${formatCurrency(kpis.totalSales, true)} (SAP 집계 방식 차이로 소폭 차이 정상)`
              : "매출리스트의 모든 장부금액을 합산 (조직별손익 미업로드)"
          }
          description={kpis.orgProfitSalesSum > 0
            ? "조직별손익(303) 보고서 기준 매출 합계입니다. SAP 손익 보고서와 동일한 값입니다."
            : "매출리스트 기반 합계입니다. 조직별손익(303) 파일 업로드 시 더 정확한 값이 표시됩니다."
          }
          benchmark="전년 동기 대비 10% 이상 성장이면 양호"
          reason="사업부 전체 매출 규모를 파악하여 성장 추세를 모니터링하고, 목표 대비 진척도를 관리합니다."
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
          reason="수주 총액으로 미래 매출 파이프라인의 크기를 가늠하고, 수주 감소 시 선제적 영업 활동을 전개합니다."
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
          reason="수주잔고로 미래 매출 확보 수준을 판단하고, 잔고 부족 시 영업 파이프라인 확충이 필요함을 알립니다."
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
            ? `100%를 넘는 경우는 이전 기간 미수금 회수 또는 선수금이 포함된 경우입니다.${isDateFiltered ? " ⚠️ 기간 필터 적용 중이므로 미수잔액(스냅샷)과 기간이 다를 수 있습니다." : ""}`
            : `매출 중 실제로 현금이 회수된 비율입니다. 선수금도 포함됩니다.${isDateFiltered ? " (기간 필터 적용 중 — 미수잔액은 스냅샷 기준)" : ""}`
          }
          benchmark="80% 이상이면 양호, 60% 미만이면 수금 관리 점검 필요"
          reason="매출 대비 현금 회수율로 유동성 건전성을 모니터링하고, 수금 지연 시 즉각 대응합니다."
        />
        <KpiCard
          title="수금율 (순수)"
          value={collectionRateDetail.netCollectionRate}
          format="percent"
          icon={<Wallet className="h-5 w-5" />}
          formula="순수 수금율(%) = (총 수금액 − 선수금) ÷ 총 매출액 × 100"
          description={`선수금 ${formatCurrency(collectionRateDetail.prepaymentAmount)}을 제외한 순수 수금율입니다.`}
          benchmark="총 수금율보다 낮은 것이 정상이며, 차이가 클수록 선수금 비중이 높음"
          reason="선수금을 제외한 실질 수금율로 채권 회수 효율을 정확히 측정하고, 총 수금율과의 차이로 선수금 의존도를 파악합니다."
        />
      </div>

      {/* KPI Cards - Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="미수금 합계"
          value={kpis.totalReceivables}
          format="currency"
          icon={<CreditCard className="h-5 w-5" />}
          formula={hasAgingData ? "미수금 합계 = 미수금 에이징의 모든 장부금액 합산" : "미수금 합계(추정) = 총 매출액 − 총 수금액"}
          description={hasAgingData
            ? "업로드된 미수금 에이징 데이터 기반 정확한 값입니다."
            : "미수금 에이징 파일이 없어 매출−수금 추정치입니다."
          }
          benchmark="미수금이 월 매출의 2배를 넘으면 현금흐름 위험 신호"
          reason="미수금 총액으로 채권 규모를 파악하여 유동성 리스크를 관리하고, 수금 우선순위를 결정합니다."
        />
        <KpiCard
          title="영업이익율"
          value={kpis.operatingProfitRate}
          sparklineData={sparklines.operatingProfit}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100 [조직별손익 기준]"
          description="조직별손익 데이터 기준. 매출리스트의 '총 매출액'과 집계 방식이 달라 매출 기준값이 다를 수 있습니다."
          benchmark="인프라 업종 평균 7~8%. 10% 이상 양호, 5% 미만 점검 필요"
          reason="핵심 수익성 지표로 사업부의 이익 창출 능력을 평가하고, 업종 평균 대비 경쟁력을 진단합니다."
        />
        <KpiCard
          title="매출 계획 달성율"
          value={kpis.salesPlanAchievement}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="매출 계획 달성율(%) = 매출 실적 ÷ 매출 계획 × 100 [조직별손익 기준]"
          description="조직별손익 데이터 기준. 계획 대비 달성 비율로 집계 방식은 SAP 보고서를 따릅니다."
          benchmark="100%가 목표. 90% 이상 양호, 80% 미만 원인 분석 필요"
          reason="목표 대비 실적 달성도를 추적하여 계획 수립의 정확성과 실행력을 동시에 평가합니다."
        />
        <KpiCard
          title="수주 건수"
          value={filteredOrdersLength}
          previousValue={compKpis ? compOrdersLength : undefined}
          format="number"
          icon={<ShoppingCart className="h-5 w-5" />}
          formula="기간 내 수주 리스트의 총 건수"
          description="분석 기간 내 발생한 수주의 총 건수입니다."
          benchmark="전기 대비 건수 증가면 영업 활발, 건수↓ 금액↑이면 대형화 추세"
          reason="수주 건수로 영업 활동량의 증감을 파악하고, 건당 단가 변화와 결합하여 영업 패턴 변화를 감지합니다."
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
          description="[데이터 소스: 조직별손익] 매출 계획과 실적의 일치도를 보여줍니다."
          benchmark="90% 이상 우수, 70% 미만 계획 프로세스 개선 필요"
          reason="계획 대비 실적 일치도를 측정하여 예측 프로세스의 정확성을 평가하고, 자원 배분 효율을 높입니다."
        />
        <KpiCard
          title="수금 효율성"
          value={collectionEfficiency}
          format="percent"
          icon={<Wallet className="h-5 w-5" />}
          formula="수금 효율성(%) = 수금액 ÷ (기말미수금 + 매출액) × 100"
          description="총 채권 금액 중 실제 수금한 비율입니다. 이전 미수금도 고려합니다."
          benchmark="80% 이상이면 양호한 수금 관리 수준"
          reason="기존 미수금까지 포함한 종합 수금 효율로 채권 관리 역량을 평가하고, 현금흐름 개선 방향을 도출합니다."
        />
        <KpiCard
          title="영업레버리지"
          value={operatingLeverage}
          format="percent"
          icon={<Gauge className="h-5 w-5" />}
          formula="영업레버리지(%) = 실적 영업이익율 ÷ 계획 영업이익율 × 100"
          description="[데이터 소스: 조직별손익] 계획 대비 실제 수익성 달성 비율입니다."
          benchmark="100% 이상 계획 초과, 80% 미만 비용 관리 점검 필요"
          reason="계획 대비 수익성 달성도로 비용 관리 실행력을 평가하고, 미달 시 원가 절감 대책을 수립합니다."
        />
        <KpiCard
          title="공헌이익율"
          value={contributionMarginRate}
          format="percent"
          icon={<PieChart className="h-5 w-5" />}
          formula="공헌이익율(%) = 공헌이익 ÷ 매출액 × 100"
          description="[데이터 소스: 팀공헌이익] 변동비를 차감한 이익 비율입니다. 고정비 부담 능력을 보여줍니다."
          benchmark="30% 이상 건전한 구조, 20% 미만 원가 절감 필요"
          reason="변동비 차감 후 고정비 회수 능력을 파악하여 원가 구조의 건전성을 진단하고, 손익분기점 관리에 활용합니다."
        />
        <KpiCard
          title="매출총이익율"
          value={grossProfitMargin}
          format="percent"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
          description="[데이터 소스: 조직별손익] 직접 제조원가만 차감한 이익 비율입니다."
          benchmark="인프라 업종 20% 이상 양호, 15% 미만 원가 경쟁력 저하"
          reason="제조원가 효율성을 측정하여 원가 경쟁력 수준을 파악하고, 업종 평균 대비 위치를 확인합니다."
        />
      </div>

      {/* 영업 프로세스 KPI - Row 4 */}
      {salesProcessKpis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Win Rate"
            value={salesProcessKpis.winRate}
            format="percent"
            icon={<Target className="h-5 w-5" />}
            formula="Win Rate(%) = 완료 수주금액 / (완료 + 삭제 수주금액) x 100"
            description="수주 건 중 실제 매출로 전환된 비율입니다. 금액 가중 기준입니다."
            benchmark="80% 이상 우수, 50% 미만이면 견적 경쟁력 점검 필요"
            reason="수주 전환 효율을 측정하여 영업 프로세스의 성공률을 관리하고, 취소 원인을 분석합니다."
          />
          <KpiCard
            title="평균 영업주기"
            value={salesProcessKpis.avgSalesCycle}
            format="number"
            icon={<Clock className="h-5 w-5" />}
            formula="수주일 -> 매출일 평균 소요일수 (수주번호/거래처 매칭)"
            description={`수주에서 매출까지 평균 ${safeFixed(salesProcessKpis.avgSalesCycle, 0)}일이 소요됩니다.`}
            benchmark="30일 이내 신속, 90일 초과 시 병목 분석 필요"
            reason="영업 사이클 길이를 모니터링하여 현금 회수 속도와 영업 효율을 관리합니다."
            trendPositive={false}
          />
          <KpiCard
            title="Sales Velocity"
            value={salesProcessKpis.salesVelocity}
            format="currency"
            icon={<Zap className="h-5 w-5" />}
            formula="Sales Velocity = (수주건수 x 건당평균금액 x Win Rate) / 영업주기"
            description="일 평균 파이프라인 전환 금액입니다. 높을수록 영업 생산성이 좋습니다."
            benchmark="조직 전체 목표 대비 속도 추이로 판단"
            reason="수주 활동의 종합 생산성을 단일 지표로 측정하여 영업 파이프라인의 건전성을 평가합니다."
          />
          <KpiCard
            title="수금 리드타임"
            value={salesProcessKpis.avgCollectionLeadTime}
            format="number"
            icon={<Timer className="h-5 w-5" />}
            formula="매출일 -> 수금일 평균 소요일수 (거래처명 매칭)"
            description={`매출 후 수금까지 평균 ${safeFixed(salesProcessKpis.avgCollectionLeadTime, 0)}일이 소요됩니다.`}
            benchmark="30일 이내 양호, 60일 초과 시 결제조건 검토 필요"
            reason="매출 발생 후 실제 현금 회수까지의 시간을 측정하여 현금흐름 관리에 활용합니다."
            trendPositive={false}
          />
        </div>
      )}

      {/* Monthly Trend - ChartContainer */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="월별 매출/수주/수금 추이"
        formula="월별로 매출, 수주, 수금 금액을 각각 합산하여 비교"
        description="매월 매출(막대), 수주(막대), 수금(선)의 변화를 비교합니다."
        benchmark="수금선이 매출 막대 위에 있으면 현금흐름 양호"
        reason="핵심 경영지표의 월별 변화를 한눈에 조망하여 이상 징후를 빠르게 감지하고, 추세 전환 시 즉각 대응합니다."
      >
        <ChartContainer>
          <ComposedChart data={trends}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} {...TOOLTIP_STYLE} />
            <Legend />
            <Bar dataKey="매출" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Bar dataKey="수주" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Line type="monotone" dataKey="수금" stroke={CHART_COLORS[4]} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {forecast && forecast.points.length > 3 && forecast.stats.confidence !== "insufficient" && forecast.stats.confidence !== "unusable" && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="매출 추이 및 예측"
          formula={`매월 ${formatCurrency(forecast.stats.slope, true)}씩 변동하는 추세선 (설명력 ${safeFixed(forecast.stats.r2 * 100, 0)}%)`}
          description={`현재 추세: ${forecast.stats.trend === "up" ? "상승" : forecast.stats.trend === "down" ? "하락" : "횡보"}, 월평균 ${isFinite(forecast.stats.avgGrowthRate) ? forecast.stats.avgGrowthRate.toFixed(1) : "-"}% 성장률${forecast.stats.confidence === "low" ? " — 데이터 부족으로 이동평균만 표시" : forecast.stats.r2 < 0.5 ? " — 회귀선 신뢰도 낮음, 이동평균 기준으로 추세를 판단하세요" : ""}`}
          benchmark={forecast.stats.confidence === "low" ? "데이터 부족으로 이동평균만 표시 (최소 12개월 권장)" : forecast.stats.r2 < 0.5 ? "회귀선 신뢰도 낮음 (R² < 50%) — 이동평균 참고" : "설명력(R²)이 70% 이상이면 예측 신뢰도 높음"}
          reason="과거 실적 기반 매출 예측으로 향후 매출 규모를 전망하고, 자원 배분과 목표 설정에 활용합니다."
        >
          {forecast.stats.confidence === "low" && (
            <div className="mb-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs rounded">
              데이터 부족으로 이동평균만 표시합니다 (회귀 예측은 12개월 이상 데이터 필요)
            </div>
          )}
          <ChartContainer>
            <ComposedChart data={forecast.points}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip formatter={(v: any) => v != null ? formatCurrency(Number(v)) : "–"} {...TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="actual" name="실적" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Line type="monotone" dataKey="movingAvg3" name="3개월 이동평균" stroke={CHART_COLORS[3]} strokeWidth={1.5} dot={false} connectNulls activeDot={{ r: 5, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
              {forecast.stats.confidence === "normal" && (
                <Line type="monotone" dataKey="forecast" name={`예측 (R²=${safeFixed(forecast.stats.r2 * 100, 0)}%)`} stroke={CHART_COLORS[4]} strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls {...ANIMATION_CONFIG} />
              )}
              {forecast.stats.confidence === "normal" && (
                <Area type="monotone" dataKey="upperBound" name="상한" stroke="none" fill={CHART_COLORS[4]} fillOpacity={0.1} connectNulls />
              )}
              {forecast.stats.confidence === "normal" && (
                <Area type="monotone" dataKey="lowerBound" name="하한" stroke="none" fill={CHART_COLORS[4]} fillOpacity={0.05} connectNulls />
              )}
            </ComposedChart>
          </ChartContainer>
        </ChartCard>
      )}
      {forecast && (forecast.stats.confidence === "insufficient" || forecast.stats.confidence === "unusable") && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="매출 추이 및 예측"
          reason="과거 실적 기반 매출 예측으로 향후 매출 규모를 전망합니다."
        >
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            {forecast.stats.confidence === "unusable"
              ? "예측 불가 — 데이터 부족 + 회귀 부적합 (R² < 30%). 더 많은 매출 데이터를 업로드하세요"
              : "데이터 부족 (최소 6개월 필요) — 더 많은 매출 데이터를 업로드하면 예측이 표시됩니다"}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
