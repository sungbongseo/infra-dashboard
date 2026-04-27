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
import { mulberry32, sampleNormal, sampleTriangular, summarize, FALLBACK_CV } from "./monteCarlo";

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
  // v2 WS8: 카니발라이제이션 보정 (옵셔널, cannibalCorrection 입력 시만 채움)
  cannibalLoss?: number;          // 자기잠식 손실 (음수)
  portfolioNet?: number;          // = netOffsetEffect + cannibalLoss
  cannibalMultiplier?: number;    // 적용된 잠식 강도 (0.5 / 1.0 / 1.5 / 사용자)
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
  /** v2 WS4: PED 자동 적용 — 판가 변동 시 수량 변동을 PED 계수로 자동 계산 */
  usePED?: boolean;
  /** v2 WS4: PED 계수 (기본 -1.0, 비탄력 -0.5 ~ 탄력 -2.0) */
  pedCoeff?: number;
  /** v2 WS8: 카니발 보정 (포트폴리오 순효과 = netOffsetEffect + cannibalLoss) */
  cannibalCorrection?: {
    /** 카니발 매트릭스 (calcCannibalizationMatrix 결과의 matrix 필드) */
    matrix: Array<{ itemA: string; itemB: string; cannibalRate: number; itemAName?: string }>;
    /** 잠식 강도 multiplier (0.5/1.0/1.5/사용자, 기본 1.0) */
    multiplier: number;
    /** 다른 품목들의 기준 매출 Map<품목코드, 매출> */
    baseSalesMap: Map<string, number>;
  };
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
  const { items, totalFixedCost, targetCustomer, targetItem, volumeIncreasePct, priceChangePct, costChangePct, vcCostRatioMap, usePED, pedCoeff } = input;
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

  // v2 WS4: PED 자동 볼륨 — 판가 변동에 따른 수량 변동 자동 계산 (사용자 volumeAbsolute override 우선)
  let volumeAbsolute = input.volumeAbsolute;
  if (usePED && pedCoeff !== undefined && priceChangePct !== 0 && volumeAbsolute === undefined) {
    const targetQty = items.filter(isTarget).reduce((s, it) => s + it.quantity, 0);
    const priceRatio = 1 + priceChangePct / 100;
    if (targetQty > 0 && priceRatio > 0) {
      const newQty = targetQty * Math.pow(priceRatio, pedCoeff);
      volumeAbsolute = newQty - targetQty;
    }
  }

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

  // v2 WS8: 카니발 보정 후처리 (옵셔널)
  let cannibalLoss: number | undefined;
  let portfolioNet: number | undefined;
  let cannibalMultiplier: number | undefined;
  if (input.cannibalCorrection && targetItem) {
    const { matrix, multiplier, baseSalesMap } = input.cannibalCorrection;
    const m = Math.max(0, multiplier);
    cannibalMultiplier = m;
    // target 품목 기준 매출 (회귀 분석 분모)
    const targetBase = items
      .filter(it => it.item === targetItem)
      .reduce((s, it) => s + it.revenue, 0);
    const aloneRevenueDelta = newTotalRevenue - baseTotalRevenue;  // 매출 변화량
    if (targetBase > 0) {
      const effectRatio = aloneRevenueDelta / targetBase;
      // target 품목이 잠식하는 다른 품목들 (matrix에서 itemB === targetItem)
      const targetCells = matrix.filter(c => c.itemB === targetItem && c.itemA !== targetItem);
      let lossSum = 0;
      for (const cell of targetCells) {
        const baseSalesOther = baseSalesMap.get(cell.itemA) || 0;
        if (baseSalesOther <= 0) continue;
        const adjustedRate = cell.cannibalRate * m;
        // 매출 잠식 → 영업이익 잠식 환산: 단순화하여 매출 잠식의 70%를 이익 잠식으로 간주
        // (변동비 30% 가정 — 정확한 변동비는 품목별로 다르나 보수적 추정)
        const salesLoss = -adjustedRate * effectRatio * baseSalesOther;
        const profitLoss = salesLoss * 0.7;
        lossSum += profitLoss;
      }
      cannibalLoss = lossSum;
      portfolioNet = netOffsetEffect + lossSum;
    }
  }

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
    // v2 WS8: 카니발 보정 (옵셔널)
    cannibalLoss,
    portfolioNet,
    cannibalMultiplier,
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

