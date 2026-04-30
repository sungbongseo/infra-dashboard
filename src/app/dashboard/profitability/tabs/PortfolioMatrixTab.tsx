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
import { MetricInfo } from "@/components/dashboard/MetricInfo";
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
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">매출 임계 (X축):</span>
                <select
                  value={salesMode}
                  onChange={(e) => setSalesMode(e.target.value as any)}
                  className="px-2 py-1 border rounded bg-background"
                >
                  <option value="median">Median</option>
                  <option value="p75">P75 (상위 25%)</option>
                  <option value="weighted_avg">평균</option>
                </select>
                <MetricInfo id={salesMode === "p75" ? "bcg_threshold_p75" : salesMode === "weighted_avg" ? "bcg_threshold_weighted" : "bcg_threshold_median"} variant="inline" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">영업이익율 임계 (Y축):</span>
                <select
                  value={marginMode}
                  onChange={(e) => setMarginMode(e.target.value as any)}
                  className="px-2 py-1 border rounded bg-background"
                >
                  <option value="median">Median</option>
                  <option value="weighted_avg">전사 가중 평균</option>
                  <option value="zero">0% (적자/흑자)</option>
                </select>
                <MetricInfo id={marginMode === "zero" ? "bcg_threshold_zero" : marginMode === "weighted_avg" ? "bcg_threshold_weighted" : "bcg_threshold_median"} variant="inline" />
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={enableDynamic} onChange={(e) => setEnableDynamic(e.target.checked)} />
                <span>Dynamic 화살표</span>
                <MetricInfo id="bcg_dynamic_arrow" variant="inline" />
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={enablePareto} onChange={(e) => setEnablePareto(e.target.checked)} />
                <span>Pareto 80/20</span>
                <MetricInfo id="bcg_pareto_80" variant="inline" />
              </label>
            </div>

            {/* 전체 KPI — 모든 마진은 영업이익율 (영업이익 ÷ 매출) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <KpiBox label="총 매출액 (제품+상품)" value={formatCurrency(overallSummary.totalSales)} />
              <KpiBox label="총 영업이익" value={formatCurrency(overallSummary.totalProfit)}
                positive={overallSummary.totalProfit >= 0} />
              <KpiBox
                label="가중 영업이익율 (정확)"
                value={`${safeFixed(overallSummary.weightedMarginRate, 2)}%`}
                metricId="bcg_weighted_margin"
                highlight
              />
              <KpiBox
                label="산술 영업이익율 (outlier 제외)"
                value={`${safeFixed(overallSummary.arithmeticMarginExOutlier, 2)}%`}
                metricId="bcg_arithmetic_margin"
                tooltip={`outlier ${overallSummary.outlierCount}건 (|마진|>100%) 제외. 원본 산술: ${safeFixed(overallSummary.arithmeticMarginRate, 2)}%`}
              />
            </div>

            {/* 데이터 품질 정보 */}
            {(overallSummary.excludedZeroSales > 0 || overallSummary.excludedReturns > 0 || overallSummary.insufficientDataItems > 0 || overallSummary.outlierCount > 0) && (
              <div className="text-[11px] text-muted-foreground bg-muted/50 rounded p-2 flex items-start gap-1.5">
                <Info className="h-3 w-3 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <div>
                    {overallSummary.excludedZeroSales > 0 && <span>0 매출 {overallSummary.excludedZeroSales}건 제외 · </span>}
                    {overallSummary.excludedReturns > 0 && <span>반품매출 {overallSummary.excludedReturns}건 제외 · </span>}
                    {overallSummary.insufficientDataItems > 0 && <span>거래월 6개 미만 {overallSummary.insufficientDataItems}건 (Dynamic 미적용)</span>}
                  </div>
                  {overallSummary.outlierCount > 0 && (
                    <div className="text-amber-700 dark:text-amber-400">
                      ⚠ outlier {overallSummary.outlierCount}건 (|마진|&gt;100%, 매출 작은 품목) — 차트 Y축 [-50%, 100%] 클램핑됨, 실제 값은 hover 확인
                    </div>
                  )}
                  {overallSummary.missingCostCount > 0 && (
                    <div className="text-red-700 dark:text-red-400">
                      🚨 <strong>원가 미계상 의심 {overallSummary.missingCostCount}건</strong> (마진 90%+ + 원가 0원) — 회계 시스템 확인 필요
                    </div>
                  )}
                  {overallSummary.excludedNegativeCostItems > 0 && (
                    <div className="text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded p-1.5 -mx-1 space-y-0.5">
                      <div>🚨 <strong>음수 원가 {overallSummary.excludedNegativeCostItems}건 분석에서 제외</strong> (환입·조정 분개 누적)</div>
                      <div className="text-[10px] opacity-90">
                        매출원가 음수는 회계 데이터 이상 — 산식 (매출 - 매출원가)으로 계산하면 매출총이익이 매출보다 커지는 비현실적 결과 발생.
                        수학상 a − (−b) = a + b는 정확하나 비즈니스 의미 없음 → 차트에서 제외 + 별도 카운트만 표시. 회계팀에서 분개 검토 필요.
                      </div>
                    </div>
                  )}
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

function KpiBox({ label, value, positive, highlight, tooltip, metricId }: {
  label: string; value: string;
  positive?: boolean;
  highlight?: boolean;
  tooltip?: string;
  /** glossary metricId — 지정 시 라벨 옆에 ⓘ 아이콘 표시 (hover 시 BCG 용어 정의) */
  metricId?: "bcg_weighted_margin" | "bcg_arithmetic_margin" | "bcg_pareto_80" | "bcg_dynamic_arrow" | "bcg_segment_4way";
}) {
  return (
    <div
      className={`rounded p-2 ${highlight ? "bg-primary/10 border border-primary/20" : "bg-muted/30"}`}
      title={tooltip}
    >
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
        {label}
        {metricId && <MetricInfo id={metricId} variant="inline" />}
      </div>
      <div className={`font-mono font-semibold text-sm ${
        positive === false ? "text-red-600 dark:text-red-400"
        : positive === true ? "text-green-600 dark:text-green-400"
        : ""
      }`}>{value}</div>
    </div>
  );
}

// ─── Custom Tooltip — hover 시 풍부한 품목 정보 표시 ─────

function PortfolioTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const q = d.quadrant as Quadrant;
  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-md shadow-lg p-3 text-xs space-y-1.5 max-w-xs">
      {/* 품목명 + 사분면 */}
      <div className="flex items-start justify-between gap-2 pb-1.5 border-b border-border/40">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate" title={d.name}>{d.name || d.itemCode}</div>
          {d.itemCode && d.itemCode !== d.name && (
            <div className="text-[10px] text-muted-foreground font-mono">{d.itemCode}</div>
          )}
          {d.itemCategory && (
            <div className="text-[10px] text-muted-foreground">📂 {d.itemCategory}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0" style={{ color: QUADRANT_COLORS[q] }}>
          {QUADRANT_ICONS[q]}
          <span className="font-semibold text-[10px]">{getQuadrantKoreanName(q)}</span>
        </div>
      </div>

      {/* 핵심 메트릭 — 손익 계산 순서대로 */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground">매출액 (실적)</span>
        <span className="font-mono text-right">{formatCurrency(d.x)}</span>
        <span className="text-muted-foreground">매출원가</span>
        <span className="font-mono text-right">{formatCurrency(d.cost)}</span>
        <span className="text-muted-foreground">매출총이익</span>
        <span className={`font-mono text-right ${d.grossProfit < 0 ? "text-red-600" : ""}`}>
          {formatCurrency(d.grossProfit)}
        </span>
        <span className="text-muted-foreground">매출총이익율</span>
        <span className={`font-mono text-right ${d.grossMarginRate < 0 ? "text-red-600" : ""}`}>
          {safeFixed(d.grossMarginRate, 1)}%
        </span>
        <span className="text-muted-foreground">영업이익</span>
        <span className={`font-mono text-right ${d.operatingProfit < 0 ? "text-red-600" : "text-green-600"}`}>
          {formatCurrency(d.operatingProfit)}
        </span>
        <span className="text-muted-foreground font-semibold">영업이익율 (Y축)</span>
        <span className={`font-mono text-right font-semibold ${d.yActual < 0 ? "text-red-600" : "text-green-600"}`}>
          {safeFixed(d.yActual, 2)}%
          {d.isOutlier && <span className="ml-1 text-amber-600 text-[10px]">⚠ outlier</span>}
        </span>
        <span className="text-muted-foreground">거래월</span>
        <span className="font-mono text-right">{d.monthCount}개월</span>
      </div>

      {/* 추세 + Pareto */}
      {(d.trendDirection !== "insufficient_data" || d.isPareto80) && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-[10px]">
          {d.trendDirection === "improving" && <span className="text-green-600">↗ 추세 개선</span>}
          {d.trendDirection === "declining" && <span className="text-red-600">↘ 추세 악화</span>}
          {d.trendDirection === "stable" && <span>→ 추세 안정</span>}
          {d.isPareto80 && <span className="text-violet-600">⭐ Pareto Top 20% (매출 80% 차지)</span>}
        </div>
      )}

      {/* 데이터 품질 warning */}
      {d.hasNegativeCost && (
        <div className="pt-1 border-t border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 rounded -mx-1 px-2 py-1 text-[10px] text-red-800 dark:text-red-300 space-y-0.5">
          <div>🚨 <strong>매출원가 음수</strong> ({formatCurrency(d.cost)}) — 회계 분개 누적 결과</div>
          <div className="text-[9px] opacity-80">
            기간/조직 필터 적용 시 환입·조정 분개가 출고 원가를 초과한 경우.
            매출총이익율 100% 초과 (={safeFixed(d.grossMarginRate, 1)}%) — 정상 비즈니스 마진 ❌. 회계팀 확인 필요
          </div>
        </div>
      )}
      {d.hasMissingCost && (
        <div className="pt-1 border-t border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 rounded -mx-1 px-2 py-1 text-[10px] text-amber-800 dark:text-amber-300">
          🚨 <strong>원가 미계상 가능성</strong> — 매출 있고 원가 0원 + 마진 90%+. 회계 시스템 확인 필요
        </div>
      )}
      {d.isOutlier && !d.hasMissingCost && !d.hasNegativeCost && (
        <div className="pt-1 border-t border-border/40 text-[10px] text-amber-700 dark:text-amber-400">
          ⚠ outlier — 매출 작거나 원가 변동 큰 품목. 의사결정 시 매출 가중 평균 우선
        </div>
      )}
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
  // Y축 클램핑 [-50, 100] — outlier 1% (|마진|>100%) 처리
  const Y_MIN = -50;
  const Y_MAX = 100;
  const chartData = entries.map(e => {
    const isOutlier = e.marginRate > Y_MAX || e.marginRate < Y_MIN;
    return {
      x: e.sales,
      // 클램핑된 표시 값 (실제 marginRate는 별도)
      y: Math.max(Y_MIN, Math.min(Y_MAX, e.marginRate)),
      yActual: e.marginRate,
      name: e.itemName,
      itemCode: e.itemCode,
      itemCategory: e.category,
      quadrant: e.quadrant,
      isPareto80: e.isPareto80,
      isOutlier,
      cost: e.cost,
      grossProfit: e.grossProfit,
      grossMarginRate: e.grossMarginRate,
      hasMissingCost: e.hasMissingCost,
      hasNegativeCost: e.hasNegativeCost,
      operatingProfit: e.operatingProfit,
      monthCount: e.monthCount,
      trendDirection: e.trendDirection,
    };
  });
  const outlierCount = chartData.filter(d => d.isOutlier).length;
  const missingCostCount = chartData.filter(d => d.hasMissingCost).length;
  // 음수 원가 품목은 알고리즘에서 자동 제외됨 (수학상 a-(-b)=a+b 정확하나 매출<영업이익 비현실적).
  // overallSummary.excludedNegativeCostItems로만 카운트되므로 segment 레벨 표시 불필요.

  return (
    <div
      className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary rounded" : ""}`}
      onClick={onClick}
    >
      <ChartCard
        title={`${segment} (${entries.length}건) · 매출 ${formatCurrency(totalSales)} · 가중 영업이익율 ${safeFixed(weightedMarginRate, 1)}%`}
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
              type="number" dataKey="y" name="영업이익율"
              domain={[Y_MIN, Y_MAX]}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              tick={{ fontSize: 10 }}
              label={{ value: "영업이익율 (영업이익÷매출) [-50~100%]", angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <RechartsTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={<PortfolioTooltip />}
            />
            <ReferenceLine x={thresholds.salesThreshold} stroke="hsl(0,0%,50%)" strokeDasharray="3 3" />
            <ReferenceLine y={thresholds.marginThreshold} stroke="hsl(0,0%,50%)" strokeDasharray="3 3" />
            <Scatter
              data={chartData}
              fill="hsl(221.2, 83.2%, 53.3%)"
              shape={(props: any) => {
                // 사분면별 SVG 모양: Star=별 / Cash Cow=원 / Problem Child=다이아 / Dog=역삼각
                const { cx, cy, payload } = props;
                if (cx == null || cy == null) return <g />;
                const q = payload.quadrant as Quadrant;
                const isOL = payload.isOutlier;
                const isPareto = payload.isPareto80;
                const fill = QUADRANT_COLORS[q];
                const stroke = isOL ? "hsl(0, 0%, 10%)" : (isPareto ? "hsl(0, 0%, 0%)" : "transparent");
                const strokeWidth = isOL ? 2 : (isPareto ? 1.5 : 0);
                const size = 5;
                if (q === "star") {
                  // 별 모양 (5각 별 path)
                  const outer = 7;
                  const inner = 3;
                  const points: string[] = [];
                  for (let i = 0; i < 10; i++) {
                    const angle = (Math.PI / 5) * i - Math.PI / 2;
                    const r = i % 2 === 0 ? outer : inner;
                    points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
                  }
                  return <polygon points={points.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                }
                if (q === "cash_cow") {
                  return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                }
                if (q === "problem_child") {
                  // 다이아몬드 (회전 사각형)
                  return <polygon points={`${cx},${cy - size - 1} ${cx + size + 1},${cy} ${cx},${cy + size + 1} ${cx - size - 1},${cy}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
                }
                // dog → 역삼각형
                return <polygon points={`${cx - size - 1},${cy - size + 1} ${cx + size + 1},${cy - size + 1} ${cx},${cy + size + 1}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />;
              }}
            >
              {/* shape 함수가 모양 + 색상 + outline 모두 처리하므로 Cell 미사용 */}
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
        {/* outlier + missing cost warning */}
        {outlierCount > 0 && (
          <div className="px-3 pb-1 text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            <span>outlier {outlierCount}건 (|마진|&gt;{Y_MAX}% 또는 &lt;{Y_MIN}%) — 경계 라인에 표시 + 검은 outline. 실제 값은 hover 시 확인</span>
          </div>
        )}
        {missingCostCount > 0 && (
          <div className="px-3 pb-1 text-[10px] text-red-700 dark:text-red-400 flex items-center gap-1">
            <Info className="h-3 w-3 shrink-0" />
            <span>🚨 원가 미계상 의심 {missingCostCount}건 (마진 90%+ + 원가 0원) — hover 시 품목 확인</span>
          </div>
        )}
        {/* 사분면별 미니 통계 — hover 시 BCG 사분면 정의 표시 */}
        <div className="grid grid-cols-4 gap-1 px-3 pb-2 text-[10px]">
          {(["star", "cash_cow", "problem_child", "dog"] as Quadrant[]).map(q => (
            <div key={q} className="flex items-center gap-1 rounded p-1" style={{ backgroundColor: `${QUADRANT_COLORS[q]}20` }}>
              <span style={{ color: QUADRANT_COLORS[q] }}>{QUADRANT_ICONS[q]}</span>
              <MetricInfo
                id={q === "star" ? "bcg_star" : q === "cash_cow" ? "bcg_cash_cow" : q === "problem_child" ? "bcg_problem_child" : "bcg_dog"}
                variant="inline"
              />
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
