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
    const top = ranking.slice(0, 20);
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
      { accessorKey: "rank", header: () => <span title="매출액 기준 내림차순 순위">#</span>, size: 40 },
      { accessorKey: "product", header: "품목", size: 160,
        cell: ({ getValue }: any) => {
          const v = getValue() as string;
          if (v.length <= 20) return v;
          return <span title={v}>{v.substring(0, 20)}...</span>;
        },
      },
      { accessorKey: "org", header: () => <span title="해당 품목이 속한 영업조직팀">팀</span>, size: 90 },
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
      { accessorKey: "sales", header: () => <span title="해당 품목의 총 매출 금액 (실적 기준)">매출액</span>,
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      {
        id: "unitPrice",
        header: () => <span title="매출액 / 판매수량. 품목 1개당 평균 판매가격">매출단가</span>,
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
      { accessorKey: "variableCost", header: () => <span title="매출량에 비례하여 변하는 비용 (원재료비, 외주가공비 등 14개 항목 합계)">변동비</span>,
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "grossProfit", header: () => <span title="매출액 - 매출원가(변동비+고정비). 제조 활동의 수익성을 나타냅니다">매출총이익</span>,
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "grossMargin", header: () => <span title="매출총이익 / 매출액 × 100. 초록(≥20%) 양호 / 주황(10~20%) 보통 / 빨강(<10%) 주의">매출총이익율</span>,
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          return <span className={v >= 20 ? "text-green-600" : v >= 10 ? "text-amber-600" : "text-red-600"}>{formatPercent(v)}</span>;
        },
      },
      { accessorKey: "contributionMargin", header: () => <span title="매출액 - 변동비. 고정비를 감당하고 이익을 내는 데 기여하는 금액">공헌이익</span>,
        cell: ({ getValue }: any) => formatCurrency(getValue() as number),
      },
      { accessorKey: "contributionRate", header: () => <span title="공헌이익 / 매출액 × 100. 초록(≥30%) 우수 / 주황(15~30%) 보통 / 빨강(<15%) 주의">공헌이익율</span>,
        cell: ({ getValue }: any) => {
          const v = getValue() as number;
          return <span className={v >= 30 ? "text-green-600" : v >= 15 ? "text-amber-600" : "text-red-600"}>{formatPercent(v)}</span>;
        },
      },
      { accessorKey: "grade", header: () => <span title="파레토 ABC 분류. A=매출 상위 80%(핵심), B=80~95%(일반), C=95%~(보조). 음수 매출 품목은 자동 C등급">ABC</span>,
        cell: ({ getValue }: any) => {
          const g = getValue() as string;
          const colors: Record<string, string> = {
            A: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 font-bold",
            B: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
            C: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
          };
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[g] || ""}`}>
              {g}
            </span>
          );
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
          description="현재 분석에 포함된 고유 제품/자재 종류의 수입니다"
          formula="501 품목별매출원가 데이터에서 Infra사업본부(설계영업팀 제외) 소속 고유 품목 수"
          benchmark="품목 수가 많으면 매출이 분산되어 리스크가 줄어듭니다. 소수 품목 집중 시 해당 품목 의존도가 높아집니다"
        />
        <KpiCard
          title="평균 매출총이익율"
          value={summary.avgGrossMargin}
          format="percent"
          icon={<TrendingUp className="h-5 w-5" />}
          description="매출에서 제조원가를 빼고 남는 이익의 비율입니다. 높을수록 수익성이 좋습니다"
          formula="가중평균 매출총이익율 = Σ매출총이익 / Σ매출액 × 100"
          benchmark="제조업 평균 20~30%. 30% 이상이면 양호, 10% 미만이면 원가 구조 점검 필요"
        />
        <KpiCard
          title="평균 공헌이익율"
          value={summary.avgContributionRate}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          description="매출액에서 변동비(매출량에 따라 변하는 비용)를 뺀 이익의 비율입니다. 고정비를 감당할 수 있는 여력을 보여줍니다"
          formula="공헌이익율 = (매출액 - 변동비) / 매출액 × 100. 변동비 = 원재료비, 외주비 등 14개 변동원가항목 합계"
          benchmark="50% 이상이면 고정비 충분히 커버, 30~50% 보통, 30% 미만이면 손익분기 위험"
        />
        <KpiCard
          title="최대 원가 항목"
          value={summary.topCostRatio}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          description={`전체 원가에서 가장 큰 비중을 차지하는 항목: ${summary.topCostCategory} (${formatCurrency(summary.topCostAmount)})`}
          formula="17개 독립 원가항목 중 실적 합계가 가장 큰 항목의 비중 (소계 제외)"
          benchmark="원재료비 50%↑ = 자체생산형(원재료 가격 리스크), 상품매입 50%↑ = 구매직납형(공급처 의존)"
        />
      </div>

      {/* Charts Row 1: Waterfall + Cost Bucket Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="공헌이익 워터폴" description="매출액에서 각 비용을 단계별로 차감하는 흐름입니다. 매출액 → 변동비 차감 → 공헌이익 → 고정비 차감 → 매출총이익. 빨간색=비용 차감, 초록색=이익 잔액">
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

        <ChartCard title="원가 구성 비중" description="전체 원가를 7대 그룹(재료비, 상품매입비, 인건비, 설비비, 외주비, 물류비, 일반경비)으로 나눈 비중입니다. 가장 큰 조각이 원가 절감의 핵심 대상입니다">
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
          <ChartCard title="원가구조 프로파일 분포" description="각 품목의 원가 구성 비율에 따라 6가지 유형으로 분류합니다. 자체생산형(재료비≥40%), 구매직납형(상품매입≥50%), 외주의존형(외주비≥35%), 인건비집중형(인건비≥35%), 설비집중형(설비비≥30%), 혼합형(특정 항목 지배 없음)">
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
        <ChartCard title="품목별 공헌이익 파레토 (Top 20)" description="매출 상위 20개 품목의 공헌이익(바)과 누적 매출 비중(라인)입니다. 80% 기준선까지가 A등급(핵심 품목), 95%까지가 B등급(일반), 이후가 C등급(보조)">
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
        <ChartCard title="팀별 원가 구성" description="각 팀의 원가를 7대 그룹 비율(%)로 보여줍니다. 막대 전체가 100%이며, 각 색상 영역의 넓이가 해당 원가 그룹의 비중입니다. 팀 간 원가 구조 차이를 비교할 수 있습니다">
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
      <ChartCard title="품목별 원가 상세" description="품목별 매출, 원가, 이익을 한눈에 비교하는 테이블입니다. ABC등급(A=핵심/B=일반/C=보조), 원가유형 배지, 색상(초록=양호/주황=보통/빨강=주의)으로 빠르게 상태를 파악할 수 있습니다">
        <DataTable
          data={ranking}
          columns={tableColumns}
          searchPlaceholder="품목 검색..."
          defaultPageSize={30}
        />
      </ChartCard>
    </>
  );
}
