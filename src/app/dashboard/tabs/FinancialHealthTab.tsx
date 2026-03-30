"use client";

import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer } from "@/components/charts";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { formatPercent, CHART_COLORS, safeFixed } from "@/lib/utils";
import type { OverviewKpis, CollectionRateDetail } from "./types";
import type { InsightSeverity } from "@/lib/analysis/insightGenerator";
import type { Insight } from "@/lib/analysis/insightGenerator";

const INSIGHT_STYLES: Record<InsightSeverity, string> = {
  critical: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
  positive: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  neutral: "bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700",
};

const INSIGHT_ICON_COLORS: Record<InsightSeverity, string> = {
  critical: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  positive: "text-green-600 dark:text-green-400",
  neutral: "text-gray-500 dark:text-gray-400",
};

interface HealthRadarItem {
  metric: string;
  value: number;
  fullMark: number;
}

interface FinancialHealthTabProps {
  kpis: OverviewKpis;
  collectionRateDetail: CollectionRateDetail;
  grossProfitMargin: number;
  forecastAccuracy: number;
  overallDso: number | undefined;
  overallCcc: number | undefined;
  costRatios: { costOfGoodsRatio?: number };
  healthRadar: HealthRadarItem[];
  insights: Insight[];
  isDateFiltered: boolean;
}

export function FinancialHealthTab({
  kpis,
  collectionRateDetail,
  grossProfitMargin,
  forecastAccuracy,
  overallDso,
  overallCcc,
  costRatios,
  healthRadar,
  insights,
  isDateFiltered,
}: FinancialHealthTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 재무 건전성 레이더 */}
        <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
          title="재무 건전성 레이더"
          formula="각 지표를 0~100 점수로 정규화하여 레이더 차트로 표시"
          description="수금율, 수익성, 계획달성, 예측정확도, 현금효율, 공헌이익 6개 축으로 재무 건전성을 종합 평가합니다."
          benchmark="모든 축이 60점 이상이면 건전, 40점 미만 축은 개선 필요"
          reason="수익성·유동성·효율성 지표를 종합 평가하여 재무 리스크를 조기에 식별하고, 취약 영역에 집중 대응합니다."
        >
          <ChartContainer>
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={healthRadar}>
              <PolarGrid className="stroke-muted" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar name="현재" dataKey="value" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.3} />
            </RadarChart>
          </ChartContainer>
        </ChartCard>

        {/* 핵심 재무 지표 요약 */}
        <div className="space-y-4">
          <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
            title="핵심 재무 지표 요약"
            formula="각 지표별 현재값을 산업 평균 기준(양호/경고)으로 색상 분류"
            description="DSO, CCC, 수금율, 이익율 등 핵심 재무 지표를 한눈에 보여줍니다. 녹색은 양호, 황색은 보통, 적색은 주의가 필요한 상태입니다."
            benchmark="7개 지표 중 5개 이상 양호(녹색)이면 재무 건전성 우수"
            reason="핵심 재무 지표를 신호등 방식으로 요약하여 경영진이 즉시 주의가 필요한 영역을 식별할 수 있게 합니다."
          >
            <div className="divide-y">
              {[
                { label: "DSO (매출채권 회수기간)", value: overallDso, format: (v: number) => `${safeFixed(v, 0)}일`, good: 30, warning: 60, inverted: true },
                { label: "CCC (현금순환주기)", value: overallCcc, format: (v: number) => `${safeFixed(v, 0)}일`, good: 0, warning: 60, inverted: true },
                { label: "순수 수금율", value: collectionRateDetail.netCollectionRate, format: (v: number) => formatPercent(v), good: 85, warning: 70 },
                { label: "영업이익율", value: kpis.operatingProfitRate, format: (v: number) => formatPercent(v), good: 10, warning: 5 },
                { label: "매출총이익율", value: grossProfitMargin, format: (v: number) => formatPercent(v), good: 20, warning: 15 },
                { label: "예측 정확도", value: forecastAccuracy, format: (v: number) => formatPercent(v), good: 90, warning: 70 },
                { label: "매출원가율", value: costRatios.costOfGoodsRatio, format: (v: number) => formatPercent(v), good: 70, warning: 85, inverted: true },
              ].map(({ label, value, format: fmt, good, warning, inverted }) => {
                const v = value ?? 0;
                const isValid = value !== undefined && isFinite(v);
                const isGood = inverted ? v <= good : v >= good;
                const isWarning = inverted ? v > warning : v < warning;
                const color = !isValid ? "text-muted-foreground" : isGood ? "text-emerald-600 dark:text-emerald-400" : isWarning ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
                return (
                  <div key={label} className="flex items-center justify-between py-2.5 px-1">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${color}`}>
                      {isValid ? fmt(v) : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>
      </div>

      {/* 인사이트 전체 목록 */}
      {insights.length > 0 && (
        <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
          title="경영 진단 인사이트"
          formula="매출, 수금, 수익성, 수주, 미수금 5개 영역에 대해 규칙 기반 자동 진단"
          description={`총 ${insights.length}개의 진단 결과가 발견되었습니다. 위험/주의 항목이 있으면 우선적으로 대응하고, 양호 항목은 현 수준을 유지합니다.`}
          benchmark="위험(빨강) 0건 + 주의(황색) 2건 이하이면 안정적 경영 상태"
          reason="자동화된 경영 진단으로 주요 리스크와 기회를 빠르게 식별하여 의사결정 속도를 높입니다."
        >
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {insights.map((insight) => (
              <div key={insight.id} className={`rounded-md border p-3 flex items-start gap-3 ${INSIGHT_STYLES[insight.severity]}`}>
                <div className="flex-shrink-0 mt-0.5">
                  {insight.severity === "critical" || insight.severity === "warning" ? (
                    <AlertCircle className={`h-4 w-4 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                  ) : (
                    <CheckCircle2 className={`h-4 w-4 ${INSIGHT_ICON_COLORS[insight.severity]}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${INSIGHT_ICON_COLORS[insight.severity]}`}>{insight.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted-foreground font-mono">
                      {insight.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.message}</p>
                </div>
                {insight.value !== undefined && isFinite(insight.value) && (
                  <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${INSIGHT_ICON_COLORS[insight.severity]}`}>
                    {isFinite(insight.value) ? insight.value.toFixed(1) : "-"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
