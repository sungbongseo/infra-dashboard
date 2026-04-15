"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, ReferenceLine,
  LineChart, Line, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { AlertTriangle, TrendingUp, DollarSign, Package, Info } from "lucide-react";
import { formatCurrency, TOOLTIP_STYLE, safeFixed } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import {
  calcThreeWayComparison,
  calcFactoryVariance,
  calcCostDriverBreakdown,
} from "@/lib/analysis/costTrueVariance";
import {
  calcFactoryEfficiencyMatrix,
  calcStandardCostAccuracyKPI,
  detectInefficiencies,
  calcFactoryStandardCostCoverage,
} from "@/lib/analysis/costEfficiency";
import type {
  CustomerItemDetailRecord,
  ItemProfitabilityRecord,
  StandardCostBookRecord,
  ManufacturingCostRecord,
} from "@/types";

interface CostTrueVarianceTabProps {
  filteredCustItemDetail: CustomerItemDetailRecord[];
  filteredItemProfitability: ItemProfitabilityRecord[];
  standardCostBook: StandardCostBookRecord[];
  manufacturingCost: ManufacturingCostRecord[];
  isDateFiltered?: boolean;
}

export function CostTrueVarianceTab({
  filteredCustItemDetail,
  filteredItemProfitability,
  standardCostBook,
  manufacturingCost,
  isDateFiltered,
}: CostTrueVarianceTabProps) {
  const [factoryFilter, setFactoryFilter] = useState<string>("all");
  const [thresholdFilter, setThresholdFilter] = useState<number>(0);
  const [showUnmatched, setShowUnmatched] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 3-Way 비교 (기본 Q1)
  const analysis = useMemo(
    () => calcThreeWayComparison({
      customerItemDetail: filteredCustItemDetail,
      itemProfitability: filteredItemProfitability,
      standardCostBook,
      manufacturingCost,
      periodStart: "202601",
      periodEnd: "202603",
    }),
    [filteredCustItemDetail, filteredItemProfitability, standardCostBook, manufacturingCost]
  );

  const factoryVariance = useMemo(() => calcFactoryVariance(analysis.rows), [analysis.rows]);
  const costDrivers = useMemo(() => calcCostDriverBreakdown(manufacturingCost, 10), [manufacturingCost]);

  const efficiencyMatrix = useMemo(
    () => calcFactoryEfficiencyMatrix(manufacturingCost, standardCostBook),
    [manufacturingCost, standardCostBook]
  );
  const accuracyKPI = useMemo(
    () => calcStandardCostAccuracyKPI(analysis.rows),
    [analysis.rows]
  );
  const inefficiencyAlerts = useMemo(
    () => detectInefficiencies(efficiencyMatrix, analysis.rows, {
      factorySpreadThreshold: 10,
      overstandardThreshold: 20,
    }),
    [efficiencyMatrix, analysis.rows]
  );
  const multiFactoryItems = useMemo(
    () => efficiencyMatrix.filter((e) => e.multiFactoryProduced),
    [efficiencyMatrix]
  );
  const factoryCoverage = useMemo(
    () => calcFactoryStandardCostCoverage(manufacturingCost, standardCostBook),
    [manufacturingCost, standardCostBook]
  );

  const filteredRows = useMemo(() => {
    let rows = analysis.rows;
    if (factoryFilter !== "all") rows = rows.filter((r) => r.factory === factoryFilter);
    if (thresholdFilter > 0) {
      rows = rows.filter((r) =>
        r.stdVsActualVariancePct !== null && Math.abs(r.stdVsActualVariancePct) >= thresholdFilter
      );
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        r.itemName.toLowerCase().includes(q) ||
        r.itemCode.toLowerCase().includes(q) ||
        r.factory.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [analysis.rows, factoryFilter, thresholdFilter, searchQuery]);

  // 검색어가 있으면 매출액 내림차순으로 더 많이 표시 (Top 100), 평소엔 영향액 Top 20
  const topImpactRows = useMemo(() => {
    if (searchQuery.trim()) {
      return [...filteredRows].sort((a, b) => b.salesAmount - a.salesAmount).slice(0, 100);
    }
    return [...filteredRows].sort((a, b) => Math.abs(b.salesImpact) - Math.abs(a.salesImpact)).slice(0, 20);
  }, [filteredRows, searchQuery]);

  // 미매칭 품목 리스트
  const unmatchedRows = useMemo(
    () => analysis.rows.filter((r) => r.note && r.note !== ""),
    [analysis.rows]
  );

  // 사용 가능한 공장 목록
  const availableFactories = useMemo(
    () => Array.from(new Set(analysis.rows.map((r) => r.factory))),
    [analysis.rows]
  );

  // 월별 추세 (Top 5 품목만)
  const trendChartData = useMemo(() => {
    const topItemCodes = new Set(topImpactRows.slice(0, 5).map((r) => r.itemCode));
    const byMonth = new Map<string, Record<string, any>>();
    for (const t of analysis.trend) {
      if (!topItemCodes.has(t.itemCode)) continue;
      const entry = byMonth.get(t.month) || { month: t.month };
      entry[t.itemCode] = t.avgSalesPrice;
      byMonth.set(t.month, entry);
    }
    return Array.from(byMonth.values()).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [analysis.trend, topImpactRows]);

  // Guard: 데이터 부족
  if (filteredCustItemDetail.length === 0) {
    return <EmptyState requiredFiles={["100.거래처별품목별손익", "공장 표준원가", "품목별 제조원가"]} />;
  }

  const hasStdData = standardCostBook.length > 0;
  const hasMfgData = manufacturingCost.length > 0;

  return (
    <div className="space-y-6">
      {/* 기간 필터 경고 */}
      {isDateFiltered && (
        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong>기간 필터 적용 중</strong> — 이 탭은 2026-Q1(1~3월) 기준 3-Way 비교를 위해 설계되었습니다. 다른 기간 필터링 시 제조원가와의 매칭 정확도가 떨어질 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 개요 배너 */}
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-2 flex-1">
            <p className="font-semibold text-base">🎯 3-Way 원가 비교 — 판매단가 vs 표준원가 vs 실제 제조원가</p>
            <p className="text-sm leading-relaxed">
              2026-Q1(1~3월) 기간 사업부가 판매한 품목별로 3가지 단가를 비교합니다:
              <strong> ① 판매단가</strong>(100 보고서 평균) <strong>② 표준원가</strong>(공장 표준원가 book)
              <strong> ③ 실제 제조원가</strong>(BOM 집계, 제조원가÷생산수량).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground mt-2">
              <div className="bg-background/60 rounded p-2.5">
                <strong className="text-foreground">📊 판매-표준 마진</strong>: 영업이 계획한 목표 수익률
              </div>
              <div className="bg-background/60 rounded p-2.5">
                <strong className="text-foreground">💰 판매-실제 마진</strong>: 실제로 실현된 수익률
              </div>
              <div className="bg-background/60 rounded p-2.5">
                <strong className="text-foreground">⚙️ 표준-실제 변동률</strong>: 제조 원가 관리 효율
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 시점 가이드 */}
      <div className="rounded-md border border-slate-300 bg-slate-50/80 dark:bg-slate-900/40 p-4 text-sm text-slate-800 dark:text-slate-200">
        <div className="flex flex-col md:flex-row md:items-start gap-3">
          <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">📅 데이터 시점 가이드</span>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]">
            <div><strong>표준원가</strong>: 2026-03-31 스냅샷 (단일 시점)</div>
            <div><strong>제조원가</strong>: 2026 Q1 누적 (1~3월 통합, 월별 분리 불가)</div>
            <div><strong>매출</strong>: 2026-Q1 월별 합계 (1~3월)</div>
          </div>
        </div>
        <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-400 text-[13px]">
          표준원가 개정이 있었다면 1~2월 매출과 3월 말 표준원가 비교에 ±% 오차가 존재할 수 있습니다.
          제조원가는 BOM 전개 후 집계되어 공장별 평균 단가를 산출하므로 월별 변동은 반영되지 않습니다.
        </p>
      </div>

      {/* 데이터 부족 경고 */}
      {(!hasStdData || !hasMfgData) && (
        <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3 text-sm text-amber-900 dark:text-amber-200 dark:bg-amber-950/20 space-y-1">
          {!hasStdData && <p>⚠️ 표준원가 book 미업로드 — 업로드하면 3-Way 비교가 활성화됩니다. (예: &quot;양산공장 표준원가 3월31일 기준.xlsx&quot;)</p>}
          {!hasMfgData && <p>⚠️ 제조원가 파일 미업로드 — 업로드하면 실제 단가 비교가 활성화됩니다. (예: &quot;품목별 제조원가(1~3).xlsx&quot;)</p>}
        </div>
      )}

      {/* 섹션 1: 커버리지 & KPI (6종 분류) */}
      <div id="three-way-kpi">
        <h2 className="text-lg font-semibold mb-3">Step 1. 커버리지 & 핵심 지표</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            title="총 판매 품목" value={analysis.coverage.totalSalesItems} format="number"
            icon={<Package className="h-5 w-5" />}
            description="Q1 매출 발생 품목"
            formula="unique(품목명 + 공장)"
          />
          <KpiCard
            title="3-Way 매칭" value={analysis.coverage.threeWayMatched} format="number"
            icon={<TrendingUp className="h-5 w-5" />}
            description={`BOM 기반 제조품 (${safeFixed(analysis.coverage.threeWayMatched / Math.max(analysis.coverage.totalSalesItems, 1) * 100, 1)}%)`}
            benchmark="자체 제조 품목"
          />
          <KpiCard
            title="상품 (매입가)" value={analysis.coverage.purchaseItems} format="number"
            icon={<DollarSign className="h-5 w-5" />}
            description="표준원가 = 매입가 적용 (정상)"
            benchmark="실제원가 산출 완료"
          />
          <KpiCard
            title="⚠️ 제품 미생산" value={analysis.coverage.productNotProduced} format="number"
            icon={<AlertTriangle className="h-5 w-5" />}
            description="Q1 BOM 없음 — 원가팀 확인 필요"
            benchmark="재고 판매 or 데이터 누락"
          />
          <KpiCard
            title="표준 미등록" value={analysis.coverage.standardMissing} format="number"
            icon={<AlertTriangle className="h-5 w-5" />}
            description="표준원가 book에 없음"
          />
          <KpiCard
            title="매핑 실패" value={analysis.coverage.mappingFailed} format="number"
            icon={<AlertTriangle className="h-5 w-5" />}
            description="품목명→코드 매핑 실패"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          💡 <strong>실제원가 산출 가능 = 3-Way 매칭 + 상품(매입가)</strong> 합산.
          &quot;제품 미생산&quot;과 &quot;매핑 실패&quot;가 실제 액션이 필요한 누락입니다.
        </p>
      </div>

      {/* 공장별 표준원가 커버리지 — 누락 공장 명시 */}
      {factoryCoverage.length > 0 && (
        <div id="three-way-coverage" className="space-y-2">
          <h3 className="text-base font-semibold">공장별 표준원가 커버리지</h3>
          <p className="text-sm text-muted-foreground">
            각 공장에서 제조되는 품목 중 표준원가가 등록된 비율. 100% 미만인 공장은 3-Way 비교에서 일부 품목이 누락됩니다.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {factoryCoverage.map((c) => (
              <div key={c.factory} className={`rounded-md border p-3.5 ${
                c.status === "complete" ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" :
                c.status === "partial" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" :
                "border-red-300 bg-red-50/50 dark:bg-red-950/20"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.factory}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-semibold ${
                    c.status === "complete" ? "bg-green-600 text-white" :
                    c.status === "partial" ? "bg-amber-600 text-white" :
                    "bg-red-600 text-white"
                  }`}>
                    {c.status === "complete" ? "완전" : c.status === "partial" ? "부분" : "없음"}
                  </span>
                </div>
                <div className={`text-2xl font-bold mt-2 ${
                  c.status === "complete" ? "text-green-700 dark:text-green-400" :
                  c.status === "partial" ? "text-amber-700 dark:text-amber-400" :
                  "text-red-600 dark:text-red-400"
                }`}>
                  {safeFixed(c.coveragePct, 0)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {c.standardRegistered} / {c.manufacturedItems} 품목 등록
                </div>
                {c.status !== "complete" && c.missingItems.length > 0 && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    미등록 샘플: {c.missingItems.slice(0, 2).map(m => m.name).join(", ")}
                    {c.missingItems.length > 2 && ` 외 ${c.manufacturedItems - c.standardRegistered - 2}건`}
                  </div>
                )}
              </div>
            ))}
          </div>
          {factoryCoverage.some(c => c.status === "missing") && (
            <div className="rounded-md border-l-4 border-red-500 bg-red-50/70 dark:bg-red-950/20 p-3.5 text-sm">
              <p className="font-semibold text-red-800 dark:text-red-300">⚠️ 표준원가 파일 누락 감지</p>
              <p className="mt-1 text-red-700 dark:text-red-400 leading-relaxed">
                커버리지 0%인 공장은 표준원가 파일 자체가 업로드되지 않았을 가능성이 높습니다.
                해당 공장의 제조 품목은 3-Way 분석에서 &quot;표준 미등록&quot;으로 분류되어 변동률 산출이 불가합니다.
                원가팀에 누락 공장의 표준원가 엑셀 파일(예: <code className="bg-background px-1 rounded">&quot;울산공장 표준원가 3월31일 기준.xlsx&quot;</code>)을 요청하여 업로드하면 즉시 활성화됩니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 섹션 2: 필터 + 3-Way 비교 테이블 */}
      <div id="three-way-table">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">
            Step 2. 3-Way 비교 — {searchQuery.trim() ? `검색결과 (매출액순 Top 100)` : `판매영향액 Top 20`}
          </h2>
          <ExportButton
            data={filteredRows.map((r) => ({
              품목코드: r.itemCode,
              품목명: r.itemName,
              공장: r.factory,
              판매수량: r.salesQty,
              판매금액: r.salesAmount,
              판매단가: Math.round(r.avgSalesPrice),
              표준원가: r.standardCost ?? "",
              실제제조원가: r.actualUnitCost !== null ? Math.round(r.actualUnitCost) : "",
              "판매-표준마진(%)": r.salesVsStdMarginPct !== null ? safeFixed(r.salesVsStdMarginPct, 1) : "",
              "판매-실제마진(%)": r.salesVsActualMarginPct !== null ? safeFixed(r.salesVsActualMarginPct, 1) : "",
              "표준-실제변동률(%)": r.stdVsActualVariancePct !== null ? safeFixed(r.stdVsActualVariancePct, 1) : "",
              판매영향액: Math.round(r.salesImpact),
              비고: r.note,
            }))}
            fileName="3-Way_원가비교_2026Q1"
            className="h-7 text-xs"
          />
        </div>

        {/* 필터 + 검색 바 */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="🔍 품목명·코드·공장 검색 (예: MP-BDPC, ASPJ, 양산)"
              className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm"
                aria-label="검색 초기화"
              >
                ✕
              </button>
            )}
          </div>
          <span className="text-sm text-muted-foreground">필터:</span>
          <select value={factoryFilter} onChange={(e) => setFactoryFilter(e.target.value)} className="text-sm border rounded px-2 py-1.5 bg-background">
            <option value="all">전체 공장</option>
            {availableFactories.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={thresholdFilter} onChange={(e) => setThresholdFilter(Number(e.target.value))} className="text-sm border rounded px-2 py-1.5 bg-background">
            <option value={0}>변동률 필터 없음</option>
            <option value={10}>±10% 이상</option>
            <option value={20}>±20% 이상</option>
            <option value={50}>±50% 이상</option>
          </select>
          <span className="text-sm text-muted-foreground">
            <strong>{filteredRows.length}건</strong> 표시 / 전체 {analysis.rows.length}건
          </span>
        </div>

        <ChartCard title="" isEmpty={topImpactRows.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="border-b text-left">
                  <th className="p-2">품목</th>
                  <th className="p-2">공장</th>
                  <th className="p-2 text-right">판매수량</th>
                  <th className="p-2 text-right">판매단가</th>
                  <th className="p-2 text-right">표준원가</th>
                  <th className="p-2 text-right">실제원가</th>
                  <th className="p-2 text-right">표준-실제</th>
                  <th className="p-2 text-right">판매영향</th>
                  <th className="p-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {topImpactRows.map((r, i) => (
                  <tr key={`${r.itemCode}-${i}`} className="border-b hover:bg-muted/30">
                    <td className="p-2.5 min-w-[260px] max-w-[380px]">
                      <div className="font-medium text-[13px] break-words whitespace-normal leading-snug">{r.itemName}</div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{r.itemCode}</div>
                    </td>
                    <td className="p-2.5">{r.factory}</td>
                    <td className="p-2.5 text-right font-mono">{r.salesQty.toLocaleString()}</td>
                    <td className="p-2.5 text-right font-mono">{formatCurrency(r.avgSalesPrice)}</td>
                    <td className="p-2.5 text-right font-mono">
                      {r.standardCost !== null ? (
                        <span title={r.standardCostFactory && r.standardCostFactory !== r.factory
                          ? `출처: ${r.standardCostFactory} 공장 (fallback)` : `출처: ${r.standardCostFactory || "-"}`}>
                          {formatCurrency(r.standardCost)}
                          {r.standardCostFactory && r.standardCostFactory !== r.factory && (
                            <span className="ml-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">⇄{r.standardCostFactory}</span>
                          )}
                        </span>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2.5 text-right font-mono">
                      {r.actualUnitCost !== null ? (
                        <span title={r.actualCostFactory && r.actualCostFactory !== r.factory
                          ? `출처: ${r.actualCostFactory} 공장 (fallback)` : `출처: ${r.actualCostFactory || "-"}`}>
                          {formatCurrency(r.actualUnitCost)}
                          {r.actualCostFactory && r.actualCostFactory !== r.factory && (
                            <span className="ml-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">⇄{r.actualCostFactory}</span>
                          )}
                        </span>
                      ) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className={`p-2.5 text-right font-mono font-semibold ${r.stdVsActualVariancePct === null ? "" : r.stdVsActualVariancePct > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                      {r.stdVsActualVariancePct !== null ? `${r.stdVsActualVariancePct > 0 ? "+" : ""}${safeFixed(r.stdVsActualVariancePct, 1)}%` : "-"}
                    </td>
                    <td className={`p-2.5 text-right font-mono ${r.salesImpact > 0 ? "text-red-600 dark:text-red-400" : r.salesImpact < 0 ? "text-green-700 dark:text-green-400" : ""}`}>
                      {r.salesImpact !== 0 ? formatCurrency(r.salesImpact) : "-"}
                    </td>
                    <td className="p-2.5 text-[11px] text-muted-foreground">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {/* 섹션 3: 월별 판매단가 추세 (Top 5 품목) */}
      {trendChartData.length > 0 && (
        <div id="three-way-trend">
          <h2 className="text-lg font-semibold mb-3">Step 3. 월별 판매단가 추세 (Top 5 영향 품목)</h2>
          <ChartCard
            title="판매단가 월별 변동 (Q1)"
            description="판매영향액 Top 5 품목의 월별 평균 판매단가 — 단가 추세 파악"
            isEmpty={trendChartData.length === 0}
          >
            <ChartContainer height="h-72">
              <LineChart data={trendChartData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => formatCurrency(v, true)} />
                <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {topImpactRows.slice(0, 5).map((r, i) => (
                  <Line
                    key={r.itemCode}
                    type="monotone"
                    dataKey={r.itemCode}
                    name={truncateLabel(r.itemName, 20)}
                    stroke={`hsl(${(i * 60) % 360}, 70%, 50%)`}
                    strokeWidth={2}
                    {...ANIMATION_CONFIG}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </ChartCard>
        </div>
      )}

      {/* 섹션 4: 공장별 평균 변동률 */}
      <div id="three-way-factory">
        <h2 className="text-lg font-semibold mb-3">Step 4. 공장별 평균 변동률</h2>
        <ChartCard
          title="공장별 표준-실제 평균 변동률 (매출액 가중평균)"
          description="양수: 실제가 표준보다 비쌈(손실) / 음수: 실제가 표준보다 저렴(절감). 매출 규모 가중 → 큰 품목의 영향 반영"
          isEmpty={factoryVariance.length === 0}
        >
          <ChartContainer height="h-64">
            <BarChart data={factoryVariance.map((f) => ({
              공장: f.factory,
              평균변동률: f.avgVariancePct !== null ? +f.avgVariancePct.toFixed(1) : 0,
              단순평균: f.simpleAvgVariancePct !== null ? +f.simpleAvgVariancePct.toFixed(1) : 0,
              hasStd: f.hasStandardCoverage,
              품목수: f.itemCount,
              매출액: f.totalSalesAmount,
              영향액: f.totalMarginVarianceImpact,
            }))}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="공장" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold">{d.공장}</p>
                      <p>품목 수: {d.품목수}</p>
                      {d.hasStd ? (
                        <>
                          <p><strong>가중평균 변동률: {d.평균변동률}%</strong></p>
                          <p className="text-muted-foreground">단순평균: {d.단순평균}%</p>
                          <p>총 매출액: {formatCurrency(d.매출액)}</p>
                          <p>마진영향 누적: {formatCurrency(d.영향액)}</p>
                        </>
                      ) : (
                        <p className="text-amber-600">표준원가 book 없음 (N/A)</p>
                      )}
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" />
              <Bar dataKey="평균변동률" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {factoryVariance.map((f, i) => (
                  <Cell
                    key={i}
                    fill={!f.hasStandardCoverage ? "hsl(0, 0%, 60%)" :
                          (f.avgVariancePct ?? 0) > 0 ? "hsl(0, 84%, 60%)" : "hsl(142, 71%, 45%)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* 섹션 5: 원가 요인 분해 */}
      {costDrivers.length > 0 && (
        <div id="three-way-drivers">
          <h2 className="text-lg font-semibold mb-3">Step 5. 원가 요인 분해 — 생산원가 Top 10</h2>
          <ChartCard
            title="품목별 원가 구성 (14개 변동비 + 3개 고정비)"
            description="각 품목의 원가에서 어떤 항목이 주요 요인인지 구성 비율로 분석"
            isEmpty={false}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/30">
                  <tr className="border-b text-left">
                    <th className="p-2">품목</th>
                    <th className="p-2">공장</th>
                    <th className="p-2 text-right">총 원가</th>
                    <th className="p-2 text-right">원재료</th>
                    <th className="p-2 text-right">부재료</th>
                    <th className="p-2 text-right">노무비</th>
                    <th className="p-2 text-right">외주</th>
                    <th className="p-2 text-right">고정비</th>
                    <th className="p-2">주요 원인</th>
                  </tr>
                </thead>
                <tbody>
                  {costDrivers.map((d) => (
                    <tr key={`${d.factory}-${d.itemCode}`} className="border-b hover:bg-muted/30">
                      <td className="p-2.5 min-w-[240px] max-w-[360px]">
                        <div className="font-medium break-words whitespace-normal leading-snug">{d.itemName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{d.itemCode}</div>
                      </td>
                      <td className="p-2.5">{d.factory}</td>
                      <td className="p-2.5 text-right font-mono">{formatCurrency(d.totalCost)}</td>
                      <td className="p-2.5 text-right font-mono">{safeFixed(d.원재료비Pct, 1)}%</td>
                      <td className="p-2.5 text-right font-mono">{safeFixed(d.부재료비Pct, 1)}%</td>
                      <td className="p-2.5 text-right font-mono">{safeFixed(d.노무비Pct, 1)}%</td>
                      <td className="p-2.5 text-right font-mono">{safeFixed(d.외주가공비Pct, 1)}%</td>
                      <td className="p-2.5 text-right font-mono">{safeFixed(d.고정비Pct, 1)}%</td>
                      <td className="p-2.5 text-[12px] font-semibold">{d.dominantDriver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      {/* 섹션 6: 표준원가 정확도 KPI */}
      {accuracyKPI.sampleSize > 0 && (
        <div id="three-way-accuracy">
          <h2 className="text-lg font-semibold mb-3">Step 6. 표준원가 정확도 KPI</h2>
          <ChartCard
            title={`원가 회계 정확도 등급: ${accuracyKPI.grade}`}
            description={accuracyKPI.diagnosis}
            isEmpty={false}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3">
              <div className="rounded-md border p-3.5 bg-background/60">
                <p className="text-xs text-muted-foreground font-medium">가중 평균 절대 변동률</p>
                <p className={`text-2xl font-bold mt-1 ${accuracyKPI.weightedAbsVariancePct <= 5 ? "text-green-700 dark:text-green-400" : accuracyKPI.weightedAbsVariancePct <= 10 ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                  {safeFixed(accuracyKPI.weightedAbsVariancePct, 1)}%
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">벤치마크: ±5% 이내 우수</p>
              </div>
              <div className="rounded-md border p-3.5 bg-background/60">
                <p className="text-xs text-muted-foreground font-medium">중위 절대 변동률</p>
                <p className="text-2xl font-bold mt-1">{safeFixed(accuracyKPI.medianAbsVariancePct, 1)}%</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">매출 가중 p50</p>
              </div>
              <div className="rounded-md border p-3.5 bg-background/60">
                <p className="text-xs text-muted-foreground font-medium">p90 절대 변동률</p>
                <p className="text-2xl font-bold mt-1">{safeFixed(accuracyKPI.p90AbsVariancePct, 1)}%</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">상위 10% 편차 경계</p>
              </div>
              <div className="rounded-md border p-3.5 bg-background/60">
                <p className="text-xs text-muted-foreground font-medium">표준 초과 매출 비중</p>
                <p className={`text-2xl font-bold mt-1 ${accuracyKPI.overStandardRatio >= 0.5 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                  {safeFixed(accuracyKPI.overStandardRatio * 100, 1)}%
                </p>
                <p className="text-[11px] text-muted-foreground mt-1.5">실제 &gt; 표준인 품목 매출 비중</p>
              </div>
            </div>
            <div className="px-3 pb-3">
              <div className="flex gap-2 text-xs">
                <div className="flex-1 rounded bg-green-50 dark:bg-green-950/20 p-2.5">
                  <div className="font-semibold text-green-700 dark:text-green-300">±5% 내</div>
                  <div className="text-xl font-mono font-bold mt-0.5">{safeFixed(accuracyKPI.within5PctRatio * 100, 0)}%</div>
                </div>
                <div className="flex-1 rounded bg-amber-50 dark:bg-amber-950/20 p-2.5">
                  <div className="font-semibold text-amber-700 dark:text-amber-300">±10% 내</div>
                  <div className="text-xl font-mono font-bold mt-0.5">{safeFixed(accuracyKPI.within10PctRatio * 100, 0)}%</div>
                </div>
                <div className="flex-1 rounded bg-slate-50 dark:bg-slate-900/40 p-2.5">
                  <div className="font-semibold">샘플</div>
                  <div className="text-xl font-mono font-bold mt-0.5">{accuracyKPI.sampleSize}건</div>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>
      )}

      {/* 섹션 7: 공장 간 효율성 매트릭스 */}
      {multiFactoryItems.length > 0 && (
        <div id="three-way-efficiency">
          <h2 className="text-lg font-semibold mb-3">Step 7. 공장 간 동일 품목 효율성 비교 ({multiFactoryItems.length}건)</h2>
          <ChartCard
            title="다공장 생산 품목의 공장별 단가"
            description="여러 공장에서 생산되는 품목의 원가 차이 — 공장 라인 통합·이전 의사결정 근거"
            isEmpty={false}
          >
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-muted/30 sticky top-0">
                  <tr className="border-b text-left">
                    <th className="p-2">품목</th>
                    <th className="p-2 text-right">양산</th>
                    <th className="p-2 text-right">청산</th>
                    <th className="p-2 text-right">울산</th>
                    <th className="p-2 text-right">용산</th>
                    <th className="p-2 text-right">최저 공장</th>
                    <th className="p-2 text-right">스프레드</th>
                  </tr>
                </thead>
                <tbody>
                  {multiFactoryItems.slice(0, 50).map((e) => (
                    <tr key={e.itemCode} className="border-b hover:bg-muted/30">
                      <td className="p-2.5 min-w-[240px] max-w-[360px]">
                        <div className="font-medium break-words whitespace-normal leading-snug">{e.itemName}</div>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{e.itemCode}</div>
                      </td>
                      {["양산", "청산", "울산", "용산"].map((f) => (
                        <td key={f} className="p-2.5 text-right font-mono">
                          {e.costByFactory[f] !== undefined && e.costByFactory[f] !== null ? (
                            <span className={e.cheapestFactory === f ? "text-green-700 dark:text-green-400 font-semibold" :
                                             e.mostExpensiveFactory === f ? "text-red-600 dark:text-red-400" : ""}>
                              {formatCurrency(e.costByFactory[f]!)}
                            </span>
                          ) : <span className="text-muted-foreground">-</span>}
                        </td>
                      ))}
                      <td className="p-2.5 text-right font-semibold text-green-700 dark:text-green-400">{e.cheapestFactory}</td>
                      <td className={`p-2.5 text-right font-mono font-semibold ${(e.spreadPct ?? 0) >= 20 ? "text-red-600 dark:text-red-400" : (e.spreadPct ?? 0) >= 10 ? "text-amber-700 dark:text-amber-400" : ""}`}>
                        {e.spreadPct !== null ? `${safeFixed(e.spreadPct, 1)}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {multiFactoryItems.length > 50 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">상위 50건 표시 (전체 {multiFactoryItems.length}건, 스프레드 큰 순)</p>
              )}
            </div>
          </ChartCard>
        </div>
      )}

      {/* 섹션 8: 저효율 라인 자동 탐지 */}
      {inefficiencyAlerts.length > 0 && (
        <div id="three-way-alerts">
          <h2 className="text-lg font-semibold mb-3">Step 8. 원가 효율성 알림 ({inefficiencyAlerts.length}건)</h2>
          <ChartCard
            title="즉시 액션 가능한 원가 절감/개선 기회"
            description="공장 간 단가 차이 ≥ 10% 또는 표준 대비 실제 ≥ 20% 차이 품목"
            isEmpty={false}
          >
            <div className="space-y-2.5 p-3 max-h-[520px] overflow-y-auto">
              {inefficiencyAlerts.slice(0, 30).map((a, i) => (
                <div
                  key={`${a.alertType}-${a.itemCode}-${i}`}
                  className={`rounded-md border-l-4 p-3.5 text-sm ${
                    a.severity === "critical" ? "border-red-500 bg-red-50/70 dark:bg-red-950/20" :
                    a.severity === "high" ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/20" :
                    "border-slate-400 bg-slate-50/70 dark:bg-slate-900/40"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      a.severity === "critical" ? "bg-red-600 text-white" :
                      a.severity === "high" ? "bg-amber-600 text-white" :
                      "bg-slate-500 text-white"
                    }`}>
                      {a.severity.toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold break-words">{a.itemName} <span className="text-[12px] text-muted-foreground font-mono ml-1">{a.itemCode}</span></div>
                      <div className="mt-1 break-words">{a.message}</div>
                      {a.estimatedAnnualSavings !== undefined && a.estimatedAnnualSavings > 0 && (
                        <div className="mt-1.5 text-green-700 dark:text-green-400 font-semibold">
                          💰 연간 절감 가능액 추정: {formatCurrency(a.estimatedAnnualSavings)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {inefficiencyAlerts.length > 30 && (
                <p className="text-xs text-muted-foreground text-center">상위 30건 표시 (전체 {inefficiencyAlerts.length}건)</p>
              )}
            </div>
          </ChartCard>
        </div>
      )}

      {/* 섹션: 원가팀 확인 필요 (제품 미생산 + 매핑 실패) */}
      {(() => {
        const notProduced = analysis.rows.filter(r => r.noteKind === "product_not_produced");
        const mappingFailed = analysis.rows.filter(r => r.noteKind === "mapping_failed");
        if (notProduced.length === 0 && mappingFailed.length === 0) return null;
        const sortedNotProd = [...notProduced].sort((a, b) => b.salesAmount - a.salesAmount);
        const sortedMapFail = [...mappingFailed].sort((a, b) => b.salesAmount - a.salesAmount);
        return (
          <div id="three-way-action-required" className="space-y-4">
            <h2 className="text-lg font-semibold">📋 원가팀 확인 필요 — 실제원가 누락 품목</h2>
            {notProduced.length > 0 && (
              <div>
                <h3 className="text-base font-semibold mb-2 text-amber-800 dark:text-amber-300">
                  제품 미생산 ({notProduced.length}건) — Q1 BOM에 없는 제품
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  표준원가는 등록되어 있으나 2026-Q1 제조원가 BOM에 생산 실적이 없습니다.
                  재고 판매 또는 BOM 입력 누락으로 추정되며, 원가팀에 확인이 필요합니다.
                </p>
                <ChartCard title="" isEmpty={false}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-amber-50 dark:bg-amber-950/30">
                        <tr className="border-b text-left">
                          <th className="p-2.5">품목명</th>
                          <th className="p-2.5">매출 공장</th>
                          <th className="p-2.5">표준원가 공장</th>
                          <th className="p-2.5 text-right">판매 수량</th>
                          <th className="p-2.5 text-right">판매 금액</th>
                          <th className="p-2.5 text-right">표준원가</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedNotProd.map((r, i) => (
                          <tr key={`np-${i}`} className="border-b hover:bg-muted/30">
                            <td className="p-2.5 min-w-[260px] max-w-[400px]">
                              <div className="font-medium break-words whitespace-normal leading-snug">{r.itemName}</div>
                              <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{r.itemCode}</div>
                            </td>
                            <td className="p-2.5">{r.factory}</td>
                            <td className="p-2.5">{r.standardCostFactory}</td>
                            <td className="p-2.5 text-right font-mono">{r.salesQty.toLocaleString()}</td>
                            <td className="p-2.5 text-right font-mono font-semibold">{formatCurrency(r.salesAmount)}</td>
                            <td className="p-2.5 text-right font-mono">
                              {r.standardCost !== null ? formatCurrency(r.standardCost) : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </div>
            )}
            {mappingFailed.length > 0 && (
              <div>
                <h3 className="text-base font-semibold mb-2 text-red-700 dark:text-red-400">
                  품목 매핑 실패 ({mappingFailed.length}건) — 표준원가 신규 등록 필요
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  어느 공장의 표준원가 book에도 등록되지 않은 품목입니다.
                  원가팀에 표준원가 신규 등록을 요청해야 합니다.
                </p>
                <ChartCard title="" isEmpty={false}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead className="bg-red-50 dark:bg-red-950/30">
                        <tr className="border-b text-left">
                          <th className="p-2.5">품목명</th>
                          <th className="p-2.5">매출 공장</th>
                          <th className="p-2.5 text-right">판매 수량</th>
                          <th className="p-2.5 text-right">판매 금액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMapFail.map((r, i) => (
                          <tr key={`mf-${i}`} className="border-b hover:bg-muted/30">
                            <td className="p-2.5 min-w-[260px] max-w-[400px]">
                              <div className="font-medium break-words whitespace-normal leading-snug">{r.itemName}</div>
                            </td>
                            <td className="p-2.5">{r.factory}</td>
                            <td className="p-2.5 text-right font-mono">{r.salesQty.toLocaleString()}</td>
                            <td className="p-2.5 text-right font-mono font-semibold">{formatCurrency(r.salesAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              </div>
            )}
          </div>
        );
      })()}

      {/* 섹션 9: 미매칭/미등록 리스트 */}
      {unmatchedRows.length > 0 && (
        <div id="three-way-unmatched">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Step 9. 미매칭 / 미등록 품목 ({unmatchedRows.length}건)</h2>
            <button
              onClick={() => setShowUnmatched(!showUnmatched)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showUnmatched ? "숨기기" : "보기"}
            </button>
          </div>
          {showUnmatched && (
            <ChartCard title="" isEmpty={false}>
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr className="border-b text-left">
                      <th className="p-2">품목</th>
                      <th className="p-2">공장</th>
                      <th className="p-2 text-right">판매수량</th>
                      <th className="p-2 text-right">판매금액</th>
                      <th className="p-2">미등록 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedRows.slice(0, 100).map((r, i) => (
                      <tr key={`un-${i}`} className="border-b hover:bg-muted/30">
                        <td className="p-2.5 min-w-[240px] max-w-[360px]">
                          <div className="break-words whitespace-normal leading-snug">{r.itemName}</div>
                        </td>
                        <td className="p-2.5">{r.factory}</td>
                        <td className="p-2.5 text-right font-mono">{r.salesQty.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-mono">{formatCurrency(r.salesAmount)}</td>
                        <td className="p-2.5 text-amber-700 dark:text-amber-400">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unmatchedRows.length > 100 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">상위 100건만 표시 (전체 {unmatchedRows.length}건)</p>
                )}
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* 경고 배너 */}
      {analysis.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-800 dark:text-amber-300 dark:bg-amber-950/20">
          {analysis.warnings.map((w, i) => <p key={i}>⚠️ {w}</p>)}
        </div>
      )}
    </div>
  );
}
