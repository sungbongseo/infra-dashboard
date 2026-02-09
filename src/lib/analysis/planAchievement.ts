import type { ProfitabilityAnalysisRecord } from "@/types";

/**
 * 계획 달성 분석 (Plan Achievement Analysis)
 *
 * 3-way variance (가격/수량/믹스)를 대체하는 금액 기반 계획 달성 분석.
 * SAP 901 데이터는 매출수량.계획이 대부분 0이어서 수량 기반 분산분해가 무의미.
 * 대신 금액 기반으로 조직별/거래처별 계획 대비 달성율과 마진율 변동을 분석.
 */

// ── Plan Achievement Summary ────────────────────────────────────

export interface PlanAchievementSummary {
  totalSalesPlan: number;
  totalSalesActual: number;
  salesAchievement: number; // %
  salesGap: number; // 실적 - 계획
  totalGPPlan: number;
  totalGPActual: number;
  gpAchievement: number;
  totalOPPlan: number;
  totalOPActual: number;
  opAchievement: number;
  plannedGPRate: number; // 계획 매출총이익율
  actualGPRate: number; // 실적 매출총이익율
  marginDrift: number; // 이익율 변동 (pp)
  plannedOPRate: number;
  actualOPRate: number;
  opMarginDrift: number;
}

export function calcPlanAchievementSummary(
  data: ProfitabilityAnalysisRecord[]
): PlanAchievementSummary {
  let salesPlan = 0,
    salesActual = 0,
    gpPlan = 0,
    gpActual = 0,
    opPlan = 0,
    opActual = 0;

  for (const r of data) {
    salesPlan += r.매출액.계획;
    salesActual += r.매출액.실적;
    gpPlan += r.매출총이익.계획;
    gpActual += r.매출총이익.실적;
    opPlan += r.영업이익.계획;
    opActual += r.영업이익.실적;
  }

  const plannedGPRate = salesPlan !== 0 ? (gpPlan / salesPlan) * 100 : 0;
  const actualGPRate = salesActual !== 0 ? (gpActual / salesActual) * 100 : 0;
  const plannedOPRate = salesPlan !== 0 ? (opPlan / salesPlan) * 100 : 0;
  const actualOPRate = salesActual !== 0 ? (opActual / salesActual) * 100 : 0;

  return {
    totalSalesPlan: salesPlan,
    totalSalesActual: salesActual,
    salesAchievement: salesPlan !== 0 ? (salesActual / salesPlan) * 100 : 0,
    salesGap: salesActual - salesPlan,
    totalGPPlan: gpPlan,
    totalGPActual: gpActual,
    gpAchievement: gpPlan !== 0 ? (gpActual / gpPlan) * 100 : 0,
    totalOPPlan: opPlan,
    totalOPActual: opActual,
    opAchievement: opPlan !== 0 ? (opActual / opPlan) * 100 : 0,
    plannedGPRate,
    actualGPRate,
    marginDrift: actualGPRate - plannedGPRate,
    plannedOPRate,
    actualOPRate,
    opMarginDrift: actualOPRate - plannedOPRate,
  };
}

// ── Org-level Achievement ────────────────────────────────────

export interface OrgAchievement {
  org: string;
  salesPlan: number;
  salesActual: number;
  salesAchievement: number;
  salesGap: number;
  gpPlan: number;
  gpActual: number;
  gpAchievement: number;
  plannedGPRate: number;
  actualGPRate: number;
  marginDrift: number;
  opPlan: number;
  opActual: number;
  opAchievement: number;
}

export function calcOrgAchievement(
  data: ProfitabilityAnalysisRecord[]
): OrgAchievement[] {
  const map = new Map<
    string,
    {
      salesPlan: number;
      salesActual: number;
      gpPlan: number;
      gpActual: number;
      opPlan: number;
      opActual: number;
    }
  >();

  for (const r of data) {
    const org = r.영업조직팀 || "(미분류)";
    const entry = map.get(org) || {
      salesPlan: 0,
      salesActual: 0,
      gpPlan: 0,
      gpActual: 0,
      opPlan: 0,
      opActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpPlan += r.매출총이익.계획;
    entry.gpActual += r.매출총이익.실적;
    entry.opPlan += r.영업이익.계획;
    entry.opActual += r.영업이익.실적;
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, v]) => {
      const plannedGPRate =
        v.salesPlan !== 0 ? (v.gpPlan / v.salesPlan) * 100 : 0;
      const actualGPRate =
        v.salesActual !== 0 ? (v.gpActual / v.salesActual) * 100 : 0;
      return {
        org,
        salesPlan: v.salesPlan,
        salesActual: v.salesActual,
        salesAchievement:
          v.salesPlan !== 0 ? (v.salesActual / v.salesPlan) * 100 : 0,
        salesGap: v.salesActual - v.salesPlan,
        gpPlan: v.gpPlan,
        gpActual: v.gpActual,
        gpAchievement:
          v.gpPlan !== 0 ? (v.gpActual / v.gpPlan) * 100 : 0,
        plannedGPRate,
        actualGPRate,
        marginDrift: actualGPRate - plannedGPRate,
        opPlan: v.opPlan,
        opActual: v.opActual,
        opAchievement:
          v.opPlan !== 0 ? (v.opActual / v.opPlan) * 100 : 0,
      };
    })
    .sort((a, b) => b.salesActual - a.salesActual);
}

