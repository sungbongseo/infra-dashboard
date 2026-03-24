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
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG } from "@/components/charts";
import { Package, RefreshCw, AlertTriangle, Clock, PackageX, TrendingDown } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatNumber, safeFixed, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
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
} from "@/lib/analysis/inventoryAnalysis";
import type { InventoryMovementRecord } from "@/types";

interface InventoryTabProps {
  data: InventoryMovementRecord[];
  isDateFiltered?: boolean;
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

export function InventoryTab({ data, isDateFiltered }: InventoryTabProps) {
  const hasMonthData = data.some((r) => r.month);
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

  const monthlyMovement = useMemo(() => calcMonthlyMovement(data), [data]);
  const slowMoving = useMemo(() => calcSlowMoving(data), [data]);
  const dioResults = useMemo(() => calcDIO(data), [data]);

  // 품목별 분석 (전 품목)
  const inventoryMap = useMemo(() => {
    const m = new Map<string, InventoryMovementRecord[]>();
    for (const r of data) {
      const arr = m.get(r.factory) || [];
      arr.push(r);
      m.set(r.factory, arr);
    }
    return m;
  }, [data]);
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

  // 주거래처별 재고 분포 (raw data 기반, 품목계정그룹 필터 무관)
  const customerData = useMemo(() => calcCustomerInventory(data), [data]);
  const customerChartData = useMemo(() => customerData.slice(0, 10), [customerData]);

  // 예상 소진일 경고
  const stockoutData = useMemo(() => calcStockoutEstimate(filteredItems), [filteredItems]);

  if (data.length === 0) return <EmptyState message="수불현황 데이터를 업로드해 주세요." />;

  return (
    <>
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
                <ReferenceLine yAxisId="right" y={80} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "80%", position: "right", fontSize: 10, fill: "#ef4444" }} />
                <ReferenceLine yAxisId="right" y={95} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "95%", position: "right", fontSize: 10, fill: "#f59e0b" }} />
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
                  stroke="#6366f1"
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

      {/* ─── 새 섹션: 주거래처별 재고 분포 ─── */}
      {customerChartData.length > 0 && (
        <ChartCard
          title="주거래처별 재고 분포 (Top 10)"
          formula="거래처별 기말재고 수량 합산 (전체 품목계정그룹 대상)"
          description="주거래처별 재고 집중도를 파악합니다. 특정 거래처에 재고가 과도하게 몰려 있는지 확인하세요."
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
                  { header: "거래처", accessorKey: "customer" },
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
    </>
  );
}
