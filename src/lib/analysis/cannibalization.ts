/**
 * 카니발라이제이션 (자기잠식 + 포트폴리오 순효과) — v2 WS8 (Phase C 마지막 자산).
 *
 * @model
 *   거래처×품목 14개월 시계열에서 Pearson 상관 매트릭스 추출.
 *   같은 거래처 내 품목 쌍 (A, B)이 서로 음의 상관 = 잠식 가능성.
 *
 *   카니발 계수 c_AB (elasticity-weighted correlation):
 *     ρ_AB     = Pearson(A series, B series)        ∈ [-1, 1]
 *     β_AB    = Cov(A, B) / Var(B)                  (B 1단위 ↑ 시 A 변화량)
 *     ε_AB    = β × mean(B) / mean(A)               (무차원 탄력성: B 1% ↑ → A ε% 변화)
 *     c_raw   = max(0, -ρ × |ε|)                    (음의 상관일 때만 활성)
 *     boost   = 1.5 if sameCategory(A, B) else 1.0
 *     c_AB    = min(1, c_raw × boost)               ∈ [0, 1]
 *
 *   포트폴리오 순효과:
 *     단독효과    = ΔSales_target (target 품목 결정 직접 효과)
 *     자기잠식    = Σ_i (c_i_target × (ΔSales_target / baseSales_target) × baseSales_i)
 *     포트폴리오 순 = 단독효과 - 자기잠식
 *
 * @design
 *   - WS6/WS7과 동일한 옵셔널 props 패턴 (useCannibalization?)
 *   - 3 프리셋 (weak 0.5 / medium 1.0 / strong 1.5) + 사용자 슬라이더
 *   - 14M 데이터 한계: 동시 발생 월 ≥ 4 필터, 신뢰도 배지
 *   - Top-15 품목 한정 (성능 + 시각화 가독성)
 *   - elasticity 공식 채택 이유: β/mean(A) 단독은 1/won 단위라 dimensionally 부정확.
 *     β × meanB/meanA = 무차원 탄력성 → 의사결정용 직관적 해석 가능
 */

import type { CustomerItemDetailRecord } from "@/types";

// ─── Types ───────────────────────────────────────────────

export type CannibalScenario = "weak" | "medium" | "strong" | "custom";

export interface CannibalScenarioPreset {
  id: CannibalScenario;
  multiplier: number;
  label: string;
  description: string;
}

export interface CannibalMatrixCell {
  itemA: string;            // 품목 코드
  itemAName: string;        // 품목명
  itemB: string;
  itemBName: string;
  correlation: number;      // Pearson [-1, 1]
  cannibalRate: number;     // [0, 1] 정규화된 잠식 계수
  sameCategory: boolean;    // 대분류 동일?
  sampleMonths: number;     // 동시 발생 월 수
  confidenceLevel: "high" | "medium" | "low";
  customerCount: number;    // 이 쌍이 관측된 거래처 수
}

export interface ItemRiskScore {
  item: string;
  itemName: string;
  inboundRisk: number;      // 다른 품목으로부터 잠식당할 가능성 합계
  outboundRisk: number;     // 다른 품목을 잠식할 가능성 합계
  sales: number;            // 해당 품목 총 매출
}

export interface CannibalizedItem {
  item: string;
  itemName: string;
  expectedLoss: number;     // 자기잠식 예상 손실 (음수)
  cannibalRate: number;     // target과의 c 계수
}

export interface CannibalizationResult {
  matrix: CannibalMatrixCell[];
  itemRiskScores: ItemRiskScore[];
  notes: string[];
  topItemsByRevenue: Array<{ item: string; itemName: string; sales: number }>;
}

export interface CannibalCorrectionInput {
  /** 카니발 매트릭스 결과 */
  matrix: CannibalMatrixCell[];
  /** 의사결정 대상 품목 코드 */
  targetItem: string;
  /** 대상 품목 단독 효과 (양수: 매출 증가, 음수: 매출 감소) */
  aloneEffect: number;
  /** 대상 품목 기준 매출 (잠식률 적용 분모) */
  baseSalesTarget: number;
  /** 다른 품목들의 기준 매출 Map<품목코드, 매출> */
  baseSalesMap: Map<string, number>;
  /** 품목명 Map<품목코드, 품목명> (옵션) */
  itemNameMap?: Map<string, string>;
  /** 잠식 강도 multiplier (0.5/1.0/1.5/사용자) */
  multiplier: number;
}

