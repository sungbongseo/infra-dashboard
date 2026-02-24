import type { SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Interfaces ───────────────────────────────────────────────

export interface RfmScore {
  customer: string;       // 매출처 code
  customerName: string;   // 매출처명
  recency: number;        // months since last purchase (lower = better)
  frequency: number;      // total transaction count
  monetary: number;       // total sales amount (장부금액)
  rScore: number;         // 1-5 quintile (5=best=most recent)
  fScore: number;         // 1-5 quintile (5=highest frequency)
  mScore: number;         // 1-5 quintile (5=highest monetary)
  rfmSegment: string;     // VIP, Loyal, Potential, At-risk, Dormant, Lost
  totalScore: number;     // R+F+M
}

export interface RfmSegmentSummary {
  segment: string;
  count: number;
  totalSales: number;
  avgSales: number;
  share: number; // percentage of total sales
}

// ─── Quintile scoring ────────────────────────────────────────

/**
 * Assign quintile scores 1-5 to values.
 * Values are sorted ascending; each quintile gets score 1..5 (5=highest).
 * If `invertScore` is true, 5=lowest value (used for recency where lower is better).
 */
function assignQuintiles(
  values: { index: number; value: number }[],
  invertScore: boolean
): Map<number, number> {
  const scoreMap = new Map<number, number>();
  if (values.length === 0) return scoreMap;

  // Sort ascending by value
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const n = sorted.length;

  for (let i = 0; i < n; i++) {
    // quintile position: 1-5 based on rank
    // For small datasets (n < 5), use evenly-spaced distribution
    // e.g. n=3 → [1,3,5], n=4 → [1,2,4,5], n=2 → [1,5], n=1 → [3]
    const rawScore = n < 5
      ? (n === 1 ? 3 : Math.round(1 + (i / (n - 1)) * 4))
      : Math.min(5, Math.floor((i / n) * 5) + 1);
    const score = invertScore ? (6 - rawScore) : rawScore;
    scoreMap.set(sorted[i].index, score);
  }

  return scoreMap;
}

// ─── Month distance ──────────────────────────────────────────

/**
 * Calculate distance in months between two YYYY-MM strings.
 * Returns 0 if both are the same month.
 */
function monthDistance(from: string, to: string): number {
  if (!from || !to) return 0;

  const [fromYear, fromMon] = from.split("-").map(Number);
  const [toYear, toMon] = to.split("-").map(Number);

  if (isNaN(fromYear) || isNaN(fromMon) || isNaN(toYear) || isNaN(toMon)) {
    return 0;
  }

  return (toYear - fromYear) * 12 + (toMon - fromMon);
}

// ─── Segment classification ──────────────────────────────────

function classifySegment(r: number, f: number, m: number): string {
  // VIP: top tier across all dimensions
  if (r >= 4 && f >= 4 && m >= 4) return "VIP";
  // Loyal: consistently engaged with good spending
  if (f >= 3 && m >= 3) return "Loyal";
  // Potential: recently active but not yet frequent
  if (r >= 4 && m >= 2 && f < 3) return "Potential";
  // At-risk: was frequent but hasn't purchased recently
  if (r <= 2 && f >= 3) return "At-risk";
  // Dormant: hasn't purchased recently, low frequency, but had meaningful spend
  if (r <= 2 && f <= 2 && m >= 3) return "Dormant";
  // Lost: low on all dimensions
  if (r <= 2 && f <= 2 && m <= 2) return "Lost";
  // Default: moderate across dimensions
  return "Potential";
}

// ─── Customer data aggregation ───────────────────────────────

interface CustomerAgg {
  customer: string;
  customerName: string;
  lastMonth: string;
  frequency: number;
  monetary: number;
}

function aggregateByCustomer(sales: SalesRecord[]): CustomerAgg[] {
  const customerMap = new Map<
    string,
    { customerName: string; lastMonth: string; frequency: number; monetary: number }
  >();

  for (const r of sales) {
    const custKey = r.매출처 || "";
    if (!custKey) continue;

    const month = extractMonth(r.매출일);
    const existing = customerMap.get(custKey);

    if (existing) {
      existing.frequency += 1;
      existing.monetary += r.장부금액;
      // Update lastMonth if this transaction is more recent
      if (month && month > existing.lastMonth) {
        existing.lastMonth = month;
      }
      // Keep the latest non-empty name
      if (r.매출처명 && r.매출처명.trim()) {
        existing.customerName = r.매출처명;
      }
    } else {
      customerMap.set(custKey, {
        customerName: r.매출처명 || "",
        lastMonth: month,
        frequency: 1,
        monetary: r.장부금액,
      });
    }
  }

  return Array.from(customerMap.entries()).map(([customer, data]) => ({
    customer,
    ...data,
  }));
}

// ─── Main RFM scoring ────────────────────────────────────────

/**
 * Calculate RFM scores for all customers in the sales data.
 * Quintile-based scoring with segment classification.
 */
export function calcRfmScores(sales: SalesRecord[]): RfmScore[] {
  if (sales.length === 0) return [];

  // 1. Find the most recent month in all data (reference point for recency)
  let maxMonth = "";
  for (const r of sales) {
    const month = extractMonth(r.매출일);
    if (month && month > maxMonth) {
      maxMonth = month;
    }
  }
  if (!maxMonth) return [];

  // 2. Aggregate by customer
  const customers = aggregateByCustomer(sales);
  if (customers.length === 0) return [];

  // 3. Calculate recency (months since last purchase)
  const recencyValues: { index: number; value: number }[] = [];
  const frequencyValues: { index: number; value: number }[] = [];
  const monetaryValues: { index: number; value: number }[] = [];

  for (let i = 0; i < customers.length; i++) {
    const c = customers[i];
    const recency = c.lastMonth ? monthDistance(c.lastMonth, maxMonth) : 999;
    recencyValues.push({ index: i, value: recency });
    frequencyValues.push({ index: i, value: c.frequency });
    monetaryValues.push({ index: i, value: c.monetary });
  }

  // 4. Assign quintile scores
  // Recency: inverted (lower recency = higher score)
  const rScores = assignQuintiles(recencyValues, true);
  // Frequency: normal (higher frequency = higher score)
  const fScores = assignQuintiles(frequencyValues, false);
  // Monetary: normal (higher monetary = higher score)
  const mScores = assignQuintiles(monetaryValues, false);

  // 5. Build results with segment classification
  const results: RfmScore[] = customers.map((c, i) => {
    const recency = recencyValues[i].value;
    const rScore = rScores.get(i) ?? 3;
    const fScore = fScores.get(i) ?? 3;
    const mScore = mScores.get(i) ?? 3;
    const rfmSegment = classifySegment(rScore, fScore, mScore);

    return {
      customer: c.customer,
      customerName: c.customerName,
      recency,
      frequency: c.frequency,
      monetary: c.monetary,
      rScore,
      fScore,
      mScore,
      rfmSegment,
      totalScore: rScore + fScore + mScore,
    };
  });

  // Sort by totalScore descending, then monetary descending
  results.sort((a, b) => b.totalScore - a.totalScore || b.monetary - a.monetary);

  return results;
}

// ─── Segment summary ─────────────────────────────────────────

/**
 * Aggregate RFM scores by segment.
 * Returns summary with count, total sales, avg sales, and share.
 */
export function calcRfmSegmentSummary(scores: RfmScore[]): RfmSegmentSummary[] {
  if (scores.length === 0) return [];

  const segmentMap = new Map<string, { count: number; totalSales: number }>();

  for (const s of scores) {
    const existing = segmentMap.get(s.rfmSegment);
    if (existing) {
      existing.count += 1;
      existing.totalSales += s.monetary;
    } else {
      segmentMap.set(s.rfmSegment, { count: 1, totalSales: s.monetary });
    }
  }

  const grandTotal = scores.reduce((sum, s) => sum + s.monetary, 0);

  // Define segment order for consistent display
  const segmentOrder = ["VIP", "Loyal", "Potential", "At-risk", "Dormant", "Lost"];

  const results: RfmSegmentSummary[] = Array.from(segmentMap.entries())
    .map(([segment, data]) => ({
      segment,
      count: data.count,
      totalSales: data.totalSales,
      avgSales: data.count > 0 ? data.totalSales / data.count : 0,
      share: grandTotal > 0 ? (data.totalSales / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => {
      const aIdx = segmentOrder.indexOf(a.segment);
      const bIdx = segmentOrder.indexOf(b.segment);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

  return results;
}

// ─── Segment action mapping ─────────────────────────────────

export const RFM_SEGMENT_ACTIONS: Record<string, { action: string; description: string; priority: "high" | "medium" | "low" }> = {
  VIP: { action: "VIP 전용 혜택 유지", description: "개인화된 서비스와 우선 지원으로 이탈 방지", priority: "high" },
  Loyal: { action: "크로스셀/업셀 추진", description: "신규 제품군 제안 및 주문량 확대 유도", priority: "high" },
  Potential: { action: "육성 프로그램 적용", description: "정기 방문 및 샘플 제공으로 거래 빈도 증가 유도", priority: "medium" },
  "At-risk": { action: "긴급 리텐션 캠페인", description: "할인 또는 특별 조건 제안, 이탈 원인 파악", priority: "high" },
  Dormant: { action: "재활성화 캠페인", description: "한정 프로모션으로 재구매 유도", priority: "medium" },
  Lost: { action: "원인 분석 후 선별 접근", description: "이탈 원인 분석, ROI 높은 고객만 선별 재접근", priority: "low" },
};

export function getSegmentAction(segment: string) {
  return RFM_SEGMENT_ACTIONS[segment] || { action: "모니터링", description: "정기적인 거래 현황 모니터링", priority: "low" as const };
}
