"use client";

import { useMemo, useState, useCallback } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend,
  PieChart, Pie, Cell,
  ComposedChart, Line, ReferenceLine,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG } from "@/components/charts";
import { Package, RefreshCw, AlertTriangle, Clock, PackageX, TrendingDown } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatNumber, safeFixed, formatCurrency, CHART_COLORS, TOOLTIP_STYLE, RISK_COLORS } from "@/lib/utils";
import {
  calcMonthlyMovement,
  calcSlowMoving,
  calcDIO,
  calcItemInventory,
  calcGroupSummary,
  calcInventoryKPI,
  calcInventoryABC,
  calcCategoryInventory,
  calcCustomerInventory,
  calcStockoutEstimate,
  calcSalesInventoryMatrix,
  calcInventoryValue,
  calcInventoryForecast,
  calcItemGroupInventory,
} from "@/lib/analysis/inventoryAnalysis";
import type { InventoryMovementRecord, SalesRecord } from "@/types";
import type { ItemCostDetailRecord } from "@/types/itemCost";

interface OrgFilterStats {
  totalCount: number;
  matchedCount: number;
  sharedCount: number;
  isOrgFiltered: boolean;
}

interface InventoryTabProps {
  data: InventoryMovementRecord[];
  isDateFiltered?: boolean;
  salesData?: SalesRecord[];
  costData?: ItemCostDetailRecord[];
  sharedData?: InventoryMovementRecord[];
  orgFilterStats?: OrgFilterStats;
}

/** YYYYMM → "YY.MM" or "없음" */
function formatMonth(m: string): string {
  if (!m || m === "없음") return "없음";
  if (m.length === 6) return `${m.substring(2, 4)}.${m.substring(4, 6)}`;
  return m;
}

/** 무출고 기간별 색상 */
function zeroMonthColor(months: number): string {
  if (months >= 12) return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
  if (months >= 6) return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30";
  return "text-yellow-600 dark:text-yellow-400";
}

/** ABC 등급 배지 색상 */
function abcBadgeColor(abc: "A" | "B" | "C"): string {
  if (abc === "A") return "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
  if (abc === "B") return "text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800";
  return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-700";
}

/** 소진일 리스크 배지 색상 */
function riskBadgeColor(risk: "danger" | "warning" | "safe"): string {
  if (risk === "danger") return "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
  if (risk === "warning") return "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30";
  return "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30";
}

const ABC_COLORS = {
  A: CHART_COLORS[0],
  B: CHART_COLORS[1],
  C: CHART_COLORS[2],
} as const;

const ACCOUNT_GROUPS = ["제품", "상품", "원재료", "부재료", "재공품", "저장품"] as const;
const DEFAULT_GROUPS = new Set(["제품", "상품"]);

const QUADRANT_COLORS: Record<string, string> = {
  star: CHART_COLORS[0],
  overstock: CHART_COLORS[3],
  fast: CHART_COLORS[1],
  review: CHART_COLORS[2],
};

