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
} from "recharts";
import { Landmark, TrendingUp, Ban, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCreditUtilization, calcCreditSummaryByOrg } from "@/lib/analysis/aging";

interface CreditTabProps {
  allRecords: any[];
  isDateFiltered?: boolean;
}

export function CreditTab({ allRecords, isDateFiltered }: CreditTabProps) {
  const creditUtilizations = useMemo(() => calcCreditUtilization(allRecords), [allRecords]);
  const creditByOrg = useMemo(() => calcCreditSummaryByOrg(allRecords), [allRecords]);

  const creditTotalLimit = useMemo(() => creditUtilizations.reduce((s, c) => s + c.여신한도, 0), [creditUtilizations]);
  const creditTotalUsed = useMemo(() => creditUtilizations.reduce((s, c) => s + c.총미수금, 0), [creditUtilizations]);
  const creditAvgRate = creditTotalLimit > 0 ? (creditTotalUsed / creditTotalLimit) * 100 : 0;
  const creditDangerCount = creditUtilizations.filter((c) => c.상태 === "danger").length;

  const creditExportData = useMemo(
    () =>
      creditUtilizations.map((c) => ({
        거래처: c.판매처명 || c.판매처,
        조직: c.영업조직,
        담당자: c.담당자,
        여신한도: c.여신한도,
        미수금: c.총미수금,
        사용률: `${c.사용률.toFixed(1)}%`,
        상태: c.상태 === "danger" ? "한도초과" : c.상태 === "warning" ? "주의" : "양호",
      })),
    [creditUtilizations]
  );

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 여신한도"
          value={creditTotalLimit}
          format="currency"
          icon={<Landmark className="h-5 w-5" />}
          formula="여신한도가 설정된 모든 거래처의 한도를 합산"
          description="거래처에 부여한 여신한도(외상 허용 금액)의 총합입니다. 이 금액 범위 내에서 외상 거래가 허용됩니다."
          benchmark="총 매출액 대비 적정 수준을 유지해야 합니다"
          reason="총 여신한도 규모를 파악하여 회사가 부담하는 신용 리스크 총량을 관리하고, 한도 정책의 적정성을 평가합니다."
        />
        <KpiCard
          title="총 사용액"
          value={creditTotalUsed}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="여신한도가 설정된 거래처들의 미수금 합계"
          description="여신한도가 있는 거래처들이 현재 사용 중인 외상 금액(미수금)의 총합입니다. 총 여신한도에 가까울수록 추가 거래 여력이 줄어듭니다."
          benchmark="총 여신한도의 70% 이내이면 양호한 상태입니다"
          reason="실제 여신 사용 규모를 확인하여 추가 외상 거래 여력을 판단하고, 한도 소진 시 영업 활동 제약을 사전에 대비합니다."
        />
        <KpiCard
          title="평균 사용률"
          value={creditAvgRate}
          format="percent"
          icon={<Gauge className="h-5 w-5" />}
          formula="평균 사용률(%) = 총 사용액 ÷ 총 여신한도 × 100"
          description="전체 여신한도 대비 실제 사용 비율입니다. 이 비율이 높으면 여신 여력이 부족하여 신규 외상 거래에 제약이 생길 수 있습니다."
          benchmark="70% 미만이면 양호, 80% 이상이면 주의, 100% 이상이면 위험입니다"
          reason="여신 사용률 추이를 모니터링하여 한도 초과 위험을 사전에 감지하고, 여신 정책 조정 시점을 판단합니다."
        />
        <KpiCard
          title="한도초과 거래처"
          value={creditDangerCount}
          format="number"
          icon={<Ban className="h-5 w-5" />}
          formula="여신 사용률이 100% 이상인 거래처 수"
          description="미수금이 여신한도를 초과한 거래처 수입니다. 한도를 넘긴 거래처에는 추가 출고 중단 등 즉각적인 조치가 필요합니다."
          benchmark="0건이 이상적이며, 발생 시 즉시 여신 관리 조치를 취해야 합니다"
          reason="한도초과 거래처는 추가 출고 시 미회수 위험이 급증하므로, 즉시 출고 중단과 여신 재심사를 진행해야 합니다."
        />
      </div>

      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="조직별 여신 사용률"
        formula="조직별 여신 사용률(%) = 조직별 미수금 합계 ÷ 여신한도 합계 × 100\n빨간 점선 = 100% 한도 기준선"
        description="각 조직이 여신한도를 얼마나 사용하고 있는지 보여줍니다. 100%를 넘으면 한도 초과이며, 빨간 점선이 100% 기준입니다."
        benchmark="80% 미만이면 양호(녹색), 80~100%이면 주의(노란색), 100% 이상이면 위험(빨간색)입니다"
        reason="조직별 여신 사용률을 비교하여 과다 여신 조직을 식별하고, 조직 단위의 신용 리스크를 제한합니다."
      >
        <ChartContainer height="h-64 md:h-80">
            <BarChart data={creditByOrg} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, (max: number) => Math.max(max * 1.1, 110)]} />
              <YAxis type="category" dataKey="org" tick={{ fontSize: 10 }} width={75} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                labelFormatter={(label) => `조직: ${label}`}
              />
              <ReferenceLine x={100} stroke="hsl(0, 84%, 50%)" strokeDasharray="3 3" strokeWidth={2} label={{ value: "100%", position: "top", fontSize: 10 }} />
              <Bar dataKey="utilizationRate" name="사용률" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {creditByOrg.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      entry.utilizationRate >= 100
                        ? "hsl(0, 84%, 50%)"
                        : entry.utilizationRate >= 80
                        ? "hsl(45, 93%, 47%)"
                        : CHART_COLORS[2]
                    }
                  />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="거래처별 여신 사용률"
        formula="거래처별 여신 사용률(%) = 미수금 ÷ 여신한도 × 100\n사용률이 높은 순서대로 정렬"
        description="거래처별로 여신한도를 얼마나 사용하고 있는지 상세 목록입니다. 빨간색(한도초과)과 노란색(주의) 거래처를 우선 관리해야 합니다."
        benchmark="사용률 80% 미만이면 양호, 100% 이상 한도초과 거래처는 즉시 조치가 필요합니다"
        reason="거래처별 여신 현황을 상세 파악하여 한도초과 거래처에 대한 출고 통제와 여신 재심사를 적시에 실행합니다."
        action={<ExportButton data={creditExportData} fileName="여신사용률" />}
      >
        <div className="h-80 md:h-[500px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="py-2 px-2 font-medium">거래처</th>
                <th className="py-2 px-2 font-medium">조직</th>
                <th className="py-2 px-2 font-medium">담당자</th>
                <th className="py-2 px-2 font-medium text-right">여신한도</th>
                <th className="py-2 px-2 font-medium text-right">미수금</th>
                <th className="py-2 px-2 font-medium text-right">사용률</th>
                <th className="py-2 px-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {creditUtilizations.map((c, i) => (
                <tr key={i} className="border-b border-muted/50 hover:bg-muted/30">
                  <td className="py-1.5 px-2 truncate max-w-[150px]" title={c.판매처명}>{c.판매처명 || c.판매처}</td>
                  <td className="py-1.5 px-2 truncate max-w-[80px]">{c.영업조직}</td>
                  <td className="py-1.5 px-2 truncate max-w-[60px]">{c.담당자}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(c.여신한도, true)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(c.총미수금, true)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">{formatPercent(c.사용률, 1)}</td>
                  <td className="py-1.5 px-2">
                    <Badge
                      variant={c.상태 === "danger" ? "destructive" : c.상태 === "warning" ? "warning" : "success"}
                    >
                      {c.상태 === "danger" ? "한도초과" : c.상태 === "warning" ? "주의" : "양호"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
