"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  BarChart,
  Bar,
  LabelList,
} from "recharts";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  ChartContainer,
  GRID_PROPS,
  BAR_RADIUS_RIGHT,
  ACTIVE_BAR,
  ANIMATION_CONFIG,
  PieOuterLabel,
  YAXIS_CATEGORY,
  truncateLabel,
} from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import {
  calcAccountTypeBreakdown,
  calcAccountTypeTrend,
  calcAccountTypeByOrg,
} from "@/lib/analysis/accountTypeAnalysis";
import { calcSalesByType } from "@/lib/analysis/kpi";
import type { SalesRecord } from "@/types";

interface TypeTabProps {
  filteredSales: SalesRecord[];
  isDateFiltered?: boolean;
}

// 계정구분별 색상 매핑
const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  "제품": CHART_COLORS[0],
  "상품": CHART_COLORS[1],
  "원자재": CHART_COLORS[2],
  "부재료": CHART_COLORS[3],
  "미분류": CHART_COLORS[6],
};

function getAccountColor(type: string): string {
  return ACCOUNT_TYPE_COLORS[type] || CHART_COLORS[5];
}

// 계정구분 x 품목범주 교차 집계
interface CrossEntry {
  accountType: string;
  [category: string]: string | number;
}

function calcAccountCategoryMatrix(data: SalesRecord[]): {
  entries: CrossEntry[];
  categories: string[];
} {
  if (data.length === 0) return { entries: [], categories: [] };

  const matrix = new Map<string, Map<string, number>>();
  const categorySet = new Set<string>();

  for (const row of data) {
    const acct = (row.계정구분 || "미분류").trim() || "미분류";
    const cat = (row.품목범주 || "미분류").trim() || "미분류";
    categorySet.add(cat);

    let catMap = matrix.get(acct);
    if (!catMap) {
      catMap = new Map<string, number>();
      matrix.set(acct, catMap);
    }
    catMap.set(cat, (catMap.get(cat) || 0) + (row.장부금액 || 0));
  }

  const categories = Array.from(categorySet).sort();
  const entries: CrossEntry[] = Array.from(matrix.entries())
    .map(([accountType, catMap]) => {
      const entry: CrossEntry = { accountType };
      for (const cat of categories) {
        entry[cat] = catMap.get(cat) || 0;
      }
      return entry;
    })
    .sort((a, b) => {
      const totalA = categories.reduce((s, c) => s + (Number(a[c]) || 0), 0);
      const totalB = categories.reduce((s, c) => s + (Number(b[c]) || 0), 0);
      return totalB - totalA;
    });

  return { entries, categories };
}

