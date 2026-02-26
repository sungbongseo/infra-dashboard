"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, PieChart, Pie,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG, PieOuterLabel } from "@/components/charts";
import { Package, TrendingUp, Percent, Target } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  ItemCostSummary,
  ProductContribution,
  TeamCostEfficiency,
  WaterfallItem,
  CostBucketItem,
} from "@/lib/analysis/itemCostAnalysis";

interface ItemCostTabProps {
  summary: ItemCostSummary;
  ranking: ProductContribution[];
  teamEfficiency: TeamCostEfficiency[];
  waterfall: WaterfallItem[];
  bucketBreakdown: CostBucketItem[];
}

const BUCKET_COLORS: Record<string, string> = {
  재료비: CHART_COLORS[0],
  상품매입비: CHART_COLORS[1],
  인건비: CHART_COLORS[2],
  설비비: CHART_COLORS[3],
  외주비: CHART_COLORS[4],
  물류비: CHART_COLORS[5],
  일반경비: CHART_COLORS[6],
};

export function ItemCostTab({ summary, ranking, teamEfficiency, waterfall, bucketBreakdown }: ItemCostTabProps) {
  // Top 15 contribution chart data
  const top15 = useMemo(() => ranking.slice(0, 15), [ranking]);

  // Team stacked bar: 100% stacked
  const teamStackedData = useMemo(() =>
    teamEfficiency.map((t) => ({
      name: t.team.length > 10 ? t.team.substring(0, 10) + ".." : t.team,
      fullName: t.team,
      재료비: t.materialRatio,
      상품매입비: t.purchaseRatio,
      인건비: t.laborRatio,
      설비비: t.facilityRatio,
      외주비: t.outsourceRatio,
      물류비: t.logisticsRatio,
      일반경비: t.generalRatio,
    })),
    [teamEfficiency]
  );

  // Table columns
  const tableColumns: ColumnDef<ProductContribution, any>[] = useMemo(
    () => [
      { accessorKey: "rank", header: "#", size: 40 },
      { accessorKey: "product", header: "품목", size: 160,
        cell: ({ getValue }: any) => {
          const v = getValue() as string;
          return v.length > 20 ? v.substring(0, 20) + "..." : v;
        },
      },
      { accessorKey: "org", header: "팀", size: 100 },
      { accessorKey: "sales", header: "매출액",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "variableCost", header: "변동비",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "grossProfit", header: "매출총이익",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "grossMargin", header: "매출총이익율",
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          return <span className={v >= 20 ? "text-green-600" : v >= 10 ? "text-amber-600" : "text-red-600"}>{formatPercent(v)}</span>;
        },
      },
      { accessorKey: "contributionMargin", header: "공헌이익",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "contributionRate", header: "공헌이익율",
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          return <span className={v >= 30 ? "text-green-600" : v >= 15 ? "text-amber-600" : "text-red-600"}>{formatPercent(v)}</span>;
        },
      },
      { accessorKey: "grade", header: "ABC",
        cell: ({ getValue }: any) => {
          const g = getValue() as string;
          const color = g === "A" ? "text-green-600 font-bold" : g === "B" ? "text-amber-600" : "text-muted-foreground";
          return <span className={color}>{g}</span>;
        },
      },
    ],
    []
  );

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="분석 품목 수"
          value={summary.productCount}
          format="number"
          icon={<Package className="h-5 w-5" />}
          formula="501 품목별매출원가 데이터에서 Infra사업본부(설계영업팀 제외) 소속 고유 품목 수"
          benchmark="품목 다양성이 높을수록 포트폴리오 리스크 분산"
        />
        <KpiCard
          title="평균 매출총이익율"
          value={summary.avgGrossMargin}
          format="percent"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="가중평균 매출총이익율 = Sigma 매출총이익.실적 / Sigma 매출액.실적 x 100"
          benchmark="제조업 평균 20~30%, 30% 이상이면 양호"
        />
        <KpiCard
          title="평균 공헌이익율"
          value={summary.avgContributionRate}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          formula="공헌이익율 = (매출액 - 변동비) / 매출액 x 100. 변동비 = 14개 변동원가항목 합계"
          benchmark="50% 이상이면 고정비 커버 충분, 30% 미만이면 손익분기 위험"
        />
        <KpiCard
          title="최대 원가 항목"
          value={summary.topCostRatio}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          description={`${summary.topCostCategory} (${formatCurrency(summary.topCostAmount)})`}
          formula="18개 원가항목 중 실적 합계가 가장 큰 항목과 전체 원가 대비 비중"
          benchmark="원재료비 50% 이상 = 자체생산형, 상품매입 50% 이상 = 구매직납형"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Waterfall */}
        <ChartCard title="공헌이익 워터폴" description="매출액 → 변동비 → 공헌이익 → 고정비 → 매출총이익">
          <ChartContainer minHeight={320}>
            <BarChart data={waterfall} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) =>
                  name === "base" ? null : [formatCurrency(Number(v)), "금액"]
                }
              />
              <Bar dataKey="base" stackId="a" fill="transparent" {...ANIMATION_CONFIG} />
              <Bar dataKey="value" stackId="a" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {waterfall.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Pie - Cost Bucket */}
        <ChartCard title="원가 구성 비중" description="7대 원가 그룹별 비중 (COST_BUCKETS)">
          <ChartContainer minHeight={320}>
            <PieChart>
              <Pie
                data={bucketBreakdown.filter((b) => b.amount > 0)}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={110}
                label={(props: any) => PieOuterLabel(props)}
                labelLine={false}
                {...ANIMATION_CONFIG}
              >
                {bucketBreakdown.filter((b) => b.amount > 0).map((entry, idx) => (
                  <Cell key={idx} fill={BUCKET_COLORS[entry.name] || CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
              />
            </PieChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 15 Contribution */}
        <ChartCard title="품목별 공헌이익 Top 15" description="공헌이익 기준 상위 15개 품목">
          <ChartContainer minHeight={400}>
            <BarChart
              data={top15}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <YAxis
                type="category"
                dataKey="product"
                width={120}
                tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => v.length > 15 ? v.substring(0, 15) + ".." : v}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
              />
              <Bar dataKey="contributionMargin" name="공헌이익" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
                {top15.map((entry, idx) => (
                  <Cell key={idx} fill={entry.contributionMargin >= 0 ? "hsl(145, 60%, 42%)" : "hsl(0, 65%, 55%)"} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* Team Cost Structure Stacked */}
        <ChartCard title="팀별 원가 구성" description="팀별 7대 원가 그룹 비율 (100% Stacked)">
          <ChartContainer minHeight={400}>
            <BarChart data={teamStackedData} margin={{ top: 5, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
              />
              {(["재료비", "상품매입비", "인건비", "설비비", "외주비", "물류비", "일반경비"] as const).map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="a"
                  fill={BUCKET_COLORS[key] || CHART_COLORS[idx]}
                  {...ANIMATION_CONFIG}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Table */}
      <ChartCard title="품목별 원가 상세" description="품목별 매출, 원가, 이익 상세 (ABC 등급 포함)">
        <DataTable
          data={ranking}
          columns={tableColumns}
          searchPlaceholder="품목 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