export interface CannibalCorrectionResult {
  aloneEffect: number;
  cannibalLoss: number;        // 음수
  portfolioNet: number;        // = aloneEffect + cannibalLoss
  cannibalizedTopN: CannibalizedItem[];
  multiplier: number;
  notes: string[];
}

// ─── 상수 ────────────────────────────────────────────────

export const PRESETS: Record<Exclude<CannibalScenario, "custom">, CannibalScenarioPreset> = {
  weak:   { id: "weak",   multiplier: 0.5, label: "약한 잠식",   description: "데이터 상관의 50% 적용 (보수적)" },
  medium: { id: "medium", multiplier: 1.0, label: "중간 잠식",   description: "데이터 상관 그대로 적용 (기본)" },
  strong: { id: "strong", multiplier: 1.5, label: "강한 잠식",   description: "데이터 상관의 150% 적용 (비관적)" },
};

export const MIN_SAMPLE_MONTHS = 4;          // 동시 발생 월 신뢰도 임계
export const SAME_CATEGORY_BOOST = 1.5;       // 대분류 동일 보정
export const STRONG_NEG_CORR_THRESHOLD = -0.3; // 강한 음의 상관 표시 기준
export const POSITIVE_CORR_THRESHOLD = 0.3;    // 보완재 분류 기준
export const TOP_N_ITEMS = 15;                 // heatmap 표시 한정
export const TOP_N_CANNIBALIZED = 5;           // 잠식 Top-N 리스트

// ─── 통계 헬퍼 ──────────────────────────────────────────

/** Pearson 상관계수 — 분산 0이거나 길이 < 2 시 0 반환 */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0, denomA = 0, denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  if (denom === 0) return 0;
  return num / denom;
}

/** 회귀 기울기 β = Cov(A,B)/Var(B) — Var(B)=0 시 0 반환 */
export function regressionSlope(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;

  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - meanA) * (b[i] - meanB);
    varB += (b[i] - meanB) ** 2;
  }
  if (varB === 0) return 0;
  return cov / varB;
}

/** 무차원 탄력성 ε = β × meanB / meanA */
export function calcElasticity(beta: number, meanA: number, meanB: number): number {
  if (meanA <= 0) return 0;
  return beta * meanB / meanA;
}

/** 카니발 계수 산출 (elasticity-weighted correlation + 카테고리 보정 + 클램핑) */
export function calcCannibalRate(
  correlation: number,
  beta: number,
  meanA: number,
  meanB: number,
  sameCategory: boolean,
): number {
  if (correlation >= 0) return 0;            // 양의 상관 = 보완재
  if (meanA <= 0 || meanB <= 0) return 0;    // 0 매출 방어
  const elasticity = calcElasticity(beta, meanA, meanB);
  if (elasticity >= 0) return 0;             // 양의 탄력성 = 보완재
  const cRaw = (-correlation) * Math.abs(elasticity);
  const boost = sameCategory ? SAME_CATEGORY_BOOST : 1.0;
  return Math.max(0, Math.min(1, cRaw * boost));
}

/** 신뢰도 분류 (4M=low, 8M=medium, 12M+=high) */
export function classifyConfidence(sampleMonths: number): "high" | "medium" | "low" {
  if (sampleMonths >= 12) return "high";
  if (sampleMonths >= 8) return "medium";
  return "low";
}

// ─── 거래처×품목 매트릭스 빌드 ──────────────────────────

/** 거래처별 품목별 월별 매출 시계열 */
type CustomerItemMonthlyMap = Map<string, Map<string, Map<string, number>>>;
//                                customer  item   month   sales

/** customerItemDetail에서 거래처-품목-월 시계열 추출 */
export function buildCustomerItemTimeSeries(
  data: CustomerItemDetailRecord[],
): CustomerItemMonthlyMap {
  const map: CustomerItemMonthlyMap = new Map();

  for (const r of data) {
    const customer = r.매출거래처 || "";
    const item = r.품목 || "";
    const month = r.month || "";
    const sales = r.매출액?.실적 || 0;

    if (!customer || !item || !month) continue;

    let custMap = map.get(customer);
    if (!custMap) {
      custMap = new Map();
      map.set(customer, custMap);
    }
    let itemMap = custMap.get(item);
    if (!itemMap) {
      itemMap = new Map();
      custMap.set(item, itemMap);
    }
    itemMap.set(month, (itemMap.get(month) || 0) + sales);
  }

  return map;
}

