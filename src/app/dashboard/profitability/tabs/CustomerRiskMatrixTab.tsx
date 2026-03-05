"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, ReferenceLine, LabelList,
} from "recharts";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { Star, AlertTriangle, TrendingUp, XCircle } from "lucide-react";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcCustomerRiskMatrix,
  calcCustomerRiskSummary,
  type CustomerRiskEntry,
} from "@/lib/analysis/customerRiskMatrix";
import type { OrgCustomerProfitRecord, ReceivableAgingRecord } from "@/types";
import type { ColumnDef } from "@tanstack/react-table";

interface CustomerRiskMatrixTabProps {
  orgCustomerProfit: OrgCustomerProfitRecord[];
  receivableAging: ReceivableAgingRecord[];
  isDateFiltered?: boolean;
}

const QUADRANT_COLORS: Record<string, string> = {
  star: "hsl(145, 60%, 42%)",
  risk: "hsl(38, 92%, 50%)",
  improve: "hsl(217, 91%, 60%)",
  exit: "hsl(0, 65%, 55%)",
};

const QUADRANT_LABELS: Record<string, string> = {
  star: "핵심 유지",
  risk: "수금 관리",
  improve: "마진 개선",
  exit: "거래 축소",
};

export function CustomerRiskMatrixTab({
  orgCustomerProfit,
  receivableAging,
  isDateFiltered,
}: CustomerRiskMatrixTabProps) {
  const matrix = useMemo(
    () => calcCustomerRiskMatrix(orgCustomerProfit, receivableAging),
    [orgCustomerProfit, receivableAging]
  );

  const summary = useMemo(
    () => calcCustomerRiskSummary(matrix),
    [matrix]
  );

  const scatterData = useMemo(
    () => matrix.map((e) => ({
      name: truncateLabel(e.거래처, 8),
      fullName: e.거래처,
      x: e.영업이익율,
      y: e.장기미수율,
      z: Math.max(Math.abs(e.매출액), 1),
      quadrant: e.quadrant,
      org: e.영업조직팀,
      sales: e.매출액,
      receivable: e.미수금잔액,
    })),
    [matrix]
  );

  const riskCustomers = useMemo(
    () => matrix
      .filter((e) => e.quadrant === "risk" || e.quadrant === "exit")
      .sort((a, b) => b.미수금잔액 - a.미수금잔액),
    [matrix]
  );

  const columns: ColumnDef<CustomerRiskEntry, any>[] = useMemo(() => [
    { accessorKey: "거래처", header: "거래처", size: 150 },
    { accessorKey: "영업조직팀", header: "조직", size: 100 },
    {
      accessorKey: "매출액", header: "매출액",
      cell: ({ getValue }: any) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: "영업이익율", header: "영업이익율(%)",
      cell: ({ getValue }: any) => {
        const v = getValue() as number;
        return <span className={v >= 0 ? "text-green-600" : "text-red-600"}>{isFinite(v) ? v.toFixed(1) : "0"}%</span>;
      },
    },
    {
      accessorKey: "미수금잔액", header: "미수금잔액",
      cell: ({ getValue }: any) => formatCurrency(getValue() as number),
    },
    {
      accessorKey: "장기미수율", header: "장기미수율(%)",
      cell: ({ getValue }: any) => {
        const v = getValue() as number;
        return <span className={v > 30 ? "text-red-600" : v > 15 ? "text-amber-600" : ""}>{isFinite(v) ? v.toFixed(1) : "0"}%</span>;
      },
    },
    {
      accessorKey: "quadrant", header: "분류",
      cell: ({ getValue }: any) => {
        const q = getValue() as string;
        return (
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ backgroundColor: QUADRANT_COLORS[q] + "22", color: QUADRANT_COLORS[q] }}
          >
            {QUADRANT_LABELS[q] || q}
          </span>
        );
      },
    },
  ], []);

  if (matrix.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* 4사분면 요약 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="핵심 유지 (Star)"
          value={summary.star.count}
          format="number"
          icon={<Star className="h-5 w-5 text-green-600" />}
          description={`고수익-저리스크 거래처 ${summary.star.count}개. 매출 합계 ${formatCurrency(summary.star.totalSales)}, 평균 이익율 ${isFinite(summary.star.avgProfitRate) ? summary.star.avgProfitRate.toFixed(1) : "0"}%`}
          formula="영업이익율 > 중앙값 AND 장기미수율 ≤ 중앙값"
          benchmark="전체 거래처의 30% 이상이 Star이면 건전한 포트폴리오"
          reason="핵심 우량 거래처를 식별하여 관계 유지 및 거래 확대 전략을 수립합니다"
        />
        <KpiCard
          title="수금 관리 (Risk)"
          value={summary.risk.count}
          format="number"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          description={`고수익-고리스크 거래처 ${summary.risk.count}개. 수익은 좋지만 수금 지연이 우려됩니다. 매출 ${formatCurrency(summary.risk.totalSales)}`}
          formula="영업이익율 > 중앙값 AND 장기미수율 > 중앙값"
          benchmark="이 그룹의 수금 주기를 단축하면 CCC 개선에 큰 효과"
          reason="수익성은 높지만 미수금 리스크가 있는 거래처의 수금 관리를 강화합니다"
        />
        <KpiCard
          title="마진 개선 (Improve)"
          value={summary.improve.count}
          format="number"
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
          description={`저수익-저리스크 거래처 ${summary.improve.count}개. 수금은 양호하나 마진 개선이 필요. 매출 ${formatCurrency(summary.improve.totalSales)}`}
          formula="영업이익율 ≤ 중앙값 AND 장기미수율 ≤ 중앙값"
          benchmark="가격 재협상이나 원가 절감으로 Star 그룹 전환 가능성 높음"
          reason="수금 리스크는 낮으나 수익성이 부족한 거래처의 마진 개선 방안을 모색합니다"
        />
        <KpiCard
          title="거래 축소 (Exit)"
          value={summary.exit.count}
          format="number"
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          description={`저수익-고리스크 거래처 ${summary.exit.count}개. 수익도 낮고 미수금 리스크도 높아 거래 조건 재검토 필요. 매출 ${formatCurrency(summary.exit.totalSales)}`}
          formula="영업이익율 ≤ 중앙값 AND 장기미수율 > 중앙값"
          benchmark="이 그룹이 전체 매출의 20% 이상이면 포트폴리오 리스크 심각"
          reason="수익성과 수금 모두 부진한 거래처를 식별하여 거래 조건 강화 또는 축소를 검토합니다"
        />
      </div>

      {/* 4사분면 ScatterChart */}
      <ChartCard
        title="거래처 수익성 × 미수금 리스크 매트릭스"
        isEmpty={scatterData.length === 0}
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="X축: 영업이익율(%), Y축: 장기미수율(%), 버블 크기: 매출 규모. 기준선: 각 축의 중앙값"
        description="각 거래처를 수익성(X축)과 미수금 리스크(Y축)의 2차원 공간에 배치합니다. 오른쪽 아래(고수익-저리스크)가 이상적이며, 왼쪽 위(저수익-고리스크)는 거래 재검토 대상입니다. 점선은 전체 거래처의 중앙값 기준선입니다."
        benchmark="Star(초록) 비중이 높을수록 건전한 거래처 포트폴리오. Exit(빨강) 거래처는 매출의 10% 미만으로 관리"
        reason="거래처별 수익성과 미수금 리스크를 동시에 평가하여 전략적 거래처 관리 의사결정을 지원합니다"
      >
        <ChartContainer minHeight={560}>
          <ScatterChart margin={{ top: 30, right: 40, left: 40, bottom: 65 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              type="number"
              dataKey="x"
              name="영업이익율"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
              label={{ value: "← 저수익  |  영업이익율(%)  |  고수익 →", position: "bottom", offset: 0, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="장기미수율"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
              label={{ value: "← 저리스크  |  장기미수율(%)  |  고리스크 →", angle: -90, position: "insideLeft", offset: -20, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <ZAxis type="number" dataKey="z" range={[40, 400]} name="매출규모" />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              content={({ active, payload }: any) => {
                if (!active || !payload?.[0]) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                    <p className="font-semibold">{d.fullName}</p>
                    <p className="text-muted-foreground">{d.org}</p>
                    <p>영업이익율: {isFinite(d.x) ? d.x.toFixed(1) : "0"}%</p>
                    <p>장기미수율: {isFinite(d.y) ? d.y.toFixed(1) : "0"}%</p>
                    <p>매출: {formatCurrency(d.sales)}</p>
                    <p>미수금: {formatCurrency(d.receivable)}</p>
                    <p>
                      분류:{" "}
                      <span style={{ color: QUADRANT_COLORS[d.quadrant] }}>
                        {QUADRANT_LABELS[d.quadrant]}
                      </span>
                    </p>
                  </div>
                );
              }}
            />
            <ReferenceLine
              x={summary.medianProfitRate}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{ value: `이익율 중앙값 ${isFinite(summary.medianProfitRate) ? summary.medianProfitRate.toFixed(1) : "0"}%`, fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
            />
            <ReferenceLine
              y={summary.medianAgingRate}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              label={{ value: `미수율 중앙값 ${isFinite(summary.medianAgingRate) ? summary.medianAgingRate.toFixed(1) : "0"}%`, fontSize: 9, fill: "hsl(var(--muted-foreground))", position: "right" }}
            />
            <Scatter data={scatterData} {...ANIMATION_CONFIG}>
              {scatterData.map((entry, idx) => (
                <Cell key={idx} fill={QUADRANT_COLORS[entry.quadrant]} fillOpacity={0.7} />
              ))}
              {scatterData.length <= 30 && (
                <LabelList dataKey="name" position="top" fontSize={8} offset={6} />
              )}
            </Scatter>
          </ScatterChart>
        </ChartContainer>
      </ChartCard>

      {/* 리스크 관리 대상 거래처 */}
      {riskCustomers.length > 0 && (
        <ChartCard
          title="리스크 관리 대상 거래처"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="고리스크 사분면(수금관리 + 거래축소) 거래처를 미수금잔액 내림차순으로 정렬"
          description="수금 관리 또는 거래 축소 대상으로 분류된 거래처 목록입니다. 미수금 잔액이 큰 순서대로 정렬되어, 우선 관리가 필요한 거래처를 빠르게 식별할 수 있습니다."
          benchmark="상위 5개 거래처의 미수금이 전체의 50% 이상이면 집중 관리 필요"
          reason="리스크 거래처 목록을 기반으로 수금 독촉, 여신한도 조정, 거래 조건 재협상 등 구체적 액션 플랜을 수립합니다"
        >
          <DataTable
            data={riskCustomers}
            columns={columns}
            searchPlaceholder="거래처 검색..."
            defaultPageSize={15}
          />
        </ChartCard>
      )}
    </>
  );
}
