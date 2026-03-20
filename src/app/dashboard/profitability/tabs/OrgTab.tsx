import { useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  ReferenceLine, ReferenceArea, LabelList,
} from "recharts";
import { ChartContainer, GRID_PROPS } from "@/components/charts";
import { formatCurrency, formatPercent, CHART_COLORS } from "@/lib/utils";

interface OrgTabProps {
  bubbleData: Array<{
    name: string;
    x: number;
    y: number;
    z: number;
    grossProfit: number;
  }>;
  isDateFiltered?: boolean;
}

type QuadrantType = "core" | "growth" | "efficiency" | "review";

const QUADRANT_CONFIG: Record<QuadrantType, { label: string; description: string; color: string }> = {
  core: { label: "핵심 조직", description: "자원 집중 투자 대상 — 고매출·고마진 유지 강화", color: "text-emerald-700 dark:text-emerald-400" },
  growth: { label: "성장 잠재", description: "마진 유지하면서 매출 확대 여지 — 영업력 강화 타겟", color: "text-blue-700 dark:text-blue-400" },
  efficiency: { label: "효율 개선", description: "원가 구조 개선 시급 — 수익성 진단 필요", color: "text-amber-700 dark:text-amber-400" },
  review: { label: "전략 재검토", description: "사업 모델 재정립 필요 — 구조 조정 또는 전환 검토", color: "text-red-700 dark:text-red-400" },
};

export function OrgTab({ bubbleData, isDateFiltered }: OrgTabProps) {
  // 사분면 분류 (Hook은 조건부 return 전에 호출)
  const quadrantAnalysis = useMemo(() => {
    if (bubbleData.length < 2) return null;
    const salesArr = bubbleData.map((d) => d.x).sort((a, b) => a - b);
    const marginArr = bubbleData.map((d) => d.y).sort((a, b) => a - b);
    const medianSales = salesArr[Math.floor(salesArr.length / 2)];
    const medianMargin = marginArr[Math.floor(marginArr.length / 2)];

    const groups: Record<QuadrantType, string[]> = { core: [], growth: [], efficiency: [], review: [] };
    for (const d of bubbleData) {
      if (d.x >= medianSales && d.y >= medianMargin) groups.core.push(d.name);
      else if (d.x < medianSales && d.y >= medianMargin) groups.growth.push(d.name);
      else if (d.x >= medianSales && d.y < medianMargin) groups.efficiency.push(d.name);
      else groups.review.push(d.name);
    }
    return { groups, medianSales, medianMargin };
  }, [bubbleData]);

  if (bubbleData.length === 0) return <EmptyState />;

  return (
    <ChartCard
      isEmpty={bubbleData.length === 0}
      title="조직별 수익성 Matrix"
      dataSourceType="snapshot"
      isDateFiltered={isDateFiltered}
      formula="가로축 = 매출액, 세로축 = 영업이익율, 버블 크기 = 매출총이익"
      description="각 조직의 매출 규모, 이익율, 총이익을 한 차트에서 3가지 차원으로 비교합니다. 오른쪽 위에 위치할수록 매출도 크고 이익율도 높은 핵심 조직입니다. 버블이 클수록 매출총이익이 큰 조직입니다."
      benchmark="오른쪽 위: 핵심 조직(고매출, 고수익) | 왼쪽 위: 틈새 조직(저매출, 고수익) | 오른쪽 아래: 개선 필요(고매출, 저수익)"
      reason="조직별 수익성 비교를 통해 고성과/저성과 조직을 식별하고, 자원 재배분과 베스트 프랙티스 공유의 근거를 마련합니다"
    >
      <ChartContainer height="h-72 md:h-96">
          <ScatterChart>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="x" name="매출액" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis
              dataKey="y"
              name="영업이익율"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[(min: number) => Math.floor(Math.min(min, 0) - 5), (max: number) => Math.ceil(max + 5)]}
            />
            <ZAxis dataKey="z" range={[50, 400]} />
            <RechartsTooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                    <p className="font-semibold mb-1">{d.name}</p>
                    <p>매출액: {formatCurrency(d.x)}</p>
                    <p>영업이익율: {formatPercent(d.y)}</p>
                    <p>매출총이익: {formatCurrency(d.grossProfit)}</p>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" strokeWidth={1} label={{ value: "손익분기", position: "left", fontSize: 10, fill: "hsl(0, 0%, 50%)" }} />
            {/* 사분면 배경 */}
            {quadrantAnalysis && (
              <>
                <ReferenceArea x1={quadrantAnalysis.medianSales} y1={quadrantAnalysis.medianMargin} fill="hsl(142, 76%, 36%)" fillOpacity={0.04} />
                <ReferenceArea x2={quadrantAnalysis.medianSales} y1={quadrantAnalysis.medianMargin} fill="hsl(221, 83%, 53%)" fillOpacity={0.04} />
                <ReferenceArea x1={quadrantAnalysis.medianSales} y2={quadrantAnalysis.medianMargin} fill="hsl(38, 92%, 50%)" fillOpacity={0.04} />
                <ReferenceArea x2={quadrantAnalysis.medianSales} y2={quadrantAnalysis.medianMargin} fill="hsl(0, 84%, 60%)" fillOpacity={0.04} />
                <ReferenceLine x={quadrantAnalysis.medianSales} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />
                <ReferenceLine y={quadrantAnalysis.medianMargin} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.4} />
              </>
            )}
            <Scatter data={bubbleData} fill={CHART_COLORS[0]}>
              {bubbleData.map((d, i) => (
                <Cell key={i} fill={d.grossProfit >= 0 ? CHART_COLORS[i % CHART_COLORS.length] : "#dc2626"} />
              ))}
              <LabelList dataKey="name" position="top" fontSize={10} offset={8} />
            </Scatter>
          </ScatterChart>
      </ChartContainer>

      {/* 사분면 해석 패널 */}
      {quadrantAnalysis && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {(Object.entries(quadrantAnalysis.groups) as [QuadrantType, string[]][]).map(([key, orgs]) => (
            <div key={key} className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <p className={`text-sm font-semibold ${QUADRANT_CONFIG[key].color}`}>
                {QUADRANT_CONFIG[key].label} ({orgs.length}개)
              </p>
              <p className="text-xs text-muted-foreground">{QUADRANT_CONFIG[key].description}</p>
              {orgs.length > 0 && (
                <p className="text-xs font-medium mt-1">{orgs.join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </ChartCard>
  );
}
