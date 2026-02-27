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

// ─── Enhanced Anomaly Detection ──────────────────────────────

export interface AnomalyCustomerContributor {
  customerName: string;
  currentAmount: number;
  previousAmount: number;
  change: number;
  changeRate: number; // percentage
}

export interface EnhancedAnomalyResult extends AnomalyResult {
  transactionCount: number;
  momChange: number; // MoM percentage change
  severity: number; // σ units from mean
  topContributors: AnomalyCustomerContributor[];
  causeDescription: string;
}

export interface EnhancedAnomalyStats extends AnomalyStats {
  mean: number;
  stdDev: number;
  enhancedAnomalies: EnhancedAnomalyResult[];
}

/**
 * Enhanced anomaly detection with cause analysis.
 * Adds per-month transaction count, MoM change, severity (σ), top-5 customer contributors,
 * and auto-generated cause description.
 * Preserves existing detectAnomalies() logic 100%.
 */
export function detectEnhancedSalesAnomalies(
  sales: SalesRecord[],
  multiplier: number = 1.5
): EnhancedAnomalyStats {
  // 1. Aggregate: monthly total + monthly customer breakdown + monthly transaction count
  const monthTotalMap = new Map<string, number>();
  const monthCountMap = new Map<string, number>();
  const monthCustomerMap = new Map<string, Map<string, number>>();

  for (const r of sales) {
    const month = extractMonth(r.매출일);
    if (!month) continue;

    monthTotalMap.set(month, (monthTotalMap.get(month) ?? 0) + r.장부금액);
    monthCountMap.set(month, (monthCountMap.get(month) ?? 0) + 1);

    const custName = r.매출처명 || r.매출처 || "미상";
    let custMap = monthCustomerMap.get(month);
    if (!custMap) {
      custMap = new Map<string, number>();
      monthCustomerMap.set(month, custMap);
    }
    custMap.set(custName, (custMap.get(custName) ?? 0) + r.장부금액);
  }

  const monthlyData = Array.from(monthTotalMap.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 2. Run existing IQR detection (100% preserved)
  const baseStats = detectAnomalies(monthlyData, multiplier);

  // 3. Calculate mean and stdDev
  const values = monthlyData.map((d) => d.value);
  const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  const variance =
    values.length > 1
      ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);

  // 4. Build month index for previous month lookup
  const monthIndex = new Map<string, number>();
  monthlyData.forEach((d, i) => monthIndex.set(d.month, i));

  // 5. Enhance each anomaly
  const enhancedAnomalies: EnhancedAnomalyResult[] = baseStats.anomalies.map((a) => {
    const idx = monthIndex.get(a.month) ?? -1;
    const prevMonth = idx > 0 ? monthlyData[idx - 1] : null;
    const prevValue = prevMonth?.value ?? 0;
    const momChange = prevValue !== 0 ? ((a.value - prevValue) / Math.abs(prevValue)) * 100 : 0;
    const severity = stdDev > 0 ? Math.abs(a.value - mean) / stdDev : 0;
    const txCount = monthCountMap.get(a.month) ?? 0;

    // Top 5 contributors by absolute change
    const currentCustMap = monthCustomerMap.get(a.month) ?? new Map<string, number>();
    const prevCustMap = prevMonth ? (monthCustomerMap.get(prevMonth.month) ?? new Map<string, number>()) : new Map<string, number>();

    const allCustomers = new Set([
      ...Array.from(currentCustMap.keys()),
      ...Array.from(prevCustMap.keys()),
    ]);

    const contributors: AnomalyCustomerContributor[] = Array.from(allCustomers).map((name) => {
      const cur = currentCustMap.get(name) ?? 0;
      const prev = prevCustMap.get(name) ?? 0;
      const change = cur - prev;
      const changeRate = prev !== 0 ? (change / Math.abs(prev)) * 100 : cur !== 0 ? 100 : 0;
      return { customerName: name, currentAmount: cur, previousAmount: prev, change, changeRate };
    });

    contributors.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
    const topContributors = contributors.slice(0, 5);

    // Auto-generate cause description
    const direction = a.type === "upper" ? "증가" : "감소";
    const momText = isFinite(momChange)
      ? `전월 대비 매출 ${Math.abs(momChange).toFixed(1)}% ${direction}`
      : `전월 데이터 없음`;
    const custTexts = topContributors
      .filter((c) => Math.abs(c.change) > 0)
      .slice(0, 3)
      .map((c) => {
        const sign = c.change >= 0 ? "+" : "";
        return `${c.customerName}(${sign}${formatCompact(c.change)})`;
      });
    const causeDescription = `${a.month}: ${momText}. ${custTexts.length > 0 ? `주요 ${direction} 거래처: ${custTexts.join(", ")}` : "개별 거래처 변동 정보 없음"}`;

    return {
      ...a,
      transactionCount: txCount,
      momChange,
      severity,
      topContributors,
      causeDescription,
    };
  });

  return {
    ...baseStats,
    mean,
    stdDev,
    enhancedAnomalies,
  };
}

/** Compact number format for cause descriptions (억/만원) */
function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e8) return `${(value / 1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(0)}만`;
  return `${value.toFixed(0)}원`;
}