// ─── 가설 판정 헬퍼 ─────────────────────────────

export interface HypothesisVerdict {
  verdict: "valid" | "invalid" | "partial";
  label: string;
  netDelta: number;
}

/**
 * 시뮬레이션 결과 기반 가설 판정.
 * OffsetEffectTab Step 4a 상단 배지에 사용.
 *
 * - valid: 이익 증가 + Capacity 안전
 * - invalid: 이익 감소
 * - partial: 이익 증가하나 Capacity 초과 위험
 */
export function calcHypothesisVerdict(
  totalSim: TotalViewSimulation,
  capacityCheck?: { alertLevel: string },
): HypothesisVerdict {
  if (totalSim.netOffsetEffect <= 0) {
    return {
      verdict: "invalid",
      label: "단가 하락 손실이 물량 이익을 초과 → 저가수주 확대 불리",
      netDelta: totalSim.netOffsetEffect,
    };
  }
  if (capacityCheck && capacityCheck.alertLevel === "critical") {
    return {
      verdict: "partial",
      label: "이익 증가하나 Capacity 초과 위험 → 고정비 Step-up 발생 가능",
      netDelta: totalSim.netOffsetEffect,
    };
  }
  return {
    verdict: "valid",
    label: "저가수주 확대 시 이익 증가 → 가설 유효",
    netDelta: totalSim.netOffsetEffect,
  };
}

// ─── 종합 판정: 4a + 4b 자동 연동 ───────────────

export interface ComprehensiveVerdict {
  singleItemEffect: number;
  singleItemResult: "positive" | "neutral" | "negative";
  poolEffect: number | null;
  poolOthersGain: number | null;
  poolTargetDelta: number | null;
  poolLevel: string;
  poolName: string;
  comprehensiveNet: number | null;
  comprehensiveResult: "positive" | "neutral" | "negative" | "unavailable";
  interpretation: string;
}

/**
 * 4a + 4b 종합 판정.
 *
 * 4a(단일 품목 시뮬)와 4b(풀 배분 덤 효과)를 자동 결합.
 * targetItem의 대분류를 자동 감지하여 풀 시뮬을 백그라운드 실행.
 *
 * ⚠️ 4a(100 보고서)와 4b(200 보고서)는 데이터 범위가 달라
 * comprehensiveNet은 정확한 합산이 아닌 방향성 참고용.
 */
