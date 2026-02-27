"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
  Cell,
  ReferenceLine,
} from "recharts";
import { BarChart3, Calendar, Layers, Building2 } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcParetoAnalysis,
  calcProductGroupAnalysis,
  calcOrgProductSummary,
} from "@/lib/analysis/detailedProfitAnalysis";
import type { CustomerItemDetailRecord } from "@/types";

interface DetailedProfitTabProps {
  data: CustomerItemDetailRecord[];
  isDateFiltered?: boolean;
  dateRange?: { from: string; to: string } | null;
}

type ParetoDimension = "customer" | "product";
type ParetoMetric = "sales" | "grossProfit" | "operatingProfit";

const DIMENSION_LABELS: Record<ParetoDimension, string> = {
  customer: "거래처",
  product: "품목",
};

const METRIC_LABELS: Record<ParetoMetric, string> = {
  sales: "매출액",
  grossProfit: "매출총이익",
  operatingProfit: "영업이익",
};

export default function DetailedProfitTab({ data, isDateFiltered, dateRange }: DetailedProfitTabProps) {
  const [dimension, setDimension] = useState<ParetoDimension>("product");
  const [metric, setMetric] = useState<ParetoMetric>("sales");

  // Pareto analysis
  const paretoItems = useMemo(
    () => calcParetoAnalysis(data, dimension, metric),
    [data, dimension, metric]
  );

  // Product group analysis
  const productGroups = useMemo(
    () => calcProductGroupAnalysis(data),
    [data]
  );

  // Org product summary
  const orgSummary = useMemo(
    () => calcOrgProductSummary(data),
    [data]
  );

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BarChart3 className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-sm">거래처별 품목별 손익(100) 데이터를 업로드하면 상세 수익 분석을 확인할 수 있습니다.</p>
      </div>
    );
  }

  const aCount = paretoItems.filter((i) => i.grade === "A").length;
  const bCount = paretoItems.filter((i) => i.grade === "B").length;
  const cCount = paretoItems.filter((i) => i.grade === "C").length;

  return (
    <>
      {isDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          기간 필터 적용 중 -- 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
        </div>
      )}

      {/* Pareto KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title={`A등급 ${DIMENSION_LABELS[dimension]}`}
          value={aCount}
          format="number"
          icon={<BarChart3 className="h-5 w-5" />}
          description={`${METRIC_LABELS[metric]} 기준 누적 80%를 차지하는 핵심 ${DIMENSION_LABELS[dimension]} 수입니다.`}
          formula={`${METRIC_LABELS[metric]} 기준 내림차순 정렬 후 누적비중 80%까지 = A등급`}
          benchmark="A등급이 전체의 20% 이하이면 전형적인 파레토(80/20) 패턴"
          reason="핵심 A등급 항목을 식별하여 품질·재고·가격 관리의 최우선 대상을 결정하고, 매출 집중도가 높은 항목의 리스크를 사전에 관리합니다"
        />
        <KpiCard
          title={`B등급 ${DIMENSION_LABELS[dimension]}`}
          value={bCount}
          format="number"
          icon={<BarChart3 className="h-5 w-5" />}
          description={`${METRIC_LABELS[metric]} 기준 누적 80~95%에 해당하는 중요 ${DIMENSION_LABELS[dimension]} 수입니다.`}
          formula={`${METRIC_LABELS[metric]} 기준 내림차순 정렬 후 누적비중 80~95% = B등급`}
          benchmark="B등급은 성장 잠재력을 가진 육성 대상으로 검토"
          reason="B등급 항목 중 A등급으로 성장 가능한 후보를 발굴하여 매출 포트폴리오를 강화하고, 집중 육성 대상을 선정합니다"
        />
        <KpiCard
          title={`C등급 ${DIMENSION_LABELS[dimension]}`}
          value={cCount}
          format="number"
          icon={<BarChart3 className="h-5 w-5" />}
          description={`${METRIC_LABELS[metric]} 기준 누적 95~100%의 기타 ${DIMENSION_LABELS[dimension]}입니다.`}
          formula={`${METRIC_LABELS[metric]} 기준 내림차순 정렬 후 누적비중 95~100% = C등급`}
          benchmark="C등급이 과도하면 관리 비용 대비 수익이 낮아 정리 검토"
          reason="C등급 항목의 관리 비용 대비 수익 기여도를 평가하여 품목 정리(단종·통합) 또는 조건 재협상의 대상을 결정합니다"
        />
        <KpiCard
          title="제품군 수"
          value={productGroups.length}
          format="number"
          icon={<Layers className="h-5 w-5" />}
          description="데이터에 포함된 고유 제품군 수입니다."
          formula="거래처별품목별 손익 데이터에서 제품군 중복 제거 후 집계"
          benchmark="제품군별 수익성 편차가 크면 포트폴리오 재구성 검토"
          reason="제품군 수와 구성을 파악하여 사업 다각화 수준을 평가하고, 특정 제품군 의존도가 높은 경우 포트폴리오 재구성 필요성을 진단합니다"
        />
      </div>

      {/* Pareto ABC Chart */}
      <ChartCard
        title={`파레토(ABC) 분석 - ${DIMENSION_LABELS[dimension]}별 ${METRIC_LABELS[metric]}`}
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula={`${METRIC_LABELS[metric]} 기준 내림차순 정렬 -> 누적비중 80%=A, 95%=B, 100%=C`}
        description={`${DIMENSION_LABELS[dimension]}을 ${METRIC_LABELS[metric]} 기여도 순으로 정렬하고 누적 비중을 표시합니다. A등급이 전체의 80%를 차지하며 집중 관리가 필요합니다.`}
        benchmark="일반적으로 20%의 항목이 80%의 가치를 차지합니다 (파레토 법칙)"
        reason="파레토 분석을 통해 매출·이익의 핵심 동인을 시각적으로 파악하고, 자원 배분의 우선순위를 데이터 기반으로 결정하여 경영 효율을 극대화합니다"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Dimension selector */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(["product", "customer"] as ParetoDimension[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDimension(d)}
                  className={`px-2.5 py-1 transition-colors ${
                    dimension === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {DIMENSION_LABELS[d]}
                </button>
              ))}
            </div>
            {/* Metric selector */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(["sales", "grossProfit", "operatingProfit"] as ParetoMetric[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-2.5 py-1 transition-colors ${
                    metric === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {METRIC_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <ChartContainer height="h-64 md:h-80">
          <ComposedChart data={paretoItems.slice(0, 30)}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => truncateLabel(String(v), 8)}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => formatCurrency(v, true)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
              domain={[0, 100]}
            />
            <RechartsTooltip
              formatter={(v: any, name: any) =>
                name === "누적비중(%)"
                  ? `${Number(v).toFixed(1)}%`
                  : formatCurrency(Number(v))
              }
              {...TOOLTIP_STYLE}
            />
            <Legend />
            <Bar
              dataKey="value"
              name={METRIC_LABELS[metric]}
              radius={BAR_RADIUS_TOP}
              activeBar={ACTIVE_BAR}
              {...ANIMATION_CONFIG}
            >
              {paretoItems.slice(0, 30).map((item, idx) => (
                <Cell
                  key={idx}
                  fill={
                    item.grade === "A"
                      ? CHART_COLORS[0]
                      : item.grade === "B"
                        ? CHART_COLORS[5]
                        : CHART_COLORS[6]
                  }
                />
              ))}
            </Bar>
            <Line
              type="monotone"
              dataKey="cumShare"
              name="누적비중(%)"
              stroke={CHART_COLORS[4]}
              strokeWidth={2}
              yAxisId="right"
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2 }}
              {...ANIMATION_CONFIG}
            />
            <ReferenceLine
              y={80}
              yAxisId="right"
              stroke="#f97316"
              strokeDasharray="5 5"
              label={{ value: "80%", position: "right", fontSize: 10 }}
            />
            <ReferenceLine
              y={95}
              yAxisId="right"
              stroke="#ef4444"
              strokeDasharray="5 5"
              label={{ value: "95%", position: "right", fontSize: 10 }}
            />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      {/* Product Group Table */}
      <ChartCard
        title="제품군별 수익 분석"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="제품군별 매출액/매출원가/매출총이익/영업이익 집계, 이익율 = 이익 / 매출 x 100"
        description="제품군별로 매출, 원가, 이익, 마진율, 내수/수출 비중, 품목/거래처 수를 요약합니다."
        benchmark="제품군별 매출총이익율 편차가 10%p 이상이면 가격 전략 점검 필요"
        reason="제품군별 수익 구조를 비교하여 고수익 제품군 확대와 저수익 제품군의 가격·원가 개선 방향을 결정하고, 제품 포트폴리오 최적화 전략을 수립합니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">제품군</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">매출원가</th>
                <th className="p-2 font-medium text-right">매출총이익</th>
                <th className="p-2 font-medium text-right">이익율</th>
                <th className="p-2 font-medium text-right">영업이익</th>
                <th className="p-2 font-medium text-right">영업이익율</th>
                <th className="p-2 font-medium text-right">수출비중</th>
                <th className="p-2 font-medium text-right">품목수</th>
                <th className="p-2 font-medium text-right">거래처수</th>
                <th className="p-2 font-medium text-right">계획달성</th>
              </tr>
            </thead>
            <tbody>
              {productGroups.map((g) => (
                <tr key={g.group} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-xs font-medium">{g.group}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(g.sales, true)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(g.cost, true)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(g.grossProfit, true)}</td>
                  <td
                    className={`p-2 text-right text-xs ${
                      g.grossMargin >= 20
                        ? "text-emerald-600 dark:text-emerald-400"
                        : g.grossMargin >= 10
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {formatPercent(g.grossMargin)}
                  </td>
                  <td className="p-2 text-right text-xs">{formatCurrency(g.operatingProfit, true)}</td>
                  <td
                    className={`p-2 text-right text-xs ${
                      g.opMargin >= 5
                        ? "text-emerald-600 dark:text-emerald-400"
                        : g.opMargin >= 0
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {formatPercent(g.opMargin)}
                  </td>
                  <td className="p-2 text-right text-xs">{formatPercent(g.exportRatio)}</td>
                  <td className="p-2 text-right text-xs">{g.productCount}</td>
                  <td className="p-2 text-right text-xs">{g.customerCount}</td>
                  <td
                    className={`p-2 text-right text-xs ${
                      g.planAchievement >= 100
                        ? "text-emerald-600 dark:text-emerald-400"
                        : g.planAchievement >= 80
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {g.planAchievement > 0 ? formatPercent(g.planAchievement) : "-"}
                  </td>
                </tr>
              ))}
              {productGroups.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-4 text-center text-xs text-muted-foreground">
                    제품군 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Org Product Summary Table */}
      <ChartCard
        title="조직별 품목/거래처 요약"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="영업조직팀별 매출액/매출총이익 합산, 고유 품목/거래처 수 집계, 내수비중 = 내수매출 / 총매출 x 100"
        description="각 영업조직의 매출 규모, 이익율, 취급 품목/거래처 수, 최대 매출 품목/거래처를 한눈에 파악합니다."
        benchmark="조직별 품목 집중도와 거래처 다변화 수준을 비교하여 리스크 분산 정도를 평가"
        reason="조직별 품목·거래처 구성을 비교하여 특정 품목이나 거래처에 과도하게 의존하는 조직을 식별하고, 리스크 분산 및 조직별 영업 전략의 방향성을 제시합니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">영업조직</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">매출총이익</th>
                <th className="p-2 font-medium text-right">이익율</th>
                <th className="p-2 font-medium text-right">품목수</th>
                <th className="p-2 font-medium text-right">거래처수</th>
                <th className="p-2 font-medium">최대 매출 품목</th>
                <th className="p-2 font-medium">최대 매출 거래처</th>
                <th className="p-2 font-medium text-right">내수비중</th>
              </tr>
            </thead>
            <tbody>
              {orgSummary.map((o) => (
                <tr key={o.org} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-xs font-medium">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {o.org}
                    </div>
                  </td>
                  <td className="p-2 text-right text-xs">{formatCurrency(o.totalSales, true)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(o.totalGrossProfit, true)}</td>
                  <td
                    className={`p-2 text-right text-xs ${
                      o.grossMargin >= 20
                        ? "text-emerald-600 dark:text-emerald-400"
                        : o.grossMargin >= 10
                          ? "text-amber-500 dark:text-amber-400"
                          : "text-red-500 dark:text-red-400"
                    }`}
                  >
                    {formatPercent(o.grossMargin)}
                  </td>
                  <td className="p-2 text-right text-xs">{o.productCount}</td>
                  <td className="p-2 text-right text-xs">{o.customerCount}</td>
                  <td className="p-2 text-xs truncate max-w-[140px]" title={o.topProduct}>
                    {o.topProduct || "-"}
                  </td>
                  <td className="p-2 text-xs truncate max-w-[140px]" title={o.topCustomer}>
                    {o.topCustomer || "-"}
                  </td>
                  <td className="p-2 text-right text-xs">{formatPercent(o.domesticRatio)}</td>
                </tr>
              ))}
              {orgSummary.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-xs text-muted-foreground">
                    조직별 요약 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
