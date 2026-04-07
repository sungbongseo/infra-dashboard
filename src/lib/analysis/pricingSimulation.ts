/**
 * 품목별 원가 상승 단가 인상 시뮬레이션
 *
 * 원자재 가격 급등 시 각 품목의 판매단가를 얼마나 올려야 현재 마진을 유지하는가?
 * 7개 원가 버킷 각각 독립 시뮬레이션 + 거래처별 인상 영향 분석.
 *
 * 핵심 수식:
 *   신규원가 = 기존원가 + Σ(원가항목 × 해당항목 상승률/100)
 *   마진 유지 필요 매출 = 신규원가 / (1 - 현재마진율)
 *   필요 단가 인상률 = (필요매출 - 현재매출) / 현재매출 × 100
 */
import type { ItemCostDetailRecord } from "@/types/itemCost";
import type { ProfitabilityAnalysisRecord } from "@/types";
import { COST_BUCKETS, type CostBucketKey } from "@/types/itemCost";
import { safeDivide } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────

export interface CostBucketRates {
  재료비: number;      // %
  상품매입비: number;
  인건비: number;
  설비비: number;
  외주비: number;
  물류비: number;
  일반경비: number;
}

export const DEFAULT_COST_RATES: CostBucketRates = {
  재료비: 10, 상품매입비: 5, 인건비: 3, 설비비: 0, 외주비: 5, 물류비: 8, 일반경비: 3,
};

export const PRESET_SCENARIOS: { name: string; icon: string; rates: CostBucketRates }[] = [
  { name: "원자재 집중", icon: "🛢️", rates: { 재료비: 15, 상품매입비: 5, 인건비: 3, 설비비: 0, 외주비: 3, 물류비: 5, 일반경비: 3 } },
  { name: "물류비 급등", icon: "🚚", rates: { 재료비: 10, 상품매입비: 5, 인건비: 3, 설비비: 0, 외주비: 3, 물류비: 20, 일반경비: 3 } },
  { name: "전체 균등 10%", icon: "📊", rates: { 재료비: 10, 상품매입비: 10, 인건비: 10, 설비비: 10, 외주비: 10, 물류비: 10, 일반경비: 10 } },
  { name: "인건비 상승", icon: "👷", rates: { 재료비: 5, 상품매입비: 3, 인건비: 15, 설비비: 3, 외주비: 5, 물류비: 3, 일반경비: 3 } },
];

export interface PricingScenario {
  costIncrease: number;        // 총 원가 상승률 (가중)
  newCost: number;
  requiredPrice: number;
  priceIncrease: number;       // 필요 단가 인상률 (%)
  marginIfNoIncrease: number;  // 미인상 시 마진율 (%)
  profitImpact: number;        // 미인상 시 이익 감소액
}

export interface PricingSimItem {
  품목: string;
  조직: string;
  currentSales: number;
  currentCost: number;
  currentMargin: number;       // 매출총이익율 (%)
  bucketAmounts: Record<CostBucketKey, number>; // 버킷별 원가액
  bucketShares: Record<CostBucketKey, number>;  // 버킷별 비중 (%)
  scenario: PricingScenario;
}

export interface PricingSimSummary {
  totalItems: number;
  avgPriceIncrease: number;    // 매출 가중평균
  maxPriceIncrease: number;
  highImpactCount: number;     // 인상률 10% 초과
  totalProfitLoss: number;     // 미인상 시 총 이익 감소
  avgMaterialShare: number;    // 재료비 비중 평균
}

export interface CategoryPricingSummary {
  category: string;
  itemCount: number;
  avgPriceIncrease: number;    // 매출 가중평균
  totalSales: number;
  totalProfitLoss: number;
}

export interface CustomerPricingImpact {
  customer: string;
  org: string;
  itemCount: number;
  totalSales: number;
  avgPriceIncrease: number;    // 매출 가중평균
  totalPriceImpact: number;    // 인상 시 매출 증가액
  avgMargin: number;
}

