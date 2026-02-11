"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ShoppingCart, TrendingUp, Clock, Package, ArrowRightLeft, Wallet, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent, filterByOrg, filterByDateRange, extractMonth, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcO2CPipeline, calcMonthlyConversion, type O2CPipelineResult } from "@/lib/analysis/pipeline";
import { ExportButton } from "@/components/dashboard/ExportButton";

export default function OrdersAnalysisPage() {
  const { orderList, salesList, collectionList, orgNames } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredOrders = useMemo(() => {
    const byOrg = filterByOrg(orderList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "수주일");
  }, [orderList, effectiveOrgNames, dateRange]);
  const filteredSales = useMemo(() => {
    const byOrg = filterByOrg(salesList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "매출일");
  }, [salesList, effectiveOrgNames, dateRange]);
  const filteredCollections = useMemo(() => {
    const byOrg = filterByOrg(collectionList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "수금일");
  }, [collectionList, effectiveOrgNames, dateRange]);

  const monthlyOrders = useMemo(() => {
    const map = new Map<string, { month: string; 수주금액: number; 수주건수: number }>();
    for (const r of filteredOrders) {
      const m = extractMonth(r.수주일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주금액: 0, 수주건수: 0 };
      entry.수주금액 += r.장부금액;
      entry.수주건수 += 1;
      map.set(m, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredOrders]);

  const orderTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrders) {
      const type = r.수주유형명 || r.수주유형 || "기타";
      map.set(type, (map.get(type) || 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredOrders]);

  const totalOrders = filteredOrders.reduce((s, r) => s + r.장부금액, 0);
  const totalSales = filteredSales.reduce((s, r) => s + r.장부금액, 0);
  const conversionRate = totalOrders > 0 ? (totalSales / totalOrders) * 100 : 0;
  const outstandingOrders = totalOrders - totalSales;

  // 조직별 수주 분석
  const orgOrders = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredOrders) {
      const org = r.영업조직 || "미분류";
      map.set(org, (map.get(org) || 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .map(([org, amount]) => ({ org, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredOrders]);

  // 수주→매출 전환 갭 (월별)
  const monthlyGap = useMemo(() => {
    const map = new Map<string, { month: string; 수주: number; 매출: number }>();
    for (const r of filteredOrders) {
      const m = extractMonth(r.수주일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주: 0, 매출: 0 };
      entry.수주 += r.장부금액;
      map.set(m, entry);
    }
    for (const r of filteredSales) {
      const m = extractMonth(r.매출일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주: 0, 매출: 0 };
      entry.매출 += r.장부금액;
      map.set(m, entry);
    }
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((d) => ({
        ...d,
        갭: d.수주 - d.매출,
        전환율: d.수주 > 0 ? (d.매출 / d.수주) * 100 : 0,
      }));
  }, [filteredOrders, filteredSales]);

  const leadTimes = useMemo(() => {
    const bins = new Map<string, number>();
    for (const r of filteredOrders) {
      if (!r.수주일 || !r.납품요청일) continue;
      const orderDate = new Date(r.수주일);
      const deliveryDate = new Date(r.납품요청일);
      if (isNaN(orderDate.getTime()) || isNaN(deliveryDate.getTime())) continue;
      const days = Math.round((deliveryDate.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));
      let bin = "";
      if (days <= 7) bin = "~7일";
      else if (days <= 14) bin = "~14일";
      else if (days <= 30) bin = "~30일";
      else if (days <= 60) bin = "~60일";
      else if (days <= 90) bin = "~90일";
      else bin = "90일+";
      bins.set(bin, (bins.get(bin) || 0) + 1);
    }
    const order = ["~7일", "~14일", "~30일", "~60일", "~90일", "90일+"];
    return order.map((bin) => ({ bin, count: bins.get(bin) || 0 }));
  }, [filteredOrders]);

  // O2C 파이프라인 데이터
  const pipelineResult = useMemo(
    () => calcO2CPipeline(filteredOrders, filteredSales, filteredCollections),
    [filteredOrders, filteredSales, filteredCollections]
  );
  const pipelineStages = pipelineResult.stages;

  const monthlyConversion = useMemo(
    () => calcMonthlyConversion(filteredOrders, filteredSales, filteredCollections),
    [filteredOrders, filteredSales, filteredCollections]
  );

  // O2C KPI 값 계산
  const orderToSalesRate = pipelineStages.find((s) => s.stage === "매출전환")?.percentage ?? 0;
  const salesToCollectionRate = useMemo(() => {
    const totalSalesAmt = filteredSales.reduce((s, r) => s + r.장부금액, 0);
    // 순수 수금율: 선수금 제외한 순수 수금액 / 매출액
    const netCollAmt = pipelineResult.netCollections;
    return totalSalesAmt > 0 ? (netCollAmt / totalSalesAmt) * 100 : 0;
  }, [filteredSales, pipelineResult]);
  const outstandingAmount = pipelineStages.find((s) => s.stage === "미수잔액")?.amount ?? 0;

  // 퍼널 차트 데이터 (수평 바 차트)
  const funnelData = useMemo(() => {
    const stageColors = [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[4]];
    return pipelineStages.map((s, i) => ({
      stage: s.stage,
      금액: s.amount,
      비율: s.percentage,
      건수: s.count,
      fill: stageColors[i],
    }));
  }, [pipelineStages]);

  if (isLoading) return <PageSkeleton />;
  if (filteredOrders.length === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">수주 분석</h2>
        <p className="text-muted-foreground">수주 파이프라인 및 전환율 분석</p>
      </div>

      <div className="flex items-center justify-between">
        <div />
        <ExportButton
          data={filteredOrders.map((r) => ({
            수주일: r.수주일,
            영업조직: r.영업조직,
            수주유형: r.수주유형명 || r.수주유형 || "",
            판매처: r.판매처명 || r.판매처 || "",
            장부금액: r.장부금액,
            납품요청일: r.납품요청일 || "",
          }))}
          fileName="수주분석"
          sheetName="수주 데이터"
        />
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="status">수주 현황</TabsTrigger>
          <TabsTrigger value="analysis">수주 분석</TabsTrigger>
          <TabsTrigger value="org">조직 분석</TabsTrigger>
          <TabsTrigger value="pipeline">O2C 파이프라인</TabsTrigger>
          <TabsTrigger value="o2c-flow">O2C 플로우</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 수주액"
              value={totalOrders}
              format="currency"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="수주 리스트의 모든 장부금액을 합산"
              description="인프라 사업본부 담당 조직이 고객으로부터 주문받은 총 금액입니다. 수주는 매출이 발생하기 전 단계로, 향후 매출로 전환될 예정인 파이프라인입니다."
              benchmark="매출액 대비 수주액이 100% 이상이면 파이프라인 양호"
            />
            <KpiCard
              title="수주에서 매출 전환율"
              value={conversionRate}
              format="percent"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="수주→매출 전환율(%) = 총 매출액 ÷ 총 수주액 × 100"
              description="수주한 금액 중 실제로 매출(출고/납품)로 전환된 비율입니다. 100%를 초과하면 이전 기간에 수주했던 물량이 금기에 매출로 반영된 것을 의미합니다."
              benchmark="80~120% 범위가 정상적인 수준입니다"
            />
            <KpiCard
              title="미출고 수주잔"
              value={outstandingOrders > 0 ? outstandingOrders : 0}
              format="currency"
              icon={<Package className="h-5 w-5" />}
              formula="미출고 수주잔(원) = 총 수주액 − 총 매출액"
              description="고객이 주문했지만 아직 출고(납품)되지 않은 금액입니다. 이 금액이 크면 향후 매출로 전환될 여지가 많다는 뜻이지만, 납기 관리에 주의가 필요합니다."
              benchmark="수주잔이 월 매출의 1~3배이면 적정, 과다하면 납기 지연 리스크"
            />
            <KpiCard
              title="수주 건수"
              value={filteredOrders.length}
              format="number"
              icon={<Clock className="h-5 w-5" />}
              formula="기간 내 수주 리스트의 총 건수"
              description="분석 기간 내에 접수된 총 수주 건수입니다. 건수와 금액을 함께 보면 건당 평균 수주 규모를 파악할 수 있습니다."
              benchmark="전기 대비 건수가 증가하면 영업 활동 활발, 건수는 줄고 금액이 늘면 대형화 추세"
            />
          </div>

          <ChartCard
            title="월별 수주 추이"
            formula="월별 수주 건수와 수주 금액(장부금액 합계)을 각각 집계"
            description="매월 수주가 얼마나 들어왔는지 건수(선)와 금액(막대)으로 보여줍니다. 건수 대비 금액이 유난히 높은 달은 대형 수주가 포함된 것입니다."
            benchmark="수주 금액이 매출 금액과 동등하거나 높으면 파이프라인이 양호한 상태입니다"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyOrders}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
                    name === "수주건수" ? `${value}건` : formatCurrency(Number(value))
                  } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="수주금액" fill={CHART_COLORS[1]} name="수주금액" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="수주건수" stroke={CHART_COLORS[4]} strokeWidth={2} name="수주건수" dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <ChartCard
            title="수주유형별 분석"
            formula="수주유형(내수/수출/프로젝트 등)별 장부금액 합계"
            description="수주를 유형별로 나누어 금액 비중을 보여줍니다. 어떤 유형의 수주가 주력인지, 특정 유형에 지나치게 의존하고 있지는 않은지 확인할 수 있습니다."
            benchmark="단일 수주유형 의존도가 70% 이상이면 포트폴리오 다변화를 검토하세요"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderTypes.slice(0, 6)}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={130}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                  >
                    {orderTypes.slice(0, 6).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="납품 리드타임 분포"
            formula="리드타임(일) = 납품요청일 − 수주일"
            description="주문을 받은 날부터 납품을 요청받은 날까지 며칠이 걸리는지 구간별로 보여줍니다. 리드타임이 짧은 건이 많으면 긴급 납품 부담이 크고, 긴 건이 많으면 장기 프로젝트 비중이 높다는 뜻입니다."
            benchmark="30일 이내가 일반적인 납품 기간이며, 90일 이상은 장기 프로젝트로 분류됩니다"
          >
            <div className="h-56 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadTimes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => `${value}건`} />
                  <Bar dataKey="count" fill={CHART_COLORS[2]} name="건수" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <ChartCard
            title="조직별 수주 비중"
            formula="영업조직별 장부금액 합계를 구한 뒤 금액 순으로 정렬"
            description="영업조직별 수주 금액 순위를 보여줍니다. 특정 조직에 수주가 지나치게 집중되어 있다면 매출 리스크를 분산하는 전략이 필요합니다."
            benchmark="상위 3개 조직이 전체 수주의 60% 이상이면 집중도가 높은 편입니다"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={orgOrders.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                  />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 11 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any) => formatCurrency(Number(value))}
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} name="수주액" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="월별 수주 vs 매출 전환 갭"
            formula="갭(원) = 수주금액 − 매출금액\n양수이면 수주잔고가 쌓이는 중, 음수이면 과거 수주를 소진하는 중"
            description="매월 수주금액과 매출금액의 차이를 비교합니다. 갭이 양수이면 주문이 매출보다 많아 수주잔고가 늘어나는 것이고, 음수이면 과거에 받은 주문을 납품하며 잔고를 줄이고 있다는 뜻입니다."
            benchmark="갭이 꾸준히 양수이면 매출 파이프라인이 건전한 상태입니다"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyGap}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                  />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) =>
                      name === "전환율" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                    }
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="수주" fill={CHART_COLORS[1]} name="수주" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="매출" fill={CHART_COLORS[0]} name="매출" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="전환율"
                    stroke={CHART_COLORS[4]}
                    strokeWidth={2}
                    name="전환율"
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              title="수주에서 매출 전환율"
              value={orderToSalesRate}
              format="percent"
              icon={<ArrowRightLeft className="h-5 w-5" />}
              formula="수주→매출 전환율(%) = 총 매출액 ÷ 총 수주액 × 100"
              description="수주한 금액이 실제 매출(출고/납품)로 얼마나 전환되었는지 보여줍니다. 100%를 초과하면 이전 기간 수주분이 금기 매출로 반영된 것입니다."
              benchmark="80~120%가 정상 범위이며, 이 범위를 벗어나면 수주-매출 시차를 점검해야 합니다"
            />
            <KpiCard
              title="순수 수금율 (선수금 제외)"
              value={salesToCollectionRate}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="순수 수금율(%) = (총 수금액 − 선수금) ÷ 총 매출액 × 100"
              description={`발생한 매출 중 실제 매출 대금으로 수금된 비율입니다 (선수금 ${formatCurrency(pipelineResult.prepaymentAmount)} 제외). 선수금은 아직 매출이 발생하지 않은 선입금이므로 O2C 흐름에서 분리합니다.`}
              benchmark="90% 이상이면 양호, 80% 미만이면 수금 활동을 강화해야 합니다"
            />
            <KpiCard
              title="미수잔액"
              value={outstandingAmount}
              format="currency"
              icon={<AlertCircle className="h-5 w-5" />}
              formula="미수잔액(원) = 총 매출액 − 순수 수금액 (선수금 제외, 0 미만이면 0)"
              description="매출이 발생했지만 아직 거래처로부터 돈을 받지 못한 금액입니다. 선수금을 제외한 순수 수금 기준으로 계산하여 실제 미수 규모를 정확히 보여줍니다."
              benchmark="매출 대비 20% 이하이면 양호한 수준입니다"
            />
          </div>

          <ChartCard
            title="O2C(주문-수금) 퍼널: 수주에서 매출, 수금까지"
            formula="수주금액에서 매출전환금액, 순수수금완료금액(선수금 제외), 미수잔액 순서로 표시"
            description="O2C(주문-수금 프로세스)의 전체 흐름을 퍼널(깔때기) 형태로 보여줍니다. 수금완료는 선수금을 제외한 순수 수금액입니다. 선수금은 아직 매출이 발생하지 않은 선입금이므로 O2C 흐름에서 분리하여 미수잔액을 정확히 산출합니다."
            benchmark="각 단계 전환율이 80% 이상이면 건전한 O2C(주문-수금) 프로세스입니다"
          >
            <div className="h-56 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={funnelData}
                  layout="vertical"
                  margin={{ left: 20, right: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                  />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    tick={{ fontSize: 12, fontWeight: 500 }}
                    width={70}
                  />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) => {
                      if (name === "금액") return formatCurrency(Number(value));
                      return value;
                    }}
                    labelFormatter={(label) => `단계: ${label}`}
                  />
                  <Bar
                    dataKey="금액"
                    name="금액"
                    radius={[0, 4, 4, 0]}
                    label={({ x, y, width: w, height: h, value, index }: any) => {
                      const stage = funnelData[index];
                      return (
                        <text
                          x={x + w + 6}
                          y={y + h / 2}
                          fill="currentColor"
                          textAnchor="start"
                          dominantBaseline="middle"
                          className="text-xs fill-muted-foreground"
                        >
                          {formatCurrency(Number(value), true)} ({(isFinite(stage.비율) ? stage.비율 : 0).toFixed(1)}%)
                        </text>
                      );
                    }}
                  >
                    {funnelData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="월별 O2C(주문-수금) 전환 추이"
            formula="전환율(%) = 매출 ÷ 수주 × 100\n수금율(%) = 수금 ÷ 매출 × 100"
            description="매월 수주/매출/수금 금액(막대)과 전환율/수금율(선)을 함께 보여줍니다. 두 비율이 안정적으로 높게 유지되면 주문에서 수금까지의 흐름이 건전하다는 의미입니다."
            benchmark="전환율과 수금율 모두 80% 이상으로 안정 유지되면 양호합니다"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyConversion}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => formatCurrency(v, true)}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    domain={[0, 200]}
                    allowDataOverflow={true}
                  />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) => {
                      if (name === "전환율" || name === "수금율") return `${Number(value).toFixed(1)}%`;
                      return formatCurrency(Number(value));
                    }}
                  />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="수주"
                    fill={CHART_COLORS[0]}
                    name="수주"
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="매출"
                    fill={CHART_COLORS[1]}
                    name="매출"
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="수금"
                    fill={CHART_COLORS[2]}
                    name="수금"
                    radius={[4, 4, 0, 0]}
                    opacity={0.8}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="전환율"
                    stroke={CHART_COLORS[4]}
                    strokeWidth={2}
                    name="전환율"
                    dot={{ r: 3 }}
                    strokeDasharray="0"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="수금율"
                    stroke={CHART_COLORS[3]}
                    strokeWidth={2}
                    name="수금율"
                    dot={{ r: 3 }}
                    strokeDasharray="5 5"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="o2c-flow" className="space-y-6">
          <ChartCard
            title="O2C(주문-수금) 플로우 다이어그램"
            formula="수주금액에서 매출전환(전환율%), 수금완료(수금율%), 미수잔액으로 분기"
            description="주문에서 수금까지의 전체 흐름을 시각적으로 표현합니다. 수주가 매출로 전환되고, 매출이 수금 완료와 미수잔액으로 나뉘는 과정을 보여줍니다. 화살표가 굵을수록 해당 경로의 금액 비중이 큽니다."
            benchmark="전환율 80% 이상, 수금율 90% 이상이면 양호한 O2C(주문-수금) 흐름입니다"
          >
            <O2CFlowDiagram stages={pipelineStages} salesToCollectionRate={salesToCollectionRate} prepaymentAmount={pipelineResult.prepaymentAmount} grossCollections={pipelineResult.grossCollections} />
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── O2C 플로우 다이어그램 컴포넌트 ─── */

