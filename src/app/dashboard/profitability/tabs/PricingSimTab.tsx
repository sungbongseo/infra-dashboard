"use client";

import { useMemo, useState } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { DataTable } from "@/components/dashboard/DataTable";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, Legend,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, BAR_RADIUS_RIGHT, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { TrendingUp, AlertTriangle, DollarSign, Percent, BarChart3, Users } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed, RISK_COLORS } from "@/lib/utils";
import {
  calcPricingSimulation,
  calcPricingSummary,
  calcCategoryPricing,
  calcCustomerPricingImpact,
  PRESET_SCENARIOS,
  DEFAULT_COST_RATES,
  type CostBucketRates,
  type PricingSimItem,
  type CustomerPricingImpact,
} from "@/lib/analysis/pricingSimulation";
import type { ItemCostDetailRecord } from "@/types/itemCost";
import type { ProfitabilityAnalysisRecord } from "@/types";
import type { CostBucketKey } from "@/types/itemCost";
import type { ColumnDef } from "@tanstack/react-table";

interface PricingSimTabProps {
  filteredItemCostDetail: ItemCostDetailRecord[];
  filteredProfAnalysis?: ProfitabilityAnalysisRecord[];
  categoryMap?: Map<string, string>;
  isDateFiltered?: boolean;
}

const BUCKET_LABELS: Record<CostBucketKey, string> = {
  재료비: "원재료/부재료", 상품매입비: "상품매입", 인건비: "인건비",
  설비비: "설비/에너지", 외주비: "외주가공", 물류비: "운반/물류", 일반경비: "일반경비",
};

const BUCKET_KEYS: CostBucketKey[] = ["재료비", "상품매입비", "인건비", "설비비", "외주비", "물류비", "일반경비"];

