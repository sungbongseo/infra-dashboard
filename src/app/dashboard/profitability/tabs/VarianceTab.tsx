import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  ReferenceLine, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Target, TrendingUp, Calendar, AlertTriangle, Lightbulb, BarChart3 } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import type { PlanDataQuality, MarginDriftResult, OrgGapContribution } from "@/lib/analysis/planAchievement";

// ── Interfaces ──────────────────────────────────────────────

interface PlanSummary {
  salesAchievement: number;
  salesGap: number;
  totalSalesPlan: number;
  totalSalesActual: number;
  gpAchievement: number;
  totalGPPlan: number;
  totalGPActual: number;
  opAchievement: number;
  totalOPPlan: number;
  totalOPActual: number;
  marginDrift: number;
  plannedGPRate: number;
  actualGPRate: number;
  plannedOPRate: number;
  actualOPRate: number;
  opMarginDrift: number;
}

interface OrgAchievementEntry {
  org: string;
  salesPlan: number;
  salesActual: number;
  salesAchievement: number;
  salesGap: number;
  gpAchievement: number;
  opAchievement: number;
  plannedGPRate: number;
  actualGPRate: number;
}

interface ContributorEntry {
  customer: string;
  salesPlan: number;
  salesActual: number;
  salesGap: number;
  gpMargin: number;
}

interface VarianceTabProps {
  planSummary: PlanSummary;
  orgAchievement: OrgAchievementEntry[];
  topContributors: { top: ContributorEntry[]; bottom: ContributorEntry[] };
  marginDriftResult: MarginDriftResult;
  planQuality: PlanDataQuality;
  orgGapContribution: OrgGapContribution[];
  planInsight: string;
  isUsingDateFiltered: boolean;
  isDateFiltered?: boolean;
  dateRange: { from?: string; to?: string } | null;
}

// ── Helper: Achievement gauge color ────────────────────────

function gaugeBgColor(pct: number): string {
  if (pct >= 100) return "bg-emerald-100 dark:bg-emerald-950/40";
  if (pct >= 80) return "bg-amber-100 dark:bg-amber-950/40";
  return "bg-red-100 dark:bg-red-950/40";
}

// ── Component ──────────────────────────────────────────────

