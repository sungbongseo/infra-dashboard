import type {
  ItemCostDetailRecord, CostCategoryKey, CostBucketKey,
  ItemVarianceEntry, ItemCostProfile, ItemCostProfileType,
  CostProfileDistribution, UnitCostEntry, CostDriverEntry,
} from "@/types";
import { COST_CATEGORIES, COST_CATEGORIES_WITH_SUBTOTAL, COST_BUCKETS } from "@/types";

// ── Types ──────────────────────────────────────────────────────

export interface ItemCostSummary {
  productCount: number;
  totalSales: number;
  totalCost: number;
  avgGrossMargin: number;
  avgContributionRate: number;
  topCostCategory: string;
  topCostAmount: number;
  topCostRatio: number;
}

export interface CostCategoryVariance {
  category: string;
  plan: number;
  actual: number;
  variance: number;
  variancePct: number;
  isOverBudget: boolean;
  isSubtotal: boolean;
  contributionToTotal: number;
}

export interface CostVarianceSummary {
  categories: CostCategoryVariance[];
  totalPlanCost: number;
  totalActualCost: number;
  totalVariance: number;
  totalVariancePct: number;
  overBudgetCount: number;
}

export interface ProductContribution {
  rank: number;
  product: string;
  org: string;
  sales: number;
  variableCost: number;
  fixedCost: number;
  contributionMargin: number;
  contributionRate: number;
  grossProfit: number;
  grossMargin: number;
  cumSalesShare: number;
  grade: "A" | "B" | "C";
}

export interface TeamCostEfficiency {
  team: string;
  totalSales: number;
  totalCost: number;
  costRate: number;
  grossMargin: number;
  contributionRate: number;
  productCount: number;
  materialRatio: number;
  purchaseRatio: number;
  laborRatio: number;
  facilityRatio: number;
  outsourceRatio: number;
  logisticsRatio: number;
  generalRatio: number;
}

export interface WaterfallItem {
  name: string;
  base: number;
  value: number;
  fill: string;
  type: "start" | "decrease" | "subtotal";
}

export interface CostBucketItem {
  name: string;
  amount: number;
  ratio: number;
}

// ── Variable cost categories (14) ──
const VARIABLE_COST_KEYS: CostCategoryKey[] = [
  "원재료비", "부재료비", "상품매입", "노무비", "복리후생비",
  "소모품비", "수도광열비", "수선비", "연료비", "외주가공비",
  "운반비", "전력비", "지급수수료", "견본비",
];

// ── Fixed cost categories (3) ──
const FIXED_COST_KEYS: CostCategoryKey[] = [
  "제조고정노무비", "감가상각비", "기타경비",
];

// ── Helpers ─────────────────────────────────────────────────────

function sumCostActual(r: ItemCostDetailRecord, keys: CostCategoryKey[]): number {
  return keys.reduce((s, k) => s + ((r[k] as any)?.실적 ?? 0), 0);
}

function sumCostPlan(r: ItemCostDetailRecord, keys: CostCategoryKey[]): number {
  return keys.reduce((s, k) => s + ((r[k] as any)?.계획 ?? 0), 0);
}

// ── Function 1: calcItemCostSummary ─────────────────────────────
// BUG-2 FIX: uses COST_CATEGORIES (17개, 소계 제외) → topCostCategory가 실제 항목

export function calcItemCostSummary(data: ItemCostDetailRecord[]): ItemCostSummary {
  if (data.length === 0) {
    return {
      productCount: 0, totalSales: 0, totalCost: 0,
      avgGrossMargin: 0, avgContributionRate: 0,
      topCostCategory: "-", topCostAmount: 0, topCostRatio: 0,
    };
  }

  const products = new Set(data.map((r) => r.품목));
  const totalSales = data.reduce((s, r) => s + r.매출액.실적, 0);
  const totalCost = data.reduce((s, r) => s + r.실적매출원가.실적, 0);
  const totalGP = data.reduce((s, r) => s + r.매출총이익.실적, 0);
  const totalVariable = data.reduce((s, r) => s + sumCostActual(r, VARIABLE_COST_KEYS), 0);
  const totalContrib = totalSales - totalVariable;

  // Find top cost category — COST_CATEGORIES (17개, 소계 제외)
  const catTotals = new Map<string, number>();
  for (const cat of COST_CATEGORIES) {
    const amt = data.reduce((s, r) => s + ((r[cat] as any)?.실적 ?? 0), 0);
    catTotals.set(cat, amt);
  }
  let topCat: string = COST_CATEGORIES[0];
  let topAmt = 0;
  for (const [cat, amt] of Array.from(catTotals.entries())) {
    if (amt > topAmt) {
      topCat = cat;
      topAmt = amt;
    }
  }

  return {
    productCount: products.size,
    totalSales,
    totalCost,
    avgGrossMargin: totalSales > 0 ? (totalGP / totalSales) * 100 : 0,
    avgContributionRate: totalSales > 0 ? (totalContrib / totalSales) * 100 : 0,
    topCostCategory: topCat,
    topCostAmount: topAmt,
    topCostRatio: totalCost > 0 ? (topAmt / totalCost) * 100 : 0,
  };
}

