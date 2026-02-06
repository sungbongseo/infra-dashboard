import type { SalesRecord, OrgProfitRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ─── Interfaces ───────────────────────────────────────────────

export interface ClvResult {
  customer: string;        // 매출처 code
  customerName: string;    // 매출처명
  avgTransactionValue: number;
  purchaseFrequency: number;   // per year
  customerValue: number;        // avgValue * frequency
  avgProfitMargin: number;      // from orgProfit or estimated
  estimatedLifespan: number;    // retention years (estimated)
  clv: number;                  // customerValue * margin * lifespan
  currentSales: number;
  clvToSalesRatio: number;
}

export interface ClvSummary {
  totalClv: number;
  avgClv: number;
  topCustomerClv: number;
  customerCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Auto-detect the number of years covered by the sales data.
 * Uses extractMonth to find min/max months, then calculates the span.
 * Returns at least 1 to avoid division by zero.
 */
function detectYearsInData(sales: SalesRecord[]): number {
  let minMonth = "9999-99";
  let maxMonth = "0000-00";

  for (const r of sales) {
    const month = extractMonth(r.매출일);
    if (!month) continue;
    if (month < minMonth) minMonth = month;
    if (month > maxMonth) maxMonth = month;
  }

  if (minMonth === "9999-99" || maxMonth === "0000-00") return 1;

  const [minYear, minMon] = minMonth.split("-").map(Number);
  const [maxYear, maxMon] = maxMonth.split("-").map(Number);

  if (isNaN(minYear) || isNaN(minMon) || isNaN(maxYear) || isNaN(maxMon)) {
    return 1;
  }

  const monthSpan = (maxYear - minYear) * 12 + (maxMon - minMon) + 1;
  const years = monthSpan / 12;

  return Math.max(years, 1 / 12); // At minimum 1 month expressed as fraction of year
}

/**
 * Calculate average profit margin from OrgProfitRecord data.
 * Uses weighted average: total 매출총이익.실적 / total 매출액.실적
 * Falls back to 10% default if no data or zero sales.
 */
function calcAvgProfitMargin(orgProfit: OrgProfitRecord[]): number {
  const DEFAULT_MARGIN = 0.10;

  if (orgProfit.length === 0) return DEFAULT_MARGIN;

  const totalSales = orgProfit.reduce((sum, r) => sum + r.매출액.실적, 0);
  const totalGrossProfit = orgProfit.reduce((sum, r) => sum + r.매출총이익.실적, 0);

  if (totalSales === 0) return DEFAULT_MARGIN;

  const margin = totalGrossProfit / totalSales;

  // Clamp to reasonable bounds: -50% to 100%
  return Math.max(-0.5, Math.min(margin, 1.0));
}

// ─── Customer aggregation ────────────────────────────────────

interface CustomerData {
  customerName: string;
  totalSales: number;
  transactionCount: number;
}

function aggregateCustomerSales(
  sales: SalesRecord[]
): Map<string, CustomerData> {
  const customerMap = new Map<string, CustomerData>();

  for (const r of sales) {
    const custKey = r.매출처 || "";
    if (!custKey) continue;

    const existing = customerMap.get(custKey);
    if (existing) {
      existing.totalSales += r.장부금액;
      existing.transactionCount += 1;
      // Keep the latest non-empty name
      if (r.매출처명 && r.매출처명.trim()) {
        existing.customerName = r.매출처명;
      }
    } else {
      customerMap.set(custKey, {
        customerName: r.매출처명 || "",
        totalSales: r.장부금액,
        transactionCount: 1,
      });
    }
  }

  return customerMap;
}

// ─── Main CLV calculation ────────────────────────────────────

/**
 * Calculate Customer Lifetime Value for all customers.
 *
 * CLV = avgTransactionValue * purchaseFrequency * avgProfitMargin * estimatedLifespan
 *
 * @param sales - Sales records
 * @param orgProfit - Organization profit records (for margin estimation)
 * @param yearsInData - Override for years covered by data (auto-detected if not provided)
 */
export function calcClv(
  sales: SalesRecord[],
  orgProfit: OrgProfitRecord[],
  yearsInData?: number
): ClvResult[] {
  if (sales.length === 0) return [];

  // 1. Determine time span
  const years = yearsInData ?? detectYearsInData(sales);

  // 2. Get average profit margin from org profit data
  const avgProfitMargin = calcAvgProfitMargin(orgProfit);

  // 3. Aggregate by customer
  const customerMap = aggregateCustomerSales(sales);
  if (customerMap.size === 0) return [];

  // 4. Calculate average purchase frequency across all customers
  let totalFrequency = 0;
  let customerCount = 0;
  const entries = Array.from(customerMap.entries());

  for (const [, data] of entries) {
    totalFrequency += data.transactionCount / years;
    customerCount += 1;
  }
  const avgFrequency = customerCount > 0 ? totalFrequency / customerCount : 1;

  // 5. Calculate CLV for each customer
  const results: ClvResult[] = entries.map(([customer, data]) => {
    const avgTransactionValue =
      data.transactionCount > 0 ? data.totalSales / data.transactionCount : 0;
    const purchaseFrequency = data.transactionCount / years;
    const customerValue = avgTransactionValue * purchaseFrequency;

    // Retention factor: customers who purchase more frequently than average
    // are likely to stay longer. Scale between 0.2 (minimum) and 1.0 (maximum).
    const retentionFactor =
      avgFrequency > 0
        ? Math.min(1, purchaseFrequency / avgFrequency) * 0.8 + 0.2
        : 0.5;

    const BASE_LIFESPAN_YEARS = 3; // Industry default
    const estimatedLifespan = BASE_LIFESPAN_YEARS * retentionFactor;

    const clv = customerValue * avgProfitMargin * estimatedLifespan;
    const clvToSalesRatio =
      data.totalSales > 0 ? clv / data.totalSales : 0;

    return {
      customer,
      customerName: data.customerName,
      avgTransactionValue,
      purchaseFrequency,
      customerValue,
      avgProfitMargin,
      estimatedLifespan,
      clv,
      currentSales: data.totalSales,
      clvToSalesRatio,
    };
  });

  // Sort by CLV descending
  results.sort((a, b) => b.clv - a.clv);

  return results;
}

// ─── CLV Summary ─────────────────────────────────────────────

/**
 * Calculate summary statistics for CLV results.
 */
export function calcClvSummary(results: ClvResult[]): ClvSummary {
  if (results.length === 0) {
    return { totalClv: 0, avgClv: 0, topCustomerClv: 0, customerCount: 0 };
  }

  const totalClv = results.reduce((sum, r) => sum + r.clv, 0);
  const avgClv = totalClv / results.length;
  // Results are sorted descending by CLV, so first element is the top
  const topCustomerClv = results[0].clv;

  return {
    totalClv,
    avgClv,
    topCustomerClv,
    customerCount: results.length,
  };
}