export function VarianceTab({
  planSummary, orgAchievement, topContributors, marginDriftResult,
  planQuality, orgGapContribution, planInsight,
  isUsingDateFiltered, isDateFiltered, dateRange,
}: VarianceTabProps) {
  const dataSourceType = isUsingDateFiltered ? "period" : "snapshot";

  return (
    <>
      {/* 기간 필터 배너 */}
      {isUsingDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
        </div>
      )}

      {/* 2-B: 계획 데이터 품질 배너 (C1, F3 해결) */}
      {(planQuality.planQualityLevel === "none" || planQuality.planQualityLevel === "poor") && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <div>
            <span className="font-semibold">계획 데이터 품질 경고</span>
            {" — "}
            {planQuality.planQualityLevel === "none"
              ? "계획값이 전혀 존재하지 않습니다. SAP에서 계획 데이터를 포함한 보고서를 추출해주세요."
              : `전체 ${planQuality.totalRecords.toLocaleString()}건 중 ${planQuality.recordsWithSalesPlan.toLocaleString()}건(${planQuality.salesPlanCoverage.toFixed(0)}%)에만 계획값이 존재합니다. 분석 신뢰성이 제한됩니다.`}
          </div>
        </div>
      )}

      {/* 2-C: 자동 인사이트 카드 (F6 해결) */}
      {planInsight && planQuality.planQualityLevel !== "none" && (
        <div className="rounded-md border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-sm text-foreground flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="leading-relaxed">{planInsight}</p>
        </div>
      )}

      {/* 2-D: 달성율 게이지 3개 (F1 해결) */}
      {planQuality.hasMeaningfulPlan && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { label: "매출 달성", pct: planSummary.salesAchievement, plan: planSummary.totalSalesPlan, actual: planSummary.totalSalesActual, gap: planSummary.salesGap },
            { label: "매출총이익 달성", pct: planSummary.gpAchievement, plan: planSummary.totalGPPlan, actual: planSummary.totalGPActual, gap: planSummary.totalGPActual - planSummary.totalGPPlan },
            { label: "영업이익 달성", pct: planSummary.opAchievement, plan: planSummary.totalOPPlan, actual: planSummary.totalOPActual, gap: planSummary.totalOPActual - planSummary.totalOPPlan },
          ] as const).map((item) => {
            const clampedPct = Math.min(Math.max(isFinite(item.pct) ? item.pct : 0, 0), 150);
            const displayPct = isFinite(item.pct) ? item.pct : 0;
            return (
              <div key={item.label} className={`rounded-lg p-4 ${gaugeBgColor(displayPct)}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={`text-lg font-bold ${displayPct >= 100 ? "text-emerald-600 dark:text-emerald-400" : displayPct >= 80 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                    {displayPct.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={(clampedPct / 150) * 100}
                  className="h-2.5"
                  indicatorClassName={displayPct >= 100 ? "bg-emerald-500" : displayPct >= 80 ? "bg-amber-500" : "bg-red-500"}
                />
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>계획 {formatCurrency(item.plan, true)}</span>
                  <span className={item.gap >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                    {item.gap >= 0 ? "+" : ""}{formatCurrency(item.gap, true)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2-E: KPI 6개 (F5 해결) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="매출 달성율"
          value={planSummary.salesAchievement}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="매출 달성율 = 매출액 실적 ÷ 매출액 계획 × 100"
          description={`계획 ${formatCurrency(planSummary.totalSalesPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalSalesActual, true)}의 달성 비율입니다.`}
          benchmark="100% 이상이면 계획 초과 달성, 미만이면 미달입니다"
          reason="매출 계획 대비 실적의 달성도를 파악하여 영업 활동의 성과를 정량적으로 평가합니다"
        />
        <KpiCard
          title="매출 차이"
          value={planSummary.salesGap}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="매출 차이 = 매출 실적 - 매출 계획"
          description="계획 대비 매출의 절대 금액 차이입니다. 양수면 초과 달성, 음수면 미달입니다."
          benchmark="양수면 계획 초과로 긍정적, 음수의 절대값이 계획의 20% 이상이면 계획 수정 검토"
          reason="매출 차이의 절대 금액을 확인하여 계획 미달의 재무적 영향을 정량화합니다"
        />
        <KpiCard
          title="매출총이익 달성율"
          value={planSummary.gpAchievement}
          format="percent"
          formula="매출총이익 달성율 = 매출총이익 실적 ÷ 매출총이익 계획 × 100"
          description={`계획 매출총이익 ${formatCurrency(planSummary.totalGPPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalGPActual, true)}의 달성율입니다.`}
          benchmark="매출 달성율과 함께 비교하여 매출총이익 달성율이 더 낮다면 원가율 악화 신호"
          reason="매출총이익 달성율을 매출 달성율과 비교하여 수익의 질적 변화를 진단합니다"
        />
        <KpiCard
          title="GP 이익율 변동"
          value={planSummary.marginDrift}
          format="percent"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="GP 이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
          description={`계획 이익율 ${isFinite(planSummary.plannedGPRate) ? planSummary.plannedGPRate.toFixed(1) : "0.0"}% → 실적 ${isFinite(planSummary.actualGPRate) ? planSummary.actualGPRate.toFixed(1) : "0.0"}%. ${planSummary.marginDrift >= 0 ? "이익율 개선" : "이익율 악화"}을 의미합니다.`}
          benchmark="양수면 원가 절감 또는 고마진 제품 비중 증가, 음수면 원가 상승"
          reason="이익율의 계획 대비 변동을 추적하여 원가 구조 변화의 방향을 파악합니다"
        />
        <KpiCard
          title="영업이익 달성율"
          value={planSummary.opAchievement}
          format="percent"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="영업이익 달성율 = 영업이익 실적 ÷ 영업이익 계획 × 100"
          description={`계획 영업이익 ${formatCurrency(planSummary.totalOPPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalOPActual, true)}의 달성율입니다.`}
          benchmark="매출총이익 달성율보다 낮다면 판관비 초과 지출 신호"
          reason="영업이익 달성율을 통해 판관비 관리까지 포함한 최종 수익 달성도를 평가합니다"
        />
        <KpiCard
          title="OP 이익율 변동"
          value={planSummary.opMarginDrift}
          format="percent"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="OP 이익율 변동 = 실적 영업이익율 - 계획 영업이익율"
          description={`계획 영업이익율 ${isFinite(planSummary.plannedOPRate) ? planSummary.plannedOPRate.toFixed(1) : "0.0"}% → 실적 ${isFinite(planSummary.actualOPRate) ? planSummary.actualOPRate.toFixed(1) : "0.0"}%. ${planSummary.opMarginDrift >= 0 ? "이익율 개선" : "이익율 악화"}을 의미합니다.`}
          benchmark="양수면 비용 효율 개선, 음수면 판관비 증가 또는 매출 감소"
          reason="영업이익율 변동을 추적하여 원가 + 판관비를 포함한 전체 비용 관리 상태를 진단합니다"
        />
      </div>

      {/* 2-F: 조직별 매출 갭 기여도 차트 (F2 해결) */}
      {orgGapContribution.length > 0 && orgGapContribution.some((o) => o.salesPlan !== 0) && (
        <ChartCard
          title="조직별 매출 갭 기여도"
          dataSourceType={dataSourceType}
          isDateFiltered={isDateFiltered}
          formula="매출 갭 = 매출 실적 - 매출 계획"
          description="각 조직이 전체 매출 초과/미달에 얼마나 기여했는지를 금액으로 보여줍니다. 양수(녹색)는 초과 달성, 음수(빨간색)는 미달입니다."
          benchmark="양수 합계 > 음수 합계이면 전체 목표 초과 달성"
          reason="조직별 갭 기여도를 확인하여 초과 달성 조직의 성공 요인과 미달 조직의 개선 과제를 식별합니다"
        >
          <ChartContainer height="h-64 md:h-80">
            <BarChart data={orgGapContribution} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatCurrency(Number(v), true)} />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
              <RechartsTooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as OrgGapContribution | undefined;
                  if (!d) return null;
                  return (
                    <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                      <p className="font-semibold mb-1">{d.org}</p>
                      <p>계획: {formatCurrency(d.salesPlan)}</p>
                      <p>실적: {formatCurrency(d.salesActual)}</p>
                      <p className={d.salesGap >= 0 ? "text-emerald-600" : "text-red-500"}>
                        갭: {d.salesGap >= 0 ? "+" : ""}{formatCurrency(d.salesGap)}
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={0} stroke="#666" strokeDasharray="3 3" />
              <Bar dataKey="salesGap" name="매출 갭" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {orgGapContribution.map((r, i) => (
                  <Cell key={i} fill={r.salesGap >= 0 ? "#059669" : "#dc2626"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* 2-G: 조직별 달성율 차트 개선 (F4 해결) — 매출/GP/OP 3개 grouped bar */}
      <ChartCard
        title="조직별 매출·GP·OP 달성율"
        dataSourceType={dataSourceType}
        isDateFiltered={isDateFiltered}
        formula="달성율 = 실적 ÷ 계획 × 100"
        description="각 조직의 매출, 매출총이익(GP), 영업이익(OP) 달성율을 비교합니다. 100% 기준선을 넘으면 초과 달성입니다."
        benchmark="세 지표가 모두 100% 이상이면 양호. GP/OP 달성율이 매출보다 낮으면 수익성 악화"
        reason="매출/GP/OP 달성율을 조직별로 비교하여 양적 성장과 질적 수익성의 균형을 진단합니다"
      >
        <ChartContainer height="h-64 md:h-80">
          <BarChart data={orgAchievement}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`} />
            <RechartsTooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                    <p className="font-semibold mb-1">{d.org}</p>
                    <p>매출 달성율: {isFinite(d.salesAchievement) ? d.salesAchievement.toFixed(1) : "0.0"}%</p>
                    <p>GP 달성율: {isFinite(d.gpAchievement) ? d.gpAchievement.toFixed(1) : "0.0"}%</p>
                    <p>OP 달성율: {isFinite(d.opAchievement) ? d.opAchievement.toFixed(1) : "0.0"}%</p>
                    <p className="text-xs text-muted-foreground mt-1">계획: {formatCurrency(d.salesPlan, true)} / 실적: {formatCurrency(d.salesActual, true)}</p>
                  </div>
                );
              }}
            />
            <Legend />
            <ReferenceLine y={100} stroke="#666" strokeDasharray="3 3" label={{ value: "100%", fontSize: 10, position: "right" }} />
            <Bar dataKey="salesAchievement" name="매출 달성율" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Bar dataKey="gpAchievement" name="GP 달성율" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Bar dataKey="opAchievement" name="OP 달성율" fill={CHART_COLORS[3]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 조직별 이익율 변동 */}
      <ChartCard
        title="조직별 이익율 변동 (계획 → 실적)"
        dataSourceType={dataSourceType}
        isDateFiltered={isDateFiltered}
        formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
        description="각 조직의 계획 매출총이익율(회색)과 실적(파란색)을 비교합니다."
        benchmark="실적(파란색)이 계획(회색)보다 높으면 이익율 개선"
        reason="조직별 이익율 변동을 추적하여 원가 관리 역량의 차이를 진단합니다"
      >
        <ChartContainer height="h-64 md:h-80">
          <BarChart data={orgAchievement}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`} />
            <RechartsTooltip
              formatter={(v: any) => `${Number(v).toFixed(1)}%`}
              {...TOOLTIP_STYLE}
            />
            <Legend />
            <Bar dataKey="plannedGPRate" name="계획 이익율" fill={CHART_COLORS[5]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Bar dataKey="actualGPRate" name="실적 이익율" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* Top 기여 / 악화 거래처 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="매출 초과 달성 Top 10 거래처"
          dataSourceType={dataSourceType}
          isDateFiltered={isDateFiltered}
          formula="매출 차이 = 매출 실적 - 매출 계획, 상위 10건 정렬"
          description="계획 대비 매출이 가장 크게 늘어난 거래처입니다."
          benchmark="초과 달성 거래처의 성공 요인을 분석하여 타 거래처에 적용 검토"
          reason="매출 초과 달성 거래처의 성공 패턴을 분석하여 다른 거래처에 동일 전략을 적용할 기회를 발굴합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">거래처</th>
                  <th className="p-2 font-medium text-right">계획</th>
                  <th className="p-2 font-medium text-right">실적</th>
                  <th className="p-2 font-medium text-right">초과분</th>
                  <th className="p-2 font-medium text-right">이익율</th>
                </tr>
              </thead>
              <tbody>
                {topContributors.top.map((c) => (
                  <tr key={c.customer} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium text-xs max-w-[160px] truncate" title={c.customer}>{c.customer}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesPlan, true)}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesActual, true)}</td>
                    <td className="p-2 text-right text-xs text-green-600 dark:text-green-400">+{formatCurrency(c.salesGap, true)}</td>
                    <td className={`p-2 text-right text-xs ${c.gpMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.gpMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                      {isFinite(c.gpMargin) ? c.gpMargin.toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
                {topContributors.top.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">전체적으로 매출이 계획에 미치지 못하고 있습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title="매출 미달 Top 10 거래처"
          dataSourceType={dataSourceType}
          isDateFiltered={isDateFiltered}
          formula="매출 차이 = 매출 실적 - 매출 계획, 하위 10건 정렬"
          description="계획 대비 매출이 가장 크게 줄어든 거래처입니다."
          benchmark="미달 거래처의 원인을 파악하여 대응 전략 수립"
          reason="매출 미달 거래처의 이탈 원인을 조기에 파악하여 거래 회복 전략을 수립합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">거래처</th>
                  <th className="p-2 font-medium text-right">계획</th>
                  <th className="p-2 font-medium text-right">실적</th>
                  <th className="p-2 font-medium text-right">미달분</th>
                  <th className="p-2 font-medium text-right">이익율</th>
                </tr>
              </thead>
              <tbody>
                {topContributors.bottom.map((c) => (
                  <tr key={c.customer} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium text-xs max-w-[160px] truncate" title={c.customer}>{c.customer}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesPlan, true)}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesActual, true)}</td>
                    <td className="p-2 text-right text-xs text-red-600 dark:text-red-400">{formatCurrency(c.salesGap, true)}</td>
                    <td className={`p-2 text-right text-xs ${c.gpMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.gpMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                      {isFinite(c.gpMargin) ? c.gpMargin.toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
                {topContributors.bottom.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">모든 거래처가 계획을 달성했습니다 — 매우 양호한 상태입니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* 2-J: 마진 drift 테이블 분리 (C3, U3, U4 해결) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 악화 거래처 */}
        <ChartCard
          title="이익율 악화 거래처"
          dataSourceType={dataSourceType}
          isDateFiltered={isDateFiltered}
          formula="영향액 = 매출 실적 × (실적 이익율 - 계획 이익율) ÷ 100"
          description="계획 대비 매출총이익율이 하락하여 이익이 줄어든 거래처입니다."
          benchmark="영향액이 -1억 이상이면 즉각적인 원인 분석과 대응이 필요합니다"
          reason="이익율 악화 거래처를 영향액 기준으로 정렬하여 이익 손실이 가장 큰 거래처를 우선 관리합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">거래처</th>
                  <th className="p-2 font-medium text-right">매출 실적</th>
                  <th className="p-2 font-medium text-right">계획</th>
                  <th className="p-2 font-medium text-right">실적</th>
                  <th className="p-2 font-medium text-right">변동</th>
                  <th className="p-2 font-medium text-right">영향액</th>
                </tr>
              </thead>
              <tbody>
                {marginDriftResult.worsened.map((item) => (
                  <tr key={item.customer} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium text-xs max-w-[160px] truncate" title={item.customer}>{item.customer}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(item.salesActual, true)}</td>
                    <td className="p-2 text-right text-xs">{isFinite(item.plannedGPRate) ? item.plannedGPRate.toFixed(1) : "0.0"}%</td>
                    <td className="p-2 text-right text-xs">{isFinite(item.actualGPRate) ? item.actualGPRate.toFixed(1) : "0.0"}%</td>
                    <td className="p-2 text-right text-xs text-red-500 dark:text-red-400">
                      {isFinite(item.marginDrift) ? item.marginDrift.toFixed(1) : "0.0"}%p
                    </td>
                    <td className="p-2 text-right text-xs text-red-500 dark:text-red-400">
                      {formatCurrency(item.driftImpact, true)}
                    </td>
                  </tr>
                ))}
                {marginDriftResult.worsened.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">모든 거래처의 이익율이 유지 또는 개선되었습니다</td></tr>
                )}
              </tbody>
              {marginDriftResult.worsened.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="p-2 text-xs" colSpan={5}>악화 합계</td>
                    <td className="p-2 text-right text-xs text-red-600 dark:text-red-400">{formatCurrency(marginDriftResult.totalWorsenedImpact, true)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </ChartCard>

        {/* 개선 거래처 */}
        <ChartCard
          title="이익율 개선 거래처"
          dataSourceType={dataSourceType}
          isDateFiltered={isDateFiltered}
          formula="영향액 = 매출 실적 × (실적 이익율 - 계획 이익율) ÷ 100"
          description="계획 대비 매출총이익율이 상승하여 이익이 늘어난 거래처입니다."
          benchmark="영향액이 큰 거래처의 성공 요인(원가 절감, 가격 인상 등)을 분석하여 확산"
          reason="이익율 개선 거래처의 성공 패턴을 파악하여 다른 거래처에도 적용할 수 있는 기회를 발굴합니다"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">거래처</th>
                  <th className="p-2 font-medium text-right">매출 실적</th>
                  <th className="p-2 font-medium text-right">계획</th>
                  <th className="p-2 font-medium text-right">실적</th>
                  <th className="p-2 font-medium text-right">변동</th>
                  <th className="p-2 font-medium text-right">영향액</th>
                </tr>
              </thead>
              <tbody>
                {marginDriftResult.improved.map((item) => (
                  <tr key={item.customer} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium text-xs max-w-[160px] truncate" title={item.customer}>{item.customer}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(item.salesActual, true)}</td>
                    <td className="p-2 text-right text-xs">{isFinite(item.plannedGPRate) ? item.plannedGPRate.toFixed(1) : "0.0"}%</td>
                    <td className="p-2 text-right text-xs">{isFinite(item.actualGPRate) ? item.actualGPRate.toFixed(1) : "0.0"}%</td>
                    <td className="p-2 text-right text-xs text-emerald-600 dark:text-emerald-400">
                      {isFinite(item.marginDrift) ? (item.marginDrift >= 0 ? "+" : "") + item.marginDrift.toFixed(1) : "0.0"}%p
                    </td>
                    <td className="p-2 text-right text-xs text-emerald-600 dark:text-emerald-400">
                      {item.driftImpact >= 0 ? "+" : ""}{formatCurrency(item.driftImpact, true)}
                    </td>
                  </tr>
                ))}
                {marginDriftResult.improved.length === 0 && (
                  <tr><td colSpan={6} className="p-4 text-center text-muted-foreground text-xs">이익율이 개선된 거래처가 없습니다</td></tr>
                )}
              </tbody>
              {marginDriftResult.improved.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="p-2 text-xs" colSpan={5}>개선 합계</td>
                    <td className="p-2 text-right text-xs text-emerald-600 dark:text-emerald-400">+{formatCurrency(marginDriftResult.totalImprovedImpact, true)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </ChartCard>
      </div>

      {/* 순영향 요약 */}
      {(marginDriftResult.worsened.length > 0 || marginDriftResult.improved.length > 0) && (
        <div className={`rounded-md p-3 text-sm flex items-center justify-between ${marginDriftResult.netImpact >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800"}`}>
          <span className="text-muted-foreground">이익율 변동 순영향</span>
          <span className={`font-semibold ${marginDriftResult.netImpact >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {marginDriftResult.netImpact >= 0 ? "+" : ""}{formatCurrency(marginDriftResult.netImpact, true)}
          </span>
        </div>
      )}
    </>
  );
}
