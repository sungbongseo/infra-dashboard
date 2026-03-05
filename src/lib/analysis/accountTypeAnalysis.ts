import type { SalesRecord, CustomerItemDetailRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── 인터페이스 ──────────────────────────────────────────────

/** 계정구분별 매출 비중 */
export interface AccountTypeBreakdown {
  accountType: string;
  amount: number;
  count: number;
  share: number;
}

/** 월별 계정구분별 매출 추이 */
export interface AccountTypeTrendEntry {
  month: string;
  제품: number;
  상품: number;
  원자재: number;
  부재료: number;
  [key: string]: number | string; // 기타 미분류 등
}

/** 영업조직별 계정구분 프로필 */
export interface OrgAccountTypeProfile {
  org: string;
  totalAmount: number;
  breakdown: {
    accountType: string;
    amount: number;
    share: number;
  }[];
  /** 상품 의존도 (%) — 높을수록 상품 비중 큰 조직 */
  merchandiseDependency: number;
}

/** 품목군별 수익성 */
export interface ProductGroupProfitEntry {
  productGroup: string;
  sales: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  operatingMargin: number;
  count: number;
}

/** 공장별 성과 */
export interface FactoryPerformance {
  factory: string;
  sales: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  operatingMargin: number;
  costRate: number;
  count: number;
}

// ─── 1. 계정구분별 매출 비중 ─────────────────────────────────

/**
 * 계정구분(제품/상품/원자재/부재료)별 매출 금액, 건수, 비중 집계
 */
export function calcAccountTypeBreakdown(
  salesData: SalesRecord[]
): AccountTypeBreakdown[] {
  if (salesData.length === 0) return [];

  const map = new Map<string, { amount: number; count: number }>();

  for (const row of salesData) {
    const type = (row.계정구분 || "미분류").trim() || "미분류";
    const amount = row.장부금액 || 0;
    const existing = map.get(type);
    if (existing) {
      existing.amount += amount;
      existing.count += 1;
    } else {
      map.set(type, { amount, count: 1 });
    }
  }

  const totalAmount = Array.from(map.values()).reduce(
    (sum, v) => sum + v.amount,
    0
  );

  const results: AccountTypeBreakdown[] = Array.from(map.entries()).map(
    ([accountType, data]) => ({
      accountType,
      amount: data.amount,
      count: data.count,
      share:
        totalAmount !== 0 && isFinite(data.amount / totalAmount)
          ? (data.amount / totalAmount) * 100
          : 0,
    })
  );

  results.sort((a, b) => b.amount - a.amount);
  return results;
}

// ─── 2. 월별 계정구분별 매출 추이 ────────────────────────────

/**
 * 매출일 기준 월별 계정구분별 매출 추이
 */
export function calcAccountTypeTrend(
  salesData: SalesRecord[]
): AccountTypeTrendEntry[] {
  if (salesData.length === 0) return [];

  const monthMap = new Map<
    string,
    { 제품: number; 상품: number; 원자재: number; 부재료: number; [k: string]: number }
  >();

  for (const row of salesData) {
    const month = extractMonth(row.매출일 || "");
    if (!month) continue;

    const type = (row.계정구분 || "미분류").trim() || "미분류";
    const amount = row.장부금액 || 0;

    let entry = monthMap.get(month);
    if (!entry) {
      entry = { 제품: 0, 상품: 0, 원자재: 0, 부재료: 0 };
      monthMap.set(month, entry);
    }

    if (type in entry) {
      entry[type] += amount;
    } else {
      // 미분류 등 기타 유형
      entry[type] = (entry[type] || 0) + amount;
    }
  }

  const months = Array.from(monthMap.keys()).sort();
  return months.map((month) => {
    const data = monthMap.get(month)!;
    return {
      month,
      제품: data.제품,
      상품: data.상품,
      원자재: data.원자재,
      부재료: data.부재료,
    };
  });
}

// ─── 3. 영업조직별 계정구분 비중 ─────────────────────────────

/**
 * 영업조직별 계정구분 비중 비교
 * 어느 조직이 상품 의존도가 높은지 파악
 */
export function calcAccountTypeByOrg(
  salesData: SalesRecord[]
): OrgAccountTypeProfile[] {
  if (salesData.length === 0) return [];

  // org → accountType → amount
  const orgMap = new Map<string, Map<string, number>>();

  for (const row of salesData) {
    const org = (row.영업조직 || "미분류").trim() || "미분류";
    const type = (row.계정구분 || "미분류").trim() || "미분류";
    const amount = row.장부금액 || 0;

    let typeMap = orgMap.get(org);
    if (!typeMap) {
      typeMap = new Map<string, number>();
      orgMap.set(org, typeMap);
    }
    typeMap.set(type, (typeMap.get(type) || 0) + amount);
  }

  const results: OrgAccountTypeProfile[] = Array.from(orgMap.entries()).map(
    ([org, typeMap]) => {
      const totalAmount = Array.from(typeMap.values()).reduce(
        (sum, v) => sum + v,
        0
      );

      const breakdown = Array.from(typeMap.entries())
        .map(([accountType, amount]) => ({
          accountType,
          amount,
          share:
            totalAmount !== 0 && isFinite(amount / totalAmount)
              ? (amount / totalAmount) * 100
              : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      const merchandiseAmount = typeMap.get("상품") || 0;
      const merchandiseDependency =
        totalAmount !== 0 && isFinite(merchandiseAmount / totalAmount)
          ? (merchandiseAmount / totalAmount) * 100
          : 0;

      return {
        org,
        totalAmount,
        breakdown,
        merchandiseDependency,
      };
    }
  );

  results.sort((a, b) => b.totalAmount - a.totalAmount);
  return results;
}

// ─── 4. 품목군별 수익성 ──────────────────────────────────────

/**
 * 품목군(34종) 기반 매출/이익/매출원가율 집계
 * CustomerItemDetailRecord의 품목군 필드 활용
 */
export function calcProductGroupProfitability(
  data: CustomerItemDetailRecord[]
): ProductGroupProfitEntry[] {
  if (data.length === 0) return [];

  const map = new Map<
    string,
    {
      sales: number;
      cost: number;
      grossProfit: number;
      operatingProfit: number;
      count: number;
    }
  >();

  for (const r of data) {
    const group = (r.품목군 || "미분류").trim() || "미분류";

    const entry = map.get(group) || {
      sales: 0,
      cost: 0,
      grossProfit: 0,
      operatingProfit: 0,
      count: 0,
    };

    entry.sales += r.매출액.실적;
    entry.cost += r.실적매출원가.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;
    entry.count += 1;

    map.set(group, entry);
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.sales !== 0)
    .map(([productGroup, v]) => ({
      productGroup,
      sales: v.sales,
      cost: v.cost,
      grossProfit: v.grossProfit,
      grossMargin:
        v.sales !== 0 && isFinite(v.grossProfit / v.sales)
          ? (v.grossProfit / v.sales) * 100
          : 0,
      operatingProfit: v.operatingProfit,
      operatingMargin:
        v.sales !== 0 && isFinite(v.operatingProfit / v.sales)
          ? (v.operatingProfit / v.sales) * 100
          : 0,
      count: v.count,
    }))
    .sort((a, b) => b.sales - a.sales);
}

// ─── 5. 공장별 성과 ─────────────────────────────────────────

/**
 * 공장(5개)별 매출/이익/매출원가율 비교
 * CustomerItemDetailRecord의 공장 필드 활용
 */
export function calcFactoryPerformance(
  data: CustomerItemDetailRecord[]
): FactoryPerformance[] {
  if (data.length === 0) return [];

  const map = new Map<
    string,
    {
      sales: number;
      cost: number;
      grossProfit: number;
      operatingProfit: number;
      count: number;
    }
  >();

  for (const r of data) {
    const factory = (r.공장 || "미분류").trim() || "미분류";

    const entry = map.get(factory) || {
      sales: 0,
      cost: 0,
      grossProfit: 0,
      operatingProfit: 0,
      count: 0,
    };

    entry.sales += r.매출액.실적;
    entry.cost += r.실적매출원가.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;
    entry.count += 1;

    map.set(factory, entry);
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.sales !== 0)
    .map(([factory, v]) => ({
      factory,
      sales: v.sales,
      cost: v.cost,
      grossProfit: v.grossProfit,
      grossMargin:
        v.sales !== 0 && isFinite(v.grossProfit / v.sales)
          ? (v.grossProfit / v.sales) * 100
          : 0,
      operatingProfit: v.operatingProfit,
      operatingMargin:
        v.sales !== 0 && isFinite(v.operatingProfit / v.sales)
          ? (v.operatingProfit / v.sales) * 100
          : 0,
      costRate:
        v.sales !== 0 && isFinite(v.cost / v.sales)
          ? (v.cost / v.sales) * 100
          : 0,
      count: v.count,
    }))
    .sort((a, b) => b.sales - a.sales);
}