export function calcComprehensiveVerdict(
  totalSim: TotalViewSimulation,
  itemProfitability: ItemProfitabilityRecord[] | undefined,
  targetItem: string | null,
  volumeIncreasePct: number,
  priceChangePct: number,
): ComprehensiveVerdict {
  const singleItemEffect = totalSim.netOffsetEffect;
  const singleItemResult = totalSim.hypothesisResult;

  // 200 보고서 없거나 대상 품목 없으면 4b 불가
  if (!itemProfitability || itemProfitability.length === 0 || !targetItem) {
    return {
      singleItemEffect,
      singleItemResult,
      poolEffect: null,
      poolOthersGain: null,
      poolTargetDelta: null,
      poolLevel: "",
      poolName: "",
      comprehensiveNet: null,
      comprehensiveResult: "unavailable",
      interpretation: "200 보고서 데이터가 없어 풀 배분 효과를 계산할 수 없습니다. Step 4a 결과만 참고하세요.",
    };
  }

  // [H1] targetItem의 대분류 자동 감지 — 3단계 fallback 매칭
  // 100 보고서의 품목 코드와 200 보고서의 품목 코드를 매칭
  const targetCode = targetItem.trim();
  let poolName = "";
  // Stage 1: exact code match
  for (const r of itemProfitability) {
    const rawItem = (r.품목 || "").trim();
    const code = rawItem.match(/^\[([^\]]+)\]/)?.[1] || rawItem;
    if (code === targetCode || rawItem === targetCode) {
      poolName = ((r as any).대분류 || "").trim();
      break;
    }
  }
  // Stage 2: contains match (100 보고서 코드가 200 품목 필드에 포함, 또는 반대)
  if (!poolName) {
    for (const r of itemProfitability) {
      const rawItem = (r.품목 || "").trim();
      const code200 = rawItem.match(/^\[([^\]]+)\]/)?.[1] || "";
      if ((code200 && targetCode.includes(code200)) || (targetCode && rawItem.includes(targetCode))) {
        poolName = ((r as any).대분류 || "").trim();
        break;
      }
    }
  }
  // Stage 3: itemName substring match
  if (!poolName) {
    for (const r of itemProfitability) {
      const itemName = (r.품목 || "").replace(/^\[[^\]]+\]\s*/, "").trim();
      if (itemName && itemName.length >= 3 && targetCode.includes(itemName)) {
        poolName = ((r as any).대분류 || "").trim();
        break;
      }
    }
  }

  if (!poolName) {
    return {
      singleItemEffect,
      singleItemResult,
      poolEffect: null,
      poolOthersGain: null,
      poolTargetDelta: null,
      poolLevel: "",
      poolName: "",
      comprehensiveNet: null,
      comprehensiveResult: "unavailable",
      interpretation: `대상 품목(${targetItem})의 대분류를 200 보고서에서 찾을 수 없습니다.`,
    };
  }

  // 자동 풀 시뮬 실행
  const pool = calcItemPool(itemProfitability, "대분류", poolName);
  if (pool.items.length === 0) {
    return {
      singleItemEffect,
      singleItemResult,
      poolEffect: null,
      poolOthersGain: null,
      poolTargetDelta: null,
      poolLevel: "대분류",
      poolName,
      comprehensiveNet: null,
      comprehensiveResult: "unavailable",
      interpretation: `${poolName} 풀에 품목이 없습니다.`,
    };
  }

  // 풀 내 targetItem 매칭 (코드 정규화)
  const poolTargetCode = pool.items.find(it => {
    const c = it.item.trim();
    return c === targetCode || it.itemName === targetCode;
  })?.item || null;

  const poolSim = calcPoolSimulation(
    pool.items, pool.poolFixedCost,
    poolTargetCode, volumeIncreasePct, priceChangePct,
    "revenue", "대분류", poolName,
  );

  const poolOthersGain = poolSim.otherItemsMarginDelta;
  const poolTargetDelta = poolSim.targetItemMarginDelta;
  const poolEffect = poolSim.netPoolMarginDelta;

  // 종합: 4a 단독 효과 + 4b 다른 품목 덤 효과 (방향성 참고)
  const comprehensiveNet = singleItemEffect + poolOthersGain;
  const comprehensiveResult: ComprehensiveVerdict["comprehensiveResult"] =
    comprehensiveNet > 0 ? "positive" : comprehensiveNet === 0 ? "neutral" : "negative";

  // 해석 텍스트
  const formatAmt = (v: number) => {
    const abs = Math.abs(v);
    const sign = v >= 0 ? "+" : "";
    if (abs >= 1e8) return `${sign}${(v / 1e8).toFixed(1)}억원`;
    if (abs >= 1e4) return `${sign}${Math.round(v / 1e4).toLocaleString()}만원`;
    return `${sign}${Math.round(v).toLocaleString()}원`;
  };

  let interpretation: string;
  if (singleItemEffect < 0 && poolOthersGain > 0) {
    if (comprehensiveNet >= 0) {
      interpretation = `대상 품목 단독은 ${formatAmt(singleItemEffect)} 손실이나, ${poolName} 풀 내 다른 품목 원가 절감 ${formatAmt(poolOthersGain)}으로 상쇄. 풀 관점 실질 순효과 ${formatAmt(comprehensiveNet)}.`;
    } else {
      interpretation = `대상 품목 ${formatAmt(singleItemEffect)} 손실 중, ${poolName} 풀 덤 효과 ${formatAmt(poolOthersGain)}이 일부 상쇄하나 부족. 풀 관점 순효과 ${formatAmt(comprehensiveNet)}.`;
    }
  } else if (singleItemEffect >= 0) {
    interpretation = `대상 품목 단독으로도 ${formatAmt(singleItemEffect)} 이득. 풀 덤 효과 ${formatAmt(poolOthersGain)} 추가.`;
  } else {
    interpretation = `대상 품목 ${formatAmt(singleItemEffect)} 손실. 풀 덤 효과도 ${formatAmt(poolOthersGain)}으로 미미.`;
  }

  return {
    singleItemEffect,
    singleItemResult,
    poolEffect,
    poolOthersGain,
    poolTargetDelta,
    poolLevel: "대분류",
    poolName,
    comprehensiveNet,
    comprehensiveResult,
    interpretation,
  };
}

