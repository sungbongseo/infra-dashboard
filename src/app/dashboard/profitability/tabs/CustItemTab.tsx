"use client";

import { useMemo } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
  Cell,
  ReferenceLine,
} from "recharts";
import { Package, Users, Calendar } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcABCAnalysis, calcCustomerPortfolio, calcCrossProfitability } from "@/lib/analysis/customerItemAnalysis";

interface CustItemTabProps {
  effectiveHqCustItemProfit: any[];
  isUsingDateFiltered: boolean;
  dateRange: { from?: string; to?: string } | null;
}

export function CustItemTab({ effectiveHqCustItemProfit, isUsingDateFiltered, dateRange }: CustItemTabProps) {
  const abcItems = useMemo(() => calcABCAnalysis(effectiveHqCustItemProfit), [effectiveHqCustItemProfit]);
  const custPortfolio = useMemo(() => calcCustomerPortfolio(effectiveHqCustItemProfit), [effectiveHqCustItemProfit]);
  const topCombinations = useMemo(() => calcCrossProfitability(effectiveHqCustItemProfit).slice(0, 20), [effectiveHqCustItemProfit]);

  return (
    <>
      {isUsingDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
        </div>
      )}
      {/* ABC 분석 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="A등급 품목"
          value={abcItems.filter((i) => i.grade === "A").length}
          format="number"
          icon={<Package className="h-5 w-5" />}
          description="매출 누적 80%를 차지하는 핵심 품목 수입니다. 이 품목들이 매출의 대부분을 만들어내는 핵심 제품입니다."
          formula="매출 기준 내림차순 정렬 후 누적비중 80%까지 = A등급"
          benchmark="A등급 품목이 전체의 20% 이하이면 전형적인 파레토(80/20) 패턴"
        />
        <KpiCard
          title="B등급 품목"
          value={abcItems.filter((i) => i.grade === "B").length}
          format="number"
          icon={<Package className="h-5 w-5" />}
          formula="매출 기준 내림차순 정렬 후 누적비중 80~95% = B등급"
          description="매출 누적 80~95%에 해당하는 중요 품목 수입니다."
          benchmark="B등급 품목은 성장 잠재력을 가진 품목으로 육성 대상으로 검토"
        />
        <KpiCard
          title="C등급 품목"
          value={abcItems.filter((i) => i.grade === "C").length}
          format="number"
          icon={<Package className="h-5 w-5" />}
          formula="매출 기준 내림차순 정렬 후 누적비중 95~100% = C등급"
          description="매출 누적 95~100%의 기타 품목입니다. 수가 많지만 매출 기여는 작습니다."
          benchmark="C등급 품목 수가 과도하면 관리 비용 대비 수익이 낮아 품목 정리 검토"
        />
        <KpiCard
          title="총 거래처"
          value={custPortfolio.length}
          format="number"
          icon={<Users className="h-5 w-5" />}
          description="거래처×품목 데이터에 포함된 고유 거래처 수입니다."
          formula="거래처×품목 손익 데이터에서 중복 제거한 고유 거래처 수"
          benchmark="거래처별 품목 분석이 가능해야 교차 수익성 파악이 정확합니다"
        />
      </div>

      {/* ABC Pareto 차트 */}
      <ChartCard title="품목 ABC 분석 (Pareto)" formula="매출액 기준 내림차순 정렬 → 누적비중 80%=A, 95%=B, 100%=C" description="품목을 매출 기여도 순으로 정렬하고 누적 비중을 표시합니다. A등급 품목이 매출의 80%를 차지하며, 이들에 집중 관리가 필요합니다." benchmark="일반적으로 20%의 품목이 80%의 매출을 차지합니다 (파레토 법칙)">
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={abcItems.slice(0, 30)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="product" tick={{ fontSize: 9 }} tickFormatter={(v) => String(v).substring(0, 8)} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, 100]} />
              <RechartsTooltip
                formatter={(v: any, name: any) => name === "누적비중(%)" ? `${Number(v).toFixed(1)}%` : formatCurrency(Number(v))}
                {...TOOLTIP_STYLE}
              />
              <Legend />
              <Bar dataKey="sales" name="매출액" radius={[4, 4, 0, 0]}>
                {abcItems.slice(0, 30).map((item, idx) => (
                  <Cell key={idx} fill={item.grade === "A" ? CHART_COLORS[0] : item.grade === "B" ? CHART_COLORS[5] : CHART_COLORS[6]} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="cumulativeShare" name="누적비중(%)" stroke={CHART_COLORS[4]} strokeWidth={2} yAxisId="right" dot={false} />
              <ReferenceLine y={80} yAxisId="right" stroke="#f97316" strokeDasharray="5 5" label={{ value: "80%", position: "right", fontSize: 10 }} />
              <ReferenceLine y={95} yAxisId="right" stroke="#ef4444" strokeDasharray="5 5" label={{ value: "95%", position: "right", fontSize: 10 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 거래처×품목 매출 Top 20 조합 */}
      <ChartCard
        title="거래처×품목 매출 Top 20"
        formula="거래처×품목 조합별 매출액 기준 내림차순 정렬 후 상위 20건"
        description="매출이 가장 큰 거래처-품목 조합 상위 20건입니다. 어떤 거래처에 어떤 품목을 얼마나 팔고 있는지, 그리고 그 수익성이 어떤지를 한눈에 파악할 수 있습니다."
        benchmark="상위 20개 조합의 매출총이익율이 평균 이상이면 핵심 거래의 수익성이 양호합니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">#</th>
                <th className="p-2 font-medium">거래처</th>
                <th className="p-2 font-medium">품목</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">매출총이익</th>
                <th className="p-2 font-medium text-right">이익율</th>
                <th className="p-2 font-medium text-right">영업이익율</th>
              </tr>
            </thead>
            <tbody>
              {topCombinations.map((c, idx) => (
                <tr key={`${c.customerCode}_${c.productCode}`} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-xs text-muted-foreground">{idx + 1}</td>
                  <td className="p-2 text-xs font-medium">{c.customer.substring(0, 12)}</td>
                  <td className="p-2 text-xs">{c.product.substring(0, 12)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(c.sales, true)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(c.grossProfit, true)}</td>
                  <td className={`p-2 text-right text-xs ${c.grossMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.grossMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                    {c.grossMargin.toFixed(1)}%
                  </td>
                  <td className={`p-2 text-right text-xs ${c.opMargin >= 5 ? "text-emerald-600 dark:text-emerald-400" : c.opMargin >= 0 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                    {c.opMargin.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* 거래처 포트폴리오 Top 10 */}
      <ChartCard title="거래처 포트폴리오 Top 10" formula="품목 집중도 = 거래처별 취급 품목 수, 매출총이익율(%) = 매출총이익 ÷ 매출 × 100" description="매출 상위 10개 거래처의 매출, 이익율, 품목 수, 주요 품목을 요약합니다. Top 3 품목은 매출 금액과 이익율을 함께 표시합니다." benchmark="품목 수가 적고 이익율이 높으면 효율적인 거래처, 품목 수가 많고 이익율이 낮으면 조건 재검토 필요">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">거래처</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">이익율</th>
                <th className="p-2 font-medium text-right">품목수</th>
                <th className="p-2 font-medium">Top 3 품목 (매출 / 이익율)</th>
              </tr>
            </thead>
            <tbody>
              {custPortfolio.slice(0, 10).map((c) => (
                <tr key={c.customerCode} className="border-b hover:bg-muted/50">
                  <td className="p-2 font-medium text-xs">{c.customer.substring(0, 15)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(c.totalSales, true)}</td>
                  <td className={`p-2 text-right text-xs ${c.avgGrossMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : c.avgGrossMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                    {c.avgGrossMargin.toFixed(1)}%
                  </td>
                  <td className="p-2 text-right text-xs">{c.productCount}</td>
                  <td className="p-2">
                    <div className="space-y-0.5">
                      {c.topProducts.map((p: any, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-1.5">
                          <span className="font-medium truncate max-w-[120px]" title={p.name}>{p.name || "(미분류)"}</span>
                          <span className="text-muted-foreground">{formatCurrency(p.sales, true)}</span>
                          <span className={p.margin >= 20 ? "text-emerald-600 dark:text-emerald-400" : p.margin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}>
                            {p.margin.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
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
