"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
  Treemap,
} from "recharts";
import { ChevronRight, Home, AlertTriangle, DollarSign, TrendingDown, BarChart3 } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  calcItemHierarchy,
  getNodesAtPath,
  calcCostWaterfall,
  calcProfitMatrix,
  type DrillDownStep,
} from "@/lib/analysis/itemHierarchy";
import { calcItemPriceBandByLevel } from "@/lib/analysis/itemPriceBand";
import type { PriceBandLevel, PriceBandDrillStep, ItemPriceBand } from "@/lib/analysis/itemPriceBand";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DataTable } from "@/components/dashboard/DataTable";
import type { ColumnDef } from "@tanstack/react-table";
import type { SalesRecord, ItemProfitabilityRecord } from "@/types";
import type { ItemInventoryInfo } from "@/lib/analysis/itemHierarchy";

interface ItemTabProps {
  filteredSales: SalesRecord[];
  filteredItemProfit: ItemProfitabilityRecord[];
  inventoryMap?: Map<string, ItemInventoryInfo>;
  isDateFiltered?: boolean;
}

const QUADRANT_COLORS: Record<string, string> = {
  star: CHART_COLORS[2],      // green
  cashcow: CHART_COLORS[0],   // blue
  question: CHART_COLORS[3],  // amber
  dog: CHART_COLORS[4],       // red
};

const QUADRANT_LABELS: Record<string, string> = {
  star: "Stars (고매출+고마진)",
  cashcow: "Cash Cows (고매출+저마진)",
  question: "Question Marks (저매출+고마진)",
  dog: "Dogs (저매출+저마진)",
};

type ViewMode = "actual" | "plan" | "comparison";

const DRILL_PATH_KEY = "itemTab_drillPath";

