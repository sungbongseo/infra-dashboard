/**
 * standardCostAnalysis.ts — 표준원가 vs 실적원가 차이 분석
 *
 * ItemProfitabilityRecord(200파일)의 표준매출원가 필드를 활용하여
 * 품목별 원가 차이율, 요약 통계, 조직별 비교를 제공한다.
 */
import type { ItemProfitabilityRecord } from "@/types";

// ─── Interfaces ─────────────────────────────────────────────

export interface StandardCostVarianceEntry {
  품목: string;
  품목계정그룹: string;
  계정구분: string;
  영업조직팀: string;
  표준매출원가: number;
  실적매출원가: number;
  차이금액: number; // 실적 - 표준
  차이율: number; // (실적-표준)/표준 * 100
  매출액: number;
  매출총이익: number;
  direction: "초과" | "절감" | "일치";
}

export interface StandardCostVarianceSummary {
  totalItems: number;
  analyzableItems: number; // 표준원가 있는 품목
  overCostItems: number; // 원가 초과 품목 수
  underCostItems: number; // 원가 절감 품목 수
  overCostAmount: number; // 초과 총금액
  underCostAmount: number; // 절감 총금액
  avgVarianceRate: number; // 전체 평균 차이율
  byAccountType: { 계정구분: string; avgVariance: number; count: number }[];
}

export interface OrgCostVariance {
  영업조직팀: string;
  avgVarianceRate: number;
  itemCount: number;
  overCostRate: number; // 원가 초과 품목 비율
  totalOverAmount: number;
}

// ─── Helpers ────────────────────────────────────────────────

/** 표준매출원가가 유효한(0이 아닌 양수) 레코드인지 판별 */
function hasValidStandardCost(r: ItemProfitabilityRecord): boolean {
  return (
    isFinite(r.표준매출원가) &&
    r.표준매출원가 !== 0 &&
    isFinite(r.실적매출원가)
  );
}

/** 차이율 계산 (NaN/Infinity 방어) */
function varianceRate(actual: number, standard: number): number {
  if (standard === 0 || !isFinite(standard)) return 0;
  const rate = ((actual - standard) / Math.abs(standard)) * 100;
  return isFinite(rate) ? rate : 0;
}

/** 차이 방향 판별 (±0.01% 이내 = 일치) */
function direction(rate: number): "초과" | "절감" | "일치" {
  if (rate > 0.01) return "초과";
  if (rate < -0.01) return "절감";
  return "일치";
}

// ─── 1. 품목별 표준원가 차이 ────────────────────────────────

export function calcStandardCostVariance(
  data: ItemProfitabilityRecord[],
): StandardCostVarianceEntry[] {
  if (!data || data.length === 0) return [];

  const entries: StandardCostVarianceEntry[] = [];

  for (const r of data) {
    if (!hasValidStandardCost(r)) continue;

    const diff = r.실적매출원가 - r.표준매출원가;
    const rate = varianceRate(r.실적매출원가, r.표준매출원가);

    entries.push({
      품목: r.품목 || "",
      품목계정그룹: r.품목계정그룹 || "",
      계정구분: r.계정구분 || "",
      영업조직팀: r.영업조직팀 || "",
      표준매출원가: r.표준매출원가,
      실적매출원가: r.실적매출원가,
      차이금액: isFinite(diff) ? diff : 0,
      차이율: rate,
      매출액: isFinite(r.매출액) ? r.매출액 : 0,
      매출총이익: isFinite(r.매출총이익) ? r.매출총이익 : 0,
      direction: direction(rate),
    });
  }

  // 원가 초과(양수) → 원가 절감(음수) 순 정렬
  entries.sort((a, b) => b.차이율 - a.차이율);

  return entries;
}

// ─── 2. 요약 통계 ───────────────────────────────────────────

