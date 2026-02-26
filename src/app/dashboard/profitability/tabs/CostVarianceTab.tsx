"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, ReferenceLine, Legend,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG } from "@/components/charts";
import { AlertTriangle, Target, TrendingDown, BarChart3 } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { CostVarianceSummary, TeamCostEfficiency } from "@/lib/analysis/itemCostAnalysis";
import type { ItemVarianceEntry, CostDriverEntry } from "@/types";

interface CostVarianceTabProps {
  variance: CostVarianceSummary;
  teamEfficiency: TeamCostEfficiency[];
  itemVarianceRanking: ItemVarianceEntry[];
  costDrivers: CostDriverEntry[];
}

export function CostVarianceTab({ variance, teamEfficiency, itemVarianceRanking, costDrivers }: CostVarianceTabProps) {
  // Chart 1: All categories plan vs actual (소계 표시 포함)
  const planVsActualData = useMemo(() =>
    variance.categories.map((c) => ({
      name: c.category.length > 6 ? c.category.substring(0, 6) + ".." : c.category,
      fullName: c.category,
      계획: c.plan,
      실적: c.actual,
      isSubtotal: c.isSubtotal,
    })),
    [variance.categories]
  );

  // Chart 2: Top 10 variance (by |variance|, already sorted)
  const top10Variance = useMemo(() =>
    variance.categories
      .filter((c) => !c.isSubtotal)
      .slice(0, 10)
      .map((c) => ({
        name: c.category,
        차이: c.variance,
        isOver: c.isOverBudget,
      })),
    [variance.categories]
  );

  // Chart 3: Team comparison
  const teamCompareData = useMemo(() =>
    teamEfficiency.map((t) => ({
      name: t.team.length > 8 ? t.team.substring(0, 8) + ".." : t.team,
      fullName: t.team,
      원가율: t.costRate,
      매출총이익율: t.grossMargin,
    })),
    [teamEfficiency]
  );

  // NEW: 품목별 원가 차이 Top 15
  const itemVarianceChartData = useMemo(() =>
    itemVarianceRanking.map((e) => ({
      name: e.product.length > 15 ? e.product.substring(0, 15) + ".." : e.product,
      fullName: `${e.product} (${e.org})`,
      차이: e.variance,
      isOver: e.variance > 0,
    })),
    [itemVarianceRanking]
  );

  // NEW: 원가 드라이버 버블 차트
  const driverBubbleData = useMemo(() =>
    costDrivers
      .filter((d) => d.impactScore > 0)
      .slice(0, 12)
      .map((d) => ({
        name: d.category,
        x: d.costShare,
        y: d.variancePct,
        z: Math.max(d.impactScore, 1),
        direction: d.direction,
      })),
    [costDrivers]
  );

  // KPI: worst variance item
  const worstItem = useMemo(() => {
    const overBudget = variance.categories.filter((c) => c.isOverBudget && !c.isSubtotal);
    if (overBudget.length === 0) return { name: "-", amount: 0 };
    const worst = overBudget[0]; // already sorted by |variance|
    return { name: worst.category, amount: worst.variance };
  }, [variance.categories]);

  // BUG-3 FIX: 원가 효율 (계획/실적 × 100)
  const costEfficiencyRate = variance.totalActualCost !== 0
    ? (variance.totalPlanCost / variance.totalActualCost) * 100
    : 0;

  // Table columns for variance detail
  const varColumns: ColumnDef<typeof variance.categories[0], any>[] = useMemo(
    () => [
      {
        accessorKey: "category", header: () => <span title="17개 독립 원가 항목 + 2개 소계. 회색 배경이 소계 행입니다">원가항목</span>, size: 120,
        cell: ({ row }: any) => {
          const v = row.original;
          return (
            <span className={v.isSubtotal ? "font-semibold text-muted-foreground bg-muted/50 px-1 rounded" : ""}>
              {v.category}
            </span>
          );
        },
      },
      { accessorKey: "plan", header: () => <span title="해당 원가 항목의 예산(계획) 금액">계획</span>,
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "actual", header: () => <span title="해당 원가 항목의 실제 발생 금액">실적</span>,
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "variance", header: () => <span title="실적 - 계획. 양수(빨강)=예산 초과, 음수(초록)=절감">차이</span>,
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          const color = v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "";
          return <span className={color}>{formatCurrency(v)}</span>;
        },
      },
      { accessorKey: "variancePct", header: () => <span title="차이 / |계획| × 100. 계획 대비 몇 % 초과/절감했는지를 나타냅니다">차이율(%)</span>,
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          const color = v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "";
          return <span className={color}>{isFinite(v) ? `${v.toFixed(1)}%` : "-"}</span>;
        },
      },
      {
        id: "costShare",
        header: () => <span title="해당 항목 실적 / 전체 실적 원가 × 100. 전체 원가에서 이 항목이 차지하는 비율">원가비중(%)</span>,
        accessorFn: (row: any) => {
          const total = variance.totalActualCost;
          return total > 0 ? (row.actual / total) * 100 : 0;
        },
        cell: ({ getValue }: any) => `${(getValue() as number).toFixed(1)}%`,
      },
      {
        accessorKey: "contributionToTotal", header: () => <span title="해당 항목의 차이 / 전체 차이 × 100. 이 항목이 전체 원가 변동에 얼마나 영향을 주었는지를 보여줍니다">차이 기여도(%)</span>,
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          return isFinite(v) ? `${v.toFixed(1)}%` : "-";
        },
      },
    ],
    [variance.totalActualCost]
  );

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 원가 차이"
          value={variance.totalVariance}
          format="currency"
          icon={<TrendingDown className="h-5 w-5" />}
          description="전체 원가의 실적과 계획의 차이입니다. 양수면 예산을 초과한 것이고, 음수면 원가를 절감한 것입니다"
          formula="17개 독립항목 실적합계 - 계획합계 (소계 제외하여 이중카운팅 방지)"
          benchmark="양수 = 예산 초과(원가 상승), 음수 = 원가 절감. 계획 대비 ±5% 이내가 정상 범위"
        />
        <KpiCard
          title="원가 효율"
          value={costEfficiencyRate}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          description="계획 대비 실제 원가를 얼마나 효율적으로 사용했는지를 보여줍니다. 100%보다 높으면 계획보다 원가를 절감한 것입니다"
          formula="원가 효율 = 계획 원가 / 실적 원가 × 100"
          benchmark="100% 이상 = 원가 절감 달성, 95~100% 양호, 95% 미만 = 원가 관리 개선 필요"
        />
        <KpiCard
          title="예산 초과 항목 수"
          value={variance.overBudgetCount}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          description={`17개 원가 항목 중 ${variance.overBudgetCount}개가 계획보다 실적이 초과했습니다`}
          formula="17개 독립 원가 항목 중 실적 > 계획인 항목 수"
          benchmark="절반(9개) 이상이면 전반적 원가 관리 체계 점검 필요. 적을수록 원가 통제가 잘 되고 있다는 의미"
        />
        <KpiCard
          title="최대 초과 금액"
          value={worstItem.amount}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          description={`가장 크게 예산을 초과한 항목: ${worstItem.name}. 이 항목의 원가 상승 원인을 우선 분석해야 합니다`}
          formula="계획 대비 실적이 가장 크게 초과한 원가 항목의 차이 금액"
          benchmark="전체 원가의 5% 이상이면 긴급 원인 분석 필요"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-4">
        {/* Chart 1: Plan vs Actual by category */}
        <ChartCard title="원가 항목별 계획 vs 실적" description="각 원가 항목의 계획 금액(파랑)과 실적 금액(주황)을 비교합니다. 실적이 계획보다 높으면 예산 초과입니다. 소계 2개(제조변동비/제조고정비)는 참고용입니다">
          <ChartContainer minHeight={360}>
            <BarChart data={planVsActualData} margin={{ top: 10, right: 20, left: 20, bottom: 60 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(label: any, payload: any) => {
                  const item = payload?.[0]?.payload;
                  return `${item?.fullName || label}${item?.isSubtotal ? " (소계)" : ""}`;
                }}
                formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
              />
              <Legend verticalAlign="top" height={30} />
              <Bar dataKey="계획" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
              <Bar dataKey="실적" fill={CHART_COLORS[3]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 2: Top 10 Variance Horizontal */}
        <ChartCard title="원가 차이 Top 10 (항목별)" description="계획 대비 차이가 가장 큰 10개 원가 항목입니다. 빨간색=예산 초과(원가 상승), 초록색=예산 절감. 차이 절대값이 큰 순서로 정렬됩니다">
          <ChartContainer minHeight={360}>
            <BarChart
              data={top10Variance}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, _name: any) => [formatCurrency(Number(v)), "차이"]}
              />
              <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
              <Bar dataKey="차이" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
                {top10Variance.map((entry, idx) => (
                  <Cell key={idx} fill={entry.isOver ? "hsl(0, 65%, 55%)" : "hsl(145, 60%, 42%)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* NEW: 품목별 원가 차이 Top 15 */}
        {itemVarianceChartData.length > 0 && (
          <ChartCard title="품목별 원가 차이 Top 15" description="개별 품목 단위로 원가 차이가 큰 15개입니다. 빨간색 = 해당 품목의 원가가 계획보다 높음, 초록색 = 원가 절감됨. 금액이 클수록 경영 영향이 큽니다">
            <ChartContainer minHeight={360}>
              <BarChart
                data={itemVarianceChartData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.fullName || ""}
                  formatter={(v: any, _name: any) => [formatCurrency(Number(v)), "원가 차이"]}
                />
                <ReferenceLine x={0} stroke="hsl(var(--foreground))" strokeWidth={1} />
                <Bar dataKey="차이" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
                  {itemVarianceChartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.isOver ? "hsl(0, 65%, 55%)" : "hsl(145, 60%, 42%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartCard>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* NEW: 원가 드라이버 버블 차트 */}
        {driverBubbleData.length > 0 && (
          <ChartCard title="원가 드라이버 분석" description="버블 위치와 크기로 원가 관리 우선순위를 파악합니다. X축=해당 항목이 전체 원가에서 차지하는 비중, Y축=계획 대비 변동률(위=초과, 아래=절감), 버블 크기=비중과 변동률의 복합 영향도. 오른쪽 위의 큰 버블이 가장 시급한 관리 대상입니다">
            <ChartContainer minHeight={380}>
              <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="원가비중"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
                  label={{ value: "원가비중(%)", position: "insideBottom", offset: -5, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="차이율"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
                  label={{ value: "차이율(%)", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <ZAxis type="number" dataKey="z" range={[80, 800]} name="임팩트" />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-2 text-xs shadow-md">
                        <p className="font-semibold">{d.name}</p>
                        <p>원가비중: {d.x.toFixed(1)}%</p>
                        <p className={d.y > 0 ? "text-red-600" : "text-green-600"}>
                          차이율: {d.y > 0 ? "+" : ""}{d.y.toFixed(1)}%
                        </p>
                        <p>임팩트: {d.z.toFixed(2)}</p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Scatter data={driverBubbleData} {...ANIMATION_CONFIG}>
                  {driverBubbleData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.direction === "increase" ? "hsl(0, 65%, 55%)" : entry.direction === "decrease" ? "hsl(145, 60%, 42%)" : CHART_COLORS[5]}
                      fillOpacity={0.7}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ChartContainer>
          </ChartCard>
        )}

        {/* Chart 3: Team Cost Rate vs GP Rate */}
        <ChartCard title="팀별 원가율 비교" description="각 팀의 원가율(매출원가/매출액)과 매출총이익율을 비교합니다. 원가율이 낮고 이익율이 높은 팀이 효율적입니다. 점선(25%)은 업계 평균 기준입니다">
          <ChartContainer minHeight={380}>
            <BarChart data={teamCompareData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={45} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
                formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
              />
              <Legend verticalAlign="top" height={30} />
              <ReferenceLine y={25} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "업계평균 25%", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Bar dataKey="원가율" fill={CHART_COLORS[3]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
              <Bar dataKey="매출총이익율" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <ChartCard title="원가 항목별 상세 차이" description="17개 독립 원가 항목과 2개 소계(회색 배경)의 계획/실적/차이 상세입니다. 빨간색=초과, 초록색=절감. 차이 기여도는 각 항목이 전체 차이에 얼마나 영향을 주었는지를 보여줍니다">
        <DataTable
          data={variance.categories}
          columns={varColumns}
          searchPlaceholder="원가 항목 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
