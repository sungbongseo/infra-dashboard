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
    // cvpItems(100)와 poolItems(200) 모두에서 수집하여 union
    const map = new Map<string, { name: string; revenue: number; inPool: boolean }>();
    for (const it of cvpItems) {
      const prev = map.get(it.item) || { name: it.itemName, revenue: 0, inPool: false };
      prev.revenue += it.revenue;
      map.set(it.item, prev);
    }
    // 200 품목도 추가 (풀 내 품목이 4a에서 선택 가능하도록)
    for (const pi of poolItems) {
      const prev = map.get(pi.item) || { name: pi.itemName, revenue: 0, inPool: true };
      if (prev.revenue === 0) prev.revenue = pi.revenue; // 100에 없으면 200 매출로 표시
      prev.inPool = true;
      if (!prev.name || prev.name === pi.item) prev.name = pi.itemName;
      map.set(pi.item, prev);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 150);
  }, [cvpItems, poolItems]);

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

  // 풀 시뮬레이션 품목별 영향 테이블 (역할 기반 재구성)
  const poolImpactTable = useMemo(() => {
    const rows = poolSim.baseItems.map((base, i) => {
      const sim = poolSim.simulatedItems[i];
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
        marginDelta: sim.allocatedOperatingProfit - base.allocatedOperatingProfit,
      };
    });
    // 역할 판정: 1% 임계치 (전체 |변화| 합 대비)
    const sumAbs = rows.reduce((s, r) => s + Math.abs(r.marginDelta), 0);
    const neutralThreshold = sumAbs * 0.01;
    type Role = "target" | "beneficiary" | "harmed" | "neutral";
    const withRole = rows.map((r) => {
      const role: Role = r.isTarget
        ? "target"
        : Math.abs(r.marginDelta) < neutralThreshold
          ? "neutral"
          : r.marginDelta > 0
            ? "beneficiary"
            : "harmed";
      return { ...r, role };
    });
    // 막대 스케일 기준: 제품군 내 최대 |마진변화|
    const maxAbsDelta = Math.max(...withRole.map((r) => Math.abs(r.marginDelta)), 1);
    return withRole
      .map((r) => ({ ...r, barPct: (Math.abs(r.marginDelta) / maxAbsDelta) * 100 }))
      .sort((a, b) => {
        if (a.role === "target") return -1;
        if (b.role === "target") return 1;
        const order: Record<Role, number> = { target: 0, beneficiary: 1, harmed: 2, neutral: 3 };
        if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
        return b.marginDelta - a.marginDelta;
      }).slice(0, 11); // 대상 + 10개
  }, [poolSim, targetItem]);

  // P2-1: 액션 가이드 자동 판정
  const actionGuide = useMemo(() => {
    const { targetItemMarginDelta, otherItemsMarginDelta, netPoolMarginDelta } = poolSim;
    // 우선순위: 악화 > 강한 덤 > 미미
    if (netPoolMarginDelta < 0) {
      return {
        level: "harmed" as const,
        icon: "🔴",
        title: "제품군 장부상 마진 악화",
        message: "이 시나리오는 제품군 전체 장부상 마진을 낮춥니다. 단가 인하 폭을 줄이거나 대상 품목을 재검토하세요.",
        borderClass: "border-red-500",
        bgClass: "bg-red-50/60 dark:bg-red-950/20",
        textClass: "text-red-700 dark:text-red-400",
      };
    }
    if (otherItemsMarginDelta > Math.abs(targetItemMarginDelta) * 0.5) {
      // 수혜 top 1 찾기
      const topBeneficiary = poolImpactTable.find((r) => r.role === "beneficiary");
      return {
        level: "strong" as const,
        icon: "🟢",
        title: "강한 덤 효과 발생",
        message: topBeneficiary
          ? `제품군 전체에 유리합니다. 특히 ${truncateLabel(topBeneficiary.itemName, 20)} 담당자와 협업을 고려하세요.`
          : "제품군 전체에 유리합니다. 같은 풀 내 다른 품목 담당자와 협업하세요.",
        borderClass: "border-emerald-500",
        bgClass: "bg-emerald-50/60 dark:bg-emerald-950/20",
        textClass: "text-emerald-700 dark:text-emerald-400",
      };
    }
    return {
      level: "weak" as const,
      icon: "🟡",
      title: "미미한 덤 효과",
      message: "장부상 교차 보조 효과는 제한적입니다. Step 4a(전사 이익) 관점에서만 판단하세요.",
      borderClass: "border-amber-500",
      bgClass: "bg-amber-50/60 dark:bg-amber-950/20",
      textClass: "text-amber-700 dark:text-amber-400",
    };
  }, [poolSim, poolImpactTable]);

  // Guard: 데이터 없음
  if (filteredCustItemDetail.length === 0) {
    return <EmptyState requiredFiles={["100.거래처별품목별손익", "200.품목별수익성분석(회계)"]} />;
  }

  // KPI
  const totalCost = cvpSummary.totalVariableCost + cvpSummary.totalFixedCost;

  return (
    <div className="space-y-6">
      {/* ═══ 분석 개요 배너 ═══ */}
      <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-semibold">🎯 저가수주 상계효과 검증 — CVP(Cost-Volume-Profit) 분석</p>
            <p className="text-xs leading-relaxed">
              영업부서의 가설 <strong>&quot;손해를 보더라도 물량을 늘려 단위 고정비를 낮추면 전체 이익이 최적화된다&quot;</strong>를
              실제 데이터로 검증합니다. 5개 Step으로 구성: <strong>Step 1</strong>(현재 진단) → <strong>Step 2</strong>(CVP 그래프) → <strong>Step 3</strong>(4사분면) →
              <strong>Step 4a</strong>(총액 관점 시뮬레이션) → <strong>Step 4b</strong>(배분 관점 시뮬레이션) → <strong>Step 5</strong>(무결성 검증)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-muted-foreground mt-2">
              <div className="bg-background/60 rounded p-2">
                <strong className="text-foreground">📊 분석 방법</strong>: 거래처×품목 단위로 공헌이익(CM) 계산 후, 가설 시나리오를 적용하여 전사 이익 변화를 워터폴로 시각화
              </div>
              <div className="bg-background/60 rounded p-2">
                <strong className="text-foreground">💡 해석 방법</strong>: 워터폴 마지막 막대가 기존 이익보다 높으면 &quot;가설 성립&quot;, 낮으면 &quot;가설 반증&quot;
              </div>
              <div className="bg-background/60 rounded p-2">
                <strong className="text-foreground">🎓 이론 배경</strong>: 고전 CVP 이론 + 듀얼 뷰(총액 수학적 정확 + 배분 경영관리 장부)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Section A: Step 1. 현재 상태 진단 ═══ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-semibold">Step 1. 현재 상태 진단</h2>
          <span className="text-xs text-muted-foreground">CFO 관점 KPI + 출혈 거래처 비중</span>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground">
          <strong className="text-foreground">📖 이 섹션 읽는 법:</strong> 4개 KPI 카드와 파이 차트로 현재 손익 구조를 한 눈에 파악합니다.
          특히 <strong>평균 단위당 원가</strong>가 가설 검증의 핵심 기준이며, 파이 차트에서 <strong>출혈 비중</strong>이 30% 이상이면 즉각 개선이 필요합니다.
          각 KPI 카드의 <Info className="inline h-3 w-3" /> 아이콘을 호버하면 계산식과 벤치마크를 확인할 수 있습니다.
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
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">📖 이 차트 읽는 법:</strong> X축은 수량, Y축은 금액. 3개 라인이 표시됩니다.</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li><strong className="text-foreground">회색 점선 (고정비)</strong>: 수량과 무관하게 일정 — 설비·감가상각·고정노무비 합계</li>
            <li><strong className="text-foreground">빨간 실선 (총원가)</strong>: 수량이 늘수록 선형 증가 = 고정비 + (수량×단위변동비)</li>
            <li><strong className="text-foreground">녹색 실선 (매출액)</strong>: 수량이 늘수록 선형 증가 = 수량×가중평균 단가</li>
            <li><strong className="text-foreground">파란 점선 (BEP)</strong>: 총원가와 매출이 교차하는 손익분기 수량</li>
            <li><strong className="text-foreground">주황 점선 (현재)</strong>: 현재 실적 수량 위치</li>
          </ul>
          <p className="pt-1"><strong className="text-foreground">💡 해석:</strong> 현재 위치가 BEP보다 오른쪽이면 흑자, 왼쪽이면 적자. 현재와 BEP 사이가 멀수록 안전한계율이 높아 가격 인하 여지가 있습니다.</p>
        </div>
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
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">📖 이 차트 읽는 법:</strong> 각 점(버블)은 거래처×품목 조합. X축=수량, Y축=단위공헌이익, 크기=매출.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded p-2">
              <strong className="text-emerald-700 dark:text-emerald-400">⭐ Star (우상단)</strong>: 고물량+고마진. 핵심 자원 집중 및 관계 강화 대상
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
              <strong className="text-blue-700 dark:text-blue-400">💰 CashCow (우하단)</strong>: 고물량+저마진. 안정적 현금흐름, 마진 개선 여지 검토
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2">
              <strong className="text-amber-700 dark:text-amber-400">❓ Question (좌상단)</strong>: 저물량+고마진. 물량 확대로 매출 기여도 증대 기회
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded p-2">
              <strong className="text-red-700 dark:text-red-400">☠️ Dog (좌하단)</strong>: 저물량+저마진. <strong>쥐약 거래</strong> — 단가 재협상 또는 거래 축소
            </div>
          </div>
          <p className="pt-1"><strong className="text-foreground">💡 해석:</strong> Y축 0 이하(빨간 점선 아래) 품목은 <strong>팔수록 손해</strong>인 품목입니다. Step 4a/4b 시뮬레이터에서 이들을 대상으로 시나리오를 돌려 개선 효과를 검증하세요.</p>
        </div>
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
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300 mb-4 space-y-2">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>수학적으로 정확한 전사 영업이익 변화 — 가설 검증의 PRIMARY</strong>
              <p className="mt-1 leading-relaxed">고정비 총액 불변 가정 하에 물량 증가는 공헌이익 증가로 전사 이익에 기여합니다. 이 섹션의 결과가 박리다매 가설의 <strong>진짜 답</strong>입니다.</p>
            </div>
          </div>
          <div className="ml-6 p-2 bg-white/60 dark:bg-black/20 rounded text-[11px] font-mono">
            <strong>대수 항등식:</strong> newOP − baseOP ≡ priceReductionLoss + volumeContributionGain<br />
            <strong>분해:</strong>
            <br />• priceReductionLoss = −Σ(기존수량 × 기존단가 × 인하율)
            <br />• volumeContributionGain = Σ(추가수량 × 인하후 단위공헌이익)
          </div>
          <p className="ml-6 text-[11px]"><strong>사용법:</strong> ① 대상 거래처/품목 선택 → ② 물량/단가 슬라이더 조작 → ③ 워터폴로 4단계 이익 변동 확인 → ④ 최종 이익이 기존 이익보다 높으면 &quot;가설 성립&quot;</p>
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
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">📖 워터폴 차트 읽는 법:</strong> 좌측부터 우측으로 4개 막대가 누적 흐름을 보여줍니다.</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li><strong className="text-foreground">① 기존 영업이익 (녹색)</strong>: 시나리오 적용 전 전사 영업이익 — 출발점</li>
            <li><strong className="text-foreground">② 단가 인하 손실 (빨강)</strong>: 대상 품목 단가 인하로 인한 매출 감소액 (음수)</li>
            <li><strong className="text-foreground">③ 물량 증가 공헌 (파랑)</strong>: 추가 물량 × 인하 후 단위공헌이익 (양수, 고정비 부담 없음)</li>
            <li><strong className="text-foreground">④ 최종 영업이익 (녹색/빨강)</strong>: ① + ② + ③ — 시나리오 적용 후 전사 이익</li>
          </ul>
          <p className="pt-1"><strong className="text-foreground">💡 판단 기준:</strong> ④가 ①보다 높으면 가설 성립(박리다매 유리), 낮으면 가설 반증(가격 방어 필요).</p>
        </div>
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

      {/* ═══ Section E: Step 4b. 덤으로 따라오는 효과 (영업사원 친화 UI) ═══ */}
      {filteredItemProfitability && filteredItemProfitability.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">🎁 Step 4b. 덤으로 따라오는 효과 — 다른 품목들의 원가 여유</h2>

          {/* 1분 요약 카드 (P1-5) */}
          <div className="rounded-lg border bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📌</span>
              <h3 className="font-semibold text-sm">1분 요약 — 처음이신가요?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="bg-white/70 dark:bg-black/20 rounded p-3">
                <p className="font-semibold mb-1">1️⃣ 왜 이 섹션이 있나요?</p>
                <p className="leading-relaxed text-muted-foreground">
                  Step 4a는 &quot;회사 전체 이익이 얼마나 변하나?&quot;를 답합니다.<br/>
                  <strong className="text-foreground">Step 4b는 &quot;그 이익이 품목별로 어떻게 나뉘나?&quot;</strong>를 답합니다.
                </p>
              </div>
              <div className="bg-white/70 dark:bg-black/20 rounded p-3">
                <p className="font-semibold mb-1">2️⃣ &quot;배분&quot;이 뭔가요?</p>
                <p className="leading-relaxed text-muted-foreground">
                  공장 고정비(전기료, 기계 감가)를 품목별로 나누는 회계 기법입니다.
                  <strong className="text-foreground"> 한 품목 판매 늘면 다른 품목의 몫이 줄어듭니다</strong> (실제 돈은 이동 안 함).
                </p>
              </div>
              <div className="bg-white/70 dark:bg-black/20 rounded p-3">
                <p className="font-semibold mb-1">3️⃣ 언제 유용한가요?</p>
                <p className="leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">&quot;내가 A품목 밀어주면 B품목 담당 동료에게도 도움이 되는가?&quot;</strong>를
                  확인할 때 사용하세요.
                </p>
              </div>
            </div>
          </div>

          {/* 가족 생활비 비유 배너 (P0-2) */}
          <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 p-4 mb-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-xl">🏠</span>
              <div className="text-xs space-y-2">
                <p className="font-semibold text-sm">&quot;한 집안의 생활비&quot; 비유로 이해하세요</p>
                <div className="bg-white/70 dark:bg-black/20 rounded p-2 leading-relaxed">
                  <p><strong>예시:</strong> 한 달 전기료 10만원을 가족 <strong>4명</strong>이 똑같이 부담 → 1명당 <strong>2.5만원</strong></p>
                  <p>손님 1명이 와서 <strong>5명</strong>이 부담 → 1명당 <strong>2만원</strong> (0.5만원씩 여유 생김)</p>
                </div>
                <p className="leading-relaxed">
                  ⏩ <strong>품목도 마찬가지입니다:</strong><br/>
                  풀 고정비 <strong>{formatCurrency(poolFixedCost, true)}</strong> → <strong>{poolItems.length}개 품목</strong>이 나눠 부담 중<br/>
                  대상 품목 판매량 증가 → 풀 전체 비중 바뀜 → <strong>다른 품목들의 &quot;1개당 나눠 내는 고정비&quot;가 조금 줄어듦</strong>
                </p>
                <div className="bg-blue-100/60 dark:bg-blue-950/40 rounded p-2 leading-relaxed">
                  <strong>✅ 중요한 사실:</strong> 이 여유분은 &quot;장부상&quot;만 보이는 것입니다.
                  실제 회사 전체 이익은 <strong>Step 4a에서 이미 계산</strong>되었고, 여기서 추가로 돈이 생기지는 않습니다.
                  이 섹션은 <strong>&quot;어떤 품목이 다른 품목에게 도움을 주는가?&quot;</strong>를 알아보는 용도입니다.
                </div>
              </div>
            </div>
          </div>

          {/* 에러 상태 안내 */}
          {!targetItem && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300 mb-4">
              <strong>⚠️ Step 4a에서 &quot;대상 품목&quot;을 먼저 선택하세요.</strong>
              대상 품목이 없으면 어떤 품목을 밀어줄지 알 수 없어 교차 효과가 0으로 표시됩니다.
            </div>
          )}
          {targetItem && !poolItems.find((it) => it.item === targetItem) && (
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300 mb-4">
              <strong>⚠️ 대상 품목이 현재 선택된 풀({poolName}) 안에 없습니다.</strong>
              아래 &quot;풀 선택&quot;에서 다른 풀을 선택하거나, Step 4a에서 다른 품목을 선택하세요.
            </div>
          )}

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

          {/* P2-1: 액션 가이드 배너 (자동 판정) */}
          {targetItem && poolItems.find((it) => it.item === targetItem) && (
            <div className={`rounded-lg border-l-4 ${actionGuide.borderClass} ${actionGuide.bgClass} p-4 mb-4`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{actionGuide.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${actionGuide.textClass} mb-1`}>
                    결론: {actionGuide.title}
                  </p>
                  <p className="text-xs leading-relaxed">{actionGuide.message}</p>
                </div>
              </div>
            </div>
          )}

          {/* 한 문장 스토리 카드 (P0-3) */}
          {targetItem && poolItems.find((it) => it.item === targetItem) && (
            <div className="rounded-lg border-2 border-emerald-400 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-5 mb-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📖</span>
                <div className="flex-1 space-y-3">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">이번 시나리오를 한 문장으로</p>
                  <p className="text-sm leading-relaxed">
                    <strong className="text-base text-emerald-700 dark:text-emerald-400">&quot;</strong>
                    <strong>{truncateLabel(itemList.find((i) => i.code === targetItem)?.name || targetItem, 20)}</strong>
                    {volumeIncreasePct !== 0 && <> 판매량을 <strong>{volumeIncreasePct > 0 ? "+" : ""}{volumeIncreasePct}%</strong></>}
                    {priceDecreasePct !== 0 && <> {volumeIncreasePct !== 0 ? ", 단가를 " : "단가를 "}<strong>{priceDecreasePct}%</strong></>}
                    {volumeIncreasePct === 0 && priceDecreasePct === 0 && " 변동 없이"}
                    {(volumeIncreasePct !== 0 || priceDecreasePct !== 0) && " 조정하면,"}
                    <br/>
                    이 품목 본인은 장부상 <strong className={poolSim.targetItemMarginDelta >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {poolSim.targetItemMarginDelta >= 0 ? "+" : ""}{formatCurrency(poolSim.targetItemMarginDelta)}
                    </strong> 변화,
                    <br/>
                    <strong>덤으로 다른 {poolItems.length - 1}개 품목</strong>도 총 <strong className={poolSim.otherItemsMarginDelta >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {poolSim.otherItemsMarginDelta >= 0 ? "+" : ""}{formatCurrency(poolSim.otherItemsMarginDelta)}
                    </strong> 개선되어,
                    <br/>
                    <strong>{poolName} 제품군 전체</strong> 장부상 마진이 <strong className={poolSim.netPoolMarginDelta >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {poolSim.netPoolMarginDelta >= 0 ? "+" : ""}{formatCurrency(poolSim.netPoolMarginDelta)}
                    </strong> 변화합니다.
                    <strong className="text-base text-emerald-700 dark:text-emerald-400">&quot;</strong>
                  </p>
                  {poolSim.otherItemsMarginDelta > 0 && poolSim.targetItemMarginDelta !== 0 && (
                    <div className="text-xs bg-white/70 dark:bg-black/20 rounded p-2">
                      <strong>🎁 덤 효과 발생!</strong> 대상 품목을 밀어주면 같은 풀의 다른 {poolItems.length - 1}개 품목도 장부상 원가 여유가 생깁니다.
                      <br/><strong>⚠️ 단, 실제 회사 현금은 Step 4a에서 계산된 금액만 변합니다. 이 덤 효과는 &quot;장부상 표시&quot;일 뿐입니다.</strong>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 보조 KPI 3개 (영업사원 친화 라벨) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <KpiCard
              title="① 대상 품목 본인" value={poolSim.targetItemMarginDelta} format="currency"
              formula="대상 품목 (시나리오 후 장부상 이익 - 기준 장부상 이익)"
              description="저가수주를 받은 품목 본인의 장부상 마진 변화. 단가 인하 손실이 있으면 보통 음수, 순수 물량 증가면 양수가 될 수도 있음."
              benchmark="음수여도 괜찮음 — 물량 증가로 다른 품목들에게 덤을 주는 역할이므로"
              reason="저가수주의 직접 비용/효과를 장부에서 확인"
            />
            <KpiCard
              title="② 다른 품목들 (덤 효과)" value={poolSim.otherItemsMarginDelta} format="currency"
              formula="Σ(다른 품목 시나리오 후 장부상 이익 - 기준 장부상 이익)"
              description={`풀 내 나머지 ${Math.max(poolItems.length - 1, 0)}개 품목 전체의 장부상 마진 개선 합계. 대상 품목 판매량이 늘면 풀 전체 매출 비중이 바뀌어 다른 품목들의 '단위 고정비'가 줄어듭니다.`}
              benchmark="양수면 덤 효과 성립 — 다른 품목 담당 동료에게도 도움"
              reason="박리다매 가설의 '교차 보조 효과'를 장부에서 확인"
            />
            <KpiCard
              title="③ 제품군 전체 (① + ②)" value={poolSim.netPoolMarginDelta} format="currency"
              formula="① + ② = 같은 풀 내 모든 품목의 장부상 마진 변화 합계"
              description={`선택한 제품군(${poolName}) 장부상 이익 총 변화. Step 4a 전사 이익 변화와 ${integrity.isConsistent ? "일관성 있음" : "불일치"}.`}
              benchmark="음수면 가설 반증(제품군 전체 악화), 양수면 성립"
              reason="제품군 단위에서 시나리오가 유리한지 판단"
            />
          </div>

          {/* 품목별 역할 기반 영향 테이블 (P1-7) */}
          {poolImpactTable.length > 0 && (() => {
            const roleMap = {
              target:      { icon: "🎯", label: "대상",   badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    row: "bg-blue-50 dark:bg-blue-950/30 font-semibold", bar: "bg-blue-500" },
              beneficiary: { icon: "🎁", label: "수혜자", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", row: "", bar: "bg-emerald-500" },
              harmed:      { icon: "🔻", label: "악화",   badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",       row: "", bar: "bg-red-500" },
              neutral:     { icon: "⚖️", label: "중립",   badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",      row: "opacity-70", bar: "bg-gray-400" },
            } as const;
            return (
              <ChartCard
                title="품목별 장부상 영향 — 누가 덕을 보는가?"
                isEmpty={false}
                formula="장부상 마진 = 매출 − 변동비 − 배분 고정비"
                description="대상 품목(🎯) + 수혜자(🎁) + 악화/중립 순으로 정렬. 막대 길이는 마진 변화의 상대 크기."
                benchmark="🎁 초록 배지가 많을수록 '교차 보조 효과' 강함"
                reason="영업사원: 어떤 품목이 누구에게 덕을 주는지 한눈에 확인"
              >
                {/* 용어 사전 (P2-2) */}
                <details className="text-xs mt-2 mb-3 border rounded p-2 bg-muted/30">
                  <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                    ❓ 용어 설명 (처음 보시는 분은 클릭)
                  </summary>
                  <div className="mt-2 space-y-1.5 pl-2 leading-relaxed">
                    <p><strong>풀 고정비</strong>: 같은 제품군이 함께 나눠 내는 공장 비용 (전기·기계 감가 등)</p>
                    <p><strong>배분 고정비</strong>: 풀 고정비를 각 품목이 &quot;몫&quot;대로 나눈 금액 (장부상 수치, 실제 지출 아님)</p>
                    <p><strong>장부상 마진</strong>: 매출 − 변동비 − 배분 고정비 (관리회계 기준)</p>
                    <p><strong>교차 보조 효과</strong>: 한 품목 판매량이 늘면 풀 비중이 바뀌어 다른 품목의 배분 고정비 &quot;몫&quot;이 줄어드는 현상</p>
                    <p className="pt-1 border-t"><strong>🎯 대상</strong>: 내가 밀어줄 품목 / <strong>🎁 수혜자</strong>: 덤으로 좋아진 품목 / <strong>🔻 악화</strong>: 장부상 악화 / <strong>⚖️ 중립</strong>: 영향 미미</p>
                  </div>
                </details>

                <div className="overflow-x-auto max-h-[450px] overflow-y-auto mt-3">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b text-left">
                        <th className="p-2 w-[85px]">역할</th>
                        <th className="p-2">품목</th>
                        <th className="p-2 text-right">마진 변화 (기준 → 시나리오)</th>
                        <th className="p-2">변화액 (상대 크기)</th>
                        <th className="p-2 text-right w-[70px]">변화율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poolImpactTable.map((r, i) => {
                        const roleInfo = roleMap[r.role];
                        const pct = r.baseMargin > 0
                          ? (r.marginDelta / r.baseMargin) * 100
                          : r.baseMargin < 0
                            ? (r.marginDelta / Math.abs(r.baseMargin)) * 100
                            : null;
                        return (
                          <tr key={i} className={`border-b hover:bg-muted/50 ${roleInfo.row}`}>
                            <td className="p-2">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${roleInfo.badge}`}>
                                <span>{roleInfo.icon}</span>
                                <span>{roleInfo.label}</span>
                              </span>
                            </td>
                            <td className="p-2">{truncateLabel(r.itemName, 22)}</td>
                            <td className="p-2 text-right tabular-nums">
                              <span className="text-muted-foreground">{formatCurrency(r.baseMargin)}</span>
                              <span className="mx-1 text-muted-foreground">→</span>
                              <span className="font-medium">{formatCurrency(r.simMargin)}</span>
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <div className={`font-semibold tabular-nums min-w-[70px] ${r.marginDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                  {r.marginDelta >= 0 ? "+" : ""}{formatCurrency(r.marginDelta)}
                                </div>
                                <div className="flex-1 min-w-[40px] h-2 bg-muted/40 rounded overflow-hidden">
                                  <div
                                    className={`h-full ${roleInfo.bar} rounded transition-all`}
                                    style={{ width: `${Math.max(r.barPct, 2)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className={`p-2 text-right font-medium tabular-nums ${r.marginDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 상세 수치 (접기) */}
                <details className="text-xs mt-3 border-t pt-2">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    📋 상세 수치 보기 (수량 · 단위 고정비)
                  </summary>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="p-1.5">품목</th>
                          <th className="p-1.5 text-right">기준 수량</th>
                          <th className="p-1.5 text-right">시나리오 수량</th>
                          <th className="p-1.5 text-right">기준 단위고정비</th>
                          <th className="p-1.5 text-right">시나리오 단위고정비</th>
                        </tr>
                      </thead>
                      <tbody>
                        {poolImpactTable.map((r, i) => (
                          <tr key={i} className="border-b">
                            <td className="p-1.5">{truncateLabel(r.itemName, 22)}</td>
                            <td className="p-1.5 text-right tabular-nums">{r.baseQty.toLocaleString()}</td>
                            <td className="p-1.5 text-right tabular-nums">{r.simQty.toLocaleString()}</td>
                            <td className="p-1.5 text-right tabular-nums">{formatCurrency(r.baseUnitFC)}</td>
                            <td className={`p-1.5 text-right tabular-nums ${r.simUnitFC < r.baseUnitFC ? "text-emerald-600" : r.simUnitFC > r.baseUnitFC ? "text-red-600" : ""}`}>
                              {formatCurrency(r.simUnitFC)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </ChartCard>
            );
          })()}
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
                    ? "✓ 무결성 검증 통과 — 각 관점의 내부 항등식이 성립합니다"
                    : "⚠️ 무결성 경고 — 항등식 오차 발견"
                  }
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* 4a 항등식 */}
                  <div className="border rounded p-3 bg-background/50">
                    <p className="font-medium mb-2">Step 4a 총액 관점 항등식</p>
                    <p className="text-[11px] text-muted-foreground mb-1">netOffsetEffect ≡ priceLoss + volumeGain</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>netOffsetEffect</span>
                        <span className="font-semibold">{formatCurrency(integrity.totalViewNetDelta)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>priceLoss + volumeGain</span>
                        <span className="font-semibold">{formatCurrency(integrity.totalViewDecomposed)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span>오차</span>
                        <span className={`font-semibold ${integrity.totalViewIsConsistent ? "text-emerald-600" : "text-red-600"}`}>
                          {formatCurrency(integrity.totalViewIdentityError)} {integrity.totalViewIsConsistent ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4b 항등식 */}
                  <div className="border rounded p-3 bg-background/50">
                    <p className="font-medium mb-2">Step 4b 배분 관점 항등식</p>
                    <p className="text-[11px] text-muted-foreground mb-1">netPoolMarginDelta ≡ targetDelta + othersDelta</p>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span>netPoolMarginDelta</span>
                        <span className="font-semibold">{formatCurrency(integrity.poolNetDelta)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>target + others</span>
                        <span className="font-semibold">{formatCurrency(integrity.poolDecomposed)}</span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span>오차</span>
                        <span className={`font-semibold ${integrity.poolIsConsistent ? "text-emerald-600" : "text-red-600"}`}>
                          {formatCurrency(integrity.poolIdentityError)} {integrity.poolIsConsistent ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs text-muted-foreground leading-relaxed space-y-1">
                  <p>
                    <strong>검증 방식:</strong> 4a와 4b는 서로 다른 데이터 소스(100 vs 200 보고서)와 다른 단위(거래처×품목 vs 품목)이므로
                    직접 합계 비교는 의미가 없습니다. 대신 각 관점 내부의 대수적 항등식이 성립하는지 검증합니다.
                  </p>
                  <p className="text-[11px]">
                    <strong>4a 항등식</strong>: 전사 영업이익 변화는 단가 인하 손실과 물량 증가 공헌이익의 합과 정확히 일치해야 합니다 (고정비 총액 불변 가정).
                  </p>
                  <p className="text-[11px]">
                    <strong>4b 항등식</strong>: 풀 내 총 마진 변화는 대상 품목 마진 변화와 다른 품목 마진 변화의 합과 정확히 일치해야 합니다 (고정비 풀 재배분 원리).
                  </p>
                </div>
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
