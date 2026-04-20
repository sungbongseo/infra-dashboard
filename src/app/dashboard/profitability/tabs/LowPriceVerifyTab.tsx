"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import { ExportButton } from "@/components/dashboard/ExportButton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
  ComposedChart, Line, Legend,
  AreaChart, Area,
} from "recharts";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { AlertTriangle, CheckCircle2, XCircle, TrendingDown, Info, Shield, BarChart3 } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed, safeDivide } from "@/lib/utils";
import {
  calcContributionRedFlags,
  calcVolumeUnitCostRegression,
  calcCapacityUtilization,
  calcCannibalizationRisk,
  calcOverallVerdict,
  type TrafficLight,
  type RegressionResult,
} from "@/lib/analysis/lowPriceVerification";
import type { CVPItem, CVPSummary } from "@/lib/analysis/offsetEffect";
import type {
  CustomerItemDetailRecord,
  ItemProfitabilityRecord,
  ManufacturingCostRecord,
} from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

interface LowPriceVerifyTabProps {
  cvpItems: CVPItem[];
  cvpSummary: CVPSummary;
  totalFixedCost: number;
  filteredCustItemDetail: CustomerItemDetailRecord[];
  filteredItemProfitability: ItemProfitabilityRecord[];
  rawItemProfitability: ItemProfitabilityRecord[];
  manufacturingCost: ManufacturingCostRecord[];
  isDateFiltered?: boolean;
  onNavigate?: (tab: string) => void;
}

const TRAFFIC_COLORS: Record<TrafficLight, string> = {
  green: "hsl(142, 71%, 45%)",
  yellow: "hsl(45, 93%, 47%)",
  red: "hsl(0, 84%, 60%)",
};

const TRAFFIC_BG: Record<TrafficLight, string> = {
  green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

/** 미니 스파크라인 (테이블 셀용) */
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const chartData = data.map((v, i) => ({ i, v: isFinite(v) ? v : 0 }));
  return (
    <AreaChart width={60} height={20} data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
      <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
    </AreaChart>
  );
}

