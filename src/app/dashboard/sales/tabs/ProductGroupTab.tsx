"use client";

import { useState, useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ReferenceLine,
  Cell,
  ZAxis,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ChartContainer,
  GRID_PROPS,
  ANIMATION_CONFIG,
  getMarginColor,
} from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  detectBestClassification,
  calcGroupPortfolio,
  calcGroupFactoryMatrix,
  calcGroupConcentration,
  calcGroupTrend,
} from "@/lib/analysis/productGroupAnalysis";
import type { ClassificationField } from "@/lib/analysis/productGroupAnalysis";
import type { CustomerItemDetailRecord } from "@/types";

interface ProductGroupTabProps {
  filteredCustomerItemDetail: CustomerItemDetailRecord[];
  isDateFiltered?: boolean;
}

const QUADRANT_COLORS: Record<string, string> = {
  star: "hsl(142, 76%, 36%)",
  cashcow: "hsl(221, 83%, 53%)",
  question: "hsl(38, 92%, 50%)",
  dog: "hsl(0, 84%, 60%)",
};

const HEATMAP_COLOR = (margin: number) => {
  if (margin >= 30) return "bg-green-200 dark:bg-green-900/60 text-green-900 dark:text-green-100";
  if (margin >= 20) return "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200";
  if (margin >= 10) return "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-200";
  if (margin >= 0) return "bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200";
  return "bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-100";
};