// ─── 거래처 포트폴리오 순효과 ───────────────────

export interface CustomerPortfolioOffset {
  customer: string;
  customerName: string;
  targetItemCM: number;
  otherItemsCM: number;
  otherItemCount: number;
  portfolioTotalCM: number;
  isPositive: boolean;
}

export interface PortfolioSummary {
  totalCustomers: number;
  positiveCount: number;
  negativeCount: number;
  totalTargetCM: number;
  totalOtherCM: number;
  totalPortfolioCM: number;
  customers: CustomerPortfolioOffset[];
}

/**
 * 거래처 포트폴리오 순효과.
 *
 * 대상 품목을 구매하는 거래처의 전체 구매 포트폴리오(다른 품목 포함) 마진을 합산.
 * "이 거래처를 잃으면 이만큼의 마진을 포기하는 것" — 기회비용 관점.
 *
 * ⚠️ 기존 실적 기준. 저가 수주가 거래처 유지의 필수 조건이라는 가정 포함.
 */
export function calcCustomerPortfolioOffset(
  cvpItems: CVPItem[],
  targetItem: string | null,
  targetCustomer: string | null,
): PortfolioSummary {
  if (!targetItem) {
    return { totalCustomers: 0, positiveCount: 0, negativeCount: 0, totalTargetCM: 0, totalOtherCM: 0, totalPortfolioCM: 0, customers: [] };
  }

  // 대상 품목을 구매하는 거래처 식별
  const targetCustomers = new Set<string>();
  for (const c of cvpItems) {
    if (c.item === targetItem) {
      if (targetCustomer === null || c.customer === targetCustomer) {
        targetCustomers.add(c.customer);
      }
    }
  }

  // 거래처별 포트폴리오 집계
  const custMap = new Map<string, { name: string; targetCM: number; otherCM: number; otherCount: number }>();
  for (const c of cvpItems) {
    if (!targetCustomers.has(c.customer)) continue;
    const prev = custMap.get(c.customer);
    const isTarget = c.item === targetItem;
    if (!prev) {
      custMap.set(c.customer, {
        name: c.customerName,
        targetCM: isTarget ? c.totalContributionMargin : 0,
        otherCM: isTarget ? 0 : c.totalContributionMargin,
        otherCount: isTarget ? 0 : 1,
      });
    } else {
      if (isTarget) {
        prev.targetCM += c.totalContributionMargin;
      } else {
        prev.otherCM += c.totalContributionMargin;
        prev.otherCount++;
      }
    }
  }

  const customers: CustomerPortfolioOffset[] = Array.from(custMap.entries())
    .map(([customer, data]) => ({
      customer,
      customerName: data.name,
      targetItemCM: data.targetCM,
      otherItemsCM: data.otherCM,
      otherItemCount: data.otherCount,
      portfolioTotalCM: data.targetCM + data.otherCM,
      isPositive: data.targetCM + data.otherCM > 0,
    }))
    .sort((a, b) => b.portfolioTotalCM - a.portfolioTotalCM);

  return {
    totalCustomers: customers.length,
    positiveCount: customers.filter(c => c.isPositive).length,
    negativeCount: customers.filter(c => !c.isPositive).length,
    totalTargetCM: customers.reduce((s, c) => s + c.targetItemCM, 0),
    totalOtherCM: customers.reduce((s, c) => s + c.otherItemsCM, 0),
    totalPortfolioCM: customers.reduce((s, c) => s + c.portfolioTotalCM, 0),
    customers,
  };
}

// ─── 저가수주 판단기 (Quick Verdict) ────────────

export type QuickVerdictResult = "approve" | "reject" | "conditional";