// ─── Helpers ──────────────────────────────────────────

/** 품목의 7개 원가 버킷별 실적 금액 합산 */
function calcBucketAmounts(r: ItemCostDetailRecord): Record<CostBucketKey, number> {
  const result = {} as Record<CostBucketKey, number>;
  for (const [bucket, categories] of Object.entries(COST_BUCKETS) as [CostBucketKey, readonly string[]][]) {
    let sum = 0;
    for (const cat of categories) {
      const field = r[cat as keyof ItemCostDetailRecord];
      if (field && typeof field === "object" && "실적" in field) {
        sum += (field as { 실적: number }).실적;
      }
    }
    result[bucket] = sum;
  }
  return result;
}

/** 원가 버킷별 상승률을 적용하여 신규 원가 계산 */
function applyRates(
  bucketAmounts: Record<CostBucketKey, number>,
  rates: CostBucketRates
): number {
  let increase = 0;
  for (const bucket of Object.keys(bucketAmounts) as CostBucketKey[]) {
    increase += bucketAmounts[bucket] * (rates[bucket] / 100);
  }
  return increase;
}

// ─── Core Functions ───────────────────────────────────

/**
 * 품목별 단가 인상 시뮬레이션
 * ItemCostDetailRecord를 품목+조직 단위로 집계 후 시나리오 적용
 */
export function calcPricingSimulation(
  data: ItemCostDetailRecord[],
  rates: CostBucketRates = DEFAULT_COST_RATES
): PricingSimItem[] {
  // 품목+조직 단위 집계
  const agg = new Map<string, {
    품목: string;
    조직: string;
    sales: number;
    cost: number;
    buckets: Record<CostBucketKey, number>;
  }>();

  for (const r of data) {
    const key = `${r.품목}||${r.영업조직팀}`;
    const prev = agg.get(key);
    const buckets = calcBucketAmounts(r);

    if (!prev) {
      agg.set(key, {
        품목: r.품목,
        조직: r.영업조직팀,
        sales: r.매출액.실적,
        cost: r.실적매출원가.실적,
        buckets,
      });
    } else {
      prev.sales += r.매출액.실적;
      prev.cost += r.실적매출원가.실적;
      for (const b of Object.keys(buckets) as CostBucketKey[]) {
        prev.buckets[b] += buckets[b];
      }
    }
  }

  const results: PricingSimItem[] = [];

  for (const [, v] of Array.from(agg.entries())) {
    if (v.sales <= 0) continue; // 반제/매출 0 제외

    const currentMargin = safeDivide(v.sales - v.cost, v.sales) * 100;
    const totalBucket = Object.values(v.buckets).reduce((s, a) => s + a, 0);

    const bucketShares = {} as Record<CostBucketKey, number>;
    for (const b of Object.keys(v.buckets) as CostBucketKey[]) {
      bucketShares[b] = totalBucket > 0 ? safeDivide(v.buckets[b], totalBucket) * 100 : 0;
    }

    // 시나리오 적용
    const costIncrease = applyRates(v.buckets, rates);
    const newCost = v.cost + costIncrease;
    const marginRatio = currentMargin / 100;

    let requiredPrice: number;
    let priceIncrease: number;
    if (marginRatio >= 1) {
      // 마진 100% 이상 (비정상) → 인상 불필요
      requiredPrice = v.sales;
      priceIncrease = 0;
    } else if (marginRatio <= 0) {
      // 현재 적자: 마진 유지 개념 무의미 → 원가 증가분만큼 인상 필요
      requiredPrice = v.sales + costIncrease;
      priceIncrease = safeDivide(costIncrease, v.sales) * 100;
    } else {
      requiredPrice = safeDivide(newCost, 1 - marginRatio);
      priceIncrease = safeDivide(requiredPrice - v.sales, v.sales) * 100;
    }

    const marginIfNoIncrease = safeDivide(v.sales - newCost, v.sales) * 100;
    const profitImpact = (v.sales - newCost) - (v.sales - v.cost); // = -costIncrease

    results.push({
      품목: v.품목,
      조직: v.조직,
      currentSales: v.sales,
      currentCost: v.cost,
      currentMargin: isFinite(currentMargin) ? currentMargin : 0,
      bucketAmounts: v.buckets,
      bucketShares,
      scenario: {
        costIncrease: totalBucket > 0 ? safeDivide(costIncrease, v.cost) * 100 : 0,
        newCost,
        requiredPrice: isFinite(requiredPrice) ? requiredPrice : v.sales,
        priceIncrease: isFinite(priceIncrease) ? priceIncrease : 0,
        marginIfNoIncrease: isFinite(marginIfNoIncrease) ? marginIfNoIncrease : 0,
        profitImpact,
      },
    });
  }

  return results.sort((a, b) => b.scenario.priceIncrease - a.scenario.priceIncrease);
}