/** Top-N 품목 추출 (총매출 기준) */
function getTopNItems(
  data: CustomerItemDetailRecord[],
  n: number,
): { items: string[]; nameMap: Map<string, string>; salesMap: Map<string, number> } {
  const totals = new Map<string, { sales: number; name: string }>();
  for (const r of data) {
    const item = r.품목 || "";
    if (!item) continue;
    const sales = r.매출액?.실적 || 0;
    const existing = totals.get(item);
    if (existing) {
      existing.sales += sales;
    } else {
      totals.set(item, { sales, name: r.품목명 || item });
    }
  }

  const sorted = Array.from(totals.entries())
    .sort((a, b) => b[1].sales - a[1].sales)
    .slice(0, n);

  const nameMap = new Map<string, string>();
  const salesMap = new Map<string, number>();
  for (const [item, info] of sorted) {
    nameMap.set(item, info.name);
    salesMap.set(item, info.sales);
  }

  return { items: sorted.map(([item]) => item), nameMap, salesMap };
}

// ─── 메인: 카니발 매트릭스 계산 ──────────────────────────

export interface CannibalizationInput {
  data: CustomerItemDetailRecord[];
  /** 품목 → 대분류 매핑 (옵션, 없으면 모두 sameCategory=false) */
  itemCategoryMap?: Map<string, string>;
  /** 분석 대상 Top-N 품목 (기본 15) */
  topN?: number;
}

