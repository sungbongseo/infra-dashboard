"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { ExportButton } from "@/components/dashboard/ExportButton";
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
import { TrendingUp, Target, Package, Users, Info, Calendar, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, filterByDateRange, filterOrgProfitLeafOnly, aggregateOrgProfit, aggregateToCustomerLevel, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import { calcPlanAchievementSummary, calcOrgAchievement, calcTopContributors, calcMarginDrift } from "@/lib/analysis/planAchievement";
import { calcOrgBreakeven, calcOrgBreakevenFromTeam, calcBreakevenChart } from "@/lib/analysis/breakeven";
import { calcMarginErosion } from "@/lib/analysis/detailedProfitAnalysis";
import { RiskTab } from "./tabs/RiskTab";
import { WhatIfTab } from "./tabs/WhatIfTab";
import { CustProfitTab } from "./tabs/CustProfitTab";
import { CustItemTab } from "./tabs/CustItemTab";

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

// ─── 상수: 컴포넌트 밖으로 호이스팅 ──────────────────────────────
const COST_KEYS = ["원재료비", "상품매입", "외주가공비", "운반비", "지급수수료", "노무비", "기타변동비", "고정비"] as const;

export default function ProfitabilityPage() {
  const orgProfit = useDataStore((s) => s.orgProfit);
  const teamContribution = useDataStore((s) => s.teamContribution);
  const profitabilityAnalysis = useDataStore((s) => s.profitabilityAnalysis);
  const receivableAging = useDataStore((s) => s.receivableAging);
  const salesList = useDataStore((s) => s.salesList);
  const orgNames = useDataStore((s) => s.orgNames);
  const orgCustomerProfit = useDataStore((s) => s.orgCustomerProfit);
  const hqCustomerItemProfit = useDataStore((s) => s.hqCustomerItemProfit);
  const customerItemDetail = useDataStore((s) => s.customerItemDetail);
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
  const { filteredProfAnalysis, profAnalysisIsFallback } = useMemo(() => {
    const filtered = filterByOrg(profitabilityAnalysis, effectiveOrgNames, "영업조직팀");
    const hasSales = filtered.some((r) => r.매출액?.실적 !== 0);
    const isFallback = profitabilityAnalysis.length > 0 && filtered.length > 0 && !hasSales;
    const data = (filtered.length > 0 && hasSales) ? filtered
      : isFallback ? profitabilityAnalysis
      : filtered;
    return { filteredProfAnalysis: data, profAnalysisIsFallback: isFallback };
  }, [profitabilityAnalysis, effectiveOrgNames]);
  const filteredSales = useMemo(() => filterByDateRange(filterByOrg(salesList, effectiveOrgNames), dateRange, "매출일"), [salesList, effectiveOrgNames, dateRange]);
  const allReceivableRecords = useMemo(() => Array.from(receivableAging.values()).flat(), [receivableAging]);

  // ─── 신규 데이터 타입 필터링 ──────────────────────────────
  const filteredOrgCustProfit = useMemo(() => filterByOrg(orgCustomerProfit, effectiveOrgNames, "영업조직팀"), [orgCustomerProfit, effectiveOrgNames]);
  const filteredHqCustItemProfit = useMemo(() => filterByOrg(hqCustomerItemProfit, effectiveOrgNames, "영업조직팀"), [hqCustomerItemProfit, effectiveOrgNames]);

  // ─── customerItemDetail 기간 필터 (스마트 데이터소스) ──────────────────
  const filteredCustItemDetail = useMemo(() => {
    const orgFiltered = filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀");
    if (!dateRange || !dateRange.from || !dateRange.to) return orgFiltered;
    return filterByDateRange(orgFiltered, dateRange, "매출연월");
  }, [customerItemDetail, effectiveOrgNames, dateRange]);

  // 기간 필터가 활성 + customerItemDetail 데이터 존재 시 스마트 데이터소스 사용
  const isDateFilterActive = !!(dateRange?.from && dateRange?.to);
  const hasCustItemData = filteredCustItemDetail.length > 0;
  const isUsingDateFiltered = isDateFilterActive && hasCustItemData;

  // 스마트 데이터소스: 기간필터 활성 시 customerItemDetail 기반, 아닌 경우 기존 소스
  const effectiveProfAnalysis = useMemo(() => {
    if (isUsingDateFiltered) return filteredCustItemDetail as any[];
    return filteredProfAnalysis;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredProfAnalysis]);

  const effectiveHqCustItemProfit = useMemo(() => {
    if (isUsingDateFiltered) return filteredCustItemDetail as any[];
    return filteredHqCustItemProfit;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredHqCustItemProfit]);

  const effectiveOrgCustProfit = useMemo(() => {
    if (isUsingDateFiltered) return aggregateToCustomerLevel(filteredCustItemDetail);
    return filteredOrgCustProfit;
  }, [isUsingDateFiltered, filteredCustItemDetail, filteredOrgCustProfit]);

  const hasData = filteredOrgProfit.length > 0 || filteredOrgCustProfit.length > 0 || filteredHqCustItemProfit.length > 0 || hasCustItemData;

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

  // ─── 기여도율 순 정렬 (공헌이익율 차트용) ──────────────────────────────
  const contribByRate = useMemo(
    () => [...contribRanking].sort((a, b) => b.공헌이익율 - a.공헌이익율),
    [contribRanking]
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

  // ─── 제품/거래처 수익성 분석 (스마트 데이터소스 활용) ──────
  const productProfitability = useMemo(
    () => calcProductProfitability(effectiveProfAnalysis),
    [effectiveProfAnalysis]
  );

  const customerProfitability = useMemo(
    () => calcCustomerProfitability(effectiveProfAnalysis),
    [effectiveProfAnalysis]
  );

  // ─── 계획 달성 분석 (Plan Achievement, 스마트 데이터소스) ──────────────────
  const planSummary = useMemo(() => calcPlanAchievementSummary(effectiveProfAnalysis), [effectiveProfAnalysis]);
  const orgAchievement = useMemo(() => calcOrgAchievement(effectiveProfAnalysis), [effectiveProfAnalysis]);
  const topContributors = useMemo(() => calcTopContributors(effectiveProfAnalysis, 10), [effectiveProfAnalysis]);
  const marginDriftItems = useMemo(() => calcMarginDrift(effectiveProfAnalysis, 15), [effectiveProfAnalysis]);

  // ─── 손익분기점 (Break-even / CVP) ──────────────────────────────
  // teamContribution 데이터가 있으면 정확한 판관고정 3항목을 직접 사용 (더 정확)
  const bepFromTeam = filteredTeamContribution.length > 0;
  const orgBreakeven = useMemo(() => {
    if (filteredTeamContribution.length > 0) {
      return calcOrgBreakevenFromTeam(filteredTeamContribution);
    }
    return calcOrgBreakeven(filteredOrgProfit);
  }, [filteredTeamContribution, filteredOrgProfit]);

  const bepChartData = useMemo(() => {
    if (orgBreakeven.length === 0) return [];
    const totalFixed = orgBreakeven.reduce((s, r) => s + r.fixedCosts, 0);
    const totalSales = orgBreakeven.reduce((s, r) => s + r.sales, 0);
    const totalVariable = orgBreakeven.reduce((s, r) => s + r.variableCosts, 0);
    const varRatio = totalSales > 0 ? totalVariable / totalSales : 0;
    return calcBreakevenChart(totalFixed, varRatio, totalSales * 1.3);
  }, [orgBreakeven]);

  // ─── 마진 침식 분석 (profitabilityAnalysis 기반 → product tab) ──────────────────
  const marginErosion = useMemo(() => calcMarginErosion(effectiveProfAnalysis, "product", 20), [effectiveProfAnalysis]);

  // ─── KPI 합계 ──────────────────────────────
  const { totalGP, totalContrib, opRate, gpRate } = useMemo(() => {
    const sales = filteredOrgProfit.reduce((s, r) => s + r.매출액.실적, 0);
    const op = filteredOrgProfit.reduce((s, r) => s + r.영업이익.실적, 0);
    const gp = filteredOrgProfit.reduce((s, r) => s + r.매출총이익.실적, 0);
    const contrib = filteredOrgProfit.reduce((s, r) => s + r.공헌이익.실적, 0);
    return {
      totalGP: gp, totalContrib: contrib,
      opRate: sales > 0 ? (op / sales) * 100 : 0,
      gpRate: sales > 0 ? (gp / sales) * 100 : 0,
    };
  }, [filteredOrgProfit]);

  // ─── 품목 가중평균 매출총이익율 ──────────────────────────────
  const productWeightedGPRate = useMemo(() => {
    const s = productProfitability.reduce((sum, p) => sum + p.sales, 0);
    const g = productProfitability.reduce((sum, p) => sum + p.grossProfit, 0);
    return s > 0 ? (g / s) * 100 : 0;
  }, [productProfitability]);

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  const heatmapMetricNames = heatmapData.length > 0 ? heatmapData[0].metrics.map((m) => m.name) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">수익성 분석</h2>
          <p className="text-muted-foreground">손익 구조 및 조직별 수익성 비교</p>
        </div>
        <ExportButton
          data={filteredOrgProfit.map((r) => ({
            영업조직: r.영업조직팀,
            매출액_계획: r.매출액.계획,
            매출액_실적: r.매출액.실적,
            매출총이익_실적: r.매출총이익.실적,
            영업이익_실적: r.영업이익.실적,
            영업이익율: r.영업이익율.실적,
          }))}
          fileName="수익성분석"
          sheetName="조직별 수익성"
        />
      </div>

      <Tabs defaultValue="pnl" className="space-y-4">
        <TooltipProvider delayDuration={300}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="pnl">손익 현황</TabsTrigger>
          <TabsTrigger value="org">조직 수익성</TabsTrigger>
          <TabsTrigger value="contrib" disabled={filteredTeamContribution.length === 0}>팀원별 공헌이익</TabsTrigger>
          <TabsTrigger value="cost" disabled={filteredTeamContribution.length === 0}>비용 구조</TabsTrigger>
          <TabsTrigger value="plan" disabled={filteredOrgProfit.length === 0}>계획 달성</TabsTrigger>
          <TabsTrigger value="product" disabled={effectiveProfAnalysis.length === 0}>
            제품 수익성{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
          <TabsTrigger value="risk" disabled={filteredOrgProfit.length === 0}>수익성x리스크</TabsTrigger>
          <TabsTrigger value="variance" disabled={effectiveProfAnalysis.length === 0}>
            계획 달성 분석{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
          <TabsTrigger value="breakeven" disabled={filteredOrgProfit.length === 0}>손익분기</TabsTrigger>
          <TabsTrigger value="whatif" disabled={filteredOrgProfit.length === 0}>시나리오</TabsTrigger>
          <TabsTrigger value="custProfit" disabled={effectiveOrgCustProfit.length === 0}>
            거래처 손익{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
          <TabsTrigger value="custItem" disabled={effectiveHqCustItemProfit.length === 0}>
            거래처×품목{isUsingDateFiltered && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1 py-0.5 rounded">기간</span>}
          </TabsTrigger>
        </TabsList>
        </TooltipProvider>

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
              formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
              description="매출 100원당 원가를 빼고 남는 이익의 비율입니다. 이 비율이 높을수록 원가 관리를 잘하고 있다는 의미이며, 가격 경쟁력과 원가 효율성을 동시에 보여줍니다."
              benchmark="제조업 평균 20~30%, 30% 이상이면 원가 경쟁력 양호"
            />
            <KpiCard
              title="영업이익율"
              value={opRate}
              format="percent"
              formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100"
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
          {/* 팀원별 공헌이익 KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="분석 인원"
              value={contribRanking.length}
              format="number"
              icon={<Users className="h-5 w-5" />}
              formula="소계/합계 행을 제외한 실제 영업 담당자(사번 기준) 수"
              description="소계행을 제외한 실제 영업 담당자 수입니다."
              benchmark="인당 평균 매출이 1억 이상이면 적정 인력, 미만이면 인력 효율 점검"
            />
            <KpiCard
              title="1인당 평균 공헌이익"
              value={contribRanking.length > 0 ? contribRanking.reduce((s, r) => s + r.공헌이익, 0) / contribRanking.length : 0}
              format="currency"
              formula="1인당 평균 공헌이익 = 전체 공헌이익 합계 ÷ 분석 인원 수"
              description="전체 공헌이익을 담당자 수로 나눈 평균입니다."
              benchmark="인당 공헌이익이 양수면 고정비 회수에 기여, 음수면 해당 인력의 수익성 점검 필요"
            />
            <KpiCard
              title="최고 성과자"
              value={contribRanking.length > 0 ? contribRanking[0].공헌이익 : 0}
              format="currency"
              formula="공헌이익 기준 내림차순 정렬 시 1위 담당자의 공헌이익"
              description={contribRanking.length > 0 ? `${contribRanking[0].org} ${contribRanking[0].사번}` : "-"}
              benchmark="최고 성과자 1인의 비중이 전체의 30% 이상이면 인력 의존도 리스크"
            />
            <KpiCard
              title="평균 공헌이익율"
              value={contribRanking.length > 0 ? contribRanking.reduce((s, r) => s + r.공헌이익율, 0) / contribRanking.length : 0}
              format="percent"
              description="담당자별 공헌이익율의 산술 평균입니다. 20% 이상이면 양호합니다."
              benchmark="20% 이상 양호, 음수이면 변동비가 매출보다 큰 적자 상태"
            />
          </div>

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
              formula="비중(%) = 해당 조직의 공헌이익 ÷ 전체 공헌이익 × 100"
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
            formula="공헌이익율(%) = 공헌이익 ÷ 매출액 × 100"
            description="각 담당자의 매출 100원당 변동비를 빼고 남는 이익 비율입니다. 공헌이익율이 높을수록 적은 매출로도 고정비 회수에 크게 기여하며, 변동비 관리를 효율적으로 하고 있다는 의미입니다."
            benchmark="공헌이익율 20% 이상이면 양호, 음수인 경우 매출보다 변동비가 더 큰 적자 상태"
          >
            <div style={{ height: Math.max(320, contribByRate.length * 28 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contribByRate} layout="vertical" margin={{ left: 90 }}>
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
                    {contribByRate.map((entry, i) => (
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
                    {COST_KEYS.map((key) => (
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
            formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
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
                      <td className={`p-2 text-right font-mono text-xs ${r.원재료비율 > r.orgAvg.원재료비율 + 5 ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}>
                        {r.원재료비율.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{r.orgAvg.원재료비율.toFixed(1)}%</td>
                      <td className={`p-2 text-right font-mono text-xs ${r.상품매입비율 > r.orgAvg.상품매입비율 + 5 ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}>
                        {r.상품매입비율.toFixed(1)}%
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">{r.orgAvg.상품매입비율.toFixed(1)}%</td>
                      <td className={`p-2 text-right font-mono text-xs ${r.외주비율 > r.orgAvg.외주비율 + 5 ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}>
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
              formula="달성률(%) = 실적 ÷ 계획 × 100"
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
          {effectiveProfAnalysis.length > 0 ? (
            <>
              {isUsingDateFiltered && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                  기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
                </div>
              )}
              {!isUsingDateFiltered && profAnalysisIsFallback && (
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
                  benchmark="품목 수가 많을수록 매출 다각화가 되어 있으나, 관리 복잡도도 증가합니다"
                />
                <KpiCard
                  title="최고 수익 품목"
                  value={productProfitability.length > 0 ? productProfitability[0].grossProfit : 0}
                  format="currency"
                  icon={<TrendingUp className="h-5 w-5" />}
                  formula="전체 품목 중 매출총이익(매출 - 원가)이 가장 큰 품목"
                  description={productProfitability.length > 0 ? `${productProfitability[0].product} (매출총이익율 ${productProfitability[0].grossMargin.toFixed(1)}%). 이 품목이 전체 이익에 가장 크게 기여하고 있습니다.` : "데이터 없음"}
                  benchmark="최고 수익 품목이 전체 이익의 50% 이상이면 제품 집중도가 높아 리스크 관리 필요"
                />
                <KpiCard
                  title="가중평균 매출총이익율"
                  value={productWeightedGPRate}
                  format="percent"
                  formula="가중평균 매출총이익율(%) = 전체 매출총이익 합계 ÷ 전체 매출액 합계 × 100"
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
                title="제품 포트폴리오 (매출 비중)"
                formula="매출 비중(%) = 각 품목 매출액 ÷ 전체 매출액 × 100"
                description="전체 매출에서 각 품목이 차지하는 비중을 원형 차트로 보여줍니다. 상위 10개 품목을 표시하며, 나머지는 '기타'로 묶습니다. 특정 품목 의존도가 너무 높으면 리스크가 크므로, 매출 포트폴리오를 다양화하는 것이 안정적입니다."
                benchmark="단일 품목 비중이 30% 이상이면 집중도가 높아 리스크 관리 필요"
              >
                <ErrorBoundary>
                  <div className="h-80 md:h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={(() => {
                            const top10 = productProfitability.slice(0, 10);
                            const others = productProfitability.slice(10);
                            const othersSales = others.reduce((s, p) => s + p.sales, 0);
                            const chartData = top10.map((p) => ({
                              name: p.product.length > 15 ? p.product.substring(0, 15) + "..." : p.product,
                              fullName: p.product,
                              value: p.sales,
                              margin: p.grossMargin,
                            }));
                            if (othersSales > 0) {
                              chartData.push({
                                name: "기타",
                                fullName: `기타 ${others.length}개 품목`,
                                value: othersSales,
                                margin: 0,
                              });
                            }
                            return chartData;
                          })()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(props: any) => {
                            const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
                            if (percent < 0.03) return null;
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                            const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                            const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="white"
                                textAnchor={x > cx ? "start" : "end"}
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight="bold"
                              >
                                {`${(percent * 100).toFixed(0)}%`}
                              </text>
                            );
                          }}
                          outerRadius={120}
                          dataKey="value"
                        >
                          {(() => {
                            const top10 = productProfitability.slice(0, 10);
                            const others = productProfitability.slice(10);
                            const othersSales = others.reduce((s, p) => s + p.sales, 0);
                            return top10.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            )).concat(
                              othersSales > 0 ? [<Cell key="cell-others" fill="hsl(0, 0%, 60%)" />] : []
                            );
                          })()}
                        </Pie>
                        <RechartsTooltip
                          content={({ payload }) => {
                            if (!payload || payload.length === 0) return null;
                            const d = payload[0]?.payload;
                            if (!d) return null;
                            const totalSales = productProfitability.reduce((s, p) => s + p.sales, 0);
                            const percent = totalSales > 0 ? (d.value / totalSales * 100) : 0;
                            return (
                              <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                                <p className="font-semibold mb-1">{d.fullName}</p>
                                <p>매출액: {formatCurrency(d.value)}</p>
                                <p>비중: {percent.toFixed(1)}%</p>
                                {d.name !== "기타" && <p>매출총이익율: {d.margin.toFixed(1)}%</p>}
                              </div>
                            );
                          }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          wrapperStyle={{ fontSize: "11px" }}
                          formatter={(value) => value.length > 20 ? value.substring(0, 20) + "..." : value}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ErrorBoundary>
              </ChartCard>

              <ChartCard
                title="거래처별 수익성 분석"
                formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
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
                          <td className={`p-2 text-right font-mono text-xs ${c.grossMargin >= 30 ? "text-emerald-600 dark:text-emerald-400" : c.grossMargin < 0 ? "text-red-500 dark:text-red-400" : ""}`}>
                            {formatPercent(c.grossMargin)}
                          </td>
                          <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.operatingProfit, true)}</td>
                          <td className={`p-2 text-right font-mono text-xs ${c.operatingMargin >= 10 ? "text-emerald-600 dark:text-emerald-400" : c.operatingMargin < 0 ? "text-red-500 dark:text-red-400" : ""}`}>
                            {formatPercent(c.operatingMargin)}
                          </td>
                          <td className="p-2 text-center text-xs">{c.productCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>

              {/* 마진 침식 분석 (profitabilityAnalysis 기반) */}
              {marginErosion.length > 0 && (
                <ChartCard
                  title="마진 침식 분석 (품목별 Top 20)"
                  formula="마진침식 = 실적 매출총이익율 - 계획 매출총이익율"
                  description="계획 대비 실적 매출총이익율이 크게 하락한 품목 상위 20개를 보여줍니다. 빨간색(음수)은 계획보다 마진이 악화된 것이며, 원가 상승·가격 하락·제품 믹스 변화 등이 원인일 수 있습니다. 영향액 = 실적매출 × 침식률로, 마진 악화로 인한 추정 이익 손실 금액입니다."
                  benchmark="마진 침식이 -5%p 이상이면 긴급 원인 분석이 필요합니다. 가격 재설정, 원가 절감, 또는 해당 품목 전략 재검토를 권장합니다."
                >
                  <ErrorBoundary>
                    <div className="h-80 md:h-[500px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={marginErosion.slice(0, 20)} layout="vertical" margin={{ left: 90 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                          <YAxis type="category" dataKey="name" width={85} tick={{ fontSize: 9 }} tickFormatter={(v) => String(v).substring(0, 12)} />
                          <RechartsTooltip
                            content={({ active, payload, label }: any) => {
                              if (!active || !payload?.length) return null;
                              const item = payload[0]?.payload;
                              if (!item) return null;
                              return (
                                <div style={{ ...TOOLTIP_STYLE.contentStyle, padding: 8 }}>
                                  <p className="font-semibold text-xs mb-1">{label}</p>
                                  <p className="text-xs">계획 이익율: {item.plannedMargin.toFixed(1)}%</p>
                                  <p className="text-xs">실적 이익율: {item.actualMargin.toFixed(1)}%</p>
                                  <p className={`text-xs ${item.erosion < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    침식: {item.erosion > 0 ? "+" : ""}{item.erosion.toFixed(1)}%p
                                  </p>
                                  <p className="text-xs">매출액: {formatCurrency(item.sales)}</p>
                                  <p className="text-xs font-medium">영향액: {formatCurrency(item.impactAmount)}</p>
                                </div>
                              );
                            }}
                          />
                          <ReferenceLine x={0} stroke="hsl(0, 0%, 50%)" />
                          <Bar dataKey="impactAmount" name="영향액" radius={[0, 4, 4, 0]}>
                            {marginErosion.slice(0, 20).map((item, idx) => (
                              <Cell key={idx} fill={item.impactAmount < 0 ? "#ef4444" : "#059669"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ErrorBoundary>
                </ChartCard>
              )}
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
          <RiskTab filteredOrgProfit={filteredOrgProfit} allReceivableRecords={allReceivableRecords} filteredSales={filteredSales} />
        </TabsContent>

        {/* ────────── 분산분석 (3-Way Variance) ────────── */}
        <TabsContent value="variance" className="space-y-6">
          {isUsingDateFiltered && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
            </div>
          )}
          {/* KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="매출 달성율"
              value={planSummary.salesAchievement}
              format="percent"
              icon={<Target className="h-5 w-5" />}
              formula="매출 달성율 = 매출액 실적 ÷ 매출액 계획 × 100"
              description={`계획 ${formatCurrency(planSummary.totalSalesPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalSalesActual, true)}의 달성 비율입니다.`}
              benchmark="100% 이상이면 계획 초과 달성, 미만이면 미달입니다"
            />
            <KpiCard
              title="매출 차이"
              value={planSummary.salesGap}
              format="currency"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="매출 차이 = 매출 실적 - 매출 계획"
              description="계획 대비 매출의 절대 금액 차이입니다. 양수면 초과 달성, 음수면 미달입니다."
              benchmark="양수면 계획 초과로 긍정적, 음수의 절대값이 계획의 20% 이상이면 계획 수정 검토"
            />
            <KpiCard
              title="매출총이익 달성율"
              value={planSummary.gpAchievement}
              format="percent"
              formula="매출총이익 달성율 = 매출총이익 실적 ÷ 매출총이익 계획 × 100"
              description={`계획 매출총이익 ${formatCurrency(planSummary.totalGPPlan, true)} 대비 실적 ${formatCurrency(planSummary.totalGPActual, true)}의 달성율입니다.`}
              benchmark="매출 달성율과 함께 비교하여 매출총이익 달성율이 더 낮다면 원가율 악화 신호"
            />
            <KpiCard
              title="이익율 변동"
              value={planSummary.marginDrift}
              format="percent"
              icon={<AlertTriangle className="h-5 w-5" />}
              formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
              description={`계획 이익율 ${planSummary.plannedGPRate.toFixed(1)}% → 실적 ${planSummary.actualGPRate.toFixed(1)}%. ${planSummary.marginDrift >= 0 ? "이익율 개선" : "이익율 악화"}을 의미합니다.`}
              benchmark="양수면 원가 절감 또는 고마진 제품 비중 증가, 음수면 원가 상승 또는 저마진 판매 증가"
            />
          </div>

          {/* 조직별 매출 달성율 */}
          <ChartCard
            title="조직별 매출 달성율"
            formula="달성율 = 실적 ÷ 계획 × 100"
            description="각 조직의 매출 계획 달성율을 비교합니다. 100% 기준선을 넘으면 초과 달성, 미달이면 추가 영업 노력이 필요합니다."
            benchmark="100% 기준선: 달성, 빨간 막대는 미달 조직"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orgAchievement} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
                  <RechartsTooltip
                    content={({ payload }) => {
                      if (!payload || payload.length === 0) return null;
                      const d = payload[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                          <p className="font-semibold mb-1">{d.org}</p>
                          <p>매출 계획: {formatCurrency(d.salesPlan)}</p>
                          <p>매출 실적: {formatCurrency(d.salesActual)}</p>
                          <p>달성율: {d.salesAchievement.toFixed(1)}%</p>
                          <p>차이: {formatCurrency(d.salesGap)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={100} stroke="#666" strokeDasharray="3 3" label={{ value: "100%", fontSize: 10 }} />
                  <Bar dataKey="salesAchievement" name="매출달성율" radius={[0, 4, 4, 0]}>
                    {orgAchievement.map((r, i) => (
                      <Cell key={i} fill={r.salesAchievement >= 100 ? CHART_COLORS[0] : r.salesAchievement >= 80 ? CHART_COLORS[3] : CHART_COLORS[6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* 조직별 이익율 변동 (계획 vs 실적) */}
          <ChartCard
            title="조직별 이익율 변동 (계획 → 실적)"
            formula="이익율 변동 = 실적 매출총이익율 - 계획 매출총이익율"
            description="각 조직의 계획 매출총이익율(회색)과 실적(파란색)을 비교합니다. 실적이 계획보다 낮으면 이익율이 악화된 것이며, 원가 상승이나 저마진 판매 증가가 원인일 수 있습니다."
            benchmark="실적(파란색)이 계획(회색)보다 높으면 이익율 개선"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orgAchievement}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="org" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                  <RechartsTooltip
                    formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                    {...TOOLTIP_STYLE}
                  />
                  <Legend />
                  <Bar dataKey="plannedGPRate" name="계획 이익율" fill={CHART_COLORS[5]} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualGPRate" name="실적 이익율" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Top 기여 / 악화 거래처 */}
          <div className="grid gap-4 md:grid-cols-2">
            <ChartCard
              title="매출 초과 달성 Top 10 거래처"
              formula="매출 차이 = 매출 실적 - 매출 계획, 상위 10건 정렬"
              description="계획 대비 매출이 가장 크게 늘어난 거래처입니다. 신규 거래 확보나 기존 거래 확대의 성과를 보여줍니다."
              benchmark="초과 달성 거래처의 성공 요인을 분석하여 타 거래처에 적용 검토"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="p-2 font-medium">거래처</th>
                      <th className="p-2 font-medium text-right">계획</th>
                      <th className="p-2 font-medium text-right">실적</th>
                      <th className="p-2 font-medium text-right">초과분</th>
                      <th className="p-2 font-medium text-right">이익율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topContributors.top.map((c) => (
                      <tr key={c.customer} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium text-xs">{c.customer.substring(0, 15)}</td>
                        <td className="p-2 text-right text-xs">{formatCurrency(c.salesPlan, true)}</td>
                        <td className="p-2 text-right text-xs">{formatCurrency(c.salesActual, true)}</td>
                        <td className="p-2 text-right text-xs text-green-600 dark:text-green-400">+{formatCurrency(c.salesGap, true)}</td>
                        <td className={`p-2 text-right text-xs ${c.gpMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.gpMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                          {c.gpMargin.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {topContributors.top.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">초과 달성 거래처 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ChartCard>

            <ChartCard
              title="매출 미달 Top 10 거래처"
              formula="매출 차이 = 매출 실적 - 매출 계획, 하위 10건 정렬"
              description="계획 대비 매출이 가장 크게 줄어든 거래처입니다. 거래 감소 원인 분석과 대응 전략이 필요합니다."
              benchmark="미달 거래처의 원인(경쟁사 이동, 수요 감소 등)을 파악하여 대응 전략 수립"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left">
                      <th className="p-2 font-medium">거래처</th>
                      <th className="p-2 font-medium text-right">계획</th>
                      <th className="p-2 font-medium text-right">실적</th>
                      <th className="p-2 font-medium text-right">미달분</th>
                      <th className="p-2 font-medium text-right">이익율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topContributors.bottom.map((c) => (
                      <tr key={c.customer} className="border-b hover:bg-muted/50">
                        <td className="p-2 font-medium text-xs">{c.customer.substring(0, 15)}</td>
                        <td className="p-2 text-right text-xs">{formatCurrency(c.salesPlan, true)}</td>
                        <td className="p-2 text-right text-xs">{formatCurrency(c.salesActual, true)}</td>
                        <td className="p-2 text-right text-xs text-red-600 dark:text-red-400">{formatCurrency(c.salesGap, true)}</td>
                        <td className={`p-2 text-right text-xs ${c.gpMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.gpMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                          {c.gpMargin.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {topContributors.bottom.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">미달 거래처 없음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>

          {/* 마진율 악화 거래처 */}
          <ChartCard
            title="이익율 악화 거래처 (영향액 기준)"
            formula="영향액 = 매출 실적 × (실적 이익율 - 계획 이익율) ÷ 100"
            description="계획 대비 매출총이익율이 하락하여 이익이 줄어든 거래처입니다. 영향액이 클수록 이익 손실이 크며, 원가 관리나 가격 정책 재검토가 필요합니다."
            benchmark="영향액이 -1억 이상이면 즉각적인 원인 분석과 대응이 필요합니다"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="p-2 font-medium">거래처</th>
                    <th className="p-2 font-medium text-right">매출 실적</th>
                    <th className="p-2 font-medium text-right">계획 이익율</th>
                    <th className="p-2 font-medium text-right">실적 이익율</th>
                    <th className="p-2 font-medium text-right">변동</th>
                    <th className="p-2 font-medium text-right">영향액</th>
                  </tr>
                </thead>
                <tbody>
                  {marginDriftItems.map((item) => (
                    <tr key={item.customer} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium text-xs">{item.customer.substring(0, 15)}</td>
                      <td className="p-2 text-right text-xs">{formatCurrency(item.salesActual, true)}</td>
                      <td className="p-2 text-right text-xs">{item.plannedGPRate.toFixed(1)}%</td>
                      <td className="p-2 text-right text-xs">{item.actualGPRate.toFixed(1)}%</td>
                      <td className={`p-2 text-right text-xs ${item.marginDrift >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                        {item.marginDrift >= 0 ? "+" : ""}{item.marginDrift.toFixed(1)}%p
                      </td>
                      <td className={`p-2 text-right text-xs ${item.driftImpact >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                        {formatCurrency(item.driftImpact, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ────────── 손익분기 (Break-even / CVP) ────────── */}
        <TabsContent value="breakeven" className="space-y-6">
          {/* 데이터 소스 안내 */}
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
            <Info className="h-4 w-4 flex-shrink-0" />
            <span>
              {bepFromTeam
                ? "고정비 산출: 팀원별 공헌이익 데이터의 판관고정 3항목(감가상각비 + 기타경비 + 노무비) 직접 합산 — 정확도 높음"
                : "고정비 산출: 조직별 손익 데이터에서 역산 (고정비 = 공헌이익 - 영업이익). 팀원별 공헌이익(401) 파일을 업로드하면 더 정확한 분석이 가능합니다."}
            </span>
          </div>

          {/* BEP KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="손익분기점(BEP) 매출" value={orgBreakeven.reduce((s, r) => s + (isFinite(r.bepSales) ? r.bepSales : 0), 0)} format="currency" formula="BEP 매출 = 고정비 ÷ (1 - 변동비율)" description="손익분기점(Break-Even Point) 매출액입니다. 이 금액 이상을 팔아야 비로소 이익이 발생합니다. BEP가 낮을수록 적은 매출로도 이익을 낼 수 있는 안정적인 구조입니다." benchmark="실제 매출이 BEP 매출보다 높으면 이익 구간, 낮으면 손실 구간입니다" />
            <KpiCard title="안전한계율" value={(() => { const finite = orgBreakeven.filter(r => isFinite(r.safetyMarginRate)); return finite.length > 0 ? finite.reduce((s, r) => s + r.safetyMarginRate, 0) / finite.length : 0; })()} format="percent" formula="안전한계율(%) = (실적매출 − BEP매출) ÷ 실적매출 × 100" description="현재 매출이 손익분기점보다 얼마나 여유가 있는지를 보여주는 비율입니다. 높을수록 매출이 다소 감소해도 이익을 유지할 수 있어 경영이 안전합니다." benchmark="20% 이상이면 안전, 10% 미만이면 매출 감소 시 적자 전환 위험이 높습니다" />
            <KpiCard title="공헌이익률" value={orgBreakeven.length > 0 ? orgBreakeven.reduce((s, r) => s + r.contributionMarginRatio, 0) / orgBreakeven.length * 100 : 0} format="percent" formula="공헌이익률 = (매출 - 변동비) ÷ 매출 × 100" description="매출 100원당 고정비(임차료, 인건비 등)를 회수하는 데 기여하는 금액의 비율입니다. 공헌이익률이 높을수록 고정비를 빨리 회수하고 이익을 낼 수 있습니다." benchmark="공헌이익률이 높을수록 손익분기점이 낮아져 수익 구조가 안정적입니다" />
            <KpiCard title="분석 조직 수" value={orgBreakeven.length} format="number" formula="손익 데이터에서 변동비/고정비 분리가 가능한 조직 수" description={`손익분기점(BEP) 분석이 가능한 조직 수입니다. 데이터 소스: ${bepFromTeam ? "팀원별 공헌이익(401)" : "조직별 손익(303)"}`} benchmark="전체 조직 대비 분석 가능 조직이 80% 이상이면 데이터 커버리지 양호" />
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
          <ChartCard title="조직별 손익분기점 비교" formula="안전한계율(%) = (실적매출 − BEP매출) ÷ 실적매출 × 100" description="각 조직의 안전한계율을 수평 막대로 비교합니다. 안전한계율이 높을수록(녹색 영역) 매출이 줄어도 이익을 유지할 수 있어 안정적입니다. 빨간색 기준선(0%) 아래이면 현재 적자 상태, 녹색 안전선(20%) 이상이면 안전한 수익 구조입니다." benchmark="안전한계율 20% 이상(녹색 기준선): 안전, 0~20%: 주의, 0% 미만: 적자 상태">
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
          <WhatIfTab filteredOrgProfit={filteredOrgProfit} />
        </TabsContent>

        {/* ────────── 거래처 손익 (OrgCustomerProfit) ────────── */}
        <TabsContent value="custProfit" className="space-y-6">
          <CustProfitTab effectiveOrgCustProfit={effectiveOrgCustProfit} effectiveProfAnalysis={effectiveProfAnalysis} isUsingDateFiltered={isUsingDateFiltered} dateRange={dateRange} />
        </TabsContent>

        {/* ────────── 거래처×품목 (HqCustomerItemProfit) ────────── */}
        <TabsContent value="custItem" className="space-y-6">
          <CustItemTab effectiveHqCustItemProfit={effectiveHqCustItemProfit} isUsingDateFiltered={isUsingDateFiltered} dateRange={dateRange} />
        </TabsContent>

      </Tabs>
    </div>
  );
}
