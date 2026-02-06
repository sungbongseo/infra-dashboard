import type { OrderRecord, SalesRecord, CollectionRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

export interface O2CStage {
  stage: "수주" | "매출전환" | "수금완료" | "미수잔액";
  amount: number;
  percentage: number;
  count: number;
}

export interface MonthlyConversion {
  month: string;
  수주: number;
  매출: number;
  수금: number;
  전환율: number;
  수금율: number;
}

/**
 * O2C(Order-to-Cash) 파이프라인 퍼널 단계 계산
 * 수주 → 매출전환 → 수금완료 → 미수잔액
 */
export function calcO2CPipeline(
  orders: OrderRecord[],
  sales: SalesRecord[],
  collections: CollectionRecord[]
): O2CStage[] {
  const totalOrders = orders.reduce((s, o) => s + o.장부금액, 0);
  const totalSales = sales.reduce((s, r) => s + r.장부금액, 0);
  const totalCollections = collections.reduce((s, c) => s + c.장부수금액, 0);
  const outstanding = Math.max(0, totalSales - totalCollections);

  return [
    {
      stage: "수주",
      amount: totalOrders,
      percentage: 100,
      count: orders.length,
    },
    {
      stage: "매출전환",
      amount: totalSales,
      percentage: totalOrders > 0 ? (totalSales / totalOrders) * 100 : 0,
      count: sales.length,
    },
    {
      stage: "수금완료",
      amount: totalCollections,
      percentage: totalOrders > 0 ? (totalCollections / totalOrders) * 100 : 0,
      count: collections.length,
    },
    {
      stage: "미수잔액",
      amount: outstanding,
      percentage: totalOrders > 0 ? (outstanding / totalOrders) * 100 : 0,
      count: 0,
    },
  ];
}

/**
 * 월별 수주/매출/수금 전환율 추이 계산
 * 전환율 = 매출 / 수주 * 100
 * 수금율 = 수금 / 매출 * 100
 */
export function calcMonthlyConversion(
  orders: OrderRecord[],
  sales: SalesRecord[],
  collections: CollectionRecord[]
): MonthlyConversion[] {
  const map = new Map<string, { 수주: number; 매출: number; 수금: number }>();

  for (const r of orders) {
    const m = extractMonth(r.수주일);
    if (!m) continue;
    const entry = map.get(m) || { 수주: 0, 매출: 0, 수금: 0 };
    entry.수주 += r.장부금액;
    map.set(m, entry);
  }

  for (const r of sales) {
    const m = extractMonth(r.매출일);
    if (!m) continue;
    const entry = map.get(m) || { 수주: 0, 매출: 0, 수금: 0 };
    entry.매출 += r.장부금액;
    map.set(m, entry);
  }

  for (const r of collections) {
    const m = extractMonth(r.수금일);
    if (!m) continue;
    const entry = map.get(m) || { 수주: 0, 매출: 0, 수금: 0 };
    entry.수금 += r.장부수금액;
    map.set(m, entry);
  }

  return Array.from(map.entries())
    .map(([month, data]) => ({
      month,
      수주: data.수주,
      매출: data.매출,
      수금: data.수금,
      전환율: data.수주 > 0 ? (data.매출 / data.수주) * 100 : 0,
      수금율: data.매출 > 0 ? (data.수금 / data.매출) * 100 : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
