"use client";

import { useMemo } from "react";
import { useDataStore } from "@/stores/dataStore";
import { useFilterStore } from "@/stores/filterStore";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { PageSkeleton } from "@/components/dashboard/LoadingSkeleton";
import { DataTable } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/badge";
import { calcAgingSummary, calcAgingByOrg, calcAgingByPerson, calcRiskAssessments, calcCreditUtilization, calcCreditSummaryByOrg } from "@/lib/analysis/aging";
import { calcDSOByOrg, calcOverallDSO } from "@/lib/analysis/dso";
import { calcCCCByOrg, calcCCCAnalysis } from "@/lib/analysis/ccc";
import { calcPrepaymentSummary, calcOrgPrepayments, calcMonthlyPrepayments } from "@/lib/analysis/prepayment";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import { CreditCard, AlertTriangle, Shield, Users, Landmark, TrendingUp, Ban, Gauge, Clock, RefreshCw, Wallet, Building2, Percent } from "lucide-react";
import { Cell, ReferenceLine } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, filterByDateRange, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { ExportButton } from "@/components/dashboard/ExportButton";
import type { ColumnDef } from "@tanstack/react-table";
import type { AgingRiskAssessment } from "@/types";
import type { CCCMetric } from "@/lib/analysis/ccc";

const DSO_COLORS: Record<string, string> = {
  excellent: "hsl(142, 76%, 36%)",
  good: "hsl(188, 94%, 42%)",
  fair: "hsl(45, 93%, 47%)",
  poor: "hsl(0, 84%, 50%)",
};

const DSO_LABELS: Record<string, string> = {
  excellent: "우수",
  good: "양호",
  fair: "보통",
  poor: "주의",
};

