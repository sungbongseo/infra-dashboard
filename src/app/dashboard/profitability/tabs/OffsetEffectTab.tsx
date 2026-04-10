"use client";

import { useMemo, useState, useEffect } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell,
  ComposedChart, Line, ReferenceLine,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { TrendingUp, AlertTriangle, DollarSign, Package, CheckCircle2, XCircle, Info } from "lucide-react";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed, RISK_COLORS } from "@/lib/utils";
import {
  extractManufacturingFixedCost,
  calcCustomerItemCVP,
  calcTotalViewSimulation,
  calcItemPool,
  calcPoolSimulation,
  calcWaterfallSteps,
  verifyIntegrity,
  getAvailablePools,
  type CVPItem,
  type PoolLevel,
  type FixedCostAllocation,
  type ItemPoolCVP,
} from "@/lib/analysis/offsetEffect";
import type { CustomerItemDetailRecord, ItemProfitabilityRecord } from "@/types";

interface OffsetEffectTabProps {
  filteredCustItemDetail: CustomerItemDetailRecord[];
  filteredItemProfitability?: ItemProfitabilityRecord[];
  isDateFiltered?: boolean;
}

const QUADRANT_COLORS = {
  star: "hsl(142, 71%, 45%)",
  cashcow: "hsl(217, 91%, 60%)",
  question: "hsl(45, 93%, 47%)",
  dog: "hsl(0, 84%, 60%)",
};

const QUADRANT_LABELS = {
  star: "Star (고물량·고마진)",
  cashcow: "CashCow (고물량·저마진)",
  question: "Question (저물량·고마진)",
  dog: "Dog (저물량·저마진) 쥐약",
};

