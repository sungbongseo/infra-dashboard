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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { FileText, Globe, Building2, Clock } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG, PieOuterLabel } from "@/components/charts";
import { DataTable } from "@/components/dashboard/DataTable";
import { formatCurrency, formatPercent, TOOLTIP_STYLE, CHART_COLORS } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { CustomerAgingProfile, CurrencyExposure, OrgInvoiceBookGap } from "@/lib/analysis/receivableDetail";

// Aging 색상 (Green→Red 그라데이션, StatusTab 체계 재사용)
const AGING_COLORS = {
  "1개월": "hsl(142, 76%, 36%)",
  "2개월": "hsl(80, 60%, 45%)",
  "3개월": "hsl(45, 93%, 47%)",
  "4개월": "hsl(30, 90%, 50%)",
  "5개월": "hsl(15, 85%, 50%)",
  "6개월": "hsl(0, 70%, 55%)",
  "6개월+": "hsl(0, 84%, 40%)",
} as const;

interface DetailTabProps {
  profiles: CustomerAgingProfile[];
  currencyExposure: CurrencyExposure[];
  orgGap: OrgInvoiceBookGap[];
  weightedDays: { weightedAvgDays: number; totalAmount: number };
}

export function DetailTab({ profiles, currencyExposure, orgGap, weightedDays }: DetailTabProps) {
  // KPI 계산
  const totalGap = useMemo(() => {
    return profiles.reduce((s, p) => s + p.괴리금액, 0);
  }, [profiles]);

  const foreignRatio = useMemo(() => {
    const totalBook = currencyExposure.reduce((s, c) => s + c.장부금액, 0);
    const foreignBook = currencyExposure
      .filter((c) => c.통화 !== "KRW" && c.통화 !== "")
      .reduce((s, c) => s + c.장부금액, 0);
    return totalBook > 0 ? (foreignBook / totalBook) * 100 : 0;
  }, [currencyExposure]);

  // 차트 데이터: Top 20 거래처 Aging 프로파일 (Horizontal stacked)
  const agingChartData = useMemo(
    () =>
      profiles.slice(0, 20).map((p) => ({
        name: p.판매처명 || p.판매처,
        "1개월": p.month1,
        "2개월": p.month2,
        "3개월": p.month3,
        "4개월": p.month4,
        "5개월": p.month5,
        "6개월": p.month6,
        "6개월+": p.overdue,
      })),
    [profiles]
  );

  // 통화별 Pie 데이터
  const currencyPieData = useMemo(
    () => currencyExposure.map((c) => ({ name: c.통화, value: c.장부금액 })),
    [currencyExposure]
  );

  // 테이블 컬럼
  const columns = useMemo<ColumnDef<CustomerAgingProfile, any>[]>(
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
        accessorKey: "통화",
        header: "통화",
        cell: ({ getValue }) => <span className="text-xs">{getValue<string>() || "KRW"}</span>,
      },
      {
        accessorKey: "month1",
        header: () => <span className="block text-right">1M</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "month2",
        header: () => <span className="block text-right">2M</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "month3",
        header: () => <span className="block text-right">3M</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "month4",
        header: () => <span className="block text-right">4M</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "month5",
        header: () => <span className="block text-right">5M</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "month6",
        header: () => <span className="block text-right">6M</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "overdue",
        header: () => <span className="block text-right">6M+</span>,
        cell: ({ getValue }) => (
          <span className={`block text-right tabular-nums text-xs ${getValue<number>() > 0 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "합계",
        header: () => <span className="block text-right">합계</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums font-medium">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "출고합계",
        header: () => <span className="block text-right">출고</span>,
        cell: ({ getValue }) => <span className="block text-right tabular-nums text-xs">{formatCurrency(getValue<number>(), true)}</span>,
      },
      {
        accessorKey: "괴리율",
        header: () => <span className="block text-right">괴리율</span>,
        cell: ({ getValue }) => {
          const v = getValue<number>();
          return (
            <span className={`block text-right tabular-nums text-xs ${Math.abs(v) > 5 ? "text-amber-600 dark:text-amber-400" : ""}`}>
              {formatPercent(v)}
            </span>
          );
        },
      },
      {
        accessorKey: "weightedDays",
        header: () => <span className="block text-right">가중연령</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums text-xs">
            {isFinite(getValue<number>()) ? getValue<number>().toFixed(0) : 0}일
          </span>
        ),
      },
    ],
    []
  );

  return (
    <>
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="출고-장부 괴리 총액"
          value={totalGap}
          format="currency"
          icon={<FileText className="h-5 w-5" />}
          formula="Σ(출고금액 - 장부금액): 전 거래처의 출고가와 장부가 차이 합산"
          description="출고금액과 장부금액 사이의 차이 합계입니다. 괴리가 크면 매출 인식 시점 차이, 할인/반품 미반영 등을 점검해야 합니다."
          benchmark="총 미수금의 5% 이내이면 양호, 10% 이상이면 원인 분석 필요"
        />
        <KpiCard
          title="외화 미수금 비중"
          value={foreignRatio}
          format="percent"
          icon={<Globe className="h-5 w-5" />}
          formula="비KRW 장부금액 / 전체 장부금액 × 100"
          description="외화(KRW 제외) 채권이 전체 미수금에서 차지하는 비중입니다. 환율 변동 리스크에 노출된 금액을 파악할 수 있습니다."
          benchmark="30% 이상이면 환 헤지 전략 검토 필요"
        />
        <KpiCard
          title="분석 거래처 수"
          value={profiles.length}
          format="number"
          icon={<Building2 className="h-5 w-5" />}
          formula="미수채권 데이터에 포함된 고유 거래처(판매처) 수"
          description="현재 미수금이 있는 전체 거래처 수입니다."
        />
        <KpiCard
          title="가중평균 채권연령"
          value={Math.round(weightedDays.weightedAvgDays)}
          format="number"
          icon={<Clock className="h-5 w-5" />}
          formula="Σ(버킷 중간일수 × 해당 금액) / Σ(전체 금액)"
          description="금액 기준으로 가중평균한 미수채권의 평균 경과 일수입니다. 높을수록 오래된 채권 비중이 크다는 의미입니다."
          benchmark="60일 이내면 양호, 90일 이상이면 회수 전략 점검 필요"
        />
      </div>

      {/* 차트 1: 거래처별 Aging 프로파일 (Stacked Horizontal Bar) */}
      <ChartCard
        title="거래처별 Aging 프로파일 (Top 20)"
        formula="거래처별 미수채권을 경과 기간별(1~6개월, 6개월 초과)로 분류하여 수평 누적 차트로 표시"
        description="미수금이 가장 많은 상위 20개 거래처의 채권 연령 분포입니다. 빨간색 비중이 클수록 장기 미수금이 많아 회수 위험이 높습니다."
        benchmark="6개월 초과 비중이 30% 이상인 거래처는 집중 관리 대상"
      >
        <ChartContainer height="h-[400px] md:h-[600px]">
          <BarChart data={agingChartData} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={75} />
            <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
            <Legend />
            <Bar dataKey="1개월" stackId="a" fill={AGING_COLORS["1개월"]} {...ANIMATION_CONFIG} />
            <Bar dataKey="2개월" stackId="a" fill={AGING_COLORS["2개월"]} {...ANIMATION_CONFIG} />
            <Bar dataKey="3개월" stackId="a" fill={AGING_COLORS["3개월"]} {...ANIMATION_CONFIG} />
            <Bar dataKey="4개월" stackId="a" fill={AGING_COLORS["4개월"]} {...ANIMATION_CONFIG} />
            <Bar dataKey="5개월" stackId="a" fill={AGING_COLORS["5개월"]} {...ANIMATION_CONFIG} />
            <Bar dataKey="6개월" stackId="a" fill={AGING_COLORS["6개월"]} {...ANIMATION_CONFIG} />
            <Bar dataKey="6개월+" stackId="a" fill={AGING_COLORS["6개월+"]} radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 차트 2: 조직별 출고-장부 괴리 (Grouped Bar) */}
      <ChartCard
        title="조직별 출고-장부 괴리"
        formula="조직별로 출고금액과 장부금액을 비교, 괴리금액 = 출고금액 - 장부금액"
        description="영업조직별 출고금액과 장부금액을 비교합니다. 괴리가 클수록 매출 인식 시점 차이나 할인/반품 미반영 가능성이 있습니다."
        benchmark="괴리율 5% 이내가 양호, 10% 이상이면 점검 필요"
      >
        <ChartContainer height="h-72 md:h-96">
          <BarChart data={orgGap}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="org" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
              labelFormatter={(label) => {
                const item = orgGap.find((d) => d.org === label);
                if (!item) return label;
                return `${label} (괴리: ${formatCurrency(item.괴리금액)}, ${formatPercent(item.괴리율)})`;
              }}
            />
            <Legend />
            <Bar dataKey="출고합계" name="출고금액" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            <Bar dataKey="장부합계" name="장부금액" fill={CHART_COLORS[1]} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 차트 3: 통화별 미수금 분포 (Pie/Donut) */}
      <ChartCard
        title="통화별 미수금 분포"
        formula="미수채권 데이터의 통화(Currency) 필드 기준으로 장부금액 합산"
        description="통화별 미수금 분포를 보여줍니다. 외화 비중이 높으면 환율 변동에 따른 환차손 위험에 노출됩니다."
        benchmark="외화 비중 30% 이상 시 환 헤지 검토"
      >
        <ChartContainer height="h-72 md:h-96">
          <PieChart>
            <Pie
              data={currencyPieData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={130}
              dataKey="value"
              nameKey="name"
              label={currencyPieData.length <= 8 ? PieOuterLabel : false}
            >
              {currencyPieData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => formatCurrency(Number(value))}
            />
            {currencyPieData.length > 8 && <Legend />}
          </PieChart>
        </ChartContainer>
      </ChartCard>

      {/* 테이블: 거래처별 Aging 상세 */}
      <ChartCard
        title="거래처별 Aging 상세"
        description="모든 거래처의 월별 미수금 분포, 출고-장부 괴리율, 가중평균 채권연령을 상세 조회합니다."
      >
        <DataTable
          data={profiles}
          columns={columns}
          searchPlaceholder="거래처/담당자 검색..."
          defaultPageSize={20}
        />
      </ChartCard>
    </>
  );
}
