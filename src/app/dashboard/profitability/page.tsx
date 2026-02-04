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
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from "recharts";
import { TrendingUp, Target } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS } from "@/lib/utils";

export default function ProfitabilityPage() {
  const { orgProfit, teamContribution } = useDataStore();

  const hasData = orgProfit.length > 0;

  // Waterfall data
  const waterfallData = useMemo(() => {
    if (orgProfit.length === 0) return [];
    const totals = orgProfit.reduce(
      (acc, r) => ({
        매출액: acc.매출액 + r.매출액.실적,
        매출원가: acc.매출원가 + r.실적매출원가.실적,
        매출총이익: acc.매출총이익 + r.매출총이익.실적,
        판관비: acc.판관비 + r.판매관리비.실적,
        영업이익: acc.영업이익 + r.영업이익.실적,
        공헌이익: acc.공헌이익 + r.공헌이익.실적,
      }),
      { 매출액: 0, 매출원가: 0, 매출총이익: 0, 판관비: 0, 영업이익: 0, 공헌이익: 0 }
    );

    return [
      { name: "매출액", value: totals.매출액, fill: CHART_COLORS[0] },
      { name: "매출원가", value: -totals.매출원가, fill: CHART_COLORS[4] },
      { name: "매출총이익", value: totals.매출총이익, fill: CHART_COLORS[1] },
      { name: "판관비", value: -totals.판관비, fill: CHART_COLORS[3] },
      { name: "영업이익", value: totals.영업이익, fill: CHART_COLORS[0] },
      { name: "공헌이익", value: totals.공헌이익, fill: CHART_COLORS[2] },
    ];
  }, [orgProfit]);

  // Bubble chart: X=매출액, Y=영업이익율, Size=매출총이익
  const bubbleData = useMemo(() =>
    orgProfit.map((r) => ({
      name: r.영업조직팀,
      x: r.매출액.실적,
      y: r.영업이익율.실적,
      z: Math.abs(r.매출총이익.실적),
    })),
    [orgProfit]
  );

  // Team contribution ranking
  const contribRanking = useMemo(() =>
    [...teamContribution]
      .sort((a, b) => (b.공헌이익?.실적 || 0) - (a.공헌이익?.실적 || 0))
      .slice(0, 15)
      .map((r) => ({
        name: r.영업담당사번,
        org: r.영업조직팀,
        공헌이익: r.공헌이익?.실적 || 0,
        공헌이익율: r.공헌이익율?.실적 || 0,
      })),
    [teamContribution]
  );

  // Summary KPIs
  const totalSales = orgProfit.reduce((s, r) => s + r.매출액.실적, 0);
  const totalOP = orgProfit.reduce((s, r) => s + r.영업이익.실적, 0);
  const totalGP = orgProfit.reduce((s, r) => s + r.매출총이익.실적, 0);
  const totalContrib = orgProfit.reduce((s, r) => s + r.공헌이익.실적, 0);
  const opRate = totalSales > 0 ? (totalOP / totalSales) * 100 : 0;
  const gpRate = totalSales > 0 ? (totalGP / totalSales) * 100 : 0;

  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">수익성 분석</h2>
        <p className="text-muted-foreground">손익 구조 및 조직별 수익성 비교</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="매출총이익" value={totalGP} format="currency" icon={<TrendingUp className="h-5 w-5" />} />
        <KpiCard title="매출총이익율" value={gpRate} format="percent" formula="매출총이익 / 매출액 × 100" benchmark="30% 이상 양호" />
        <KpiCard title="영업이익율" value={opRate} format="percent" formula="영업이익 / 매출액 × 100" benchmark="10% 이상 양호" />
        <KpiCard title="공헌이익" value={totalContrib} format="currency" icon={<Target className="h-5 w-5" />} />
      </div>

      {/* Waterfall Chart */}
      <ChartCard
        title="손익 Waterfall"
        description="매출액에서 공헌이익까지의 흐름"
        formula="매출액 - 매출원가 = 매출총이익 - 판관비 = 영업이익"
      >
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(Math.abs(v), true)} />
              <RechartsTooltip formatter={(value: any) => formatCurrency(Math.abs(Number(value)))} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {waterfallData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Org Profitability Bubble */}
        <ChartCard
          title="조직별 수익성 Matrix"
          description="X축: 매출액, Y축: 영업이익율, 크기: 매출총이익"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="x" name="매출액" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis dataKey="y" name="영업이익율" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <ZAxis dataKey="z" range={[50, 400]} />
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg p-2 text-sm shadow-md">
                        <p className="font-semibold">{d.name}</p>
                        <p>매출액: {formatCurrency(d.x)}</p>
                        <p>영업이익율: {formatPercent(d.y)}</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={bubbleData} fill={CHART_COLORS[0]}>
                  {bubbleData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Contribution Ranking */}
        <ChartCard title="담당자별 공헌이익 랭킹" description="공헌이익 기준 상위 15명">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contribRanking} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={55} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
                <Bar dataKey="공헌이익" fill={CHART_COLORS[2]} name="공헌이익" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