export default function ReceivablesPage() {
  const { receivableAging, salesList, collectionList, teamContribution, orgNames } = useDataStore();
  const isLoading = useDataStore((s) => s.isLoading);
  const { selectedOrgs, dateRange } = useFilterStore();

  const effectiveOrgNames = useMemo(() => {
    if (selectedOrgs.length > 0) return new Set(selectedOrgs);
    return orgNames;
  }, [selectedOrgs, orgNames]);

  const filteredAgingMap = useMemo(() => {
    const filtered = new Map<string, any[]>();
    for (const [key, records] of Array.from(receivableAging.entries())) {
      const filteredRecords = filterByOrg(records, effectiveOrgNames, "영업조직");
      if (filteredRecords.length > 0) {
        filtered.set(key, filteredRecords);
      }
    }
    return filtered;
  }, [receivableAging, effectiveOrgNames]);

  const allRecords = useMemo(() => {
    const all: any[] = [];
    Array.from(filteredAgingMap.values()).forEach((records) => {
      all.push(...records);
    });
    return all;
  }, [filteredAgingMap]);

  const hasData = allRecords.length > 0;

  // 기존 분석
  const summary = useMemo(() => calcAgingSummary(allRecords), [allRecords]);
  const byOrg = useMemo(() => calcAgingByOrg(filteredAgingMap), [filteredAgingMap]);
  const byPerson = useMemo(() => calcAgingByPerson(allRecords), [allRecords]);
  const risks = useMemo(() => calcRiskAssessments(allRecords), [allRecords]);

  const creditUtilizations = useMemo(() => calcCreditUtilization(allRecords), [allRecords]);
  const creditByOrg = useMemo(() => calcCreditSummaryByOrg(allRecords), [allRecords]);

  const creditTotalLimit = useMemo(() => creditUtilizations.reduce((s, c) => s + c.여신한도, 0), [creditUtilizations]);
  const creditTotalUsed = useMemo(() => creditUtilizations.reduce((s, c) => s + c.총미수금, 0), [creditUtilizations]);
  const creditAvgRate = creditTotalLimit > 0 ? (creditTotalUsed / creditTotalLimit) * 100 : 0;
  const creditDangerCount = creditUtilizations.filter((c) => c.상태 === "danger").length;

  const creditExportData = useMemo(
    () =>
      creditUtilizations.map((c) => ({
        거래처: c.판매처명 || c.판매처,
        조직: c.영업조직,
        담당자: c.담당자,
        여신한도: c.여신한도,
        미수금: c.총미수금,
        사용률: `${c.사용률.toFixed(1)}%`,
        상태: c.상태 === "danger" ? "한도초과" : c.상태 === "warning" ? "주의" : "양호",
      })),
    [creditUtilizations]
  );

  // DSO/CCC 분석
  const filteredSales = useMemo(
    () => filterByDateRange(filterByOrg(salesList, effectiveOrgNames, "영업조직"), dateRange, "매출일"),
    [salesList, effectiveOrgNames, dateRange]
  );
  const filteredTeamContrib = useMemo(
    () => filterByOrg(teamContribution, effectiveOrgNames, "영업조직팀"),
    [teamContribution, effectiveOrgNames]
  );

  // 선수금 분석
  const filteredCollections = useMemo(
    () => filterByDateRange(filterByOrg(collectionList, effectiveOrgNames, "영업조직"), dateRange, "수금일"),
    [collectionList, effectiveOrgNames, dateRange]
  );

  const prepaymentSummary = useMemo(() => {
    const totalSales = filteredSales.reduce((s, r) => s + r.장부금액, 0);
    return calcPrepaymentSummary(filteredCollections, totalSales);
  }, [filteredCollections, filteredSales]);

  const orgPrepayments = useMemo(() => calcOrgPrepayments(filteredCollections), [filteredCollections]);
  const monthlyPrepayments = useMemo(() => calcMonthlyPrepayments(filteredCollections), [filteredCollections]);

  const dsoMetrics = useMemo(
    () => calcDSOByOrg(allRecords, filteredSales),
    [allRecords, filteredSales]
  );
  const overallDSO = useMemo(
    () => calcOverallDSO(allRecords, filteredSales),
    [allRecords, filteredSales]
  );
  const cccMetrics = useMemo(
    () => calcCCCByOrg(dsoMetrics, filteredTeamContrib),
    [dsoMetrics, filteredTeamContrib]
  );
  const cccAnalysis = useMemo(
    () => calcCCCAnalysis(cccMetrics),
    [cccMetrics]
  );

  const dsoChartData = useMemo(
    () =>
      dsoMetrics.map((d) => ({
        org: d.org,
        dso: d.dso,
        classification: d.classification,
      })),
    [dsoMetrics]
  );

  const cccExportData = useMemo(
    () =>
      cccMetrics.map((m) => ({
        조직: m.org,
        "DSO(일)": m.dso,
        "DPO(일)": m.dpo,
        "CCC(일)": m.ccc,
        등급: DSO_LABELS[m.classification] || m.classification,
        권장사항: m.recommendation,
      })),
    [cccMetrics]
  );

  const cccColumns = useMemo<ColumnDef<CCCMetric, any>[]>(
    () => [
      {
        accessorKey: "org",
        header: "조직",
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "dso",
        header: () => <span className="block text-right">DSO (일)</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums font-medium">
            {getValue<number>()}
          </span>
        ),
      },
      {
        accessorKey: "dpo",
        header: () => <span className="block text-right">DPO (일)</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {getValue<number>()}
          </span>
        ),
      },
      {
        accessorKey: "ccc",
        header: () => <span className="block text-right">CCC (일)</span>,
        cell: ({ getValue }) => {
          const ccc = getValue<number>();
          return (
            <span
              className={`block text-right tabular-nums font-bold ${
                ccc < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : ccc > 60
                  ? "text-red-600 dark:text-red-400"
                  : ""
              }`}
            >
              {ccc}
            </span>
          );
        },
      },
      {
        accessorKey: "classification",
        header: "등급",
        cell: ({ getValue }) => {
          const cls = getValue<string>();
          return (
            <Badge
              variant={
                cls === "excellent"
                  ? "success"
                  : cls === "good"
                  ? "default"
                  : cls === "fair"
                  ? "warning"
                  : "destructive"
              }
            >
              {DSO_LABELS[cls] || cls}
            </Badge>
          );
        },
      },
      {
        accessorKey: "recommendation",
        header: "권장사항",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground line-clamp-2 max-w-[300px]">
            {getValue<string>()}
          </span>
        ),
      },
    ],
    []
  );

  const riskColumns = useMemo<ColumnDef<AgingRiskAssessment, any>[]>(
    () => [
      {
        accessorKey: "판매처명",
        header: "거래처",
        cell: ({ row }) => (
          <span className="truncate max-w-[180px] block" title={row.original.판매처명}>
            {row.original.판매처명 || row.original.판매처}
          </span>
        ),
      },
      {
        accessorKey: "총미수금",
        header: () => <span className="block text-right">미수금</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {formatCurrency(getValue<number>(), true)}
          </span>
        ),
      },
      {
        accessorKey: "연체비율",
        header: () => <span className="block text-right">연체비율</span>,
        cell: ({ getValue }) => (
          <span className="block text-right tabular-nums">
            {getValue<number>().toFixed(1)}%
          </span>
        ),
      },
      {
        accessorKey: "riskGrade",
        header: "등급",
        cell: ({ getValue }) => {
          const grade = getValue<string>();
          return (
            <Badge
              variant={
                grade === "high"
                  ? "destructive"
                  : grade === "medium"
                  ? "warning"
                  : "success"
              }
            >
              {grade === "high" ? "고위험" : grade === "medium" ? "주의" : "양호"}
            </Badge>
          );
        },
      },
    ],
    []
  );

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

  if (isLoading) return <PageSkeleton />;
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
          <TabsTrigger value="credit">여신 관리</TabsTrigger>
          <TabsTrigger value="dso">DSO/CCC</TabsTrigger>
          <TabsTrigger value="prepayment">선수금</TabsTrigger>
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
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={agingStackedData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="org" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                  <Legend />
                  {/* 안전(녹색) → 주의(황색) → 위험(적색) 순차 그라데이션 */}
                  <Bar dataKey="1개월" stackId="a" fill="hsl(142, 76%, 36%)" />
                  <Bar dataKey="2개월" stackId="a" fill="hsl(80, 60%, 45%)" />
                  <Bar dataKey="3개월" stackId="a" fill="hsl(45, 93%, 47%)" />
                  <Bar dataKey="4개월" stackId="a" fill="hsl(30, 90%, 50%)" />
                  <Bar dataKey="5개월" stackId="a" fill="hsl(15, 85%, 50%)" />
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
            <div className="h-80 md:h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPerson.slice(0, 15)} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis type="category" dataKey="person" tick={{ fontSize: 10 }} width={55} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
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
            <DataTable
              data={risks}
              columns={riskColumns}
              searchPlaceholder="거래처 검색..."
              defaultPageSize={20}
            />
          </ChartCard>
        </TabsContent>

        <TabsContent value="credit" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 여신한도"
              value={creditTotalLimit}
              format="currency"
              icon={<Landmark className="h-5 w-5" />}
              formula="SUM(여신한도가 설정된 거래처의 여신한도)"
              description="여신한도가 부여된 전체 거래처의 한도 합계입니다."
              benchmark="총 매출액 대비 적정 수준 유지"
            />
            <KpiCard
              title="총 사용액"
              value={creditTotalUsed}
              format="currency"
              icon={<TrendingUp className="h-5 w-5" />}
              formula="SUM(여신한도 설정 거래처의 미수금 합계)"
              description="여신한도가 설정된 거래처들의 총 미수금 잔액입니다."
              benchmark="총 여신한도의 70% 이내가 양호"
            />
            <KpiCard
              title="평균 사용률"
              value={creditAvgRate}
              format="percent"
              icon={<Gauge className="h-5 w-5" />}
              formula="총 사용액 / 총 여신한도 x 100"
              description="전체 여신한도 대비 사용 비율입니다. 높을수록 여신 여력이 부족합니다."
              benchmark="70% 미만 양호, 80% 이상 주의, 100% 이상 위험"
            />
            <KpiCard
              title="한도초과 거래처"
              value={creditDangerCount}
              format="number"
              icon={<Ban className="h-5 w-5" />}
              formula="여신 사용률 100% 이상 거래처 수"
              description="미수금이 여신한도를 초과한 거래처 수입니다. 즉각적인 여신 관리 조치가 필요합니다."
              benchmark="0건이 이상적"
            />
          </div>

          <ChartCard
            title="조직별 여신 사용률"
            formula="조직별 SUM(미수금) / SUM(여신한도) x 100\n빨간선 = 100% 한도 기준"
            description="각 조직의 여신한도 대비 미수금 사용 비율입니다. 100%를 초과하면 한도 초과 상태입니다."
            benchmark="80% 미만 양호(녹색), 80~100% 주의(노란색), 100% 이상 위험(빨간색)"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={creditByOrg} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[0, (max: number) => Math.max(max * 1.1, 110)]} />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 10 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                    labelFormatter={(label) => `조직: ${label}`}
                  />
                  <ReferenceLine x={100} stroke="hsl(0, 84%, 50%)" strokeDasharray="3 3" strokeWidth={2} label={{ value: "100%", position: "top", fontSize: 10 }} />
                  <Bar dataKey="utilizationRate" name="사용률" radius={[0, 4, 4, 0]}>
                    {creditByOrg.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.utilizationRate >= 100
                            ? "hsl(0, 84%, 50%)"
                            : entry.utilizationRate >= 80
                            ? "hsl(45, 93%, 47%)"
                            : CHART_COLORS[2]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="거래처별 여신 사용률"
            formula="거래처별 총미수금 / 여신한도 x 100\n사용률 내림차순 정렬"
            description="거래처별 여신한도 대비 미수금 비율입니다. 위험(빨강)은 한도 초과, 주의(노랑)는 80% 이상입니다."
            benchmark="사용률 80% 미만이 양호, 한도초과(100%+) 거래처는 즉시 조치"
            action={<ExportButton data={creditExportData} fileName="여신사용률" />}
          >
            <div className="h-80 md:h-[500px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b text-left">
                    <th className="py-2 px-2 font-medium">거래처</th>
                    <th className="py-2 px-2 font-medium">조직</th>
                    <th className="py-2 px-2 font-medium">담당자</th>
                    <th className="py-2 px-2 font-medium text-right">여신한도</th>
                    <th className="py-2 px-2 font-medium text-right">미수금</th>
                    <th className="py-2 px-2 font-medium text-right">사용률</th>
                    <th className="py-2 px-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {creditUtilizations.map((c, i) => (
                    <tr key={i} className="border-b border-muted/50 hover:bg-muted/30">
                      <td className="py-1.5 px-2 truncate max-w-[150px]" title={c.판매처명}>{c.판매처명 || c.판매처}</td>
                      <td className="py-1.5 px-2 truncate max-w-[80px]">{c.영업조직}</td>
                      <td className="py-1.5 px-2 truncate max-w-[60px]">{c.담당자}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(c.여신한도, true)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{formatCurrency(c.총미수금, true)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium">{c.사용률.toFixed(1)}%</td>
                      <td className="py-1.5 px-2">
                        <Badge
                          variant={c.상태 === "danger" ? "destructive" : c.상태 === "warning" ? "warning" : "success"}
                        >
                          {c.상태 === "danger" ? "한도초과" : c.상태 === "warning" ? "주의" : "양호"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="dso" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="평균 DSO"
              value={overallDSO}
              format="number"
              icon={<Clock className="h-5 w-5" />}
              formula="(총 미수금 / 월평균 매출액) × 30"
              description="매출채권 평균 회수 소요일입니다. 매출 발생 후 현금으로 회수되기까지 걸리는 평균 일수를 의미합니다."
              benchmark="30일 미만 우수, 30~45일 양호, 45~60일 보통, 60일 초과 주의"
            />
            <KpiCard
              title="평균 CCC"
              value={cccAnalysis.avgCCC}
              format="number"
              icon={<RefreshCw className="h-5 w-5" />}
              formula="CCC = DSO + DIO - DPO\n(DIO=0: 재고 데이터 미보유)"
              description="현금전환주기입니다. 원재료 구매부터 매출 대금 회수까지의 총 소요일수입니다. 낮을수록 현금 회전이 빠릅니다."
              benchmark="0일 미만 우수, 0~30일 양호, 30~60일 보통, 60일 초과 주의"
            />
            <KpiCard
              title="평균 DPO"
              value={cccAnalysis.avgDPO}
              format="number"
              icon={<Landmark className="h-5 w-5" />}
              formula="매출원가율 기반 업종 평균 추정\n80%↑=45일, 60~80%=35일, 60%↓=30일"
              description="매입채무 결제 소요일 추정치입니다. 매출원가율 기반으로 업종 특성을 반영하여 추정합니다."
              benchmark="DPO가 길수록 운전자본 관리에 유리 (단, 거래 관계 고려)"
            />
            <KpiCard
              title="분석 조직 수"
              value={dsoMetrics.length}
              format="number"
              icon={<Users className="h-5 w-5" />}
              description="DSO/CCC 분석이 가능한 조직 수입니다. 미수금 및 매출 데이터가 모두 존재하는 조직만 포함됩니다."
            />
          </div>

          {filteredSales.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                매출 데이터가 업로드되지 않아 DSO를 정확하게 계산할 수 없습니다. 매출목록 엑셀 파일을 업로드하면 조직별 DSO 분석이 가능합니다.
              </p>
            </div>
          )}

          {filteredTeamContrib.length === 0 && filteredSales.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                팀기여도 데이터가 업로드되지 않아 DPO/CCC를 추정할 수 없습니다. 팀기여도 엑셀 파일을 업로드하면 CCC 분석이 가능합니다.
              </p>
            </div>
          )}

          <ChartCard
            title="조직별 DSO (매출채권 회수일)"
            formula="DSO = (조직별 미수금 합계 / 조직별 월평균 매출) × 30\n색상: 녹색(우수 <30일), 파랑(양호 30~45일), 노랑(보통 45~60일), 빨강(주의 >60일)"
            description="각 조직의 매출채권 평균 회수 소요일입니다. DSO가 낮을수록 현금 회수가 빠르며 운전자본 관리가 효율적입니다."
            benchmark="업종 평균 DSO 45일 기준, 30일 미만이면 최상위 수준"
          >
            <div className="h-64 md:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dsoChartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}일`}
                  />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 10 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any) => [`${value}일`, "DSO"]}
                    labelFormatter={(label) => `조직: ${label}`}
                  />
                  <ReferenceLine x={45} stroke="hsl(45, 93%, 47%)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: "업종평균 45일", position: "top", fontSize: 10 }} />
                  <Bar dataKey="dso" name="DSO" radius={[0, 4, 4, 0]}>
                    {dsoChartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={DSO_COLORS[entry.classification] || CHART_COLORS[0]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="조직별 CCC 상세 분석"
            formula="CCC = DSO - DPO (DIO=0)\nDSO: 매출채권 회수일\nDPO: 매입채무 결제일 (추정)\nCCC: 현금전환주기"
            description="조직별 현금전환주기(CCC)를 분석합니다. CCC가 음수이면 매입 결제 전에 매출을 회수하는 우수한 상태입니다."
            benchmark="CCC 0일 미만 우수, 30일 이내 양호"
            action={<ExportButton data={cccExportData} fileName="CCC분석" />}
          >
            <DataTable
              data={cccMetrics}
              columns={cccColumns}
              searchPlaceholder="조직 검색..."
              defaultPageSize={20}
            />
          </ChartCard>
        </TabsContent>

        <TabsContent value="prepayment" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 선수금"
              value={prepaymentSummary.totalPrepayment}
              format="currency"
              icon={<Wallet className="h-5 w-5" />}
              formula="SUM(수금목록의 선수금액)"
              description="거래처로부터 미리 받은 선수금 총액입니다. 향후 매출로 인식될 예정인 금액입니다."
              benchmark="매출 대비 적정 비율 유지 필요"
            />
            <KpiCard
              title="장부 선수금"
              value={prepaymentSummary.totalBookPrepayment}
              format="currency"
              icon={<Landmark className="h-5 w-5" />}
              formula="SUM(수금목록의 장부선수금액)"
              description="회계 장부에 기록된 선수금 총액입니다. 통화 환산 차이로 선수금액과 차이가 발생할 수 있습니다."
              benchmark="선수금액과 장부선수금액 차이가 크면 환율 변동 점검"
            />
            <KpiCard
              title="매출 대비 비중"
              value={prepaymentSummary.prepaymentToSalesRatio}
              format="percent"
              icon={<Percent className="h-5 w-5" />}
              formula="총 선수금 / 총 매출액 × 100"
              description="매출액 대비 선수금 비율입니다. 높을수록 선수금 의존도가 높으며, 향후 이행 의무가 큰 상태입니다."
              benchmark="10% 미만 양호, 20% 이상 시 이행 리스크 점검"
            />
            <KpiCard
              title="해당 조직 수"
              value={prepaymentSummary.orgCount}
              format="number"
              icon={<Building2 className="h-5 w-5" />}
              description="선수금이 발생한 조직 수입니다."
            />
          </div>

          {filteredCollections.length === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                수금 데이터가 업로드되지 않아 선수금 분석을 수행할 수 없습니다. 수금목록 엑셀 파일을 업로드하면 선수금 분석이 가능합니다.
              </p>
            </div>
          )}

          <ChartCard
            title="조직별 선수금 현황"
            formula="SUM(선수금액) GROUP BY 영업조직\nTOP 10 기준 내림차순 정렬"
            description="조직별 선수금 상위 10개 조직입니다. 특정 조직에 선수금이 집중되어 있다면 이행 리스크를 점검해야 합니다."
            benchmark="단일 조직 선수금이 전체의 30% 이상이면 집중도 과다"
          >
            <div className="h-80 md:h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={orgPrepayments.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis type="category" dataKey="org" tick={{ fontSize: 10 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value)),
                      name === "prepayment" ? "선수금" : "장부선수금",
                    ]}
                    labelFormatter={(label) => `조직: ${label}`}
                  />
                  <Legend formatter={(value) => (value === "prepayment" ? "선수금" : "장부선수금")} />
                  <Bar dataKey="prepayment" name="prepayment" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="월별 선수금 추이"
            formula="SUM(선수금액) GROUP BY 수금월\nBar = 선수금, Line = 장부선수금"
            description="월별 선수금 발생 추이입니다. 선수금과 장부선수금의 차이가 크면 환율 변동이나 회계 처리 시점 차이를 점검해야 합니다."
            benchmark="월별 변동폭이 크면 계절성 또는 대형 프로젝트 영향 확인"
          >
            <div className="h-72 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyPrepayments}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: any, name: any) => [
                      formatCurrency(Number(value)),
                      name === "prepayment" ? "선수금" : "장부선수금",
                    ]}
                  />
                  <Legend formatter={(value) => (value === "prepayment" ? "선수금" : "장부선수금")} />
                  <Bar dataKey="prepayment" name="prepayment" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="bookPrepayment"
                    name="bookPrepayment"
                    stroke={CHART_COLORS[3]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