export function calcCannibalizationMatrix(
  input: CannibalizationInput,
): CannibalizationResult {
  const { data, itemCategoryMap, topN = TOP_N_ITEMS } = input;
  const notes: string[] = [];

  if (!data || data.length === 0) {
    notes.push("customerItemDetail 데이터 없음 — 매트릭스 계산 불가");
    return { matrix: [], itemRiskScores: [], notes, topItemsByRevenue: [] };
  }

  // 1. Top-N 품목 추출
  const { items: topItems, nameMap, salesMap } = getTopNItems(data, topN);
  if (topItems.length < 2) {
    notes.push(`품목 수 부족 (${topItems.length}) — 매트릭스 계산 불가`);
    return { matrix: [], itemRiskScores: [], notes, topItemsByRevenue: [] };
  }

  // 2. 거래처-품목-월 시계열 빌드
  const tsMap = buildCustomerItemTimeSeries(data);

  // 3. 모든 거래처에서 품목 쌍 (i, j) 시계열 수집
  type PairAccum = {
    correlations: number[];      // 거래처별 ρ
    slopes: number[];            // 거래처별 β
    meansA: number[];            // 거래처별 mean(A)
    meansB: number[];            // 거래처별 mean(B)
    sampleMonthsList: number[];  // 거래처별 동시 발생 월 수
    customerCount: number;
  };
  const pairs = new Map<string, PairAccum>();
  const pairKey = (a: string, b: string) => `${a}__${b}`;

  for (const [, custItemMap] of Array.from(tsMap.entries())) {
    const items = Array.from(custItemMap.keys()).filter(it => topItems.includes(it));
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const itemA = items[i];
        const itemB = items[j];
        const seriesA = custItemMap.get(itemA)!;
        const seriesB = custItemMap.get(itemB)!;

        // 동시 발생 월만 추출
        const commonMonths = Array.from(seriesA.keys()).filter(m => seriesB.has(m));
        if (commonMonths.length < MIN_SAMPLE_MONTHS) continue;

        const a = commonMonths.map(m => seriesA.get(m)!);
        const b = commonMonths.map(m => seriesB.get(m)!);

        const corr = pearsonCorrelation(a, b);
        const slope = regressionSlope(a, b);
        const meanA = a.reduce((s, v) => s + v, 0) / a.length;
        const meanB = b.reduce((s, v) => s + v, 0) / b.length;

        const k = pairKey(itemA, itemB);
        let acc = pairs.get(k);
        if (!acc) {
          acc = {
            correlations: [], slopes: [], meansA: [], meansB: [], sampleMonthsList: [],
            customerCount: 0,
          };
          pairs.set(k, acc);
        }
        acc.correlations.push(corr);
        acc.slopes.push(slope);
        acc.meansA.push(meanA);
        acc.meansB.push(meanB);
        acc.sampleMonthsList.push(commonMonths.length);
        acc.customerCount += 1;
      }
    }
  }

  // 4. 거래처 평균하여 매트릭스 셀 생성
  const matrix: CannibalMatrixCell[] = [];
  for (const [k, acc] of Array.from(pairs.entries())) {
    const [itemA, itemB] = k.split("__");
    const avgCorr = acc.correlations.reduce((s, v) => s + v, 0) / acc.correlations.length;
    const avgSlope = acc.slopes.reduce((s, v) => s + v, 0) / acc.slopes.length;
    const avgMeanA = acc.meansA.reduce((s, v) => s + v, 0) / acc.meansA.length;
    const avgMeanB = acc.meansB.reduce((s, v) => s + v, 0) / acc.meansB.length;
    const avgSampleMonths = acc.sampleMonthsList.reduce((s, v) => s + v, 0) / acc.sampleMonthsList.length;

    const catA = itemCategoryMap?.get(itemA);
    const catB = itemCategoryMap?.get(itemB);
    const sameCategory = !!catA && !!catB && catA === catB;

    const cannibalRate = calcCannibalRate(avgCorr, avgSlope, avgMeanA, avgMeanB, sameCategory);

    matrix.push({
      itemA,
      itemAName: nameMap.get(itemA) || itemA,
      itemB,
      itemBName: nameMap.get(itemB) || itemB,
      correlation: avgCorr,
      cannibalRate,
      sameCategory,
      sampleMonths: Math.round(avgSampleMonths),
      confidenceLevel: classifyConfidence(avgSampleMonths),
      customerCount: acc.customerCount,
    });
  }

  // 5. 품목별 리스크 점수 (in/out bound)
  const riskMap = new Map<string, { inbound: number; outbound: number }>();
  for (const cell of matrix) {
    const inb = riskMap.get(cell.itemA) || { inbound: 0, outbound: 0 };
    inb.inbound += cell.cannibalRate;
    riskMap.set(cell.itemA, inb);
    const outb = riskMap.get(cell.itemB) || { inbound: 0, outbound: 0 };
    outb.outbound += cell.cannibalRate;
    riskMap.set(cell.itemB, outb);
  }
  const itemRiskScores: ItemRiskScore[] = Array.from(riskMap.entries()).map(([item, r]) => ({
    item,
    itemName: nameMap.get(item) || item,
    inboundRisk: r.inbound,
    outboundRisk: r.outbound,
    sales: salesMap.get(item) || 0,
  }));
  itemRiskScores.sort((a, b) => b.inboundRisk - a.inboundRisk);

  if (matrix.length === 0) {
    notes.push("샘플 ≥ 4M 쌍 없음 — 매트릭스 비어있음");
  } else {
    notes.push(`매트릭스 ${matrix.length} 셀 / ${pairs.size} 품목 쌍 / Top-${topItems.length} 품목 분석`);
  }

  const topItemsByRevenue = topItems.map(item => ({
    item,
    itemName: nameMap.get(item) || item,
    sales: salesMap.get(item) || 0,
  }));

  return { matrix, itemRiskScores, notes, topItemsByRevenue };
}

// ─── 카니발 보정 적용 (단독 효과 → 포트폴리오 순효과) ──

