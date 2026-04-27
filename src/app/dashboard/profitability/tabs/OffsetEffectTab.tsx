"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Cell, Legend,
  ComposedChart, Line, ReferenceLine,
  ScatterChart, Scatter, ZAxis,
  PieChart, Pie, ResponsiveContainer,
} from "recharts";
import { ChartContainer, GRID_PROPS, BAR_RADIUS_TOP, ANIMATION_CONFIG, truncateLabel } from "@/components/charts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MetricInfo } from "@/components/dashboard/MetricInfo";
import { TrendingUp, AlertTriangle, DollarSign, Package, CheckCircle2, XCircle, Info } from "lucide-react";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { formatCurrency, CHART_COLORS, TOOLTIP_STYLE, safeFixed, RISK_COLORS, safeDivide } from "@/lib/utils";
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
  type CVPItem,
  type CVPSummary,
  calcSensitivityGrid,
} from "@/lib/analysis/offsetEffect";
import type { CustomerItemDetailRecord, ItemProfitabilityRecord } from "@/types";
import { calcCapacityUtilization } from "@/lib/analysis/lowPriceVerification";
import { calcHypothesisVerdict, calcComprehensiveVerdict, calcCustomerPortfolioOffset, calcQuickVerdict, type QuickVerdict, calcMonteCarloVerdict, type MonteCarloVerdict } from "@/lib/analysis/offsetEffect";
import { FALLBACK_CV as FALLBACK_CV_UI } from "@/lib/analysis/monteCarlo";
import { suggestItemCapacity, calcCapacityAlert, type CapacityConfig } from "@/lib/analysis/capacity";
import { estimatePED, pedSummaryLabel, applyPED, type PEDResult } from "@/lib/analysis/priceElasticity";
import { calcCustomerLTVImpact, buildLTVMap, buildChurnMap, ltvConfidenceLabel, riskLevelLabel, type CustomerLTVImpact } from "@/lib/analysis/customerLTV";
import { calcAllPresets, presetLabel, type CompetitorScenario, type PresetComparison } from "@/lib/analysis/competitorResponse";
import { calcTimeSeriesSimulation, summarizeBEP, DEFAULT_LEARNING_RATE, DEFAULT_LAG_MONTHS, type TimeSeriesSimulationResult } from "@/lib/analysis/timeSeriesSimulation";
import {
  calcCannibalizationMatrix,
  applyCannibalCorrection,
  buildCategoryMap,
  cannibalIntensityLabel,
  PRESETS as CANNIBAL_PRESETS,
  type CannibalizationResult,
  type CannibalCorrectionResult,
  type CannibalScenario,
} from "@/lib/analysis/cannibalization";
import { calcClv } from "@/lib/analysis/clv";
import { predictChurn } from "@/lib/analysis/churnPrediction";
import { useDataStore } from "@/stores/dataStore";

