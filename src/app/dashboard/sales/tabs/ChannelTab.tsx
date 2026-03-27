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
import { calcItemPriceBand } from "@/lib/analysis/itemPriceBand";
import { DataTable } from "@/components/dashboard/DataTable";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { DollarSign, TrendingDown, BarChart3 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { ItemPriceBand } from "@/lib/analysis/itemPriceBand";
import type { SalesRecord } from "@/types";

interface ChannelTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

export function ChannelTab({ filteredSales, isDateFiltered }: ChannelTabProps) {
  const priceBand = useMemo(() => calcItemPriceBand(filteredSales), [filteredSales]);
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
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
          <p className="font-medium">결제조건 요약</p>
          <p className="text-muted-foreground">
            최대 비중: {channelInsight.topTerm} ({isFinite(channelInsight.topPct) ? channelInsight.topPct.toFixed(1) : "0.0"}%)
            {channelInsight.cashPct > 0 && ` | 현금성 결제 비중: ${isFinite(channelInsight.cashPct) ? channelInsight.cashPct.toFixed(1) : "0.0"}%`}
          </p>
          {/* 조건부 전략 가이드 */}
          <div className="mt-2 space-y-1.5 text-xs">
            {channelInsight.cashPct < 20 && (
              <p className="text-amber-700 dark:text-amber-400">
                <strong>⚠ 현금 결제 비중 낮음:</strong> 미수금 증가 우려. 30일 이내 결제 조건 협상 또는 조기결제 인센티브 검토가 필요합니다.
              </p>
            )}
            {channelInsight.topPct > 70 && (
              <p className="text-amber-700 dark:text-amber-400">
                <strong>⚠ 결제조건 편중:</strong> {channelInsight.topTerm}에 {isFinite(channelInsight.topPct) ? channelInsight.topPct.toFixed(0) : "0"}% 집중. 현금흐름 변동성 감축을 위해 결제조건 다각화를 검토하세요.
              </p>
            )}
          </div>
        </div>
      )}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        isEmpty={paymentTermSales.length === 0}
        title="결제조건별 매출 분포"
        formula="결제조건별로 판매금액을 합산하여 비교"
        description="현금, 30일, 60일 등 결제조건별 매출 분포를 보여줍니다. 3% 미만 항목은 '기타'로 통합됩니다. 결제조건별 실제 수금 소요일은 '미수금 관리 > 수금지연' 탭에서 확인 가능합니다."
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
                          {category} {isFinite(share) ? (share || 0).toFixed(1) : "0.0"}%
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
                tickFormatter={(v) => `${isFinite(v / 1000) ? (v / 1000).toFixed(0) : "0"}K`}
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
                  formatter={(v: any) => `${isFinite(Number(v)) ? Number(v).toFixed(1) : "0.0"}%`}
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

      {/* 품목별 단가 밴드 분석 */}
      {priceBand.totalItems > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="분석 품목 수"
              value={priceBand.totalItems}
              format="number"
              icon={<BarChart3 className="h-5 w-5" />}
              formula="판매단가 > 0 이고 수량 > 0 인 거래의 고유 품목 수"
              description="단가 분석이 가능한 품목의 수입니다."
            />
            <KpiCard
              title="평균 단가편차율"
              value={priceBand.avgVariationRate}
              format="percent"
              icon={<TrendingDown className="h-5 w-5" />}
              formula="각 품목의 (Q3단가 - Q1단가) / 중앙값단가 × 100 의 평균"
              description="거래처별로 동일 품목의 단가가 얼마나 차이나는지를 보여줍니다. 높을수록 가격정책이 분산되어 있습니다."
              benchmark="10% 미만이면 균일 가격, 20% 초과이면 가격정책 점검 필요"
            />
            <KpiCard
              title="단가편차 20%+ 품목"
              value={priceBand.highVariationCount}
              format="number"
              icon={<DollarSign className="h-5 w-5" />}
              formula="단가편차율이 20%를 초과하는 품목 수"
              description="거래처마다 단가 차이가 큰 품목입니다. 가격 정책을 재검토하거나, 특별 단가 사유를 확인해야 합니다."
            />
          </div>

          {priceBand.highVariationCount > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>단가편차 점검 필요:</strong> {priceBand.highVariationCount}개 품목에서 거래처간 단가 편차가 20%를 초과합니다. 아래 테이블에서 상세 단가 밴드를 확인하세요.
              </p>
            </div>
          )}

          <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
            title="품목별 단가 밴드 분석"
            formula="가중평균 = Σ매출금액 / Σ수량, 중앙값 = 거래건별 단가 정렬 중간값, 편차율 = (Q3-Q1)/중앙값 × 100"
            description="동일 품목이 거래처마다 다른 가격으로 판매되므로, 표준판매단가 대신 가중평균·중앙값·사분위수를 산출하여 '대표 단가'와 '가격 편차'를 파악합니다. 편차율이 높은 품목은 가격정책을 점검하세요."
            benchmark="편차율 10% 미만: 균일 가격, 10~20%: 정상 범위, 20% 초과: 가격정책 점검"
          >
            <DataTable
              columns={[
                {
                  accessorKey: "품목명",
                  header: "품목",
                  cell: ({ row }: any) => (
                    <span className="font-medium max-w-[160px] truncate block" title={row.original.품목명}>
                      {row.original.품목명}
                    </span>
                  ),
                },
                {
                  accessorKey: "단위",
                  header: "단위",
                  cell: ({ row }: any) => <span className="text-muted-foreground">{row.original.단위}</span>,
                },
                {
                  accessorKey: "거래처수",
                  header: () => <span className="block text-right">거래처</span>,
                  cell: ({ row }: any) => <span className="block text-right tabular-nums">{row.original.거래처수}</span>,
                },
                {
                  accessorKey: "가중평균단가",
                  header: () => <span className="block text-right">가중평균</span>,
                  cell: ({ row }: any) => <span className="block text-right tabular-nums font-medium">{row.original.가중평균단가.toLocaleString()}</span>,
                },
                {
                  accessorKey: "중앙값단가",
                  header: () => <span className="block text-right">중앙값</span>,
                  cell: ({ row }: any) => <span className="block text-right tabular-nums">{row.original.중앙값단가.toLocaleString()}</span>,
                },
                {
                  accessorKey: "최저단가",
                  header: () => <span className="block text-right">최저</span>,
                  cell: ({ row }: any) => <span className="block text-right tabular-nums text-muted-foreground">{row.original.최저단가.toLocaleString()}</span>,
                },
                {
                  accessorKey: "최고단가",
                  header: () => <span className="block text-right">최고</span>,
                  cell: ({ row }: any) => <span className="block text-right tabular-nums text-muted-foreground">{row.original.최고단가.toLocaleString()}</span>,
                },
                {
                  accessorKey: "단가편차율",
                  header: () => <span className="block text-right">편차율</span>,
                  cell: ({ row }: any) => {
                    const v = row.original.단가편차율;
                    return (
                      <span className={`block text-right tabular-nums font-medium ${v > 20 ? "text-red-600 dark:text-red-400" : v > 10 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {v}%
                      </span>
                    );
                  },
                },
                {
                  accessorKey: "총매출액",
                  header: () => <span className="block text-right">매출액</span>,
                  cell: ({ row }: any) => <span className="block text-right tabular-nums">{formatCurrency(row.original.총매출액, true)}</span>,
                },
              ] as ColumnDef<ItemPriceBand, any>[]}
              data={priceBand.items.slice(0, 30)}
            />
          </ChartCard>
        </>
      )}
    </>
  );
}