/**
 * 200 보고서(ItemProfitabilityRecord) 기반 추정 시뮬레이션.
 * 501에 없는 품목만 필터하여 보완용으로 사용.
 * 501과 달리 Actual만 있고 Plan이 없으므로 "추정" 라벨 표시.
 */
export function calcFallbackPricingSimulation(
  itemProfData: Array<{
    품목: string; 영업조직팀: string; 대분류?: string;
    매출액: number; 실적매출원가: number; 매출총이익: number;
    원재료비: number; 부재료비: number; 상품매입: number;
    노무비: number; 복리후생비: number; 제조고정노무비: number;
    수도광열비: number; 전력비: number; 연료비: number; 감가상각비: number;
    외주가공비: number; 운반비: number;
    소모품비: number; 수선비: number; 지급수수료: number; 견본비: number; 기타경비: number;
  }>,
  existingItemKeys: Set<string>, // 501에 이미 있는 품목+조직 키
  rates: CostBucketRates = DEFAULT_COST_RATES
): PricingSimItem[] {
  const agg = new Map<string, {
    품목: string; 조직: string;
    sales: number; cost: number;
    buckets: Record<CostBucketKey, number>;
  }>();

  for (const r of itemProfData) {
    const key = `${r.품목}||${r.영업조직팀}`;
    if (existingItemKeys.has(key)) continue; // 501에 있는 품목 제외

    const buckets: Record<CostBucketKey, number> = {
      재료비: (r.원재료비 || 0) + (r.부재료비 || 0),
      상품매입비: r.상품매입 || 0,
      인건비: (r.노무비 || 0) + (r.복리후생비 || 0) + (r.제조고정노무비 || 0),
      설비비: (r.수도광열비 || 0) + (r.전력비 || 0) + (r.연료비 || 0) + (r.감가상각비 || 0),
      외주비: r.외주가공비 || 0,
      물류비: r.운반비 || 0,
      일반경비: (r.소모품비 || 0) + (r.수선비 || 0) + (r.지급수수료 || 0) + (r.견본비 || 0) + (r.기타경비 || 0),
    };

    const prev = agg.get(key);
    if (!prev) {
      agg.set(key, { 품목: r.품목, 조직: r.영업조직팀, sales: r.매출액, cost: r.실적매출원가, buckets });
    } else {
      prev.sales += r.매출액;
      prev.cost += r.실적매출원가;
      for (const b of Object.keys(buckets) as CostBucketKey[]) prev.buckets[b] += buckets[b];
    }
  }

  const results: PricingSimItem[] = [];
  for (const [, v] of Array.from(agg.entries())) {
    if (v.sales <= 0) continue;
    const currentMargin = safeDivide(v.sales - v.cost, v.sales) * 100;
    const totalBucket = Object.values(v.buckets).reduce((s, a) => s + a, 0);
    const bucketShares = {} as Record<CostBucketKey, number>;
    for (const b of Object.keys(v.buckets) as CostBucketKey[]) {
      bucketShares[b] = totalBucket > 0 ? safeDivide(v.buckets[b], totalBucket) * 100 : 0;
    }
    const costIncrease = applyRates(v.buckets, rates);
    const newCost = v.cost + costIncrease;
    const marginRatio = currentMargin / 100;
    let requiredPrice: number, priceIncrease: number;
    if (marginRatio >= 1) { requiredPrice = v.sales; priceIncrease = 0; }
    else if (marginRatio <= 0) { requiredPrice = v.sales + costIncrease; priceIncrease = safeDivide(costIncrease, v.sales) * 100; }
    else { requiredPrice = safeDivide(newCost, 1 - marginRatio); priceIncrease = safeDivide(requiredPrice - v.sales, v.sales) * 100; }

    results.push({
      품목: v.품목, 조직: v.조직, currentSales: v.sales, currentCost: v.cost,
      currentMargin: isFinite(currentMargin) ? currentMargin : 0,
      bucketAmounts: v.buckets, bucketShares,
      scenario: {
        costIncrease: totalBucket > 0 ? safeDivide(costIncrease, v.cost) * 100 : 0,
        newCost, requiredPrice: isFinite(requiredPrice) ? requiredPrice : v.sales,
        priceIncrease: isFinite(priceIncrease) ? priceIncrease : 0,
        marginIfNoIncrease: isFinite(safeDivide(v.sales - newCost, v.sales) * 100) ? safeDivide(v.sales - newCost, v.sales) * 100 : 0,
        profitImpact: -costIncrease,
      },
    });
  }
  return results.sort((a, b) => b.scenario.priceIncrease - a.scenario.priceIncrease);
}

