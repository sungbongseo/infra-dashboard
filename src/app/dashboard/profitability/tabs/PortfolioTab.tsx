"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, ReferenceLine,
  BarChart, Bar,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { Target, TrendingDown, ArrowUpDown, Scissors, AlertTriangle } from "lucide-react";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcPortfolioOptimization,
  type PortfolioItem,
  type PortfolioResult,
} from "@/lib/analysis/portfolioOptimization";
import type { ItemProfitabilityRecord } from "@/types";

const ACTION_COLORS: Record<string, string> = {
  FOCUS: "hsl(142, 71%, 45%)",
  MAINTAIN: "hsl(217, 91%, 60%)",
  OPTIMIZE: "hsl(45, 93%, 47%)",
  DISCONTINUE: "hsl(0, 84%, 60%)",
};

const ACTION_LABELS: Record<string, string> = {
  FOCUS: "집중",
  MAINTAIN: "유지",
  OPTIMIZE: "최적화",
  DISCONTINUE: "단종 검토",
};

const QUADRANT_LABELS: Record<string, string> = {
  star: "스타",
  cashcow: "캐시카우",
  question: "물음표",
  dog: "개",
};

interface PortfolioTabProps {
  filteredItemProfitability: ItemProfitabilityRecord[];
  isDateFiltered?: boolean;
}