interface O2CFlowDiagramProps {
  stages: O2CPipelineResult["stages"];
  salesToCollectionRate: number;
  prepaymentAmount: number;
  grossCollections: number;
}

function O2CFlowDiagram({ stages, salesToCollectionRate, prepaymentAmount, grossCollections }: O2CFlowDiagramProps) {
  const orderStage = stages.find((s) => s.stage === "수주");
  const salesStage = stages.find((s) => s.stage === "매출전환");
  const collectionStage = stages.find((s) => s.stage === "수금완료");
  const outstandingStage = stages.find((s) => s.stage === "미수잔액");

  if (!orderStage || !salesStage || !collectionStage || !outstandingStage) return null;

  const orderAmt = orderStage.amount;
  const salesAmt = salesStage.amount;
  const collAmt = collectionStage.amount;
  const outAmt = outstandingStage.amount;

  const convRate = salesStage.percentage;
  const collRate = salesToCollectionRate;
  const outRate = salesAmt > 0 ? (outAmt / salesAmt) * 100 : 0;

  // 화살표 굵기 계산 (최소 4, 최대 28)
  const maxAmt = Math.max(orderAmt, 1);
  const arrowW = (amt: number) => Math.max(4, Math.min(28, (amt / maxAmt) * 28));

  // 상태 색상
  const colors = {
    order: CHART_COLORS[0],
    sales: CHART_COLORS[1],
    collection: CHART_COLORS[2],
    outstanding: CHART_COLORS[4],
  };

  // 건전성 배지 색상
  const healthColor = (rate: number, threshold: number) =>
    rate >= threshold ? "hsl(142.1, 76.2%, 36.3%)" : rate >= threshold * 0.8 ? "hsl(38, 92%, 50%)" : "hsl(0, 84.2%, 60.2%)";

  return (
    <div className="py-4">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "수주", amount: orderAmt, rate: null, color: colors.order, sub: null },
          { label: "매출전환", amount: salesAmt, rate: convRate, color: colors.sales, sub: null },
          { label: "수금완료 (순수)", amount: collAmt, rate: collRate, color: colors.collection, sub: null },
          { label: "선수금", amount: prepaymentAmount, rate: null, color: CHART_COLORS[3], sub: `총수금 ${formatCurrency(grossCollections, true)}` },
          { label: "미수잔액", amount: outAmt, rate: outRate, color: colors.outstanding, sub: null },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-lg border p-3 text-center"
            style={{ borderLeftWidth: 4, borderLeftColor: item.color }}
          >
            <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
            <div className="text-sm font-bold">{formatCurrency(item.amount, true)}</div>
            {item.rate !== null && (
              <div className="text-xs mt-0.5" style={{ color: item.label === "미수잔액" ? healthColor(100 - item.rate, 80) : healthColor(item.rate, item.label === "수금완료 (순수)" ? 90 : 80) }}>
                {item.rate.toFixed(1)}%
              </div>
            )}
            {item.sub && (
              <div className="text-[10px] mt-0.5 text-muted-foreground">{item.sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* SVG 플로우 다이어그램 */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 820 360"
          className="w-full min-w-[600px]"
          style={{ maxHeight: 400 }}
          role="img"
          aria-label="O2C 플로우 다이어그램: 수주에서 매출전환, 수금완료, 미수잔액으로의 흐름"
        >
          <defs>
            {/* 화살표 마커 */}
            <marker id="arrowGreen" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill={colors.sales} />
            </marker>
            <marker id="arrowPurple" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill={colors.collection} />
            </marker>
            <marker id="arrowRed" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
              <path d="M0,0 L10,4 L0,8 Z" fill={colors.outstanding} />
            </marker>

            {/* 그라데이션 */}
            <linearGradient id="flowGrad1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.order} stopOpacity="0.6" />
              <stop offset="100%" stopColor={colors.sales} stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="flowGrad2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={colors.sales} stopOpacity="0.6" />
              <stop offset="100%" stopColor={colors.collection} stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="flowGrad3" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.sales} stopOpacity="0.5" />
              <stop offset="100%" stopColor={colors.outstanding} stopOpacity="0.5" />
            </linearGradient>

            {/* 박스 그림자 */}
            <filter id="boxShadow" x="-5%" y="-5%" width="110%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* ─── 연결 화살표 (배경에 먼저 렌더) ─── */}

          {/* 수주 → 매출전환: 수평 흐름 */}
          <path
            d="M200,120 L310,120"
            fill="none"
            stroke="url(#flowGrad1)"
            strokeWidth={arrowW(salesAmt)}
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M200,120 L308,120"
            fill="none"
            stroke={colors.sales}
            strokeWidth="2"
            markerEnd="url(#arrowGreen)"
            opacity="0.9"
          />

          {/* 매출전환 → 수금완료: 우상 흐름 */}
          <path
            d={`M510,105 C560,105 570,75 620,75`}
            fill="none"
            stroke="url(#flowGrad2)"
            strokeWidth={arrowW(collAmt)}
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d={`M510,105 C560,105 570,75 618,75`}
            fill="none"
            stroke={colors.collection}
            strokeWidth="2"
            markerEnd="url(#arrowPurple)"
            opacity="0.9"
          />

          {/* 매출전환 → 미수잔액: 우하 분기 */}
          <path
            d={`M510,140 C560,140 570,255 620,255`}
            fill="none"
            stroke="url(#flowGrad3)"
            strokeWidth={arrowW(outAmt)}
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d={`M510,140 C560,140 570,255 618,255`}
            fill="none"
            stroke={colors.outstanding}
            strokeWidth="2"
            markerEnd="url(#arrowRed)"
            opacity="0.9"
            strokeDasharray="6 3"
          />

          {/* ─── 전환율 라벨 (화살표 위) ─── */}

          {/* 수주→매출 전환율 */}
          <rect x="222" y="88" width="66" height="22" rx="11" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          <text x="255" y="103" textAnchor="middle" className="text-[11px] font-semibold" fill={colors.sales}>
            {formatPercent(convRate, 1)}
          </text>

          {/* 매출→수금 수금율 */}
          <rect x="536" y="58" width="66" height="22" rx="11" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          <text x="569" y="73" textAnchor="middle" className="text-[11px] font-semibold" fill={colors.collection}>
            {formatPercent(collRate, 1)}
          </text>

          {/* 미수 비율 */}
          <rect x="536" y="225" width="66" height="22" rx="11" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" />
          <text x="569" y="240" textAnchor="middle" className="text-[11px] font-semibold" fill={colors.outstanding}>
            {formatPercent(outRate, 1)}
          </text>

          {/* ─── 노드 박스 ─── */}

          {/* 수주 */}
          <g filter="url(#boxShadow)">
            <rect x="20" y="80" width="180" height="80" rx="14" fill="hsl(var(--card))" stroke={colors.order} strokeWidth="2.5" />
            <rect x="20" y="80" width="180" height="28" rx="14" fill={colors.order} opacity="0.12" />
            <rect x="20" y="80" width="180" height="28" rx="14" fill="none" stroke={colors.order} strokeWidth="2.5" />
            <text x="110" y="100" textAnchor="middle" className="text-xs font-bold" fill={colors.order}>수주</text>
            <text x="110" y="128" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(orderAmt, true)}
            </text>
            <text x="110" y="148" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {orderStage.count.toLocaleString()}건 · 100%
            </text>
          </g>

          {/* 매출전환 */}
          <g filter="url(#boxShadow)">
            <rect x="310" y="80" width="200" height="80" rx="14" fill="hsl(var(--card))" stroke={colors.sales} strokeWidth="2.5" />
            <rect x="310" y="80" width="200" height="28" rx="14" fill={colors.sales} opacity="0.12" />
            <rect x="310" y="80" width="200" height="28" rx="14" fill="none" stroke={colors.sales} strokeWidth="2.5" />
            <text x="410" y="100" textAnchor="middle" className="text-xs font-bold" fill={colors.sales}>매출전환</text>
            <text x="410" y="128" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(salesAmt, true)}
            </text>
            <text x="410" y="148" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {salesStage.count.toLocaleString()}건 · 수주대비 {formatPercent(convRate, 1)}
            </text>
          </g>

          {/* 수금완료 (순수) */}
          <g filter="url(#boxShadow)">
            <rect x="620" y="30" width="180" height="92" rx="14" fill="hsl(var(--card))" stroke={colors.collection} strokeWidth="2.5" />
            <rect x="620" y="30" width="180" height="26" rx="14" fill={colors.collection} opacity="0.12" />
            <rect x="620" y="30" width="180" height="26" rx="14" fill="none" stroke={colors.collection} strokeWidth="2.5" />
            <text x="710" y="48" textAnchor="middle" className="text-xs font-bold" fill={colors.collection}>순수 수금</text>
            <text x="710" y="74" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(collAmt, true)}
            </text>
            <text x="710" y="92" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {collectionStage.count.toLocaleString()}건 · 매출대비 {formatPercent(collRate, 1)}
            </text>
            <text x="710" y="108" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">
              선수금 {formatCurrency(prepaymentAmount, true)} 별도
            </text>
          </g>

          {/* 미수잔액 */}
          <g filter="url(#boxShadow)">
            <rect x="620" y="220" width="180" height="76" rx="14" fill="hsl(var(--card))" stroke={colors.outstanding} strokeWidth="2" strokeDasharray="6 3" />
            <rect x="620" y="220" width="180" height="26" rx="14" fill={colors.outstanding} opacity="0.10" />
            <rect x="620" y="220" width="180" height="26" rx="14" fill="none" stroke={colors.outstanding} strokeWidth="2" strokeDasharray="6 3" />
            <text x="710" y="238" textAnchor="middle" className="text-xs font-bold" fill={colors.outstanding}>미수잔액</text>
            <text x="710" y="264" textAnchor="middle" className="text-sm font-bold" fill="hsl(var(--foreground))">
              {formatCurrency(outAmt, true)}
            </text>
            <text x="710" y="284" textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              매출대비 {formatPercent(outRate, 1)}
            </text>
          </g>

          {/* ─── 흐름 방향 라벨 ─── */}
          <text x="255" y="140" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">전환</text>
          <text x="569" y="42" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">순수수금</text>
          <text x="569" y="270" textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">미수</text>

          {/* ─── 건전성 요약 ─── */}
          <g>
            <rect x="20" y="200" width="280" height="140" rx="12" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1" opacity="0.9" />
            <text x="36" y="222" className="text-[11px] font-semibold" fill="hsl(var(--foreground))">O2C 건전성 요약</text>

            {/* 수주→매출 전환율 */}
            <circle cx="42" cy="245" r="5" fill={healthColor(convRate, 80)} />
            <text x="54" y="249" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              수주-매출 전환율: {formatPercent(convRate, 1)}
            </text>
            <text x="240" y="249" className="text-[10px] font-medium" fill={healthColor(convRate, 80)}>
              {convRate >= 80 ? "양호" : convRate >= 64 ? "주의" : "위험"}
            </text>

            {/* 매출→수금 순수수금율 */}
            <circle cx="42" cy="268" r="5" fill={healthColor(collRate, 90)} />
            <text x="54" y="272" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              순수 수금율: {formatPercent(collRate, 1)} (선수금 제외)
            </text>
            <text x="240" y="272" className="text-[10px] font-medium" fill={healthColor(collRate, 90)}>
              {collRate >= 90 ? "양호" : collRate >= 72 ? "주의" : "위험"}
            </text>

            {/* 선수금 정보 */}
            <circle cx="42" cy="291" r="5" fill={CHART_COLORS[3]} />
            <text x="54" y="295" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              선수금: {formatCurrency(prepaymentAmount, true)}
            </text>
            <text x="240" y="295" className="text-[10px] font-medium" fill="hsl(var(--muted-foreground))">
              별도 관리
            </text>

            {/* 미수 비율 */}
            <circle cx="42" cy="314" r="5" fill={healthColor(100 - outRate, 80)} />
            <text x="54" y="318" className="text-[10px]" fill="hsl(var(--muted-foreground))">
              미수잔액 비중: {formatPercent(outRate, 1)}
            </text>
            <text x="240" y="318" className="text-[10px] font-medium" fill={healthColor(100 - outRate, 80)}>
              {outRate <= 20 ? "양호" : outRate <= 35 ? "주의" : "위험"}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
