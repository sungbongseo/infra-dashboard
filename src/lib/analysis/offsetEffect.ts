/**
 * 저가수주 상계효과 검증 — 듀얼 뷰 시뮬레이터
 *
 * 영업 가설: "손해를 보더라도 물량을 늘려 제조 고정비 단위당 원가를 낮추면
 * 전체 이익이 최적화된다" (박리다매)
 *
 * 이 모듈은 두 가지 관점을 분리하여 제공합니다:
 *
 * 1. 총액 관점 (Primary, 수학적 정확):
 *    newOP - baseOP = priceReductionLoss + volumeContributionGain
 *    고정비 총액 불변 가정. 전사 영업이익의 실질적 변화.
 *
 * 2. 배분 관점 (Secondary, 장부상 재배분):
 *    품목별 고정비 풀을 재배분하여 "품목 A의 저가수주로 품목 B,C의 장부상
 *    단위 고정비가 감소" 효과를 시각화. 전사 이익에 추가 영향 없음.
 *
 * 핵심 검증 항등식:
 *    targetItemMarginDelta + otherItemsMarginDelta ≡ totalViewNetDelta
 *    (풀의 고정비 총액 불변이므로 재배분은 품목 간 이동만 있음)
 */
import type {
  CustomerItemDetailRecord,
  ItemProfitabilityRecord,
} from "@/types";
import { safeDivide } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────

export type Quadrant = "star" | "cashcow" | "question" | "dog";
export type FixedCostAllocation = "revenue" | "quantity";
export type PoolLevel = "대분류" | "중분류" | "품목계정그룹";

// Step 1~3: CVP 아이템 (거래처×품목)
export interface CVPItem {
  customer: string;
  customerName: string;
  item: string;
  itemName: string;
  quantity: number;
  revenue: number;
  variableCost: number;
  grossProfit: number;
  unitPrice: number;
  unitVariableCost: number;
  unitContributionMargin: number;
  totalContributionMargin: number;
  contributionMarginRatio: number;
  quadrant: Quadrant;
  isLowPriceOrder: boolean;
}

export interface CVPSummary {
  totalRevenue: number;
  totalVariableCost: number;
  totalContributionMargin: number;
  totalFixedCost: number;
  totalOperatingProfit: number;
  totalQuantity: number;
  weightedUnitPrice: number;
  weightedUnitVariableCost: number;
  weightedUnitContributionMargin: number;
  avgUnitFixedCost: number;
  overallContributionMarginRatio: number;
  bepQuantity: number;
  bepRevenue: number;
  healthyContributionSum: number;
  bleedingContributionLoss: number;
  healthyCount: number;
  bleedingCount: number;
}

// Step 4a: 총액 관점 시뮬레이션
export interface TotalViewSimulation {
  baseTotalRevenue: number;
  baseTotalVariableCost: number;
  baseOperatingProfit: number;
  baseTotalQuantity: number;
  baseAvgUnitFixedCost: number;
  targetCustomer: string | null;
  targetItem: string | null;
  volumeIncreasePct: number;
  priceDecreasePct: number;
  newTotalRevenue: number;
  newTotalVariableCost: number;
  newTotalQuantity: number;
  newAvgUnitFixedCost: number;
  newOperatingProfit: number;
  priceReductionLoss: number;
  volumeContributionGain: number;
  netOffsetEffect: number;
  hypothesisValid: boolean;
}

// Step 4b: 배분 관점 시뮬레이션
export interface ItemPoolCVP {
  item: string;
  itemName: string;
  대분류: string;
  중분류: string;
  품목계정그룹: string;
  quantity: number;
  revenue: number;
  variableCost: number;
  allocatedFixedCost: number;
  unitAllocatedFixedCost: number;
  unitContributionMargin: number;
  allocatedOperatingProfit: number;
}

export interface PoolAllocationSimulation {
  poolLevel: PoolLevel;
  poolName: string;
  poolFixedCost: number;
  allocationBasis: FixedCostAllocation;
  targetItem: string | null;
  volumeIncreasePct: number;
  priceDecreasePct: number;
  baseItems: ItemPoolCVP[];
  simulatedItems: ItemPoolCVP[];
  targetItemMarginDelta: number;
  otherItemsMarginDelta: number;
  netPoolMarginDelta: number;
}

// 워터폴 스텝
export interface WaterfallStep {
  name: string;
  base: number;
  value: number;
  fill: string;
  cumulative: number;
  type: "start" | "decrease" | "increase" | "subtotal";
}

