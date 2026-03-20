"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, ACTIVE_BAR } from "@/components/charts";
import { formatCurrency, formatPercent, TOOLTIP_STYLE } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ScatterChart, Scatter, ZAxis,
  Cell, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Search, DollarSign, Percent, Package } from "lucide-react";
import type { SalesRecord } from "@/types";
import {
  buildItemCostMap,
  calcCustomerItemMargin,
  calcCustomerMarginSummary,
} from "@/lib/analysis/customerItemMargin";

interface MarginTabProps {
  filteredSales: SalesRecord[];
  itemCostDetail: any[];
}

const MARGIN_COLORS = {
  high: "#22c55e",    // 30%+
  good: "#3b82f6",    // 15-30%
  low: "#f59e0b",     // 0-15%
  negative: "#ef4444", // <0%
};

function getMarginColor(rate: number): string {
  if (rate >= 30) return MARGIN_COLORS.high;
  if (rate >= 15) return MARGIN_COLORS.good;
  if (rate >= 0) return MARGIN_COLORS.low;
  return MARGIN_COLORS.negative;
}

export function MarginTab({ filteredSales, itemCostDetail }: MarginTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const itemCostMap = useMemo(() => buildItemCostMap(itemCostDetail), [itemCostDetail]);

  const marginData = useMemo(
    () => calcCustomerItemMargin(filteredSales, itemCostMap),
    [filteredSales, itemCostMap]
  );

  const customerSummary = useMemo(
    () => calcCustomerMarginSummary(marginData),
    [marginData]
  );

  // KPIs
  const kpis = useMemo(() => {
    if (marginData.length === 0) return { avgMargin: 0, posCount: 0, negCount: 0, totalMargin: 0, totalAmount: 0, matchedItems: 0, totalItems: itemCostMap.size };
    const totalAmount = marginData.reduce((s, r) => s + r.totalAmount, 0);
    const totalMargin = marginData.reduce((s, r) => s + r.totalMargin, 0);
    const avgMargin = totalAmount > 0 ? (totalMargin / totalAmount) * 100 : 0;
    const posCount = marginData.filter(r => r.marginRate >= 0).length;
    const negCount = marginData.filter(r => r.marginRate < 0).length;
    return { avgMargin, posCount, negCount, totalMargin, totalAmount, matchedItems: marginData.length, totalItems: itemCostMap.size };
  }, [marginData, itemCostMap]);

  // 검색 필터
  const filtered = useMemo(() => {
    let data = selectedCustomer
      ? marginData.filter(r => r.거래처명 === selectedCustomer)
      : marginData;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      data = data.filter(r =>
        r.거래처명.toLowerCase().includes(q) ||
        r.품목명.toLowerCase().includes(q) ||
        r.영업담당자명.toLowerCase().includes(q)
      );
    }
    return data;
  }, [marginData, searchTerm, selectedCustomer]);

  // 거래처별 마진율 차트 (상위 15)
  const customerChartData = useMemo(() => {
    return customerSummary.slice(0, 15).map(c => ({
      name: c.거래처명.length > 12 ? c.거래처명.substring(0, 12) + "…" : c.거래처명,
      fullName: c.거래처명,
      마진율: Number(c.weightedMarginRate.toFixed(1)),
      매출: c.totalAmount,
    }));
  }, [customerSummary]);

  // 마진 분포 (scatter)
  const scatterData = useMemo(() => {
    return marginData.slice(0, 100).map(r => ({
      x: r.totalAmount / 1e4, // 만원 단위
      y: r.marginRate,
      z: r.totalQty,
      name: `${r.거래처명} × ${r.품목명}`,
      color: getMarginColor(r.marginRate),
    }));
  }, [marginData]);

  if (marginData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="font-medium">마진 분석 데이터 없음</p>
        <p className="text-sm mt-1">
          매출리스트와 품목별매출원가(501) 파일을 모두 업로드해야 합니다.
          {itemCostMap.size === 0 && " (501 원가 데이터 없음)"}
          {filteredSales.length === 0 && " (매출리스트 데이터 없음)"}
        </p>
        <p className="text-xs mt-2 text-muted-foreground/70">
          501 파일의 품목 코드와 매출리스트의 품목 코드가 일치해야 매칭됩니다.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="평균 마진율"
          value={kpis.avgMargin}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          formula="가중평균 마진율 = 총 마진금액 ÷ 총 매출금액 × 100 [501 원가 기준]"
          description="품목별매출원가(501) 단위원가 대비 거래처 판매단가의 가중평균 마진율입니다."
        />
        <KpiCard
          title="총 마진금액"
          value={kpis.totalMargin}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          formula="총 마진 = Σ(매출금액 - 단위원가 × 수량)"
          description="원가 매칭이 된 거래처×품목 조합의 마진 합계입니다."
        />
        <KpiCard
          title="양호 마진 (0%+)"
          value={kpis.posCount}
          format="number"
          icon={<TrendingUp className="h-5 w-5" />}
          formula={`전체 ${marginData.length}건 중 마진율 ≥ 0% 건수`}
          description="판매단가가 단위원가 이상인 거래처×품목 조합 수입니다."
        />
        <KpiCard
          title="적자 품목"
          value={kpis.negCount}
          format="number"
          icon={<TrendingDown className="h-5 w-5" />}
          formula={`전체 ${marginData.length}건 중 마진율 < 0% 건수`}
          description="판매단가가 단위원가보다 낮은 적자 거래처×품목 조합입니다. 즉시 검토가 필요합니다."
        />
      </div>

      {/* 원가 매칭 정보 */}
      <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
        <span className="font-medium">원가 기준: 품목별매출원가(501)</span>
        <span className="ml-2">
          매칭 {kpis.matchedItems}건 / 501 품목 {kpis.totalItems}개.
          표준 가격 대신 501의 실적 단위원가(실적매출원가÷매출수량)를 기준 원가로 사용합니다.
          같은 품목이라도 거래처마다 판매단가가 다르므로 마진율이 달라집니다.
        </span>
      </div>

      {/* 검색 + 거래처 필터 */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="거래처명, 품목명, 담당자 검색..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm"
          />
        </div>
        {selectedCustomer && (
          <button
            onClick={() => setSelectedCustomer(null)}
            className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-3 py-1.5 rounded-full flex items-center gap-1"
          >
            {selectedCustomer} ✕
          </button>
        )}
        <span className="text-xs text-muted-foreground">{filtered.length}건 표시</span>
      </div>

      {/* 거래처별 마진율 차트 + Scatter */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="거래처별 가중평균 마진율 (상위 15)" description="거래처 클릭 시 해당 거래처의 품목별 상세를 볼 수 있습니다">
          <ChartContainer height="h-80 md:h-96">
            <BarChart
              data={customerChartData}
              layout="vertical"
              margin={{ left: 10 }}
              onClick={(e: any) => {
                if (e?.activePayload?.[0]?.payload?.fullName) {
                  setSelectedCustomer(e.activePayload[0].payload.fullName);
                }
              }}
            >
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" tickFormatter={(v: any) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [
                  name === "마진율" ? `${v}%` : formatCurrency(v, true),
                  name
                ]}
              />
              <Bar dataKey="마진율" radius={BAR_RADIUS_TOP} activeBar={ACTIVE_BAR} {...ANIMATION_CONFIG}>
                {customerChartData.map((entry, i) => (
                  <Cell key={i} fill={getMarginColor(entry.마진율)} cursor="pointer" />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="매출규모 vs 마진율 분포" description="X축: 매출(만원), Y축: 마진율(%). 크기=수량. 빨간점은 적자">
          <ChartContainer height="h-80 md:h-96">
            <ScatterChart margin={{ bottom: 20 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" dataKey="x" name="매출" tickFormatter={(v: any) => `${(v / 1e4).toFixed(0)}억`} label={{ value: "매출규모", position: "bottom", offset: 0, fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="마진율" tickFormatter={(v: any) => `${v}%`} />
              <ZAxis type="number" dataKey="z" range={[30, 300]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any, name: any) => [
                  name === "매출" ? formatCurrency(Number(v) * 1e4, true) : `${Number(v).toFixed(1)}%`,
                  name
                ]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ""}
              />
              <Scatter data={scatterData} {...ANIMATION_CONFIG}>
                {scatterData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} fillOpacity={0.7} />
                ))}
              </Scatter>
            </ScatterChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* 상세 테이블 */}
      <ChartCard title={selectedCustomer ? `${selectedCustomer} — 품목별 마진 상세` : "거래처×품목 마진 상세"} description="판매단가 대비 501 단위원가 기준 마진율. 행 클릭으로 상세 확인">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium">거래처</th>
                <th className="text-left p-2 font-medium">품목</th>
                <th className="text-left p-2 font-medium">담당자</th>
                <th className="text-right p-2 font-medium">판매단가</th>
                <th className="text-right p-2 font-medium">단위원가</th>
                <th className="text-right p-2 font-medium">단위마진</th>
                <th className="text-right p-2 font-medium">마진율</th>
                <th className="text-right p-2 font-medium">수량</th>
                <th className="text-right p-2 font-medium">매출</th>
                <th className="text-right p-2 font-medium">총 마진</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r, i) => (
                <tr
                  key={i}
                  className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer ${r.marginRate < 0 ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}
                  onClick={() => setSelectedCustomer(r.거래처명)}
                >
                  <td className="p-2 max-w-[140px] truncate" title={r.거래처명}>{r.거래처명}</td>
                  <td className="p-2 max-w-[160px] truncate" title={r.품목명}>{r.품목명}</td>
                  <td className="p-2 text-muted-foreground">{r.영업담당자명 || "-"}</td>
                  <td className="p-2 text-right font-mono">{r.avgSellingPrice.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}</td>
                  <td className="p-2 text-right font-mono text-muted-foreground">{r.unitCost.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}</td>
                  <td className="p-2 text-right font-mono" style={{ color: getMarginColor(r.marginRate) }}>
                    {r.unitMargin.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="p-2 text-right font-semibold" style={{ color: getMarginColor(r.marginRate) }}>
                    {formatPercent(r.marginRate)}
                  </td>
                  <td className="p-2 text-right">{r.totalQty.toLocaleString()}</td>
                  <td className="p-2 text-right font-mono">{formatCurrency(r.totalAmount, true)}</td>
                  <td className="p-2 text-right font-mono" style={{ color: getMarginColor(r.marginRate) }}>
                    {formatCurrency(r.totalMargin, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              전체 {filtered.length}건 중 200건 표시. 검색으로 범위를 좁혀주세요.
            </p>
          )}
        </div>
      </ChartCard>
    </>
  );
}
