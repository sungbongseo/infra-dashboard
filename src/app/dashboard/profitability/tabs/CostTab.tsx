import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { formatCurrency, formatPercent, CHART_COLORS, TOOLTIP_STYLE } from "@/lib/utils";
import type { CostProfileType } from "@/lib/analysis/kpi";

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

const PROFILE_COLORS: Record<CostProfileType, string> = {
  자체생산형: CHART_COLORS[0],
  구매직납형: CHART_COLORS[2],
  외주의존형: CHART_COLORS[3],
  혼합형: CHART_COLORS[5],
};

const COST_KEYS = ["원재료비", "상품매입", "외주가공비", "운반비", "지급수수료", "노무비", "기타변동비", "고정비"] as const;

interface CostTabProps {
  costBarData: Array<Record<string, any>>;
  profileDist: Array<{ name: string; value: number; fill: string }>;
  costEfficiency: Array<{
    id: string;
    org: string;
    매출액: number;
    원재료비율: number;
    상품매입비율: number;
    외주비율: number;
    profileType: CostProfileType;
    orgAvg: { 원재료비율: number; 상품매입비율: number; 외주비율: number };
  }>;
}

export function CostTab({ costBarData, profileDist, costEfficiency }: CostTabProps) {
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Stacked Bar Chart */}
        <ChartCard
          title="담당자별 비용 구성"
          formula="비용 구성 = 원재료비 + 상품매입 + 외주가공비 + 운반비 + 지급수수료 + 노무비 + 기타변동비 + 고정비"
          description="각 담당자의 매출을 만들기 위해 들어간 비용을 8가지 항목으로 나누어 쌓아 보여줍니다. 어떤 비용이 가장 큰 비중을 차지하는지, 담당자별로 비용 구조가 어떻게 다른지 한눈에 비교할 수 있습니다."
          benchmark="원재료비 비중 30% 이상이면 자체생산형, 상품매입 30% 이상이면 구매직납형 비용 구조"
          className="xl:col-span-2"
        >
          <div className="h-80 md:h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costBarData} layout="vertical" margin={{ left: 75 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* Profile Distribution Pie */}
        <ChartCard
          title="프로파일 유형 분포"
          formula="원재료비율 30% 이상: 자체생산형, 상품매입 30% 이상: 구매직납형, 외주비율 20% 이상: 외주의존형, 그 외: 혼합형"
          description="각 담당자의 비용 구조를 분석하여 4가지 유형으로 자동 분류한 결과입니다. 자체생산형은 원재료를 직접 가공하는 유형, 구매직납형은 완제품을 사서 파는 유형, 외주의존형은 외부 업체에 가공을 맡기는 유형입니다. 비용 유형별로 원가 절감 전략이 다릅니다."
          benchmark="자체생산형은 원재료 단가 관리가, 구매직납형은 매입처 협상이, 외주의존형은 외주비 효율화가 핵심입니다"
        >
          <div className="h-56 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={profileDist}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, value }) => `${name} (${value})`}
                >
                  {profileDist.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Cost Efficiency Table */}
      <ChartCard
        title="비용 효율성 비교"
        formula="비용 비율(%) = 해당 비용 ÷ 매출액 × 100"
        description="각 담당자의 원재료비율, 상품매입비율, 외주비율을 소속 조직의 평균값과 나란히 비교하는 표입니다. 조직 평균보다 크게 높은 항목(빨간색 표시)은 비용 절감이 필요한 영역이며, 원인 분석과 개선 조치가 필요합니다."
        benchmark="조직 평균 대비 5%p(퍼센트포인트) 이상 높으면 주의가 필요합니다"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium">담당자</th>
                <th className="text-left p-2 font-medium">조직</th>
                <th className="text-left p-2 font-medium">프로파일</th>
                <th className="text-right p-2 font-medium">매출액</th>
                <th className="text-right p-2 font-medium">원재료비율</th>
                <th className="text-right p-2 font-medium">조직평균</th>
                <th className="text-right p-2 font-medium">상품매입비율</th>
                <th className="text-right p-2 font-medium">조직평균</th>
                <th className="text-right p-2 font-medium">외주비율</th>
                <th className="text-right p-2 font-medium">조직평균</th>
              </tr>
            </thead>
            <tbody>
              {costEfficiency.map((r, i) => (
                <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-2 font-mono text-xs">{r.id ? `${(r.org || "").trim()}_${r.id}`.substring(0, 15) : (r.org || "").substring(0, 15)}</td>
                  <td className="p-2 text-xs">{r.org}</td>
                  <td className="p-2">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: PROFILE_COLORS[r.profileType] }}
                    >
                      {r.profileType}
                    </span>
                  </td>
                  <td className="p-2 text-right font-mono text-xs">{formatCurrency(r.매출액, true)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </>
  );
}
