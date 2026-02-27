"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Users, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { DataTable } from "@/components/dashboard/DataTable";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { AgingRiskAssessment } from "@/types";
import type { AgingSummary } from "@/lib/analysis/aging";

type AgingByPerson = { person: string } & AgingSummary;

interface RiskTabProps {
  byPerson: AgingByPerson[];
  risks: AgingRiskAssessment[];
  highRiskCount: number;
  mediumRiskCount: number;
  isDateFiltered?: boolean;
}

export function RiskTab({ byPerson, risks, highRiskCount, mediumRiskCount, isDateFiltered }: RiskTabProps) {
  const riskColumns = useMemo<ColumnDef<AgingRiskAssessment, any>[]>(
    () => [
      {
        accessorKey: "판매처명",
        header: "거래처",
        cell: ({ row }) => (
          <span className="truncate max-w-[180px] block" title={row.original.판매처명}>
            {row.original.판매처명 || row.original.판매처}
          </span>
        ),
      },
      {
        accessorKey: "담당자",
        header: "담당자",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[80px] block" title={getValue<string>()}>
            {getValue<string>() || "-"}
          </span>
        ),
      },
      {
        accessorKey: "영업조직",
        header: "조직",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[64px] block" title={getValue<string>()}>
            {getValue<string>() || "-"}
          </span>
        ),
      },
      {
        accessorKey: "총미수금",
        header: () => <span className="block text-right">미수금</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "연체비율",
        header: () => <span className="block text-right">연체비율</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {(isFinite(getValue<number>()) ? getValue<number>() : 0).toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: "riskGrade",
        header: "등급",
        cell: ({ getValue }) => {
          const grade = getValue<string>();
          return (
            <Badge
              variant={
                grade === "high"
                  ? "destructive"
                  : grade === "medium"
                  ? "warning"
                  : "success"
              }
            >
              {grade === "high" ? "고위험" : grade === "medium" ? "주의" : "양호"}
            </Badge>
          );
        },
      },
    ],
    []
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="담당자 수"
          value={byPerson.length}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="미수금 잔액이 있는 고유 영업담당자 수 합계"
          description="현재 미수금을 보유하고 있는 영업담당자 수입니다. 미수금이 특정 담당자에 집중되어 있는지 확인할 필요가 있습니다."
          benchmark="미수금이 상위 20% 담당자에 집중되어 있다면 업무 분산 또는 집중 관리 검토"
          reason="담당자별 미수금 분포를 파악하여 업무 부하 불균형과 인력 리스크를 사전에 관리합니다."
        />
        <KpiCard
          title="주의 거래처"
          value={mediumRiskCount}
          format="number"
          formula="연체비율 30~50% 또는 3개월 이상 미수금 5천만원 초과인 거래처 수"
          description="아직 고위험은 아니지만 관심이 필요한 거래처 수입니다. 방치하면 고위험으로 악화될 수 있으므로 선제적인 관리가 중요합니다."
          benchmark="주의 거래처가 전체의 10% 이상이면 연체 관리 프로세스 강화 필요"
          reason="주의 등급 거래처를 조기에 포착하여 고위험으로 악화되기 전에 선제적 회수 활동을 전개합니다."
        />
        <KpiCard
          title="고위험 거래처"
          value={highRiskCount}
          format="number"
          icon={<Shield className="h-5 w-5" />}
          formula="연체비율 50% 초과 또는 6개월 이상 미수금 1억원 초과인 거래처 수"
          description="채권 회수가 어려울 가능성이 높아 즉각적인 추심 조치가 필요한 거래처 수입니다."
          benchmark="0건이 이상적이며, 발생 시 즉시 대응 계획을 수립해야 합니다"
          reason="고위험 거래처 수를 실시간 추적하여 대손 손실을 최소화하고, 즉각적인 추심 및 법적 조치 여부를 판단합니다."
        />
        <KpiCard
          title="리스크 평가 대상"
          value={risks.length}
          format="number"
          formula="미수금 연체 데이터에서 거래처별 리스크 등급을 산정한 전체 대상 수"
          description="미수금 연체 상황에 따라 리스크 등급(양호/주의/고위험)이 분류된 전체 거래처 수입니다."
          benchmark="전체 거래처 대비 평가 대상 비율이 높을수록 채권 관리 범위가 넓다는 의미"
          reason="리스크 평가 커버리지를 확인하여 관리 사각지대 없이 전체 거래처의 채권 건전성을 통제합니다."
        />
      </div>

      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="담당자별 미수금 현황"
        formula="영업담당자별 미수금 합계를 구한 뒤 상위 15명을 표시"
        description="미수금이 가장 많은 영업담당자 상위 15명입니다. 특정 담당자에 미수금이 지나치게 몰려 있다면 해당 담당자의 거래처 관리를 강화해야 합니다."
        benchmark="1인당 미수금이 전체의 20% 이상이면 집중도가 과도한 상태입니다"
        reason="담당자별 미수금 집중도를 파악하여 인력 리스크와 회수 책임 분산 여부를 진단합니다."
      >
        <ChartContainer height="h-80 md:h-[500px]">
            <BarChart data={byPerson.slice(0, 15)} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis type="category" dataKey="person" tick={{ fontSize: 10 }} width={55} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
              <Bar dataKey="total" fill="hsl(24.6, 95%, 53.1%)" name="미수금" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="리스크 등급 현황"
        formula="고위험: 연체비율 50% 초과 또는 6개월 이상 1억 초과\n주의: 연체비율 30~50% 또는 3개월 이상 5천만 초과\n양호: 위 조건에 해당하지 않는 거래처"
        description="거래처별 미수금 잔액과 연령(aging) 분포를 보여줍니다. 미수금이 특정 거래처에 집중되면 회수 실패 시 큰 손실 위험이 있어 분산 관리가 필요합니다."
        benchmark="단일 거래처 미수금이 전체의 20% 이상이면 집중 관리"
        reason="리스크 등급별 거래처 분포를 분석하여 대손 가능성이 높은 채권을 조기 식별하고, 등급별 차등 회수 전략을 수립합니다."
      >
        <DataTable
          data={risks}
          columns={riskColumns}
          searchPlaceholder="거래처 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
