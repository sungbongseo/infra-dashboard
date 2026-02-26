"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
  LabelList,
} from "recharts";
import { AlertTriangle, TrendingDown, Building2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { DataTable } from "@/components/dashboard/DataTable";
import { formatCurrency, formatPercent, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { LongTermSummary, LongTermCustomer, LongTermByOrg, BadDebtProvision } from "@/lib/analysis/longTermReceivable";

interface LongTermTabProps {
  summary: LongTermSummary;
  customers: LongTermCustomer[];
  byOrg: LongTermByOrg[];
  provision: BadDebtProvision[];
}

export function LongTermTab({ summary, customers, byOrg, provision }: LongTermTabProps) {
  // 차트 1: 장기 미수 거래처 Top 15 (Stacked Horizontal Bar)
  const topCustomers = useMemo(
    () =>
      customers.slice(0, 15).map((c) => ({
        name: c.판매처명 || c.판매처,
        "6개월": c.month6금액,
        "6개월+": c.overdue금액,
      })),
    [customers]
  );

  // 차트 2: 조직별 장기 미수 (ComposedChart)
  const orgChartData = useMemo(
    () =>
      byOrg.map((o) => ({
        org: o.org,
        "6개월": o.month6,
        "6개월+": o.overdue,
        "장기비중": Number(o.longTermRatio.toFixed(1)),
      })),
    [byOrg]
  );

  // 차트 3: 대손충당금 (Grouped Bar)
  const provisionData = useMemo(
    () =>
      provision.map((p) => ({
        bucket: p.bucket,
        원금: p.원금,
        충당금: p.충당금,
        충당률Label: `${(p.충당률 * 100).toFixed(0)}%`,
      })),
    [provision]
  );

  // 테이블 컬럼
  const columns = useMemo<ColumnDef<LongTermCustomer, any>[]>(
    () => [
      {
        accessorKey: "판매처명",
        header: "거래처",
        cell: ({ row }) => (
          <span className="truncate max-w-[140px] block" title={row.original.판매처명}>
            {row.original.판매처명 || row.original.판매처}
          </span>
        ),
      },
      {
        accessorKey: "담당자",
        header: "담당자",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[70px] block" title={getValue<string>()}>
            {getValue<string>() || "-"}
          </span>
        ),
      },
      {
        accessorKey: "영업조직",
        header: "조직",
        cell: ({ getValue }) => (
          <span className="truncate max-w-[60px] block" title={getValue<string>()}>
            {getValue<string>() || "-"}
          </span>
        ),
      },
      {
        accessorKey: "month6금액",
        header: () => <span className="block text-right">6개월</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums text-xs text-amber-600 dark:text-amber-400">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "overdue금액",
        header: () => <span className="block text-right">6개월+</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums text-xs text-red-600 dark:text-red-400 font-medium">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "장기미수합계",
        header: () => <span className="block text-right">장기합계</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums font-medium">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "장기비중",
        header: () => <span className="block text-right">비중</span>,
        cell: ({ getValue }) => (
          <span className={`block text-right tabular-nums text-xs ${getValue<number>() > 50 ? "text-red-600 dark:text-red-400" : ""}`}>
            {formatPercent(getValue<number>())}
          </span>
        ),
      },
      {
        accessorKey: "대손추정액",
        header: () => <span className="block text-right">대손추정</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums text-xs text-red-500 dark:text-red-400">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "riskGrade",
        header: "리스크",
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
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="장기 미수 총액"
          value={summary.longTermTotal}
          format="currency"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="Σ(6개월 장부금액 + 6개월 초과 장부금액)"
          description="151일(6개월차) 이상 장기 체류 중인 미수채권 총액입니다. K-IFRS 1109호에 따라 대손충당금 설정을 검토해야 합니다."
          benchmark="총 미수금의 10% 미만이면 양호, 20% 이상이면 집중 관리 필요"
        />
        <KpiCard
          title="장기 미수 비중"
          value={summary.longTermRatio}
          format="percent"
          icon={<TrendingDown className="h-5 w-5" />}
          formula="장기 미수 총액 / 전체 미수금 × 100"
          description="전체 미수금에서 장기(6개월 이상) 미수금이 차지하는 비율입니다."
          benchmark="10% 미만이 양호, 20% 이상이면 대손 위험 증가"
        />
        <KpiCard
          title="대손충당금 추정액"
          value={summary.totalProvision}
          format="currency"
          icon={<Building2 className="h-5 w-5" />}
          formula="91~120일×1% + 121~150일×5% + 151~180일×10% + 180일+×50%"
          description="SAP FI 간편법 기준 대손충당금 추정액입니다. 실제 충당금은 개별 심사 결과에 따라 달라질 수 있습니다."
          benchmark="총 미수금의 3% 이내이면 양호"
        />
        <KpiCard
          title="장기 미수 거래처"
          value={summary.longTermCustomerCount}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="6개월 + 6개월 초과 장부금액 > 0인 고유 거래처(판매처) 수"
          description="151일 이상 장기 미수금이 존재하는 거래처 수입니다."
          benchmark="0건이 이상적이며, 거래처별 개별 회수 계획 수립 필요"
        />
      </div>

      {/* 차트 1: 장기 미수 거래처 Top 15 */}
      <ChartCard
        title="장기 미수 거래처 Top 15"
        formula="6개월 + 6개월 초과 미수금 합계가 큰 순서로 상위 15개 거래처"
        description="장기 미수금이 가장 많은 거래처 15곳입니다. 주황색은 6개월차, 빨간색은 6개월 초과 미수금입니다."
        benchmark="개별 거래처의 장기 미수가 전체의 20% 이상이면 집중 관리"
      >
        <ChartContainer height="h-80 md:h-[500px]">
          <BarChart data={topCustomers} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
            <Legend />
            <Bar dataKey="6개월" stackId="a" fill="hsl(38, 92%, 50%)" {...ANIMATION_CONFIG} />
            <Bar dataKey="6개월+" stackId="a" fill="hsl(0, 84%, 40%)" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 차트 2: 조직별 장기 미수 구성 (ComposedChart) */}
      <ChartCard
        title="조직별 장기 미수 구성"
        formula="조직별 6개월 + 6개월 초과 미수금 누적 + 장기비중 라인"
        description="조직별 장기 미수금 구성과 전체 미수금 대비 장기 비중을 보여줍니다. 비중이 10%를 초과하면 해당 조직의 채권 관리를 강화해야 합니다."
        benchmark="장기비중 10% 기준선 초과 조직은 집중 관리 대상"
      >
        <ChartContainer height="h-72 md:h-96">
          <ComposedChart data={orgChartData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="org" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                if (name === "장기비중") return [`${Number(value).toFixed(1)}%`, name];
                return [formatCurrency(Number(value)), name];
              }}
            />
            <Legend />
            <ReferenceLine yAxisId="right" y={10} stroke="hsl(0, 70%, 55%)" strokeDasharray="5 5" label={{ value: "10%", position: "right", fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="6개월" stackId="a" fill="hsl(38, 92%, 50%)" {...ANIMATION_CONFIG} />
            <Bar yAxisId="left" dataKey="6개월+" stackId="a" fill="hsl(0, 84%, 40%)" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            <Line yAxisId="right" type="monotone" dataKey="장기비중" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {/* 차트 3: 대손충당금 추정 구성 (Grouped Bar) */}
      <ChartCard
        title="대손충당금 추정 구성"
        formula="91~120일: 1%, 121~150일: 5%, 151~180일: 10%, 180일+: 50%"
        description="K-IFRS 1109호 SAP FI 간편법 기준으로 연체 기간별 원금과 추정 대손충당금을 비교합니다."
        benchmark="충당금이 총 미수금의 3% 이내이면 양호"
      >
        <ChartContainer height="h-72 md:h-96">
          <BarChart data={provisionData}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
            />
            <Legend />
            <Bar dataKey="원금" fill="hsl(221, 83%, 75%)" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
              <LabelList dataKey="충당률Label" position="top" fontSize={11} fill="hsl(0, 70%, 55%)" />
            </Bar>
            <Bar dataKey="충당금" fill="hsl(0, 70%, 55%)" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 테이블: 장기 미수 거래처 목록 */}
      <ChartCard
        title="장기 미수 거래처 목록"
        description="6개월 이상 장기 미수금이 있는 거래처 목록입니다. 대손추정액은 SAP FI 간편법 충당률 기준입니다."
      >
        <DataTable
          data={customers}
          columns={columns}
          searchPlaceholder="거래처/담당자 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
