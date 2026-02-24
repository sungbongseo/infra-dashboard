import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { SalesRepProfile, CostEfficiency } from "@/lib/analysis/profiling";

interface CostTabProps {
  hasTeamContribution: boolean;
  selected: SalesRepProfile | undefined;
  selectedCostData: CostEfficiency | undefined;
  costRadarData: Array<{ subject: string; value: number; avg: number }>;
  costEfficiencyData: CostEfficiency[];
}

export function CostTab({ hasTeamContribution, selected, selectedCostData, costRadarData, costEfficiencyData }: CostTabProps) {
  if (!hasTeamContribution) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          팀기여도 데이터가 업로드되지 않아 비용 효율 분석을 수행할 수 없습니다. 팀기여도 엑셀 파일을 업로드해 주세요.
        </p>
      </div>
    );
  }

  return (
    <>
      {selectedCostData && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="공헌이익율"
            value={selectedCostData.contributionMarginRate}
            format="percent"
            formula="공헌이익율 = (매출액 - 변동비) ÷ 매출액 × 100"
            description="변동비(원재료비, 외주비, 상품매입비 등)를 차감한 후 고정비 회수와 이익에 기여하는 비율입니다."
            benchmark="30% 이상 우수, 20~30% 보통, 20% 미만 개선 필요"
          />
          <KpiCard
            title="영업이익율"
            value={selectedCostData.operatingMarginRate}
            format="percent"
            formula="영업이익율 = (매출액 - 매출원가 - 판관비) ÷ 매출액 × 100"
            description="모든 영업 비용을 차감한 순수 영업 수익성입니다. 담당자의 실질 이익 창출 능력을 나타냅니다."
            benchmark="10% 이상 양호, 5~10% 보통, 5% 미만 비용 구조 점검 필요"
          />
          <KpiCard
            title="제조변동비율"
            value={selectedCostData.mfgVariableCostRate}
            format="percent"
            formula="제조변동비율 = 제조변동비 ÷ 매출액 × 100"
            description="매출 대비 제조변동비(원재료, 외주 등) 비중입니다. 높을수록 매출 원가 부담이 크다는 의미입니다."
            benchmark="조직 평균 대비 5%p 이상 높으면 원가 절감 검토 필요"
          />
          <KpiCard
            title="판관고정비율"
            value={selectedCostData.fixedCostRate}
            format="percent"
            formula="판관고정비율 = 판관고정비 ÷ 매출액 × 100"
            description="매출 대비 고정비(감가상각비, 경비, 노무비) 비중입니다. 1인당 급여 수준이 업계 대비 높으면 비용 효율이 낮고, 너무 낮으면 인재 유출 위험이 있습니다."
            benchmark="1인당 급여가 업계 중위수 대비 ±10% 이내이면 적정"
          />
        </div>
      )}

      {costRadarData.length > 0 && (
        <ChartCard
          title="비용 구조 레이더 (개인 vs 조직 평균)"
          formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
          description="개인의 비용 구조를 소속 조직의 평균값과 비교한 레이더 차트입니다. 파란색 영역(개인)이 점선(조직 평균)보다 안쪽이면 비용 관리가 효율적이라는 뜻이고, 바깥이면 해당 비용 항목의 개선이 필요합니다."
          benchmark="개인의 비용 비율이 조직 평균보다 5%p 이상 높으면 비용 절감 검토가 필요합니다"
        >
          <ChartContainer height="h-72 md:h-96">
              <RadarChart data={costRadarData}>
                <PolarGrid className="stroke-muted" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} />
                <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[3]} fill={CHART_COLORS[3]} fillOpacity={0.1} strokeDasharray="5 5" />
                <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Legend />
              </RadarChart>
          </ChartContainer>
        </ChartCard>
      )}

      <ChartCard
        title="담당자별 비용 효율 비교"
        formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
        description="각 담당자의 주요 비용 항목 비율을 테이블로 비교합니다. 공헌이익율이 높고 비용 비율이 낮을수록 효율적인 영업을 하고 있다는 의미입니다."
        benchmark="공헌이익율 20% 이상이면 양호, 원재료비율이 50% 이상이면 원가 구조 점검 필요"
        action={<ExportButton data={costEfficiencyData.map((c) => ({
          사번: c.personId, 조직: c.org, 매출액: c.salesAmount,
          원재료비율: c.rawMaterialRate, 상품매입비율: c.purchaseRate, 외주비율: c.outsourcingRate,
          판관변동비율: c.variableCostRate, 제조변동비율: c.mfgVariableCostRate, 판관고정비율: c.fixedCostRate,
          공헌이익율: c.contributionMarginRate, 영업이익율: c.operatingMarginRate,
        }))} fileName="비용효율분석" />}
      >
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="p-2 font-medium">사번</th>
                <th className="p-2 font-medium">조직</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">원재료비</th>
                <th className="p-2 font-medium text-right">외주비</th>
                <th className="p-2 font-medium text-right">판관변동</th>
                <th className="p-2 font-medium text-right">판관고정</th>
                <th className="p-2 font-medium text-right">공헌이익율</th>
                <th className="p-2 font-medium text-right">영업이익율</th>
              </tr>
            </thead>
            <tbody>
              {costEfficiencyData.slice(0, 30).map((c, i) => (
                <tr key={i} className={`border-b hover:bg-muted/50 ${c.personId === selected?.id ? "bg-primary/5" : ""}`}>
                  <td className="p-2 font-mono text-xs">{c.personId}</td>
                  <td className="p-2 text-xs">{c.org}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(c.salesAmount, true)}</td>
                  <td className="p-2 text-right text-xs">{c.rawMaterialRate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-xs">{c.outsourcingRate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-xs">{c.variableCostRate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-xs">{c.fixedCostRate.toFixed(1)}%</td>
                  <td className={`p-2 text-right text-xs font-medium ${c.contributionMarginRate >= 30 ? "text-emerald-600 dark:text-emerald-400" : c.contributionMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{c.contributionMarginRate.toFixed(1)}%</td>
                  <td className={`p-2 text-right text-xs font-medium ${c.operatingMarginRate >= 10 ? "text-emerald-600 dark:text-emerald-400" : c.operatingMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{c.operatingMarginRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