export function PricingSimTab({
  filteredItemCostDetail, filteredProfAnalysis, categoryMap, isDateFiltered,
}: PricingSimTabProps) {
  const [rates, setRates] = useState<CostBucketRates>({ ...DEFAULT_COST_RATES });
  const [activeView, setActiveView] = useState<"item" | "customer">("item");

  const updateRate = (key: CostBucketKey, value: number) =>
    setRates((prev) => ({ ...prev, [key]: value }));

  const applyPreset = (preset: CostBucketRates) => setRates({ ...preset });

  // 품목별 시뮬레이션
  const simItems = useMemo(
    () => calcPricingSimulation(filteredItemCostDetail, rates),
    [filteredItemCostDetail, rates]
  );
  const summary = useMemo(() => calcPricingSummary(simItems), [simItems]);
  const catPricing = useMemo(
    () => calcCategoryPricing(simItems, categoryMap),
    [simItems, categoryMap]
  );

  // 품목별 버킷 맵 (거래처 분석용)
  const itemBucketMap = useMemo(() => {
    const map = new Map<string, Record<CostBucketKey, number>>();
    for (const it of simItems) {
      map.set(it.품목, it.bucketAmounts);
    }
    return map;
  }, [simItems]);

  // 거래처별 영향 분석
  const customerImpact = useMemo(
    () => filteredProfAnalysis && filteredProfAnalysis.length > 0
      ? calcCustomerPricingImpact(filteredProfAnalysis, rates, itemBucketMap)
      : [],
    [filteredProfAnalysis, rates, itemBucketMap]
  );

  if (filteredItemCostDetail.length === 0) {
    return <EmptyState requiredFiles={["501.품목별매출원가상세"]} />;
  }

  // 차트 데이터
  const catChartData = catPricing.slice(0, 12).map((c) => ({
    name: truncateLabel(c.category, 10),
    fullName: c.category,
    필요인상률: Number(c.avgPriceIncrease.toFixed(1)),
    품목수: c.itemCount,
  }));

  const custChartData = customerImpact.slice(0, 10).map((c) => ({
    name: truncateLabel(c.customer, 8),
    fullName: c.customer,
    필요인상률: Number(c.avgPriceIncrease.toFixed(1)),
    인상영향액: c.totalPriceImpact,
  }));

  // 테이블 컬럼
  const itemColumns: ColumnDef<PricingSimItem, any>[] = [
    { accessorKey: "품목", header: "품목", size: 120,
      cell: ({ getValue }: any) => <span className="text-xs font-medium">{truncateLabel(String(getValue()), 15)}</span> },
    { accessorKey: "조직", header: "조직", size: 80 },
    { accessorKey: "currentSales", header: "매출액",
      cell: ({ getValue }: any) => <span className="text-xs">{formatCurrency(getValue() as number)}</span> },
    { accessorKey: "currentMargin", header: "현재마진(%)",
      cell: ({ getValue }: any) => {
        const v = getValue() as number;
        return <span className={`text-xs ${v >= 20 ? "text-green-600" : v >= 10 ? "text-amber-600" : "text-red-600"}`}>{safeFixed(v, 1)}%</span>;
      }},
    { id: "materialShare", header: "재료비 비중(%)",
      cell: ({ row }: any) => <span className="text-xs">{safeFixed(row.original.bucketShares["재료비"], 1)}%</span> },
    { id: "priceIncrease", header: "필요 인상률(%)",
      cell: ({ row }: any) => {
        const v = row.original.scenario.priceIncrease;
        return <span className={`text-xs font-semibold ${v > 10 ? "text-red-600" : v > 5 ? "text-amber-600" : "text-green-600"}`}>+{safeFixed(v, 1)}%</span>;
      }},
    { id: "marginIfNo", header: "미인상 마진(%)",
      cell: ({ row }: any) => {
        const v = row.original.scenario.marginIfNoIncrease;
        return <span className={`text-xs ${v < 0 ? "text-red-600 font-bold" : v < 10 ? "text-amber-600" : ""}`}>{safeFixed(v, 1)}%</span>;
      }},
    { id: "profitImpact", header: "이익 감소",
      cell: ({ row }: any) => <span className="text-xs text-red-600">{formatCurrency(row.original.scenario.profitImpact)}</span> },
  ];

  const custColumns: ColumnDef<CustomerPricingImpact, any>[] = [
    { accessorKey: "customer", header: "거래처", size: 120 },
    { accessorKey: "org", header: "조직", size: 80 },
    { accessorKey: "itemCount", header: "품목수" },
    { accessorKey: "totalSales", header: "매출액",
      cell: ({ getValue }: any) => formatCurrency(getValue() as number) },
    { accessorKey: "avgPriceIncrease", header: "필요 인상률(%)",
      cell: ({ getValue }: any) => {
        const v = getValue() as number;
        return <span className={`font-semibold ${v > 10 ? "text-red-600" : v > 5 ? "text-amber-600" : "text-green-600"}`}>+{safeFixed(v, 1)}%</span>;
      }},
    { accessorKey: "totalPriceImpact", header: "인상 시 매출증가",
      cell: ({ getValue }: any) => <span className="text-emerald-600">{formatCurrency(getValue() as number)}</span> },
    { accessorKey: "avgMargin", header: "현재마진(%)",
      cell: ({ getValue }: any) => `${safeFixed(getValue() as number, 1)}%` },
  ];

  return (
    <div className="space-y-6">
      {/* 원가 항목별 슬라이더 */}
      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> 원가 항목별 상승률 설정
          </h3>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_SCENARIOS.map((p) => (
              <button
                key={p.name}
                onClick={() => applyPreset(p.rates)}
                className="px-2 py-1 rounded text-[10px] font-medium border hover:bg-muted transition-colors"
              >
                {p.icon} {p.name}
              </button>
            ))}
            <button onClick={() => setRates({ ...DEFAULT_COST_RATES })} className="px-2 py-1 rounded text-[10px] text-muted-foreground border hover:bg-muted">초기화</button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BUCKET_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-xs min-w-[75px]">{BUCKET_LABELS[key]}</span>
              <input
                type="range" min={0} max={100} step={1}
                value={rates[key]}
                onChange={(e) => updateRate(key, Number(e.target.value))}
                className="flex-1 accent-primary h-1.5"
              />
              <span className="text-xs font-semibold tabular-nums w-10 text-right">+{rates[key]}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="가중평균 필요 인상률"
          value={summary.avgPriceIncrease}
          format="percent"
          icon={<Percent className="h-5 w-5" />}
          description={`전체 ${summary.totalItems}개 품목의 매출 가중평균 필요 단가 인상률입니다. 최대 인상률은 ${safeFixed(summary.maxPriceIncrease, 1)}%입니다.`}
          formula="① 품목별 신규원가 = 기존원가 + Σ(원가항목 × 상승률). ② 필요매출 = 신규원가 ÷ (1 - 현재마진율). ③ 인상률 = (필요매출 - 현재매출) ÷ 현재매출 × 100. ④ 가중평균 = Σ(품목별 인상률 × 매출비중)"
          benchmark="5% 미만: 소폭 인상으로 흡수 가능 | 5~10%: 거래처 협상 필요 | 10% 초과: 원가 구조 개선 또는 제품 재설계 검토"
          reason="전사 평균 단가 인상 수준을 파악하여 거래처 가격 협상의 기준선을 설정합니다. 매출 규모가 큰 품목의 인상률이 더 많이 반영됩니다."
        />
        <KpiCard
          title="미인상 시 이익 감소"
          value={summary.totalProfitLoss}
          format="currency"
          icon={<DollarSign className="h-5 w-5" />}
          description="현재 판매단가를 유지한 채 원가만 상승할 경우 발생하는 총 매출총이익 감소액입니다."
          formula="이익 감소 = -Σ(품목별 원가 증가액). 원가 증가액 = 원재료비 × 상승률 + 상품매입비 × 상승률 + ... (7개 버킷 각각)"
          benchmark="현재 영업이익 대비 30% 이상 감소하면 즉각 가격 인상 대응 필요. 50% 이상이면 사업 존속 리스크."
          reason="단가를 올리지 않고 원가만 상승하면 얼마나 이익이 줄어드는지를 금액으로 보여주어, 가격 인상의 시급성을 판단합니다."
        />
        <KpiCard
          title="고위험 품목 (10%↑)"
          value={summary.highImpactCount}
          format="number"
          icon={<AlertTriangle className="h-5 w-5" />}
          description={`전체 ${summary.totalItems}개 품목 중 ${summary.highImpactCount}개(${summary.totalItems > 0 ? safeFixed(summary.highImpactCount / summary.totalItems * 100, 0) : 0}%)가 10% 이상 인상 필요합니다.`}
          formula="필요 단가 인상률이 10%를 초과하는 품목 수. 마진이 낮거나 원재료비 비중이 높은 품목일수록 인상률이 큽니다."
          benchmark="전체의 20% 이상이 고위험이면 원가 구조 재검토 시급. 저마진+고원재료비 품목은 대체 원재료 또는 공정 개선 검토."
          reason="인상 부담이 가장 큰 품목을 식별하여 우선 대응 대상을 선정합니다. 이 품목들부터 거래처 가격 협상을 시작하세요."
        />
        <KpiCard
          title="재료비 비중"
          value={summary.avgMaterialShare}
          format="percent"
          icon={<BarChart3 className="h-5 w-5" />}
          description="전체 매출원가에서 원재료비+부재료비가 차지하는 비중입니다. 이 비중이 높을수록 원자재 가격 변동에 민감합니다."
          formula="재료비 비중 = (원재료비 + 부재료비) ÷ 총 매출원가 × 100. 상품매입비, 인건비, 외주비 등은 별도 버킷."
          benchmark="50% 이상: 원자재 시세 직접 노출 (구매 헤지 필요) | 30~50%: 중간 노출 | 30% 미만: 가공비 중심 구조"
          reason="원자재 가격 변동에 대한 사업 구조적 노출도를 파악합니다. 재료비 비중이 높으면 구매 전략(장기 계약, 대체 원료)이 중요합니다."
        />
      </div>

      {/* 뷰 전환 */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView("item")}
          className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${activeView === "item" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          <BarChart3 className="inline h-3 w-3 mr-1" />품목별 분석
        </button>
        <button
          onClick={() => setActiveView("customer")}
          className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${activeView === "customer" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          <Users className="inline h-3 w-3 mr-1" />거래처별 영향
        </button>
      </div>

      {activeView === "item" && (
        <>
          {/* 대분류별 필요 인상률 */}
          {catChartData.length > 0 && (
            <ChartCard
              title="대분류별 평균 필요 단가 인상률"
              formula="대분류 내 품목의 매출 가중평균 필요 인상률"
              description="제품군별로 가격 인상 부담이 어디에 집중되는지 파악합니다."
            >
              <ChartContainer height="h-64 md:h-80">
                <BarChart data={catChartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: any, name: any) => name === "필요인상률" ? `${Number(v).toFixed(1)}%` : `${v}건`}
                    labelFormatter={(label: any) => {
                      const item = catChartData.find(c => c.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Bar dataKey="필요인상률" name="필요인상률" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
                    {catChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.필요인상률 > 10 ? RISK_COLORS.high : entry.필요인상률 > 5 ? RISK_COLORS.medium : RISK_COLORS.low} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartCard>
          )}

          {/* 품목별 상세 테이블 */}
          <ChartCard
            title="품목별 단가 인상 시뮬레이션"
            isEmpty={simItems.length === 0}
            formula="필요인상률 = (마진유지필요매출 - 현재매출) / 현재매출 × 100"
            description="각 품목의 원가 구조를 반영하여 현재 마진율을 유지하기 위한 최소 단가 인상률을 산출합니다."
          >
            <DataTable columns={itemColumns} data={simItems}  />
          </ChartCard>
        </>
      )}

      {activeView === "customer" && (
        <>
          {/* 거래처별 인상 영향 차트 */}
          {custChartData.length > 0 && (
            <ChartCard
              title="거래처별 필요 단가 인상률 (Top 10)"
              formula="거래처 내 품목 가중평균 필요 인상률"
              description="어떤 거래처에 얼마나 가격 인상을 요청해야 하는지 보여줍니다."
            >
              <ChartContainer height="h-64 md:h-80">
                <BarChart data={custChartData} layout="vertical" margin={{ left: 70 }}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={65} />
                  <RechartsTooltip
                    {...TOOLTIP_STYLE}
                    formatter={(v: any, name: any) => name === "필요인상률" ? `${Number(v).toFixed(1)}%` : formatCurrency(Number(v))}
                    labelFormatter={(label: any) => {
                      const item = custChartData.find(c => c.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Bar dataKey="필요인상률" name="필요인상률" radius={BAR_RADIUS_RIGHT} {...ANIMATION_CONFIG}>
                    {custChartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.필요인상률 > 10 ? RISK_COLORS.high : entry.필요인상률 > 5 ? RISK_COLORS.medium : RISK_COLORS.low} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </ChartCard>
          )}

          {/* 거래처별 상세 테이블 */}
          {customerImpact.length > 0 ? (
            <ChartCard
              title="거래처별 단가 인상 영향 분석"
              formula="거래처 내 품목 원가 구조 기반 가중평균 인상률"
              description="거래처별로 가격 인상 협상에 필요한 정보를 제공합니다."
            >
              <DataTable columns={custColumns} data={customerImpact}  />
            </ChartCard>
          ) : (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 p-3 text-xs text-amber-800 dark:text-amber-300">
              거래처별 분석에는 수익성분석(901) 데이터가 필요합니다. 해당 파일을 업로드하면 거래처별 인상 영향을 분석할 수 있습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