// 무결성 검증
export interface IntegrityCheck {
  totalViewDelta: number;
  poolViewDelta: number;
  difference: number;
  differencePct: number;
  isConsistent: boolean;
}

// ─── Step 1: 제조 고정비 추출 ─────────────────────────

/**
 * ItemProfitabilityRecord 또는 ItemCostDetailRecord에서 제조 고정비 합산.
 * 제조고정노무비 + 감가상각비 + 기타경비
 *
 * ItemProfitabilityRecord는 number 타입, ItemCostDetailRecord는 PlanActualDiff 타입.
 */
export function extractManufacturingFixedCost(
  items: Array<{
    제조고정노무비?: number | { 실적: number };
    감가상각비?: number | { 실적: number };
    기타경비?: number | { 실적: number };
  }>
): number {
  let total = 0;
  for (const r of items) {
    const extract = (field: any): number => {
      if (field == null) return 0;
      if (typeof field === "number") return field;
      if (typeof field === "object" && "실적" in field) return field.실적 || 0;
      return 0;
    };
    total += extract(r.제조고정노무비) + extract(r.감가상각비) + extract(r.기타경비);
  }
  return total;
}

// ─── Step 2: CVP 아이템 생성 (거래처×품목) ─────────────

export function calcCustomerItemCVP(
  data: CustomerItemDetailRecord[],
  totalFixedCost: number
): { items: CVPItem[]; summary: CVPSummary } {
  // 품목+거래처 단위 집계
  const agg = new Map<
    string,
    {
      customer: string;
      customerName: string;
      item: string;
      itemName: string;
      quantity: number;
      revenue: number;
      variableCost: number;
      grossProfit: number;
    }
  >();

  for (const r of data) {
    const customer = (r.매출거래처 || "").trim();
    const item = (r.품목 || "").trim();
    if (!customer || !item) continue;
    const key = `${customer}||${item}`;
    const prev = agg.get(key);
    const qty = r.매출수량?.실적 || 0;
    const rev = r.매출액?.실적 || 0;
    // 100 보고서에는 원가 분리가 없음 → 매출원가.실적을 변동비로 가정
    const vc = (r.매출액?.실적 || 0) - (r.매출총이익?.실적 || 0);
    const gp = r.매출총이익?.실적 || 0;

    if (!prev) {
      agg.set(key, {
        customer,
        customerName: r.매출거래처명 || customer,
        item,
        itemName: (r as any).품목명 || item,
        quantity: qty,
        revenue: rev,
        variableCost: vc,
        grossProfit: gp,
      });
    } else {
      prev.quantity += qty;
      prev.revenue += rev;
      prev.variableCost += vc;
      prev.grossProfit += gp;
    }
  }

  // CVP 계산 (매출 0인 항목 제외)
  const items: CVPItem[] = [];
  for (const v of Array.from(agg.values())) {
    if (v.revenue <= 0 || v.quantity <= 0) continue;
    const unitPrice = safeDivide(v.revenue, v.quantity);
    const unitVariableCost = safeDivide(v.variableCost, v.quantity);
    const unitContributionMargin = unitPrice - unitVariableCost;
    const totalContributionMargin = v.revenue - v.variableCost;
    const contributionMarginRatio = safeDivide(totalContributionMargin, v.revenue);

    items.push({
      customer: v.customer,
      customerName: v.customerName,
      item: v.item,
      itemName: v.itemName,
      quantity: v.quantity,
      revenue: v.revenue,
      variableCost: v.variableCost,
      grossProfit: v.grossProfit,
      unitPrice,
      unitVariableCost,
      unitContributionMargin,
      totalContributionMargin,
      contributionMarginRatio,
      quadrant: "star", // 아래에서 재분류
      isLowPriceOrder: unitContributionMargin < 0,
    });
  }

  // 4사분면 분류 (중앙값 기준)
  const classified = classifyCVPItems(items);

  // 요약 계산
  const summary = calcCVPSummary(classified, totalFixedCost);

  return { items: classified, summary };
}