export function ItemTab({ filteredSales, filteredItemProfit, inventoryMap, isDateFiltered }: ItemTabProps) {
  const [drillPath, setDrillPath] = useState<DrillDownStep[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = sessionStorage.getItem(DRILL_PATH_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [viewMode, setViewMode] = useState<ViewMode>("actual");

  // 드릴 경로 변경 시 sessionStorage에 저장 (탭 전환 후 복귀 시 유지)
  useEffect(() => {
    try { sessionStorage.setItem(DRILL_PATH_KEY, JSON.stringify(drillPath)); } catch { /* ignore */ }
  }, [drillPath]);

  // Reset drill path when data size changes (avoid excessive resets on reference changes)
  useEffect(() => {
    setDrillPath([]);
  }, [filteredSales.length, filteredItemProfit.length]);

  const hasItemProfit = filteredItemProfit.length > 0;
  const hasInventory = inventoryMap !== undefined && inventoryMap.size > 0;

  const hierarchy = useMemo(
    () => calcItemHierarchy(
      hasItemProfit ? filteredItemProfit : null,
      filteredSales,
    ),
    [filteredItemProfit, filteredSales, hasItemProfit],
  );

  const currentNodes = useMemo(
    () => getNodesAtPath(hierarchy.root, drillPath),
    [hierarchy, drillPath],
  );

  const waterfall = useMemo(
    () => hasItemProfit ? calcCostWaterfall(filteredItemProfit, drillPath) : [],
    [filteredItemProfit, drillPath, hasItemProfit],
  );

  const profitMatrix = useMemo(
    () => hasItemProfit ? calcProfitMatrix(filteredItemProfit) : [],
    [filteredItemProfit, hasItemProfit],
  );

  const hasPlanData = (hierarchy.root.salesPlan ?? 0) > 0;

  if (filteredSales.length === 0 && filteredItemProfit.length === 0) {
    return <EmptyState />;
  }

  // Node value accessor based on view mode
  const getSales = (n: typeof currentNodes[0]) =>
    viewMode === "plan" ? (n.salesPlan ?? 0) : n.sales;

  // Treemap data: top 30 nodes
  const treemapData = currentNodes
    .filter(n => getSales(n) > 0)
    .slice(0, 30)
    .map(n => ({ name: n.name, size: getSales(n) }));

  const hasChildren = (name: string) => {
    const node = currentNodes.find(n => n.name === name);
    return !!(node?.children && node.children.length > 0);
  };

  const drillInto = (name: string) => {
    const node = currentNodes.find(n => n.name === name);
    if (node?.children && node.children.length > 0) {
      setDrillPath(prev => [...prev, { level: node.level, name }]);
    }
  };

  // Table export data
  const tableExport = currentNodes.map(n => ({
    이름: n.name,
    매출액: n.sales,
    "비중(%)": Number(safeFixed(n.share, 1)),
    ...(hierarchy.hasFullPL ? {
      "매출총이익율(%)": n.grossMargin !== undefined ? Number(safeFixed(n.grossMargin, 1)) : "",
      "영업이익율(%)": n.operatingMargin !== undefined ? Number(safeFixed(n.operatingMargin, 1)) : "",
      "원가율(%)": n.costRatio !== undefined ? Number(safeFixed(n.costRatio, 1)) : "",
    } : {}),
  }));

  // Waterfall chart data: base + value for stacked bar
  const waterfallChart = waterfall.map(e => {
    if (e.type === "revenue" || e.type === "subtotal" || e.type === "profit") {
      return { name: e.name, base: 0, value: Math.abs(e.value), raw: e.value, type: e.type };
    }
    // Cost items: show as descending from cumulative
    const top = e.cumulative + Math.abs(e.value);
    const bottom = e.cumulative;
    return {
      name: e.name,
      base: Math.min(top, bottom),
      value: Math.abs(e.value),
      raw: e.value,
      type: e.type,
    };
  });

  const waterfallColor = (type: string) => {
    switch (type) {
      case "revenue": return "hsl(142, 76%, 36%)";
      case "cost": return "hsl(0, 84%, 60%)";
      case "subtotal": return CHART_COLORS[0];
      case "profit": return "hsl(142, 76%, 36%)";
      default: return CHART_COLORS[5];
    }
  };

  // Scatter chart medians
  const medianSales = profitMatrix.length > 0
    ? [...profitMatrix].sort((a, b) => a.sales - b.sales)[Math.floor(profitMatrix.length / 2)].sales
    : 0;
  const medianMargin = profitMatrix.length > 0
    ? [...profitMatrix].sort((a, b) => a.grossMargin - b.grossMargin)[Math.floor(profitMatrix.length / 2)].grossMargin
    : 0;

  return (
    <div className="space-y-6">
      {/* Data source badge + coverage */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={hasItemProfit ? "default" : "secondary"}>
          {hasItemProfit
            ? "데이터: 200.품목별 수익성 분석(회계)"
            : "데이터: 매출리스트"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          탭 매출 합계: {formatCurrency(hierarchy.totalSales)}
          {hasItemProfit && " (SAP 200 리포트 기준, KPI 총매출액과 데이터 소스가 다를 수 있음)"}
        </span>
        {hierarchy.coverage.map(c => (
          <Badge
            key={c.level}
            variant="outline"
            className={c.active ? "border-green-500 text-green-700 dark:text-green-400" : "opacity-50"}
          >
            {c.level}: {c.uniqueValues}종
          </Badge>
        ))}
        {hasPlanData && (
          <div className="ml-auto flex items-center gap-1 rounded-lg border p-0.5">
            {(["actual", "plan", "comparison"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "actual" ? "실적" : mode === "plan" ? "계획" : "비교"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Breadcrumb navigation */}
      <nav className="flex items-center gap-1 text-sm flex-wrap">
        <button
          onClick={() => setDrillPath([])}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Home className="h-3.5 w-3.5" />
          전체
        </button>
        {drillPath.map((step, idx) => (
          <span key={idx} className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              onClick={() => setDrillPath(prev => prev.slice(0, idx + 1))}
              className={idx === drillPath.length - 1
                ? "font-semibold text-foreground"
                : "text-muted-foreground hover:text-foreground transition-colors"
              }
            >
              {truncateLabel(step.name, 15)}
            </button>
          </span>
        ))}
      </nav>

      {/* Treemap — clickable drill-down */}
      {treemapData.length > 0 && (
        <ChartCard
          title={`품목 구성 (${drillPath.length > 0 ? drillPath[drillPath.length - 1].name : "전체"})`}
          dataSourceType={hasItemProfit ? "snapshot" : "period"}
          isDateFiltered={isDateFiltered}
          formula="노드 면적 = 해당 분류/품목의 매출액 비중"
          description="면적이 클수록 매출 비중이 높습니다. 파란색 노드를 클릭하면 하위 계층으로 드릴다운합니다. 청록색 노드는 최하위 품목입니다."
          benchmark="상위 3개 품목/분류가 매출의 80% 이상이면 집중 리스크"
          reason="품목 구성의 편중도를 시각적으로 파악하여 포트폴리오 다각화 필요성을 판단합니다"
        >
          <ChartContainer height="h-64 md:h-80">
            <Treemap
              data={treemapData}
              dataKey="size"
              aspectRatio={4 / 3}
              stroke="hsl(var(--background))"
              content={(props: any) => {
                const { x, y, width, height, name, value } = props;
                const clickable = hasChildren(String(name));
                const tooSmall = width < 40 || height < 25;
                return (
                  <g
                    style={{ cursor: clickable ? "pointer" : "default" }}
                    onClick={() => clickable && drillInto(String(name))}
                  >
                    <rect
                      x={x} y={y} width={width} height={height}
                      fill={clickable ? CHART_COLORS[0] : CHART_COLORS[1]}
                      opacity={0.85}
                      rx={4}
                    />
                    {!tooSmall && (
                      <>
                        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>
                          {truncateLabel(String(name), 8)}
                        </text>
                        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>
                          {formatCurrency(value, true)}
                        </text>
                      </>
                    )}
                  </g>
                );
              }}
            />
          </ChartContainer>
        </ChartCard>
      )}

      {/* Summary table */}
      <ChartCard
        title="품목 요약"
        dataSourceType={hasItemProfit ? "snapshot" : "period"}
        isDateFiltered={isDateFiltered}
        formula="비중(%) = 품목 매출 ÷ 전체 매출 × 100. 200 데이터 시 매출총이익율, 영업이익율, 원가율 추가"
        description="현재 드릴 위치의 품목/분류별 매출액, 비중, 건수를 표시합니다. 200 품목별 수익성 데이터가 업로드되어 있으면 수익률 컬럼이 추가됩니다."
        benchmark="단일 품목 비중 30% 이상이면 의존도 주의, 이익율 15% 미만이면 가격/원가 재검토"
        reason="품목별 매출 비중과 수익성을 한눈에 비교하여, 주력 품목 확인 및 저수익 품목의 개선 전략을 수립합니다"
        action={<ExportButton data={tableExport} fileName="품목별분석" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-3 font-medium">이름</th>
                <th className="text-right py-2 px-3 font-medium">
                  {viewMode === "plan" ? "계획 매출" : "실적 매출"}
                </th>
                {viewMode === "comparison" && hasPlanData && (
                  <>
                    <th className="text-right py-2 px-3 font-medium">계획 매출</th>
                    <th className="text-right py-2 px-3 font-medium">달성율</th>
                  </>
                )}
                <th className="text-right py-2 px-3 font-medium">비중(%)</th>
                <th className="text-right py-2 px-3 font-medium">건수</th>
                {hierarchy.hasFullPL && viewMode !== "plan" && (
                  <>
                    <th className="text-right py-2 px-3 font-medium">매출총이익율</th>
                    <th className="text-right py-2 px-3 font-medium">영업이익율</th>
                    <th className="text-right py-2 px-3 font-medium">원가율</th>
                  </>
                )}
                {hasInventory && (
                  <>
                    <th className="text-right py-2 px-3 font-medium">기말수량</th>
                    <th className="text-right py-2 px-3 font-medium">회전율</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {currentNodes.map((node, i) => {
                const clickable = !!(node.children && node.children.length > 0);
                return (
                  <tr
                    key={i}
                    className={`border-b hover:bg-muted/50 ${clickable ? "cursor-pointer" : ""}`}
                    onClick={() => clickable && drillInto(node.name)}
                  >
                    <td className="py-2 px-3">
                      <span className={clickable ? "text-primary underline-offset-2 hover:underline" : ""}>
                        {truncateLabel(node.name, 25)}
                      </span>
                      {node.code && (
                        <span className="ml-1 text-xs text-muted-foreground">[{node.code}]</span>
                      )}
                    </td>
                    <td className="text-right py-2 px-3 font-mono">
                      {formatCurrency(viewMode === "plan" ? (node.salesPlan ?? 0) : node.sales)}
                    </td>
                    {viewMode === "comparison" && hasPlanData && (() => {
                      const plan = node.salesPlan ?? 0;
                      const actual = node.sales;
                      const achievement = plan > 0 ? (actual / plan) * 100 : (actual > 0 ? Infinity : 0);
                      return (
                        <>
                          <td className="text-right py-2 px-3 font-mono text-muted-foreground">
                            {formatCurrency(plan)}
                          </td>
                          <td className={`text-right py-2 px-3 font-semibold ${
                            !isFinite(achievement) ? "text-muted-foreground"
                            : achievement >= 100 ? "text-green-600 dark:text-green-400"
                            : achievement >= 70 ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                          }`}>
                            {isFinite(achievement) ? `${achievement.toFixed(1)}%` : plan === 0 ? "-" : "∞"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="text-right py-2 px-3">{isFinite(node.share) ? node.share.toFixed(1) : "0.0"}%</td>
                    <td className="text-right py-2 px-3">{node.count.toLocaleString()}</td>
                    {hierarchy.hasFullPL && viewMode !== "plan" && (
                      <>
                        <td className={`text-right py-2 px-3 ${marginColor(node.grossMargin)}`}>
                          {node.grossMargin !== undefined ? `${safeFixed(node.grossMargin, 1)}%` : "-"}
                        </td>
                        <td className={`text-right py-2 px-3 ${marginColor(node.operatingMargin)}`}>
                          {node.operatingMargin !== undefined ? `${safeFixed(node.operatingMargin, 1)}%` : "-"}
                        </td>
                        <td className="text-right py-2 px-3">
                          {node.costRatio !== undefined ? `${safeFixed(node.costRatio, 1)}%` : "-"}
                        </td>
                      </>
                    )}
                    {hasInventory && (() => {
                      const inv = inventoryMap!.get(node.code || node.name);
                      return (
                        <>
                          <td className="text-right py-2 px-3 font-mono">
                            {inv ? `${inv.ending.toLocaleString()} ${inv.단위}` : "-"}
                          </td>
                          <td className={`text-right py-2 px-3 font-mono ${
                            inv ? (inv.turnover >= 6 ? "text-green-600 dark:text-green-400"
                              : inv.turnover >= 3 ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400") : ""
                          }`}>
                            {inv ? `${safeFixed(inv.turnover, 1)}x` : "-"}
                          </td>
                        </>
                      );
                    })()}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Cost structure waterfall (200 data only) */}
      {waterfallChart.length > 0 && (
        <ChartCard
          title="원가 구조 워터폴"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="매출액 → 원가항목(7그룹) → 매출총이익 → 판관비 → 영업이익"
          description="현재 드릴 위치의 매출에서 각 원가 항목이 차감되어 최종 영업이익에 이르는 과정을 보여줍니다."
          benchmark="매출원가율 70% 이하이면 양호, 85% 이상이면 원가 관리 필요. 판관비율 15% 이내 정상"
          reason="어떤 원가 항목이 이익을 가장 많이 잠식하는지 식별하여 원가 절감 우선순위를 결정합니다."
        >
          <ChartContainer height="h-72 md:h-96">
            <BarChart data={waterfallChart}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "base") return null;
                  return formatCurrency(Number(value));
                }}
                labelFormatter={(label: any) => String(label)}
              />
              <Bar dataKey="base" stackId="a" fill="transparent" {...ANIMATION_CONFIG} />
              <Bar dataKey="value" stackId="a" {...ANIMATION_CONFIG}>
                {waterfallChart.map((entry, i) => (
                  <Cell key={i} fill={waterfallColor(entry.type)} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* Profit matrix scatter (200 data only) */}
      {profitMatrix.length > 0 && (
        <ChartCard
          title="수익성 매트릭스"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="X = 매출액, Y = 매출총이익율(%), 사분면 = 중앙값 기준"
          description="각 품목을 매출 규모(X축)와 수익성(Y축)의 2차원에 배치합니다. Stars(고매출+고마진)는 핵심 제품, Dogs(저매출+저마진)는 전략적 처리가 필요합니다."
          benchmark="Stars 사분면에 매출의 50% 이상이 집중되면 이상적. Dogs가 20% 이상이면 포트폴리오 정리 필요"
          reason="품목별 수익 기여도를 한눈에 파악하여 포트폴리오 최적화 의사결정을 지원합니다."
        >
          <ChartContainer height="h-72 md:h-96">
            <ScatterChart>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                type="number"
                dataKey="sales"
                name="매출액"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: any) => formatCurrency(v, true)}
              />
              <YAxis
                type="number"
                dataKey="grossMargin"
                name="매출총이익율"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: any) => `${v}%`}
                unit="%"
              />
              <ZAxis range={[40, 400]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "매출액") return formatCurrency(Number(value));
                  if (name === "매출총이익율") return `${safeFixed(Number(value), 1)}%`;
                  return value;
                }}
              />
              <ReferenceLine y={medianMargin} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
              <ReferenceLine x={medianSales} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
              <Scatter data={profitMatrix} name="품목">
                {profitMatrix.map((item, i) => (
                  <Cell key={i} fill={QUADRANT_COLORS[item.quadrant] || CHART_COLORS[5]} />
                ))}
              </Scatter>
              {/* 4사분면 라벨 */}
              {profitMatrix.length >= 2 && (
                <g>
                  <text x="95%" y="8%" textAnchor="end" fontSize={11} fontWeight={600} fill={QUADRANT_COLORS.star} opacity={0.7}>스타 품목</text>
                  <text x="5%" y="8%" textAnchor="start" fontSize={11} fontWeight={600} fill={QUADRANT_COLORS.question} opacity={0.7}>니치 품목</text>
                  <text x="95%" y="95%" textAnchor="end" fontSize={11} fontWeight={600} fill={QUADRANT_COLORS.cashcow} opacity={0.7}>볼륨 품목</text>
                  <text x="5%" y="95%" textAnchor="start" fontSize={11} fontWeight={600} fill={QUADRANT_COLORS.dog} opacity={0.7}>정리 검토</text>
                </g>
              )}
            </ScatterChart>
          </ChartContainer>
          {/* Quadrant legend */}
          <div className="flex flex-wrap gap-3 mt-3 px-2 text-xs text-muted-foreground">
            {Object.entries(QUADRANT_LABELS).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: QUADRANT_COLORS[key] }}
                />
                {label}
              </span>
            ))}
          </div>
        </ChartCard>
      )}
      {/* ── 품목별 단가 밴드 분석 (드릴다운) ─────────────── */}
      <PriceBandSection filteredSales={filteredSales} isDateFiltered={isDateFiltered} />
    </div>
  );
}

// ─── 단가 밴드 서브 컴포넌트 ──────────────────────────────────────

function PriceBandSection({ filteredSales, isDateFiltered }: { filteredSales: SalesRecord[]; isDateFiltered?: boolean }) {
  const [drillPath, setDrillPath] = useState<PriceBandDrillStep[]>([]);
  const currentLevel: PriceBandLevel = (["대분류", "중분류", "소분류", "품목"] as const)[Math.min(drillPath.length, 3)];

  const priceBand = useMemo(
    () => calcItemPriceBandByLevel(filteredSales, currentLevel, drillPath),
    [filteredSales, currentLevel, drillPath]
  );

  const handleDrillDown = useCallback((item: ItemPriceBand) => {
    if (currentLevel === "품목") return;
    setDrillPath(prev => [...prev, { level: currentLevel, value: item.품목명 || item.품목 }]);
  }, [currentLevel]);

  const handleBreadcrumb = useCallback((index: number) => {
    setDrillPath(prev => prev.slice(0, index));
  }, []);

  if (priceBand.totalItems === 0) return null;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard title="분석 품목 수" value={priceBand.totalItems} format="number" icon={<BarChart3 className="h-5 w-5" />}
          formula="장부금액 > 0, 수량 > 0 인 거래의 고유 품목×단위 수"
          description="단가 분석이 가능한 품목의 수입니다."
        />
        <KpiCard title="평균 단가편차율" value={priceBand.avgVariationRate} format="percent" icon={<TrendingDown className="h-5 w-5" />}
          formula="각 품목의 (Q3단가 - Q1단가) / 중앙값단가 × 100 의 평균"
          description="거래처별로 동일 품목의 단가가 얼마나 차이나는지를 보여줍니다."
          benchmark="10% 미만이면 균일 가격, 20% 초과이면 가격정책 점검 필요"
        />
        <KpiCard title="단가편차 20%+ 품목" value={priceBand.highVariationCount} format="number" icon={<DollarSign className="h-5 w-5" />}
          formula="단가편차율이 20%를 초과하는 품목 수"
          description="거래처마다 단가 차이가 큰 품목입니다."
        />
      </div>

      {priceBand.highVariationCount > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>단가편차 점검 필요:</strong> {priceBand.highVariationCount}개 품목에서 거래처간 단가 편차가 20%를 초과합니다.
          </p>
        </div>
      )}

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title={`단가 밴드 분석 — ${currentLevel} (${priceBand.totalItems}건)`}
        formula="가중평균 = Σ장부금액 / Σ수량 (원화), 중앙값 = 거래건별 단가 정렬 중간값, 편차율 = (Q3-Q1)/중앙값 × 100"
        description="대분류→중분류→소분류→품목 순으로 클릭하여 드릴다운. 동일 품목도 단위(EA/LOT)가 다르면 별도 행으로 표시."
        benchmark="편차율 10% 미만: 균일, 10~20%: 정상, 20%+: 점검"
      >
        <div className="flex items-center gap-1 text-sm mb-3 flex-wrap">
          <button onClick={() => handleBreadcrumb(0)} className={`px-2 py-0.5 rounded hover:bg-muted transition-colors ${drillPath.length === 0 ? "font-bold text-foreground" : "text-blue-600 dark:text-blue-400 cursor-pointer"}`}>전체</button>
          {drillPath.map((step, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button onClick={() => handleBreadcrumb(i + 1)} className={`px-2 py-0.5 rounded hover:bg-muted transition-colors ${i === drillPath.length - 1 ? "font-bold text-foreground" : "text-blue-600 dark:text-blue-400 cursor-pointer"}`}>{step.level}: {step.value}</button>
            </span>
          ))}
          {currentLevel !== "품목" && <span className="text-xs text-muted-foreground ml-2">(행 클릭으로 드릴다운)</span>}
        </div>
        <DataTable
          columns={[
            { accessorKey: "품목명", header: currentLevel, cell: ({ row }: any) => (
              <button onClick={() => currentLevel !== "품목" && handleDrillDown(row.original)} className={`font-medium max-w-[200px] truncate block text-left ${currentLevel !== "품목" ? "text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" : ""}`} title={row.original.품목명}>
                {row.original.품목명}{currentLevel !== "품목" && <ChevronRight className="h-3 w-3 inline ml-1 opacity-50" />}
              </button>
            )},
            ...(currentLevel === "품목" ? [{ accessorKey: "단위" as const, header: "단위", cell: ({ row }: any) => <span className="text-muted-foreground">{row.original.단위}</span> }] : []),
            { accessorKey: "거래처수", header: () => <span className="block text-right">거래처</span>, cell: ({ row }: any) => <span className="block text-right tabular-nums">{row.original.거래처수}</span> },
            { accessorKey: "가중평균단가", header: () => <span className="block text-right">가중평균</span>, cell: ({ row }: any) => <span className="block text-right tabular-nums font-medium">{row.original.가중평균단가.toLocaleString()}</span> },
            { accessorKey: "중앙값단가", header: () => <span className="block text-right">중앙값</span>, cell: ({ row }: any) => <span className="block text-right tabular-nums">{row.original.중앙값단가.toLocaleString()}</span> },
            { accessorKey: "최저단가", header: () => <span className="block text-right">최저</span>, cell: ({ row }: any) => <span className="block text-right tabular-nums text-muted-foreground">{row.original.최저단가.toLocaleString()}</span> },
            { accessorKey: "최고단가", header: () => <span className="block text-right">최고</span>, cell: ({ row }: any) => <span className="block text-right tabular-nums text-muted-foreground">{row.original.최고단가.toLocaleString()}</span> },
            { accessorKey: "단가편차율", header: () => <span className="block text-right">편차율</span>, cell: ({ row }: any) => {
              const v = row.original.단가편차율;
              return <span className={`block text-right tabular-nums font-medium ${v > 20 ? "text-red-600 dark:text-red-400" : v > 10 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{v}%</span>;
            }},
            { accessorKey: "총매출액", header: () => <span className="block text-right">매출액</span>, cell: ({ row }: any) => <span className="block text-right tabular-nums">{formatCurrency(row.original.총매출액, true)}</span> },
          ] as ColumnDef<ItemPriceBand, any>[]}
          data={priceBand.items}
        />
      </ChartCard>
    </>
  );
}

function marginColor(value: number | undefined): string {
  if (value === undefined) return "";
  if (value >= 20) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 10) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}
