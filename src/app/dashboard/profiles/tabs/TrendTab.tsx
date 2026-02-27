import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { RepTrend } from "@/lib/analysis/profiling";

interface TrendTabProps {
  repTrend: RepTrend | null;
  isDateFiltered?: boolean;
}

export function TrendTab({ repTrend, isDateFiltered }: TrendTabProps) {
  if (!repTrend) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          선택된 영업사원의 거래 이력이 충분하지 않아 트렌드를 분석할 수 없습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
