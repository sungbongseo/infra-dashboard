// ─── Interfaces ───────────────────────────────────────────────

export interface DecompositionPoint {
  month: string;
  original: number;
  trend: number;
  seasonal: number;
  residual: number;
}

export interface DecompositionResult {
  points: DecompositionPoint[];
  seasonalPattern: Array<{ monthIndex: number; factor: number }>; // 1-12
  trendDirection: "up" | "down" | "flat";
  seasonalStrength: number; // 0-1, how strong seasonal pattern is
}

// ─── Core Function ────────────────────────────────────────────

/**
 * Additive time series decomposition.
 * Original = Trend + Seasonal + Residual
 * Uses centered moving average for trend and seasonal averaging.
 */
export function decomposeTimeSeries(
  monthlyData: Array<{ month: string; value: number }>,
  period: number = 12
): DecompositionResult {
  const empty: DecompositionResult = {
    points: [],
    seasonalPattern: [],
    trendDirection: "flat",
    seasonalStrength: 0,
  };

  if (monthlyData.length < period + 1) return empty;

  const sorted = [...monthlyData].sort((a, b) => a.month.localeCompare(b.month));
  const values = sorted.map(d => d.value);
  const n = values.length;

  // 1. Calculate trend using centered moving average
  const halfWindow = Math.floor(period / 2);
  const windowSize = period % 2 === 0 ? period + 1 : period;
  const trend: (number | null)[] = new Array(n).fill(null);

  for (let i = halfWindow; i < n - halfWindow; i++) {
    let sum = 0;
    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      sum += values[j];
    }
    trend[i] = sum / windowSize;
  }

  // Fill edges with extrapolation
  // Forward fill start
  const firstTrend = trend.findIndex(t => t !== null);
  if (firstTrend > 0 && trend[firstTrend] !== null) {
    for (let i = 0; i < firstTrend; i++) trend[i] = trend[firstTrend];
  }
  // Backward fill end
  let lastTrend = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (trend[i] !== null) {
      lastTrend = i;
      break;
    }
  }
  if (lastTrend >= 0 && lastTrend < n - 1) {
    for (let i = lastTrend + 1; i < n; i++) trend[i] = trend[lastTrend];
  }

  // 2. Detrend: seasonal + residual = original - trend
  const detrended = values.map((v, i) => v - (trend[i] ?? v));

  // 3. Average seasonal component by month-of-year
  const seasonalSums = new Array(12).fill(0);
  const seasonalCounts = new Array(12).fill(0);

  for (let i = 0; i < n; i++) {
    const monthParts = sorted[i].month.split("-");
    const monthIdx = parseInt(monthParts[1], 10) - 1; // 0-11
    if (monthIdx >= 0 && monthIdx < 12) {
      seasonalSums[monthIdx] += detrended[i];
      seasonalCounts[monthIdx]++;
    }
  }

  const seasonalAvg = seasonalSums.map((s, i) =>
    seasonalCounts[i] > 0 ? s / seasonalCounts[i] : 0
  );

  // Normalize so seasonal components sum to 0
  const seasonalMean = seasonalAvg.reduce((s, v) => s + v, 0) / 12;
  const seasonal = seasonalAvg.map(v => v - seasonalMean);

  // 4. Build decomposition points
  const points: DecompositionPoint[] = sorted.map((d, i) => {
    const monthParts = d.month.split("-");
    const monthIdx = parseInt(monthParts[1], 10) - 1;
    const trendVal = trend[i] ?? d.value;
    const seasonalVal = monthIdx >= 0 && monthIdx < 12 ? seasonal[monthIdx] : 0;
    const residual = d.value - trendVal - seasonalVal;

    return {
      month: d.month,
      original: d.value,
      trend: trendVal,
      seasonal: seasonalVal,
      residual,
    };
  });

  // 5. Seasonal pattern (1-12 indexed)
  const seasonalPattern = seasonal.map((factor, i) => ({ monthIndex: i + 1, factor }));

  // 6. Trend direction
  const trendValues = points.filter(p => p.trend !== 0).map(p => p.trend);
  let trendDirection: "up" | "down" | "flat" = "flat";
  if (trendValues.length >= 2) {
    const firstHalf = trendValues.slice(0, Math.floor(trendValues.length / 2));
    const secondHalf = trendValues.slice(Math.floor(trendValues.length / 2));
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const change = firstAvg !== 0 ? (secondAvg - firstAvg) / Math.abs(firstAvg) : 0;
    if (change > 0.05) trendDirection = "up";
    else if (change < -0.05) trendDirection = "down";
  }

  // 7. Seasonal strength = 1 - Var(residual) / Var(detrended)
  const varDetrended = detrended.reduce((s, v) => s + v * v, 0) / n;
  const residuals = points.map(p => p.residual);
  const varResidual = residuals.reduce((s, v) => s + v * v, 0) / n;
  const seasonalStrength = varDetrended > 0
    ? Math.max(0, Math.min(1, 1 - varResidual / varDetrended))
    : 0;

  return { points, seasonalPattern, trendDirection, seasonalStrength };
}
