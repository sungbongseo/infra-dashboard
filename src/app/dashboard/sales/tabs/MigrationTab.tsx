"use client";

import { useMemo } from "react";
import {
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
  Area,
  AreaChart,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomerMigration, calcGradeDistribution } from "@/lib/analysis/migration";

interface MigrationTabProps {
  filteredSales: any[];
}

export function MigrationTab({ filteredSales }: MigrationTabProps) {
  const migration = useMemo(() => calcCustomerMigration(filteredSales), [filteredSales]);
  const gradeDistribution = useMemo(() => calcGradeDistribution(filteredSales), [filteredSales]);

  if (migration.summaries.length === 0 && gradeDistribution.length === 0) return <EmptyState />;

  return (
    <>
      {/* 등급 이동 추이 */}
      {migration.summaries.length > 0 && (
        <ChartCard
          title="월별 등급 이동 추이"
          formula="등급 기준: A(매출 상위 20%), B(상위 40%), C(상위 60%), D(나머지)"
          description="매월 거래처가 어떤 등급으로 이동했는지 추적합니다. 녹색 막대(등급 상승)와 적색 막대(등급 하락)는 기존 고객의 변동을, 황색 선(이탈)과 청색 선(신규)은 고객 유출입과 유입을 보여줍니다."
          benchmark="녹색(상승)이 적색(하락)보다 지속적으로 크면 고객 포트폴리오가 개선되는 추세"
        >
          <div className="h-72 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={migration.summaries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any, name: any) => [`${Number(value).toLocaleString()}개사`, name]}
                />
                <Legend />
                <Bar dataKey="upgraded" name="등급 상승" fill="#059669" stackId="a" />
                <Bar dataKey="downgraded" name="등급 하락" fill="#ef4444" stackId="a" />
                <Line type="monotone" dataKey="churned" name="이탈" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="newCustomers" name="신규" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}

      {/* 등급 분포 추이 (Stacked Area) */}
      {gradeDistribution.length > 0 && (
        <ChartCard
          title="월별 등급 분포 추이"
          formula="월별, 등급별로 거래처 수를 세어서 누적 표시"
          description="매월 A, B, C, D 등급에 속하는 거래처가 각각 몇 곳인지를 면적 차트로 보여줍니다. 시간이 지남에 따라 A등급(상위)의 면적이 넓어지고 D등급(하위)의 면적이 좁아지면 전체 고객 품질이 좋아지고 있다는 의미입니다."
          benchmark="A + B 등급 비중이 지속 증가하면 고객 포트폴리오 건전성 개선 추세"
        >
          <div className="h-72 md:h-96">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={gradeDistribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
            </ResponsiveContainer>
          </div>
        </ChartCard>
      )}
    </>
  );
}