function classifyCVPItems(items: CVPItem[]): CVPItem[] {
  if (items.length === 0) return items;
  const sortedQty = [...items.map((i) => i.quantity)].sort((a, b) => a - b);
  const sortedCM = [...items.map((i) => i.unitContributionMargin)].sort((a, b) => a - b);
  const pivotQty = sortedQty[Math.floor(sortedQty.length / 2)];
  const pivotCM = sortedCM[Math.floor(sortedCM.length / 2)];

  return items.map((it) => {
    const highQty = it.quantity >= pivotQty;
    const highCM = it.unitContributionMargin >= pivotCM;
    let quadrant: Quadrant;
    if (highQty && highCM) quadrant = "star";
    else if (highQty && !highCM) quadrant = "cashcow";
    else if (!highQty && highCM) quadrant = "question";
    else quadrant = "dog";
    return { ...it, quadrant };
  });
}

function calcCVPSummary(items: CVPItem[], totalFixedCost: number): CVPSummary {
  if (items.length === 0) {
    return {
      totalRevenue: 0, totalVariableCost: 0, totalContributionMargin: 0,
      totalFixedCost: totalFixedCost, totalOperatingProfit: -totalFixedCost,
      totalQuantity: 0, weightedUnitPrice: 0, weightedUnitVariableCost: 0,
      weightedUnitContributionMargin: 0, avgUnitFixedCost: 0,
      overallContributionMarginRatio: 0, bepQuantity: 0, bepRevenue: 0,
      healthyContributionSum: 0, bleedingContributionLoss: 0,
      healthyCount: 0, bleedingCount: 0,
    };
  }

  const totalRevenue = items.reduce((s, it) => s + it.revenue, 0);
  const totalVariableCost = items.reduce((s, it) => s + it.variableCost, 0);
  const totalContributionMargin = totalRevenue - totalVariableCost;
  const totalQuantity = items.reduce((s, it) => s + it.quantity, 0);
  const totalOperatingProfit = totalContributionMargin - totalFixedCost;

  const weightedUnitPrice = safeDivide(totalRevenue, totalQuantity);
  const weightedUnitVariableCost = safeDivide(totalVariableCost, totalQuantity);
  const weightedUnitContributionMargin = weightedUnitPrice - weightedUnitVariableCost;
  const avgUnitFixedCost = safeDivide(totalFixedCost, totalQuantity);
  const overallContributionMarginRatio = safeDivide(totalContributionMargin, totalRevenue);

  const bepQuantity = weightedUnitContributionMargin > 0
    ? safeDivide(totalFixedCost, weightedUnitContributionMargin)
    : 0;
  const bepRevenue = bepQuantity * weightedUnitPrice;

  const healthy = items.filter((i) => i.totalContributionMargin > 0);
  const bleeding = items.filter((i) => i.totalContributionMargin <= 0);
  const healthyContributionSum = healthy.reduce((s, i) => s + i.totalContributionMargin, 0);
  const bleedingContributionLoss = bleeding.reduce((s, i) => s + i.totalContributionMargin, 0);

  return {
    totalRevenue,
    totalVariableCost,
    totalContributionMargin,
    totalFixedCost,
    totalOperatingProfit,
    totalQuantity,
    weightedUnitPrice,
    weightedUnitVariableCost,
    weightedUnitContributionMargin,
    avgUnitFixedCost,
    overallContributionMarginRatio,
    bepQuantity,
    bepRevenue,
    healthyContributionSum,
    bleedingContributionLoss,
    healthyCount: healthy.length,
    bleedingCount: bleeding.length,
  };
}

// ─── Step 4a: 총액 관점 시뮬레이션 ─────────────────────

export interface TotalSimInput {
  items: CVPItem[];
  totalFixedCost: number;
  targetCustomer: string | null;
  targetItem: string | null;
  volumeIncreasePct: number;
  priceDecreasePct: number;
}

/**
 * 총액 관점 시뮬레이션 — 수학적으로 정확한 전사 영업이익 변화.
 * 항등식: newOP - baseOP = priceReductionLoss + volumeContributionGain
 */
