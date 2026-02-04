"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Badge } from "@/components/ui/badge";
import { calcAgingSummary, calcAgingByOrg, calcAgingByPerson, calcRiskAssessments } from "@/lib/analysis/aging";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { CreditCard, AlertTriangle, Shield, Users } from "lucide-react";
import { formatCurrency, CHART_COLORS } from "@/lib/utils";

export default function ReceivablesPage() {
  const { receivableAging } = useDataStore();

  const allRecords = useMemo(() => {
    const all: any[] = [];
    Array.from(receivableAging.values()).forEach((records) => {
      all.push(...records);
    });
    return all;
  }, [receivableAging]);

  const hasData = allRecords.length > 0;

  const summary = useMemo(() => calcAgingSummary(allRecords), [allRecords]);
  const byOrg = useMemo(() => calcAgingByOrg(receivableAging), [receivableAging]);
  const byPerson = useMemo(() => calcAgingByPerson(allRecords), [allRecords]);
  const risks = useMemo(() => calcRiskAssessments(allRecords), [allRecords]);

  const highRiskCount = risks.filter((r) => r.riskGrade === "high").length;

  // Aging stacked bar data
  const agingStackedData = useMemo(() =>
    byOrg.map((o) => ({
      org: o.org,
      "1개월": o.month1,
      "2개월": o.month2,
      "3개월": o.month3,
      "4개월": o.month4,
      "5개월": o.month5,
      "6개월": o.month6,
      "6개월+": o.overdue,
    })),
    [byOrg]
  );

  if (!hasData) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">미수금 관리</h2>
        <p className="text-muted-foreground">미수채권 연령 분석 및 리스크 관리</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 미수금"
          value={summary.total}
          format="currency"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <KpiCard
          title="3개월 이상 연체"
          value={summary.month4 + summary.month5 + summary.month6 + summary.overdue}
          format="currency"
          icon={<AlertTriangle className="h-5 w-5" />}
          description="4개월 이상 미수금 합계"
        />
        <KpiCard
          title="고위험 거래처"
          value={highRiskCount}
          format="number"
          icon={<Shield className="h-5 w-5" />}
          description="연체비율 50% 초과 또는 6개월+ 1억원 초과"
        />
        <KpiCard
          title="담당자 수"
          value={byPerson.length}
          format="number"
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      {/* Aging Stacked Bar */}
      <ChartCard
        title="조직별 미수채권 연령 분석"
        description="월별 연령 구간별 미수금 분포"
        formula="연체비율 = (3개월이상 미수금) / 총미수금 × 100"
        benchmark="3개월 이상 비율 20% 미만이면 양호"
      >
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agingStackedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="org" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="1개월" stackId="a" fill={CHART_COLORS[1]} />
              <Bar dataKey="2개월" stackId="a" fill={CHART_COLORS[5]} />
              <Bar dataKey="3개월" stackId="a" fill={CHART_COLORS[6]} />
              <Bar dataKey="4개월" stackId="a" fill={CHART_COLORS[3]} />
              <Bar dataKey="5개월" stackId="a" fill={CHART_COLORS[4]} />
              <Bar dataKey="6개월" stackId="a" fill="hsl(0, 70%, 55%)" />
              <Bar dataKey="6개월+" stackId="a" fill="hsl(0, 84%, 40%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Person receivables */}
        <ChartCard title="담당자별 미수금 현황" description="담당자별 총 미수금 상위 15명">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byPerson.slice(0, 15)} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="person" tick={{ fontSize: 10 }} width={55} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
                <Bar dataKey="total" fill={CHART_COLORS[3]} name="미수금" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Risk Assessment Table */}
        <ChartCard title="리스크 등급 현황" description="연령×금액 기준 리스크 분류">
          <div className="h-80 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 px-2 font-medium">거래처</th>
                  <th className="py-2 px-2 font-medium text-right">미수금</th>
                  <th className="py-2 px-2 font-medium text-right">연체비율</th>
                  <th className="py-2 px-2 font-medium">등급</th>
                </tr>
              </thead>
              <tbody>
                {risks.slice(0, 20).map((r, i) => (
                  <tr key={i} className="border-b border-muted/50 hover:bg-muted/30">
                    <td className="py-1.5 px-2 truncate max-w-[150px]" title={r.판매처명}>{r.판매처명 || r.판매처}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(r.총미수금, true)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.연체비율.toFixed(1)}%</td>
                    <td className="py-1.5 px-2">
                      <Badge
                        variant={r.riskGrade === "high" ? "destructive" : r.riskGrade === "medium" ? "warning" : "success"}
                      >
                        {r.riskGrade === "high" ? "고위험" : r.riskGrade === "medium" ? "주의" : "양호"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
