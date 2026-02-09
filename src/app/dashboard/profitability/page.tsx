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
  LabelList,
  ComposedChart,
  Line,
  Area,
} from "recharts";
import { TrendingUp, Target, Package, AlertTriangle, Star, Shield, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, filterByDateRange, filterOrgProfitLeafOnly, aggregateOrgProfit, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
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
import { calcVarianceAnalysis, calcVarianceSummary, calcOrgVarianceSummaries } from "@/lib/analysis/variance";
import { calcOrgBreakeven, calcBreakevenChart } from "@/lib/analysis/breakeven";
import { calcWhatIfScenario, calcScenarioSummary, calcSensitivity } from "@/lib/analysis/whatif";
import type { ScenarioParams } from "@/lib/analysis/whatif";
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

/**
 * 히트맵 배경색 결정
 * isCostItem=true이면 색상 반전 (비용 초과 = 빨간색)
 */
function getHeatmapBg(rate: number, isCostItem: boolean): string {
  if (!isFinite(rate)) return "#6b7280"; // 계획없음 → 회색
  if (isCostItem) {
    // 비용항목: 달성률 낮을수록 좋음 (예산 절감)
    if (rate <= 80) return "#059669";     // 예산 대비 크게 절감 → 진녹색
    if (rate <= 100) return "#34d399";    // 예산 이하 → 연녹색
    if (rate <= 120) return "#fbbf24";    // 소폭 초과 → 노랑
    if (rate <= 150) return "#f97316";    // 초과 → 주황
    return "#ef4444";                     // 대폭 초과 → 빨강
  }
  // 수익항목: 달성률 높을수록 좋음
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

  const filteredOrgProfit = useMemo(() => {
    const filtered = filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀");
    const leafOnly = filterOrgProfitLeafOnly(filtered);
    return aggregateOrgProfit(leafOnly);
  }, [orgProfit, effectiveOrgNames]);
  const filteredTeamContribution = useMemo(() => {
    const orgFiltered = filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀");
    // 소계 행 제거: 영업담당사번이 비어있는 행은 조직 소계
    return orgFiltered.filter((r: any) => {
      const person = String(r.영업담당사번 || "").trim();
      return person !== "";
    });
  }, [teamContribution, effectiveOrgNames]);
  const filteredProfAnalysis = useMemo(() => {
    const filtered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
    // 필터 후 유효 매출이 없으면 전체 데이터 사용 (fallback)
    const hasSales = filtered.some((r: any) => r.매출액?.실적 !== 0);
    if (filtered.length > 0 && hasSales) return filtered;
    if (profitabilityAnalysis.length > 0 && !hasSales) return profitabilityAnalysis;
    return filtered;
  }, [profitabilityAnalysis, effectiveOrgNames]);
  const profAnalysisIsFallback = useMemo(() => {
    const filtered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
    const hasSales = filtered.some((r: any) => r.매출액?.실적 !== 0);
    return profitabilityAnalysis.length > 0 && filtered.length > 0 && !hasSales;
  }, [profitabilityAnalysis, effectiveOrgNames]);
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

    // Waterfall: base(투명) + value(색상) 스택.
    // 음수 처리: base=min(top,bottom), value=|구간높이|
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
      base: Math.min(0, totals.매출액),
      value: Math.abs(totals.매출액),
      fill: CHART_COLORS[0],
      type: "start",
    });

    // 매출원가: 매출액에서 감소 → 매출총이익까지
    items.push({
      name: "매출원가",
      base: Math.min(totals.매출액, totals.매출총이익),
      value: Math.abs(totals.매출원가),
      fill: CHART_COLORS[4],
      type: "decrease",
    });

    // 매출총이익: 소계
    items.push({
      name: "매출총이익",
      base: Math.min(0, totals.매출총이익),
      value: Math.abs(totals.매출총이익),
      fill: totals.매출총이익 >= 0 ? CHART_COLORS[1] : CHART_COLORS[4],
      type: "subtotal",
    });

    // 판관비: 매출총이익에서 감소 → 영업이익까지
    items.push({
      name: "판관비",
      base: Math.min(totals.매출총이익, totals.영업이익),
      value: Math.abs(totals.판관비),
      fill: CHART_COLORS[3],
      type: "decrease",
    });

    // 영업이익: 소계
    items.push({
      name: "영업이익",
      base: Math.min(0, totals.영업이익),
      value: Math.abs(totals.영업이익),
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
      z: Math.max(r.매출총이익.실적, 0), // 음수 이익은 최소 버블로 표시
      grossProfit: r.매출총이익.실적,
    })),
    [filteredOrgProfit]
  );

  // ─── 기여도 분석 데이터 ──────────────────────────────
  const contribRanking = useMemo(() =>
    [...filteredTeamContribution]
      .filter((r) => (r.공헌이익?.실적 || 0) !== 0 || (r.매출액?.실적 || 0) !== 0)
      .sort((a, b) => (b.공헌이익?.실적 || 0) - (a.공헌이익?.실적 || 0))
      .map((r) => {
        const org = (r.영업조직팀 || "").trim();
        const person = (r.영업담당사번 || "").trim();
        return {
          name: person,
          displayName: person
            ? `${org}_${person}`.substring(0, 15)
            : org.substring(0, 15),
          org: r.영업조직팀,
          사번: r.영업담당사번,
          공헌이익: r.공헌이익?.실적 || 0,
          공헌이익율: r.공헌이익율?.실적 || 0,
        };
      }),
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
    const all = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    return all.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [filteredOrgProfit]);
  const excludedNegativeContribCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrgProfit) {
      const org = r.영업조직팀;
      if (!org) continue;
      map.set(org, (map.get(org) || 0) + r.공헌이익.실적);
    }
    return Array.from(map.values()).filter((v) => v <= 0).length;
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
        name: r.id ? `${(r.org || "").trim()}_${r.id}`.substring(0, 15) : (r.org || "").substring(0, 15),
        사번: r.id,
        조직: r.org,
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

  // ─── 분산분석 (3-way Variance) ──────────────────────────────
  const varianceItems = useMemo(() => calcVarianceAnalysis(filteredProfAnalysis), [filteredProfAnalysis]);
  const varianceSummary = useMemo(() => calcVarianceSummary(varianceItems), [varianceItems]);
  const orgVariances = useMemo(() => calcOrgVarianceSummaries(varianceItems), [varianceItems]);

  // ─── 손익분기점 (Break-even / CVP) ──────────────────────────────
  const orgBreakeven = useMemo(() => calcOrgBreakeven(filteredOrgProfit), [filteredOrgProfit]);

  const bepChartData = useMemo(() => {
    if (orgBreakeven.length === 0) return [];
    const totalFixed = orgBreakeven.reduce((s, r) => s + r.fixedCosts, 0);
    const totalSales = orgBreakeven.reduce((s, r) => s + r.sales, 0);
    const totalVariable = orgBreakeven.reduce((s, r) => s + r.variableCosts, 0);
    const varRatio = totalSales > 0 ? totalVariable / totalSales : 0;
    return calcBreakevenChart(totalFixed, varRatio, totalSales * 1.3);
  }, [orgBreakeven]);

  // ─── 시나리오 분석 (What-If) ──────────────────────────────
  const [scenarioParams, setScenarioParams] = useState<ScenarioParams>({
    salesChangePercent: 0,
    costRateChangePoints: 0,
    sgaChangePercent: 0,
  });
  const scenarioResults = useMemo(
    () => calcWhatIfScenario(filteredOrgProfit, scenarioParams),
    [filteredOrgProfit, scenarioParams]
  );
  const scenarioSummary = useMemo(
    () => calcScenarioSummary(scenarioResults),
    [scenarioResults]
  );
  const sensitivityData = useMemo(
    () => calcSensitivity(filteredOrgProfit, "sales", [-20, -15, -10, -5, 0, 5, 10, 15, 20]),
    [filteredOrgProfit]
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
          <TabsTrigger value="contrib" disabled={filteredTeamContribution.length === 0}>기여도 분석</TabsTrigger>
          <TabsTrigger value="cost" disabled={filteredTeamContribution.length === 0}>비용 구조</TabsTrigger>
          <TabsTrigger value="plan" disabled={filteredOrgProfit.length === 0}>계획 달성</TabsTrigger>
          <TabsTrigger value="product" disabled={filteredProfAnalysis.length === 0}>제품 수익성</TabsTrigger>
          <TabsTrigger value="risk" disabled={filteredOrgProfit.length === 0}>수익성x리스크</TabsTrigger>
          <TabsTrigger value="variance" disabled={filteredProfAnalysis.length === 0}>분산분석</TabsTrigger>
          <TabsTrigger value="breakeven" disabled={filteredOrgProfit.length === 0}>손익분기</TabsTrigger>
          <TabsTrigger value="whatif" disabled={filteredOrgProfit.length === 0}>시나리오</TabsTrigger>
        </TabsList>

        {/* ────────── 손익 현황 ────────── */}
        <TabsContent value="pnl" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="매출총이익"
              value={totalGP}
              format="currency"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="매출총이익 = 매출액 - 매출원가"
              description="매출에서 제품을 만들거나 구매하는 데 든 직접 비용(매출원가)을 뺀 금액입니다. 제품이나 서비스 자체가 얼마나 수익을 내는지 보여주는 가장 기본적인 이익 지표입니다."
              benchmark="제조업 평균 매출총이익은 매출의 20~30% 수준이며, 30% 이상이면 양호합니다"
            />
            <KpiCard
              title="매출총이익율"
              value={gpRate}
              format="percent"
              formula="매출총이익율 = 매출총이익 나누기 매출액 곱하기 100"
              description="매출 100원당 원가를 빼고 남는 이익의 비율입니다. 이 비율이 높을수록 원가 관리를 잘하고 있다는 의미이며, 가격 경쟁력과 원가 효율성을 동시에 보여줍니다."
              benchmark="제조업 평균 20~30%, 30% 이상이면 원가 경쟁력 양호"
            />
            <KpiCard
              title="영업이익율"
              value={opRate}
              format="percent"
              formula="영업이익율 = 영업이익 나누기 매출액 곱하기 100"
              description="매출에서 원가와 판매관리비(인건비, 임차료 등)까지 모두 뺀 후 남는 이익의 비율입니다. 회사의 본업(영업활동)이 실제로 얼마나 돈을 버는지 보여주는 핵심 수익성 지표입니다."
              benchmark="제조업 평균 5~10%, 10% 이상이면 양호한 수익 구조"
            />
            <KpiCard
              title="공헌이익"
              value={totalContrib}
              format="currency"
              icon={<Target className="h-5 w-5" />}
              formula="공헌이익 = 매출액 - 변동비"
              description="매출에서 매출량에 비례하여 변하는 비용(변동비)만 뺀 금액입니다. 고정비(임차료, 인건비 등)를 부담하기 전에 각 조직이나 담당자가 회사에 기여하는 이익을 의미합니다. 조직별 성과 비교에 유용합니다."
              benchmark="공헌이익이 양수여야 해당 조직이 고정비 회수에 기여하고 있는 것입니다"
            />
          </div>

          <ChartCard
            title="손익 Waterfall"
            formula="매출액 - 매출원가 = 매출총이익, 매출총이익 - 판관비 = 영업이익"
            description="매출에서 비용을 단계별로 차감하여 최종 영업이익이 되기까지의 흐름을 폭포(Waterfall) 형태로 보여줍니다. 각 막대의 감소 폭이 클수록 해당 비용 부담이 큰 것이며, 어느 단계에서 이익이 크게 줄어드는지 한눈에 파악할 수 있습니다."
            benchmark="매출총이익율 30% 이상, 영업이익율 10% 이상이면 양호한 수익 구조"
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
            formula="가로축 = 매출액, 세로축 = 영업이익율, 버블 크기 = 매출총이익"
            description="각 조직의 매출 규모, 이익율, 총이익을 한 차트에서 3가지 차원으로 비교합니다. 오른쪽 위에 위치할수록 매출도 크고 이익율도 높은 핵심 조직입니다. 버블이 클수록 매출총이익이 큰 조직입니다."
            benchmark="오른쪽 위: 핵심 조직(고매출, 고수익) | 왼쪽 위: 틈새 조직(저매출, 고수익) | 오른쪽 아래: 개선 필요(고매출, 저수익)"
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
                          <p>매출총이익: {formatCurrency(d.grossProfit)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" strokeWidth={1} label={{ value: "손익분기", position: "left", fontSize: 10, fill: "hsl(0, 0%, 50%)" }} />
                  <Scatter data={bubbleData} fill={CHART_COLORS[0]}>
                    {bubbleData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                    <LabelList dataKey="name" position="top" fontSize={10} offset={8} />
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
              formula="공헌이익 = 매출액 - 변동비(원재료비, 외주비 등)"
              description={`각 영업 담당자가 회사 고정비 회수에 얼마나 기여하는지를 공헌이익 금액 순으로 보여줍니다. 전체 ${contribRanking.length}명 중 상위 담당자일수록 회사 수익에 큰 기여를 하고 있습니다.`}
              benchmark="일반적으로 상위 20% 담당자가 전체 공헌이익의 약 80%를 차지합니다 (파레토 법칙)"
              className="xl:col-span-2"
            >
              <div style={{ height: Math.max(320, contribRanking.length * 28 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contribRanking} layout="vertical" margin={{ left: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <YAxis type="category" dataKey="displayName" tick={{ fontSize: 9 }} width={85} />
                    <RechartsTooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        return (
                          <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                            <p className="font-semibold mb-1">{d.사번}</p>
                            <p className="text-xs text-muted-foreground mb-1">조직: {d.org}</p>
                            <p>공헌이익: {formatCurrency(d.공헌이익)}</p>
                            <p>공헌이익율: {d.공헌이익율.toFixed(1)}%</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="공헌이익" fill={CHART_COLORS[2]} name="공헌이익" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="조직별 공헌이익 비중"
              formula="비중 = 해당 조직의 공헌이익 나누기 전체 공헌이익 곱하기 100"
              description="전체 공헌이익 중 각 조직이 차지하는 비율을 원형 차트로 보여줍니다. 한 조직에 지나치게 편중되면 해당 조직 실적 부진 시 전체 수익에 큰 타격을 받으므로, 적절한 분산이 중요합니다."
              benchmark="특정 조직 비중이 50%를 넘으면 수익 집중 리스크를 검토해야 합니다"
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
                      label={orgContribPie.length <= 6
                        ? (props: any) => `${props.name || ""} ${(((props.percent as number) || 0) * 100).toFixed(1)}%`
                        : false
                      }
                    >
                      {orgContribPie.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {excludedNegativeContribCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1 px-1">
                  * 공헌이익 음수 조직 {excludedNegativeContribCount}개 제외됨
                </p>
              )}
            </ChartCard>
          </div>

          <ChartCard
            title="담당자별 공헌이익율"
            formula="공헌이익율 = 공헌이익 나누기 매출액 곱하기 100"
            description="각 담당자의 매출 100원당 변동비를 빼고 남는 이익 비율입니다. 공헌이익율이 높을수록 적은 매출로도 고정비 회수에 크게 기여하며, 변동비 관리를 효율적으로 하고 있다는 의미입니다."
            benchmark="공헌이익율 20% 이상이면 양호, 음수인 경우 매출보다 변동비가 더 큰 적자 상태"
          >
            <div style={{ height: Math.max(320, contribRanking.length * 28 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...contribRanking].sort((a, b) => b.공헌이익율 - a.공헌이익율)} layout="vertical" margin={{ left: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="displayName" tick={{ fontSize: 9 }} width={85} />
                  <RechartsTooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                          <p className="font-semibold mb-1">{d.사번}</p>
                          <p className="text-xs text-muted-foreground mb-1">조직: {d.org}</p>
                          <p>공헌이익율: {d.공헌이익율.toFixed(1)}%</p>
                          <p>공헌이익: {formatCurrency(d.공헌이익)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" />
                  <Bar dataKey="공헌이익율" name="공헌이익율" radius={[0, 4, 4, 0]}>
                    {[...contribRanking].sort((a, b) => b.공헌이익율 - a.공헌이익율).map((entry, i) => (
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
              formula="비용 구성 = 원재료비 + 상품매입 + 외주가공비 + 운반비 + 지급수수료 + 노무비 + 기타변동비 + 고정비"
              description="각 담당자의 매출을 만들기 위해 들어간 비용을 8가지 항목으로 나누어 쌓아 보여줍니다. 어떤 비용이 가장 큰 비중을 차지하는지, 담당자별로 비용 구조가 어떻게 다른지 한눈에 비교할 수 있습니다."
              benchmark="원재료비 비중 30% 이상이면 자체생산형, 상품매입 30% 이상이면 구매직납형 비용 구조"
              className="xl:col-span-2"
            >
              <div className="h-80 md:h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costBarData} layout="vertical" margin={{ left: 75 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} />
                    <RechartsTooltip
                      content={({ payload }) => {
                        if (!payload || payload.length === 0) return null;
                        const data = payload[0]?.payload;
                        return (
                          <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                            <p className="font-semibold mb-1">사번: {data?.사번}</p>
                            <p className="text-xs text-muted-foreground mb-2">조직: {data?.조직}</p>
                            {payload.map((p: any, i: number) => (
                              <p key={i} style={{ color: p.color }}>
                                {p.name}: {formatCurrency(Number(p.value))}
                              </p>
                            ))}
                          </div>
                        );
                      }}
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
              formula="원재료비율 30% 이상: 자체생산형, 상품매입 30% 이상: 구매직납형, 외주비율 20% 이상: 외주의존형, 그 외: 혼합형"
              description="각 담당자의 비용 구조를 분석하여 4가지 유형으로 자동 분류한 결과입니다. 자체생산형은 원재료를 직접 가공하는 유형, 구매직납형은 완제품을 사서 파는 유형, 외주의존형은 외부 업체에 가공을 맡기는 유형입니다. 비용 유형별로 원가 절감 전략이 다릅니다."
              benchmark="자체생산형은 원재료 단가 관리가, 구매직납형은 매입처 협상이, 외주의존형은 외주비 효율화가 핵심입니다"
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
            formula="비용 비율 = 해당 비용 나누기 매출액 곱하기 100"
            description="각 담당자의 원재료비율, 상품매입비율, 외주비율을 소속 조직의 평균값과 나란히 비교하는 표입니다. 조직 평균보다 크게 높은 항목(빨간색 표시)은 비용 절감이 필요한 영역이며, 원인 분석과 개선 조치가 필요합니다."
            benchmark="조직 평균 대비 5%p(퍼센트포인트) 이상 높으면 주의가 필요합니다"
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
                      <td className="p-2 font-mono text-xs">{r.id ? `${(r.org || "").trim()}_${r.id}`.substring(0, 15) : (r.org || "").substring(0, 15)}</td>
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
              formula="5개 축 = 매출원가율, 매출총이익율, 판관비율, 영업이익율, 공헌이익율"
              description="각 조직의 손익 구조를 5가지 비율 지표로 거미줄 모양의 레이더 차트에 표시합니다. 이익 관련 축(매출총이익율, 영업이익율, 공헌이익율)이 바깥쪽에 있을수록 수익성이 좋고, 비용 관련 축(매출원가율, 판관비율)이 안쪽에 있을수록 효율적입니다. 조직 간 수익 구조 차이를 직관적으로 비교할 수 있습니다."
              benchmark="매출총이익율 30% 이상, 영업이익율 10% 이상, 공헌이익율은 높을수록 양호"
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
              formula="달성률 = 실적 나누기 계획 곱하기 100"
              description="각 조직의 매출, 이익 등 주요 손익 항목이 연초 계획 대비 몇 % 달성했는지를 색상으로 한눈에 보여줍니다. 수익 항목(매출, 이익)은 달성률이 높을수록 녹색, 비용 항목(원가, 판관비)은 달성률이 낮을수록(예산 절감) 녹색으로 표시됩니다."
              benchmark="수익항목: 녹색 100% 이상 달성, 노랑 80~100%, 빨강 80% 미만 | 비용항목: 색상이 반대(낮을수록 좋음)"
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
                      const noplan = !isFinite(rate);
                      const displayRate = noplan ? "계획없음" : `${rate.toFixed(0)}%`;
                      const bg = getHeatmapBg(rate, m.isCostItem);
                      // 텍스트 색상: 밝은 배경(노랑)은 어두운 글자, 나머지는 흰 글자
                      const textColor = (bg === "#fbbf24") ? "text-gray-900" : "text-white";
                      return (
                        <div
                          key={m.name}
                          className={`min-w-[80px] flex-1 p-2 text-center text-xs font-mono font-medium rounded-sm m-0.5 ${textColor}`}
                          title={`계획: ${formatCurrency(m.plan, true)} | 실적: ${formatCurrency(m.actual, true)} | 차이: ${formatCurrency(m.gap, true)}`}
                          style={{ backgroundColor: bg }}
                        >
                          {displayRate}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Legend */}
                <div className="flex flex-wrap items-center gap-4 mt-3 px-2 text-xs text-muted-foreground">
                  <span className="font-medium">수익항목:</span>
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
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
                    80% 미만
                  </span>
                  <span className="mx-1">|</span>
                  <span className="font-medium">비용항목: 색상 반전</span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#6b7280" }} />
                    계획없음
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
              {profAnalysisIsFallback && (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                  조직 필터와 일치하는 유효 데이터가 없어 전체 데이터를 표시합니다. 원본 파일의 &apos;영업조직팀&apos; 필드를 확인하세요.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                  title="분석 품목 수"
                  value={productProfitability.length}
                  format="number"
                  icon={<Package className="h-5 w-5" />}
                  formula="동일 품목명으로 묶은 후 고유 품목 수 합계"
                  description="현재 수익성 분석 대상이 되는 전체 품목(제품/상품)의 수입니다. 품목이 많을수록 매출 포트폴리오가 다양합니다."
                />
                <KpiCard
                  title="최고 수익 품목"
                  value={productProfitability.length > 0 ? productProfitability[0].grossProfit : 0}
                  format="currency"
                  icon={<TrendingUp className="h-5 w-5" />}
                  formula="전체 품목 중 매출총이익(매출 - 원가)이 가장 큰 품목"
                  description={productProfitability.length > 0 ? `${productProfitability[0].product} (매출총이익율 ${productProfitability[0].grossMargin.toFixed(1)}%). 이 품목이 전체 이익에 가장 크게 기여하고 있습니다.` : "데이터 없음"}
                />
                <KpiCard
                  title="가중평균 매출총이익율"
                  value={(() => {
                    const totalSales = productProfitability.reduce((s, p) => s + p.sales, 0);
                    const totalGP = productProfitability.reduce((s, p) => s + p.grossProfit, 0);
                    return totalSales > 0 ? (totalGP / totalSales) * 100 : 0;
                  })()}
                  format="percent"
                  formula="가중평균 = 전체 매출총이익 합계 나누기 전체 매출액 합계 곱하기 100"
                  description="매출 규모가 큰 품목의 이익율이 더 많이 반영된 평균 이익율입니다. 단순 평균보다 실제 수익 구조를 더 정확하게 보여줍니다."
                  benchmark="제조업 평균 20~30%, 30% 이상이면 양호한 제품 포트폴리오"
                />
              </div>

              <ChartCard
                title="품목별 매출총이익 Top 15"
                formula="매출총이익 = 매출액 - 매출원가"
                description="매출총이익이 큰 순서대로 상위 15개 품목을 수평 막대로 보여줍니다. 녹색 막대는 이익을 내는 품목, 빨간색 막대는 원가가 매출보다 커서 손실이 발생하는 품목입니다. 손실 품목은 가격 인상이나 원가 절감 검토가 필요합니다."
                benchmark="양수(녹색)는 이익 품목, 음수(빨간색)는 손실 품목으로 원가 구조 점검 필요"
              >
                <ErrorBoundary>
                  <div className="h-80 md:h-[500px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={productProfitability.slice(0, 15).map((p) => ({
                          name: p.product.length > 10 ? p.product.substring(0, 10) + "..." : p.product,
                          fullName: p.product,
                          매출총이익: p.grossProfit,
                          매출총이익율: p.grossMargin,
                          매출액: p.sales,
                        }))}
                        layout="vertical"
                        margin={{ left: 90 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={85} />
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
                formula="매출총이익율 = 매출총이익 나누기 매출액 곱하기 100"
                description="각 거래처(고객사)별로 매출액, 매출총이익, 영업이익과 각각의 이익율, 취급 품목 수를 표로 정리합니다. 매출은 크지만 이익율이 낮은 거래처는 거래 조건 재협상이 필요하며, 이익율이 높은 거래처는 관계를 강화해야 합니다."
                benchmark="매출총이익율 30% 이상 양호, 영업이익율 10% 이상 양호. 음수 이익율은 거래 손실 발생 중"
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
            formula="가로축 = 영업이익율(%), 세로축 = 미수금 리스크 점수(0~100점)"
            description="각 조직의 수익성(영업이익율)과 미수금 회수 리스크를 동시에 비교하는 2차원 분석입니다. 오른쪽 아래에 위치할수록 수익은 높고 리스크는 낮은 이상적인 조직입니다. 리스크 점수는 미수금 잔액, 장기 미수 비율, 매출 대비 미수금 비율 등을 종합하여 산출합니다."
            benchmark="영업이익율 5% 기준선과 리스크 점수 40점 기준선으로 4개 사분면(스타, 안정형, 주의, 위험)으로 분류"
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
                      <LabelList dataKey="name" position="top" fontSize={10} offset={8} />
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

        {/* ────────── 분산분석 (3-Way Variance) ────────── */}
        <TabsContent value="variance" className="space-y-6">
          {/* Variance KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="총 차이" value={varianceSummary.totalVariance} format="currency" icon={<TrendingUp className="h-5 w-5" />} formula="총 차이 = 매출액 실적 - 매출액 계획" description="계획 대비 실제 매출이 얼마나 차이 나는지 보여줍니다. 양수면 계획 초과 달성, 음수면 계획 미달입니다." />
            <KpiCard title="가격차이" value={varianceSummary.priceVariance} format="currency" icon={<Target className="h-5 w-5" />} formula="가격차이 = (실적단가 - 계획단가) 곱하기 실적수량" description="판매 단가가 계획보다 높거나 낮아서 발생한 매출 차이입니다. 양수면 단가 인상 효과, 음수면 단가 하락으로 인한 매출 감소입니다." benchmark="가격차이가 음수이면 시장 가격 하락 또는 할인 판매가 원인일 수 있습니다" />
            <KpiCard title="수량차이" value={varianceSummary.volumeVariance} format="currency" icon={<Package className="h-5 w-5" />} formula="수량차이 = (실적수량 - 계획수량) 곱하기 계획단가" description="판매 수량이 계획보다 많거나 적어서 발생한 매출 차이입니다. 양수면 판매량 증가 효과, 음수면 판매 부진으로 인한 매출 감소입니다." benchmark="수량차이가 음수이면 영업력 강화나 마케팅 전략 점검이 필요합니다" />
            <KpiCard title="믹스차이" value={varianceSummary.mixVariance} format="currency" formula="믹스차이 = 총차이 - 가격차이 - 수량차이" description="제품 구성(판매 비중)이 변해서 발생한 나머지 차이입니다. 고수익 제품 비중이 늘면 양수, 저수익 제품 비중이 늘면 음수가 됩니다." benchmark="믹스차이가 음수이면 저수익 제품 판매 비중이 늘어난 것이므로 제품 포트폴리오 점검이 필요합니다" />
          </div>

          {/* 3-Way Variance Bar Chart */}
          <ChartCard title="3-Way 분산분석 분해" formula="총 차이 = 가격차이 + 수량차이 + 믹스차이" description="계획 대비 실적의 총 차이를 가격, 수량, 제품 구성(믹스) 3가지 원인으로 분해하여 보여줍니다. 어떤 요인이 매출 차이의 주된 원인인지 파악할 수 있어, 정확한 개선 방향을 수립하는 데 도움이 됩니다." benchmark="가장 큰 차이를 보이는 요인부터 우선적으로 개선 전략을 수립해야 합니다">
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: "가격차이", value: varianceSummary.priceVariance },
                  { name: "수량차이", value: varianceSummary.volumeVariance },
                  { name: "믹스차이", value: varianceSummary.mixVariance },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
                  <ReferenceLine y={0} stroke="#666" />
                  <Bar dataKey="value" name="차이 금액" radius={[4, 4, 0, 0]}>
                    {[varianceSummary.priceVariance, varianceSummary.volumeVariance, varianceSummary.mixVariance].map((val, i) => (
                      <Cell key={i} fill={val >= 0 ? CHART_COLORS[0] : CHART_COLORS[6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Org-level Variance */}
          <ChartCard title="조직별 분산 분석" formula="각 조직의 가격차이 + 수량차이 + 믹스차이를 누적 막대로 표시" description="조직별로 매출 차이의 원인을 가격, 수량, 믹스로 나누어 비교합니다. 어떤 조직이 어떤 원인으로 계획을 초과했거나 미달했는지 한눈에 파악할 수 있습니다. 누적 막대가 위로 갈수록 계획 초과, 아래로 갈수록 미달입니다." benchmark="조직마다 주된 차이 원인이 다르므로, 조직별 맞춤 개선 전략이 필요합니다">
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orgVariances.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="org" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#666" />
                  <Bar dataKey="priceVariance" name="가격차이" fill={CHART_COLORS[0]} stackId="v" />
                  <Bar dataKey="volumeVariance" name="수량차이" fill={CHART_COLORS[1]} stackId="v" />
                  <Bar dataKey="mixVariance" name="믹스차이" fill={CHART_COLORS[3]} stackId="v" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ────────── 손익분기 (Break-even / CVP) ────────── */}
        <TabsContent value="breakeven" className="space-y-6">
          {/* BEP KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="손익분기점(BEP) 매출" value={orgBreakeven.reduce((s, r) => s + (isFinite(r.bepSales) ? r.bepSales : 0), 0)} format="currency" formula="BEP 매출 = 고정비 나누기 (1 - 변동비율)" description="손익분기점(Break-Even Point) 매출액입니다. 이 금액 이상을 팔아야 비로소 이익이 발생합니다. BEP가 낮을수록 적은 매출로도 이익을 낼 수 있는 안정적인 구조입니다." benchmark="실제 매출이 BEP 매출보다 높으면 이익 구간, 낮으면 손실 구간입니다" />
            <KpiCard title="안전한계율" value={orgBreakeven.length > 0 ? orgBreakeven.reduce((s, r) => s + (isFinite(r.safetyMarginRate) ? r.safetyMarginRate : 0), 0) / orgBreakeven.length : 0} format="percent" formula="안전한계율 = (실적매출 - BEP매출) 나누기 실적매출 곱하기 100" description="현재 매출이 손익분기점보다 얼마나 여유가 있는지를 보여주는 비율입니다. 높을수록 매출이 다소 감소해도 이익을 유지할 수 있어 경영이 안전합니다." benchmark="20% 이상이면 안전, 10% 미만이면 매출 감소 시 적자 전환 위험이 높습니다" />
            <KpiCard title="공헌이익률" value={orgBreakeven.length > 0 ? orgBreakeven.reduce((s, r) => s + r.contributionMarginRatio, 0) / orgBreakeven.length * 100 : 0} format="percent" formula="공헌이익률 = (매출 - 변동비) 나누기 매출 곱하기 100" description="매출 100원당 고정비(임차료, 인건비 등)를 회수하는 데 기여하는 금액의 비율입니다. 공헌이익률이 높을수록 고정비를 빨리 회수하고 이익을 낼 수 있습니다." benchmark="공헌이익률이 높을수록 손익분기점이 낮아져 수익 구조가 안정적입니다" />
            <KpiCard title="분석 조직 수" value={orgBreakeven.length} format="number" description="손익분기점(BEP) 분석이 가능한 조직의 수입니다. 매출과 비용 데이터가 모두 있는 조직만 분석 대상에 포함됩니다." />
          </div>

          {/* BEP Chart */}
          {bepChartData.length > 0 && (
            <ChartCard title="손익분기점 도표" formula="손익분기점 = 매출선과 총비용선이 만나는 지점" description="가로축(매출)이 커질수록 매출선(파란선)과 총비용선(빨간선)이 어디서 만나는지 보여줍니다. 두 선이 만나는 교차점이 바로 손익분기점(BEP)이며, 이 지점을 넘어서면 이익이 발생합니다. 아래쪽 영역은 고정비를 나타냅니다." benchmark="매출선이 총비용선 위에 있으면 이익 구간, 아래에 있으면 손실 구간입니다">
              <div className="h-64 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={bepChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="revenue" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} label={{ value: "매출", position: "insideBottomRight", offset: -5, fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                    <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="매출" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="totalCost" name="총비용" stroke={CHART_COLORS[6]} strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="fixedCost" name="고정비" fill={CHART_COLORS[5]} fillOpacity={0.2} stroke="none" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          {/* Org-level BEP comparison */}
          <ChartCard title="조직별 손익분기점 비교" formula="안전한계율 = (실적매출 - BEP매출) 나누기 실적매출 곱하기 100" description="각 조직의 안전한계율을 수평 막대로 비교합니다. 안전한계율이 높을수록(녹색 영역) 매출이 줄어도 이익을 유지할 수 있어 안정적입니다. 빨간색 기준선(0%) 아래이면 현재 적자 상태, 녹색 안전선(20%) 이상이면 안전한 수익 구조입니다." benchmark="안전한계율 20% 이상(녹색 기준선): 안전, 0~20%: 주의, 0% 미만: 적자 상태">
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orgBreakeven.filter(r => isFinite(r.safetyMarginRate)).slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
                  <RechartsTooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} {...TOOLTIP_STYLE} />
                  <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" />
                  <ReferenceLine x={20} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "안전선", fontSize: 10 }} />
                  <Bar dataKey="safetyMarginRate" name="안전한계율" radius={[0, 4, 4, 0]}>
                    {orgBreakeven.filter(r => isFinite(r.safetyMarginRate)).slice(0, 10).map((r, i) => (
                      <Cell key={i} fill={r.safetyMarginRate >= 20 ? CHART_COLORS[0] : r.safetyMarginRate >= 0 ? CHART_COLORS[3] : CHART_COLORS[6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ────────── 시나리오 분석 (What-If) ────────── */}
        <TabsContent value="whatif" className="space-y-6">
          {/* Scenario Sliders */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">시나리오 파라미터 조정</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium">매출 변동: {scenarioParams.salesChangePercent > 0 ? "+" : ""}{scenarioParams.salesChangePercent}%</label>
                  <input type="range" min={-30} max={30} step={1} value={scenarioParams.salesChangePercent}
                    onChange={(e) => setScenarioParams(p => ({ ...p, salesChangePercent: Number(e.target.value) }))}
                    className="w-full accent-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">원가율 변동: {scenarioParams.costRateChangePoints > 0 ? "+" : ""}{scenarioParams.costRateChangePoints}%p</label>
                  <input type="range" min={-10} max={10} step={0.5} value={scenarioParams.costRateChangePoints}
                    onChange={(e) => setScenarioParams(p => ({ ...p, costRateChangePoints: Number(e.target.value) }))}
                    className="w-full accent-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">판관비 변동: {scenarioParams.sgaChangePercent > 0 ? "+" : ""}{scenarioParams.sgaChangePercent}%</label>
                  <input type="range" min={-30} max={30} step={1} value={scenarioParams.sgaChangePercent}
                    onChange={(e) => setScenarioParams(p => ({ ...p, sgaChangePercent: Number(e.target.value) }))}
                    className="w-full accent-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scenario KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="시나리오 매출" value={scenarioSummary.scenarioTotalSales} previousValue={scenarioSummary.baseTotalSales} format="currency" formula="시나리오 매출 = 기준 매출 곱하기 (1 + 매출 변동률)" description="위에서 설정한 매출 변동률을 적용했을 때의 예상 매출액입니다. 기준(Base) 매출 대비 증감 화살표로 변화를 확인할 수 있습니다." />
            <KpiCard title="시나리오 영업이익" value={scenarioSummary.scenarioTotalOperatingProfit} previousValue={scenarioSummary.baseTotalOperatingProfit} format="currency" formula="시나리오 영업이익 = 시나리오 매출 - 시나리오 원가 - 시나리오 판관비" description="매출, 원가율, 판관비를 모두 변동시켰을 때의 예상 영업이익입니다. 기준 대비 얼마나 이익이 늘거나 줄어드는지 보여줍니다." />
            <KpiCard title="시나리오 영업이익율" value={scenarioSummary.scenarioAvgMargin} previousValue={scenarioSummary.baseAvgMargin} format="percent" formula="시나리오 영업이익율 = 시나리오 영업이익 나누기 시나리오 매출 곱하기 100" description="시나리오 적용 후 예상되는 영업이익율입니다. 기준 대비 이익율 변화를 통해 수익 구조 변화를 확인할 수 있습니다." />
            <KpiCard title="분석 조직 수" value={scenarioResults.length} format="number" description="시나리오 분석 대상이 되는 조직의 수입니다." />
          </div>

          {/* Base vs Scenario comparison bar */}
          <ChartCard title="조직별 Base vs 시나리오 영업이익" formula="회색 막대 = 기준(Base) 영업이익, 파란 막대 = 시나리오 영업이익" description="각 조직의 현재 영업이익(Base)과 시나리오 적용 후 예상 영업이익을 나란히 비교합니다. 두 막대 차이가 클수록 해당 시나리오 변수에 민감한 조직이며, 시나리오 막대가 더 크면 개선 효과, 더 작으면 악화 효과입니다." benchmark="시나리오 막대가 Base보다 크면 긍정적 효과, 작으면 부정적 효과입니다">
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scenarioResults.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="org" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip formatter={(v: any) => formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="baseOperatingProfit" name="Base" fill={CHART_COLORS[5]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scenarioOperatingProfit" name="시나리오" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Sensitivity chart */}
          <ChartCard title="매출 변동 민감도 분석" formula="매출이 -20%에서 +20%까지 변할 때 영업이익과 영업이익율의 변화" description="매출이 일정 비율로 증가하거나 감소할 때 영업이익(막대)과 영업이익율(꺾은선)이 어떻게 변하는지 보여줍니다. 막대와 꺾은선의 기울기가 가파를수록 매출 변동에 민감한 수익 구조입니다. 매출 감소 시 영업이익이 급격히 줄어드는 구간을 주의해야 합니다." benchmark="매출 10% 감소 시에도 영업이익이 양수이면 비교적 안전한 수익 구조입니다">
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sensitivityData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="paramValue" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <RechartsTooltip formatter={(v: any, name: any) => name === "operatingMargin" ? `${Number(v).toFixed(1)}%` : formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="operatingProfit" name="영업이익" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="operatingMargin" name="영업이익율(%)" stroke={CHART_COLORS[3]} strokeWidth={2} yAxisId="right" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