export function TypeTab({ filteredSales, isDateFiltered }: TypeTabProps) {
  // 기존: 내수/수출
  const salesByType = useMemo(() => calcSalesByType(filteredSales), [filteredSales]);
  const donutData = useMemo(
    () => [
      { name: "내수", value: salesByType.domestic },
      { name: "수출", value: salesByType.exported },
    ],
    [salesByType]
  );

  // 신규 1: 계정구분별 비중
  const accountBreakdown = useMemo(
    () => calcAccountTypeBreakdown(filteredSales),
    [filteredSales]
  );

  // 신규 2: 월별 계정구분 추세
  const accountTrend = useMemo(
    () => calcAccountTypeTrend(filteredSales),
    [filteredSales]
  );

  // 신규 3: 조직별 상품의존도
  const orgProfiles = useMemo(
    () => calcAccountTypeByOrg(filteredSales),
    [filteredSales]
  );

  // 신규 4: 계정구분 x 품목범주
  const { entries: crossMatrix, categories: crossCategories } = useMemo(
    () => calcAccountCategoryMatrix(filteredSales),
    [filteredSales]
  );

  // 매출 유형 요약 인사이트
  const typeInsight = useMemo(() => {
    const total = salesByType.domestic + salesByType.exported;
    if (total <= 0) return null;
    const domesticPct = (salesByType.domestic / total) * 100;
    const exportPct = (salesByType.exported / total) * 100;
    const topAccounts = accountBreakdown
      .slice(0, 3)
      .map((a) => `${a.accountType} ${((a.amount / total) * 100).toFixed(1)}%`);
    return { domesticPct, exportPct, topAccounts };
  }, [salesByType, accountBreakdown]);

  if (filteredSales.length === 0) return <EmptyState />;

  return (
    <>
      {typeInsight && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
          <p className="font-medium">매출 유형 요약</p>
          <p className="text-muted-foreground">
            내수 {typeInsight.domesticPct.toFixed(1)}% / 수출 {typeInsight.exportPct.toFixed(1)}%
            {typeInsight.domesticPct >= 80 && " — 내수 편중이 높아 시장 다변화를 검토하세요."}
            {typeInsight.exportPct >= 80 && " — 수출 편중이 높아 환율 리스크 관리가 중요합니다."}
            {typeInsight.topAccounts.length > 0 && ` | 계정구분: ${typeInsight.topAccounts.join(", ")}`}
          </p>
        </div>
      )}
      {/* 기존: 내수/수출 비중 */}
      <ChartCard
        title="내수/수출 비중"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="내수와 수출 유형별로 장부금액을 각각 합산"
        description="전체 매출 중 내수(국내 판매)와 수출(해외 판매)의 비율을 도넛 차트로 보여줍니다. 수출 비중이 높으면 환율 변동에 따라 실적이 크게 흔들릴 수 있으므로 환리스크 관리가 중요합니다."
        benchmark="내수와 수출이 적절히 분산되면 안정적, 한쪽 비중이 80% 이상이면 편중 주의"
        reason="매출 유형(내수/수출) 구성 변화를 모니터링하여 사업 포트폴리오 균형을 관리하고, 환율 리스크 노출 수준을 점검합니다."
      >
        <ChartContainer height="h-64 md:h-80">
          <PieChart>
            <Pie
              data={donutData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              dataKey="value"
              label={PieOuterLabel}
              labelLine={{ strokeWidth: 1 }}
            >
              {donutData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i]} />
              ))}
            </Pie>
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any) => formatCurrency(Number(value))}
            />
          </PieChart>
        </ChartContainer>
      </ChartCard>

      {/* 신규 1: 계정구분별 매출 비중 */}
      <ChartCard
        title="계정구분별 매출 비중"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        isEmpty={accountBreakdown.length === 0}
        formula="계정구분(제품/상품/원자재/부재료)별 장부금액 합산 후 비율 계산"
        description="매출을 계정구분(제품/상품/원자재/부재료)별로 분류하여 각 유형이 전체 매출에서 차지하는 비중을 보여줍니다. 제품 비중이 높으면 자체 생산 기반, 상품 비중이 높으면 유통/트레이딩 중심 구조입니다."
        benchmark="제조업 기준 제품 비중 60% 이상이면 자체 생산 중심, 상품 비중 40% 이상이면 트레이딩 의존도 점검 필요"
        reason="매출 구성의 본질적 성격을 파악하여 자체 생산 vs 외부 조달 균형을 관리하고, 수익성 구조 변화를 진단합니다."
      >
        <ChartContainer height="h-64 md:h-80">
          <PieChart>
            <Pie
              data={accountBreakdown.map((d) => ({
                name: d.accountType,
                value: d.amount,
              }))}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={120}
              dataKey="value"
              label={PieOuterLabel}
              labelLine={{ strokeWidth: 1 }}
            >
              {accountBreakdown.map((d, i) => (
                <Cell key={i} fill={getAccountColor(d.accountType)} />
              ))}
            </Pie>
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            <Legend />
          </PieChart>
        </ChartContainer>
      </ChartCard>

      {/* 신규 2: 월별 계정구분 추세 */}
      <ChartCard
        title="월별 계정구분별 매출 추세"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        isEmpty={accountTrend.length === 0}
        formula="매출일 기준 월별로 계정구분(제품/상품/원자재/부재료) 매출 합산"
        description="월별로 계정구분별 매출 추이를 누적 영역 차트로 보여줍니다. 특정 계정구분의 비중이 시간에 따라 변화하는지 확인할 수 있습니다."
        benchmark="월별 구성비가 안정적이면 포트폴리오 균형, 급격한 변동은 사업 구조 변화 신호"
        reason="시간에 따른 매출 구성 변화를 추적하여 사업 구조의 전환이나 특정 유형의 비중 증감을 조기에 감지합니다."
      >
        <ChartContainer height="h-64 md:h-80">
          <AreaChart data={accountTrend}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => [
                formatCurrency(Number(value)),
                String(name),
              ]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="제품"
              stackId="1"
              stroke={getAccountColor("제품")}
              fill={getAccountColor("제품")}
              fillOpacity={0.7}
              {...ANIMATION_CONFIG}
            />
            <Area
              type="monotone"
              dataKey="상품"
              stackId="1"
              stroke={getAccountColor("상품")}
              fill={getAccountColor("상품")}
              fillOpacity={0.7}
              {...ANIMATION_CONFIG}
            />
            <Area
              type="monotone"
              dataKey="원자재"
              stackId="1"
              stroke={getAccountColor("원자재")}
              fill={getAccountColor("원자재")}
              fillOpacity={0.7}
              {...ANIMATION_CONFIG}
            />
            <Area
              type="monotone"
              dataKey="부재료"
              stackId="1"
              stroke={getAccountColor("부재료")}
              fill={getAccountColor("부재료")}
              fillOpacity={0.7}
              {...ANIMATION_CONFIG}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>

      {/* 신규 3: 조직별 상품의존도 비교 */}
      <ChartCard
        title="조직별 상품의존도 비교"
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        isEmpty={orgProfiles.length === 0}
        formula="영업조직별 상품 매출 비중(%) = 상품 매출 / 조직 전체 매출 x 100"
        description="각 영업조직의 상품 의존도를 가로 막대로 비교합니다. 상품 의존도가 높은 조직은 마진이 낮은 트레이딩 중심이므로, 자체 제품 매출 확대 전략이 필요합니다."
        benchmark="상품 의존도 30% 이하이면 안정적, 50% 이상이면 트레이딩 의존 경고"
        reason="조직별 매출 구조의 차이를 파악하여, 상품 의존도가 높은 조직에 대한 제품 전환 전략을 수립합니다."
      >
        <ChartContainer height="h-64 md:h-80">
          <BarChart
            data={[...orgProfiles].sort(
              (a, b) => b.merchandiseDependency - a.merchandiseDependency
            )}
            layout="vertical"
          >
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${Number(v).toFixed(0)}%`}
              domain={[0, "auto"]}
            />
            <YAxis
              type="category"
              dataKey="org"
              {...YAXIS_CATEGORY}
              tickFormatter={(v: any) => truncateLabel(String(v), 10)}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(value: any, name: any) => [
                `${Number(value).toFixed(1)}%`,
                String(name),
              ]}
            />
            <Bar
              dataKey="merchandiseDependency"
              name="상품의존도"
              fill={CHART_COLORS[1]}
              radius={BAR_RADIUS_RIGHT}
              activeBar={ACTIVE_BAR}
              {...ANIMATION_CONFIG}
            >
              <LabelList
                dataKey="merchandiseDependency"
                position="right"
                formatter={(v: any) => `${Number(v).toFixed(1)}%`}
                style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </ChartCard>

      {/* 신규 4: 계정구분 x 품목범주 교차 분석 */}
      {crossMatrix.length > 0 && crossCategories.length > 0 && (
        <ChartCard
          title="계정구분 x 품목범주 교차 분석"
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          isEmpty={crossMatrix.length === 0}
          formula="계정구분별 품목범주 매출 교차 집계"
          description="계정구분(제품/상품/원자재/부재료)과 품목범주(표준/구매직납/수출 등)를 교차하여 매출 구성을 분석합니다. 어떤 계정구분에서 어떤 품목범주가 큰 비중을 차지하는지 파악할 수 있습니다."
          benchmark="특정 교차 셀이 전체의 50% 이상이면 매출 구조 편중"
          reason="매출 구조를 2차원으로 분석하여 제품-품목범주 조합의 균형과 편중을 진단합니다."
        >
          <ChartContainer height="h-64 md:h-80">
            <BarChart data={crossMatrix}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="accountType" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v: any) => formatCurrency(v, true)}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(value: any, name: any) => [
                  formatCurrency(Number(value)),
                  String(name),
                ]}
              />
              <Legend />
              {crossCategories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="stack"
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  {...ANIMATION_CONFIG}
                />
              ))}
            </BarChart>
          </ChartContainer>
        </ChartCard>
      )}
    </>
  );
}
