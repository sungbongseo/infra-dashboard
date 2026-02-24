import type { SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Interfaces ───────────────────────────────────────────────

export interface ForecastPoint {
  month: string;
  actual?: number;
  movingAvg3?: number;  // 3-month moving average
  movingAvg6?: number;  // 6-month moving average
  forecast?: number;    // linear regression forecast
  upperBound?: number;  // +1 std dev
  lowerBound?: number;  // -1 std dev
}

export interface ForecastStats {
  slope: number;
  intercept: number;
  r2: number;
  trend: "up" | "down" | "flat";
  avgGrowthRate: number; // MoM average growth %
}

// ─── Monthly totals ──────────────────────────────────────────

/**
 * Generate monthly totals from sales records.
 * Groups by extractMonth(매출일), sums 장부금액, returns sorted chronologically.
 */
export function calcMonthlySalesTotals(
  sales: SalesRecord[]
): { month: string; amount: number }[] {
  if (sales.length === 0) return [];

  const monthMap = new Map<string, number>();
  for (const r of sales) {
    const month = extractMonth(r.매출일);
    if (!month) continue;
    monthMap.set(month, (monthMap.get(month) ?? 0) + r.장부금액);
  }

  return Array.from(monthMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ─── Moving Average ──────────────────────────────────────────

/**
 * Simple Moving Average.
 * Returns null for positions where the window is not yet full.
 */
function movingAverage(data: number[], window: number): (number | null)[] {
  if (window <= 0 || data.length === 0) return data.map(() => null);

  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - window + 1; j <= i; j++) {
        sum += data[j];
      }
      result.push(sum / window);
    }
  }
  return result;
}

// ─── Linear Regression ───────────────────────────────────────

/**
 * Ordinary least squares: y = slope * x + intercept
 * x values are 0-indexed integers (month positions).
 * Returns slope, intercept, and R-squared.
 */
function linearRegression(values: number[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0, r2: 0 };
  if (n === 1) return { slope: 0, intercept: values[0], r2: 1 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denominator = sumX2 - n * meanX * meanX;

  // All x values are the same (should not happen with sequential indices, but guard)
  if (denominator === 0) {
    return { slope: 0, intercept: meanY, r2: 0 };
  }

  const slope = (sumXY - n * meanX * meanY) / denominator;
  const intercept = meanY - slope * meanX;

  // R-squared
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    ssTot += (values[i] - meanY) ** 2;
    ssRes += (values[i] - predicted) ** 2;
  }

  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

// ─── Standard deviation of residuals ─────────────────────────

function calcResidualStdDev(
  values: number[],
  slope: number,
  intercept: number
): number {
  const n = values.length;
  if (n <= 2) return 0;

  let sumSqResiduals = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * i + intercept;
    sumSqResiduals += (values[i] - predicted) ** 2;
  }

  // Use n-2 degrees of freedom for linear regression
  return Math.sqrt(sumSqResiduals / (n - 2));
}

// ─── Generate next month string ──────────────────────────────

function nextMonth(monthStr: string): string {
  const [yearStr, monStr] = monthStr.split("-");
  let year = parseInt(yearStr, 10);
  let mon = parseInt(monStr, 10);
  mon += 1;
  if (mon > 12) {
    mon = 1;
    year += 1;
  }
  return `${year}-${String(mon).padStart(2, "0")}`;
}

// ─── Average MoM growth rate ─────────────────────────────────

function calcAvgGrowthRate(values: number[]): number {
  if (values.length < 2) return 0;

  let totalGrowth = 0;
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      totalGrowth += ((values[i] - values[i - 1]) / Math.abs(values[i - 1])) * 100;
      count++;
    }
  }

  return count > 0 ? totalGrowth / count : 0;
}

// ─── Main Forecast Function ──────────────────────────────────

/**
 * Sales forecast with moving averages, linear regression, and confidence bounds.
 *
 * @param sales - Sales records
 * @param forecastMonths - Number of months to forecast ahead (default: 3)
 * @returns Combined historical + forecast points and statistics
 */
export function calcSalesForecast(
  sales: SalesRecord[],
  forecastMonths: number = 3
): { points: ForecastPoint[]; stats: ForecastStats } {
  const emptyStats: ForecastStats = {
    slope: 0,
    intercept: 0,
    r2: 0,
    trend: "flat",
    avgGrowthRate: 0,
  };

  if (sales.length === 0) {
    return { points: [], stats: emptyStats };
  }

  // 1. Calculate monthly totals
  const monthlyTotals = calcMonthlySalesTotals(sales);
  if (monthlyTotals.length === 0) {
    return { points: [], stats: emptyStats };
  }

  const amounts = monthlyTotals.map((m) => m.amount);
  const months = monthlyTotals.map((m) => m.month);

  // 2. Apply moving averages
  const ma3 = movingAverage(amounts, 3);
  const ma6 = movingAverage(amounts, 6);

  // 3. Fit linear regression
  const { slope, intercept, r2 } = linearRegression(amounts);

  // 4. Calculate residual std dev for confidence bounds
  const stdDev = calcResidualStdDev(amounts, slope, intercept);

  // 5. Determine trend
  const trendThreshold = Math.abs(intercept) * 0.01; // 1% of intercept as flat threshold
  let trend: "up" | "down" | "flat";
  if (slope > trendThreshold) {
    trend = "up";
  } else if (slope < -trendThreshold) {
    trend = "down";
  } else {
    trend = "flat";
  }

  // 6. Build historical points
  const points: ForecastPoint[] = monthlyTotals.map((m, i) => ({
    month: m.month,
    actual: m.amount,
    movingAvg3: ma3[i] ?? undefined,
    movingAvg6: ma6[i] ?? undefined,
  }));

  // 7. Extend forecast points with distance-proportional 95% confidence interval
  const n = amounts.length;
  // Sum of squared deviations from mean x for prediction interval
  const meanX = (n - 1) / 2;
  let sumXDevSq = 0;
  for (let j = 0; j < n; j++) {
    sumXDevSq += (j - meanX) * (j - meanX);
  }

  let lastMonth = months[months.length - 1];
  for (let i = 0; i < forecastMonths; i++) {
    const xIndex = n + i;
    const forecastValue = slope * xIndex + intercept;
    lastMonth = nextMonth(lastMonth);

    // Prediction interval widens with distance from data center
    const distance = xIndex - meanX;
    const predictionSE = sumXDevSq > 0
      ? stdDev * Math.sqrt(1 + 1 / n + (distance * distance) / sumXDevSq)
      : stdDev;

    points.push({
      month: lastMonth,
      forecast: forecastValue,
      upperBound: forecastValue + 1.96 * predictionSE, // 95% CI
      lowerBound: forecastValue - 1.96 * predictionSE,
    });
  }

  // 8. Calculate average growth rate
  const avgGrowthRate = calcAvgGrowthRate(amounts);

  const stats: ForecastStats = {
    slope,
    intercept,
    r2,
    trend,
    avgGrowthRate,
  };

  return { points, stats };
}
