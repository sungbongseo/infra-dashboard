"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, PieChart, Pie,
  ComposedChart, Line, ReferenceLine,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, PieOuterLabel } from "@/components/charts";
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
import type { ItemCostProfile, CostProfileDistribution, UnitCostEntry } from "@/types";

interface ItemCostTabProps {
  summary: ItemCostSummary;
  ranking: ProductContribution[];
  teamEfficiency: TeamCostEfficiency[];
  waterfall: WaterfallItem[];
  bucketBreakdown: CostBucketItem[];
  costProfile: { items: ItemCostProfile[]; distribution: CostProfileDistribution[] };
  unitCost: UnitCostEntry[];
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

const PROFILE_COLORS: Record<string, string> = {
  자체생산형: "hsl(210, 70%, 50%)",
  구매직납형: "hsl(145, 60%, 42%)",
  외주의존형: "hsl(35, 70%, 50%)",
  인건비집중형: "hsl(280, 60%, 55%)",
  설비집중형: "hsl(180, 55%, 45%)",
  혼합형: "hsl(0, 0%, 60%)",
};

export function ItemCostTab({ summary, ranking, teamEfficiency, waterfall, bucketBreakdown, costProfile, unitCost }: ItemCostTabProps) {
  // Pareto: 매출 기준 누적 비중 + 공헌이익
  const paretoData = useMemo(() => {
    const top = ranking.slice(0, 15);
    return top.map((r) => ({
      name: r.product.length > 12 ? r.product.substring(0, 12) + ".." : r.product,
      fullName: r.product,
      공헌이익: r.contributionMargin,
      누적비중: r.cumSalesShare,
    }));
  }, [ranking]);

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

  // Profile distribution pie
  const profilePieData = useMemo(() =>
    costProfile.distribution.map((d) => ({
      name: d.type,
      value: d.count,
      fill: PROFILE_COLORS[d.type] || CHART_COLORS[5],
      avgCostRate: d.avgCostRate,
      totalSales: d.totalSales,
    })),
    [costProfile.distribution]
  );

  // Build a lookup map for unit cost by product+org
  const unitCostMap = useMemo(() => {
    const m = new Map<string, UnitCostEntry>();
    for (const u of unitCost) {
      m.set(`${u.org}__${u.product}`, u);
    }
    return m;
  }, [unitCost]);

  // Build a lookup map for profile by product+org
  const profileMap = useMemo(() => {
    const m = new Map<string, ItemCostProfile>();
    for (const p of costProfile.items) {
      m.set(`${p.org}__${p.product}`, p);
    }
    return m;
  }, [costProfile.items]);

  // Table columns
  const tableColumns: ColumnDef<ProductContribution, any>[] = useMemo(
    () => [
      { accessorKey: "rank", header: "#", size: 40 },
      { accessorKey: "product", header: "품목", size: 140,
        cell: ({ getValue }: any) => {
          const v = getValue() as string;
          return v.length > 18 ? v.substring(0, 18) + "..." : v;
        },
      },
      { accessorKey: "org", header: "팀", size: 90 },
      {
        id: "profileType",
        header: "원가유형",
        size: 90,
        accessorFn: (row: any) => {
          const p = profileMap.get(`${row.org}__${row.product}`);
          return p?.profileType || "-";
        },
        cell: ({ getValue }: any) => {
          const type = getValue() as string;
          if (type === "-") return "-";
          const colors: Record<string, string> = {
            자체생산형: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
            구매직납형: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
            외주의존형: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
            인건비집중형: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
            설비집중형: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",
            혼합형: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
          };
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[type] || ""}`}>
              {type}
            </span>
          );
        },
      },
      { accessorKey: "sales", header: "매출액",
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      {
        id: "unitPrice",
        header: "매출단가",
        size: 80,
        accessorFn: (row: any) => {
          const u = unitCostMap.get(`${row.org}__${row.product}`);
          return u?.actualUnitPrice ?? null;
        },
        cell: ({ getValue }: any) => {
          const v = getValue();
          return v != null && isFinite(v) ? formatCurrency(v) : "-";
        },
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
    [profileMap, unitCostMap]
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
          formula="가중평균 매출총이익율 = Σ매출총이익.실적 / Σ매출액.실적 × 100"
          benchmark="제조업 평균 20~30%, 30% 이상이면 양호"
        />
        <KpiCard
          title="평균 공헌이익율"
          value={summary.avgContributionRate}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          formula="공헌이익율 = (매출액 - 변동비) / 매출액 × 100. 변동비 = 14개 변동원가항목 합계"
          benchmark="50% 이상이면 고정비 커버 충분, 30% 미만이면 손익분기 위험"
        />
        <KpiCard
          title="최대 원가 항목"
          value={summary.topCostRatio}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          description={`${summary.topCostCategory} (${formatCurrency(summary.topCostAmount)})`}
          formula="17개 독립 원가항목 중 실적 합계가 가장 큰 항목 (소계 제외)"
          benchmark="원재료비 50% 이상 = 자체생산형, 상품매입 50% 이상 = 구매직납형"
        />
      </div>

      {/* Charts Row 1: Waterfall + Cost Bucket Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

      {/* Charts Row 2: Profile Distribution + Pareto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 원가 프로파일 분포 */}
        {profilePieData.length > 0 && (
          <ChartCard title="원가구조 프로파일 분포" description="품목별 원가구조 유형 분류 (재료비≥40%=자체생산, 상품매입≥50%=구매직납, 외주≥35%=외주의존 등)">
            <ChartContainer minHeight={360}>
              <PieChart>
                <Pie
                  data={profilePieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  label={(props: any) => PieOuterLabel(props)}
                  labelLine={false}
                  {...ANIMATION_CONFIG}
                >
                  {profilePieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-2 text-xs shadow-md">
                        <p className="font-semibold">{d.name}</p>
                        <p>{d.value}개 품목</p>
                        <p>총 매출: {formatCurrency(d.totalSales)}</p>
                        <p>평균 원가율: {isFinite(d.avgCostRate) ? `${d.avgCostRate.toFixed(1)}%` : "-"}</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ChartContainer>
          </ChartCard>
        )}

        {/* Pareto: 공헌이익 + 누적 매출 비중 */}
        <ChartCard title="품목별 공헌이익 파레토 (Top 15)" description="바: 공헌이익 / 라인: 누적 매출 비중(%). 80%/95% 기준선 표시">
          <ChartContainer minHeight={360}>
            <ComposedChart data={paretoData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={70} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: any) => formatCurrency(v, true)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: any) => `${v}%`}
                domain={[0, 100]}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                labelFormatter={(_l: any, p: any) => p?.[0]?.payload?.fullName || ""}
                formatter={(v: any, name: any) => {
                  if (name === "누적비중") return [`${Number(v).toFixed(1)}%`, name];
                  return [formatCurrency(Number(v)), name];
                }}
              />
              <ReferenceLine yAxisId="right" y={80} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "80%", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <ReferenceLine yAxisId="right" y={95} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "95%", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Bar yAxisId="left" dataKey="공헌이익" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {paretoData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.공헌이익 >= 0 ? "hsl(145, 60%, 42%)" : "hsl(0, 65%, 55%)"} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="누적비중"
                stroke={CHART_COLORS[3]}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[3] }}
                {...ANIMATION_CONFIG}
              />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Charts Row 3: Team Cost Structure */}
      <div className="grid grid-cols-1 gap-4">
        <ChartCard title="팀별 원가 구성" description="팀별 7대 원가 그룹 비율 (100% Stacked)">
          <ChartContainer minHeight={360}>
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
      <ChartCard title="품목별 원가 상세" description="품목별 매출, 원가, 이익 상세 (원가유형 배지, 매출단가, ABC 등급 포함)">
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
