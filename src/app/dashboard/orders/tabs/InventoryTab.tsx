"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG } from "@/components/charts";
import { Package, RefreshCw, AlertTriangle, Clock } from "lucide-react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatNumber, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcInventoryTurnover,
  calcMonthlyMovement,
  calcSlowMoving,
  calcDIO,
} from "@/lib/analysis/inventoryAnalysis";
import type { InventoryMovementRecord } from "@/types";

interface InventoryTabProps {
  data: InventoryMovementRecord[];
  isDateFiltered?: boolean;
}

export function InventoryTab({ data, isDateFiltered }: InventoryTabProps) {
  const hasMonthData = data.some((r) => r.month);

  const turnover = useMemo(() => calcInventoryTurnover(data), [data]);
  const monthlyMovement = useMemo(() => calcMonthlyMovement(data), [data]);
  const slowMoving = useMemo(() => calcSlowMoving(data), [data]);
  const dioResults = useMemo(() => calcDIO(data), [data]);

  // KPI 계산
  const totalClosing = useMemo(
    () => data.reduce((s, r) => s + r.기말, 0),
    [data]
  );
  const avgTurnover = useMemo(() => {
    const valid = turnover.filter((t) => t.turnoverRate > 0);
    return valid.length > 0
      ? valid.reduce((s, t) => s + t.turnoverRate, 0) / valid.length
      : 0;
  }, [turnover]);
  const avgDIO = useMemo(() => {
    const valid = dioResults.filter((d) => d.dio > 0);
    return valid.length > 0
      ? Math.round(valid.reduce((s, d) => s + d.dio, 0) / valid.length)
      : 0;
  }, [dioResults]);

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

  // Top/Bottom 회전율 테이블
  const topTurnover = useMemo(() => turnover.slice(0, 10), [turnover]);
  const bottomTurnover = useMemo(
    () =>
      [...turnover]
        .filter((t) => t.avgInventory > 0)
        .sort((a, b) => a.turnoverRate - b.turnoverRate)
        .slice(0, 10),
    [turnover]
  );

  if (data.length === 0) return <EmptyState message="수불현황 데이터를 업로드해 주세요." />;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 기말재고 수량"
          value={totalClosing}
          format="number"
          icon={<Package className="h-5 w-5" />}
          formula="전 공장 기말재고 합계 (필터 기간 마지막 월 기준)"
        />
        <KpiCard
          title="평균 재고회전율"
          value={Math.round(avgTurnover * 10) / 10}
          format="number"
          icon={<RefreshCw className="h-5 w-5" />}
          formula="회전율 = 총 출고 ÷ 평균재고. 높을수록 재고가 빨리 소진"
          benchmark="제조업 평균 6~12회. 업종에 따라 차이"
        />
        <KpiCard
          title="장기재고 품목"
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
          formula="DIO = 평균재고 ÷ 일일출고 (수량 기반)"
          benchmark="30~60일이 일반적. 업종별 차이"
        />
      </div>

      {hasMonthData && monthlyChartData.length > 1 && (
        <ChartCard
          title="월별 입출고 추이"
          formula="각 월별 시트에서 집계된 전 공장 입고·출고·기말재고 수량"
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="재고회전율 Top 10"
          formula="회전율 = 총 출고 ÷ 평균재고"
          description="회전율이 높은 품목일수록 빠르게 소진되어 재고 효율이 좋습니다."
        >
          <DataTable
            columns={[
              { header: "공장", accessorKey: "factory" },
              { header: "품목명", accessorKey: "품목명" },
              { header: "평균재고", accessorKey: "avgInventory", cell: (info: any) => formatNumber(Math.round(info.getValue())) },
              { header: "총출고", accessorKey: "totalOut", cell: (info: any) => formatNumber(info.getValue()) },
              { header: "회전율", accessorKey: "turnoverRate", cell: (info: any) => Number(info.getValue()).toFixed(1) },
            ]}
            data={topTurnover}
            defaultPageSize={10}
          />
        </ChartCard>

        <ChartCard
          title="재고회전율 Bottom 10"
          formula="회전율이 낮은 품목은 재고 체류 기간이 길어 자금이 묶입니다"
          description="회전율이 0에 가까운 품목은 장기재고 또는 사장재고 위험이 있습니다."
        >
          <DataTable
            columns={[
              { header: "공장", accessorKey: "factory" },
              { header: "품목명", accessorKey: "품목명" },
              { header: "평균재고", accessorKey: "avgInventory", cell: (info: any) => formatNumber(Math.round(info.getValue())) },
              { header: "총출고", accessorKey: "totalOut", cell: (info: any) => formatNumber(info.getValue()) },
              { header: "회전율", accessorKey: "turnoverRate", cell: (info: any) => Number(info.getValue()).toFixed(1) },
            ]}
            data={bottomTurnover}
            defaultPageSize={10}
          />
        </ChartCard>
      </div>

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
              { header: "기말재고", accessorKey: "기말재고", cell: (info: any) => formatNumber(info.getValue()) },
              { header: "무출고 월수", accessorKey: "zeroOutMonths", cell: (info: any) => `${info.getValue()}개월` },
              { header: "마지막 출고", accessorKey: "lastOutMonth" },
            ]}
            data={slowMoving.slice(0, 20)}
            defaultPageSize={10}
          />
        </ChartCard>
      )}
    </>
  );
}
