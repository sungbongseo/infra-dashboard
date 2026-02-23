"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcTopCustomers, calcItemSales, calcSalesByType } from "@/lib/analysis/kpi";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Treemap,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
  Bar,
} from "recharts";
import { DollarSign, Users, BarChart3, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { formatCurrency, filterByOrg, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { useFilterContext, useFilteredSales } from "@/lib/hooks/useFilteredData";
import { ChannelTab } from "./tabs/ChannelTab";
import { RfmTab } from "./tabs/RfmTab";
import { ClvTab } from "./tabs/ClvTab";
import { MigrationTab } from "./tabs/MigrationTab";
import { FxTab } from "./tabs/FxTab";

export default function SalesAnalysisPage() {
  const orgProfit = useDataStore((s) => s.orgProfit);
  const isLoading = useDataStore((s) => s.isLoading);
  const { effectiveOrgNames } = useFilterContext();
  const { filteredSales } = useFilteredSales();

  const topCustomers = useMemo(() => calcTopCustomers(filteredSales, 15), [filteredSales]);
  const itemSales = useMemo(() => calcItemSales(filteredSales), [filteredSales]);
  const salesByType = useMemo(() => calcSalesByType(filteredSales), [filteredSales]);

  // CLV 분석에 필요한 조직별 손익 필터
  const filteredOrgProfit = useMemo(
    () => filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀"),
    [orgProfit, effectiveOrgNames]
  );

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

  if (isLoading) return <PageSkeleton />;
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
          formula="매출리스트의 모든 장부금액을 합산"
          benchmark="전년 동기 대비 10% 이상 성장이면 양호"
          description="선택한 영업조직의 전체 매출 금액 합계입니다. 이 페이지의 모든 분석은 이 금액을 기준으로 산출됩니다."
        />
        <KpiCard
          title="거래처 수"
          value={uniqueCustomers}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="중복 없이 매출처 수를 세기"
          description="실제로 매출이 발생한 고유 거래처(고객사)의 수입니다. 거래처 수가 많을수록 매출 기반이 다양하고, 특정 거래처에 대한 의존도가 낮아집니다."
          benchmark="거래처 수가 전기 대비 증가하면 신규 고객 확보 성과 양호"
        />
        <KpiCard
          title="건당 평균"
          value={avgPerTransaction}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="건당 평균(원) = 총 매출액 ÷ 매출 건수"
          description="매출 1건당 평균 거래 금액입니다. 건당 평균이 높으면 대형 프로젝트 위주의 영업, 낮으면 소규모 거래 위주의 영업 패턴을 의미합니다."
          benchmark="업종 평균 건당 금액 대비 높으면 고부가가치 영업 구조"
        />
        <KpiCard
          title="Top1 거래처 비중"
          value={top1Share}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="Top1 거래처 비중(%) = 1위 거래처 매출 ÷ 총매출 × 100"
          description="매출 1위 거래처가 전체 매출에서 차지하는 비율입니다. 이 수치가 높으면 해당 거래처에 대한 의존도가 크므로, 거래처 이탈 시 매출 급감 위험이 있습니다."
          benchmark="20% 이내이면 안정적 분산, 30% 초과 시 집중 리스크 경고"
        />
      </div>

      <Tabs defaultValue="customer" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="customer">거래처 분석</TabsTrigger>
          <TabsTrigger value="item">품목 분석</TabsTrigger>
          <TabsTrigger value="type">유형별 분석</TabsTrigger>
          <TabsTrigger value="channel">채널 분석</TabsTrigger>
          <TabsTrigger value="rfm">RFM 분석</TabsTrigger>
          <TabsTrigger value="clv">CLV 분석</TabsTrigger>
          <TabsTrigger value="migration">거래처 이동</TabsTrigger>
          <TabsTrigger value="fx">FX 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          <ChartCard
            title="거래처별 매출 (ABC 분석)"
            formula="누적 비율(%) = 누적 매출 ÷ 총 매출 × 100"
            description="거래처를 매출액이 큰 순서대로 나열하고, 누적 비율에 따라 A등급(상위 80%까지), B등급(80~95%), C등급(95~100%)으로 분류합니다. 소수의 핵심 거래처가 대부분의 매출을 차지하는 '파레토 법칙'을 확인할 수 있습니다."
            benchmark="상위 20% 거래처가 매출의 80%를 차지하면 전형적인 파레토 분포 (80:20 법칙)"
            action={<ExportButton data={topCustomersExport} fileName="거래처별매출" />}
          >
            <ChartContainer height="h-72 md:h-96">
                <ComposedChart data={paretoData}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
                    name === "cumPercent" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                  } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                  <Line yAxisId="right" type="monotone" dataKey="cumPercent" stroke={CHART_COLORS[4]} strokeWidth={2} name="누적비율" dot={{ r: 3 }} />
                  {/* ABC 등급 경계선 */}
                  <ReferenceLine yAxisId="right" y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "A (80%)", position: "right", fontSize: 10, fill: "hsl(142, 76%, 36%)" }} />
                  <ReferenceLine yAxisId="right" y={95} stroke="hsl(38, 92%, 50%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "B (95%)", position: "right", fontSize: 10, fill: "hsl(38, 92%, 50%)" }} />
                </ComposedChart>
            </ChartContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="item" className="space-y-6">
          <ChartCard
            title="품목별 매출 비중"
            formula="품목별로 장부금액을 합산하여 비교"
            description="각 품목의 매출 규모를 면적(네모칸) 크기로 보여줍니다. 면적이 클수록 해당 품목의 매출 비중이 높습니다. 상위 20개 품목을 표시하며, 어떤 제품이 매출을 주도하는지 한눈에 파악할 수 있습니다."
            benchmark="특정 품목이 전체 매출의 50% 이상이면 제품 다각화 필요"
          >
            <ChartContainer height="h-72 md:h-96">
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
            </ChartContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="type" className="space-y-6">
          <ChartCard
            title="내수/수출 비중"
            formula="내수와 수출 유형별로 장부금액을 각각 합산"
            description="전체 매출 중 내수(국내 판매)와 수출(해외 판매)의 비율을 도넛 차트로 보여줍니다. 수출 비중이 높으면 환율 변동에 따라 실적이 크게 흔들릴 수 있으므로 환리스크 관리가 중요합니다."
            benchmark="내수와 수출이 적절히 분산되면 안정적, 한쪽 비중이 80% 이상이면 편중 주의"
          >
            <ChartContainer height="h-72 md:h-96">
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
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                </PieChart>
            </ChartContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="channel" className="space-y-6">
          <ChannelTab filteredSales={filteredSales} />
        </TabsContent>

        <TabsContent value="rfm" className="space-y-6">
          <RfmTab filteredSales={filteredSales} />
        </TabsContent>

        <TabsContent value="clv" className="space-y-6">
          <ClvTab filteredSales={filteredSales} filteredOrgProfit={filteredOrgProfit} />
        </TabsContent>

        <TabsContent value="migration" className="space-y-6">
          <MigrationTab filteredSales={filteredSales} />
        </TabsContent>

        <TabsContent value="fx" className="space-y-6">
          <FxTab filteredSales={filteredSales} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
