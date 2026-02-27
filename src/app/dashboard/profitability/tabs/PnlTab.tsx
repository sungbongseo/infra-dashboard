import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ErrorBoundary } from "@/components/dashboard/ErrorBoundary";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ACTIVE_BAR, ANIMATION_CONFIG } from "@/components/charts";
import { TrendingUp, Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface PnlTabProps {
  totalGP: number;
  gpRate: number;
  opRate: number;
  totalContrib: number;
  waterfallData: Array<{
    name: string;
    base: number;
    value: number;
    fill: string;
    type: "start" | "decrease" | "subtotal";
  }>;
  isDateFiltered?: boolean;
}

export function PnlTab({ totalGP, gpRate, opRate, totalContrib, waterfallData, isDateFiltered }: PnlTabProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="매출총이익"
          value={totalGP}
          format="currency"
          icon={<TrendingUp className="h-5 w-5" />}
          formula="매출총이익 = 매출액 - 매출원가"
          description="매출에서 제품을 만들거나 구매하는 데 든 직접 비용(매출원가)을 뺀 금액입니다. 제품이나 서비스 자체가 얼마나 수익을 내는지 보여주는 가장 기본적인 이익 지표입니다."
          benchmark="제조업 평균 매출총이익은 매출의 20~30% 수준이며, 30% 이상이면 양호합니다"
          reason="매출총이익 추이를 통해 제품/서비스의 본원적 수익 창출력을 진단하고, 원가 상승 시 선제적 가격·원가 대응 전략을 수립할 수 있습니다"
        />
        <KpiCard
          title="매출총이익율"
          value={gpRate}
          format="percent"
          formula="매출총이익율(%) = 매출총이익 ÷ 매출액 × 100"
          description="매출 100원당 원가를 빼고 남는 이익의 비율입니다. 이 비율이 높을수록 원가 관리를 잘하고 있다는 의미이며, 가격 경쟁력과 원가 효율성을 동시에 보여줍니다."
          benchmark="제조업 평균 20~30%, 30% 이상이면 원가 경쟁력 양호"
          reason="매출총이익율 변화를 지속 모니터링하면 원가 상승이나 가격 하락에 의한 수익성 악화를 조기에 감지하고 대응할 수 있습니다"
        />
        <KpiCard
          title="영업이익율"
          value={opRate}
          format="percent"
          formula="영업이익율(%) = 영업이익 ÷ 매출액 × 100"
          description="매출에서 원가와 판매관리비(인건비, 임차료 등)까지 모두 뺀 후 남는 이익의 비율입니다. 회사의 본업(영업활동)이 실제로 얼마나 돈을 버는지 보여주는 핵심 수익성 지표입니다."
          benchmark="제조업 평균 5~10%, 10% 이상이면 양호한 수익 구조"
          reason="영업이익율은 사업의 지속 가능성을 판단하는 핵심 지표이며, 경쟁사 대비 수익 구조의 건전성을 평가하는 데 필수적입니다"
        />
        <KpiCard
          title="공헌이익"
          value={totalContrib}
          format="currency"
          icon={<Target className="h-5 w-5" />}
          formula="공헌이익 = 매출액 - 변동비"
          description="매출에서 매출량에 비례하여 변하는 비용(변동비)만 뺀 금액입니다. 고정비(임차료, 인건비 등)를 부담하기 전에 각 조직이나 담당자가 회사에 기여하는 이익을 의미합니다. 조직별 성과 비교에 유용합니다."
          benchmark="공헌이익이 양수여야 해당 조직이 고정비 회수에 기여하고 있는 것입니다"
          reason="공헌이익은 고정비 부담 전 각 조직의 실질 기여도를 보여주어, 사업부 간 성과 비교와 자원 배분의 객관적 근거가 됩니다"
        />
      </div>

      <ChartCard
        title="손익 Waterfall"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="매출액 - 매출원가 = 매출총이익, 매출총이익 - 판관비 = 영업이익"
        description="매출에서 비용을 단계별로 차감하여 최종 영업이익이 되기까지의 흐름을 폭포(Waterfall) 형태로 보여줍니다. 각 막대의 감소 폭이 클수록 해당 비용 부담이 큰 것이며, 어느 단계에서 이익이 크게 줄어드는지 한눈에 파악할 수 있습니다."
        benchmark="매출총이익율 30% 이상, 영업이익율 10% 이상이면 양호한 수익 구조"
        reason="매출에서 이익까지의 단계별 흐름을 시각화하여 어떤 비용 항목이 이익을 가장 많이 잠식하는지 파악하고, 원가 절감 우선순위를 결정하는 데 활용합니다"
      >
        <ErrorBoundary>
          <ChartContainer height="h-64 md:h-80">
              <BarChart data={waterfallData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={60} interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                      <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                        <p className="font-semibold mb-1">{d.name}</p>
                        <p>{d.type === "decrease" ? "(-) " : ""}{formatCurrency(d.value)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="base" stackId="waterfall" fill="transparent" activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG} />
                <Bar dataKey="value" stackId="waterfall" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                  {waterfallData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
          </ChartContainer>
        </ErrorBoundary>
      </ChartCard>
    </>
  );
}
