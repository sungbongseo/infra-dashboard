"use client";

import { useMemo, useState } from "react";
import {
  ScatterChart, Scatter, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ReferenceLine, LabelList,
} from "recharts";
import { Star, Shield, AlertTriangle, ShieldAlert, Info } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { ChartContainer, GRID_PROPS } from "@/components/charts";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, safeFixed } from "@/lib/utils";
import {
  calcPortfolioMatrix,
  getQuadrantKoreanName,
  getQuadrantAction,
  type Segment,
  type Quadrant,
  type SegmentMatrix,
} from "@/lib/analysis/productPortfolioMatrix";
import type { CustomerItemDetailRecord } from "@/types";

const QUADRANT_COLORS: Record<Quadrant, string> = {
  star: "hsl(142.1, 76.2%, 36.3%)",          // green
  cash_cow: "hsl(221.2, 83.2%, 53.3%)",       // blue
  problem_child: "hsl(43.3, 96.4%, 56.3%)",   // yellow
  dog: "hsl(346.8, 77.2%, 49.8%)",            // red
};

const QUADRANT_ICONS: Record<Quadrant, React.ReactNode> = {
  star: <Star className="h-4 w-4" />,
  cash_cow: <Shield className="h-4 w-4" />,
  problem_child: <AlertTriangle className="h-4 w-4" />,
  dog: <ShieldAlert className="h-4 w-4" />,
};

const ALL_SEGMENTS: Segment[] = ["내수×제품", "내수×상품", "해외×제품", "해외×상품"];

interface PortfolioMatrixTabProps {
  filteredCustomerItemDetail: CustomerItemDetailRecord[];
}

