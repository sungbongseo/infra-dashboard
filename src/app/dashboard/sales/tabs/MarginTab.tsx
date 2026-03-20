"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { formatCurrency, formatPercent, TOOLTIP_STYLE } from "@/lib/utils";
import {
  Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  Cell, CartesianGrid, ComposedChart, Line, ReferenceLine,
} from "recharts";
import { Calculator, Plus, Trash2, Package, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SalesRecord } from "@/types";
import {
  buildItemCostMap,
  calcCustomerItemMargin,
} from "@/lib/analysis/customerItemMargin";

interface MarginTabProps {
  filteredSales: SalesRecord[];
  itemCostDetail: any[];
}

/** 시뮬레이터 라인 항목 */
interface SimLine {
  id: number;
  품목: string;
  수량: number;
  판매단가: number;
}

const MARGIN_COLORS = {
  high: "#22c55e",    // 30%+
  good: "#3b82f6",    // 15-30%
  low: "#f59e0b",     // 0-15%
  negative: "#ef4444", // <0%
};

function getMarginColor(rate: number): string {
  if (rate >= 30) return MARGIN_COLORS.high;
  if (rate >= 15) return MARGIN_COLORS.good;
  if (rate >= 0) return MARGIN_COLORS.low;
  return MARGIN_COLORS.negative;
}

