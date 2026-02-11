import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  ReferenceLine, Legend,
} from "recharts";
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
  dateRange: { from?: string; to?: string } | null;
}

export function VarianceTab({ planSummary, orgAchievement, topContributors, marginDriftItems, isUsingDateFiltered, dateRange }: VarianceTabProps) {
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
        />
        <KpiCard
          title="매출 차이"
          value={planSummary.salesGap}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="매출 차이 = 매출 실적 - 매출 계획"
          description="계획 대비 매출의 절대 금액 차이입니다. 양수면 초과 달성, 음수면 미달입니다."
          benchmark="양수면 계획 초과로 긍정적, 음수의 절대값이 계획의 20% 이상이면 계획 수정 검토"
        />
        <KpiCard
          title="매출총이익 달성율"
          value={planSummary.gpAchievement}
          format="percent"
          formula="매출총이익 달성율 = 매출총이익 실적 ÷ 매출총이익 계획 × 100"
          description={`계획 매출총이익 ${formatCurrency(planSummary.totalGPPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalGPActual, true)}의 달성율입니다.`}
          benchmark="매출 달성율과 함께 비교하여 매출총이익 달성율이 더 낮다면 원가율 악화 신호"
        />
        <KpiCard
          title="이익율 변동"
          value={planSummary.marginDrift}
          format="percent"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
          description={`계획 이익율 ${planSummary.plannedGPRate.toFixed(1)}% → 실적 ${planSummary.actualGPRate.toFixed(1)}%. ${planSummary.marginDrift >= 0 ? "이익율 개선" : "이익율 악화"}을 의미합니다.`}
          benchmark="양수면 원가 절감 또는 고마진 제품 비중 증가, 음수면 원가 상승 또는 저마진 판매 증가"
        />
      </div>

      {/* 조직별 매출 달성율 */}
      <ChartCard
        title="조직별 매출 달성율"
        formula="달성율 = 실적 ÷ 계획 × 100"
        description="각 조직의 매출 계획 달성율을 비교합니다. 100% 기준선을 넘으면 초과 달성, 미달이면 추가 영업 노력이 필요합니다."
        benchmark="100% 기준선: 달성, 빨간 막대는 미달 조직"
      >
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={orgAchievement} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
              <Bar dataKey="salesAchievement" name="매출달성율" radius={[0, 4, 4, 0]}>
                {orgAchievement.map((r, i) => (
                  <Cell key={i} fill={r.salesAchievement >= 100 ? CHART_COLORS[0] : r.salesAchievement >= 80 ? CHART_COLORS[3] : CHART_COLORS[6]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 조직별 이익율 변동 */}
      <ChartCard
        title="조직별 이익율 변동 (계획 → 실적)"
        formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
        description="각 조직의 계획 매출총이익율(회색)과 실적(파란색)을 비교합니다. 실적이 계획보다 낮으면 이익율이 악화된 것이며, 원가 상승이나 저마진 판매 증가가 원인일 수 있습니다."
        benchmark="실적(파란색)이 계획(회색)보다 높으면 이익율 개선"
      >
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={orgAchievement}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="org" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <RechartsTooltip
                formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                {...TOOLTIP_STYLE}
              />
              <Legend />
              <Bar dataKey="plannedGPRate" name="계획 이익율" fill={CHART_COLORS[5]} radius={[4, 4, 0, 0]} />
              <Bar dataKey="actualGPRate" name="실적 이익율" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Top 기여 / 악화 거래처 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="매출 초과 달성 Top 10 거래처"
          formula="매출 차이 = 매출 실적 - 매출 계획, 상위 10건 정렬"
          description="계획 대비 매출이 가장 크게 늘어난 거래처입니다. 신규 거래 확보나 기존 거래 확대의 성과를 보여줍니다."
          benchmark="초과 달성 거래처의 성공 요인을 분석하여 타 거래처에 적용 검토"
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
          formula="매출 차이 = 매출 실적 - 매출 계획, 하위 10건 정렬"
          description="계획 대비 매출이 가장 크게 줄어든 거래처입니다. 거래 감소 원인 분석과 대응 전략이 필요합니다."
          benchmark="미달 거래처의 원인(경쟁사 이동, 수요 감소 등)을 파악하여 대응 전략 수립"
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
        formula="영향액 = 매출 실적 × (실적 이익율 - 계획 이익율) ÷ 100"
        description="계획 대비 매출총이익율이 하락하여 이익이 줄어든 거래처입니다. 영향액이 클수록 이익 손실이 크며, 원가 관리나 가격 정책 재검토가 필요합니다."
        benchmark="영향액이 -1억 이상이면 즉각적인 원인 분석과 대응이 필요합니다"
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