export interface QuickVerdict {
  verdict: QuickVerdictResult;
  verdictLabel: string;
  /** 3가지 관점 금액 */
  singleItemEffect: number;     // 4a 단독
  poolOthersGain: number | null; // 4b 풀 덤
  portfolioOtherCM: number;     // 거래처 포트폴리오 (기존 실적)
  poolName: string;
  /** 한국어 이유 (3줄 이내) */
  reasons: string[];
  /** 감도: 최소 필요 수량 (손익분기) */
  minRequiredVolume: number | null;
  isVolumeEnough: boolean;
  /** 현재 단가 정보 */
  currentUnitPrice: number;
  proposedUnitPrice: number;
  priceChangePct: number;
}

/**
 * 저가수주 판단기 — 1화면 YES/NO 의사결정.
 *
 * 기존 분석 함수를 조합하여 3가지 관점을 하나의 판정으로 통합:
 *  1. 4a: 대상 품목 단독 효과 (calcTotalViewSimulation)
 *  2. 4b: 풀 내 다른 품목 원가 절감 (calcComprehensiveVerdict)
 *  3. 거래처 포트폴리오: 기존 다른 품목 마진 (calcCustomerPortfolioOffset)
 *
 * 판정 기준:
 *  ✅ APPROVE: 종합 순효과 양수 OR 거래처 포트폴리오 양수
 *  ❌ REJECT: 3가지 관점 모두 음수
 *  ⚠️ CONDITIONAL: 일부 조건에서만 이득
 */
