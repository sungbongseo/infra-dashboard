import { useState, useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { ChartContainer } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { OrgRatioMetric } from "@/lib/analysis/kpi";

/**
 * 히트맵 배경색 결정
 * isCostItem=true이면 색상 반전 (비용 초과 = 빨간색)
 */
function getHeatmapBg(rate: number, isCostItem: boolean, actual?: number): string {
  if (!isFinite(rate) || rate >= 9999) {
    if (isCostItem && actual && actual > 0) return "#ef4444";
    return "#6b7280";
  }
  if (isCostItem) {
    if (rate <= 80) return "#059669";
    if (rate <= 100) return "#34d399";
    if (rate <= 120) return "#fbbf24";
    if (rate <= 150) return "#f97316";
    return "#ef4444";
  }
  if (rate >= 120) return "#059669";
  if (rate >= 100) return "#34d399";
  if (rate >= 80) return "#fbbf24";
  if (rate >= 50) return "#f97316";
  return "#ef4444";
}

interface HeatmapRow {
  org: string;
  metrics: Array<{
    name: string;
    plan: number;
    actual: number;
    gap: number;
    achievementRate: number;
    isCostItem: boolean;
  }>;
}

interface PlanTabProps {
  isDateFiltered?: boolean;
  orgRatioMetrics: OrgRatioMetric[];
  heatmapData: HeatmapRow[];
}

export function PlanTab({ orgRatioMetrics, heatmapData, isDateFiltered }: PlanTabProps) {
  const [selectedRadarOrgs, setSelectedRadarOrgs] = useState<string[]>([]);

  const radarOrgs = useMemo(() => {
    if (selectedRadarOrgs.length > 0) return selectedRadarOrgs;
    return orgRatioMetrics.slice(0, 5).map((r) => r.org);
  }, [orgRatioMetrics, selectedRadarOrgs]);

  const radarData = useMemo(() => {
    const metrics = ["매출원가율", "매출총이익율", "판관비율", "영업이익율", "공헌이익율"] as const;
    return metrics.map((m) => {
      const entry: Record<string, string | number> = { metric: m };
      for (const org of radarOrgs) {
        const found = orgRatioMetrics.find((r) => r.org === org);
        const rawValue = found ? found[m] : 0;
        entry[org] = Math.max(rawValue, 0);
        entry[`_raw_${org}`] = rawValue;
      }
      return entry;
    });
  }, [orgRatioMetrics, radarOrgs]);

  const heatmapMetricNames = heatmapData.length > 0 ? heatmapData[0].metrics.map((m) => m.name) : [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Radar Chart */}
      <ChartCard
        title="조직별 비율 지표 레이더"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="5개 축 = 매출원가율, 매출총이익율, 판관비율, 영업이익율, 공헌이익율"
        description="각 조직의 손익 구조를 5가지 비율 지표로 거미줄 모양의 레이더 차트에 표시합니다. 이익 관련 축(매출총이익율, 영업이익율, 공헌이익율)이 바깥쪽에 있을수록 수익성이 좋고, 비용 관련 축(매출원가율, 판관비율)이 안쪽에 있을수록 효율적입니다. 조직 간 수익 구조 차이를 직관적으로 비교할 수 있습니다."
        benchmark="매출총이익율 30% 이상, 영업이익율 10% 이상, 공헌이익율은 높을수록 양호"
        reason="조직별 수익 구조를 다차원으로 비교하여 각 조직의 강점과 약점을 한눈에 파악하고, 개선이 필요한 구체적인 지표를 특정합니다"
        action={
          <div className="flex flex-wrap gap-1">
            {orgRatioMetrics.map((r) => (
              <button
                key={r.org}
                onClick={() => {
                  setSelectedRadarOrgs((prev) => {
                    if (prev.includes(r.org)) return prev.filter((o) => o !== r.org);
                    if (prev.length >= 7) return prev;
                    return [...prev, r.org];
                  });
                }}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  radarOrgs.includes(r.org)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {r.org}
              </button>
            ))}
          </div>
        }
      >
        <ChartContainer height="h-72 md:h-96">
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fontSize: 10 }} />
              {radarOrgs.map((org, i) => (
                <Radar
                  key={org}
                  name={org}
                  dataKey={org}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any, props: any) => {
                  const rawKey = `_raw_${name}`;
                  const rawValue = props?.payload?.[rawKey];
                  const actual = rawValue !== undefined ? Number(rawValue) : Number(value);
                  const suffix = actual < 0 ? " (손실)" : "";
                  return `${actual.toFixed(1)}%${suffix}`;
                }}
              />
            </RadarChart>
        </ChartContainer>
      </ChartCard>

      {/* Heatmap */}
      <ChartCard
        title="계획 대비 실적 히트맵"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="달성률(%) = 실적 ÷ 계획 × 100"
        description="각 조직의 매출, 이익 등 주요 손익 항목이 연초 계획 대비 몇 % 달성했는지를 색상으로 한눈에 보여줍니다. 수익 항목(매출, 이익)은 달성률이 높을수록 녹색, 비용 항목(원가, 판관비)은 달성률이 낮을수록(예산 절감) 녹색으로 표시됩니다."
        benchmark="수익항목: 녹색 100% 이상 달성, 노랑 80~100%, 빨강 80% 미만 | 비용항목: 색상이 반대(낮을수록 좋음)"
        reason="계획 대비 실적 괴리를 조직×항목별로 시각화하여 목표 미달 영역을 조기에 발견하고, 긴급 대응이 필요한 조직과 항목의 우선순위를 결정합니다"
      >
        <div className="overflow-x-auto">
          {/* Header */}
          <div className="flex border-b bg-muted/50">
            <div className="min-w-[100px] p-2 text-xs font-medium">조직</div>
            {heatmapMetricNames.map((name) => (
              <div key={name} className="min-w-[80px] flex-1 p-2 text-xs font-medium text-center">
                {name}
              </div>
            ))}
          </div>
          {/* Rows */}
          {heatmapData.map((row) => (
            <div key={row.org} className="flex border-b hover:bg-muted/20 transition-colors">
              <div className="min-w-[100px] p-2 text-xs font-medium truncate" title={row.org}>
                {row.org}
              </div>
              {row.metrics.map((m) => {
                const rate = m.achievementRate;
                const noplan = !isFinite(rate) || rate >= 9999;
                const displayRate = noplan ? (m.isCostItem && m.actual > 0 ? "예산외" : "계획없음") : `${rate.toFixed(0)}%`;
                const bg = getHeatmapBg(rate, m.isCostItem, m.actual);
                const textColor = (bg === "#fbbf24") ? "text-gray-900" : "text-white";
                return (
                  <div
                    key={m.name}
                    className={`min-w-[80px] flex-1 p-2 text-center text-xs font-mono font-medium rounded-sm m-0.5 ${textColor}`}
                    title={`계획: ${formatCurrency(m.plan, true)} | 실적: ${formatCurrency(m.actual, true)} | 차이: ${formatCurrency(m.gap, true)}`}
                    style={{ backgroundColor: bg }}
                  >
                    {displayRate}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-3 px-2 text-xs text-muted-foreground">
            <span className="font-medium">수익항목:</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#059669" }} />
              120%+
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#34d399" }} />
              100~120%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#fbbf24" }} />
              80~100%
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />
              80% 미만
            </span>
            <span className="mx-1">|</span>
            <span className="font-medium">비용항목: 색상 반전</span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#6b7280" }} />
              계획없음
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm border border-red-300" style={{ backgroundColor: "#ef4444" }} />
              예산외 비용
            </span>
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
