"use client";

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
} from "recharts";
import { Wallet, Landmark, Building2, Percent } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import type { PrepaymentSummary, OrgPrepayment, MonthlyPrepayment } from "@/lib/analysis/prepayment";

interface PrepaymentTabProps {
  prepaymentSummary: PrepaymentSummary;
  orgPrepayments: OrgPrepayment[];
  monthlyPrepayments: MonthlyPrepayment[];
  hasCollections: boolean;
}

export function PrepaymentTab({
  prepaymentSummary,
  orgPrepayments,
  monthlyPrepayments,
  hasCollections,
}: PrepaymentTabProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 선수금"
          value={prepaymentSummary.totalPrepayment}
          format="currency"
          icon={<Wallet className="h-5 w-5" />}
          formula="수금목록에서 선수금으로 분류된 금액을 모두 합산"
          description="거래처로부터 상품 인도 전에 미리 받은 금액의 총합입니다. 선수금은 아직 매출로 인식되지 않았으며, 향후 상품이나 서비스를 제공해야 하는 의무가 있습니다."
          benchmark="매출 대비 적정 비율을 유지해야 하며, 과도한 선수금은 이행 부담을 의미합니다"
        />
        <KpiCard
          title="장부 선수금"
          value={prepaymentSummary.totalBookPrepayment}
          format="currency"
          icon={<Landmark className="h-5 w-5" />}
          formula="수금목록의 장부선수금액을 모두 합산"
          description="회계 장부에 원화로 기록된 선수금 총액입니다. 외화 거래가 있으면 환율 차이로 인해 실제 선수금액과 차이가 날 수 있습니다."
          benchmark="선수금액과 장부선수금액의 차이가 크면 환율 변동 영향을 점검해야 합니다"
        />
        <KpiCard
          title="매출 대비 비중"
          value={prepaymentSummary.prepaymentToSalesRatio}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          formula="매출 대비 비중(%) = 총 선수금 ÷ 총 매출액 × 100"
          description="매출액 대비 선수금이 차지하는 비율입니다. 이 비율이 높으면 아직 이행하지 않은 의무가 많다는 의미이며, 납품 일정 관리가 중요합니다."
          benchmark="10% 미만이면 양호, 20% 이상이면 이행 리스크를 점검해야 합니다"
        />
        <KpiCard
          title="해당 조직 수"
          value={prepaymentSummary.orgCount}
          format="number"
          icon={<Building2 className="h-5 w-5" />}
          formula="수금 데이터에서 선수금이 1건 이상 발생한 고유 조직 수"
          description="선수금이 발생한 영업조직 수입니다. 선수금이 특정 조직에 집중되어 있는지 확인할 필요가 있습니다."
          benchmark="선수금이 특정 1~2개 조직에 집중되면 해당 조직의 납품 일정 리스크 점검 필요"
        />
      </div>

      {!hasCollections && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            수금 데이터가 업로드되지 않아 선수금 분석을 수행할 수 없습니다. 수금목록 엑셀 파일을 업로드하면 선수금 분석이 가능합니다.
          </p>
        </div>
      )}

      <ChartCard
        title="조직별 선수금 현황"
        formula="영업조직별 선수금액을 합산하여 상위 10개 조직을 표시"
        description="선수금이 가장 많은 상위 10개 조직입니다. 특정 조직에 선수금이 집중되어 있다면 해당 조직의 납품 이행 능력과 일정을 점검해야 합니다."
        benchmark="단일 조직의 선수금이 전체의 30% 이상이면 집중도가 과도한 상태입니다"
      >
        <ChartContainer height="h-80 md:h-[500px]">
            <BarChart data={orgPrepayments.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 10 }} width={75} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => [
                  formatCurrency(Number(value)),
                  name === "prepayment" ? "선수금" : "장부선수금",
                ]}
                labelFormatter={(label) => `조직: ${label}`}
              />
              <Legend formatter={(value) => (value === "prepayment" ? "선수금" : "장부선수금")} />
              <Bar dataKey="prepayment" name="prepayment" fill="hsl(221.2, 83.2%, 53.3%)" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title="월별 선수금 추이"
        formula="수금월별 선수금액을 합산\n막대 = 선수금, 선 = 장부선수금"
        description="매월 선수금이 얼마나 발생했는지 추이를 보여줍니다. 선수금(막대)과 장부선수금(선)의 차이가 크면 환율 변동이나 회계 처리 시점 차이를 점검해야 합니다."
        benchmark="월별 변동폭이 크면 계절적 요인이나 대형 프로젝트의 영향을 확인해야 합니다"
      >
        <ChartContainer height="h-72 md:h-96">
            <ComposedChart data={monthlyPrepayments}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => [
                  formatCurrency(Number(value)),
                  name === "prepayment" ? "선수금" : "장부선수금",
                ]}
              />
              <Legend formatter={(value) => (value === "prepayment" ? "선수금" : "장부선수금")} />
              <Bar dataKey="prepayment" name="prepayment" fill="hsl(221.2, 83.2%, 53.3%)" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Line
                type="monotone"
                dataKey="bookPrepayment"
                name="bookPrepayment"
                stroke="hsl(24.6, 95%, 53.1%)"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                {...ANIMATION_CONFIG}
              />
            </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
