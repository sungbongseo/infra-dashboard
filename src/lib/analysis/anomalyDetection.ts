import type { SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Interfaces ───────────────────────────────────────────────

export interface AnomalyResult {
  month: string;
  value: number;
  type: "upper" | "lower";
  deviation: number; // how far from IQR boundary
}

export interface AnomalyStats {
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  anomalies: AnomalyResult[];
  anomalyRate: number; // percentage of data points that are anomalies
}

// ─── Core Functions ───────────────────────────────────────────

/**
 * IQR-based anomaly detection on monthly aggregated data.
 * multiplier: IQR multiplier for fence (default 1.5, use 3.0 for extreme only)
 */
export function detectAnomalies(
  monthlyData: Array<{ month: string; value: number }>,
  multiplier: number = 1.5
): AnomalyStats {
  if (monthlyData.length < 4) {
    return { q1: 0, q3: 0, iqr: 0, lowerFence: 0, upperFence: 0, anomalies: [], anomalyRate: 0 };
  }

  const sorted = [...monthlyData].map(d => d.value).sort((a, b) => a - b);
  const n = sorted.length;

  const q1Idx = Math.floor(n * 0.25);
  const q3Idx = Math.floor(n * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  const iqr = q3 - q1;

  const lowerFence = q1 - multiplier * iqr;
  const upperFence = q3 + multiplier * iqr;

  const anomalies: AnomalyResult[] = monthlyData
    .filter(d => d.value < lowerFence || d.value > upperFence)
    .map(d => ({
      month: d.month,
      value: d.value,
      type: d.value > upperFence ? ("upper" as const) : ("lower" as const),
      deviation: d.value > upperFence ? d.value - upperFence : lowerFence - d.value,
    }));

  return {
    q1,
    q3,
    iqr,
    lowerFence,
    upperFence,
    anomalies,
    anomalyRate: monthlyData.length > 0 ? (anomalies.length / monthlyData.length) * 100 : 0,
  };
}

/**
 * Detect anomalies from raw sales records.
 * Aggregates by month first, then applies IQR.
 */
export function detectSalesAnomalies(
  sales: SalesRecord[],
  multiplier: number = 1.5
): AnomalyStats {
  const monthMap = new Map<string, number>();
  for (const r of sales) {
    const month = extractMonth(r.매출일);
    if (!month) continue;
    monthMap.set(month, (monthMap.get(month) ?? 0) + r.장부금액);
  }

  const monthlyData = Array.from(monthMap.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return detectAnomalies(monthlyData, multiplier);
}