export function LowPriceVerifyTab({
  cvpItems,
  cvpSummary,
  totalFixedCost: _totalFixedCost,
  filteredCustItemDetail,
  filteredItemProfitability: _filteredItemProfitability,
  rawItemProfitability,
  manufacturingCost,
  isDateFiltered: _isDateFiltered,
  onNavigate,
}: LowPriceVerifyTabProps) {
  const [selectedRegressionItem, setSelectedRegressionItem] = useState<string | null>(null);
  const [excludeRawMaterial, setExcludeRawMaterial] = useState(false);
  const [showAllRedFlags, setShowAllRedFlags] = useState(false);

  // ─── F1: Red-Flag 분석 ───
  const redFlagSummary = useMemo(
    () => calcContributionRedFlags(cvpItems, rawItemProfitability),
    [cvpItems, rawItemProfitability]
  );

  // ─── F3: 회귀분석 ───
  const regressionSummary = useMemo(
    () => calcVolumeUnitCostRegression(rawItemProfitability, {
      excludeRawMaterial,
      minDataPoints: 3,
      minQuantity: 10,
    }),
    [rawItemProfitability, excludeRawMaterial]
  );

  const selectedRegression: RegressionResult | undefined = useMemo(
    () => selectedRegressionItem
      ? regressionSummary.items.find(i => i.item === selectedRegressionItem)
      : regressionSummary.items[0],
    [selectedRegressionItem, regressionSummary]
  );

  // ─── F5: Capacity ───
  const capacitySummary = useMemo(
    () => calcCapacityUtilization(manufacturingCost, rawItemProfitability),
    [manufacturingCost, rawItemProfitability]
  );

  // ─── F6: Cannibalization ───
  const cannibSummary = useMemo(
    () => calcCannibalizationRisk(filteredCustItemDetail, 3),
    [filteredCustItemDetail]
  );

  // ─── 종합 판정 ───
  const overallVerdict = useMemo(
    () => calcOverallVerdict(redFlagSummary, regressionSummary, capacitySummary, cannibSummary),
    [redFlagSummary, regressionSummary, capacitySummary, cannibSummary]
  );

  // 데이터 없음 플래그 (early return 대신 조건부 렌더링 — Hook 순서 보장)
  const hasData = cvpItems.length > 0 || rawItemProfitability.length > 0;

  // Red-Flag 테이블 컬럼
  const redFlagColumns: ColumnDef<(typeof redFlagSummary.items)[0], any>[] = [
    {
      accessorKey: "trafficLight",
      header: "판정",
      cell: ({ getValue }) => {
        const v = getValue() as TrafficLight;
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${TRAFFIC_BG[v]}`}>
            {v === "red" ? "적자" : v === "yellow" ? "경계" : "양호"}
          </span>
        );
      },
      size: 60,
    },
    { accessorKey: "itemName", header: "품목", cell: ({ getValue }) => <span className="text-xs font-medium">{truncateLabel(String(getValue()), 20)}</span>, size: 160 },
    {
      accessorKey: "contributionMarginRatio",
      header: "CM%",
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className={`text-xs font-mono ${v < 0 ? "text-red-600" : v < 10 ? "text-yellow-600" : "text-green-600"}`}>{safeFixed(v, 1)}%</span>;
      },
      size: 70,
    },
    {
      accessorKey: "revenue",
      header: "매출",
      cell: ({ getValue }) => <span className="text-xs">{formatCurrency(getValue() as number)}</span>,
      size: 90,
    },
    {
      accessorKey: "monthlyTrend",
      header: "추이",
      cell: ({ row }) => {
        const trend = row.original.monthlyTrend;
        const color = row.original.trendDirection === "deteriorating" ? "#ef4444" : row.original.trendDirection === "improving" ? "#22c55e" : "#6b7280";
        return <MiniSparkline data={trend.map(t => t.cmRatio)} color={color} />;
      },
      size: 70,
    },
    {
      accessorKey: "trendDirection",
      header: "추세",
      cell: ({ getValue }) => {
        const v = getValue() as string;
        return (
          <span className={`text-[10px] ${v === "deteriorating" ? "text-red-500" : v === "improving" ? "text-green-500" : "text-gray-500"}`}>
            {v === "deteriorating" ? "악화" : v === "improving" ? "개선" : "안정"}
          </span>
        );
      },
      size: 50,
    },
    {
      accessorKey: "consecutiveRedMonths",
      header: "연속적자(월)",
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return v > 0 ? <span className="text-xs text-red-600 font-bold">{v}개월</span> : <span className="text-xs text-gray-400">—</span>;
      },
      size: 80,
    },
  ];

  // 회귀 산점도 데이터
  const scatterData = useMemo(
    () => selectedRegression?.dataPoints.map(d => ({ x: d.quantity, y: d.unitCost, month: d.month })) || [],
    [selectedRegression]
  );

  // 회귀선 생성 (20 포인트)
  const regressionLineData = useMemo(() => {
    if (!selectedRegression || scatterData.length === 0) return [];
    const minQ = Math.min(...scatterData.map(d => d.x));
    const maxQ = Math.max(...scatterData.map(d => d.x));
    const points: Array<{ x: number; linear: number; hyperbolic: number }> = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const q = minQ + (maxQ - minQ) * (i / steps);
      if (q <= 0) continue;
      points.push({
        x: q,
        linear: selectedRegression.linear.intercept + selectedRegression.linear.slope * q,
        hyperbolic: selectedRegression.hyperbolic.a + selectedRegression.hyperbolic.b / q,
      });
    }
    return points;
  }, [selectedRegression, scatterData]);

  // Capacity 차트 데이터
  const capacityChartData = useMemo(
    () => capacitySummary.items.slice(0, 15).map(item => ({
      name: truncateLabel(item.itemName, 15),
      utilization: Math.min(item.utilizationPct, 150),
      capacity: item.estimatedMonthlyCapacity,
      demand: item.currentDemand,
      alertLevel: item.alertLevel,
      confidence: item.confidence,
    })),
    [capacitySummary]
  );

  // Cannibalization 차트 데이터
  const cannibChartData = useMemo(
    () => cannibSummary.items.slice(0, 12).map(item => ({
      name: truncateLabel(item.itemName, 15),
      min: item.minPrice,
      p25: item.p25Price,
      median: item.medianPrice,
      p75: item.p75Price,
      max: item.maxPrice,
      cv: item.priceDispersionCV,
      alertLevel: item.alertLevel,
    })),
    [cannibSummary]
  );

  const verdictIcon = overallVerdict.overall === "valid" ? <CheckCircle2 className="h-6 w-6 text-green-600" />
    : overallVerdict.overall === "invalid" ? <XCircle className="h-6 w-6 text-red-600" />
    : <AlertTriangle className="h-6 w-6 text-yellow-600" />;

  const verdictBg = overallVerdict.overall === "valid" ? "bg-green-50 border-green-500 dark:bg-green-950/30"
    : overallVerdict.overall === "invalid" ? "bg-red-50 border-red-500 dark:bg-red-950/30"
    : "bg-yellow-50 border-yellow-500 dark:bg-yellow-950/30";

  if (!hasData) {
    return <EmptyState message="100 또는 200 보고서를 업로드하면 저가수주 가설 검증 분석이 활성화됩니다." />;
  }

  return (
    <div className="space-y-6">
      {/* ═══ CEO 배너: 종합 판정 ═══ */}
      <div className={`p-4 rounded-lg border-l-4 ${verdictBg}`}>
        <div className="flex items-center gap-3 mb-2">
          {verdictIcon}
          <div>
            <h2 className="text-lg font-bold">{overallVerdict.overallLabel}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{overallVerdict.ceoSummary}</p>
          </div>
        </div>
        {/* 4개 분석 스코어 미니 배지 */}
        <div className="flex flex-wrap gap-2 mt-3">
          {(["f1", "f3", "f5", "f6"] as const).map(key => {
            const d = overallVerdict.details[key];
            const labels = { f1: "Red-Flag", f3: "회귀분석", f5: "Capacity", f6: "Cannibalization" };
            return (
              <span key={key} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${TRAFFIC_BG[d.verdict]}`}>
                {labels[key]}: {d.verdict === "red" ? "기각" : d.verdict === "yellow" ? "주의" : "통과"}
              </span>
            );
          })}
        </div>
      </div>

      {/* 앵커 내비게이션 */}
      <div className="flex flex-wrap gap-1.5 sticky top-0 z-30 bg-background/95 backdrop-blur-sm py-2 border-b mb-2">
        {[
          { id: "lpv-redflag", label: "F1 Red-Flag" },
          { id: "lpv-regression", label: "F3 회귀분석" },
          { id: "lpv-capacity", label: "F5 Capacity" },
          { id: "lpv-cannib", label: "F6 가격잠식" },
          { id: "lpv-verdict", label: "종합 판정" },
        ].map(s => (
          <a key={s.id} href={`#${s.id}`} className="px-2.5 py-1 rounded text-[11px] border hover:bg-muted transition-colors">{s.label}</a>
        ))}
        {onNavigate && (
          <button onClick={() => onNavigate("offset")} className="ml-auto px-2.5 py-1 rounded text-[11px] border border-blue-300 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 transition-colors">
            CVP 시뮬레이터로 이동 →
          </button>
        )}
      </div>

      {/* 고정비 가정 고지 */}
      <div className="flex items-start gap-2 p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-800 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <strong>고정비 배부 가정:</strong> 이 대시보드의 고정비(제조고정노무비+감가상각비+기타경비)는 ERP에서 이미 품목별로 배부된 값을 사용합니다.
          공헌이익은 SGA 변동비(직접판매운반비)를 포함하므로 501 보고서의 공헌이익과 차이가 있을 수 있습니다.
        </div>
      </div>

      {/* ═══ F1: Red-Flag 스크리너 ═══ */}
      <div id="lpv-redflag" className="space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />공헌이익 Red-Flag 스크리너</h3>

        {/* 판정 배너 */}
        {redFlagSummary.red > 0 && (
          <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950 border-l-4 border-red-500 text-sm rounded">
            <strong>판정:</strong> {redFlagSummary.red}개 품목이 공헌이익 음수 — 가동률과 무관하게 팔수록 손실 확대.
            위험 매출 {formatCurrency(redFlagSummary.totalRevenueAtRisk)}.
          </div>
        )}

        {/* KPI 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard title="전체 품목" value={redFlagSummary.totalItems} format="number" />
          <KpiCard title="양호 (CM≥10%)" value={redFlagSummary.green} format="number" description="고정비 회수 기여" />
          <KpiCard title="경계 (0~10%)" value={redFlagSummary.yellow} format="number" description="Marginal 영역" />
          <KpiCard title="적자 (CM<0%)" value={redFlagSummary.red} format="number" description="팔수록 손해" />
          <KpiCard title="위험 매출" value={redFlagSummary.totalRevenueAtRisk} format="currency" description="Red 품목 매출 합계" />
        </div>

        {/* 테이블 */}
        <ChartCard title="품목별 공헌이익 트래픽라이트" description="CM% 기준: 🟢≥10% / 🟡0~10% / 🔴<0%">
          <DataTable
            data={showAllRedFlags ? redFlagSummary.items : redFlagSummary.items.slice(0, 20)}
            columns={redFlagColumns}
            searchPlaceholder="품목명 검색..."
          />
          {redFlagSummary.items.length > 20 && (
            <button onClick={() => setShowAllRedFlags(!showAllRedFlags)} className="mt-2 text-xs text-blue-600 hover:underline">
              {showAllRedFlags ? "접기" : `전체 ${redFlagSummary.items.length}개 보기`}
            </button>
          )}
        </ChartCard>
      </div>

      {/* ═══ F3: 회귀분석 ═══ */}
      <div id="lpv-regression" className="space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-500" />가동률-단위원가 회귀분석</h3>

        {/* 판정 배너 */}
        <div className={`px-3 py-1.5 border-l-4 text-sm rounded ${regressionSummary.supportCount > regressionSummary.rejectCount ? "bg-green-50 dark:bg-green-950 border-green-500" : "bg-red-50 dark:bg-red-950 border-red-500"}`}>
          <strong>판정:</strong> {regressionSummary.totalItems}개 품목 중 {regressionSummary.supportCount}개 지지, {regressionSummary.rejectCount}개 기각.
          평균 R²={safeFixed(regressionSummary.avgBestRSquared * 100, 1)}%.
          {regressionSummary.supportCount <= regressionSummary.rejectCount && " 수량-원가 관계가 대부분 품목에서 약함 → 사업부 주장 근거 부족."}
        </div>

        {/* 컨트롤 */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="text-xs border rounded px-2 py-1.5 bg-background"
            value={selectedRegressionItem || ""}
            onChange={e => setSelectedRegressionItem(e.target.value || null)}
          >
            {regressionSummary.items.map(item => (
              <option key={item.item} value={item.item}>
                {item.itemName} (R²={safeFixed(item.bestRSquared * 100, 0)}%, {item.hypothesisSupport === "support" ? "지지" : item.hypothesisSupport === "partial" ? "부분" : "기각"})
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={excludeRawMaterial} onChange={e => setExcludeRawMaterial(e.target.checked)} className="rounded" />
            원재료비 제외 (가격 효과 분리)
          </label>
        </div>

        {/* 산점도 + 회귀선 */}
        {selectedRegression && (
          <ChartCard
            title={`${selectedRegression.itemName} — 수량 vs 단위원가`}
            description={`${selectedRegression.bestModel === "hyperbolic" ? "쌍곡선" : "선형"} 모델 R²=${safeFixed(selectedRegression.bestRSquared * 100, 1)}%`}
            formula={selectedRegression.interpretation}
          >
            <div className={`px-3 py-1.5 border-l-4 text-xs rounded mb-3 ${selectedRegression.hypothesisSupport === "support" ? "bg-green-50 border-green-500 dark:bg-green-950" : selectedRegression.hypothesisSupport === "reject" ? "bg-red-50 border-red-500 dark:bg-red-950" : "bg-yellow-50 border-yellow-500 dark:bg-yellow-950"}`}>
              {selectedRegression.interpretation}
            </div>
            <ChartContainer height="300px">
              <ComposedChart data={regressionLineData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="x" type="number" tick={{ fontSize: 10 }} label={{ value: "수량", position: "insideBottom", offset: -5, fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: "단위원가", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <RechartsTooltip {...TOOLTIP_STYLE} />
                <Line dataKey="hyperbolic" name="쌍곡선" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
                <Line dataKey="linear" name="선형" stroke={CHART_COLORS[2]} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
                <Scatter data={scatterData} fill={CHART_COLORS[1]} name="실측">
                  {scatterData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[1]} />
                  ))}
                </Scatter>
                <Legend wrapperStyle={{ fontSize: 10 }} />
              </ComposedChart>
            </ChartContainer>
            <div className="grid grid-cols-2 gap-3 mt-3 text-xs">
              <div className="p-2 border rounded">
                <div className="font-semibold">쌍곡선 모델</div>
                <div>R² = {safeFixed(selectedRegression.hyperbolic.rSquared * 100, 1)}%</div>
                <div>a = {safeFixed(selectedRegression.hyperbolic.a, 1)} (한계비용)</div>
                <div>b = {safeFixed(selectedRegression.hyperbolic.b, 0)} (고정비 프록시)</div>
              </div>
              <div className="p-2 border rounded">
                <div className="font-semibold">선형 모델</div>
                <div>R² = {safeFixed(selectedRegression.linear.rSquared * 100, 1)}%</div>
                <div>기울기 = {safeFixed(selectedRegression.linear.slope, 4)}</div>
                <div>절편 = {safeFixed(selectedRegression.linear.intercept, 1)}</div>
              </div>
            </div>
          </ChartCard>
        )}
      </div>

      {/* ═══ F5: Capacity 제약 ═══ */}
      <div id="lpv-capacity" className="space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2"><Shield className="h-5 w-5 text-orange-500" />Capacity 제약 경고</h3>

        {capacitySummary.criticalCount > 0 && (
          <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950 border-l-4 border-red-500 text-sm rounded">
            <strong>판정:</strong> {capacitySummary.criticalCount}건 Capacity 초과 위험.
            물량 증가 시 설비 증설·2교대 등 고정비 Step-up이 발생하며 가설 전제가 무너집니다.
          </div>
        )}

        <div className="flex items-start gap-2 p-2 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-[10px] text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>추정치: 실제 생산능력 데이터 미확보. 제조원가 Q1 생산입고수량 및 판매 실적 기반 추정. 판매량 ≠ 생산량 (재고 버퍼 존재).</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard title="평균 가동률" value={capacitySummary.avgUtilization} format="percent" />
          <KpiCard title="초과 위험" value={capacitySummary.criticalCount} format="number" description="가동률 >90%" />
          <KpiCard title="주의" value={capacitySummary.cautionCount} format="number" description="가동률 70~90%" />
          <KpiCard title="안전" value={capacitySummary.safeCount} format="number" description="가동률 <70%" />
        </div>

        {capacityChartData.length > 0 && (
          <ChartCard title="품목별 가동률" description="추정 Capacity 대비 현재 수요 비율">
            <ChartContainer height={`${Math.max(200, capacityChartData.length * 28)}px`}>
              <BarChart data={capacityChartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" domain={[0, 120]} tick={{ fontSize: 10 }} unit="%" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${safeFixed(v, 1)}%`} />
                <Bar dataKey="utilization" name="가동률" {...ANIMATION_CONFIG}>
                  {capacityChartData.map((d, i) => (
                    <Cell key={i} fill={d.alertLevel === "critical" ? "#ef4444" : d.alertLevel === "caution" ? "#f59e0b" : "#22c55e"} />
                  ))}
                </Bar>
                <ReferenceLine x={70} stroke="#f59e0b" strokeDasharray="3 3" />
                <ReferenceLine x={90} stroke="#ef4444" strokeDasharray="3 3" />
              </BarChart>
            </ChartContainer>
          </ChartCard>
        )}
      </div>

      {/* ═══ F6: Cannibalization ═══ */}
      <div id="lpv-cannib" className="space-y-4">
        <h3 className="text-base font-bold flex items-center gap-2"><TrendingDown className="h-5 w-5 text-purple-500" />거래처별 가격 잠식 모니터</h3>

        {cannibSummary.alertCount > 0 && (
          <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950 border-l-4 border-red-500 text-sm rounded">
            <strong>판정:</strong> {cannibSummary.alertCount}개 품목 가격 체계 불안정 (수량 가중 CV &gt; 30%).
            저가 수주 정보 유출 시 최악 연간 {formatCurrency(cannibSummary.totalWorstCaseLoss)} 매출 감소 위험.
          </div>
        )}

        {cannibChartData.length > 0 && (
          <ChartCard title="품목별 거래처 단가 분포" description="P25~P75 박스 + 중위값 라인. CV>30% = 위험">
            <ChartContainer height={`${Math.max(200, cannibChartData.length * 30)}px`}>
              <BarChart data={cannibChartData} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => formatCurrency(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
                <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => formatCurrency(v)} />
                <Bar dataKey="p25" name="P25" stackId="box" fill="transparent" />
                <Bar dataKey="median" name="P25~중위" stackId="box" fill="#93c5fd" fillOpacity={0.5} />
                <Bar dataKey="p75" name="중위~P75" stackId="box2" fill="#60a5fa" fillOpacity={0.5} />
              </BarChart>
            </ChartContainer>
          </ChartCard>
        )}

        {/* 위험 품목 요약 테이블 */}
        {cannibSummary.items.filter(i => i.alertLevel !== "none").length > 0 && (
          <ChartCard title="가격 잠식 위험 품목">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2">품목</th>
                    <th className="p-2">거래처 수</th>
                    <th className="p-2">CV</th>
                    <th className="p-2">최저가</th>
                    <th className="p-2">중위가</th>
                    <th className="p-2">최고가</th>
                    <th className="p-2">최악 손실</th>
                  </tr>
                </thead>
                <tbody>
                  {cannibSummary.items.filter(i => i.alertLevel !== "none").slice(0, 10).map(item => (
                    <tr key={item.item} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{truncateLabel(item.itemName, 18)}</td>
                      <td className="p-2">{item.customerCount}</td>
                      <td className="p-2">
                        <span className={item.alertLevel === "alert" ? "text-red-600 font-bold" : "text-yellow-600"}>
                          {safeFixed(item.priceDispersionCV, 1)}%
                        </span>
                      </td>
                      <td className="p-2">{formatCurrency(item.minPrice)}</td>
                      <td className="p-2">{formatCurrency(item.medianPrice)}</td>
                      <td className="p-2">{formatCurrency(item.maxPrice)}</td>
                      <td className="p-2 text-red-600">{formatCurrency(item.worstCaseAnnualLoss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </div>

      {/* ═══ 종합 판정 스코어카드 ═══ */}
      <div id="lpv-verdict" className="space-y-4">
        <h3 className="text-base font-bold">종합 가설 검증 스코어카드</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["f1", "f3", "f5", "f6"] as const).map(key => {
            const d = overallVerdict.details[key];
            const titles = { f1: "공헌이익 Red-Flag", f3: "수량-원가 회귀", f5: "Capacity 제약", f6: "가격 잠식" };
            const icons = {
              f1: <AlertTriangle className="h-4 w-4" />,
              f3: <BarChart3 className="h-4 w-4" />,
              f5: <Shield className="h-4 w-4" />,
              f6: <TrendingDown className="h-4 w-4" />,
            };
            return (
              <div key={key} className={`p-3 rounded-lg border ${d.verdict === "red" ? "border-red-300 bg-red-50 dark:bg-red-950/20" : d.verdict === "yellow" ? "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20" : "border-green-300 bg-green-50 dark:bg-green-950/20"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {icons[key]}
                  <span className="text-xs font-bold">{titles[key]}</span>
                </div>
                <div className={`text-sm font-bold ${d.verdict === "red" ? "text-red-700 dark:text-red-400" : d.verdict === "yellow" ? "text-yellow-700 dark:text-yellow-400" : "text-green-700 dark:text-green-400"}`}>
                  {d.verdict === "red" ? "기각" : d.verdict === "yellow" ? "주의" : "통과"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">{d.label}</div>
              </div>
            );
          })}
        </div>

        <div className={`p-4 rounded-lg border-2 ${verdictBg}`}>
          <div className="flex items-center gap-2 mb-2">
            {verdictIcon}
            <span className="text-lg font-bold">{overallVerdict.overallLabel}</span>
          </div>
          <p className="text-sm">{overallVerdict.ceoSummary}</p>
        </div>

        <div className="flex justify-end">
          <ExportButton
            data={[
              { 구분: "종합 판정", 결과: overallVerdict.overallLabel },
              { 구분: "CEO 요약", 결과: overallVerdict.ceoSummary },
              { 구분: "F1 Red-Flag", 결과: overallVerdict.details.f1.label },
              { 구분: "F3 회귀분석", 결과: overallVerdict.details.f3.label },
              { 구분: "F5 Capacity", 결과: overallVerdict.details.f5.label },
              { 구분: "F6 가격잠식", 결과: overallVerdict.details.f6.label },
            ]}
            fileName="저가수주_가설검증_결과"
          />
        </div>
      </div>
    </div>
  );
}