export function PortfolioMatrixTab({ filteredCustomerItemDetail }: PortfolioMatrixTabProps) {
  // UI 옵션
  const [salesMode, setSalesMode] = useState<"median" | "p75" | "weighted_avg">("median");
  const [marginMode, setMarginMode] = useState<"median" | "weighted_avg" | "zero">("median");
  const [enableDynamic, setEnableDynamic] = useState(true);
  const [enablePareto, setEnablePareto] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<Segment>("내수×제품");

  // 매트릭스 계산
  const matrixResult = useMemo(
    () => calcPortfolioMatrix(filteredCustomerItemDetail, {
      salesThresholdMode: salesMode,
      marginThresholdMode: marginMode,
      enableDynamic, enablePareto,
    }),
    [filteredCustomerItemDetail, salesMode, marginMode, enableDynamic, enablePareto]
  );

  if (filteredCustomerItemDetail.length === 0) {
    return <EmptyState message="100 거래처별 품목별 손익 데이터를 업로드해 주세요" />;
  }

  const { overallSummary, matrices } = matrixResult;
  const selectedMatrix = matrices[selectedSegment];

  return (
    <ErrorBoundary>
      <div className="space-y-4">
        {/* 컨트롤 + 전체 요약 */}
        <Card>
          <CardContent className="p-4 space-y-3">
            {/* 컨트롤 */}
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">매출 임계:</span>
                <select
                  value={salesMode}
                  onChange={(e) => setSalesMode(e.target.value as any)}
                  className="px-2 py-1 border rounded bg-background"
                >
                  <option value="median">Median</option>
                  <option value="p75">P75 (상위 25%)</option>
                  <option value="weighted_avg">평균</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">마진 임계:</span>
                <select
                  value={marginMode}
                  onChange={(e) => setMarginMode(e.target.value as any)}
                  className="px-2 py-1 border rounded bg-background"
                >
                  <option value="median">Median</option>
                  <option value="weighted_avg">전사 가중 평균</option>
                  <option value="zero">0% (적자/흑자)</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={enableDynamic} onChange={(e) => setEnableDynamic(e.target.checked)} />
                <span>Dynamic 화살표</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={enablePareto} onChange={(e) => setEnablePareto(e.target.checked)} />
                <span>Pareto 80/20</span>
              </label>
            </div>

            {/* 전체 KPI */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <KpiBox label="총 매출 (제품+상품)" value={formatCurrency(overallSummary.totalSales)} />
              <KpiBox label="총 영업이익" value={formatCurrency(overallSummary.totalProfit)}
                positive={overallSummary.totalProfit >= 0} />
              <KpiBox label="가중 마진" value={`${safeFixed(overallSummary.weightedMarginRate, 2)}%`}
                tooltip="Σ영업이익 / Σ매출 — 정확한 전체 평균"
                highlight />
              <KpiBox label="산술 평균 (참고)" value={`${safeFixed(overallSummary.arithmeticMarginRate, 2)}%`}
                tooltip={`산술 평균 — 매출 작은 outlier 영향 받음 (가중 ${safeFixed(overallSummary.weightedMarginRate, 2)}%와 비교)`} />
            </div>

            {/* 데이터 품질 정보 */}
            {(overallSummary.excludedZeroSales > 0 || overallSummary.excludedReturns > 0 || overallSummary.insufficientDataItems > 0) && (
              <div className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2 flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <div>
                  {overallSummary.excludedZeroSales > 0 && <span>0 매출 {overallSummary.excludedZeroSales}건 제외 · </span>}
                  {overallSummary.excludedReturns > 0 && <span>반품매출 {overallSummary.excludedReturns}건 제외 · </span>}
                  {overallSummary.insufficientDataItems > 0 && <span>거래월 6개 미만 {overallSummary.insufficientDataItems}건 (Dynamic 화살표 미적용)</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 4-way 매트릭스 그리드 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ALL_SEGMENTS.map(segment => (
            <SegmentMatrixCard
              key={segment}
              matrix={matrices[segment]}
              isSelected={segment === selectedSegment}
              onClick={() => setSelectedSegment(segment)}
            />
          ))}
        </div>

        {/* 선택 segment 상세 — 사분면별 Top 품목 */}
        {selectedMatrix && selectedMatrix.entries.length > 0 && (
          <SegmentDetail matrix={selectedMatrix} />
        )}
      </div>
    </ErrorBoundary>
  );
}

// ─── 보조 컴포넌트 ────────────────────────────────────

function KpiBox({ label, value, positive, highlight, tooltip }: {
  label: string; value: string;
  positive?: boolean;
  highlight?: boolean;
  tooltip?: string;
}) {
  return (
    <div
      className={`rounded p-2 ${highlight ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}
      title={tooltip}
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-mono font-semibold text-sm ${
        positive === false ? "text-red-600 dark:text-red-400"
        : positive === true ? "text-green-600 dark:text-green-400"
        : ""
      }`}>{value}</div>
    </div>
  );
}

function SegmentMatrixCard({ matrix, isSelected, onClick }: {
  matrix: SegmentMatrix;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { segment, entries, weightedMarginRate, totalSales, thresholds, quadrantStats } = matrix;

  if (entries.length === 0) {
    return (
      <ChartCard title={`${segment} (데이터 없음)`} description="매트릭스 표시 불가">
        <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
          이 segment에 해당하는 품목이 없습니다
        </div>
      </ChartCard>
    );
  }

  // Recharts Scatter용 변환
  const chartData = entries.map(e => ({
    x: e.sales,
    y: e.marginRate,
    name: e.itemName,
    quadrant: e.quadrant,
    isPareto80: e.isPareto80,
  }));

  return (
    <div
      className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary rounded" : ""}`}
      onClick={onClick}
    >
      <ChartCard
        title={`${segment} (${entries.length}건) · 매출 ${formatCurrency(totalSales)} · 가중 마진 ${safeFixed(weightedMarginRate, 1)}%`}
      >
        <ChartContainer height="h-72">
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              type="number" dataKey="x" name="매출"
              tickFormatter={(v) => formatCurrency(v)}
              tick={{ fontSize: 10 }}
              label={{ value: "매출액", position: "insideBottom", offset: -10, fontSize: 11 }}
            />
            <YAxis
              type="number" dataKey="y" name="마진율"
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 10 }}
              label={{ value: "마진율 (%)", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <RechartsTooltip
              cursor={{ strokeDasharray: "3 3" }}
              formatter={(v: any, n: any) => {
                if (n === "x") return [formatCurrency(Number(v)), "매출"];
                if (n === "y") return [`${safeFixed(Number(v), 1)}%`, "마진율"];
                return [v, n];
              }}
              labelFormatter={(_, p: any) => p?.[0]?.payload?.name || ""}
            />
            <ReferenceLine x={thresholds.salesThreshold} stroke="hsl(0,0%,50%)" strokeDasharray="3 3" />
            <ReferenceLine y={thresholds.marginThreshold} stroke="hsl(0,0%,50%)" strokeDasharray="3 3" />
            <Scatter data={chartData} fill="hsl(221.2, 83.2%, 53.3%)">
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={QUADRANT_COLORS[d.quadrant as Quadrant]}
                  stroke={d.isPareto80 ? "hsl(0, 0%, 0%)" : "transparent"}
                  strokeWidth={d.isPareto80 ? 1.5 : 0}
                />
              ))}
              <LabelList
                dataKey="name"
                position="top"
                fontSize={9}
                fill="hsl(var(--muted-foreground))"
                content={(props: any) => {
                  // Pareto 80% 또는 사분면 Top만 라벨
                  const { x, y, payload } = props;
                  if (!payload?.isPareto80) return null;
                  const name = String(payload.name || "").slice(0, 12);
                  return <text x={x} y={y - 4} fontSize={9} textAnchor="middle" fill="currentColor">{name}</text>;
                }}
              />
            </Scatter>
          </ScatterChart>
        </ChartContainer>
        {/* 사분면별 미니 통계 */}
        <div className="grid grid-cols-4 gap-1 px-3 pb-2 text-[10px]">
          {(["star", "cash_cow", "problem_child", "dog"] as Quadrant[]).map(q => (
            <div key={q} className="flex items-center gap-1 rounded p-1" style={{ backgroundColor: `${QUADRANT_COLORS[q]}20` }}>
              <span style={{ color: QUADRANT_COLORS[q] }}>{QUADRANT_ICONS[q]}</span>
              <span className="font-mono">{quadrantStats[q].count}</span>
              <span className="text-muted-foreground truncate">
                {(quadrantStats[q].salesShare * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </ChartCard>
    </div>
  );
}

function SegmentDetail({ matrix }: { matrix: SegmentMatrix }) {
  const { segment, entries, quadrantStats } = matrix;

  // 사분면별 Top 5
  const byQuadrant = (q: Quadrant) => entries
    .filter(e => e.quadrant === q)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2">
          📋 {segment} — 사분면별 Top 5 품목
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(["star", "cash_cow", "problem_child", "dog"] as Quadrant[]).map(q => (
            <div key={q} className="border rounded p-2">
              <div
                className="flex items-center justify-between text-xs font-semibold mb-1.5"
                style={{ color: QUADRANT_COLORS[q] }}
              >
                <span className="flex items-center gap-1.5">
                  {QUADRANT_ICONS[q]}
                  {getQuadrantKoreanName(q)} ({quadrantStats[q].count})
                </span>
                <span className="font-mono text-muted-foreground">
                  매출 {(quadrantStats[q].salesShare * 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mb-1.5 italic">
                {getQuadrantAction(q)}
              </div>
              <div className="space-y-1">
                {byQuadrant(q).length === 0 && (
                  <div className="text-xs text-muted-foreground">해당 품목 없음</div>
                )}
                {byQuadrant(q).map((e, i) => (
                  <div key={e.itemCode} className="text-xs flex justify-between gap-2 border-b border-border/30 pb-1">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" title={e.itemName}>
                        {i + 1}. {e.itemName}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {e.isPareto80 && <span className="mr-1.5 text-violet-600">⭐ Top 20%</span>}
                        {e.trendDirection !== "insufficient_data" && (
                          <span className={`mr-1.5 ${
                            e.trendDirection === "improving" ? "text-green-600"
                            : e.trendDirection === "declining" ? "text-red-600"
                            : ""
                          }`}>
                            {e.trendDirection === "improving" ? "↗ 개선"
                              : e.trendDirection === "declining" ? "↘ 악화"
                              : "→ 안정"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 text-[10px] font-mono">
                      <div>{formatCurrency(e.sales)}</div>
                      <div className={e.marginRate < 0 ? "text-red-600" : "text-green-600"}>
                        {safeFixed(e.marginRate, 1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