export function ProductGroupTab({
  filteredCustomerItemDetail,
  isDateFiltered,
}: ProductGroupTabProps) {
  // 0. 스마트 분류 탐지
  const classification = useMemo(
    () => detectBestClassification(filteredCustomerItemDetail),
    [filteredCustomerItemDetail],
  );
  const [activeField, setActiveField] = useState<ClassificationField | null>(null);
  const field = activeField || classification.best.field;

  // 1. 그룹 포트폴리오
  const portfolio = useMemo(
    () => calcGroupPortfolio(filteredCustomerItemDetail, field),
    [filteredCustomerItemDetail, field],
  );

  // 2. 집중도
  const concentration = useMemo(
    () => calcGroupConcentration(portfolio),
    [portfolio],
  );

  // 3. 그룹×공장 교차
  const factoryMatrix = useMemo(
    () => calcGroupFactoryMatrix(filteredCustomerItemDetail, field),
    [filteredCustomerItemDetail, field],
  );

  // 4. 월별 트렌드
  const { trendData, groupNames } = useMemo(
    () => calcGroupTrend(filteredCustomerItemDetail, field),
    [filteredCustomerItemDetail, field],
  );

  // 5. 버블 차트 데이터 (4사분면)
  const bubbleData = useMemo(() => {
    if (portfolio.length < 2) return { data: [], medianSales: 0, medianMargin: 0 };
    const salesArr = portfolio.map((p) => p.sales).sort((a, b) => a - b);
    const marginArr = portfolio.map((p) => p.grossMargin).sort((a, b) => a - b);
    const medianSales = salesArr[Math.floor(salesArr.length / 2)];
    const medianMargin = marginArr[Math.floor(marginArr.length / 2)];
    const data = portfolio.map((p) => {
      const quadrant =
        p.sales >= medianSales && p.grossMargin >= medianMargin ? "star"
        : p.sales >= medianSales && p.grossMargin < medianMargin ? "cashcow"
        : p.sales < medianSales && p.grossMargin >= medianMargin ? "question"
        : "dog";
      return { ...p, quadrant };
    });
    return { data, medianSales, medianMargin };
  }, [portfolio]);

  // KPI
  const avgGrossMargin = useMemo(() => {
    const totalSales = portfolio.reduce((s, p) => s + p.sales, 0);
    const totalGP = portfolio.reduce((s, p) => s + p.grossProfit, 0);
    return totalSales !== 0 ? (totalGP / totalSales) * 100 : 0;
  }, [portfolio]);

  if (filteredCustomerItemDetail.length === 0) {
    return <EmptyState requiredFiles={["거래처별 품목별 손익(100)"]} />;
  }

  const currentOption = classification.all.find((o) => o.field === field)!;

  return (
    <>
      {/* 0. 분류 기준 배너 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
        <span className="font-medium text-muted-foreground">분류 기준:</span>
        {classification.all.map((opt) => (
          <button
            key={opt.field}
            onClick={() => setActiveField(opt.field)}
            disabled={opt.uniqueCount < 3}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              opt.field === field
                ? "bg-primary text-primary-foreground"
                : "bg-background hover:bg-muted border"
            } ${opt.uniqueCount < 3 ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {opt.label} ({opt.uniqueCount}종, {(opt.fillRate * 100).toFixed(0)}%)
          </button>
        ))}
        {currentOption.uniqueCount < 3 && (
          <span className="text-xs text-orange-600 dark:text-orange-400">
            ⚠ 고유값이 {currentOption.uniqueCount}개로 분석 다양성이 낮습니다
          </span>
        )}
      </div>

      {/* 1. KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="그룹 수"
          value={concentration.groupCount}
          format="number"
          formula={`${currentOption.label} 기준 유효 그룹 수 (매출 > 0)`}
          benchmark="10~30개 수준이면 적정한 포트폴리오 다각화"
        />
        <KpiCard
          title="매출 집중도 (HHI)"
          value={concentration.hhi}
          format="number"
          formula="HHI = Σ(그룹별 매출 비중²) × 10,000"
          benchmark="1,500 이하: 분산, 1,500~2,500: 보통, 2,500 초과: 높은 집중"
          description={concentration.interpretation}
        />
        <KpiCard
          title="상위 3개 비중"
          value={concentration.top3Share}
          format="percent"
          formula="상위 3개 그룹 매출 합계 / 전체 매출 × 100"
          benchmark="60% 이하면 분산 양호, 80% 초과면 의존도 주의"
        />
        <KpiCard
          title="가중평균 매출총이익률"
          value={avgGrossMargin}
          format="percent"
          formula="전체 매출총이익 / 전체 매출액 × 100"
          benchmark="20% 이상 양호, 10% 미만 원가 재검토"
        />
      </div>

      {/* 2. 그룹 포트폴리오 버블 차트 */}
      <ChartCard
        title={`${currentOption.label}별 포트폴리오 매트릭스`}
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        isEmpty={bubbleData.data.length < 2}
        formula="X축=매출액, Y축=매출총이익률(%), 버블 크기=거래처 수. 중앙값 기준 4사분면"
        description="각 품목군을 매출 규모와 수익성 두 축으로 배치하여, 전략적 포지셔닝을 파악합니다. 우상단(Star)은 고매출·고마진, 좌하단(Dog)은 저매출·저마진 그룹입니다."
        benchmark="Star(우상단) 비중이 높을수록 건강한 포트폴리오"
        reason="그룹 수준의 전략적 자원 배분과 투자 우선순위를 결정합니다."
      >
        <ChartContainer height="h-72 md:h-96">
          <ScatterChart>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="sales"
              type="number"
              name="매출액"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => formatCurrency(v, true)}
            />
            <YAxis
              dataKey="grossMargin"
              type="number"
              name="매출총이익률"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
              unit="%"
            />
            <ZAxis dataKey="customerCount" range={[60, 400]} name="거래처 수" />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                const n = String(name);
                if (n === "매출총이익률") return `${Number(value).toFixed(1)}%`;
                if (n === "매출액") return formatCurrency(Number(value));
                return String(value);
              }}
              labelFormatter={(label: any) => {
                const item = bubbleData.data.find((d) => d.sales === label);
                return item ? item.group : String(label);
              }}
            />
            {bubbleData.medianSales > 0 && (
              <ReferenceLine
                x={bubbleData.medianSales}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            <ReferenceLine
              y={bubbleData.medianMargin}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
            <Scatter data={bubbleData.data} {...ANIMATION_CONFIG}>
              {bubbleData.data.map((entry, i) => (
                <Cell key={i} fill={QUADRANT_COLORS[entry.quadrant]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ChartContainer>
        {/* 사분면 범례 */}
        <div className="flex flex-wrap justify-center gap-4 mt-2 text-xs text-muted-foreground">
          <span><span className="inline-block w-3 h-3 rounded-full mr-1" style={{ background: QUADRANT_COLORS.star }} />Star (고매출·고마진)</span>
          <span><span className="inline-block w-3 h-3 rounded-full mr-1" style={{ background: QUADRANT_COLORS.cashcow }} />Cash Cow (고매출·저마진)</span>
          <span><span className="inline-block w-3 h-3 rounded-full mr-1" style={{ background: QUADRANT_COLORS.question }} />Question (저매출·고마진)</span>
          <span><span className="inline-block w-3 h-3 rounded-full mr-1" style={{ background: QUADRANT_COLORS.dog }} />Dog (저매출·저마진)</span>
        </div>
      </ChartCard>

      {/* 3. 그룹×공장 히트맵 */}
      {factoryMatrix.factories.length > 0 && factoryMatrix.groups.length > 0 && (
        <ChartCard
          title={`${currentOption.label} × 공장 수익성 교차 분석`}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="각 셀 = 해당 품목군이 해당 공장에서 달성한 매출총이익률(%)"
          description="품목군(행)과 공장(열)의 교차표로, 어떤 공장이 어떤 품목군에서 높은 수익성을 보이는지 한눈에 파악합니다."
          benchmark="매출총이익률 20% 이상: 녹색(양호), 10% 미만: 주황~빨강(개선필요)"
          reason="공장-품목군 조합별 수익성을 비교하여, 생산 배치 최적화와 원가 개선 타겟을 식별합니다."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="py-2 px-2 text-left font-medium sticky left-0 bg-background z-10">
                    {currentOption.label}
                  </th>
                  {factoryMatrix.factories.map((f) => (
                    <th key={f} className="py-2 px-2 text-center font-medium min-w-[80px]">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factoryMatrix.groups.map((g) => (
                  <tr key={g} className="border-b border-border/30">
                    <td className="py-1.5 px-2 font-medium truncate max-w-[120px] sticky left-0 bg-background z-10">
                      {g}
                    </td>
                    {factoryMatrix.factories.map((f) => {
                      const cell = factoryMatrix.cells.find(
                        (c) => c.group === g && c.factory === f,
                      );
                      if (!cell || cell.sales === 0) {
                        return (
                          <td key={f} className="py-1.5 px-2 text-center text-muted-foreground">
                            -
                          </td>
                        );
                      }
                      return (
                        <td
                          key={f}
                          className={`py-1.5 px-2 text-center font-medium rounded-sm ${HEATMAP_COLOR(cell.grossMargin)}`}
                          title={`매출: ${formatCurrency(cell.sales)}, 이익률: ${cell.grossMargin.toFixed(1)}%`}
                        >
                          {cell.grossMargin.toFixed(1)}%
                          <div className="text-[10px] opacity-70">
                            {formatCurrency(cell.sales, true)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}

      {/* 4. 그룹별 매출 트렌드 */}
      {trendData.length > 1 && (
        <ChartCard
          title={`${currentOption.label}별 월별 매출 트렌드`}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="상위 5개 그룹의 월별 매출액 추이 (나머지는 '기타'로 합산)"
          description="주요 품목군의 월별 매출 변동을 누적 영역 차트로 표시하여, 성장·쇠퇴 트렌드와 계절성을 파악합니다."
          benchmark="특정 그룹 비중이 급변하면 시장 변화 또는 내부 전략 변경 시그널"
          reason="품목군별 성장률 차이를 시각화하여, 성장 품목군 투자 확대 및 쇠퇴 품목군 대응 전략을 수립합니다."
        >
          <ChartContainer height="h-64 md:h-80">
            <AreaChart data={trendData}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: any) => formatCurrency(v, true)}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
              <Legend />
              {groupNames.map((g, i) => (
                <Area
                  key={g}
                  type="monotone"
                  dataKey={g}
                  stackId="1"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.6}
                  {...ANIMATION_CONFIG}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* 5. 그룹 수익성 요약 테이블 */}
      {portfolio.length > 0 && (
        <ChartCard
          title={`${currentOption.label}별 수익성 요약`}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="매출총이익률(%) = 매출총이익 / 매출액 × 100"
          description="각 품목군의 매출 비중, 수익성, 거래처·품목 수를 종합적으로 정리합니다."
          benchmark="매출총이익률 20% 이상 양호, 10% 미만 원가 재검토. 영업이익률 5% 이상 목표"
          reason="품목군별 수익성을 한눈에 비교하여 고마진/저마진 품목군을 식별하고, 전략적 포트폴리오를 구성합니다."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-3 font-medium">{currentOption.label}</th>
                  <th className="py-2 px-3 font-medium text-right">매출액</th>
                  <th className="py-2 px-3 font-medium text-right">비중</th>
                  <th className="py-2 px-3 font-medium text-right">매출총이익률</th>
                  <th className="py-2 px-3 font-medium text-right">영업이익률</th>
                  <th className="py-2 px-3 font-medium text-right">거래처</th>
                  <th className="py-2 px-3 font-medium text-right">품목</th>
                  <th className="py-2 px-3 font-medium text-right">건수</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((d) => (
                  <tr key={d.group} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-1.5 px-3 font-medium">{d.group}</td>
                    <td className="py-1.5 px-3 text-right">{formatCurrency(d.sales)}</td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">
                      {isFinite(d.salesShare) ? d.salesShare.toFixed(1) : "0"}%
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(d.grossMargin)}`}>
                      {isFinite(d.grossMargin) ? d.grossMargin.toFixed(1) : "0"}%
                    </td>
                    <td className={`py-1.5 px-3 text-right font-medium ${getMarginColor(d.operatingMargin)}`}>
                      {isFinite(d.operatingMargin) ? d.operatingMargin.toFixed(1) : "0"}%
                    </td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">
                      {d.customerCount}
                    </td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">
                      {d.productCount}
                    </td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">
                      {d.count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </>
  );
}
