"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcPerformanceScores, calcCostEfficiency, calcRepTrend, calcRepProductPortfolio } from "@/lib/analysis/profiling";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
  Line,
  ComposedChart,
} from "recharts";
import { Users, Trophy, TrendingUp, Star, AlertTriangle, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { ReceivableAgingRecord } from "@/types";

export default function ProfilesPage() {
  const { salesList, orderList, collectionList, teamContribution, customerItemDetail, receivableAging, orgNames } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredSales = useMemo(() => {
    const byOrg = filterByOrg(salesList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "매출일");
  }, [salesList, effectiveOrgNames, dateRange]);
  const filteredOrders = useMemo(() => {
    const byOrg = filterByOrg(orderList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "수주일");
  }, [orderList, effectiveOrgNames, dateRange]);
  const filteredCollections = useMemo(() => {
    const byOrg = filterByOrg(collectionList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "수금일");
  }, [collectionList, effectiveOrgNames, dateRange]);
  const filteredTeamContribution = useMemo(() => filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀"), [teamContribution, effectiveOrgNames]);
  const filteredCustomerItemDetail = useMemo(() => filterByOrg(customerItemDetail, effectiveOrgNames, "영업조직팀"), [customerItemDetail, effectiveOrgNames]);

  // 미수채권연령: Map의 모든 values를 flat()하여 단일 배열로 + orgNames 필터
  const allAgingRecords: ReceivableAgingRecord[] = useMemo(() => {
    const allRecords: ReceivableAgingRecord[] = [];
    for (const records of Array.from(receivableAging.values())) {
      allRecords.push(...records);
    }
    return filterByOrg(allRecords, effectiveOrgNames, "영업조직");
  }, [receivableAging, effectiveOrgNames]);

  const hasAgingData = allAgingRecords.length > 0;

  const profiles = useMemo(
    () => calcPerformanceScores(
      filteredSales,
      filteredOrders,
      filteredCollections,
      filteredTeamContribution,
      hasAgingData ? allAgingRecords : undefined
    ),
    [filteredSales, filteredOrders, filteredCollections, filteredTeamContribution, allAgingRecords, hasAgingData]
  );

  const hasData = profiles.length > 0;
  const selected = selectedPerson ? profiles.find((p) => p.id === selectedPerson) : profiles[0];

  // 축별 만점 (5축이면 20, 4축이면 25)
  const axisMax = hasAgingData ? 20 : 25;

  const radarData = useMemo(() => {
    if (!selected) return [];
    const acc = { 매출: 0, 수주: 0, 수익성: 0, 수금: 0, 미수금건전성: 0 };
    for (const p of profiles) {
      acc.매출 += p.score.salesScore;
      acc.수주 += p.score.orderScore;
      acc.수익성 += p.score.profitScore;
      acc.수금 += p.score.collectionScore;
      acc.미수금건전성 += p.score.receivableScore;
    }
    const n = profiles.length || 1;
    const base = [
      { subject: "매출", value: selected.score.salesScore, avg: acc.매출 / n, fullMark: axisMax },
      { subject: "수주", value: selected.score.orderScore, avg: acc.수주 / n, fullMark: axisMax },
      { subject: "수익성", value: selected.score.profitScore, avg: acc.수익성 / n, fullMark: axisMax },
      { subject: "수금", value: selected.score.collectionScore, avg: acc.수금 / n, fullMark: axisMax },
    ];
    if (hasAgingData) {
      base.push({ subject: "미수금건전성", value: selected.score.receivableScore, avg: acc.미수금건전성 / n, fullMark: axisMax });
    }
    return base;
  }, [selected, profiles, axisMax, hasAgingData]);

  const rankingData = useMemo(
    () => profiles.slice(0, 20).map((p) => ({
      name: p.name || p.id,
      score: Math.round(p.score.totalScore * 10) / 10,
      isSelected: p.id === selected?.id,
    })),
    [profiles, selected]
  );

  // 선택된 사원의 상위 거래처 비중 파이차트 데이터
  const customerPieData = useMemo(() => {
    if (!selected || selected.topCustomers.length === 0) return [];
    const top5 = selected.topCustomers.slice(0, 5);
    const normalizeShare = (s: number) => (s > 1 ? s / 100 : s);
    const topShare = top5.reduce((sum, c) => sum + normalizeShare(c.share), 0);
    const result = top5.map((c, i) => ({
      name: c.name,
      value: Math.round(normalizeShare(c.share) * 1000) / 10,
      amount: c.amount,
      fill: CHART_COLORS[i % CHART_COLORS.length],
    }));
    if (topShare < 1) {
      result.push({
        name: "기타",
        value: Math.round((1 - topShare) * 1000) / 10,
        amount: 0,
        fill: "hsl(0, 0%, 75%)",
      });
    }
    return result;
  }, [selected]);

  // Tab 3: 비용 효율 분석
  const costEfficiencyData = useMemo(
    () => calcCostEfficiency(filteredTeamContribution),
    [filteredTeamContribution]
  );
  const selectedCostData = useMemo(
    () => selected ? costEfficiencyData.find((c) => c.personId === selected.id) : undefined,
    [costEfficiencyData, selected]
  );
  const orgAvgCost = useMemo(() => {
    if (!selectedCostData || costEfficiencyData.length === 0) return null;
    const sameOrg = costEfficiencyData.filter((c) => c.org === selectedCostData.org);
    if (sameOrg.length === 0) return null;
    const n = sameOrg.length;
    return {
      rawMaterialRate: sameOrg.reduce((s, c) => s + c.rawMaterialRate, 0) / n,
      purchaseRate: sameOrg.reduce((s, c) => s + c.purchaseRate, 0) / n,
      outsourcingRate: sameOrg.reduce((s, c) => s + c.outsourcingRate, 0) / n,
      variableCostRate: sameOrg.reduce((s, c) => s + c.variableCostRate, 0) / n,
      mfgVariableCostRate: sameOrg.reduce((s, c) => s + c.mfgVariableCostRate, 0) / n,
      fixedCostRate: sameOrg.reduce((s, c) => s + c.fixedCostRate, 0) / n,
    };
  }, [selectedCostData, costEfficiencyData]);

  // Tab 4: 실적 트렌드
  const repTrend = useMemo(
    () => selected ? calcRepTrend(filteredSales, filteredOrders, filteredCollections, selected.id) : null,
    [selected, filteredSales, filteredOrders, filteredCollections]
  );

  // Tab 5: 제품 포트폴리오
  const productPortfolio = useMemo(
    () => selected ? calcRepProductPortfolio(filteredCustomerItemDetail, selected.id) : null,
    [selected, filteredCustomerItemDetail]
  );

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  const formulaText = hasAgingData
    ? "매출 점수 = 개인 매출액 ÷ 조직 최대 매출 × 20\n수주 점수 = 개인 수주액 ÷ 조직 최대 수주 × 20\n수익성 점수 = 개인 공헌이익률 ÷ 조직 최대율 × 20\n수금 점수 = 수금율 × 20\n미수금건전성 = (1 − 장기연체비율) × 20"
    : "매출 점수 = 개인 매출액 ÷ 조직 최대 매출 × 25\n수주 점수 = 개인 수주액 ÷ 조직 최대 수주 × 25\n수익성 점수 = 개인 공헌이익률 ÷ 조직 최대율 × 25\n수금 점수 = 수금율 × 25";

  const descText = hasAgingData
    ? "5개 항목(매출/수주/수익성/수금/미수금건전성)을 각각 20점 만점으로 평가합니다. 파란색 영역이 개인 성과이고 점선이 조직 평균입니다. 레이더 차트가 둥글고 넓을수록 모든 항목에서 균형 잡힌 성과를 내고 있다는 뜻입니다."
    : "4개 항목(매출/수주/수익성/수금)을 각각 25점 만점으로 평가합니다. 파란색 영역이 개인 성과이고 점선이 조직 평균입니다. 레이더 차트가 둥글고 넓을수록 모든 항목에서 균형 잡힌 성과를 내고 있다는 뜻입니다.";

  const rankFormulaText = hasAgingData
    ? "총점 = 매출(20점) + 수주(20점) + 수익성(20점) + 수금(20점) + 미수금건전성(20점) = 100점 만점\n각 항목 점수 = 개인 값 ÷ 조직 최대 값 × 20"
    : "총점 = 매출(25점) + 수주(25점) + 수익성(25점) + 수금(25점) = 100점 만점\n각 항목 점수 = 개인 값 ÷ 조직 최대 값 × 25";

  // 비용 레이더 데이터 (개인 vs 조직 평균)
  const costRadarData = selectedCostData && orgAvgCost ? [
    { subject: "원재료비", value: selectedCostData.rawMaterialRate, avg: orgAvgCost.rawMaterialRate },
    { subject: "상품매입", value: selectedCostData.purchaseRate, avg: orgAvgCost.purchaseRate },
    { subject: "외주가공", value: selectedCostData.outsourcingRate, avg: orgAvgCost.outsourcingRate },
    { subject: "판관변동", value: selectedCostData.variableCostRate, avg: orgAvgCost.variableCostRate },
    { subject: "제조변동", value: selectedCostData.mfgVariableCostRate, avg: orgAvgCost.mfgVariableCostRate },
    { subject: "판관고정", value: selectedCostData.fixedCostRate, avg: orgAvgCost.fixedCostRate },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">영업사원 성과 프로파일</h2>
          <p className="text-muted-foreground">개인별 성과 스코어카드 및 동료 비교</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            data={profiles.map((p) => ({
              사번: p.id,
              이름: p.name,
              조직: p.org,
              총점: p.score.totalScore,
              매출점수: p.score.salesScore,
              수주점수: p.score.orderScore,
              수익성점수: p.score.profitScore,
              수금점수: p.score.collectionScore,
              ...(hasAgingData ? { 미수금건전성점수: p.score.receivableScore } : {}),
              매출액: p.salesAmount,
              수주액: p.orderAmount,
              수금액: p.collectionAmount,
              공헌이익율: p.contributionMarginRate,
              거래처수: p.customerCount,
              품목수: p.itemCount,
              HHI: p.hhi,
              HHI리스크: p.hhiRiskLevel,
            }))}
            fileName="영업사원_성과"
            sheetName="성과 프로파일"
          />
          <Select value={selected?.id || ""} onValueChange={setSelectedPerson}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="영업사원 선택" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name || p.id} ({p.org})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="performance">종합 성과</TabsTrigger>
          <TabsTrigger value="ranking">순위 / 거래처</TabsTrigger>
          <TabsTrigger value="cost">비용 효율</TabsTrigger>
          <TabsTrigger value="trend">실적 트렌드</TabsTrigger>
          <TabsTrigger value="product">제품 포트폴리오</TabsTrigger>
        </TabsList>

        {/* ══════════ Tab 1: 종합 성과 ══════════ */}
        <TabsContent value="performance" className="space-y-6">
          {selected && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${hasAgingData ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
              <Card className="lg:col-span-2">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="rounded-full bg-primary/10 p-3">
                      <Users className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-lg">{selected.name || selected.id}</p>
                      <p className="text-sm text-muted-foreground">{selected.org}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold">{selected.score.totalScore.toFixed(1)}</span>
                    <span className="text-sm text-muted-foreground">/ 100점</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={selected.score.percentile >= 80 ? "success" : selected.score.percentile >= 50 ? "secondary" : "warning"}>
                      상위 {(100 - selected.score.percentile).toFixed(0)}%
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {selected.score.rank}위 / {profiles.length}명
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">매출 점수</p>
                  <p className="text-xl font-bold">{selected.score.salesScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.salesAmount, true)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수주 점수</p>
                  <p className="text-xl font-bold">{selected.score.orderScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.orderAmount, true)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수익성 점수</p>
                  <p className="text-xl font-bold">{selected.score.profitScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatPercent(selected.contributionMarginRate)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수금 점수</p>
                  <p className="text-xl font-bold">{selected.score.collectionScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.collectionAmount, true)}</p>
                </CardContent>
              </Card>
              {hasAgingData && (
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">미수금 건전성</p>
                    <p className="text-xl font-bold">{selected.score.receivableScore.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">/{axisMax}</p>
                    <p className="text-xs mt-1">
                      <Badge variant={selected.score.receivableScore >= axisMax * 0.8 ? "success" : selected.score.receivableScore >= axisMax * 0.5 ? "warning" : "destructive"} className="text-[10px] px-1.5 py-0">
                        {selected.score.receivableScore >= axisMax * 0.8 ? "건전" : selected.score.receivableScore >= axisMax * 0.5 ? "주의" : "위험"}
                      </Badge>
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <ChartCard
            title="성과 레이더 차트"
            formula={formulaText}
            description={descText}
            benchmark="총점 70점 이상이면 우수, 50~70점이면 보통, 50점 미만이면 개선이 필요합니다"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid className="stroke-muted" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis angle={30} domain={[0, axisMax]} tick={{ fontSize: 10 }} />
                  <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                  <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.1} strokeDasharray="5 5" />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${Number(v).toFixed(1)}점`} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ══════════ Tab 2: 순위 / 거래처 ══════════ */}
        <TabsContent value="ranking" className="space-y-6">
          <ChartCard
            title="성과 점수 랭킹"
            formula={rankFormulaText}
            description="총 점수가 높은 순서대로 상위 20명의 순위를 보여줍니다. 현재 선택된 영업사원은 주황색으로 강조 표시됩니다. 자신의 상대적 위치와 동료들의 성과 수준을 한눈에 파악할 수 있습니다."
            benchmark="상위 20%는 핵심 인재로 관리하고, 하위 20%는 역량 개발 코칭이 필요합니다"
          >
            <div className="h-80 md:h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingData} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${v}점`} />
                  <Bar dataKey="score" name="총점" radius={[0, 4, 4, 0]}>
                    {rankingData.map((entry, i) => (
                      <Cell key={i} fill={entry.isSelected ? CHART_COLORS[3] : CHART_COLORS[0]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {selected && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Star className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">거래처 포트폴리오</p>
                    </div>
                    <p className="text-2xl font-bold">{selected.customerCount}</p>
                    <p className="text-xs text-muted-foreground">활성 거래처 수</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">품목 전문성</p>
                    </div>
                    <p className="text-2xl font-bold">{selected.itemCount}</p>
                    <p className="text-xs text-muted-foreground">취급 품목 수</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">공헌이익율</p>
                    </div>
                    <p className="text-2xl font-bold">{formatPercent(selected.contributionMarginRate)}</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.contributionMarginRate >= 40 ? "우수" : selected.contributionMarginRate >= 20 ? "보통" : "개선 필요"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <ChartCard
                title="거래처 집중도 - HHI(허핀달-허쉬만 지수)"
                formula="HHI = Σ(거래처 매출 비중²)\n거래처 매출 비중 = 거래처 매출 ÷ 담당자 총 매출"
                description="HHI(허핀달-허쉬만 지수)는 매출이 특정 거래처에 얼마나 집중되어 있는지 측정하는 지표입니다. 0에 가까우면 여러 거래처에 매출이 고르게 분산된 안정적인 상태이고, 1에 가까우면 소수 거래처에 의존도가 높아 리스크가 큽니다."
                benchmark="HHI가 0.25 초과이면 고위험(과점 상태), 0.15~0.25이면 적정 집중, 0.15 미만이면 분산(안정적)입니다"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">HHI 지수</p>
                        <p className="text-3xl font-bold">{selected.hhi.toFixed(3)}</p>
                      </div>
                      <Badge
                        variant={selected.hhiRiskLevel === "high" ? "destructive" : selected.hhiRiskLevel === "medium" ? "warning" : "success"}
                        className="text-sm px-3 py-1"
                      >
                        {selected.hhiRiskLevel === "high" && (<><AlertTriangle className="h-3.5 w-3.5 mr-1 inline" />고위험</>)}
                        {selected.hhiRiskLevel === "medium" && "적정 집중"}
                        {selected.hhiRiskLevel === "low" && "분산"}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">최대 거래처 비중</span>
                        <span className="font-medium">{formatPercent((selected.topCustomerShare > 1 ? selected.topCustomerShare : selected.topCustomerShare * 100))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">활성 거래처 수</span>
                        <span className="font-medium">{selected.customerCount}개</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0 (분산)</span>
                        <span>1 (독점)</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
                        <div className="absolute inset-y-0 left-0 bg-emerald-200 dark:bg-emerald-900" style={{ width: "15%" }} />
                        <div className="absolute inset-y-0 bg-amber-200 dark:bg-amber-900" style={{ left: "15%", width: "10%" }} />
                        <div className="absolute inset-y-0 bg-red-200 dark:bg-red-900" style={{ left: "25%", width: "75%" }} />
                        <div className="absolute inset-y-0 w-1 bg-foreground rounded-full" style={{ left: `${Math.min(selected.hhi * 100, 100)}%` }} />
                      </div>
                      <div className="flex text-[10px] text-muted-foreground">
                        <span className="flex-1">분산</span>
                        <span className="flex-1 text-center">적정</span>
                        <span className="flex-1 text-right">과점</span>
                      </div>
                    </div>
                    {selected.topCustomers.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <p className="text-sm font-medium">상위 거래처 매출 비중</p>
                        {selected.topCustomers.slice(0, 5).map((c, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="truncate max-w-[180px]">{c.name}</span>
                              <span className="font-medium ml-2">{formatPercent((c.share > 1 ? c.share : c.share * 100))}</span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(c.share * 100, 100)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="h-64 md:h-80">
                    {customerPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={customerPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} label={({ name, value }: any) => `${name} ${value}%`} labelLine={{ strokeWidth: 1 }}>
                            {customerPieData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                          </Pie>
                          <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any, props: any) => { const amt = props.payload?.amount; return amt ? [`${value}% (${formatCurrency(amt, true)})`, name] : [`${value}%`, name]; }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">거래처 데이터 없음</div>
                    )}
                  </div>
                </div>
              </ChartCard>
            </>
          )}
        </TabsContent>

        {/* ══════════ Tab 3: 비용 효율 ══════════ */}
        <TabsContent value="cost" className="space-y-6">
          {filteredTeamContribution.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                팀기여도 데이터가 업로드되지 않아 비용 효율 분석을 수행할 수 없습니다. 팀기여도 엑셀 파일을 업로드해 주세요.
              </p>
            </div>
          ) : (
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
                  />
                  <KpiCard
                    title="영업이익율"
                    value={selectedCostData.operatingMarginRate}
                    format="percent"
                    formula="영업이익율 = (매출액 - 매출원가 - 판관비) ÷ 매출액 × 100"
                    description="모든 영업 비용을 차감한 순수 영업 수익성입니다. 담당자의 실질 이익 창출 능력을 나타냅니다."
                    benchmark="10% 이상 양호, 5~10% 보통, 5% 미만 비용 구조 점검 필요"
                  />
                  <KpiCard
                    title="제조변동비율"
                    value={selectedCostData.mfgVariableCostRate}
                    format="percent"
                    formula="제조변동비율 = 제조변동비 ÷ 매출액 × 100"
                    description="매출 대비 제조변동비(원재료, 외주 등) 비중입니다. 높을수록 매출 원가 부담이 크다는 의미입니다."
                    benchmark="조직 평균 대비 5%p 이상 높으면 원가 절감 검토 필요"
                  />
                  <KpiCard
                    title="판관고정비율"
                    value={selectedCostData.fixedCostRate}
                    format="percent"
                    formula="판관고정비율 = 판관고정비 ÷ 매출액 × 100"
                    description="매출 대비 고정비(감가상각비, 경비, 노무비) 비중입니다. 매출이 줄어도 고정비는 변하지 않아 수익성에 직접 영향합니다."
                    benchmark="고정비율이 높으면 매출 감소 시 적자 전환 위험이 커집니다"
                  />
                </div>
              )}

              {costRadarData.length > 0 && (
                <ChartCard
                  title="비용 구조 레이더 (개인 vs 조직 평균)"
                  formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
                  description="개인의 비용 구조를 소속 조직의 평균값과 비교한 레이더 차트입니다. 파란색 영역(개인)이 점선(조직 평균)보다 안쪽이면 비용 관리가 효율적이라는 뜻이고, 바깥이면 해당 비용 항목의 개선이 필요합니다."
                  benchmark="개인의 비용 비율이 조직 평균보다 5%p 이상 높으면 비용 절감 검토가 필요합니다"
                >
                  <div className="h-72 md:h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={costRadarData}>
                        <PolarGrid className="stroke-muted" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis tick={{ fontSize: 10 }} />
                        <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                        <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[3]} fill={CHART_COLORS[3]} fillOpacity={0.1} strokeDasharray="5 5" />
                        <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                        <Legend />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              )}

              <ChartCard
                title="담당자별 비용 효율 비교"
                formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
                description="각 담당자의 주요 비용 항목 비율을 테이블로 비교합니다. 공헌이익율이 높고 비용 비율이 낮을수록 효율적인 영업을 하고 있다는 의미입니다."
                benchmark="공헌이익율 20% 이상이면 양호, 원재료비율이 50% 이상이면 원가 구조 점검 필요"
                action={<ExportButton data={costEfficiencyData.map((c) => ({
                  사번: c.personId, 조직: c.org, 매출액: c.salesAmount,
                  원재료비율: c.rawMaterialRate, 상품매입비율: c.purchaseRate, 외주비율: c.outsourcingRate,
                  판관변동비율: c.variableCostRate, 제조변동비율: c.mfgVariableCostRate, 판관고정비율: c.fixedCostRate,
                  공헌이익율: c.contributionMarginRate, 영업이익율: c.operatingMarginRate,
                }))} fileName="비용효율분석" />}
              >
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left">
                        <th className="p-2 font-medium">사번</th>
                        <th className="p-2 font-medium">조직</th>
                        <th className="p-2 font-medium text-right">매출액</th>
                        <th className="p-2 font-medium text-right">원재료비</th>
                        <th className="p-2 font-medium text-right">외주비</th>
                        <th className="p-2 font-medium text-right">판관변동</th>
                        <th className="p-2 font-medium text-right">판관고정</th>
                        <th className="p-2 font-medium text-right">공헌이익율</th>
                        <th className="p-2 font-medium text-right">영업이익율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costEfficiencyData.slice(0, 30).map((c, i) => (
                        <tr key={i} className={`border-b hover:bg-muted/50 ${c.personId === selected?.id ? "bg-primary/5" : ""}`}>
                          <td className="p-2 font-mono text-xs">{c.personId}</td>
                          <td className="p-2 text-xs">{c.org}</td>
                          <td className="p-2 text-right text-xs">{formatCurrency(c.salesAmount, true)}</td>
                          <td className="p-2 text-right text-xs">{c.rawMaterialRate.toFixed(1)}%</td>
                          <td className="p-2 text-right text-xs">{c.outsourcingRate.toFixed(1)}%</td>
                          <td className="p-2 text-right text-xs">{c.variableCostRate.toFixed(1)}%</td>
                          <td className="p-2 text-right text-xs">{c.fixedCostRate.toFixed(1)}%</td>
                          <td className={`p-2 text-right text-xs font-medium ${c.contributionMarginRate >= 30 ? "text-emerald-600 dark:text-emerald-400" : c.contributionMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{c.contributionMarginRate.toFixed(1)}%</td>
                          <td className={`p-2 text-right text-xs font-medium ${c.operatingMarginRate >= 10 ? "text-emerald-600 dark:text-emerald-400" : c.operatingMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{c.operatingMarginRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}
        </TabsContent>

        {/* ══════════ Tab 4: 실적 트렌드 ══════════ */}
        <TabsContent value="trend" className="space-y-6">
          {!repTrend ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                선택된 영업사원의 거래 이력이 충분하지 않아 트렌드를 분석할 수 없습니다.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  title="월평균 매출"
                  value={repTrend.avgMonthlySales}
                  format="currency"
                  formula="월평균 매출 = Σ(월별 매출액) ÷ 매출 발생 월수"
                  description="선택된 기간 내 월별 매출의 단순 평균입니다. 담당자의 평균적인 매출 규모를 나타냅니다."
                  benchmark="조직 내 매출 상위 20%와 비교하여 성장 잠재력 판단"
                />
                <KpiCard
                  title="월평균 수주"
                  value={repTrend.avgMonthlyOrders}
                  format="currency"
                  formula="월평균 수주 = Σ(월별 수주액) ÷ 수주 발생 월수"
                  description="월별 수주의 평균값입니다. 수주가 매출보다 높으면 파이프라인이 건전하다는 의미입니다."
                  benchmark="월평균 수주 ≥ 월평균 매출이면 성장 중, 미달이면 파이프라인 점검 필요"
                />
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">MoM 매출 성장률</p>
                    <p className={`text-xl font-bold ${repTrend.salesMoM >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {repTrend.salesMoM >= 0 ? "+" : ""}{repTrend.salesMoM.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">모멘텀</p>
                    <Badge variant={repTrend.momentum === "accelerating" ? "success" : repTrend.momentum === "stable" ? "secondary" : "destructive"} className="text-sm">
                      {repTrend.momentum === "accelerating" ? "성장 가속" : repTrend.momentum === "stable" ? "안정" : "감속"}
                    </Badge>
                  </CardContent>
                </Card>
              </div>

              <ChartCard
                title="월별 매출/수주/수금 추이"
                formula="월별 매출일/수주일/수금일 기준으로 장부금액을 합산"
                description="선택된 영업사원의 월별 매출(막대), 수주(막대), 수금(선) 추이를 보여줍니다. 수주가 매출보다 높으면 파이프라인이 건전하고, 수금이 매출을 따라가면 현금흐름이 양호합니다."
                benchmark="수주가 매출 이상이면 성장 중, 수금이 매출의 80% 이상이면 수금 관리 양호"
              >
                <div className="h-64 md:h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={repTrend.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                      <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar dataKey="sales" fill={CHART_COLORS[0]} name="매출" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="orders" fill={CHART_COLORS[1]} name="수주" radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="collections" stroke={CHART_COLORS[4]} strokeWidth={2} name="수금" dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </>
          )}
        </TabsContent>

        {/* ══════════ Tab 5: 제품 포트폴리오 ══════════ */}
        <TabsContent value="product" className="space-y-6">
          {filteredCustomerItemDetail.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                거래처별 품목별 손익(100) 데이터가 업로드되지 않아 제품 포트폴리오 분석을 수행할 수 없습니다.
              </p>
            </div>
          ) : !productPortfolio ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                선택된 영업사원의 품목 데이터가 없습니다.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">취급 품목 수</p>
                    </div>
                    <p className="text-2xl font-bold">{productPortfolio.totalProducts}</p>
                    <p className="text-xs text-muted-foreground">{productPortfolio.totalProductGroups}개 제품군</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">품목 집중도 (HHI)</p>
                    <p className="text-2xl font-bold">{productPortfolio.productConcentrationHHI.toFixed(3)}</p>
                    <Badge variant={productPortfolio.productConcentrationHHI > 0.25 ? "destructive" : productPortfolio.productConcentrationHHI > 0.15 ? "warning" : "success"} className="text-[10px] mt-1">
                      {productPortfolio.productConcentrationHHI > 0.25 ? "집중" : productPortfolio.productConcentrationHHI > 0.15 ? "적정" : "분산"}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">가중평균 마진</p>
                    <p className={`text-2xl font-bold ${productPortfolio.avgMarginByProduct >= 20 ? "text-emerald-600 dark:text-emerald-400" : productPortfolio.avgMarginByProduct >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                      {productPortfolio.avgMarginByProduct.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground">매출총이익율</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">Top 품목</p>
                    <p className="text-sm font-bold truncate">{productPortfolio.topProducts[0]?.productName || "-"}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      비중 {(productPortfolio.topProducts[0]?.sharePercent ?? 0).toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>
              </div>

              <ChartCard
                title="품목별 매출 비중 (Top 10)"
                formula="매출 비중(%) = 품목 매출액 ÷ 담당자 총 매출 × 100"
                description="담당자가 취급하는 품목 중 매출 상위 10개를 원형 차트로 보여줍니다. 특정 품목에 과도하게 집중되어 있으면 해당 품목 수요 변화에 취약합니다."
                benchmark="단일 품목 비중 30% 이상이면 집중 리스크가 있으므로 포트폴리오 다변화 검토 필요"
              >
                <div className="h-72 md:h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={productPortfolio.topProducts.slice(0, 10).map((p) => ({ name: p.productName || p.product, value: Math.round(p.sharePercent * 10) / 10 }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={120}
                        label={(props: any) => `${props.name} ${props.value}%`}
                      >
                        {productPortfolio.topProducts.slice(0, 10).map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="품목별 수익성 분석"
                formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
                description="각 품목의 매출액, 매출총이익, 이익율을 정리합니다. 매출은 크지만 이익율이 낮은 품목은 가격 또는 원가 구조 개선이 필요합니다."
                benchmark="매출총이익율 25% 이상이면 양호, 10% 미만이면 가격 또는 원가 재검토 필요"
                action={<ExportButton data={productPortfolio.productMix.map((p) => ({
                  품목: p.product, 품목명: p.productName, 제품군: p.productGroup,
                  매출액: p.salesAmount, 매출총이익: p.grossProfit,
                  매출총이익율: p.grossMarginRate, 매출비중: p.sharePercent,
                }))} fileName="제품포트폴리오" />}
              >
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background">
                      <tr className="border-b text-left">
                        <th className="p-2 font-medium">품목명</th>
                        <th className="p-2 font-medium">제품군</th>
                        <th className="p-2 font-medium text-right">매출액</th>
                        <th className="p-2 font-medium text-right">매출총이익</th>
                        <th className="p-2 font-medium text-right">이익율</th>
                        <th className="p-2 font-medium text-right">비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productPortfolio.productMix.slice(0, 30).map((p, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50">
                          <td className="p-2 text-xs truncate max-w-[200px]">{p.productName || p.product}</td>
                          <td className="p-2 text-xs">{p.productGroup}</td>
                          <td className="p-2 text-right text-xs">{formatCurrency(p.salesAmount, true)}</td>
                          <td className="p-2 text-right text-xs">{formatCurrency(p.grossProfit, true)}</td>
                          <td className={`p-2 text-right text-xs font-medium ${p.grossMarginRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : p.grossMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{p.grossMarginRate.toFixed(1)}%</td>
                          <td className="p-2 text-right text-xs">{p.sharePercent.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ChartCard>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
