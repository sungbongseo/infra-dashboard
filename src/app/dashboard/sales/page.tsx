"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { calcTopCustomers, calcItemSales, calcSalesByType } from "@/lib/analysis/kpi";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Treemap,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
} from "recharts";
import { DollarSign, Users, BarChart3, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { formatCurrency, filterByOrg, CHART_COLORS } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";

export default function SalesAnalysisPage() {
  const { salesList, orgNames } = useDataStore();

  const filteredSales = useMemo(() => filterByOrg(salesList, orgNames), [salesList, orgNames]);

  const topCustomers = useMemo(() => calcTopCustomers(filteredSales, 15), [filteredSales]);
  const itemSales = useMemo(() => calcItemSales(filteredSales), [filteredSales]);
  const salesByType = useMemo(() => calcSalesByType(filteredSales), [filteredSales]);

  const topCustomersExport = useMemo(
    () => topCustomers.map((c) => ({ 거래처코드: c.code, 거래처명: c.name, 매출액: c.amount })),
    [topCustomers]
  );

  const paretoData = useMemo(() => {
    const total = topCustomers.reduce((s, c) => s + c.amount, 0);
    let cum = 0;
    return topCustomers.map((c) => {
      cum += c.amount;
      return {
        name: c.name || c.code,
        amount: c.amount,
        cumPercent: total > 0 ? (cum / total) * 100 : 0,
      };
    });
  }, [topCustomers]);

  const donutData = useMemo(() => [
    { name: "내수", value: salesByType.domestic },
    { name: "수출", value: salesByType.exported },
  ], [salesByType]);

  const treemapData = useMemo(() =>
    itemSales.slice(0, 20).map((item) => ({
      name: item.name,
      size: item.amount,
    })),
    [itemSales]
  );

  // KPI 데이터
  const totalSalesAmount = useMemo(() => filteredSales.reduce((s, r) => s + r.장부금액, 0), [filteredSales]);
  const uniqueCustomers = useMemo(() => new Set(filteredSales.map(r => r.매출처).filter(Boolean)).size, [filteredSales]);
  const avgPerTransaction = filteredSales.length > 0 ? totalSalesAmount / filteredSales.length : 0;
  const top1Share = useMemo(() => {
    if (topCustomers.length === 0 || totalSalesAmount === 0) return 0;
    return (topCustomers[0].amount / totalSalesAmount) * 100;
  }, [topCustomers, totalSalesAmount]);

  if (filteredSales.length === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">매출 분석</h2>
        <p className="text-muted-foreground">거래처/품목별 매출 상세 분석</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 매출액"
          value={totalSalesAmount}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          formula="SUM(매출리스트.장부금액)"
          description="필터링된 조직의 전체 매출 합계입니다."
        />
        <KpiCard
          title="거래처 수"
          value={uniqueCustomers}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="DISTINCT COUNT(매출처)"
          description="매출이 발생한 고유 거래처 수입니다."
        />
        <KpiCard
          title="건당 평균"
          value={avgPerTransaction}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="총 매출액 / 매출 건수"
          description="매출 건당 평균 금액입니다."
        />
        <KpiCard
          title="Top1 거래처 비중"
          value={top1Share}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="Top1 거래처 매출 / 총매출 × 100"
          description="최대 거래처의 매출 집중도입니다. 높을수록 의존도가 큽니다."
          benchmark="20% 이내 안정, 30% 초과 시 리스크"
        />
      </div>

      <Tabs defaultValue="customer" className="space-y-4">
        <TabsList>
          <TabsTrigger value="customer">거래처 분석</TabsTrigger>
          <TabsTrigger value="item">품목 분석</TabsTrigger>
          <TabsTrigger value="type">유형별 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          <ChartCard
            title="거래처별 매출 (ABC 분석)"
            formula="누적비율 = 누적매출 / 총매출 × 100"
            description="거래처를 매출액 기준으로 정렬하여 누적 비율을 계산합니다. A등급(~80%), B등급(80~95%), C등급(95~100%)으로 분류합니다."
            benchmark="상위 20% 거래처가 80% 매출 차지 시 전형적 파레토 분포"
            action={<ExportButton data={topCustomersExport} fileName="거래처별매출" />}
          >
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <RechartsTooltip formatter={(value: any, name: any) =>
                    name === "cumPercent" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                  } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cumPercent" stroke={CHART_COLORS[4]} strokeWidth={2} name="누적비율" dot={{ r: 3 }} />
                  {/* ABC 등급 경계선 */}
                  <ReferenceLine yAxisId="right" y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "A (80%)", position: "right", fontSize: 10, fill: "hsl(142, 76%, 36%)" }} />
                  <ReferenceLine yAxisId="right" y={95} stroke="hsl(38, 92%, 50%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "B (95%)", position: "right", fontSize: 10, fill: "hsl(38, 92%, 50%)" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="item" className="space-y-6">
          <ChartCard
            title="품목별 매출 비중"
            formula="SUM(장부금액) GROUP BY 품목명"
            description="품목별 매출 규모를 면적으로 시각화합니다. 큰 면적일수록 매출 비중이 높은 품목입니다."
            benchmark="특정 품목 의존도가 50% 이상이면 리스크 분산 필요"
          >
            <div className="h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  stroke="hsl(var(--background))"
                  content={(props: any) => {
                    const { x, y, width, height, name, value } = props;
                    if (width < 40 || height < 25) return <g />;
                    return (
                      <g>
                        <rect x={x} y={y} width={width} height={height} fill={CHART_COLORS[0]} opacity={0.85} rx={4} />
                        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>
                          {String(name).length > 8 ? String(name).substring(0, 8) + "..." : name}
                        </text>
                        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>
                          {formatCurrency(value, true)}
                        </text>
                      </g>
                    );
                  }}
                />
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="type" className="space-y-6">
          <ChartCard
            title="내수/수출 비중"
            formula="SUM(장부금액) GROUP BY 수주유형(내수/수출)"
            description="내수와 수출 매출의 구성 비율을 보여줍니다. 수출 비중이 높을수록 환율 리스크가 커집니다."
            benchmark="내수/수출 균형 유지가 안정적"
          >
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}
                    outerRadius={140}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
