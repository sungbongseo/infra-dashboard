import { SalesRecord } from "@/types/sales";
import { extractMonth } from "@/lib/utils";

// 결제조건별 매출 분포
export interface PaymentTermSales {
  term: string;
  amount: number;
  count: number;
  share: number;
}

export function calcSalesByPaymentTerm(
  sales: SalesRecord[]
): PaymentTermSales[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const row of sales) {
    const term = (row.결제조건 || "미분류").trim() || "미분류";
    const amount = row.판매금액 || 0;
    const existing = map.get(term);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(term, { amount, count: 1 });
    }
  }

  const totalAmount = Array.from(map.values()).reduce(
    (sum, v) => sum + v.amount,
    0
  );

  const results: PaymentTermSales[] = Array.from(map.entries()).map(
    ([term, data]) => ({
      term,
      amount: data.amount,
      count: data.count,
      share: totalAmount !== 0 ? (data.amount / totalAmount) * 100 : 0,
    })
  );

  results.sort((a, b) => b.amount - a.amount);
  return results;
}

// 유통경로별 매출
export interface ChannelSales {
  channel: string;
  amount: number;
  count: number;
  share: number;
}

export function calcSalesByChannel(sales: SalesRecord[]): ChannelSales[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const row of sales) {
    const channel = (row.유통경로 || "미분류").trim() || "미분류";
    const amount = row.판매금액 || 0;
    const existing = map.get(channel);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(channel, { amount, count: 1 });
    }
  }

  const totalAmount = Array.from(map.values()).reduce(
    (sum, v) => sum + v.amount,
    0
  );

  const results: ChannelSales[] = Array.from(map.entries()).map(
    ([channel, data]) => ({
      channel,
      amount: data.amount,
      count: data.count,
      share: totalAmount !== 0 ? (data.amount / totalAmount) * 100 : 0,
    })
  );

  results.sort((a, b) => b.amount - a.amount);
  return results;
}

// 거래처소분류별 매출 (유통경로 대체)
export interface CustomerCategorySales {
  category: string;
  amount: number;
  count: number;
  share: number;
}

export function calcSalesByCustomerCategory(
  sales: SalesRecord[]
): CustomerCategorySales[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const row of sales) {
    const category = (row.거래처소분류 || "미분류").trim() || "미분류";
    const amount = row.판매금액 || 0;
    const existing = map.get(category);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(category, { amount, count: 1 });
    }
  }

  const totalAmount = Array.from(map.values()).reduce(
    (sum, v) => sum + v.amount,
    0
  );

  const results: CustomerCategorySales[] = Array.from(map.entries()).map(
    ([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      share: totalAmount !== 0 ? (data.amount / totalAmount) * 100 : 0,
    })
  );

  results.sort((a, b) => b.amount - a.amount);
  return results;
}

// 품목범주별 매출 (제품군 대체)
export interface ItemCategorySales {
  category: string;
  amount: number;
  count: number;
  share: number;
  avgUnitPrice: number;
}

export function calcSalesByItemCategory(
  sales: SalesRecord[]
): ItemCategorySales[] {
  const map = new Map<
    string,
    { amount: number; count: number; totalQty: number }
  >();

  for (const row of sales) {
    const category = (row.품목범주 || row.제품군 || "미분류").trim() || "미분류";
    const amount = row.판매금액 || 0;
    const qty = row.수량 || 0;
    const existing = map.get(category);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
      existing.totalQty += Math.abs(qty);
    } else {
      map.set(category, { amount, count: 1, totalQty: Math.abs(qty) });
    }
  }

  const totalAmount = Array.from(map.values()).reduce(
    (sum, v) => sum + v.amount,
    0
  );

  const results: ItemCategorySales[] = Array.from(map.entries()).map(
    ([category, data]) => ({
      category,
      amount: data.amount,
      count: data.count,
      share: totalAmount !== 0 ? (data.amount / totalAmount) * 100 : 0,
      avgUnitPrice: data.totalQty !== 0 ? data.amount / data.totalQty : 0,
    })
  );

  results.sort((a, b) => b.amount - a.amount);
  return results;
}

