import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  ComposedChart, Line, Area, Legend, ReferenceLine,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Info } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface OrgBreakevenEntry {
  org: string;
  sales: number;
  variableCosts: number;
  fixedCosts: number;
  bepSales: number;
  safetyMarginRate: number;
  contributionMarginRatio: number;
}

interface BreakevenTabProps {
  isDateFiltered?: boolean;
  orgBreakeven: OrgBreakevenEntry[];
  bepChartData: Array<{ revenue: number; totalCost: number; fixedCost: number }>;
  bepKpiSummary: { totalBep: number; avgSafetyMargin: number; avgContribMarginRatio: number };
  bepFromTeam: boolean;
}

export function BreakevenTab({ orgBreakeven, bepChartData, bepKpiSummary, bepFromTeam, isDateFiltered }: BreakevenTabProps) {
  return (
    <>
      {/* 데이터 소스 안내 */}
      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
        <Info className="h-4 w-4 flex-shrink-0" />
        <span>
          {bepFromTeam
            ? "고정비 산출: 팀원별 공헌이익 데이터의 판관고정 3항목(감가상각비 + 기타경비 + 노무비) 직접 합산 — 정확도 높음"
            : "고정비 산출: 조직별 손익 데이터에서 역산 (고정비 = 공헌이익 - 영업이익). 팀원별 공헌이익(401) 파일을 업로드하면 더 정확한 분석이 가능합니다."}
        </span>
      </div>

      {/* BEP KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="손익분기점(BEP) 매출" value={bepKpiSummary.totalBep} format="currency" formula="BEP 매출 = 고정비 ÷ (1 - 변동비율)" description="손익분기점(Break-Even Point) 매출액입니다. 이 금액 이상을 팔아야 비로소 이익이 발생합니다. BEP가 낮을수록 적은 매출로도 이익을 낼 수 있는 안정적인 구조입니다." benchmark="실제 매출이 BEP 매출보다 높으면 이익 구간, 낮으면 손실 구간입니다" reason="손익분기점을 파악하여 최소 필요 매출 수준을 확인하고, 경기 하락이나 주요 거래처 이탈 시 사업 존속 가능성을 사전에 판단합니다" />
        <KpiCard title="안전한계율" value={bepKpiSummary.avgSafetyMargin} format="percent" formula="안전한계율(%) = (실적매출 − BEP매출) ÷ 실적매출 × 100" description="현재 매출이 손익분기점보다 얼마나 여유가 있는지를 보여주는 비율입니다. 높을수록 매출이 다소 감소해도 이익을 유지할 수 있어 경영이 안전합니다." benchmark="20% 이상이면 안전, 10% 미만이면 매출 감소 시 적자 전환 위험이 높습니다" reason="안전한계율을 통해 매출이 얼마나 줄어도 적자로 전환되지 않는지를 파악하고, 경기 불확실성에 대비한 버퍼 수준을 관리합니다" />
        <KpiCard title="공헌이익률" value={bepKpiSummary.avgContribMarginRatio} format="percent" formula="공헌이익률 = (매출 - 변동비) ÷ 매출 × 100" description="매출 100원당 고정비(임차료, 인건비 등)를 회수하는 데 기여하는 금액의 비율입니다. 공헌이익률이 높을수록 고정비를 빨리 회수하고 이익을 낼 수 있습니다." benchmark="공헌이익률이 높을수록 손익분기점이 낮아져 수익 구조가 안정적입니다" reason="공헌이익률이 높은 제품/조직에 자원을 집중하면 고정비 회수 속도를 높이고 손익분기점을 낮출 수 있습니다" />
        <KpiCard title="분석 조직 수" value={orgBreakeven.length} format="number" formula="손익 데이터에서 변동비/고정비 분리가 가능한 조직 수" description={`손익분기점(BEP) 분석이 가능한 조직 수입니다. 데이터 소스: ${bepFromTeam ? "팀원별 공헌이익(401)" : "조직별 손익(303)"}`} benchmark="전체 조직 대비 분석 가능 조직이 80% 이상이면 데이터 커버리지 양호" reason="BEP 분석 가능한 조직 수를 파악하여 데이터 커버리지가 충분한지 확인하고, 누락된 조직의 데이터를 보완하는 근거를 제공합니다" />
      </div>

      {/* BEP Chart */}
      {bepChartData.length > 0 && (
        <ChartCard title="손익분기점 도표" dataSourceType="snapshot" isDateFiltered={isDateFiltered} formula="손익분기점 = 매출선과 총비용선이 만나는 지점" description="가로축(매출)이 커질수록 매출선(파란선)과 총비용선(빨간선)이 어디서 만나는지 보여줍니다. 두 선이 만나는 교차점이 바로 손익분기점(BEP)이며, 이 지점을 넘어서면 이익이 발생합니다. 아래쪽 영역은 고정비를 나타냅니다." benchmark="매출선이 총비용선 위에 있으면 이익 구간, 아래에 있으면 손실 구간입니다" reason="매출과 비용의 교차점을 시각화하여 현재 매출이 이익 구간에 있는지 직관적으로 확인하고, 목표 이익 달성에 필요한 추가 매출을 산출합니다">
          <ChartContainer height="h-64 md:h-80">
              <ComposedChart data={bepChartData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="revenue" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} label={{ value: "매출", position: "insideBottomRight", offset: -5, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="매출" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
                <Line type="monotone" dataKey="totalCost" name="총비용" stroke={CHART_COLORS[6]} strokeWidth={2} dot={false} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
                <Area type="monotone" dataKey="fixedCost" name="고정비" fill={CHART_COLORS[5]} fillOpacity={0.2} stroke="none" />
              </ComposedChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* Org-level BEP comparison */}
      <ChartCard title="조직별 손익분기점 비교" dataSourceType="snapshot" isDateFiltered={isDateFiltered} formula="안전한계율(%) = (실적매출 − BEP매출) ÷ 실적매출 × 100" description="각 조직의 안전한계율을 수평 막대로 비교합니다. 안전한계율이 높을수록(녹색 영역) 매출이 줄어도 이익을 유지할 수 있어 안정적입니다. 빨간색 기준선(0%) 아래이면 현재 적자 상태, 녹색 안전선(20%) 이상이면 안전한 수익 구조입니다." benchmark="안전한계율 20% 이상(녹색 기준선): 안전, 0~20%: 주의, 0% 미만: 적자 상태" reason="조직별 안전한계율을 비교하여 경기 하락 시 가장 먼저 적자에 빠질 수 있는 취약 조직을 식별하고, 선제적 구조 개선 지원 대상을 결정합니다">
        <ChartContainer height="h-64 md:h-80">
            <BarChart data={orgBreakeven.filter(r => isFinite(r.safetyMarginRate)).slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
              <RechartsTooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} {...TOOLTIP_STYLE} />
              <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" />
              <ReferenceLine x={20} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "안전선", fontSize: 10 }} />
              <Bar dataKey="safetyMarginRate" name="안전한계율" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {orgBreakeven.filter(r => isFinite(r.safetyMarginRate)).slice(0, 10).map((r, i) => (
                  <Cell key={i} fill={r.safetyMarginRate >= 20 ? CHART_COLORS[0] : r.safetyMarginRate >= 0 ? CHART_COLORS[3] : CHART_COLORS[6]} />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
