"use client";

import { useMemo, useState, useEffect } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, Legend,
  ComposedChart, Line, ReferenceLine,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { TrendingUp, AlertTriangle, DollarSign, Package, CheckCircle2, XCircle, Info } from "lucide-react";
import { ExportButton } from "@/components/dashboard/ExportButton";
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
  getUnitGroups,
  calcGroupCVP,
  type PoolLevel,
  type FixedCostAllocation,
  calcSensitivityGrid,
} from "@/lib/analysis/offsetEffect";
import type { CustomerItemDetailRecord, ItemProfitabilityRecord } from "@/types";

interface OffsetEffectTabProps {
  filteredCustItemDetail: CustomerItemDetailRecord[];
  filteredItemProfitability?: ItemProfitabilityRecord[];
  isDateFiltered?: boolean;
}

// M6: 다크 모드 대비 개선 — 밝기 40→55%로 올려 dark 배경에서 가독성 확보
const QUADRANT_COLORS = {
  star: "hsl(142, 71%, 50%)",
  cashcow: "hsl(217, 91%, 65%)",
  question: "hsl(45, 93%, 55%)",
  dog: "hsl(0, 84%, 60%)",
};

const QUADRANT_LABELS = {
  star: "Star (고매출·고마진)",
  cashcow: "CashCow (고매출·저마진)",
  question: "Question (저매출·고마진)",
  dog: "Dog (저매출·저마진) 쥐약",
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
  const [priceChangePct, setPriceChangePct] = useState(0);

  // 풀 설정
  const [poolLevel, setPoolLevel] = useState<PoolLevel>("대분류");
  const [poolName, setPoolName] = useState<string>("");
  const [allocationBasis, setAllocationBasis] = useState<FixedCostAllocation>("revenue");

  // 시뮬레이션 입력 모드: "percent" (비율) / "absolute" (절대 수량)
  const [inputMode, setInputMode] = useState<"percent" | "absolute">("percent");
  const [volumeAbsolute, setVolumeAbsolute] = useState<number>(0);
  const [priceChangeDirect, setPriceChangeDirect] = useState<number>(0); // 소수점 직접 입력용

  // CVP 듀얼 모드: 전사 금액 기반 / 대분류×단위 수량 기반
  const [cvpGroupKey, setCvpGroupKey] = useState<string>("__all__");
  // 테이블 확장 토글
  const [showAllDogs, setShowAllDogs] = useState(false);
  const [showAllPool, setShowAllPool] = useState(false);
  // 시나리오 비교 (세션 내 휘발성, 최대 3개)
  const [savedScenarios, setSavedScenarios] = useState<Array<{
    label: string;
    params: { customer: string | null; item: string | null; volPct: number; pricePct: number; mode: string };
    result: { baseOP: number; newOP: number; netEffect: number; hypothesis: string };
  }>>([]);

  const unitGroups = useMemo(
    () => filteredItemProfitability ? getUnitGroups(filteredItemProfitability) : [],
    [filteredItemProfitability]
  );

  const selectedGroup = useMemo(() => {
    if (cvpGroupKey === "__all__" || !filteredItemProfitability) return null;
    const [cat, unit] = cvpGroupKey.split("|");
    return calcGroupCVP(filteredItemProfitability, cat, unit);
  }, [cvpGroupKey, filteredItemProfitability]);

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
      volumeIncreasePct: inputMode === "absolute" ? 0 : volumeIncreasePct,
      priceChangePct: inputMode === "absolute" ? priceChangeDirect : priceChangePct,
      ...(inputMode === "absolute" && targetItem ? { volumeAbsolute } : {}),
    }),
    [cvpItems, totalFixedCost, targetCustomer, targetItem, volumeIncreasePct, priceChangePct, inputMode, volumeAbsolute, priceChangeDirect]
  );

  // 워터폴
  const waterfall = useMemo(() => calcWaterfallSteps(totalSim), [totalSim]);

  // 감도 분석 그리드 (대상 선택 시에만)
  const sensitivityGrid = useMemo(
    () => (targetCustomer || targetItem)
      ? calcSensitivityGrid(cvpItems, totalFixedCost, targetCustomer, targetItem)
      : [],
    [cvpItems, totalFixedCost, targetCustomer, targetItem]
  );

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
  const { items: poolItems, poolFixedCost, warnings: poolWarnings } = useMemo(
    () => filteredItemProfitability
      ? calcItemPool(filteredItemProfitability, poolLevel, poolName)
      : { items: [], poolFixedCost: 0, warnings: [] },
    [filteredItemProfitability, poolLevel, poolName]
  );

  // 배분 관점 시뮬레이션 (4b) — 절대 수량 모드 지원
  const poolSim = useMemo(
    () => calcPoolSimulation(
      poolItems,
      poolFixedCost,
      targetItem,
      inputMode === "absolute" ? 0 : volumeIncreasePct,
      inputMode === "absolute" ? priceChangeDirect : priceChangePct,
      allocationBasis,
      poolLevel,
      poolName,
      inputMode === "absolute" && targetItem ? volumeAbsolute : undefined
    ),
    [poolItems, poolFixedCost, targetItem, volumeIncreasePct, priceChangePct, allocationBasis, poolLevel, poolName, inputMode, volumeAbsolute, priceChangeDirect]
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
    const map = new Map<string, { name: string; revenue: number; inPool: boolean; quantity: number; unit: string }>();
    for (const it of cvpItems) {
      const prev = map.get(it.item) || { name: it.itemName, revenue: 0, inPool: false, quantity: 0, unit: "" };
      prev.revenue += it.revenue;
      prev.quantity += it.quantity;
      map.set(it.item, prev);
    }
    // 200 품목도 추가 (풀 내 품목이 4a에서 선택 가능하도록)
    for (const pi of poolItems) {
      const prev = map.get(pi.item) || { name: pi.itemName, revenue: 0, inPool: true, quantity: 0, unit: "" };
      if (prev.revenue === 0) prev.revenue = pi.revenue;
      if (prev.quantity === 0) prev.quantity = pi.quantity;
      prev.inPool = true;
      if (!prev.name || prev.name === pi.item) prev.name = pi.itemName;
      map.set(pi.item, prev);
    }
    // 200에서 단위 정보 추가
    if (filteredItemProfitability) {
      for (const r of filteredItemProfitability) {
        const raw = (r.품목 || "").trim();
        const codeMatch = raw.match(/^\[([^\]]+)\]/);
        const code = codeMatch ? codeMatch[1].trim() : raw;
        const entry = map.get(code);
        if (entry && !entry.unit && (r as any).기준단위) {
          entry.unit = ((r as any).기준단위 || "").trim();
        }
      }
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 300);
  }, [cvpItems, poolItems, filteredItemProfitability]);

  // 파이 차트 데이터 (정상 vs 출혈)
  // 파이차트: 정상(공헌이익 > 0) vs 출혈(공헌이익 ≤ 0) 분류
  const healthVsBleeding = useMemo(() => [
    { name: `정상 (${cvpSummary.healthyCount}건, ${formatCurrency(cvpSummary.healthyContributionSum, true)})`, value: cvpSummary.healthyCount, fill: "hsl(142, 71%, 45%)" },
    { name: `출혈 (${cvpSummary.bleedingCount}건, ${formatCurrency(cvpSummary.bleedingContributionLoss, true)})`, value: cvpSummary.bleedingCount, fill: "hsl(0, 84%, 60%)" },
  ], [cvpSummary]);

  // CVP 그래프 데이터 — 듀얼 모드
  // 전사: X=매출, Y=영업이익 (금액 기반)
  // 그룹: X=수량(단위), Y=금액 (수량 기반 — 매출선/총원가선/고정비선)
  const cvpChartData = useMemo(() => {
    // 시뮬레이션 파라미터에 따라 X축 범위 적응
    const simFactor = 1 + Math.max(volumeIncreasePct, 0) / 100;
    const absFactor = volumeAbsolute > 0 && selectedGroup
      ? 1 + volumeAbsolute / Math.max(selectedGroup.totalQuantity, 1)
      : 1;
    const effectiveFactor = Math.max(simFactor, absFactor);
    const maxMultiplier = Math.max(2.2, effectiveFactor * 1.5);

    if (selectedGroup) {
      // 수량 기반 CVP (동일 단위 그룹)
      const g = selectedGroup;
      if (g.totalQuantity === 0) return [];
      const maxQty = g.totalQuantity * maxMultiplier;
      const steps = 20;
      const stepSize = maxQty / steps;
      const data = [];
      for (let i = 0; i <= steps; i++) {
        const qty = stepSize * i;
        data.push({
          수량: parseFloat(qty.toFixed(2)),
          매출선: qty * g.weightedUnitPrice,
          총원가: g.totalFixedCost + qty * g.weightedUnitVariableCost,
          고정비: g.totalFixedCost,
        });
      }
      return data;
    }
    // 전사 금액 기반 영업이익 직선
    if (cvpSummary.totalRevenue === 0) return [];
    const maxRev = cvpSummary.totalRevenue * maxMultiplier;
    const steps = 20;
    const stepSize = maxRev / steps;
    const cmRatio = cvpSummary.overallContributionMarginRatio;
    const data = [];
    for (let i = 0; i <= steps; i++) {
      const rev = stepSize * i;
      data.push({
        매출: parseFloat(rev.toFixed(0)),
        영업이익: rev * cmRatio - totalFixedCost,
      });
    }
    return data;
  }, [cvpSummary, totalFixedCost, selectedGroup, volumeIncreasePct, volumeAbsolute, inputMode]);

  // CVP 핵심 해석 지표
  const cvpInsight = useMemo(() => {
    const safetyMargin = isFinite(cvpSummary.bepRevenue)
      ? (1 - cvpSummary.bepRevenue / cvpSummary.totalRevenue) * 100
      : 0;
    const opProfit = cvpSummary.totalOperatingProfit;
    const opProfitRate = cvpSummary.totalRevenue > 0
      ? (opProfit / cvpSummary.totalRevenue) * 100 : 0;
    return { safetyMargin, opProfit, opProfitRate };
  }, [cvpSummary]);

  // 산점도 데이터 (금액 기반 — X=매출, Y=공헌이익률)
  const scatterData = useMemo(() => {
    const byQuadrant: Record<string, any[]> = { star: [], cashcow: [], question: [], dog: [] };
    for (const it of cvpItems.slice(0, 500)) {
      byQuadrant[it.quadrant].push({
        x: it.revenue,
        y: it.contributionMarginRatio * 100, // % 표시
        z: Math.max(Math.abs(it.totalContributionMargin), 1), // 공헌이익 영향력 크기
        fullName: `${it.customerName} / ${truncateLabel(it.itemName, 20)}`,
        fullItemName: `${it.customerName} / ${it.itemName}`,
        customer: it.customerName,
        item: it.itemName,
        revenue: it.revenue,
        cmRatio: it.contributionMarginRatio * 100,
        totalCM: it.totalContributionMargin,
      });
    }
    return byQuadrant;
  }, [cvpItems]);

  // Dog 테이블
  const allDogItems = useMemo(
    () => [...cvpItems]
      // H5: 4사분면 판정 기준 일관화 — quadrant 기준만 사용
      .filter((it) => it.quadrant === "dog")
      .sort((a, b) => a.totalContributionMargin - b.totalContributionMargin),
    [cvpItems]
  );
  const dogItems = showAllDogs ? allDogItems : allDogItems.slice(0, 20);

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
    const sorted = withRole
      .map((r) => ({ ...r, barPct: (Math.abs(r.marginDelta) / maxAbsDelta) * 100 }))
      .sort((a, b) => {
        if (a.role === "target") return -1;
        if (b.role === "target") return 1;
        const order: Record<Role, number> = { target: 0, beneficiary: 1, harmed: 2, neutral: 3 };
        if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
        return b.marginDelta - a.marginDelta;
      });
    return showAllPool ? sorted : sorted.slice(0, 11); // 기본: 대상 + 10개
  }, [poolSim, targetItem, showAllPool]);

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
    // M3: 덤 효과 판정 임계치 — 수혜액 > 대상 손실의 50%이면 "강함" (경영관리 관행 기준)
    const STRONG_OFFSET_THRESHOLD = 0.5;
    if (otherItemsMarginDelta > Math.abs(targetItemMarginDelta) * STRONG_OFFSET_THRESHOLD) {
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
      {/* ═══ 기간 필터 경고 ═══ */}
      {isDateFiltered && (
        <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>기간 필터 적용 중</strong> — 부분 기간 데이터로 CVP를 분석하면 고정비가 과소 집계되어 BEP가 과소평가될 수 있습니다. 정확한 분석을 위해 전체 기간 데이터 사용을 권장합니다.
            </p>
          </div>
        </div>
      )}

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

      {/* A8: Step 미니 네비게이션 */}
      <div className="flex flex-wrap gap-1.5 sticky top-0 z-30 bg-background/95 backdrop-blur-sm py-2 border-b mb-2">
        {[
          { id: "offset-step1", label: "Step 1 진단" },
          { id: "offset-step2", label: "Step 2 CVP" },
          { id: "offset-step3", label: "Step 3 4사분면" },
          { id: "offset-step4a", label: "Step 4a 총액" },
          { id: "offset-step4b", label: "Step 4b 배분" },
          { id: "offset-step5", label: "Step 5 무결성" },
        ].map((s) => (
          <a key={s.id} href={`#${s.id}`} className="px-2.5 py-1 rounded text-[11px] border hover:bg-muted transition-colors">{s.label}</a>
        ))}
      </div>

      {/* ═══ Layer 1: 전역 방법론 패널 (데이터 출처 & 계산 로직) ═══ */}
      <details className="border-2 border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-lg">
        <summary className="cursor-pointer font-semibold text-sm p-4 hover:bg-indigo-100/40 dark:hover:bg-indigo-900/20 rounded-lg flex items-center gap-2">
          <span className="text-lg">📘</span>
          <span>이 분석은 어떻게 계산되나요? — 데이터 출처 &amp; 방법론 전체 보기 (클릭)</span>
        </summary>
        <div className="px-4 pb-4 space-y-4 text-xs">
          {/* 원본 SAP 보고서 */}
          <section>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
              <span>📂</span><span>원본 SAP 보고서 (2개)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="border rounded p-3 bg-background/70">
                <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">100. 거래처별품목별손익</p>
                <p className="text-[11px] text-muted-foreground mb-2">파일명 패턴: <code className="text-[10px]">100*거래처*품목*손익*.xlsx</code></p>
                <p className="mb-1"><strong>사용 필드:</strong></p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>매출거래처, 매출거래처명 (키)</li>
                  <li>품목, 품목명 (키)</li>
                  <li>매출수량·실적 (수량)</li>
                  <li>매출액·실적 (매출)</li>
                  <li>매출총이익·실적 (변동비 계산용)</li>
                </ul>
                <p className="mt-2 text-[11px]"><strong>사용 Step:</strong> Step 1 (진단), Step 2 (CVP), Step 3 (4사분면), Step 4a (총액 시뮬)</p>
              </div>
              <div className="border rounded p-3 bg-background/70">
                <p className="font-semibold text-emerald-700 dark:text-emerald-400 mb-1">200. 품목별수익성분석(회계)</p>
                <p className="text-[11px] text-muted-foreground mb-2">파일명 패턴: <code className="text-[10px]">200*품목*수익성*.xlsx</code></p>
                <p className="mb-1"><strong>사용 필드:</strong></p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>대분류, 중분류, 품목계정그룹 (풀 계층)</li>
                  <li>품목 (키, `[코드] 명` 패턴 정규화)</li>
                  <li>매출수량, 매출액, 실적매출원가</li>
                  <li>제조고정노무비 (고정비)</li>
                  <li>감가상각비 (고정비)</li>
                  <li>기타경비 (고정비)</li>
                </ul>
                <p className="mt-2 text-[11px]"><strong>사용 Step:</strong> Step 4a 고정비 합계, Step 4b (배분 시뮬)</p>
              </div>
            </div>
          </section>

          {/* 핵심 가정 */}
          <section>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
              <span>📐</span><span>핵심 가정 (5개)</span>
            </h4>
            <ol className="list-decimal pl-5 space-y-1 text-[11px] leading-relaxed">
              <li><strong>100의 매출원가 ≈ 변동비 근사</strong>: 100 보고서는 원가 분리(고정/변동)가 없으므로 <code>매출원가 = 매출액 − 매출총이익</code>을 변동비로 사용.</li>
              <li><strong>제조 고정비 = 제조고정노무비 + 감가상각비 + 기타경비</strong>: SGA(판관) 고정비는 제외 (CVP 무관).</li>
              <li><strong>고정비 총액 불변</strong>: 설비 캐파 내 생산을 전제 (계단형 원가 변경 시 결과 달라짐).</li>
              <li><strong>풀 = SAP 품목 계층</strong>: 대분류·중분류·품목계정그룹을 실제 생산 풀의 프록시로 사용 (한계 명시).</li>
              <li><strong>품목 코드 정규화</strong>: 200의 <code>[P001] 명</code> → <code>P001</code>로 추출하여 100과 키 일치.</li>
            </ol>
          </section>

          {/* 듀얼 뷰 */}
          <section>
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
              <span>🎯</span><span>왜 두 가지 관점? (듀얼 뷰)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
              <div className="border-l-4 border-blue-500 bg-blue-50/60 dark:bg-blue-950/20 p-2 rounded">
                <p className="font-semibold mb-1">Step 4a — 총액 관점 (수학적 정확)</p>
                <p>전사 영업이익의 실질적 변화를 계산. 고정비 총액 불변 가정 하에:</p>
                <p className="mt-1 font-mono text-[10px]">netOP ≡ priceLoss + volumeGain</p>
                <p className="mt-1">범위: 전체 CVP 아이템</p>
              </div>
              <div className="border-l-4 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 p-2 rounded">
                <p className="font-semibold mb-1">Step 4b — 배분 관점 (장부상 재배분)</p>
                <p>품목별 고정비 풀을 재배분하여 교차 보조 효과 시각화. 전사 이익에 추가 영향 없음.</p>
                <p className="mt-1 font-mono text-[10px]">netPool ≡ targetDelta + othersDelta</p>
                <p className="mt-1">범위: 선택된 풀 내 품목만</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              ⚠️ <strong>두 관점은 데이터 범위가 달라 직접 합산하지 않음.</strong> 각 관점의 내부 항등식으로 무결성 검증(Step 5).
            </p>
          </section>

          {/* 소스 코드 레퍼런스 */}
          <section className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-1">
              <span>🔗</span><span>코드 레퍼런스</span>
            </h4>
            <ul className="text-[11px] space-y-0.5 font-mono">
              <li>Step 1~3, 4a: <code>src/lib/analysis/offsetEffect.ts#calcCustomerItemCVP</code></li>
              <li>Step 4a 고정비: <code>src/lib/analysis/offsetEffect.ts#extractManufacturingFixedCost</code></li>
              <li>Step 4a 시뮬: <code>src/lib/analysis/offsetEffect.ts#calcTotalViewSimulation</code></li>
              <li>Step 4b 풀: <code>src/lib/analysis/offsetEffect.ts#calcItemPool</code></li>
              <li>Step 4b 시뮬: <code>src/lib/analysis/offsetEffect.ts#calcPoolSimulation</code></li>
              <li>Step 5 무결성: <code>src/lib/analysis/offsetEffect.ts#verifyIntegrity</code></li>
            </ul>
          </section>
        </div>
      </details>

      {/* ═══ Section A: Step 1. 현재 상태 진단 ═══ */}
      <div id="offset-step1">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold">Step 1. 현재 상태 진단</h2>
          <span className="text-xs text-muted-foreground">CFO 관점 KPI + 출혈 거래처 비중</span>
          <details className="text-xs relative">
            <summary className="cursor-pointer px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200">
              🔍 데이터 출처
            </summary>
            <div className="absolute z-20 mt-1 p-3 border rounded bg-background shadow-lg w-[420px] max-w-[90vw]">
              <p className="font-semibold text-[11px] mb-1">📂 100. 거래처별품목별손익 + 200. 품목별수익성분석</p>
              <table className="w-full text-[10px] mt-2">
                <tbody>
                  <tr className="border-b"><td className="py-1 pr-2">총매출</td><td className="font-mono">Σ [100.매출액·실적]</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">총변동비</td><td className="font-mono">Σ ([100.매출액−매출총이익] + [100.판관변동_직접판매운반비])</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">총고정비</td><td className="font-mono">Σ ([200.제조고정노무비] + [200.감가상각비] + [200.기타경비])</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">영업이익</td><td className="font-mono">총매출 − 총변동비 − 총고정비</td></tr>
                  <tr><td className="py-1 pr-2">출혈 거래처</td><td className="font-mono">공헌이익 ≤ 0인 거래처×품목</td></tr>
                </tbody>
              </table>
            </div>
          </details>
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
            formula="Σ [100.매출액·실적] (거래처×품목 집계)"
            description="전체 거래처·품목 매출 합계"
            benchmark="전사 매출 추세와 비교하여 성장 여부 파악"
            reason="CVP 분석의 기준점이 되는 현재 총매출"
          />
          <KpiCard
            title="총원가" value={totalCost} format="currency"
            icon={<Package className="h-5 w-5" />}
            formula="Σ ([100.매출액·실적]−[100.매출총이익·실적]) + Σ([200.제조고정노무비]+[200.감가상각비]+[200.기타경비])"
            description={`변동비 ${formatCurrency(cvpSummary.totalVariableCost)} + 고정비 ${formatCurrency(totalFixedCost)}`}
            benchmark="원가율 = 총원가/총매출 × 100"
            reason="고정비와 변동비를 분리하여 CVP 분석 가능한 총원가 집계"
          />
          <KpiCard
            title="영업이익" value={cvpSummary.totalOperatingProfit} format="currency"
            icon={<TrendingUp className="h-5 w-5" />}
            formula="Σ[100.매출액] − Σ[100.변동비(매출원가+판관변동_직접판매운반비)] − Σ[200.제조고정비]"
            description={`공헌이익률 ${safeFixed(cvpSummary.overallContributionMarginRatio * 100, 1)}%`}
            benchmark="양수면 손익분기 초과, 음수면 적자 상태"
            reason="CVP 분석의 핵심 지표 — 가설 검증의 기준선"
          />
          <KpiCard
            title="공헌이익률" value={cvpSummary.overallContributionMarginRatio * 100} format="percent"
            icon={<Info className="h-5 w-5" />}
            formula="공헌이익률 = (매출 − 변동비) / 매출 × 100 · BEP 매출 = 고정비 / 공헌이익률"
            description={`변동비율 ${safeFixed(cvpSummary.overallVariableCostRatio * 100, 1)}% · BEP 매출 ${isFinite(cvpSummary.bepRevenue) ? formatCurrency(cvpSummary.bepRevenue) : "도달 불가"}`}
            benchmark="공헌이익률이 높을수록 고정비 회수 속도 빠름. 30% 이상 양호"
            reason="금액 기반 CVP 핵심 지표 — 이종 단위(KG/ROL/CAN) 혼합 시에도 정확"
          />
        </div>

        {cvpSummary.returnItemCount > 0 && (
          <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 rounded px-3 py-1.5">
            ⚠️ 반품/환입 {cvpSummary.returnItemCount}건 (매출 {formatCurrency(cvpSummary.returnRevenue)}) 감지 — 4사분면 분류에서 제외, 합산 지표에는 포함
          </div>
        )}

        <div className="mt-4">
          <ChartCard
            title="정상 vs 출혈 거래처·품목 비중"
            isEmpty={cvpItems.length === 0}
            formula="출혈: [100.매출액·실적] − [100.변동비] ≤ 0 (공헌이익률 음수, 팔수록 손해)"
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
      <div id="offset-step2">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold">Step 2. CVP 손익분기점 분석</h2>
          <details className="text-xs relative">
            <summary className="cursor-pointer px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200">
              🔍 데이터 출처
            </summary>
            <div className="absolute z-20 mt-1 p-3 border rounded bg-background shadow-lg w-[420px] max-w-[90vw]">
              <p className="font-semibold text-[11px] mb-1">📂 100. 거래처별품목별손익 + 200. 품목별수익성분석</p>
              <table className="w-full text-[10px] mt-2">
                <tbody>
                  <tr className="border-b"><td className="py-1 pr-2">X축 (매출)</td><td className="font-mono">매출액 (금액 기반, 단위 무관)</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">Y축 (영업이익)</td><td className="font-mono">매출 × 공헌이익률 − 고정비</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">공헌이익률</td><td className="font-mono">(매출 − 변동비) / 매출</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">고정비</td><td className="font-mono">Σ [200.제조고정노무비+감가상각비+기타경비]</td></tr>
                  <tr><td className="py-1 pr-2">BEP 매출</td><td className="font-mono">고정비 / 공헌이익률 (Y=0 교차점)</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">📖 이 차트 읽는 법:</strong> X축 = 매출액, Y축 = 영업이익. <strong>금액 기반</strong>이므로 KG/ROL/CAN 등 이종 단위 혼합 제품도 정확히 비교됩니다.</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li><strong className="text-foreground">파란 실선</strong>: 매출에 따른 <strong>영업이익</strong> 변화 (매출 × 공헌이익률 − 고정비)</li>
            <li><strong className="text-foreground">회색 점선 (0선)</strong>: 손익 기준선. 이 선 위 = <span className="text-emerald-600 font-semibold">흑자</span>, 아래 = <span className="text-red-600 font-semibold">적자</span></li>
            <li><strong className="text-foreground">파란 점선 (BEP)</strong>: 이익선이 0선과 만나는 <strong>손익분기 매출</strong></li>
            <li><strong className="text-foreground">주황 점선 (현재)</strong>: 현재 실적 매출 위치</li>
          </ul>
          <p className="pt-1"><strong className="text-foreground">💡 해석:</strong> 이익선의 <strong>기울기 = 공헌이익률</strong>. 기울기가 가파를수록 매출 1원당 이익 증가가 큼. 현재 위치가 BEP보다 오른쪽이면 흑자.</p>
        </div>
        {/* 그룹 선택 드롭다운 (듀얼 모드 CVP) */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-semibold min-w-[80px]">CVP 범위:</span>
          <select
            value={cvpGroupKey}
            onChange={(e) => setCvpGroupKey(e.target.value)}
            className="flex-1 text-xs border rounded px-2 py-1 bg-background max-w-md"
          >
            <option value="__all__">전사 (금액 기반 — 이종 단위 안전)</option>
            {unitGroups.map((g) => (
              <option key={g.label} value={`${g.category}|${g.unit}`}>
                {g.label} ({g.itemCount}개 품목, {formatCurrency(g.totalRevenue, true)})
              </option>
            ))}
          </select>
          {selectedGroup && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              수량 기반 ({selectedGroup.unit})
            </span>
          )}
        </div>

        <ChartCard
          title={selectedGroup ? `CVP 분석 — ${selectedGroup.unit} 기준 (수량 vs 금액)` : "CVP 영업이익 차트 — 매출 vs 이익"}
          isEmpty={cvpChartData.length === 0}
          formula={selectedGroup
            ? `매출선 = 수량×${formatCurrency(selectedGroup.weightedUnitPrice, true)}/${selectedGroup.unit} | 총원가 = ${formatCurrency(selectedGroup.totalFixedCost, true)} + 수량×${formatCurrency(selectedGroup.weightedUnitVariableCost, true)} | BEP = ${isFinite(selectedGroup.bepQuantity) ? Math.round(selectedGroup.bepQuantity).toLocaleString() + selectedGroup.unit : '도달불가'}`
            : "영업이익 = 매출 × 공헌이익률 − 고정비 | BEP = 이익선이 0을 만나는 매출"}
          description={selectedGroup
            ? `BEP ${isFinite(selectedGroup.bepQuantity) ? Math.round(selectedGroup.bepQuantity).toLocaleString() + selectedGroup.unit : '도달불가'} · 현재 ${Math.round(selectedGroup.totalQuantity).toLocaleString()}${selectedGroup.unit} · 영업이익 ${formatCurrency(selectedGroup.operatingProfit)}`
            : (isFinite(cvpSummary.bepRevenue) ? `BEP 매출 ${formatCurrency(cvpSummary.bepRevenue)} · 안전한계율 ${safeFixed((1 - cvpSummary.bepRevenue / cvpSummary.totalRevenue) * 100, 1)}%` : "BEP 도달 불가 (공헌이익률 ≤ 0)")}
          benchmark={selectedGroup ? `동일 단위(${selectedGroup.unit}) 그룹이므로 수량 기반 BEP 정확` : "Y축 0선 위 = 흑자. 기울기(공헌이익률)가 가파를수록 매출 증가 대비 이익 개선 빠름"}
          reason="매출 변동 시 영업이익이 어떻게 변하는지 즉각 확인"
        >
          <ChartContainer height="h-80">
            {selectedGroup ? (
            /* === 수량 기반 CVP (동일 단위 그룹) === */
            <ComposedChart data={cvpChartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="수량"
                type="number"
                domain={[0, "dataMax"]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => Math.round(v).toLocaleString()}
                label={{ value: `수량 (${selectedGroup.unit || "단위"})`, position: "insideBottomRight", offset: -5, fontSize: 10, fill: "hsl(0,0%,50%)" }}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} label={{ value: "금액", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "hsl(0,0%,50%)" }} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]} labelFormatter={(v) => `수량: ${Math.round(Number(v)).toLocaleString()} ${selectedGroup.unit}`} />
              <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="고정비" name="고정비 (일정)" stroke="hsl(0,0%,40%)" strokeDasharray="6 3" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="총원가" name="총원가 (고정+변동)" stroke="hsl(0,84%,55%)" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="매출선" name="매출액" stroke="hsl(142,71%,42%)" strokeWidth={2.5} dot={false} />
              {isFinite(selectedGroup.bepQuantity) && selectedGroup.bepQuantity > 0 && (
                <ReferenceLine x={Math.round(selectedGroup.bepQuantity)} stroke="hsl(217,91%,60%)" strokeDasharray="3 3" strokeWidth={2}
                  label={{ value: `BEP (${Math.round(selectedGroup.bepQuantity).toLocaleString()}${selectedGroup.unit})`, fontSize: 10, fill: "hsl(217,91%,60%)", position: "top" }} />
              )}
              <ReferenceLine x={Math.round(selectedGroup.totalQuantity)} stroke="hsl(30,90%,50%)" strokeDasharray="4 4" strokeWidth={2}
                label={{ value: `현재 (${Math.round(selectedGroup.totalQuantity).toLocaleString()}${selectedGroup.unit})`, fontSize: 10, fill: "hsl(30,90%,50%)", position: "top" }} />
            </ComposedChart>
            ) : (
            /* === 전사 금액 기반 영업이익 직선 === */
            <ComposedChart data={cvpChartData} margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="매출" type="number" domain={[0, "dataMax"]} tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)}
                label={{ value: "매출액", position: "insideBottomRight", offset: -5, fontSize: 10, fill: "hsl(0,0%,50%)" }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} label={{ value: "영업이익", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "hsl(0,0%,50%)" }} />
              <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any, name: any) => [formatCurrency(Number(v)), name]} labelFormatter={(v) => `매출: ${formatCurrency(Number(v))}`} />
              <ReferenceLine y={0} stroke="hsl(0,0%,50%)" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "손익분기선 (이익=0)", fontSize: 9, fill: "hsl(0,0%,50%)", position: "right" }} />
              <Legend verticalAlign="top" height={24} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="영업이익" name="영업이익 (매출×CM률−고정비)" stroke="hsl(217,91%,60%)" strokeWidth={2.5} dot={false} />
              {isFinite(cvpSummary.bepRevenue) && cvpSummary.bepRevenue > 0 && (
                <ReferenceLine x={Math.round(cvpSummary.bepRevenue)} stroke="hsl(0,84%,55%)" strokeDasharray="3 3" strokeWidth={2}
                  label={{ value: `BEP (${formatCurrency(cvpSummary.bepRevenue, true)})`, fontSize: 10, fill: "hsl(0,84%,55%)", position: "top" }} />
              )}
              <ReferenceLine x={Math.round(cvpSummary.totalRevenue)} stroke="hsl(142,71%,42%)" strokeDasharray="4 4" strokeWidth={2}
                label={{ value: `현재 (${formatCurrency(cvpSummary.totalRevenue, true)})`, fontSize: 10, fill: "hsl(142,71%,42%)", position: "top" }} />
            </ComposedChart>
            )}
          </ChartContainer>
          {/* 단일 라인(영업이익) + ReferenceLine이라 범례 불필요 — 해석 가이드에서 설명 */}
        </ChartCard>

        {/* CVP 핵심 인사이트 해석 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">현재 영업이익</p>
            <p className={`text-lg font-bold ${cvpInsight.opProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(cvpInsight.opProfit)}
            </p>
            <p className="text-[10px] text-muted-foreground">(영업이익률 {safeFixed(cvpInsight.opProfitRate, 1)}%)</p>
          </div>
          <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">BEP 매출 (손익분기)</p>
            <p className="text-lg font-bold text-blue-600">
              {isFinite(cvpSummary.bepRevenue) ? formatCurrency(cvpSummary.bepRevenue) : "도달 불가"}
            </p>
            <p className="text-[10px] text-muted-foreground">이 매출 이상이면 흑자</p>
          </div>
          <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">안전한계율</p>
            <p className={`text-lg font-bold ${cvpInsight.safetyMargin > 30 ? "text-emerald-600" : cvpInsight.safetyMargin > 10 ? "text-amber-600" : "text-red-600"}`}>
              {safeFixed(cvpInsight.safetyMargin, 1)}%
            </p>
            <p className="text-[10px] text-muted-foreground">(현재−BEP)/현재 · 30%↑ 양호</p>
          </div>
          <div className="rounded-lg border bg-gray-50/50 dark:bg-gray-950/20 p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">변동비율</p>
            <p className="text-lg font-bold">{safeFixed(cvpSummary.overallVariableCostRatio * 100, 1)}%</p>
            <p className="text-[10px] text-muted-foreground">매출 1원당 변동비 부담</p>
          </div>
        </div>

        {/* 차트 해석 가이드 */}
        <div className="rounded-md border bg-muted/20 p-3 mt-3 text-xs text-muted-foreground">
          <strong className="text-foreground">📊 차트 읽는 법 (30초 가이드):</strong>
          <div className="mt-2 p-2 bg-emerald-50/50 dark:bg-emerald-950/20 rounded border-l-2 border-emerald-500">
            <ul className="space-y-1.5 ml-1">
              <li><strong style={{ color: "hsl(217,91%,60%)" }}>파란 실선</strong> = <strong>영업이익</strong>. 매출이 늘수록 이익도 비례하여 증가하는 직선</li>
              <li><strong>0선(수평 점선) 위 = <span className="text-emerald-600">흑자</span></strong>, 아래 = <span className="text-red-600">적자</span></li>
              <li><strong style={{ color: "hsl(0,84%,55%)" }}>빨간 BEP 수직선</strong> = 이익이 0이 되는 <strong>손익분기 매출</strong></li>
              <li><strong style={{ color: "hsl(142,71%,42%)" }}>녹색 현재 수직선</strong> = 현재 실적 매출 위치</li>
              <li>직선의 <strong>기울기</strong> = 공헌이익률 ({safeFixed(cvpSummary.overallContributionMarginRatio * 100, 1)}%). 가파를수록 매출 1원당 이익 증가 빠름</li>
              <li>직선의 <strong>Y절편</strong>(매출 0일 때) = −고정비 ({formatCurrency(-totalFixedCost)})</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ═══ Section C: Step 3. 수익성 산점도 ═══ */}
      <div id="offset-step3">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold">Step 3. 거래처×품목 4사분면 매트릭스</h2>
          <details className="text-xs relative">
            <summary className="cursor-pointer px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200">
              🔍 데이터 출처
            </summary>
            <div className="absolute z-20 mt-1 p-3 border rounded bg-background shadow-lg w-[420px] max-w-[90vw]">
              <p className="font-semibold text-[11px] mb-1">📂 100. 거래처별품목별손익</p>
              <table className="w-full text-[10px] mt-2">
                <tbody>
                  <tr className="border-b"><td className="py-1 pr-2">X축 (매출액)</td><td className="font-mono">[100.매출액·실적] — 거래처×품목 집계</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">Y축 (공헌이익률%)</td><td className="font-mono">([100.매출액]−[100.변동비]) / [100.매출액] × 100</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">공헌이익</td><td className="font-mono">[100.매출액] − [100.변동비(매출원가+판관변동)]</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">변동비</td><td className="font-mono">[100.매출액−매출총이익] + [100.판관변동_직접판매운반비]</td></tr>
                  <tr><td className="py-1 pr-2">사분면</td><td className="text-[10px]">Star/CashCow/Question/Dog (공헌률·매출 median 기준)</td></tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">📖 이 차트 읽는 법:</strong> 각 점(버블)은 거래처×품목 조합. X축=매출액, Y축=공헌이익률, 크기=매출 비중. 금액 기반이므로 이종 단위(KG/ROL/CAN) 혼합 시에도 정확히 비교됩니다.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded p-2">
              <strong className="text-emerald-700 dark:text-emerald-400">⭐ Star (우상단)</strong>: 고매출+고마진. 핵심 자원 집중 및 관계 강화 대상
            </div>
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded p-2">
              <strong className="text-blue-700 dark:text-blue-400">💰 CashCow (우하단)</strong>: 고매출+저마진. 안정적 현금흐름, 마진 개선 여지 검토
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2">
              <strong className="text-amber-700 dark:text-amber-400">❓ Question (좌상단)</strong>: 저매출+고마진. 물량 확대로 매출 기여도 증대 기회
            </div>
            <div className="bg-red-50 dark:bg-red-950/30 rounded p-2">
              <strong className="text-red-700 dark:text-red-400">☠️ Dog (좌하단)</strong>: 저매출+저마진. <strong>쥐약 거래</strong> — 단가 재협상 또는 거래 축소
            </div>
          </div>
          <p className="pt-1"><strong className="text-foreground">💡 해석:</strong> Y축 0 이하(빨간 점선 아래) 품목은 <strong>팔수록 손해</strong>인 품목입니다. Step 4a/4b 시뮬레이터에서 이들을 대상으로 시나리오를 돌려 개선 효과를 검증하세요.</p>
        </div>
        <ChartCard
          title="매출 × 공헌이익률 (버블 = 매출 비중)"
          formula="X축: [100.매출액·실적], Y축: ([100.매출액]−[100.변동비]) / [100.매출] × 100 (공헌이익률%) | 중앙값으로 4사분면 분할"
          description={`Star ${scatterData.star.length} / CashCow ${scatterData.cashcow.length} / Question ${scatterData.question.length} / Dog ${scatterData.dog.length}${cvpItems.length > 500 ? ` (전체 ${cvpItems.length}건 중 500건 표시)` : ""}`}
          benchmark="Dog 사분면(특히 Y축 0 이하) = 쥐약 거래처. 즉각 재검토 대상"
          reason="어떤 거래처·품목이 물량은 있지만 마진이 마이너스인지 즉각 식별"
        >
          <ChartContainer height="h-80">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis type="number" dataKey="x" name="매출" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} label={{ value: "매출액", position: "bottom", offset: 0, fontSize: 11 }} />
              <YAxis type="number" dataKey="y" name="공헌이익률(%)" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(0)}%`} label={{ value: "공헌이익률(%)", angle: -90, position: "insideLeft", fontSize: 11 }} />
              <ZAxis type="number" dataKey="z" range={[20, Math.min(500, Math.max(200, cvpItems.length < 50 ? 400 : 250))]} />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                content={({ active, payload }: any) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-2 text-xs shadow-md space-y-1">
                      <p className="font-semibold max-w-[300px] break-words">{d.fullItemName || d.fullName}</p>
                      <p>매출: {formatCurrency(d.revenue)}</p>
                      <p className={d.cmRatio >= 0 ? "text-green-600" : "text-red-600 font-bold"}>
                        공헌이익률: {safeFixed(d.cmRatio, 1)}%
                      </p>
                      <p>공헌이익: {formatCurrency(d.totalCM)}</p>
                    </div>
                  );
                }}
              />
              <ReferenceLine y={0} stroke="hsl(0, 84%, 60%)" strokeDasharray="3 3" strokeWidth={1} label={{ value: "CM률=0%", position: "right", fontSize: 9, fill: "hsl(0, 84%, 60%)" }} />
              {(["star", "cashcow", "question", "dog"] as const).map((q) => (
                <Scatter key={q} name={QUADRANT_LABELS[q]} data={scatterData[q]} fill={QUADRANT_COLORS[q]} {...ANIMATION_CONFIG} />
              ))}
            </ScatterChart>
          </ChartContainer>
        </ChartCard>

        {/* Dog 테이블 */}
        {dogItems.length > 0 && (
          <ChartCard
            title={`쥐약 품목 (출혈 거래) — ${showAllDogs ? allDogItems.length : Math.min(20, allDogItems.length)}건`}
            isEmpty={false}
            formula="[100.매출액]−[100.변동비] ≤ 0인 거래처×품목 · 공헌이익 오름차순"
            description="단가 협상 또는 거래 축소 우선 대상"
            benchmark="Top 5는 즉각 조치 필요"
            reason="시뮬레이션 대상 후보를 빠르게 선별"
            action={
              <ExportButton
                data={dogItems.map((it) => ({
                  거래처: it.customerName,
                  품목: it.itemName,
                  매출: it.revenue,
                  변동비: it.variableCost,
                  "SGA변동비": it.sgaVariableCost,
                  단가: it.unitPrice,
                  단위변동비: it.unitVariableCost,
                  단위공헌이익: it.unitContributionMargin,
                  공헌이익: it.totalContributionMargin,
                  "공헌이익률(%)": +(it.contributionMarginRatio * 100).toFixed(1),
                }))}
                fileName="쥐약품목_Dog"
                className="h-7 text-xs"
              />
            }
          >
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto mt-3">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-background z-10">
                  <tr className="border-b text-left">
                    <th className="p-2">거래처</th>
                    <th className="p-2">품목</th>
                    <th className="p-2 text-right">매출</th>
                    <th className="p-2 text-right">공헌이익률</th>
                    <th className="p-2 text-right">공헌이익</th>
                    <th className="p-2">사분면</th>
                  </tr>
                </thead>
                <tbody>
                  {dogItems.map((it, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50">
                      <td className="p-2">{truncateLabel(it.customerName, 12)}</td>
                      <td className="p-2">{truncateLabel(it.itemName, 15)}</td>
                      <td className="p-2 text-right">{formatCurrency(it.revenue)}</td>
                      <td className={`p-2 text-right font-semibold ${it.contributionMarginRatio >= 0 ? "text-amber-600" : "text-red-600"}`}>
                        {safeFixed(it.contributionMarginRatio * 100, 1)}%
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
              {allDogItems.length > 20 && (
                <div className="text-center mt-2">
                  <button
                    onClick={() => setShowAllDogs(!showAllDogs)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showAllDogs ? `상위 ${Math.min(20, allDogItems.length)}건만 보기` : `전체 ${allDogItems.length}건 보기`}
                  </button>
                </div>
              )}
            </div>
          </ChartCard>
        )}
      </div>

      {/* ═══ Section D: Step 4a. 전사 영업이익 시뮬레이션 (총액 관점) ═══ */}
      <div id="offset-step4a">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="text-lg font-semibold">Step 4a. 전사 영업이익 시뮬레이션 (총액 관점)</h2>
          <details className="text-xs relative">
            <summary className="cursor-pointer px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200">
              🔍 데이터 출처
            </summary>
            <div className="absolute z-20 mt-1 p-3 border rounded bg-background shadow-lg w-[480px] max-w-[90vw]">
              <p className="font-semibold text-[11px] mb-1">📂 100 (매출/변동비) + 200 (고정비)</p>
              <table className="w-full text-[10px] mt-2">
                <tbody>
                  <tr className="border-b"><td className="py-1 pr-2">기존 영업이익</td><td className="font-mono">Σ[100.매출액·실적] − Σ[100.변동비] − Σ[200.고정비]</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">단가 인하 손실</td><td className="font-mono">Σ(기존수량 × 단가 × priceChangePct%) (대상만)</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">물량 증가 공헌</td><td className="font-mono">Σ(추가수량 × 인하후 단위공헌) (대상만)</td></tr>
                  <tr className="border-b"><td className="py-1 pr-2">최종 영업이익</td><td className="font-mono">기존 + 단가손실 + 물량공헌</td></tr>
                  <tr><td colSpan={2} className="py-1 pr-2 text-[10px] text-muted-foreground pt-1">※ 고정비 총액 불변 가정 (설비 캐파 내)</td></tr>
                </tbody>
              </table>
              <p className="text-[10px] mt-2 font-mono border-t pt-1">항등식: netOP ≡ priceLoss + volumeGain</p>
            </div>
          </details>
        </div>
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
                onChange={(e) => { setTargetItem(e.target.value || null); if (!e.target.value) setInputMode("percent"); setVolumeAbsolute(0); setPriceChangeDirect(0); }}
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

          {/* 입력 모드 토글 */}
          {targetItem && (
            <div className="flex items-center gap-3 text-xs">
              <span className="font-semibold min-w-[90px]">입력 모드:</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" checked={inputMode === "percent"} onChange={() => { setInputMode("percent"); setVolumeAbsolute(0); }} />
                비율(%)
              </label>
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="radio" checked={inputMode === "absolute"} onChange={() => { setInputMode("absolute"); setPriceChangeDirect(priceChangePct); }} />
                절대 수량
              </label>
              {inputMode === "absolute" && (() => {
                const sel = itemList.find((i) => i.code === targetItem);
                return sel ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                    현재 {sel.quantity.toLocaleString()} {sel.unit || "개"}
                  </span>
                ) : null;
              })()}
            </div>
          )}

          {/* 슬라이더 (비율 모드) / 직접 입력 (절대 수량 모드) */}
          {inputMode === "percent" || !targetItem ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[90px]">물량 증감:</span>
                <input
                  type="range" min={-50} max={100} step={0.5}
                  value={volumeIncreasePct}
                  onChange={(e) => setVolumeIncreasePct(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <input type="number" value={volumeIncreasePct} onChange={(e) => setVolumeIncreasePct(Number(e.target.value))}
                  className="w-16 text-xs text-right border rounded px-1 py-0.5 bg-background tabular-nums" step={0.5} min={-50} max={200} />
                <span className="text-xs">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[90px]">단가 조정:</span>
                <input
                  type="range" min={-30} max={30} step={0.5}
                  value={priceChangePct}
                  onChange={(e) => setPriceChangePct(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <input type="number" value={priceChangePct} onChange={(e) => setPriceChangePct(Number(e.target.value))}
                  className="w-16 text-xs text-right border rounded px-1 py-0.5 bg-background tabular-nums" step={0.5} min={-50} max={50} />
                <span className="text-xs">%</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(() => {
                const sel = itemList.find((i) => i.code === targetItem);
                const unitLabel = sel?.unit || "개";
                const currentQty = sel?.quantity || 0;
                return (<>
                  <div className="flex items-center gap-2">
                    <span className="text-xs min-w-[90px]">추가 수량:</span>
                    <input type="number" value={volumeAbsolute}
                      onChange={(e) => setVolumeAbsolute(Number(e.target.value))}
                      className="flex-1 text-xs border rounded px-2 py-1 bg-background tabular-nums"
                      step={unitLabel === "KG" || unitLabel === "L" ? 1000 : unitLabel === "TON" ? 100 : 10}
                    />
                    <span className="text-xs font-semibold">{unitLabel}</span>
                    <span className="text-[10px] text-muted-foreground">(→ 합계 {(currentQty + volumeAbsolute).toLocaleString()} {unitLabel})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs min-w-[90px]">단가 조정:</span>
                    <input type="number" value={priceChangeDirect}
                      onChange={(e) => setPriceChangeDirect(Number(e.target.value))}
                      className="flex-1 text-xs border rounded px-2 py-1 bg-background tabular-nums"
                      step={0.5} min={-50} max={50}
                    />
                    <span className="text-xs">%</span>
                  </div>
                </>);
              })()}
            </div>
          )}

          {/* 프리셋 */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(0); setPriceChangePct(0); setVolumeAbsolute(0); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">초기화</button>
            <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(30); setPriceChangePct(-10); setPriceChangeDirect(-10); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">🎯 적극적 (+30%/-10%)</button>
            <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(50); setPriceChangePct(-15); setPriceChangeDirect(-15); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">⚡ 공격적 (+50%/-15%)</button>
            <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(20); setPriceChangePct(-5); setPriceChangeDirect(-5); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">🛡️ 방어적 (+20%/-5%)</button>
            <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(-10); setPriceChangePct(10); setPriceChangeDirect(10); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">📈 단가 인상 (-10%/+10%)</button>
          </div>
        </div>

        {/* 실시간 KPI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard
            title="기존 영업이익" value={totalSim.baseOperatingProfit} format="currency"
            formula="Σ[100.매출액·실적] − Σ[100.변동비] − Σ[200.제조고정비]"
            description="시나리오 적용 전 전사 영업이익"
            benchmark="시뮬레이션의 기준선"
            reason="변화 전 영업이익을 명확히 표시"
          />
          <KpiCard
            title={totalSim.priceReductionLoss >= 0 ? "단가 효과 (이득)" : "단가 효과 (손실)"} value={totalSim.priceReductionLoss} format="currency"
            formula="Σ([100.매출수량·실적] × [100.단위단가] × priceChangePct%) · 대상 품목/거래처만"
            description="대상 품목의 단가 인하로 인한 매출 감소"
            benchmark="이 손실을 물량 증가 공헌이 상쇄해야 가설 성립"
            reason="저가수주의 직접 비용"
          />
          <KpiCard
            title={totalSim.volumeContributionGain >= 0 ? "물량 효과 (공헌)" : "물량 효과 (감소)"} value={totalSim.volumeContributionGain} format="currency"
            formula="Σ(추가수량 × (인하단가 − [100.단위변동비])) · 대상 품목/거래처만"
            description="대상 품목 물량 증가로 인한 공헌이익 증가"
            benchmark="단가 인하 손실보다 커야 가설 성립"
            reason="박리다매의 실질적 이익"
          />
          <KpiCard
            title="최종 영업이익" value={totalSim.newOperatingProfit}
            previousValue={totalSim.baseOperatingProfit}
            format="currency"
            formula="Σ[100.매출액·실적] − Σ[100.변동비] − Σ[200.제조고정비] + Δ(가격효과) + Δ(물량공헌) · [200.고정비] 총액 불변"
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
            <li><strong className="text-foreground">② 단가 효과</strong>: 단가 변동에 따른 매출 변화 (인하 시 빨강/손실, 인상 시 녹색/이득)</li>
            <li><strong className="text-foreground">③ 물량 효과</strong>: 물량 변동 × 조정 후 단위공헌이익 (증가 시 파랑/공헌, 감소 시 빨강/손실)</li>
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
              <ReferenceLine y={0} stroke="hsl(0, 0%, 60%)" strokeDasharray="3 3" />
              <Bar dataKey="base" stackId="wf" fill="transparent" />
              <Bar dataKey="value" stackId="wf" radius={BAR_RADIUS_TOP} {...ANIMATION_CONFIG}>
                {waterfall.map((w, i) => <Cell key={i} fill={w.fill} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
        </ChartCard>

        {/* A4: 가설 검증 메시지 — 3단계 (성립/중립/반증) */}
        {(() => {
          const r = totalSim.hypothesisResult;
          const cfg = r === "positive"
            ? { bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300", Icon: CheckCircle2, iconCls: "text-emerald-600",
                title: `✓ 박리다매 가설 성립 — 상계 효과 +${formatCurrency(totalSim.netOffsetEffect)}`,
                desc: "물량 증가로 인한 공헌이익 증가가 단가 인하 손실을 상쇄하여 전사 영업이익이 개선됩니다. 단, 고정비 총액은 현재 설비 캐파 내 생산을 전제로 불변 가정입니다." }
            : r === "neutral"
              ? { bg: "bg-gray-50 dark:bg-gray-950/30 border-gray-300", Icon: Info, iconCls: "text-gray-500",
                  title: "— 효과 없음 (중립) — 슬라이더를 조작하여 시나리오를 설정하세요",
                  desc: "물량/단가 변동이 0이거나, 변동 효과가 정확히 상쇄되어 전사 영업이익에 변화가 없습니다." }
              : { bg: "bg-red-50 dark:bg-red-950/30 border-red-300", Icon: XCircle, iconCls: "text-red-600",
                  title: `✗ 박리다매 가설 반증 — 상계 효과 ${formatCurrency(totalSim.netOffsetEffect)}`,
                  desc: "물량 증가에도 불구하고 단가 인하 손실이 더 커서 전사 영업이익이 악화됩니다. 단가 인하 폭을 줄이거나, 물량 증가 목표를 더 높여야 합니다." };
          return (
            <div className={`mt-4 rounded-lg border p-4 ${cfg.bg}`}>
              <div className="flex items-start gap-3">
                <cfg.Icon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${cfg.iconCls}`} />
                <div className="text-sm">
                  <p className="font-semibold mb-1">{cfg.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{cfg.desc}</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ 시나리오 비교 ═══ */}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => {
            if (savedScenarios.length >= 3) return;
            const effectivePrice = inputMode === "absolute" ? priceChangeDirect : priceChangePct;
            const label = `S${savedScenarios.length + 1}: ${targetCustomer ? "거래처" : "전체"}/${targetItem ? "품목" : "전체"} vol${inputMode === "absolute" ? `+${volumeAbsolute}` : `${volumeIncreasePct}%`} price${effectivePrice}%`;
            setSavedScenarios((prev) => [...prev, {
              label,
              params: { customer: targetCustomer, item: targetItem, volPct: volumeIncreasePct, pricePct: effectivePrice, mode: inputMode },
              result: { baseOP: totalSim.baseOperatingProfit, newOP: totalSim.newOperatingProfit, netEffect: totalSim.netOffsetEffect, hypothesis: totalSim.hypothesisResult },
            }]);
          }}
          disabled={savedScenarios.length >= 3}
          className="px-2 py-1 rounded text-[10px] border hover:bg-muted disabled:opacity-40"
        >
          💾 현재 시나리오 저장 ({savedScenarios.length}/3)
        </button>
        {savedScenarios.length > 0 && (
          <button
            onClick={() => setSavedScenarios([])}
            className="px-2 py-1 rounded text-[10px] border hover:bg-muted text-red-600"
          >
            초기화
          </button>
        )}
      </div>
      {savedScenarios.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-3 mt-2">
          <h4 className="text-xs font-semibold mb-2">📋 저장된 시나리오 비교</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-1.5">시나리오</th>
                <th className="p-1.5 text-right">기존 OP</th>
                <th className="p-1.5 text-right">시뮬 OP</th>
                <th className="p-1.5 text-right">순효과</th>
                <th className="p-1.5">판정</th>
              </tr>
            </thead>
            <tbody>
              {savedScenarios.map((s, i) => (
                <tr key={i} className="border-b hover:bg-muted/30">
                  <td className="p-1.5 font-mono text-[10px]">{s.label}</td>
                  <td className="p-1.5 text-right font-mono">{formatCurrency(s.result.baseOP)}</td>
                  <td className="p-1.5 text-right font-mono">{formatCurrency(s.result.newOP)}</td>
                  <td className={`p-1.5 text-right font-mono font-semibold ${s.result.netEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatCurrency(s.result.netEffect)}
                  </td>
                  <td className="p-1.5">{s.result.hypothesis === "positive" ? "🟢" : s.result.hypothesis === "neutral" ? "⚪" : "🔴"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ 감도 분석 미니 그리드 ═══ */}
      {sensitivityGrid.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-4 mb-2">
          <h4 className="text-sm font-semibold mb-2">📊 단가 변동 감도 분석 — &quot;단가 X% 인하 시 손익분기를 맞추려면 물량 몇 % 증가 필요?&quot;</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-1.5">단가 변동</th>
                  <th className="p-1.5 text-right">0% 물량 시 효과</th>
                  <th className="p-1.5 text-right">필요 물량 증가율</th>
                  <th className="p-1.5">판정</th>
                </tr>
              </thead>
              <tbody>
                {sensitivityGrid.map((cell) => (
                  <tr key={cell.priceChangePct} className="border-b hover:bg-muted/30">
                    <td className={`p-1.5 font-mono ${cell.priceChangePct < 0 ? "text-red-600" : "text-green-600"}`}>
                      {cell.priceChangePct > 0 ? "+" : ""}{cell.priceChangePct}%
                    </td>
                    <td className={`p-1.5 text-right font-mono ${cell.netEffect >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(cell.netEffect)}
                    </td>
                    <td className="p-1.5 text-right font-mono font-semibold">
                      {cell.requiredVolumePct === 0 ? "불필요" : !isFinite(cell.requiredVolumePct) ? "불가능" : `+${cell.requiredVolumePct}%`}
                    </td>
                    <td className="p-1.5 text-[10px]">
                      {cell.requiredVolumePct === 0
                        ? "🟢 이득"
                        : !isFinite(cell.requiredVolumePct)
                          ? "⛔ 불가능"
                          : cell.requiredVolumePct <= 30
                            ? "🟡 실현 가능"
                            : cell.requiredVolumePct <= 100
                              ? "🟠 도전적"
                            : "🔴 비현실적"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">※ 선택한 대상 기준. 고정비 불변, 변동비율 현행 가정. 물량 증가율 500% 초과 시 &quot;비현실적&quot; 처리.</p>
        </div>
      )}

      {/* ═══ Section E: Step 4b. 덤으로 따라오는 효과 (영업사원 친화 UI) ═══ */}
      {filteredItemProfitability && filteredItemProfitability.length > 0 && (
        <div id="offset-step4b">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-lg font-semibold">🎁 Step 4b. 덤으로 따라오는 효과 — 다른 품목들의 원가 여유</h2>
            <details className="text-xs relative">
              <summary className="cursor-pointer px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200">
                🔍 데이터 출처
              </summary>
              <div className="absolute z-20 mt-1 p-3 border rounded bg-background shadow-lg w-[480px] max-w-[90vw]">
                <p className="font-semibold text-[11px] mb-1">📂 200. 품목별수익성분석(회계)</p>
                <table className="w-full text-[10px] mt-2">
                  <tbody>
                    <tr className="border-b"><td className="py-1 pr-2">풀 필터</td><td className="font-mono">[200.대분류] or [200.중분류] or [200.품목계정그룹]</td></tr>
                    <tr className="border-b"><td className="py-1 pr-2">품목 수량/매출</td><td className="font-mono">[200.매출수량], [200.매출액]</td></tr>
                    <tr className="border-b"><td className="py-1 pr-2">품목 고정비</td><td className="font-mono">[200.제조고정노무비] + [200.감가상각비] + [200.기타경비]</td></tr>
                    <tr className="border-b"><td className="py-1 pr-2">품목 변동비</td><td className="font-mono">[200.실적매출원가] − 품목 고정비</td></tr>
                    <tr className="border-b"><td className="py-1 pr-2">배분 고정비</td><td className="font-mono">풀고정비 × (품목 weight / 풀 weight)</td></tr>
                    <tr className="border-b"><td className="py-1 pr-2">weight</td><td className="font-mono">매출(basis=revenue) or 수량(basis=quantity)</td></tr>
                    <tr><td className="py-1 pr-2">장부상 마진</td><td className="font-mono">매출 − 변동비 − 배분 고정비</td></tr>
                  </tbody>
                </table>
                <p className="text-[10px] mt-2 font-mono border-t pt-1">항등식: netPool ≡ targetDelta + othersDelta</p>
              </div>
            </details>
          </div>

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
          {targetItem && poolName && poolItems.length === 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 mb-4">
              <strong>⚠️ 풀 &quot;{poolName}&quot;에 해당 품목이 없습니다.</strong> 다른 풀 계층 또는 이름을 선택해 주세요.
            </div>
          )}
          {poolWarnings.length > 0 && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 mb-4">
              ⚠️ 품목 코드 정규화 경고 {poolWarnings.length}건 — 200 보고서의 품목 형식이 &quot;[코드] 이름&quot;과 다른 항목이 있어 100↔200 간 키 매칭이 부정확할 수 있습니다.
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
            {/* M4: 배분 기준 변경 안내 */}
            <p className="text-[10px] text-muted-foreground mt-1">
              ※ 배분 기준(매출/수량) 변경은 장부상 품목별 배분만 영향. 전사 이익(Step 4a)은 불변.
            </p>
            {allocationBasis === "quantity" && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                ⚠️ 수량 기준 배분 주의: 풀 내 품목의 단위(KG/ROL/CAN/L 등)가 다르면 수량 비중이 왜곡될 수 있습니다. 이종 단위 제품군에서는 &quot;매출 비중&quot; 배분을 권장합니다.
              </p>
            )}
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
                    {priceChangePct !== 0 && <> {volumeIncreasePct !== 0 ? ", 단가를 " : "단가를 "}<strong>{priceChangePct}%</strong></>}
                    {volumeIncreasePct === 0 && priceChangePct === 0 && " 변동 없이"}
                    {(volumeIncreasePct !== 0 || priceChangePct !== 0) && " 조정하면,"}
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
              formula="대상 품목의 [시나리오 장부상 마진 − 기준 장부상 마진] · 장부상 마진 = [200.매출액] − [200.변동비] − 배분고정비(200)"
              description="저가수주를 받은 품목 본인의 장부상 마진 변화. 단가 인하 손실이 있으면 보통 음수, 순수 물량 증가면 양수가 될 수도 있음."
              benchmark="음수여도 괜찮음 — 물량 증가로 다른 품목들에게 덤을 주는 역할이므로"
              reason="저가수주의 직접 비용/효과를 장부에서 확인"
            />
            <KpiCard
              title="② 다른 품목들 (덤 효과)" value={poolSim.otherItemsMarginDelta} format="currency"
              formula="Σ(풀 내 대상 외 품목의 장부상 마진 변화) · 대상 물량 증가 시 매출/수량 비중 재배분으로 [200.제조고정비]의 품목별 '몫'이 줄어듦"
              description={`풀 내 나머지 ${Math.max(poolItems.length - 1, 0)}개 품목 전체의 장부상 마진 개선 합계. 대상 품목 판매량이 늘면 풀 전체 매출 비중이 바뀌어 다른 품목들의 '단위 고정비'가 줄어듭니다.`}
              benchmark="양수면 덤 효과 성립 — 다른 품목 담당 동료에게도 도움"
              reason="박리다매 가설의 '교차 보조 효과'를 장부에서 확인"
            />
            <KpiCard
              title="③ 제품군 전체 (① + ②)" value={poolSim.netPoolMarginDelta} format="currency"
              formula="① + ② = 풀(대분류/중분류/품목계정그룹) 내 모든 품목의 장부상 마진 변화 합계 · 풀 [200.제조고정비] 총액 불변"
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

                {poolSim.baseItems.length > 11 && (
                  <div className="text-center mt-2">
                    <button
                      onClick={() => setShowAllPool(!showAllPool)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {showAllPool ? "상위 11건만 보기" : `전체 ${poolSim.baseItems.length}건 보기`}
                    </button>
                  </div>
                )}

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
        <div id="offset-step5">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-lg font-semibold">Step 5. 데이터 무결성 검증</h2>
            <details className="text-xs relative">
              <summary className="cursor-pointer px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200">
                🔍 검증 방법
              </summary>
              <div className="absolute z-20 mt-1 p-3 border rounded bg-background shadow-lg w-[460px] max-w-[90vw]">
                <p className="font-semibold text-[11px] mb-1">🔬 각 관점의 내부 항등식 검증</p>
                <div className="space-y-2 mt-2 text-[11px]">
                  <div className="border-l-2 border-blue-500 pl-2">
                    <p className="font-semibold">Step 4a 총액 항등식</p>
                    <p className="font-mono text-[10px]">netOffsetEffect ≡ priceLoss + volumeGain</p>
                    <p className="text-[10px] text-muted-foreground">오차 ≥ |baseOP|×0.1% 이면 경고</p>
                  </div>
                  <div className="border-l-2 border-emerald-500 pl-2">
                    <p className="font-semibold">Step 4b 배분 항등식</p>
                    <p className="font-mono text-[10px]">netPoolMarginDelta ≡ targetDelta + othersDelta</p>
                    <p className="text-[10px] text-muted-foreground">풀 고정비 불변이므로 정의상 성립</p>
                  </div>
                </div>
                <p className="text-[10px] mt-2 text-muted-foreground border-t pt-1">
                  ⚠️ 4a(총액 관점)는 전사 100 보고서의 모든 거래처×품목 기반, 4b(배분 관점)는 200 보고서의 제품군 풀(동일 단위 그룹) 기반으로 범위가 다릅니다. 합계 비교는 의미 없고, 각각의 항등식(내부 수학적 일관성)만 검증합니다.
                </p>
              </div>
            </details>
          </div>
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
