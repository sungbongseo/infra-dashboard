"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT } from "@/components/charts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcRfmScores, calcRfmSegmentSummary, RFM_SEGMENT_ACTIONS } from "@/lib/analysis/rfm";
import type { RfmScore, RfmSegmentSummary } from "@/lib/analysis/rfm";

const RFM_COLORS: Record<string, string> = {
  VIP: "#059669",
  Loyal: "#3b82f6",
  Potential: "#8b5cf6",
  "At-risk": "#f59e0b",
  Dormant: "#6b7280",
  Lost: "#ef4444",
};

const PRIORITY_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: "긴급", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  medium: { label: "보통", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  low: { label: "낮음", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

import type { SalesRecord } from "@/types";

interface RfmTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

export function RfmTab({ filteredSales, isDateFiltered }: RfmTabProps) {
  const rfmScores = useMemo(() => calcRfmScores(filteredSales), [filteredSales]);
  const rfmSummary = useMemo(() => calcRfmSegmentSummary(rfmScores), [rfmScores]);

  // Group scores by segment for the customer list section
  const scoresBySegment = useMemo(() => {
    const map = new Map<string, RfmScore[]>();
    for (const s of rfmScores) {
      const existing = map.get(s.rfmSegment);
      if (existing) {
        existing.push(s);
      } else {
        map.set(s.rfmSegment, [s]);
      }
    }
    // Sort each segment's customers by monetary descending
    Array.from(map.values()).forEach((arr) => arr.sort((a, b) => b.monetary - a.monetary));
    return map;
  }, [rfmScores]);

  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(new Set());

  const toggleSegment = (segment: string) => {
    setExpandedSegments((prev) => {
      const next = new Set(prev);
      if (next.has(segment)) next.delete(segment);
      else next.add(segment);
      return next;
    });
  };

  if (rfmScores.length === 0) return <EmptyState />;

  // Grand total for share calculations
  const grandTotal = rfmScores.reduce((sum, s) => sum + s.monetary, 0);

  return (
    <>
      {/* 세그먼트 분포 & 세그먼트별 매출 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="RFM 세그먼트 분포 (거래처 수)"
          formula="고객별 최근성, 빈도, 금액을 5단계로 점수화한 뒤 세그먼트 분류"
          description="RFM 분석은 고객을 3가지 기준으로 평가합니다. R(최근성): 마지막 거래가 얼마나 최근인지, F(빈도): 얼마나 자주 거래하는지, M(금액): 총 거래 금액이 얼마인지. 이 점수를 조합하여 VIP(최우수), Loyal(충성), Potential(잠재), At-risk(위험), Dormant(휴면), Lost(이탈) 등 6개 그룹으로 나눕니다."
          benchmark="VIP + Loyal 거래처가 전체의 30% 이상이면 건전한 고객 포트폴리오"
          reason="고객 포트폴리오 건전성을 평가하여 VIP 집중 관리, 이탈 위험 고객 선제 대응 등 세그먼트별 맞춤 전략을 수립합니다."
        >
          <ChartContainer height="h-72 md:h-80">
              <PieChart>
                <Pie
                  data={rfmSummary}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  dataKey="count"
                  nameKey="segment"
                  label={
                    rfmSummary.length <= 6
                      ? (props: any) => {
                          const { cx, cy, midAngle, outerRadius: or, segment, count } = props;
                          const RADIAN = Math.PI / 180;
                          const radius = (or || 110) + 25;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="hsl(var(--foreground))"
                              textAnchor={x > cx ? "start" : "end"}
                              dominantBaseline="central"
                              fontSize={11}
                            >
                              {segment} ({count})
                            </text>
                          );
                        }
                      : false
                  }
                >
                  {rfmSummary.map((entry) => (
                    <Cell
                      key={entry.segment}
                      fill={RFM_COLORS[entry.segment] || CHART_COLORS[0]}
                    />
                  ))}
                </Pie>
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload as RfmSegmentSummary;
                    const totalCount = rfmSummary.reduce((s, seg) => s + seg.count, 0);
                    const countShare = totalCount > 0 ? (d.count / totalCount * 100) : 0;
                    const salesShare = grandTotal > 0 ? (d.totalSales / grandTotal * 100) : 0;
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-md text-sm space-y-1">
                        <div className="font-semibold flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: RFM_COLORS[d.segment] || CHART_COLORS[0] }} />
                          {d.segment}
                        </div>
                        <div>거래처 수: <span className="font-medium">{d.count.toLocaleString()}개사</span> ({countShare.toFixed(1)}%)</div>
                        <div>총 매출: <span className="font-medium">{formatCurrency(d.totalSales)}</span> ({salesShare.toFixed(1)}%)</div>
                        <div>평균 매출: <span className="font-medium">{formatCurrency(d.avgSales)}</span></div>
                      </div>
                    );
                  }}
                />
                {rfmSummary.length > 6 && <Legend />}
              </PieChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
          title="세그먼트별 매출 비중"
          formula="세그먼트별로 고객 매출액(M값)을 합산"
          description="각 고객 등급(세그먼트)이 전체 매출에서 차지하는 금액을 비교합니다. 보통 VIP 소수 고객이 전체 매출의 대부분을 차지하며, 이들의 이탈 방지가 매출 유지의 핵심입니다."
          benchmark="VIP 세그먼트 매출 비중이 60% 이상이면 핵심 고객 관리 프로그램 강화 필요"
          reason="세그먼트별 매출 기여도를 파악하여 VIP 이탈 시 매출 충격 규모를 예측하고, 등급별 차별화된 영업 자원 배분 근거를 마련합니다."
        >
          <ChartContainer height="h-72 md:h-80">
              <BarChart data={rfmSummary} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="segment" tick={{ fontSize: 11 }} width={65} />
                <RechartsTooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: any) => [formatCurrency(Number(value)), "매출액"]}
                />
                <Bar dataKey="totalSales" name="매출액" radius={BAR_RADIUS_RIGHT}>
                  {rfmSummary.map((entry) => (
                    <Cell
                      key={entry.segment}
                      fill={RFM_COLORS[entry.segment] || CHART_COLORS[0]}
                    />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Recency vs Monetary 산점도 */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="Recency vs Monetary 분포"
        formula="가로축: 마지막 거래 후 경과 개월, 세로축: 총 매출액, 점 크기: 거래 빈도"
        description="고객을 최근성(가로축)과 매출 규모(세로축)로 배치한 산점도입니다. 점이 클수록 거래 빈도가 높은 고객입니다. 왼쪽 위(최근 거래 + 높은 매출)에 있는 고객이 VIP이고, 오른쪽 아래(오래된 거래 + 낮은 매출)에 있는 고객은 이탈 위험군입니다."
        benchmark="왼쪽 위에 큰 점이 많을수록 건전한 고객 구조"
        reason="고객별 최근 거래 활동과 매출 규모를 동시에 시각화하여 이탈 징후가 있는 고가치 고객을 빠르게 식별하고, 영업 우선순위를 결정합니다."
      >
        <ChartContainer height="h-72 md:h-96">
            <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                type="number"
                dataKey="recency"
                name="최근성(개월)"
                tick={{ fontSize: 11 }}
                label={{ value: "최근 거래 경과(개월)", position: "insideBottom", offset: -5, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="monetary"
                name="총매출"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => formatCurrency(v, true)}
                width={60}
              />
              <ZAxis type="number" dataKey="frequency" range={[30, 400]} name="거래빈도" />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as RfmScore;
                  return (
                    <div className="rounded-lg border bg-background p-3 shadow-md text-sm space-y-1">
                      <div className="font-semibold flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: RFM_COLORS[d.rfmSegment] || CHART_COLORS[0] }} />
                        {d.customerName || d.customer}
                        <span className="text-xs font-normal text-muted-foreground">({d.rfmSegment})</span>
                      </div>
                      <div>총매출: <span className="font-medium">{formatCurrency(d.monetary)}</span></div>
                      <div>최근 거래: <span className="font-medium">{d.recency}개월 전</span></div>
                      <div>거래 빈도: <span className="font-medium">{d.frequency}건</span></div>
                      <div className="text-xs text-muted-foreground">R={d.rScore} F={d.fScore} M={d.mScore} (합계 {d.totalScore})</div>
                    </div>
                  );
                }}
              />
              <Scatter
                name="고객"
                data={rfmScores}
                fill={CHART_COLORS[0]}
                fillOpacity={0.6}
              >
                {rfmScores.map((entry, idx) => (
                  <Cell
                    key={idx}
                    fill={RFM_COLORS[entry.rfmSegment] || CHART_COLORS[0]}
                  />
                ))}
              </Scatter>
            </ScatterChart>
        </ChartContainer>
      </ChartCard>

      {/* 세그먼트별 거래처 목록 + 추천 액션 */}
      <ChartCard dataSourceType="period" isDateFiltered={isDateFiltered}
        title="세그먼트별 거래처 목록 및 추천 액션"
        formula="RFM 세그먼트별 소속 거래처를 매출 내림차순으로 정렬"
        description="각 세그먼트에 해당하는 거래처 목록과 해당 세그먼트의 추천 액션을 확인할 수 있습니다. 세그먼트를 클릭하면 상위 20개 거래처 상세가 표시됩니다."
        reason="세그먼트별 실제 거래처를 확인하여 담당 영업사원에게 구체적인 액션 아이템을 전달하고, 세그먼트 이동 모니터링의 기초 자료로 활용합니다."
      >
        <div className="space-y-2">
          {rfmSummary.map((seg) => {
            const isExpanded = expandedSegments.has(seg.segment);
            const customers = scoresBySegment.get(seg.segment) ?? [];
            const action = RFM_SEGMENT_ACTIONS[seg.segment];
            const badge = action ? PRIORITY_BADGE[action.priority] : null;
            const segSalesShare = grandTotal > 0 ? (seg.totalSales / grandTotal * 100) : 0;

            return (
              <div key={seg.segment} className="border rounded-lg overflow-hidden">
                {/* Header — always visible */}
                <button
                  type="button"
                  onClick={() => toggleSegment(seg.segment)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  }
                  <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: RFM_COLORS[seg.segment] || CHART_COLORS[0] }} />
                  <span className="font-medium text-sm">{seg.segment}</span>
                  <span className="text-xs text-muted-foreground">{seg.count.toLocaleString()}개사</span>
                  <span className="text-xs text-muted-foreground">매출 {formatCurrency(seg.totalSales)} ({segSalesShare.toFixed(1)}%)</span>
                  {badge && (
                    <span className={`ml-auto inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Action card */}
                    {action && (
                      <div className="rounded-md bg-muted/40 p-3 space-y-1">
                        <div className="text-sm font-medium">{action.action}</div>
                        <div className="text-xs text-muted-foreground">{action.description}</div>
                      </div>
                    )}

                    {/* Customer table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-muted-foreground">
                            <th className="py-1.5 px-2 font-medium">거래처명</th>
                            <th className="py-1.5 px-2 font-medium text-center">R</th>
                            <th className="py-1.5 px-2 font-medium text-center">F</th>
                            <th className="py-1.5 px-2 font-medium text-center">M</th>
                            <th className="py-1.5 px-2 font-medium text-center">총점</th>
                            <th className="py-1.5 px-2 font-medium text-right">매출액</th>
                            <th className="py-1.5 px-2 font-medium text-right">최근 거래</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customers.slice(0, 20).map((c) => (
                            <tr key={c.customer} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="py-1.5 px-2 font-medium">{c.customerName || c.customer}</td>
                              <td className="py-1.5 px-2 text-center">{c.rScore}</td>
                              <td className="py-1.5 px-2 text-center">{c.fScore}</td>
                              <td className="py-1.5 px-2 text-center">{c.mScore}</td>
                              <td className="py-1.5 px-2 text-center font-medium">{c.totalScore}</td>
                              <td className="py-1.5 px-2 text-right">{formatCurrency(c.monetary)}</td>
                              <td className="py-1.5 px-2 text-right text-muted-foreground">{c.recency === 0 ? "이번 달" : `${c.recency}개월 전`}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {customers.length > 20 && (
                        <div className="text-xs text-muted-foreground text-center mt-2">
                          상위 20개 거래처만 표시 (전체 {customers.length.toLocaleString()}개사)
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ChartCard>
    </>
  );
}