export function calcTotalViewSimulation(input: TotalSimInput): TotalViewSimulation {
  const { items, totalFixedCost, targetCustomer, targetItem, volumeIncreasePct, priceDecreasePct } = input;

  const baseTotalRevenue = items.reduce((s, it) => s + it.revenue, 0);
  const baseTotalVariableCost = items.reduce((s, it) => s + it.variableCost, 0);
  const baseTotalQuantity = items.reduce((s, it) => s + it.quantity, 0);
  const baseOperatingProfit = baseTotalRevenue - baseTotalVariableCost - totalFixedCost;
  const baseAvgUnitFixedCost = safeDivide(totalFixedCost, baseTotalQuantity);

  const isTarget = (it: CVPItem) => {
    const custMatch = targetCustomer === null || it.customer === targetCustomer;
    const itemMatch = targetItem === null || it.item === targetItem;
    return custMatch && itemMatch;
  };

  let newTotalRevenue = 0;
  let newTotalVariableCost = 0;
  let newTotalQuantity = 0;
  let priceReductionLoss = 0;
  let volumeContributionGain = 0;

  const volFactor = 1 + volumeIncreasePct / 100;
  const priceFactor = 1 + priceDecreasePct / 100;

  for (const it of items) {
    if (isTarget(it)) {
      const newPrice = Math.max(it.unitPrice * priceFactor, 0);
      const newQty = Math.max(it.quantity * volFactor, 0);
      const newRev = newPrice * newQty;
      const newVC = it.unitVariableCost * newQty;
      newTotalRevenue += newRev;
      newTotalVariableCost += newVC;
      newTotalQuantity += newQty;

      // 분해: 단가 인하 손실 = 기존 수량 × 단가 인하액 (negative)
      priceReductionLoss += it.quantity * it.unitPrice * (priceDecreasePct / 100);
      // 분해: 물량 증가 공헌 = 추가 수량 × 인하된 단위공헌이익
      const addedQty = it.quantity * (volumeIncreasePct / 100);
      const newUnitCM = newPrice - it.unitVariableCost;
      volumeContributionGain += addedQty * newUnitCM;
    } else {
      newTotalRevenue += it.revenue;
      newTotalVariableCost += it.variableCost;
      newTotalQuantity += it.quantity;
    }
  }

  const newOperatingProfit = newTotalRevenue - newTotalVariableCost - totalFixedCost;
  const newAvgUnitFixedCost = safeDivide(totalFixedCost, newTotalQuantity);
  const netOffsetEffect = newOperatingProfit - baseOperatingProfit;

  return {
    baseTotalRevenue,
    baseTotalVariableCost,
    baseOperatingProfit,
    baseTotalQuantity,
    baseAvgUnitFixedCost,
    targetCustomer,
    targetItem,
    volumeIncreasePct,
    priceDecreasePct,
    newTotalRevenue,
    newTotalVariableCost,
    newTotalQuantity,
    newAvgUnitFixedCost,
    newOperatingProfit,
    priceReductionLoss,
    volumeContributionGain,
    netOffsetEffect,
    hypothesisValid: netOffsetEffect > 0,
  };
}

// ─── Step 4b: 배분 관점 시뮬레이션 ─────────────────────

/**
 * 품목 풀 생성 — ItemProfitabilityRecord(200)에서 특정 계층의 품목들을 추출.
 * 제조 고정비가 품목 단위로 있어야 함.
 */
export function calcItemPool(
  itemData: ItemProfitabilityRecord[],
  poolLevel: PoolLevel,
  poolName: string
): { items: ItemPoolCVP[]; poolFixedCost: number } {
  // 풀 필터링
  const filtered = itemData.filter((r) => {
    const fieldValue = (r as any)[poolLevel] || "";
    return fieldValue.trim() === poolName;
  });

  if (filtered.length === 0) return { items: [], poolFixedCost: 0 };

  // 품목 단위 집계 (200은 이미 품목 단위이나 월별 중복 가능)
  const agg = new Map<
    string,
    {
      item: string;
      itemName: string;
      대분류: string;
      중분류: string;
      품목계정그룹: string;
      quantity: number;
      revenue: number;
      variableCost: number;
      fixedCost: number;
    }
  >();

  for (const r of filtered) {
    const key = r.품목 || "";
    if (!key) continue;
    const qty = r.매출수량 || 0;
    const rev = r.매출액 || 0;
    const cost = r.실적매출원가 || 0;
    const fixed =
      (r.제조고정노무비 || 0) + (r.감가상각비 || 0) + (r.기타경비 || 0);
    const vc = cost - fixed; // 변동비 = 총원가 - 제조 고정비

    const prev = agg.get(key);
    if (!prev) {
      agg.set(key, {
        item: key,
        itemName: key.replace(/^\[[^\]]+\]\s*/, ""), // [CODE] NAME → NAME
        대분류: r.대분류 || "",
        중분류: r.중분류 || "",
        품목계정그룹: (r as any).품목계정그룹 || "",
        quantity: qty,
        revenue: rev,
        variableCost: vc,
        fixedCost: fixed,
      });
    } else {
      prev.quantity += qty;
      prev.revenue += rev;
      prev.variableCost += vc;
      prev.fixedCost += fixed;
    }
  }

  const poolFixedCost = Array.from(agg.values()).reduce((s, v) => s + v.fixedCost, 0);

  const items: ItemPoolCVP[] = Array.from(agg.values()).map((v) => ({
    item: v.item,
    itemName: v.itemName,
    대분류: v.대분류,
    중분류: v.중분류,
    품목계정그룹: v.품목계정그룹,
    quantity: v.quantity,
    revenue: v.revenue,
    variableCost: v.variableCost,
    allocatedFixedCost: v.fixedCost, // SAP 원본 배분 (기준값)
    unitAllocatedFixedCost: safeDivide(v.fixedCost, v.quantity),
    unitContributionMargin:
      safeDivide(v.revenue, v.quantity) - safeDivide(v.variableCost, v.quantity),
    allocatedOperatingProfit: v.revenue - v.variableCost - v.fixedCost,
  }));

  return { items, poolFixedCost };
}

