"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line,
  LabelList,
} from "recharts";
import { AlertTriangle } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcSalesByPaymentTerm,
  calcSalesByCustomerCategory,
  calcSalesByItemCategory,
  detectItemCategoryField,
  groupSmallCategories,
  groupSmallItemCategories,
} from "@/lib/analysis/channel";
import type { SalesRecord } from "@/types";

interface ChannelTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

export function ChannelTab({ filteredSales, isDateFiltered }: ChannelTabProps) {
  const paymentTermSales = useMemo(() => calcSalesByPaymentTerm(filteredSales), [filteredSales]);
  const customerCategorySales = useMemo(
    () => groupSmallCategories(calcSalesByCustomerCategory(filteredSales), 3),
    [filteredSales]
  );
  const itemCategoryField = useMemo(
    () => detectItemCategoryField(filteredSales),
    [filteredSales]
  );
  const itemCategorySales = useMemo(
    () => itemCategoryField
      ? groupSmallItemCategories(calcSalesByItemCategory(filteredSales, itemCategoryField.key), 3)
      : [],
    [filteredSales, itemCategoryField]
  );

  // 결제조건 인사이트
  const channelInsight = useMemo(() => {
    if (paymentTermSales.length === 0) return null;
    const total = paymentTermSales.reduce((s, p) => s + p.amount, 0);
    if (total <= 0) return null;
    const top = paymentTermSales[0];
    const topPct = (top.amount / total) * 100;
    const cashTerms = paymentTermSales.filter((p) => p.term.includes("현금") || p.term.includes("선급") || p.term.includes("선수"));
    const cashPct = cashTerms.reduce((s, p) => s + p.amount, 0) / total * 100;
    return { topTerm: top.term, topPct, cashPct };
  }, [paymentTermSales]);

  if (filteredSales.length === 0) return <EmptyState />;

  return (
    <>
      {channelInsight && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
          <p className="font-medium">결제조건 요약</p>
          <p className="text-muted-foreground">
            최대 비중: {channelInsight.topTerm} ({channelInsight.topPct.toFixed(1)}%)
            {channelInsight.cashPct > 0 && ` | 현금성 결제 비중: ${channelInsight.cashPct.toFixed(1)}%`}
            {channelInsight.cashPct < 20 && " — 외상 비중이 높아 미수금 관리에 유의하세요."}
          </p>
        </div>
      )}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        isEmpty={paymentTermSales.length === 0}
        title="결제조건별 매출 분포"
        formula="결제조건별로 판매금액을 합산하여 비교"
        description="현금, 30일, 60일 등 결제조건별 매출 분포를 보여줍니다."
        benchmark="현금 및 30일 이내 결제 비중이 50% 이상이면 현금흐름 양호"
        reason="결제조건별 매출 분포를 분석하여 현금흐름 영향을 파악하고, 장기 결제조건의 비중 증가를 조기 감지하여 운전자본 관리에 반영합니다."
      >
        <ChartContainer height="h-72 md:h-96">
          <BarChart data={paymentTermSales.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis type="category" dataKey="term" tick={{ fontSize: 11 }} width={75} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                if (name === "매출액") return [formatCurrency(Number(value)), "매출액"];
                return [value, name];
              }}
            />
            <Bar dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        isEmpty={customerCategorySales.length === 0}
        title="거래처소분류별 매출"
        formula="거래처소분류별로 판매금액을 합산하여 비교 (3% 미만은 '기타'로 병합)"
        description="거래처 유형별 매출 비중을 보여줍니다."
        benchmark="단일 거래처 유형 의존도 60% 이하가 바람직"
        reason="거래처 유형별 매출 구성을 파악하여 특정 업종/유형 편중 리스크를 진단하고, 신규 시장 개척 방향을 설정합니다."
      >
        <ChartContainer height="h-72 md:h-96">
          <PieChart>
            <Pie
              data={customerCategorySales}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={130}
              dataKey="amount"
              nameKey="category"
              label={
                customerCategorySales.length <= 8
                  ? (props: any) => {
                      const { cx, cy, midAngle, outerRadius: or, category, share } = props;
                      const RADIAN = Math.PI / 180;
                      const radius = (or || 130) + 25;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="hsl(var(--foreground))"
                          textAnchor={x > cx ? "start" : "end"}
                          dominantBaseline="central"
                          fontSize={11}
                        >
                          {category} {(share || 0).toFixed(1)}%
                        </text>
                      );
                    }
                  : false
              }
            >
              {customerCategorySales.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => formatCurrency(Number(value))}
            />
            {customerCategorySales.length > 8 && <Legend />}
          </PieChart>
        </ChartContainer>
      </ChartCard>

      {itemCategoryField && itemCategorySales.length >= 2 ? (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          isEmpty={false}
          title={`${itemCategoryField.label}별 매출 및 평균 단가`}
          formula={`${itemCategoryField.label}별로 판매금액과 평균 단가를 비교 (3% 미만은 '기타'로 병합)`}
          description={`${itemCategoryField.label}별 매출 규모와 평균 단가를 보여줍니다.`}
          benchmark={`상위 3개 ${itemCategoryField.label} 집중도 70% 이하가 바람직`}
          reason="제품군별 매출 규모와 단가 수준을 비교하여 고마진 제품군의 확대 기회를 발굴하고, 제품군 간 가격 경쟁력을 점검합니다."
        >
          <ChartContainer height="h-72 md:h-96">
            <ComposedChart data={itemCategorySales}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={80} />
              <YAxis
                yAxisId="amount"
                orientation="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
                label={{ value: "매출액", angle: -90, position: "insideLeft", style: { fontSize: 12 } }}
              />
              <YAxis
                yAxisId="price"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                label={{ value: "평균단가", angle: 90, position: "insideRight", style: { fontSize: 12 } }}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => {
                  if (name === "매출액") return formatCurrency(Number(value));
                  if (name === "평균단가") return `${formatCurrency(Number(value))}/개`;
                  return value;
                }}
              />
              <Legend />
              <Bar yAxisId="amount" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={[8, 8, 0, 0]} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                <LabelList
                  dataKey="share"
                  position="top"
                  formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                  style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
              </Bar>
              <Line yAxisId="price" type="monotone" dataKey="avgUnitPrice" stroke={CHART_COLORS[3]} strokeWidth={2} name="평균단가" dot={{ r: 4 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>
      ) : (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          isEmpty={true}
          title="제품군별 매출 및 평균 단가"
          description="매출리스트에 2종 이상의 제품군/대분류/중분류 데이터가 있을 때 표시됩니다."
        >
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>제품군·대분류·중분류·소분류·품목범주·계정구분 중 2종 이상의 값을 가진 필드가 없어 분류별 비교 분석을 표시할 수 없습니다.</span>
          </div>
        </ChartCard>
      )}
    </>
  );
}