/** 안전한 toFixed — NaN/Infinity 방지 */
function safeFixed(val: number, digits = 1): string {
  return isFinite(val) ? val.toFixed(digits) : "0.0";
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
      style={{ backgroundColor: ACTION_COLORS[action] }}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

export function PortfolioTab({ filteredItemProfitability, isDateFiltered }: PortfolioTabProps) {
  const [sortField, setSortField] = useState<"compositeScore" | "sales" | "operatingMargin">("compositeScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const result: PortfolioResult = useMemo(
    () => calcPortfolioOptimization(filteredItemProfitability),
    [filteredItemProfitability]
  );

  const { items, summary, topFocus, topDiscontinue, categorySummary } = result;

  // Scatter data: 매출(X) vs 영업이익률(Y), 복합점수 기반 크기
  const scatterData = useMemo(
    () =>
      items.map((it) => ({
        x: it.sales,
        y: it.operatingMargin,
        z: Math.max(it.compositeScore, 5),
        name: truncateLabel(it.품목.replace(/^\[([^\]]+)\]\s*/, "$1 "), 20),
        fullName: `${it.품목} (${it.조직})`,
        action: it.action,
        score: it.compositeScore,
        quadrant: it.quadrant,
        erosion: it.marginErosion,
      })),
    [items]
  );

  // 대분류별 바 차트 데이터
  const catBarData = useMemo(
    () =>
      categorySummary.slice(0, 15).map((c) => ({
        name: truncateLabel(c.category, 12),
        fullName: c.category,
        집중: c.focus,
        유지: c.maintain,
        최적화: c.optimize,
        단종검토: c.discontinue,
      })),
    [categorySummary]
  );

  // 정렬된 테이블
  const sortedFocus = useMemo(() => {
    const list = [...topFocus];
    list.sort((a, b) => sortDir === "desc" ? b[sortField] - a[sortField] : a[sortField] - b[sortField]);
    return list;
  }, [topFocus, sortField, sortDir]);

  const sortedDisc = useMemo(() => {
    const list = [...topDiscontinue];
    list.sort((a, b) => sortDir === "desc" ? b[sortField] - a[sortField] : a[sortField] - b[sortField]);
    return list;
  }, [topDiscontinue, sortField, sortDir]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  if (items.length === 0) return <EmptyState requiredFiles={["200.품목별수익성분석(회계)"]} />;

  const renderTable = (data: PortfolioItem[], title: string, desc: string) => (
    <ChartCard isEmpty={data.length === 0} title={title} description={desc}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">품목</th>
              <th className="p-2">대분류</th>
              <th className="p-2">조직</th>
              <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort("sales")}>
                매출 <ArrowUpDown className="inline h-3 w-3" />
              </th>
              <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort("operatingMargin")}>
                영업이익률 <ArrowUpDown className="inline h-3 w-3" />
              </th>
              <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort("compositeScore")}>
                복합점수 <ArrowUpDown className="inline h-3 w-3" />
              </th>
              <th className="p-2">전략</th>
            </tr>
          </thead>
          <tbody>
            {data.map((it, i) => (
              <tr key={i} className="border-b hover:bg-muted/50">
                <td className="p-2 font-medium" title={it.품목}>
                  <span>{truncateLabel(it.품목.replace(/^\[([^\]]+)\]\s*/, "$1 "), 22)}</span>
                  {it.marginErosion !== undefined && it.marginErosion < -5 && (
                    <span title={`마진 침식 ${safeFixed(it.marginErosion)}%p`}>
                      <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                    </span>
                  )}
                </td>
                <td className="p-2 text-muted-foreground">{truncateLabel(it.대분류, 8)}</td>
                <td className="p-2 text-muted-foreground">{truncateLabel(it.조직, 8)}</td>
                <td className="p-2 text-right">{formatCurrency(it.sales)}</td>
                <td className="p-2 text-right">
                  <span className={it.operatingMargin >= 0 ? "text-green-600" : "text-red-500"}>
                    {safeFixed(it.operatingMargin)}%
                  </span>
                </td>
                <td className="p-2 text-right font-semibold">{safeFixed(it.compositeScore)}</td>
                <td className="p-2"><ActionBadge action={it.action} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );

  return (
    <div className="space-y-6">
      {/* 마진 침식 경고 */}
      {summary.erosionWarningCount > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            <span className="font-medium">마진 침식 경고:</span> {summary.erosionWarningCount}개 품목에서 계획 대비 5%p 이상 마진 하락 감지.
            테이블에서 <AlertTriangle className="inline h-3 w-3" /> 표시 품목을 확인하세요.
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="집중 (FOCUS)"
          value={summary.focus}
          format="number"
          icon={<Target className="h-4 w-4" />}
          formula="복합점수 ≥ 70"
          benchmark={`전체 ${items.length}개 중 ${items.length > 0 ? safeFixed(summary.focus / items.length * 100, 0) : 0}% | 매출 ${formatCurrency(summary.focusCount)}`}
        />
        <KpiCard
          title="유지 (MAINTAIN)"
          value={summary.maintain}
          format="number"
          icon={<ArrowUpDown className="h-4 w-4" />}
          formula="50 ≤ 복합점수 < 70"
          benchmark={`전체의 ${items.length > 0 ? safeFixed(summary.maintain / items.length * 100, 0) : 0}%`}
        />
        <KpiCard
          title="최적화 (OPTIMIZE)"
          value={summary.optimize}
          format="number"
          icon={<TrendingDown className="h-4 w-4" />}
          formula="30 ≤ 복합점수 < 50, 매출 ≥ 중위"
          benchmark={`전체의 ${items.length > 0 ? safeFixed(summary.optimize / items.length * 100, 0) : 0}%`}
        />
        <KpiCard
          title="단종 검토"
          value={summary.discontinue}
          format="number"
          icon={<Scissors className="h-4 w-4" />}
          formula="복합점수 < 30 또는 (하위10% & 적자)"
          benchmark={`절감 예상: ${formatCurrency(summary.discontinueSavings)}`}
        />
      </div>

      {/* Strategy Scatter */}
      <ChartCard
        isEmpty={scatterData.length === 0}
        title="전략 매트릭스"
        description="X: 매출, Y: 영업이익률(%), 크기: 복합점수, 색상: 전략 분류"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
      >
        <ChartContainer minHeight={400}>
          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              type="number"
              dataKey="x"
              name="매출"
              tickFormatter={(v: any) => formatCurrency(v)}
              fontSize={11}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="영업이익률"
              unit="%"
              fontSize={11}
              domain={["auto", "auto"]}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white dark:bg-gray-800 p-3 rounded shadow-lg border text-xs space-y-1">
                    <p className="font-semibold">{d.fullName}</p>
                    <p>매출: {formatCurrency(d.x)}</p>
                    <p>영업이익률: {safeFixed(d.y)}%</p>
                    <p>복합점수: {safeFixed(d.score)}</p>
                    {d.quadrant && (
                      <p className="text-muted-foreground">4사분면: {QUADRANT_LABELS[d.quadrant] || d.quadrant}</p>
                    )}
                    {d.erosion !== undefined && d.erosion < -5 && (
                      <p className="text-amber-600">마진 침식: {safeFixed(d.erosion)}%p</p>
                    )}
                    <p className="font-medium" style={{ color: ACTION_COLORS[d.action] }}>
                      전략: {ACTION_LABELS[d.action]}
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
            <Scatter data={scatterData} {...ANIMATION_CONFIG}>
              {scatterData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={ACTION_COLORS[entry.action]}
                  fillOpacity={0.7}
                  r={Math.max(4, Math.min(entry.z / 5, 16))}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ChartContainer>
        <div className="flex gap-4 justify-center mt-2 text-xs">
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: ACTION_COLORS[key] }}
              />
              {label}
            </div>
          ))}
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderTable(sortedFocus, "집중 추천 TOP 10", "복합점수 상위 — 마케팅/생산 확대 추천")}
        {renderTable(sortedDisc, "단종 후보 TOP 10", "복합점수 하위 — 단종 또는 대체품 검토")}
      </div>

      {/* Category Bar Chart */}
      <ChartCard
        isEmpty={catBarData.length === 0}
        title="대분류별 포트폴리오 분포"
        description="대분류별 FOCUS/MAINTAIN/OPTIMIZE/DISCONTINUE 비율"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
      >
        <ChartContainer minHeight={350}>
          <BarChart data={catBarData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" width={75} fontSize={11} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any, name: any) => [`${v}개`, name]}
              labelFormatter={(label: any) => {
                const item = catBarData.find((d) => d.name === label);
                return item?.fullName || label;
              }}
            />
            <Bar dataKey="집중" stackId="a" fill={ACTION_COLORS.FOCUS} {...ANIMATION_CONFIG} />
            <Bar dataKey="유지" stackId="a" fill={ACTION_COLORS.MAINTAIN} {...ANIMATION_CONFIG} />
            <Bar dataKey="최적화" stackId="a" fill={ACTION_COLORS.OPTIMIZE} {...ANIMATION_CONFIG} />
            <Bar dataKey="단종검토" stackId="a" fill={ACTION_COLORS.DISCONTINUE} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* Scoring explanation */}
      <div className="rounded-md bg-muted/50 p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">복합 점수 산출 기준</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div>매출 규모 <span className="font-medium text-foreground">30%</span></div>
          <div>수익성 (영업이익률) <span className="font-medium text-foreground">25%</span></div>
          <div>성장성 (최근 3개월 vs 이전) <span className="font-medium text-foreground">20%</span></div>
          <div>원가 효율 <span className="font-medium text-foreground">15%</span></div>
          <div>계획 달성률 <span className="font-medium text-foreground">10%</span></div>
        </div>
        <p>각 축은 전체 품목 내 백분위(0~100, midrank)로 정규화. 4사분면(calcProfitMatrix) 및 마진 침식(calcMarginErosion) 참조.</p>
        <p>DISCONTINUE: 복합 &lt; 30 또는 (매출 하위10% &amp; 적자). OPTIMIZE: 30~50 &amp; 매출 ≥ 중위.</p>
      </div>
    </div>
  );
}