const QUADRANT_LABELS: Record<string, { label: string; desc: string; style: string }> = {
  star: { label: "Star", desc: "높매출+높회전 — 핵심 품목, 유지", style: "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30" },
  fast: { label: "Fast", desc: "높매출+낮회전 — 재고 부족 위험, 안전재고 확보", style: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30" },
  review: { label: "Review", desc: "낮매출+높회전 — 소량 빈번, 효율 검토", style: "border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950/30" },
  overstock: { label: "Overstock", desc: "낮매출+낮회전 — 정리 대상", style: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30" },
};

export function InventoryTab({ data, isDateFiltered, salesData, costData, sharedData, orgFilterStats }: InventoryTabProps) {
  const [showShared, setShowShared] = useState(false);

  // 조직 필터 활성 시: 공유 재고 포함/제외 토글
  const effectiveData = useMemo(() => {
    if (!showShared || !sharedData || sharedData.length === 0) return data;
    return [...data, ...sharedData];
  }, [data, sharedData, showShared]);

  const hasMonthData = effectiveData.some((r) => r.month);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(DEFAULT_GROUPS);

  const toggleGroup = useCallback((group: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => setSelectedGroups(new Set(ACCOUNT_GROUPS)), []);
  const selectNone = useCallback(() => setSelectedGroups(new Set()), []);

  const monthlyMovement = useMemo(() => calcMonthlyMovement(effectiveData), [effectiveData]);
  const slowMoving = useMemo(() => calcSlowMoving(effectiveData), [effectiveData]);
  const dioResults = useMemo(() => calcDIO(effectiveData), [effectiveData]);

  // 품목별 분석 (전 품목)
  const inventoryMap = useMemo(() => {
    const m = new Map<string, InventoryMovementRecord[]>();
    for (const r of effectiveData) {
      const arr = m.get(r.factory) || [];
      arr.push(r);
      m.set(r.factory, arr);
    }
    return m;
  }, [effectiveData]);
  const itemAnalysis = useMemo(() => calcItemInventory(inventoryMap), [inventoryMap]);
  const groupSummary = useMemo(() => calcGroupSummary(itemAnalysis), [itemAnalysis]);

  // 품목계정그룹 필터 적용
  const filteredItems = useMemo(
    () => selectedGroups.size === 0
      ? itemAnalysis
      : itemAnalysis.filter(item => selectedGroups.has(item.품목계정그룹)),
    [itemAnalysis, selectedGroups]
  );
  const inventoryKPI = useMemo(() => calcInventoryKPI(filteredItems), [filteredItems]);

  // KPI 계산 (필터된 품목 기준)
  const totalClosing = useMemo(
    () => filteredItems.reduce((s, item) => s + item.기말, 0),
    [filteredItems]
  );
  const avgTurnover = useMemo(() => {
    const valid = filteredItems.filter((item) => item.회전율 > 0);
    return valid.length > 0
      ? valid.reduce((s, item) => s + item.회전율, 0) / valid.length
      : 0;
  }, [filteredItems]);
  const avgDIO = useMemo(() => {
    const valid = dioResults.filter((d) => d.dio > 0);
    return valid.length > 0
      ? Math.round(valid.reduce((s, d) => s + d.dio, 0) / valid.length)
      : 0;
  }, [dioResults]);
  const filterLabel = selectedGroups.size === 0 || selectedGroups.size === ACCOUNT_GROUPS.length
    ? "전체"
    : Array.from(selectedGroups).join(", ");

  // 월별 입출고 차트 데이터 (공장 합산)
  const monthlyChartData = useMemo(() => {
    const map = new Map<string, { month: string; 입고: number; 출고: number; 기말: number }>();
    for (const m of monthlyMovement) {
      const existing = map.get(m.month);
      if (existing) {
        existing.입고 += m.입고합계;
        existing.출고 += m.출고합계;
        existing.기말 += m.기말재고합계;
      } else {
        map.set(m.month, {
          month: m.month,
          입고: m.입고합계,
          출고: m.출고합계,
          기말: m.기말재고합계,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((d) => ({
        ...d,
        monthLabel: d.month.length === 6
          ? `${d.month.substring(2, 4)}.${d.month.substring(4, 6)}`
          : d.month,
      }));
  }, [monthlyMovement]);

  // ABC 분류 데이터
  const abcData = useMemo(() => calcInventoryABC(filteredItems), [filteredItems]);
  const abcSummary = useMemo(() => {
    const summary = { A: { count: 0, share: 0 }, B: { count: 0, share: 0 }, C: { count: 0, share: 0 } };
    for (const item of abcData) {
      summary[item.abc].count++;
      summary[item.abc].share += item.출고비중;
    }
    summary.A.share = Math.round(summary.A.share * 10) / 10;
    summary.B.share = Math.round(summary.B.share * 10) / 10;
    summary.C.share = Math.round(summary.C.share * 10) / 10;
    return summary;
  }, [abcData]);

  // ABC 파레토 차트 데이터 (상위 30개만 표시)
  const abcChartData = useMemo(() => {
    return abcData.slice(0, 30).map(item => ({
      name: item.품목명 || item.품목,
      출고비중: item.출고비중,
      누적비중: item.누적비중,
      abc: item.abc,
    }));
  }, [abcData]);

  // Top/Bottom 회전율 테이블 (필터된 품목 기준)
  const topItems = useMemo(
    () => [...filteredItems]
      .filter(item => item.회전율 > 0)
      .sort((a, b) => b.회전율 - a.회전율),
    [filteredItems]
  );
  const bottomItems = useMemo(
    () => [...filteredItems]
      .filter(item => item.기말 > 0 && item.회전율 > 0)
      .sort((a, b) => a.회전율 - b.회전율),
    [filteredItems]
  );

  // ABC lookup for top/bottom tables
  const abcLookup = useMemo(() => {
    const map = new Map<string, "A" | "B" | "C">();
    for (const item of abcData) {
      map.set(item.품목, item.abc);
    }
    return map;
  }, [abcData]);

  // 품목계정그룹별 파이차트
  const groupPieData = useMemo(() => {
    const total = groupSummary.reduce((s, g) => s + g.totalClosing, 0);
    if (total === 0) return [];
    return groupSummary
      .filter(g => g.totalClosing > 0)
      .map((g, i) => ({
        name: g.group,
        value: Math.round(g.totalClosing / total * 1000) / 10,
        count: g.itemCount,
        qty: g.totalClosing,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      }));
  }, [groupSummary]);

  // 카테고리별 재고 분석 (대분류)
  const categoryData = useMemo(() => calcCategoryInventory(filteredItems, "대분류"), [filteredItems]);

  // 재고 분포: 주거래처가 50% 미만 채워져 있으면 품목계정그룹으로 자동 폴백
  const customerFillRate = useMemo(() => {
    const filled = effectiveData.filter((r) => (r.주거래처 || "").trim() !== "").length;
    return effectiveData.length > 0 ? filled / effectiveData.length : 0;
  }, [effectiveData]);
  const customerGroupLabel = customerFillRate < 0.5 ? "품목계정그룹" : "주거래처";
  const customerData = useMemo(() => calcCustomerInventory(effectiveData), [effectiveData]);
  const customerChartData = useMemo(() => customerData.slice(0, 10), [customerData]);

  // 예상 소진일 경고
  const stockoutData = useMemo(() => calcStockoutEstimate(filteredItems), [filteredItems]);

  // 매출×재고 사분면 매트릭스
  const salesInventoryMatrix = useMemo(
    () => salesData && salesData.length > 0 ? calcSalesInventoryMatrix(filteredItems, salesData) : [],
    [filteredItems, salesData]
  );

  // 원가 연계 재고 금액
  const inventoryValue = useMemo(
    () => costData && costData.length > 0 ? calcInventoryValue(filteredItems, costData) : [],
    [filteredItems, costData]
  );

  // 수요 예측 (effectiveData 기반, 월별 데이터 전체)
  const forecastItems = useMemo(() => calcInventoryForecast(effectiveData), [effectiveData]);
  // 품목그룹별 재고 분석 (effectiveData 기반)
  const itemGroupSummary = useMemo(() => calcItemGroupInventory(effectiveData), [effectiveData]);

  // 사분면 요약 카운트
  const quadrantSummary = useMemo(() => {
    const summary = { star: 0, fast: 0, review: 0, overstock: 0 };
    for (const item of salesInventoryMatrix) {
      summary[item.quadrant]++;
    }
    return summary;
  }, [salesInventoryMatrix]);

  // 재고금액 ABC 요약
  const valueAbcSummary = useMemo(() => {
    const summary = { A: { count: 0, total: 0 }, B: { count: 0, total: 0 }, C: { count: 0, total: 0 } };
    const grandTotal = inventoryValue.reduce((s, v) => s + v.재고금액, 0);
    for (const item of inventoryValue) {
      summary[item.abc금액].count++;
      summary[item.abc금액].total += item.재고금액;
    }
    return { ...summary, grandTotal };
  }, [inventoryValue]);

  if (effectiveData.length === 0 && data.length === 0) return <EmptyState message="수불현황 데이터를 업로드해 주세요." />;

  return (
    <>
      {/* 조직 필터 상태 배너 */}
      {orgFilterStats?.isOrgFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              조직 필터 적용 — 전체 {orgFilterStats.totalCount.toLocaleString()}건 중{" "}
              <span className="font-semibold">{orgFilterStats.matchedCount.toLocaleString()}건</span> 표시
              {orgFilterStats.sharedCount > 0 && (
                <> (공유 재고 {orgFilterStats.sharedCount.toLocaleString()}건 {showShared ? "포함" : "별도"})</>
              )}
            </span>
          </div>
          {orgFilterStats.sharedCount > 0 && (
            <button
              onClick={() => setShowShared(!showShared)}
              className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                showShared
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-transparent border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40"
              }`}
            >
              {showShared ? "담당 품목만" : "공유 재고 포함"}
            </button>
          )}
        </div>
      )}

      {/* 품목계정그룹 필터 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-medium text-muted-foreground mr-1">품목계정그룹:</span>
        {ACCOUNT_GROUPS.map(group => (
          <button
            key={group}
            onClick={() => toggleGroup(group)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              selectedGroups.has(group)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {group}
          </button>
        ))}
        <span className="text-muted-foreground mx-1">|</span>
        <button onClick={selectAll} className="text-xs text-muted-foreground hover:text-foreground underline">전체</button>
        <button onClick={selectNone} className="text-xs text-muted-foreground hover:text-foreground underline">해제</button>
        {selectedGroups.size > 0 && selectedGroups.size < ACCOUNT_GROUPS.length && (
          <span className="text-xs text-muted-foreground ml-2">({filterLabel} 기준 {filteredItems.length}종)</span>
        )}
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          title="총 기말재고"
          value={totalClosing}
          format="number"
          icon={<Package className="h-5 w-5" />}
          formula="전 공장 기말재고 합계 (필터 기간 마지막 월 기준)"
        />
        <KpiCard
          title="평균 회전율"
          value={Math.round(avgTurnover * 10) / 10}
          format="number"
          icon={<RefreshCw className="h-5 w-5" />}
          formula="회전율 = 총 출고 / 평균재고. 높을수록 재고가 빨리 소진"
          benchmark="제조업 평균 6~12회"
        />
        <KpiCard
          title="장기재고"
          value={slowMoving.length}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="3개월 이상 출고 없는 품목 수 (기말재고 > 0)"
          benchmark="장기재고 비중 10% 이하 권장"
        />
        <KpiCard
          title="수량 DIO"
          value={avgDIO}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="DIO = 평균재고 / 일일출고 (수량 기반, 단위 혼재 주의)"
          benchmark="30~60일이 일반적"
        />
        <KpiCard
          title="사장재고"
          value={inventoryKPI.deadStockCount}
          format="number"
          icon={<PackageX className="h-5 w-5" />}
          formula="기말재고 > 0이면서 출고 = 0인 품목 수"
          description="재고는 있으나 한 번도 출고되지 않은 품목입니다. 폐기 또는 특별 판매를 검토하세요."
        />
        <KpiCard
          title="과잉재고"
          value={inventoryKPI.overstockItems}
          format="number"
          icon={<TrendingDown className="h-5 w-5" />}
          formula="입출비율 > 1.5인 품목 수 (입고가 출고의 1.5배 초과)"
          description="입고가 출고보다 과도하게 많아 재고가 누적되고 있는 품목입니다."
        />
      </div>

      {/* 품목계정그룹별 재고 구성 */}
      {groupPieData.length > 0 && (
        <ChartCard
          title="품목계정그룹별 기말재고 구성"
          formula="비중(%) = 그룹별 기말재고 수량 / 전체 기말재고 수량 x 100"
          description="제품, 원재료, 부재료, 상품 등 그룹별 재고 구성을 보여줍니다."
          benchmark="제품 재고 비중이 전체의 50% 이상이면 과잉 생산 점검 필요"
        >
          <ChartContainer height="h-64 md:h-72">
            <PieChart>
              <Pie
                data={groupPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, value }: any) => `${name} ${value}%`}
                labelLine={{ strokeWidth: 1 }}
              >
                {groupPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any, props: any) => {
                  const p = props.payload;
                  return [`${value}% (${p.count}종, ${formatNumber(p.qty)}개)`, name];
                }}
              />
            </PieChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* 월별 입출고 추이 */}
      {hasMonthData && monthlyChartData.length > 1 && (
        <ChartCard
          title="월별 입출고 추이"
          formula="각 월별 시트에서 집계된 전 공장 입고/출고/기말재고 수량"
          description="월별 재고 입출고 흐름을 보여줍니다. 입고가 출고를 지속적으로 초과하면 재고 누적 위험이 있습니다."
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
        >
          <ErrorBoundary>
            <ChartContainer height="h-64 md:h-80">
              <BarChart data={monthlyChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatNumber(v)} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [formatNumber(Number(v)), name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="입고" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
                <Bar dataKey="출고" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
              </BarChart>
            </ChartContainer>
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* Top/Bottom 회전율 테이블 (ABC 컬럼 추가) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title={`재고회전율 높은 순 (${filterLabel})`}
          formula="회전율 = 총 출고 / 평균재고"
          description="회전율이 높은 품목일수록 빠르게 소진되어 재고 효율이 좋습니다."
        >
          <DataTable
            columns={[
              { header: "공장", accessorKey: "factory" },
              { header: "품목명", accessorKey: "품목명" },
              { header: "그룹", accessorKey: "품목계정그룹" },
              { header: "대분류", accessorKey: "대분류" },
              {
                header: "ABC",
                accessorKey: "품목",
                cell: (info: any) => {
                  const abc = abcLookup.get(info.getValue());
                  return abc ? (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${abcBadgeColor(abc)}`}>
                      {abc}
                    </span>
                  ) : <span className="text-muted-foreground text-xs">-</span>;
                },
              },
              { header: "평균재고", accessorKey: "avgInventory", cell: (info: any) => formatNumber(Math.round((info.row.original.기초 + info.row.original.기말) / 2)) },
              { header: "총출고", accessorKey: "출고", cell: (info: any) => formatNumber(info.getValue()) },
              { header: "회전율", accessorKey: "회전율", cell: (info: any) => safeFixed(Number(info.getValue()), 1) },
            ]}
            data={topItems}
            defaultPageSize={10}
          />
        </ChartCard>

        <ChartCard
          title={`재고회전율 낮은 순 (${filterLabel})`}
          formula="회전율이 낮은 품목은 재고 체류 기간이 길어 자금이 묶입니다"
          description="회전율이 낮은 품목입니다. 회전율 0(출고 없음)은 장기재고 경고에서 별도 관리합니다."
        >
          {bottomItems.length > 0 ? (
            <DataTable
              columns={[
                { header: "공장", accessorKey: "factory" },
                { header: "품목명", accessorKey: "품목명" },
                { header: "그룹", accessorKey: "품목계정그룹" },
                { header: "대분류", accessorKey: "대분류" },
                {
                  header: "ABC",
                  accessorKey: "품목",
                  cell: (info: any) => {
                    const abc = abcLookup.get(info.getValue());
                    return abc ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${abcBadgeColor(abc)}`}>
                        {abc}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">-</span>;
                  },
                },
                { header: "평균재고", accessorKey: "avgInventory", cell: (info: any) => formatNumber(Math.round((info.row.original.기초 + info.row.original.기말) / 2)) },
                { header: "총출고", accessorKey: "출고", cell: (info: any) => formatNumber(info.getValue()) },
                { header: "회전율", accessorKey: "회전율", cell: (info: any) => safeFixed(Number(info.getValue()), 1) },
              ]}
              data={bottomItems}
              defaultPageSize={10}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              선택된 그룹에서 회전율 0 초과 품목이 없습니다.
            </div>
          )}
        </ChartCard>
      </div>

      {/* 장기재고 경고 */}
      {slowMoving.length > 0 && (
        <ChartCard
          title="장기재고 경고"
          formula="3개월 이상 출고 없는 품목 (기말재고 > 0)"
          description="장기간 출고가 없는 재고는 사장재고로 전락할 위험이 있으며, 자금 효율을 저하시킵니다."
        >
          <DataTable
            columns={[
              { header: "공장", accessorKey: "factory" },
              { header: "품목명", accessorKey: "품목명" },
              { header: "단위", accessorKey: "단위" },
              { header: "기말재고", accessorKey: "기말재고", cell: (info: any) => formatNumber(info.getValue()) },
              {
                header: "무출고 월수",
                accessorKey: "zeroOutMonths",
                cell: (info: any) => {
                  const months = Number(info.getValue());
                  return (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${zeroMonthColor(months)}`}>
                      {months}개월
                    </span>
                  );
                },
              },
              {
                header: "마지막 출고",
                accessorKey: "lastOutMonth",
                cell: (info: any) => formatMonth(String(info.getValue())),
              },
            ]}
            data={slowMoving}
            defaultPageSize={10}
          />
        </ChartCard>
      )}

      {/* ─── 새 섹션: ABC 분류 파레토 차트 ─── */}
      {abcChartData.length > 0 && (
        <ChartCard
          title={`ABC 재고 분류 - 파레토 분석 (${filterLabel})`}
          formula="ABC: 누적 출고 비중 기준 A(~80%), B(80~95%), C(95%~)"
          description="파레토 원칙(80/20)에 기반한 재고 분류입니다. A등급 소수 품목이 전체 출고의 80%를 차지합니다."
          benchmark="A등급 품목은 적정 안전재고 유지, C등급은 재고 축소 검토"
        >
          <ErrorBoundary>
            {/* ABC 요약 카드 */}
            <div className="grid grid-cols-3 gap-3 mb-4 px-2">
              {(["A", "B", "C"] as const).map(grade => (
                <div
                  key={grade}
                  className={`rounded-lg border px-3 py-2 text-center ${abcBadgeColor(grade)}`}
                >
                  <div className="text-lg font-bold">{grade}</div>
                  <div className="text-xs">{abcSummary[grade].count}종 ({safeFixed(abcSummary[grade].share, 1)}%)</div>
                </div>
              ))}
            </div>

            <ChartContainer height="h-64 md:h-80">
              <ComposedChart data={abcChartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={60} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${v}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(v: any) => `${v}%`} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [`${safeFixed(Number(v), 1)}%`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine yAxisId="right" y={80} stroke={RISK_COLORS.high} strokeDasharray="4 4" label={{ value: "80%", position: "right", fontSize: 10, fill: RISK_COLORS.high }} />
                <ReferenceLine yAxisId="right" y={95} stroke={RISK_COLORS.medium} strokeDasharray="4 4" label={{ value: "95%", position: "right", fontSize: 10, fill: RISK_COLORS.medium }} />
                <Bar
                  yAxisId="left"
                  dataKey="출고비중"
                  name="출고 비중"
                  radius={BAR_RADIUS_TOP}
                  {...ANIMATION_CONFIG}
                >
                  {abcChartData.map((entry, i) => (
                    <Cell key={i} fill={ABC_COLORS[entry.abc as keyof typeof ABC_COLORS]} />
                  ))}
                </Bar>
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="누적비중"
                  name="누적 비중"
                  stroke={CHART_COLORS[2]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  {...ANIMATION_CONFIG}
                />
              </ComposedChart>
            </ChartContainer>
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── 새 섹션: 카테고리별 재고 분석 (대분류) ─── */}
      {categoryData.length > 0 && (
        <ChartCard
          title={`대분류별 재고 분석 (${filterLabel})`}
          formula="대분류별 기말재고 수량 합산 및 평균 회전율"
          description="대분류 기준으로 재고 분포를 분석합니다. 사장재고 비율이 높은 카테고리를 우선 점검하세요."
        >
          <ErrorBoundary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 가로 BarChart */}
              <ChartContainer height="h-64 md:h-80">
                <BarChart
                  data={categoryData.slice(0, 15)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
                >
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatNumber(v)} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: any, name: any) => [formatNumber(Number(v)), name]}
                  />
                  <Bar dataKey="totalClosing" name="기말재고" fill={CHART_COLORS[3]} radius={[0, 4, 4, 0]} {...ANIMATION_CONFIG} />
                </BarChart>
              </ChartContainer>

              {/* 데이터 테이블 */}
              <DataTable
                columns={[
                  { header: "대분류", accessorKey: "category" },
                  { header: "품목수", accessorKey: "itemCount" },
                  { header: "기말재고", accessorKey: "totalClosing", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "평균회전율", accessorKey: "avgTurnover", cell: (info: any) => safeFixed(Number(info.getValue()), 1) },
                  {
                    header: "사장재고율",
                    accessorKey: "deadStockRate",
                    cell: (info: any) => {
                      const rate = Number(info.getValue());
                      const color = rate >= 30 ? "text-red-600 dark:text-red-400"
                        : rate >= 15 ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400";
                      return <span className={`font-medium ${color}`}>{safeFixed(rate, 1)}%</span>;
                    },
                  },
                ]}
                data={categoryData}
                defaultPageSize={10}
              />
            </div>
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── 재고 분포 (주거래처 or 품목계정그룹 자동 폴백) ─── */}
      {customerChartData.length > 0 && (
        <ChartCard
          title={`${customerGroupLabel}별 재고 분포 (Top 10)`}
          formula={customerFillRate < 0.5
            ? "주거래처 필드가 대부분 비어있어 품목계정그룹(제품/원재료/반제품 등) 기준으로 표시합니다"
            : "거래처별 기말재고 수량 합산 (전체 품목계정그룹 대상)"}
          description={customerFillRate < 0.5
            ? "품목계정그룹별 재고 분포를 보여줍니다. 제품/원재료/반제품 등 자재 유형별 재고 비중을 파악하세요."
            : "주거래처별 재고 집중도를 파악합니다. 특정 거래처에 재고가 과도하게 몰려 있는지 확인하세요."}
        >
          <ErrorBoundary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 가로 BarChart */}
              <ChartContainer height="h-64 md:h-80">
                <BarChart
                  data={customerChartData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
                >
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatNumber(v)} />
                  <YAxis type="category" dataKey="customer" tick={{ fontSize: 10 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: any, name: any) => [formatNumber(Number(v)), name]}
                  />
                  <Bar dataKey="totalClosing" name="기말재고" fill={CHART_COLORS[4]} radius={[0, 4, 4, 0]} {...ANIMATION_CONFIG}>
                    {customerChartData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>

              {/* 데이터 테이블 */}
              <DataTable
                columns={[
                  { header: customerGroupLabel, accessorKey: "customer" },
                  { header: "품목수", accessorKey: "itemCount" },
                  { header: "기말재고", accessorKey: "totalClosing", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "총출고", accessorKey: "totalOutgoing", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "회전율", accessorKey: "avgTurnover", cell: (info: any) => safeFixed(Number(info.getValue()), 1) },
                ]}
                data={customerData}
                defaultPageSize={10}
              />
            </div>
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── 새 섹션: 예상 소진일 경고 ─── */}
      {stockoutData.length > 0 && (
        <ChartCard
          title={`예상 소진일 경고 (${filterLabel})`}
          formula="예상소진일 = 기말재고 / 일평균출고 (일평균출고 = 연출고/365)"
          description="현재 출고 속도가 유지된다면 기말재고가 소진되기까지 남은 일수입니다. 30일 미만은 긴급 보충이 필요합니다."
          benchmark="안전재고 기준: danger(<30일), warning(30~60일), safe(60일+)"
        >
          <ErrorBoundary>
            <DataTable
              columns={[
                { header: "공장", accessorKey: "factory" },
                { header: "품목명", accessorKey: "품목명" },
                { header: "그룹", accessorKey: "품목계정그룹" },
                { header: "대분류", accessorKey: "대분류" },
                { header: "기말재고", accessorKey: "기말", cell: (info: any) => formatNumber(info.getValue()) },
                { header: "월평균출고", accessorKey: "월평균출고", cell: (info: any) => formatNumber(info.getValue()) },
                {
                  header: "예상소진일",
                  accessorKey: "예상소진일",
                  cell: (info: any) => {
                    const days = Number(info.getValue());
                    const risk = info.row.original.risk as "danger" | "warning" | "safe";
                    return (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${riskBadgeColor(risk)}`}>
                        {formatNumber(days)}일
                      </span>
                    );
                  },
                },
                {
                  header: "리스크",
                  accessorKey: "risk",
                  cell: (info: any) => {
                    const risk = info.getValue() as "danger" | "warning" | "safe";
                    const label = risk === "danger" ? "긴급" : risk === "warning" ? "주의" : "안전";
                    return (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${riskBadgeColor(risk)}`}>
                        {label}
                      </span>
                    );
                  },
                },
              ]}
              data={stockoutData}
              defaultPageSize={10}
            />
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── E. 매출×재고 사분면 매트릭스 ─── */}
      {salesInventoryMatrix.length > 0 && (
        <ChartCard
          title={`매출×재고 사분면 매트릭스 (${filterLabel})`}
          formula="X축=매출금액, Y축=회전율. 중앙값 기준으로 4분면 분류"
          description="매출 기여도와 재고 회전율을 교차 분석하여 품목별 전략적 위치를 파악합니다."
          benchmark="Star 비중 30%+ 권장, Overstock 비중 20% 이하 권장"
        >
          <ErrorBoundary>
            {/* 사분면 요약 카운트 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 px-2">
              {(["star", "fast", "review", "overstock"] as const).map(q => (
                <div
                  key={q}
                  className={`rounded-lg border px-3 py-2 text-center ${QUADRANT_LABELS[q].style}`}
                >
                  <div className="text-sm font-bold">{QUADRANT_LABELS[q].label}</div>
                  <div className="text-lg font-bold">{quadrantSummary[q]}개</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{QUADRANT_LABELS[q].desc}</div>
                </div>
              ))}
            </div>

            {/* ScatterChart */}
            <ChartContainer height="h-72 md:h-96">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  type="number"
                  dataKey="매출금액"
                  name="매출금액"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: any) => formatCurrency(v)}
                  label={{ value: "매출금액", position: "insideBottom", offset: -5, fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="회전율"
                  name="회전율"
                  tick={{ fontSize: 11 }}
                  label={{ value: "회전율", angle: -90, position: "insideLeft", fontSize: 11 }}
                />
                <ZAxis type="number" dataKey="기말재고" range={[40, 400]} name="기말재고" />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => {
                    if (name === "매출금액") return [formatCurrency(Number(v)), name];
                    if (name === "기말재고") return [formatNumber(Number(v)), name];
                    return [safeFixed(Number(v), 1), name];
                  }}
                  labelFormatter={() => ""}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-md text-xs space-y-1">
                        <div className="font-semibold">{d.품목명 || d.품목}</div>
                        <div>매출: {formatCurrency(d.매출금액)} ({safeFixed(d.매출비중, 1)}%)</div>
                        <div>회전율: {safeFixed(d.회전율, 1)}</div>
                        <div>기말재고: {formatNumber(d.기말재고)}</div>
                        <div>
                          사분면:{" "}
                          <span className="font-semibold" style={{ color: QUADRANT_COLORS[d.quadrant] }}>
                            {QUADRANT_LABELS[d.quadrant].label}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                {(["star", "overstock", "fast", "review"] as const).map(q => (
                  <Scatter
                    key={q}
                    name={QUADRANT_LABELS[q].label}
                    data={salesInventoryMatrix.filter(item => item.quadrant === q)}
                    fill={QUADRANT_COLORS[q]}
                    {...ANIMATION_CONFIG}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ScatterChart>
            </ChartContainer>

            {/* DataTable */}
            <div className="mt-4">
              <DataTable
                columns={[
                  { header: "품목명", accessorKey: "품목명" },
                  { header: "대분류", accessorKey: "대분류" },
                  { header: "매출금액", accessorKey: "매출금액", cell: (info: any) => formatCurrency(info.getValue()) },
                  { header: "매출비중(%)", accessorKey: "매출비중", cell: (info: any) => `${safeFixed(Number(info.getValue()), 1)}%` },
                  { header: "기말재고", accessorKey: "기말재고", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "회전율", accessorKey: "회전율", cell: (info: any) => safeFixed(Number(info.getValue()), 1) },
                  {
                    header: "사분면",
                    accessorKey: "quadrant",
                    cell: (info: any) => {
                      const q = info.getValue() as string;
                      return (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                          style={{ color: QUADRANT_COLORS[q], backgroundColor: `${QUADRANT_COLORS[q]}15` }}
                        >
                          {QUADRANT_LABELS[q].label}
                        </span>
                      );
                    },
                  },
                ]}
                data={salesInventoryMatrix}
                defaultPageSize={10}
              />
            </div>
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── F. 재고 금액 분석 ─── */}
      {inventoryValue.length > 0 && (
        <ChartCard
          title={`재고 금액 분석 (${filterLabel})`}
          formula="재고금액 = 기말수량 × 단가 (단가 = 실적매출원가 ÷ 매출수량)"
          description="원가 데이터를 연계하여 수량 기반 재고를 금액으로 환산합니다. 금액 기준 ABC 등급으로 자금 집중도를 파악하세요."
          benchmark="A등급(~80%) 품목의 재고 금액 관리가 가장 중요"
        >
          <ErrorBoundary>
            {/* ABC 금액 요약 */}
            <div className="grid grid-cols-3 gap-3 mb-4 px-2">
              {(["A", "B", "C"] as const).map(grade => (
                <div
                  key={grade}
                  className={`rounded-lg border px-3 py-2 text-center ${abcBadgeColor(grade)}`}
                >
                  <div className="text-lg font-bold">{grade}</div>
                  <div className="text-xs">{valueAbcSummary[grade].count}종</div>
                  <div className="text-sm font-semibold">{formatCurrency(valueAbcSummary[grade].total)}</div>
                  <div className="text-xs text-muted-foreground">
                    {valueAbcSummary.grandTotal > 0
                      ? `${safeFixed(valueAbcSummary[grade].total / valueAbcSummary.grandTotal * 100, 1)}%`
                      : "0%"}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 상위 20개 품목 가로 BarChart */}
              <ChartContainer height="h-80 md:h-96">
                <BarChart
                  data={inventoryValue.slice(0, 20)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
                >
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="품목명" tick={{ fontSize: 9 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
                  />
                  <Bar dataKey="재고금액" name="재고금액" radius={[0, 4, 4, 0]} {...ANIMATION_CONFIG}>
                    {inventoryValue.slice(0, 20).map((item, i) => (
                      <Cell key={i} fill={ABC_COLORS[item.abc금액]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>

              {/* DataTable */}
              <DataTable
                columns={[
                  { header: "품목명", accessorKey: "품목명" },
                  { header: "대분류", accessorKey: "대분류" },
                  { header: "기말수량", accessorKey: "기말수량", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "단가", accessorKey: "단가", cell: (info: any) => formatCurrency(info.getValue()) },
                  { header: "재고금액", accessorKey: "재고금액", cell: (info: any) => formatCurrency(info.getValue()) },
                  { header: "비중(%)", accessorKey: "금액비중", cell: (info: any) => `${safeFixed(Number(info.getValue()), 1)}%` },
                  {
                    header: "ABC",
                    accessorKey: "abc금액",
                    cell: (info: any) => {
                      const abc = info.getValue() as "A" | "B" | "C";
                      return (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${abcBadgeColor(abc)}`}>
                          {abc}
                        </span>
                      );
                    },
                  },
                ]}
                data={inventoryValue}
                defaultPageSize={10}
              />
            </div>
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── G. 수요 예측 (이동평균) ─── */}
      {forecastItems.length > 0 && (
        <ChartCard
          title="재고 수요 예측 (이동평균)"
          formula="최근 3개월 평균 출고량 기반 예측. 커버리지 = 기말재고 ÷ 월평균 출고"
          description="커버리지가 1개월 미만이면 긴급 보충이 필요합니다."
        >
          <ErrorBoundary>
            {/* 커버리지 위험 요약 */}
            <div className="grid grid-cols-3 gap-3 mb-4 px-2">
              <div className="rounded-lg border px-3 py-2 text-center border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30">
                <div className="text-xs text-muted-foreground">위험 (&lt;1개월)</div>
                <div className="text-xl font-bold text-red-600 dark:text-red-400">
                  {forecastItems.filter(f => f.coverageMonths < 1).length}
                </div>
              </div>
              <div className="rounded-lg border px-3 py-2 text-center border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                <div className="text-xs text-muted-foreground">주의 (1~3개월)</div>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {forecastItems.filter(f => f.coverageMonths >= 1 && f.coverageMonths < 3).length}
                </div>
              </div>
              <div className="rounded-lg border px-3 py-2 text-center border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
                <div className="text-xs text-muted-foreground">안전 (3개월+)</div>
                <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                  {forecastItems.filter(f => f.coverageMonths >= 3).length}
                </div>
              </div>
            </div>

            <DataTable
              columns={[
                { header: "품목명", accessorKey: "품목명" },
                { header: "품목계정그룹", accessorKey: "품목계정그룹" },
                { header: "대분류", accessorKey: "대분류" },
                { header: "기말재고", accessorKey: "기말재고", cell: (info: any) => formatNumber(info.getValue()) },
                { header: "월평균출고", accessorKey: "avgMonthlyOut", cell: (info: any) => formatNumber(info.getValue()) },
                { header: "예측출고", accessorKey: "forecastNextMonth", cell: (info: any) => formatNumber(info.getValue()) },
                {
                  header: "커버리지(월)",
                  accessorKey: "coverageMonths",
                  cell: (info: any) => {
                    const months = Number(info.getValue());
                    const color = months < 1
                      ? "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30"
                      : months < 3
                        ? "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
                        : "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30";
                    return (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
                        {months >= 999 ? "∞" : safeFixed(months, 1)}개월
                      </span>
                    );
                  },
                },
                {
                  header: "추세",
                  accessorKey: "trend",
                  cell: (info: any) => {
                    const trend = info.getValue() as string;
                    if (trend === "increasing") return <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">증가 ▲</span>;
                    if (trend === "decreasing") return <span className="text-red-600 dark:text-red-400 text-xs font-medium">감소 ▼</span>;
                    return <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">안정 ─</span>;
                  },
                },
              ]}
              data={forecastItems}
              defaultPageSize={10}
            />
          </ErrorBoundary>
        </ChartCard>
      )}

      {/* ─── H. 품목그룹별 재고 분석 ─── */}
      {itemGroupSummary.length > 0 && (
        <ChartCard
          title="품목그룹별 재고 현황"
          formula="품목그룹별 기말재고·출고량·회전율·사장재고 비교"
        >
          <ErrorBoundary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 가로 BarChart: 상위 15개 */}
              <ChartContainer height="h-64 md:h-80">
                <BarChart
                  data={itemGroupSummary.slice(0, 15)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 80 }}
                >
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatNumber(v)} />
                  <YAxis type="category" dataKey="group" tick={{ fontSize: 10 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: any, name: any) => [formatNumber(Number(v)), name]}
                  />
                  <Bar dataKey="totalClosing" name="기말재고" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} {...ANIMATION_CONFIG} />
                </BarChart>
              </ChartContainer>

              {/* DataTable */}
              <DataTable
                columns={[
                  { header: "그룹", accessorKey: "group" },
                  { header: "품목수", accessorKey: "itemCount" },
                  { header: "기말재고", accessorKey: "totalClosing", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "총출고", accessorKey: "totalOutgoing", cell: (info: any) => formatNumber(info.getValue()) },
                  { header: "평균회전율", accessorKey: "avgTurnover", cell: (info: any) => safeFixed(Number(info.getValue()), 1) },
                  { header: "사장재고수", accessorKey: "deadStockCount" },
                  { header: "과잉재고수", accessorKey: "overstockCount" },
                ]}
                data={itemGroupSummary}
                defaultPageSize={10}
              />
            </div>
          </ErrorBoundary>
        </ChartCard>
      )}
    </>
  );
}
