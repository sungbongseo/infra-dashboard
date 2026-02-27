"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcSensitivityGrid, generateSensitivityInsight } from "@/lib/analysis/sensitivityAnalysis";
import type { SensitivityCell } from "@/lib/analysis/sensitivityAnalysis";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, AlertTriangle, ArrowRightLeft, Info } from "lucide-react";

// ─── Props ──────────────────────────────────────────────────────

interface SensitivityTabProps {
  isDateFiltered?: boolean;
  baseSales: number;
  baseGrossProfit: number;
  baseOpProfit: number;
}

// ─── Metric selector type ───────────────────────────────────────

type MetricKey = "sales" | "gp" | "op";

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
  { key: "sales", label: "매출액" },
  { key: "gp", label: "매출총이익" },
  { key: "op", label: "영업이익" },
];

// ─── Heatmap cell color ─────────────────────────────────────────

function getCellColor(change: number): string {
  if (!isFinite(change)) return "bg-gray-100 dark:bg-gray-800";
  if (change > 30) return "bg-emerald-600 text-white";
  if (change > 20) return "bg-emerald-500 text-white";
  if (change > 10) return "bg-emerald-400 text-white";
  if (change > 5) return "bg-emerald-300";
  if (change > 0) return "bg-emerald-100 dark:bg-emerald-900/30";
  if (change === 0) return "bg-gray-50 dark:bg-gray-800";
  if (change > -5) return "bg-red-100 dark:bg-red-900/30";
  if (change > -10) return "bg-red-300";
  if (change > -20) return "bg-red-400 text-white";
  if (change > -30) return "bg-red-500 text-white";
  return "bg-red-600 text-white";
}

function getCellBorder(priceChange: number, volumeChange: number): string {
  if (priceChange === 0 && volumeChange === 0) return "ring-2 ring-blue-500";
  return "";
}

// ─── Helpers ────────────────────────────────────────────────────

function getChangeValue(cell: SensitivityCell, metric: MetricKey): number {
  if (metric === "sales") return cell.salesChange;
  if (metric === "gp") return cell.gpChange;
  return cell.opChange;
}

function getResultValue(cell: SensitivityCell, metric: MetricKey): number {
  if (metric === "sales") return cell.resultSales;
  if (metric === "gp") return cell.resultGrossProfit;
  return cell.resultOpProfit;
}

// ─── Reduced steps for 7x7 heatmap ─────────────────────────────

const STEPS = [-20, -10, -5, 0, 5, 10, 20];

// ─── Component ──────────────────────────────────────────────────

