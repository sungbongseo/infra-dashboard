"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcOrgScorecards } from "@/lib/analysis/crossAnalysis";
import { Award, TrendingUp, Users, Wallet } from "lucide-react";
import type { OrgProfitRecord, SalesRecord, CollectionRecord } from "@/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";

interface OrgScorecardTabProps {
  orgProfit: OrgProfitRecord[];
  salesList: SalesRecord[];
  collectionList: CollectionRecord[];
  isDateFiltered: boolean;
}

export function OrgScorecardTab({ orgProfit, salesList, collectionList, isDateFiltered }: OrgScorecardTabProps) {
  const scorecards = useMemo(
    () => calcOrgScorecards(orgProfit, salesList, collectionList),
    [orgProfit, salesList, collectionList]
  );

  const topOrg = scorecards[0];
  const avgScore = scorecards.length > 0
    ? scorecards.reduce((s, c) => s + c.overallScore, 0) / scorecards.length
    : 0;
  const avgProfitability = scorecards.length > 0
    ? scorecards.reduce((s, c) => s + c.profitability, 0) / scorecards.length
    : 0;
  const avgCollection = scorecards.length > 0
    ? scorecards.reduce((s, c) => s + c.collectionEfficiency, 0) / scorecards.length
    : 0;

  const radarData = useMemo(() => {
    return scorecards.slice(0, 5).map((sc) => ({
      org: sc.orgName.length > 8 ? sc.orgName.slice(0, 8) + "…" : sc.orgName,
      수익성: Math.max(0, sc.profitability),
      수금효율: Math.max(0, sc.collectionEfficiency),
      고객다각화: Math.max(0, sc.customerDiversity),
      종합점수: Math.max(0, sc.overallScore),
    }));
  }, [scorecards]);

  if (scorecards.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">조직 손익 + 매출 + 수금 데이터가 모두 필요합니다.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="최우수 조직"
          value={topOrg?.overallScore ?? 0}
          format="number"
          icon={<Award className="h-5 w-5" />}
          formula="수익성 30% + 수금효율 25% + 고객다각화 20% + 규모 25% 가중 합산"
          description={`${topOrg?.orgName || "-"} (${topOrg?.overallScore?.toFixed(1) || 0}점)`}
        />
        <KpiCard
          title="평균 종합점수"
          value={avgScore}
          format="number"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="전 조직 종합점수의 산술평균"
        />
        <KpiCard
          title="평균 수익성"
          value={avgProfitability}
          format="percent"
          icon={<Users className="h-5 w-5" />}
          formula="전 조직 영업이익률의 산술평균"
        />
        <KpiCard
          title="평균 수금효율"
          value={avgCollection}
          format="percent"
          icon={<Wallet className="h-5 w-5" />}
          formula="전 조직 수금/매출 비율의 산술평균"
        />
      </div>

      <ChartCard
        title="조직별 종합 스코어카드"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="종합점수 = 수익성×0.3 + 수금효율×0.25 + 고객다각화×0.2 + 규모×0.25"
        description="각 조직의 수익성, 수금효율, 고객다각화, 규모를 가중 합산한 종합 점수 랭킹입니다."
        benchmark="종합점수 60점 이상이면 양호, 40점 미만이면 개선 필요"
      >
        <ChartContainer>
          <BarChart data={scorecards.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis type="number" tick={{ fontSize: 11 }} domain={[0, 100]} />
            <YAxis type="category" dataKey="orgName" tick={{ fontSize: 11 }} width={75} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => {
                if (name === "salesAmount") return formatCurrency(Number(value));
                return `${Number(value).toFixed(1)}`;
              }}
            />
            <Bar dataKey="overallScore" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} name="종합점수" activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {radarData.length > 0 && (
        <ChartCard
          title="조직 역량 비교 (Top 5)"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="수익성(영업이익률), 수금효율(수금/매출), 고객다각화(1-HHI), 종합점수"
          description="상위 5개 조직의 4개 축 역량을 비교합니다."
        >
          <ChartContainer height="h-72 md:h-96">
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="org" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 9 }} />
              <Legend />
              {radarData.length > 0 && <Radar name="수익성" dataKey="수익성" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.15} />}
              {radarData.length > 0 && <Radar name="수금효율" dataKey="수금효율" stroke={CHART_COLORS[1]} fill={CHART_COLORS[1]} fillOpacity={0.15} />}
              {radarData.length > 0 && <Radar name="고객다각화" dataKey="고객다각화" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.15} />}
            </RadarChart>
          </ChartContainer>
        </ChartCard>
      )}

      <ChartCard
        title="조직 스코어카드 상세"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3 font-medium">순위</th>
                <th className="py-2 px-3 font-medium">조직</th>
                <th className="py-2 px-3 font-medium text-right">매출액</th>
                <th className="py-2 px-3 font-medium text-right">수익성(%)</th>
                <th className="py-2 px-3 font-medium text-right">수금효율(%)</th>
                <th className="py-2 px-3 font-medium text-right">고객다각화(%)</th>
                <th className="py-2 px-3 font-medium text-right">종합점수</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((sc, i) => (
                <tr key={sc.orgName} className="border-b border-border/50 hover:bg-muted/50">
                  <td className="py-1.5 px-3 font-medium">{i + 1}</td>
                  <td className="py-1.5 px-3">{sc.orgName}</td>
                  <td className="py-1.5 px-3 text-right">{formatCurrency(sc.salesAmount)}</td>
                  <td className={`py-1.5 px-3 text-right font-medium ${sc.profitability >= 5 ? "text-green-600" : sc.profitability < 0 ? "text-red-600" : "text-amber-600"}`}>
                    {sc.profitability.toFixed(1)}
                  </td>
                  <td className="py-1.5 px-3 text-right">{sc.collectionEfficiency.toFixed(1)}</td>
                  <td className="py-1.5 px-3 text-right">{sc.customerDiversity.toFixed(1)}</td>
                  <td className={`py-1.5 px-3 text-right font-bold ${sc.overallScore >= 60 ? "text-green-600" : sc.overallScore < 40 ? "text-red-600" : "text-amber-600"}`}>
                    {sc.overallScore.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}
