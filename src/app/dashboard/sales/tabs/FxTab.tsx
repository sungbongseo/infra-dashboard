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
  isDateFiltered?: boolean;
}

export function FxTab({ filteredSales, isDateFiltered }: FxTabProps) {
  const fxImpact = useMemo(() => calcCurrencySales(filteredSales), [filteredSales]);
  const monthlyFxTrend = useMemo(() => calcMonthlyFxTrend(filteredSales), [filteredSales]);
  const fxPnL = useMemo(() => calcFxPnL(filteredSales), [filteredSales]);

  // 환율 리스크 요약 인사이트
  const fxRiskInsight = useMemo(() => {
    if (fxImpact.foreignAmount === 0) return null;
    const totalSales = fxImpact.foreignAmount + (fxImpact.currencyBreakdown.find(c => c.currency === "KRW")?.bookAmount || 0);
    const foreignShare = totalSales > 0 ? (fxImpact.foreignAmount / totalSales) * 100 : 0;
    const lossAt10Pct = fxImpact.foreignAmount * 0.1;
    // 상위 3개 외화 통화 (KRW 제외)
    const topCurrencies = fxImpact.currencyBreakdown
      .filter(c => c.currency !== "KRW")
      .sort((a, b) => b.bookAmount - a.bookAmount)
      .slice(0, 3);
    return { foreignShare, lossAt10Pct, topCurrencies };
  }, [fxImpact]);

  if (fxImpact.currencyBreakdown.length <= 1 && fxImpact.foreignAmount === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* 외화 거래 범위 안내 */}
      {fxImpact.foreignSharePercent < 5 && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
          <Globe className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            현재 외화 거래는 일부 조직에 집중되어 있습니다 (전체 매출의 {isFinite(fxImpact.foreignSharePercent) ? fxImpact.foreignSharePercent.toFixed(1) : "0.0"}%).
            나머지 조직은 원화 거래만 발생하고 있어, 아래 분석은 외화 거래가 있는 조직 중심으로 해석하세요.
          </div>
        </div>
      )}
      {/* 환율 리스크 요약 인사이트 */}
      {fxRiskInsight && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 text-sm">환율 리스크 요약</h4>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>• 외화 매출 비중: <span className="font-medium">{isFinite(fxRiskInsight.foreignShare) ? fxRiskInsight.foreignShare.toFixed(1) : "0.0"}%</span>
              {fxRiskInsight.foreignShare >= 30 && " — 환헤지 전략 필수"}
            </li>
            <li>• 원화 강세 시 <span className="font-medium text-red-700 dark:text-red-400">{formatCurrency(fxRiskInsight.lossAt10Pct)}</span> 손실 추정 (환율 10% 변동 기준)</li>
            {fxRiskInsight.topCurrencies.length > 0 && (
              <li>• 주요 통화별 노출: {fxRiskInsight.topCurrencies.map(c =>
                `${c.currency} ${formatCurrency(c.bookAmount)}`
              ).join(", ")}</li>
            )}
          </ul>
        </div>
      )}

      {/* 환율 변동 시나리오 */}
      {fxImpact.foreignAmount > 0 && (
        <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
          <p className="font-medium">환율 변동 시 매출 영향 추정 (외화 매출 {formatCurrency(fxImpact.foreignAmount)} 기준)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
              <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                환율 +5% (원화 약세) 시
              </p>
              <p className="text-emerald-800 dark:text-emerald-300 text-lg font-semibold">
                +{formatCurrency(Math.round(fxImpact.foreignAmount * 0.05))}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500">원화 환산 매출 증가</p>
            </div>
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
              <p className="text-red-700 dark:text-red-400 font-medium">
                환율 -5% (원화 강세) 시
              </p>
              <p className="text-red-800 dark:text-red-300 text-lg font-semibold">
                {formatCurrency(Math.round(fxImpact.foreignAmount * -0.05))}
              </p>
              <p className="text-xs text-red-600 dark:text-red-500">원화 환산 매출 감소</p>
            </div>
          </div>
        </div>
      )}

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
          reason="외화 매출 비중을 파악하여 환율 변동에 따른 실적 영향 규모를 예측하고, 환헤지 전략 수립의 근거를 마련합니다."
        />
        <KpiCard
          title="해외매출액"
          value={fxImpact.foreignAmount}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          formula="거래통화가 원화(KRW)가 아닌 매출의 장부금액을 합산"
          description="외화(달러, 유로, 엔 등)로 거래된 매출을 원화로 환산한 금액의 합계입니다. 환율 변동에 따라 같은 외화 금액이라도 원화 환산 금액이 달라질 수 있습니다."
          benchmark="전기 대비 해외매출 증감을 모니터링하여 수출 경쟁력을 추적"
          reason="해외매출 절대 규모를 추적하여 수출 사업의 성장 추이를 파악하고, 환율 변동 시 원화 환산 영향액을 산정합니다."
        />
        <KpiCard
          title="거래 통화 수"
          value={fxImpact.currencyBreakdown.length}
          format="number"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="중복 없이 거래에 사용된 통화 종류 수를 세기"
          description="매출 거래에 사용된 통화(KRW, USD, EUR, JPY 등)의 종류 수입니다. 통화가 다양할수록 여러 해외 시장에 진출해 있다는 의미이지만, 환율 관리 복잡도도 높아집니다."
          benchmark="3개 이상 통화이면 환리스크 관리 체계 구축 필요"
          reason="거래에 사용되는 통화 다양성을 확인하여 환율 관리 복잡도를 진단하고, 통화별 맞춤 헤지 전략의 필요성을 판단합니다."
        />
        <KpiCard
          title="FX 효과"
          value={fxPnL.reduce((sum, item) => sum + item.fxGainLoss, 0)}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="FX 효과(원) = Σ(실제 장부금액 − 판매금액 × 평균환율)"
          description="각 거래의 실제 적용 환율과 기간 내 가중평균 환율의 차이에서 발생한 환차익 또는 환차손의 추정 금액입니다. 환율이 유리하게 적용된 거래가 많으면 양수(이익), 불리하면 음수(손실)로 나타납니다."
          benchmark="양수이면 환차익(이득), 음수이면 환차손(손해)"
          reason="환율 변동이 실적에 미치는 순효과를 금액으로 산출하여 환리스크 노출 규모를 정량화하고, 환헤지 활동의 성과를 평가합니다."
        />
      </div>

      {/* 월별 내수/해외 매출 추이 */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="월별 내수/해외 매출 추이"
        formula="월별로 원화(내수)와 외화(해외) 매출을 각각 합산"
        description="매월 내수 매출(파랑 막대)과 해외 매출(보라 막대)이 어떻게 변하는지 보여줍니다. 오른쪽 축의 선은 해외매출 비중(%)을 나타냅니다. 해외매출 비중이 급변하면 환율 리스크 관리 전략을 재검토해야 합니다."
        benchmark="해외매출 비중 추이가 안정적이면 양호, 급등 또는 급락 시 원인 분석 필요"
        reason="내수/해외 매출 구성의 월별 변화를 추적하여 수출 비중 급변 시점을 포착하고, 환리스크 관리 전략의 재검토 시점을 판단합니다."
      >
        <ChartContainer height="h-72 md:h-96">
            <ComposedChart data={monthlyFxTrend}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${isFinite(v) ? v.toFixed(0) : "0"}%`}
                domain={[0, 100]}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "해외비중") return [`${isFinite(Number(value)) ? Number(value).toFixed(1) : "0.0"}%`, name];
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
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="통화별 매출 분포"
          formula="거래통화별로 장부금액(원화 환산)을 합산"
          description="KRW(원화), USD(달러), EUR(유로) 등 거래에 사용된 통화별 매출 규모를 비교합니다. 원화 외에 특정 외화에 매출이 집중되어 있으면 해당 통화의 환율 변동이 실적에 큰 영향을 미칩니다."
          benchmark="특정 외화 의존도가 50%를 넘으면 통화 분산 또는 환헤지 필요"
          reason="통화별 매출 집중도를 파악하여 특정 통화 환율 급변 시 영향 규모를 사전에 산정하고, 통화 분산 또는 집중 헤지 전략을 수립합니다."
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
                      ? `${label} (${item.count.toLocaleString()}건, 비중 ${isFinite(item.share) ? item.share.toFixed(1) : "0.0"}%)`
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
          <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
            title="통화별 가중평균 환율 및 거래 현황"
            formula="가중평균환율 = 원화 장부금액 ÷ 원래 통화 판매금액"
            description="외화 통화별로 실제 적용된 가중평균 환율과 거래 규모를 표로 보여줍니다. 같은 통화라도 거래 시점에 따라 환율이 다르며, FX 효과 열에서 환차익(+) 또는 환차손(-)을 확인할 수 있습니다."
            benchmark="FX 효과가 양수(녹색)이면 환율이 유리하게 적용됨, 음수(적색)이면 불리하게 적용됨"
            reason="통화별 실제 적용 환율과 FX 손익을 상세히 파악하여 환율 유/불리 거래 패턴을 분석하고, 향후 환율 협상 및 결제 시점 전략에 반영합니다."
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
