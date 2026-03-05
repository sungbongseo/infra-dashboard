"use client";

import { useMemo } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  ChartContainer,
  GRID_PROPS,
  BAR_RADIUS_TOP,
  ACTIVE_BAR,
  ANIMATION_CONFIG,
} from "@/components/charts";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import { CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import {
  calcConversionSummary,
  calcMonthlyConversionTrend,
  calcOrgConversion,
  calcPipelineByStatus,
  calcCurrencyConversion,
} from "@/lib/analysis/orderConversion";
import type { OrderRecord } from "@/types";

interface ConversionTabProps {
  filteredOrders: OrderRecord[];
  isDateFiltered?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  완료: "hsl(145, 60%, 42%)",
  삭제: "hsl(0, 65%, 55%)",
  진행: "hsl(217, 91%, 60%)",
  기타: "hsl(var(--muted-foreground))",
};

export function ConversionTab({ filteredOrders, isDateFiltered }: ConversionTabProps) {
  const summary = useMemo(
    () => calcConversionSummary(filteredOrders),
    [filteredOrders]
  );

  const monthlyTrend = useMemo(
    () => calcMonthlyConversionTrend(filteredOrders),
    [filteredOrders]
  );

  const orgConversion = useMemo(
    () => calcOrgConversion(filteredOrders),
    [filteredOrders]
  );

  const pipelineByStatus = useMemo(
    () => calcPipelineByStatus(filteredOrders),
    [filteredOrders]
  );

  const currencyConversion = useMemo(
    () => calcCurrencyConversion(filteredOrders),
    [filteredOrders]
  );

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="수주 전환율"
          value={summary.conversionRate}
          format="percent"
          icon={<CheckCircle className="h-5 w-5 text-green-600" />}
          formula="전환율(%) = 완료 건수 / 전체 수주 건수 × 100"
          description={`전체 ${summary.totalOrders}건 중 ${summary.completed.count}건이 완료되었습니다. 완료 금액: ${formatCurrency(summary.completed.amount, true)}`}
          benchmark="전환율 80% 이상이면 양호, 60% 미만이면 파이프라인 관리 점검 필요"
          reason="수주가 실제 매출로 전환되는 비율을 추적하여 영업 효율성과 파이프라인 건전성을 평가합니다"
        />
        <KpiCard
          title="수주 취소율"
          value={summary.cancellationRate}
          format="percent"
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          formula="취소율(%) = 삭제 건수 / 전체 수주 건수 × 100"
          description={`전체 ${summary.totalOrders}건 중 ${summary.cancelled.count}건이 삭제되었습니다. 삭제 금액: ${formatCurrency(summary.cancelled.amount, true)}`}
          benchmark="취소율 10% 이내이면 양호, 20% 초과 시 수주 품질 점검 필요"
          reason="수주 취소 비율을 모니터링하여 수주 품질 문제나 고객 이탈 신호를 조기에 감지합니다"
        />
        <KpiCard
          title="진행 중 수주"
          value={summary.inProgress.count}
          format="number"
          icon={<Clock className="h-5 w-5 text-blue-600" />}
          formula="품목상태가 '진행'인 수주 건수"
          description={`현재 진행 중인 수주 ${summary.inProgress.count}건, 금액 ${formatCurrency(summary.inProgress.amount, true)}. 향후 매출 전환 가능 파이프라인입니다.`}
          benchmark="진행 건의 평균 체류 기간이 30일 이내이면 양호"
          reason="진행 중인 수주를 파악하여 잠재 매출 규모와 전환 촉진 대상을 식별합니다"
        />
        <KpiCard
          title="건당 평균 수주액"
          value={summary.totalOrders > 0 ? summary.totalAmount / summary.totalOrders : 0}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="건당 평균 = 전체 수주 금액 / 전체 수주 건수"
          description="수주 1건당 평균 금액입니다. 대형 프로젝트 비중이 높을수록 건당 평균이 높아집니다."
          benchmark="건당 평균이 상승 추세이면 고부가가치 수주 확대 중"
          reason="수주 건당 규모 변화를 추적하여 영업 전략의 방향성(대형화/소형다건화)을 파악합니다"
        />
      </div>

      {/* 파이프라인 가치 (파이 차트) */}
      <ChartCard
        title="품목상태별 파이프라인 가치"
        isEmpty={pipelineByStatus.length === 0}
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="품목상태별 장부금액 합산 및 비중 계산"
        description="수주 건의 품목상태(완료/진행/삭제/기타)별 금액 비중입니다. 완료 비중이 높을수록 파이프라인이 건전하며, 삭제 비중이 높으면 수주 품질 개선이 필요합니다."
        benchmark="완료 비중 80% 이상이면 건전한 파이프라인"
        reason="품목상태별 금액 분포를 파악하여 파이프라인 건전성을 진단하고, 삭제/기타 비중이 높은 원인을 분석합니다"
      >
        <ChartContainer height="h-64 md:h-80">
          <PieChart>
            <Pie
              data={pipelineByStatus.map((d) => ({
                name: d.status,
                value: d.amount,
                share: d.share,
              }))}
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="70%"
              dataKey="value"
              nameKey="name"
              label={(props: any) => {
                const { name, share } = props;
                return `${name} ${share.toFixed(1)}%`;
              }}
              {...ANIMATION_CONFIG}
            >
              {pipelineByStatus.map((d, i) => (
                <Cell key={i} fill={STATUS_COLORS[d.status] || CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]}
            />
            <Legend />
          </PieChart>
        </ChartContainer>
      </ChartCard>

      {/* 월별 전환율 추세 */}
      <ChartCard
        title="월별 수주 전환율 추세"
        isEmpty={monthlyTrend.length === 0}
        dataSourceType="period"
        isDateFiltered={isDateFiltered}
        formula="월별 완료 건수/전체 건수 × 100, 삭제 건수/전체 건수 × 100"
        description="월별로 수주 완료율과 취소율의 추이를 보여줍니다. 스택 바 차트로 상태별 건수를, 라인으로 전환율/취소율을 표시합니다."
        benchmark="전환율이 지속 하락하면 수주 품질 또는 납기 관리 이슈 점검"
        reason="월별 전환율 추이를 통해 특정 시점의 이상 변동(대량 취소, 전환 지연)을 감지하고 원인을 분석합니다"
      >
        <ChartContainer height="h-72 md:h-96">
          <ComposedChart data={monthlyTrend}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: any) => `${v}%`}
              domain={[0, 100]}
            />
            <RechartsTooltip
              {...TOOLTIP_STYLE}
              formatter={(v: any, name: any) => {
                const n = String(name);
                if (n === "전환율" || n === "취소율") return `${Number(v).toFixed(1)}%`;
                return `${Number(v).toLocaleString()}건`;
              }}
            />
            <Legend />
            <Bar yAxisId="left" dataKey="완료" stackId="status" fill={STATUS_COLORS.완료} {...ANIMATION_CONFIG} />
            <Bar yAxisId="left" dataKey="진행" stackId="status" fill={STATUS_COLORS.진행} {...ANIMATION_CONFIG} />
            <Bar yAxisId="left" dataKey="삭제" stackId="status" fill={STATUS_COLORS.삭제} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            <Line yAxisId="right" type="monotone" dataKey="전환율" stroke="hsl(145, 80%, 30%)" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="취소율" stroke="hsl(0, 80%, 45%)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 조직별 전환율 비교 */}
        <ChartCard
          title="조직별 전환율 비교"
          isEmpty={orgConversion.length === 0}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="조직별 완료 건수/전체 건수 × 100"
          description="영업조직별 수주 전환율과 취소율을 비교합니다. 전환율이 높고 취소율이 낮은 조직이 수주 품질이 우수합니다."
          benchmark="조직 간 전환율 편차가 20%p 이상이면 수주 프로세스 표준화 필요"
          reason="조직 간 전환 성과 차이를 파악하여 우수 조직의 수주 관리 노하우를 전파하고, 부진 조직의 개선점을 도출합니다"
        >
          <ChartContainer height="h-72 md:h-80">
            <BarChart data={orgConversion.slice(0, 10)} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="org" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold">{d.org}</p>
                      <p className="text-green-600">전환율: {d.conversionRate.toFixed(1)}%</p>
                      <p className="text-red-600">취소율: {d.cancellationRate.toFixed(1)}%</p>
                      <p>총 {d.totalCount}건 ({formatCurrency(d.totalAmount, true)})</p>
                      <p>건당 평균: {formatCurrency(d.avgOrderAmount, true)}</p>
                    </div>
                  );
                }}
              />
              <Legend />
              <Bar dataKey="conversionRate" name="전환율" fill={STATUS_COLORS.완료} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="cancellationRate" name="취소율" fill={STATUS_COLORS.삭제} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 통화별 전환율 */}
        <ChartCard
          title="통화별 전환율 (내수/수출)"
          isEmpty={currencyConversion.length === 0}
          dataSourceType="period"
          isDateFiltered={isDateFiltered}
          formula="단가통화별 완료/삭제 비율 계산"
          description="KRW(내수)와 외화(수출) 수주의 전환율·취소율을 비교합니다. 수출 수주는 리드타임이 길어 전환율이 다를 수 있습니다."
          benchmark="수출 수주 취소율이 내수 대비 2배 이상이면 수출 견적 프로세스 점검"
          reason="내수/수출 채널별 전환 패턴 차이를 분석하여 채널별 맞춤 수주 관리 전략을 수립합니다"
        >
          <ChartContainer height="h-72 md:h-80">
            <BarChart data={currencyConversion} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="currency" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold">{d.currency}</p>
                      <p className="text-green-600">전환율: {d.conversionRate.toFixed(1)}%</p>
                      <p className="text-red-600">취소율: {d.cancellationRate.toFixed(1)}%</p>
                      <p>총 {d.totalCount}건 ({formatCurrency(d.totalAmount, true)})</p>
                    </div>
                  );
                }}
              />
              <Legend />
              <Bar dataKey="conversionRate" name="전환율" fill={STATUS_COLORS.완료} radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
              <Bar dataKey="cancellationRate" name="취소율" fill={STATUS_COLORS.삭제} radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>
    </>
  );
}
