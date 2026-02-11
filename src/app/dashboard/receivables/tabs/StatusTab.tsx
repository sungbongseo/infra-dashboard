"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CreditCard, AlertTriangle, Shield } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { formatCurrency, TOOLTIP_STYLE } from "@/lib/utils";
import type { AgingSummary } from "@/lib/analysis/aging";

type AgingByOrg = { org: string } & AgingSummary;

interface StatusTabProps {
  summary: AgingSummary;
  byOrg: AgingByOrg[];
  highRiskCount: number;
}

export function StatusTab({ summary, byOrg, highRiskCount }: StatusTabProps) {
  const overdueTotal = summary.month4 + summary.month5 + summary.month6 + summary.overdue;
  const overdueRate = summary.total > 0 ? (overdueTotal / summary.total) * 100 : 0;

  const agingStackedData = useMemo(() =>
    byOrg.map((o) => ({
      org: o.org,
      "1개월": o.month1,
      "2개월": o.month2,
      "3개월": o.month3,
      "4개월": o.month4,
      "5개월": o.month5,
      "6개월": o.month6,
      "6개월+": o.overdue,
    })),
    [byOrg]
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 미수금"
          value={summary.total}
          format="currency"
          icon={<CreditCard className="h-5 w-5" />}
          formula="모든 미수채권연령 파일의 미수금을 합산"
          description="인프라 사업본부 담당 조직이 거래처로부터 아직 받지 못한 매출채권의 총합입니다. 미수금이 과도하면 현금 유동성에 문제가 생길 수 있습니다."
          benchmark="매출액 대비 15% 이내이면 양호한 수준입니다"
        />
        <KpiCard
          title="91일 이상 장기 미수"
          value={overdueTotal}
          format="currency"
          icon={<AlertTriangle className="h-5 w-5" />}
          formula="91일 이상 장기 미수액(원) = 4개월차(91~120일) + 5개월차(121~150일) + 6개월차(151~180일) + 6개월 초과(181일+) 미수금의 합계"
          description="91일(4개월차) 이상 장기간 회수되지 않은 미수금 합계입니다. 오래 될수록 회수가 어려워지므로 즉각적인 추심 활동이 필요합니다."
          benchmark="총 미수금의 20% 미만이면 양호, 30% 이상이면 집중 관리가 필요합니다"
        />
        <KpiCard
          title="연체비율"
          value={overdueRate}
          format="percent"
          formula="연체비율(%) = 91일 이상 미수금(4개월차~6개월 초과) ÷ 총 미수금 × 100"
          description="전체 미수금 중에서 91일(4개월차) 이상 장기 체류한 채권이 차지하는 비율입니다. 이 비율이 높으면 채권 건전성이 낮다는 의미이므로 회수 전략 점검이 필요합니다."
          benchmark="20% 미만이면 양호, 30% 이상이면 위험 수준입니다"
        />
        <KpiCard
          title="고위험 거래처"
          value={highRiskCount}
          format="number"
          icon={<Shield className="h-5 w-5" />}
          formula="연체비율 50% 초과 또는 6개월 이상 미수금 1억원 초과인 거래처 수"
          description="채권 회수가 어려울 가능성이 높은 거래처 수입니다. 이런 거래처에는 즉각적인 추심 조치와 거래 조건 재검토가 필요합니다."
          benchmark="0건이 이상적이며, 3건 이상이면 집중 관리 체계가 필요합니다"
        />
      </div>

      <ChartCard
        title="조직별 미수채권 연령 분석"
        formula="각 조직의 미수채권을 경과 기간별(1~6개월, 6개월 초과)로 분류"
        description="조직별로 미수채권이 얼마나 오래되었는지 색상으로 구분하여 보여줍니다. 녹색은 최근 발생한 채권, 빨간색은 오래된 채권입니다. 빨간색 비중이 클수록 회수 위험이 높습니다."
        benchmark="3개월 이상 비율이 20% 미만이면 양호합니다. 6개월 초과 비중이 높으면 대손(회수 불능) 위험이 있습니다"
      >
        <div className="h-72 md:h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingStackedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="org" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="1개월" stackId="a" fill="hsl(142, 76%, 36%)" />
              <Bar dataKey="2개월" stackId="a" fill="hsl(80, 60%, 45%)" />
              <Bar dataKey="3개월" stackId="a" fill="hsl(45, 93%, 47%)" />
              <Bar dataKey="4개월" stackId="a" fill="hsl(30, 90%, 50%)" />
              <Bar dataKey="5개월" stackId="a" fill="hsl(15, 85%, 50%)" />
              <Bar dataKey="6개월" stackId="a" fill="hsl(0, 70%, 55%)" />
              <Bar dataKey="6개월+" stackId="a" fill="hsl(0, 84%, 40%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </>
  );
}
