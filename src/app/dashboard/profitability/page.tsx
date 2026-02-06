"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  PieChart,
  Pie,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ReferenceLine,
} from "recharts";
import { TrendingUp, Target, Package, AlertTriangle, Star, Shield, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcCostStructure,
  calcOrgRatioMetrics,
  calcPlanVsActualHeatmap,
} from "@/lib/analysis/kpi";
import type { CostProfileType } from "@/lib/analysis/kpi";
import {
  calcProductProfitability,
  calcCustomerProfitability,
} from "@/lib/analysis/profitability";
import {
  calcProfitRiskMatrix,
  calcQuadrantSummary,
} from "@/lib/analysis/profitRiskMatrix";
import type { ProfitRiskData } from "@/lib/analysis/profitRiskMatrix";
import { Card, CardContent } from "@/components/ui/card";

const COST_BAR_COLORS: Record<string, string> = {
  원재료비: "hsl(221.2, 83.2%, 53.3%)",
  상품매입: "hsl(262.1, 83.3%, 57.8%)",
  외주가공비: "hsl(24.6, 95%, 53.1%)",
  운반비: "hsl(188.7, 94.5%, 42.7%)",
  지급수수료: "hsl(43.3, 96.4%, 56.3%)",
  노무비: "hsl(142.1, 76.2%, 36.3%)",
  기타변동비: "hsl(346.8, 77.2%, 49.8%)",
  고정비: "hsl(0, 0%, 55%)",
};

const PROFILE_COLORS: Record<CostProfileType, string> = {
  자체생산형: CHART_COLORS[0],
  구매직납형: CHART_COLORS[2],
  외주의존형: CHART_COLORS[3],
  혼합형: CHART_COLORS[5],
};

const RADAR_COLORS = [
  CHART_COLORS[0],
  CHART_COLORS[1],
  CHART_COLORS[2],
  CHART_COLORS[3],
  CHART_COLORS[4],
  CHART_COLORS[5],
  CHART_COLORS[6],
];

const QUADRANT_COLORS: Record<ProfitRiskData["quadrant"], string> = {
  star: "hsl(142.1, 76.2%, 36.3%)",        // green
  cash_cow: "hsl(221.2, 83.2%, 53.3%)",    // blue
  problem_child: "hsl(43.3, 96.4%, 56.3%)", // yellow/amber
  dog: "hsl(346.8, 77.2%, 49.8%)",          // red
};

const QUADRANT_ICONS: Record<ProfitRiskData["quadrant"], React.ReactNode> = {
  star: <Star className="h-4 w-4" />,
  cash_cow: <Shield className="h-4 w-4" />,
  problem_child: <AlertTriangle className="h-4 w-4" />,
  dog: <ShieldAlert className="h-4 w-4" />,
};

function getHeatmapColor(rate: number): string {
  if (rate >= 100) return "bg-emerald-500/80 text-white";
  if (rate >= 80) return "bg-amber-400/80 text-gray-900";
  return "bg-red-500/80 text-white";
}

function getHeatmapBg(rate: number): string {
  if (rate >= 120) return "#059669";
  if (rate >= 100) return "#34d399";
  if (rate >= 80) return "#fbbf24";
  if (rate >= 50) return "#f97316";
  return "#ef4444";
}