export function calcQuickVerdict(
  cvpItems: CVPItem[],
  totalFixedCost: number,
  itemProfitability: ItemProfitabilityRecord[] | undefined,
  targetItem: string | null,
  targetCustomer: string | null,
  proposedUnitPrice: number,
  additionalQuantity: number,
  costChangePct?: CostChangePct,
  vcCostRatioMap?: Map<string, { rawMaterialRatio: number; laborRatio: number; outsourcingRatio: number }>,
): QuickVerdict {
  if (!targetItem || additionalQuantity <= 0) {
    return {
      verdict: "conditional",
      verdictLabel: "품목과 수량을 입력하세요",
      singleItemEffect: 0,
      poolOthersGain: null,
      portfolioOtherCM: 0,
      poolName: "",
      reasons: ["대상 품목과 예상 추가수량을 입력하면 판정이 시작됩니다."],
      minRequiredVolume: null,
      isVolumeEnough: false,
      currentUnitPrice: 0,
      proposedUnitPrice: 0,
      priceChangePct: 0,
    };
  }

  // 현재 단가 조회
  const targetRows = cvpItems.filter(c => c.item === targetItem && (targetCustomer === null || c.customer === targetCustomer));
  const totalQty = targetRows.reduce((s, c) => s + c.quantity, 0);
  const totalRev = targetRows.reduce((s, c) => s + c.revenue, 0);
  const currentUnitPrice = totalQty > 0 ? totalRev / totalQty : 0;

  // [C2] 기존 매출 데이터 없는 품목 가드
  if (currentUnitPrice <= 0) {
    return {
      verdict: "conditional",
      verdictLabel: "기존 매출 데이터 없음 — 단가 비교 불가",
      singleItemEffect: 0,
      poolOthersGain: null,
      portfolioOtherCM: 0,
      poolName: "",
      reasons: [
        "이 품목은 기존 매출 실적이 없어 현재 단가를 알 수 없습니다.",
        "상세 분석(Step 4a)에서 직접 슬라이더로 시뮬레이션하세요.",
      ],
      minRequiredVolume: null,
      isVolumeEnough: false,
      currentUnitPrice: 0,
      proposedUnitPrice,
      priceChangePct: 0,
    };
  }

  const priceChangePct = ((proposedUnitPrice / currentUnitPrice) - 1) * 100;

  // 1. 4a: 단일 품목 시뮬 (원가 변동 + 품목별 원가구성비율 forward)
  const sim4a = calcTotalViewSimulation({
    items: cvpItems,
    totalFixedCost,
    targetCustomer,
    targetItem,
    volumeIncreasePct: 0,
    priceChangePct,
    volumeAbsolute: additionalQuantity,
    costChangePct,
    vcCostRatioMap,
  });

  // 2. 4a+4b 종합 판정
  const comp = calcComprehensiveVerdict(sim4a, itemProfitability, targetItem, 0, priceChangePct);

  // 3. 거래처 포트폴리오
  const portfolio = calcCustomerPortfolioOffset(cvpItems, targetItem, targetCustomer);

  // 4. 감도: 최소 필요 수량 역산 (이진 탐색)
  let minRequiredVolume: number | null = null;
  if (sim4a.netOffsetEffect < 0) {
    // [C1] 단위공헌이익 ≤ 0이면 BEP 물리적 도달 불가
    const avgUnitVC = targetRows.length > 0
      ? targetRows.reduce((s, c) => s + c.unitVariableCost, 0) / targetRows.length
      : 0;
    const proposedUnitCM = proposedUnitPrice - avgUnitVC;

    if (proposedUnitCM <= 0) {
      minRequiredVolume = null; // BEP 불가: 팔수록 손해
    } else {
      let lo = 0, hi = additionalQuantity * 5;
      for (let i = 0; i < 20; i++) {
        const mid = Math.round((lo + hi) / 2);
        const test = calcTotalViewSimulation({
          items: cvpItems, totalFixedCost, targetCustomer, targetItem,
          volumeIncreasePct: 0, priceChangePct, volumeAbsolute: mid,
          costChangePct, vcCostRatioMap,
        });
        if (test.netOffsetEffect >= 0) hi = mid;
        else lo = mid;
      }
      const finalVol = Math.ceil((lo + hi) / 2);
      const verify = calcTotalViewSimulation({
        items: cvpItems, totalFixedCost, targetCustomer, targetItem,
        volumeIncreasePct: 0, priceChangePct, volumeAbsolute: finalVol,
        costChangePct, vcCostRatioMap,
      });
      minRequiredVolume = verify.netOffsetEffect >= 0 ? finalVol : null;
    }
  }
  // [M4] sim4a 이미 이득이면 BEP 무의미
  const isVolumeEnough = minRequiredVolume !== null
    ? additionalQuantity >= minRequiredVolume
    : sim4a.netOffsetEffect >= 0;

  // 5. 판정
  // [H4] poolOthersGain null 처리: 200 보고서 없으면 풀 효과를 0으로 가정하지 않음
  const poolAvailable = comp.comprehensiveResult !== "unavailable";
  const poolGain = poolAvailable ? (comp.poolOthersGain ?? 0) : 0;
  const comprehensiveNet = poolAvailable ? sim4a.netOffsetEffect + poolGain : null;
  const portfolioCM = portfolio.totalPortfolioCM;

  const fmtAmt = (v: number) => {
    const abs = Math.abs(v);
    const sign = v >= 0 ? "+" : "";
    if (abs >= 1e8) return `${sign}${(v / 1e8).toFixed(1)}억원`;
    if (abs >= 1e4) return `${sign}${Math.round(v / 1e4).toLocaleString()}만원`;
    return `${sign}${Math.round(v).toLocaleString()}원`;
  };

  let verdict: QuickVerdictResult;
  let verdictLabel: string;
  const reasons: string[] = [];

  if (sim4a.netOffsetEffect >= 0) {
    verdict = "approve";
    verdictLabel = "이 저가수주는 진행 가능합니다";
    reasons.push(`이 품목 단독으로도 ${fmtAmt(sim4a.netOffsetEffect)} 이익 증가.`);
    if (poolAvailable && poolGain > 0) reasons.push(`추가로 같은 풀(${comp.poolName}) 다른 품목 원가 절감 ${fmtAmt(poolGain)}.`);
  } else if ((poolAvailable && comprehensiveNet !== null && comprehensiveNet >= 0) || portfolioCM > 0) {
    // [M3] 조건부 판정: 어떤 조건이 충족되었는지 명시
    verdict = "conditional";
    verdictLabel = "조건부 진행 가능 — 아래 주의사항 확인";
    reasons.push(`이 품목 단독은 ${fmtAmt(sim4a.netOffsetEffect)} 손실.`);
    if (poolAvailable && comprehensiveNet !== null && comprehensiveNet >= 0) {
      reasons.push(`같은 풀(${comp.poolName}) 다른 품목 원가 절감 ${fmtAmt(poolGain)}으로 상쇄 → 풀 관점 이득.`);
    } else if (poolAvailable && poolGain > 0) {
      reasons.push(`풀 원가 절감 ${fmtAmt(poolGain)} 일부 상쇄하나 부족.`);
    }
    if (portfolioCM > 0) {
      reasons.push(`${targetCustomer ? "이 거래처" : "대상 품목 거래처들"}의 다른 품목 마진 ${fmtAmt(portfolioCM)} — 거래 관계 유지 가치.`);
    }
    if (!poolAvailable) {
      reasons.push(`(200 보고서 미업로드로 풀 원가절감 효과 미확인)`);
    }
    if (minRequiredVolume !== null && !isVolumeEnough) {
      reasons.push(`단독 손익분기: 최소 ${minRequiredVolume.toLocaleString()}개 필요.`);
    } else if (minRequiredVolume === null && sim4a.netOffsetEffect < 0) {
      reasons.push(`이 단가로는 물량을 아무리 늘려도 단독 손익분기 불가 (단위공헌이익 ≤ 0).`);
    }
  } else {
    verdict = "reject";
    verdictLabel = "이 저가수주는 손실입니다";
    reasons.push(`이 품목 단독 ${fmtAmt(sim4a.netOffsetEffect)} 손실.`);
    if (!poolAvailable) {
      reasons.push(`풀 원가절감 효과 미확인 (200 보고서 업로드 필요).`);
    } else if (poolGain <= 0) {
      reasons.push(`풀 내 다른 품목 원가 절감 효과도 미미 (${fmtAmt(poolGain)}).`);
    } else {
      reasons.push(`풀 원가 절감 ${fmtAmt(poolGain)}으로도 상쇄 부족. 종합 ${fmtAmt(comprehensiveNet ?? sim4a.netOffsetEffect)}.`);
    }
    if (minRequiredVolume === null) {
      reasons.push(`이 단가로는 물량을 아무리 늘려도 단독 손익분기 도달 불가.`);
    }
  }

  return {
    verdict,
    verdictLabel,
    singleItemEffect: sim4a.netOffsetEffect,
    poolOthersGain: poolAvailable ? comp.poolOthersGain : null,
    portfolioOtherCM: portfolioCM,
    poolName: comp.poolName,
    reasons,
    minRequiredVolume,
    isVolumeEnough,
    currentUnitPrice,
    proposedUnitPrice,
    priceChangePct,
  };
}

