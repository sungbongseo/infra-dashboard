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
    monthlyAmounts: Map<string, number>;
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
      monthlyAmounts: new Map<string, number>(),
    };
    entry.totalAmount += r.장부금액;
    entry.frequency++;
    entry.months.add(month);
    entry.monthlyAmounts.set(month, (entry.monthlyAmounts.get(month) || 0) + r.장부금액);
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

    // Recency signal (0-40 points) — B2B 인프라 사업 기준
    // 프로젝트 사이클 6-12개월이 일반적이므로 임계값 상향 조정
    if (monthsSinceLast >= 12) {
      score += 40;
      signals.push("12개월 이상 미거래");
    } else if (monthsSinceLast >= 9) {
      score += 30;
      signals.push("9~11개월 미거래");
    } else if (monthsSinceLast >= 6) {
      score += 20;
      signals.push("6~8개월 미거래");
    } else if (monthsSinceLast >= 3) {
      score += 10;
      signals.push("3~5개월 미거래");
    }

    // Frequency signal (0-30 points)
    if (data.frequency <= 1) {
      score += 30;
      signals.push("단발 거래");
    } else if (data.frequency <= 3) {
      score += 15;
      signals.push("거래 빈도 낮음");
    }

    // Amount decline signal (0-30 points) — 실제 금액 비교 기반
    const sortedMonths = Array.from(data.months).sort();
    if (sortedMonths.length >= 3) {
      const mid = Math.floor(sortedMonths.length / 2);
      const firstHalfMonths = sortedMonths.slice(0, mid);
      const secondHalfMonths = sortedMonths.slice(mid);

      const firstHalfAvg = firstHalfMonths.length > 0
        ? firstHalfMonths.reduce((s, m) => s + (data.monthlyAmounts.get(m) || 0), 0) / firstHalfMonths.length
        : 0;
      const secondHalfAvg = secondHalfMonths.length > 0
        ? secondHalfMonths.reduce((s, m) => s + (data.monthlyAmounts.get(m) || 0), 0) / secondHalfMonths.length
        : 0;

      // 최근 절반 기간 평균 금액이 이전 절반 대비 20%+ 감소
      if (firstHalfAvg > 0 && secondHalfAvg < firstHalfAvg * 0.8) {
        const declineRate = ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100;
        score += declineRate >= 50 ? 30 : 20;
        signals.push(`거래 금액 ${declineRate.toFixed(0)}% 감소`);
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
