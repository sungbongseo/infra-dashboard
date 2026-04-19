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
 *    4a: netOffsetEffect ≡ priceReductionLoss + volumeContributionGain
 *    4b: netPoolMarginDelta ≡ targetItemMarginDelta + otherItemsMarginDelta
 *    주의: 4b의 netPoolMarginDelta는 대상 품목의 매출/단가 변경 효과를 반영하므로 ≠ 0.
 *    4a와 4b는 데이터 범위가 달라(전체 vs 풀) 직접 비교 불가.
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
  variableCost: number;       // 제조변동비 + SGA변동비 (판관변동_직접판매운반비)
  sgaVariableCost: number;    // 판관변동_직접판매운반비 (물류 변동비 분리 표시)
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
  // 금액 기반 CVP 지표 (이종 단위 혼합 문제 해결)
  overallContributionMarginRatio: number; // CM / 매출 (단위 무관 비율)
  overallVariableCostRatio: number;       // 변동비 / 매출
  bepRevenue: number;                     // BEP 매출 = 고정비 / 공헌이익률
  // 레거시 (수량 기반) — 품목별 개별 사용은 OK, 전사 합산은 주의
  weightedUnitPrice: number;
  weightedUnitVariableCost: number;
  weightedUnitContributionMargin: number;
  avgUnitFixedCost: number;
  bepQuantity: number;
  healthyContributionSum: number;
  bleedingContributionLoss: number;
  healthyCount: number;
  bleedingCount: number;
  // 반품/환입 (음수 수량) 아이템 통계
  returnItemCount: number;
  returnRevenue: number;
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
  priceChangePct: number;
  newTotalRevenue: number;
  newTotalVariableCost: number;
  newTotalQuantity: number;
  newAvgUnitFixedCost: number;
  newOperatingProfit: number;
  // 3-way 분해: net ≡ priceEffect + costEffect + volumeEffect
  priceEffect: number;           // 가격 변동 효과 (기존수량 × 단가변동)
  costEffect: number;            // 원가 변동 효과 (기존수량 × 변동비변동, 음수=원가상승)
  volumeEffect: number;          // 물량 변동 효과 (추가수량 × 신규 단위공헌이익)
  // 하위호환 (deprecated)
  priceReductionLoss: number;
  volumeContributionGain: number;
  netOffsetEffect: number;
  hypothesisValid: boolean;
  // A4: 3단계 판정 (positive/neutral/negative)
  hypothesisResult: "positive" | "neutral" | "negative";
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
  priceChangePct: number;
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

// 무결성 검증 (내부 항등식 기반)
export interface IntegrityCheck {
  // 4a 내부 항등식: netOffsetEffect ≡ priceReductionLoss + volumeContributionGain
  totalViewNetDelta: number;
  totalViewDecomposed: number; // priceLoss + volumeGain
  totalViewIdentityError: number;
  totalViewIsConsistent: boolean;

  // 4b 내부 항등식: netPoolMarginDelta ≡ targetItemMarginDelta + otherItemsMarginDelta
  poolNetDelta: number;
  poolDecomposed: number; // target + others
  poolIdentityError: number;
  poolIsConsistent: boolean;

  // 전체 일관성
  isConsistent: boolean;
}

// ─── Step 1: 제조 고정비 추출 ─────────────────────────

/**
 * ItemProfitabilityRecord 또는 ItemCostDetailRecord에서 제조 고정비 합산.
 * 제조고정노무비 + 감가상각비 + 기타경비
 *
 * ItemProfitabilityRecord는 number 타입, ItemCostDetailRecord는 PlanActualDiff 타입.
 *
 * @source 200.품목별수익성분석(회계).xlsx (itemProfitability)
 * @fields 제조고정노무비, 감가상각비, 기타경비
 * @formula 총고정비 = Σ(제조고정노무비 + 감가상각비 + 기타경비)
 * @assumption SGA 고정비 제외 (CVP 무관), 제조 관련만 풀로 간주
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

/**
 * 품목별 변동비율 맵 빌드 — 200 보고서의 14개 변동비 항목으로 정확한 비율 산출.
 *
 * 변동비율 = Σ(14개 변동비) / 실적매출원가
 * 100 보고서의 역산 근사(매출-매출총이익)를 이 비율로 보정하면 고정비 혼입을 제거.
 */
export interface VCDetailRatios {
  overallVCRatio: number;       // 총변동비 / 실적매출원가
  rawMaterialRatio: number;     // 원재료비 / 총변동비
  laborRatio: number;           // 노무비 / 총변동비
  outsourcingRatio: number;     // 외주가공비 / 총변동비
}