/**
 * 배분 관점 시뮬레이션 — 풀 내 재배분.
 * 대상 품목의 물량/단가 변경 후 매출/수량 비중으로 전체 품목에 고정비를 재배분.
 */
export function calcPoolSimulation(
  poolItems: ItemPoolCVP[],
  poolFixedCost: number,
  targetItem: string | null,
  volumeIncreasePct: number,
  priceDecreasePct: number,
  basis: FixedCostAllocation = "revenue",
  poolLevel: PoolLevel = "대분류",
  poolName: string = ""
): PoolAllocationSimulation {
  if (poolItems.length === 0) {
    return {
      poolLevel, poolName, poolFixedCost: 0, allocationBasis: basis,
      targetItem, volumeIncreasePct, priceDecreasePct,
      baseItems: [], simulatedItems: [],
      targetItemMarginDelta: 0, otherItemsMarginDelta: 0, netPoolMarginDelta: 0,
    };
  }

  // Base: 현재 배분 기준 weight 계산
  const baseTotalWeight = poolItems.reduce(
    (s, it) => s + (basis === "revenue" ? it.revenue : it.quantity),
    0
  );
  // Base 아이템 그대로 (SAP 배분 사용)
  const baseItems = poolItems.map((it) => ({ ...it }));

  // Simulated: 대상 품목 물량/단가 변경
  const volFactor = 1 + volumeIncreasePct / 100;
  const priceFactor = 1 + priceDecreasePct / 100;

  const simulatedRaw = poolItems.map((it) => {
    if (it.item === targetItem) {
      const newQty = Math.max(it.quantity * volFactor, 0);
      const oldUnitPrice = safeDivide(it.revenue, it.quantity);
      const newUnitPrice = Math.max(oldUnitPrice * priceFactor, 0);
      const newRevenue = newQty * newUnitPrice;
      const oldUnitVC = safeDivide(it.variableCost, it.quantity);
      const newVariableCost = oldUnitVC * newQty;
      return {
        ...it,
        quantity: newQty,
        revenue: newRevenue,
        variableCost: newVariableCost,
      };
    }
    return { ...it };
  });

  // 재배분: 신규 weight 기준
  const newTotalWeight = simulatedRaw.reduce(
    (s, it) => s + (basis === "revenue" ? it.revenue : it.quantity),
    0
  );

  const simulatedItems: ItemPoolCVP[] = simulatedRaw.map((it) => {
    const weight = basis === "revenue" ? it.revenue : it.quantity;
    const newAllocatedFixedCost =
      newTotalWeight > 0 ? poolFixedCost * safeDivide(weight, newTotalWeight) : 0;
    return {
      ...it,
      allocatedFixedCost: newAllocatedFixedCost,
      unitAllocatedFixedCost: safeDivide(newAllocatedFixedCost, it.quantity),
      unitContributionMargin:
        safeDivide(it.revenue, it.quantity) - safeDivide(it.variableCost, it.quantity),
      allocatedOperatingProfit: it.revenue - it.variableCost - newAllocatedFixedCost,
    };
  });

  // 분해
  let targetItemMarginDelta = 0;
  let otherItemsMarginDelta = 0;

  for (let i = 0; i < baseItems.length; i++) {
    const delta = simulatedItems[i].allocatedOperatingProfit - baseItems[i].allocatedOperatingProfit;
    if (baseItems[i].item === targetItem) {
      targetItemMarginDelta += delta;
    } else {
      otherItemsMarginDelta += delta;
    }
  }

  const netPoolMarginDelta = targetItemMarginDelta + otherItemsMarginDelta;

  return {
    poolLevel,
    poolName,
    poolFixedCost,
    allocationBasis: basis,
    targetItem,
    volumeIncreasePct,
    priceDecreasePct,
    baseItems,
    simulatedItems,
    targetItemMarginDelta,
    otherItemsMarginDelta,
    netPoolMarginDelta,
  };
}

