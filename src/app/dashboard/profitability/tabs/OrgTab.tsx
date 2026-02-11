import { ChartCard } from "@/components/dashboard/ChartCard";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
  ReferenceLine, LabelList,
} from "recharts";
import { formatCurrency, formatPercent, CHART_COLORS } from "@/lib/utils";

interface OrgTabProps {
  bubbleData: Array<{
    name: string;
    x: number;
    y: number;
    z: number;
    grossProfit: number;
  }>;
}

export function OrgTab({ bubbleData }: OrgTabProps) {
  return (
    <ChartCard
      title="조직별 수익성 Matrix"
      formula="가로축 = 매출액, 세로축 = 영업이익율, 버블 크기 = 매출총이익"
      description="각 조직의 매출 규모, 이익율, 총이익을 한 차트에서 3가지 차원으로 비교합니다. 오른쪽 위에 위치할수록 매출도 크고 이익율도 높은 핵심 조직입니다. 버블이 클수록 매출총이익이 큰 조직입니다."
      benchmark="오른쪽 위: 핵심 조직(고매출, 고수익) | 왼쪽 위: 틈새 조직(저매출, 고수익) | 오른쪽 아래: 개선 필요(고매출, 저수익)"
    >
      <div className="h-72 md:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="x" name="매출액" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v, true)} />
            <YAxis
              dataKey="y"
              name="영업이익율"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[(min: number) => Math.floor(Math.min(min, 0) - 5), (max: number) => Math.ceil(max + 5)]}
            />
            <ZAxis dataKey="z" range={[50, 400]} />
            <RechartsTooltip
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border rounded-lg p-3 text-sm shadow-md">
                    <p className="font-semibold mb-1">{d.name}</p>
                    <p>매출액: {formatCurrency(d.x)}</p>
                    <p>영업이익율: {formatPercent(d.y)}</p>
                    <p>매출총이익: {formatCurrency(d.grossProfit)}</p>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="hsl(0, 0%, 50%)" strokeDasharray="3 3" strokeWidth={1} label={{ value: "손익분기", position: "left", fontSize: 10, fill: "hsl(0, 0%, 50%)" }} />
            <Scatter data={bubbleData} fill={CHART_COLORS[0]}>
              {bubbleData.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
              <LabelList dataKey="name" position="top" fontSize={10} offset={8} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
