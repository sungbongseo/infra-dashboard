"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import { Users, Target, Calendar } from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { calcCustomerConcentration, calcCustomerRanking, calcCustomerSegments } from "@/lib/analysis/customerProfitAnalysis";

interface CustProfitTabProps {
  effectiveOrgCustProfit: any[];
  effectiveProfAnalysis: any[];
  isUsingDateFiltered: boolean;
  isDateFiltered?: boolean;
  dateRange: { from?: string; to?: string } | null;
}

export function CustProfitTab({ effectiveOrgCustProfit, effectiveProfAnalysis, isUsingDateFiltered, isDateFiltered, dateRange }: CustProfitTabProps) {
  const custConcentration = useMemo(() => calcCustomerConcentration(effectiveOrgCustProfit), [effectiveOrgCustProfit]);
  const custRanking = useMemo(() => calcCustomerRanking(effectiveOrgCustProfit), [effectiveOrgCustProfit]);
  const custSegments = useMemo(() => calcCustomerSegments(effectiveOrgCustProfit), [effectiveOrgCustProfit]);

  const custDetailTable = useMemo(() => {
    const map = new Map<string, {
      customer: string;
      org: string;
      persons: Set<string>;
      salesActual: number;
      gpActual: number;
      opActual: number;
    }>();
    for (const r of effectiveProfAnalysis) {
      const key = r.매출거래처 || "";
      if (!key) continue;
      const entry = map.get(key) || {
        customer: key,
        org: r.영업조직팀 || "",
        persons: new Set<string>(),
        salesActual: 0,
        gpActual: 0,
        opActual: 0,
      };
      if (r.영업담당사번) entry.persons.add(r.영업담당사번);
      if (!entry.org && r.영업조직팀) entry.org = r.영업조직팀;
      entry.salesActual += r.매출액.실적;
      entry.gpActual += r.매출총이익.실적;
      entry.opActual += r.영업이익.실적;
      map.set(key, entry);
    }
    return Array.from(map.values())
      .map(v => ({
        customer: v.customer,
        org: v.org,
        persons: Array.from(v.persons).join(", "),
        salesActual: v.salesActual,
        gpRate: v.salesActual !== 0 ? (v.gpActual / v.salesActual) * 100 : 0,
        opActual: v.opActual,
        opRate: v.salesActual !== 0 ? (v.opActual / v.salesActual) * 100 : 0,
      }))
      .filter(v => v.salesActual !== 0)
      .sort((a, b) => b.salesActual - a.salesActual);
  }, [effectiveProfAnalysis]);

  return (
    <>
      {isUsingDateFiltered && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          기간 필터 적용 중 — 거래처별품목별 손익(100) 데이터 기준 ({dateRange?.from} ~ {dateRange?.to})
        </div>
      )}
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="거래처 수"
          value={custConcentration.totalCustomers}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="조직별 거래처별 손익 데이터에서 중복 제거한 고유 거래처 수"
          description="조직별 거래처별 손익 데이터에 포함된 고유 거래처 수입니다."
          benchmark="거래처가 다양할수록 매출 안정성이 높으며, 10개 미만이면 집중도 리스크 점검"
          reason="거래처 수를 통해 매출 기반의 다양성을 파악하고, 신규 거래처 확보 필요성과 기존 거래처 이탈 시 영향도를 가늠합니다"
        />
        <KpiCard
          title="HHI 집중도"
          value={custConcentration.hhi}
          format="number"
          icon={<Target className="h-5 w-5" />}
          formula="HHI = Σ(시장점유율²) × 10,000"
          description={`허핀달-허쉬만 지수입니다. ${custConcentration.interpretation}. 높을수록 소수 거래처에 매출이 집중되어 리스크가 높습니다.`}
          benchmark="1,500 미만=낮은 집중도, 1,500~2,500=보통, 2,500 이상=높은 집중도"
          reason="HHI 지수로 거래처 집중도를 정량화하여 특정 거래처 이탈 시 매출 충격의 크기를 사전에 파악하고, 거래처 다변화 전략의 시급성을 판단합니다"
        />
        <KpiCard
          title="Top 5 매출 비중"
          value={custConcentration.top5Share}
          format="percent"
          description="상위 5개 거래처가 전체 매출에서 차지하는 비중입니다. 50% 이상이면 특정 거래처 의존도가 높습니다."
          formula="Top 5 매출 비중 = 매출 상위 5개 거래처 매출 합계 ÷ 전체 매출 × 100"
          benchmark="50% 미만이면 양호한 분산, 70% 이상이면 거래처 다변화 전략 필요"
          reason="상위 5개 거래처의 매출 비중을 통해 핵심 거래처 관리 전략의 중요도를 파악하고, 이들의 이탈 시 매출 감소 규모를 사전에 추정합니다"
        />
        <KpiCard
          title="Top 10 매출 비중"
          value={custConcentration.top10Share}
          format="percent"
          description="상위 10개 거래처가 전체 매출에서 차지하는 비중입니다."
          formula="Top 10 매출 비중 = 매출 상위 10개 거래처 매출 합계 ÷ 전체 매출 × 100"
          benchmark="80% 이상이면 상위 거래처 의존도가 매우 높아 리스크 관리 필수"
          reason="상위 10개 거래처 비중이 높을수록 소수 거래처 의존 리스크가 크므로, 중·하위 거래처 육성과 신규 거래 개척의 시급성을 판단합니다"
        />
      </div>

      {/* 거래처 세그먼트 분포 */}
      <ChartCard title="거래처 세그먼트별 매출 분포" dataSourceType="period" isDateFiltered={isDateFiltered} formula="세그먼트별 매출 비중(%) = 세그먼트 매출 ÷ 전체 매출 × 100" description="거래처 대분류 기준으로 매출, 수익, 마진을 비교합니다. 세그먼트별 수익성 차이를 통해 전략적 집중이 필요한 영역을 파악할 수 있습니다." benchmark="특정 세그먼트가 매출의 50% 이상이면 의존도가 높아 리스크 분산이 필요합니다" reason="세그먼트별 수익 기여도를 비교하여 전략적으로 확대할 세그먼트와 축소할 세그먼트를 결정하고, 영업 자원 배분의 방향을 설정합니다">
        <ErrorBoundary>
        <ChartContainer height="h-64 md:h-80">
            <ComposedChart data={custSegments} layout="vertical">
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <YAxis type="category" dataKey="segment" width={80} tick={{ fontSize: 11 }} />
              <RechartsTooltip formatter={(v: any, name: any) => name.includes("율") || name.includes("비중") ? `${Number(v).toFixed(1)}%` : formatCurrency(Number(v))} {...TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="totalSales" name="매출액" fill={CHART_COLORS[0]} radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="totalGrossProfit" name="매출총이익" fill={CHART_COLORS[1]} radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="totalOperatingProfit" name="영업이익" fill={CHART_COLORS[2]} radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
            </ComposedChart>
        </ChartContainer>
        </ErrorBoundary>
      </ChartCard>

      {/* 거래처 Top/Bottom 랭킹 */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title="매출 Top 15 거래처" dataSourceType="period" isDateFiltered={isDateFiltered} formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100" description="매출액 기준 상위 15개 거래처입니다. 막대 색상은 영업이익율에 따라 녹색(양호)~적색(부진)으로 표시됩니다." benchmark="상위 20% 거래처가 전체 매출의 80%를 차지하면 파레토 법칙에 부합합니다" reason="핵심 거래처의 매출 규모와 수익성을 함께 파악하여 VIP 거래처 관리 전략과 관계 강화 투자의 우선순위를 결정합니다">
          <ChartContainer height="h-80 md:h-96">
              <BarChart data={custRanking.slice(0, 15)} layout="vertical">
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10 }} tickFormatter={(v) => truncateLabel(String(v), 12)} />
                <RechartsTooltip
                  formatter={(v: any) => formatCurrency(Number(v))}
                  labelFormatter={(label) => {
                    const item = custRanking.find((r) => r.name === label);
                    return item ? `${label} (이익율: ${item.opMargin.toFixed(1)}%)` : label;
                  }}
                  {...TOOLTIP_STYLE}
                />
                <Bar dataKey="sales" name="매출액" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                  {custRanking.slice(0, 15).map((entry, idx) => (
                    <Cell key={idx} fill={entry.opMargin >= 5 ? CHART_COLORS[1] : entry.opMargin >= 0 ? CHART_COLORS[5] : CHART_COLORS[4]} />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="거래처 수익성 Scatter" dataSourceType="period" isDateFiltered={isDateFiltered} formula="X축 = 매출액, Y축 = 영업이익율(%)" description="X축=매출액, Y축=영업이익율로 각 거래처의 위치를 보여줍니다. 우상단이 매출도 크고 수익성도 높은 우량 거래처입니다." benchmark="우상단(고매출+고수익): 핵심 거래처, 좌상단(저매출+고수익): 육성 대상, 우하단(고매출+저수익): 조건 재협상 필요" reason="거래처별 매출과 수익성을 2차원으로 매핑하여 핵심 거래처, 육성 대상, 재협상 필요 거래처를 분류하고 맞춤형 관리 전략을 수립합니다">
          <ChartContainer height="h-80 md:h-96">
              <ScatterChart>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" dataKey="sales" name="매출액" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="number" dataKey="opMargin" name="영업이익율(%)" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <ZAxis type="number" dataKey="grossProfit" range={[30, 300]} />
                <RechartsTooltip
                  formatter={(v: any, name: any) => name === "영업이익율(%)" ? `${Number(v).toFixed(1)}%` : formatCurrency(Number(v))}
                  {...TOOLTIP_STYLE}
                />
                <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" />
                <Scatter
                  name="거래처"
                  data={custRanking.slice(0, 15).map((r) => ({ name: r.name, sales: r.sales, opMargin: r.opMargin, grossProfit: r.grossProfit }))}
                  fill={CHART_COLORS[0]}
                >
                  <LabelList dataKey="name" position="top" style={{ fontSize: 9 }} formatter={(v: any) => truncateLabel(String(v), 8)} />
                </Scatter>
              </ScatterChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* 세그먼트 요약 테이블 */}
      <ChartCard title="세그먼트별 상세 지표" dataSourceType="period" isDateFiltered={isDateFiltered} formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100, 영업이익율(%) = 영업이익 ÷ 매출액 × 100" description="거래처 대분류별 거래처 수, 매출 비중, 매출총이익율, 영업이익율을 비교합니다." benchmark="매출총이익율 30% 이상 양호, 영업이익율 10% 이상 양호" reason="세그먼트별 상세 지표를 통해 어떤 유형의 거래처가 가장 수익성이 높은지 파악하고, 세그먼트별 차별화된 영업 전략을 수립합니다">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2 font-medium">세그먼트</th>
                <th className="p-2 font-medium text-right">거래처수</th>
                <th className="p-2 font-medium text-right">매출액</th>
                <th className="p-2 font-medium text-right">매출비중</th>
                <th className="p-2 font-medium text-right">매출총이익율</th>
                <th className="p-2 font-medium text-right">영업이익율</th>
              </tr>
            </thead>
            <tbody>
              {custSegments.map((s) => (
                <tr key={s.segment} className="border-b hover:bg-muted/50">
                  <td className="p-2 font-medium">{s.segment}</td>
                  <td className="p-2 text-right">{s.customerCount}</td>
                  <td className="p-2 text-right">{formatCurrency(s.totalSales, true)}</td>
                  <td className="p-2 text-right">{s.salesShare.toFixed(1)}%</td>
                  <td className={`p-2 text-right ${s.avgGrossMargin >= 20 ? "text-emerald-600 dark:text-emerald-400" : s.avgGrossMargin >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                    {s.avgGrossMargin.toFixed(1)}%
                  </td>
                  <td className={`p-2 text-right ${s.avgOpMargin >= 5 ? "text-emerald-600 dark:text-emerald-400" : s.avgOpMargin >= 0 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                    {s.avgOpMargin.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* 거래처별 담당자 및 영업이익 상세 테이블 */}
      {custDetailTable.length > 0 && (
        <ChartCard
          title="거래처별 담당자 및 영업이익 상세"
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100"
          description="수익성분석(901) 데이터에서 거래처별 영업담당자, 매출액, 이익율, 영업이익을 조회합니다. 담당자 열에는 해당 거래처를 담당하는 사번이 표시됩니다."
          benchmark="담당자당 관리 거래처 수가 적정한지, 이익율 편차가 큰 거래처는 집중 관리"
          reason="거래처별 담당자 매핑을 통해 책임 소재를 명확히 하고, 이익율이 낮은 거래처의 담당자에게 맞춤형 개선 코칭을 지원합니다"
        >
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/50 text-left">
                  <th className="p-2 font-medium">거래처</th>
                  <th className="p-2 font-medium">조직</th>
                  <th className="p-2 font-medium">담당자(사번)</th>
                  <th className="p-2 font-medium text-right">매출액</th>
                  <th className="p-2 font-medium text-right">매출총이익율</th>
                  <th className="p-2 font-medium text-right">영업이익</th>
                  <th className="p-2 font-medium text-right">영업이익율</th>
                </tr>
              </thead>
              <tbody>
                {custDetailTable.slice(0, 50).map((r) => (
                  <tr key={r.customer} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium text-xs">{r.customer.substring(0, 15)}</td>
                    <td className="p-2 text-xs">{r.org}</td>
                    <td className="p-2 text-xs">{r.persons || "-"}</td>
                    <td className="p-2 text-right text-xs">{formatCurrency(r.salesActual, true)}</td>
                    <td className={`p-2 text-right text-xs ${r.gpRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : r.gpRate >= 10 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                      {r.gpRate.toFixed(1)}%
                    </td>
                    <td className={`p-2 text-right text-xs ${r.opActual >= 0 ? "" : "text-red-500 dark:text-red-400"}`}>
                      {formatCurrency(r.opActual, true)}
                    </td>
                    <td className={`p-2 text-right text-xs ${r.opRate >= 5 ? "text-emerald-600 dark:text-emerald-400" : r.opRate >= 0 ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                      {r.opRate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {custDetailTable.length > 50 && (
            <p className="text-xs text-muted-foreground mt-2 px-1">
              * 상위 50건 표시 (전체 {custDetailTable.length}건)
            </p>
          )}
        </ChartCard>
      )}
    </>
  );
}