export function calcCostVarianceSummary(
  data: ItemProfitabilityRecord[],
): StandardCostVarianceSummary {
  const empty: StandardCostVarianceSummary = {
    totalItems: 0,
    analyzableItems: 0,
    overCostItems: 0,
    underCostItems: 0,
    overCostAmount: 0,
    underCostAmount: 0,
    avgVarianceRate: 0,
    byAccountType: [],
  };

  if (!data || data.length === 0) return empty;

  const analyzable = data.filter(hasValidStandardCost);
  if (analyzable.length === 0) return { ...empty, totalItems: data.length };

  let overCount = 0;
  let underCount = 0;
  let overAmount = 0;
  let underAmount = 0;
  let totalRate = 0;

  // 계정구분별 집계용 Map
  const accountMap = new Map<
    string,
    { sumRate: number; count: number }
  >();

  for (const r of analyzable) {
    const diff = r.실적매출원가 - r.표준매출원가;
    const rate = varianceRate(r.실적매출원가, r.표준매출원가);
    totalRate += rate;

    if (diff > 0) {
      overCount += 1;
      overAmount += diff;
    } else if (diff < 0) {
      underCount += 1;
      underAmount += Math.abs(diff);
    }

    // 계정구분별 집계
    const acctType = (r.계정구분 || "").trim();
    if (acctType) {
      const existing = accountMap.get(acctType);
      if (existing) {
        existing.sumRate += rate;
        existing.count += 1;
      } else {
        accountMap.set(acctType, { sumRate: rate, count: 1 });
      }
    }
  }

  const byAccountType = Array.from(accountMap.entries())
    .map(([key, val]) => ({
      계정구분: key,
      avgVariance: isFinite(val.sumRate / val.count)
        ? val.sumRate / val.count
        : 0,
      count: val.count,
    }))
    .sort((a, b) => b.avgVariance - a.avgVariance);

  const avg = totalRate / analyzable.length;

  return {
    totalItems: data.length,
    analyzableItems: analyzable.length,
    overCostItems: overCount,
    underCostItems: underCount,
    overCostAmount: isFinite(overAmount) ? overAmount : 0,
    underCostAmount: isFinite(underAmount) ? underAmount : 0,
    avgVarianceRate: isFinite(avg) ? avg : 0,
    byAccountType,
  };
}

// ─── 3. 조직별 원가 차이 ────────────────────────────────────

export function calcCostVarianceByOrg(
  data: ItemProfitabilityRecord[],
): OrgCostVariance[] {
  if (!data || data.length === 0) return [];

  const analyzable = data.filter(hasValidStandardCost);
  if (analyzable.length === 0) return [];

  // 조직별 집계
  const orgMap = new Map<
    string,
    {
      sumRate: number;
      count: number;
      overCount: number;
      totalOverAmount: number;
    }
  >();

  for (const r of analyzable) {
    const org = (r.영업조직팀 || "").trim();
    if (!org) continue;

    const diff = r.실적매출원가 - r.표준매출원가;
    const rate = varianceRate(r.실적매출원가, r.표준매출원가);

    const existing = orgMap.get(org);
    if (existing) {
      existing.sumRate += rate;
      existing.count += 1;
      if (diff > 0) {
        existing.overCount += 1;
        existing.totalOverAmount += diff;
      }
    } else {
      orgMap.set(org, {
        sumRate: rate,
        count: 1,
        overCount: diff > 0 ? 1 : 0,
        totalOverAmount: diff > 0 ? diff : 0,
      });
    }
  }

  return Array.from(orgMap.entries())
    .map(([org, val]) => {
      const avg = val.sumRate / val.count;
      const overRate = (val.overCount / val.count) * 100;
      return {
        영업조직팀: org,
        avgVarianceRate: isFinite(avg) ? avg : 0,
        itemCount: val.count,
        overCostRate: isFinite(overRate) ? overRate : 0,
        totalOverAmount: isFinite(val.totalOverAmount)
          ? val.totalOverAmount
          : 0,
      };
    })
    .sort((a, b) => b.avgVarianceRate - a.avgVarianceRate);
}