// ─── 소규모 카테고리 그룹핑 ──────────────────────────────────

/**
 * share < threshold% 카테고리를 "기타 (N개)"로 병합
 */
export function groupSmallCategories<T extends { amount: number; count: number; share: number }>(
  items: T[],
  threshold: number = 3
): T[] {
  const major = items.filter((item) => item.share >= threshold);
  const minor = items.filter((item) => item.share < threshold);

  if (minor.length <= 1) return items;

  const totalAmount = minor.reduce((sum, item) => sum + item.amount, 0);
  const totalCount = minor.reduce((sum, item) => sum + item.count, 0);
  const totalShare = minor.reduce((sum, item) => sum + item.share, 0);

  const grouped = {
    ...minor[0],
    amount: totalAmount,
    count: totalCount,
    share: totalShare,
  } as T;

  // Set category/channel/term name to "기타 (N개)"
  const nameKey = Object.keys(grouped).find(
    (k) => k === "category" || k === "channel" || k === "term"
  );
  if (nameKey) {
    (grouped as Record<string, unknown>)[nameKey] = `기타 (${minor.length}개)`;
  }

  return [...major, grouped];
}

/**
 * ItemCategorySales 전용 그룹핑 (avgUnitPrice 가중평균 처리)
 */
export function groupSmallItemCategories(
  items: ItemCategorySales[],
  threshold: number = 3
): ItemCategorySales[] {
  const major = items.filter((item) => item.share >= threshold);
  const minor = items.filter((item) => item.share < threshold);

  if (minor.length <= 1) return items;

  const totalAmount = minor.reduce((sum, item) => sum + item.amount, 0);
  const totalCount = minor.reduce((sum, item) => sum + item.count, 0);
  const totalShare = minor.reduce((sum, item) => sum + item.share, 0);
  // 가중평균 단가: Σ(amount) / Σ(amount/avgUnitPrice) — but we need qty
  // Simplified: amount-weighted average unit price
  const weightedPrice =
    totalAmount > 0
      ? minor.reduce((sum, item) => sum + item.avgUnitPrice * item.amount, 0) / totalAmount
      : 0;

  const grouped: ItemCategorySales = {
    category: `기타 (${minor.length}개)`,
    amount: totalAmount,
    count: totalCount,
    share: totalShare,
    avgUnitPrice: weightedPrice,
  };

  return [...major, grouped];
}

// 제품군별 월별 트렌드 (기존 유지 - 추후 제거 가능)
export interface ProductGroupTrend {
  month: string;
  [productGroup: string]: number | string;
}

export function calcProductGroupTrends(
  sales: SalesRecord[]
): ProductGroupTrend[] {
  // Collect all product groups and monthly data
  const monthMap = new Map<string, Map<string, number>>();
  const productGroups = new Set<string>();

  for (const row of sales) {
    const month = extractMonth(row.매출일 || "");
    if (!month) continue;
    const group = (row.제품군 || "미분류").trim() || "미분류";
    const amount = row.판매금액 || 0;

    productGroups.add(group);

    let groupMap = monthMap.get(month);
    if (!groupMap) {
      groupMap = new Map<string, number>();
      monthMap.set(month, groupMap);
    }
    groupMap.set(group, (groupMap.get(group) || 0) + amount);
  }

  // Build result sorted by month ascending
  const months = Array.from(monthMap.keys()).sort();
  const results: ProductGroupTrend[] = months.map((month) => {
    const groupMap = monthMap.get(month)!;
    const entry: ProductGroupTrend = { month };
    Array.from(productGroups).forEach((group) => {
      entry[group] = groupMap.get(group) || 0;
    });
    return entry;
  });

  return results;
}