// ── Function 2: calcCostCategoryVariance ────────────────────────
// BUG-1 FIX: total 합산에서 소계(제조변동비소계) 제외. 디스플레이는 18개 유지.

export function calcCostCategoryVariance(data: ItemCostDetailRecord[]): CostVarianceSummary {
  if (data.length === 0) {
    return {
      categories: [], totalPlanCost: 0, totalActualCost: 0,
      totalVariance: 0, totalVariancePct: 0, overBudgetCount: 0,
    };
  }

  // 디스플레이: 18개 (소계 포함) — isSubtotal 플래그로 구분
  const categories: CostCategoryVariance[] = COST_CATEGORIES_WITH_SUBTOTAL.map((cat) => {
    const plan = data.reduce((s, r) => s + ((r[cat] as any)?.계획 ?? 0), 0);
    const actual = data.reduce((s, r) => s + ((r[cat] as any)?.실적 ?? 0), 0);
    const variance = actual - plan;
    return {
      category: cat,
      plan,
      actual,
      variance,
      variancePct: plan !== 0 ? (variance / Math.abs(plan)) * 100 : 0,
      isOverBudget: actual > plan,
      isSubtotal: cat === "제조변동비소계" || cat === "제조고정비소계",
      contributionToTotal: 0, // filled after total calc
    };
  });

  // Sort by |variance| descending
  categories.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  // BUG-1 FIX: total은 소계(제조변동비소계) 제외한 17개만 합산
  const nonSubtotal = categories.filter((c) => !c.isSubtotal);
  const totalPlanCost = nonSubtotal.reduce((s, c) => s + c.plan, 0);
  const totalActualCost = nonSubtotal.reduce((s, c) => s + c.actual, 0);
  const totalVariance = totalActualCost - totalPlanCost;

  // Fill contributionToTotal
  for (const c of categories) {
    c.contributionToTotal = totalVariance !== 0
      ? (c.variance / Math.abs(totalVariance)) * 100
      : 0;
  }

  return {
    categories,
    totalPlanCost,
    totalActualCost,
    totalVariance,
    totalVariancePct: totalPlanCost !== 0 ? (totalVariance / Math.abs(totalPlanCost)) * 100 : 0,
    overBudgetCount: nonSubtotal.filter((c) => c.isOverBudget).length,
  };
}

// ── Function 3: calcProductContributionRanking ──────────────────