export function MarginTab({ filteredSales, itemCostDetail }: MarginTabProps) {
  const nextLineIdRef = useRef(1);
  const getNextId = useCallback(() => ++nextLineIdRef.current, []);

  const itemCostMap = useMemo(() => buildItemCostMap(itemCostDetail), [itemCostDetail]);

  // 품목 목록 (검색용) — 501 기준
  const itemList = useMemo(() => {
    return Array.from(itemCostMap.values())
      .filter(v => v.매출수량 > 0)
      .sort((a, b) => b.매출액 - a.매출액);
  }, [itemCostMap]);

  // 거래처 목록 (매출리스트 기준)
  const customerList = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredSales) {
      const c = (r.매출처명 ?? "").trim();
      if (c) map.set(c, (map.get(c) || 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [filteredSales]);

  // ─── 시뮬레이터 상태 ─────────────────────────────
  const [simCustomer, setSimCustomer] = useState("");
  const [simLines, setSimLines] = useState<SimLine[]>(() => [{ id: nextLineIdRef.current, 품목: "", 수량: 1, 판매단가: 0 }]);
  const [itemSearch, setItemSearch] = useState<Record<number, string>>({});
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const addLine = useCallback(() => {
    setSimLines(prev => [...prev, { id: getNextId(), 품목: "", 수량: 1, 판매단가: 0 }]);
  }, [getNextId]);

  const removeLine = useCallback((id: number) => {
    setSimLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }, []);

  const updateLine = useCallback((id: number, field: keyof SimLine, value: string | number) => {
    setSimLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }, []);

  const selectItem = useCallback((lineId: number, itemName: string) => {
    // 품목 선택 시 과거 거래 단가 자동 채우기
    const costInfo = itemCostMap.get(itemName);
    const avgPrice = costInfo ? costInfo.avgUnitPrice : 0;
    setSimLines(prev => prev.map(l =>
      l.id === lineId ? { ...l, 품목: itemName, 판매단가: Math.round(avgPrice) } : l
    ));
    setActiveDropdown(null);
    setItemSearch(prev => ({ ...prev, [lineId]: "" }));
  }, [itemCostMap]);

  // 시뮬레이션 결과 계산
  const simResults = useMemo(() => {
    return simLines
      .filter(l => l.품목 && l.수량 > 0)
      .map(l => {
        const costInfo = itemCostMap.get(l.품목);
        const unitCost = costInfo?.unitCost ?? 0;
        const unitMargin = l.판매단가 - unitCost;
        const marginRate = l.판매단가 > 0 ? (unitMargin / l.판매단가) * 100 : 0;
        const totalSales = l.판매단가 * l.수량;
        const totalMargin = unitMargin * l.수량;
        // 과거 거래 평균 마진율
        const histAvgMargin = costInfo?.avgMarginRate ?? 0;

        return {
          ...l,
          unitCost,
          unitMargin,
          marginRate: isFinite(marginRate) ? marginRate : 0,
          totalSales,
          totalMargin: isFinite(totalMargin) ? totalMargin : 0,
          histAvgMargin,
          hasHistory: !!costInfo,
        };
      });
  }, [simLines, itemCostMap]);

  const simTotals = useMemo(() => {
    const totalSales = simResults.reduce((s, r) => s + r.totalSales, 0);
    const totalMargin = simResults.reduce((s, r) => s + r.totalMargin, 0);
    const avgMarginRate = totalSales > 0 ? (totalMargin / totalSales) * 100 : 0;
    return { totalSales, totalMargin, avgMarginRate: isFinite(avgMarginRate) ? avgMarginRate : 0 };
  }, [simResults]);

  // ─── 과거 실적 기반 거래처별 마진 차트 ─────────────────
  const marginData = useMemo(
    () => calcCustomerItemMargin(filteredSales, itemCostMap),
    [filteredSales, itemCostMap]
  );

  // 거래처가 선택되면 해당 거래처의 과거 품목별 마진 표시
  const customerHistory = useMemo(() => {
    if (!simCustomer) return [];
    return marginData
      .filter(r => r.거래처명 === simCustomer)
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [marginData, simCustomer]);

  // 시뮬레이션 결과 막대 차트
  const simChartData = useMemo(() => {
    return simResults.map(r => ({
      name: r.품목.length > 15 ? r.품목.substring(0, 15) + "…" : r.품목,
      마진율: Number(r.marginRate.toFixed(1)),
      과거평균: Number(r.histAvgMargin.toFixed(1)),
    }));
  }, [simResults]);

  if (itemCostMap.size === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">마진 시뮬레이터 사용 불가</p>
        <p className="text-sm mt-1">
          품목별매출원가(501) 파일을 업로드해야 품목 원가 정보를 기반으로 마진을 계산할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ━━━ 마진 시뮬레이터 ━━━ */}
      <Card className="border-2 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-blue-600" />
            마진 시뮬레이터
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            거래처에 제안할 품목과 단가를 입력하면 예상 마진을 즉시 확인할 수 있습니다.
            원가는 501 품목별매출원가의 실적 단위원가를 사용합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 거래처 선택 */}
          <div className="flex gap-3 items-center">
            <label className="text-sm font-medium whitespace-nowrap">거래처</label>
            <input
              type="text"
              value={simCustomer}
              onChange={(e) => setSimCustomer(e.target.value)}
              list="customer-list"
              placeholder="거래처명 입력 (선택사항 — 과거 거래 이력 참조)"
              className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
            <datalist id="customer-list">
              {customerList.slice(0, 100).map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* 품목 라인 입력 */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_100px_140px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>품목</span>
              <span className="text-right">수량</span>
              <span className="text-right">판매단가 (원)</span>
              <span />
            </div>
            {simLines.map((line) => {
              const searchVal = itemSearch[line.id] ?? "";
              const isOpen = activeDropdown === line.id;
              const filteredItems = searchVal.trim()
                ? itemList.filter(it => it.품목.toLowerCase().includes(searchVal.trim().toLowerCase())).slice(0, 15)
                : itemList.slice(0, 15);

              return (
                <div key={line.id} className="grid grid-cols-[1fr_100px_140px_40px] gap-2 items-center">
                  {/* 품목 검색 입력 */}
                  <div className="relative">
                    <input
                      type="text"
                      value={line.품목 || searchVal}
                      onChange={(e) => {
                        if (line.품목) {
                          setSimLines(prev => prev.map(l => l.id === line.id ? { ...l, 품목: "", 판매단가: 0 } : l));
                        }
                        setItemSearch(prev => ({ ...prev, [line.id]: e.target.value }));
                        setActiveDropdown(line.id);
                      }}
                      onFocus={() => setActiveDropdown(line.id)}
                      onBlur={() => { setTimeout(() => setActiveDropdown(null), 200); }}
                      placeholder="품목 검색..."
                      className={`w-full px-3 py-2 rounded-md border text-sm ${line.품목 ? "border-blue-300 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-700" : "border-input bg-background"}`}
                    />
                    {isOpen && !line.품목 && (
                      <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredItems.map(it => (
                          <button
                            key={it.품목}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                            onMouseDown={(e) => { e.preventDefault(); selectItem(line.id, it.품목); }}
                          >
                            <span className="truncate">{it.품목}</span>
                            <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
                              원가 {it.unitCost.toLocaleString()}
                            </span>
                          </button>
                        ))}
                        {filteredItems.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">매칭되는 품목 없음</div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 수량 */}
                  <input
                    type="number"
                    min={1}
                    value={line.수량}
                    onChange={(e) => updateLine(line.id, "수량", Math.max(1, Number(e.target.value) || 1))}
                    className="px-3 py-2 rounded-md border border-input bg-background text-sm text-right"
                  />
                  {/* 판매단가 */}
                  <input
                    type="number"
                    min={0}
                    value={line.판매단가}
                    onChange={(e) => updateLine(line.id, "판매단가", Math.max(0, Number(e.target.value) || 0))}
                    className="px-3 py-2 rounded-md border border-input bg-background text-sm text-right font-mono"
                  />
                  {/* 삭제 */}
                  <button
                    onClick={() => removeLine(line.id)}
                    className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <button
              onClick={addLine}
              className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 px-1 py-1"
            >
              <Plus className="h-4 w-4" /> 품목 추가
            </button>
          </div>

          {/* ─── 시뮬레이션 결과 ─── */}
          {simResults.length > 0 && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                시뮬레이션 결과
                <span className="text-xs font-normal text-muted-foreground">(501 단위원가 기준)</span>
              </h4>

              {/* 결과 테이블 */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">품목</th>
                      <th className="text-right p-2 font-medium">판매단가</th>
                      <th className="text-right p-2 font-medium">단위원가</th>
                      <th className="text-right p-2 font-medium">단위마진</th>
                      <th className="text-right p-2 font-medium">마진율</th>
                      <th className="text-right p-2 font-medium">수량</th>
                      <th className="text-right p-2 font-medium">예상 매출</th>
                      <th className="text-right p-2 font-medium">예상 마진</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResults.map((r) => (
                      <tr key={r.id} className={`border-b ${r.marginRate < 0 ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                        <td className="p-2 max-w-[200px] truncate">{r.품목}</td>
                        <td className="p-2 text-right font-mono">{r.판매단가.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{Math.round(r.unitCost).toLocaleString()}</td>
                        <td className="p-2 text-right font-mono" style={{ color: getMarginColor(r.marginRate) }}>
                          {Math.round(r.unitMargin).toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-semibold" style={{ color: getMarginColor(r.marginRate) }}>
                          {formatPercent(r.marginRate)}
                        </td>
                        <td className="p-2 text-right">{r.수량.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(r.totalSales, true)}</td>
                        <td className="p-2 text-right font-mono" style={{ color: getMarginColor(r.marginRate) }}>
                          {formatCurrency(r.totalMargin, true)}
                        </td>
                      </tr>
                    ))}
                    {/* 합계 행 */}
                    <tr className="border-t-2 font-semibold bg-muted/30">
                      <td className="p-2" colSpan={5}>합계</td>
                      <td className="p-2 text-right">{simResults.reduce((s, r) => s + r.수량, 0).toLocaleString()}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(simTotals.totalSales, true)}</td>
                      <td className="p-2 text-right font-mono" style={{ color: getMarginColor(simTotals.avgMarginRate) }}>
                        {formatCurrency(simTotals.totalMargin, true)}
                        <span className="text-xs ml-1">({formatPercent(simTotals.avgMarginRate)})</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 적자 경고 */}
              {simResults.some(r => r.marginRate < 0) && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">적자 품목 감지:</span>{" "}
                    {simResults.filter(r => r.marginRate < 0).map(r => r.품목).join(", ")}
                    — 판매단가가 원가보다 낮습니다. 단가 재협상을 검토하세요.
                  </div>
                </div>
              )}

              {/* 시뮬레이션 vs 과거 마진율 비교 차트 */}
              {simChartData.length > 0 && (
                <ChartCard title="시뮬레이션 마진율 vs 과거 평균" description="입력한 단가의 마진율과 해당 품목의 과거 평균 마진율을 비교합니다">
                  <ChartContainer>
                    <ComposedChart data={simChartData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis type="number" tickFormatter={(v: any) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        {...TOOLTIP_STYLE}
                        formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
                      />
                      <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" />
                      <Bar dataKey="마진율" name="시뮬레이션" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                        {simChartData.map((entry, i) => (
                          <Cell key={i} fill={getMarginColor(entry.마진율)} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="과거평균" name="과거 평균 마진율" stroke="#94a3b8" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ChartContainer>
                </ChartCard>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ━━━ 거래처 과거 거래 이력 (거래처 선택 시) ━━━ */}
      {simCustomer && customerHistory.length > 0 && (
        <ChartCard
          title={`${simCustomer} — 과거 품목별 거래 이력`}
          description="이 거래처와의 과거 거래에서 품목별 실제 판매단가와 마진율입니다. 시뮬레이터에 단가 입력 시 참고하세요."
        >
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">품목</th>
                  <th className="text-right p-2 font-medium">평균 판매단가</th>
                  <th className="text-right p-2 font-medium">단위원가</th>
                  <th className="text-right p-2 font-medium">마진율</th>
                  <th className="text-right p-2 font-medium">총 수량</th>
                  <th className="text-right p-2 font-medium">총 매출</th>
                  <th className="text-right p-2 font-medium">단가범위</th>
                </tr>
              </thead>
              <tbody>
                {customerHistory.map((r, i) => (
                  <tr key={i} className={`border-b hover:bg-muted/30 ${r.marginRate < 0 ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                    <td className="p-2 max-w-[200px] truncate" title={r.품목명}>{r.품목명}</td>
                    <td className="p-2 text-right font-mono">{Math.round(r.avgSellingPrice).toLocaleString()}</td>
                    <td className="p-2 text-right font-mono text-muted-foreground">{Math.round(r.unitCost).toLocaleString()}</td>
                    <td className="p-2 text-right font-semibold" style={{ color: getMarginColor(r.marginRate) }}>
                      {formatPercent(r.marginRate)}
                    </td>
                    <td className="p-2 text-right">{r.totalQty.toLocaleString()}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(r.totalAmount, true)}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground">
                      {Math.round(r.minPrice).toLocaleString()} ~ {Math.round(r.maxPrice).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* ━━━ 전체 품목 원가 참조표 ━━━ */}
      <ChartCard title="품목 원가 참조표" description="501 품목별매출원가에서 추출한 단위원가 목록입니다. 시뮬레이터에서 품목을 선택하면 자동으로 반영됩니다.">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium">품목</th>
                <th className="text-left p-2 font-medium">조직</th>
                <th className="text-right p-2 font-medium">단위원가</th>
                <th className="text-right p-2 font-medium">평균판매단가</th>
                <th className="text-right p-2 font-medium">평균마진율</th>
                <th className="text-right p-2 font-medium">총수량</th>
                <th className="text-right p-2 font-medium">총매출</th>
              </tr>
            </thead>
            <tbody>
              {itemList.slice(0, 100).map((it) => (
                <tr key={it.품목} className="border-b hover:bg-muted/30">
                  <td className="p-2 max-w-[200px] truncate" title={it.품목}>{it.품목}</td>
                  <td className="p-2 text-muted-foreground text-xs">{it.영업조직팀}</td>
                  <td className="p-2 text-right font-mono">{Math.round(it.unitCost).toLocaleString()}</td>
                  <td className="p-2 text-right font-mono">{Math.round(it.avgUnitPrice).toLocaleString()}</td>
                  <td className="p-2 text-right" style={{ color: getMarginColor(it.avgMarginRate) }}>
                    {formatPercent(it.avgMarginRate)}
                  </td>
                  <td className="p-2 text-right">{it.매출수량.toLocaleString()}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(it.매출액, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
