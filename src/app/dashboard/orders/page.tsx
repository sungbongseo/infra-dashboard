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
import { ShoppingCart, TrendingUp, Clock, Package } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, CHART_COLORS } from "@/lib/utils";

function extractMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = String(dateStr);
  if (d.includes("-")) return d.substring(0, 7);
  if (d.includes("/")) {
    const parts = d.split("/");
    return `${parts[0]}-${parts[1].padStart(2, "0")}`;
  }
  if (d.length === 8) return `${d.substring(0, 4)}-${d.substring(4, 6)}`;
  const serial = Number(d);
  if (!isNaN(serial) && serial > 40000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}

export default function OrdersAnalysisPage() {
  const { orderList, salesList, orgNames } = useDataStore();

  const filteredOrders = useMemo(() => filterByOrg(orderList, orgNames), [orderList, orgNames]);
  const filteredSales = useMemo(() => filterByOrg(salesList, orgNames), [salesList, orgNames]);

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
              formula="총매출액 / 총수주액 × 100"
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
      </Tabs>
    </div>
  );
}
