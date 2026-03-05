/**
 * 표준원가 차이 분석 (Standard Cost Variance Analysis)
 *
 * itemProfitability(200) 데이터에서 표준매출원가 vs 실적매출원가 차이를 분석하여
 * 품목별/계정구분별/조직별 원가 관리 성과를 평가합니다.
 */
import type { ItemProfitabilityRecord } from "@/types";

// ── Types ──────────────────────────────────────────────────────

export interface CostVarianceItem {
  product: string;
  org: string;
  계정구분: string;
  standardCost: number;
  actualCost: number;
  variance: number;
  varianceRate: number;
  sales: number;
  grossProfit: number;
  grossMarginRate: number;
}

export interface CostVarianceSummaryResult {
  overCount: number;
  overAmount: number;
  underCount: number;
  underAmount: number;
  avgVarianceRate: number;
  totalItems: number;
  byAccountType: AccountTypeVariance[];
}

export interface AccountTypeVariance {
  accountType: string;
  count: number;
  avgVarianceRate: number;
  totalVariance: number;
  totalStandard: number;
  totalActual: number;
}

export interface OrgCostVariance {
  org: string;
  itemCount: number;
  totalStandard: number;
  totalActual: number;
  totalVariance: number;
  avgVarianceRate: number;
  overCount: number;
  underCount: number;
}

// ── Functions ──────────────────────────────────────────────────

/** 품목별 표준원가 vs 실적원가 차이 계산 */
export function calcStandardCostVariance(data: ItemProfitabilityRecord[]): CostVarianceItem[] {
  return data
    .filter((r) => r.품목.trim() !== "" && (r.표준매출원가 !== 0 || r.실적매출원가 !== 0))
    .map((r) => {
      const variance = r.실적매출원가 - r.표준매출원가;
      const varianceRate = r.표준매출원가 !== 0
        ? (variance / Math.abs(r.표준매출원가)) * 100
        : 0;
      return {
        product: r.품목,
        org: r.영업조직팀,
        계정구분: r.계정구분 || "미분류",
        standardCost: r.표준매출원가,
        actualCost: r.실적매출원가,
        variance,
        varianceRate: isFinite(varianceRate) ? varianceRate : 0,
        sales: r.매출액,
        grossProfit: r.매출총이익,
        grossMarginRate: r.매출총이익율,
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}

/** 원가 차이 요약 통계 */
export function calcCostVarianceSummary(data: ItemProfitabilityRecord[]): CostVarianceSummaryResult {
  const items = calcStandardCostVariance(data);

  const overItems = items.filter((i) => i.variance > 0);
  const underItems = items.filter((i) => i.variance < 0);

  const totalStandard = items.reduce((s, i) => s + i.standardCost, 0);
  const totalActual = items.reduce((s, i) => s + i.actualCost, 0);
  const totalVariance = totalActual - totalStandard;
  const avgVarianceRate = totalStandard !== 0
    ? (totalVariance / Math.abs(totalStandard)) * 100
    : 0;

  // 계정구분별 집계
  const accountMap = new Map<string, { count: number; totalStandard: number; totalActual: number }>();
  for (const item of items) {
    const key = item.계정구분;
    const entry = accountMap.get(key) || { count: 0, totalStandard: 0, totalActual: 0 };
    entry.count++;
    entry.totalStandard += item.standardCost;
    entry.totalActual += item.actualCost;
    accountMap.set(key, entry);
  }

  const byAccountType: AccountTypeVariance[] = Array.from(accountMap.entries())
    .map(([accountType, e]) => {
      const v = e.totalActual - e.totalStandard;
      const rate = e.totalStandard !== 0 ? (v / Math.abs(e.totalStandard)) * 100 : 0;
      return {
        accountType,
        count: e.count,
        avgVarianceRate: isFinite(rate) ? rate : 0,
        totalVariance: v,
        totalStandard: e.totalStandard,
        totalActual: e.totalActual,
      };
    })
    .sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance));

  return {
    overCount: overItems.length,
    overAmount: overItems.reduce((s, i) => s + i.variance, 0),
    underCount: underItems.length,
    underAmount: Math.abs(underItems.reduce((s, i) => s + i.variance, 0)),
    avgVarianceRate: isFinite(avgVarianceRate) ? avgVarianceRate : 0,
    totalItems: items.length,
    byAccountType,
  };
}

/** 조직별 원가관리 성과 */
export function calcCostVarianceByOrg(data: ItemProfitabilityRecord[]): OrgCostVariance[] {
  const items = calcStandardCostVariance(data);
  const orgMap = new Map<string, CostVarianceItem[]>();

  for (const item of items) {
    const arr = orgMap.get(item.org) || [];
    arr.push(item);
    orgMap.set(item.org, arr);
  }

  return Array.from(orgMap.entries())
    .map(([org, orgItems]) => {
      const totalStandard = orgItems.reduce((s, i) => s + i.standardCost, 0);
      const totalActual = orgItems.reduce((s, i) => s + i.actualCost, 0);
      const totalVariance = totalActual - totalStandard;
      const rate = totalStandard !== 0 ? (totalVariance / Math.abs(totalStandard)) * 100 : 0;
      return {
        org,
        itemCount: orgItems.length,
        totalStandard,
        totalActual,
        totalVariance,
        avgVarianceRate: isFinite(rate) ? rate : 0,
        overCount: orgItems.filter((i) => i.variance > 0).length,
        underCount: orgItems.filter((i) => i.variance < 0).length,
      };
    })
    .sort((a, b) => a.avgVarianceRate - b.avgVarianceRate);
}
