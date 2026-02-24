import type { SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Interfaces ───────────────────────────────────────────────

export interface ChurnRiskCustomer {
  customer: string;
  customerName: string;
  lastPurchaseMonth: string;
  monthsSinceLastPurchase: number;
  purchaseFrequency: number;  // total transactions
  avgMonthlyAmount: number;
  totalAmount: number;
  churnScore: number;  // 0-100, higher = more likely to churn
  riskLevel: "critical" | "high" | "medium" | "low";
  signals: string[];
}

export interface ChurnSummary {
  totalCustomers: number;
  atRiskCustomers: number;
  atRiskRevenue: number;
  riskDistribution: Array<{ level: string; count: number; revenue: number }>;
  customers: ChurnRiskCustomer[];
}

// ─── Helpers ──────────────────────────────────────────────────

function monthDist(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// ─── Core Function ────────────────────────────────────────────

/**
 * Rule-based churn prediction using recency, frequency, and monetary signals.
 */
export function predictChurn(sales: SalesRecord[]): ChurnSummary {
  if (sales.length === 0) {
    return { totalCustomers: 0, atRiskCustomers: 0, atRiskRevenue: 0, riskDistribution: [], customers: [] };
  }

  // Find max month (reference point)
  let maxMonth = "";
  for (const r of sales) {
    const m = extractMonth(r.매출일);
    if (m && m > maxMonth) maxMonth = m;
  }
  if (!maxMonth) {
    return { totalCustomers: 0, atRiskCustomers: 0, atRiskRevenue: 0, riskDistribution: [], customers: [] };
  }

  // Aggregate by customer
  const custMap = new Map<string, {
    name: string;
    lastMonth: string;
    totalAmount: number;
    frequency: number;
    months: Set<string>;
  }>();

  for (const r of sales) {
    const cust = r.매출처 || "";
    if (!cust) continue;
    const month = extractMonth(r.매출일);
    if (!month) continue;

    const entry = custMap.get(cust) || {
      name: r.매출처명 || cust,
      lastMonth: "",
      totalAmount: 0,
      frequency: 0,
      months: new Set<string>(),
    };
    entry.totalAmount += r.장부금액;
    entry.frequency++;
    entry.months.add(month);
    if (!entry.lastMonth || month > entry.lastMonth) entry.lastMonth = month;
    custMap.set(cust, entry);
  }

  // Calculate churn scores
  const customers: ChurnRiskCustomer[] = [];

  for (const [customer, data] of Array.from(custMap.entries())) {
    const monthsSinceLast = monthDist(data.lastMonth, maxMonth);
    const activeMonths = data.months.size;
    const avgMonthlyAmount = activeMonths > 0 ? data.totalAmount / activeMonths : 0;

    const signals: string[] = [];
    let score = 0;

    // Recency signal (0-40 points)
    if (monthsSinceLast >= 6) {
      score += 40;
      signals.push("6개월 이상 미거래");
    } else if (monthsSinceLast >= 4) {
      score += 30;
      signals.push("4~5개월 미거래");
    } else if (monthsSinceLast >= 3) {
      score += 20;
      signals.push("3개월 미거래");
    } else if (monthsSinceLast >= 2) {
      score += 10;
      signals.push("2개월 미거래");
    }

    // Frequency signal (0-30 points)
    if (data.frequency <= 1) {
      score += 30;
      signals.push("단발 거래");
    } else if (data.frequency <= 3) {
      score += 15;
      signals.push("거래 빈도 낮음");
    }

    // Amount decline signal (0-30 points)
    const sortedMonths = Array.from(data.months).sort();
    if (sortedMonths.length >= 3) {
      // Compare first half vs second half activity density
      if (monthsSinceLast >= 2 && data.frequency > 3) {
        score += 20;
        signals.push("최근 거래량 감소 추세");
      }
    }

    const riskLevel: "critical" | "high" | "medium" | "low" =
      score >= 60 ? "critical" :
      score >= 40 ? "high" :
      score >= 20 ? "medium" : "low";

    customers.push({
      customer,
      customerName: data.name,
      lastPurchaseMonth: data.lastMonth,
      monthsSinceLastPurchase: monthsSinceLast,
      purchaseFrequency: data.frequency,
      avgMonthlyAmount,
      totalAmount: data.totalAmount,
      churnScore: Math.min(100, score),
      riskLevel,
      signals,
    });
  }

  // Sort by churn score descending
  customers.sort((a, b) => b.churnScore - a.churnScore);

  // Summary
  const atRisk = customers.filter(c => c.riskLevel === "critical" || c.riskLevel === "high");
  const riskLevels = ["critical", "high", "medium", "low"] as const;
  const riskDistribution = riskLevels.map(level => ({
    level,
    count: customers.filter(c => c.riskLevel === level).length,
    revenue: customers.filter(c => c.riskLevel === level).reduce((s, c) => s + c.totalAmount, 0),
  }));

  return {
    totalCustomers: customers.length,
    atRiskCustomers: atRisk.length,
    atRiskRevenue: atRisk.reduce((s, c) => s + c.totalAmount, 0),
    riskDistribution,
    customers,
  };
}