/**
 * 시뮬레이션 요약 KPI
 */
export function calcPricingSummary(items: PricingSimItem[]): PricingSimSummary {
  if (items.length === 0) {
    return { totalItems: 0, avgPriceIncrease: 0, maxPriceIncrease: 0, highImpactCount: 0, totalProfitLoss: 0, avgMaterialShare: 0 };
  }

  const totalSales = items.reduce((s, it) => s + it.currentSales, 0);
  const weightedIncrease = items.reduce((s, it) => s + it.scenario.priceIncrease * it.currentSales, 0);
  const avgPriceIncrease = totalSales > 0 ? safeDivide(weightedIncrease, totalSales) : 0;
  const maxPriceIncrease = Math.max(...items.map(it => it.scenario.priceIncrease));
  const highImpactCount = items.filter(it => it.scenario.priceIncrease > 10).length;
  const totalProfitLoss = items.reduce((s, it) => s + it.scenario.profitImpact, 0);

  const totalCost = items.reduce((s, it) => s + it.currentCost, 0);
  const totalMaterial = items.reduce((s, it) => s + it.bucketAmounts["재료비"], 0);
  const avgMaterialShare = totalCost > 0 ? safeDivide(totalMaterial, totalCost) * 100 : 0;

  return {
    totalItems: items.length,
    avgPriceIncrease: isFinite(avgPriceIncrease) ? avgPriceIncrease : 0,
    maxPriceIncrease: isFinite(maxPriceIncrease) ? maxPriceIncrease : 0,
    highImpactCount,
    totalProfitLoss,
    avgMaterialShare: isFinite(avgMaterialShare) ? avgMaterialShare : 0,
  };
}

/**
 * 대분류별 가격 인상 요약
 * ItemProfitabilityRecord에서 대분류 매핑을 가져와 사용
 */
