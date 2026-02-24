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
