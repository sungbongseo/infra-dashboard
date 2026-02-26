"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, ReferenceLine, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG } from "@/components/charts";
import { AlertTriangle, Target, TrendingDown, BarChart3 } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { CostVarianceSummary, TeamCostEfficiency } from "@/lib/analysis/itemCostAnalysis";

interface CostVarianceTabProps {
  variance: CostVarianceSummary;
  teamEfficiency: TeamCostEfficiency[];
}

export function CostVarianceTab({ variance, teamEfficiency }: CostVarianceTabProps) {
  // Chart 1: All 18 categories plan vs actual
  const planVsActualData = useMemo(() =>
    variance.categories.map((c) => ({
      name: c.category.length > 6 ? c.category.substring(0, 6) + ".." : c.category,
      fullName: c.category,
      계획: c.plan,
      실적: c.actual,
    })),
    [variance.categories]
  );

  // Chart 2: Top 10 variance (by |variance|, already sorted)
  const top10Variance = useMemo(() =>
    variance.categories
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

  // KPI: worst variance item
  const worstItem = useMemo(() => {
    const overBudget = variance.categories.filter((c) => c.isOverBudget);
    if (overBudget.length === 0) return { name: "-", amount: 0 };
    const worst = overBudget[0]; // already sorted by |variance|
    return { name: worst.category, amount: worst.variance };
  }, [variance.categories]);

  const achievementRate = variance.totalActualCost !== 0
    ? (variance.totalPlanCost / variance.totalActualCost) * 100
    : 0;

  // Table columns for variance detail
  const varColumns: ColumnDef<typeof variance.categories[0], any>[] = useMemo(
    () => [
      { accessorKey: "category", header: "원가항목", size: 120 },
      { accessorKey: "plan", header: "계획",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "actual", header: "실적",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "variance", header: "차이",
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          const color = v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "";
          return <span className={color}>{formatCurrency(v)}</span>;
        },
      },
      { accessorKey: "variancePct", header: "차이율(%)",
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          const color = v > 0 ? "text-red-600" : v < 0 ? "text-green-600" : "";
          return <span className={color}>{isFinite(v) ? `${v.toFixed(1)}%` : "-"}</span>;
        },
      },
      {
        id: "costShare",
        header: "원가비중(%)",
        accessorFn: (row: any) => {
          const total = variance.totalActualCost;
          return total > 0 ? (row.actual / total) * 100 : 0;
        },
        cell: ({ getValue }: any) => `${(getValue() as number).toFixed(1)}%`,
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
          formula="실적 매출원가 합계 - 계획 매출원가 합계"
          benchmark="양수 = 예산 초과(원가 상승), 음수 = 원가 절감"
        />
        <KpiCard
          title="원가 달성율"
          value={achievementRate}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="원가 달성율 = 계획 원가 / 실적 원가 x 100"
          benchmark="100% 이상 = 원가 절감, 95~100% 양호"
        />
        <KpiCard
          title="예산 초과 항목 수"
          value={variance.overBudgetCount}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          description={`18개 원가 항목 중 ${variance.overBudgetCount}개 초과`}
          formula="18개 원가 항목 중 실적 > 계획인 항목 수"
          benchmark="50% 이상이면 전반적 원가 관리 체계 점검 필요"
        />
        <KpiCard
          title="최대 초과 금액"
          value={worstItem.amount}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          description={worstItem.name}
          formula="계획 대비 실적이 가장 크게 초과한 원가 항목의 차이 금액"
          benchmark="전체 원가의 5% 이상이면 긴급 원인 분석 필요"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4">
        {/* Chart 1: Plan vs Actual by category */}
        <ChartCard title="원가 항목별 계획 vs 실적" description="18개 원가 항목의 계획 대비 실적 비교">
          <ChartContainer minHeight={360}>
            <BarChart data={planVsActualData} margin={{ top: 10, right: 20, left: 20, bottom: 60 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
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
        <ChartCard title="원가 차이 Top 10" description="|차이| 상위 10개 항목 (초과: 빨간색, 절감: 초록색)">
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

        {/* Chart 3: Team Cost Rate vs GP Rate */}
        <ChartCard title="팀별 원가율 비교" description="팀별 원가율과 매출총이익율 비교">
          <ChartContainer minHeight={360}>
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
      <ChartCard title="원가 항목별 상세 차이" description="18개 원가 항목의 계획/실적/차이 상세">
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
