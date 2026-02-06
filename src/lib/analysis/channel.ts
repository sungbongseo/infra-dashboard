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

// 제품군별 월별 트렌드
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
