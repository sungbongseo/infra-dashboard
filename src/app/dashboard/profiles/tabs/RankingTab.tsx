import { ChartCard } from "@/components/dashboard/ChartCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  PieChart, Pie,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { Star, Trophy, TrendingUp, AlertTriangle } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { SalesRepProfile } from "@/lib/analysis/profiling";

interface RankingTabProps {
  selected: SalesRepProfile | undefined;
  rankingData: Array<{ name: string; score: number; isSelected: boolean }>;
  customerPieData: Array<{ name: string; value: number; amount: number; fill: string }>;
  isDateFiltered?: boolean;
  rankFormulaText: string;
}

export function RankingTab({ selected, rankingData, customerPieData, rankFormulaText, isDateFiltered }: RankingTabProps) {
  return (
    <>
      <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
        title="성과 점수 랭킹"
        formula={rankFormulaText}
        description="영업사원을 매출 실적 순으로 정렬한 순위표입니다. 상위 소수에 매출이 집중되면 퇴사/이동 시 매출 급감 위험이 있어 저성과자 육성이 필요합니다."
        benchmark="상위 20% 영업사원이 매출 60% 이상 기여하면 인력 의존 리스크"
        reason="영업사원 순위와 담당 거래처 현황을 파악하여 인력 재배치와 거래처 재배분의 근거를 마련합니다."
      >
        <ChartContainer height="h-80 md:h-[500px]">
            <BarChart data={rankingData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => `${v}점`} />
              <Bar dataKey="score" name="총점" radius={BAR_RADIUS_RIGHT} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {rankingData.map((entry, i) => (
                  <Cell key={i} fill={entry.isSelected ? CHART_COLORS[3] : CHART_COLORS[0]} />
                ))}
              </Bar>
            </BarChart>
        </ChartContainer>
      </ChartCard>

      {selected && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">거래처 포트폴리오</p>
                </div>
                <p className="text-2xl font-bold">{selected.customerCount}</p>
                <p className="text-xs text-muted-foreground">활성 거래처 수</p>
                <p className="text-[10px] text-muted-foreground mt-1">거래처 수가 팀 평균의 1.5배 이상이면 관리 부하 점검</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">품목 전문성</p>
                </div>
                <p className="text-2xl font-bold">{selected.itemCount}</p>
                <p className="text-xs text-muted-foreground">취급 품목 수</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">공헌이익율</p>
                </div>
                <p className="text-2xl font-bold">{formatPercent(selected.contributionMarginRate)}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.contributionMarginRate >= 40 ? "우수" : selected.contributionMarginRate >= 20 ? "보통" : "개선 필요"}
                </p>
              </CardContent>
            </Card>
          </div>

          <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
            title="거래처 집중도 - HHI(허핀달-허쉬만 지수)"
            formula="HHI = Σ(거래처 매출 비중²)\n거래처 매출 비중 = 거래처 매출 ÷ 담당자 총 매출"
            description="HHI(허핀달-허쉬만 지수)는 매출이 특정 거래처에 얼마나 집중되어 있는지 측정하는 지표입니다. 0에 가까우면 여러 거래처에 매출이 고르게 분산된 안정적인 상태이고, 1에 가까우면 소수 거래처에 의존도가 높아 리스크가 큽니다."
            benchmark="HHI가 0.25 초과이면 고위험(과점 상태), 0.15~0.25이면 적정 집중, 0.15 미만이면 분산(안정적)입니다"
            reason="거래처 집중도를 측정하여 특정 거래처 이탈 시 매출 급감 리스크를 사전에 파악하고, 거래처 다변화 전략을 수립합니다."
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">HHI 지수</p>
                    <p className="text-3xl font-bold">{selected.hhi.toFixed(3)}</p>
                  </div>
                  <Badge
                    variant={selected.hhiRiskLevel === "high" ? "destructive" : selected.hhiRiskLevel === "medium" ? "warning" : "success"}
                    className="text-sm px-3 py-1"
                  >
                    {selected.hhiRiskLevel === "high" && (<><AlertTriangle className="h-3.5 w-3.5 mr-1 inline" />고위험</>)}
                    {selected.hhiRiskLevel === "medium" && "적정 집중"}
                    {selected.hhiRiskLevel === "low" && "분산"}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">최대 거래처 비중</span>
                    <span className="font-medium">{formatPercent((selected.topCustomerShare > 1 ? selected.topCustomerShare : selected.topCustomerShare * 100))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">활성 거래처 수</span>
                    <span className="font-medium">{selected.customerCount}개</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 (분산)</span>
                    <span>1 (독점)</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-emerald-200 dark:bg-emerald-900" style={{ width: "15%" }} />
                    <div className="absolute inset-y-0 bg-amber-200 dark:bg-amber-900" style={{ left: "15%", width: "10%" }} />
                    <div className="absolute inset-y-0 bg-red-200 dark:bg-red-900" style={{ left: "25%", width: "75%" }} />
                    <div className="absolute inset-y-0 w-1 bg-foreground rounded-full" style={{ left: `${Math.min(selected.hhi * 100, 100)}%` }} />
                  </div>
                  <div className="flex text-[10px] text-muted-foreground">
                    <span className="flex-1">분산</span>
                    <span className="flex-1 text-center">적정</span>
                    <span className="flex-1 text-right">과점</span>
                  </div>
                </div>
                {selected.topCustomers.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-sm font-medium">상위 거래처 매출 비중</p>
                    {selected.topCustomers.slice(0, 5).map((c, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="truncate max-w-[180px]">{c.name}</span>
                          <span className="font-medium ml-2">{formatPercent((c.share > 1 ? c.share : c.share * 100))}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(c.share * 100, 100)}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-64 md:h-80">
                {customerPieData.length > 0 ? (
                  <ChartContainer height="h-64 md:h-80">
                    <PieChart>
                      <Pie data={customerPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} label={({ name, value }: any) => `${name} ${value}%`} labelLine={{ strokeWidth: 1 }}>
                        {customerPieData.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
                      </Pie>
                      <RechartsTooltip {...TOOLTIP_STYLE} formatter={(value: any, name: any, props: any) => { const amt = props.payload?.amount; return amt ? [`${value}% (${formatCurrency(amt, true)})`, name] : [`${value}%`, name]; }} />
                    </PieChart>
                  </ChartContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">거래처 데이터 없음</div>
                )}
              </div>
            </div>
          </ChartCard>
        </>
      )}
    </>
  );
}
