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
} from "recharts";
import { Users, AlertTriangle, Target, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { DataTable } from "@/components/dashboard/DataTable";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { PersonPortfolio, PersonHealthData, CustomerRepDetail } from "@/lib/analysis/receivableInsight";

interface PersonInsightTabProps {
  portfolio: PersonPortfolio[];
  healthData: PersonHealthData[];
  customerRepDetail: CustomerRepDetail[];
}

const GRADE_COLORS: Record<string, string> = {
  A: "hsl(142, 71%, 45%)",  // green
  B: "hsl(217, 91%, 60%)",  // blue
  C: "hsl(45, 93%, 47%)",   // yellow
  D: "hsl(0, 84%, 60%)",    // red
};

const RISK_BADGE_MAP: Record<string, { variant: "destructive" | "warning" | "success"; label: string }> = {
  high: { variant: "destructive", label: "고위험" },
  medium: { variant: "warning", label: "주의" },
  low: { variant: "success", label: "양호" },
};

export function PersonInsightTab({ portfolio, healthData, customerRepDetail }: PersonInsightTabProps) {
  // KPI 계산
  const personCount = portfolio.length;
  const avgCustomerCount = personCount > 0
    ? Math.round(portfolio.reduce((s, p) => s + p.customerCount, 0) / personCount * 10) / 10
    : 0;
  const highRiskPersonCount = portfolio.filter((p) => p.highRiskCount > 0).length;
  const concentratedCount = portfolio.filter((p) => p.hhi > 0.25).length;

  // 수금 효율 랭킹 데이터 (상위 15명)
  const efficiencyData = useMemo(
    () =>
      [...portfolio]
        .sort((a, b) => b.normalRatio - a.normalRatio)
        .slice(0, 15)
        .reverse(),
    [portfolio]
  );

  // 건전성 차트 (상위 15명)
  const healthTop15 = useMemo(() => healthData.slice(0, 15).reverse(), [healthData]);

  // 거래처×담당자 테이블 컬럼
  const detailColumns = useMemo<ColumnDef<CustomerRepDetail, any>[]>(
    () => [
      {
        accessorKey: "customerName",
        header: "거래처",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[160px] block" title={getValue<string>()}>
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "person",
        header: "담당자",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[80px] block">{getValue<string>() || "-"}</span>
        ),
      },
      {
        accessorKey: "org",
        header: "조직",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[64px] block">{getValue<string>() || "-"}</span>
        ),
      },
      {
        accessorKey: "totalReceivable",
        header: () => <span className="block text-right">미수금</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "overdueRatio",
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
          const info = RISK_BADGE_MAP[grade] || RISK_BADGE_MAP.low;
          return <Badge variant={info.variant}>{info.label}</Badge>;
        },
      },
      {
        accessorKey: "creditUsage",
        header: () => <span className="block text-right">여신사용률</span>,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          if (!v || !isFinite(v)) return <span className="block text-right text-muted-foreground">-</span>;
          return (
            <span className={`block text-right tabular-nums ${v >= 100 ? "text-red-500 font-semibold" : v >= 80 ? "text-amber-500" : ""}`}>
              {v.toFixed(1)}%
            </span>
          );
        },
      },
    ],
    []
  );

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="분석 대상 담당자"
          value={personCount}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="미수금 잔액을 보유한 고유 영업담당자 수"
          description="현재 미수금 관리 책임이 있는 영업담당자 수입니다."
        />
        <KpiCard
          title="1인당 평균 거래처"
          value={avgCustomerCount}
          format="number"
          icon={<Target className="h-5 w-5" />}
          formula="전체 관리 거래처 수 ÷ 담당자 수"
          description="담당자 1인당 관리하는 미수금 거래처 수의 평균입니다. 높을수록 업무 부하가 큽니다."
          benchmark="1인당 10개 이상이면 관리 품질 저하 우려"
        />
        <KpiCard
          title="고위험 보유 담당자"
          value={highRiskPersonCount}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="고위험 등급 거래처를 1개 이상 보유한 담당자 수"
          description="고위험 거래처를 관리 중인 담당자 수입니다. 이 담당자들에 대한 집중 모니터링이 필요합니다."
          benchmark="0명이 이상적이며, 발생 시 즉시 수금 계획 수립"
        />
        <KpiCard
          title="미수금 과집중 담당자"
          value={concentratedCount}
          format="number"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="HHI(허핀달-허쉬만 지수) > 0.25인 담당자 수"
          description="미수금이 소수 거래처에 과도하게 집중된 담당자 수입니다. 해당 거래처 부도 시 큰 손실 위험이 있습니다."
          benchmark="HHI 0.25 이상은 과집중, 0.15 이하가 이상적"
        />
      </div>

      {/* Chart 1: 담당자별 미수금 건전성 (100% Stacked Horizontal Bar) */}
      <ChartCard
        title="담당자별 미수금 건전성"
        formula="정상(1~2개월, 녹색) / 주의(3~5개월, 노랑) / 연체(6개월+, 빨강) 비율"
        description="담당자별 미수금의 연령 구성을 비교합니다. 빨간 영역이 넓은 담당자는 수금 관리가 시급합니다."
        benchmark="정상 비율 80% 이상이 우수, 연체 비율 20% 이상이면 경고"
      >
        <ChartContainer height="h-80 md:h-[500px]">
          <BarChart data={healthTop15} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${v}%`} />
            <YAxis type="category" dataKey="person" tick={{ fontSize: 10 }} width={55} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}%`, name]}
            />
            <Bar dataKey="normalPct" stackId="stack" fill="hsl(142, 71%, 45%)" name="정상 (1~2개월)" {...ANIMATION_CONFIG} />
            <Bar dataKey="cautionPct" stackId="stack" fill="hsl(45, 93%, 47%)" name="주의 (3~5개월)" {...ANIMATION_CONFIG} />
            <Bar dataKey="overduePct" stackId="stack" fill="hsl(0, 84%, 60%)" name="연체 (6개월+)" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* Chart 2: 수금 효율 랭킹 (Horizontal Bar) */}
      <ChartCard
        title="담당자별 수금 효율 랭킹"
        formula="정상비율 = (1~2개월 미수금) ÷ 총 미수금 × 100\n등급: A(80%+) B(60%+) C(40%+) D(40%미만)"
        description="정상 비율이 높을수록 수금 관리가 우수합니다. 등급별 색상으로 한눈에 효율성을 비교할 수 있습니다."
        benchmark="A등급(80%+)이 전체의 50% 이상이면 양호"
      >
        <ChartContainer height="h-80 md:h-[500px]">
          <BarChart data={efficiencyData} layout="vertical" margin={{ left: 60, right: 30 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v: any) => `${v}%`} />
            <YAxis type="category" dataKey="person" tick={{ fontSize: 10 }} width={55} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "정상비율"]}
            />
            <Bar dataKey="normalRatio" name="정상비율" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
              {efficiencyData.map((entry, idx) => (
                <Cell key={idx} fill={GRADE_COLORS[entry.efficiencyGrade] || GRADE_COLORS.D} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* Table: 거래처×담당자 상세 */}
      <ChartCard
        title="거래처×담당자 상세"
        formula="거래처별 미수금에 담당자·조직·리스크 등급·여신사용률을 결합한 통합 뷰"
        description="특정 담당자 또는 거래처를 검색하여 미수금 현황과 리스크를 상세 확인할 수 있습니다."
      >
        <DataTable
          data={customerRepDetail}
          columns={detailColumns}
          searchPlaceholder="거래처 또는 담당자 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
