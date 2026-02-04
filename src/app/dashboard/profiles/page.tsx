"use client";

import { useMemo, useState } from "react";
import { useDataStore } from "@/stores/dataStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
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
} from "recharts";
import { Users, Trophy, TrendingUp, Star } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, CHART_COLORS } from "@/lib/utils";

export default function ProfilesPage() {
  const { salesList, orderList, collectionList, teamContribution, orgNames } = useDataStore();
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);

  const filteredSales = useMemo(() => filterByOrg(salesList, orgNames), [salesList, orgNames]);
  const filteredOrders = useMemo(() => filterByOrg(orderList, orgNames), [orderList, orgNames]);
  const filteredCollections = useMemo(() => filterByOrg(collectionList, orgNames), [collectionList, orgNames]);
  const filteredTeamContribution = useMemo(() => filterByOrg(teamContribution, orgNames, "영업조직팀"), [teamContribution, orgNames]);

  const profiles = useMemo(
    () => calcPerformanceScores(filteredSales, filteredOrders, filteredCollections, filteredTeamContribution),
    [filteredSales, filteredOrders, filteredCollections, filteredTeamContribution]
  );

  const hasData = profiles.length > 0;

  const selected = selectedPerson ? profiles.find((p) => p.id === selectedPerson) : profiles[0];

  const radarData = useMemo(() => {
    if (!selected) return [];
    const avg = profiles.reduce(
      (acc, p) => ({
        매출: acc.매출 + p.score.salesScore,
        수주: acc.수주 + p.score.orderScore,
        수익성: acc.수익성 + p.score.profitScore,
        수금: acc.수금 + p.score.collectionScore,
      }),
      { 매출: 0, 수주: 0, 수익성: 0, 수금: 0 }
    );
    const n = profiles.length || 1;
    return [
      { subject: "매출", value: selected.score.salesScore, avg: avg.매출 / n, fullMark: 25 },
      { subject: "수주", value: selected.score.orderScore, avg: avg.수주 / n, fullMark: 25 },
      { subject: "수익성", value: selected.score.profitScore, avg: avg.수익성 / n, fullMark: 25 },
      { subject: "수금", value: selected.score.collectionScore, avg: avg.수금 / n, fullMark: 25 },
    ];
  }, [selected, profiles]);

  const rankingData = useMemo(
    () => profiles.slice(0, 20).map((p) => ({
      name: p.name || p.id,
      score: Math.round(p.score.totalScore * 10) / 10,
      isSelected: p.id === selected?.id,
    })),
    [profiles, selected]
  );

  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">영업사원 성과 프로파일</h2>
          <p className="text-muted-foreground">개인별 성과 스코어카드 및 동료 비교</p>
        </div>
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

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">성과 분석</TabsTrigger>
          <TabsTrigger value="ranking">순위 / 포트폴리오</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          {selected && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
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
                  <p className="text-xs text-muted-foreground">/25</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.salesAmount, true)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수주 점수</p>
                  <p className="text-xl font-bold">{selected.score.orderScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/25</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.orderAmount, true)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수익성 점수</p>
                  <p className="text-xl font-bold">{selected.score.profitScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/25</p>
                  <p className="text-xs mt-1">{formatPercent(selected.contributionMarginRate)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">수금 점수</p>
                  <p className="text-xl font-bold">{selected.score.collectionScore.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground">/25</p>
                  <p className="text-xs mt-1">{formatCurrency(selected.collectionAmount, true)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <ChartCard
            title="성과 Radar"
            formula="매출 점수 = 매출액 / 조직 최대 매출 × 25\n수주 점수 = 수주액 / 조직 최대 수주 × 25\n수익성 점수 = 공헌이익율 / 조직 최대율 × 25\n수금 점수 = 수금율 × 25"
            description="4개 항목(매출/수주/수익성/수금) 각 25점 만점으로, 개인 성과(파란색)와 조직 평균(점선)을 비교합니다. 균형 잡힌 형태일수록 안정적인 성과입니다."
            benchmark="총점 70점↑ 우수, 50~70점 보통, 50점↓ 개선 필요"
          >
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid className="stroke-muted" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 25]} tick={{ fontSize: 10 }} />
                  <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
                  <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.1} strokeDasharray="5 5" />
                  <RechartsTooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="ranking" className="space-y-6">
          <ChartCard
            title="성과 점수 랭킹"
            formula="총점 = 매출(25) + 수주(25) + 수익성(25) + 수금(25)\n각 항목 = 개인값 / 조직 최대값 × 25"
            description="총 점수 기준 상위 20명의 랭킹입니다. 선택된 사원은 강조 표시됩니다. 전체 조직 내 상대적 위치를 파악할 수 있습니다."
            benchmark="상위 20% = 핵심 인재, 하위 20% = 코칭 필요"
          >
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingData} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                  <RechartsTooltip formatter={(v: any) => `${v}점`} />
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
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