export default function ProfitabilityPage() {
  const { orgProfit, teamContribution, profitabilityAnalysis, receivableAging, salesList, orgNames } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredOrgProfit = useMemo(() => filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀"), [orgProfit, effectiveOrgNames]);
  const filteredTeamContribution = useMemo(() => filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀"), [teamContribution, effectiveOrgNames]);
  const filteredProfAnalysis = useMemo(() => filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀"), [profitabilityAnalysis, effectiveOrgNames]);
  const filteredSales = useMemo(() => filterByDateRange(filterByOrg(salesList, effectiveOrgNames), dateRange, "매출일"), [salesList, effectiveOrgNames, dateRange]);
  const allReceivableRecords = useMemo(() => Array.from(receivableAging.values()).flat(), [receivableAging]);

  const hasData = filteredOrgProfit.length > 0;

  // ─── 손익 Waterfall 데이터 ──────────────────────────────
  const waterfallData = useMemo(() => {
    if (filteredOrgProfit.length === 0) return [];
    const totals = filteredOrgProfit.reduce(
      (acc, r) => ({
        매출액: acc.매출액 + r.매출액.실적,
        매출원가: acc.매출원가 + r.실적매출원가.실적,
        매출총이익: acc.매출총이익 + r.매출총이익.실적,
        판관비: acc.판관비 + r.판매관리비.실적,
        영업이익: acc.영업이익 + r.영업이익.실적,
        공헌이익: acc.공헌이익 + r.공헌이익.실적,
      }),
      { 매출액: 0, 매출원가: 0, 매출총이익: 0, 판관비: 0, 영업이익: 0, 공헌이익: 0 }
    );

    // Waterfall: 각 항목의 base(투명 영역)와 value(색상 영역)를 계산
    // 매출액(시작) → -매출원가(감소) → =매출총이익(소계) → -판관비(감소) → =영업이익(소계)
    const items: Array<{
      name: string;
      base: number;
      value: number;
      fill: string;
      type: "start" | "decrease" | "subtotal";
    }> = [];

    // 매출액: 바닥에서 시작
    items.push({
      name: "매출액",
      base: 0,
      value: totals.매출액,
      fill: CHART_COLORS[0],
      type: "start",
    });

    // 매출원가: 매출액에서 감소
    items.push({
      name: "매출원가",
      base: totals.매출총이익, // 매출액 - 매출원가 = 매출총이익이 바닥
      value: totals.매출원가,
      fill: CHART_COLORS[4],
      type: "decrease",
    });

    // 매출총이익: 소계 (바닥에서 시작)
    items.push({
      name: "매출총이익",
      base: 0,
      value: totals.매출총이익,
      fill: CHART_COLORS[1],
      type: "subtotal",
    });

    // 판관비: 매출총이익에서 감소
    items.push({
      name: "판관비",
      base: totals.영업이익, // 매출총이익 - 판관비 = 영업이익이 바닥
      value: totals.판관비,
      fill: CHART_COLORS[3],
      type: "decrease",
    });

    // 영업이익: 소계 (바닥에서 시작)
    items.push({
      name: "영업이익",
      base: 0,
      value: totals.영업이익,
      fill: totals.영업이익 >= 0 ? CHART_COLORS[0] : CHART_COLORS[4],
      type: "subtotal",
    });

    return items;
  }, [filteredOrgProfit]);

  // ─── 조직 수익성 데이터 ──────────────────────────────
  const bubbleData = useMemo(() =>
    filteredOrgProfit.map((r) => ({
      name: r.영업조직팀,
      x: r.매출액.실적,
      y: r.영업이익율.실적,
      z: Math.abs(r.매출총이익.실적),
    })),
    [filteredOrgProfit]
  );

  // ─── 기여도 분석 데이터 ──────────────────────────────
  const contribRanking = useMemo(() =>
    [...filteredTeamContribution]
      .sort((a, b) => (b.공헌이익?.실적 || 0) - (a.공헌이익?.실적 || 0))
      .slice(0, 15)
      .map((r) => ({
        name: r.영업담당사번,
        org: r.영업조직팀,
        공헌이익: r.공헌이익?.실적 || 0,
        공헌이익율: r.공헌이익율?.실적 || 0,
      })),
    [filteredTeamContribution]
  );

  // ─── 조직별 공헌이익 파이 데이터 ──────────────────────────────
  const orgContribPie = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrgProfit) {
      const org = r.영업조직팀;
      if (!org) continue;
      map.set(org, (map.get(org) || 0) + r.공헌이익.실적);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [filteredOrgProfit]);

  // ─── 비용 구조 데이터 ──────────────────────────────
  const costStructure = useMemo(
    () => calcCostStructure(filteredTeamContribution),
    [filteredTeamContribution]
  );

  const costBarData = useMemo(() => {
    return costStructure
      .sort((a, b) => Math.abs(b.매출액) - Math.abs(a.매출액))
      .slice(0, 20)
      .map((r) => ({
        name: r.id,
        원재료비: r.원재료비,
        상품매입: r.상품매입,
        외주가공비: r.외주가공비,
        운반비: r.운반비,
        지급수수료: r.지급수수료,
        노무비: r.노무비,
        기타변동비: r.기타변동비,
        고정비: r.고정비,
      }));
  }, [costStructure]);

  const profileDist = useMemo(() => {
    const counts: Record<CostProfileType, number> = {
      자체생산형: 0, 구매직납형: 0, 외주의존형: 0, 혼합형: 0,
    };
    for (const r of costStructure) {
      counts[r.profileType]++;
    }
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value,
        fill: PROFILE_COLORS[name as CostProfileType],
      }));
  }, [costStructure]);

  const costEfficiency = useMemo(() => {
    if (costStructure.length === 0) return [];
    // 조직별 평균 계산
    const orgMap = new Map<string, { count: number; 원재료비율: number; 상품매입비율: number; 외주비율: number }>();
    for (const r of costStructure) {
      const entry = orgMap.get(r.org) || { count: 0, 원재료비율: 0, 상품매입비율: 0, 외주비율: 0 };
      entry.count++;
      entry.원재료비율 += r.원재료비율;
      entry.상품매입비율 += r.상품매입비율;
      entry.외주비율 += r.외주비율;
      orgMap.set(r.org, entry);
    }
    const orgAvg = new Map<string, { 원재료비율: number; 상품매입비율: number; 외주비율: number }>();
    Array.from(orgMap.entries()).forEach(([org, e]) => {
      orgAvg.set(org, {
        원재료비율: e.원재료비율 / e.count,
        상품매입비율: e.상품매입비율 / e.count,
        외주비율: e.외주비율 / e.count,
      });
    });
    return costStructure
      .sort((a, b) => Math.abs(b.매출액) - Math.abs(a.매출액))
      .slice(0, 15)
      .map((r) => {
        const avg = orgAvg.get(r.org) || { 원재료비율: 0, 상품매입비율: 0, 외주비율: 0 };
        return { ...r, orgAvg: avg };
      });
  }, [costStructure]);

  // ─── 레이더 & 히트맵 데이터 ──────────────────────────────
  const orgRatioMetrics = useMemo(
    () => calcOrgRatioMetrics(filteredOrgProfit),
    [filteredOrgProfit]
  );

  const [selectedRadarOrgs, setSelectedRadarOrgs] = useState<string[]>([]);
  const radarOrgs = useMemo(() => {
    if (selectedRadarOrgs.length > 0) return selectedRadarOrgs;
    return orgRatioMetrics.slice(0, 5).map((r) => r.org);
  }, [orgRatioMetrics, selectedRadarOrgs]);

  const radarData = useMemo(() => {
    const metrics = ["매출원가율", "매출총이익율", "판관비율", "영업이익율", "공헌이익율"] as const;
    return metrics.map((m) => {
      const entry: Record<string, string | number> = { metric: m };
      for (const org of radarOrgs) {
        const found = orgRatioMetrics.find((r) => r.org === org);
        // 음수 값은 레이더 차트에서 0으로 표시 (Math.abs 제거 - 손실이 이익으로 표시되는 버그 수정)
        const rawValue = found ? found[m] : 0;
        entry[org] = Math.max(rawValue, 0);
        // 실제 값은 _raw_ 접두사로 저장 (툴팁용)
        entry[`_raw_${org}`] = rawValue;
      }
      return entry;
    });
  }, [orgRatioMetrics, radarOrgs]);

  const heatmapData = useMemo(
    () => calcPlanVsActualHeatmap(filteredOrgProfit),
    [filteredOrgProfit]
  );

  // ─── 제품/거래처 수익성 분석 (ProfitabilityAnalysisRecord 활용) ──────
  const productProfitability = useMemo(
    () => calcProductProfitability(filteredProfAnalysis),
    [filteredProfAnalysis]
  );

  const customerProfitability = useMemo(
    () => calcCustomerProfitability(filteredProfAnalysis),
    [filteredProfAnalysis]
  );

  // ─── 수익성 x 리스크 크로스 분석 ──────────────────────────────
  const profitRiskData = useMemo(
    () => calcProfitRiskMatrix(filteredOrgProfit, allReceivableRecords, filteredSales),
    [filteredOrgProfit, allReceivableRecords, filteredSales]
  );

  const quadrantSummary = useMemo(
    () => calcQuadrantSummary(profitRiskData),
    [profitRiskData]
  );

  // ─── KPI 합계 ──────────────────────────────
  const totalSales = filteredOrgProfit.reduce((s, r) => s + r.매출액.실적, 0);
  const totalOP = filteredOrgProfit.reduce((s, r) => s + r.영업이익.실적, 0);
  const totalGP = filteredOrgProfit.reduce((s, r) => s + r.매출총이익.실적, 0);
  const totalContrib = filteredOrgProfit.reduce((s, r) => s + r.공헌이익.실적, 0);
  const opRate = totalSales > 0 ? (totalOP / totalSales) * 100 : 0;
  const gpRate = totalSales > 0 ? (totalGP / totalSales) * 100 : 0;

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  const costKeys = ["원재료비", "상품매입", "외주가공비", "운반비", "지급수수료", "노무비", "기타변동비", "고정비"] as const;
  const heatmapMetricNames = heatmapData.length > 0 ? heatmapData[0].metrics.map((m) => m.name) : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">수익성 분석</h2>
        <p className="text-muted-foreground">손익 구조 및 조직별 수익성 비교</p>
      </div>

      <Tabs defaultValue="pnl" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="pnl">손익 현황</TabsTrigger>
          <TabsTrigger value="org">조직 수익성</TabsTrigger>
          <TabsTrigger value="contrib">기여도 분석</TabsTrigger>
          <TabsTrigger value="cost" disabled={filteredTeamContribution.length === 0}>비용 구조</TabsTrigger>
          <TabsTrigger value="plan" disabled={filteredOrgProfit.length === 0}>계획 달성</TabsTrigger>
          <TabsTrigger value="product" disabled={filteredProfAnalysis.length === 0}>제품 수익성</TabsTrigger>
          <TabsTrigger value="risk" disabled={filteredOrgProfit.length === 0}>수익성x리스크</TabsTrigger>
        </TabsList>

        {/* ────────── 손익 현황 ────────── */}
        <TabsContent value="pnl" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="매출총이익"
              value={totalGP}
              format="currency"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="매출액 - 매출원가"
              description="매출에서 직접 원가를 차감한 이익. 제품/서비스의 기본 수익성을 나타냅니다."
            />
            <KpiCard
              title="매출총이익율"
              value={gpRate}
              format="percent"
              formula="매출총이익 / 매출액 × 100"
              description="매출 대비 매출총이익의 비율. 높을수록 원가 경쟁력이 좋습니다."
              benchmark="30% 이상 양호"
            />
            <KpiCard
              title="영업이익율"
              value={opRate}
              format="percent"
              formula="영업이익 / 매출액 × 100"
              description="영업활동으로 인한 이익률. 판관비까지 차감한 실질 수익성입니다."
              benchmark="10% 이상 양호"
            />
            <KpiCard
              title="공헌이익"
              value={totalContrib}
              format="currency"
              icon={<Target className="h-5 w-5" />}
              formula="매출액 - 변동비"
              description="고정비 부담 전 수익으로, 각 조직/담당자가 기여하는 이익입니다."
            />
          </div>

          <ChartCard
            title="손익 Waterfall"
            formula="매출액 - 매출원가 = 매출총이익 - 판관비 = 영업이익"
            description="매출에서 각 비용을 차감하여 최종 영업이익까지의 흐름을 보여줍니다. 음수 항목은 비용을 의미합니다."
            benchmark="매출총이익율 30%↑ 양호, 영업이익율 10%↑ 양호"
          >
            <ErrorBoundary>
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waterfallData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        return (
                          <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                            <p className="font-semibold mb-1">{d.name}</p>
                            <p>{d.type === "decrease" ? "(-) " : ""}{formatCurrency(d.value)}</p>
                          </div>
                        );
                      }}
                    />
                    {/* 투명 base 영역 */}
                    <Bar dataKey="base" stackId="waterfall" fill="transparent" />
                    {/* 실제 값 영역 */}
                    <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
                      {waterfallData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ErrorBoundary>
          </ChartCard>
        </TabsContent>

        {/* ────────── 조직 수익성 ────────── */}
        <TabsContent value="org" className="space-y-6">
          <ChartCard
            title="조직별 수익성 Matrix"
            formula="X축: 매출액, Y축: 영업이익율, 크기: 매출총이익"
            description="조직별 수익성을 다차원으로 비교합니다. 우상단(고매출+고수익)이 가장 이상적입니다."
            benchmark="우상단: 핵심조직 | 좌상단: 고수익저매출 | 우하단: 고매출저수익"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" strokeWidth={1} label={{ value: "손익분기", position: "left", fontSize: 10, fill: "hsl(0, 0%, 50%)" }} />
                  <Scatter data={bubbleData} fill={CHART_COLORS[0]}>
                    {bubbleData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ────────── 기여도 분석 ────────── */}
        <TabsContent value="contrib" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <ChartCard
              title="담당자별 공헌이익 랭킹"
              formula="공헌이익 = 매출액 - 변동비"
              description="담당자별 공헌이익 기여 순위입니다. 공헌이익은 고정비 부담 전 수익을 나타냅니다."
              benchmark="상위 20% 담당자가 80% 공헌이익 기여가 전형적"
              className="xl:col-span-2"
            >
              <div className="h-80 md:h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contribRanking} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                    <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                    <Bar dataKey="공헌이익" fill={CHART_COLORS[2]} name="공헌이익" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="조직별 공헌이익 비중"
              formula="조직 공헌이익 / 전체 공헌이익 × 100"
              description="조직별 공헌이익 기여 비율입니다. 특정 조직 편중 시 리스크 분산이 필요합니다."
            >
              <div className="h-56 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={orgContribPie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                    >
                      {orgContribPie.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          <ChartCard
            title="담당자별 공헌이익율"
            formula="공헌이익율 = 공헌이익 / 매출액 × 100"
            description="담당자별 공헌이익율 순위입니다. 공헌이익율이 높을수록 변동비 효율이 좋습니다."
            benchmark="공헌이익율 20% 이상이면 양호"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contribRanking}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => `${Number(value).toFixed(1)}%`} />
                  <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" />
                  <Bar dataKey="공헌이익율" name="공헌이익율" radius={[4, 4, 0, 0]}>
                    {contribRanking.map((entry, i) => (
                      <Cell key={i} fill={entry.공헌이익율 >= 0 ? CHART_COLORS[2] : CHART_COLORS[4]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ────────── 비용 구조 ────────── */}
        <TabsContent value="cost" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Stacked Bar Chart */}
            <ChartCard
              title="담당자별 비용 구성"
              formula="각 비용항목 = 판관변동 + 제조변동 해당 항목 합산"
              description="담당자별 매출원가를 구성하는 비용 항목의 절대금액을 보여줍니다. 비용 집중 영역을 파악할 수 있습니다."
              benchmark="원재료비 비중 30%↑: 자체생산형, 상품매입 30%↑: 구매직납형"
              className="xl:col-span-2"
            >
              <div className="h-80 md:h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costBarData} layout="vertical" margin={{ left: 50 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
                    <RechartsTooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value: any, name: any) => [formatCurrency(Number(value)), String(name)]}
                      labelFormatter={(label) => `담당: ${label}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {costKeys.map((key) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="cost"
                        fill={COST_BAR_COLORS[key]}
                        name={key}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Profile Distribution Pie */}
            <ChartCard
              title="프로파일 유형 분포"
              formula="원재료비율 30%↑: 자체생산 | 상품매입 30%↑: 구매직납 | 외주비율 20%↑: 외주의존 | 나머지: 혼합"
              description="담당자의 비용 구조를 4가지 프로파일로 분류한 분포입니다."
            >
              <div className="h-56 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={profileDist}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value }) => `${name} (${value})`}
                    >
                      {profileDist.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <RechartsTooltip {...TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Cost Efficiency Table */}
          <ChartCard
            title="비용 효율성 비교"
            formula="각 비율 = 해당 비용 / 매출액 × 100"
            description="담당자별 주요 비용 비율을 조직 평균과 비교합니다. 조직 평균 대비 높은 항목은 개선이 필요합니다."
            benchmark="조직 평균 대비 +5%p 이상 차이 시 주의 필요"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">담당자</th>
                    <th className="text-left p-2 font-medium">조직</th>
                    <th className="text-left p-2 font-medium">프로파일</th>
                    <th className="text-right p-2 font-medium">매출액</th>
                    <th className="text-right p-2 font-medium">원재료비율</th>
                    <th className="text-right p-2 font-medium">조직평균</th>
                    <th className="text-right p-2 font-medium">상품매입비율</th>
                    <th className="text-right p-2 font-medium">조직평균</th>
                    <th className="text-right p-2 font-medium">외주비율</th>
                    <th className="text-right p-2 font-medium">조직평균</th>
                  </tr>
                </thead>
                <tbody>
                  {costEfficiency.map((r, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-2 font-mono text-xs">{r.id}</td>
                      <td className="p-2 text-xs">{r.org}</td>
                      <td className="p-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: PROFILE_COLORS[r.profileType] }}
                        >
                          {r.profileType}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono text-xs">{formatCurrency(r.매출액, true)}</td>
                      <td className={`p-2 text-right font-mono text-xs ${r.원재료비율 > r.orgAvg.원재료비율 + 5 ? "text-red-500 font-semibold" : ""}`}>
                        {r.원재료비율.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{r.orgAvg.원재료비율.toFixed(1)}%</td>
                      <td className={`p-2 text-right font-mono text-xs ${r.상품매입비율 > r.orgAvg.상품매입비율 + 5 ? "text-red-500 font-semibold" : ""}`}>
                        {r.상품매입비율.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{r.orgAvg.상품매입비율.toFixed(1)}%</td>
                      <td className={`p-2 text-right font-mono text-xs ${r.외주비율 > r.orgAvg.외주비율 + 5 ? "text-red-500 font-semibold" : ""}`}>
                        {r.외주비율.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{r.orgAvg.외주비율.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ────────── 계획 달성 ────────── */}
        <TabsContent value="plan" className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <ChartCard
              title="조직별 비율 지표 레이더"
              formula="5축: 매출원가율, 매출총이익율, 판관비율, 영업이익율, 공헌이익율"
              description="각 조직의 수익 구조를 5가지 비율 지표로 다차원 비교합니다. 면적이 넓을수록 이익률이 높습니다."
              benchmark="매출총이익율 30%↑, 영업이익율 10%↑, 공헌이익율 높을수록 양호"
              action={
                <div className="flex flex-wrap gap-1">
                  {orgRatioMetrics.map((r) => (
                    <button
                      key={r.org}
                      onClick={() => {
                        setSelectedRadarOrgs((prev) => {
                          if (prev.includes(r.org)) return prev.filter((o) => o !== r.org);
                          if (prev.length >= 7) return prev;
                          return [...prev, r.org];
                        });
                      }}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        radarOrgs.includes(r.org)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {r.org}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="h-72 md:h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis tick={{ fontSize: 10 }} />
                    {radarOrgs.map((org, i) => (
                      <Radar
                        key={org}
                        name={org}
                        dataKey={org}
                        stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
                        fill={RADAR_COLORS[i % RADAR_COLORS.length]}
                        fillOpacity={0.15}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <RechartsTooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value: any, name: any, props: any) => {
                        const rawKey = `_raw_${name}`;
                        const rawValue = props?.payload?.[rawKey];
                        const actual = rawValue !== undefined ? Number(rawValue) : Number(value);
                        const suffix = actual < 0 ? " (손실)" : "";
                        return `${actual.toFixed(1)}%${suffix}`;
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Heatmap */}
            <ChartCard
              title="계획 대비 실적 히트맵"
              formula="달성률 = 실적 / 계획 × 100"
              description="조직별 주요 손익 항목의 계획 대비 실적 달성률을 색상으로 표시합니다."
              benchmark="녹색: 100%↑ 달성 | 노랑: 80~100% | 빨강: 80% 미만"
            >
              <div className="overflow-x-auto">
                {/* Header */}
                <div className="flex border-b bg-muted/50">
                  <div className="min-w-[100px] p-2 text-xs font-medium">조직</div>
                  {heatmapMetricNames.map((name) => (
                    <div key={name} className="min-w-[80px] flex-1 p-2 text-xs font-medium text-center">
                      {name}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                {heatmapData.map((row) => (
                  <div key={row.org} className="flex border-b hover:bg-muted/20 transition-colors">
                    <div className="min-w-[100px] p-2 text-xs font-medium truncate" title={row.org}>
                      {row.org}
                    </div>
                    {row.metrics.map((m) => {
                      const rate = m.achievementRate;
                      const displayRate = rate > 999 ? "N/A" : `${rate.toFixed(0)}%`;
                      return (
                        <div
                          key={m.name}
                          className={`min-w-[80px] flex-1 p-2 text-center text-xs font-mono font-medium rounded-sm m-0.5 ${getHeatmapColor(rate)}`}
                          title={`계획: ${formatCurrency(m.plan, true)} | 실적: ${formatCurrency(m.actual, true)} | 차이: ${formatCurrency(m.gap, true)}`}
                          style={{ backgroundColor: rate > 999 ? "#6b7280" : getHeatmapBg(rate) }}
                        >
                          {displayRate}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div className="flex items-center gap-4 mt-3 px-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#059669" }} />
                    120%+
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#34d399" }} />
                    100~120%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#fbbf24" }} />
                    80~100%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#f97316" }} />
                    50~80%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
                    50% 미만
                  </span>
                </div>
              </div>
            </ChartCard>
          </div>
        </TabsContent>

        {/* ────────── 제품 수익성 ────────── */}
        <TabsContent value="product" className="space-y-6">
          {filteredProfAnalysis.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                  title="분석 품목 수"
                  value={productProfitability.length}
                  format="number"
                  icon={<Package className="h-5 w-5" />}
                  formula="품목별 그룹핑 후 고유 품목 수"
                  description="수익성 분석 대상 품목의 총 수입니다."
                />
                <KpiCard
                  title="최고 수익 품목"
                  value={productProfitability.length > 0 ? productProfitability[0].grossProfit : 0}
                  format="currency"
                  icon={<TrendingUp className="h-5 w-5" />}
                  formula="품목별 매출총이익 1위"
                  description={productProfitability.length > 0 ? `${productProfitability[0].product} (매출총이익율 ${productProfitability[0].grossMargin.toFixed(1)}%)` : "데이터 없음"}
                />
                <KpiCard
                  title="평균 매출총이익율"
                  value={
                    productProfitability.length > 0
                      ? productProfitability.reduce((s, p) => s + p.grossMargin, 0) / productProfitability.length
                      : 0
                  }
                  format="percent"
                  formula="각 품목 매출총이익율의 산술 평균"
                  description="전체 품목의 평균 매출총이익율입니다. 30% 이상이면 양호합니다."
                  benchmark="30% 이상 양호"
                />
              </div>

              <ChartCard
                title="품목별 매출총이익 Top 15"
                formula="매출총이익 = 매출액 - 매출원가"
                description="매출총이익 기준 상위 15개 품목입니다. 수평 막대 차트로 이익 규모를 비교합니다."
                benchmark="양수: 이익 품목, 음수: 손실 품목"
              >
                <ErrorBoundary>
                  <div className="h-80 md:h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={productProfitability.slice(0, 15).map((p) => ({
                          name: p.product.length > 15 ? p.product.substring(0, 15) + "..." : p.product,
                          fullName: p.product,
                          매출총이익: p.grossProfit,
                          매출총이익율: p.grossMargin,
                          매출액: p.sales,
                        }))}
                        layout="vertical"
                        margin={{ left: 80 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                        <RechartsTooltip
                          content={({ payload }) => {
                            if (!payload || payload.length === 0) return null;
                            const d = payload[0]?.payload;
                            if (!d) return null;
                            return (
                              <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                                <p className="font-semibold mb-1">{d.fullName}</p>
                                <p>매출액: {formatCurrency(d.매출액)}</p>
                                <p>매출총이익: {formatCurrency(d.매출총이익)}</p>
                                <p>매출총이익율: {formatPercent(d.매출총이익율)}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="매출총이익" name="매출총이익" radius={[0, 4, 4, 0]}>
                          {productProfitability.slice(0, 15).map((p, i) => (
                            <Cell key={i} fill={p.grossProfit >= 0 ? CHART_COLORS[1] : CHART_COLORS[4]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ErrorBoundary>
              </ChartCard>

              <ChartCard
                title="거래처별 수익성 분석"
                formula="매출총이익율 = 매출총이익 / 매출액 x 100"
                description="거래처별 매출, 이익율, 취급 품목 수를 종합적으로 비교합니다."
                benchmark="매출총이익율 30%↑ 양호 | 영업이익율 10%↑ 양호"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">거래처</th>
                        <th className="text-right p-2 font-medium">매출액</th>
                        <th className="text-right p-2 font-medium">매출총이익</th>
                        <th className="text-right p-2 font-medium">매출총이익율</th>
                        <th className="text-right p-2 font-medium">영업이익</th>
                        <th className="text-right p-2 font-medium">영업이익율</th>
                        <th className="text-center p-2 font-medium">품목 수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerProfitability.slice(0, 20).map((c, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="p-2 text-xs font-medium truncate max-w-[200px]" title={c.customer}>
                            {c.customer}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.sales, true)}</td>
                          <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.grossProfit, true)}</td>
                          <td className={`p-2 text-right font-mono text-xs ${c.grossMargin >= 30 ? "text-emerald-600" : c.grossMargin < 0 ? "text-red-500" : ""}`}>
                            {formatPercent(c.grossMargin)}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.operatingProfit, true)}</td>
                          <td className={`p-2 text-right font-mono text-xs ${c.operatingMargin >= 10 ? "text-emerald-600" : c.operatingMargin < 0 ? "text-red-500" : ""}`}>
                            {formatPercent(c.operatingMargin)}
                          </td>
                          <td className="p-2 text-center text-xs">{c.productCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 p-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground/50" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">수익성 분석 데이터 없음</h3>
                <p className="text-xs text-muted-foreground">
                  손익분석 파일을 업로드하면 품목별/거래처별 수익성 분석을 확인할 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ────────── 수익성 x 리스크 ────────── */}
        <TabsContent value="risk" className="space-y-6">
          <ChartCard
            title="수익성 x 리스크 매트릭스"
            formula="X축: 영업이익율(%), Y축: 리스크 점수(0~100)"
            description="조직별 수익성과 미수금 리스크를 2차원으로 비교합니다. 우하단(고수익+저리스크)이 가장 이상적입니다."
            benchmark="기준선: 영업이익율 5% | 리스크 점수 40"
          >
            <ErrorBoundary>
              <div className="h-72 md:h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="profitMargin"
                      name="영업이익율"
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      label={{ value: "영업이익율 (%)", position: "insideBottom", offset: -10, fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="riskScore"
                      name="리스크 점수"
                      type="number"
                      tick={{ fontSize: 11 }}
                      domain={[0, 100]}
                      label={{ value: "리스크 점수", angle: -90, position: "insideLeft", offset: 10, fontSize: 11 }}
                    />
                    <ZAxis dataKey="sales" range={[60, 400]} />
                    <RechartsTooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0]?.payload as ProfitRiskData | undefined;
                        if (!d) return null;
                        const quadrantLabel: Record<ProfitRiskData["quadrant"], string> = {
                          star: "스타 (고수익/저리스크)",
                          cash_cow: "안정형 (저수익/저리스크)",
                          problem_child: "주의 (고수익/고리스크)",
                          dog: "위험 (저수익/고리스크)",
                        };
                        return (
                          <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                            <p className="font-semibold mb-1">{d.name}</p>
                            <p>영업이익율: {formatPercent(d.profitMargin)}</p>
                            <p>리스크 점수: {d.riskScore.toFixed(1)}</p>
                            <p>매출: {formatCurrency(d.sales, true)}</p>
                            <p>미수금: {formatCurrency(d.receivables, true)}</p>
                            <p className="mt-1 pt-1 border-t text-xs text-muted-foreground">
                              분류: {quadrantLabel[d.quadrant]}
                            </p>
                          </div>
                        );
                      }}
                    />
                    {/* 기준선: 영업이익율 5% */}
                    <ReferenceLine
                      x={5}
                      stroke="hsl(0, 0%, 50%)"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      label={{ value: "이익율 5%", position: "top", fontSize: 10, fill: "hsl(0, 0%, 50%)" }}
                    />
                    {/* 기준선: 리스크 점수 40 */}
                    <ReferenceLine
                      y={40}
                      stroke="hsl(0, 0%, 50%)"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                      label={{ value: "리스크 40", position: "right", fontSize: 10, fill: "hsl(0, 0%, 50%)" }}
                    />
                    <Scatter data={profitRiskData} fill={CHART_COLORS[0]}>
                      {profitRiskData.map((d, i) => (
                        <Cell key={i} fill={QUADRANT_COLORS[d.quadrant]} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </ErrorBoundary>
          </ChartCard>

          {/* 사분면 요약 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quadrantSummary.map((q) => {
              const bgColors: Record<string, string> = {
                star: "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20",
                cash_cow: "border-blue-500/30 bg-blue-50 dark:bg-blue-950/20",
                problem_child: "border-amber-500/30 bg-amber-50 dark:bg-amber-950/20",
                dog: "border-red-500/30 bg-red-50 dark:bg-red-950/20",
              };
              const textColors: Record<string, string> = {
                star: "text-emerald-700 dark:text-emerald-400",
                cash_cow: "text-blue-700 dark:text-blue-400",
                problem_child: "text-amber-700 dark:text-amber-400",
                dog: "text-red-700 dark:text-red-400",
              };
              return (
                <Card key={q.name} className={`border ${bgColors[q.name] || ""}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={textColors[q.name] || ""}>
                        {QUADRANT_ICONS[q.name as ProfitRiskData["quadrant"]]}
                      </span>
                      <h4 className={`text-sm font-semibold ${textColors[q.name] || ""}`}>
                        {q.koreanName}
                      </h4>
                      <span className="ml-auto text-lg font-bold">{q.count}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">
                      매출 합계: {formatCurrency(q.totalSales, true)}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {q.recommendation}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* 범례 */}
          <div className="flex flex-wrap items-center gap-4 px-2 text-xs text-muted-foreground">
            <span className="font-medium">사분면 범례:</span>
            {([
              { key: "star", label: "스타 (고수익/저리스크)" },
              { key: "cash_cow", label: "안정형 (저수익/저리스크)" },
              { key: "problem_child", label: "주의 (고수익/고리스크)" },
              { key: "dog", label: "위험 (저수익/고리스크)" },
            ] as const).map(({ key, label }) => (
              <span key={key} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: QUADRANT_COLORS[key] }}
                />
                {label}
              </span>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
