import { ChartCard } from "@/components/dashboard/ChartCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PieChart, Pie,
  Tooltip as RechartsTooltip, Cell,
} from "recharts";
import { ChartContainer } from "@/components/charts";
import { Package } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { RepProductPortfolio } from "@/lib/analysis/profiling";

interface ProductTabProps {
  hasCustomerItemDetail: boolean;
  productPortfolio: RepProductPortfolio | null;
  isDateFiltered?: boolean;
}

export function ProductTab({ hasCustomerItemDetail, productPortfolio, isDateFiltered }: ProductTabProps) {
  if (!hasCustomerItemDetail) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          거래처별 품목별 손익(100) 데이터가 업로드되지 않아 제품 포트폴리오 분석을 수행할 수 없습니다.
        </p>
      </div>
    );
  }

  if (!productPortfolio) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          선택된 영업사원의 품목 데이터가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">취급 품목 수</p>
            </div>
            <p className="text-2xl font-bold">{productPortfolio.totalProducts}</p>
            <p className="text-xs text-muted-foreground">{productPortfolio.totalProductGroups}개 제품군</p>
            <p className="text-[10px] text-muted-foreground mt-1">취급 제품이 5종 이하이면 리스크 집중, 다양할수록 안정적</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">품목 집중도 (HHI)</p>
            <p className="text-2xl font-bold">{productPortfolio.productConcentrationHHI.toFixed(3)}</p>
            <Badge variant={productPortfolio.productConcentrationHHI > 0.25 ? "destructive" : productPortfolio.productConcentrationHHI > 0.15 ? "warning" : "success"} className="text-[10px] mt-1">
              {productPortfolio.productConcentrationHHI > 0.25 ? "집중" : productPortfolio.productConcentrationHHI > 0.15 ? "적정" : "분산"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">가중평균 마진</p>
            <p className={`text-2xl font-bold ${productPortfolio.avgMarginByProduct >= 20 ? "text-emerald-600 dark:text-emerald-400" : productPortfolio.avgMarginByProduct >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
              {productPortfolio.avgMarginByProduct.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">매출총이익율</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Top 품목</p>
            <p className="text-sm font-bold truncate">{productPortfolio.topProducts[0]?.productName || "-"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              비중 {(productPortfolio.topProducts[0]?.sharePercent ?? 0).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="품목별 매출 비중 (Top 10)"
        formula="매출 비중(%) = 품목 매출액 ÷ 담당자 총 매출 × 100"
        description="영업사원별 제품 구성 비율을 보여줍니다. 다양한 제품을 균형 있게 판매하면 시장 변동에 따른 리스크가 분산됩니다."
        benchmark="단일 제품 의존도가 50% 이상이면 포트폴리오 분산 필요"
        reason="영업사원별 제품 포트폴리오를 분석하여 특정 제품 편중을 파악하고, 크로스셀링 기회를 발굴합니다."
      >
        <ChartContainer height="h-72 md:h-96">
            <PieChart>
              <Pie
                data={productPortfolio.topProducts.slice(0, 10).map((p) => ({ name: p.productName || p.product, value: Math.round(p.sharePercent * 10) / 10 }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={120}
                label={(props: any) => `${props.name} ${props.value}%`}
              >
                {productPortfolio.topProducts.slice(0, 10).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${v}%`} />
            </PieChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="품목별 수익성 분석"
        formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
        description="각 품목의 매출액, 매출총이익, 이익율을 정리합니다. 매출은 크지만 이익율이 낮은 품목은 가격 또는 원가 구조 개선이 필요합니다."
        benchmark="매출총이익율 25% 이상이면 양호, 10% 미만이면 가격 또는 원가 재검토 필요"
        reason="품목별 수익성을 비교하여 고마진 제품 확대와 저마진 제품의 가격·원가 개선 전략을 수립합니다."
        action={<ExportButton data={productPortfolio.productMix.map((p) => ({
          품목: p.product, 품목명: p.productName, 제품군: p.productGroup,
          매출액: p.salesAmount, 매출총이익: p.grossProfit,
          매출총이익율: p.grossMarginRate, 매출비중: p.sharePercent,
        }))} fileName="제품포트폴리오" />}
      >
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left">
                <th className="p-2 font-medium">품목명</th>
                <th className="p-2 font-medium">제품군</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">매출총이익</th>
                <th className="p-2 font-medium text-right">이익율</th>
                <th className="p-2 font-medium text-right">비중</th>
              </tr>
            </thead>
            <tbody>
              {productPortfolio.productMix.slice(0, 30).map((p, i) => (
                <tr key={i} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-xs truncate max-w-[200px]">{p.productName || p.product}</td>
                  <td className="p-2 text-xs">{p.productGroup}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(p.salesAmount, true)}</td>
                  <td className="p-2 text-right text-xs">{formatCurrency(p.grossProfit, true)}</td>
                  <td className={`p-2 text-right text-xs font-medium ${p.grossMarginRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : p.grossMarginRate >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{p.grossMarginRate.toFixed(1)}%</td>
                  <td className="p-2 text-right text-xs">{p.sharePercent.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
