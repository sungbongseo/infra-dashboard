import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, ReferenceLine,
} from "recharts";
import { Package, TrendingUp, Calendar } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface ProductEntry {
  product: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit?: number;
  operatingMargin?: number;
}

interface CustomerEntry {
  customer: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  operatingMargin: number;
  productCount: number;
}

interface MarginErosionEntry {
  name: string;
  plannedMargin: number;
  actualMargin: number;
  erosion: number;
  sales: number;
  impactAmount: number;
}

interface ProductTabProps {
  productProfitability: ProductEntry[];
  productPieData: Array<{ name: string; fullName: string; value: number; margin: number }>;
  customerProfitability: CustomerEntry[];
  productWeightedGPRate: number;
  marginErosion: MarginErosionEntry[];
  isUsingDateFiltered: boolean;
  profAnalysisIsFallback: boolean;
  dateRange: { from?: string; to?: string } | null;
  hasData: boolean;
}

export function ProductTab({
  productProfitability, productPieData, customerProfitability,
  productWeightedGPRate, marginErosion,
  isUsingDateFiltered, profAnalysisIsFallback, dateRange, hasData,
}: ProductTabProps) {
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 p-12 text-center">
        <Package className="h-12 w-12 text-muted-foreground/50" />
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">수익성 분석 데이터 없음</h3>
          <p className="text-xs text-muted-foreground">
            손익분석 파일을 업로드하면 품목별/거래처별 수익성 분석을 확인할 수 있습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {isUsingDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
        </div>
      )}
      {!isUsingDateFiltered && profAnalysisIsFallback && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
          조직 필터와 일치하는 유효 데이터가 없어 전체 데이터를 표시합니다. 원본 파일의 &apos;영업조직팀&apos; 필드를 확인하세요.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          title="분석 품목 수"
          value={productProfitability.length}
          format="number"
          icon={<Package className="h-5 w-5" />}
          formula="동일 품목명으로 묶은 후 고유 품목 수 합계"
          description="현재 수익성 분석 대상이 되는 전체 품목(제품/상품)의 수입니다. 품목이 많을수록 매출 포트폴리오가 다양합니다."
          benchmark="품목 수가 많을수록 매출 다각화가 되어 있으나, 관리 복잡도도 증가합니다"
        />
        <KpiCard
          title="최고 수익 품목"
          value={productProfitability.length > 0 ? productProfitability[0].grossProfit : 0}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="전체 품목 중 매출총이익(매출 - 원가)이 가장 큰 품목"
          description={productProfitability.length > 0 ? `${productProfitability[0].product} (매출총이익율 ${productProfitability[0].grossMargin.toFixed(1)}%). 이 품목이 전체 이익에 가장 크게 기여하고 있습니다.` : "데이터 없음"}
          benchmark="최고 수익 품목이 전체 이익의 50% 이상이면 제품 집중도가 높아 리스크 관리 필요"
        />
        <KpiCard
          title="가중평균 매출총이익율"
          value={productWeightedGPRate}
          format="percent"
          formula="가중평균 매출총이익율(%) = 전체 매출총이익 합계 ÷ 전체 매출액 합계 × 100"
          description="매출 규모가 큰 품목의 이익율이 더 많이 반영된 평균 이익율입니다. 단순 평균보다 실제 수익 구조를 더 정확하게 보여줍니다."
          benchmark="제조업 평균 20~30%, 30% 이상이면 양호한 제품 포트폴리오"
        />
      </div>

      <ChartCard
        title="품목별 매출총이익 Top 15"
        formula="매출총이익 = 매출액 - 매출원가"
        description="매출총이익이 큰 순서대로 상위 15개 품목을 수평 막대로 보여줍니다. 녹색 막대는 이익을 내는 품목, 빨간색 막대는 원가가 매출보다 커서 손실이 발생하는 품목입니다. 손실 품목은 가격 인상이나 원가 절감 검토가 필요합니다."
        benchmark="양수(녹색)는 이익 품목, 음수(빨간색)는 손실 품목으로 원가 구조 점검 필요"
      >
        <ErrorBoundary>
          <div className="h-80 md:h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={productProfitability.slice(0, 15).map((p) => ({
                  name: p.product.length > 10 ? p.product.substring(0, 10) + "..." : p.product,
                  fullName: p.product,
                  매출총이익: p.grossProfit,
                  매출총이익율: p.grossMargin,
                  매출액: p.sales,
                }))}
                layout="vertical"
                margin={{ left: 90 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={85} />
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                        <p className="font-semibold mb-1">{d.fullName}</p>
                        <p>매출액: {formatCurrency(d.매출액)}</p>
                        <p>매출총이익: {formatCurrency(d.매출총이익)}</p>
                        <p>매출총이익율: {formatPercent(d.매출총이익율)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="매출총이익" name="매출총이익" radius={[0, 4, 4, 0]}>
                  {productProfitability.slice(0, 15).map((p, i) => (
                    <Cell key={i} fill={p.grossProfit >= 0 ? CHART_COLORS[1] : CHART_COLORS[4]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ErrorBoundary>
      </ChartCard>

      <ChartCard
        title="제품 포트폴리오 (매출 비중)"
        formula="매출 비중(%) = 각 품목 매출액 ÷ 전체 매출액 × 100"
        description="전체 매출에서 각 품목이 차지하는 비중을 원형 차트로 보여줍니다. 상위 10개 품목을 표시하며, 나머지는 '기타'로 묶습니다. 특정 품목 의존도가 너무 높으면 리스크가 크므로, 매출 포트폴리오를 다양화하는 것이 안정적입니다."
        benchmark="단일 품목 비중이 30% 이상이면 집중도가 높아 리스크 관리 필요"
      >
        <ErrorBoundary>
          <div className="h-80 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={productPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props: any) => {
                    const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
                    if (percent < 0.03) return null;
                    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                    return (
                      <text
                        x={x}
                        y={y}
                        fill="white"
                        textAnchor={x > cx ? "start" : "end"}
                        dominantBaseline="central"
                        fontSize={11}
                        fontWeight="bold"
                      >
                        {`${(percent * 100).toFixed(0)}%`}
                      </text>
                    );
                  }}
                  outerRadius={120}
                  dataKey="value"
                >
                  {productPieData.map((d, index) => (
                    <Cell key={`cell-${index}`} fill={d.name === "기타" ? "hsl(0, 0%, 60%)" : CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    const totalSales = productProfitability.reduce((s, p) => s + p.sales, 0);
                    const percent = totalSales > 0 ? (d.value / totalSales * 100) : 0;
                    return (
                      <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                        <p className="font-semibold mb-1">{d.fullName}</p>
                        <p>매출액: {formatCurrency(d.value)}</p>
                        <p>비중: {formatPercent(percent, 1)}</p>
                        {d.name !== "기타" && <p>매출총이익율: {formatPercent(d.margin, 1)}</p>}
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{ fontSize: "11px" }}
                  formatter={(value) => (value as string).length > 20 ? (value as string).substring(0, 20) + "..." : value}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ErrorBoundary>
      </ChartCard>

      <ChartCard
        title="거래처별 수익성 분석"
        formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
        description="각 거래처(고객사)별로 매출액, 매출총이익, 영업이익과 각각의 이익율, 취급 품목 수를 표로 정리합니다. 매출은 크지만 이익율이 낮은 거래처는 거래 조건 재협상이 필요하며, 이익율이 높은 거래처는 관계를 강화해야 합니다."
        benchmark="매출총이익율 30% 이상 양호, 영업이익율 10% 이상 양호. 음수 이익율은 거래 손실 발생 중"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium">거래처</th>
                <th className="text-right p-2 font-medium">매출액</th>
                <th className="text-right p-2 font-medium">매출총이익</th>
                <th className="text-right p-2 font-medium">매출총이익율</th>
                <th className="text-right p-2 font-medium">영업이익</th>
                <th className="text-right p-2 font-medium">영업이익율</th>
                <th className="text-center p-2 font-medium">품목 수</th>
              </tr>
            </thead>
            <tbody>
              {customerProfitability.slice(0, 20).map((c, i) => (
                <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-2 text-xs font-medium truncate max-w-[200px]" title={c.customer}>
                    {c.customer}
                  </td>
                  <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.sales, true)}</td>
                  <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.grossProfit, true)}</td>
                  <td className={`p-2 text-right font-mono text-xs ${c.grossMargin >= 30 ? "text-emerald-600 dark:text-emerald-400" : c.grossMargin < 0 ? "text-red-500 dark:text-red-400" : ""}`}>
                    {formatPercent(c.grossMargin)}
                  </td>
                  <td className="p-2 text-right font-mono text-xs">{formatCurrency(c.operatingProfit, true)}</td>
                  <td className={`p-2 text-right font-mono text-xs ${c.operatingMargin >= 10 ? "text-emerald-600 dark:text-emerald-400" : c.operatingMargin < 0 ? "text-red-500 dark:text-red-400" : ""}`}>
                    {formatPercent(c.operatingMargin)}
                  </td>
                  <td className="p-2 text-center text-xs">{c.productCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* 마진 침식 분석 */}
      {marginErosion.length > 0 && (
        <ChartCard
          title="마진 침식 분석 (품목별 Top 20)"
          formula="마진침식 = 실적 매출총이익율 - 계획 매출총이익율"
          description="계획 대비 실적 매출총이익율이 크게 하락한 품목 상위 20개를 보여줍니다. 빨간색(음수)은 계획보다 마진이 악화된 것이며, 원가 상승·가격 하락·제품 믹스 변화 등이 원인일 수 있습니다. 영향액 = 실적매출 × 침식률로, 마진 악화로 인한 추정 이익 손실 금액입니다."
          benchmark="마진 침식이 -5%p 이상이면 긴급 원인 분석이 필요합니다. 가격 재설정, 원가 절감, 또는 해당 품목 전략 재검토를 권장합니다."
        >
          <ErrorBoundary>
            <div className="h-80 md:h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginErosion.slice(0, 20)} layout="vertical" margin={{ left: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis type="category" dataKey="name" width={85} tick={{ fontSize: 9 }} tickFormatter={(v) => String(v).substring(0, 12)} />
                  <RechartsTooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0]?.payload;
                      if (!item) return null;
                      return (
                        <div style={{ ...TOOLTIP_STYLE.contentStyle, padding: 8 }}>
                          <p className="font-semibold text-xs mb-1">{label}</p>
                          <p className="text-xs">계획 이익율: {item.plannedMargin.toFixed(1)}%</p>
                          <p className="text-xs">실적 이익율: {item.actualMargin.toFixed(1)}%</p>
                          <p className={`text-xs ${item.erosion < 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                            침식: {item.erosion > 0 ? "+" : ""}{item.erosion.toFixed(1)}%p
                          </p>
                          <p className="text-xs">매출액: {formatCurrency(item.sales)}</p>
                          <p className="text-xs font-medium">영향액: {formatCurrency(item.impactAmount)}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={0} stroke="hsl(0, 0%, 50%)" />
                  <Bar dataKey="impactAmount" name="영향액" radius={[0, 4, 4, 0]}>
                    {marginErosion.slice(0, 20).map((item, idx) => (
                      <Cell key={idx} fill={item.impactAmount < 0 ? "#ef4444" : "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ErrorBoundary>
        </ChartCard>
      )}
    </>
  );
}
