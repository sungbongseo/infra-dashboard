"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { formatCurrency, formatPercent, TOOLTIP_STYLE, safeFixed } from "@/lib/utils";
import {
  Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  Cell, CartesianGrid, ComposedChart, Line, ReferenceLine,
} from "recharts";
import { Calculator, Plus, Trash2, Package, AlertCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
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

function getMarginLabel(rate: number): string {
  if (rate >= 30) return "우수";
  if (rate >= 15) return "양호";
  if (rate >= 0) return "주의";
  return "적자";
}

/** 정보 아이콘 툴팁 컴포넌트 */
function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground ml-1">
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
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
      fullName: r.품목,
      마진율: Number(safeFixed(r.marginRate, 1)),
      과거평균: Number(safeFixed(r.histAvgMargin, 1)),
      판매단가: r.판매단가,
      단위원가: Math.round(r.unitCost),
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
        <div className="mt-4 text-left max-w-md mx-auto bg-muted/50 rounded-lg p-4 text-xs space-y-2">
          <p className="font-semibold">필요 데이터:</p>
          <p>1. <strong>품목별매출원가(501)</strong> — 품목별 실적매출원가와 매출수량이 포함된 SAP 보고서. 단위원가(=실적매출원가/매출수량)를 계산하는 기준 데이터입니다.</p>
          <p>2. <strong>매출리스트</strong> — 거래처별 품목 판매단가와 거래 내역. 501의 단위원가와 비교하여 마진을 산출합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           섹션 1: 마진 시뮬레이터
           용도: 영업사원이 견적 전 거래처에 제안할 단가의 마진을 사전 시뮬레이션
           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card className="border-2 border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5 text-blue-600" />
            마진 시뮬레이터
            <InfoTip>
              <p className="font-semibold mb-1">마진 시뮬레이터란?</p>
              <p>거래처에 견적을 제출하기 전, 판매 품목과 단가를 입력하면 예상 마진(이익)을 즉시 계산해주는 도구입니다.</p>
              <p className="mt-1 font-semibold">계산 로직:</p>
              <p>단위마진 = 판매단가 - 단위원가(501)</p>
              <p>마진율(%) = 단위마진 / 판매단가 x 100</p>
              <p>예상마진 = 단위마진 x 수량</p>
              <p className="mt-1 font-semibold">원가 기준:</p>
              <p>501 품목별매출원가의 &apos;실적매출원가 / 매출수량&apos;으로 계산된 단위원가를 사용합니다. 표준원가가 아닌 실적 기반 원가이므로, 실제 제조/구매 원가에 가까운 값입니다.</p>
            </InfoTip>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            거래처에 제안할 품목과 단가를 입력하면 예상 마진을 즉시 확인할 수 있습니다.
            원가는 501 품목별매출원가의 실적 단위원가(=실적매출원가/매출수량)를 사용합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 거래처 선택 */}
          <div className="flex gap-3 items-center">
            <label className="text-sm font-medium whitespace-nowrap">
              거래처
              <InfoTip>
                <p>거래처명을 입력하면 해당 거래처와의 과거 거래 이력(품목별 실제 판매단가, 마진율)을 참조할 수 있습니다.</p>
                <p className="mt-1">선택사항이며, 입력하지 않아도 시뮬레이션은 가능합니다.</p>
              </InfoTip>
            </label>
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
              <span>
                품목
                <InfoTip>
                  <p>501 품목별매출원가에 등록된 품목만 선택 가능합니다. 검색창에 품목명을 입력하면 매칭되는 품목 목록이 표시됩니다.</p>
                  <p className="mt-1">품목을 선택하면 과거 평균 판매단가가 자동으로 입력됩니다. 이 값을 수정하여 다양한 단가 시나리오를 테스트할 수 있습니다.</p>
                </InfoTip>
              </span>
              <span className="text-right">
                수량
                <InfoTip>
                  <p>판매 예정 수량을 입력합니다. 수량에 따라 예상 매출과 총 마진금액이 계산됩니다.</p>
                  <p className="mt-1">단위: 해당 품목의 기본 단위(KG, EA, M 등)를 기준으로 합니다.</p>
                </InfoTip>
              </span>
              <span className="text-right">
                판매단가 (원)
                <InfoTip>
                  <p>거래처에 제안할 개당 판매가격입니다.</p>
                  <p className="mt-1">품목 선택 시 과거 평균 판매단가가 자동 입력되며, 직접 수정할 수 있습니다.</p>
                  <p className="mt-1 text-amber-600">판매단가가 단위원가보다 낮으면 적자(마진율 음수)입니다.</p>
                </InfoTip>
              </span>
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
                              원가 {Math.round(it.unitCost).toLocaleString()}원
                            </span>
                          </button>
                        ))}
                        {filteredItems.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">매칭되는 품목 없음 (501 파일에 등록된 품목만 검색 가능)</div>
                        )}
                      </div>
                    )}
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={line.수량}
                    onChange={(e) => updateLine(line.id, "수량", Math.max(1, Number(e.target.value) || 1))}
                    className="px-3 py-2 rounded-md border border-input bg-background text-sm text-right"
                  />
                  <input
                    type="number"
                    min={0}
                    value={line.판매단가}
                    onChange={(e) => updateLine(line.id, "판매단가", Math.max(0, Number(e.target.value) || 0))}
                    className="px-3 py-2 rounded-md border border-input bg-background text-sm text-right font-mono"
                  />
                  <button
                    onClick={() => removeLine(line.id)}
                    className="p-2 text-muted-foreground hover:text-red-500 transition-colors"
                    title="이 품목 라인을 삭제합니다"
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

          {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
               섹션 2: 시뮬레이션 결과 테이블
               계산: 각 품목별 판매단가 vs 501 단위원가 비교
               ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          {simResults.length > 0 && (
            <div className="border-t pt-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                시뮬레이션 결과
                <InfoTip>
                  <p className="font-semibold mb-1">결과 해석 가이드</p>
                  <p><strong>판매단가:</strong> 사용자가 입력한 거래처 제안 가격</p>
                  <p><strong>단위원가:</strong> 501 보고서의 실적매출원가/매출수량. 해당 품목을 생산/구매하는 데 드는 실제 비용</p>
                  <p><strong>단위마진:</strong> 판매단가 - 단위원가. 개당 남는 이익</p>
                  <p><strong>마진율:</strong> (단위마진/판매단가) x 100. 매출 대비 이익 비율</p>
                  <p><strong>예상매출:</strong> 판매단가 x 수량</p>
                  <p><strong>예상마진:</strong> 단위마진 x 수량. 이 거래에서 예상되는 총 이익</p>
                  <p className="mt-2 font-semibold">마진율 해석 기준:</p>
                  <p style={{color: MARGIN_COLORS.high}}>30%+ 우수 — 고마진 품목, 수익성 우수</p>
                  <p style={{color: MARGIN_COLORS.good}}>15~30% 양호 — 건전한 마진 수준</p>
                  <p style={{color: MARGIN_COLORS.low}}>0~15% 주의 — 마진이 낮아 원가 변동에 취약</p>
                  <p style={{color: MARGIN_COLORS.negative}}>0% 미만 적자 — 팔수록 손해, 단가 재협상 필요</p>
                </InfoTip>
              </h4>

              {/* 마진 등급 범례 */}
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{backgroundColor: MARGIN_COLORS.high}} /> 우수 (30%+)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{backgroundColor: MARGIN_COLORS.good}} /> 양호 (15~30%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{backgroundColor: MARGIN_COLORS.low}} /> 주의 (0~15%)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{backgroundColor: MARGIN_COLORS.negative}} /> 적자 (&lt;0%)</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium">품목</th>
                      <th className="text-right p-2 font-medium">
                        판매단가
                        <InfoTip>사용자가 입력한 거래처 제안 가격 (원/단위). 품목 선택 시 과거 평균 단가가 자동 입력됩니다.</InfoTip>
                      </th>
                      <th className="text-right p-2 font-medium">
                        단위원가
                        <InfoTip>501 품목별매출원가에서 산출한 단위당 제조/구매 원가입니다. 계산: 실적매출원가 / 매출수량 (전체 기간 누적 평균)</InfoTip>
                      </th>
                      <th className="text-right p-2 font-medium">
                        단위마진
                        <InfoTip>개당 이익 = 판매단가 - 단위원가. 양수면 이익, 음수면 손실입니다.</InfoTip>
                      </th>
                      <th className="text-right p-2 font-medium">
                        마진율
                        <InfoTip>매출 대비 이익 비율 = (단위마진 / 판매단가) x 100. 높을수록 수익성이 좋습니다. 업종 평균 15~25%가 일반적입니다.</InfoTip>
                      </th>
                      <th className="text-right p-2 font-medium">등급</th>
                      <th className="text-right p-2 font-medium">수량</th>
                      <th className="text-right p-2 font-medium">
                        예상 매출
                        <InfoTip>이 품목의 총 매출 = 판매단가 x 수량</InfoTip>
                      </th>
                      <th className="text-right p-2 font-medium">
                        예상 마진
                        <InfoTip>이 품목의 총 이익 = 단위마진 x 수량. 거래 전체에서 예상되는 순이익입니다.</InfoTip>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResults.map((r) => (
                      <tr key={r.id} className={`border-b ${r.marginRate < 0 ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                        <td className="p-2 max-w-[200px] truncate" title={r.품목}>{r.품목}</td>
                        <td className="p-2 text-right font-mono">{r.판매단가.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{Math.round(r.unitCost).toLocaleString()}</td>
                        <td className="p-2 text-right font-mono" style={{ color: getMarginColor(r.marginRate) }}>
                          {Math.round(r.unitMargin).toLocaleString()}
                        </td>
                        <td className="p-2 text-right font-semibold" style={{ color: getMarginColor(r.marginRate) }}>
                          {formatPercent(r.marginRate)}
                        </td>
                        <td className="p-2 text-right text-xs" style={{ color: getMarginColor(r.marginRate) }}>
                          {getMarginLabel(r.marginRate)}
                        </td>
                        <td className="p-2 text-right">{r.수량.toLocaleString()}</td>
                        <td className="p-2 text-right font-mono">{formatCurrency(r.totalSales, true)}</td>
                        <td className="p-2 text-right font-mono" style={{ color: getMarginColor(r.marginRate) }}>
                          {formatCurrency(r.totalMargin, true)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-semibold bg-muted/30">
                      <td className="p-2" colSpan={6}>
                        합계
                        <InfoTip>모든 품목의 예상 매출과 마진을 합산한 값입니다. 가중평균 마진율 = 총 마진 / 총 매출 x 100</InfoTip>
                      </td>
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
                    {simResults.filter(r => r.marginRate < 0).map(r => `${r.품목} (마진율 ${formatPercent(r.marginRate)})`).join(", ")}
                    <p className="mt-1">판매단가가 501 기준 단위원가보다 낮아 판매할수록 손실이 발생합니다. 단가 인상 협상이 필요하거나, 원가 절감 방안을 검토하세요.</p>
                  </div>
                </div>
              )}

              {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                   섹션 3: 시뮬레이션 vs 과거 마진율 비교 차트
                   해석: 막대 = 시뮬레이션 마진율, 점+선 = 과거 평균
                   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
              {simChartData.length > 0 && (
                <ChartCard
                  title="시뮬레이션 마진율 vs 과거 평균"
                  description={
                    "막대(색상) = 입력한 단가 기준 예상 마진율, 회색 점 = 해당 품목의 전체 기간 평균 마진율. " +
                    "막대가 회색 점보다 낮으면 과거보다 불리한 조건이며, 빨간 점선(0%)을 넘으면 적자입니다. " +
                    "차트를 활용하여 단가 협상의 여지를 파악하세요."
                  }
                >
                  <ChartContainer>
                    <ComposedChart data={simChartData} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis type="number" tickFormatter={(v: any) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                      <RechartsTooltip
                        {...TOOLTIP_STYLE}
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0]?.payload;
                          if (!d) return null;
                          const simRate = d.마진율;
                          const histRate = d.과거평균;
                          const diff = simRate - histRate;
                          return (
                            <div className="bg-popover border rounded-lg shadow-lg p-3 text-xs space-y-1.5">
                              <p className="font-semibold">{d.fullName || d.name}</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                <span className="text-muted-foreground">시뮬레이션 마진율:</span>
                                <span className="font-mono text-right" style={{color: getMarginColor(simRate)}}>{simRate}%</span>
                                <span className="text-muted-foreground">과거 평균 마진율:</span>
                                <span className="font-mono text-right">{histRate}%</span>
                                <span className="text-muted-foreground">차이:</span>
                                <span className={`font-mono text-right ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {diff >= 0 ? "+" : ""}{safeFixed(diff, 1)}%p
                                </span>
                                <span className="text-muted-foreground">판매단가:</span>
                                <span className="font-mono text-right">{d.판매단가?.toLocaleString()}원</span>
                                <span className="text-muted-foreground">단위원가:</span>
                                <span className="font-mono text-right">{d.단위원가?.toLocaleString()}원</span>
                              </div>
                              <p className="text-muted-foreground pt-1 border-t">
                                {diff >= 0
                                  ? "과거 평균보다 유리한 조건입니다."
                                  : `과거 평균보다 ${safeFixed(Math.abs(diff), 1)}%p 불리합니다. 단가 인상을 검토하세요.`
                                }
                              </p>
                            </div>
                          );
                        }}
                      />
                      <ReferenceLine x={0} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "손익분기", position: "top", fontSize: 10 }} />
                      <Bar dataKey="마진율" name="시뮬레이션" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                        {simChartData.map((entry, i) => (
                          <Cell key={i} fill={getMarginColor(entry.마진율)} />
                        ))}
                      </Bar>
                      <Line type="monotone" dataKey="과거평균" name="과거 평균 마진율" stroke="#94a3b8" strokeWidth={2} dot={{ r: 5, fill: "#94a3b8" }} />
                    </ComposedChart>
                  </ChartContainer>
                </ChartCard>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           섹션 4: 거래처 과거 거래 이력 (거래처 선택 시)
           용도: 시뮬레이터에서 단가 입력 시 과거 단가 참조
           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {simCustomer && customerHistory.length > 0 && (
        <ChartCard
          title={`${simCustomer} — 과거 품목별 거래 이력`}
          description={
            "이 거래처와의 실제 거래 데이터입니다. 평균 판매단가는 매출리스트의 총 매출액/총 수량으로 계산됩니다. " +
            "단가범위는 최저~최고 판매단가를 보여주며, 범위가 넓으면 거래 시기나 물량에 따라 단가가 변동되었음을 의미합니다. " +
            "시뮬레이터에 단가를 입력할 때 이 표의 과거 단가를 참고하세요."
          }
        >
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">품목</th>
                  <th className="text-right p-2 font-medium">
                    평균 판매단가
                    <InfoTip>이 거래처에 판매한 해당 품목의 평균 단가 = 총 매출액 / 총 수량</InfoTip>
                  </th>
                  <th className="text-right p-2 font-medium">
                    단위원가
                    <InfoTip>501 기준 제조/구매 단위원가. 전체 거래처 평균이며, 거래처별로 원가가 다르지 않습니다.</InfoTip>
                  </th>
                  <th className="text-right p-2 font-medium">
                    마진율
                    <InfoTip>이 거래처에 판매한 과거 마진율 = (평균판매단가 - 단위원가) / 평균판매단가 x 100</InfoTip>
                  </th>
                  <th className="text-right p-2 font-medium">총 수량</th>
                  <th className="text-right p-2 font-medium">총 매출</th>
                  <th className="text-right p-2 font-medium">
                    단가범위
                    <InfoTip>해당 품목의 최저~최고 판매단가. 범위가 넓으면 시기/물량에 따른 단가 변동이 컸음을 의미합니다.</InfoTip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customerHistory.map((r, i) => (
                  <tr key={i} className={`border-b hover:bg-muted/30 ${r.marginRate < 0 ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                    <td className="p-2 max-w-[200px] truncate" title={r.품목명}>{r.품목명}</td>
                    <td className="p-2 text-right font-mono">{Math.round(r.avgSellingPrice).toLocaleString()}</td>
                    <td className="p-2 text-right font-mono text-muted-foreground">{Math.round(r.unitCost).toLocaleString()}</td>
                    <td className="p-2 text-right font-semibold" style={{ color: getMarginColor(r.marginRate) }}>
                      {formatPercent(r.marginRate)} ({getMarginLabel(r.marginRate)})
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

      {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
           섹션 5: 전체 품목 원가 참조표
           데이터 소스: 501 품목별매출원가 (14개월 시트 합산)
           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <ChartCard
        title="품목 원가 참조표"
        description={
          "501 품목별매출원가(상세) 보고서에서 추출한 품목별 원가 정보입니다. " +
          "단위원가 = 실적매출원가 / 매출수량 (전체 기간 누적). " +
          "평균판매단가 = 매출액 / 매출수량 (전체 거래처 평균). " +
          "평균마진율 = (매출액 - 실적매출원가) / 매출액 x 100. " +
          "시뮬레이터에서 품목을 선택하면 이 표의 단위원가가 자동으로 반영됩니다. " +
          "매출액 기준 내림차순 정렬 (상위 100개 표시)."
        }
      >
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium">품목</th>
                <th className="text-left p-2 font-medium">조직</th>
                <th className="text-right p-2 font-medium">
                  단위원가
                  <InfoTip>
                    <p>품목 1단위를 생산/구매하는 데 드는 평균 비용</p>
                    <p className="mt-1">계산: 실적매출원가(501) / 매출수량</p>
                    <p className="mt-1">전체 분석 기간(14개월) 누적 평균이며, 시뮬레이터에서 마진 계산의 기준이 됩니다.</p>
                  </InfoTip>
                </th>
                <th className="text-right p-2 font-medium">
                  평균판매단가
                  <InfoTip>
                    <p>전체 거래처에 판매한 평균 가격</p>
                    <p className="mt-1">계산: 매출액(501) / 매출수량</p>
                    <p className="mt-1">거래처마다 실제 단가는 다를 수 있으며, 이 값은 전체 평균입니다.</p>
                  </InfoTip>
                </th>
                <th className="text-right p-2 font-medium">
                  평균마진율
                  <InfoTip>
                    <p>전체 거래처 기준 평균 마진율</p>
                    <p className="mt-1">계산: (매출액 - 실적매출원가) / 매출액 x 100</p>
                    <p className="mt-1">시뮬레이터에서 입력한 단가의 마진율과 비교하여, 제안 가격이 평균보다 유리한지 불리한지 판단하세요.</p>
                  </InfoTip>
                </th>
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
                    {formatPercent(it.avgMarginRate)} ({getMarginLabel(it.avgMarginRate)})
                  </td>
                  <td className="p-2 text-right">{it.매출수량.toLocaleString()}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(it.매출액, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 원가 참조표 해석 가이드 */}
        <div className="mt-3 p-3 bg-muted/30 rounded-md text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">참조표 활용 가이드</p>
          <p>1. <strong>단위원가가 높은 품목</strong>은 단가 설정 시 마진율을 충분히 확보해야 합니다. 원가 변동 시 손실 리스크가 큽니다.</p>
          <p>2. <strong>평균마진율이 낮거나 음수인 품목</strong>은 전사적으로 이미 수익성이 낮은 품목입니다. 전략적 판단(시장 점유율, 번들 판매 등) 없이는 저마진 견적을 지양하세요.</p>
          <p>3. <strong>총수량이 많은 품목</strong>은 주력 제품이므로 단가 변동이 전체 수익에 큰 영향을 미칩니다.</p>
          <p>4. 이 데이터는 501 보고서의 전체 기간(14개월) 누적이며, 최근 원가 변동은 반영되지 않을 수 있습니다.</p>
        </div>
      </ChartCard>
    </TooltipProvider>
  );
}
