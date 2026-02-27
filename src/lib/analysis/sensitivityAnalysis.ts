// ─── Interfaces ───────────────────────────────────────────────

export interface SensitivityCell {
  priceChange: number;   // % change from base
  volumeChange: number;  // % change from base
  resultSales: number;
  resultGrossProfit: number;
  resultOpProfit: number;
  salesChange: number;   // % change from base
  gpChange: number;
  opChange: number;
}

export interface SensitivityResult {
  baseSales: number;
  baseGrossProfit: number;
  baseOpProfit: number;
  grid: SensitivityCell[];
  priceRange: number[];
  volumeRange: number[];
}

// ─── Core Function ────────────────────────────────────────────

/**
 * Two-variable sensitivity analysis (price x volume).
 * Creates a grid of scenarios showing impact on sales, GP, and operating profit.
 *
 * Model:
 *   new_sales = base_sales * (1 + priceChange%) * (1 + volumeChange%)
 *   new_COGS  = base_COGS  * (1 + volumeChange%)   -- variable cost scales with volume only
 *   new_GP    = new_sales - new_COGS
 *   new_OP    = new_GP - SGA                         -- SGA (판관비) is fixed
 */
export function calcSensitivityGrid(
  baseSales: number,
  baseGrossProfit: number,
  baseOpProfit: number,
  priceSteps: number[] = [-20, -15, -10, -5, 0, 5, 10, 15, 20],
  volumeSteps: number[] = [-20, -15, -10, -5, 0, 5, 10, 15, 20]
): SensitivityResult {
  const grid: SensitivityCell[] = [];

  // GP = Sales - COGS  =>  COGS = Sales - GP
  // OP = GP - SGA       =>  SGA  = GP - OP
  const baseCOGS = baseSales - baseGrossProfit;
  const baseSGA = baseGrossProfit - baseOpProfit;

  for (const priceChange of priceSteps) {
    for (const volumeChange of volumeSteps) {
      const priceFactor = 1 + priceChange / 100;
      const volumeFactor = 1 + volumeChange / 100;

      const resultSales = baseSales * priceFactor * volumeFactor;
      const resultCOGS = baseCOGS * volumeFactor; // COGS scales with volume only
      const resultGP = resultSales - resultCOGS;
      const resultOP = resultGP - baseSGA; // SGA is fixed

      grid.push({
        priceChange,
        volumeChange,
        resultSales,
        resultGrossProfit: resultGP,
        resultOpProfit: resultOP,
        salesChange: baseSales !== 0 ? ((resultSales - baseSales) / Math.abs(baseSales)) * 100 : 0,
        gpChange: baseGrossProfit !== 0 ? ((resultGP - baseGrossProfit) / Math.abs(baseGrossProfit)) * 100 : 0,
        opChange: baseOpProfit !== 0 ? ((resultOP - baseOpProfit) / Math.abs(baseOpProfit)) * 100 : 0,
      });
    }
  }

  return {
    baseSales,
    baseGrossProfit,
    baseOpProfit,
    grid,
    priceRange: priceSteps,
    volumeRange: volumeSteps,
  };
}

// ─── Insight Generation ─────────────────────────────────────

export interface SensitivityInsight {
  dominantFactor: "price" | "volume" | "balanced";
  priceImpact10: number;
  volumeImpact10: number;
  priceDrop10Impact: number;
  recommendation: string;
  riskWarning: string;
  balancePoint: string | null;
}

const METRIC_CHANGE_KEY: Record<"sales" | "gp" | "op", keyof SensitivityCell> = {
  sales: "salesChange",
  gp: "gpChange",
  op: "opChange",
};

export function generateSensitivityInsight(
  result: SensitivityResult,
  metric: "sales" | "gp" | "op"
): SensitivityInsight {
  const key = METRIC_CHANGE_KEY[metric];
  const metricLabel = metric === "sales" ? "매출액" : metric === "gp" ? "매출총이익" : "영업이익";

  // Find specific cells
  const findCell = (p: number, v: number) =>
    result.grid.find((c) => c.priceChange === p && c.volumeChange === v);

  const priceUp10 = findCell(10, 0);
  const volUp10 = findCell(0, 10);
  const priceDown10 = findCell(-10, 0);

  const priceImpact10 = priceUp10 ? (priceUp10[key] as number) : 0;
  const volumeImpact10 = volUp10 ? (volUp10[key] as number) : 0;
  const priceDrop10Impact = priceDown10 ? (priceDown10[key] as number) : 0;

  // Determine dominant factor
  const absPrice = Math.abs(priceImpact10);
  const absVolume = Math.abs(volumeImpact10);
  const ratio = absVolume > 0 ? absPrice / absVolume : absPrice > 0 ? 999 : 1;

  let dominantFactor: "price" | "volume" | "balanced";
  if (ratio >= 1.2) dominantFactor = "price";
  else if (ratio <= 0.8) dominantFactor = "volume";
  else dominantFactor = "balanced";

  // Recommendation
  let recommendation: string;
  if (dominantFactor === "price") {
    recommendation = `${metricLabel} 관점에서 가격이 물량보다 영향력이 큽니다. 가격 방어(인하 최소화)에 우선 집중하고, 불가피한 인하 시 물량 증가로 보전하는 전략이 효과적입니다.`;
  } else if (dominantFactor === "volume") {
    recommendation = `${metricLabel} 관점에서 물량이 가격보다 영향력이 큽니다. 신규 거래처 확보나 기존 거래처 물량 확대에 집중하는 것이 이익 개선에 더 효과적입니다.`;
  } else {
    recommendation = `가격과 물량의 영향력이 비슷합니다. 가격 인상+물량 유지 또는 가격 유지+물량 확대 모두 유사한 효과가 있으므로, 실현 가능성이 높은 쪽을 선택하세요.`;
  }

  // Risk warning
  const riskWarning = isFinite(priceDrop10Impact)
    ? `가격이 10% 하락하면 ${metricLabel}이 약 ${Math.abs(priceDrop10Impact).toFixed(1)}% 감소합니다.${
        Math.abs(priceDrop10Impact) > 15
          ? " 영향이 크므로 가격 인하 시 반드시 물량 증가 조건을 확보하세요."
          : ""
      }`
    : "기준값이 0이므로 변동률을 계산할 수 없습니다.";

  // Balance point: price=-5% cell where change >= 0 at minimum volumeChange
  let balancePoint: string | null = null;
  const priceMinus5Cells = result.grid
    .filter((c) => c.priceChange === -5 && c.volumeChange > 0)
    .sort((a, b) => a.volumeChange - b.volumeChange);

  for (const c of priceMinus5Cells) {
    const changeVal = c[key] as number;
    if (isFinite(changeVal) && changeVal >= 0) {
      balancePoint = `가격을 5% 인하하더라도 물량이 ${c.volumeChange}% 이상 증가하면 ${metricLabel}을 현재 수준으로 유지할 수 있습니다.`;
      break;
    }
  }

  return {
    dominantFactor,
    priceImpact10,
    volumeImpact10,
    priceDrop10Impact,
    recommendation,
    riskWarning,
    balancePoint,
  };
}
