"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
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
import { formatCurrency, filterByOrg, extractMonth, CHART_COLORS } from "@/lib/utils";
import { calcO2CPipeline, calcMonthlyConversion } from "@/lib/analysis/pipeline";

export default function OrdersAnalysisPage() {
  const { orderList, salesList, collectionList, orgNames } = useDataStore();

  const filteredOrders = useMemo(() => filterByOrg(orderList, orgNames), [orderList, orgNames]);
  const filteredSales = useMemo(() => filterByOrg(salesList, orgNames), [salesList, orgNames]);
  const filteredCollections = useMemo(() => filterByOrg(collectionList, orgNames), [collectionList, orgNames]);

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
  const pipelineStages = useMemo(
    () => calcO2CPipeline(filteredOrders, filteredSales, filteredCollections),
    [filteredOrders, filteredSales, filteredCollections]
  );

  const monthlyConversion = useMemo(
    () => calcMonthlyConversion(filteredOrders, filteredSales, filteredCollections),
    [filteredOrders, filteredSales, filteredCollections]
  );

  // O2C KPI 값 계산
  const orderToSalesRate = pipelineStages.find((s) => s.stage === "매출전환")?.percentage ?? 0;
  const salesToCollectionRate = useMemo(() => {
    const totalSalesAmt = filteredSales.reduce((s, r) => s + r.장부금액, 0);
    const totalCollAmt = filteredCollections.reduce((s, c) => s + c.장부수금액, 0);
    return totalSalesAmt > 0 ? (totalCollAmt / totalSalesAmt) * 100 : 0;
  }, [filteredSales, filteredCollections]);
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

  if (filteredOrders.length === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">수주 분석</h2>
        <p className="text-muted-foreground">수주 파이프라인 및 전환율 분석</p>
      </div>

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">수주 현황</TabsTrigger>
          <TabsTrigger value="analysis">수주 분석</TabsTrigger>
          <TabsTrigger value="org">조직 분석</TabsTrigger>
          <TabsTrigger value="pipeline">O2C 파이프라인</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 수주액"
              value={totalOrders}
              format="currency"
              icon={<ShoppingCart className="h-5 w-5" />}
              formula="SUM(수주리스트.장부금액)"
              description="Infra 사업본부 담당 조직의 전체 수주 합계"
            />
            <KpiCard
              title="수주→매출 전환율"
              value={conversionRate}
              format="percent"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="총매출액 / 총수주액 x 100"
              description="수주된 금액 중 실제 매출로 전환된 비율. 100% 초과 시 기수주 물량의 매출 반영"
              benchmark="80~120% 범위가 정상"
            />
            <KpiCard
              title="미출고 수주잔"
              value={outstandingOrders > 0 ? outstandingOrders : 0}
              format="currency"
              icon={<Package className="h-5 w-5" />}
              formula="총수주액 - 총매출액"
              description="수주는 되었으나 아직 출고/매출 처리되지 않은 잔액"
            />
            <KpiCard
              title="수주 건수"
              value={filteredOrders.length}
              format="number"
              icon={<Clock className="h-5 w-5" />}
              description="분석 기간 내 총 수주 건수"
            />
          </div>

          <ChartCard
            title="월별 수주 추이"
            formula="수주건수: COUNT(*) by 월\n수주금액: SUM(장부금액) by 월"
            description="월별 수주 건수와 금액 추이입니다. 건수 대비 금액이 높으면 대형 건이 포함된 것입니다."
            benchmark="수주 금액이 매출 대비 동등하거나 높으면 양호"
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyOrders}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(value: any, name: any) =>
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
            formula="SUM(장부금액) GROUP BY 수주유형명"
            description="수주유형별 금액 구성 비율입니다. 내수/수출/프로젝트 등 유형별 비중을 확인합니다."
          >
            <div className="h-96">
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
                  <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="납품 리드타임 분포"
            formula="납품요청일 - 수주일 = 리드타임(일)"
            description="수주일부터 납품요청일까지의 기간 분포입니다. 리드타임이 짧을수록 납품 압박이 클 수 있습니다."
            benchmark="30일 이내가 일반적, 90일 이상은 장기 프로젝트"
          >
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadTimes}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bin" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip formatter={(value: any) => `${value}건`} />
                  <Bar dataKey="count" fill={CHART_COLORS[2]} name="건수" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="org" className="space-y-6">
          <ChartCard
            title="조직별 수주 비중"
            formula="SUM(장부금액) GROUP BY 영업조직"
            description="영업조직별 수주 금액 순위입니다. 특정 조직에 수주가 집중될 경우 리스크 분산이 필요합니다."
          >
            <div className="h-80">
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
                    formatter={(value: any) => formatCurrency(Number(value))}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} name="수주액" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="월별 수주 vs 매출 전환 갭"
            formula="갭 = 수주금액 - 매출금액 (양수: 수주잔고 누적, 음수: 기수주 소진)"
            description="월별 수주금액과 매출금액을 비교합니다. 갭이 양수이면 수주잔고가 쌓이고, 음수이면 과거 수주분을 소화하는 것입니다."
            benchmark="갭이 일정하게 양수이면 파이프라인 건전"
          >
            <div className="h-80">
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
                    formatter={(value: any, name: any) =>
                      name === "전환율" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                    }
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
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
              title="수주→매출 전환율"
              value={orderToSalesRate}
              format="percent"
              icon={<ArrowRightLeft className="h-5 w-5" />}
              formula="총매출액 / 총수주액 x 100"
              description="수주 금액 대비 매출로 전환된 비율입니다. 100% 초과 시 이전 기간 수주의 매출 반영을 의미합니다."
              benchmark="80~120%가 정상 범위"
            />
            <KpiCard
              title="매출→수금 수금율"
              value={salesToCollectionRate}
              format="percent"
              icon={<Wallet className="h-5 w-5" />}
              formula="총수금액 / 총매출액 x 100"
              description="매출 금액 대비 실제 수금된 비율입니다. 높을수록 현금흐름이 양호합니다."
              benchmark="90% 이상이 양호, 80% 미만 주의"
            />
            <KpiCard
              title="미수잔액"
              value={outstandingAmount}
              format="currency"
              icon={<AlertCircle className="h-5 w-5" />}
              formula="MAX(0, 총매출액 - 총수금액)"
              description="매출은 발생했으나 아직 수금되지 않은 잔액입니다."
              benchmark="매출 대비 20% 이하가 양호"
            />
          </div>

          <ChartCard
            title="O2C 퍼널 (수주 → 매출 → 수금)"
            formula="수주금액 → 매출전환금액 → 수금완료금액 → 미수잔액"
            description="Order-to-Cash 전체 프로세스의 각 단계별 금액과 전환 비율을 시각화합니다. 단계별로 금액이 감소하는 퍼널 형태로, 병목 구간을 파악할 수 있습니다."
            benchmark="각 단계 전환율이 80% 이상이면 건전한 O2C 프로세스"
          >
            <div className="h-72">
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
                    formatter={(value: any, name: any) => {
                      if (name === "금액") return formatCurrency(Number(value));
                      return value;
                    }}
                    labelFormatter={(label) => `단계: ${label}`}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
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
                          {formatCurrency(Number(value), true)} ({stage.비율.toFixed(1)}%)
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
            title="월별 O2C 전환 추이"
            formula="전환율 = 매출 / 수주 x 100\n수금율 = 수금 / 매출 x 100"
            description="월별 수주/매출/수금 금액(막대)과 전환율/수금율(선)을 함께 표시합니다. 전환율과 수금율이 안정적으로 높으면 O2C 프로세스가 건전합니다."
            benchmark="전환율/수금율 80% 이상 안정 유지가 양호"
          >
            <div className="h-80">
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
                    domain={[0, (dataMax: number) => Math.max(120, Math.ceil(dataMax / 10) * 10)]}
                  />
                  <RechartsTooltip
                    formatter={(value: any, name: any) => {
                      if (name === "전환율" || name === "수금율") return `${Number(value).toFixed(1)}%`;
                      return formatCurrency(Number(value));
                    }}
                    contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))" }}
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
      </Tabs>
    </div>
  );
}
