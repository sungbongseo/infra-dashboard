"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
} from "recharts";
import { ArrowRightLeft, Wallet, AlertCircle } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { O2CPipelineResult } from "@/lib/analysis/pipeline";

interface PipelineTabProps {
  orderToSalesRate: number;
  salesToCollectionRate: number;
  outstandingAmount: number;
  pipelineResult: O2CPipelineResult;
  pipelineStages: O2CPipelineResult["stages"];
  monthlyConversion: { month: string; 수주: number; 매출: number; 수금: number; 전환율: number; 수금율: number }[];
}

export function PipelineTab({
  orderToSalesRate,
  salesToCollectionRate,
  outstandingAmount,
  pipelineResult,
  pipelineStages,
  monthlyConversion,
}: PipelineTabProps) {
  const funnelData = useMemo(() => {
    const stageColors = [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[4]];
    return pipelineStages.map((s, i) => ({
      stage: s.stage,
      금액: s.amount,
      비율: s.percentage,
      건수: s.count,
      fill: stageColors[i],
    }));
  }, [pipelineStages]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="수주에서 매출 전환율"
          value={orderToSalesRate}
          format="percent"
          icon={<ArrowRightLeft className="h-5 w-5" />}
          formula="수주→매출 전환율(%) = 총 매출액 ÷ 총 수주액 × 100"
          description="수주한 금액이 실제 매출(출고/납품)로 얼마나 전환되었는지 보여줍니다. 100%를 초과하면 이전 기간 수주분이 금기 매출로 반영된 것입니다."
          benchmark="80~120%가 정상 범위이며, 이 범위를 벗어나면 수주-매출 시차를 점검해야 합니다"
        />
        <KpiCard
          title="순수 수금율 (선수금 제외)"
          value={salesToCollectionRate}
          format="percent"
          icon={<Wallet className="h-5 w-5" />}
          formula="순수 수금율(%) = (총 수금액 − 선수금) ÷ 총 매출액 × 100"
          description={`발생한 매출 중 실제 매출 대금으로 수금된 비율입니다 (선수금 ${formatCurrency(pipelineResult.prepaymentAmount)} 제외). 선수금은 아직 매출이 발생하지 않은 선입금이므로 O2C 흐름에서 분리합니다.`}
          benchmark="90% 이상이면 양호, 80% 미만이면 수금 활동을 강화해야 합니다"
        />
        <KpiCard
          title="미수잔액"
          value={outstandingAmount}
          format="currency"
          icon={<AlertCircle className="h-5 w-5" />}
          formula="미수잔액(원) = 총 매출액 − 순수 수금액 (선수금 제외, 0 미만이면 0)"
          description="매출이 발생했지만 아직 거래처로부터 돈을 받지 못한 금액입니다. 선수금을 제외한 순수 수금 기준으로 계산하여 실제 미수 규모를 정확히 보여줍니다."
          benchmark="매출 대비 20% 이하이면 양호한 수준입니다"
        />
      </div>

      <ChartCard
        title="O2C(주문-수금) 퍼널: 수주에서 매출, 수금까지"
        formula="수주금액에서 매출전환금액, 순수수금완료금액(선수금 제외), 미수잔액 순서로 표시"
        description="O2C(주문-수금 프로세스)의 전체 흐름을 퍼널(깔때기) 형태로 보여줍니다. 수금완료는 선수금을 제외한 순수 수금액입니다. 선수금은 아직 매출이 발생하지 않은 선입금이므로 O2C 흐름에서 분리하여 미수잔액을 정확히 산출합니다."
        benchmark="각 단계 전환율이 80% 이상이면 건전한 O2C(주문-수금) 프로세스입니다"
      >
        <ChartContainer height="h-56 md:h-72">
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ left: 20, right: 80 }}
            >
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
              />
              <YAxis
                type="category"
                dataKey="stage"
                tick={{ fontSize: 12, fontWeight: 500 }}
                width={70}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "금액") return formatCurrency(Number(value));
                  return value;
                }}
                labelFormatter={(label) => `단계: ${label}`}
              />
              <Bar
                dataKey="금액"
                name="금액"
                radius={BAR_RADIUS_RIGHT}
                activeBar={ACTIVE_BAR}
                {...ANIMATION_CONFIG}
                label={({ x, y, width: w, height: h, value, index }: any) => {
                  const stage = funnelData[index];
                  return (
                    <text
                      x={x + w + 6}
                      y={y + h / 2}
                      fill="currentColor"
                      textAnchor="start"
                      dominantBaseline="middle"
                      className="text-xs fill-muted-foreground"
                    >
                      {formatCurrency(Number(value), true)} ({(isFinite(stage.비율) ? stage.비율 : 0).toFixed(1)}%)
                    </text>
                  );
                }}
              >
                {funnelData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard
        title="월별 O2C(주문-수금) 전환 추이"
        formula="전환율(%) = 매출 ÷ 수주 × 100\n수금율(%) = 수금 ÷ 매출 × 100"
        description="매월 수주/매출/수금 금액(막대)과 전환율/수금율(선)을 함께 보여줍니다. 두 비율이 안정적으로 높게 유지되면 주문에서 수금까지의 흐름이 건전하다는 의미입니다."
        benchmark="전환율과 수금율 모두 80% 이상으로 안정 유지되면 양호합니다"
      >
        <ChartContainer height="h-64 md:h-80">
            <ComposedChart data={monthlyConversion}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v.toFixed(0)}%`}
                domain={[0, 200]}
                allowDataOverflow={true}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "전환율" || name === "수금율") return `${Number(value).toFixed(1)}%`;
                  return formatCurrency(Number(value));
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="수주"
                fill={CHART_COLORS[0]}
                name="수주"
                radius={BAR_RADIUS_TOP}
                opacity={0.8}
                activeBar={ACTIVE_BAR}
                {...ANIMATION_CONFIG}
              />
              <Bar
                yAxisId="left"
                dataKey="매출"
                fill={CHART_COLORS[1]}
                name="매출"
                radius={BAR_RADIUS_TOP}
                opacity={0.8}
                activeBar={ACTIVE_BAR}
                {...ANIMATION_CONFIG}
              />
              <Bar
                yAxisId="left"
                dataKey="수금"
                fill={CHART_COLORS[2]}
                name="수금"
                radius={BAR_RADIUS_TOP}
                opacity={0.8}
                activeBar={ACTIVE_BAR}
                {...ANIMATION_CONFIG}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="전환율"
                stroke={CHART_COLORS[4]}
                strokeWidth={2}
                name="전환율"
                dot={{ r: 3 }}
                strokeDasharray="0"
                activeDot={{ r: 6, strokeWidth: 2 }}
                {...ANIMATION_CONFIG}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="수금율"
                stroke={CHART_COLORS[3]}
                strokeWidth={2}
                name="수금율"
                dot={{ r: 3 }}
                strokeDasharray="5 5"
                activeDot={{ r: 6, strokeWidth: 2 }}
                {...ANIMATION_CONFIG}
              />
            </ComposedChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