// ─── v2 WS1: Monte Carlo 불확실성 엔진 ─────────────────────

/**
 * 저가수주 판단에 Monte Carlo 시뮬레이션 적용 —
 * 점추정값을 "평균 / 95% CI / 손실확률"로 전환.
 *
 * @source v2.1 Data Validation (2026-04-23) 실측 기반 σ
 * @design
 *   - 입력 분포 4종: 원재료 인상률, 노무 인상률, 외주 인상률, 물량 실현률
 *   - 판가/추가수량은 사용자 입력 '기대값'이므로 분포 부여 안함 (의사결정 변수)
 *   - 각 iteration마다 calcTotalViewSimulation을 호출하여 netOffsetEffect 1값 추출
 *   - 10,000회 반복 후 summarize()로 통계 집계
 *
 * @performance
 *   - 메인 스레드 실행. 10k × 단순 CVP 계산 ≈ 0.5~1.5초 예상
 *   - Web Worker 이관은 성능 이슈 발생 시 별도 사이클 (WS1-B)
 */
export interface MonteCarloVerdictInput {
  cvpItems: CVPItem[];
  totalFixedCost: number;
  targetItem: string | null;
  targetCustomer: string | null;
  proposedUnitPrice: number;
  additionalQuantity: number;
  /** 품목별 원가 구성비 (200 보고서) */
  vcCostRatioMap?: Map<string, { rawMaterialRatio: number; laborRatio: number; outsourcingRatio: number }>;
  /** 원가 인상 슬라이더 평균값 (기대값으로 사용) */
  costMean?: { rawMaterial: number; labor: number; outsourcing: number };
  /** 원가 σ (불확실성). 지정 없으면 v2.1 실측 폴백 사용 */
  costSigma?: { rawMaterial: number; labor: number; outsourcing: number };
  /** 물량 실현률 삼각분포 (min, mode, max). 기본 (0.6, 1.0, 1.1) */
  volumeRealization?: { min: number; mode: number; max: number };
  iterations?: number;
  seed?: number;
}

