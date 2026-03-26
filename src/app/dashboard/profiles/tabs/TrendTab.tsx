import { useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeDivide } from "@/lib/utils";
import type { RepTrend } from "@/lib/analysis/profiling";

interface TrendTabProps {
  repTrend: RepTrend | null;
  isDateFiltered?: boolean;
}

export function TrendTab({ repTrend, isDateFiltered }: TrendTabProps) {
  const trendInsight = useMemo(() => {
    if (!repTrend || repTrend.monthlyData.length < 2) return null;
    const salesArr = repTrend.monthlyData.map((m) => m.sales);
    const totalAvg = salesArr.reduce((s, v) => s + v, 0) / salesArr.length;

    // 최근 3개월 이동평균
    const recent3 = salesArr.slice(-Math.min(3, salesArr.length));
    const recent3Avg = recent3.reduce((s, v) => s + v, 0) / recent3.length;

    // 트렌드 판정
    let trendLabel: string;
    let trendColor: string;
    if (recent3Avg > totalAvg * 1.05) {
      trendLabel = "상승 추세";
      trendColor = "text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40";
    } else if (recent3Avg < totalAvg * 0.95) {
      trendLabel = "하락 추세";
      trendColor = "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40";
    } else {
      trendLabel = "정체";
      trendColor = "text-gray-700 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/40";
    }

    // 변동계수 (CV)
    const variance = salesArr.reduce((s, v) => s + (v - totalAvg) ** 2, 0) / salesArr.length;
    const stdDev = Math.sqrt(variance);
    const cv = totalAvg > 0 ? stdDev / totalAvg : 0;

    return { recent3Avg, totalAvg, trendLabel, trendColor, cv };
  }, [repTrend]);

  // 2-4: 동월 YoY 성장률
  const yoyGrowth = useMemo(() => {
    if (!repTrend || repTrend.monthlyData.length < 13) return null;
    const last = repTrend.monthlyData[repTrend.monthlyData.length - 1];
    const lastMonth = last.month.slice(-2); // MM part
    const sameMonthLastYear = repTrend.monthlyData.find(d =>
      d.month.slice(-2) === lastMonth && d.month < last.month
    );
    if (!sameMonthLastYear || sameMonthLastYear.sales === 0) return null;
    return safeDivide((last.sales - sameMonthLastYear.sales), sameMonthLastYear.sales) * 100;
  }, [repTrend]);

  if (!repTrend) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">데이터가 없습니다</p>
        <p className="text-sm mt-1">실적 트렌드 데이터가 없습니다</p>
      </div>
    );
  }

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${yoyGrowth !== null ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        <KpiCard
          title="월평균 매출"
          value={repTrend.avgMonthlySales}
          format="currency"
          formula="월평균 매출 = Σ(월별 매출액) ÷ 매출 발생 월수"
          description="선택된 기간 내 월별 매출의 단순 평균입니다. 담당자의 평균적인 매출 규모를 나타냅니다."
          benchmark="조직 내 매출 상위 20%와 비교하여 성장 잠재력 판단"
          reason="영업사원별 월평균 매출로 안정적인 매출 기반을 평가하고, 성장 잠재력을 판단합니다."
        />
        <KpiCard
          title="월평균 수주"
          value={repTrend.avgMonthlyOrders}
          format="currency"
          formula="월평균 수주 = Σ(월별 수주액) ÷ 수주 발생 월수"
          description="월별 수주의 평균값입니다. 수주가 매출보다 높으면 파이프라인이 건전하다는 의미입니다."
          benchmark="월평균 수주 ≥ 월평균 매출이면 성장 중, 미달이면 파이프라인 점검 필요"
          reason="수주 평균치로 영업사원의 파이프라인 확보 능력을 평가하고, 매출 대비 수주 부족 시 영업 활동 강화를 유도합니다."
        />
        <KpiCard
          title="MoM 매출 성장률"
          value={repTrend.salesMoM}
          format="percent"
          formula="MoM 성장률 = (당월 매출 - 전월 매출) ÷ |전월 매출| × 100"
          description="MoM(Month-over-Month)은 전월 대비 매출 증감을 백분율로 나타냅니다. 양수면 전월보다 매출이 증가했고, 음수면 감소했다는 의미입니다."
          benchmark="MoM +5% 이상이면 성장세, 0~5%이면 안정, 마이너스이면 하락세"
          reason="월간 매출 추세를 파악하여 성과 개선/하락을 조기에 감지하고, 즉시 코칭·지원 여부를 결정합니다."
        />
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">매출 모멘텀</p>
            <Badge variant={repTrend.momentum === "accelerating" ? "success" : repTrend.momentum === "stable" ? "secondary" : "destructive"} className="text-sm">
              {repTrend.momentum === "accelerating" ? "성장 가속" : repTrend.momentum === "stable" ? "안정" : "감속"}
            </Badge>
            <p className="text-[10px] text-muted-foreground mt-2">최근 매출 추세의 방향성(가속/안정/감속)</p>
          </CardContent>
        </Card>
        {/* 2-4: 동월 YoY 성장률 */}
        {yoyGrowth !== null && (
          <KpiCard
            title="동월 YoY 성장률"
            value={yoyGrowth}
            format="percent"
            formula="YoY 성장률 = (당월 매출 - 전년 동월 매출) ÷ |전년 동월 매출| × 100"
            description="전년 동월과 비교한 매출 성장률입니다. 양수면 작년보다 성장, 음수면 역성장입니다."
            benchmark="YoY +10% 이상이면 고성장, 0~10%이면 안정적, 마이너스이면 역성장"
            reason="전년 동월 대비 성장률로 계절성을 제거한 순수 성장을 측정합니다."
          />
        )}
      </div>

      {trendInsight && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📊 트렌드 방향 신호</h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li className="flex items-center gap-2">
              • 매출 추세:
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${trendInsight.trendColor}`}>
                {trendInsight.trendLabel}
              </span>
              <span className="text-xs text-blue-600 dark:text-blue-300">
                (최근 3개월 평균 {formatCurrency(trendInsight.recent3Avg)} vs 전체 평균 {formatCurrency(trendInsight.totalAvg)})
              </span>
            </li>
            <li>• 변동계수(CV): {isFinite(trendInsight.cv) ? trendInsight.cv.toFixed(2) : "0.00"}
              {trendInsight.cv > 0.3 && (
                <span className="ml-2 text-amber-700 dark:text-amber-400 font-medium">
                  — 변동성 높음 (CV {'>'} 0.3)
                </span>
              )}
            </li>
          </ul>
        </div>
      )}

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="월별 매출/수주/수금 추이"
        formula="월별 매출일/수주일/수금일 기준으로 장부금액을 합산"
        description="선택된 영업사원의 월별 매출(막대), 수주(막대), 수금(선) 추이를 보여줍니다. 수주가 매출보다 높으면 파이프라인이 건전하고, 수금이 매출을 따라가면 현금흐름이 양호합니다."
        benchmark="수주가 매출 이상이면 성장 중, 수금이 매출의 80% 이상이면 수금 관리 양호"
        reason="영업사원별 실적 추세를 분석하여 성과 개선/하락 추세를 조기 감지하고, 적시에 코칭 및 지원을 제공합니다."
      >
        <ChartContainer height="h-64 md:h-80">
            <ComposedChart data={repTrend.monthlyData}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="sales" fill={CHART_COLORS[0]} name="매출" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="orders" fill={CHART_COLORS[1]} name="수주" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Line type="monotone" dataKey="collections" stroke={CHART_COLORS[4]} strokeWidth={2} name="수금" dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
            </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
