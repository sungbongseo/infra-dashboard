import { useState, useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { SalesRepProfile, CostEfficiency } from "@/lib/analysis/profiling";

const safe = (v: number, d = 1) => isFinite(v) ? v.toFixed(d) : "0";

type SortKey = "salesAmount" | "rawMaterialRate" | "outsourcingRate" | "variableCostRate" | "fixedCostRate" | "contributionMarginRate" | "operatingMarginRate";
type SortDir = "asc" | "desc";

interface CostTabProps {
  hasTeamContribution: boolean;
  selected: SalesRepProfile | undefined;
  selectedCostData: CostEfficiency | undefined;
  costRadarData: Array<{ subject: string; value: number; avg: number }>;
  costEfficiencyData: CostEfficiency[];
  orgAverage?: { salesAmount: number; rawMaterialRate: number; outsourcingRate: number; variableCostRate: number; fixedCostRate: number; contributionMarginRate: number; operatingMarginRate: number } | null;
  isDateFiltered?: boolean;
}

export function CostTab({ hasTeamContribution, selected, selectedCostData, costRadarData, costEfficiencyData, orgAverage, isDateFiltered }: CostTabProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => prev === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedData = useMemo(() => {
    const data = costEfficiencyData.slice(0, 30);
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [costEfficiencyData, sortKey, sortDir]);

  const SortIcon = ({ field }: { field: SortKey }) => {
    if (sortKey !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />;
  };

  const costInsights = useMemo(() => {
    if (!selectedCostData || !orgAverage) return [];
    const items = [
      { name: "원재료비율", person: selectedCostData.rawMaterialRate, org: orgAverage.rawMaterialRate },
      { name: "외주가공비율", person: selectedCostData.outsourcingRate, org: orgAverage.outsourcingRate },
      { name: "판관변동비율", person: selectedCostData.variableCostRate, org: orgAverage.variableCostRate },
      { name: "판관고정비율", person: selectedCostData.fixedCostRate, org: orgAverage.fixedCostRate },
    ];
    return items
      .map(i => ({ ...i, diff: i.person - i.org }))
      .filter(i => Math.abs(i.diff) > 2)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [selectedCostData, orgAverage]);

  if (!hasTeamContribution) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">데이터가 없습니다</p>
        <p className="text-sm mt-1">영업사원을 선택해 주세요</p>
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
            reason="영업사원별 공헌이익율로 고정비 회수 능력을 평가하고, 수익성 개선이 필요한 담당자를 식별합니다."
          />
          <KpiCard
            title="영업이익율"
            value={selectedCostData.operatingMarginRate}
            format="percent"
            formula="영업이익율 = (매출액 - 매출원가 - 판관비) ÷ 매출액 × 100"
            description="모든 영업 비용을 차감한 순수 영업 수익성입니다. 담당자의 실질 이익 창출 능력을 나타냅니다."
            benchmark="10% 이상 양호, 5~10% 보통, 5% 미만 비용 구조 점검 필요"
            reason="담당자별 실질 수익 창출 능력을 측정하여, 매출은 높으나 이익이 낮은 담당자의 비용 구조를 점검합니다."
          />
          <KpiCard
            title="제조변동비율"
            value={selectedCostData.mfgVariableCostRate}
            format="percent"
            formula="제조변동비율 = 제조변동비 ÷ 매출액 × 100"
            description="매출 대비 제조변동비(원재료, 외주 등) 비중입니다. 높을수록 매출 원가 부담이 크다는 의미입니다."
            benchmark="조직 평균 대비 5%p 이상 높으면 원가 절감 검토 필요"
            reason="제조변동비 비율로 원가 부담 수준을 파악하여, 원가 절감 또는 가격 전략 조정의 근거를 확보합니다."
          />
          <KpiCard
            title="판관고정비율"
            value={selectedCostData.fixedCostRate}
            format="percent"
            formula="판관고정비율 = 판관고정비 ÷ 매출액 × 100"
            description="매출 대비 고정비(감가상각비, 경비, 노무비) 비중입니다. 1인당 급여 수준이 업계 대비 높으면 비용 효율이 낮고, 너무 낮으면 인재 유출 위험이 있습니다."
            benchmark="1인당 급여가 업계 중위수 대비 ±10% 이내이면 적정"
            reason="고정비 비율로 매출 규모 대비 인건비·경비 부담을 평가하여, 인력 구조 최적화 방향을 도출합니다."
          />
        </div>
      )}

      {/* 2-3: 조직 평균 대비 비용 비교 인사이트 */}
      {costInsights.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">비용 구조 비교 (조직 평균 대비)</h4>
          <div className="space-y-1.5">
            {costInsights.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={`inline-block w-2 h-2 rounded-full ${item.diff > 0 ? "bg-red-500" : "bg-emerald-500"}`} />
                <span className="text-blue-800 dark:text-blue-200">
                  {item.name}: {safe(item.person)}%
                  <span className={`ml-1 font-medium ${item.diff > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                    ({item.diff > 0 ? "+" : ""}{safe(item.diff)}%p {item.diff > 0 ? "높음" : "낮음"})
                  </span>
                </span>
              </div>
            ))}
            {costInsights.some(i => i.diff > 5) && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 font-medium">
                조직 평균 대비 5%p 이상 높은 항목은 비용 절감 검토가 필요합니다.
              </p>
            )}
          </div>
        </div>
      )}

      {costRadarData.length > 0 && (
        <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
          title="비용 구조 레이더 (개인 vs 조직 평균)"
          formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
          description="개인의 비용 구조를 소속 조직의 평균값과 비교한 레이더 차트입니다. 파란색 영역(개인)이 점선(조직 평균)보다 안쪽이면 비용 관리가 효율적이라는 뜻이고, 바깥이면 해당 비용 항목의 개선이 필요합니다."
          benchmark="개인의 비용 비율이 조직 평균보다 5%p 이상 높으면 비용 절감 검토가 필요합니다"
          reason="영업사원별 비용 대비 수익 효율을 분석하여 영업비용 최적화 방향을 도출합니다."
        >
          <ChartContainer height="h-72 md:h-96">
              <RadarChart data={costRadarData}>
                <PolarGrid className="stroke-muted" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fontSize: 10 }} />
                <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[3]} fill={CHART_COLORS[3]} fillOpacity={0.1} strokeDasharray="5 5" />
                <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${safeFixed(Number(v), 1)}%`} />
                <Legend />
              </RadarChart>
          </ChartContainer>
        </ChartCard>
      )}

      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="담당자별 비용 효율 비교"
        formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
        description="각 담당자의 주요 비용 항목 비율을 테이블로 비교합니다. 공헌이익율이 높고 비용 비율이 낮을수록 효율적인 영업을 하고 있다는 의미입니다."
        benchmark="공헌이익율 20% 이상이면 양호, 원재료비율이 50% 이상이면 원가 구조 점검 필요"
        reason="담당자 간 비용 구조를 비교하여 Best Practice를 도출하고, 비용 비효율 담당자의 개선 방향을 제시합니다."
        action={<ExportButton data={costEfficiencyData.map((c) => ({
          사번: c.personId, 조직: c.org, 매출액: c.salesAmount,
          원재료비율: c.rawMaterialRate, 상품매입비율: c.purchaseRate, 외주비율: c.outsourcingRate,
          판관변동비율: c.variableCostRate, 제조변동비율: c.mfgVariableCostRate, 판관고정비율: c.fixedCostRate,
          공헌이익율: c.contributionMarginRate, 영업이익율: c.operatingMarginRate,
        }))} fileName="비용효율분석" />}
      >
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b text-left">
                <th className="p-2 font-medium">사번</th>
                <th className="p-2 font-medium">조직</th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("salesAmount")}>
                  <span className="inline-flex items-center gap-1">매출액 <SortIcon field="salesAmount" /></span>
                </th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("rawMaterialRate")}>
                  <span className="inline-flex items-center gap-1">원재료비 <SortIcon field="rawMaterialRate" /></span>
                </th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("outsourcingRate")}>
                  <span className="inline-flex items-center gap-1">외주비 <SortIcon field="outsourcingRate" /></span>
                </th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("variableCostRate")}>
                  <span className="inline-flex items-center gap-1">판관변동 <SortIcon field="variableCostRate" /></span>
                </th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("fixedCostRate")}>
                  <span className="inline-flex items-center gap-1">판관고정 <SortIcon field="fixedCostRate" /></span>
                </th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("contributionMarginRate")}>
                  <span className="inline-flex items-center gap-1">공헌이익율 <SortIcon field="contributionMarginRate" /></span>
                </th>
                <th className="p-2 font-medium text-right cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("operatingMarginRate")}>
                  <span className="inline-flex items-center gap-1">영업이익율 <SortIcon field="operatingMarginRate" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orgAverage && (
                <tr className="border-b bg-muted/60 font-medium sticky top-[37px] z-[5]">
                  <td className="p-2 text-xs" colSpan={2}>조직 평균</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(orgAverage.salesAmount, true)}</td>
                  <td className="p-2 text-right text-xs">{safe(orgAverage.rawMaterialRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(orgAverage.outsourcingRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(orgAverage.variableCostRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(orgAverage.fixedCostRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(orgAverage.contributionMarginRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(orgAverage.operatingMarginRate)}%</td>
                </tr>
              )}
              {sortedData.map((c, i) => (
                <tr key={i} className={`border-b hover:bg-muted/50 ${c.personId === selected?.id ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}>
                  <td className="p-2 font-mono text-xs">{c.personId}</td>
                  <td className="p-2 text-xs">{c.org}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(c.salesAmount, true)}</td>
                  <td className="p-2 text-right text-xs">{safe(c.rawMaterialRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(c.outsourcingRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(c.variableCostRate)}%</td>
                  <td className="p-2 text-right text-xs">{safe(c.fixedCostRate)}%</td>
                  <td className={`p-2 text-right text-xs font-medium ${c.contributionMarginRate >= 30 ? "text-emerald-600 dark:text-emerald-400" : c.contributionMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{safe(c.contributionMarginRate)}%</td>
                  <td className={`p-2 text-right text-xs font-medium ${
                    c.operatingMarginRate >= 10 ? "text-emerald-600 dark:text-emerald-400"
                    : c.operatingMarginRate >= 0 ? "text-amber-600 dark:text-amber-400"
                    : c.operatingMarginRate <= -10 ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                    : "text-red-600 dark:text-red-400"
                  }`}>{safe(c.operatingMarginRate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
