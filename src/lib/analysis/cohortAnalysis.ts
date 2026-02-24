import type { SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Interfaces ───────────────────────────────────────────────

export interface CohortCell {
  cohortMonth: string;  // first purchase month
  periodMonth: string;  // activity month
  periodIndex: number;  // months since cohort (0-based)
  activeCustomers: number;
  totalCustomers: number;
  retentionRate: number;
  revenue: number;
}

export interface CohortAnalysisResult {
  cells: CohortCell[];
  cohorts: Array<{
    month: string;
    size: number;
    firstMonthRevenue: number;
  }>;
  avgRetentionByPeriod: Array<{ period: number; rate: number }>;
}

// ─── Helpers ──────────────────────────────────────────────────

function monthDist(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// ─── Core Function ────────────────────────────────────────────

/**
 * Cohort analysis based on customer first purchase month.
 * Tracks repurchase rates over subsequent months.
 */
export function calcCohortAnalysis(sales: SalesRecord[]): CohortAnalysisResult {
  if (sales.length === 0) return { cells: [], cohorts: [], avgRetentionByPeriod: [] };

  // 1. Find each customer's first purchase month
  const customerFirstMonth = new Map<string, string>();
  const customerMonthRevenue = new Map<string, Map<string, number>>();

  for (const r of sales) {
    const cust = r.매출처 || "";
    if (!cust) continue;
    const month = extractMonth(r.매출일);
    if (!month) continue;

    const existing = customerFirstMonth.get(cust);
    if (!existing || month < existing) {
      customerFirstMonth.set(cust, month);
    }

    let monthMap = customerMonthRevenue.get(cust);
    if (!monthMap) {
      monthMap = new Map<string, number>();
      customerMonthRevenue.set(cust, monthMap);
    }
    monthMap.set(month, (monthMap.get(month) ?? 0) + r.장부금액);
  }

  // 2. Build cohort data
  const cohortCustomers = new Map<string, Set<string>>(); // cohortMonth -> customer set
  for (const [cust, firstMonth] of Array.from(customerFirstMonth.entries())) {
    const set = cohortCustomers.get(firstMonth) || new Set<string>();
    set.add(cust);
    cohortCustomers.set(firstMonth, set);
  }

  // 3. Build cells
  const cells: CohortCell[] = [];
  const cohortList = Array.from(cohortCustomers.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [cohortMonth, customers] of cohortList) {
    const totalCustomers = customers.size;

    // Find all months where any cohort customer was active
    const periodMonths = new Map<string, { active: Set<string>; revenue: number }>();

    for (const cust of Array.from(customers)) {
      const monthRevMap = customerMonthRevenue.get(cust);
      if (!monthRevMap) continue;

      for (const [month, revenue] of Array.from(monthRevMap.entries())) {
        const dist = monthDist(cohortMonth, month);
        if (dist < 0) continue; // before cohort month

        const entry = periodMonths.get(month) || { active: new Set<string>(), revenue: 0 };
        entry.active.add(cust);
        entry.revenue += revenue;
        periodMonths.set(month, entry);
      }
    }

    for (const [periodMonth, data] of Array.from(periodMonths.entries())) {
      const periodIndex = monthDist(cohortMonth, periodMonth);
      cells.push({
        cohortMonth,
        periodMonth,
        periodIndex,
        activeCustomers: data.active.size,
        totalCustomers,
        retentionRate: totalCustomers > 0 ? (data.active.size / totalCustomers) * 100 : 0,
        revenue: data.revenue,
      });
    }
  }

  // 4. Cohort summaries
  const cohorts = cohortList.map(([month, customers]) => {
    const firstMonthCell = cells.find(c => c.cohortMonth === month && c.periodIndex === 0);
    return {
      month,
      size: customers.size,
      firstMonthRevenue: firstMonthCell?.revenue ?? 0,
    };
  });

  // 5. Average retention by period — weighted by cohort size
  const periodMap = new Map<number, { weightedRateSum: number; totalWeight: number }>();
  for (const cell of cells) {
    const entry = periodMap.get(cell.periodIndex) || { weightedRateSum: 0, totalWeight: 0 };
    // Weight by cohort size (totalCustomers) so larger cohorts have more influence
    entry.weightedRateSum += cell.retentionRate * cell.totalCustomers;
    entry.totalWeight += cell.totalCustomers;
    periodMap.set(cell.periodIndex, entry);
  }

  const avgRetentionByPeriod = Array.from(periodMap.entries())
    .map(([period, data]) => ({ period, rate: data.totalWeight > 0 ? data.weightedRateSum / data.totalWeight : 0 }))
    .sort((a, b) => a.period - b.period);

  return { cells, cohorts, avgRetentionByPeriod };
}
