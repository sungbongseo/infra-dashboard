import { useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer } from "@/components/charts";
import { Users, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE, safeFixed } from "@/lib/utils";
import type { SalesRepProfile } from "@/lib/analysis/profiling";

const safe = (v: number, d = 1) => isFinite(v) ? v.toFixed(d) : "0";

interface PerformanceTabProps {
  selected: SalesRepProfile | undefined;
  hasAgingData: boolean;
  axisMax: number;
  radarData: Array<{ subject: string; value: number; avg: number; fullMark: number }>;
  profilesLength: number;
  isDateFiltered?: boolean;
  formulaText: string;
  descText: string;
}

export function PerformanceTab({ selected, hasAgingData, axisMax, radarData, profilesLength, formulaText, descText, isDateFiltered }: PerformanceTabProps) {
  const strengthWeakness = useMemo(() => {
    if (!selected) return null;
    const axes = [
      { name: "매출", score: selected.score.salesScore },
      { name: "수주", score: selected.score.orderScore },
      { name: "수익성", score: selected.score.profitScore },
      { name: "수금", score: selected.score.collectionScore },
    ];
    if (hasAgingData) {
      axes.push({ name: "미수금건전성", score: selected.score.receivableScore });
    }
    const sorted = [...axes].sort((a, b) => b.score - a.score);
    return {
      strength: sorted[0],
      weakness: sorted[sorted.length - 1],
    };
  }, [selected, hasAgingData]);

  if (profilesLength === 0) {
    return (
      <EmptyState message="영업사원 프로필 데이터가 없습니다. 매출/수주/수금 데이터를 업로드해 주세요." />
    );
  }

  return (
    <>
      {/* 3-1: 평가 모드 배지 */}
      <div className="flex items-center gap-2">
        <Badge variant={hasAgingData ? "default" : "secondary"}>
          {hasAgingData ? "5축 평가 (전 항목 반영)" : "4축 평가 (미수금 데이터 없음)"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          각 항목 {axisMax}점 만점, 총 100점
        </span>
      </div>

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
                <span className="text-3xl font-bold">{safe(selected.score.totalScore)}</span>
                <span className="text-sm text-muted-foreground">/ 100점</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={selected.score.percentile >= 80 ? "success" : selected.score.percentile >= 50 ? "secondary" : "warning"}>
                  상위 {safe(100 - selected.score.percentile, 0)}%
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {selected.score.rank}위 / {profilesLength}명
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">매출 점수</p>
              <p className="text-xl font-bold">{safe(selected.score.salesScore)}</p>
              <p className="text-xs text-muted-foreground">/{axisMax}</p>
              <p className="text-xs mt-1">{formatCurrency(selected.salesAmount, true)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">조직 내 매출 기여도를 점수화한 지표</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">수주 점수</p>
              <p className="text-xl font-bold">{safe(selected.score.orderScore)}</p>
              <p className="text-xs text-muted-foreground">/{axisMax}</p>
              <p className="text-xs mt-1">{formatCurrency(selected.orderAmount, true)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">수주 실적 기반 파이프라인 확보 능력</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">수익성 점수</p>
              <p className="text-xl font-bold">{safe(selected.score.profitScore)}</p>
              <p className="text-xs text-muted-foreground">/{axisMax}</p>
              <p className="text-xs mt-1">{formatPercent(selected.contributionMarginRate)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">매출 대비 수익 창출 효율성 점수</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">수금 점수</p>
              <p className="text-xl font-bold">{safe(selected.score.collectionScore)}</p>
              <p className="text-xs text-muted-foreground">/{axisMax}</p>
              <p className="text-xs mt-1">{formatCurrency(selected.collectionAmount, true)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">채권 회수 능력을 나타내는 점수</p>
            </CardContent>
          </Card>
          {hasAgingData && (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">미수금 건전성</p>
                <p className="text-xl font-bold">{safe(selected.score.receivableScore)}</p>
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
      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="성과 레이더 차트"
        formula={formulaText}
        description={descText}
        benchmark="총점 70점 이상이면 우수, 50~70점이면 보통, 50점 미만이면 개선이 필요합니다"
        reason="영업사원별 종합 성과를 다차원으로 평가하여 성과 평가의 객관성을 확보하고, 역량 개발 방향을 설정합니다."
      >
        <ChartContainer height="h-72 md:h-96">
            <RadarChart data={radarData}>
              <PolarGrid className="stroke-muted" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, axisMax]} tick={{ fontSize: 10 }} />
              <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
              <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.1} strokeDasharray="5 5" />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${safeFixed(Number(v), 1)}점`} />
              <Legend />
            </RadarChart>
        </ChartContainer>
      </ChartCard>

      {/* 2-1: 강점/약점 자동 인사이트 */}
      {strengthWeakness && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-medium text-emerald-800 dark:text-emerald-300">강점: {strengthWeakness.strength.name}</span>
              <span className="text-emerald-700 dark:text-emerald-400"> ({safe(strengthWeakness.strength.score, 1)}/{axisMax}점)</span>
            </div>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
            <div>
              <span className="font-medium text-red-800 dark:text-red-300">개선 필요: {strengthWeakness.weakness.name}</span>
              <span className="text-red-700 dark:text-red-400"> ({safe(strengthWeakness.weakness.score, 1)}/{axisMax}점)</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
