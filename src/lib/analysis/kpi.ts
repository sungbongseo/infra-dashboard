import type { SalesRecord, CollectionRecord, OrderRecord, OrgProfitRecord } from "@/types";

export interface OverviewKpis {
  totalSales: number;
  totalOrders: number;
  totalCollection: number;
  collectionRate: number;
  totalReceivables: number;
  operatingProfitRate: number;
  salesPlanAchievement: number;
}

export function calcOverviewKpis(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[],
  orgProfit: OrgProfitRecord[]
): OverviewKpis {
  const totalSales = sales.reduce((sum, r) => sum + r.장부금액, 0);
  const totalOrders = orders.reduce((sum, r) => sum + r.장부금액, 0);
  const totalCollection = collections.reduce((sum, r) => sum + r.장부수금액, 0);
  const collectionRate = totalSales > 0 ? (totalCollection / totalSales) * 100 : 0;
  const totalReceivables = totalSales - totalCollection;

  const opSum = orgProfit.reduce((sum, r) => sum + r.영업이익.실적, 0);
  const salesSum = orgProfit.reduce((sum, r) => sum + r.매출액.실적, 0);
  const operatingProfitRate = salesSum > 0 ? (opSum / salesSum) * 100 : 0;

  const planSum = orgProfit.reduce((sum, r) => sum + r.매출액.계획, 0);
  const salesPlanAchievement = planSum > 0 ? (salesSum / planSum) * 100 : 0;

  return {
    totalSales,
    totalOrders,
    totalCollection,
    collectionRate,
    totalReceivables,
    operatingProfitRate,
    salesPlanAchievement,
  };
}

export interface MonthlyTrend {
  month: string;
  매출: number;
  수주: number;
  수금: number;
}

function extractMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = String(dateStr);
  // Handle various date formats: YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, Excel serial
  if (d.includes("-")) return d.substring(0, 7);
  if (d.includes("/")) {
    const parts = d.split("/");
    return `${parts[0]}-${parts[1].padStart(2, "0")}`;
  }
  if (d.length === 8) return `${d.substring(0, 4)}-${d.substring(4, 6)}`;
  // Excel serial number
  const serial = Number(d);
  if (!isNaN(serial) && serial > 40000) {
    const date = new Date((serial - 25569) * 86400 * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }
  return "";
}

export function calcMonthlyTrends(
  sales: SalesRecord[],
  orders: OrderRecord[],
  collections: CollectionRecord[]
): MonthlyTrend[] {
  const monthMap = new Map<string, MonthlyTrend>();

  for (const r of sales) {
    const m = extractMonth(r.매출일);
    if (!m) continue;
    const entry = monthMap.get(m) || { month: m, 매출: 0, 수주: 0, 수금: 0 };
    entry.매출 += r.장부금액;
    monthMap.set(m, entry);
  }

  for (const r of orders) {
    const m = extractMonth(r.수주일);
    if (!m) continue;
    const entry = monthMap.get(m) || { month: m, 매출: 0, 수주: 0, 수금: 0 };
    entry.수주 += r.장부금액;
    monthMap.set(m, entry);
  }

  for (const r of collections) {
    const m = extractMonth(r.수금일);
    if (!m) continue;
    const entry = monthMap.get(m) || { month: m, 매출: 0, 수주: 0, 수금: 0 };
    entry.수금 += r.장부수금액;
    monthMap.set(m, entry);
  }

  return Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
}

export interface OrgRanking {
  org: string;
  sales: number;
}

export function calcOrgRanking(sales: SalesRecord[]): OrgRanking[] {
  const orgMap = new Map<string, number>();
  for (const r of sales) {
    const org = r.영업조직;
    if (!org) continue;
    orgMap.set(org, (orgMap.get(org) || 0) + r.장부금액);
  }
  return Array.from(orgMap.entries())
    .map(([org, sales]) => ({ org, sales }))
    .sort((a, b) => b.sales - a.sales);
}

export function calcTopCustomers(sales: SalesRecord[], topN = 10) {
  const custMap = new Map<string, { name: string; amount: number }>();
  for (const r of sales) {
    const key = r.매출처;
    if (!key) continue;
    const entry = custMap.get(key) || { name: r.매출처명, amount: 0 };
    entry.amount += r.장부금액;
    custMap.set(key, entry);
  }
  return Array.from(custMap.entries())
    .map(([code, { name, amount }]) => ({ code, name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topN);
}

export function calcItemSales(sales: SalesRecord[]) {
  const itemMap = new Map<string, { name: string; amount: number; category: string }>();
  for (const r of sales) {
    const key = r.대분류 || r.품목;
    if (!key) continue;
    const entry = itemMap.get(key) || { name: key, amount: 0, category: r.대분류 };
    entry.amount += r.장부금액;
    itemMap.set(key, entry);
  }
  return Array.from(itemMap.values())
    .sort((a, b) => b.amount - a.amount);
}

export function calcSalesByType(sales: SalesRecord[]) {
  const domestic = sales.filter(r => r.수주유형 !== "수출" && r.거래통화 === "KRW").reduce((s, r) => s + r.장부금액, 0);
  const exported = sales.filter(r => r.수주유형 === "수출" || r.거래통화 !== "KRW").reduce((s, r) => s + r.장부금액, 0);
  return { domestic, exported };
}