export function calcProductContributionRanking(data: ItemCostDetailRecord[]): ProductContribution[] {
  if (data.length === 0) return [];

  const map = new Map<string, {
    product: string; org: string;
    sales: number; variable: number; fixed: number; gp: number;
  }>();

  for (const r of data) {
    const key = `${r.영업조직팀}__${r.품목}`;
    const entry = map.get(key) || {
      product: r.품목, org: r.영업조직팀,
      sales: 0, variable: 0, fixed: 0, gp: 0,
    };
    entry.sales += r.매출액.실적;
    entry.variable += sumCostActual(r, VARIABLE_COST_KEYS);
    entry.fixed += sumCostActual(r, FIXED_COST_KEYS);
    entry.gp += r.매출총이익.실적;
    map.set(key, entry);
  }

  const allItems = Array.from(map.values())
    .map((e) => ({
      ...e,
      contributionMargin: e.sales - e.variable,
      contributionRate: e.sales !== 0 ? ((e.sales - e.variable) / e.sales) * 100 : 0,
      grossMargin: e.sales !== 0 ? (e.gp / e.sales) * 100 : 0,
    }));

  // ── 복합 ABC: 공헌이익 기반 파레토 + 이익률 페널티 ──
  // 기준 1: 공헌이익 금액 기준 파레토 (매출이 아닌 실제 수익 기여도)
  // 기준 2: 공헌이익률 < 15% → 한 등급 하향 (A→B, B→C)
  // 강제 C: 공헌이익 ≤ 0 또는 매출 ≤ 0

  const positiveItems = allItems
    .filter((i) => i.sales > 0 && i.contributionMargin > 0)
    .sort((a, b) => b.contributionMargin - a.contributionMargin);
  const negativeItems = allItems
    .filter((i) => i.sales <= 0 || i.contributionMargin <= 0)
    .sort((a, b) => a.contributionMargin - b.contributionMargin);

  const positiveTotal = positiveItems.reduce((s, i) => s + i.contributionMargin, 0);
  let cumContrib = 0;
  const result: ProductContribution[] = [];

  for (let idx = 0; idx < positiveItems.length; idx++) {
    const item = positiveItems[idx];
    cumContrib += item.contributionMargin;
    const cumShare = positiveTotal > 0 ? (cumContrib / positiveTotal) * 100 : 0;

    // 기준 1: 공헌이익 파레토 등급
    let grade: "A" | "B" | "C" = cumShare <= 80 ? "A" : cumShare <= 95 ? "B" : "C";

    // 기준 2: 이익률 페널티 — 공헌이익률 < 15%면 한 등급 하향
    if (item.contributionRate < 15) {
      if (grade === "A") grade = "B";
      else if (grade === "B") grade = "C";
    }

    result.push({
      rank: idx + 1,
      product: item.product, org: item.org,
      sales: item.sales, variableCost: item.variable, fixedCost: item.fixed,
      contributionMargin: item.contributionMargin, contributionRate: item.contributionRate,
      grossProfit: item.gp, grossMargin: item.grossMargin,
      cumSalesShare: cumShare,
      grade,
    });
  }

  // 공헌이익 ≤ 0 또는 매출 ≤ 0: 무조건 C등급
  for (let idx = 0; idx < negativeItems.length; idx++) {
    const item = negativeItems[idx];
    result.push({
      rank: positiveItems.length + idx + 1,
      product: item.product, org: item.org,
      sales: item.sales, variableCost: item.variable, fixedCost: item.fixed,
      contributionMargin: item.contributionMargin, contributionRate: item.contributionRate,
      grossProfit: item.gp, grossMargin: item.grossMargin,
      cumSalesShare: 100,
      grade: "C" as const,
    });
  }

  return result;
}

// ── Function 4: calcTeamCostEfficiency ──────────────────────────