export function applyCannibalCorrection(input: CannibalCorrectionInput): CannibalCorrectionResult {
  const { matrix, targetItem, aloneEffect, baseSalesTarget, baseSalesMap, itemNameMap, multiplier } = input;
  const notes: string[] = [];

  const m = Math.max(0, multiplier);

  if (baseSalesTarget <= 0) {
    notes.push("기준 매출 0 — 잠식 보정 불가");
    return {
      aloneEffect, cannibalLoss: 0, portfolioNet: aloneEffect,
      cannibalizedTopN: [], multiplier: m, notes,
    };
  }

  // target 품목이 itemA이고 잠식 대상이 itemB인 셀 (target 매출 변화 → 다른 품목 잠식)
  // 매트릭스 정의: itemA가 잠식당하는 쪽 (inbound). target이 itemB일 때 itemA가 잠식 대상.
  // → target=itemB인 행만 필터, itemA = 잠식되는 다른 품목
  const targetCells = matrix.filter(c => c.itemB === targetItem && c.itemA !== targetItem);

  if (targetCells.length === 0) {
    notes.push(`품목 ${targetItem}: 매트릭스에 잠식 관계 없음`);
    return {
      aloneEffect, cannibalLoss: 0, portfolioNet: aloneEffect,
      cannibalizedTopN: [], multiplier: m, notes,
    };
  }

  // 단독효과 비율 (target 매출 대비)
  const effectRatio = aloneEffect / baseSalesTarget;

  // 각 다른 품목 i에 대한 잠식 손실
  const lossesPerItem: CannibalizedItem[] = [];
  for (const cell of targetCells) {
    const otherItem = cell.itemA;
    const baseSalesOther = baseSalesMap.get(otherItem) || 0;
    if (baseSalesOther <= 0) continue;

    const adjustedRate = cell.cannibalRate * m;
    // target 매출 +X% → other 매출 -c × X% (음의 상관 = 잠식)
    const expectedLoss = -adjustedRate * effectRatio * baseSalesOther;
    if (expectedLoss === 0) continue;

    lossesPerItem.push({
      item: otherItem,
      itemName: itemNameMap?.get(otherItem) || cell.itemAName || otherItem,
      expectedLoss,
      cannibalRate: adjustedRate,
    });
  }

  // 잠식 손실 절댓값 큰 순 정렬 + Top-N 선별
  lossesPerItem.sort((a, b) => Math.abs(b.expectedLoss) - Math.abs(a.expectedLoss));
  const cannibalizedTopN = lossesPerItem.slice(0, TOP_N_CANNIBALIZED);

  const cannibalLoss = lossesPerItem.reduce((s, x) => s + x.expectedLoss, 0);
  const portfolioNet = aloneEffect + cannibalLoss;

  notes.push(`${lossesPerItem.length}개 품목 잠식 효과 합산 (multiplier=${m.toFixed(2)})`);

  return {
    aloneEffect, cannibalLoss, portfolioNet,
    cannibalizedTopN, multiplier: m, notes,
  };
}

// ─── 3 프리셋 일괄 비교 ─────────────────────────────────

export interface CannibalPresetComparison {
  weak: CannibalCorrectionResult;
  medium: CannibalCorrectionResult;
  strong: CannibalCorrectionResult;
}

export function calcAllCannibalPresets(
  baseInput: Omit<CannibalCorrectionInput, "multiplier">,
): CannibalPresetComparison {
  return {
    weak:   applyCannibalCorrection({ ...baseInput, multiplier: PRESETS.weak.multiplier }),
    medium: applyCannibalCorrection({ ...baseInput, multiplier: PRESETS.medium.multiplier }),
    strong: applyCannibalCorrection({ ...baseInput, multiplier: PRESETS.strong.multiplier }),
  };
}

// ─── UI 헬퍼 ─────────────────────────────────────────────

export function presetLabel(scenario: CannibalScenario): string {
  if (scenario === "custom") return "사용자 정의";
  return PRESETS[scenario].label;
}

export function cannibalIntensityLabel(multiplier: number): string {
  if (multiplier <= 0.05) return "잠식 무시";
  if (multiplier <= 0.6) return "약한 잠식";
  if (multiplier <= 1.2) return "중간 잠식";
  if (multiplier <= 1.8) return "강한 잠식";
  return "매우 강한 잠식";
}

export function correlationLabel(corr: number): string {
  if (corr <= STRONG_NEG_CORR_THRESHOLD) return "강한 음의 상관 (잠식 의심)";
  if (corr < 0) return "약한 음의 상관";
  if (corr < POSITIVE_CORR_THRESHOLD) return "중립";
  return "양의 상관 (보완재 가능성)";
}

/** 품목 → 대분류 매핑 빌드 (customerItemDetail의 제품군 사용) */
export function buildCategoryMap(data: CustomerItemDetailRecord[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of data) {
    const item = r.품목 || "";
    const category = r.제품군 || "";
    if (item && category && !map.has(item)) {
      map.set(item, category);
    }
  }
  return map;
}