function buildVariableCostRatioMap(
  itemProfitability: ItemProfitabilityRecord[]
): Map<string, VCDetailRatios> {
  const ratioMap = new Map<string, VCDetailRatios>();
  for (const r of itemProfitability) {
    const raw = (r.품목 || "").trim();
    if (!raw) continue;
    const match = raw.match(/^\[([^\]]+)\]\s*(.*)$/);
    const itemName = match ? match[2].trim() : raw;
    if (!itemName) continue;
    const rawMat = (r.원재료비 || 0) + (r.부재료비 || 0) + (r.상품매입 || 0);
    const labor = (r.노무비 || 0) + (r.복리후생비 || 0);
    const outsourcing = r.외주가공비 || 0;
    const directVC = rawMat + labor + outsourcing +
      (r.소모품비 || 0) + (r.수도광열비 || 0) + (r.수선비 || 0) +
      (r.연료비 || 0) + (r.운반비 || 0) + (r.전력비 || 0) +
      (r.지급수수료 || 0) + (r.견본비 || 0);
    const totalCost = r.실적매출원가 || 0;
    if (totalCost > 0 && directVC > 0) {
      if (!ratioMap.has(itemName)) {
        ratioMap.set(itemName, {
          overallVCRatio: Math.min(directVC / totalCost, 1.0),
          rawMaterialRatio: safeDivide(rawMat, directVC),
          laborRatio: safeDivide(labor, directVC),
          outsourcingRatio: safeDivide(outsourcing, directVC),
        });
      }
    }
  }
  return ratioMap;
}

/**
 * 거래처×품목 단위 공헌이익(CVP) 아이템 생성.
 *
 * @source 100.거래처별품목별손익.xlsx (customerItemDetail)
 * @fields 매출거래처, 매출거래처명, 품목, 품목명, 매출수량.실적, 매출액.실적, 매출총이익.실적
 * @formula
 *   변동비 = 매출원가 × 변동비율(200) (정확 분리) | 매출액 − 매출총이익 (fallback)
 *   단위단가 = 매출액 / 매출수량
 *   단위변동비 = 변동비 / 매출수량
 *   단위공헌이익 = 단위단가 − 단위변동비
 *   공헌이익률 = 공헌이익 / 매출
 * @param itemProfitability 200 보고서 — 품목별 변동비율 보정 소스 (선택, 없으면 역산 근사)
 */