export function SensitivityTab({
  isDateFiltered,
  baseSales,
  baseGrossProfit,
  baseOpProfit,
}: SensitivityTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("op");

  // Compute sensitivity grid
  const result = useMemo(
    () => calcSensitivityGrid(baseSales, baseGrossProfit, baseOpProfit, STEPS, STEPS),
    [baseSales, baseGrossProfit, baseOpProfit]
  );

  // Build lookup map for heatmap: key = "price_volume"
  const cellMap = useMemo(() => {
    const map = new Map<string, SensitivityCell>();
    for (const cell of result.grid) {
      map.set(`${cell.priceChange}_${cell.volumeChange}`, cell);
    }
    return map;
  }, [result.grid]);

  // Generate insight
  const insight = useMemo(
    () => generateSensitivityInsight(result, selectedMetric),
    [result, selectedMetric]
  );

  // Chart data: price impact at volume=0% and volume impact at price=0%
  const impactChartData = useMemo(() => {
    return STEPS.map((step) => {
      const priceCell = cellMap.get(`${step}_0`);
      const volumeCell = cellMap.get(`0_${step}`);
      return {
        change: step,
        priceImpact: priceCell ? getResultValue(priceCell, selectedMetric) : 0,
        volumeImpact: volumeCell ? getResultValue(volumeCell, selectedMetric) : 0,
      };
    });
  }, [cellMap, selectedMetric]);

  const metricLabel = METRIC_OPTIONS.find((m) => m.key === selectedMetric)?.label ?? "영업이익";

  return (
    <>
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="기준 매출액"
          value={baseSales}
          format="currency"
          formula="현재 매출액 = 선택된 조직의 매출 합계 (변동 없는 현재 상태)"
          description="아래 표와 차트에서 '만약 가격이 10% 오르면?' 같은 가정을 할 때, 비교의 출발점이 되는 금액입니다."
          benchmark="이 금액이 0원이면 시나리오 비교가 불가능합니다. 손익 데이터를 먼저 업로드해 주세요."
          reason="'지금 매출이 이 정도인데, 가격을 올리거나 물량을 늘리면 얼마나 달라질까?'를 알기 위한 출발점입니다."
        />
        <KpiCard
          title="기준 매출총이익"
          value={baseGrossProfit}
          format="currency"
          formula="매출총이익 = 매출액 − 매출원가 (제품을 팔고 원가를 빼고 남는 이익)"
          description="가격을 올리면 이익이 그대로 늘어나지만, 물량을 늘리면 원가도 함께 올라가서 이익은 덜 늘어납니다. 즉 같은 10% 변동이라도 가격 쪽이 이익에 더 큰 영향을 줍니다."
          benchmark="매출총이익률 20% 이상이면 가격 인하 여력이 있는 구조입니다"
          reason="가격 인하를 검토할 때 '얼마나 깎아도 이익이 남을까?', 물량 확대를 검토할 때 '원가 증가를 감당할 수 있을까?'를 미리 확인합니다."
        />
        <KpiCard
          title="기준 영업이익"
          value={baseOpProfit}
          format="currency"
          formula="영업이익 = 매출총이익 − 판관비 (인건비·경비 등을 빼고 남는 최종 이익)"
          description="인건비·경비 같은 판관비는 매출이 늘어도 크게 안 변합니다. 그래서 매출이 조금만 올라도 영업이익은 그보다 더 크게 좋아집니다. 반대로 매출이 줄면 영업이익은 더 크게 나빠집니다."
          benchmark="영업이익이 적자라면 아래 시나리오 표에서 파란 테두리(현재)에서 녹색 영역까지의 거리를 확인하세요."
          reason="매출이 변하면 영업이익이 얼마나 크게 변하는지 미리 알아야, 가격 협상이나 물량 계획에서 목표를 정확히 세울 수 있습니다."
        />
      </div>

      {/* Metric selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">어떤 이익 기준으로 비교할까요?</span>
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {METRIC_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSelectedMetric(opt.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                selectedMetric === opt.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Insight card */}
      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300">
            <Lightbulb className="h-4 w-4" />
            핵심 인사이트 ({metricLabel} 기준)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {/* Dominant factor */}
            <div className="flex items-start gap-2">
              <ArrowRightLeft className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <span className="font-medium text-foreground">주요 영향 요인: </span>
                <span className="text-muted-foreground">
                  가격 10% 인상 시{" "}
                  <span className={insight.priceImpact10 >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                    {insight.priceImpact10 > 0 ? "+" : ""}{insight.priceImpact10.toFixed(1)}%
                  </span>
                  , 물량 10% 증가 시{" "}
                  <span className={insight.volumeImpact10 >= 0 ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                    {insight.volumeImpact10 > 0 ? "+" : ""}{insight.volumeImpact10.toFixed(1)}%
                  </span>
                  {" → "}
                  <span className="font-medium text-foreground">
                    {insight.dominantFactor === "price"
                      ? "가격이 더 큰 영향"
                      : insight.dominantFactor === "volume"
                      ? "물량이 더 큰 영향"
                      : "가격·물량 영향 비슷"}
                  </span>
                </span>
              </div>
            </div>

            {/* Risk warning */}
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <span className="font-medium text-foreground">주의 시나리오: </span>
                <span className="text-muted-foreground">{insight.riskWarning}</span>
              </div>
            </div>

            {/* Balance point */}
            {insight.balancePoint && (
              <div className="flex items-start gap-2 md:col-span-2">
                <ArrowRightLeft className="h-4 w-4 mt-0.5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <span className="font-medium text-foreground">균형점: </span>
                  <span className="text-muted-foreground">{insight.balancePoint}</span>
                </div>
              </div>
            )}

            {/* Recommendation */}
            <div className="flex items-start gap-2 md:col-span-2">
              <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <span className="font-medium text-foreground">전략 제안: </span>
                <span className="text-muted-foreground">{insight.recommendation}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage guide */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 text-sm text-blue-800 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <p>
          거래처에 가격 변경을 제안하기 전에, 아래 시나리오 표에서 해당 조건의 칸을 찾아 이익 변화를 미리 확인하세요.
          예) 가격 5% 인하를 검토 중이라면 → 가격 열에서 -5%를 찾고, 예상되는 물량 변화 행과 만나는 칸의 숫자를 확인합니다.
        </p>
      </div>

      {/* Heatmap grid */}
      <ChartCard
        title={`가격·물량 변동 시나리오 표 (${metricLabel} 변화율)`}
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula={`각 칸의 숫자 = '만약 가격이 X%, 물량이 Y% 바뀌면 ${metricLabel}이 현재보다 몇 % 달라지는가?'`}
        description={`표 읽는 법: 가로축(→)은 가격 변동, 세로축(↓)은 물량 변동입니다. 예를 들어 가격 +10%열과 물량 -5%행이 만나는 칸은 '가격을 10% 올리고 물량이 5% 줄었을 때'의 결과입니다. 파란 테두리가 현재 상태이고, 녹색이 진할수록 이익 개선, 빨간색이 진할수록 이익 악화입니다.`}
        benchmark={`활용법: ① 파란 테두리(현재)에서 오른쪽(가격↑)이나 아래(물량↑)로 갈수록 좋아지는지 확인. ② 현실적 시나리오(예: 가격 5% 인상 + 물량 10% 감소)에 해당하는 칸을 찾아 결과 확인.`}
        reason={`거래처에 가격 변경을 제안하기 전, 또는 대량 수주 건을 검토할 때 '그러면 이익이 얼마나 바뀔까?'를 숫자로 미리 확인하여 협상 근거를 준비합니다.`}
      >
        {/* Color legend */}
        <div className="flex items-center justify-center gap-1 mb-3 text-xs text-muted-foreground">
          <span>이익 크게 감소</span>
          <div className="flex gap-0.5">
            <div className="w-5 h-4 rounded-sm bg-red-600" />
            <div className="w-5 h-4 rounded-sm bg-red-400" />
            <div className="w-5 h-4 rounded-sm bg-red-100 dark:bg-red-900/30" />
            <div className="w-5 h-4 rounded-sm bg-gray-50 dark:bg-gray-700 border border-border" />
            <div className="w-5 h-4 rounded-sm bg-emerald-100 dark:bg-emerald-900/30" />
            <div className="w-5 h-4 rounded-sm bg-emerald-400" />
            <div className="w-5 h-4 rounded-sm bg-emerald-600" />
          </div>
          <span>크게 증가</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-2 border border-border bg-muted/50 text-muted-foreground font-medium min-w-[72px]">
                  물량(↕)＼가격(→)
                </th>
                {STEPS.map((priceStep) => (
                  <th
                    key={priceStep}
                    className="p-2 border border-border bg-muted/50 text-muted-foreground font-medium min-w-[64px]"
                  >
                    {priceStep > 0 ? `+${priceStep}` : priceStep}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STEPS.map((volumeStep) => (
                <tr key={volumeStep}>
                  <td className="p-2 border border-border bg-muted/50 text-muted-foreground font-medium text-center">
                    {volumeStep > 0 ? `+${volumeStep}` : volumeStep}%
                  </td>
                  {STEPS.map((priceStep) => {
                    const cell = cellMap.get(`${priceStep}_${volumeStep}`);
                    const change = cell ? getChangeValue(cell, selectedMetric) : 0;
                    const colorClass = getCellColor(change);
                    const borderClass = getCellBorder(priceStep, volumeStep);
                    const isOrigin = priceStep === 0 && volumeStep === 0;
                    return (
                      <td
                        key={priceStep}
                        className={`p-2 border border-border text-center font-mono tabular-nums ${colorClass} ${borderClass}`}
                        title={
                          cell
                            ? `만약 가격 ${Math.abs(priceStep)}% ${priceStep >= 0 ? "인상" : "인하"}, 물량 ${Math.abs(volumeStep)}% ${volumeStep >= 0 ? "증가" : "감소"} → ${metricLabel}: ${formatCurrency(getResultValue(cell, selectedMetric))} (현재 대비 ${change > 0 ? "+" : ""}${change.toFixed(1)}%)`
                            : ""
                        }
                      >
                        {isOrigin
                          ? "현재"
                          : isFinite(change)
                          ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%`
                          : "-"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Summary chart: price vs volume impact lines */}
      <ChartCard
        title={`가격 vs 물량 — 어느 쪽이 더 영향이 클까? (${metricLabel})`}
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula={`파란선 = 물량은 그대로 두고 가격만 바꿨을 때 / 녹색선 = 가격은 그대로 두고 물량만 바꿨을 때`}
        description={`같은 10% 변동이라도 가격과 물량 중 어느 쪽이 ${metricLabel}을 더 크게 바꾸는지 비교합니다. 더 가파르게 움직이는 선이 영향력이 큰 요인입니다.`}
        benchmark={`핵심 질문: '가격 방어에 집중할까, 물량 확대에 집중할까?' → 선이 더 가파른 쪽에 우선 집중하세요.`}
        reason={`가격 협상과 물량 확대 중 어디에 영업 역량을 집중해야 이익이 더 좋아지는지 판단 근거를 제공합니다.`}
      >
        <ChartContainer height="h-64 md:h-80">
          <ComposedChart data={impactChartData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="change"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
              label={{
                value: "가격 또는 물량 변동(%)",
                position: "insideBottomRight",
                offset: -5,
                fontSize: 11,
              }}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => formatCurrency(v, true)}
            />
            <RechartsTooltip
              formatter={(v: any, name: any) =>
                [formatCurrency(Number(v)), String(name || "")]
              }
              labelFormatter={(label) => `${label > 0 ? "+" : ""}${label}% 변동했을 때`}
              {...TOOLTIP_STYLE}
            />
            <Legend />
            <ReferenceLine x={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="priceImpact"
              name="가격만 변동 시"
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              {...ANIMATION_CONFIG}
            />
            <Line
              type="monotone"
              dataKey="volumeImpact"
              name="물량만 변동 시"
              stroke={CHART_COLORS[1]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              {...ANIMATION_CONFIG}
            />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
