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
import { calcSensitivityGrid } from "@/lib/analysis/sensitivityAnalysis";
import type { SensitivityCell } from "@/lib/analysis/sensitivityAnalysis";

// ─── Props ──────────────────────────────────────────────────────

interface SensitivityTabProps {
  baseSales: number;
  baseGrossProfit: number;
  baseOpProfit: number;
  baseCost: number; // 매출원가
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
  baseSales,
  baseGrossProfit,
  baseOpProfit,
  baseCost,
}: SensitivityTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("op");

  // Compute sensitivity grid
  const result = useMemo(
    () => calcSensitivityGrid(baseSales, baseGrossProfit, baseOpProfit, baseCost, STEPS, STEPS),
    [baseSales, baseGrossProfit, baseOpProfit, baseCost]
  );

  // Build lookup map for heatmap: key = "price_volume"
  const cellMap = useMemo(() => {
    const map = new Map<string, SensitivityCell>();
    for (const cell of result.grid) {
      map.set(`${cell.priceChange}_${cell.volumeChange}`, cell);
    }
    return map;
  }, [result.grid]);

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
          formula="손익 데이터의 매출액 합계"
          description="민감도 분석의 기준이 되는 현재 매출액입니다. 가격과 물량 변동에 따른 변화를 이 기준 대비 %로 표시합니다."
          benchmark="기준 매출이 0이면 민감도 분석을 수행할 수 없습니다"
        />
        <KpiCard
          title="기준 매출총이익"
          value={baseGrossProfit}
          format="currency"
          formula="매출총이익 = 매출액 - 매출원가"
          description="현재 매출총이익입니다. 가격 변동은 매출총이익에 직접 영향을 주고, 물량 변동은 원가 증가를 수반하므로 영향이 비대칭입니다."
          benchmark="매출총이익률 20% 이상이면 가격 인하 여력이 있는 구조입니다"
        />
        <KpiCard
          title="기준 영업이익"
          value={baseOpProfit}
          format="currency"
          formula="영업이익 = 매출총이익 - 판관비"
          description="현재 영업이익입니다. 판관비는 고정비로 가정하므로, 매출 증가 시 영업이익 개선 효과가 매출총이익보다 더 크게 나타납니다(레버리지 효과)."
          benchmark="영업이익이 음수인 경우 가격/물량 어느 쪽으로 개선이 효과적인지 히트맵에서 확인하세요"
        />
      </div>

      {/* Metric selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">분석 지표:</span>
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

      {/* Heatmap grid */}
      <ChartCard
        title={`가격 x 물량 민감도 히트맵 (${metricLabel} 변동률)`}
        formula={`${metricLabel} 변동률(%) = (시나리오 ${metricLabel} - 기준 ${metricLabel}) / |기준 ${metricLabel}| x 100`}
        description={`가격(열)과 물량(행)을 동시에 변동시켰을 때 ${metricLabel}이 기준 대비 몇 % 변하는지 보여줍니다. 녹색이 진할수록 개선, 빨간색이 진할수록 악화됩니다. 파란 테두리 셀이 현재 상태(변동 없음)입니다.`}
        benchmark="대각선 방향(가격+물량 동시 변동)의 색상 변화가 가장 급격하며, 이는 두 변수의 복합 효과를 나타냅니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="p-2 border border-border bg-muted/50 text-muted-foreground font-medium min-w-[72px]">
                  물량＼가격
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
                    return (
                      <td
                        key={priceStep}
                        className={`p-2 border border-border text-center font-mono tabular-nums ${colorClass} ${borderClass}`}
                        title={
                          cell
                            ? `가격 ${priceStep > 0 ? "+" : ""}${priceStep}%, 물량 ${volumeStep > 0 ? "+" : ""}${volumeStep}% → ${metricLabel}: ${formatCurrency(getResultValue(cell, selectedMetric))}`
                            : ""
                        }
                      >
                        {isFinite(change)
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
        title={`단일 변수 영향 비교 (${metricLabel})`}
        formula={`파란선: 물량 고정(0%) 시 가격 변동 효과 / 녹색선: 가격 고정(0%) 시 물량 변동 효과`}
        description={`가격만 변동하거나 물량만 변동할 때 ${metricLabel}이 어떻게 달라지는지 비교합니다. 두 선의 기울기 차이로 어떤 변수가 ${metricLabel}에 더 민감한지 파악할 수 있습니다. 기울기가 가파를수록 해당 변수의 영향력이 큽니다.`}
        benchmark="가격 변동 선이 물량 변동 선보다 가파르면 가격 전략이, 반대면 물량 확대 전략이 더 효과적입니다"
      >
        <ChartContainer height="h-64 md:h-80">
          <ComposedChart data={impactChartData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="change"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`}
              label={{
                value: "변동률 (%)",
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
              labelFormatter={(label) => `변동률: ${label > 0 ? "+" : ""}${label}%`}
              {...TOOLTIP_STYLE}
            />
            <Legend />
            <ReferenceLine x={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="priceImpact"
              name={`가격 변동 (물량 0%)`}
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              {...ANIMATION_CONFIG}
            />
            <Line
              type="monotone"
              dataKey="volumeImpact"
              name={`물량 변동 (가격 0%)`}
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
