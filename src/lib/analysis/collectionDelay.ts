/**
 * 수금지연 추정 분석 (Collection Delay Analysis)
 *
 * salesList(수금예정일) + collectionList(수금일)를 거래처별로 매칭하여
 * 수금 소요일, 지연율, 조직별/거래처별 수금 성과를 분석합니다.
 */
import type { SalesRecord, CollectionRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────

export interface CollectionDelayEntry {
  customer: string;
  org: string;
  salesAmount: number;
  collectedAmount: number;
  collectionRate: number;
  avgDaysToCollect: number;
  avgDelayDays: number; // 수금예정일 대비 실제 지연일
  salesCount: number;
  isDelayed: boolean;
}

export interface OrgCollectionDelay {
  org: string;
  totalSalesAmount: number;
  totalCollectedAmount: number;
  collectionRate: number;
  avgDaysToCollect: number;
  avgDelayDays: number;
  customerCount: number;
  delayedCustomerCount: number;
  delayRate: number;
}

export interface MonthlyCollectionDelay {
  month: string;
  salesAmount: number;
  collectedAmount: number;
  collectionRate: number;
  avgDelayDays: number;
}

export interface CollectionDelaySummary {
  totalSalesAmount: number;
  totalCollectedAmount: number;
  overallCollectionRate: number;
  avgDaysToCollect: number;
  avgDelayDays: number;
  delayedCustomerCount: number;
  totalCustomerCount: number;
  delayRate: number;
  topDelayedCustomers: CollectionDelayEntry[];
}

export interface PaymentMethodAnalysis {
  method: string;
  count: number;
  amount: number;
  share: number;
}

// ── Helpers ──────────────────────────────────────────────────

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

// ── 1. 거래처별 수금지연 추정 ──────────────────────────────

export function calcCollectionDelay(
  sales: SalesRecord[],
  collections: CollectionRecord[]
): CollectionDelayEntry[] {
  if (sales.length === 0) return [];

  // 거래처별 매출 집계 (수금처 기준)
  const salesByCustomer = new Map<string, {
    org: string;
    salesAmount: number;
    salesCount: number;
    dueDate: Date | null; // 가장 빠른 수금예정일
    salesDate: Date | null; // 가장 빠른 매출일
  }>();

  for (const r of sales) {
    const customer = (r.수금처명 || r.수금처 || r.매출처명 || r.매출처 || "").trim();
    if (!customer) continue;
    const entry = salesByCustomer.get(customer) || {
      org: r.영업조직 || "미분류",
      salesAmount: 0,
      salesCount: 0,
      dueDate: null,
      salesDate: null,
    };
    entry.salesAmount += r.장부금액;
    entry.salesCount += 1;

    const saleDate = parseDate(r.매출일);
    if (saleDate && (!entry.salesDate || saleDate < entry.salesDate)) {
      entry.salesDate = saleDate;
    }
    const dueDate = parseDate(r.수금예정일);
    if (dueDate && (!entry.dueDate || dueDate < entry.dueDate)) {
      entry.dueDate = dueDate;
    }

    salesByCustomer.set(customer, entry);
  }

  // 거래처별 수금 집계
  const collectionByCustomer = new Map<string, {
    collectedAmount: number;
    latestCollectionDate: Date | null;
    earliestCollectionDate: Date | null;
  }>();

  for (const c of collections) {
    const customer = (c.거래처명 || "").trim();
    if (!customer) continue;
    const entry = collectionByCustomer.get(customer) || {
      collectedAmount: 0,
      latestCollectionDate: null,
      earliestCollectionDate: null,
    };
    entry.collectedAmount += c.장부수금액 || c.수금액 || 0;
    const collDate = parseDate(c.수금일);
    if (collDate) {
      if (!entry.latestCollectionDate || collDate > entry.latestCollectionDate) {
        entry.latestCollectionDate = collDate;
      }
      if (!entry.earliestCollectionDate || collDate < entry.earliestCollectionDate) {
        entry.earliestCollectionDate = collDate;
      }
    }
    collectionByCustomer.set(customer, entry);
  }

  // 매칭 및 지연일 계산
  const results: CollectionDelayEntry[] = [];
  for (const [customer, sales] of Array.from(salesByCustomer.entries())) {
    const coll = collectionByCustomer.get(customer);
    const collectedAmount = coll?.collectedAmount || 0;
    const collectionRate = sales.salesAmount > 0
      ? Math.min((collectedAmount / sales.salesAmount) * 100, 100)
      : 0;

    // 수금 소요일: 매출일 → 수금일
    let avgDaysToCollect = 0;
    if (sales.salesDate && coll?.earliestCollectionDate) {
      avgDaysToCollect = Math.max(0, daysBetween(sales.salesDate, coll.earliestCollectionDate));
    }

    // 지연일: 수금예정일 → 실제수금일 (양수=지연, 음수=조기수금)
    let avgDelayDays = 0;
    if (sales.dueDate && coll?.latestCollectionDate) {
      avgDelayDays = daysBetween(sales.dueDate, coll.latestCollectionDate);
    }

    results.push({
      customer,
      org: sales.org,
      salesAmount: sales.salesAmount,
      collectedAmount,
      collectionRate,
      avgDaysToCollect,
      avgDelayDays,
      salesCount: sales.salesCount,
      isDelayed: avgDelayDays > 0,
    });
  }

  return results.sort((a, b) => b.salesAmount - a.salesAmount);
}

// ── 2. 조직별 수금지연 ──────────────────────────────────

export function calcOrgCollectionDelay(
  entries: CollectionDelayEntry[]
): OrgCollectionDelay[] {
  if (entries.length === 0) return [];

  const map = new Map<string, {
    totalSalesAmount: number;
    totalCollectedAmount: number;
    totalDelayDays: number;
    totalDaysToCollect: number;
    customerCount: number;
    delayedCustomerCount: number;
    countWithDelay: number;
  }>();

  for (const e of entries) {
    const org = e.org;
    const m = map.get(org) || {
      totalSalesAmount: 0,
      totalCollectedAmount: 0,
      totalDelayDays: 0,
      totalDaysToCollect: 0,
      customerCount: 0,
      delayedCustomerCount: 0,
      countWithDelay: 0,
    };
    m.totalSalesAmount += e.salesAmount;
    m.totalCollectedAmount += e.collectedAmount;
    m.customerCount += 1;
    if (e.isDelayed) m.delayedCustomerCount += 1;
    if (e.avgDaysToCollect > 0) {
      m.totalDaysToCollect += e.avgDaysToCollect;
      m.totalDelayDays += e.avgDelayDays;
      m.countWithDelay += 1;
    }
    map.set(org, m);
  }

  return Array.from(map.entries())
    .map(([org, m]) => ({
      org,
      totalSalesAmount: m.totalSalesAmount,
      totalCollectedAmount: m.totalCollectedAmount,
      collectionRate: m.totalSalesAmount > 0
        ? Math.min((m.totalCollectedAmount / m.totalSalesAmount) * 100, 100)
        : 0,
      avgDaysToCollect: m.countWithDelay > 0
        ? m.totalDaysToCollect / m.countWithDelay
        : 0,
      avgDelayDays: m.countWithDelay > 0
        ? m.totalDelayDays / m.countWithDelay
        : 0,
      customerCount: m.customerCount,
      delayedCustomerCount: m.delayedCustomerCount,
      delayRate: m.customerCount > 0
        ? (m.delayedCustomerCount / m.customerCount) * 100
        : 0,
    }))
    .sort((a, b) => b.totalSalesAmount - a.totalSalesAmount);
}

// ── 3. 월별 수금 추세 ──────────────────────────────────

export function calcMonthlyCollectionDelay(
  sales: SalesRecord[],
  collections: CollectionRecord[]
): MonthlyCollectionDelay[] {
  if (sales.length === 0) return [];

  const salesByMonth = new Map<string, number>();
  const dueDateByMonth = new Map<string, Date[]>();

  for (const r of sales) {
    const m = extractMonth(r.매출일);
    if (!m) continue;
    salesByMonth.set(m, (salesByMonth.get(m) || 0) + r.장부금액);
    const dueDate = parseDate(r.수금예정일);
    if (dueDate) {
      const arr = dueDateByMonth.get(m) || [];
      arr.push(dueDate);
      dueDateByMonth.set(m, arr);
    }
  }

  const collByMonth = new Map<string, { amount: number; dates: Date[] }>();
  for (const c of collections) {
    const m = extractMonth(c.수금일);
    if (!m) continue;
    const entry = collByMonth.get(m) || { amount: 0, dates: [] };
    entry.amount += c.장부수금액 || c.수금액 || 0;
    const d = parseDate(c.수금일);
    if (d) entry.dates.push(d);
    collByMonth.set(m, entry);
  }

  const months = new Set([...Array.from(salesByMonth.keys()), ...Array.from(collByMonth.keys())]);
  const results: MonthlyCollectionDelay[] = [];

  for (const month of Array.from(months)) {
    const salesAmount = salesByMonth.get(month) || 0;
    const coll = collByMonth.get(month);
    const collectedAmount = coll?.amount || 0;
    const collectionRate = salesAmount > 0
      ? Math.min((collectedAmount / salesAmount) * 100, 100)
      : 0;

    // 평균 지연일 추정: 해당 월 수금예정일 vs 실제수금일
    const dueDates = dueDateByMonth.get(month) || [];
    const collDates = coll?.dates || [];
    let avgDelayDays = 0;
    if (dueDates.length > 0 && collDates.length > 0) {
      const avgDue = dueDates.reduce((s, d) => s + d.getTime(), 0) / dueDates.length;
      const avgColl = collDates.reduce((s, d) => s + d.getTime(), 0) / collDates.length;
      avgDelayDays = Math.round((avgColl - avgDue) / (1000 * 60 * 60 * 24));
    }

    results.push({ month, salesAmount, collectedAmount, collectionRate, avgDelayDays });
  }

  return results.sort((a, b) => a.month.localeCompare(b.month));
}

// ── 4. 수금지연 요약 ──────────────────────────────────

export function calcCollectionDelaySummary(
  entries: CollectionDelayEntry[]
): CollectionDelaySummary {
  const empty: CollectionDelaySummary = {
    totalSalesAmount: 0,
    totalCollectedAmount: 0,
    overallCollectionRate: 0,
    avgDaysToCollect: 0,
    avgDelayDays: 0,
    delayedCustomerCount: 0,
    totalCustomerCount: 0,
    delayRate: 0,
    topDelayedCustomers: [],
  };
  if (entries.length === 0) return empty;

  let totalSales = 0;
  let totalColl = 0;
  let totalDays = 0;
  let totalDelay = 0;
  let countWithDays = 0;
  let delayed = 0;

  for (const e of entries) {
    totalSales += e.salesAmount;
    totalColl += e.collectedAmount;
    if (e.avgDaysToCollect > 0) {
      totalDays += e.avgDaysToCollect;
      totalDelay += e.avgDelayDays;
      countWithDays += 1;
    }
    if (e.isDelayed) delayed += 1;
  }

  return {
    totalSalesAmount: totalSales,
    totalCollectedAmount: totalColl,
    overallCollectionRate: totalSales > 0
      ? Math.min((totalColl / totalSales) * 100, 100)
      : 0,
    avgDaysToCollect: countWithDays > 0 ? totalDays / countWithDays : 0,
    avgDelayDays: countWithDays > 0 ? totalDelay / countWithDays : 0,
    delayedCustomerCount: delayed,
    totalCustomerCount: entries.length,
    delayRate: entries.length > 0 ? (delayed / entries.length) * 100 : 0,
    topDelayedCustomers: entries
      .filter((e) => e.isDelayed)
      .sort((a, b) => b.avgDelayDays - a.avgDelayDays)
      .slice(0, 15),
  };
}

// ── 5. 결제방법별 수금 분석 ──────────────────────────────

export function calcPaymentMethodAnalysis(
  collections: CollectionRecord[]
): PaymentMethodAnalysis[] {
  if (collections.length === 0) return [];

  const map = new Map<string, { count: number; amount: number }>();
  let total = 0;

  for (const c of collections) {
    const method = (c.결재방법 || c.수금유형 || "기타").trim() || "기타";
    const amt = c.장부수금액 || c.수금액 || 0;
    total += amt;
    const entry = map.get(method) || { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += amt;
    map.set(method, entry);
  }

  return Array.from(map.entries())
    .map(([method, e]) => ({
      method,
      count: e.count,
      amount: e.amount,
      share: total > 0 ? (e.amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}