export function calcCategoryPricing(
  items: PricingSimItem[],
  categoryMap?: Map<string, string> // 품목 → 대분류
): CategoryPricingSummary[] {
  const map = new Map<string, { count: number; totalSales: number; weightedIncrease: number; totalLoss: number }>();

  for (const it of items) {
    const cat = categoryMap?.get(it.품목) || "미분류";
    const prev = map.get(cat) || { count: 0, totalSales: 0, weightedIncrease: 0, totalLoss: 0 };
    prev.count++;
    prev.totalSales += it.currentSales;
    prev.weightedIncrease += it.scenario.priceIncrease * it.currentSales;
    prev.totalLoss += it.scenario.profitImpact;
    map.set(cat, prev);
  }

  return Array.from(map.entries())
    .map(([category, v]) => ({
      category,
      itemCount: v.count,
      avgPriceIncrease: v.totalSales > 0 ? safeDivide(v.weightedIncrease, v.totalSales) : 0,
      totalSales: v.totalSales,
      totalProfitLoss: v.totalLoss,
    }))
    .sort((a, b) => b.avgPriceIncrease - a.avgPriceIncrease);
}

/**
 * 거래처별 단가 인상 영향 분석
 * CustomerItemDetailRecord(100)에서 거래처×품목 조합의 매출/원가를 사용
 */
export function calcCustomerPricingImpact(
  custData: ProfitabilityAnalysisRecord[],
  rates: CostBucketRates,
  itemBucketMap: Map<string, Record<CostBucketKey, number>> // 품목 → 버킷 금액 (itemCostDetail 기반)
): CustomerPricingImpact[] {
  // 거래처별 집계
  const map = new Map<string, {
    org: string;
    items: Set<string>;
    totalSales: number;
    totalGP: number;
    totalCost: number;
    totalCostIncrease: number;
  }>();

  for (const r of custData) {
    const customer = r.매출거래처 || "";
    if (!customer || r.매출액.실적 <= 0) continue;

    const prev = map.get(customer) || {
      org: r.영업조직팀,
      items: new Set(),
      totalSales: 0,
      totalGP: 0,
      totalCost: 0,
      totalCostIncrease: 0,
    };

    prev.items.add(r.품목);
    prev.totalSales += r.매출액.실적;
    prev.totalGP += r.매출총이익.실적;
    prev.totalCost += r.매출액.실적 - r.매출총이익.실적;

    // 해당 품목의 버킷 비중으로 원가 상승 추정
    const buckets = itemBucketMap.get(r.품목);
    if (buckets) {
      const itemCost = r.매출액.실적 - r.매출총이익.실적;
      const totalBucketAmt = Object.values(buckets).reduce((s, v) => s + v, 0);
      if (totalBucketAmt > 0) {
        // 품목의 버킷 비중을 이 거래처의 원가에 적용
        let increase = 0;
        for (const b of Object.keys(buckets) as CostBucketKey[]) {
          const share = safeDivide(buckets[b], totalBucketAmt);
          increase += itemCost * share * (rates[b] / 100);
        }
        prev.totalCostIncrease += increase;
      }
    }

    if (!prev.org && r.영업조직팀) prev.org = r.영업조직팀;
    map.set(customer, prev);
  }

  return Array.from(map.entries())
    .map(([customer, v]) => {
      const currentMargin = safeDivide(v.totalGP, v.totalSales);
      const newCost = v.totalCost + v.totalCostIncrease;
      const requiredSales = currentMargin < 1 ? safeDivide(newCost, 1 - currentMargin) : v.totalSales;
      const priceIncrease = safeDivide(requiredSales - v.totalSales, v.totalSales) * 100;

      return {
        customer,
        org: v.org,
        itemCount: v.items.size,
        totalSales: v.totalSales,
        avgPriceIncrease: isFinite(priceIncrease) ? priceIncrease : 0,
        totalPriceImpact: isFinite(requiredSales) ? requiredSales - v.totalSales : 0,
        avgMargin: isFinite(currentMargin) ? currentMargin * 100 : 0,
      };
    })
    .filter(c => c.totalSales > 0)
    .sort((a, b) => b.totalSales - a.totalSales);
}
