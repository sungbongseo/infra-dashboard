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
import { calcAgingSummary, calcAgingByOrg, calcAgingByPerson, calcRiskAssessments } from "@/lib/analysis/aging";
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
import { CreditCard, AlertTriangle, Shield, Users, Landmark, Wallet, Building2, Percent } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, filterByOrg, filterByDateRange, TOOLTIP_STYLE } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import type { AgingRiskAssessment } from "@/types";
import { CreditTab } from "./tabs/CreditTab";
import { DsoTab } from "./tabs/DsoTab";

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

  // DSO/CCC 분석용 필터
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
            {(isFinite(getValue<number>()) ? getValue<number>() : 0).toFixed(1)}%
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
        <TabsList className="flex-wrap h-auto gap-1">
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
              formula="모든 미수채권연령 파일의 미수금을 합산"
              description="인프라 사업본부 담당 조직이 거래처로부터 아직 받지 못한 매출채권의 총합입니다. 미수금이 과도하면 현금 유동성에 문제가 생길 수 있습니다."
              benchmark="매출액 대비 15% 이내이면 양호한 수준입니다"
            />
            <KpiCard
              title="91일 이상 장기 미수"
              value={overdueTotal}
              format="currency"
              icon={<AlertTriangle className="h-5 w-5" />}
              formula="91일 이상 장기 미수액(원) = 4개월차(91~120일) + 5개월차(121~150일) + 6개월차(151~180일) + 6개월 초과(181일+) 미수금의 합계"
              description="91일(4개월차) 이상 장기간 회수되지 않은 미수금 합계입니다. 오래 될수록 회수가 어려워지므로 즉각적인 추심 활동이 필요합니다."
              benchmark="총 미수금의 20% 미만이면 양호, 30% 이상이면 집중 관리가 필요합니다"
            />
            <KpiCard
              title="연체비율"
              value={overdueRate}
              format="percent"
              formula="연체비율(%) = 91일 이상 미수금(4개월차~6개월 초과) ÷ 총 미수금 × 100"
              description="전체 미수금 중에서 91일(4개월차) 이상 장기 체류한 채권이 차지하는 비율입니다. 이 비율이 높으면 채권 건전성이 낮다는 의미이므로 회수 전략 점검이 필요합니다."
              benchmark="20% 미만이면 양호, 30% 이상이면 위험 수준입니다"
            />
            <KpiCard
              title="고위험 거래처"
              value={highRiskCount}
              format="number"
              icon={<Shield className="h-5 w-5" />}
              formula="연체비율 50% 초과 또는 6개월 이상 미수금 1억원 초과인 거래처 수"
              description="채권 회수가 어려울 가능성이 높은 거래처 수입니다. 이런 거래처에는 즉각적인 추심 조치와 거래 조건 재검토가 필요합니다."
              benchmark="0건이 이상적이며, 3건 이상이면 집중 관리 체계가 필요합니다"
            />
          </div>

          <ChartCard
            title="조직별 미수채권 연령 분석"
            formula="각 조직의 미수채권을 경과 기간별(1~6개월, 6개월 초과)로 분류"
            description="조직별로 미수채권이 얼마나 오래되었는지 색상으로 구분하여 보여줍니다. 녹색은 최근 발생한 채권, 빨간색은 오래된 채권입니다. 빨간색 비중이 클수록 회수 위험이 높습니다."
            benchmark="3개월 이상 비율이 20% 미만이면 양호합니다. 6개월 초과 비중이 높으면 대손(회수 불능) 위험이 있습니다"
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
              formula="미수금 잔액이 있는 고유 영업담당자 수 합계"
              description="현재 미수금을 보유하고 있는 영업담당자 수입니다. 미수금이 특정 담당자에 집중되어 있는지 확인할 필요가 있습니다."
              benchmark="미수금이 상위 20% 담당자에 집중되어 있다면 업무 분산 또는 집중 관리 검토"
            />
            <KpiCard
              title="주의 거래처"
              value={mediumRiskCount}
              format="number"
              formula="연체비율 30~50% 또는 3개월 이상 미수금 5천만원 초과인 거래처 수"
              description="아직 고위험은 아니지만 관심이 필요한 거래처 수입니다. 방치하면 고위험으로 악화될 수 있으므로 선제적인 관리가 중요합니다."
              benchmark="주의 거래처가 전체의 10% 이상이면 연체 관리 프로세스 강화 필요"
            />
            <KpiCard
              title="고위험 거래처"
              value={highRiskCount}
              format="number"
              icon={<Shield className="h-5 w-5" />}
              formula="연체비율 50% 초과 또는 6개월 이상 미수금 1억원 초과인 거래처 수"
              description="채권 회수가 어려울 가능성이 높아 즉각적인 추심 조치가 필요한 거래처 수입니다."
              benchmark="0건이 이상적이며, 발생 시 즉시 대응 계획을 수립해야 합니다"
            />
            <KpiCard
              title="리스크 평가 대상"
              value={risks.length}
              format="number"
              formula="미수금 연체 데이터에서 거래처별 리스크 등급을 산정한 전체 대상 수"
              description="미수금 연체 상황에 따라 리스크 등급(양호/주의/고위험)이 분류된 전체 거래처 수입니다."
              benchmark="전체 거래처 대비 평가 대상 비율이 높을수록 채권 관리 범위가 넓다는 의미"
            />
          </div>

          <ChartCard
            title="담당자별 미수금 현황"
            formula="영업담당자별 미수금 합계를 구한 뒤 상위 15명을 표시"
            description="미수금이 가장 많은 영업담당자 상위 15명입니다. 특정 담당자에 미수금이 지나치게 몰려 있다면 해당 담당자의 거래처 관리를 강화해야 합니다."
            benchmark="1인당 미수금이 전체의 20% 이상이면 집중도가 과도한 상태입니다"
          >
            <div className="h-80 md:h-[500px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byPerson.slice(0, 15)} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                  <YAxis type="category" dataKey="person" tick={{ fontSize: 10 }} width={55} />
                  <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                  <Bar dataKey="total" fill="hsl(24.6, 95%, 53.1%)" name="미수금" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="리스크 등급 현황"
            formula="고위험: 연체비율 50% 초과 또는 6개월 이상 1억 초과\n주의: 연체비율 30~50% 또는 3개월 이상 5천만 초과\n양호: 위 조건에 해당하지 않는 거래처"
            description="연체 기간과 금액을 기준으로 거래처를 3단계(양호/주의/고위험) 등급으로 분류한 표입니다. 고위험 거래처는 즉시 추심 조치가 필요합니다."
            benchmark="고위험 0건, 주의 등급의 미수금이 전체의 10% 이내이면 이상적입니다"
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
          <CreditTab allRecords={allRecords} />
        </TabsContent>

        <TabsContent value="dso" className="space-y-6">
          <DsoTab
            allRecords={allRecords}
            filteredSales={filteredSales}
            filteredTeamContrib={filteredTeamContrib}
          />
        </TabsContent>

        <TabsContent value="prepayment" className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="총 선수금"
              value={prepaymentSummary.totalPrepayment}
              format="currency"
              icon={<Wallet className="h-5 w-5" />}
              formula="수금목록에서 선수금으로 분류된 금액을 모두 합산"
              description="거래처로부터 상품 인도 전에 미리 받은 금액의 총합입니다. 선수금은 아직 매출로 인식되지 않았으며, 향후 상품이나 서비스를 제공해야 하는 의무가 있습니다."
              benchmark="매출 대비 적정 비율을 유지해야 하며, 과도한 선수금은 이행 부담을 의미합니다"
            />
            <KpiCard
              title="장부 선수금"
              value={prepaymentSummary.totalBookPrepayment}
              format="currency"
              icon={<Landmark className="h-5 w-5" />}
              formula="수금목록의 장부선수금액을 모두 합산"
              description="회계 장부에 원화로 기록된 선수금 총액입니다. 외화 거래가 있으면 환율 차이로 인해 실제 선수금액과 차이가 날 수 있습니다."
              benchmark="선수금액과 장부선수금액의 차이가 크면 환율 변동 영향을 점검해야 합니다"
            />
            <KpiCard
              title="매출 대비 비중"
              value={prepaymentSummary.prepaymentToSalesRatio}
              format="percent"
              icon={<Percent className="h-5 w-5" />}
              formula="매출 대비 비중(%) = 총 선수금 ÷ 총 매출액 × 100"
              description="매출액 대비 선수금이 차지하는 비율입니다. 이 비율이 높으면 아직 이행하지 않은 의무가 많다는 의미이며, 납품 일정 관리가 중요합니다."
              benchmark="10% 미만이면 양호, 20% 이상이면 이행 리스크를 점검해야 합니다"
            />
            <KpiCard
              title="해당 조직 수"
              value={prepaymentSummary.orgCount}
              format="number"
              icon={<Building2 className="h-5 w-5" />}
              formula="수금 데이터에서 선수금이 1건 이상 발생한 고유 조직 수"
              description="선수금이 발생한 영업조직 수입니다. 선수금이 특정 조직에 집중되어 있는지 확인할 필요가 있습니다."
              benchmark="선수금이 특정 1~2개 조직에 집중되면 해당 조직의 납품 일정 리스크 점검 필요"
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
            formula="영업조직별 선수금액을 합산하여 상위 10개 조직을 표시"
            description="선수금이 가장 많은 상위 10개 조직입니다. 특정 조직에 선수금이 집중되어 있다면 해당 조직의 납품 이행 능력과 일정을 점검해야 합니다."
            benchmark="단일 조직의 선수금이 전체의 30% 이상이면 집중도가 과도한 상태입니다"
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
                  <Bar dataKey="prepayment" name="prepayment" fill="hsl(221.2, 83.2%, 53.3%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="월별 선수금 추이"
            formula="수금월별 선수금액을 합산\n막대 = 선수금, 선 = 장부선수금"
            description="매월 선수금이 얼마나 발생했는지 추이를 보여줍니다. 선수금(막대)과 장부선수금(선)의 차이가 크면 환율 변동이나 회계 처리 시점 차이를 점검해야 합니다."
            benchmark="월별 변동폭이 크면 계절적 요인이나 대형 프로젝트의 영향을 확인해야 합니다"
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
                  <Bar dataKey="prepayment" name="prepayment" fill="hsl(221.2, 83.2%, 53.3%)" radius={[4, 4, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="bookPrepayment"
                    name="bookPrepayment"
                    stroke="hsl(24.6, 95%, 53.1%)"
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