export function OffsetEffectTab({
  filteredCustItemDetail,
  filteredItemProfitability,
  isDateFiltered,
}: OffsetEffectTabProps) {
  // 시나리오 상태
  const [targetCustomer, setTargetCustomer] = useState<string | null>(null);
  const [targetItem, setTargetItem] = useState<string | null>(null);
  const [volumeIncreasePct, setVolumeIncreasePct] = useState(0);
  const [priceDecreasePct, setPriceDecreasePct] = useState(0);

  // 풀 설정
  const [poolLevel, setPoolLevel] = useState<PoolLevel>("대분류");
  const [poolName, setPoolName] = useState<string>("");
  const [allocationBasis, setAllocationBasis] = useState<FixedCostAllocation>("revenue");

  // 전사 고정비 (제조 고정비)
  const totalFixedCost = useMemo(
    () => extractManufacturingFixedCost((filteredItemProfitability ?? []) as any),
    [filteredItemProfitability]
  );

  // CVP 계산 (Step 1~3)
  const { items: cvpItems, summary: cvpSummary } = useMemo(
    () => calcCustomerItemCVP(filteredCustItemDetail, totalFixedCost),
    [filteredCustItemDetail, totalFixedCost]
  );

  // 총액 관점 시뮬레이션 (4a)
  const totalSim = useMemo(
    () => calcTotalViewSimulation({
      items: cvpItems,
      totalFixedCost,
      targetCustomer,
      targetItem,
      volumeIncreasePct,
      priceDecreasePct,
    }),
    [cvpItems, totalFixedCost, targetCustomer, targetItem, volumeIncreasePct, priceDecreasePct]
  );

  // 워터폴
  const waterfall = useMemo(() => calcWaterfallSteps(totalSim), [totalSim]);

  // 풀 목록 (4b)
  const availablePools = useMemo(
    () => filteredItemProfitability ? getAvailablePools(filteredItemProfitability, poolLevel) : [],
    [filteredItemProfitability, poolLevel]
  );

  // 풀 이름 자동 초기화
  useEffect(() => {
    if (availablePools.length > 0 && !availablePools.find((p) => p.name === poolName)) {
      setPoolName(availablePools[0].name);
    }
  }, [availablePools, poolName]);

  // 풀 데이터 (4b)
  const { items: poolItems, poolFixedCost } = useMemo(
    () => filteredItemProfitability
      ? calcItemPool(filteredItemProfitability, poolLevel, poolName)
      : { items: [], poolFixedCost: 0 },
    [filteredItemProfitability, poolLevel, poolName]
  );

  // 배분 관점 시뮬레이션 (4b)
  const poolSim = useMemo(
    () => calcPoolSimulation(
      poolItems,
      poolFixedCost,
      targetItem,
      volumeIncreasePct,
      priceDecreasePct,
      allocationBasis,
      poolLevel,
      poolName
    ),
    [poolItems, poolFixedCost, targetItem, volumeIncreasePct, priceDecreasePct, allocationBasis, poolLevel, poolName]
  );

  // 무결성 검증 (Step 5)
  // 주의: 총액 관점은 전체 CVP 범위, 배분 관점은 선택된 풀만 → 대상 품목이 풀 내에 있을 때만 비교 의미 있음
  const integrity = useMemo(
    () => verifyIntegrity(totalSim, poolSim),
    [totalSim, poolSim]
  );

  // 거래처·품목 드롭다운 목록
  const customerList = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number }>();
    for (const it of cvpItems) {
      const prev = map.get(it.customer) || { name: it.customerName, revenue: 0 };
      prev.revenue += it.revenue;
      map.set(it.customer, prev);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50);
  }, [cvpItems]);

  const itemList = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number }>();
    for (const it of cvpItems) {
      const prev = map.get(it.item) || { name: it.itemName, revenue: 0 };
      prev.revenue += it.revenue;
      map.set(it.item, prev);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 100);
  }, [cvpItems]);

  // 파이 차트 데이터 (정상 vs 출혈)
  const healthVsBleeding = useMemo(() => [
    { name: "정상 거래처/품목", value: cvpSummary.healthyCount, fill: "hsl(142, 71%, 45%)" },
    { name: "출혈 거래처/품목", value: cvpSummary.bleedingCount, fill: "hsl(0, 84%, 60%)" },
  ], [cvpSummary]);

  // CVP 그래프 데이터 (수량 기준)
  const cvpChartData = useMemo(() => {
    if (cvpSummary.totalQuantity === 0) return [];
    const maxQty = cvpSummary.totalQuantity * 1.5;
    const steps = 20;
    const stepSize = maxQty / steps;
    const data = [];
    for (let i = 0; i <= steps; i++) {
      const qty = stepSize * i;
      const revenue = qty * cvpSummary.weightedUnitPrice;
      const variable = qty * cvpSummary.weightedUnitVariableCost;
      data.push({
        수량: Math.round(qty),
        고정비: totalFixedCost,
        총원가: totalFixedCost + variable,
        매출액: revenue,
      });
    }
    return data;
  }, [cvpSummary, totalFixedCost]);

  // 산점도 데이터
  const scatterData = useMemo(() => {
    const byQuadrant: Record<string, any[]> = { star: [], cashcow: [], question: [], dog: [] };
    for (const it of cvpItems.slice(0, 500)) {
      byQuadrant[it.quadrant].push({
        x: it.quantity,
        y: it.unitContributionMargin,
        z: Math.max(it.revenue, 1),
        fullName: `${it.customerName} / ${truncateLabel(it.itemName, 20)}`,
        customer: it.customerName,
        item: it.itemName,
        revenue: it.revenue,
        unitCM: it.unitContributionMargin,
      });
    }
    return byQuadrant;
  }, [cvpItems]);

  // Dog 테이블 (Top 20)
  const dogItems = useMemo(
    () => [...cvpItems]
      .filter((it) => it.quadrant === "dog" || it.totalContributionMargin < 0)
      .sort((a, b) => a.totalContributionMargin - b.totalContributionMargin)
      .slice(0, 20),
    [cvpItems]
  );

  // 풀 시뮬레이션 품목별 영향 테이블
  const poolImpactTable = useMemo(() => {
    return poolSim.baseItems.map((base, i) => {
      const sim = poolSim.simulatedItems[i];
      const marginDelta = sim.allocatedOperatingProfit - base.allocatedOperatingProfit;
      return {
        item: base.item,
        itemName: base.itemName,
        isTarget: base.item === targetItem,
        baseQty: base.quantity,
        simQty: sim.quantity,
        baseUnitFC: base.unitAllocatedFixedCost,
        simUnitFC: sim.unitAllocatedFixedCost,
        baseMargin: base.allocatedOperatingProfit,
        simMargin: sim.allocatedOperatingProfit,
        marginDelta,
      };
    }).sort((a, b) => {
      if (a.isTarget) return -1;
      if (b.isTarget) return 1;
      return Math.abs(b.marginDelta) - Math.abs(a.marginDelta);
    }).slice(0, 11); // 대상 + 10개
  }, [poolSim, targetItem]);

  // Guard: 데이터 없음
  if (filteredCustItemDetail.length === 0) {
    return <EmptyState requiredFiles={["100.거래처별품목별손익", "200.품목별수익성분석(회계)"]} />;
  }

  // KPI
  const totalCost = cvpSummary.totalVariableCost + cvpSummary.totalFixedCost;

  return (
    <div className="space-y-6">
      {/* ═══ Section A: Step 1. 현재 상태 진단 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Step 1. 현재 상태 진단</h2>
          <span className="text-xs text-muted-foreground">CFO 관점 KPI + 출혈 거래처 비중</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="총매출" value={cvpSummary.totalRevenue} format="currency"
            icon={<DollarSign className="h-5 w-5" />}
            formula="Σ 거래처×품목 매출액.실적 (100 보고서)"
            description="전체 거래처·품목 매출 합계"
            benchmark="전사 매출 추세와 비교하여 성장 여부 파악"
            reason="CVP 분석의 기준점이 되는 현재 총매출"
          />
          <KpiCard
            title="총원가" value={totalCost} format="currency"
            icon={<Package className="h-5 w-5" />}
            formula="변동비(매출원가) + 제조 고정비(제조고정노무비+감가상각비+기타경비)"
            description={`변동비 ${formatCurrency(cvpSummary.totalVariableCost)} + 고정비 ${formatCurrency(totalFixedCost)}`}
            benchmark="원가율 = 총원가/총매출 × 100"
            reason="고정비와 변동비를 분리하여 CVP 분석 가능한 총원가 집계"
          />
          <KpiCard
            title="영업이익" value={cvpSummary.totalOperatingProfit} format="currency"
            icon={<TrendingUp className="h-5 w-5" />}
            formula="공헌이익 - 고정비 총액 = (매출-변동비) - 제조 고정비"
            description={`공헌이익률 ${safeFixed(cvpSummary.overallContributionMarginRatio * 100, 1)}%`}
            benchmark="양수면 손익분기 초과, 음수면 적자 상태"
            reason="CVP 분석의 핵심 지표 — 가설 검증의 기준선"
          />
          <KpiCard
            title="평균 단위당 원가" value={cvpSummary.avgUnitFixedCost + cvpSummary.weightedUnitVariableCost} format="currency"
            icon={<Info className="h-5 w-5" />}
            formula="(고정비 + 변동비) / 총 수량 = 단위변동비 + 단위고정비"
            description={`단위변동비 ${formatCurrency(cvpSummary.weightedUnitVariableCost)} + 단위고정비 ${formatCurrency(cvpSummary.avgUnitFixedCost)}`}
            benchmark="물량 증가 시 단위고정비가 감소 → 단위원가 개선 여지"
            reason="가설의 핵심: 물량 증가로 단위 고정비가 얼마나 낮아지는지 기준"
          />
        </div>

        <div className="mt-4">
          <ChartCard
            title="정상 vs 출혈 거래처·품목 비중"
            isEmpty={cvpItems.length === 0}
            formula="출혈 = 공헌이익 ≤ 0 (단위공헌이익 마이너스, 팔수록 손해)"
            description={`정상 ${cvpSummary.healthyCount}개 / 출혈 ${cvpSummary.bleedingCount}개 · 출혈 거래처 손실 합 ${formatCurrency(cvpSummary.bleedingContributionLoss)}`}
            benchmark="출혈 비중 20% 초과 시 즉각 가격 협상 또는 거래 재검토 필요"
            reason="저가수주의 현황을 즉시 파악하여 시뮬레이션 대상 식별"
          >
            <ChartContainer height="h-56">
              <PieChart>
                <Pie
                  data={healthVsBleeding}
                  dataKey="value"
                  nameKey="name"
                  cx="50%" cy="50%" outerRadius={80}
                  label={(e: any) => `${e.name} ${e.value}개`}
                  {...ANIMATION_CONFIG}
                >
                  {healthVsBleeding.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <RechartsTooltip {...TOOLTIP_STYLE} />
              </PieChart>
            </ChartContainer>
          </ChartCard>
        </div>
      </div>

      {/* ═══ Section B: Step 2. CVP 분석 그래프 ═══ */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Step 2. CVP 손익분기점 분석</h2>
        <ChartCard
          title="수량 기반 CVP 그래프 (Cost-Volume-Profit)"
          isEmpty={cvpChartData.length === 0}
          formula="매출 = 수량 × 가중평균 단가 | 총원가 = 고정비 + 수량 × 단위변동비 | BEP = 고정비 / 단위공헌이익"
          description={`BEP 수량 ${Math.round(cvpSummary.bepQuantity).toLocaleString()}, BEP 매출 ${formatCurrency(cvpSummary.bepRevenue)}`}
          benchmark="현재 수량이 BEP를 넘으면 수익 구간. BEP 대비 안전한계율 = (현재-BEP)/현재"
          reason="손익분기점을 시각적으로 확인하여 물량 레버리지 여지를 판단"
        >
          <ChartContainer height="h-72">
            <ComposedChart data={cvpChartData}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="수량" tick={{ fontSize: 10 }} tickFormatter={(v) => Math.round(v).toLocaleString()} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                formatter={(v: any) => formatCurrency(Number(v))}
              />
              <Line type="monotone" dataKey="고정비" stroke="hsl(0, 0%, 50%)" strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="총원가" stroke="hsl(0, 84%, 60%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="매출액" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} />
              <ReferenceLine x={Math.round(cvpSummary.bepQuantity)} stroke="hsl(217, 91%, 60%)" strokeDasharray="3 3" label={{ value: "BEP", fontSize: 10, fill: "hsl(217, 91%, 60%)" }} />
              <ReferenceLine x={Math.round(cvpSummary.totalQuantity)} stroke="hsl(45, 93%, 47%)" strokeDasharray="4 4" label={{ value: "현재", fontSize: 10, fill: "hsl(45, 93%, 47%)" }} />
            </ComposedChart>
          </ChartContainer>
        </ChartCard>
      </div>

      {/* ═══ Section C: Step 3. 수익성 산점도 ═══ */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Step 3. 거래처×품목 4사분면 매트릭스</h2>
        <ChartCard
          title="수량 × 단위공헌이익 (버블 = 매출)"
          formula="X축: 수량, Y축: 단위공헌이익, 버블 크기: 매출 기여도 | 중앙값 기준 4사분면 분할"
          description={`Star ${scatterData.star.length} / CashCow ${scatterData.cashcow.length} / Question ${scatterData.question.length} / Dog ${scatterData.dog.length}`}
          benchmark="Dog 사분면(특히 Y축 0 이하) = 쥐약 거래처. 즉각 재검토 대상"
          reason="어떤 거래처·품목이 물량은 있지만 마진이 마이너스인지 즉각 식별"
        >
          <ChartContainer height="h-80">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" dataKey="x" name="수량" tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v.toString()} label={{ value: "수량", position: "bottom", offset: 0, fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="단위공헌이익" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} label={{ value: "단위공헌이익", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <ZAxis type="number" dataKey="z" range={[30, 400]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold">{d.fullName}</p>
                      <p>수량: {d.x.toLocaleString()}</p>
                      <p>매출: {formatCurrency(d.revenue)}</p>
                      <p className={d.unitCM >= 0 ? "text-green-600" : "text-red-600 font-bold"}>
                        단위공헌이익: {formatCurrency(d.unitCM)}
                      </p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(0, 84%, 60%)" strokeDasharray="3 3" strokeWidth={1} label={{ value: "CM=0", position: "right", fontSize: 9, fill: "hsl(0, 84%, 60%)" }} />
              {(["star", "cashcow", "question", "dog"] as const).map((q) => (
                <Scatter key={q} name={QUADRANT_LABELS[q]} data={scatterData[q]} fill={QUADRANT_COLORS[q]} {...ANIMATION_CONFIG} />
              ))}
            </ScatterChart>
          </ChartContainer>
        </ChartCard>

        {/* Dog 테이블 */}
        {dogItems.length > 0 && (
          <ChartCard
            title={`Top 20 쥐약 품목 (출혈 거래)`}
            isEmpty={false}
            formula="공헌이익 오름차순 (손실 큰 순)"
            description="단가 협상 또는 거래 축소 우선 대상"
            benchmark="Top 5는 즉각 조치 필요"
            reason="시뮬레이션 대상 후보를 빠르게 선별"
          >
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto mt-3">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b text-left">
                    <th className="p-2">거래처</th>
                    <th className="p-2">품목</th>
                    <th className="p-2 text-right">수량</th>
                    <th className="p-2 text-right">매출</th>
                    <th className="p-2 text-right">단위공헌이익</th>
                    <th className="p-2 text-right">공헌이익</th>
                    <th className="p-2">사분면</th>
                  </tr>
                </thead>
                <tbody>
                  {dogItems.map((it, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="p-2">{truncateLabel(it.customerName, 12)}</td>
                      <td className="p-2">{truncateLabel(it.itemName, 15)}</td>
                      <td className="p-2 text-right">{it.quantity.toLocaleString()}</td>
                      <td className="p-2 text-right">{formatCurrency(it.revenue)}</td>
                      <td className={`p-2 text-right font-semibold ${it.unitContributionMargin >= 0 ? "text-amber-600" : "text-red-600"}`}>
                        {formatCurrency(it.unitContributionMargin)}
                      </td>
                      <td className="p-2 text-right text-red-600 font-bold">
                        {formatCurrency(it.totalContributionMargin)}
                      </td>
                      <td className="p-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: QUADRANT_COLORS[it.quadrant] + "33", color: QUADRANT_COLORS[it.quadrant] }}>
                          {it.quadrant.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </div>

      {/* ═══ Section D: Step 4a. 전사 영업이익 시뮬레이션 (총액 관점) ═══ */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Step 4a. 전사 영업이익 시뮬레이션 (총액 관점)</h2>
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 mb-4 flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>수학적으로 정확한 전사 영업이익 변화</strong><br />
            고정비 총액 불변 가정. 물량 증가는 공헌이익 증가로 전사 이익에 기여합니다.
            대수 항등식: newOP − baseOP = 단가인하손실 + 물량증가공헌
          </div>
        </div>

        {/* 컨트롤 카드 */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3 mb-4">
          <h3 className="text-sm font-semibold">시나리오 설정</h3>

          {/* 대상 선택 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs min-w-[70px]">대상 거래처:</span>
              <select
                value={targetCustomer ?? ""}
                onChange={(e) => setTargetCustomer(e.target.value || null)}
                className="flex-1 text-xs border rounded px-2 py-1 bg-background"
              >
                <option value="">전체 거래처</option>
                {customerList.map((c) => (
                  <option key={c.code} value={c.code}>
                    {truncateLabel(c.name, 20)} ({formatCurrency(c.revenue, true)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs min-w-[70px]">대상 품목:</span>
              <select
                value={targetItem ?? ""}
                onChange={(e) => setTargetItem(e.target.value || null)}
                className="flex-1 text-xs border rounded px-2 py-1 bg-background"
              >
                <option value="">전체 품목</option>
                {itemList.map((i) => (
                  <option key={i.code} value={i.code}>
                    {truncateLabel(i.name, 25)} ({formatCurrency(i.revenue, true)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 슬라이더 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs min-w-[90px]">물량 증감:</span>
              <input
                type="range" min={-50} max={100} step={1}
                value={volumeIncreasePct}
                onChange={(e) => setVolumeIncreasePct(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs font-semibold tabular-nums w-12 text-right">{volumeIncreasePct > 0 ? "+" : ""}{volumeIncreasePct}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs min-w-[90px]">단가 인하:</span>
              <input
                type="range" min={-30} max={0} step={1}
                value={priceDecreasePct}
                onChange={(e) => setPriceDecreasePct(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-xs font-semibold tabular-nums w-12 text-right">{priceDecreasePct}%</span>
            </div>
          </div>

          {/* 프리셋 */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { setVolumeIncreasePct(0); setPriceDecreasePct(0); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">초기화</button>
            <button onClick={() => { setVolumeIncreasePct(30); setPriceDecreasePct(-10); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">🎯 적극적 (+30%/-10%)</button>
            <button onClick={() => { setVolumeIncreasePct(50); setPriceDecreasePct(-15); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">⚡ 공격적 (+50%/-15%)</button>
            <button onClick={() => { setVolumeIncreasePct(20); setPriceDecreasePct(-5); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">🛡️ 방어적 (+20%/-5%)</button>
          </div>
        </div>

        {/* 실시간 KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard
            title="기존 영업이익" value={totalSim.baseOperatingProfit} format="currency"
            formula="공헌이익 - 고정비 총액"
            description="시나리오 적용 전 전사 영업이익"
            benchmark="시뮬레이션의 기준선"
            reason="변화 전 영업이익을 명확히 표시"
          />
          <KpiCard
            title="단가 인하 손실" value={totalSim.priceReductionLoss} format="currency"
            formula="Σ(기존수량 × 기존단가 × 인하율)"
            description="대상 품목의 단가 인하로 인한 매출 감소"
            benchmark="이 손실을 물량 증가 공헌이 상쇄해야 가설 성립"
            reason="저가수주의 직접 비용"
          />
          <KpiCard
            title="물량 증가 공헌" value={totalSim.volumeContributionGain} format="currency"
            formula="Σ(추가수량 × 인하후 단위공헌이익)"
            description="대상 품목 물량 증가로 인한 공헌이익 증가"
            benchmark="단가 인하 손실보다 커야 가설 성립"
            reason="박리다매의 실질적 이익"
          />
          <KpiCard
            title="최종 영업이익" value={totalSim.newOperatingProfit}
            previousValue={totalSim.baseOperatingProfit}
            format="currency"
            formula="기존 이익 + 단가 인하 손실 + 물량 증가 공헌"
            description={`순효과 ${totalSim.netOffsetEffect >= 0 ? "+" : ""}${formatCurrency(totalSim.netOffsetEffect)}`}
            benchmark="기존 이익 대비 개선되면 가설 성립"
            reason="시뮬레이션 후 전사 영업이익"
          />
        </div>

        {/* 워터폴 차트 */}
        <ChartCard
          title="상계 효과 워터폴"
          formula="기존 이익 → 단가 인하 손실(-) → 물량 증가 공헌(+) → 최종 이익"
          description="각 스텝의 이익 변동을 시각적으로 추적"
          benchmark="최종 이익이 기존 이익보다 높으면 박리다매 가설 성립"
          reason="저가수주 상계 효과를 한 눈에 검증"
        >
          <ChartContainer height="h-64">
            <BarChart data={waterfall} margin={{ top: 20, right: 20, bottom: 20, left: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md">
                      <p className="font-semibold">{d.name}</p>
                      <p>누적: {formatCurrency(d.cumulative)}</p>
                      <p>변동: {formatCurrency(d.value)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="base" stackId="wf" fill="transparent" />
              <Bar dataKey="value" stackId="wf" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {waterfall.map((w, i) => <Cell key={i} fill={w.fill} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* 가설 검증 메시지 */}
        <div className={`mt-4 rounded-lg border p-4 ${totalSim.hypothesisValid ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300" : "bg-red-50 dark:bg-red-950/30 border-red-300"}`}>
          <div className="flex items-start gap-3">
            {totalSim.hypothesisValid ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-semibold mb-1">
                {totalSim.hypothesisValid
                  ? `✓ 박리다매 가설 성립 — 상계 효과 +${formatCurrency(totalSim.netOffsetEffect)}`
                  : `✗ 박리다매 가설 반증 — 상계 효과 ${formatCurrency(totalSim.netOffsetEffect)}`
                }
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {totalSim.hypothesisValid
                  ? "물량 증가로 인한 공헌이익 증가가 단가 인하 손실을 상쇄하여 전사 영업이익이 개선됩니다. 단, 고정비 총액은 현재 설비 캐파 내 생산을 전제로 불변 가정입니다. 캐파 초과 시 추가 CAPEX가 필요할 수 있습니다."
                  : "물량 증가에도 불구하고 단가 인하 손실이 더 커서 전사 영업이익이 악화됩니다. 저가수주의 단가 인하 폭을 줄이거나, 물량 증가 목표를 더 높여야 합니다."
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section E: Step 4b. 품목별 수익성 영향 (배분 관점) ═══ */}
      {filteredItemProfitability && filteredItemProfitability.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Step 4b. 품목별 수익성 영향 (배분 관점)</h2>
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 mb-4 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>⚠️ 이 섹션은 원가회계 장부상 재배분 표시입니다.</strong><br />
              전사 이익은 Step 4a에서 이미 계산되었으며, 여기서 추가 이익이 발생하는 것은 아닙니다.
              품목 A의 물량 증가 → 풀 재배분 → 품목 B, C의 장부상 단위 고정비 감소. 품목별 수익성 평가 목적으로만 사용하세요.
            </div>
          </div>

          {/* 풀 설정 */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3 mb-4">
            <h3 className="text-sm font-semibold">고정비 풀 설정</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[70px]">풀 수준:</span>
                <select
                  value={poolLevel}
                  onChange={(e) => setPoolLevel(e.target.value as PoolLevel)}
                  className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                >
                  <option value="대분류">대분류</option>
                  <option value="중분류">중분류</option>
                  <option value="품목계정그룹">품목계정그룹</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[70px]">풀 선택:</span>
                <select
                  value={poolName}
                  onChange={(e) => setPoolName(e.target.value)}
                  className="flex-1 text-xs border rounded px-2 py-1 bg-background"
                >
                  {availablePools.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.itemCount}개, {formatCurrency(p.totalRevenue, true)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[70px]">배분 기준:</span>
                <div className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={allocationBasis === "revenue"} onChange={() => setAllocationBasis("revenue")} />
                    매출 비중
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" checked={allocationBasis === "quantity"} onChange={() => setAllocationBasis("quantity")} />
                    수량 비중
                  </label>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              풀 고정비: <span className="font-semibold">{formatCurrency(poolFixedCost)}</span> · 품목 수: {poolItems.length}개
              {targetItem && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  대상: {truncateLabel(itemList.find((i) => i.code === targetItem)?.name || targetItem, 20)}
                </span>
              )}
            </div>
          </div>

          {/* 교차 효과 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <KpiCard
              title="대상 품목 마진 변화" value={poolSim.targetItemMarginDelta} format="currency"
              formula="대상 품목 (시뮬레이션 후 이익 - 기준 이익)"
              description="저가수주 대상 품목 자체의 장부상 마진 변화"
              benchmark="보통 음수 (저가수주이므로)"
              reason="대상 품목이 얼마나 손실을 보는지"
            />
            <KpiCard
              title="다른 품목 마진 개선" value={poolSim.otherItemsMarginDelta} format="currency"
              formula="Σ(다른 품목 시뮬레이션 후 이익 - 기준 이익)"
              description="풀 내 나머지 품목들의 장부상 마진 변화 합"
              benchmark="보통 양수 (고정비 재배분으로 단위 고정비 감소)"
              reason="교차 보조 효과 — 박리다매 가설의 장부상 표현"
            />
            <KpiCard
              title="풀 순 마진 변화" value={poolSim.netPoolMarginDelta} format="currency"
              formula="대상 + 다른 품목 마진 변화 합"
              description={`Step 4a 순효과와 ${integrity.isConsistent ? "일치" : "불일치"}`}
              benchmark="Step 4a netOffsetEffect와 동일해야 함"
              reason="듀얼 뷰 무결성 검증"
            />
          </div>

          {/* 품목별 Before/After 테이블 */}
          {poolImpactTable.length > 0 && (
            <ChartCard
              title="품목별 장부상 영향 (Top 10)"
              isEmpty={false}
              formula="단위 고정비 = 배분 고정비 / 수량 | 마진 = 매출 - 변동비 - 배분 고정비"
              description="대상 품목 + 풀 내 영향 큰 품목"
              benchmark="다른 품목의 단위 고정비 감소가 핵심"
              reason="교차 보조 효과를 품목 단위로 검증"
            >
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto mt-3">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background z-10">
                    <tr className="border-b text-left">
                      <th className="p-2">품목</th>
                      <th className="p-2 text-right">기준 수량</th>
                      <th className="p-2 text-right">시나리오 수량</th>
                      <th className="p-2 text-right">기준 단위고정비</th>
                      <th className="p-2 text-right">시나리오 단위고정비</th>
                      <th className="p-2 text-right">기준 마진</th>
                      <th className="p-2 text-right">시나리오 마진</th>
                      <th className="p-2 text-right">변화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolImpactTable.map((r, i) => (
                      <tr key={i} className={`border-b hover:bg-muted/50 ${r.isTarget ? "bg-blue-50 dark:bg-blue-950/30 font-semibold" : ""}`}>
                        <td className="p-2">
                          {r.isTarget && <span className="mr-1 text-blue-600">🎯</span>}
                          {truncateLabel(r.itemName, 18)}
                        </td>
                        <td className="p-2 text-right">{r.baseQty.toLocaleString()}</td>
                        <td className="p-2 text-right">{r.simQty.toLocaleString()}</td>
                        <td className="p-2 text-right">{formatCurrency(r.baseUnitFC)}</td>
                        <td className={`p-2 text-right ${r.simUnitFC < r.baseUnitFC ? "text-green-600" : r.simUnitFC > r.baseUnitFC ? "text-red-600" : ""}`}>
                          {formatCurrency(r.simUnitFC)}
                        </td>
                        <td className="p-2 text-right">{formatCurrency(r.baseMargin)}</td>
                        <td className="p-2 text-right">{formatCurrency(r.simMargin)}</td>
                        <td className={`p-2 text-right font-semibold ${r.marginDelta >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {r.marginDelta >= 0 ? "+" : ""}{formatCurrency(r.marginDelta)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* ═══ Section F: Step 5. 데이터 무결성 검증 ═══ */}
      {filteredItemProfitability && filteredItemProfitability.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Step 5. 데이터 무결성 검증</h2>
          <div className={`rounded-lg border-l-4 p-4 ${integrity.isConsistent ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500" : "bg-amber-50 dark:bg-amber-950/30 border-amber-500"}`}>
            <div className="flex items-start gap-3">
              {integrity.isConsistent ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              )}
              <div className="text-sm flex-1">
                <p className="font-semibold mb-2">
                  {integrity.isConsistent
                    ? "✓ 무결성 검증 통과 — 두 관점의 합계가 일치합니다"
                    : "⚠️ 무결성 경고 — 두 관점의 합계가 불일치"
                  }
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Step 4a 전사 이익 변화 (총액 관점)</p>
                    <p className="font-semibold text-sm">{formatCurrency(integrity.totalViewDelta)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Step 4b 풀 마진 변화 (배분 관점)</p>
                    <p className="font-semibold text-sm">{formatCurrency(integrity.poolViewDelta)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">차이</p>
                    <p className="font-semibold text-sm">{formatCurrency(integrity.difference)} ({safeFixed(integrity.differencePct, 2)}%)</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {integrity.isConsistent
                    ? "대수적 항등식 targetDelta + othersDelta ≡ netOffsetEffect가 성립합니다. 단, Step 4a는 전체 CVP 범위이고 4b는 선택된 풀만 다루므로, 대상 품목이 풀 내에 있고 풀 밖 품목이 영향 받지 않을 때만 완벽 일치합니다."
                    : "차이가 1% 초과. 원인: (1) 대상 품목이 선택된 풀 밖에 있음 (2) 100 보고서와 200 보고서의 매출/원가 데이터 차이 (3) 배분 로직 버그. 확인이 필요합니다."
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 방법론 요약 */}
      <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">📚 분석 방법론 및 통계적 근거</p>
        <p><strong>데이터 소스</strong>: CustomerItemDetailRecord (100 보고서, 거래처×품목 매출/원가), ItemProfitabilityRecord (200 보고서, 품목별 제조 고정비).</p>
        <p><strong>변동비 정의</strong>: 100 보고서의 매출원가 실적을 변동비로 가정. 제조 고정비는 200 보고서에서 별도 추출.</p>
        <p><strong>고정비 출처</strong>: 제조고정노무비 + 감가상각비 + 기타경비. SGA 고정비는 제외 (CVP 무관).</p>
        <p><strong>핵심 가정</strong>: (1) 고정비 총액 불변 (설비 캐파 내 생산), (2) 변동비 선형 증가, (3) 배분 관점은 장부상 표시 목적.</p>
        <p><strong>대수 항등식</strong>: newOP − baseOP = priceReductionLoss + volumeContributionGain. 이 식은 고정비 총액 불변 가정 하에 수학적으로 정확.</p>
        <p><strong>왜곡 방지</strong>: 총액 관점(4a)과 배분 관점(4b)을 합산하지 않고 별도 섹션으로 제시. 무결성 검증(5)으로 두 관점의 합계 일치성 확인.</p>
      </div>
    </div>
  );
}
