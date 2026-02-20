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
import { Clock, RefreshCw, Landmark, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { DataTable } from "@/components/dashboard/DataTable";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { CHART_COLORS, TOOLTIP_STYLE, formatCurrency, extractMonth } from "@/lib/utils";
import { calcDSOByOrg, calcOverallDSO, calcDSOTrend } from "@/lib/analysis/dso";
import { calcCCCByOrg, calcCCCAnalysis } from "@/lib/analysis/ccc";
import type { ColumnDef } from "@tanstack/react-table";
import type { CCCMetric } from "@/lib/analysis/ccc";
import type { CollectionRecord, SalesRecord } from "@/types";

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

export function DsoTab({ allRecords, filteredSales, filteredTeamContrib, filteredCollections }: DsoTabProps) {
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

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="평균 DSO(매출채권 회수기간)"
          value={overallDSO}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="DSO(일) = 총 미수금 ÷ 월평균 매출액 × 30"
          description="DSO(매출채권 회수기간)는 매출이 발생한 뒤 현금으로 회수되기까지 걸리는 평균 일수입니다. 이 숫자가 작을수록 현금 회수가 빠르다는 뜻입니다."
          benchmark="건자재/인프라 업종 평균은 45~60일입니다. 30일 미만이면 우수, 60일 초과이면 주의가 필요합니다"
        />
        <KpiCard
          title="평균 CCC(현금순환주기)"
          value={cccAnalysis.avgCCC}
          format="number"
          icon={<RefreshCw className="h-5 w-5" />}
          formula="CCC = DSO(매출채권 회수기간) + DIO(재고 보유기간) - DPO(매입채무 지급기간)\n현재 DIO는 0으로 설정 (재고 데이터 미보유)"
          description="CCC(현금순환주기)는 돈을 지출한 시점부터 다시 돈을 회수하기까지 걸리는 기간입니다. 값이 작거나 음수일수록 현금 회전이 빨라 자금 운용에 유리합니다."
          benchmark="0일 미만이면 우수, 0~30일이면 양호, 30~60일이면 보통, 60일 초과이면 주의가 필요합니다"
        />
        <KpiCard
          title="평균 DPO(매입채무 지급기간)"
          value={cccAnalysis.avgDPO}
          format="number"
          icon={<Landmark className="h-5 w-5" />}
          formula="매출원가율 기준 업종 평균 추정값\n원가율 80% 이상은 45일, 60~80%는 35일, 60% 미만은 30일"
          description="DPO(매입채무 지급기간)는 원자재를 구매한 뒤 대금을 지급하기까지 걸리는 일수 추정치입니다. 길수록 현금을 오래 보유할 수 있어 유리하지만, 거래 관계를 고려해야 합니다."
          benchmark="DPO가 길수록 운전자본 관리에 유리합니다. 다만 너무 길면 거래처와의 관계에 영향을 줄 수 있습니다"
        />
        <KpiCard
          title="분석 조직 수"
          value={dsoMetrics.length}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="미수금 데이터와 매출 데이터가 모두 존재하는 고유 조직 수"
          description="DSO(매출채권 회수기간)와 CCC(현금순환주기) 분석이 가능한 조직 수입니다. 미수금 데이터와 매출 데이터가 모두 있는 조직만 포함됩니다."
          benchmark="전체 영업조직 대비 분석 가능 조직이 80% 이상이면 데이터 커버리지 양호"
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

      <ChartCard
        title="조직별 DSO(매출채권 회수기간)"
        formula="DSO(일) = 조직별 미수금 합계 ÷ 월평균 매출 × 30\n색상: 녹색(우수, <30일), 파랑(양호, 30~45일), 노랑(보통, 45~60일), 빨강(주의, >60일)"
        description="각 조직이 매출채권을 회수하는 데 평균 며칠이 걸리는지 보여줍니다. DSO(매출채권 회수기간)가 짧을수록 현금 회수가 빠르며 자금 관리가 효율적입니다."
        benchmark="건자재/인프라 업종 평균 DSO는 45일입니다. 30일 미만이면 최상위 수준입니다"
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
        <ChartCard
          title="월별 DSO 추세"
          formula="DSO(일) = 해당월 추정 미수금 ÷ 3개월 이동평균 매출 × 30\n미수금은 월별 매출 비중으로 배분하여 추정"
          description="월별 DSO 변화를 보여줍니다. DSO가 지속적으로 상승하면 채권 회수가 느려지고 있다는 신호이며, 하락하면 회수가 개선되고 있다는 의미입니다."
          benchmark="DSO 추세가 3개월 연속 상승하면 즉각적인 수금 관리 강화가 필요합니다"
        >
          <ChartContainer height="h-64 md:h-80">
              <ComposedChart data={dsoTrend}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
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
        <ChartCard
          title="월별 수금율 추세"
          formula="수금율(%) = 월별 수금액 ÷ 월별 매출액 × 100"
          description="매월 매출 대비 수금 비율의 변화를 보여줍니다. 수금율이 100% 이상이면 이전 미수금까지 회수하고 있다는 뜻이고, 100% 미만이면 미수금이 쌓이고 있다는 의미입니다."
          benchmark="수금율이 90% 이상이면 양호, 80% 미만이면 채권 관리 강화가 필요합니다"
        >
          <ChartContainer height="h-64 md:h-80">
              <ComposedChart data={collectionRateTrend}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
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

      <ChartCard
        title="조직별 CCC(현금순환주기) 상세 분석"
        formula="CCC = DSO(매출채권 회수기간) - DPO(매입채무 지급기간)\nDSO: 매출 후 현금 회수까지 걸리는 일수\nDPO: 구매 후 대금 지급까지 걸리는 일수 (추정값)\n재고 보유기간(DIO)은 데이터 부재로 0일 적용"
        description="조직별 현금순환주기를 보여줍니다. CCC(현금순환주기)가 음수이면 물건 대금을 지급하기 전에 매출 대금을 먼저 회수하는 우수한 상태입니다."
        benchmark="CCC가 0일 미만이면 우수, 30일 이내이면 양호합니다"
        action={<ExportButton data={cccExportData} fileName="CCC분석" />}
      >
        <DataTable
          data={cccMetrics}
          columns={cccColumns}
          searchPlaceholder="조직 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
