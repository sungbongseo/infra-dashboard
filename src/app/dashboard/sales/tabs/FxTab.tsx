"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import { DollarSign, TrendingUp, BarChart3, Globe } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCurrencySales, calcMonthlyFxTrend, calcFxPnL } from "@/lib/analysis/fx";
import type { SalesRecord } from "@/types";

interface FxTabProps {
  filteredSales: SalesRecord[];
}

export function FxTab({ filteredSales }: FxTabProps) {
  const fxImpact = useMemo(() => calcCurrencySales(filteredSales), [filteredSales]);
  const monthlyFxTrend = useMemo(() => calcMonthlyFxTrend(filteredSales), [filteredSales]);
  const fxPnL = useMemo(() => calcFxPnL(filteredSales), [filteredSales]);

  if (fxImpact.currencyBreakdown.length <= 1 && fxImpact.foreignAmount === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* FX KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="해외매출 비중"
          value={fxImpact.foreignSharePercent}
          format="percent"
          icon={<Globe className="h-5 w-5" />}
          formula="해외매출 비중(%) = 해외매출(원화 환산) ÷ 총매출(원화) × 100"
          description="전체 매출 중 외화(해외) 거래가 차지하는 비율입니다. 이 비중이 높을수록 원/달러, 원/엔 등 환율 변동에 따라 실적이 크게 흔들릴 수 있습니다."
          benchmark="30%를 넘으면 환리스크 헤지(환율 변동 대비) 전략 필요"
        />
        <KpiCard
          title="해외매출액"
          value={fxImpact.foreignAmount}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          formula="거래통화가 원화(KRW)가 아닌 매출의 장부금액을 합산"
          description="외화(달러, 유로, 엔 등)로 거래된 매출을 원화로 환산한 금액의 합계입니다. 환율 변동에 따라 같은 외화 금액이라도 원화 환산 금액이 달라질 수 있습니다."
          benchmark="전기 대비 해외매출 증감을 모니터링하여 수출 경쟁력을 추적"
        />
        <KpiCard
          title="거래 통화 수"
          value={fxImpact.currencyBreakdown.length}
          format="number"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="중복 없이 거래에 사용된 통화 종류 수를 세기"
          description="매출 거래에 사용된 통화(KRW, USD, EUR, JPY 등)의 종류 수입니다. 통화가 다양할수록 여러 해외 시장에 진출해 있다는 의미이지만, 환율 관리 복잡도도 높아집니다."
          benchmark="3개 이상 통화이면 환리스크 관리 체계 구축 필요"
        />
        <KpiCard
          title="FX 효과"
          value={fxPnL.reduce((sum, item) => sum + item.fxGainLoss, 0)}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="FX 효과(원) = Σ(실제 장부금액 − 판매금액 × 평균환율)"
          description="각 거래의 실제 적용 환율과 기간 내 가중평균 환율의 차이에서 발생한 환차익 또는 환차손의 추정 금액입니다. 환율이 유리하게 적용된 거래가 많으면 양수(이익), 불리하면 음수(손실)로 나타납니다."
          benchmark="양수이면 환차익(이득), 음수이면 환차손(손해)"
        />
      </div>

      {/* 월별 내수/해외 매출 추이 */}
      <ChartCard
        title="월별 내수/해외 매출 추이"
        formula="월별로 원화(내수)와 외화(해외) 매출을 각각 합산"
        description="매월 내수 매출(파랑 막대)과 해외 매출(보라 막대)이 어떻게 변하는지 보여줍니다. 오른쪽 축의 선은 해외매출 비중(%)을 나타냅니다. 해외매출 비중이 급변하면 환율 리스크 관리 전략을 재검토해야 합니다."
        benchmark="해외매출 비중 추이가 안정적이면 양호, 급등 또는 급락 시 원인 분석 필요"
      >
        <ChartContainer height="h-72 md:h-96">
            <ComposedChart data={monthlyFxTrend}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
                domain={[0, 100]}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "해외비중") return [`${Number(value).toFixed(1)}%`, name];
                  return [formatCurrency(Number(value)), name];
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="domestic"
                name="내수 매출"
                stackId="fxStack"
                fill={CHART_COLORS[0]}
                radius={[0, 0, 0, 0]}
                activeBar={ACTIVE_BAR}
                {...ANIMATION_CONFIG}
              />
              <Bar
                yAxisId="left"
                dataKey="foreign"
                name="해외 매출"
                stackId="fxStack"
                fill={CHART_COLORS[3]}
                radius={BAR_RADIUS_TOP}
                activeBar={ACTIVE_BAR}
                {...ANIMATION_CONFIG}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="foreignShare"
                name="해외비중"
                stroke={CHART_COLORS[4]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6, strokeWidth: 2 }}
                {...ANIMATION_CONFIG}
              />
            </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {/* 통화별 매출 분포 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="통화별 매출 분포"
          formula="거래통화별로 장부금액(원화 환산)을 합산"
          description="KRW(원화), USD(달러), EUR(유로) 등 거래에 사용된 통화별 매출 규모를 비교합니다. 원화 외에 특정 외화에 매출이 집중되어 있으면 해당 통화의 환율 변동이 실적에 큰 영향을 미칩니다."
          benchmark="특정 외화 의존도가 50%를 넘으면 통화 분산 또는 환헤지 필요"
        >
          <ChartContainer height="h-72 md:h-96">
              <BarChart
                data={fxImpact.currencyBreakdown}
                layout="vertical"
                margin={{ left: 10 }}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatCurrency(v, true)}
                />
                <YAxis
                  type="category"
                  dataKey="currency"
                  tick={{ fontSize: 11 }}
                  width={55}
                />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) => {
                    if (name === "매출액(원화)") return [formatCurrency(Number(value)), name];
                    return [value, name];
                  }}
                  labelFormatter={(label: any) => {
                    const item = fxImpact.currencyBreakdown.find(
                      (c) => c.currency === label
                    );
                    return item
                      ? `${label} (${item.count.toLocaleString()}건, 비중 ${item.share.toFixed(1)}%)`
                      : label;
                  }}
                />
                <Bar
                  dataKey="bookAmount"
                  name="매출액(원화)"
                  radius={BAR_RADIUS_RIGHT}
                  activeBar={ACTIVE_BAR}
                  {...ANIMATION_CONFIG}
                >
                  {fxImpact.currencyBreakdown.map((entry, i) => (
                    <Cell
                      key={entry.currency}
                      fill={
                        entry.currency === "KRW"
                          ? CHART_COLORS[0]
                          : CHART_COLORS[(i % (CHART_COLORS.length - 1)) + 1]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 통화별 환율 및 FX 손익 */}
        {fxPnL.length > 0 && (
          <ChartCard
            title="통화별 가중평균 환율 및 거래 현황"
            formula="가중평균환율 = 원화 장부금액 ÷ 원래 통화 판매금액"
            description="외화 통화별로 실제 적용된 가중평균 환율과 거래 규모를 표로 보여줍니다. 같은 통화라도 거래 시점에 따라 환율이 다르며, FX 효과 열에서 환차익(+) 또는 환차손(-)을 확인할 수 있습니다."
            benchmark="FX 효과가 양수(녹색)이면 환율이 유리하게 적용됨, 음수(적색)이면 불리하게 적용됨"
          >
            <div className="h-72 md:h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-semibold">통화</th>
                    <th className="p-2 font-semibold text-right">평균환율</th>
                    <th className="p-2 font-semibold text-right">장부금액(KRW)</th>
                    <th className="p-2 font-semibold text-right">FX 효과</th>
                  </tr>
                </thead>
                <tbody>
                  {fxPnL.map((item) => (
                    <tr key={item.currency} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{item.currency}</td>
                      <td className="p-2 text-right">
                        {item.avgRate.toLocaleString("ko-KR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-2 text-right">
                        {formatCurrency(item.bookAmount, true)}
                      </td>
                      <td
                        className={`p-2 text-right font-medium ${
                          item.fxGainLoss > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : item.fxGainLoss < 0
                              ? "text-red-600 dark:text-red-400"
                              : ""
                        }`}
                      >
                        {item.fxGainLoss > 0 ? "+" : ""}
                        {formatCurrency(item.fxGainLoss, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="p-2">합계</td>
                    <td className="p-2 text-right">-</td>
                    <td className="p-2 text-right">
                      {formatCurrency(
                        fxPnL.reduce((s, i) => s + i.bookAmount, 0),
                        true
                      )}
                    </td>
                    <td
                      className={`p-2 text-right ${
                        fxPnL.reduce((s, i) => s + i.fxGainLoss, 0) > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : fxPnL.reduce((s, i) => s + i.fxGainLoss, 0) < 0
                            ? "text-red-600 dark:text-red-400"
                            : ""
                      }`}
                    >
                      {fxPnL.reduce((s, i) => s + i.fxGainLoss, 0) > 0 ? "+" : ""}
                      {formatCurrency(
                        fxPnL.reduce((s, i) => s + i.fxGainLoss, 0),
                        true
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ChartCard>
        )}
      </div>
    </>
  );
}
