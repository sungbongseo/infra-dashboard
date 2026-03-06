"use client";

import { useMemo, useState, useEffect } from "react";
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
import { ChevronRight, Home } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  calcItemHierarchy,
  getNodesAtPath,
  calcCostWaterfall,
  calcProfitMatrix,
  type DrillDownStep,
} from "@/lib/analysis/itemHierarchy";
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

export function ItemTab({ filteredSales, filteredItemProfit, inventoryMap, isDateFiltered }: ItemTabProps) {
  const [drillPath, setDrillPath] = useState<DrillDownStep[]>([]);

  // Reset drill path when data changes
  useEffect(() => {
    setDrillPath([]);
  }, [filteredSales, filteredItemProfit]);

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

  if (filteredSales.length === 0 && filteredItemProfit.length === 0) {
    return <EmptyState />;
  }

  // Treemap data: top 30 nodes
  const treemapData = currentNodes
    .filter(n => n.sales > 0)
    .slice(0, 30)
    .map(n => ({ name: n.name, size: n.sales }));

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
    "비중(%)": Number(n.share.toFixed(1)),
    ...(hierarchy.hasFullPL ? {
      "매출총이익율(%)": n.grossMargin !== undefined ? Number(n.grossMargin.toFixed(1)) : "",
      "영업이익율(%)": n.operatingMargin !== undefined ? Number(n.operatingMargin.toFixed(1)) : "",
      "원가율(%)": n.costRatio !== undefined ? Number(n.costRatio.toFixed(1)) : "",
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
            ? "품목별 수익성 분석(회계) — Full P&L"
            : "매출리스트 기반 — 매출 데이터만"}
        </Badge>
        {hierarchy.coverage.map(c => (
          <Badge
            key={c.level}
            variant="outline"
            className={c.active ? "border-green-500 text-green-700 dark:text-green-400" : "opacity-50"}
          >
            {c.level}: {c.uniqueValues}종
          </Badge>
        ))}
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
                if (width < 40 || height < 25) return <g />;
                const clickable = hasChildren(String(name));
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
                    <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>
                      {truncateLabel(String(name), 8)}
                    </text>
                    <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>
                      {formatCurrency(value, true)}
                    </text>
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
                <th className="text-right py-2 px-3 font-medium">매출액</th>
                <th className="text-right py-2 px-3 font-medium">비중(%)</th>
                <th className="text-right py-2 px-3 font-medium">건수</th>
                {hierarchy.hasFullPL && (
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
                    <td className="text-right py-2 px-3 font-mono">{formatCurrency(node.sales)}</td>
                    <td className="text-right py-2 px-3">{isFinite(node.share) ? node.share.toFixed(1) : "0.0"}%</td>
                    <td className="text-right py-2 px-3">{node.count.toLocaleString()}</td>
                    {hierarchy.hasFullPL && (
                      <>
                        <td className={`text-right py-2 px-3 ${marginColor(node.grossMargin)}`}>
                          {node.grossMargin !== undefined ? `${node.grossMargin.toFixed(1)}%` : "-"}
                        </td>
                        <td className={`text-right py-2 px-3 ${marginColor(node.operatingMargin)}`}>
                          {node.operatingMargin !== undefined ? `${node.operatingMargin.toFixed(1)}%` : "-"}
                        </td>
                        <td className="text-right py-2 px-3">
                          {node.costRatio !== undefined ? `${node.costRatio.toFixed(1)}%` : "-"}
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
                            {inv ? `${inv.turnover.toFixed(1)}x` : "-"}
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
                  if (name === "매출총이익율") return `${Number(value).toFixed(1)}%`;
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
    </div>
  );
}

function marginColor(value: number | undefined): string {
  if (value === undefined) return "";
  if (value >= 20) return "text-emerald-600 dark:text-emerald-400";
  if (value >= 10) return "text-amber-500 dark:text-amber-400";
  return "text-red-500 dark:text-red-400";
}