interface OffsetEffectTabProps {
  filteredCustItemDetail: CustomerItemDetailRecord[];
  filteredItemProfitability?: ItemProfitabilityRecord[];
  rawItemProfitability?: ItemProfitabilityRecord[];
  isDateFiltered?: boolean;
  // v2: page.tsx에서 호이스팅된 CVP (optional — 없으면 내부 계산 fallback)
  cvpItems?: CVPItem[];
  cvpSummary?: CVPSummary;
  totalFixedCost?: number;
  manufacturingCost?: import("@/types").ManufacturingCostRecord[];
  onNavigate?: (tab: string) => void;
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

export function OffsetEffectTab(props: OffsetEffectTabProps) {
  const {
    filteredCustItemDetail,
    filteredItemProfitability,
    rawItemProfitability,
    isDateFiltered,
    onNavigate,
  } = props;
  // 시나리오 상태
  const [targetCustomer, setTargetCustomer] = useState<string | null>(null);
  const [targetItem, setTargetItem] = useState<string | null>(null);
  const [volumeIncreasePct, setVolumeIncreasePct] = useState(0);
  const [priceChangePct, setPriceChangePct] = useState(0);

  // 풀 설정
  const [poolLevel, setPoolLevel] = useState<PoolLevel>("대분류");
  const [poolName, setPoolName] = useState<string>("");
  const [allocationBasis, setAllocationBasis] = useState<FixedCostAllocation>("revenue");

  // 품목/거래처 검색 Combobox (Step 4a 슬라이더 + 저가수주 판단기 공용 바깥 클릭 처리)
  const [itemSearch, setItemSearch] = useState("");
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [custPickerOpen, setCustPickerOpen] = useState(false);
  // 판단기 품목/거래처 검색 combobox (useEffect 의존성이라 앞쪽 선언 필요)
  const [qdItemSearchOpen, setQdItemSearchOpen] = useState(false);
  const [qdItemSearchText, setQdItemSearchText] = useState("");
  const [qdCustSearchOpen, setQdCustSearchOpen] = useState(false);
  const [qdCustSearchText, setQdCustSearchText] = useState("");

  // Combobox 바깥 클릭 닫기
  useEffect(() => {
    if (!itemPickerOpen && !custPickerOpen && !qdItemSearchOpen && !qdCustSearchOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-combobox]")) {
        setItemPickerOpen(false); setCustPickerOpen(false);
        setQdItemSearchOpen(false); setQdCustSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [itemPickerOpen, custPickerOpen, qdItemSearchOpen, qdCustSearchOpen]);

  // 원가 변동 슬라이더
  const [costRawMaterialPct, setCostRawMaterialPct] = useState(0);
  const [costLaborPct, setCostLaborPct] = useState(0);
  const [costOutsourcingPct, setCostOutsourcingPct] = useState(0);

  // 시뮬레이션 입력 모드: "percent" (비율) / "absolute" (절대 수량)
  const [inputMode, setInputMode] = useState<"percent" | "absolute">("percent");
  const [volumeAbsolute, setVolumeAbsolute] = useState<number>(0);
  const [priceChangeDirect, setPriceChangeDirect] = useState<number>(0); // 소수점 직접 입력용

  // 200 전용 품목: 희망 판매단가 직접 입력
  const [manualUnitPrice, setManualUnitPrice] = useState<number>(0);

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

  // ─── 저가수주 판단기 상태 ───
  const [qdProposedPrice, setQdProposedPrice] = useState<number>(0);
  const [qdAdditionalQty, setQdAdditionalQty] = useState<number>(0);
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const detailRef = useRef<HTMLDetailsElement>(null);

  // [C3+M2] Step 4a → Quick Card 역방향 동기화
  useEffect(() => {
    if (inputMode === "absolute" && volumeAbsolute > 0 && volumeAbsolute !== qdAdditionalQty) {
      setQdAdditionalQty(volumeAbsolute);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumeAbsolute, inputMode]);

  useEffect(() => {
    if (priceChangePct !== 0 && currentItemUnitPrice > 0) {
      const newPrice = Math.round(currentItemUnitPrice * (1 + priceChangePct / 100));
      if (newPrice !== qdProposedPrice && newPrice > 0) {
        setQdProposedPrice(newPrice);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceChangePct]);

  const unitGroups = useMemo(
    () => filteredItemProfitability ? getUnitGroups(filteredItemProfitability) : [],
    [filteredItemProfitability]
  );

  const selectedGroup = useMemo(() => {
    if (cvpGroupKey === "__all__" || !filteredItemProfitability) return null;
    const [cat, unit] = cvpGroupKey.split("|");
    return calcGroupCVP(filteredItemProfitability, cat, unit);
  }, [cvpGroupKey, filteredItemProfitability]);

  // 전사 고정비 (제조 고정비) — props 우선, 없으면 내부 계산 (fallback)
  const totalFixedCost = useMemo(
    () => props.totalFixedCost ?? extractManufacturingFixedCost((filteredItemProfitability ?? []) as any),
    [props.totalFixedCost, filteredItemProfitability]
  );

  // CVP 계산 (Step 1~3) — props 우선, 없으면 내부 계산 (fallback)
  const { items: cvpItems, summary: cvpSummary } = useMemo(
    () => props.cvpItems && props.cvpSummary
      ? { items: props.cvpItems, summary: props.cvpSummary }
      : calcCustomerItemCVP(filteredCustItemDetail, totalFixedCost, filteredItemProfitability),
    [props.cvpItems, props.cvpSummary, filteredCustItemDetail, totalFixedCost, filteredItemProfitability]
  );

  // Capacity 추정 (제조원가 + 판매 실적 기반, F2 오버레이용)
  const capacityMap = useMemo(() => {
    if (!props.manufacturingCost || !rawItemProfitability) return new Map<string, number>();
    const cap = calcCapacityUtilization(props.manufacturingCost, rawItemProfitability ?? []);
    const map = new Map<string, number>();
    for (const item of cap.items) {
      map.set(item.item, item.estimatedMonthlyCapacity);
    }
    return map;
  }, [props.manufacturingCost, rawItemProfitability]);

  // 선택된 그룹의 총 Capacity (그룹 내 품목 Capacity 합산)
  const groupCapacity = useMemo(() => {
    if (cvpGroupKey === "__all__" || !filteredItemProfitability || capacityMap.size === 0) return null;
    const [cat, unit] = cvpGroupKey.split("|");
    let total = 0;
    let found = false;
    for (const r of filteredItemProfitability) {
      const rCat = ((r as any).대분류 || "").trim() || "(미분류)";
      const rUnit = ((r as any).기준단위 || "").trim();
      if (rCat === cat && rUnit === unit) {
        const code = ((r.품목 || "").match(/^\[([^\]]+)\]/) || [])[1];
        if (code) {
          const cap = capacityMap.get(code);
          if (cap) { total += cap; found = true; }
        }
      }
    }
    return found ? total : null;
  }, [cvpGroupKey, filteredItemProfitability, capacityMap]);

  // 데이터 기간 라벨 (100 보고서의 매출연월 기준)
  const dataPeriodLabel = useMemo(() => {
    const months = new Set<string>();
    for (const r of filteredCustItemDetail) {
      const m = (r as any).매출연월 || (r as any).month || "";
      if (m) months.add(String(m).slice(0, 7).replace("-", ""));
    }
    if (months.size === 0) return "데이터 없음";
    const sorted = Array.from(months).sort();
    const fmt = (ym: string) => {
      const y = ym.slice(0, 4);
      const m = ym.slice(4, 6) || ym.slice(5, 7);
      return `${y}.${m}`;
    };
    return sorted.length === 1
      ? `${fmt(sorted[0])} 판매단가`
      : `${fmt(sorted[0])}~${fmt(sorted[sorted.length - 1])} 평균 판매단가`;
  }, [filteredCustItemDetail]);

  // 품목별 원가 구성 비율 맵 (원가 변동 시뮬용)
  const vcCostRatioMap = useMemo(() => {
    if (!filteredItemProfitability || filteredItemProfitability.length === 0) return undefined;
    const map = new Map<string, { rawMaterialRatio: number; laborRatio: number; outsourcingRatio: number; overallVCRatio: number }>();
    for (const r of filteredItemProfitability) {
      const raw = (r.품목 || "").trim();
      const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
      const name = match ? match[2].trim() : raw;
      if (!name || map.has(name)) continue;
      const rawMat = (r.원재료비 || 0) + (r.부재료비 || 0) + (r.상품매입 || 0);
      const labor = (r.노무비 || 0) + (r.복리후생비 || 0);
      const outsourcing = r.외주가공비 || 0;
      const total = rawMat + labor + outsourcing + (r.소모품비 || 0) + (r.수도광열비 || 0) +
        (r.수선비 || 0) + (r.연료비 || 0) + (r.운반비 || 0) + (r.전력비 || 0) +
        (r.지급수수료 || 0) + (r.견본비 || 0);
      const totalCost = r.실적매출원가 || 0;
      const overallVCRatio = totalCost > 0 ? Math.min(total / totalCost, 1.0) : 1.0;
      if (total > 0) map.set(name, {
        rawMaterialRatio: rawMat / total, laborRatio: labor / total, outsourcingRatio: outsourcing / total, overallVCRatio,
      });
    }
    return map.size > 0 ? map : undefined;
  }, [filteredItemProfitability]);

  const costChangePct = useMemo(() =>
    (costRawMaterialPct !== 0 || costLaborPct !== 0 || costOutsourcingPct !== 0)
      ? { rawMaterial: costRawMaterialPct, labor: costLaborPct, outsourcing: costOutsourcingPct }
      : undefined,
    [costRawMaterialPct, costLaborPct, costOutsourcingPct]
  );

  // (totalSim, waterfall, sensitivityGrid는 simItems 뒤에 정의 — 아래 참조)

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

  // (integrity는 totalSim 뒤에 정의 — 아래 참조)

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
      .slice(0, 300);
  }, [cvpItems]);

  const itemList = useMemo(() => {
    // cvpItems(100)와 poolItems(200) 모두에서 수집하여 union
    const map = new Map<string, { name: string; revenue: number; inPool: boolean; in100: boolean; quantity: number; unit: string; actualCOGS: number; actualQty200: number; actualUnitCost: number; costRatio: number; grossProfit100: number; unitCost100: number }>();
    for (const it of cvpItems) {
      const prev = map.get(it.item) || { name: it.itemName, revenue: 0, inPool: false, in100: false, quantity: 0, unit: "", actualCOGS: 0, actualQty200: 0, actualUnitCost: 0, costRatio: 0, grossProfit100: 0, unitCost100: 0 };
      prev.revenue += it.revenue;
      prev.quantity += it.quantity;
      prev.grossProfit100 += it.grossProfit;
      prev.in100 = true;
      map.set(it.item, prev);
    }
    // 200 품목도 추가 (풀 내 품목이 4a에서 선택 가능하도록)
    for (const pi of poolItems) {
      const prev = map.get(pi.item) || { name: pi.itemName, revenue: 0, inPool: true, in100: false, quantity: 0, unit: "", actualCOGS: 0, actualQty200: 0, actualUnitCost: 0, costRatio: 0, grossProfit100: 0, unitCost100: 0 };
      if (prev.revenue === 0) prev.revenue = pi.revenue;
      if (prev.quantity === 0) prev.quantity = pi.quantity;
      prev.inPool = true;
      if (!prev.name || prev.name === pi.item) prev.name = pi.itemName;
      map.set(pi.item, prev);
    }
    // 200에서 단위 + 원가 데이터 수집
    if (filteredItemProfitability) {
      // 품목코드별 원가 합산 (다중 조직 대응)
      const costAgg = new Map<string, { cogs: number; qty: number; rev: number }>();
      for (const r of filteredItemProfitability) {
        const raw = (r.품목 || "").trim();
        const codeMatch = raw.match(/^\[([^\]]+)\]/);
        const code = codeMatch ? codeMatch[1].trim() : raw;
        const prev = costAgg.get(code) || { cogs: 0, qty: 0, rev: 0 };
        prev.cogs += r.실적매출원가 || 0;
        prev.qty += r.매출수량 || 0;
        prev.rev += r.매출액 || 0;
        costAgg.set(code, prev);
        // 단위 정보도 병합
        const entry = map.get(code);
        if (entry && !entry.unit && (r as any).기준단위) {
          entry.unit = ((r as any).기준단위 || "").trim();
        }
      }
      // 원가 데이터 병합
      for (const [code, cost] of Array.from(costAgg.entries())) {
        const entry = map.get(code);
        if (entry) {
          entry.actualCOGS = cost.cogs;
          entry.actualQty200 = cost.qty;
          entry.actualUnitCost = cost.qty > 0 ? cost.cogs / cost.qty : 0;
          entry.costRatio = cost.rev > 0 ? (cost.cogs / cost.rev) * 100 : 0;
        }
      }
    }
    // 100 기반 단위원가 계산 (판매단가와 동일 분모 보장)
    for (const entry of Array.from(map.values())) {
      if (entry.in100 && entry.quantity > 0) {
        entry.unitCost100 = (entry.revenue - entry.grossProfit100) / entry.quantity;
      }
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 300);
  }, [cvpItems, poolItems, filteredItemProfitability]);

  // 월별 단가·원가 추이 (rawItemProfitability: aggregate 전, month 보존)
  const monthlyBreakdown = useMemo(() => {
    if (!targetItem || !rawItemProfitability || rawItemProfitability.length === 0) return null;
    const monthMap = new Map<string, { rev: number; qty: number; cogs: number }>();
    for (const r of rawItemProfitability) {
      const raw = (r.품목 || "").trim();
      const codeMatch = raw.match(/^\[([^\]]+)\]/);
      const code = codeMatch ? codeMatch[1].trim() : raw;
      if (code !== targetItem) continue;
      const month = r.month || "";
      if (!month) continue;
      const prev = monthMap.get(month) || { rev: 0, qty: 0, cogs: 0 };
      prev.rev += r.매출액 || 0;
      prev.qty += r.매출수량 || 0;
      prev.cogs += r.실적매출원가 || 0;
      monthMap.set(month, prev);
    }
    if (monthMap.size === 0) return null;
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => {
        const unitPrice = safeDivide(d.rev, d.qty);
        const unitCost = safeDivide(d.cogs, d.qty);
        return {
          month,
          monthLabel: `${month.slice(0, 4)}.${month.slice(4, 6)}`,
          unitPrice,
          unitCost,
          margin: unitPrice - unitCost,
          costRatio: safeDivide(d.cogs, d.rev) * 100,
          quantity: d.qty,
          revenue: d.rev,
          cogs: d.cogs,
        };
      });
  }, [targetItem, rawItemProfitability]);

  // 200 전용 품목: 합성 CVPItem 생성 (사용자가 희망 판매단가 입력 시)
  const selectedItemInfo = targetItem ? itemList.find(i => i.code === targetItem) : null;
  const is200Only = selectedItemInfo ? !selectedItemInfo.in100 : false;
  const syntheticCvpItem = useMemo((): CVPItem | null => {
    if (!is200Only || !selectedItemInfo || manualUnitPrice <= 0) return null;
    const qty = selectedItemInfo.actualQty200 || selectedItemInfo.quantity || 1;
    // 변동비 분리: actualCOGS(총원가) × vcRatio → 변동비만 추출
    const ratios = vcCostRatioMap?.get(selectedItemInfo.name);
    const vcRatio = ratios?.overallVCRatio ?? 0.8;
    const totalVC = (selectedItemInfo.actualCOGS || selectedItemInfo.actualUnitCost * qty) * vcRatio;
    const unitVC = safeDivide(totalVC, qty);
    return {
      customer: "__manual__",
      customerName: "수동 시뮬레이션",
      item: targetItem!,
      itemName: selectedItemInfo.name,
      quantity: qty,
      revenue: manualUnitPrice * qty,
      variableCost: totalVC,
      sgaVariableCost: 0,
      grossProfit: (manualUnitPrice - unitVC) * qty,
      unitPrice: manualUnitPrice,
      unitVariableCost: unitVC,
      unitContributionMargin: manualUnitPrice - unitVC,
      totalContributionMargin: (manualUnitPrice - unitVC) * qty,
      contributionMarginRatio: safeDivide(manualUnitPrice - unitVC, manualUnitPrice),
      quadrant: "question",
      isLowPriceOrder: manualUnitPrice < unitVC,
    };
  }, [is200Only, selectedItemInfo, manualUnitPrice, targetItem, vcCostRatioMap]);

  // 시뮬 대상 items: 200 전용 합성 아이템 포함
  // 원가 슬라이더 반영 후 조정 원가 (UI 표시용)
  const adjustedCostInfo = useMemo(() => {
    if (!selectedItemInfo) return null;
    // 100 기반 원가 우선, 200 전용이면 200 기반
    const baseUc = selectedItemInfo.in100 ? selectedItemInfo.unitCost100 : selectedItemInfo.actualUnitCost;
    if (baseUc <= 0) return null;
    const hasCostChange = costRawMaterialPct !== 0 || costLaborPct !== 0 || costOutsourcingPct !== 0;
    if (!hasCostChange) return null;
    const uc = baseUc;
    const ratios = vcCostRatioMap?.get(selectedItemInfo.name);
    const rawR = ratios?.rawMaterialRatio ?? 0.5;
    const labR = ratios?.laborRatio ?? 0.1;
    const outR = ratios?.outsourcingRatio ?? 0.1;
    const otherR = Math.max(0, 1 - rawR - labR - outR);
    const vcRatio = ratios?.overallVCRatio ?? 0.8;
    const unitVC = uc * vcRatio;
    const unitFC = uc * (1 - vcRatio);
    const adjFactor = rawR * (1 + costRawMaterialPct / 100) + labR * (1 + costLaborPct / 100) + outR * (1 + costOutsourcingPct / 100) + otherR;
    const adjustedUnitVC = unitVC * adjFactor;
    const adjustedUnitCost = adjustedUnitVC + unitFC;
    const costDiff = adjustedUnitCost - uc;
    // v2 WS3: 조정 후 판매단가 + 단위공헌이익 (박리다매 엔진 실체)
    const baseUnitPrice = safeDivide(selectedItemInfo.revenue, selectedItemInfo.quantity);
    const adjustedUnitPrice = baseUnitPrice * (1 + priceChangePct / 100);
    const adjustedUnitCM = adjustedUnitPrice - adjustedUnitVC;
    const adjustedUnitMargin = adjustedUnitPrice - adjustedUnitCost;
    return {
      originalUnitCost: uc, adjustedUnitCost, costDiff,
      costChangePctTotal: safeDivide(costDiff, uc) * 100,
      vcRatio, unitVC, unitFC, adjustedUnitVC, hasRatioData: !!ratios,
      baseUnitPrice, adjustedUnitPrice, adjustedUnitCM, adjustedUnitMargin,
    };
  }, [selectedItemInfo, costRawMaterialPct, costLaborPct, costOutsourcingPct, vcCostRatioMap, priceChangePct]);

  const simItems = useMemo(
    () => syntheticCvpItem ? [...cvpItems, syntheticCvpItem] : cvpItems,
    [cvpItems, syntheticCvpItem]
  );

  // 총액 관점 시뮬레이션 (4a)
  const totalSim = useMemo(
    () => calcTotalViewSimulation({
      items: simItems,
      totalFixedCost,
      targetCustomer,
      targetItem,
      volumeIncreasePct: inputMode === "absolute" ? 0 : volumeIncreasePct,
      priceChangePct: inputMode === "absolute" ? priceChangeDirect : priceChangePct,
      ...(inputMode === "absolute" && targetItem ? { volumeAbsolute } : {}),
      costChangePct,
      vcCostRatioMap,
    }),
    [simItems, totalFixedCost, targetCustomer, targetItem, volumeIncreasePct, priceChangePct, inputMode, volumeAbsolute, priceChangeDirect, costChangePct, vcCostRatioMap]
  );

  // 워터폴
  const waterfall = useMemo(() => calcWaterfallSteps(totalSim), [totalSim]);

  // 감도 분석 그리드 (대상 선택 시에만)
  const sensitivityGrid = useMemo(
    () => (targetCustomer || targetItem)
      ? calcSensitivityGrid(simItems, totalFixedCost, targetCustomer, targetItem, undefined, costChangePct, vcCostRatioMap)
      : [],
    [simItems, totalFixedCost, targetCustomer, targetItem, costChangePct, vcCostRatioMap]
  );

  // 무결성 검증 (Step 5)
  const integrity = useMemo(
    () => verifyIntegrity(totalSim, poolSim),
    [totalSim, poolSim]
  );

  // 검색 필터된 품목/거래처 리스트 (Step 4a 슬라이더용)
  // itemList/customerList 자체가 이미 상위 300건으로 제한되어 있어 전체 노출 안전
  const filteredItemList = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return itemList;
    return itemList.filter(i =>
      i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
    );
  }, [itemList, itemSearch]);

  const filteredCustList = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return customerList;
    return customerList.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [customerList, custSearch]);

  // 검색 필터된 품목/거래처 리스트 (저가수주 판단기용)
  const qdFilteredItemList = useMemo(() => {
    const q = qdItemSearchText.trim().toLowerCase();
    if (!q) return itemList;
    return itemList.filter(i =>
      i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)
    );
  }, [itemList, qdItemSearchText]);

  const qdCustCandidates = useMemo(() => {
    // 대상 품목 선택 시 해당 품목 구매 거래처만 후보로 제한
    if (!targetItem) return customerList;
    return customerList.filter(c =>
      cvpItems.some(cv => cv.item === targetItem && cv.customer === c.code)
    );
  }, [customerList, targetItem, cvpItems]);

  const qdFilteredCustList = useMemo(() => {
    const q = qdCustSearchText.trim().toLowerCase();
    if (!q) return qdCustCandidates;
    return qdCustCandidates.filter(c =>
      c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [qdCustCandidates, qdCustSearchText]);

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

  // 저가수주 판단기 결과 — Step 4a 원가 슬라이더(costChangePct) + 200 보고서 원가구성비율 반영
  const quickVerdict = useMemo(
    () => calcQuickVerdict(
      cvpItems, totalFixedCost, filteredItemProfitability,
      targetItem, targetCustomer,
      qdProposedPrice, qdAdditionalQty,
      costChangePct, vcCostRatioMap,
    ),
    [cvpItems, totalFixedCost, filteredItemProfitability, targetItem, targetCustomer, qdProposedPrice, qdAdditionalQty, costChangePct, vcCostRatioMap]
  );

  // v2 WS2: 캐파 Step-up 경고
  const inventoryMovementMap = useDataStore(s => s.inventoryMovement);
  const allInventoryRecords = useMemo(() => Array.from(inventoryMovementMap.values()).flat(), [inventoryMovementMap]);
  // 사용자 수동 조정값 (Map<itemCode, partial<CapacityConfig>>)
  const [capacityOverrides, setCapacityOverrides] = useState<Map<string, Partial<CapacityConfig>>>(new Map());
  const capacityInfo = useMemo(() => {
    if (!targetItem) return null;
    const suggestion = suggestItemCapacity(allInventoryRecords, targetItem);
    if (!suggestion) return null;
    const override = capacityOverrides.get(targetItem) ?? {};
    const config: CapacityConfig = {
      itemCode: targetItem,
      factory: suggestion.factory,
      monthlyCapacity: override.monthlyCapacity ?? suggestion.suggested,
      stepUpFixedCost: override.stepUpFixedCost ?? 50_000_000, // 기본 5,000만원 / 신규 라인
      stepUpGranularity: override.stepUpGranularity ?? Math.max(1, Math.round(suggestion.monthlyMax * 0.5)),
    };
    // baseQty는 현재 판매수량(cvpItems 기준) 재사용
    const rows = cvpItems.filter(c => c.item === targetItem);
    const baseQty = rows.reduce((s, c) => s + Math.max(c.quantity, 0), 0);
    const alert = calcCapacityAlert(baseQty, qdAdditionalQty, config);
    return { suggestion, config, baseQty, alert };
  }, [targetItem, allInventoryRecords, capacityOverrides, cvpItems, qdAdditionalQty]);

  // v2 WS4: PED 자동 적용 토글 + 계수 override
  const [pedEnabled, setPedEnabled] = useState(false);
  const [pedOverride, setPedOverride] = useState<Map<string, number>>(new Map());
  const pedResult = useMemo<PEDResult | null>(() => {
    if (!targetItem || !props.rawItemProfitability || props.rawItemProfitability.length === 0) return null;
    return estimatePED(props.rawItemProfitability, targetItem);
  }, [targetItem, props.rawItemProfitability]);
  const effectivePED = useMemo(() => {
    if (!pedResult) return undefined;
    const override = targetItem ? pedOverride.get(targetItem) : undefined;
    return override !== undefined ? override : pedResult.ped;
  }, [pedResult, pedOverride, targetItem]);

  // v2 WS5: 거래처 LTV 효과 — sales/orgProfit 활용
  const salesList = useDataStore(s => s.salesList);
  const orgProfit = useDataStore(s => s.orgProfit);
  const ltvMap = useMemo(() => {
    if (salesList.length === 0) return new Map();
    return buildLTVMap(calcClv(salesList, orgProfit));
  }, [salesList, orgProfit]);
  const churnMap = useMemo(() => {
    if (salesList.length === 0) return new Map();
    return buildChurnMap(predictChurn(salesList).customers);
  }, [salesList]);
  const ltvImpact = useMemo<CustomerLTVImpact | null>(() => {
    if (!targetCustomer || qdProposedPrice <= 0) return null;
    return calcCustomerLTVImpact({
      customer: targetCustomer,
      priceChangePct: quickVerdict.priceChangePct,
      ltvMap, churnMap,
    });
  }, [targetCustomer, qdProposedPrice, quickVerdict.priceChangePct, ltvMap, churnMap]);

  // v2 WS7: 12개월 시간 차원 시뮬레이션
  const [tsEnabled, setTsEnabled] = useState(false);
  const [learningRate, setLearningRate] = useState(DEFAULT_LEARNING_RATE);
  const [lagMonths, setLagMonths] = useState(DEFAULT_LAG_MONTHS);
  const tsResult = useMemo<TimeSeriesSimulationResult | null>(() => {
    if (!tsEnabled || !targetItem || qdProposedPrice <= 0) return null;
    const rows = cvpItems.filter(c => c.item === targetItem);
    if (rows.length === 0) return null;
    const baseQty = rows.reduce((s, c) => s + Math.max(c.quantity, 0), 0);
    if (baseQty <= 0) return null;
    const baseQtyAvg = baseQty; // 월별 평균 추정 (filter된 기간 == 월별 합계 가정)
    const totalVC = rows.reduce((s, c) => s + c.variableCost, 0);
    const initialUnitVC = baseQty > 0 ? totalVC / baseQty : 0;
    // costChangePct 통합 (원재료/노무/외주 합산 근사)
    const totalCostChangePct = (costRawMaterialPct + costLaborPct + costOutsourcingPct) / 3;
    return calcTimeSeriesSimulation({
      baseQtyAvg, newUnitPrice: qdProposedPrice, initialUnitVC,
      totalCostChangePct, learningRate, lagMonths,
    });
  }, [tsEnabled, targetItem, qdProposedPrice, cvpItems, costRawMaterialPct, costLaborPct, costOutsourcingPct, learningRate, lagMonths]);

  // v2 WS8: 카니발라이제이션 (자기잠식 + 포트폴리오 순효과)
  const customerItemDetail = useDataStore(s => s.customerItemDetail);
  const [cannibalEnabled, setCannibalEnabled] = useState(false);
  const [cannibalScenario, setCannibalScenario] = useState<CannibalScenario>("medium");
  const [cannibalMultiplier, setCannibalMultiplier] = useState<number>(CANNIBAL_PRESETS.medium.multiplier);

  // 카니발 매트릭스 — Top-15 품목, 14M 시계열 기반 (heavy compute, enabled 시만)
  const cannibalResult = useMemo<CannibalizationResult | null>(() => {
    if (!cannibalEnabled || !customerItemDetail || customerItemDetail.length === 0) return null;
    const categoryMap = buildCategoryMap(customerItemDetail);
    return calcCannibalizationMatrix({ data: customerItemDetail, itemCategoryMap: categoryMap });
  }, [cannibalEnabled, customerItemDetail]);

  // 현재 의사결정에 카니발 보정 적용
  const cannibalCorrection = useMemo<CannibalCorrectionResult | null>(() => {
    if (!cannibalEnabled || !cannibalResult || !targetItem || qdProposedPrice <= 0) return null;
    if (cannibalResult.matrix.length === 0) return null;

    // 단독 효과 = quickVerdict.singleItemEffect (4a sim4a.netOffsetEffect)
    const aloneEffect = quickVerdict.singleItemEffect ?? 0;

    // baseSalesMap: customerItemDetail 기준 품목별 총 매출
    const baseSalesMap = new Map<string, number>();
    const itemNameMap = new Map<string, string>();
    for (const r of customerItemDetail) {
      const item = r.품목 || "";
      if (!item) continue;
      const sales = r.매출액?.실적 || 0;
      baseSalesMap.set(item, (baseSalesMap.get(item) || 0) + sales);
      if (r.품목명) itemNameMap.set(item, r.품목명);
    }
    const baseSalesTarget = baseSalesMap.get(targetItem) || 0;
    if (baseSalesTarget <= 0) return null;

    return applyCannibalCorrection({
      matrix: cannibalResult.matrix,
      targetItem,
      aloneEffect,
      baseSalesTarget,
      baseSalesMap,
      itemNameMap,
      multiplier: cannibalMultiplier,
    });
  }, [cannibalEnabled, cannibalResult, targetItem, qdProposedPrice, quickVerdict.singleItemEffect, customerItemDetail, cannibalMultiplier]);

  // v2 WS6: 경쟁사 반응 시나리오
  const [competitorEnabled, setCompetitorEnabled] = useState(false);
  const competitorPresets = useMemo<PresetComparison | null>(() => {
    if (!competitorEnabled || !targetItem || qdProposedPrice <= 0) return null;
    const rows = cvpItems.filter(c => c.item === targetItem);
    if (rows.length === 0) return null;
    const baseQty = rows.reduce((s, c) => s + Math.max(c.quantity, 0), 0);
    const totalRev = rows.reduce((s, c) => s + c.revenue, 0);
    const basePrice = baseQty > 0 ? totalRev / baseQty : 0;
    if (basePrice <= 0 || baseQty <= 0) return null;
    return calcAllPresets({
      basePrice, newPrice: qdProposedPrice, baseQty,
      ped: effectivePED ?? -1.0,
    });
  }, [competitorEnabled, targetItem, qdProposedPrice, cvpItems, effectivePED]);

  // v2 WS1: Monte Carlo 토글 + 결과 (기본 OFF — 성능 보호 + 점진 롤아웃)
  const [mcEnabled, setMcEnabled] = useState(false);
  const mcVerdict = useMemo<MonteCarloVerdict | null>(() => {
    if (!mcEnabled || !targetItem || qdProposedPrice <= 0 || qdAdditionalQty <= 0) return null;
    return calcMonteCarloVerdict({
      cvpItems, totalFixedCost,
      targetItem, targetCustomer,
      proposedUnitPrice: qdProposedPrice,
      additionalQuantity: qdAdditionalQty,
      vcCostRatioMap,
      costMean: costChangePct ?? { rawMaterial: 0, labor: 0, outsourcing: 0 },
      iterations: 5000, // 초기 5k (UX 응답성 우선). 사용자 확인 후 10k로 상향 가능
      seed: 42, // 결정론적 재현 (UI 재렌더시 동일 결과)
    });
  }, [mcEnabled, cvpItems, totalFixedCost, targetItem, targetCustomer, qdProposedPrice, qdAdditionalQty, vcCostRatioMap, costChangePct]);

  // v2 WS3: 판단기용 단위공헌이익 — 원가 변동 없을 때도 노출되는 박리다매 엔진 실체
  const quickCMInfo = useMemo(() => {
    if (!targetItem || qdProposedPrice <= 0) return null;
    const rows = cvpItems.filter(c => c.item === targetItem && (targetCustomer === null || c.customer === targetCustomer));
    if (rows.length === 0) return null;
    // 수량 가중평균 단위변동비 (산술평균은 대량 거래처 편향 위험)
    const totalQty = rows.reduce((s, c) => s + Math.max(c.quantity, 0), 0);
    const avgUVC = totalQty > 0
      ? rows.reduce((s, c) => s + c.unitVariableCost * Math.max(c.quantity, 0), 0) / totalQty
      : rows.reduce((s, c) => s + c.unitVariableCost, 0) / rows.length;
    // 원가 변동(Step 4a 슬라이더) 반영
    let adjustedUVC = avgUVC;
    const hasCostChange = costRawMaterialPct !== 0 || costLaborPct !== 0 || costOutsourcingPct !== 0;
    if (hasCostChange) {
      const ratios = vcCostRatioMap?.get(targetItem);
      const rawR = ratios?.rawMaterialRatio ?? 0.5;
      const labR = ratios?.laborRatio ?? 0.1;
      const outR = ratios?.outsourcingRatio ?? 0.1;
      const otherR = Math.max(0, 1 - rawR - labR - outR);
      adjustedUVC = avgUVC * (rawR * (1 + costRawMaterialPct / 100) + labR * (1 + costLaborPct / 100) + outR * (1 + costOutsourcingPct / 100) + otherR);
    }
    const unitCM = qdProposedPrice - adjustedUVC;
    return { avgUVC, adjustedUVC, unitCM, hasCostChange };
  }, [targetItem, targetCustomer, cvpItems, qdProposedPrice, costRawMaterialPct, costLaborPct, costOutsourcingPct, vcCostRatioMap]);

  // 품목 선택 시 현재 단가 자동 표시
  const currentItemUnitPrice = useMemo(() => {
    if (!targetItem) return 0;
    const rows = cvpItems.filter(c => c.item === targetItem && (targetCustomer === null || c.customer === targetCustomer));
    const qty = rows.reduce((s, c) => s + c.quantity, 0);
    const rev = rows.reduce((s, c) => s + c.revenue, 0);
    return qty > 0 ? rev / qty : 0;
  }, [cvpItems, targetItem, targetCustomer]);

  // Guard: 데이터 없음
  if (filteredCustItemDetail.length === 0) {
    return <EmptyState requiredFiles={["100.거래처별품목별손익", "200.품목별수익성분석(회계)"]} />;
  }

  // KPI
  const totalCost = cvpSummary.totalVariableCost + cvpSummary.totalFixedCost;

  // 판단기 판정 색상
  const qdBg = quickVerdict.verdict === "approve"
    ? "bg-green-50 dark:bg-green-950/30 border-green-500"
    : quickVerdict.verdict === "reject"
      ? "bg-red-50 dark:bg-red-950/30 border-red-500"
      : "bg-amber-50 dark:bg-amber-950/30 border-amber-500";
  const qdIcon = quickVerdict.verdict === "approve" ? "✅"
    : quickVerdict.verdict === "reject" ? "❌" : "⚠️";

  return (
    <div className="space-y-6">
      {/* ═══ 저가수주 판단기 (1화면 의사결정 카드) ═══ */}
      <div className="rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-gradient-to-br from-indigo-50/80 to-blue-50/80 dark:from-indigo-950/30 dark:to-blue-950/30 p-5">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span className="text-xl">🎯</span>
          저가수주 판단기
          <span className="text-xs font-normal text-muted-foreground ml-2">— 품목·수량·단가를 입력하면 즉시 판정합니다</span>
        </h2>

        {/* 입력 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {/* 품목 검색 combobox */}
          <div className="relative" data-combobox>
            <label className="text-[10px] font-semibold text-muted-foreground block mb-1">대상 품목</label>
            <button
              type="button"
              onClick={() => { setQdItemSearchOpen(!qdItemSearchOpen); setQdCustSearchOpen(false); }}
              className="w-full text-left text-xs border rounded px-2 py-1.5 bg-background hover:bg-muted/50 truncate"
            >
              {targetItem
                ? (itemList.find(i => i.code === targetItem)?.name || targetItem)
                : <span className="text-muted-foreground">품목 검색...</span>}
            </button>
            {qdItemSearchOpen && (
              <div className="absolute z-50 mt-1 w-full min-w-[280px] border rounded bg-background shadow-xl max-h-72 flex flex-col">
                <div className="p-1.5 border-b">
                  <input
                    type="text"
                    autoFocus
                    value={qdItemSearchText}
                    onChange={(e) => setQdItemSearchText(e.target.value)}
                    placeholder="품목명 또는 코드로 검색..."
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  {qdFilteredItemList.length === 0 ? (
                    <p className="text-center text-muted-foreground py-3 text-xs">검색 결과 없음</p>
                  ) : (
                    qdFilteredItemList.map(i => (
                      <button
                        key={i.code}
                        type="button"
                        onClick={() => {
                          setTargetItem(i.code);
                          setQdProposedPrice(0);
                          setQdItemSearchOpen(false);
                          setQdItemSearchText("");
                          if (targetCustomer) {
                            const customerBuysItem = cvpItems.some(c => c.item === i.code && c.customer === targetCustomer);
                            if (!customerBuysItem) setTargetCustomer(null);
                          }
                        }}
                        className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted/70 flex items-center justify-between gap-2 ${targetItem === i.code ? "bg-blue-50 dark:bg-blue-900/30 font-semibold" : ""}`}
                      >
                        <span className="truncate">{i.name}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">{formatCurrency(i.revenue, true)}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="px-2 py-1 border-t text-[9px] text-muted-foreground flex items-center justify-between gap-2">
                  <span>
                    {qdItemSearchText
                      ? `검색 결과 ${qdFilteredItemList.length}건 / 전체 ${itemList.length}건`
                      : `전체 ${itemList.length}건 표시`}
                  </span>
                  {targetItem && (
                    <button type="button" onClick={() => { setTargetItem(null); setQdItemSearchOpen(false); setQdItemSearchText(""); }} className="text-red-500 hover:underline shrink-0">선택 해제</button>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* 거래처 검색 combobox */}
          <div className="relative" data-combobox>
            <label className="text-[10px] font-semibold text-muted-foreground block mb-1">거래처 (선택)</label>
            <button
              type="button"
              onClick={() => { setQdCustSearchOpen(!qdCustSearchOpen); setQdItemSearchOpen(false); }}
              className="w-full text-left text-xs border rounded px-2 py-1.5 bg-background hover:bg-muted/50 truncate"
            >
              {targetCustomer
                ? (customerList.find(c => c.code === targetCustomer)?.name || targetCustomer)
                : <span className="text-muted-foreground">전체 거래처</span>}
            </button>
            {qdCustSearchOpen && (
              <div className="absolute z-50 mt-1 w-full min-w-[280px] border rounded bg-background shadow-xl max-h-72 flex flex-col">
                <div className="p-1.5 border-b">
                  <input
                    type="text"
                    autoFocus
                    value={qdCustSearchText}
                    onChange={(e) => setQdCustSearchText(e.target.value)}
                    placeholder="거래처명으로 검색..."
                    className="w-full text-xs border rounded px-2 py-1 bg-background"
                  />
                </div>
                <div className="overflow-y-auto flex-1">
                  <button
                    type="button"
                    onClick={() => { setTargetCustomer(null); setQdCustSearchOpen(false); setQdCustSearchText(""); }}
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted/70 ${!targetCustomer ? "bg-blue-50 dark:bg-blue-900/30 font-semibold" : ""}`}
                  >
                    전체 거래처
                  </button>
                  {qdFilteredCustList.map(c => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => { setTargetCustomer(c.code); setQdCustSearchOpen(false); setQdCustSearchText(""); }}
                      className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted/70 flex items-center justify-between gap-2 ${targetCustomer === c.code ? "bg-blue-50 dark:bg-blue-900/30 font-semibold" : ""}`}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">{formatCurrency(c.revenue, true)}</span>
                    </button>
                  ))}
                  {qdFilteredCustList.length === 0 && (
                    <p className="text-center text-muted-foreground py-3 text-xs">검색 결과 없음</p>
                  )}
                </div>
                <div className="px-2 py-1 border-t text-[9px] text-muted-foreground">
                  {qdCustSearchText
                    ? `검색 결과 ${qdFilteredCustList.length}건 / 후보 ${qdCustCandidates.length}건`
                    : targetItem
                      ? `${itemList.find(i => i.code === targetItem)?.name || targetItem} 구매 거래처 ${qdCustCandidates.length}건`
                      : `전체 ${customerList.length}건 표시`}
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
              예상 추가수량
              {targetItem && <span className="text-blue-600 ml-1">(현재 {Math.round(cvpItems.filter(c => c.item === targetItem).reduce((s, c) => s + c.quantity, 0)).toLocaleString()})</span>}
            </label>
            <input
              type="number"
              className="w-full text-xs border rounded px-2 py-1.5 bg-background"
              placeholder="예: 2000"
              value={qdAdditionalQty || ""}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setQdAdditionalQty(v);
                // 기존 Step 4a 상태 동기화
                setInputMode("absolute");
                setVolumeAbsolute(v);
              }}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
              제안 단가 (원/단위)
              {currentItemUnitPrice > 0 && <span className="text-blue-600 ml-1">(현재 {Math.round(currentItemUnitPrice).toLocaleString()}원)</span>}
            </label>
            <input
              type="number"
              className="w-full text-xs border rounded px-2 py-1.5 bg-background"
              placeholder={currentItemUnitPrice > 0 ? `현재: ${Math.round(currentItemUnitPrice).toLocaleString()}` : "단가 입력"}
              value={qdProposedPrice || ""}
              onChange={(e) => {
                const v = Number(e.target.value) || 0;
                setQdProposedPrice(v);
                // 기존 Step 4a 상태 동기화: 제안 단가 → 가격 변동률 자동 계산
                if (currentItemUnitPrice > 0 && v > 0) {
                  const pct = ((v / currentItemUnitPrice) - 1) * 100;
                  setPriceChangePct(Math.round(pct * 10) / 10);
                  setPriceChangeDirect(Math.round(pct * 10) / 10);
                }
              }}
            />
          </div>
        </div>

        {/* 판정 결과 */}
        {targetItem && qdAdditionalQty > 0 && qdProposedPrice > 0 && (
          <div className={`rounded-lg border-l-4 p-4 ${qdBg}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{qdIcon}</span>
              <span className="text-base font-bold">{quickVerdict.verdictLabel}</span>
              <VerdictInfo
                title="저가수주 판정 기준"
                formula={"✅ 진행 가능: 단독 효과 ≥ 0 OR 풀+포트폴리오가 손실을 충분히 상쇄\n❌ 거부: 3가지 관점 모두 음수\n⚠️ 조건부: 일부 조건에서만 이득"}
                description={"3가지 관점을 종합한 저가수주 의사결정:\n① 대상 품목 단독의 이익 증감 (4a)\n② 같은 대분류 다른 품목의 덤 효과 (4b)\n③ 거래처 관계 유지 가치 (포트폴리오)\n\n단독 숫자만 보면 놓칠 수 있는\n'풀 전체 효과'와 '거래처 관계 가치'까지\n함께 평가합니다."}
                note={"단가 변동률은 현재 단가 대비 제안 단가의 차이입니다.\n음수(-)면 인하, 양수(+)면 인상."}
              />
              {quickVerdict.priceChangePct !== 0 && (
                <span className="text-xs text-muted-foreground ml-2">
                  (단가 {quickVerdict.priceChangePct > 0 ? "+" : ""}{safeFixed(quickVerdict.priceChangePct, 1)}%)
                </span>
              )}
              {(costRawMaterialPct !== 0 || costLaborPct !== 0 || costOutsourcingPct !== 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDetailedAnalysis(true);
                    // 다음 프레임에 스크롤 (details가 open 된 뒤 레이아웃 반영)
                    requestAnimationFrame(() => {
                      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    });
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition flex items-center gap-1 ml-1"
                  title="클릭: Step 4a 원가 슬라이더로 이동"
                >
                  <span className="font-semibold">원가 반영 중:</span>
                  {costRawMaterialPct !== 0 && <span>원재료 {costRawMaterialPct > 0 ? "+" : ""}{costRawMaterialPct}%</span>}
                  {costLaborPct !== 0 && <span>{costRawMaterialPct !== 0 ? "· " : ""}노무 {costLaborPct > 0 ? "+" : ""}{costLaborPct}%</span>}
                  {costOutsourcingPct !== 0 && <span>{(costRawMaterialPct !== 0 || costLaborPct !== 0) ? "· " : ""}외주 {costOutsourcingPct > 0 ? "+" : ""}{costOutsourcingPct}%</span>}
                  <span className="text-[9px] opacity-70 ml-0.5">↗</span>
                </button>
              )}
            </div>

            {/* 3가지 관점 카드 */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {/* ① 대상 품목 단독 */}
              <div className={`text-center p-2 rounded border ${quickVerdict.singleItemEffect >= 0 ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : "border-red-300 bg-red-50/50 dark:bg-red-950/20"}`}>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <span>대상 품목 단독</span>
                  <VerdictInfo
                    title="대상 품목 단독 효과 (4a)"
                    formula={"① 단가 인하 손실\n  = 기존수량 × (기존단가 − 제안단가)\n\n② 추가수량 공헌이익\n  = 추가수량 × (제안단가 − 단위 변동비)\n\n순효과 = ② − ①"}
                    description={"이 품목만 따로 봤을 때의 이익 증감입니다.\n\n단가를 내리면 기존 고객한테서 덜 받지만(①),\n대신 새로 파는 수량에서 공헌이익이 들어옵니다(②).\n\n양수(+) → 이 저가수주 자체로도 이득\n음수(−) → 이 품목 단독으로는 손해"}
                    note={"출처: 100 보고서 (거래처×품목 실적).\n단독 손실이어도 아래 '풀 덤 효과'나\n'거래처 관계 가치'로 전체 판정은\n달라질 수 있습니다."}
                  />
                </div>
                <div className={`text-sm font-bold ${quickVerdict.singleItemEffect >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                  {formatCurrency(quickVerdict.singleItemEffect)}
                </div>
              </div>

              {/* ② 풀 원가절감 덤 */}
              <div className={`text-center p-2 rounded border ${(quickVerdict.poolOthersGain ?? 0) > 0 ? "border-green-300 bg-green-50/50 dark:bg-green-950/20" : "border-gray-300 bg-gray-50/50 dark:bg-gray-950/20"}`}>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <span>풀 원가절감 덤</span>
                  <VerdictInfo
                    title="풀 원가절감 덤 효과 (4b)"
                    formula={"같은 대분류(풀) 내 다른 품목들의\n[시나리오 장부상 마진 − 기준 장부상 마진] 합계.\n\n대상 품목 판매량 ↑\n  → 풀 전체 매출 비중 변화\n  → 다른 품목의 '1개당 고정비'↓\n  → 장부상 마진 ↑"}
                    description={"같은 공장에서 생산되는 품목(같은 대분류)들은\n고정비를 매출 비중에 따라 나눠서 장부에 실립니다.\n\n대상 품목을 더 많이 팔면\n→ 그 품목의 매출 비중이 올라가고\n→ 나머지 품목들의 '몫'이 줄어들어\n→ 다른 품목들의 단위 고정비가 내려갑니다.\n\n즉, 대상 품목을 밀어주면\n같은 대분류 다른 품목도 '덤'으로 장부상 마진이 좋아짐."}
                    note={"출처: 200 보고서 (품목별 수익성 회계).\n200 보고서가 없으면 '미확인'으로 표시.\n장부상 재배분 효과이므로 실제 현금과는\n다를 수 있습니다."}
                  />
                </div>
                <div className={`text-sm font-bold ${(quickVerdict.poolOthersGain ?? 0) > 0 ? "text-green-700 dark:text-green-400" : "text-gray-500"}`}>
                  {quickVerdict.poolOthersGain !== null ? formatCurrency(quickVerdict.poolOthersGain) : <span className="text-gray-400">미확인</span>}
                </div>
                {quickVerdict.poolOthersGain === null
                  ? <div className="text-[9px] text-amber-600">200 보고서 필요</div>
                  : quickVerdict.poolName && <div className="text-[9px] text-muted-foreground">{quickVerdict.poolName}</div>}
              </div>

              {/* ③ 거래처 포트폴리오 — 성격 구분 필요 */}
              <div className={`text-center p-2 rounded border-dashed border-2 ${quickVerdict.portfolioOtherCM > 0 ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20" : "border-gray-300 bg-gray-50/50 dark:bg-gray-950/20"}`}>
                <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
                  <span>거래처 포트폴리오</span>
                  <VerdictInfo
                    title="거래처 포트폴리오 (관계 유지 가치)"
                    formula={"Σ (대상 품목 구매 거래처의 다른 품목 공헌이익)\n\n— 기존 실적 합계\n— 시나리오 '효과'가 아님"}
                    description={"이 숫자는 '새로 생길 이익'이 아닙니다.\n\n대상 품목을 사고 있는 거래처들이\n다른 품목에서 '지금까지' 만들어온\n공헌이익의 합계입니다.\n\n만약 저가수주를 거절해서\n이 거래처가 떠난다면,\n이만큼의 다른 품목 마진도 함께 포기하는 셈.\n\n즉, 거래처 유지의 '기회비용 규모'를 보여줍니다.\n\n크면 클수록 → 저가수주로라도 거래처 유지할 유인 ↑"}
                    note={"⚠️ 단독·풀 효과와 단순 합산하지 마세요!\n성격이 완전히 다른 '맥락 정보'입니다.\n4a·4b는 시나리오 변화량(Δ),\n이 값은 기존 실적 총량입니다."}
                  />
                </div>
                <div className={`text-sm font-bold ${quickVerdict.portfolioOtherCM > 0 ? "text-blue-700 dark:text-blue-400" : "text-gray-500"}`}>
                  {formatCurrency(quickVerdict.portfolioOtherCM)}
                </div>
                <div className="text-[9px] mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium">
                  참고값 · 기존 실적
                </div>
              </div>
            </div>

            {/* v2 WS7: 12개월 시간 차원 시뮬레이션 */}
            {targetItem && qdProposedPrice > 0 && (
              <div className="mb-2 p-2.5 rounded-lg border-2 border-cyan-300 dark:border-cyan-700 bg-gradient-to-br from-cyan-50/60 to-sky-50/60 dark:from-cyan-950/30 dark:to-sky-950/20">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={tsEnabled}
                      onChange={(e) => setTsEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-cyan-600"
                    />
                    🕒 12개월 시간 차원 시뮬
                  </label>
                  {tsEnabled && (
                    <div className="text-[10px] flex items-center gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-1">
                        학습률:
                        <input type="number" step={0.05} min={0.5} max={1.0}
                          className="w-14 border rounded px-1 py-0.5 bg-background text-[10px]"
                          value={learningRate}
                          onChange={(e) => setLearningRate(Math.max(0.5, Math.min(1.0, Number(e.target.value) || 1.0)))}
                        />
                      </label>
                      <label className="inline-flex items-center gap-1">
                        원가 lag:
                        <input type="number" step={1} min={0} max={12}
                          className="w-12 border rounded px-1 py-0.5 bg-background text-[10px]"
                          value={lagMonths}
                          onChange={(e) => setLagMonths(Math.max(0, Math.min(12, Math.round(Number(e.target.value) || 0))))}
                        />
                        M
                      </label>
                    </div>
                  )}
                </div>
                {tsEnabled && tsResult && tsResult.months.length > 0 && (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">12개월 NPV</div>
                        <div className={`font-mono font-bold text-sm ${tsResult.totalNPV >= 0 ? "text-cyan-700 dark:text-cyan-300" : "text-red-700 dark:text-red-400"}`}>
                          {tsResult.totalNPV >= 0 ? "+" : ""}{formatCurrency(tsResult.totalNPV)}
                        </div>
                      </div>
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">손익분기 시점</div>
                        <div className={`font-mono font-bold text-sm ${tsResult.bepMonth ? "text-cyan-700 dark:text-cyan-300" : "text-red-700 dark:text-red-400"}`}>
                          {summarizeBEP(tsResult.bepMonth)}
                        </div>
                      </div>
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">학습곡선 평균 절감</div>
                        <div className="font-mono font-bold text-sm text-cyan-700 dark:text-cyan-300">
                          {safeFixed(tsResult.averageLearningSavings * 100, 1)}%
                        </div>
                      </div>
                    </div>
                    {/* 12개월 미니 sparkline (월별 누적 NPV) */}
                    <div className="h-16 mb-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={tsResult.months} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                          <Bar dataKey="profit" fill="hsl(187, 71%, 55%)" radius={[2, 2, 0, 0]} />
                          <Line type="monotone" dataKey="npvCumulative" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
                          <XAxis dataKey="monthLabel" tick={{ fontSize: 9 }} interval={1} />
                          <YAxis tick={{ fontSize: 9 }} width={40} tickFormatter={(v) => formatCurrency(v, true)} />
                          <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any) => formatCurrency(Number(v))} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-snug">
                      💡 청록 막대 = 월별 손익, 파랑 라인 = 누적 NPV. 학습곡선 {(learningRate * 100).toFixed(0)}% (누적 2배 시 단위VC -{((1 - learningRate) * 100).toFixed(0)}%) · 원가 lag {lagMonths}M.
                      {tsResult.notes.length > 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400" title={tsResult.notes.join("\n")}>
                          ⚠ {tsResult.notes[0]}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* v2 WS8: 카니발라이제이션 (자기잠식 + 포트폴리오 순효과) */}
            {targetItem && qdProposedPrice > 0 && (
              <div className="mb-2 p-2.5 rounded-lg border-2 border-violet-300 dark:border-violet-700 bg-gradient-to-br from-violet-50/60 to-purple-50/60 dark:from-violet-950/30 dark:to-purple-950/20">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cannibalEnabled}
                      onChange={(e) => setCannibalEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-violet-600"
                    />
                    🔄 카니발라이제이션 (포트폴리오 보정)
                  </label>
                  {cannibalEnabled && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {(["weak", "medium", "strong"] as const).map(scn => (
                        <button
                          key={scn}
                          onClick={() => {
                            setCannibalScenario(scn);
                            setCannibalMultiplier(CANNIBAL_PRESETS[scn].multiplier);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            cannibalScenario === scn
                              ? "bg-violet-600 text-white border-violet-700"
                              : "bg-background border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40"
                          }`}
                          title={CANNIBAL_PRESETS[scn].description}
                        >
                          {CANNIBAL_PRESETS[scn].label}
                        </button>
                      ))}
                      <input
                        type="range" min={0} max={2} step={0.1}
                        value={cannibalMultiplier}
                        onChange={(e) => {
                          setCannibalMultiplier(Number(e.target.value));
                          setCannibalScenario("custom");
                        }}
                        className="w-20 accent-violet-600"
                        title={`잠식 강도 ${(cannibalMultiplier * 100).toFixed(0)}%`}
                      />
                      <span className="text-[10px] font-mono text-violet-700 dark:text-violet-300 w-8">
                        {(cannibalMultiplier * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
                {cannibalEnabled && cannibalCorrection && cannibalResult && (
                  <>
                    {/* 잠식 매트릭스 heatmap (Top-N × Top-N, violet 그라데이션) */}
                    {cannibalResult.matrix.length > 0 && cannibalResult.topItemsByRevenue.length >= 2 && (() => {
                      const items = cannibalResult.topItemsByRevenue;
                      const matrixLookup = new Map<string, typeof cannibalResult.matrix[number]>();
                      cannibalResult.matrix.forEach(c => matrixLookup.set(`${c.itemA}__${c.itemB}`, c));
                      // 셀 색상: cannibalRate 기준 violet 그라데이션 (양의 상관 = 회색 보완재)
                      const cellBg = (rate: number, corr: number) => {
                        if (corr >= 0) return "bg-gray-100 dark:bg-gray-800";
                        if (rate >= 0.6) return "bg-violet-700 dark:bg-violet-500";
                        if (rate >= 0.4) return "bg-violet-500 dark:bg-violet-600";
                        if (rate >= 0.2) return "bg-violet-300 dark:bg-violet-700";
                        if (rate >= 0.05) return "bg-violet-100 dark:bg-violet-900";
                        return "bg-violet-50/40 dark:bg-violet-950/40";
                      };
                      const truncCode = (s: string) => s.length > 6 ? s.slice(0, 6) : s;
                      return (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">
                            🗺️ 잠식 매트릭스 (행=잠식 대상 / 열=잠식 유발) · Top-{items.length} 품목
                          </div>
                          <div className="overflow-x-auto rounded border border-violet-200/50 dark:border-violet-800/50 bg-background/40 p-1.5">
                            <table className="text-[8px] border-collapse" role="grid" aria-label="잠식 매트릭스">
                              <thead>
                                <tr>
                                  <th className="w-12 sticky left-0 bg-background/80"></th>
                                  {items.map(col => (
                                    <th key={col.item} className="px-0.5 font-mono text-violet-700 dark:text-violet-300 align-bottom" title={col.itemName}>
                                      <div className="rotate-[-45deg] origin-bottom-left whitespace-nowrap" style={{ width: 14, height: 28 }}>
                                        {truncCode(col.item)}
                                      </div>
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {items.map(row => (
                                  <tr key={row.item}>
                                    <td className="px-1 py-0 font-mono text-[8px] text-violet-700 dark:text-violet-300 sticky left-0 bg-background/80 truncate max-w-[60px]" title={row.itemName}>
                                      {truncCode(row.item)}
                                    </td>
                                    {items.map(col => {
                                      if (row.item === col.item) {
                                        return <td key={col.item} className="w-3.5 h-3.5 bg-muted/30" title="대각선 (자기 자신)" />;
                                      }
                                      const cell = matrixLookup.get(`${row.item}__${col.item}`);
                                      if (!cell) {
                                        return <td key={col.item} className="w-3.5 h-3.5 bg-muted/10" title="샘플 < 4M (분석 제외)" />;
                                      }
                                      const tooltip = `${cell.itemAName} ← ${cell.itemBName}\nρ=${cell.correlation.toFixed(2)} · c=${(cell.cannibalRate*100).toFixed(1)}%\n신뢰도 ${cell.confidenceLevel} · ${cell.customerCount}개 거래처${cell.sameCategory ? "\n같은 대분류" : ""}`;
                                      return (
                                        <td
                                          key={col.item}
                                          className={`w-3.5 h-3.5 ${cellBg(cell.cannibalRate, cell.correlation)} ${cell.sameCategory ? "ring-1 ring-violet-400/60 dark:ring-violet-300/40" : ""}`}
                                          title={tooltip}
                                        />
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>색상 강도 = c 계수 (0~1)</span>
                            <span className="inline-flex items-center gap-0.5"><span className="w-2.5 h-2.5 bg-violet-50/40" /> 0</span>
                            <span className="inline-flex items-center gap-0.5"><span className="w-2.5 h-2.5 bg-violet-300" /> 0.2</span>
                            <span className="inline-flex items-center gap-0.5"><span className="w-2.5 h-2.5 bg-violet-500" /> 0.4</span>
                            <span className="inline-flex items-center gap-0.5"><span className="w-2.5 h-2.5 bg-violet-700" /> 0.6+</span>
                            <span className="inline-flex items-center gap-0.5"><span className="w-2.5 h-2.5 bg-gray-100 dark:bg-gray-800" /> 보완재 (ρ≥0)</span>
                            <span className="inline-flex items-center gap-0.5"><span className="w-2.5 h-2.5 ring-1 ring-violet-400" /> 같은 대분류</span>
                          </div>
                        </div>
                      );
                    })()}
                    {/* △ 비교: 단독 vs 자기잠식 vs 포트폴리오 순 */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">단독 효과</div>
                        <div className={`font-mono font-bold text-sm ${cannibalCorrection.aloneEffect >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-400"}`}>
                          {cannibalCorrection.aloneEffect >= 0 ? "+" : ""}{formatCurrency(cannibalCorrection.aloneEffect)}
                        </div>
                      </div>
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">자기잠식 손실</div>
                        <div className="font-mono font-bold text-sm text-amber-700 dark:text-amber-400">
                          {formatCurrency(cannibalCorrection.cannibalLoss)}
                        </div>
                      </div>
                      <div className="p-1.5 rounded border-2 border-violet-400 bg-violet-50/80 dark:bg-violet-950/40 text-center">
                        <div className="text-[10px] text-violet-700 dark:text-violet-300 font-semibold">포트폴리오 순효과</div>
                        <div className={`font-mono font-bold text-sm ${cannibalCorrection.portfolioNet >= 0 ? "text-violet-700 dark:text-violet-200" : "text-red-700 dark:text-red-400"}`}>
                          {cannibalCorrection.portfolioNet >= 0 ? "+" : ""}{formatCurrency(cannibalCorrection.portfolioNet)}
                        </div>
                      </div>
                    </div>
                    {/* Top-N 잠식 품목 리스트 */}
                    {cannibalCorrection.cannibalizedTopN.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[10px] font-semibold text-muted-foreground mb-0.5">⚠️ 잠식되는 Top-{cannibalCorrection.cannibalizedTopN.length} 품목</div>
                        <div className="space-y-0.5">
                          {cannibalCorrection.cannibalizedTopN.map((it, idx) => (
                            <div key={it.item} className="flex items-center justify-between text-[10px] px-1.5 py-0.5 rounded bg-background/40 border border-violet-200/40 dark:border-violet-800/40">
                              <span className="font-mono text-violet-700 dark:text-violet-300">{idx + 1}.</span>
                              <span className="flex-1 mx-1 truncate" title={it.itemName}>{it.itemName}</span>
                              <span className="font-mono text-amber-700 dark:text-amber-400">{formatCurrency(it.expectedLoss)}</span>
                              <span className="ml-1.5 text-[9px] text-muted-foreground">c={(it.cannibalRate * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] text-muted-foreground leading-snug">
                      💡 보라 = 포트폴리오 순효과 (단독 효과 + 자기잠식 합산). {cannibalIntensityLabel(cannibalMultiplier)} 시나리오 · 매트릭스 {cannibalResult.matrix.length}쌍 분석
                      {cannibalResult.notes.length > 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400" title={cannibalResult.notes.join("\n")}>
                          ⚠ {cannibalResult.notes[0]}
                        </span>
                      )}
                      <div className="mt-0.5 italic">⚠️ 상관 ≠ 인과: 의사결정 보조 도구로 활용. 실제 영향은 영업 현장 검증 필요.</div>
                    </div>
                  </>
                )}
                {cannibalEnabled && !cannibalCorrection && (
                  <div className="text-[10px] text-amber-600 dark:text-amber-400">
                    ⚠ 카니발 매트릭스 데이터 부족 (customerItemDetail 14M 시계열 필요) 또는 대상 품목 매출 0
                  </div>
                )}
              </div>
            )}

            {/* v2 WS6: 경쟁사 반응 시나리오 (시장 균형 차원) */}
            {targetItem && qdProposedPrice > 0 && quickVerdict.priceChangePct < 0 && (
              <div className="mb-2 p-2.5 rounded-lg border-2 border-rose-300 dark:border-rose-700 bg-gradient-to-br from-rose-50/60 to-orange-50/60 dark:from-rose-950/30 dark:to-orange-950/20">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={competitorEnabled}
                      onChange={(e) => setCompetitorEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-rose-600"
                    />
                    🎯 시장 반응 시나리오 (경쟁사 보복 가정)
                  </label>
                  <span className="text-[10px] text-muted-foreground font-normal">PED {(effectivePED ?? -1).toFixed(2)} · 점유율 30% 가정 · 점유율 반응 0.2</span>
                </div>
                {competitorEnabled && competitorPresets && (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(["alone", "partial", "full"] as const).map(scenario => {
                        const r = competitorPresets[scenario];
                        const isAlone = scenario === "alone";
                        return (
                          <div key={scenario} className={`p-1.5 rounded border text-center ${
                            isAlone ? "border-rose-300 bg-background/60" :
                            scenario === "partial" ? "border-orange-300 bg-orange-50/40 dark:bg-orange-950/20" :
                            "border-red-400 bg-red-50/40 dark:bg-red-950/20"
                          }`}>
                            <div className="text-[10px] font-semibold text-muted-foreground">{presetLabel(scenario)}</div>
                            <div className={`font-mono font-bold text-sm ${r.revenueChangePct >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                              매출 {r.revenueChangePct >= 0 ? "+" : ""}{safeFixed(r.revenueChangePct, 1)}%
                            </div>
                            <div className="text-[9px] text-muted-foreground">
                              수량 {r.qtyChangePct >= 0 ? "+" : ""}{safeFixed(r.qtyChangePct, 1)}% · 점유율 {safeFixed(r.newShare * 100, 1)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
                      💡 단독 vs 100% 보복 매출 차이 <b className="text-rose-700 dark:text-rose-300">{safeFixed(competitorPresets.alone.revenueChangePct - competitorPresets.full.revenueChangePct, 1)}%p</b> — 경쟁사 보복 시 점유율 보전 효과 사라져 결과 반전 가능. 이 모델은 가설입니다 (실제 경쟁사 반응 데이터 부재).
                    </div>
                  </>
                )}
                {competitorEnabled && !competitorPresets && (
                  <div className="text-[10px] text-muted-foreground italic">대상 품목·제안단가 입력 후 표시됩니다.</div>
                )}
              </div>
            )}

            {/* v2 WS5: 거래처 LTV 효과 (4번째 차원 — 거래처 평생 가치) */}
            {ltvImpact && targetCustomer && quickVerdict.priceChangePct < 0 && (
              <div className="mb-2 p-2.5 rounded-lg border-2 border-violet-300 dark:border-violet-700 bg-gradient-to-br from-violet-50/60 to-fuchsia-50/60 dark:from-violet-950/30 dark:to-fuchsia-950/20">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <div className="text-xs font-semibold inline-flex items-center gap-1 text-violet-800 dark:text-violet-200">
                    💎 거래처 LTV 효과
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">(평생 가치 관점)</span>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    ltvImpact.confidence === "normal" ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200" :
                    ltvImpact.confidence === "low" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                    "bg-gray-100 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300"
                  }`}>
                    {ltvConfidenceLabel(ltvImpact.confidence)}
                  </span>
                </div>
                {ltvImpact.confidence !== "insufficient" ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">거래처 LTV</div>
                        <div className="font-mono font-bold text-sm text-violet-700 dark:text-violet-300">
                          {formatCurrency(ltvImpact.baseLTV)}
                        </div>
                      </div>
                      <div className="p-1.5 rounded border bg-background/60 text-center">
                        <div className="text-[10px] text-muted-foreground">이탈 위험</div>
                        <div className="font-mono font-bold text-sm">
                          {ltvImpact.churnScore.toFixed(0)}<span className="text-[10px] text-muted-foreground">/100</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground">{riskLevelLabel(ltvImpact.riskLevel)}</div>
                      </div>
                      <div className="p-1.5 rounded border-2 border-violet-400 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-950/30 text-center">
                        <div className="text-[10px] text-muted-foreground">수용 시 보전</div>
                        <div className={`font-mono font-bold text-sm ${ltvImpact.acceptImpact > 0 ? "text-violet-700 dark:text-violet-300" : "text-gray-400"}`}>
                          {ltvImpact.acceptImpact > 0 ? "+" : ""}{formatCurrency(ltvImpact.acceptImpact)}
                        </div>
                        <div className="text-[9px] text-muted-foreground">거절 시: {formatCurrency(ltvImpact.rejectImpact)}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
                      💡 저가수주 수용 → 만족도 ↑ → 이탈 확률 약 {(ltvImpact.churnReductionPct * 100).toFixed(1)}% 감소 → 평생 가치 보전
                      {ltvImpact.notes.length > 0 && (
                        <span className="ml-1 text-amber-600 dark:text-amber-400" title={ltvImpact.notes.join("\n")}>
                          · ⚠ {ltvImpact.notes[0]}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-[11px] text-muted-foreground italic">
                    매출/이탈 이력 데이터 부족 — 매출리스트 업로드 후 재계산
                  </div>
                )}
              </div>
            )}

            {/* v2 WS4: PED (가격 탄력성) 자동 적용 */}
            {pedResult && (
              <div className="mb-2 p-2 rounded border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={pedEnabled}
                      onChange={(e) => setPedEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-purple-600"
                    />
                    💼 PED 자동 적용
                  </label>
                  <span className="text-[10px] text-purple-700 dark:text-purple-300 font-mono">
                    {pedSummaryLabel(pedResult)}
                  </span>
                </div>
                {pedEnabled && effectivePED !== undefined && (
                  <div className="mt-1 text-[10px] text-muted-foreground flex flex-wrap items-center gap-2">
                    <span>
                      판가 {quickVerdict.priceChangePct >= 0 ? "+" : ""}{safeFixed(quickVerdict.priceChangePct, 1)}% → 수량 자동 예상: <b className="text-purple-700 dark:text-purple-300">{safeFixed((Math.pow(1 + quickVerdict.priceChangePct / 100, effectivePED) - 1) * 100, 1)}%</b>
                    </span>
                    <span>·</span>
                    <label className="inline-flex items-center gap-1">
                      수동 PED:
                      <input
                        type="number" step={0.1}
                        className="w-16 border rounded px-1 py-0.5 bg-background text-[10px]"
                        value={effectivePED}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && targetItem) {
                            setPedOverride(m => new Map(m).set(targetItem, v));
                          }
                        }}
                      />
                    </label>
                    {pedResult.notes.length > 0 && (
                      <span className="text-amber-700 dark:text-amber-400" title={pedResult.notes.join("\n")}>
                        ⚠ {pedResult.notes[0]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* v2 WS3: 단위공헌이익 — 박리다매 엔진의 실체를 항상 노출 */}
            {quickCMInfo && (
              <div className="mb-2 p-2 rounded border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-300">
                  💡 단위공헌이익
                  <MetricInfo id="unit_contribution_margin" variant="inline" currentValue={quickCMInfo.unitCM} />
                </span>
                <span className={`font-mono font-bold text-sm ${quickCMInfo.unitCM >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600 dark:text-red-400"}`}>
                  {quickCMInfo.unitCM >= 0 ? "+" : ""}{formatCurrency(quickCMInfo.unitCM)}/단위
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  = 제안단가 {formatCurrency(qdProposedPrice)} − {quickCMInfo.hasCostChange ? "조정" : ""} 변동비 {formatCurrency(quickCMInfo.adjustedUVC)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · 추가 {qdAdditionalQty > 0 ? qdAdditionalQty.toLocaleString() : "N"}개 판매 시 물량 기여: <span className="font-semibold text-blue-700 dark:text-blue-300">{formatCurrency(quickCMInfo.unitCM * Math.max(qdAdditionalQty, 0))}</span>
                </span>
              </div>
            )}

            {/* 이유 */}
            <div className="space-y-1 mb-2">
              {quickVerdict.reasons.map((r, i) => (
                <p key={i} className="text-xs leading-relaxed">{r}</p>
              ))}
            </div>

            {/* v2 WS2: 캐파 Step-up 경고 (수불현황 기반 자동 제안) */}
            {capacityInfo && (
              <div className="mb-3 p-2.5 rounded-lg border bg-background/60 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold inline-flex items-center gap-1">
                    🏭 생산 캐파 분석
                    {capacityInfo.suggestion.factory && (
                      <span className="text-[10px] text-muted-foreground font-normal">({capacityInfo.suggestion.factory} 공장 · 최근 {capacityInfo.suggestion.samples}개월 관측)</span>
                    )}
                  </div>
                  <div className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    capacityInfo.alert.breachLevel === "severe" ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" :
                    capacityInfo.alert.breachLevel === "warning" ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300" :
                    capacityInfo.alert.breachLevel === "caution" ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" :
                    "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                  }`}>
                    {safeFixed(capacityInfo.alert.usagePct * 100, 1)}% 사용
                  </div>
                </div>
                {/* Gauge bar */}
                <div className="relative h-2 bg-muted/60 rounded-full overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 h-full transition-all ${
                      capacityInfo.alert.breachLevel === "severe" ? "bg-red-500" :
                      capacityInfo.alert.breachLevel === "warning" ? "bg-orange-500" :
                      capacityInfo.alert.breachLevel === "caution" ? "bg-amber-500" :
                      "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(100, capacityInfo.alert.usagePct * 100)}%` }}
                  />
                  {/* 80% 및 100% 기준선 */}
                  <div className="absolute top-0 h-full w-px bg-foreground/30" style={{ left: "80%" }} />
                  <div className="absolute top-0 h-full w-px bg-foreground/50" style={{ left: "100%" }} />
                </div>
                <div className="text-[10px] text-muted-foreground">
                  현재 {capacityInfo.baseQty.toLocaleString()} + 추가 {qdAdditionalQty.toLocaleString()} = <b>{(capacityInfo.baseQty + qdAdditionalQty).toLocaleString()}</b> / 캐파 <b>{capacityInfo.config.monthlyCapacity.toLocaleString()}</b>
                  <span className="ml-2 text-muted-foreground/70">
                    (자동 제안: 과거 월별 max {capacityInfo.suggestion.monthlyMax.toLocaleString()} × 110%)
                  </span>
                </div>
                {/* Breach 경고 배너 */}
                {capacityInfo.alert.breachLevel !== "ok" && (
                  <div className={`text-[11px] font-medium pl-1 border-l-2 ${
                    capacityInfo.alert.breachLevel === "severe" ? "border-red-500 text-red-700 dark:text-red-300" :
                    capacityInfo.alert.breachLevel === "warning" ? "border-orange-500 text-orange-700 dark:text-orange-300" :
                    "border-amber-500 text-amber-700 dark:text-amber-300"
                  }`}>
                    {capacityInfo.alert.message}
                  </div>
                )}
                {capacityInfo.alert.breachLevel === "severe" && capacityInfo.alert.additionalFixedCost > 0 && (
                  <div className="text-[10px] text-red-600 dark:text-red-400 leading-snug">
                    🚨 <b>숨겨진 투자비 경고</b>: 저가수주 판정에 반영되지 않은 월 고정비 <b>{formatCurrency(capacityInfo.alert.additionalFixedCost)}</b>이(가) 실제 실행 시 발생합니다. 판정 결과를 반드시 재평가하세요.
                  </div>
                )}
                {/* 수동 조정 */}
                <details className="text-[10px] mt-1">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">⚙️ 캐파 / Step-up 조정</summary>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">월 캐파</span>
                      <input type="number" className="border rounded px-1.5 py-0.5 bg-background"
                        value={capacityInfo.config.monthlyCapacity}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setCapacityOverrides(m => new Map(m).set(targetItem!, { ...(m.get(targetItem!) ?? {}), monthlyCapacity: v }));
                        }} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">라인당 월고정비</span>
                      <input type="number" className="border rounded px-1.5 py-0.5 bg-background"
                        value={capacityInfo.config.stepUpFixedCost}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setCapacityOverrides(m => new Map(m).set(targetItem!, { ...(m.get(targetItem!) ?? {}), stepUpFixedCost: v }));
                        }} />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">라인당 증산능력</span>
                      <input type="number" className="border rounded px-1.5 py-0.5 bg-background"
                        value={capacityInfo.config.stepUpGranularity}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 1;
                          setCapacityOverrides(m => new Map(m).set(targetItem!, { ...(m.get(targetItem!) ?? {}), stepUpGranularity: v }));
                        }} />
                    </label>
                  </div>
                </details>
              </div>
            )}

            {/* v2 WS1: Monte Carlo 불확실성 분석 */}
            <div className="mt-3 pt-2 border-t border-indigo-200/60 dark:border-indigo-800/60">
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="inline-flex items-center gap-2 text-[11px] font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={mcEnabled}
                    onChange={(e) => setMcEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 accent-indigo-600"
                  />
                  🎲 Monte Carlo 불확실성 분석 (5,000회)
                </label>
                {mcVerdict && (
                  <span className="text-[10px] text-muted-foreground">
                    실측 σ 기반 · 원재료 {safeFixed(FALLBACK_CV_UI.rawMaterial * 100, 1)}%, 노무 {safeFixed(FALLBACK_CV_UI.labor * 100, 1)}%, 외주 {safeFixed(FALLBACK_CV_UI.outsourcing * 100, 1)}%
                  </span>
                )}
              </div>
              {mcEnabled && mcVerdict && mcVerdict.iterations > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-1.5 rounded border bg-background/60 text-center">
                    <div className="text-[10px] text-muted-foreground">평균 기대값</div>
                    <div className={`font-mono font-bold text-sm ${mcVerdict.mean >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                      {mcVerdict.mean >= 0 ? "+" : ""}{formatCurrency(mcVerdict.mean)}
                    </div>
                  </div>
                  <div className="p-1.5 rounded border bg-background/60 text-center">
                    <div className="text-[10px] text-muted-foreground">95% 신뢰구간</div>
                    <div className="font-mono text-[11px] font-semibold">
                      {formatCurrency(mcVerdict.p5)}<br/>~ {formatCurrency(mcVerdict.p95)}
                    </div>
                  </div>
                  <div className={`p-1.5 rounded border text-center ${mcVerdict.lossProbability <= 0.1 ? "border-green-300 bg-green-50/40 dark:bg-green-950/20" : mcVerdict.lossProbability <= 0.3 ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : "border-red-300 bg-red-50/40 dark:bg-red-950/20"}`}>
                    <div className="text-[10px] text-muted-foreground">손실 확률</div>
                    <div className={`font-mono font-bold text-sm ${mcVerdict.lossProbability <= 0.1 ? "text-green-700 dark:text-green-400" : mcVerdict.lossProbability <= 0.3 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}`}>
                      {safeFixed(mcVerdict.lossProbability * 100, 1)}%
                    </div>
                  </div>
                  <div className="p-1.5 rounded border bg-background/60 text-center">
                    <div className="text-[10px] text-muted-foreground">표준편차 σ</div>
                    <div className="font-mono text-[11px] font-semibold">{formatCurrency(mcVerdict.stddev)}</div>
                    <div className="text-[9px] text-muted-foreground">{mcVerdict.iterations.toLocaleString()}회 시뮬</div>
                  </div>
                </div>
              )}
              {mcEnabled && mcVerdict && mcVerdict.iterations > 0 && (
                <div className="mt-1.5 text-[10px] text-muted-foreground leading-snug">
                  💡 결과 해석: 평균 기대값이 양수여도 <b>손실 확률</b>이 높으면 실제 실행 시 적자 가능성 有. 95% CI 폭이 넓을수록 불확실성이 크며, 판가/원가 변동성이 큰 품목일수록 폭이 확장됩니다.
                  {mcVerdict.usedFallback && " (200 보고서 없어 전사 평균 폴백 σ 사용 중)"}
                </div>
              )}
              {mcEnabled && (!mcVerdict || mcVerdict.iterations === 0) && (
                <div className="text-[10px] text-muted-foreground italic">품목·수량·제안단가를 모두 입력하면 MC 시뮬이 실행됩니다.</div>
              )}
            </div>

            {/* 감도: 최소 필요 수량 */}
            {quickVerdict.minRequiredVolume !== null && (
              <div className={`text-xs mt-2 px-2 py-1 rounded flex items-center gap-1.5 ${quickVerdict.isVolumeEnough ? "bg-green-100/50 dark:bg-green-900/20" : "bg-amber-100/50 dark:bg-amber-900/20"}`}>
                <span>
                  감도: 단독 손익분기 최소 <strong>{quickVerdict.minRequiredVolume.toLocaleString()}</strong>개
                  {quickVerdict.isVolumeEnough
                    ? ` (입력 ${qdAdditionalQty.toLocaleString()}개 → 충분)`
                    : ` (입력 ${qdAdditionalQty.toLocaleString()}개 → 부족)`}
                </span>
                <VerdictInfo
                  title="단독 손익분기 최소 수량"
                  formula={"최소 수량 = 단가 인하 총손실 ÷ 단위 공헌이익\n\n= 기존수량 × (기존단가 − 제안단가)\n  ÷ (제안단가 − 단위 변동비)"}
                  description={"이 수량만큼 추가로 팔아야\n'대상 품목 단독'으로 본전이 됩니다.\n\n입력한 추가 수량이\n  이 숫자 이상 → '단독으로도 이득' 충족\n  이 숫자 미만 → 풀 덤 효과나\n    거래처 관계 가치의 도움이 필요"}
                />
              </div>
            )}

            <p className="text-[10px] text-muted-foreground mt-2">
              4a(100 보고서)와 4b(200 보고서)는 데이터 범위가 달라 정확한 합산이 아닙니다. 방향성 참고용.
            </p>
          </div>
        )}

        {/* 미입력 안내 */}
        {(!targetItem || qdAdditionalQty <= 0 || qdProposedPrice <= 0) && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            품목 · 수량 · 단가를 입력하면 즉시 판정 결과가 표시됩니다
          </div>
        )}
      </div>

      {/* ═══ 상세 분석 (기존 Step 1~5) ═══ */}
      <details ref={detailRef} open={showDetailedAnalysis} onToggle={(e) => setShowDetailedAnalysis((e.target as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer font-semibold text-sm p-3 border rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2">
          <span className="text-base">{showDetailedAnalysis ? "▼" : "▶"}</span>
          상세 분석 보기 (Step 1~5 전체)
          <span className="text-xs font-normal text-muted-foreground">— 시뮬레이션 슬라이더, CVP 차트, 4사분면, 워터폴 등</span>
        </summary>
        <div className="pt-4 space-y-6">

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
        {onNavigate && (
          <button onClick={() => onNavigate("lowPriceVerify")} className="ml-auto px-2.5 py-1 rounded text-[11px] border border-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 transition-colors">
            가설 검증 탭 →
          </button>
        )}
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
              <li>저가수주 판단기 원가 반영: <code>src/lib/analysis/offsetEffect.ts#calcQuickVerdict</code> ← costChangePct/vcCostRatioMap forward</li>
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
              {groupCapacity && groupCapacity > 0 && (
                <ReferenceLine x={Math.round(groupCapacity)} stroke="#ef4444" strokeDasharray="5 3" strokeWidth={2}
                  label={{ value: `Capacity (${Math.round(groupCapacity).toLocaleString()}${selectedGroup.unit}) ⚠`, fontSize: 9, fill: "#ef4444", position: "insideTopRight" }} />
              )}
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
            <strong>대수 항등식:</strong> newOP − baseOP ≡ priceEffect + costEffect + volumeEffect<br />
            <strong>3-way 분해:</strong>
            <br />• priceEffect = Σ(기존수량 × (신규단가 − 기존단가)) — 가격 변동
            <br />• costEffect = Σ(기존수량 × (기존변동비 − 조정변동비)) — 원가 변동
            <br />• volumeEffect = Σ(추가수량 × (신규단가 − 조정변동비)) — 물량 변동
          </div>
          <p className="ml-6 text-[11px]"><strong>사용법:</strong> ① 대상 거래처/품목 선택 → ② 물량/단가/원가 슬라이더 조작 → ③ 워터폴로 이익 변동 확인 → ④ 최종 이익이 기존 이익보다 높으면 &quot;가설 성립&quot;</p>
        </div>

        {/* 컨트롤 카드 */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-3 mb-4">
          <h3 className="text-sm font-semibold">시나리오 설정</h3>

          {/* 대상 선택 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs min-w-[70px]">대상 거래처:</span>
              <div className="flex-1 relative" data-combobox>
                <button type="button" onClick={() => { setCustPickerOpen(!custPickerOpen); setItemPickerOpen(false); }}
                  className="w-full text-left text-xs border rounded px-2 py-1.5 bg-background truncate cursor-pointer hover:border-blue-400 transition-colors">
                  {targetCustomer
                    ? `${customerList.find(c => c.code === targetCustomer)?.name || targetCustomer}`
                    : "전체 거래처 (클릭하여 검색)"}
                </button>
                {custPickerOpen && (
                  <div className="absolute z-50 top-full mt-1 w-full min-w-[300px] bg-popover border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
                    <div className="p-2 border-b">
                      <input type="text" autoFocus value={custSearch}
                        onChange={(e) => setCustSearch(e.target.value)}
                        placeholder="거래처명 또는 코드 검색..."
                        className="w-full text-sm border rounded px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button type="button" onClick={() => { setTargetCustomer(null); setCustPickerOpen(false); setCustSearch(""); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b font-medium">
                      전체 거래처
                    </button>
                    <div className="max-h-[240px] overflow-y-auto">
                      {filteredCustList.map(c => (
                        <button type="button" key={c.code}
                          onClick={() => { setTargetCustomer(c.code); setCustPickerOpen(false); setCustSearch(""); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center ${
                            targetCustomer === c.code ? "bg-blue-50 dark:bg-blue-950/30 font-semibold" : ""
                          }`}>
                          <span className="truncate flex-1">{c.name}</span>
                          <span className="text-muted-foreground ml-2 text-[11px] whitespace-nowrap">{formatCurrency(c.revenue, true)}</span>
                        </button>
                      ))}
                      {filteredCustList.length === 0 && (
                        <p className="text-center text-muted-foreground py-3 text-sm">&quot;{custSearch}&quot; 결과 없음</p>
                      )}
                    </div>
                    <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                      {custSearch
                        ? `검색 결과 ${filteredCustList.length}건 / 전체 ${customerList.length}건`
                        : `전체 ${customerList.length}건 표시`}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs min-w-[70px]">대상 품목:</span>
              <div className="flex-1 relative" data-combobox>
                <button type="button" onClick={() => { setItemPickerOpen(!itemPickerOpen); setCustPickerOpen(false); }}
                  className="w-full text-left text-xs border rounded px-2 py-1.5 bg-background truncate cursor-pointer hover:border-blue-400 transition-colors">
                  {targetItem
                    ? `${itemList.find(i => i.code === targetItem)?.name || targetItem}`
                    : "전체 품목 (클릭하여 검색)"}
                </button>
                {itemPickerOpen && (
                  <div className="absolute z-50 top-full mt-1 w-full min-w-[320px] bg-popover border rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
                    <div className="p-2 border-b">
                      <input type="text" autoFocus value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="품목명 또는 코드 검색..."
                        className="w-full text-sm border rounded px-2.5 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button type="button" onClick={() => { setTargetItem(null); setItemPickerOpen(false); setItemSearch(""); setInputMode("percent"); setVolumeAbsolute(0); setPriceChangeDirect(0); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b font-medium">
                      전체 품목
                    </button>
                    <div className="max-h-[280px] overflow-y-auto">
                      {filteredItemList.map(i => (
                        <button type="button" key={i.code}
                          onClick={() => { setTargetItem(i.code); setItemPickerOpen(false); setItemSearch(""); setVolumeAbsolute(0); setPriceChangeDirect(0); setManualUnitPrice(0); if (!i.in100) setInputMode("absolute"); }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex justify-between items-center ${
                            targetItem === i.code ? "bg-blue-50 dark:bg-blue-950/30 font-semibold" : ""
                          }`}>
                          <span className="truncate flex-1">
                            {i.name}
                            {!i.in100 && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">200전용</span>}
                          </span>
                          <span className="text-muted-foreground ml-2 text-[11px] whitespace-nowrap">{formatCurrency(i.revenue, true)}</span>
                        </button>
                      ))}
                      {filteredItemList.length === 0 && (
                        <p className="text-center text-muted-foreground py-3 text-sm">&quot;{itemSearch}&quot; 결과 없음</p>
                      )}
                    </div>
                    <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                      {itemSearch
                        ? `검색 결과 ${filteredItemList.length}건 / 전체 ${itemList.length}건`
                        : `전체 ${itemList.length}건 표시`}
                    </div>
                  </div>
                )}
              </div>
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

          {/* 원가 비교 카드 — 100 기반 원가 (동일 분모 보장) */}
          {targetItem && selectedItemInfo && (selectedItemInfo.unitCost100 > 0 || selectedItemInfo.actualUnitCost > 0) && (() => {
            // 100 품목: unitCost100 (판매단가와 동일 분모), 200전용: actualUnitCost (대안 없음)
            const uc = selectedItemInfo.in100 ? selectedItemInfo.unitCost100 : selectedItemInfo.actualUnitCost;
            const up = selectedItemInfo.in100 ? safeDivide(selectedItemInfo.revenue, selectedItemInfo.quantity) : 0;
            const margin = selectedItemInfo.in100 ? up - uc : 0;
            const marginPct = selectedItemInfo.in100 ? safeDivide(margin, up) * 100 : 0;
            const isBelowCost = selectedItemInfo.in100 && margin < 0;
            const costRatioDisplay = selectedItemInfo.in100 ? safeDivide(uc, up) * 100 : selectedItemInfo.costRatio;
            return (
              <div className={`rounded-md border px-3 py-2 text-xs ${isBelowCost ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" : "bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700"}`}>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                  {selectedItemInfo.in100 ? (
                    <>
                      <div><span className="text-muted-foreground">판매단가</span> <span className="font-mono font-semibold">{formatCurrency(up)}</span></div>
                      <div><span className="text-muted-foreground">단위원가</span> <span className="font-mono font-semibold">{formatCurrency(uc)}</span></div>
                      <div>
                        <span className="text-muted-foreground">마진</span>{" "}
                        <span className={`font-mono font-semibold ${margin < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                          {margin > 0 ? "+" : ""}{formatCurrency(margin)} ({safeFixed(marginPct, 1)}%)
                        </span>
                      </div>
                      <div><span className="text-muted-foreground">원가율</span> <span className="font-mono">{safeFixed(costRatioDisplay, 1)}%</span></div>
                      {selectedItemInfo.actualUnitCost > 0 && Math.abs(uc - selectedItemInfo.actualUnitCost) > 1 && (
                        <span className="text-[9px] text-muted-foreground">(참고 200원가: {formatCurrency(selectedItemInfo.actualUnitCost)})</span>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                        <strong className="text-amber-800 dark:text-amber-300">판매 실적 없음 (200 보고서 전용)</strong>
                      </div>
                      <div><span className="text-muted-foreground">실적 단위원가</span> <span className="font-mono font-semibold">{formatCurrency(uc)}</span></div>
                      <div><span className="text-muted-foreground">200 기준 수량</span> <span className="font-mono">{selectedItemInfo.quantity.toLocaleString()} {selectedItemInfo.unit || "개"}</span></div>
                    </>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">{selectedItemInfo.in100 ? "100 리포트 (매출액−매출총이익)/수량" : "200 리포트 실적매출원가/수량"}</span>
                </div>
                {isBelowCost && (
                  <div className="mt-1 text-red-700 dark:text-red-400 font-semibold flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> 원가 미달 — 판매단가가 실적 원가보다 낮습니다
                  </div>
                )}
                {adjustedCostInfo && (
                  <div className="mt-1 pt-1 border-t border-dashed flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">조정 후 단위원가</span>{" "}
                      <span className={`font-mono font-semibold ${adjustedCostInfo.costDiff > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                        {formatCurrency(adjustedCostInfo.adjustedUnitCost)}
                      </span>
                      <span className={`ml-1 text-[10px] ${adjustedCostInfo.costDiff > 0 ? "text-red-500" : "text-green-600"}`}>
                        ({adjustedCostInfo.costDiff > 0 ? "+" : ""}{safeFixed(adjustedCostInfo.costChangePctTotal, 1)}%)
                      </span>
                    </div>
                    {selectedItemInfo?.in100 && (() => {
                      const adjUp = safeDivide(selectedItemInfo.revenue, selectedItemInfo.quantity);
                      const adjMargin = adjUp - adjustedCostInfo.adjustedUnitCost;
                      const adjMarginPct = safeDivide(adjMargin, adjUp) * 100;
                      return (
                        <div>
                          <span className="text-muted-foreground">조정 후 마진</span>{" "}
                          <span className={`font-mono font-semibold ${adjMargin < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                            {adjMargin > 0 ? "+" : ""}{formatCurrency(adjMargin)} ({safeFixed(adjMarginPct, 1)}%)
                          </span>
                        </div>
                      );
                    })()}
                    {!adjustedCostInfo.hasRatioData && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">(추정 비율 사용)</span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">원가 슬라이더 반영</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 200 전용: 희망 판매단가 입력 → 시뮬 활성화 */}
          {is200Only && targetItem && (
            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <DollarSign className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-blue-800 dark:text-blue-300">희망 판매단가를 입력하면 시뮬레이션이 작동합니다</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs min-w-[90px]">희망 판매단가:</span>
                <input type="number" value={manualUnitPrice || ""}
                  onChange={(e) => setManualUnitPrice(Number(e.target.value))}
                  placeholder={`원가 ${formatCurrency(selectedItemInfo?.actualUnitCost || 0)} 참고`}
                  className="flex-1 text-xs border rounded px-2 py-1.5 bg-background tabular-nums max-w-[200px]"
                  step={1000} min={0}
                />
                <span className="text-xs">원</span>
                {manualUnitPrice > 0 && selectedItemInfo && (() => {
                  const m = manualUnitPrice - selectedItemInfo.actualUnitCost;
                  const pct = safeDivide(m, manualUnitPrice) * 100;
                  return (
                    <span className={`text-xs font-semibold ${m < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                      예상 마진: {m > 0 ? "+" : ""}{formatCurrency(m)} ({safeFixed(pct, 1)}%)
                      {m < 0 && " (원가 미달!)"}
                    </span>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 슬라이더 (비율 모드) / 직접 입력 (절대 수량 모드) */}
          {inputMode === "percent" || !targetItem ? (<>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[90px] flex items-center gap-1">
                  물량 증감:
                  <MetricInfo id="volume_slider_4a" variant="inline" currentValue={volumeIncreasePct} />
                </span>
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
                <span className="text-xs min-w-[90px] flex items-center gap-1">
                  단가 조정:
                  <MetricInfo id="price_slider_4a" variant="inline" currentValue={priceChangePct} />
                </span>
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
            {priceChangePct !== 0 && (() => {
              const basePrice = targetItem
                ? cvpItems.find(i => i.item === targetItem)?.unitPrice ?? cvpSummary.weightedUnitPrice
                : cvpSummary.weightedUnitPrice;
              const newPrice = basePrice * (1 + priceChangePct / 100);
              const diff = newPrice - basePrice;
              const uc = adjustedCostInfo?.adjustedUnitCost ?? (selectedItemInfo?.in100 ? (selectedItemInfo?.unitCost100 || 0) : (selectedItemInfo?.actualUnitCost || 0));
              const simMargin = uc > 0 ? newPrice - uc : 0;
              return basePrice > 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-xs bg-slate-50 dark:bg-slate-900/40 rounded px-3 py-1.5">
                  <span className="text-muted-foreground">기준단가:</span>
                  <span className="font-mono font-semibold">{formatCurrency(basePrice)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={`font-mono font-semibold ${diff < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                    {formatCurrency(newPrice)}
                  </span>
                  <span className={`text-[11px] ${diff < 0 ? "text-red-500" : "text-green-600"}`}>
                    (△ {diff > 0 ? "+" : ""}{formatCurrency(diff)})
                  </span>
                  {uc > 0 && (<>
                    <span className="text-muted-foreground ml-1">|</span>
                    <span className="text-muted-foreground">{adjustedCostInfo ? "조정원가:" : "원가:"}</span>
                    <span className="font-mono">{formatCurrency(uc)}</span>
                    <span className={`font-mono font-semibold ${simMargin < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                      시뮬마진 {simMargin > 0 ? "+" : ""}{formatCurrency(simMargin)}
                    </span>
                  </>)}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {targetItem ? "선택 품목" : "전체 가중평균"} · {is200Only ? "200 보고서 기준" : dataPeriodLabel}
                  </span>
                </div>
              ) : null;
            })()}
          </>) : (
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
                  {priceChangeDirect !== 0 && (() => {
                    const bp = sel?.quantity ? sel.revenue / sel.quantity : cvpSummary.weightedUnitPrice;
                    const np = bp * (1 + priceChangeDirect / 100);
                    const d = np - bp;
                    const uc = adjustedCostInfo?.adjustedUnitCost ?? (selectedItemInfo?.in100 ? (selectedItemInfo?.unitCost100 || 0) : (selectedItemInfo?.actualUnitCost || 0));
                    const sm = uc > 0 ? np - uc : 0;
                    return bp > 0 ? (
                      <div className="col-span-2 flex flex-wrap items-center gap-2 text-xs bg-slate-50 dark:bg-slate-900/40 rounded px-3 py-1.5">
                        <span className="text-muted-foreground">기준단가:</span>
                        <span className="font-mono font-semibold">{formatCurrency(bp)}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className={`font-mono font-semibold ${d < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                          {formatCurrency(np)}
                        </span>
                        <span className={`text-[11px] ${d < 0 ? "text-red-500" : "text-green-600"}`}>
                          (△ {d > 0 ? "+" : ""}{formatCurrency(d)})
                        </span>
                        {uc > 0 && (<>
                          <span className="text-muted-foreground ml-1">|</span>
                          <span className="text-muted-foreground">{adjustedCostInfo ? "조정원가:" : "원가:"}</span>
                          <span className="font-mono">{formatCurrency(uc)}</span>
                          <span className={`font-mono font-semibold ${sm < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                            시뮬마진 {sm > 0 ? "+" : ""}{formatCurrency(sm)}
                          </span>
                        </>)}
                        <span className="text-[10px] text-muted-foreground ml-auto">선택 품목 · {is200Only ? "200 보고서 기준" : dataPeriodLabel}</span>
                      </div>
                    ) : null;
                  })()}
                </>);
              })()}
            </div>
          )}

          {/* 원가 변동 슬라이더 — 입력 모드 무관하게 항상 표시 */}
          <details className="mt-1">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              ⚙️ 원가 변동 시뮬레이션 (대상 품목에만 적용 — 0%면 현재 원가 유지)
              <span className="inline-flex items-center align-middle ml-1">
                <MetricInfo id="cost_slider_4a" variant="inline" />
              </span>
              {(costRawMaterialPct !== 0 || costLaborPct !== 0 || costOutsourcingPct !== 0) && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">적용 중</span>
              )}
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 p-3 rounded-md border bg-background/60">
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[70px]">원자재비:</span>
                <input type="range" min={-30} max={50} step={1} value={costRawMaterialPct}
                  onChange={(e) => setCostRawMaterialPct(Number(e.target.value))}
                  className="flex-1 accent-primary" />
                <input type="number" value={costRawMaterialPct} onChange={(e) => setCostRawMaterialPct(Number(e.target.value))}
                  className="w-14 text-xs text-right border rounded px-1 py-0.5 bg-background tabular-nums" step={1} />
                <span className="text-xs">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[70px]">노무비:</span>
                <input type="range" min={-20} max={30} step={1} value={costLaborPct}
                  onChange={(e) => setCostLaborPct(Number(e.target.value))}
                  className="flex-1 accent-primary" />
                <input type="number" value={costLaborPct} onChange={(e) => setCostLaborPct(Number(e.target.value))}
                  className="w-14 text-xs text-right border rounded px-1 py-0.5 bg-background tabular-nums" step={1} />
                <span className="text-xs">%</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs min-w-[70px]">외주가공:</span>
                <input type="range" min={-20} max={30} step={1} value={costOutsourcingPct}
                  onChange={(e) => setCostOutsourcingPct(Number(e.target.value))}
                  className="flex-1 accent-primary" />
                <input type="number" value={costOutsourcingPct} onChange={(e) => setCostOutsourcingPct(Number(e.target.value))}
                  className="w-14 text-xs text-right border rounded px-1 py-0.5 bg-background tabular-nums" step={1} />
                <span className="text-xs">%</span>
              </div>
            </div>
            {adjustedCostInfo && (
              <div className="mt-3 p-2.5 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                  <Info className="h-3.5 w-3.5" />
                  원가 조정 결과 — {selectedItemInfo?.name || targetItem}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <div>
                    <span className="text-muted-foreground">기존 단위원가</span>{" "}
                    <span className="font-mono">{formatCurrency(adjustedCostInfo.originalUnitCost)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">→ 조정 후</span>{" "}
                    <span className={`font-mono font-semibold ${adjustedCostInfo.costDiff > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                      {formatCurrency(adjustedCostInfo.adjustedUnitCost)}
                    </span>
                    <span className={`ml-1 text-[10px] ${adjustedCostInfo.costDiff > 0 ? "text-red-500" : "text-green-600"}`}>
                      (△ {adjustedCostInfo.costDiff > 0 ? "+" : ""}{formatCurrency(adjustedCostInfo.costDiff)}, {adjustedCostInfo.costDiff > 0 ? "+" : ""}{safeFixed(adjustedCostInfo.costChangePctTotal, 1)}%)
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>변동비 비중: {safeFixed(adjustedCostInfo.vcRatio * 100, 0)}%</span>
                  <span>변동비: {formatCurrency(adjustedCostInfo.unitVC)} → {formatCurrency(adjustedCostInfo.adjustedUnitVC)}</span>
                  <span>고정비: {formatCurrency(adjustedCostInfo.unitFC)} (불변)</span>
                  {!adjustedCostInfo.hasRatioData && <span className="text-amber-600 dark:text-amber-400">* 200 보고서 원가 비율 없음 — 추정 비율 사용</span>}
                </div>
                {/* v2 WS3: 조정 후 단위공헌이익 — 박리다매 엔진의 실체 */}
                {adjustedCostInfo.baseUnitPrice > 0 && (
                  <div className="pt-1.5 mt-0.5 border-t border-amber-200/60 dark:border-amber-800/60 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-300">
                      조정 후 단위공헌이익
                      <MetricInfo id="unit_contribution_margin" variant="inline" currentValue={adjustedCostInfo.adjustedUnitCM} />
                    </span>
                    <span className={`font-mono font-bold ${adjustedCostInfo.adjustedUnitCM >= 0 ? "text-blue-700 dark:text-blue-300" : "text-red-600 dark:text-red-400"}`}>
                      {adjustedCostInfo.adjustedUnitCM >= 0 ? "+" : ""}{formatCurrency(adjustedCostInfo.adjustedUnitCM)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      = 조정 판매단가 {formatCurrency(adjustedCostInfo.adjustedUnitPrice)} − 조정 변동비 {formatCurrency(adjustedCostInfo.adjustedUnitVC)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      💡 추가 1개 판매 시 실제 이익 증가분 (고정비 제외)
                    </span>
                    {adjustedCostInfo.adjustedUnitMargin < 0 && adjustedCostInfo.adjustedUnitCM > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-semibold">
                        박리다매 여지 존재 (단위마진 음수, 공헌이익 양수)
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </details>

          {/* 프리셋 */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-muted-foreground mr-1">시나리오 프리셋:</span>
            <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(0); setPriceChangePct(0); setVolumeAbsolute(0); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">초기화</button>
            <span className="inline-flex items-center gap-0.5">
              <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(30); setPriceChangePct(-10); setPriceChangeDirect(-10); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">🎯 적극적 (+30%/-10%)</button>
              <MetricInfo id="preset_active" variant="inline" />
            </span>
            <span className="inline-flex items-center gap-0.5">
              <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(50); setPriceChangePct(-15); setPriceChangeDirect(-15); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">⚡ 공격적 (+50%/-15%)</button>
              <MetricInfo id="preset_aggressive" variant="inline" />
            </span>
            <span className="inline-flex items-center gap-0.5">
              <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(20); setPriceChangePct(-5); setPriceChangeDirect(-5); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">🛡️ 방어적 (+20%/-5%)</button>
              <MetricInfo id="preset_defensive" variant="inline" />
            </span>
            <span className="inline-flex items-center gap-0.5">
              <button onClick={() => { setInputMode("percent"); setVolumeIncreasePct(-10); setPriceChangePct(10); setPriceChangeDirect(10); }} className="px-2 py-1 rounded text-[10px] border hover:bg-muted">📈 단가 인상 (-10%/+10%)</button>
              <MetricInfo id="preset_price_up" variant="inline" />
            </span>
          </div>

          {/* 월별 단가·원가 추이 */}
          {targetItem && monthlyBreakdown && monthlyBreakdown.length >= 1 && (
            <details className="mt-1">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                📅 월별 단가·원가 추이 ({monthlyBreakdown.length}개월)
                {monthlyBreakdown.some(m => m.margin < 0) && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-[10px] font-semibold">원가 미달 월 있음</span>
                )}
              </summary>
              <div className="mt-2 space-y-2">
                {monthlyBreakdown.length >= 2 && (
                  <ChartContainer height="h-40">
                    <ComposedChart data={monthlyBreakdown}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: any) => formatCurrency(v, true)} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                      <Bar yAxisId="left" dataKey="unitPrice" name="매출단가" fill={CHART_COLORS[0]} radius={BAR_RADIUS_TOP} />
                      <Line yAxisId="left" dataKey="unitCost" name="단위원가" stroke="hsl(0, 84%, 60%)" strokeDasharray="5 5" dot={{ r: 3 }} strokeWidth={2} />
                      <Bar yAxisId="right" dataKey="quantity" name="수량" fill={CHART_COLORS[2]} opacity={0.25} radius={BAR_RADIUS_TOP} />
                      <RechartsTooltip {...TOOLTIP_STYLE} formatter={(v: any, name: any) => [typeof v === "number" ? (name === "수량" ? v.toLocaleString() : formatCurrency(v)) : v, name]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                    </ComposedChart>
                  </ChartContainer>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-1 px-2">월</th>
                        <th className="text-right py-1 px-2">매출단가</th>
                        <th className="text-right py-1 px-2">단위원가</th>
                        <th className="text-right py-1 px-2">마진</th>
                        <th className="text-right py-1 px-2">원가율</th>
                        <th className="text-right py-1 px-2">수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBreakdown.map(m => (
                        <tr key={m.month} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-1 px-2 font-mono">{m.monthLabel}</td>
                          <td className="py-1 px-2 text-right font-mono">{m.quantity > 0 ? formatCurrency(m.unitPrice) : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono">{m.quantity > 0 ? formatCurrency(m.unitCost) : "—"}</td>
                          <td className={`py-1 px-2 text-right font-mono font-semibold ${m.margin < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                            {m.quantity > 0 ? `${m.margin > 0 ? "+" : ""}${formatCurrency(m.margin)}` : "—"}
                          </td>
                          <td className="py-1 px-2 text-right font-mono">{m.quantity > 0 ? `${safeFixed(m.costRatio, 1)}%` : "—"}</td>
                          <td className="py-1 px-2 text-right font-mono">{m.quantity > 0 ? m.quantity.toLocaleString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}
        </div>

        {/* 실시간 KPI — 3-way 분해 */}
        <div className="flex items-center gap-2 mb-2 mt-1">
          <h4 className="text-sm font-semibold">실시간 KPI — 3-way 분해</h4>
          <MetricInfo
            id="final_operating_profit_4a"
            variant="heavy"
            triggerSuffix={<span className="text-[10px] text-primary">지표 4개 설명</span>}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <KpiCard
            title="기존 영업이익" value={totalSim.baseOperatingProfit} format="currency"
            formula="Σ[100.매출액·실적] − Σ[100.변동비] − Σ[200.제조고정비]"
            description="시나리오 적용 전 전사 영업이익"
            benchmark="시뮬레이션의 기준선"
            reason="변화 전 영업이익을 명확히 표시"
          />
          <KpiCard
            title={totalSim.priceEffect >= 0 ? "가격 효과 (이득)" : "가격 효과 (손실)"} value={totalSim.priceEffect} format="currency"
            formula="Σ(기존수량 × (신규단가 − 기존단가)) · 대상 품목만"
            description="대상 품목의 가격 변동에 의한 매출 변화"
            benchmark="가격 인상=양수, 인하=음수"
            reason="가격 변동의 직접 효과"
          />
          <KpiCard
            title={(() => {
              const combined = totalSim.costEffect + totalSim.volumeEffect;
              return combined >= 0 ? "원가+물량 효과 (이득)" : "원가+물량 효과 (손실)";
            })()}
            value={totalSim.costEffect + totalSim.volumeEffect} format="currency"
            formula={`원가: Σ(기존수량 × (기존변동비 − 조정변동비)) = ${formatCurrency(totalSim.costEffect)}\n물량: Σ(추가수량 × 신규단위공헌이익) = ${formatCurrency(totalSim.volumeEffect)}`}
            description={`원가 효과 ${formatCurrency(totalSim.costEffect)} + 물량 효과 ${formatCurrency(totalSim.volumeEffect)}`}
            benchmark="원가 인상=음수, 물량 증가=양수"
            reason="원가 변동과 물량 변동의 합산 효과"
          />
          <KpiCard
            title="최종 영업이익" value={totalSim.newOperatingProfit}
            previousValue={totalSim.baseOperatingProfit}
            format="currency"
            formula="기존 영업이익 + 가격효과 + 원가효과 + 물량효과 · 항등식: net ≡ price + cost + volume"
            description={`순효과 ${totalSim.netOffsetEffect >= 0 ? "+" : ""}${formatCurrency(totalSim.netOffsetEffect)}`}
            benchmark="기존 이익 대비 개선되면 가설 성립"
            reason="시뮬레이션 후 전사 영업이익"
          />
        </div>

        {/* 워터폴 차트 */}
        <div className="rounded-md border bg-muted/30 p-3 mb-3 text-xs text-muted-foreground space-y-1">
          <p><strong className="text-foreground">📖 워터폴 차트 읽는 법:</strong> 3-way 분해로 가격·원가·물량 효과를 순차 누적합니다.</p>
          <ul className="list-disc ml-5 space-y-0.5">
            <li><strong className="text-foreground">① 기존 영업이익 (녹색)</strong>: 시나리오 적용 전 — 출발점</li>
            <li><strong className="text-foreground">② 가격 효과</strong>: 기존수량 × 단가변동 (인하=빨강, 인상=녹색)</li>
            <li><strong className="text-foreground">③ 원가 효과</strong>: 기존수량 × 변동비변동 (원가인상=주황, 절감=녹색) — 슬라이더 0이면 생략</li>
            <li><strong className="text-foreground">④ 물량 효과</strong>: 추가수량 × 신규 단위공헌이익 (증가=파랑, 감소=빨강)</li>
            <li><strong className="text-foreground">⑤ 최종 영업이익</strong>: ① + ② + ③ + ④ — 항등식 보장</li>
          </ul>
          <p className="pt-1"><strong className="text-foreground">💡 판단 기준:</strong> ⑤가 ①보다 높으면 가설 성립(박리다매 유리), 낮으면 가설 반증(가격 방어 필요).</p>
        </div>
        <ChartCard
          title="상계 효과 워터폴"
          formula="기존 이익 → 가격 효과 → 원가 효과 → 물량 효과 → 최종 이익 (3-way 분해)"
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

        {/* A4: 가설 검증 메시지 — calcHypothesisVerdict() 연동 + Capacity 체크 */}
        {(() => {
          // Capacity 기반 판정 (가설 검증 탭 F5와 동일 로직)
          const capCheck = capacityMap.size > 0 && totalSim.newTotalQuantity > 0
            ? { alertLevel: (totalSim.newTotalQuantity / totalSim.baseTotalQuantity > 1.15 && capacityMap.size > 0) ? "caution" : "safe" }
            : undefined;
          const verdict = calcHypothesisVerdict(totalSim, capCheck);
          const r = totalSim.hypothesisResult;
          const cfg = verdict.verdict === "partial"
            ? { bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-300", Icon: AlertTriangle, iconCls: "text-amber-600",
                title: `⚠ ${verdict.label} — 상계 효과 +${formatCurrency(totalSim.netOffsetEffect)}`,
                desc: "이익은 증가하나 물량 증가폭이 커서 현재 설비 Capacity 초과 가능성 있음. 추가 설비 · 2교대 도입 시 고정비 Step-up이 발생하여 가설 전제가 무너질 수 있습니다." }
            : r === "positive"
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

        {/* ═══ 4a+4b 종합 판정 카드 ═══ */}
        {(() => {
          const comp = calcComprehensiveVerdict(
            totalSim, filteredItemProfitability,
            targetItem, volumeIncreasePct,
            inputMode === "absolute" ? priceChangeDirect : priceChangePct,
          );
          const portfolio = calcCustomerPortfolioOffset(cvpItems, targetItem, targetCustomer);

          if (comp.comprehensiveResult === "unavailable" && portfolio.totalCustomers === 0) return null;
          if (totalSim.hypothesisResult === "neutral") return null; // 슬라이더 미조작 시 표시 안함

          return (
            <div className="mt-4 space-y-3">
              {/* 종합 판정 카드 */}
              {comp.comprehensiveResult !== "unavailable" && (
                <div className="rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <span className="text-base">🔗</span>
                    종합 판정: 다른 품목 효과 포함
                  </h4>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className={`text-center p-2 rounded border ${comp.singleItemResult === "positive" ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:bg-red-950/20"}`}>
                      <div className="text-[10px] text-muted-foreground">4a 단독</div>
                      <div className="text-xs font-bold">(대상품목)</div>
                      <div className={`text-sm font-bold mt-1 ${comp.singleItemEffect >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                        {formatCurrency(comp.singleItemEffect)}
                      </div>
                    </div>
                    <div className={`text-center p-2 rounded border ${(comp.poolOthersGain ?? 0) > 0 ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-gray-300 bg-gray-50 dark:bg-gray-950/20"}`}>
                      <div className="text-[10px] text-muted-foreground">4b 풀 덤</div>
                      <div className="text-xs font-bold">(다른품목 원가절감)</div>
                      <div className={`text-sm font-bold mt-1 ${(comp.poolOthersGain ?? 0) > 0 ? "text-green-700 dark:text-green-400" : "text-gray-500"}`}>
                        {comp.poolOthersGain !== null ? formatCurrency(comp.poolOthersGain) : "N/A"}
                      </div>
                    </div>
                    <div className={`text-center p-2 rounded border-2 ${comp.comprehensiveResult === "positive" ? "border-green-500 bg-green-50 dark:bg-green-950/30" : comp.comprehensiveResult === "negative" ? "border-red-500 bg-red-50 dark:bg-red-950/30" : "border-gray-500 bg-gray-50 dark:bg-gray-950/30"}`}>
                      <div className="text-[10px] text-muted-foreground">종합</div>
                      <div className="text-xs font-bold">(방향성 참고)</div>
                      <div className={`text-sm font-bold mt-1 ${comp.comprehensiveNet !== null && comp.comprehensiveNet >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                        {comp.comprehensiveNet !== null ? formatCurrency(comp.comprehensiveNet) : "N/A"}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">{comp.interpretation}</p>
                  {comp.poolName && (
                    <p className="text-[10px] text-muted-foreground mt-2">
                      풀: {comp.poolLevel} = {comp.poolName} | ⚠️ 4a(100 보고서)와 4b(200 보고서)는 데이터 범위가 달라 정확한 합산이 아닙니다. 방향성 참고용입니다.
                    </p>
                  )}
                  {/* [H3] 판정 모순 경고 */}
                  {quickVerdict.verdict === "approve" && comp.comprehensiveResult === "negative" && (
                    <div className="mt-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950 border-l-4 border-amber-500 text-[10px] rounded">
                      <strong>참고:</strong> 판단기는 &ldquo;진행 가능&rdquo;이나 종합판정은 &ldquo;부정적&rdquo;입니다.
                      이유: 판단기는 전사 영업이익 관점(고정비 총액 불변), 종합판정은 풀 내 고정비 재배분 관점입니다.
                    </div>
                  )}
                </div>
              )}

              {/* 거래처 포트폴리오 참고 */}
              {targetItem && portfolio.totalCustomers > 0 && (
                <details className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10">
                  <summary className="cursor-pointer p-3 text-sm font-semibold hover:bg-amber-100/30 dark:hover:bg-amber-900/20 rounded-lg flex items-center gap-2">
                    <span>👥</span>
                    거래처 포트폴리오 참고 — {portfolio.positiveCount}/{portfolio.totalCustomers}개 거래처가 전체 마진 양수
                  </summary>
                  <div className="px-3 pb-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      대상 품목을 구매하는 거래처의 전체 구매 포트폴리오(다른 품목 포함) 마진 합산.
                      &ldquo;이 거래처를 잃으면 이만큼의 마진을 포기하는 것&rdquo; — 기회비용 관점.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="p-1.5">거래처</th>
                            <th className="p-1.5 text-right">대상 품목 CM</th>
                            <th className="p-1.5 text-right">다른 품목 CM</th>
                            <th className="p-1.5 text-right">합계</th>
                            <th className="p-1.5 text-center">판정</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portfolio.customers.filter(c => c.otherItemCount > 0).slice(0, 10).map((c) => (
                            <tr key={c.customer} className="border-b hover:bg-muted/50">
                              <td className="p-1.5 font-medium">{c.customerName}</td>
                              <td className={`p-1.5 text-right font-mono ${c.targetItemCM < 0 ? "text-red-600" : "text-green-600"}`}>{formatCurrency(c.targetItemCM)}</td>
                              <td className={`p-1.5 text-right font-mono ${c.otherItemsCM > 0 ? "text-green-600" : "text-gray-500"}`}>{formatCurrency(c.otherItemsCM)}{c.otherItemCount > 0 && <span className="text-[9px] text-muted-foreground ml-1">({c.otherItemCount}건)</span>}</td>
                              <td className={`p-1.5 text-right font-mono font-bold ${c.portfolioTotalCM >= 0 ? "text-green-700" : "text-red-700"}`}>{formatCurrency(c.portfolioTotalCM)}</td>
                              <td className="p-1.5 text-center">{c.isPositive ? "✅" : "❌"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* [H2] 단일 품목 거래처 카운트 */}
                    {portfolio.customers.filter(c => c.otherItemCount === 0).length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        + {portfolio.customers.filter(c => c.otherItemCount === 0).length}개 거래처는 이 품목만 구매 (포트폴리오 효과 없음)
                      </p>
                    )}
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-2">
                      ⚠️ 기존 실적 기준 참고 정보입니다. 저가 수주가 거래처 관계 유지의 필수 조건이라는 가정이 포함되어 있습니다.
                    </p>
                  </div>
                </details>
              )}
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

          {/* 4b 판정 배너 — 원가 절감 효과 인과 설명 */}
          {poolSim && poolSim.otherItemsMarginDelta !== 0 && (
            <div className={`px-3 py-2 rounded border-l-4 text-xs mb-3 ${poolSim.otherItemsMarginDelta > 0 ? "bg-green-50 dark:bg-green-950/20 border-green-500" : "bg-red-50 dark:bg-red-950/20 border-red-500"}`}>
              <strong>판정:</strong> 대상 품목 물량 변동 → {poolSim.poolName} 풀 내 {poolSim.simulatedItems.length - 1}개 다른 품목의 단위고정비 {poolSim.otherItemsMarginDelta > 0 ? "감소" : "증가"}.
              풀 순효과 = 대상 품목 Δ({formatCurrency(poolSim.targetItemMarginDelta)}) + 다른 품목 Δ({formatCurrency(poolSim.otherItemsMarginDelta)}) = {formatCurrency(poolSim.netPoolMarginDelta)}.
              이 효과는 <strong>모든 거래처에 동일하게 적용</strong>됩니다 (품목 단위 분석).
            </div>
          )}

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
        <p><strong>대수 항등식</strong>: newOP − baseOP ≡ priceEffect + costEffect + volumeEffect. 3-way 분해로 가격·원가·물량 효과를 독립 분석.</p>
        <p><strong>핵심 가정</strong>: (1) 고정비 총액 불변 (설비 캐파 내 생산), (2) 변동비 선형 증가, (3) 원가 슬라이더는 대상 품목에만 적용 (비대상 불변), (4) 배분 관점은 장부상 표시 목적.</p>
        <p><strong>대수 항등식</strong>: newOP − baseOP = priceReductionLoss + volumeContributionGain. 이 식은 고정비 총액 불변 가정 하에 수학적으로 정확.</p>
        <p><strong>왜곡 방지</strong>: 총액 관점(4a)과 배분 관점(4b)을 합산하지 않고 별도 섹션으로 제시. 무결성 검증(5)으로 두 관점의 합계 일치성 확인.</p>
      </div>

        </div>{/* end details content */}
      </details>
    </div>
  );
}

/**
 * 저가수주 판단기용 컴팩트 Info 툴팁.
 * @deprecated Phase 3에서 MetricInfo variant="compact"로 내부 위임.
 * 기존 호출부는 유지(호환성), 새 코드는 <MetricInfo variant="compact"> 직접 사용 권장.
 */
function VerdictInfo({
  title,
  formula,
  description,
  note,
}: {
  title: string;
  formula?: string;
  description?: string;
  note?: string;
}) {
  return (
    <MetricInfo
      variant="compact"
      title={title}
      formula={formula}
      intermediate={description}
      note={note}
    />
  );
}
