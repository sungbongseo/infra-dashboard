import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  ReferenceLine, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Target, TrendingUp, Calendar, AlertTriangle } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface PlanSummary {
  salesAchievement: number;
  salesGap: number;
  totalSalesPlan: number;
  totalSalesActual: number;
  gpAchievement: number;
  totalGPPlan: number;
  totalGPActual: number;
  marginDrift: number;
  plannedGPRate: number;
  actualGPRate: number;
}

interface OrgAchievementEntry {
  org: string;
  salesPlan: number;
  salesActual: number;
  salesAchievement: number;
  salesGap: number;
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

interface MarginDriftEntry {
  customer: string;
  salesActual: number;
  plannedGPRate: number;
  actualGPRate: number;
  marginDrift: number;
  driftImpact: number;
}

interface VarianceTabProps {
  planSummary: PlanSummary;
  orgAchievement: OrgAchievementEntry[];
  topContributors: { top: ContributorEntry[]; bottom: ContributorEntry[] };
  marginDriftItems: MarginDriftEntry[];
  isUsingDateFiltered: boolean;
  isDateFiltered?: boolean;
  dateRange: { from?: string; to?: string } | null;
}

export function VarianceTab({ planSummary, orgAchievement, topContributors, marginDriftItems, isUsingDateFiltered, isDateFiltered, dateRange }: VarianceTabProps) {
  return (
    <>
      {isUsingDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
        </div>
      )}

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="매출 달성율"
          value={planSummary.salesAchievement}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="매출 달성율 = 매출액 실적 ÷ 매출액 계획 × 100"
          description={`계획 ${formatCurrency(planSummary.totalSalesPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalSalesActual, true)}의 달성 비율입니다.`}
          benchmark="100% 이상이면 계획 초과 달성, 미만이면 미달입니다"
          reason="매출 계획 대비 실적의 달성도를 파악하여 영업 활동의 성과를 정량적으로 평가하고, 미달 시 원인 분석(시장 변화, 경쟁 심화, 영업력 부족 등)의 출발점을 제공합니다"
        />
        <KpiCard
          title="매출 차이"
          value={planSummary.salesGap}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="매출 차이 = 매출 실적 - 매출 계획"
          description="계획 대비 매출의 절대 금액 차이입니다. 양수면 초과 달성, 음수면 미달입니다."
          benchmark="양수면 계획 초과로 긍정적, 음수의 절대값이 계획의 20% 이상이면 계획 수정 검토"
          reason="매출 차이의 절대 금액을 확인하여 계획 미달의 재무적 영향을 정량화하고, 차기 계획 수립 시 현실적 목표 설정의 근거를 마련합니다"
        />
        <KpiCard
          title="매출총이익 달성율"
          value={planSummary.gpAchievement}
          format="percent"
          formula="매출총이익 달성율 = 매출총이익 실적 ÷ 매출총이익 계획 × 100"
          description={`계획 매출총이익 ${formatCurrency(planSummary.totalGPPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalGPActual, true)}의 달성율입니다.`}
          benchmark="매출 달성율과 함께 비교하여 매출총이익 달성율이 더 낮다면 원가율 악화 신호"
          reason="매출총이익 달성율을 매출 달성율과 비교하여 수익의 질적 변화를 진단하고, 매출은 달성했지만 이익이 미달인 경우 원가 상승이나 판매 믹스 악화의 신호를 포착합니다"
        />
        <KpiCard
          title="이익율 변동"
          value={planSummary.marginDrift}
          format="percent"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
          description={`계획 이익율 ${planSummary.plannedGPRate.toFixed(1)}% → 실적 ${planSummary.actualGPRate.toFixed(1)}%. ${planSummary.marginDrift >= 0 ? "이익율 개선" : "이익율 악화"}을 의미합니다.`}
          benchmark="양수면 원가 절감 또는 고마진 제품 비중 증가, 음수면 원가 상승 또는 저마진 판매 증가"
          reason="이익율의 계획 대비 변동을 추적하여 원가 구조 변화의 방향을 파악하고, 악화 추세가 지속되는 경우 가격 정책 또는 원가 관리 체계의 근본적 재검토를 위한 조기 경보 역할을 합니다"
        />
      </div>

      {/* 조직별 매출 달성율 */}
      <ChartCard
        title="조직별 매출 달성율"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="달성율 = 실적 ÷ 계획 × 100"
        description="각 조직의 매출 계획 달성율을 비교합니다. 100% 기준선을 넘으면 초과 달성, 미달이면 추가 영업 노력이 필요합니다."
        benchmark="100% 기준선: 달성, 빨간 막대는 미달 조직"
        reason="조직별 매출 달성율을 비교하여 성과가 우수한 조직의 성공 요인과 미달 조직의 개선 과제를 식별하고, 조직별 차등 지원 및 관리의 근거를 제공합니다"
      >
        <ChartContainer height="h-64 md:h-80">
            <BarChart data={orgAchievement} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
              <RechartsTooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                      <p className="font-semibold mb-1">{d.org}</p>
                      <p>매출 계획: {formatCurrency(d.salesPlan)}</p>
                      <p>매출 실적: {formatCurrency(d.salesActual)}</p>
                      <p>달성율: {d.salesAchievement.toFixed(1)}%</p>
                      <p>차이: {formatCurrency(d.salesGap)}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={100} stroke="#666" strokeDasharray="3 3" label={{ value: "100%", fontSize: 10 }} />
              <Bar dataKey="salesAchievement" name="매출달성율" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {orgAchievement.map((r, i) => (
                  <Cell key={i} fill={r.salesAchievement >= 100 ? CHART_COLORS[0] : r.salesAchievement >= 80 ? CHART_COLORS[3] : CHART_COLORS[6]} />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 조직별 이익율 변동 */}
      <ChartCard
        title="조직별 이익율 변동 (계획 → 실적)"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
        description="각 조직의 계획 매출총이익율(회색)과 실적(파란색)을 비교합니다. 실적이 계획보다 낮으면 이익율이 악화된 것이며, 원가 상승이나 저마진 판매 증가가 원인일 수 있습니다."
        benchmark="실적(파란색)이 계획(회색)보다 높으면 이익율 개선"
        reason="조직별 이익율 변동을 추적하여 원가 관리 역량의 차이를 진단하고, 이익율이 악화된 조직에 대한 원가 구조 점검 및 가격 정책 재검토의 우선순위를 결정합니다"
      >
        <ChartContainer height="h-64 md:h-80">
            <BarChart data={orgAchievement}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
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
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="매출 차이 = 매출 실적 - 매출 계획, 상위 10건 정렬"
          description="계획 대비 매출이 가장 크게 늘어난 거래처입니다. 신규 거래 확보나 기존 거래 확대의 성과를 보여줍니다."
          benchmark="초과 달성 거래처의 성공 요인을 분석하여 타 거래처에 적용 검토"
          reason="매출 초과 달성 거래처의 성공 패턴(신규 프로젝트, 물량 증가, 제품 확대 등)을 분석하여 다른 거래처에 동일 전략을 적용할 수 있는 기회를 발굴합니다"
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
                    <td className="p-2 font-medium text-xs">{c.customer.substring(0, 15)}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesPlan, true)}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesActual, true)}</td>
                    <td className="p-2 text-right text-xs text-green-600 dark:text-green-400">+{formatCurrency(c.salesGap, true)}</td>
                    <td className={`p-2 text-right text-xs ${c.gpMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.gpMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                      {c.gpMargin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {topContributors.top.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">초과 달성 거래처 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard
          title="매출 미달 Top 10 거래처"
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="매출 차이 = 매출 실적 - 매출 계획, 하위 10건 정렬"
          description="계획 대비 매출이 가장 크게 줄어든 거래처입니다. 거래 감소 원인 분석과 대응 전략이 필요합니다."
          benchmark="미달 거래처의 원인(경쟁사 이동, 수요 감소 등)을 파악하여 대응 전략 수립"
          reason="매출 미달 거래처의 이탈 원인(경쟁사 가격, 품질 불만, 수요 감소 등)을 조기에 파악하여 거래 회복 전략을 수립하고, 추가 이탈을 방지합니다"
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
                    <td className="p-2 font-medium text-xs">{c.customer.substring(0, 15)}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesPlan, true)}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(c.salesActual, true)}</td>
                    <td className="p-2 text-right text-xs text-red-600 dark:text-red-400">{formatCurrency(c.salesGap, true)}</td>
                    <td className={`p-2 text-right text-xs ${c.gpMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.gpMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                      {c.gpMargin.toFixed(1)}%
                    </td>
                  </tr>
                ))}
                {topContributors.bottom.length === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">미달 거래처 없음</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* 마진율 악화 거래처 */}
      <ChartCard
        title="이익율 악화 거래처 (영향액 기준)"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="영향액 = 매출 실적 × (실적 이익율 - 계획 이익율) ÷ 100"
        description="계획 대비 매출총이익율이 하락하여 이익이 줄어든 거래처입니다. 영향액이 클수록 이익 손실이 크며, 원가 관리나 가격 정책 재검토가 필요합니다."
        benchmark="영향액이 -1억 이상이면 즉각적인 원인 분석과 대응이 필요합니다"
        reason="이익율 악화 거래처를 영향액 기준으로 정렬하여 이익 손실이 가장 큰 거래처의 원가·가격 문제를 우선 해결하고, 수익성 하락의 파급을 최소화합니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">거래처</th>
                <th className="p-2 font-medium text-right">매출 실적</th>
                <th className="p-2 font-medium text-right">계획 이익율</th>
                <th className="p-2 font-medium text-right">실적 이익율</th>
                <th className="p-2 font-medium text-right">변동</th>
                <th className="p-2 font-medium text-right">영향액</th>
              </tr>
            </thead>
            <tbody>
              {marginDriftItems.map((item) => (
                <tr key={item.customer} className="border-b hover:bg-muted/50">
                  <td className="p-2 font-medium text-xs">{item.customer.substring(0, 15)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(item.salesActual, true)}</td>
                  <td className="p-2 text-right text-xs">{item.plannedGPRate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-xs">{item.actualGPRate.toFixed(1)}%</td>
                  <td className={`p-2 text-right text-xs ${item.marginDrift >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {item.marginDrift >= 0 ? "+" : ""}{item.marginDrift.toFixed(1)}%p
                  </td>
                  <td className={`p-2 text-right text-xs ${item.driftImpact >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                    {formatCurrency(item.driftImpact, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
