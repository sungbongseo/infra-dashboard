"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { calcTopCustomers, calcItemSales, calcSalesByType } from "@/lib/analysis/kpi";
import { calcSalesByPaymentTerm, calcSalesByChannel, calcProductGroupTrends } from "@/lib/analysis/channel";
import { calcRfmScores, calcRfmSegmentSummary } from "@/lib/analysis/rfm";
import { calcClv, calcClvSummary } from "@/lib/analysis/clv";
import { calcCustomerMigration, calcGradeDistribution } from "@/lib/analysis/migration";
import { calcCurrencySales, calcMonthlyFxTrend, calcFxPnL } from "@/lib/analysis/fx";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Treemap,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
  Area,
  AreaChart,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { DollarSign, Users, BarChart3, Target, TrendingUp, Crown, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { formatCurrency, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";

export default function SalesAnalysisPage() {
  const { salesList, orgNames, orgProfit } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredSales = useMemo(() => {
    const byOrg = filterByOrg(salesList, effectiveOrgNames);
    return filterByDateRange(byOrg, dateRange, "매출일");
  }, [salesList, effectiveOrgNames, dateRange]);

  const topCustomers = useMemo(() => calcTopCustomers(filteredSales, 15), [filteredSales]);
  const itemSales = useMemo(() => calcItemSales(filteredSales), [filteredSales]);
  const salesByType = useMemo(() => calcSalesByType(filteredSales), [filteredSales]);

  // 채널 분석 데이터
  const paymentTermSales = useMemo(() => calcSalesByPaymentTerm(filteredSales), [filteredSales]);
  const channelSales = useMemo(() => calcSalesByChannel(filteredSales), [filteredSales]);
  const productGroupTrends = useMemo(() => calcProductGroupTrends(filteredSales), [filteredSales]);

  // RFM, CLV, 거래처 이동 분석 데이터
  const filteredOrgProfit = useMemo(
    () => filterByOrg(orgProfit, effectiveOrgNames, "영업조직팀"),
    [orgProfit, effectiveOrgNames]
  );

  const rfmScores = useMemo(() => calcRfmScores(filteredSales), [filteredSales]);
  const rfmSummary = useMemo(() => calcRfmSegmentSummary(rfmScores), [rfmScores]);
  const clvResults = useMemo(() => calcClv(filteredSales, filteredOrgProfit), [filteredSales, filteredOrgProfit]);
  const clvSummary = useMemo(() => calcClvSummary(clvResults), [clvResults]);
  const migration = useMemo(() => calcCustomerMigration(filteredSales), [filteredSales]);
  const gradeDistribution = useMemo(() => calcGradeDistribution(filteredSales), [filteredSales]);

  // FX 분석 데이터
  const fxImpact = useMemo(() => calcCurrencySales(filteredSales), [filteredSales]);
  const monthlyFxTrend = useMemo(() => calcMonthlyFxTrend(filteredSales), [filteredSales]);
  const fxPnL = useMemo(() => calcFxPnL(filteredSales), [filteredSales]);

  const topCustomersExport = useMemo(
    () => topCustomers.map((c) => ({ 거래처코드: c.code, 거래처명: c.name, 매출액: c.amount })),
    [topCustomers]
  );

  const paretoData = useMemo(() => {
    const total = topCustomers.reduce((s, c) => s + c.amount, 0);
    let cum = 0;
    return topCustomers.map((c) => {
      cum += c.amount;
      return {
        name: c.name || c.code,
        amount: c.amount,
        cumPercent: total > 0 ? (cum / total) * 100 : 0,
      };
    });
  }, [topCustomers]);

  const donutData = useMemo(() => [
    { name: "내수", value: salesByType.domestic },
    { name: "수출", value: salesByType.exported },
  ], [salesByType]);

  const treemapData = useMemo(() =>
    itemSales.slice(0, 20).map((item) => ({
      name: item.name,
      size: item.amount,
    })),
    [itemSales]
  );

  // KPI 데이터
  const totalSalesAmount = useMemo(() => filteredSales.reduce((s, r) => s + r.장부금액, 0), [filteredSales]);
  const uniqueCustomers = useMemo(() => new Set(filteredSales.map(r => r.매출처).filter(Boolean)).size, [filteredSales]);
  const avgPerTransaction = filteredSales.length > 0 ? totalSalesAmount / filteredSales.length : 0;
  const top1Share = useMemo(() => {
    if (topCustomers.length === 0 || totalSalesAmount === 0) return 0;
    return (topCustomers[0].amount / totalSalesAmount) * 100;
  }, [topCustomers, totalSalesAmount]);

  if (isLoading) return <PageSkeleton />;
  if (filteredSales.length === 0) return <EmptyState />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">매출 분석</h2>
        <p className="text-muted-foreground">거래처/품목별 매출 상세 분석</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="총 매출액"
          value={totalSalesAmount}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          formula="매출리스트의 모든 장부금액을 합산"
          description="선택한 영업조직의 전체 매출 금액 합계입니다. 이 페이지의 모든 분석은 이 금액을 기준으로 산출됩니다."
        />
        <KpiCard
          title="거래처 수"
          value={uniqueCustomers}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="중복 없이 매출처 수를 세기"
          description="실제로 매출이 발생한 고유 거래처(고객사)의 수입니다. 거래처 수가 많을수록 매출 기반이 다양하고, 특정 거래처에 대한 의존도가 낮아집니다."
          benchmark="거래처 수가 전기 대비 증가하면 신규 고객 확보 성과 양호"
        />
        <KpiCard
          title="건당 평균"
          value={avgPerTransaction}
          format="currency"
          icon={<BarChart3 className="h-5 w-5" />}
          formula="총 매출액 나누기 매출 건수"
          description="매출 1건당 평균 거래 금액입니다. 건당 평균이 높으면 대형 프로젝트 위주의 영업, 낮으면 소규모 거래 위주의 영업 패턴을 의미합니다."
          benchmark="업종 평균 건당 금액 대비 높으면 고부가가치 영업 구조"
        />
        <KpiCard
          title="Top1 거래처 비중"
          value={top1Share}
          format="percent"
          icon={<Target className="h-5 w-5" />}
          formula="1위 거래처 매출 나누기 총매출 곱하기 100"
          description="매출 1위 거래처가 전체 매출에서 차지하는 비율입니다. 이 수치가 높으면 해당 거래처에 대한 의존도가 크므로, 거래처 이탈 시 매출 급감 위험이 있습니다."
          benchmark="20% 이내이면 안정적 분산, 30% 초과 시 집중 리스크 경고"
        />
      </div>

      <Tabs defaultValue="customer" className="space-y-4">
        <TabsList>
          <TabsTrigger value="customer">거래처 분석</TabsTrigger>
          <TabsTrigger value="item">품목 분석</TabsTrigger>
          <TabsTrigger value="type">유형별 분석</TabsTrigger>
          <TabsTrigger value="channel">채널 분석</TabsTrigger>
          <TabsTrigger value="rfm">RFM 분석</TabsTrigger>
          <TabsTrigger value="clv">CLV 분석</TabsTrigger>
          <TabsTrigger value="migration">거래처 이동</TabsTrigger>
          <TabsTrigger value="fx">FX 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="space-y-6">
          <ChartCard
            title="거래처별 매출 (ABC 분석)"
            formula="누적 비율: 누적 매출 나누기 총 매출 곱하기 100"
            description="거래처를 매출액이 큰 순서대로 나열하고, 누적 비율에 따라 A등급(상위 80%까지), B등급(80~95%), C등급(95~100%)으로 분류합니다. 소수의 핵심 거래처가 대부분의 매출을 차지하는 '파레토 법칙'을 확인할 수 있습니다."
            benchmark="상위 20% 거래처가 매출의 80%를 차지하면 전형적인 파레토 분포 (80:20 법칙)"
            action={<ExportButton data={topCustomersExport} fileName="거래처별매출" />}
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any) =>
                    name === "cumPercent" ? `${Number(value).toFixed(1)}%` : formatCurrency(Number(value))
                  } />
                  <Legend />
                  <Bar yAxisId="left" dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="cumPercent" stroke={CHART_COLORS[4]} strokeWidth={2} name="누적비율" dot={{ r: 3 }} />
                  {/* ABC 등급 경계선 */}
                  <ReferenceLine yAxisId="right" y={80} stroke="hsl(142, 76%, 36%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "A (80%)", position: "right", fontSize: 10, fill: "hsl(142, 76%, 36%)" }} />
                  <ReferenceLine yAxisId="right" y={95} stroke="hsl(38, 92%, 50%)" strokeDasharray="5 5" strokeWidth={1.5} label={{ value: "B (95%)", position: "right", fontSize: 10, fill: "hsl(38, 92%, 50%)" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="item" className="space-y-6">
          <ChartCard
            title="품목별 매출 비중"
            formula="품목별로 장부금액을 합산하여 비교"
            description="각 품목의 매출 규모를 면적(네모칸) 크기로 보여줍니다. 면적이 클수록 해당 품목의 매출 비중이 높습니다. 상위 20개 품목을 표시하며, 어떤 제품이 매출을 주도하는지 한눈에 파악할 수 있습니다."
            benchmark="특정 품목이 전체 매출의 50% 이상이면 제품 다각화 필요"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  stroke="hsl(var(--background))"
                  content={(props: any) => {
                    const { x, y, width, height, name, value } = props;
                    if (width < 40 || height < 25) return <g />;
                    return (
                      <g>
                        <rect x={x} y={y} width={width} height={height} fill={CHART_COLORS[0]} opacity={0.85} rx={4} />
                        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>
                          {String(name).length > 8 ? String(name).substring(0, 8) + "..." : name}
                        </text>
                        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>
                          {formatCurrency(value, true)}
                        </text>
                      </g>
                    );
                  }}
                />
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="type" className="space-y-6">
          <ChartCard
            title="내수/수출 비중"
            formula="내수와 수출 유형별로 장부금액을 각각 합산"
            description="전체 매출 중 내수(국내 판매)와 수출(해외 판매)의 비율을 도넛 차트로 보여줍니다. 수출 비중이 높으면 환율 변동에 따라 실적이 크게 흔들릴 수 있으므로 환리스크 관리가 중요합니다."
            benchmark="내수와 수출이 적절히 분산되면 안정적, 한쪽 비중이 80% 이상이면 편중 주의"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={90}
                    outerRadius={140}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(1)}%`}
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i]} />
                    ))}
                  </Pie>
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="channel" className="space-y-6">
          {/* 결제조건별 매출 분포 */}
          <ChartCard
            title="결제조건별 매출 분포"
            formula="결제조건별로 판매금액을 합산하여 비교"
            description="현금, 30일, 60일 등 결제조건별 매출 분포를 보여줍니다. 장기 결제조건에 매출이 집중되면 현금 회수가 늦어져 자금 부담이 커질 수 있습니다."
            benchmark="현금 및 30일 이내 결제 비중이 50% 이상이면 현금흐름 양호"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={paymentTermSales.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis type="category" dataKey="term" tick={{ fontSize: 11 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) => {
                      if (name === "amount") return [formatCurrency(Number(value)), "매출액"];
                      if (name === "count") return [Number(value).toLocaleString(), "건수"];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS[0]} name="매출액" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* 유통경로별 매출 */}
          <ChartCard
            title="유통경로별 매출"
            formula="유통경로별로 판매금액을 합산하여 비교"
            description="직판, 대리점, 온라인 등 유통경로별 매출 비중을 보여줍니다. 특정 채널에 매출이 편중되면 해당 채널 문제 발생 시 전체 매출에 큰 타격을 받을 수 있습니다."
            benchmark="단일 채널 의존도 50% 이하가 바람직하며, 채널 다변화 권장"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelSales}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={130}
                    dataKey="amount"
                    nameKey="channel"
                    label={
                      channelSales.length <= 8
                        ? (props: any) => {
                            const { cx, cy, midAngle, outerRadius: or, channel, share } = props;
                            const RADIAN = Math.PI / 180;
                            const radius = (or || 130) + 25;
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
                                {channel} {(share || 0).toFixed(1)}%
                              </text>
                            );
                          }
                        : false
                    }
                  >
                    {channelSales.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any) => formatCurrency(Number(value))}
                  />
                  {channelSales.length > 8 && <Legend />}
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* 제품군별 월별 트렌드 */}
          <ChartCard
            title="제품군별 월별 트렌드"
            formula="제품군별, 월별로 판매금액을 합산 (상위 5개 + 기타)"
            description="주요 제품군의 월별 매출 변화를 누적 막대 차트로 보여줍니다. 상위 5개 제품군은 개별 표시하고 나머지는 '기타'로 묶습니다. 특정 제품군의 계절적 패턴이나 성장/하락 추세를 파악할 수 있습니다."
            benchmark="특정 제품군이 지속 하락하면 시장 변화 대응 전략 수립 필요"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                {(() => {
                  // 상위 5개 제품군 선정, 나머지 기타 집계
                  const allGroups = productGroupTrends.length > 0
                    ? Object.keys(productGroupTrends[0]).filter((k) => k !== "month")
                    : [];
                  const groupTotals = allGroups.map((g) => ({
                    group: g,
                    total: productGroupTrends.reduce((sum, row) => sum + (Number(row[g]) || 0), 0),
                  }));
                  groupTotals.sort((a, b) => b.total - a.total);
                  const top5 = groupTotals.slice(0, 5).map((g) => g.group);
                  const hasEtc = groupTotals.length > 5;

                  const chartData = productGroupTrends.map((row) => {
                    const entry: Record<string, string | number> = { month: row.month as string };
                    top5.forEach((g) => {
                      entry[g] = Number(row[g]) || 0;
                    });
                    if (hasEtc) {
                      entry["기타"] = groupTotals
                        .slice(5)
                        .reduce((sum, g) => sum + (Number(row[g.group]) || 0), 0);
                    }
                    return entry;
                  });

                  const displayGroups = hasEtc ? [...top5, "기타"] : top5;

                  return (
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                      <RechartsTooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value: any) => formatCurrency(Number(value))}
                      />
                      <Legend />
                      {displayGroups.map((group, i) => (
                        <Bar
                          key={group}
                          dataKey={group}
                          stackId="productGroup"
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          name={group}
                        />
                      ))}
                    </ComposedChart>
                  );
                })()}
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>

        {/* ── RFM 분석 탭 ─────────────────────────────────── */}
        <TabsContent value="rfm" className="space-y-6">
          {rfmScores.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* 세그먼트 분포 & 세그먼트별 매출 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="RFM 세그먼트 분포 (거래처 수)"
                  formula="고객별 최근성, 빈도, 금액을 5단계로 점수화한 뒤 세그먼트 분류"
                  description="RFM 분석은 고객을 3가지 기준으로 평가합니다. R(최근성): 마지막 거래가 얼마나 최근인지, F(빈도): 얼마나 자주 거래하는지, M(금액): 총 거래 금액이 얼마인지. 이 점수를 조합하여 VIP(최우수), Loyal(충성), Potential(잠재), At-risk(위험), Dormant(휴면), Lost(이탈) 등 6개 그룹으로 나눕니다."
                  benchmark="VIP + Loyal 거래처가 전체의 30% 이상이면 건전한 고객 포트폴리오"
                >
                  <div className="h-72 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
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
                              fill={
                                ({
                                  VIP: "#059669",
                                  Loyal: "#3b82f6",
                                  Potential: "#8b5cf6",
                                  "At-risk": "#f59e0b",
                                  Dormant: "#6b7280",
                                  Lost: "#ef4444",
                                } as Record<string, string>)[entry.segment] || CHART_COLORS[0]
                              }
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          {...TOOLTIP_STYLE}
                          formatter={(value: any, name: any) => [
                            `${Number(value).toLocaleString()}개사`,
                            name,
                          ]}
                        />
                        {rfmSummary.length > 6 && <Legend />}
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <ChartCard
                  title="세그먼트별 매출 비중"
                  formula="세그먼트별로 고객 매출액(M값)을 합산"
                  description="각 고객 등급(세그먼트)이 전체 매출에서 차지하는 금액을 비교합니다. 보통 VIP 소수 고객이 전체 매출의 대부분을 차지하며, 이들의 이탈 방지가 매출 유지의 핵심입니다."
                  benchmark="VIP 세그먼트 매출 비중이 60% 이상이면 핵심 고객 관리 프로그램 강화 필요"
                >
                  <div className="h-72 md:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rfmSummary} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                        <YAxis type="category" dataKey="segment" tick={{ fontSize: 11 }} width={65} />
                        <RechartsTooltip
                          {...TOOLTIP_STYLE}
                          formatter={(value: any) => [formatCurrency(Number(value)), "매출액"]}
                        />
                        <Bar dataKey="totalSales" name="매출액" radius={[0, 4, 4, 0]}>
                          {rfmSummary.map((entry) => (
                            <Cell
                              key={entry.segment}
                              fill={
                                ({
                                  VIP: "#059669",
                                  Loyal: "#3b82f6",
                                  Potential: "#8b5cf6",
                                  "At-risk": "#f59e0b",
                                  Dormant: "#6b7280",
                                  Lost: "#ef4444",
                                } as Record<string, string>)[entry.segment] || CHART_COLORS[0]
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>

              {/* Recency vs Monetary 산점도 */}
              <ChartCard
                title="Recency vs Monetary 분포"
                formula="가로축: 마지막 거래 후 경과 개월, 세로축: 총 매출액, 점 크기: 거래 빈도"
                description="고객을 최근성(가로축)과 매출 규모(세로축)로 배치한 산점도입니다. 점이 클수록 거래 빈도가 높은 고객입니다. 왼쪽 위(최근 거래 + 높은 매출)에 있는 고객이 VIP이고, 오른쪽 아래(오래된 거래 + 낮은 매출)에 있는 고객은 이탈 위험군입니다."
                benchmark="왼쪽 위에 큰 점이 많을수록 건전한 고객 구조"
              >
                <div className="h-72 md:h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                        formatter={(value: any, name: any) => {
                          if (name === "총매출") return [formatCurrency(Number(value)), name];
                          if (name === "최근성(개월)") return [`${value}개월`, name];
                          if (name === "거래빈도") return [`${value}건`, name];
                          return [value, name];
                        }}
                        labelFormatter={(label: any) => {
                          const item = rfmScores.find((s) => s.recency === label);
                          return item ? `${item.customerName || item.customer} (${item.rfmSegment})` : "";
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
                            fill={
                              ({
                                VIP: "#059669",
                                Loyal: "#3b82f6",
                                Potential: "#8b5cf6",
                                "At-risk": "#f59e0b",
                                Dormant: "#6b7280",
                                Lost: "#ef4444",
                              } as Record<string, string>)[entry.rfmSegment] || CHART_COLORS[0]
                            }
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>
            </>
          )}
        </TabsContent>

        {/* ── CLV 분석 탭 ─────────────────────────────────── */}
        <TabsContent value="clv" className="space-y-6">
          {clvResults.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* CLV KPI 카드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  title="총 CLV(고객생애가치)"
                  value={clvSummary.totalClv}
                  format="currency"
                  icon={<TrendingUp className="h-5 w-5" />}
                  formula="모든 고객의 예상 생애가치를 합산"
                  description="CLV(고객생애가치)란 한 고객이 거래 기간 동안 가져다줄 것으로 예상되는 총 수익입니다. 총 CLV는 모든 고객의 예상 가치를 합한 것으로, 고객 자산의 전체 규모를 보여줍니다."
                />
                <KpiCard
                  title="평균 CLV(고객생애가치)"
                  value={clvSummary.avgClv}
                  format="currency"
                  icon={<BarChart3 className="h-5 w-5" />}
                  formula="총 CLV 나누기 고객 수"
                  description="고객 1곳당 평균적으로 기대되는 생애가치입니다. 이 금액이 높을수록 고객 1곳이 장기적으로 더 큰 수익을 가져다준다는 의미입니다."
                  benchmark="평균 CLV가 고객 획득 비용의 3배 이상이면 건전한 수준"
                />
                <KpiCard
                  title="Top 고객 CLV"
                  value={clvSummary.topCustomerClv}
                  format="currency"
                  icon={<Crown className="h-5 w-5" />}
                  formula="고객별 CLV 중 가장 큰 값"
                  description="가장 높은 생애가치를 가진 최우수 고객의 CLV입니다. 이 고객은 장기적으로 가장 큰 수익을 가져다줄 것으로 예상되므로, 특별 관리가 필요합니다."
                />
                <KpiCard
                  title="분석 고객 수"
                  value={clvSummary.customerCount}
                  format="number"
                  icon={<Users className="h-5 w-5" />}
                  formula="중복 없이 매출처 수를 세기"
                  description="CLV(고객생애가치)가 산출된 고유 고객 수입니다. 최소 2회 이상 거래가 있어야 의미 있는 CLV를 계산할 수 있으므로, 전체 거래처 수보다 적을 수 있습니다."
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top 15 CLV 고객 */}
                <ChartCard
                  title="Top 15 고객 생애가치 (CLV)"
                  formula="CLV(고객생애가치) = 평균 거래액 곱하기 연간 거래빈도 곱하기 이익률 곱하기 예상 거래기간"
                  description="고객 생애가치가 높은 상위 15개 고객입니다. CLV가 높다는 것은 해당 고객이 장기적으로 꾸준히 수익을 가져다줄 가능성이 크다는 의미이며, 이들에 대한 맞춤형 관리가 중요합니다."
                  benchmark="상위 20% 고객의 CLV가 전체의 80% 이상이면 핵심 고객 집중 관리 필요"
                >
                  <div className="h-72 md:h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={clvResults.slice(0, 15).map((c) => ({
                          name: c.customerName || c.customer,
                          clv: c.clv,
                        }))}
                        layout="vertical"
                        margin={{ left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{ fontSize: 10 }}
                          width={85}
                          tickFormatter={(v) => (String(v).length > 10 ? String(v).substring(0, 10) + "..." : v)}
                        />
                        <RechartsTooltip
                          {...TOOLTIP_STYLE}
                          formatter={(value: any) => [formatCurrency(Number(value)), "CLV"]}
                        />
                        <Bar dataKey="clv" name="CLV" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                {/* CLV vs 현재 매출 산점도 */}
                <ChartCard
                  title="CLV vs 현재 매출"
                  formula="가로축: 현재 매출액, 세로축: 예상 생애가치(CLV)"
                  description="현재 매출과 장기 예상 가치를 비교합니다. 대각선 위쪽 고객은 현재 매출은 적지만 장기 가치가 높아 적극 육성 대상입니다. 대각선 아래쪽 고객은 현재 매출은 많지만 장기 가치가 낮아 관계 강화가 필요합니다."
                  benchmark="CLV가 현재 매출의 1.5배 이상이면 고성장 잠재 고객으로 분류"
                >
                  <div className="h-72 md:h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          type="number"
                          dataKey="currentSales"
                          name="현재 매출"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => formatCurrency(v, true)}
                          label={{ value: "현재 매출", position: "insideBottom", offset: -5, fontSize: 11 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="clv"
                          name="CLV"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => formatCurrency(v, true)}
                          width={60}
                        />
                        <RechartsTooltip
                          {...TOOLTIP_STYLE}
                          formatter={(value: any, name: any) => [formatCurrency(Number(value)), name]}
                          labelFormatter={(label: any) => {
                            const item = clvResults.find((c) => c.currentSales === label);
                            return item ? item.customerName || item.customer : "";
                          }}
                        />
                        <Scatter
                          name="고객"
                          data={clvResults}
                          fill={CHART_COLORS[2]}
                          fillOpacity={0.7}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── 거래처 이동 탭 ─────────────────────────────── */}
        <TabsContent value="migration" className="space-y-6">
          {migration.summaries.length === 0 && gradeDistribution.length === 0 ? (
            <EmptyState />
          ) : (
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
          )}
        </TabsContent>
        {/* ── FX 분석 탭 ─────────────────────────────────── */}
        <TabsContent value="fx" className="space-y-6">
          {fxImpact.currencyBreakdown.length <= 1 &&
          fxImpact.foreignAmount === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* FX KPI 카드 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  title="해외매출 비중"
                  value={fxImpact.foreignSharePercent}
                  format="percent"
                  icon={<Globe className="h-5 w-5" />}
                  formula="해외매출(원화 환산) 나누기 총매출(원화) 곱하기 100"
                  description="전체 매출 중 외화(해외) 거래가 차지하는 비율입니다. 이 비중이 높을수록 원/달러, 원/엔 등 환율 변동에 따라 실적이 크게 흔들릴 수 있습니다."
                  benchmark="30%를 넘으면 환리스크 헤지(환율 변동 대비) 전략 필요"
                />
                <KpiCard
                  title="해외매출액"
                  value={fxImpact.foreignAmount}
                  format="currency"
                  icon={<DollarSign className="h-5 w-5" />}
                  formula="거래통화가 원화(KRW)가 아닌 매출의 장부금액을 합산"
                  description="외화(달러, 유로, 엔 등)로 거래된 매출을 원화로 환산한 금액의 합계입니다. 환율 변동에 따라 같은 외화 금액이라도 원화 환산 금액이 달라질 수 있습니다."
                />
                <KpiCard
                  title="거래 통화 수"
                  value={fxImpact.currencyBreakdown.length}
                  format="number"
                  icon={<BarChart3 className="h-5 w-5" />}
                  formula="중복 없이 거래에 사용된 통화 종류 수를 세기"
                  description="매출 거래에 사용된 통화(KRW, USD, EUR, JPY 등)의 종류 수입니다. 통화가 다양할수록 여러 해외 시장에 진출해 있다는 의미이지만, 환율 관리 복잡도도 높아집니다."
                />
                <KpiCard
                  title="FX 효과"
                  value={fxPnL.reduce((sum, item) => sum + item.fxGainLoss, 0)}
                  format="currency"
                  icon={<TrendingUp className="h-5 w-5" />}
                  formula="(실제 장부금액 빼기 판매금액 곱하기 평균환율)의 합계"
                  description="각 거래의 실제 적용 환율과 기간 내 가중평균 환율의 차이에서 발생한 환차익 또는 환차손의 추정 금액입니다. 환율이 유리하게 적용된 거래가 많으면 양수(이익), 불리하면 음수(손실)로 나타납니다."
                  benchmark="양수이면 환차익(이득), 음수이면 환차손(손해)"
                />
              </div>

              {/* 월별 내수/해외 매출 추이 */}
              <ChartCard
                title="월별 내수/해외 매출 추이"
                formula="월별로 원화(내수)와 외화(해외) 매출을 각각 합산"
                description="매월 내수 매출(파랑 막대)과 해외 매출(보라 막대)이 어떻게 변하는지 보여줍니다. 오른쪽 축의 선은 해외매출 비중(%)을 나타냅니다. 해외매출 비중이 급변하면 환율 리스크 관리 전략을 재검토해야 합니다."
                benchmark="해외매출 비중 추이가 안정적이면 양호, 급등 또는 급락 시 원인 분석 필요"
              >
                <div className="h-72 md:h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyFxTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => formatCurrency(v, true)}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                        domain={[0, 100]}
                      />
                      <RechartsTooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value: any, name: any) => {
                          if (name === "해외비중") return [`${Number(value).toFixed(1)}%`, name];
                          return [formatCurrency(Number(value)), name];
                        }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="domestic"
                        name="내수 매출"
                        stackId="fxStack"
                        fill={CHART_COLORS[0]}
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="foreign"
                        name="해외 매출"
                        stackId="fxStack"
                        fill={CHART_COLORS[3]}
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="foreignShare"
                        name="해외비중"
                        stroke={CHART_COLORS[4]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              {/* 통화별 매출 분포 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard
                  title="통화별 매출 분포"
                  formula="거래통화별로 장부금액(원화 환산)을 합산"
                  description="KRW(원화), USD(달러), EUR(유로) 등 거래에 사용된 통화별 매출 규모를 비교합니다. 원화 외에 특정 외화에 매출이 집중되어 있으면 해당 통화의 환율 변동이 실적에 큰 영향을 미칩니다."
                  benchmark="특정 외화 의존도가 50%를 넘으면 통화 분산 또는 환헤지 필요"
                >
                  <div className="h-72 md:h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={fxImpact.currencyBreakdown}
                        layout="vertical"
                        margin={{ left: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v) => formatCurrency(v, true)}
                        />
                        <YAxis
                          type="category"
                          dataKey="currency"
                          tick={{ fontSize: 11 }}
                          width={55}
                        />
                        <RechartsTooltip
                          {...TOOLTIP_STYLE}
                          formatter={(value: any, name: any) => {
                            if (name === "매출액(원화)") return [formatCurrency(Number(value)), name];
                            return [value, name];
                          }}
                          labelFormatter={(label: any) => {
                            const item = fxImpact.currencyBreakdown.find(
                              (c) => c.currency === label
                            );
                            return item
                              ? `${label} (${item.count.toLocaleString()}건, 비중 ${item.share.toFixed(1)}%)`
                              : label;
                          }}
                        />
                        <Bar
                          dataKey="bookAmount"
                          name="매출액(원화)"
                          radius={[0, 4, 4, 0]}
                        >
                          {fxImpact.currencyBreakdown.map((entry, i) => (
                            <Cell
                              key={entry.currency}
                              fill={
                                entry.currency === "KRW"
                                  ? CHART_COLORS[0]
                                  : CHART_COLORS[(i % (CHART_COLORS.length - 1)) + 1]
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                {/* 통화별 환율 및 FX 손익 */}
                {fxPnL.length > 0 && (
                  <ChartCard
                    title="통화별 가중평균 환율 및 거래 현황"
                    formula="가중평균환율: 원화 장부금액 나누기 원래 통화 판매금액"
                    description="외화 통화별로 실제 적용된 가중평균 환율과 거래 규모를 표로 보여줍니다. 같은 통화라도 거래 시점에 따라 환율이 다르며, FX 효과 열에서 환차익(+) 또는 환차손(-)을 확인할 수 있습니다."
                    benchmark="FX 효과가 양수(녹색)이면 환율이 유리하게 적용됨, 음수(적색)이면 불리하게 적용됨"
                  >
                    <div className="h-72 md:h-96 overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="p-2 font-semibold">통화</th>
                            <th className="p-2 font-semibold text-right">평균환율</th>
                            <th className="p-2 font-semibold text-right">장부금액(KRW)</th>
                            <th className="p-2 font-semibold text-right">FX 효과</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fxPnL.map((item) => (
                            <tr key={item.currency} className="border-b hover:bg-muted/50">
                              <td className="p-2 font-medium">{item.currency}</td>
                              <td className="p-2 text-right">
                                {item.avgRate.toLocaleString("ko-KR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                              <td className="p-2 text-right">
                                {formatCurrency(item.bookAmount, true)}
                              </td>
                              <td
                                className={`p-2 text-right font-medium ${
                                  item.fxGainLoss > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : item.fxGainLoss < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : ""
                                }`}
                              >
                                {item.fxGainLoss > 0 ? "+" : ""}
                                {formatCurrency(item.fxGainLoss, true)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-semibold">
                            <td className="p-2">합계</td>
                            <td className="p-2 text-right">-</td>
                            <td className="p-2 text-right">
                              {formatCurrency(
                                fxPnL.reduce((s, i) => s + i.bookAmount, 0),
                                true
                              )}
                            </td>
                            <td
                              className={`p-2 text-right ${
                                fxPnL.reduce((s, i) => s + i.fxGainLoss, 0) > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : fxPnL.reduce((s, i) => s + i.fxGainLoss, 0) < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : ""
                              }`}
                            >
                              {fxPnL.reduce((s, i) => s + i.fxGainLoss, 0) > 0 ? "+" : ""}
                              {formatCurrency(
                                fxPnL.reduce((s, i) => s + i.fxGainLoss, 0),
                                true
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </ChartCard>
                )}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
