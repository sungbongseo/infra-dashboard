import { ChartCard } from "@/components/dashboard/ChartCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  PieChart, Pie,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_RIGHT, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { AlertTriangle, ShieldCheck, Info } from "lucide-react";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { SalesRepProfile } from "@/lib/analysis/profiling";

const safe = (v: number, d = 1) => isFinite(v) ? v.toFixed(d) : "0";

interface RankingTabProps {
  selected: SalesRepProfile | undefined;
  rankingData: Array<{ name: string; score: number; isSelected: boolean }>;
  customerPieData: Array<{ name: string; value: number; amount: number; fill: string }>;
  isDateFiltered?: boolean;
  rankFormulaText: string;
}

export function RankingTab({ selected: rawSelected, rankingData, customerPieData, rankFormulaText, isDateFiltered }: RankingTabProps) {
  // HHI 관련 필드 안전 기본값 보장 (undefined/null 방어)
  const selected = rawSelected ? {
    ...rawSelected,
    hhi: rawSelected.hhi ?? 0,
    hhiRiskLevel: rawSelected.hhiRiskLevel ?? "low" as const,
    topCustomerShare: rawSelected.topCustomerShare ?? 0,
    topCustomers: rawSelected.topCustomers ?? [],
    customerCount: rawSelected.customerCount ?? 0,
    itemCount: rawSelected.itemCount ?? 0,
  } : undefined;

  if (rankingData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-lg font-medium">데이터가 없습니다</p>
        <p className="text-sm mt-1">영업사원 순위 데이터가 없습니다</p>
      </div>
    );
  }

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
            <KpiCard
              title="활성 거래처 수"
              value={selected.customerCount}
              format="number"
              formula="매출이 발생한 고유 거래처 수 집계"
              description="해당 영업사원이 매출을 발생시킨 거래처의 수입니다."
              benchmark="거래처 수가 팀 평균의 1.5배 이상이면 관리 부하 점검 필요"
              reason="거래처 수를 파악하여 적정 관리 범위인지 판단하고, 과부하 시 재배분을 검토합니다."
            />
            <KpiCard
              title="취급 품목 수"
              value={selected.itemCount}
              format="number"
              formula="해당 영업사원이 매출을 발생시킨 고유 품목 수"
              description="영업사원이 판매한 고유 품목의 수입니다. 다양한 품목을 취급할수록 전문성이 넓습니다."
              benchmark="10종 이상이면 다품목 전문, 5종 이하이면 특화형 영업"
              reason="품목 다양성을 파악하여 크로스셀링 역량을 평가하고, 교육 필요 품목을 파악합니다."
            />
            <KpiCard
              title="공헌이익율"
              value={selected.contributionMarginRate}
              format="percent"
              formula="공헌이익율 = (매출액 - 변동비) ÷ 매출액 × 100"
              description="매출에서 변동비를 차감한 비율로, 고정비 회수 및 이익 기여도를 나타냅니다."
              benchmark="40% 이상 우수, 20~40% 보통, 20% 미만 개선 필요"
              reason="영업사원의 수익 기여도를 측정하여 고수익 영업 패턴을 파악하고 조직에 확산합니다."
            />
          </div>

          <ChartCard dataSourceType="snapshot" isDateFiltered={isDateFiltered}
            title="거래처 집중도 - HHI(허핀달-허쉬만 지수)"
            formula="HHI = Σ(거래처 매출 비중²) × 10,000\n거래처 매출 비중 = 거래처 매출 ÷ 담당자 총 매출"
            description="HHI(허핀달-허쉬만 지수)는 매출이 특정 거래처에 얼마나 집중되어 있는지 측정합니다. 0에 가까우면 여러 거래처에 매출이 고르게 분산된 안정적인 상태이고, 10,000에 가까우면 소수 거래처에 의존도가 높아 리스크가 큽니다."
            benchmark="HHI 2,500 초과 = 고위험(과점), 1,500~2,500 = 적정 집중, 1,500 미만 = 분산(안정)"
            reason="거래처 집중도를 측정하여 특정 거래처 이탈 시 매출 급감 리스크를 사전에 파악하고, 거래처 다변화 전략을 수립합니다."
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">HHI 지수</p>
                    <p className="text-3xl font-bold">{safe(selected.hhi, 0)}</p>
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

                {/* HHI 자연어 해석 인사이트 */}
                {selected.hhiRiskLevel === "high" && (selected.topCustomers?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 space-y-1.5">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      매출 집중 리스크
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400/80">
                      <strong>{selected.topCustomers[0].name}</strong>에 매출의 <strong>{formatPercent(selected.topCustomers[0].share * 100)}</strong>가 집중되어 있습니다.
                      이 거래처가 이탈하면 매출이 <strong>{formatCurrency(selected.topCustomers[0].amount)}</strong> 감소합니다.
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/60">
                      → 신규 거래처 발굴 또는 2~3위 거래처 매출 확대가 필요합니다.
                    </p>
                  </div>
                )}
                {selected.hhiRiskLevel === "medium" && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      거래처 분산이 적정 수준입니다. 상위 거래처 의존도를 지속 모니터링하세요.
                    </p>
                  </div>
                )}
                {selected.hhiRiskLevel === "low" && (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      거래처가 고르게 분산되어 안정적인 포트폴리오입니다.
                    </p>
                  </div>
                )}

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">최대 거래처 비중</span>
                    <span className="font-medium">{formatPercent(selected.topCustomerShare * 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">활성 거래처 수</span>
                    <span className="font-medium">{selected.customerCount}개</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0 (분산)</span>
                    <span>10,000 (독점)</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
                    <div className="absolute inset-y-0 left-0 bg-emerald-200 dark:bg-emerald-900" style={{ width: "15%" }} />
                    <div className="absolute inset-y-0 bg-amber-200 dark:bg-amber-900" style={{ left: "15%", width: "10%" }} />
                    <div className="absolute inset-y-0 bg-red-200 dark:bg-red-900" style={{ left: "25%", width: "75%" }} />
                    <div className="absolute inset-y-0 w-1 bg-foreground rounded-full" style={{ left: `${Math.min(selected.hhi / 100, 100)}%` }} />
                  </div>
                  <div className="flex text-[10px] text-muted-foreground">
                    <span className="flex-1">분산</span>
                    <span className="flex-1 text-center">적정</span>
                    <span className="flex-1 text-right">과점</span>
                  </div>
                </div>
                {/* 2-2: HHI 리스크별 액션 아이템 */}
                <div className="rounded-lg border border-muted bg-muted/30 p-3 mt-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">권장 액션</p>
                  {selected.hhiRiskLevel === "high" && (
                    <p className="text-xs">Top 거래처 의존도가 매우 높습니다. <strong>신규 거래처 개발</strong>과 <strong>매출 분산</strong>이 시급합니다. 2~3위 거래처 매출 확대를 우선 추진하세요.</p>
                  )}
                  {selected.hhiRiskLevel === "medium" && (
                    <p className="text-xs">적정 수준이나 <strong>Top1 거래처 비중을 지속 모니터링</strong>하세요. 신규 거래처를 점진적으로 확보하면 더욱 안정적입니다.</p>
                  )}
                  {selected.hhiRiskLevel === "low" && (
                    <p className="text-xs">거래처 포트폴리오가 <strong>안정적으로 분산</strong>되어 있습니다. 현재 전략을 유지하면서 주요 거래처 관계 강화에 집중하세요.</p>
                  )}
                </div>

                {(selected.topCustomers?.length ?? 0) > 0 && (
                  <div className="space-y-2 mt-2">
                    <p className="text-sm font-medium">상위 거래처 매출 비중</p>
                    {(selected.topCustomers ?? []).slice(0, 5).map((c, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="truncate max-w-[180px]">{c.name}</span>
                          <span className="font-medium ml-2">{formatPercent(c.share * 100)}</span>
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
                      <Pie
                        data={customerPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={100}
                        label={({ name, value }: any) => Number(value) >= 5 ? `${name} ${value}%` : ""}
                        labelLine={({ payload }: any) => Number(payload?.value) >= 5 ? { strokeWidth: 1 } as any : { strokeWidth: 0 } as any}
                      >
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
