import { useMemo } from "react";
import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, ACTIVE_BAR, ANIMATION_CONFIG, BAR_RADIUS_TOP } from "@/components/charts";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";

// ─── 비용 구조 상수 (CostTab 전용) ───
const COST_BAR_COLORS: Record<string, string> = {
  원재료비: "hsl(221.2, 83.2%, 53.3%)",
  상품매입: "hsl(262.1, 83.3%, 57.8%)",
  외주가공비: "hsl(24.6, 95%, 53.1%)",
  운반비: "hsl(188.7, 94.5%, 42.7%)",
  지급수수료: "hsl(43.3, 96.4%, 56.3%)",
  노무비: "hsl(142.1, 76.2%, 36.3%)",
  기타변동비: "hsl(346.8, 77.2%, 49.8%)",
  고정비: "hsl(0, 0%, 55%)",
};

const COST_KEYS = ["원재료비", "상품매입", "외주가공비", "운반비", "지급수수료", "노무비", "기타변동비", "고정비"] as const;

const COST_RATE_BINS = [
  { label: "우수 (<70%)", min: -Infinity, max: 70, fill: "hsl(145, 60%, 42%)" },
  { label: "보통 (70~85%)", min: 70, max: 85, fill: CHART_COLORS[1] },
  { label: "주의 (85~95%)", min: 85, max: 95, fill: "hsl(35, 70%, 50%)" },
  { label: "위험 (≥95%)", min: 95, max: Infinity, fill: "hsl(0, 65%, 55%)" },
];

interface CostTabProps {
  costBarData: Array<Record<string, any>>;
  isDateFiltered?: boolean;
  costEfficiency: Array<{
    id: string;
    org: string;
    매출액: number;
    원재료비율: number;
    상품매입비율: number;
    외주비율: number;
    매출원가율: number;
    orgAvg: { 원재료비율: number; 상품매입비율: number; 외주비율: number };
  }>;
}

