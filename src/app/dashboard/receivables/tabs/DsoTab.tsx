"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  ReferenceLine,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { Clock, RefreshCw, Landmark, Users, Package, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { DataTable } from "@/components/dashboard/DataTable";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CHART_COLORS, TOOLTIP_STYLE, formatCurrency, extractMonth } from "@/lib/utils";
import { calcDSOByOrg, calcOverallDSO, calcDSOTrend } from "@/lib/analysis/dso";
import { calcCCCByOrg, calcCCCAnalysis } from "@/lib/analysis/ccc";
import { calcItemInventory, calcGroupSummary, calcInventoryKPI } from "@/lib/analysis/inventoryAnalysis";
import type { ColumnDef } from "@tanstack/react-table";
import type { CCCMetric } from "@/lib/analysis/ccc";
import type { CollectionRecord, SalesRecord, InventoryMovementRecord } from "@/types";

const DSO_COLORS: Record<string, string> = {
  excellent: "hsl(142, 76%, 36%)",
  good: "hsl(188, 94%, 42%)",
  fair: "hsl(45, 93%, 47%)",
  poor: "hsl(0, 84%, 50%)",
};

const DSO_LABELS: Record<string, string> = {
  excellent: "우수",
  good: "양호",
  fair: "보통",
  poor: "주의",
};

interface DsoTabProps {
  allRecords: any[];
  filteredSales: SalesRecord[];
  filteredTeamContrib: any[];
  filteredCollections: CollectionRecord[];
  inventoryData?: Map<string, InventoryMovementRecord[]>;
  isDateFiltered?: boolean;
}

interface MonthlyCollectionRate {
  month: string;
  매출: number;
  수금: number;
  수금율: number;
}

function calcMonthlyCollectionRate(
  sales: SalesRecord[],
  collections: CollectionRecord[]
): MonthlyCollectionRate[] {
  const salesByMonth = new Map<string, number>();
  for (const s of sales) {
    const month = extractMonth(s.매출일);
    if (!month) continue;
    salesByMonth.set(month, (salesByMonth.get(month) || 0) + s.장부금액);
  }

  const collByMonth = new Map<string, number>();
  for (const c of collections) {
    const month = extractMonth(c.수금일);
    if (!month) continue;
    collByMonth.set(month, (collByMonth.get(month) || 0) + c.장부수금액);
  }

  const allMonths = new Set([
    ...Array.from(salesByMonth.keys()),
    ...Array.from(collByMonth.keys()),
  ]);

  return Array.from(allMonths)
    .sort()
    .map((month) => {
      const salesAmt = salesByMonth.get(month) || 0;
      const collAmt = collByMonth.get(month) || 0;
      const rate = salesAmt > 0 ? (collAmt / salesAmt) * 100 : 0;
      return {
        month,
        매출: salesAmt,
        수금: collAmt,
        수금율: Math.round(rate * 10) / 10,
      };
    });
}