export interface MonteCarloVerdict {
  iterations: number;
  mean: number;
  median: number;
  stddev: number;
  p5: number;
  p95: number;
  lossProbability: number;
  positiveProb: number;
  histogram: Array<{ lo: number; hi: number; count: number }>;
  /** 실측 σ 추정 실패 시 폴백 사용 경고 */
  usedFallback: boolean;
  /** Point estimate (참조용) — costMean만 적용한 결정론 값 */
  pointEstimate: number;
}

export function calcMonteCarloVerdict(input: MonteCarloVerdictInput): MonteCarloVerdict {
  const {
    cvpItems, totalFixedCost, targetItem, targetCustomer,
    proposedUnitPrice, additionalQuantity, vcCostRatioMap,
    costMean = { rawMaterial: 0, labor: 0, outsourcing: 0 },
    costSigma = {
      rawMaterial: FALLBACK_CV.rawMaterial * 100,
      labor: FALLBACK_CV.labor * 100,
      outsourcing: FALLBACK_CV.outsourcing * 100,
    },
    volumeRealization = { min: 0.6, mode: 1.0, max: 1.1 },
    iterations = 10_000,
    seed = Date.now(),
  } = input;

  // 현재 단가 조회 (priceChangePct 계산에 필요)
  const targetRows = cvpItems.filter(c => c.item === targetItem && (targetCustomer === null || c.customer === targetCustomer));
  const totalQty = targetRows.reduce((s, c) => s + c.quantity, 0);
  const totalRev = targetRows.reduce((s, c) => s + c.revenue, 0);
  const currentUnitPrice = totalQty > 0 ? totalRev / totalQty : 0;
  if (!targetItem || additionalQuantity <= 0 || currentUnitPrice <= 0) {
    return {
      iterations: 0, mean: 0, median: 0, stddev: 0, p5: 0, p95: 0,
      lossProbability: 0, positiveProb: 0, histogram: [],
      usedFallback: false, pointEstimate: 0,
    };
  }
  const priceChangePct = ((proposedUnitPrice / currentUnitPrice) - 1) * 100;

  // 메인 시뮬 루프
  const rng = mulberry32(seed);
  const results: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const cRaw = sampleNormal(costMean.rawMaterial, costSigma.rawMaterial, rng);
    const cLab = sampleNormal(costMean.labor, costSigma.labor, rng);
    const cOut = sampleNormal(costMean.outsourcing, costSigma.outsourcing, rng);
    const volRealize = sampleTriangular(volumeRealization.min, volumeRealization.mode, volumeRealization.max, rng);
    const effectiveAddedQty = additionalQuantity * volRealize;
    const sim = calcTotalViewSimulation({
      items: cvpItems,
      totalFixedCost,
      targetCustomer,
      targetItem,
      volumeIncreasePct: 0,
      priceChangePct,
      volumeAbsolute: effectiveAddedQty,
      costChangePct: { rawMaterial: cRaw, labor: cLab, outsourcing: cOut },
      vcCostRatioMap,
    });
    results.push(sim.netOffsetEffect);
  }
  const summary = summarize(results);

  // Point estimate (costMean + volumeRealization.mode 결정론)
  const pointSim = calcTotalViewSimulation({
    items: cvpItems, totalFixedCost, targetCustomer, targetItem,
    volumeIncreasePct: 0, priceChangePct,
    volumeAbsolute: additionalQuantity * volumeRealization.mode,
    costChangePct: costMean, vcCostRatioMap,
  });

  return {
    iterations: summary.iterations,
    mean: summary.mean,
    median: summary.median,
    stddev: summary.stddev,
    p5: summary.p5,
    p95: summary.p95,
    lossProbability: summary.lossProbability,
    positiveProb: summary.positiveProb,
    histogram: summary.histogram,
    usedFallback: !vcCostRatioMap,
    pointEstimate: pointSim.netOffsetEffect,
  };
}
