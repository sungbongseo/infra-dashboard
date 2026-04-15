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

  // 필터 적용
  const filteredRows = useMemo(() => {
    let rows = analysis.rows;
    if (factoryFilter !== "all") rows = rows.filter((r) => r.factory === factoryFilter);
    if (thresholdFilter > 0) {
      rows = rows.filter((r) =>
        r.stdVsActualVariancePct !== null && Math.abs(r.stdVsActualVariancePct) >= thresholdFilter
      );
    }
    return rows;
  }, [analysis.rows, factoryFilter, thresholdFilter]);

  // Top 판매영향액 (절댓값 기준)
  const topImpactRows = useMemo(
    () => [...filteredRows]
      .sort((a, b) => Math.abs(b.salesImpact) - Math.abs(a.salesImpact))
      .slice(0, 20),
    [filteredRows]
  );

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
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>기간 필터 적용 중</strong> — 이 탭은 2026-Q1(1~3월) 기준 3-Way 비교를 위해 설계되었습니다. 다른 기간 필터링 시 제조원가와의 매칭 정확도가 떨어질 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {/* 개요 배너 */}
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-semibold">🎯 3-Way 원가 비교 — 판매단가 vs 표준원가 vs 실제 제조원가</p>
            <p className="text-xs leading-relaxed">
              2026-Q1(1~3월) 기간 사업부가 판매한 품목별로 3가지 단가를 비교합니다:
              <strong> ① 판매단가</strong>(100 보고서 평균) <strong>② 표준원가</strong>(공장 표준원가 book)
              <strong> ③ 실제 제조원가</strong>(BOM 집계, 제조원가÷생산수량).
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-muted-foreground mt-2">
              <div className="bg-background/60 rounded p-2">
                <strong className="text-foreground">📊 판매-표준 마진</strong>: 영업이 계획한 목표 수익률
              </div>
              <div className="bg-background/60 rounded p-2">
                <strong className="text-foreground">💰 판매-실제 마진</strong>: 실제로 실현된 수익률
              </div>
              <div className="bg-background/60 rounded p-2">
                <strong className="text-foreground">⚙️ 표준-실제 변동률</strong>: 제조 원가 관리 효율
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 데이터 부족 경고 */}
      {(!hasStdData || !hasMfgData) && (
        <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-800 dark:text-amber-300 dark:bg-amber-950/20">
          {!hasStdData && <p>⚠️ 표준원가 book 미업로드 — 업로드하면 3-Way 비교가 활성화됩니다. (예: &quot;양산공장 표준원가 3월31일 기준.xlsx&quot;)</p>}
          {!hasMfgData && <p>⚠️ 제조원가 파일 미업로드 — 업로드하면 실제 단가 비교가 활성화됩니다. (예: &quot;품목별 제조원가(1~3).xlsx&quot;)</p>}
        </div>
      )}

      {/* 섹션 1: 커버리지 & KPI */}
      <div id="three-way-kpi">
        <h2 className="text-lg font-semibold mb-3">Step 1. 커버리지 & 핵심 지표</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="총 판매 품목" value={analysis.coverage.totalSalesItems} format="number"
            icon={<Package className="h-5 w-5" />}
            description="Q1 기간 매출 발생 품목 (거래처별 집계 해제)"
            formula="unique(100.품목명 + 공장)"
          />
          <KpiCard
            title="3-Way 매칭" value={analysis.coverage.threeWayMatched} format="number"
            icon={<TrendingUp className="h-5 w-5" />}
            description={`판매+표준+실제 모두 보유 (${safeFixed(analysis.coverage.threeWayMatched / Math.max(analysis.coverage.totalSalesItems, 1) * 100, 1)}%)`}
            benchmark="70% 이상 양호"
          />
          <KpiCard
            title="표준 미등록" value={analysis.coverage.twoWayMatched} format="number"
            icon={<AlertTriangle className="h-5 w-5" />}
            description="제조원가는 있으나 표준 없음 (울산 등 타공장)"
          />
          <KpiCard
            title="상품/외주" value={analysis.coverage.salesOnly} format="number"
            icon={<DollarSign className="h-5 w-5" />}
            description="판매만 있음 (자체 제조 아님)"
          />
        </div>
      </div>

      {/* 섹션 2: 필터 + 3-Way 비교 테이블 */}
      <div id="three-way-table">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Step 2. 3-Way 비교 — 판매영향액 Top 20</h2>
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

        {/* 필터 바 */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <span className="text-xs text-muted-foreground">필터:</span>
          <select value={factoryFilter} onChange={(e) => setFactoryFilter(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
            <option value="all">전체 공장</option>
            {availableFactories.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={thresholdFilter} onChange={(e) => setThresholdFilter(Number(e.target.value))} className="text-xs border rounded px-2 py-1 bg-background">
            <option value={0}>변동률 필터 없음</option>
            <option value={10}>±10% 이상</option>
            <option value={20}>±20% 이상</option>
            <option value={50}>±50% 이상</option>
          </select>
          <span className="text-xs text-muted-foreground">
            {filteredRows.length}건 표시 / 전체 {analysis.rows.length}건
          </span>
        </div>

        <ChartCard title="" isEmpty={topImpactRows.length === 0}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
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
                    <td className="p-2">
                      <div className="font-medium">{truncateLabel(r.itemName, 25)}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{r.itemCode}</div>
                    </td>
                    <td className="p-2">{r.factory}</td>
                    <td className="p-2 text-right font-mono">{r.salesQty.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(r.avgSalesPrice)}</td>
                    <td className="p-2 text-right font-mono">
                      {r.standardCost !== null ? formatCurrency(r.standardCost) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {r.actualUnitCost !== null ? formatCurrency(r.actualUnitCost) : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className={`p-2 text-right font-mono font-semibold ${r.stdVsActualVariancePct === null ? "" : r.stdVsActualVariancePct > 0 ? "text-red-600" : "text-green-600"}`}>
                      {r.stdVsActualVariancePct !== null ? `${r.stdVsActualVariancePct > 0 ? "+" : ""}${safeFixed(r.stdVsActualVariancePct, 1)}%` : "-"}
                    </td>
                    <td className={`p-2 text-right font-mono ${r.salesImpact > 0 ? "text-red-600" : r.salesImpact < 0 ? "text-green-600" : ""}`}>
                      {r.salesImpact !== 0 ? formatCurrency(r.salesImpact) : "-"}
                    </td>
                    <td className="p-2 text-[10px] text-muted-foreground">{r.note}</td>
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
          title="공장별 표준-실제 평균 변동률"
          description="양수: 실제가 표준보다 비쌈 / 음수: 실제가 표준보다 저렴"
          isEmpty={factoryVariance.length === 0}
        >
          <ChartContainer height="h-64">
            <BarChart data={factoryVariance.map((f) => ({
              공장: f.factory,
              평균변동률: f.avgVariancePct !== null ? +f.avgVariancePct.toFixed(1) : 0,
              hasStd: f.hasStandardCoverage,
              품목수: f.itemCount,
              영향액: f.totalSalesImpact,
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
                          <p>평균 변동률: {d.평균변동률}%</p>
                          <p>총 판매영향액: {formatCurrency(d.영향액)}</p>
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
              <table className="w-full text-xs">
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
                      <td className="p-2">
                        <div className="font-medium">{truncateLabel(d.itemName, 22)}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{d.itemCode}</div>
                      </td>
                      <td className="p-2">{d.factory}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(d.totalCost)}</td>
                      <td className="p-2 text-right font-mono">{safeFixed(d.원재료비Pct, 1)}%</td>
                      <td className="p-2 text-right font-mono">{safeFixed(d.부재료비Pct, 1)}%</td>
                      <td className="p-2 text-right font-mono">{safeFixed(d.노무비Pct, 1)}%</td>
                      <td className="p-2 text-right font-mono">{safeFixed(d.외주가공비Pct, 1)}%</td>
                      <td className="p-2 text-right font-mono">{safeFixed(d.고정비Pct, 1)}%</td>
                      <td className="p-2 text-[10px] font-semibold">{d.dominantDriver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      )}

      {/* 섹션 6: 미매칭/미등록 리스트 */}
      {unmatchedRows.length > 0 && (
        <div id="three-way-unmatched">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Step 6. 미매칭 / 미등록 품목 ({unmatchedRows.length}건)</h2>
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
                <table className="w-full text-xs">
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
                        <td className="p-2">{truncateLabel(r.itemName, 30)}</td>
                        <td className="p-2">{r.factory}</td>
                        <td className="p-2 text-right font-mono">{r.salesQty.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(r.salesAmount)}</td>
                        <td className="p-2 text-amber-600">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {unmatchedRows.length > 100 && (
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">상위 100건만 표시 (전체 {unmatchedRows.length}건)</p>
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