export function DsoTab({ allRecords, filteredSales, filteredTeamContrib, filteredCollections, inventoryData, isDateFiltered }: DsoTabProps) {
  const dsoMetrics = useMemo(
    () => calcDSOByOrg(allRecords, filteredSales),
    [allRecords, filteredSales]
  );
  const overallDSO = useMemo(
    () => calcOverallDSO(allRecords, filteredSales),
    [allRecords, filteredSales]
  );
  const cccMetrics = useMemo(
    () => calcCCCByOrg(dsoMetrics, filteredTeamContrib),
    [dsoMetrics, filteredTeamContrib]
  );
  const cccAnalysis = useMemo(
    () => calcCCCAnalysis(cccMetrics),
    [cccMetrics]
  );

  const dsoChartData = useMemo(
    () =>
      dsoMetrics.map((d) => ({
        org: d.org,
        dso: d.dso,
        classification: d.classification,
      })),
    [dsoMetrics]
  );

  // DSO Trend
  const dsoTrend = useMemo(
    () => calcDSOTrend(allRecords, filteredSales),
    [allRecords, filteredSales]
  );

  // Collection Rate Trend
  const collectionRateTrend = useMemo(
    () => calcMonthlyCollectionRate(filteredSales, filteredCollections),
    [filteredSales, filteredCollections]
  );

  // Inventory analysis
  const hasInventory = inventoryData !== undefined && inventoryData.size > 0;
  const inventoryItems = useMemo(
    () => hasInventory ? calcItemInventory(inventoryData!) : [],
    [inventoryData, hasInventory]
  );
  const inventoryGroupSummary = useMemo(
    () => hasInventory ? calcGroupSummary(inventoryItems) : [],
    [inventoryItems, hasInventory]
  );
  const inventoryKPI = useMemo(
    () => hasInventory ? calcInventoryKPI(inventoryItems) : null,
    [inventoryItems, hasInventory]
  );

  const cccExportData = useMemo(
    () =>
      cccMetrics.map((m) => ({
        조직: m.org,
        "DSO(일)": m.dso,
        "DPO(일)": m.dpo,
        "CCC(일)": m.ccc,
        등급: DSO_LABELS[m.classification] || m.classification,
        권장사항: m.recommendation,
      })),
    [cccMetrics]
  );

  const cccColumns = useMemo<ColumnDef<CCCMetric, any>[]>(
    () => [
      {
        accessorKey: "org",
        header: "조직",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "dso",
        header: () => <span className="block text-right">DSO (일)</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums font-medium">
            {getValue<number>()}
          </span>
        ),
      },
      {
        accessorKey: "dpo",
        header: () => <span className="block text-right">DPO (일)</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {getValue<number>()}
          </span>
        ),
      },
      {
        accessorKey: "ccc",
        header: () => <span className="block text-right">CCC (일)</span>,
        cell: ({ getValue }) => {
          const ccc = getValue<number>();
          return (
            <span
              className={`block text-right tabular-nums font-bold ${
                ccc < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ccc > 60
                  ? "text-red-600 dark:text-red-400"
                  : ""
              }`}
            >
              {ccc}
            </span>
          );
        },
      },
      {
        accessorKey: "classification",
        header: "등급",
        cell: ({ getValue }) => {
          const cls = getValue<string>();
          return (
            <Badge
              variant={
                cls === "excellent"
                  ? "success"
                  : cls === "good"
                  ? "default"
                  : cls === "fair"
                  ? "warning"
                  : "destructive"
              }
            >
              {DSO_LABELS[cls] || cls}
            </Badge>
          );
        },
      },
      {
        accessorKey: "recommendation",
        header: "권장사항",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground line-clamp-2 max-w-[300px]">
            {getValue<string>()}
          </span>
        ),
      },
    ],
    []
  );

  if (allRecords.length === 0) return <EmptyState requiredFiles={["미수채권연령", "매출리스트"]} />;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="평균 DSO(매출채권 회수기간)"
          value={overallDSO}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula={`DSO = 총 미수금 잔액 / 일평균 매출액 (예: 50억 / 0.5억/일 = 100일)`}
          description="매출이 발생한 뒤 현금으로 회수되기까지 걸리는 평균 일수입니다. 작을수록 현금 회수가 빠릅니다."
          benchmark="건자재/인프라 업종 평균 45~60일. 30일 미만이면 우수, 60일 초과이면 주의"
          reason="DSO는 현금흐름 건전성의 핵심 선행지표로, 증가 추세 시 자금 압박을 사전 경고합니다."
        />
        <KpiCard
          title="평균 CCC(현금순환주기)"
          value={cccAnalysis.avgCCC}
          format="number"
          icon={<RefreshCw className="h-5 w-5" />}
          formula={`CCC = DSO - DPO (예: ${cccAnalysis.avgDSO}일 - ${cccAnalysis.avgDPO}일 = ${cccAnalysis.avgCCC}일)\nDSO: 매출 후 현금 회수까지 걸리는 일수\nDPO: 구매 후 대금 지급까지 걸리는 일수`}
          description="돈을 지출한 시점부터 다시 회수하기까지 걸리는 기간입니다. 작거나 음수일수록 현금 회전이 빨라 유리합니다."
          benchmark="0일 미만이면 우수, 0~30일이면 양호, 60일 초과이면 주의"
          reason="CCC는 운전자본 효율성의 종합 지표로, DSO와 DPO의 균형을 통해 자금 전략을 수립합니다."
        />
        <KpiCard
          title="평균 DPO(매입채무 지급기간)"
          value={cccAnalysis.avgDPO}
          format="number"
          icon={<Landmark className="h-5 w-5" />}
          formula="매출원가율 기준 업종 평균 추정값 (원가율 80% 이상: 45일, 60~80%: 35일, 60% 미만: 30일)"
          description="원자재를 구매한 뒤 대금을 지급하기까지 걸리는 일수 추정치입니다. 길수록 현금을 오래 보유할 수 있어 유리합니다."
          benchmark="DPO가 길수록 운전자본 관리에 유리하나, 거래처 관계를 고려해야 합니다"
          reason="DPO를 파악하여 매입채무 지급 전략을 최적화합니다."
        />
        <KpiCard
          title="분석 조직 수"
          value={dsoMetrics.length}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="미수금 데이터와 매출 데이터가 모두 존재하는 고유 조직 수"
          description="DSO와 CCC 분석이 가능한 조직 수입니다."
          benchmark="전체 영업조직 대비 분석 가능 조직이 80% 이상이면 데이터 커버리지 양호"
          reason="분석 커버리지를 확인하여 데이터 누락 조직을 식별합니다."
        />
      </div>

      {filteredSales.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            매출 데이터가 업로드되지 않아 DSO를 정확하게 계산할 수 없습니다. 매출목록 엑셀 파일을 업로드하면 조직별 DSO 분석이 가능합니다.
          </p>
        </div>
      )}

      {filteredTeamContrib.length === 0 && filteredSales.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            팀기여도 데이터가 업로드되지 않아 DPO/CCC를 추정할 수 없습니다. 팀기여도 엑셀 파일을 업로드하면 CCC 분석이 가능합니다.
          </p>
        </div>
      )}

      {filteredTeamContrib.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>CCC 추정값 안내:</strong>{" "}
            DPO(매입채무 지급기간)는 매출원가율 기반 업종 평균 추정값입니다.
          </p>
        </div>
      )}

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        isEmpty={dsoChartData.length === 0}
        title="조직별 DSO(매출채권 회수기간)"
        formula="DSO = 조직별 미수금 합계 / 월평균 매출 x 30 (예: 10억 / 2억/월 x 30 = 150일)"
        description="각 조직이 매출채권을 회수하는 데 평균 며칠이 걸리는지 보여줍니다. 짧을수록 현금 회수가 빠릅니다."
        benchmark="건자재/인프라 업종 평균 DSO는 45일. 30일 미만이면 최상위 수준"
        reason="조직간 DSO를 비교하여 수금 효율이 낮은 조직을 특정하고 개선을 추진합니다."
      >
        <ChartContainer height="h-64 md:h-80">
            <BarChart data={dsoChartData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}일`}
              />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 10 }} width={75} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any) => [`${value}일`, "DSO"]}
                labelFormatter={(label) => `조직: ${label}`}
              />
              <ReferenceLine x={45} stroke="hsl(45, 93%, 47%)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: "업종평균 45일", position: "top", fontSize: 10 }} />
              <Bar dataKey="dso" name="DSO" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {dsoChartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={DSO_COLORS[entry.classification] || CHART_COLORS[0]}
                  />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* DSO Trend */}
      {dsoTrend.length > 1 && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="월별 DSO 추세"
          formula="DSO = 해당월 추정 미수금 / 3개월 이동평균 매출 x 30"
          description="월별 DSO 변화를 추적합니다. 지속적으로 증가하면 현금흐름 악화 신호입니다."
          benchmark="3개월 연속 DSO 증가면 수금 전략 점검"
          reason="DSO 추세를 시계열로 분석하여 현금흐름 악화 징후를 조기에 감지합니다."
        >
          <ChartContainer height="h-64 md:h-80">
              <ComposedChart data={dsoTrend}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="dso"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}일`}
                />
                <YAxis
                  yAxisId="amount"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, true)}
                />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) =>
                    name === "DSO" ? [`${value}일`, name] : [formatCurrency(Number(value)), name]
                  }
                />
                <Legend />
                <ReferenceLine yAxisId="dso" y={45} stroke="hsl(45, 93%, 47%)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: "업종평균 45일", position: "right", fontSize: 10 }} />
                <Bar yAxisId="amount" dataKey="monthlySales" name="월매출" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} opacity={0.4} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Line yAxisId="dso" type="monotone" dataKey="dso" name="DSO" stroke={CHART_COLORS[4]} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
              </ComposedChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* Collection Rate Trend */}
      {collectionRateTrend.length > 1 && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="월별 수금율 추세"
          formula="수금율 = 월별 수금액 / 월별 매출액 x 100 (예: 4.5억 / 5억 x 100 = 90%)"
          description="매월 매출 대비 수금 비율의 변화를 보여줍니다. 100% 이상이면 이전 미수금까지 회수 중이고, 100% 미만이면 미수금이 쌓이고 있습니다."
          benchmark="수금율 90% 이상이면 양호, 80% 미만이면 채권 관리 강화 필요"
          reason="월별 수금율 추이를 통해 미수금 누적 여부를 조기에 파악합니다."
        >
          <ChartContainer height="h-64 md:h-80">
              <ComposedChart data={collectionRateTrend}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="amount"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, true)}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, (max: number) => Math.max(max * 1.1, 110)]}
                />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) =>
                    name === "수금율" ? [`${value}%`, name] : [formatCurrency(Number(value)), name]
                  }
                />
                <Legend />
                <ReferenceLine yAxisId="rate" y={100} stroke="hsl(142, 76%, 36%)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: "100%", position: "right", fontSize: 10 }} />
                <Bar yAxisId="amount" dataKey="매출" name="매출" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} opacity={0.5} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Bar yAxisId="amount" dataKey="수금" name="수금" fill={CHART_COLORS[2]} radius={BAR_RADIUS_TOP} opacity={0.5} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Line yAxisId="rate" type="monotone" dataKey="수금율" name="수금율" stroke={CHART_COLORS[4]} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
              </ComposedChart>
          </ChartContainer>
        </ChartCard>
      )}

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        isEmpty={cccMetrics.length === 0}
        title="조직별 CCC(현금순환주기) 상세 분석"
        formula="CCC = DSO - DPO (예: 100일 - 40일 = 60일, 짧을수록 현금 회수 빠름)"
        description="조직별 현금순환주기를 보여줍니다. CCC가 음수이면 매출 대금을 먼저 회수하는 우수한 상태입니다."
        benchmark="CCC 0일 미만이면 우수, 30일 이내이면 양호"
        reason="조직별 CCC를 비교하여 운전자본 효율성 격차를 진단합니다."
        action={<ExportButton data={cccExportData} fileName="CCC분석" />}
      >
        <DataTable
          data={cccMetrics}
          columns={cccColumns}
          searchPlaceholder="조직 검색..."
          defaultPageSize={20}
        />
      </ChartCard>

      {/* 재고 현황 섹션 — 수불현황 업로드 시에만 표시 */}
      {hasInventory && inventoryKPI && (
        <>
          <div className="mt-8 mb-4">
            <h3 className="text-lg font-semibold">재고 현황</h3>
            <p className="text-sm text-muted-foreground">품목별 수불현황 데이터 기반 수량 분석</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="분석 품목 수"
              value={inventoryKPI.totalItems}
              format="number"
              icon={<Package className="h-5 w-5" />}
              formula="전 공장 합산 고유 품목코드 수"
              description="수불현황에 등록된 전체 품목(제품/원재료/부재료 등)의 수입니다."
            />
            <KpiCard
              title="평균 재고회전율 (제품)"
              value={inventoryKPI.avgTurnoverRate}
              format="number"
              icon={<RefreshCw className="h-5 w-5" />}
              formula={`재고회전율 = 출고수량 / 평균재고수량 (예: 10,980 / 385 = 28.5회)`}
              description="제품이 얼마나 빠르게 출고되는지 보여줍니다. 높을수록 재고가 빠르게 소진되어 효율적입니다."
              benchmark="회전율 6회 이상이면 양호, 3회 미만이면 재고 과다 의심"
            />
            <KpiCard
              title="사장재고 품목"
              value={inventoryKPI.deadStockCount}
              format="number"
              icon={<AlertTriangle className="h-5 w-5" />}
              formula="기말수량 > 0 이면서 출고수량 = 0인 품목 수"
              description="재고가 남아있지만 출고가 전혀 없는 품목입니다. 장기 보관 비용이 발생하므로 처분 검토가 필요합니다."
              benchmark="사장재고 비율이 전체 품목의 10% 이상이면 재고 정리 필요"
            />
          </div>

          <ChartCard
            title="품목별 재고 현황 (보유일수 Top 20)"
            dataSourceType="period"
            isDateFiltered={isDateFiltered}
            formula={`재고보유일수 = 365 / 재고회전율 (예: 365 / 28.5 = 12.8일)\n재고회전율 = 출고수량 / ((기초 + 기말) / 2)`}
            description="재고 보유일수가 긴 품목부터 보여줍니다. 보유일수가 길수록 재고가 오래 쌓여있어 자금이 묶여있다는 뜻입니다."
            benchmark="보유일수 90일 이상이면 과잉재고 점검 필요"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">품목명</th>
                    <th className="text-center p-2 font-medium">유형</th>
                    <th className="text-center p-2 font-medium">단위</th>
                    <th className="text-right p-2 font-medium">기초</th>
                    <th className="text-right p-2 font-medium">입고</th>
                    <th className="text-right p-2 font-medium">출고</th>
                    <th className="text-right p-2 font-medium">기말</th>
                    <th className="text-right p-2 font-medium">회전율</th>
                    <th className="text-right p-2 font-medium">보유일수</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryItems.slice(0, 20).map((item, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-2 text-xs font-medium truncate max-w-[200px]" title={`${item.품목} - ${item.품목명}`}>
                        {item.품목명}
                      </td>
                      <td className="p-2 text-center text-xs">
                        <Badge variant={item.품목계정그룹 === "제품" ? "default" : "secondary"}>
                          {item.품목계정그룹}
                        </Badge>
                      </td>
                      <td className="p-2 text-center text-xs">{item.단위}</td>
                      <td className="p-2 text-right font-mono text-xs">{isFinite(item.기초) ? item.기초.toLocaleString() : "-"}</td>
                      <td className="p-2 text-right font-mono text-xs">{isFinite(item.입고) ? item.입고.toLocaleString() : "-"}</td>
                      <td className="p-2 text-right font-mono text-xs">{isFinite(item.출고) ? item.출고.toLocaleString() : "-"}</td>
                      <td className="p-2 text-right font-mono text-xs">{isFinite(item.기말) ? item.기말.toLocaleString() : "-"}</td>
                      <td className={`p-2 text-right font-mono text-xs ${item.회전율 >= 6 ? "text-emerald-600 dark:text-emerald-400" : item.회전율 < 3 && item.회전율 > 0 ? "text-red-500 dark:text-red-400" : ""}`}>
                        {isFinite(item.회전율) ? item.회전율.toFixed(1) : "-"}
                      </td>
                      <td className={`p-2 text-right font-mono text-xs font-semibold ${item.보유일수 >= 90 ? "text-red-500 dark:text-red-400" : item.보유일수 >= 30 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {item.보유일수 >= 999 ? "미출고" : `${item.보유일수}일`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {inventoryGroupSummary.length > 0 && (
            <ChartCard
              title="품목계정그룹별 입출고 비교"
              dataSourceType="period"
              isDateFiltered={isDateFiltered}
              formula="그룹별 입고수량 합계 vs 출고수량 합계"
              description="제품/원재료/부재료 등 그룹별로 입고와 출고 규모를 비교합니다. 입고가 출고보다 크면 재고가 쌓이는 추세입니다."
            >
              <ChartContainer height="h-64 md:h-80">
                <BarChart data={inventoryGroupSummary} margin={{ left: 20 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="group" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) => [Number(value).toLocaleString(), name]}
                  />
                  <Legend />
                  <Bar dataKey="totalIncoming" name="입고" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                  <Bar dataKey="totalOutgoing" name="출고" fill={CHART_COLORS[2]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                </BarChart>
              </ChartContainer>
            </ChartCard>
          )}
        </>
      )}
    </>
  );
}
