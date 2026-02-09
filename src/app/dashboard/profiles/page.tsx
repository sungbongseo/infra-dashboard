"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcPerformanceScores } from "@/lib/analysis/profiling";
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
} from "recharts";
import { Users, Trophy, TrendingUp, Star, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { ReceivableAgingRecord } from "@/types";

export default function ProfilesPage() {
  const { salesList, orderList, collectionList, teamContribution, receivableAging, orgNames } = useDataStore();
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
    // share는 0~1 범위의 소수. 1 초과인 경우 이미 백분율이므로 보정
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

  if (isLoading) return <PageSkeleton />;
  if (!hasData) return <EmptyState />;

  const formulaText = hasAgingData
    ? "매출 점수 = 개인 매출액 나누기 조직 최대 매출, 곱하기 20\n수주 점수 = 개인 수주액 나누기 조직 최대 수주, 곱하기 20\n수익성 점수 = 개인 공헌이익률 나누기 조직 최대율, 곱하기 20\n수금 점수 = 수금율에 20을 곱함\n미수금건전성 = (1 빼기 장기연체비율)에 20을 곱함"
    : "매출 점수 = 개인 매출액 나누기 조직 최대 매출, 곱하기 25\n수주 점수 = 개인 수주액 나누기 조직 최대 수주, 곱하기 25\n수익성 점수 = 개인 공헌이익률 나누기 조직 최대율, 곱하기 25\n수금 점수 = 수금율에 25를 곱함";

  const descText = hasAgingData
    ? "5개 항목(매출/수주/수익성/수금/미수금건전성)을 각각 20점 만점으로 평가합니다. 파란색 영역이 개인 성과이고 점선이 조직 평균입니다. 레이더 차트가 둥글고 넓을수록 모든 항목에서 균형 잡힌 성과를 내고 있다는 뜻입니다."
    : "4개 항목(매출/수주/수익성/수금)을 각각 25점 만점으로 평가합니다. 파란색 영역이 개인 성과이고 점선이 조직 평균입니다. 레이더 차트가 둥글고 넓을수록 모든 항목에서 균형 잡힌 성과를 내고 있다는 뜻입니다.";

  const rankFormulaText = hasAgingData
    ? "총점 = 매출(20점) + 수주(20점) + 수익성(20점) + 수금(20점) + 미수금건전성(20점) = 100점 만점\n각 항목 점수 = 개인 값 나누기 조직 최대 값, 곱하기 20"
    : "총점 = 매출(25점) + 수주(25점) + 수익성(25점) + 수금(25점) = 100점 만점\n각 항목 점수 = 개인 값 나누기 조직 최대 값, 곱하기 25";

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
              매출액: p.salesAmount,
              수주액: p.orderAmount,
              수금액: p.collectionAmount,
              공헌이익율: p.contributionMarginRate,
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
        <TabsList>
          <TabsTrigger value="performance">성과 분석</TabsTrigger>
          <TabsTrigger value="ranking">순위 / 포트폴리오</TabsTrigger>
        </TabsList>

        {/* ──────────────── 성과 분석 탭 ──────────────── */}
        <TabsContent value="performance" className="space-y-6">
          {selected && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${hasAgingData ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
              {/* 프로필 카드 */}
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

              {/* 매출 점수 */}
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">매출 점수</p>
                  <p className="text-xl font-bold">{selected.score.salesScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.salesAmount, true)}</p>
                </CardContent>
              </Card>
              {/* 수주 점수 */}
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수주 점수</p>
                  <p className="text-xl font-bold">{selected.score.orderScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.orderAmount, true)}</p>
                </CardContent>
              </Card>
              {/* 수익성 점수 */}
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수익성 점수</p>
                  <p className="text-xl font-bold">{selected.score.profitScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatPercent(selected.contributionMarginRate)}</p>
                </CardContent>
              </Card>
              {/* 수금 점수 */}
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수금 점수</p>
                  <p className="text-xl font-bold">{selected.score.collectionScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/{axisMax}</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.collectionAmount, true)}</p>
                </CardContent>
              </Card>
              {/* 미수금 건전성 점수 (5축 모드에서만) */}
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

          {/* 성과 레이더 차트 */}
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

        {/* ──────────────── 순위 / 포트폴리오 탭 ──────────────── */}
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
              {/* 기본 포트폴리오 카드 3개 */}
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

              {/* ──── 거래처 집중도 (HHI) 섹션 ──── */}
              <ChartCard
                title="거래처 집중도 - HHI(허핀달-허쉬만 지수)"
                formula="HHI = 각 거래처 매출 비중의 제곱을 모두 합산\n거래처 매출 비중 = 거래처 매출 나누기 담당자 총 매출"
                description="HHI(허핀달-허쉬만 지수)는 매출이 특정 거래처에 얼마나 집중되어 있는지 측정하는 지표입니다. 0에 가까우면 여러 거래처에 매출이 고르게 분산된 안정적인 상태이고, 1에 가까우면 소수 거래처에 의존도가 높아 리스크가 큽니다."
                benchmark="HHI가 0.25 초과이면 고위험(과점 상태), 0.15~0.25이면 적정 집중, 0.15 미만이면 분산(안정적)입니다"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 좌측: HHI 지표 + 리스크 뱃지 */}
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
                        {selected.hhiRiskLevel === "high" && (
                          <><AlertTriangle className="h-3.5 w-3.5 mr-1 inline" />고위험</>
                        )}
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

                    {/* HHI 게이지 바 */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0 (분산)</span>
                        <span>1 (독점)</span>
                      </div>
                      <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
                        {/* 구간 배경 */}
                        <div className="absolute inset-y-0 left-0 bg-emerald-200 dark:bg-emerald-900" style={{ width: "15%" }} />
                        <div className="absolute inset-y-0 bg-amber-200 dark:bg-amber-900" style={{ left: "15%", width: "10%" }} />
                        <div className="absolute inset-y-0 bg-red-200 dark:bg-red-900" style={{ left: "25%", width: "75%" }} />
                        {/* 현재 값 마커 */}
                        <div
                          className="absolute inset-y-0 w-1 bg-foreground rounded-full"
                          style={{ left: `${Math.min(selected.hhi * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex text-[10px] text-muted-foreground">
                        <span className="flex-1">분산</span>
                        <span className="flex-1 text-center">적정</span>
                        <span className="flex-1 text-right">과점</span>
                      </div>
                    </div>

                    {/* 상위 거래처 목록 */}
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
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(c.share * 100, 100)}%`,
                                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 우측: 파이 차트 */}
                  <div className="h-64 md:h-80">
                    {customerPieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={customerPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={100}
                            label={({ name, value }: any) => `${name} ${value}%`}
                            labelLine={{ strokeWidth: 1 }}
                          >
                            {customerPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.fill} />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            {...TOOLTIP_STYLE}
                            formatter={(value: any, name: any, props: any) => {
                              const amt = props.payload?.amount;
                              return amt ? [`${value}% (${formatCurrency(amt, true)})`, name] : [`${value}%`, name];
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        거래처 데이터 없음
                      </div>
                    )}
                  </div>
                </div>
              </ChartCard>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
