"use client";

import { useMemo } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
  Area,
  AreaChart,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { AlertTriangle, TrendingDown } from "lucide-react";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomerMigration, calcGradeDistribution } from "@/lib/analysis/migration";
import type { SalesRecord } from "@/types";

interface MigrationTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

export function MigrationTab({ filteredSales, isDateFiltered }: MigrationTabProps) {
  const migration = useMemo(() => calcCustomerMigration(filteredSales), [filteredSales]);
  const gradeDistribution = useMemo(() => calcGradeDistribution(filteredSales), [filteredSales]);

  // 등급 하락 거래처 분석
  const downgradeInsight = useMemo(() => {
    if (migration.matrices.length < 2) return null;
    // 마지막 월의 matrix에서 하락 flow 추출
    const lastMatrix = migration.matrices[migration.matrices.length - 1];
    if (!lastMatrix) return null;
    const downFlows = lastMatrix.flows.filter(f => {
      const gradeOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, N: 0 };
      return gradeOrder[f.fromGrade] > gradeOrder[f.toGrade] && f.fromGrade !== "N";
    });
    const totalDowngraded = downFlows.reduce((s, f) => s + f.count, 0);
    // 하락 거래처 목록 (등급별 정렬: A→B 먼저)
    const downgradedCustomers: Array<{
      name: string;
      from: string;
      to: string;
      severity: "warning" | "danger";
      priorityLabel: string;
    }> = [];
    for (const flow of downFlows) {
      // A→B: "관계 점검" (노란색), B→C 또는 더 큰 하락: "즉시 영업 접촉" (빨간색)
      const isMinorDrop = flow.fromGrade === "A" && flow.toGrade === "B";
      const severity = isMinorDrop ? "warning" as const : "danger" as const;
      const priorityLabel = isMinorDrop ? "관계 점검" : "즉시 영업 접촉";
      for (const c of flow.customers.slice(0, 10)) {
        downgradedCustomers.push({ name: c, from: flow.fromGrade, to: flow.toGrade, severity, priorityLabel });
      }
    }
    // 등급 하락 폭 큰 순서, 상위 10개만
    const gradeVal: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, N: 0 };
    const top10 = downgradedCustomers
      .sort((a, b) => (gradeVal[b.from] - gradeVal[b.to]) - (gradeVal[a.from] - gradeVal[a.to]))
      .slice(0, 10);
    // 총 하락 건수 (전체 기간)
    const totalDownAll = migration.summaries.reduce((s, m) => s + m.downgraded, 0);
    return { totalDowngraded, totalDownAll, top10, month: lastMatrix.month };
  }, [migration]);

  if (migration.summaries.length === 0 && gradeDistribution.length === 0) return <EmptyState />;

  return (
    <>
      {/* 하락 거래처 KPI + 인사이트 */}
      {downgradeInsight && downgradeInsight.totalDowngraded > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              title="최근월 등급 하락"
              value={downgradeInsight.totalDowngraded}
              format="number"
              icon={<TrendingDown className="h-5 w-5" />}
              formula="이전월 대비 등급이 하락한 거래처 수 (A→B, B→C 등)"
              description={`${downgradeInsight.month} 기준, 이전월보다 등급이 낮아진 거래처 수`}
              benchmark="전월 대비 하락 거래처가 상승 거래처보다 많으면 고객 포트폴리오 악화 징후"
            />
            <KpiCard
              title="전체 기간 하락 누계"
              value={downgradeInsight.totalDownAll}
              format="number"
              icon={<AlertTriangle className="h-5 w-5" />}
              formula="분석 기간 전체에서 등급 하락이 발생한 건수의 합계"
              description="분석 기간 동안 누적된 등급 하락 건수입니다"
              benchmark="하락 누계가 지속 증가하면 영업 전략 전면 재검토 필요"
            />
          </div>

          {/* 하락 거래처 TOP 10 테이블 */}
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <h4 className="font-semibold text-red-900 dark:text-red-100 mb-3 text-sm">하락 거래처 상세 ({downgradeInsight.month})</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-red-200 dark:border-red-800">
                    <th className="text-left p-2 font-medium text-red-900 dark:text-red-100">거래처명</th>
                    <th className="text-center p-2 font-medium text-red-900 dark:text-red-100">등급 변동</th>
                    <th className="text-left p-2 font-medium text-red-900 dark:text-red-100">접촉 우선순위</th>
                  </tr>
                </thead>
                <tbody>
                  {downgradeInsight.top10.map((c, i) => (
                    <tr key={i} className="border-b border-red-100 dark:border-red-900/50">
                      <td className="p-2 text-red-800 dark:text-red-200">{c.name}</td>
                      <td className="p-2 text-center">
                        <span className="font-mono font-medium text-red-700 dark:text-red-300">{c.from} → {c.to}</span>
                      </td>
                      <td className="p-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          c.severity === "warning"
                            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200"
                            : "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200"
                        }`}>
                          {c.priorityLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 등급 이동 추이 */}
      {migration.summaries.length > 0 && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="월별 등급 이동 추이"
          formula="등급 기준: A(매출 상위 15%), B(상위 40%), C(상위 70%), D(나머지). B2B 보정: 연속 3개월 미만 공백은 이전 등급 유지"
          description="매월 거래처가 어떤 등급으로 이동했는지 추적합니다. 녹색 막대(등급 상승)와 적색 막대(등급 하락)는 기존 고객의 변동을, 황색 선(이탈)과 청색 선(신규)은 고객 유출입과 유입을 보여줍니다."
          benchmark="녹색(상승)이 적색(하락)보다 지속적으로 크면 고객 포트폴리오가 개선되는 추세"
          reason="고객 세그먼트 간 이동 패턴을 분석하여 등급 하락(이탈 징후) 고객을 조기 발견하고, 등급 상승 성공 요인을 파악하여 영업 전략에 반영합니다."
        >
          <ChartContainer height="h-72 md:h-96">
              <ComposedChart data={migration.summaries}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString()}개사`, name]}
                />
                <Legend />
                <Bar dataKey="upgraded" name="등급 상승" fill="#059669" stackId="a" activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Bar dataKey="downgraded" name="등급 하락" fill="#ef4444" stackId="a" activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Line type="monotone" dataKey="churned" name="이탈" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
                <Line type="monotone" dataKey="newCustomers" name="신규" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6, strokeWidth: 2 }} {...ANIMATION_CONFIG} />
              </ComposedChart>
          </ChartContainer>
        </ChartCard>
      )}

      {/* 등급 분포 추이 (Stacked Area) */}
      {gradeDistribution.length > 0 && (
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="월별 등급 분포 추이"
          formula="월별, 등급별로 거래처 수를 세어서 누적 표시"
          description="매월 A, B, C, D 등급에 속하는 거래처가 각각 몇 곳인지를 면적 차트로 보여줍니다. 시간이 지남에 따라 A등급(상위)의 면적이 넓어지고 D등급(하위)의 면적이 좁아지면 전체 고객 품질이 좋아지고 있다는 의미입니다."
          benchmark="A + B 등급 비중이 지속 증가하면 고객 포트폴리오 건전성 개선 추세"
          reason="시간에 따른 고객 등급 분포 변화를 추적하여 영업 활동의 고객 포트폴리오 개선 효과를 측정하고, 하위 등급 비중 증가 시 조기 경보를 제공합니다."
        >
          <ChartContainer height="h-72 md:h-96">
              <AreaChart data={gradeDistribution}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString()}개사`, `${name}등급`]}
                />
                <Legend formatter={(value: any) => `${value}등급`} />
                <Area type="monotone" dataKey="A" stackId="1" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.8} name="A" />
                <Area type="monotone" dataKey="B" stackId="1" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.7} name="B" />
                <Area type="monotone" dataKey="C" stackId="1" stroke={CHART_COLORS[3]} fill={CHART_COLORS[3]} fillOpacity={0.6} name="C" />
                <Area type="monotone" dataKey="D" stackId="1" stroke={CHART_COLORS[5]} fill={CHART_COLORS[5]} fillOpacity={0.5} name="D" />
              </AreaChart>
          </ChartContainer>
        </ChartCard>
      )}
    </>
  );
}
