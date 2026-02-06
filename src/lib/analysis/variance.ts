import type { ProfitabilityAnalysisRecord } from "@/types";

/**
 * SAP CO-PA style 3-way Variance Analysis (3-way 분산분석)
 *
 * Decomposes total sales variance into three components:
 * - Price Variance (가격차이) = (실적단가 - 계획단가) x 실적수량
 * - Volume Variance (수량차이) = (실적수량 - 계획수량) x 계획단가
 * - Mix Variance (믹스차이) = 총차이 - 가격차이 - 수량차이
 *   where 총차이 = 매출액.실적 - 매출액.계획
 */

export interface VarianceItem {
  org: string;
  customer: string;
  product: string;
  planQty: number;
  actualQty: number;
  planAmount: number;
  actualAmount: number;
  planPrice: number; // 계획단가
  actualPrice: number; // 실적단가
  totalVariance: number;
  priceVariance: number;
  volumeVariance: number;
  mixVariance: number;
}

export interface VarianceSummary {
  totalVariance: number;
  priceVariance: number;
  volumeVariance: number;
  mixVariance: number;
  itemCount: number;
}

/** Org-level aggregation for waterfall chart */
export interface OrgVarianceSummary {
  org: string;
  totalVariance: number;
  priceVariance: number;
  volumeVariance: number;
  mixVariance: number;
}

/**
 * Calculate 3-way variance analysis per record.
 * Filters out rows where both plan qty and actual qty are 0.
 * Handles division by zero: qty=0 -> price=0.
 */
export function calcVarianceAnalysis(
  data: ProfitabilityAnalysisRecord[]
): VarianceItem[] {
  const items: VarianceItem[] = [];

  for (const r of data) {
    const planQty = r.매출수량.계획;
    const actualQty = r.매출수량.실적;

    // Skip rows where both plan and actual quantities are zero
    if (planQty === 0 && actualQty === 0) continue;

    const planAmount = r.매출액.계획;
    const actualAmount = r.매출액.실적;

    // Unit price: handle division by zero (qty=0 -> price=0)
    const planPrice = planQty !== 0 ? planAmount / planQty : 0;
    const actualPrice = actualQty !== 0 ? actualAmount / actualQty : 0;

    // Total variance
    const totalVariance = actualAmount - planAmount;

    // Price Variance = (실적단가 - 계획단가) x 실적수량
    const priceVariance = (actualPrice - planPrice) * actualQty;

    // Volume Variance = (실적수량 - 계획수량) x 계획단가
    const volumeVariance = (actualQty - planQty) * planPrice;

    // Mix Variance = 총차이 - 가격차이 - 수량차이 (residual)
    const mixVariance = totalVariance - priceVariance - volumeVariance;

    items.push({
      org: r.영업조직팀,
      customer: r.매출거래처,
      product: r.품목,
      planQty,
      actualQty,
      planAmount,
      actualAmount,
      planPrice,
      actualPrice,
      totalVariance,
      priceVariance,
      volumeVariance,
      mixVariance,
    });
  }

  return items;
}

/**
 * Sum all variance components across items.
 */
export function calcVarianceSummary(items: VarianceItem[]): VarianceSummary {
  let totalVariance = 0;
  let priceVariance = 0;
  let volumeVariance = 0;
  let mixVariance = 0;

  for (const item of items) {
    totalVariance += item.totalVariance;
    priceVariance += item.priceVariance;
    volumeVariance += item.volumeVariance;
    mixVariance += item.mixVariance;
  }

  return {
    totalVariance,
    priceVariance,
    volumeVariance,
    mixVariance,
    itemCount: items.length,
  };
}

/**
 * Group variance items by org and sum variances per org.
 * Sorted by absolute totalVariance descending.
 */
export function calcOrgVarianceSummaries(
  items: VarianceItem[]
): OrgVarianceSummary[] {
  const map = new Map<
    string,
    {
      totalVariance: number;
      priceVariance: number;
      volumeVariance: number;
      mixVariance: number;
    }
  >();

  for (const item of items) {
    const org = item.org;
    if (!org) continue;

    const entry = map.get(org) || {
      totalVariance: 0,
      priceVariance: 0,
      volumeVariance: 0,
      mixVariance: 0,
    };

    entry.totalVariance += item.totalVariance;
    entry.priceVariance += item.priceVariance;
    entry.volumeVariance += item.volumeVariance;
    entry.mixVariance += item.mixVariance;

    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, v]) => ({
      org,
      totalVariance: v.totalVariance,
      priceVariance: v.priceVariance,
      volumeVariance: v.volumeVariance,
      mixVariance: v.mixVariance,
    }))
    .sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));
}