// ─── 워터폴 ───────────────────────────────────────────

export function calcWaterfallSteps(sim: TotalViewSimulation): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  const baseOP = sim.baseOperatingProfit;
  const priceLoss = sim.priceReductionLoss; // negative
  const volumeGain = sim.volumeContributionGain;
  const finalOP = sim.newOperatingProfit;

  // 1. 기존 영업이익
  steps.push({
    name: "기존 영업이익",
    base: Math.min(0, baseOP),
    value: Math.abs(baseOP),
    fill: baseOP >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)",
    cumulative: baseOP,
    type: "start",
  });

  // 2. 단가 인하 손실 (감소)
  const afterPriceLoss = baseOP + priceLoss;
  steps.push({
    name: "단가 인하 손실",
    base: Math.min(baseOP, afterPriceLoss),
    value: Math.abs(priceLoss),
    fill: "hsl(0, 84%, 60%)",
    cumulative: afterPriceLoss,
    type: "decrease",
  });

  // 3. 물량 증가 공헌 (증가)
  const afterVolGain = afterPriceLoss + volumeGain;
  steps.push({
    name: "물량 증가 공헌",
    base: Math.min(afterPriceLoss, afterVolGain),
    value: Math.abs(volumeGain),
    fill: "hsl(217, 91%, 60%)",
    cumulative: afterVolGain,
    type: "increase",
  });

  // 4. 최종 영업이익
  steps.push({
    name: "최종 영업이익",
    base: Math.min(0, finalOP),
    value: Math.abs(finalOP),
    fill: finalOP >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)",
    cumulative: finalOP,
    type: "subtotal",
  });

  return steps;
}

// ─── 무결성 검증 ───────────────────────────────────────

/**
 * 듀얼 뷰 무결성 검증.
 *
 * 총액 관점(4a)과 배분 관점(4b)의 합계가 일치해야 함.
 * 단, 배분 관점은 특정 풀(대분류 등)만 다루므로 해당 풀 내에서만 비교 가능.
 *
 * 풀 밖 품목은 총액 관점에서 영향을 받지 않으므로, 풀 관점의 netPoolMarginDelta가
 * 총액 관점의 netOffsetEffect 중 풀 내 대상 품목의 기여분과 일치해야 함.
 */
export function verifyIntegrity(
  totalSim: TotalViewSimulation,
  poolSim: PoolAllocationSimulation,
  tolerance: number = 0.01
): IntegrityCheck {
  const totalViewDelta = totalSim.netOffsetEffect;
  const poolViewDelta = poolSim.netPoolMarginDelta;
  const difference = Math.abs(totalViewDelta - poolViewDelta);
  const denominator = Math.abs(totalSim.baseOperatingProfit) || 1;
  const differencePct = safeDivide(difference, denominator) * 100;
  const isConsistent = differencePct < tolerance * 100;

  return {
    totalViewDelta,
    poolViewDelta,
    difference,
    differencePct,
    isConsistent,
  };
}

/**
 * 풀 기준 고정비 풀 목록 조회 (UI 드롭다운용).
 */
export function getAvailablePools(
  itemData: ItemProfitabilityRecord[],
  poolLevel: PoolLevel
): Array<{ name: string; itemCount: number; totalRevenue: number }> {
  const map = new Map<string, { itemCount: Set<string>; totalRevenue: number }>();
  for (const r of itemData) {
    const name = ((r as any)[poolLevel] || "").trim();
    if (!name) continue;
    const entry = map.get(name) || { itemCount: new Set<string>(), totalRevenue: 0 };
    entry.itemCount.add(r.품목 || "");
    entry.totalRevenue += r.매출액 || 0;
    map.set(name, entry);
  }
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      itemCount: v.itemCount.size,
      totalRevenue: v.totalRevenue,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}