export function calcTeamCostEfficiency(data: ItemCostDetailRecord[]): TeamCostEfficiency[] {
  if (data.length === 0) return [];

  const teamMap = new Map<string, {
    sales: number; cost: number; gp: number; variable: number; products: Set<string>;
    buckets: Record<CostBucketKey, number>;
  }>();

  const bucketKeys = Object.keys(COST_BUCKETS) as CostBucketKey[];

  for (const r of data) {
    const team = r.영업조직팀;
    const entry = teamMap.get(team) || {
      sales: 0, cost: 0, gp: 0, variable: 0, products: new Set<string>(),
      buckets: Object.fromEntries(bucketKeys.map((k) => [k, 0])) as Record<CostBucketKey, number>,
    };
    entry.sales += r.매출액.실적;
    entry.cost += r.실적매출원가.실적;
    entry.gp += r.매출총이익.실적;
    entry.variable += sumCostActual(r, VARIABLE_COST_KEYS);
    entry.products.add(r.품목);

    for (const bk of bucketKeys) {
      const cats = COST_BUCKETS[bk] as readonly string[];
      for (const cat of cats) {
        entry.buckets[bk] += (r[cat as keyof ItemCostDetailRecord] as any)?.실적 ?? 0;
      }
    }
    teamMap.set(team, entry);
  }

  return Array.from(teamMap.entries())
    .map(([team, e]) => {
      const totalBucket = bucketKeys.reduce((s, k) => s + e.buckets[k], 0);
      const r = (v: number) => (totalBucket > 0 ? (v / totalBucket) * 100 : 0);
      const contrib = e.sales - e.variable;
      return {
        team,
        totalSales: e.sales,
        totalCost: e.cost,
        costRate: e.sales !== 0 ? (e.cost / e.sales) * 100 : 0,
        grossMargin: e.sales !== 0 ? (e.gp / e.sales) * 100 : 0,
        contributionRate: e.sales !== 0 ? (contrib / e.sales) * 100 : 0,
        productCount: e.products.size,
        materialRatio: r(e.buckets["재료비"]),
        purchaseRatio: r(e.buckets["상품매입비"]),
        laborRatio: r(e.buckets["인건비"]),
        facilityRatio: r(e.buckets["설비비"]),
        outsourceRatio: r(e.buckets["외주비"]),
        logisticsRatio: r(e.buckets["물류비"]),
        generalRatio: r(e.buckets["일반경비"]),
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

// ── Function 5: calcContributionWaterfall ────────────────────────

const WATERFALL_COLORS = {
  revenue: "hsl(210, 70%, 50%)",
  cost: "hsl(0, 65%, 55%)",
  subtotalPositive: "hsl(145, 60%, 42%)",
  subtotalNegative: "hsl(0, 65%, 55%)",
  fixed: "hsl(35, 70%, 50%)",
};

export function calcContributionWaterfall(data: ItemCostDetailRecord[]): WaterfallItem[] {
  if (data.length === 0) return [];

  const totalSales = data.reduce((s, r) => s + r.매출액.실적, 0);
  const totalVariable = data.reduce((s, r) => s + sumCostActual(r, VARIABLE_COST_KEYS), 0);
  const contribMargin = totalSales - totalVariable;
  const totalFixed = data.reduce((s, r) => s + sumCostActual(r, FIXED_COST_KEYS), 0);
  const grossProfit = data.reduce((s, r) => s + r.매출총이익.실적, 0);

  return [
    {
      name: "매출액",
      base: Math.min(0, totalSales),
      value: Math.abs(totalSales),
      fill: WATERFALL_COLORS.revenue,
      type: "start",
    },
    {
      name: "변동비",
      base: Math.min(totalSales, contribMargin),
      value: Math.abs(totalVariable),
      fill: WATERFALL_COLORS.cost,
      type: "decrease",
    },
    {
      name: "공헌이익",
      base: Math.min(0, contribMargin),
      value: Math.abs(contribMargin),
      fill: contribMargin >= 0 ? WATERFALL_COLORS.subtotalPositive : WATERFALL_COLORS.subtotalNegative,
      type: "subtotal",
    },
    {
      name: "고정비",
      base: Math.min(contribMargin, grossProfit),
      value: Math.abs(totalFixed),
      fill: WATERFALL_COLORS.fixed,
      type: "decrease",
    },
    {
      name: "매출총이익",
      base: Math.min(0, grossProfit),
      value: Math.abs(grossProfit),
      fill: grossProfit >= 0 ? WATERFALL_COLORS.subtotalPositive : WATERFALL_COLORS.subtotalNegative,
      type: "subtotal",
    },
  ];
}

// ── Function 6: calcCostBucketBreakdown ─────────────────────────

export function calcCostBucketBreakdown(data: ItemCostDetailRecord[]): CostBucketItem[] {
  if (data.length === 0) return [];

  const bucketKeys = Object.keys(COST_BUCKETS) as CostBucketKey[];
  const bucketAmounts: CostBucketItem[] = [];

  for (const bk of bucketKeys) {
    const cats = COST_BUCKETS[bk] as readonly string[];
    let amount = 0;
    for (const r of data) {
      for (const cat of cats) {
        amount += (r[cat as keyof ItemCostDetailRecord] as any)?.실적 ?? 0;
      }
    }
    bucketAmounts.push({ name: bk, amount, ratio: 0 });
  }

  const totalAmount = bucketAmounts.reduce((s, b) => s + b.amount, 0);
  for (const b of bucketAmounts) {
    b.ratio = totalAmount > 0 ? (b.amount / totalAmount) * 100 : 0;
  }

  return bucketAmounts.sort((a, b) => b.amount - a.amount);
}

// ── NEW-1: calcItemVarianceRanking ──────────────────────────────
// 품목별 원가 차이 랭킹: 어떤 품목이 예산을 가장 크게 초과/절감했는지

export function calcItemVarianceRanking(data: ItemCostDetailRecord[], topN = 15): ItemVarianceEntry[] {
  if (data.length === 0) return [];

  const map = new Map<string, {
    product: string; org: string;
    planCost: number; actualCost: number;
    planSales: number; actualSales: number;
  }>();

  for (const r of data) {
    const key = `${r.영업조직팀}__${r.품목}`;
    const entry = map.get(key) || {
      product: r.품목, org: r.영업조직팀,
      planCost: 0, actualCost: 0, planSales: 0, actualSales: 0,
    };
    entry.planCost += sumCostPlan(r, [...VARIABLE_COST_KEYS, ...FIXED_COST_KEYS]);
    entry.actualCost += sumCostActual(r, [...VARIABLE_COST_KEYS, ...FIXED_COST_KEYS]);
    entry.planSales += r.매출액.계획;
    entry.actualSales += r.매출액.실적;
    map.set(key, entry);
  }

  return Array.from(map.values())
    .map((e) => {
      const variance = e.actualCost - e.planCost;
      const planMargin = e.planSales > 0 ? ((e.planSales - e.planCost) / e.planSales) * 100 : 0;
      const actualMargin = e.actualSales > 0 ? ((e.actualSales - e.actualCost) / e.actualSales) * 100 : 0;
      return {
        product: e.product,
        org: e.org,
        planCost: e.planCost,
        actualCost: e.actualCost,
        variance,
        variancePct: e.planCost !== 0 ? (variance / Math.abs(e.planCost)) * 100 : 0,
        marginDrift: actualMargin - planMargin,
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, topN);
}

// ── NEW-2: calcItemCostProfile ──────────────────────────────────
// 품목별 원가구조 프로파일 분류

export function calcItemCostProfile(data: ItemCostDetailRecord[]): {
  items: ItemCostProfile[];
  distribution: CostProfileDistribution[];
} {
  if (data.length === 0) return { items: [], distribution: [] };

  const bucketKeys = Object.keys(COST_BUCKETS) as CostBucketKey[];

  // Aggregate by product + org
  const map = new Map<string, {
    product: string; org: string; sales: number; totalCost: number;
    buckets: Record<CostBucketKey, number>;
  }>();

  for (const r of data) {
    const key = `${r.영업조직팀}__${r.품목}`;
    const entry = map.get(key) || {
      product: r.품목, org: r.영업조직팀, sales: 0, totalCost: 0,
      buckets: Object.fromEntries(bucketKeys.map((k) => [k, 0])) as Record<CostBucketKey, number>,
    };
    entry.sales += r.매출액.실적;
    entry.totalCost += r.실적매출원가.실적;
    for (const bk of bucketKeys) {
      const cats = COST_BUCKETS[bk] as readonly string[];
      for (const cat of cats) {
        entry.buckets[bk] += (r[cat as keyof ItemCostDetailRecord] as any)?.실적 ?? 0;
      }
    }
    map.set(key, entry);
  }

  const items: ItemCostProfile[] = Array.from(map.values()).map((e) => {
    const totalBucket = bucketKeys.reduce((s, k) => s + e.buckets[k], 0);

    // Find dominant bucket
    let dominantBucket: CostBucketKey = "재료비";
    let dominantAmt = 0;
    for (const bk of bucketKeys) {
      if (e.buckets[bk] > dominantAmt) {
        dominantBucket = bk;
        dominantAmt = e.buckets[bk];
      }
    }
    const dominantRatio = totalBucket > 0 ? (dominantAmt / totalBucket) * 100 : 0;

    // Classify profile type
    let profileType: ItemCostProfileType = "혼합형";
    const matRatio = totalBucket > 0 ? (e.buckets["재료비"] / totalBucket) * 100 : 0;
    const purchRatio = totalBucket > 0 ? (e.buckets["상품매입비"] / totalBucket) * 100 : 0;
    const outsRatio = totalBucket > 0 ? (e.buckets["외주비"] / totalBucket) * 100 : 0;
    const laborRatio = totalBucket > 0 ? (e.buckets["인건비"] / totalBucket) * 100 : 0;
    const facRatio = totalBucket > 0 ? (e.buckets["설비비"] / totalBucket) * 100 : 0;

    if (purchRatio >= 50) profileType = "구매직납형";
    else if (matRatio >= 40) profileType = "자체생산형";
    else if (outsRatio >= 35) profileType = "외주의존형";
    else if (laborRatio >= 35) profileType = "인건비집중형";
    else if (facRatio >= 30) profileType = "설비집중형";

    return {
      product: e.product,
      org: e.org,
      profileType,
      dominantBucket,
      dominantRatio,
      sales: e.sales,
      totalCost: e.totalCost,
    };
  });

  // Distribution
  const distMap = new Map<ItemCostProfileType, { count: number; totalSales: number; totalCost: number }>();
  for (const item of items) {
    const entry = distMap.get(item.profileType) || { count: 0, totalSales: 0, totalCost: 0 };
    entry.count++;
    entry.totalSales += item.sales;
    entry.totalCost += item.totalCost;
    distMap.set(item.profileType, entry);
  }

  const distribution: CostProfileDistribution[] = Array.from(distMap.entries())
    .map(([type, e]) => ({
      type,
      count: e.count,
      totalSales: e.totalSales,
      avgCostRate: e.totalSales > 0 ? (e.totalCost / e.totalSales) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return { items, distribution };
}

// ── NEW-3: calcUnitCostAnalysis ─────────────────────────────────
// 품목별 단가 분석

export function calcUnitCostAnalysis(data: ItemCostDetailRecord[], topN = 30): UnitCostEntry[] {
  if (data.length === 0) return [];

  const map = new Map<string, {
    product: string; org: string;
    planSales: number; actualSales: number;
    planCost: number; actualCost: number;
    planQty: number; actualQty: number;
  }>();

  for (const r of data) {
    const key = `${r.영업조직팀}__${r.품목}`;
    const entry = map.get(key) || {
      product: r.품목, org: r.영업조직팀,
      planSales: 0, actualSales: 0, planCost: 0, actualCost: 0,
      planQty: 0, actualQty: 0,
    };
    entry.planSales += r.매출액.계획;
    entry.actualSales += r.매출액.실적;
    entry.planCost += sumCostPlan(r, [...VARIABLE_COST_KEYS, ...FIXED_COST_KEYS]);
    entry.actualCost += sumCostActual(r, [...VARIABLE_COST_KEYS, ...FIXED_COST_KEYS]);
    entry.planQty += r.매출수량.계획;
    entry.actualQty += r.매출수량.실적;
    map.set(key, entry);
  }

  return Array.from(map.values())
    .filter((e) => e.actualQty > 0) // skip zero-quantity
    .map((e) => {
      const planUnitPrice = e.planQty > 0 ? e.planSales / e.planQty : 0;
      const actualUnitPrice = e.actualQty > 0 ? e.actualSales / e.actualQty : 0;
      const planUnitCost = e.planQty > 0 ? e.planCost / e.planQty : 0;
      const actualUnitCost = e.actualQty > 0 ? e.actualCost / e.actualQty : 0;
      const planUnitContrib = planUnitPrice - planUnitCost;
      const actualUnitContrib = actualUnitPrice - actualUnitCost;

      return {
        product: e.product,
        org: e.org,
        planUnitPrice,
        actualUnitPrice,
        planUnitCost,
        actualUnitCost,
        planUnitContrib,
        actualUnitContrib,
        priceDrift: planUnitPrice !== 0 ? ((actualUnitPrice - planUnitPrice) / Math.abs(planUnitPrice)) * 100 : 0,
        costDrift: planUnitCost !== 0 ? ((actualUnitCost - planUnitCost) / Math.abs(planUnitCost)) * 100 : 0,
        quantity: e.actualQty,
      };
    })
    .sort((a, b) => Math.abs(b.actualUnitContrib * b.quantity) - Math.abs(a.actualUnitContrib * a.quantity))
    .slice(0, topN);
}

// ── NEW-4: calcCostDriverAnalysis ───────────────────────────────
// 원가 드라이버 분석: 비중 × |변동률| 복합지표

export function calcCostDriverAnalysis(data: ItemCostDetailRecord[]): CostDriverEntry[] {
  if (data.length === 0) return [];

  // 17개 독립항목만 사용 (소계 제외)
  const catData = COST_CATEGORIES.map((cat) => {
    const plan = data.reduce((s, r) => s + ((r[cat] as any)?.계획 ?? 0), 0);
    const actual = data.reduce((s, r) => s + ((r[cat] as any)?.실적 ?? 0), 0);
    return { category: cat, plan, actual };
  });

  const totalActual = catData.reduce((s, c) => s + c.actual, 0);

  return catData
    .map((c) => {
      const costShare = totalActual > 0 ? (c.actual / totalActual) * 100 : 0;
      const variancePct = c.plan !== 0 ? ((c.actual - c.plan) / Math.abs(c.plan)) * 100 : 0;
      const impactScore = (costShare * Math.abs(variancePct)) / 100;
      const direction: "increase" | "decrease" | "neutral" =
        c.actual > c.plan ? "increase" : c.actual < c.plan ? "decrease" : "neutral";

      return {
        category: c.category,
        costShare,
        variancePct,
        impactScore,
        direction,
        plan: c.plan,
        actual: c.actual,
      };
    })
    .sort((a, b) => b.impactScore - a.impactScore);
}
