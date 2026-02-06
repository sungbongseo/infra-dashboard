import type { OrgProfitRecord } from "@/types";

// ─── Interfaces ───────────────────────────────────────────────

export interface ScenarioParams {
  salesChangePercent: number;       // e.g., +10 = 10% increase
  costRateChangePoints: number;     // e.g., +2 = cost rate increases by 2 percentage points
  sgaChangePercent: number;         // e.g., -5 = SGA decreases by 5%
}

export interface ScenarioResult {
  org: string;
  baseSales: number;
  baseGrossProfit: number;
  baseOperatingProfit: number;
  baseOperatingMargin: number;
  scenarioSales: number;
  scenarioGrossProfit: number;
  scenarioOperatingProfit: number;
  scenarioOperatingMargin: number;
  salesDelta: number;
  grossProfitDelta: number;
  operatingProfitDelta: number;
  marginDelta: number;
}

export interface ScenarioSummary {
  baseTotalSales: number;
  baseTotalOperatingProfit: number;
  baseAvgMargin: number;
  scenarioTotalSales: number;
  scenarioTotalOperatingProfit: number;
  scenarioAvgMargin: number;
}

export interface SensitivityPoint {
  paramValue: number;
  operatingProfit: number;
  operatingMargin: number;
}

// ─── What-If Scenario Calculation ─────────────────────────────

/**
 * Calculate what-if scenario results for each organization.
 *
 * For each org:
 *   scenarioSales = 매출액.실적 * (1 + salesChangePercent / 100)
 *   scenarioCostRate = 매출원가율.실적 + costRateChangePoints
 *   scenarioCost = scenarioSales * scenarioCostRate / 100
 *   scenarioGrossProfit = scenarioSales - scenarioCost
 *   scenarioSGA = 판매관리비.실적 * (1 + sgaChangePercent / 100)
 *   scenarioOperatingProfit = scenarioGrossProfit - scenarioSGA
 *   scenarioOperatingMargin = scenarioOperatingProfit / scenarioSales * 100
 */
export function calcWhatIfScenario(
  orgProfit: OrgProfitRecord[],
  params: ScenarioParams
): ScenarioResult[] {
  if (!orgProfit || orgProfit.length === 0) return [];

  const results: ScenarioResult[] = orgProfit.map((org) => {
    // Base values (실적)
    const baseSales = org.매출액.실적;
    const baseCostRate = org.매출원가율.실적;
    const baseGrossProfit = org.매출총이익.실적;
    const baseSGA = org.판매관리비.실적;
    const baseOperatingProfit = org.영업이익.실적;
    const baseOperatingMargin = baseSales !== 0
      ? (baseOperatingProfit / baseSales) * 100
      : 0;

    // Scenario values
    const scenarioSales = baseSales * (1 + params.salesChangePercent / 100);
    const scenarioCostRate = baseCostRate + params.costRateChangePoints;
    // Clamp cost rate to [0, 100] to avoid nonsensical negative costs
    const clampedCostRate = Math.max(0, Math.min(scenarioCostRate, 200));
    const scenarioCost = scenarioSales * clampedCostRate / 100;
    const scenarioGrossProfit = scenarioSales - scenarioCost;
    const scenarioSGA = baseSGA * (1 + params.sgaChangePercent / 100);
    const scenarioOperatingProfit = scenarioGrossProfit - scenarioSGA;
    const scenarioOperatingMargin = scenarioSales !== 0
      ? (scenarioOperatingProfit / scenarioSales) * 100
      : 0;

    return {
      org: org.영업조직팀,
      baseSales,
      baseGrossProfit,
      baseOperatingProfit,
      baseOperatingMargin,
      scenarioSales,
      scenarioGrossProfit,
      scenarioOperatingProfit,
      scenarioOperatingMargin,
      salesDelta: scenarioSales - baseSales,
      grossProfitDelta: scenarioGrossProfit - baseGrossProfit,
      operatingProfitDelta: scenarioOperatingProfit - baseOperatingProfit,
      marginDelta: scenarioOperatingMargin - baseOperatingMargin,
    };
  });

  // Sort by operating profit delta descending (most impacted first)
  results.sort((a, b) => b.operatingProfitDelta - a.operatingProfitDelta);

  return results;
}

// ─── Scenario Summary ─────────────────────────────────────────

/**
 * Calculate aggregate summary for scenario results.
 */
export function calcScenarioSummary(results: ScenarioResult[]): ScenarioSummary {
  if (!results || results.length === 0) {
    return {
      baseTotalSales: 0,
      baseTotalOperatingProfit: 0,
      baseAvgMargin: 0,
      scenarioTotalSales: 0,
      scenarioTotalOperatingProfit: 0,
      scenarioAvgMargin: 0,
    };
  }

  const baseTotalSales = results.reduce((sum, r) => sum + r.baseSales, 0);
  const baseTotalOperatingProfit = results.reduce((sum, r) => sum + r.baseOperatingProfit, 0);
  const baseAvgMargin = baseTotalSales !== 0
    ? (baseTotalOperatingProfit / baseTotalSales) * 100
    : 0;

  const scenarioTotalSales = results.reduce((sum, r) => sum + r.scenarioSales, 0);
  const scenarioTotalOperatingProfit = results.reduce((sum, r) => sum + r.scenarioOperatingProfit, 0);
  const scenarioAvgMargin = scenarioTotalSales !== 0
    ? (scenarioTotalOperatingProfit / scenarioTotalSales) * 100
    : 0;

  return {
    baseTotalSales,
    baseTotalOperatingProfit,
    baseAvgMargin,
    scenarioTotalSales,
    scenarioTotalOperatingProfit,
    scenarioAvgMargin,
  };
}

// ─── Sensitivity Analysis ─────────────────────────────────────

/**
 * Sensitivity analysis: vary one parameter at a time while holding others at zero.
 *
 * @param orgProfit - Organization profit data
 * @param param - Which parameter to vary: "sales", "cost", or "sga"
 * @param range - Array of values to test, e.g. [-20, -10, -5, 0, 5, 10, 20]
 * @returns Array of sensitivity points with total operating profit and margin
 */
export function calcSensitivity(
  orgProfit: OrgProfitRecord[],
  param: "sales" | "cost" | "sga",
  range: number[]
): SensitivityPoint[] {
  if (!orgProfit || orgProfit.length === 0 || !range || range.length === 0) {
    return [];
  }

  // Sort range for consistent output
  const sortedRange = [...range].sort((a, b) => a - b);

  return sortedRange.map((value) => {
    const params: ScenarioParams = {
      salesChangePercent: param === "sales" ? value : 0,
      costRateChangePoints: param === "cost" ? value : 0,
      sgaChangePercent: param === "sga" ? value : 0,
    };

    const results = calcWhatIfScenario(orgProfit, params);
    const summary = calcScenarioSummary(results);

    return {
      paramValue: value,
      operatingProfit: summary.scenarioTotalOperatingProfit,
      operatingMargin: summary.scenarioAvgMargin,
    };
  });
}