export function CostTab({ costBarData, costEfficiency, isDateFiltered }: CostTabProps) {
  // 원가율 분포 히스토그램 데이터
  const costRateHistogram = useMemo(() => {
    return COST_RATE_BINS.map((bin) => {
      const count = costEfficiency.filter((r) => r.매출원가율 >= bin.min && r.매출원가율 < bin.max).length;
      return { name: bin.label, count, fill: bin.fill };
    });
  }, [costEfficiency]);

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Stacked Bar Chart */}
        <ChartCard
          title="담당자별 비용 구성"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="비용 구성 = 원재료비 + 상품매입 + 외주가공비 + 운반비 + 지급수수료 + 노무비 + 기타변동비 + 고정비"
          description="각 담당자의 매출을 만들기 위해 들어간 비용을 8가지 항목으로 나누어 쌓아 보여줍니다. 어떤 비용이 가장 큰 비중을 차지하는지, 담당자별로 비용 구조가 어떻게 다른지 한눈에 비교할 수 있습니다."
          benchmark="원재료비 비중이 높으면 원재료 단가 관리가, 상품매입 비중이 높으면 매입처 협상이, 외주비 비중이 높으면 외주비 효율화가 원가 절감의 핵심"
          reason="담당자별 비용 구조 차이를 비교하여 비효율적인 비용 패턴을 가진 담당자를 식별하고, 원가 절감이 가능한 핵심 비용 항목을 파악합니다"
          className="xl:col-span-2"
        >
          <ChartContainer height="h-80 md:h-[500px]">
              <BarChart data={costBarData} layout="vertical" margin={{ left: 75 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={70} />
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0]?.payload;
                    return (
                      <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                        <p className="font-semibold mb-1">사번: {data?.사번}</p>
                        <p className="text-xs text-muted-foreground mb-2">조직: {data?.조직}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} style={{ color: p.color }}>
                            {p.name}: {formatCurrency(Number(p.value))}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {COST_KEYS.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="cost"
                    fill={COST_BAR_COLORS[key]}
                    name={key}
                    activeBar={ACTIVE_BAR}
                    {...ANIMATION_CONFIG}
                  />
                ))}
              </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 원가율 분포 히스토그램 (NEW-B) */}
        <ChartCard
          title="매출원가율 분포"
          dataSourceType="snapshot"
          isDateFiltered={isDateFiltered}
          formula="매출원가율 = (8개 원가항목 합계) ÷ 매출액 × 100"
          description="담당자별 매출원가율을 4구간으로 나누어 분포를 보여줍니다. 우수(<70%)는 원가 관리가 양호, 보통(70~85%)은 일반적 수준, 주의(85~95%)는 이익 여력 부족, 위험(≥95%)은 손익분기 근접/적자 상태입니다."
          benchmark="매출원가율 70% 미만이면 원가 관리 우수, 85% 초과 시 이익 구조 점검 필요"
          reason="원가율 분포를 통해 조직 내 원가 관리 수준의 편차를 파악하고, 위험 구간에 있는 담당자에 대한 선제적 원가 개선 조치를 취할 수 있습니다"
        >
          <ChartContainer height="h-56 md:h-72">
            <BarChart data={costRateHistogram} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" height={50} interval={0} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, _name: any) => [`${v}명`, "담당자 수"]}
              />
              <Bar dataKey="count" name="담당자 수" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {costRateHistogram.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* Cost Efficiency Table */}
      <ChartCard
        title="비용 효율성 비교"
        dataSourceType="snapshot"
        isDateFiltered={isDateFiltered}
        formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100 | 매출원가율 = 총비용 ÷ 매출액 × 100"
        description="각 담당자의 원재료비율, 상품매입비율, 외주비율, 매출원가율을 소속 조직의 평균값과 나란히 비교하는 표입니다. 조직 평균보다 크게 높은 항목(빨간색 표시)은 비용 절감이 필요한 영역입니다."
        benchmark="조직 평균 대비 5%p(퍼센트포인트) 이상 높으면 주의가 필요합니다"
        reason="조직 평균 대비 개인별 비용 효율을 비교하여 구체적인 원가 절감 대상과 금액을 특정하고, 비용 관리 코칭의 우선순위를 설정합니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium">담당자</th>
                <th className="text-left p-2 font-medium">조직</th>
                <th className="text-right p-2 font-medium">매출액</th>
                <th className="text-right p-2 font-medium">매출원가율</th>
                <th className="text-right p-2 font-medium">원재료비율</th>
                <th className="text-right p-2 font-medium">조직평균</th>
                <th className="text-right p-2 font-medium">상품매입비율</th>
                <th className="text-right p-2 font-medium">조직평균</th>
                <th className="text-right p-2 font-medium">외주비율</th>
                <th className="text-right p-2 font-medium">조직평균</th>
              </tr>
            </thead>
            <tbody>
              {costEfficiency.map((r, i) => {
                const costRateColor = r.매출원가율 >= 95 ? "text-red-600 dark:text-red-400 font-bold"
                  : r.매출원가율 >= 85 ? "text-amber-600 dark:text-amber-400 font-semibold"
                  : r.매출원가율 < 70 ? "text-green-600 dark:text-green-400"
                  : "";
                return (
                  <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-2 font-mono text-xs">{r.id ? `${(r.org || "").trim()}_${r.id}`.substring(0, 15) : (r.org || "").substring(0, 15)}</td>
                    <td className="p-2 text-xs">{r.org}</td>
                    <td className="p-2 text-right font-mono text-xs">{formatCurrency(r.매출액, true)}</td>
                    <td className={`p-2 text-right font-mono text-xs ${costRateColor}`}>
                      {formatPercent(r.매출원가율, 1)}
                    </td>
                    <td className={`p-2 text-right font-mono text-xs ${r.원재료비율 > r.orgAvg.원재료비율 + 5 ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}>
                      {formatPercent(r.원재료비율, 1)}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{formatPercent(r.orgAvg.원재료비율, 1)}</td>
                    <td className={`p-2 text-right font-mono text-xs ${r.상품매입비율 > r.orgAvg.상품매입비율 + 5 ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}>
                      {formatPercent(r.상품매입비율, 1)}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{formatPercent(r.orgAvg.상품매입비율, 1)}</td>
                    <td className={`p-2 text-right font-mono text-xs ${r.외주비율 > r.orgAvg.외주비율 + 5 ? "text-red-500 dark:text-red-400 font-semibold" : ""}`}>
                      {formatPercent(r.외주비율, 1)}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{formatPercent(r.orgAvg.외주비율, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
