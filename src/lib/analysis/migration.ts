import type { SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

export type CustomerGrade = "A" | "B" | "C" | "D" | "N"; // N = no transaction

export interface MigrationFlow {
  fromGrade: CustomerGrade;
  toGrade: CustomerGrade;
  count: number;
  customers: string[];
}

export interface MigrationSummary {
  month: string;
  upgraded: number;    // moved to higher grade
  maintained: number;  // stayed at same grade
  downgraded: number;  // moved to lower grade
  churned: number;     // had transactions before but none this month (→N)
  newCustomers: number; // first appeared this month (from N→)
  totalActive: number;
}

export interface MigrationMatrix {
  month: string;
  flows: MigrationFlow[];
}

export interface GradeDistributionEntry {
  month: string;
  A: number;
  B: number;
  C: number;
  D: number;
}

// ─── Constants ────────────────────────────────────────────────

/** Grade ordering for comparison: A(4) > B(3) > C(2) > D(1) > N(0) */
const GRADE_ORDER: Record<CustomerGrade, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  N: 0,
};

// ─── Helper Functions ─────────────────────────────────────────

/**
 * Assign a grade based on sales amount and thresholds.
 * A: >= thresholds[0] (top)
 * B: >= thresholds[1]
 * C: >= thresholds[2]
 * D: > 0 but below C threshold
 * N: 0 (no transactions)
 */
function assignGrade(
  amount: number,
  thresholds: [number, number, number]
): CustomerGrade {
  if (amount <= 0) return "N";
  if (amount >= thresholds[0]) return "A";
  if (amount >= thresholds[1]) return "B";
  if (amount >= thresholds[2]) return "C";
  return "D";
}

/**
 * Calculate percentile value from a sorted (ascending) numeric array.
 * Uses linear interpolation.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const index = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - fraction) + sortedValues[upper] * fraction;
}

// ─── Main Migration Analysis ──────────────────────────────────

/**
 * Calculate customer migration analysis from sales data.
 *
 * Steps:
 * 1. Group sales by month, then by customer (매출처)
 * 2. Calculate dynamic thresholds from overall positive-amount distribution
 *    A: 80th percentile, B: 60th percentile, C: 40th percentile
 * 3. For each consecutive month pair, track grade changes
 * 4. Build migration matrices (from->to counts)
 * 5. Build summaries (upgraded/maintained/downgraded/churned/new)
 */
