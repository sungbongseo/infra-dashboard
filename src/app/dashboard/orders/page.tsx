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
import { formatCurrency, CHART_COLORS } from "@/lib/utils";

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
  const { orderList, salesList } = useDataStore();

  // Monthly order trends
  const monthlyOrders = useMemo(() => {
    const map = new Map<string, { month: string; 수주금액: number; 수주건수: number }>();
    for (const r of orderList) {
      const m = extractMonth(r.수주일);
      if (!m) continue;
      const entry = map.get(m) || { month: m, 수주금액: 0, 수주건수: 0 };
      entry.수주금액 += r.장부금액;
      entry.수주건수 += 1;
      map.set(m, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [orderList]);

  // Order type breakdown
  const orderTypes = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of orderList) {
      const type = r.수주유형명 || r.수주유형 || "기타";
      map.set(type, (map.get(type) || 0) + r.장부금액);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [orderList]);

  // Pipeline: 수주 → 매출 conversion
  const totalOrders = orderList.reduce((s, r) => s + r.장부금액, 0);
  const totalSales = salesList.reduce((s, r) => s + r.장부금액, 0);
  const conversionRate = totalOrders > 0 ? (totalSales / totalOrders) * 100 : 0;
  const outstandingOrders = totalOrders - totalSales;

  // Lead time distribution
  const leadTimes = useMemo(() => {
    const bins = new Map<string, number>();
    for (const r of orderList) {
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
  }, [orderList]);

  if (orderList.length === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">수주 분석</h2>
        <p className="text-muted-foreground">수주 파이프라인 및 전환율 분석</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 수주액"
          value={totalOrders}
          format="currency"
          icon={<ShoppingCart className="h-5 w-5" />}
        />
        <KpiCard
          title="수주→매출 전환율"
          value={conversionRate}
          format="percent"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="총매출액 / 총수주액 × 100"
        />
        <KpiCard
          title="미출고 수주잔"
          value={outstandingOrders > 0 ? outstandingOrders : 0}
          format="currency"
          icon={<Package className="h-5 w-5" />}
          formula="총수주액 - 총매출액"
        />
        <KpiCard
          title="수주 건수"
          value={orderList.length}
          format="number"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Order Trends */}
        <ChartCard title="월별 수주 추이" description="수주금액과 수주건수 월별 추이">
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

        {/* Order Type Breakdown */}
        <ChartCard title="수주유형별 분석" description="내수/수출/프로젝트별 비중">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={orderTypes.slice(0, 6)}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
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
      </div>

      {/* Lead Time Distribution */}
      <ChartCard
        title="납품 리드타임 분포"
        description="수주일→납품요청일 간 소요일수 분포"
      >
        <div className="h-64">
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
    </div>
  );
}
