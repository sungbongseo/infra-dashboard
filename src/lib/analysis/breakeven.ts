import type { TeamContributionRecord, OrgProfitRecord } from "@/types";

/**
 * SAP CO standard CVP / Break-even Analysis (손익분기점 분석)
 *
 * Key formulas:
 * - 고정비 = 판관고정_감가상각비.실적 + 판관고정_기타경비.실적 + 판관고정_노무비.실적
 * - 변동비율 = 변동비합계.실적 / 매출액.실적
 * - BEP매출 = 고정비 / (1 - 변동비율)
 * - 안전한계율 = (매출액.실적 - BEP매출) / 매출액.실적 x 100
 * - 영업레버리지 = 공헌이익.실적 / 영업이익.실적
 */

export interface BreakevenResult {
  org: string;
  person?: string; // 사번 for team-level
  sales: number; // 매출액 실적
  variableCosts: number; // 변동비합계 실적
  fixedCosts: number; // 고정비 합계
  variableCostRatio: number; // 변동비율 (0~1)
  contributionMarginRatio: number; // 공헌이익률 (0~1)
  bepSales: number; // 손익분기점 매출
  safetyMarginRate: number; // 안전한계율 (%)
  operatingLeverage: number; // 영업레버리지
}

export interface BreakevenChartPoint {
  revenue: number;
  totalCost: number;
  fixedCost: number;
  variableCost: number;
}

/**
 * Per-person BEP calculation using TeamContributionRecord.
 * Filters out rows with zero sales.
 * Edge cases:
 *   - variableCostRatio >= 1 -> BEP is Infinity (cannot break even)
 *   - 영업이익 = 0 -> operatingLeverage = Infinity
 */
export function calcTeamBreakeven(
  data: TeamContributionRecord[]
): BreakevenResult[] {
  const results: BreakevenResult[] = [];

  for (const r of data) {
    const sales = r.매출액.실적;

    // Skip rows with zero sales (cannot compute meaningful ratios)
    if (sales === 0) continue;

    // Fixed costs = 판관고정 3 components
    // Note: 판관고정_노무비 was removed from cost structure 고정비 to avoid
    // double-counting with 노무비, but for BEP analysis it belongs in fixed costs
    const fixedCosts =
      r.판관고정_감가상각비.실적 +
      r.판관고정_기타경비.실적 +
      r.판관고정_노무비.실적;

    // Variable costs from the explicit 변동비합계 field
    const variableCosts = r.변동비합계.실적;

    // Variable cost ratio
    const variableCostRatio = variableCosts / sales;

    // Contribution margin ratio = 1 - variable cost ratio
    const contributionMarginRatio = 1 - variableCostRatio;

    // BEP Sales = fixedCosts / contributionMarginRatio
    // Edge case: if contributionMarginRatio <= 0, BEP is Infinity (cannot break even)
    let bepSales: number;
    if (contributionMarginRatio <= 0) {
      bepSales = Infinity;
    } else {
      bepSales = fixedCosts / contributionMarginRatio;
    }

    // Safety margin rate = (sales - BEP) / sales * 100
    // If BEP is Infinity, safety margin is -Infinity (deeply unprofitable)
    let safetyMarginRate: number;
    if (!isFinite(bepSales)) {
      safetyMarginRate = -Infinity;
    } else {
      safetyMarginRate = ((sales - bepSales) / sales) * 100;
    }

    // Operating leverage = 공헌이익 / 영업이익
    // Edge case: 영업이익 = 0 -> Infinity
    const contributionMargin = r.공헌이익.실적;
    const operatingProfit = r.영업이익.실적;
    let operatingLeverage: number;
    if (operatingProfit === 0) {
      operatingLeverage = contributionMargin === 0 ? 0 : Infinity;
    } else {
      operatingLeverage = contributionMargin / operatingProfit;
    }

    results.push({
      org: r.영업조직팀,
      person: r.영업담당사번,
      sales,
      variableCosts,
      fixedCosts,
      variableCostRatio,
      contributionMarginRatio,
      bepSales,
      safetyMarginRate,
      operatingLeverage,
    });
  }

  return results;
}

/**
 * Per-org BEP calculation using OrgProfitRecord.
 *
 * OrgProfitRecord does not have explicit 변동비합계 or 판관고정 detail fields.
 * We derive the variable cost ratio from the 공헌이익율:
 *   공헌이익율 = 공헌이익 / 매출액 * 100 (already in the record as PlanActualDiff)
 *   변동비율 = 1 - (공헌이익율.실적 / 100)
 *
 * For fixed costs, we use:
 *   총비용 = 매출액 - 영업이익 (= 매출원가 + 판매관리비)
 *   변동비 = 매출액 * 변동비율
 *   고정비 = 총비용 - 변동비
 *
 * This is equivalent to: 고정비 = 공헌이익 - 영업이익 = 판매관리비 중 고정부분
 * More directly: 고정비 = 공헌이익.실적 - 영업이익.실적
 */