// ── Top Contributors / Detractors by Customer ────────────────

export interface CustomerContributor {
  customer: string; // 매출거래처
  salesPlan: number;
  salesActual: number;
  salesGap: number;
  gpActual: number;
  gpMargin: number;
  opActual: number;
  opMargin: number;
}

/**
 * 거래처별 계획 대비 매출 차이(gap)를 산출하고
 * 상위 기여(positive gap) / 하위 악화(negative gap) 순으로 정렬.
 * topN: 반환 건수 (양/음 각각)
 */
export function calcTopContributors(
  data: ProfitabilityAnalysisRecord[],
  topN: number = 10
): { top: CustomerContributor[]; bottom: CustomerContributor[] } {
  const map = new Map<
    string,
    {
      salesPlan: number;
      salesActual: number;
      gpActual: number;
      opActual: number;
    }
  >();

  for (const r of data) {
    const customer = r.매출거래처 || "(미분류)";
    const entry = map.get(customer) || {
      salesPlan: 0,
      salesActual: 0,
      gpActual: 0,
      opActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpActual += r.매출총이익.실적;
    entry.opActual += r.영업이익.실적;
    map.set(customer, entry);
  }

  const all: CustomerContributor[] = Array.from(map.entries()).map(
    ([customer, v]) => ({
      customer,
      salesPlan: v.salesPlan,
      salesActual: v.salesActual,
      salesGap: v.salesActual - v.salesPlan,
      gpActual: v.gpActual,
      gpMargin:
        v.salesActual !== 0 ? (v.gpActual / v.salesActual) * 100 : 0,
      opActual: v.opActual,
      opMargin:
        v.salesActual !== 0 ? (v.opActual / v.salesActual) * 100 : 0,
    })
  );

  // Top: 양의 차이 → 기여 거래처 (내림차순)
  const top = all
    .filter((c) => c.salesGap > 0)
    .sort((a, b) => b.salesGap - a.salesGap)
    .slice(0, topN);

  // Bottom: 음의 차이 → 악화 거래처 (오름차순)
  const bottom = all
    .filter((c) => c.salesGap < 0)
    .sort((a, b) => a.salesGap - b.salesGap)
    .slice(0, topN);

  return { top, bottom };
}

// ── Margin Drift Analysis by Customer ────────────────────────

export interface MarginDriftItem {
  customer: string;
  salesActual: number;
  plannedGPRate: number;
  actualGPRate: number;
  marginDrift: number; // actualGPRate - plannedGPRate (pp)
  driftImpact: number; // salesActual * marginDrift / 100 (추정 이익 영향액)
}

/**
 * 거래처별 계획 대비 매출총이익율 변동 분석.
 * marginDrift > 0: 이익율 개선 / < 0: 이익율 악화.
 * driftImpact: 매출 × 이익율변동 → 금액으로 환산한 영향.
 * topN: 악화 기준 상위 N건 반환.
 */
export function calcMarginDrift(
  data: ProfitabilityAnalysisRecord[],
  topN: number = 15
): MarginDriftItem[] {
  const map = new Map<
    string,
    {
      salesPlan: number;
      salesActual: number;
      gpPlan: number;
      gpActual: number;
    }
  >();

  for (const r of data) {
    const customer = r.매출거래처 || "(미분류)";
    const entry = map.get(customer) || {
      salesPlan: 0,
      salesActual: 0,
      gpPlan: 0,
      gpActual: 0,
    };
    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpPlan += r.매출총이익.계획;
    entry.gpActual += r.매출총이익.실적;
    map.set(customer, entry);
  }

  const items: MarginDriftItem[] = Array.from(map.entries())
    .filter(([, v]) => v.salesActual !== 0 && v.salesPlan !== 0)
    .map(([customer, v]) => {
      const plannedGPRate = (v.gpPlan / v.salesPlan) * 100;
      const actualGPRate = (v.gpActual / v.salesActual) * 100;
      const marginDrift = actualGPRate - plannedGPRate;
      return {
        customer,
        salesActual: v.salesActual,
        plannedGPRate,
        actualGPRate,
        marginDrift,
        driftImpact: (v.salesActual * marginDrift) / 100,
      };
    });

  // Sort by driftImpact ascending (worst erosion first)
  items.sort((a, b) => a.driftImpact - b.driftImpact);

  return items.slice(0, topN);
}
