import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  PieChart, Pie, Legend, ReferenceLine,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Users } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

interface ContribEntry {
  name: string;
  displayName: string;
  org: string;
  사번: string;
  공헌이익: number;
  공헌이익율: number;
}

interface ContribTabProps {
  contribRanking: ContribEntry[];
  contribByRate: ContribEntry[];
  orgContribPie: Array<{ name: string; value: number }>;
  excludedNegativeContribCount: number;
  contribTotals: { sales: number; contrib: number; rate: number };
  isDateFiltered?: boolean;
}

export function ContribTab({ contribRanking, contribByRate, orgContribPie, excludedNegativeContribCount, contribTotals, isDateFiltered }: ContribTabProps) {
  return (
    <>
      {/* 팀원별 공헌이익 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="분석 인원"
          value={contribRanking.length}
          format="number"
          icon={<Users className="h-5 w-5" />}
          formula="소계/합계 행을 제외한 실제 영업 담당자(사번 기준) 수"
          description="소계행을 제외한 실제 영업 담당자 수입니다."
          benchmark="인당 평균 매출이 1억 이상이면 적정 인력, 미만이면 인력 효율 점검"
          reason="영업 인력 규모를 파악하여 인당 생산성과 적정 인력 수준을 판단하고, 인력 증감 의사결정의 기초 데이터로 활용합니다"
        />
        <KpiCard
          title="1인당 평균 공헌이익"
          value={contribRanking.length > 0 ? contribRanking.reduce((s, r) => s + r.공헌이익, 0) / contribRanking.length : 0}
          format="currency"
          formula="1인당 평균 공헌이익 = 전체 공헌이익 합계 ÷ 분석 인원 수"
          description="전체 공헌이익을 담당자 수로 나눈 평균입니다."
          benchmark="인당 공헌이익이 양수면 고정비 회수에 기여, 음수면 해당 인력의 수익성 점검 필요"
          reason="인당 수익 기여도를 통해 인력 효율성을 객관적으로 평가하고, 인센티브 설계 및 인력 투자 대비 수익률(ROI)을 산출합니다"
        />
        <KpiCard
          title="최고 성과자"
          value={contribRanking.length > 0 ? contribRanking[0].공헌이익 : 0}
          format="currency"
          formula="공헌이익 기준 내림차순 정렬 시 1위 담당자의 공헌이익"
          description={contribRanking.length > 0 ? `${contribRanking[0].org} ${contribRanking[0].사번}` : "-"}
          benchmark="최고 성과자 1인의 비중이 전체의 30% 이상이면 인력 의존도 리스크"
          reason="최고 성과자의 기여도를 파악하여 핵심 인재 이탈 리스크를 사전 관리하고, 성공 패턴을 다른 영업 담당자에게 전파하는 데 활용합니다"
        />
        <KpiCard
          title="평균 공헌이익율"
          value={contribTotals.rate}
          format="percent"
          formula="전체 공헌이익 합계 ÷ 전체 매출액 합계 × 100 (가중평균)"
          description={`전체 매출 ${contribTotals.sales > 0 ? "대비" : "이 0이므로"} 공헌이익의 비율입니다. 매출 규모가 큰 담당자의 이익율이 더 많이 반영됩니다.`}
          benchmark="20% 이상 양호, 음수이면 변동비가 매출보다 큰 적자 상태"
          reason="가중평균 공헌이익율을 통해 영업 조직 전체의 실질적 변동비 관리 수준을 진단하고, 고정비 회수 속도를 가늠할 수 있습니다"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ChartCard
          title="담당자별 공헌이익 랭킹"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="공헌이익 = 매출액 - 변동비(원재료비, 외주비 등)"
          description={`각 영업 담당자가 회사 고정비 회수에 얼마나 기여하는지를 공헌이익 금액 순으로 보여줍니다. 전체 ${contribRanking.length}명 중 상위 담당자일수록 회사 수익에 큰 기여를 하고 있습니다.`}
          benchmark="일반적으로 상위 20% 담당자가 전체 공헌이익의 약 80%를 차지합니다 (파레토 법칙)"
          reason="담당자별 수익 기여도 순위를 통해 성과 평가, 인센티브 배분, 핵심 인재 리텐션 전략의 객관적 근거를 제공합니다"
          className="xl:col-span-2"
        >
          <ChartContainer height="h-80 md:h-[500px]">
              <BarChart data={contribRanking} layout="vertical" margin={{ left: 90 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="displayName" tick={{ fontSize: 9 }} width={85} />
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                        <p className="font-semibold mb-1">{d.사번}</p>
                        <p className="text-xs text-muted-foreground mb-1">조직: {d.org}</p>
                        <p>공헌이익: {formatCurrency(d.공헌이익)}</p>
                        <p>공헌이익율: {formatPercent(d.공헌이익율, 1)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="공헌이익" name="공헌이익" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                  {contribRanking.map((entry, i) => (
                    <Cell key={i} fill={entry.공헌이익 >= 0 ? CHART_COLORS[2] : CHART_COLORS[4]} />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard
          title="조직별 공헌이익 비중"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="비중(%) = 해당 조직의 공헌이익 ÷ 전체 공헌이익 × 100"
          description="전체 공헌이익 중 각 조직이 차지하는 비율을 원형 차트로 보여줍니다. 한 조직에 지나치게 편중되면 해당 조직 실적 부진 시 전체 수익에 큰 타격을 받으므로, 적절한 분산이 중요합니다."
          benchmark="특정 조직 비중이 50%를 넘으면 수익 집중 리스크를 검토해야 합니다"
          reason="조직별 공헌이익 편중도를 파악하여 특정 조직 의존 리스크를 관리하고, 수익 포트폴리오 다각화 전략을 수립합니다"
        >
          <ChartContainer height="h-56 md:h-72">
              <PieChart>
                <Pie
                  data={orgContribPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  label={orgContribPie.length <= 6
                    ? (props: any) => `${props.name || ""} ${(((props.percent as number) || 0) * 100).toFixed(1)}%`
                    : false
                  }
                >
                  {orgContribPie.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any) => formatCurrency(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
          </ChartContainer>
          {excludedNegativeContribCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1 px-1">
              * 공헌이익 음수 조직 {excludedNegativeContribCount}개 제외됨
            </p>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="담당자별 공헌이익율"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="공헌이익율(%) = 공헌이익 ÷ 매출액 × 100"
        description="각 담당자의 매출 100원당 변동비를 빼고 남는 이익 비율입니다. 공헌이익율이 높을수록 적은 매출로도 고정비 회수에 크게 기여하며, 변동비 관리를 효율적으로 하고 있다는 의미입니다."
        benchmark="공헌이익율 20% 이상이면 양호, 음수인 경우 매출보다 변동비가 더 큰 적자 상태"
        reason="담당자별 이익율 비교를 통해 단순히 매출이 큰 것이 아닌 수익성 높은 영업 활동을 하는 인력을 식별하고, 저이익율 담당자에 대한 코칭 방향을 설정합니다"
      >
        <ChartContainer height="h-80 md:h-[500px]">
            <BarChart data={contribByRate} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="displayName" tick={{ fontSize: 9 }} width={85} />
              <RechartsTooltip
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  return (
                    <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                      <p className="font-semibold mb-1">{d.사번}</p>
                      <p className="text-xs text-muted-foreground mb-1">조직: {d.org}</p>
                      <p>공헌이익율: {formatPercent(d.공헌이익율, 1)}</p>
                      <p>공헌이익: {formatCurrency(d.공헌이익)}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine x={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" />
              {isFinite(contribTotals.rate) && (
                <ReferenceLine x={contribTotals.rate} stroke={CHART_COLORS[3]} strokeDasharray="5 3"
                  label={{ value: `평균 ${contribTotals.rate.toFixed(1)}%`, fontSize: 10, position: "top" }} />
              )}
              <Bar dataKey="공헌이익율" name="공헌이익율" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {contribByRate.map((entry, i) => (
                  <Cell key={i} fill={entry.공헌이익율 >= 0 ? CHART_COLORS[2] : CHART_COLORS[4]} />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