export function calcOrgBreakeven(data: OrgProfitRecord[]): BreakevenResult[] {
  const results: BreakevenResult[] = [];

  for (const r of data) {
    const sales = r.매출액.실적;

    // Skip rows with zero sales
    if (sales === 0) continue;

    // Use 공헌이익율 from the record to derive variable cost ratio
    const contributionMarginRatio = r.공헌이익율.실적 / 100;
    const variableCostRatio = 1 - contributionMarginRatio;

    // Variable costs = sales * variable cost ratio
    const variableCosts = sales * variableCostRatio;

    // Fixed costs = 공헌이익 - 영업이익
    // This represents the fixed portion of SGA expenses
    const fixedCosts = r.공헌이익.실적 - r.영업이익.실적;

    // BEP Sales = fixedCosts / contributionMarginRatio
    let bepSales: number;
    if (contributionMarginRatio <= 0) {
      bepSales = Infinity;
    } else {
      bepSales = fixedCosts / contributionMarginRatio;
    }

    // Safety margin rate
    let safetyMarginRate: number;
    if (!isFinite(bepSales)) {
      safetyMarginRate = -Infinity;
    } else {
      safetyMarginRate = ((sales - bepSales) / sales) * 100;
    }

    // Operating leverage = 공헌이익 / 영업이익
    const operatingProfit = r.영업이익.실적;
    let operatingLeverage: number;
    if (operatingProfit === 0) {
      operatingLeverage = r.공헌이익.실적 === 0 ? 0 : Infinity;
    } else {
      operatingLeverage = r.공헌이익.실적 / operatingProfit;
    }

    results.push({
      org: r.영업조직팀,
      sales,
      variableCosts,
      fixedCosts,
      variableCostRatio,
      contributionMarginRatio,
      bepSales,
      safetyMarginRate,
      operatingLeverage,
    });
  }

  return results;
}

/**
 * Org-level BEP calculation aggregated from TeamContributionRecord.
 * Uses actual 판관고정 3항목 (감가상각비, 기타경비, 노무비) summed by org.
 * More accurate than calcOrgBreakeven() which derives fixed costs from 공헌이익-영업이익.
 */
export function calcOrgBreakevenFromTeam(
  data: TeamContributionRecord[]
): BreakevenResult[] {
  // Group by org
  const orgMap = new Map<
    string,
    {
      sales: number;
      variableCosts: number;
      fixedCosts: number;
      contributionMargin: number;
      operatingProfit: number;
    }
  >();

  for (const r of data) {
    const org = r.영업조직팀;
    if (!org) continue;

    const person = String(r.영업담당사번 || "").trim();
    if (person === "") continue; // 소계 행 제거

    const entry = orgMap.get(org) || {
      sales: 0,
      variableCosts: 0,
      fixedCosts: 0,
      contributionMargin: 0,
      operatingProfit: 0,
    };

    entry.sales += r.매출액.실적;
    entry.variableCosts += r.변동비합계.실적;
    entry.fixedCosts +=
      r.판관고정_감가상각비.실적 +
      r.판관고정_기타경비.실적 +
      r.판관고정_노무비.실적;
    entry.contributionMargin += r.공헌이익.실적;
    entry.operatingProfit += r.영업이익.실적;

    orgMap.set(org, entry);
  }

  const results: BreakevenResult[] = [];

  Array.from(orgMap.entries()).forEach(([org, v]) => {
    if (v.sales === 0) return;

    const variableCostRatio = v.variableCosts / v.sales;
    const contributionMarginRatio = 1 - variableCostRatio;

    let bepSales: number;
    if (contributionMarginRatio <= 0) {
      bepSales = Infinity;
    } else {
      bepSales = v.fixedCosts / contributionMarginRatio;
    }

    let safetyMarginRate: number;
    if (!isFinite(bepSales)) {
      safetyMarginRate = -Infinity;
    } else {
      safetyMarginRate = ((v.sales - bepSales) / v.sales) * 100;
    }

    let operatingLeverage: number;
    if (v.operatingProfit === 0) {
      operatingLeverage = v.contributionMargin === 0 ? 0 : Infinity;
    } else {
      operatingLeverage = v.contributionMargin / v.operatingProfit;
    }

    results.push({
      org,
      sales: v.sales,
      variableCosts: v.variableCosts,
      fixedCosts: v.fixedCosts,
      variableCostRatio,
      contributionMarginRatio,
      bepSales,
      safetyMarginRate,
      operatingLeverage,
    });
  });

  return results;
}

/**
 * Generate data points for BEP chart visualization.
 * Creates 20 evenly spaced points from 0 to maxRevenue.
 *
 * At each revenue point:
 *   variableCost = revenue * variableCostRatio
 *   totalCost = fixedCosts + variableCost
 *   fixedCost = fixedCosts (constant line)
 *
 * The intersection of revenue and totalCost lines is the break-even point.
 */
export function calcBreakevenChart(
  fixedCosts: number,
  variableCostRatio: number,
  maxRevenue: number
): BreakevenChartPoint[] {
  const points: BreakevenChartPoint[] = [];
  const steps = 20;

  // Guard against invalid inputs
  if (maxRevenue <= 0 || !isFinite(maxRevenue)) return points;
  if (!isFinite(fixedCosts)) return points;

  const step = maxRevenue / steps;

  for (let i = 0; i <= steps; i++) {
    const revenue = step * i;
    const variableCost = revenue * variableCostRatio;
    const totalCost = fixedCosts + variableCost;

    points.push({
      revenue,
      totalCost,
      fixedCost: fixedCosts,
      variableCost,
    });
  }

  return points;
}