export function calcCustomerMigration(sales: SalesRecord[]): {
  matrices: MigrationMatrix[];
  summaries: MigrationSummary[];
  gradeThresholds: { A: number; B: number; C: number };
} {
  const emptyResult = {
    matrices: [],
    summaries: [],
    gradeThresholds: { A: 0, B: 0, C: 0 },
  };

  if (!sales || sales.length === 0) return emptyResult;

  // Step 1: Group sales by month, then aggregate by customer (매출처)
  // monthCustomerSales: Map<month, Map<customer, totalSales>>
  const monthCustomerSales = new Map<string, Map<string, number>>();

  for (const record of sales) {
    const month = extractMonth(record.매출일);
    if (!month) continue;

    const customer = record.매출처 || "";
    if (!customer) continue;

    if (!monthCustomerSales.has(month)) {
      monthCustomerSales.set(month, new Map<string, number>());
    }

    const customerMap = monthCustomerSales.get(month)!;
    const currentTotal = customerMap.get(customer) || 0;
    customerMap.set(customer, currentTotal + (record.판매금액 || 0));
  }

  // Get sorted months
  const months = Array.from(monthCustomerSales.keys()).sort();
  if (months.length === 0) return emptyResult;

  // Step 2: Calculate dynamic thresholds from all positive customer-month amounts
  const allPositiveAmounts: number[] = [];
  for (const [, customerMap] of Array.from(monthCustomerSales.entries())) {
    for (const [, amount] of Array.from(customerMap.entries())) {
      if (amount > 0) {
        allPositiveAmounts.push(amount);
      }
    }
  }

  allPositiveAmounts.sort((a, b) => a - b);

  const thresholdA = allPositiveAmounts.length > 0 ? percentile(allPositiveAmounts, 80) : 0;
  const thresholdB = allPositiveAmounts.length > 0 ? percentile(allPositiveAmounts, 60) : 0;
  const thresholdC = allPositiveAmounts.length > 0 ? percentile(allPositiveAmounts, 40) : 0;

  const thresholds: [number, number, number] = [thresholdA, thresholdB, thresholdC];

  // Collect all unique customers across all months
  const allCustomers = new Set<string>();
  for (const [, customerMap] of Array.from(monthCustomerSales.entries())) {
    for (const [customer] of Array.from(customerMap.entries())) {
      allCustomers.add(customer);
    }
  }

  // Step 3: Assign grades per customer per month
  // monthGrades: Map<month, Map<customer, grade>>
  const monthGrades = new Map<string, Map<string, CustomerGrade>>();

  for (const month of months) {
    const customerMap = monthCustomerSales.get(month)!;
    const gradeMap = new Map<string, CustomerGrade>();

    for (const customer of Array.from(allCustomers)) {
      const amount = customerMap.get(customer) || 0;
      gradeMap.set(customer, assignGrade(amount, thresholds));
    }

    monthGrades.set(month, gradeMap);
  }

  // Steps 4-5: Build migration matrices and summaries for consecutive months
  const matrices: MigrationMatrix[] = [];
  const summaries: MigrationSummary[] = [];

  for (let i = 1; i < months.length; i++) {
    const prevMonth = months[i - 1];
    const currMonth = months[i];
    const prevGrades = monthGrades.get(prevMonth)!;
    const currGrades = monthGrades.get(currMonth)!;

    // Track flows: (fromGrade, toGrade) -> customers[]
    const flowMap = new Map<string, string[]>();

    let upgraded = 0;
    let maintained = 0;
    let downgraded = 0;
    let churned = 0;
    let newCustomers = 0;
    let totalActive = 0;

    for (const customer of Array.from(allCustomers)) {
      const fromGrade = prevGrades.get(customer) || "N";
      const toGrade = currGrades.get(customer) || "N";

      // Track flow
      const key = `${fromGrade}->${toGrade}`;
      if (!flowMap.has(key)) {
        flowMap.set(key, []);
      }
      flowMap.get(key)!.push(customer);

      // Classify movement
      const fromOrder = GRADE_ORDER[fromGrade];
      const toOrder = GRADE_ORDER[toGrade];

      if (fromGrade === "N" && toGrade !== "N") {
        // New customer (N -> any active grade)
        newCustomers++;
        totalActive++;
      } else if (fromGrade !== "N" && toGrade === "N") {
        // Churned (any active grade -> N)
        churned++;
      } else if (fromGrade !== "N" && toGrade !== "N") {
        // Active in both months
        totalActive++;
        if (toOrder > fromOrder) {
          upgraded++;
        } else if (toOrder < fromOrder) {
          downgraded++;
        } else {
          maintained++;
        }
      }
      // N -> N: inactive in both months, not counted
    }

    // Build MigrationFlow array from flowMap
    const flows: MigrationFlow[] = [];
    for (const [key, customers] of Array.from(flowMap.entries())) {
      const [from, to] = key.split("->") as [CustomerGrade, CustomerGrade];
      // Skip N->N flows (inactive in both months)
      if (from === "N" && to === "N") continue;

      flows.push({
        fromGrade: from,
        toGrade: to,
        count: customers.length,
        customers: customers.sort(),
      });
    }

    // Sort flows: by fromGrade order desc, then toGrade order desc
    flows.sort((a, b) => {
      const fromDiff = GRADE_ORDER[b.fromGrade] - GRADE_ORDER[a.fromGrade];
      if (fromDiff !== 0) return fromDiff;
      return GRADE_ORDER[b.toGrade] - GRADE_ORDER[a.toGrade];
    });

    matrices.push({ month: currMonth, flows });
    summaries.push({
      month: currMonth,
      upgraded,
      maintained,
      downgraded,
      churned,
      newCustomers,
      totalActive,
    });
  }

  return {
    matrices,
    summaries,
    gradeThresholds: {
      A: thresholdA,
      B: thresholdB,
      C: thresholdC,
    },
  };
}

// ─── Grade Distribution ───────────────────────────────────────

/**
 * Calculate monthly count of customers in each grade.
 */
export function calcGradeDistribution(sales: SalesRecord[]): GradeDistributionEntry[] {
  if (!sales || sales.length === 0) return [];

  // Group sales by month, then aggregate by customer
  const monthCustomerSales = new Map<string, Map<string, number>>();

  for (const record of sales) {
    const month = extractMonth(record.매출일);
    if (!month) continue;

    const customer = record.매출처 || "";
    if (!customer) continue;

    if (!monthCustomerSales.has(month)) {
      monthCustomerSales.set(month, new Map<string, number>());
    }

    const customerMap = monthCustomerSales.get(month)!;
    const currentTotal = customerMap.get(customer) || 0;
    customerMap.set(customer, currentTotal + (record.판매금액 || 0));
  }

  // Calculate thresholds from all positive amounts
  const allPositiveAmounts: number[] = [];
  for (const [, customerMap] of Array.from(monthCustomerSales.entries())) {
    for (const [, amount] of Array.from(customerMap.entries())) {
      if (amount > 0) {
        allPositiveAmounts.push(amount);
      }
    }
  }

  allPositiveAmounts.sort((a, b) => a - b);

  const thresholdA = allPositiveAmounts.length > 0 ? percentile(allPositiveAmounts, 80) : 0;
  const thresholdB = allPositiveAmounts.length > 0 ? percentile(allPositiveAmounts, 60) : 0;
  const thresholdC = allPositiveAmounts.length > 0 ? percentile(allPositiveAmounts, 40) : 0;
  const thresholds: [number, number, number] = [thresholdA, thresholdB, thresholdC];

  // Build distribution for each month
  const months = Array.from(monthCustomerSales.keys()).sort();

  return months.map((month) => {
    const customerMap = monthCustomerSales.get(month)!;
    let a = 0, b = 0, c = 0, d = 0;

    for (const [, amount] of Array.from(customerMap.entries())) {
      const grade = assignGrade(amount, thresholds);
      switch (grade) {
        case "A": a++; break;
        case "B": b++; break;
        case "C": c++; break;
        case "D": d++; break;
        // N (no transaction) is not counted in distribution
      }
    }

    return { month, A: a, B: b, C: c, D: d };
  });
}
