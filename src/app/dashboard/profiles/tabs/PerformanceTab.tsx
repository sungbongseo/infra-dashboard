import { ChartCard } from "@/components/dashboard/ChartCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer } from "@/components/charts";
import { Users } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { SalesRepProfile } from "@/lib/analysis/profiling";

interface PerformanceTabProps {
  selected: SalesRepProfile | undefined;
  hasAgingData: boolean;
  axisMax: number;
  radarData: Array<{ subject: string; value: number; avg: number; fullMark: number }>;
  profilesLength: number;
  formulaText: string;
  descText: string;
}

export function PerformanceTab({ selected, hasAgingData, axisMax, radarData, profilesLength, formulaText, descText }: PerformanceTabProps) {
  return (
    <>
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
                  {selected.score.rank}위 / {profilesLength}명
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
        <ChartContainer height="h-72 md:h-96">
            <RadarChart data={radarData}>
              <PolarGrid className="stroke-muted" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={30} domain={[0, axisMax]} tick={{ fontSize: 10 }} />
              <Radar name="개인" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
              <Radar name="조직평균" dataKey="avg" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.1} strokeDasharray="5 5" />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${Number(v).toFixed(1)}점`} />
              <Legend />
            </RadarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
