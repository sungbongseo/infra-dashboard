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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, CHART_COLORS } from "@/lib/utils";

export default function ReceivablesPage() {
  const { receivableAging, orgNames } = useDataStore();

  const filteredAgingMap = useMemo(() => {
    const filtered = new Map<string, any[]>();
    for (const [key, records] of Array.from(receivableAging.entries())) {
      const filteredRecords = filterByOrg(records, orgNames, "영업조직");
      if (filteredRecords.length > 0) {
        filtered.set(key, filteredRecords);
      }
    }
    return filtered;
  }, [receivableAging, orgNames]);

  const allRecords = useMemo(() => {
    const all: any[] = [];
    Array.from(filteredAgingMap.values()).forEach((records) => {
      all.push(...records);
    });
    return all;
  }, [filteredAgingMap]);

  const hasData = allRecords.length > 0;

  const summary = useMemo(() => calcAgingSummary(allRecords), [allRecords]);
  const byOrg = useMemo(() => calcAgingByOrg(filteredAgingMap), [filteredAgingMap]);
  const byPerson = useMemo(() => calcAgingByPerson(allRecords), [allRecords]);
  const risks = useMemo(() => calcRiskAssessments(allRecords), [allRecords]);

  const highRiskCount = risks.filter((r) => r.riskGrade === "high").length;
  const mediumRiskCount = risks.filter((r) => r.riskGrade === "medium").length;
  const overdueTotal = summary.month4 + summary.month5 + summary.month6 + summary.overdue;
  const overdueRate = summary.total > 0 ? (overdueTotal / summary.total) * 100 : 0;

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

      <Tabs defaultValue="status" className="space-y-4">
        <TabsList>
          <TabsTrigger value="status">미수금 현황</TabsTrigger>
          <TabsTrigger value="risk">리스크 관리</TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 미수금"
              value={summary.total}
              format="currency"
              icon={<CreditCard className="h-5 w-5" />}
              formula="SUM(미수채권연령 파일별 전체 미수금)"
              description="Infra 사업본부 담당 조직의 전체 미수채권 잔액 합계입니다."
              benchmark="매출액 대비 15% 이내 양호"
            />
            <KpiCard
              title="3개월 이상 연체"
              value={overdueTotal}
              format="currency"
              icon={<AlertTriangle className="h-5 w-5" />}
              formula="SUM(4개월 + 5개월 + 6개월 + 6개월초과 미수금)"
              description="4개월 이상 장기 미수금 합계로, 회수 불능 위험이 높은 채권입니다."
              benchmark="총 미수금의 20% 미만이면 양호"
            />
            <KpiCard
              title="연체비율"
              value={overdueRate}
              format="percent"
              formula="(3개월이상 미수금) / 총미수금 × 100"
              description="전체 미수금 대비 장기 연체금의 비율입니다. 높을수록 채권 건전성이 낮습니다."
              benchmark="20% 미만 양호, 30% 이상 위험"
            />
            <KpiCard
              title="고위험 거래처"
              value={highRiskCount}
              format="number"
              icon={<Shield className="h-5 w-5" />}
              formula="연체비율 50% 초과 OR 6개월+ 미수금 1억원 초과"
              description="채권 회수 위험이 높은 거래처 수입니다. 즉각적인 관리 조치가 필요합니다."
              benchmark="0건이 이상적, 3건 이상 시 집중 관리"
            />
          </div>

          <ChartCard
            title="조직별 미수채권 연령 분석"
            formula="각 조직의 미수채권을 1~6개월 및 6개월 초과로 분류\n연령 = 채권 발생일로부터 경과 개월 수"
            description="조직별 미수채권의 연령 분포를 보여줍니다. 빨간색 계열(장기)이 많을수록 채권 건전성이 낮습니다."
            benchmark="3개월 이상 비율 20% 미만이면 양호, 6개월+ 비중이 높으면 대손 위험"
          >
            <div className="h-96">
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
        </TabsContent>

        <TabsContent value="risk" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="담당자 수"
              value={byPerson.length}
              format="number"
              icon={<Users className="h-5 w-5" />}
              description="미수금이 있는 영업담당자 수입니다."
            />
            <KpiCard
              title="주의 거래처"
              value={mediumRiskCount}
              format="number"
              formula="연체비율 30~50% OR 3개월이상 미수금 5천만원 초과"
              description="관심을 기울여야 하는 거래처 수입니다. 고위험으로 전환되지 않도록 선제 관리가 필요합니다."
            />
            <KpiCard
              title="고위험 거래처"
              value={highRiskCount}
              format="number"
              icon={<Shield className="h-5 w-5" />}
              formula="연체비율 50% 초과 OR 6개월+ 미수금 1억원 초과"
              description="즉각적인 채권 회수 조치가 필요한 거래처 수입니다."
              benchmark="0건이 이상적"
            />
            <KpiCard
              title="리스크 평가 대상"
              value={risks.length}
              format="number"
              description="리스크 등급이 분류된 전체 거래처 수입니다."
            />
          </div>

          <ChartCard
            title="담당자별 미수금 현황"
            formula="SUM(미수금) GROUP BY 영업담당자\nTOP 15 기준 정렬"
            description="담당자별 총 미수금 상위 15명입니다. 특정 담당자에 미수금이 집중되어 있다면 채권 관리 강화가 필요합니다."
            benchmark="담당자 1인당 미수금이 총 미수금의 20% 이상이면 집중도 과다"
          >
            <div className="h-[500px]">
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

          <ChartCard
            title="리스크 등급 현황"
            formula="고위험: 연체비율 50%↑ OR 6개월+ 1억↑\n주의: 연체비율 30~50% OR 3개월+ 5천만↑\n양호: 그 외"
            description="연령×금액 기준으로 거래처를 리스크 등급으로 분류합니다. 고위험 거래처는 즉각 조치가 필요합니다."
            benchmark="고위험 0건, 주의 총 미수금의 10% 이내가 이상적"
          >
            <div className="h-96 overflow-auto">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