export function calcCustomerItemCVP(
  data: CustomerItemDetailRecord[],
  totalFixedCost: number,
  itemProfitability?: ItemProfitabilityRecord[]
): { items: CVPItem[]; summary: CVPSummary } {
  const vcRatioMap = itemProfitability ? buildVariableCostRatioMap(itemProfitability) : null;
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
      sgaVariableCost: number;
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
    // 제조 변동비: 200 보고서 변동비율로 보정 (있으면), 없으면 역산 근사
    const itemName = (r.품목 || "").trim();
    const grossCOGS = (r.매출액?.실적 || 0) - (r.매출총이익?.실적 || 0);
    const vcDetail = vcRatioMap?.get(itemName);
    const mfgVC = vcDetail !== undefined ? grossCOGS * vcDetail.overallVCRatio : grossCOGS;
    // SGA 변동비 = 판관변동_직접판매운반비 (물류 변동비)
    const sgaVC = r.판관변동_직접판매운반비?.실적 || 0;
    // 총 변동비 = 제조 변동비(보정) + SGA 변동비
    const vc = mfgVC + sgaVC;
    const gp = r.매출총이익?.실적 || 0;

    if (!prev) {
      agg.set(key, {
        customer,
        customerName: r.매출거래처명 || customer,
        item,
        itemName: r.품목명 || item,
        quantity: qty,
        revenue: rev,
        variableCost: vc,
        sgaVariableCost: sgaVC,
        grossProfit: gp,
      });
    } else {
      prev.quantity += qty;
      prev.revenue += rev;
      prev.variableCost += vc;
      prev.sgaVariableCost += sgaVC;
      prev.grossProfit += gp;
    }
  }

  // CVP 계산 (매출·수량 모두 0인 항목만 제외, 음수 매출(환입/반품)은 허용)
  const items: CVPItem[] = [];
  for (const v of Array.from(agg.values())) {
    if (v.revenue === 0 && v.quantity === 0) continue;
    // 수량 0이지만 매출 있는 경우(금액 거래): 수량 1로 간주하여 단가 = 매출액 그대로 사용
    const effectiveQty = v.quantity !== 0 ? v.quantity : 1;
    const unitPrice = safeDivide(v.revenue, effectiveQty);
    const unitVariableCost = safeDivide(v.variableCost, effectiveQty);
    const unitContributionMargin = unitPrice - unitVariableCost;
    const totalContributionMargin = v.revenue - v.variableCost;
    const contributionMarginRatio = safeDivide(totalContributionMargin, v.revenue);

    items.push({
      customer: v.customer,
      customerName: v.customerName,
      item: v.item,
      itemName: v.itemName,
      quantity: effectiveQty,
      revenue: v.revenue,
      variableCost: v.variableCost,
      sgaVariableCost: v.sgaVariableCost,
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

/** 정렬된 배열의 통계적 중앙값 (짝수 개수 시 두 값의 평균) */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function classifyCVPItems(items: CVPItem[]): CVPItem[] {
  if (items.length === 0) return items;
  // 반품/환입(음수 수량) 아이템은 quadrant 분류에서 제외 — summary 합산에만 포함
  const normalItems = items.filter((i) => i.quantity >= 0);
  if (normalItems.length === 0) {
    return items.map((it) => ({ ...it, quadrant: "dog" as Quadrant }));
  }
  // 금액 기반 4사분면 분류 (이종 단위 혼합 해결)
  // X축: 매출(revenue), Y축: 공헌이익률(contributionMarginRatio)
  const sortedRev = [...normalItems.map((i) => i.revenue)].sort((a, b) => a - b);
  const sortedCMR = [...normalItems.map((i) => i.contributionMarginRatio)].sort((a, b) => a - b);
  // 통계적 표준 중앙값 사용 — 짝수개 시 (lower + upper) / 2
  const pivotRev = median(sortedRev);
  const pivotCMR = median(sortedCMR);

  return items.map((it) => {
    // 반품 아이템은 dog으로 분류 (산점도에서 별도 표시를 위한 fallback)
    if (it.quantity < 0) return { ...it, quadrant: "dog" as Quadrant };
    const highRev = it.revenue >= pivotRev;
    const highCM = it.contributionMarginRatio >= pivotCMR;
    let quadrant: Quadrant;
    if (highRev && highCM) quadrant = "star";
    else if (highRev && !highCM) quadrant = "cashcow";
    else if (!highRev && highCM) quadrant = "question";
    else quadrant = "dog";
    return { ...it, quadrant };
  });
}

function calcCVPSummary(items: CVPItem[], totalFixedCost: number): CVPSummary {
  if (items.length === 0) {
    return {
      totalRevenue: 0, totalVariableCost: 0, totalContributionMargin: 0,
      totalFixedCost: totalFixedCost, totalOperatingProfit: -totalFixedCost,
      totalQuantity: 0, overallContributionMarginRatio: 0, overallVariableCostRatio: 0,
      bepRevenue: Infinity, weightedUnitPrice: 0, weightedUnitVariableCost: 0,
      weightedUnitContributionMargin: 0, avgUnitFixedCost: 0, bepQuantity: Infinity,
      healthyContributionSum: 0, bleedingContributionLoss: 0,
      healthyCount: 0, bleedingCount: 0,
      returnItemCount: 0, returnRevenue: 0,
    };
  }

  const totalRevenue = items.reduce((s, it) => s + it.revenue, 0);
  const totalVariableCost = items.reduce((s, it) => s + it.variableCost, 0);
  const totalContributionMargin = totalRevenue - totalVariableCost;
  const totalQuantity = items.reduce((s, it) => s + it.quantity, 0);
  const totalOperatingProfit = totalContributionMargin - totalFixedCost;

  // 금액 기반 CVP 지표 (이종 단위 KG/ROL/CAN/L/BAG 등 혼합 시에도 정확)
  const overallContributionMarginRatio = safeDivide(totalContributionMargin, totalRevenue);
  const overallVariableCostRatio = safeDivide(totalVariableCost, totalRevenue);
  // BEP 매출 = 고정비 / 공헌이익률 (단위 무관, 금액 기반)
  const bepRevenue = overallContributionMarginRatio > 0
    ? safeDivide(totalFixedCost, overallContributionMarginRatio)
    : Infinity;

  // 레거시 수량 기반 (품목별 개별 사용은 OK, 전사 합산은 이종 단위 주의)
  const weightedUnitPrice = safeDivide(totalRevenue, totalQuantity);
  const weightedUnitVariableCost = safeDivide(totalVariableCost, totalQuantity);
  const weightedUnitContributionMargin = weightedUnitPrice - weightedUnitVariableCost;
  const avgUnitFixedCost = safeDivide(totalFixedCost, totalQuantity);
  const bepQuantity = weightedUnitContributionMargin > 0
    ? safeDivide(totalFixedCost, weightedUnitContributionMargin)
    : Infinity;

  const healthy = items.filter((i) => i.totalContributionMargin > 0);
  const bleeding = items.filter((i) => i.totalContributionMargin <= 0);
  const healthyContributionSum = healthy.reduce((s, i) => s + i.totalContributionMargin, 0);
  const bleedingContributionLoss = bleeding.reduce((s, i) => s + i.totalContributionMargin, 0);

  // 반품/환입 통계 (음수 수량 아이템)
  const returnItems = items.filter((i) => i.quantity < 0);
  const returnItemCount = returnItems.length;
  const returnRevenue = returnItems.reduce((s, i) => s + i.revenue, 0);

  return {
    totalRevenue,
    totalVariableCost,
    totalContributionMargin,
    totalFixedCost,
    totalOperatingProfit,
    totalQuantity,
    overallContributionMarginRatio,
    overallVariableCostRatio,
    bepRevenue,
    weightedUnitPrice,
    weightedUnitVariableCost,
    weightedUnitContributionMargin,
    avgUnitFixedCost,
    bepQuantity,
    healthyContributionSum,
    bleedingContributionLoss,
    healthyCount: healthy.length,
    bleedingCount: bleeding.length,
    returnItemCount,
    returnRevenue,
  };
}

// ─── Step 4a: 총액 관점 시뮬레이션 ─────────────────────

export interface CostChangePct {
  rawMaterial: number;   // 원자재비 인상률 (%, 기본 0)
  labor: number;         // 노무비 인상률 (%, 기본 0)
  outsourcing: number;   // 외주가공비 인상률 (%, 기본 0)
}

export interface TotalSimInput {
  items: CVPItem[];
  totalFixedCost: number;
  targetCustomer: string | null;
  targetItem: string | null;
  volumeIncreasePct: number;
  priceChangePct: number;
  volumeAbsolute?: number;
  costChangePct?: CostChangePct;
  vcCostRatioMap?: Map<string, { rawMaterialRatio: number; laborRatio: number; outsourcingRatio: number }>;
}

/**
 * 총액 관점 시뮬레이션 — 수학적으로 정확한 전사 영업이익 변화.
 * 항등식: newOP - baseOP = priceReductionLoss + volumeContributionGain
 *
 * @source 100.거래처별품목별손익.xlsx (매출/변동비) + 200.품목별수익성분석(회계).xlsx (고정비)
 * @formula
 *   baseOperatingProfit = Σ매출액 − Σ변동비 − 총고정비
 *   priceReductionLoss = Σ(기존수량 × 단가 × 단가인하율)  (대상 품목만)
 *   volumeContributionGain = Σ(추가수량 × 인하후 단위공헌이익)  (대상 품목만)
 *   netOffsetEffect = newOperatingProfit − baseOperatingProfit ≡ priceReductionLoss + volumeContributionGain
 * @assumption 고정비 총액 불변 (설비 캐파 내 생산)
 */
export function calcTotalViewSimulation(input: TotalSimInput): TotalViewSimulation {
  const { items, totalFixedCost, targetCustomer, targetItem, volumeIncreasePct, priceChangePct, volumeAbsolute, costChangePct, vcCostRatioMap } = input;
  const costAdj = costChangePct ?? { rawMaterial: 0, labor: 0, outsourcing: 0 };
  const hasCostChange = costAdj.rawMaterial !== 0 || costAdj.labor !== 0 || costAdj.outsourcing !== 0;

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
  // 3-way 분해: net ≡ priceEffect + costEffect + volumeEffect
  let priceEffect = 0;      // 가격 변동 효과
  let costEffect = 0;       // 원가 변동 효과 (음수=원가 상승)
  let volumeEffect = 0;     // 물량 변동 효과

  const volFactor = 1 + volumeIncreasePct / 100;
  const priceFactor = 1 + priceChangePct / 100;

  // G1: 절대 수량 모드 — 다거래처 중복 방지를 위해 대상 품목 총 수량 선계산
  // volumeAbsolute=2000이고 P001이 거래처 3곳(100,200,300수량)에 있으면
  // 각각 수량비중(100/600, 200/600, 300/600)으로 비례 배분
  const targetTotalQty = volumeAbsolute !== undefined
    ? items.filter(isTarget).reduce((s, it) => s + it.quantity, 0)
    : 0;

  for (const it of items) {
    if (isTarget(it)) {
      const newPrice = Math.max(it.unitPrice * priceFactor, 0);
      // 절대 수량: 각 행에 수량 비중으로 분배 (G1 중복 방지)
      let addedForThisRow: number;
      let newQty: number;
      if (volumeAbsolute !== undefined) {
        // A1: targetTotalQty ≤ 0 (반품 > 정상) → 균등 분배 fallback
        const targetCount = items.filter(isTarget).length;
        const qtyShare = targetTotalQty > 0
          ? safeDivide(it.quantity, targetTotalQty)
          : safeDivide(1, targetCount);
        addedForThisRow = volumeAbsolute * qtyShare;
        newQty = Math.max(it.quantity + addedForThisRow, 0);
      } else {
        addedForThisRow = it.quantity * (volumeIncreasePct / 100);
        newQty = Math.max(it.quantity * volFactor, 0);
      }
      // 원가 인상 반영: 품목별 원가 구성 비율로 변동비 조정
      let adjustedUnitVC = it.unitVariableCost;
      if (hasCostChange) {
        const ratios = vcCostRatioMap?.get(it.item);
        const rawR = ratios?.rawMaterialRatio ?? 0.5;
        const labR = ratios?.laborRatio ?? 0.1;
        const outR = ratios?.outsourcingRatio ?? 0.1;
        const otherR = Math.max(0, 1 - rawR - labR - outR);
        adjustedUnitVC = it.unitVariableCost * (
          rawR * (1 + costAdj.rawMaterial / 100) +
          labR * (1 + costAdj.labor / 100) +
          outR * (1 + costAdj.outsourcing / 100) +
          otherR
        );
      }
      const newRev = newPrice * newQty;
      const newVC = adjustedUnitVC * newQty;
      newTotalRevenue += newRev;
      newTotalVariableCost += newVC;
      newTotalQuantity += newQty;

      // 3-way 분해 (항등식: net ≡ priceEffect + costEffect + volumeEffect)
      // 가격 효과: 기존 수량 × 단가 변동 (원가 무관)
      priceEffect += it.quantity * (newPrice - it.unitPrice);
      // 원가 효과: 기존 수량 × 변동비 변동 (부호 반전: 원가↑=이익↓)
      costEffect += it.quantity * (it.unitVariableCost - adjustedUnitVC);
      // 물량 효과: 추가 수량 × 신규 단위공헌이익 (가격+원가 변동 반영)
      volumeEffect += addedForThisRow * (newPrice - adjustedUnitVC);
    } else {
      // 비대상 품목: 원가·매출 모두 원본 유지 (상수 기준선)
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
    priceChangePct,
    newTotalRevenue,
    newTotalVariableCost,
    newTotalQuantity,
    newAvgUnitFixedCost,
    newOperatingProfit,
    // 3-way 분해
    priceEffect,
    costEffect,
    volumeEffect,
    // 하위호환 (deprecated)
    priceReductionLoss: priceEffect,
    volumeContributionGain: costEffect + volumeEffect,
    netOffsetEffect,
    hypothesisValid: netOffsetEffect > 0,
    // A4: 3단계 판정
    hypothesisResult: netOffsetEffect > 0 ? "positive" : netOffsetEffect === 0 ? "neutral" : "negative",
  };
}

// ─── Step 4b: 배분 관점 시뮬레이션 ─────────────────────

/**
 * 품목 풀 생성 — ItemProfitabilityRecord(200)에서 특정 계층의 품목들을 추출.
 * 제조 고정비가 품목 단위로 있어야 함.
 *
 * @source 200.품목별수익성분석(회계).xlsx (itemProfitability)
 * @fields 대분류, 중분류, 품목계정그룹, 품목, 매출수량, 매출액, 실적매출원가,
 *         제조고정노무비, 감가상각비, 기타경비
 * @formula
 *   품목별 고정비 = 제조고정노무비 + 감가상각비 + 기타경비
 *   품목별 변동비 = 실적매출원가 − 고정비
 *   풀 고정비 = Σ(품목별 고정비)
 * @assumption
 *   1. SAP 계층(대분류/중분류/품목계정그룹)이 실제 생산 풀의 프록시
 *   2. 품목 코드 정규화: "[P001] 명" → "P001" (100과 키 일치)
 */
export function calcItemPool(
  itemData: ItemProfitabilityRecord[],
  poolLevel: PoolLevel,
  poolName: string
): { items: ItemPoolCVP[]; poolFixedCost: number; warnings: string[] } {
  // 풀 필터링
  const filtered = itemData.filter((r) => {
    const fieldValue = (r as any)[poolLevel] || "";
    return fieldValue.trim() === poolName;
  });

  if (filtered.length === 0) return { items: [], poolFixedCost: 0, warnings: [] };

  const warnings: string[] = [];
  const warnedItems = new Set<string>(); // C1: 경고 중복 방지

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
    const rawItem = r.품목 || "";
    if (!rawItem) continue;
    // 품목 코드 정규화: "[P001] 품목명A" → "P001" (CustomerItemDetail과 동일 형식)
    const codeMatch = rawItem.match(/^\[([^\]]+)\]/);
    if (!codeMatch && !warnedItems.has(`norm:${rawItem}`)) {
      warnedItems.add(`norm:${rawItem}`);
      warnings.push(`품목 코드 정규화 실패: "${rawItem}" — 200 보고서 형식 "[코드] 이름" 미일치`);
    }
    const itemCode = codeMatch ? codeMatch[1].trim() : rawItem.trim();
    const itemName = rawItem.replace(/^\[[^\]]+\]\s*/, "").trim() || rawItem.trim();
    const key = itemCode; // 통일 키
    const qty = r.매출수량 || 0;
    const rev = r.매출액 || 0;
    const fixed =
      (r.제조고정노무비 || 0) + (r.감가상각비 || 0) + (r.기타경비 || 0);
    // 14개 변동비 항목 직접 합산 (역산 대신 정밀 집계)
    const directVC =
      (r.원재료비 || 0) + (r.부재료비 || 0) + (r.상품매입 || 0) +
      (r.노무비 || 0) + (r.복리후생비 || 0) + (r.소모품비 || 0) +
      (r.수도광열비 || 0) + (r.수선비 || 0) + (r.연료비 || 0) +
      (r.외주가공비 || 0) + (r.운반비 || 0) + (r.전력비 || 0) +
      (r.지급수수료 || 0) + (r.견본비 || 0);
    // 직접 합산이 0이면(필드 누락) 역산 fallback
    const cost = r.실적매출원가 || 0;
    if (directVC === 0 && cost > 0 && !warnedItems.has(`fb:${itemCode}`)) {
      warnedItems.add(`fb:${itemCode}`);
      warnings.push(`변동비 fallback: ${itemCode} — 14개 항목 합산=0, 역산(실적매출원가−고정비) 사용`);
    }
    const vc = directVC > 0 ? directVC : Math.max(cost - fixed, 0);

    const prev = agg.get(key);
    if (!prev) {
      agg.set(key, {
        item: itemCode,  // 정규화된 코드
        itemName,
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

  // 표준원가 대비 실적 검증 (±20% 이상 이상치 플래그)
  for (const r of filtered) {
    const std = r.표준매출원가 || 0;
    const actual = r.실적매출원가 || 0;
    if (std > 0) {
      const varianceRate = Math.abs(actual - std) / std;
      if (varianceRate > 0.2) {
        const rawItem = r.품목 || "(unknown)";
        const codeMatch = rawItem.match(/^\[([^\]]+)\]/);
        const code = codeMatch ? codeMatch[1].trim() : rawItem.trim();
        if (!warnedItems.has(`cv:${code}`)) {
          warnedItems.add(`cv:${code}`);
          warnings.push(`원가 이상치: ${code} — 실적 ${actual.toLocaleString()} vs 표준 ${std.toLocaleString()} (차이 ${(varianceRate * 100).toFixed(0)}%)`);
        }
      }
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

  return { items, poolFixedCost, warnings };
}

/**
 * 배분 관점 시뮬레이션 — 풀 내 재배분.
 * 대상 품목의 물량/단가 변경 후 매출/수량 비중으로 전체 품목에 고정비를 재배분.
 *
 * @source 200.품목별수익성분석(회계).xlsx (calcItemPool 결과 재사용)
 * @formula
 *   품목별 배분 고정비 = 풀고정비 × (품목 weight / 풀 총 weight)
 *     weight = 매출(basis="revenue") 또는 수량(basis="quantity")
 *   장부상 마진 = 매출 − 변동비 − 배분 고정비
 *   targetItemMarginDelta + otherItemsMarginDelta ≡ netPoolMarginDelta
 * @assumption 풀 고정비 총액 불변 (재배분만 발생, 품목 간 이동)
 */
export function calcPoolSimulation(
  poolItems: ItemPoolCVP[],
  poolFixedCost: number,
  targetItem: string | null,
  volumeIncreasePct: number,
  priceChangePct: number,
  basis: FixedCostAllocation = "revenue",
  poolLevel: PoolLevel = "대분류",
  poolName: string = "",
  volumeAbsolute?: number
): PoolAllocationSimulation {
  if (poolItems.length === 0) {
    return {
      poolLevel, poolName, poolFixedCost: 0, allocationBasis: basis,
      targetItem, volumeIncreasePct, priceChangePct,
      baseItems: [], simulatedItems: [],
      targetItemMarginDelta: 0, otherItemsMarginDelta: 0, netPoolMarginDelta: 0,
    };
  }

  // Base: 가중 재배분 기준으로 일관되게 배분
  // (SAP 원본 배분과 시뮬레이션 배분을 섞지 않기 위해 base도 가중 배분)
  const baseTotalWeight = poolItems.reduce(
    (s, it) => s + (basis === "revenue" ? it.revenue : it.quantity),
    0
  );
  const baseItems: ItemPoolCVP[] = poolItems.map((it) => {
    const weight = basis === "revenue" ? it.revenue : it.quantity;
    // M2: baseTotalWeight=0 방어 — 모든 품목 weight가 0이면 균등 배분
    const allocatedFixedCost = baseTotalWeight > 0
      ? poolFixedCost * safeDivide(weight, baseTotalWeight)
      : safeDivide(poolFixedCost, poolItems.length);
    return {
      ...it,
      allocatedFixedCost,
      unitAllocatedFixedCost: safeDivide(allocatedFixedCost, it.quantity),
      allocatedOperatingProfit: it.revenue - it.variableCost - allocatedFixedCost,
    };
  });

  // Simulated: 대상 품목 물량/단가 변경
  const volFactor = 1 + volumeIncreasePct / 100;
  const priceFactor = 1 + priceChangePct / 100;

  const simulatedRaw = poolItems.map((it) => {
    if (it.item === targetItem) {
      // 절대 수량 모드: volumeAbsolute가 있으면 "추가 수량"으로 사용
      const newQty = volumeAbsolute !== undefined
        ? Math.max(it.quantity + volumeAbsolute, 0)
        : Math.max(it.quantity * volFactor, 0);
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
    // M2: newTotalWeight=0 방어 — 균등 배분 fallback
    const newAllocatedFixedCost =
      newTotalWeight > 0 ? poolFixedCost * safeDivide(weight, newTotalWeight) : safeDivide(poolFixedCost, simulatedRaw.length);
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
    priceChangePct,
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
  const pe = sim.priceEffect;
  const ce = sim.costEffect;
  const ve = sim.volumeEffect;
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

  // 2. 가격 효과 (인상=녹색, 인하=빨강)
  const afterPrice = baseOP + pe;
  if (pe !== 0) {
    steps.push({
      name: pe >= 0 ? "가격 효과 (이득)" : "가격 효과 (손실)",
      base: Math.min(baseOP, afterPrice),
      value: Math.abs(pe),
      fill: pe >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)",
      cumulative: afterPrice,
      type: pe >= 0 ? "increase" : "decrease",
    });
  }

  // 3. 원가 효과 (원가↓=녹색, 원가↑=주황) — 슬라이더 0이면 숨김
  const afterCost = afterPrice + ce;
  if (ce !== 0) {
    steps.push({
      name: ce >= 0 ? "원가 효과 (절감)" : "원가 효과 (인상)",
      base: Math.min(afterPrice, afterCost),
      value: Math.abs(ce),
      fill: ce >= 0 ? "hsl(142, 71%, 45%)" : "hsl(30, 90%, 55%)",
      cumulative: afterCost,
      type: ce >= 0 ? "increase" : "decrease",
    });
  }

  // 4. 물량 효과 (증가=파랑, 감소=빨강)
  const afterVol = afterCost + ve;
  if (ve !== 0) {
    steps.push({
      name: ve >= 0 ? "물량 효과 (공헌)" : "물량 효과 (감소)",
      base: Math.min(afterCost, afterVol),
      value: Math.abs(ve),
      fill: ve >= 0 ? "hsl(217, 91%, 60%)" : "hsl(0, 84%, 60%)",
      cumulative: afterVol,
      type: ve >= 0 ? "increase" : "decrease",
    });
  }

  // 5. 최종 영업이익
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
 * 듀얼 뷰 무결성 검증 — 내부 항등식 기반.
 *
 * 4a와 4b는 서로 다른 데이터 소스(100 vs 200)와 다른 granularity(거래처×품목 vs 품목)이므로
 * 직접 합계 비교는 의미가 없음. 대신 각 뷰 내부의 대수적 항등식을 검증:
 *
 * 4a: netOffsetEffect ≡ priceReductionLoss + volumeContributionGain (수학적 증명됨)
 * 4b: netPoolMarginDelta ≡ targetItemMarginDelta + otherItemsMarginDelta (정의상 true)
 *
 * 두 항등식이 모두 성립하면 각 관점의 계산은 논리적으로 일관됨.
 */
export function verifyIntegrity(
  totalSim: TotalViewSimulation,
  poolSim: PoolAllocationSimulation,
  tolerance: number = 0.01
): IntegrityCheck {
  // 4a 내부 항등식
  const totalViewNetDelta = totalSim.netOffsetEffect;
  const totalViewDecomposed = totalSim.priceReductionLoss + totalSim.volumeContributionGain;
  const totalViewIdentityError = Math.abs(totalViewNetDelta - totalViewDecomposed);
  // M5: denominator 강화 — baseOP가 극소일 때 매출 규모 기반 fallback
  const totalDenominator = Math.max(
    Math.abs(totalSim.baseOperatingProfit),
    Math.abs(totalSim.baseTotalRevenue) * 0.0001,
    1
  );
  const totalViewIsConsistent = safeDivide(totalViewIdentityError, totalDenominator) < tolerance;

  // 4b 내부 항등식
  const poolNetDelta = poolSim.netPoolMarginDelta;
  const poolDecomposed = poolSim.targetItemMarginDelta + poolSim.otherItemsMarginDelta;
  const poolIdentityError = Math.abs(poolNetDelta - poolDecomposed);
  const poolDenominator = Math.max(Math.abs(poolSim.poolFixedCost), 1);
  const poolIsConsistent = safeDivide(poolIdentityError, poolDenominator) < tolerance;

  return {
    totalViewNetDelta,
    totalViewDecomposed,
    totalViewIdentityError,
    totalViewIsConsistent,
    poolNetDelta,
    poolDecomposed,
    poolIdentityError,
    poolIsConsistent,
    isConsistent: totalViewIsConsistent && poolIsConsistent,
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

// ─── 대분류×기준단위 그룹 (듀얼 모드 CVP) ─────────────────

export interface UnitGroup {
  label: string;        // "방수시트 [ROL]"
  category: string;     // "방수시트"
  unit: string;         // "ROL"
  itemCount: number;
  totalRevenue: number;
  totalQuantity: number;
  totalFixedCost: number;
}

/**
 * 대분류×기준단위 기준 동일 단위 그룹 목록 생성 (수량 기반 CVP용).
 * 같은 그룹 내에서는 단위가 동일하므로 수량 합산이 의미 있음.
 */
export function getUnitGroups(
  itemData: ItemProfitabilityRecord[]
): UnitGroup[] {
  const map = new Map<string, {
    category: string; unit: string;
    items: Set<string>; revenue: number; quantity: number; fixedCost: number;
  }>();

  for (const r of itemData) {
    const cat = ((r as any).대분류 || "").trim() || "(미분류)";
    const unit = ((r as any).기준단위 || "").trim();
    if (!unit) continue; // 단위 없는 행은 그룹화 불가
    const key = `${cat}|${unit}`;
    const entry = map.get(key) || { category: cat, unit, items: new Set(), revenue: 0, quantity: 0, fixedCost: 0 };
    entry.items.add((r.품목 || "").trim());
    entry.revenue += r.매출액 || 0;
    entry.quantity += r.매출수량 || 0;
    entry.fixedCost += (r.제조고정노무비 || 0) + (r.감가상각비 || 0) + (r.기타경비 || 0);
    map.set(key, entry);
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.items.size >= 2) // 품목 2개 이상
    .map(([, v]) => ({
      label: `${v.category} [${v.unit}]`,
      category: v.category,
      unit: v.unit,
      itemCount: v.items.size,
      totalRevenue: v.revenue,
      totalQuantity: v.quantity,
      totalFixedCost: v.fixedCost,
    }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);
}

export interface GroupCVPResult {
  unit: string;
  totalRevenue: number;
  totalVariableCost: number;
  totalFixedCost: number;
  totalQuantity: number;
  weightedUnitPrice: number;
  weightedUnitVariableCost: number;
  weightedUnitContributionMargin: number;
  overallContributionMarginRatio: number;
  bepQuantity: number;
  bepRevenue: number;
  operatingProfit: number;
}

/**
 * 선택된 대분류×단위 그룹 내 수량 기반 CVP 계산.
 * 동일 단위이므로 수량 합산 + 가중 단가 + BEP 수량 모두 의미 있음.
 */
export function calcGroupCVP(
  itemData: ItemProfitabilityRecord[],
  category: string,
  unit: string
): GroupCVPResult {
  // 그룹 필터링
  const filtered = itemData.filter((r) => {
    const cat = ((r as any).대분류 || "").trim() || "(미분류)";
    const u = ((r as any).기준단위 || "").trim();
    return cat === category && u === unit;
  });

  let totalRev = 0, totalVC = 0, totalFC = 0, totalQty = 0;
  for (const r of filtered) {
    const rev = r.매출액 || 0;
    const cost = r.실적매출원가 || 0;
    const fixed = (r.제조고정노무비 || 0) + (r.감가상각비 || 0) + (r.기타경비 || 0);
    const vc = Math.max(cost - fixed, 0);
    totalRev += rev;
    totalVC += vc;
    totalFC += fixed;
    totalQty += r.매출수량 || 0;
  }

  const wUnitPrice = safeDivide(totalRev, totalQty);
  const wUnitVC = safeDivide(totalVC, totalQty);
  const wUnitCM = wUnitPrice - wUnitVC;
  const cmRatio = safeDivide(totalRev - totalVC, totalRev);
  const bepQty = wUnitCM > 0 ? safeDivide(totalFC, wUnitCM) : Infinity;
  const bepRev = cmRatio > 0 ? safeDivide(totalFC, cmRatio) : Infinity;
  const opProfit = totalRev - totalVC - totalFC;

  return {
    unit,
    totalRevenue: totalRev,
    totalVariableCost: totalVC,
    totalFixedCost: totalFC,
    totalQuantity: totalQty,
    weightedUnitPrice: wUnitPrice,
    weightedUnitVariableCost: wUnitVC,
    weightedUnitContributionMargin: wUnitCM,
    overallContributionMarginRatio: cmRatio,
    bepQuantity: bepQty,
    bepRevenue: bepRev,
    operatingProfit: opProfit,
  };
}

// ─── 감도 분석 (미니 그리드) ──────────────────────────

export interface SensitivityCell {
  priceChangePct: number;
  requiredVolumePct: number; // 손익분기를 맞추기 위해 필요한 물량 증가율
  netEffect: number;         // 0% 물량 시 net effect (price-only scenario)
}

/**
 * 단가 변동 시나리오별 "손익분기 필요 물량 증가율" 계산.
 * 대상 아이템의 CVP 구조(unitCM, 기존 수량)를 기반으로
 * priceReductionLoss를 상쇄하는 최소 물량 증가율을 역산.
 */
export function calcSensitivityGrid(
  items: CVPItem[],
  totalFixedCost: number,
  targetCustomer: string | null,
  targetItem: string | null,
  priceScenarios: number[] = [-20, -15, -10, -5, 5],
  costChangePct?: CostChangePct,
  vcCostRatioMap?: Map<string, { rawMaterialRatio: number; laborRatio: number; outsourcingRatio: number }>,
): SensitivityCell[] {
  return priceScenarios.map((pricePct) => {
    // 0% 물량 시나리오 (가격 변동만 + 원가 슬라이더 반영)
    const zeroVolSim = calcTotalViewSimulation({
      items, totalFixedCost, targetCustomer, targetItem,
      volumeIncreasePct: 0, priceChangePct: pricePct,
      costChangePct, vcCostRatioMap,
    });
    const netEffect = zeroVolSim.netOffsetEffect;

    // 손익분기 필요 물량: netEffect=0 되는 volumePct 역산
    let lo = 0, hi = 500;
    if (netEffect >= 0) {
      // 0% 물량에서도 이미 이득 → 물량 불필요
      return { priceChangePct: pricePct, requiredVolumePct: 0, netEffect };
    }
    for (let i = 0; i < 15; i++) {
      const mid = (lo + hi) / 2;
      const sim = calcTotalViewSimulation({
        items, totalFixedCost, targetCustomer, targetItem,
        volumeIncreasePct: mid, priceChangePct: pricePct,
        costChangePct, vcCostRatioMap,
      });
      if (sim.netOffsetEffect >= 0) hi = mid;
      else lo = mid;
    }
    // A2: 탐색 종료 후 실제 달성 여부 검증
    const finalMid = (lo + hi) / 2;
    const verifySim = calcTotalViewSimulation({
      items, totalFixedCost, targetCustomer, targetItem,
      volumeIncreasePct: finalMid, priceChangePct: pricePct,
      costChangePct, vcCostRatioMap,
    });
    return {
      priceChangePct: pricePct,
      requiredVolumePct: verifySim.netOffsetEffect >= 0
        ? Math.round(finalMid * 10) / 10
        : Infinity, // BEP 불가능 (500% 내에서 미달성)
      netEffect,
    };
  });
}
