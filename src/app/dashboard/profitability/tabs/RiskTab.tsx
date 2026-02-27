"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  LabelList,
} from "recharts";
import { Star, Shield, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { ChartContainer, GRID_PROPS } from "@/components/charts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent, CHART_COLORS } from "@/lib/utils";
import { calcProfitRiskMatrixEx, calcQuadrantSummary } from "@/lib/analysis/profitRiskMatrix";
import type { ProfitRiskData } from "@/lib/analysis/profitRiskMatrix";

const QUADRANT_COLORS: Record<ProfitRiskData["quadrant"], string> = {
  star: "hsl(142.1, 76.2%, 36.3%)",
  cash_cow: "hsl(221.2, 83.2%, 53.3%)",
  problem_child: "hsl(43.3, 96.4%, 56.3%)",
  dog: "hsl(346.8, 77.2%, 49.8%)",
};

const QUADRANT_ICONS: Record<ProfitRiskData["quadrant"], React.ReactNode> = {
  star: <Star className="h-4 w-4" />,
  cash_cow: <Shield className="h-4 w-4" />,
  problem_child: <AlertTriangle className="h-4 w-4" />,
  dog: <ShieldAlert className="h-4 w-4" />,
};

interface RiskTabProps {
  isDateFiltered?: boolean;
  filteredOrgProfit: any[];
  allReceivableRecords: any[];
  filteredSales: any[];
}

export function RiskTab({ filteredOrgProfit, allReceivableRecords, filteredSales, isDateFiltered }: RiskTabProps) {
  const profitRiskResult = useMemo(
    () => calcProfitRiskMatrixEx(filteredOrgProfit, allReceivableRecords, filteredSales),
    [filteredOrgProfit, allReceivableRecords, filteredSales]
  );
  const profitRiskData = profitRiskResult.data;

  const quadrantSummary = useMemo(
    () => calcQuadrantSummary(profitRiskData),
    [profitRiskData]
  );

  return (
    <>
      {profitRiskResult.matchFailures > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>
            {profitRiskResult.totalOrgs}개 조직 중 {profitRiskResult.matchFailures}개의 미수금 데이터 매칭 실패 — 해당 조직의 리스크 점수는 0으로 표시됩니다.
            영업조직팀(손익)과 영업조직(미수금) 명칭이 다를 수 있습니다.
          </span>
        </div>
      )}
      <ChartCard
        title="수익성 x 리스크 매트릭스"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="가로축 = 영업이익율(%), 세로축 = 리스크 점수 = 3개월 이상 장기미수금 / 총 미수금 × 100"
        description="각 조직의 수익성(영업이익율)과 미수금 회수 리스크를 동시에 비교하는 2차원 분석입니다. 리스크 점수는 미수금 중 90일(3개월) 이상 장기 연체된 금액의 비율로 산출되며, 높을수록 미수금 부실화 위험이 큽니다. 오른쪽 아래에 위치할수록 수익은 높고 리스크는 낮은 이상적인 조직입니다."
        benchmark="영업이익율 5% 기준선과 리스크 점수 40점 기준선으로 4개 사분면(스타, 안정형, 주의, 위험)으로 분류"
        reason="수익성과 미수금 리스크를 동시에 분석하여 안정적 수익원과 위험 요인을 구분하고, 조직별 차등 관리 전략과 포트폴리오 균형을 수립합니다"
      >
        <ErrorBoundary>
          <ChartContainer height="h-72 md:h-96">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
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
                        <p className="text-xs text-muted-foreground">(3개월+ 장기미수 비율: {d.longTermRatio.toFixed(1)}%)</p>
                        <p>매출: {formatCurrency(d.sales, true)}</p>
                        <p>미수금: {formatCurrency(d.receivables, true)}</p>
                        <p className="mt-1 pt-1 border-t text-xs text-muted-foreground">
                          분류: {quadrantLabel[d.quadrant]}
                        </p>
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  x={5}
                  stroke="hsl(0, 0%, 50%)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  label={{ value: "이익율 5%", position: "top", fontSize: 10, fill: "hsl(0, 0%, 50%)" }}
                />
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
          </ChartContainer>
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
    </>
  );
}
