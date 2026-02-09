import type { CustomerItemDetailRecord, ProfitabilityAnalysisRecord } from "@/types";

/** Union type for records that have the fields needed by calcMarginErosion */
type MarginErosionRecord = CustomerItemDetailRecord | ProfitabilityAnalysisRecord;

// ── Pareto Analysis ──────────────────────────────────────────────

export interface ParetoItem {
  name: string;
  code: string;
  value: number;
  share: number;
  cumShare: number;
  grade: "A" | "B" | "C";
}

/**
 * 파레토(ABC) 분석
 * dimension: customer(매출거래처/매출거래처명) 또는 product(품목/품목명)
 * metric: sales(매출액), grossProfit(매출총이익), operatingProfit(영업이익) 의 .실적 값
 * Grade: A(0~80%), B(80~95%), C(95~100%)
 */
export function calcParetoAnalysis(
  data: CustomerItemDetailRecord[],
  dimension: "customer" | "product",
  metric: "sales" | "grossProfit" | "operatingProfit"
): ParetoItem[] {
  const metricFieldMap = {
    sales: "매출액",
    grossProfit: "매출총이익",
    operatingProfit: "영업이익",
  } as const;
  const field = metricFieldMap[metric];

  // Group by dimension
  const map = new Map<string, { name: string; code: string; value: number }>();

  for (const r of data) {
    const code = dimension === "customer" ? r.매출거래처 : r.품목;
    const name = dimension === "customer" ? r.매출거래처명 : r.품목명;
    if (!code) continue;

    const entry = map.get(code) || { name: name || code, code, value: 0 };
    entry.value += r[field].실적;
    map.set(code, entry);
  }

  // Sort by value descending
  const items = Array.from(map.values()).sort((a, b) => b.value - a.value);

  // Calculate total (sum of absolute values for share calculation)
  const total = items.reduce((sum, item) => sum + Math.abs(item.value), 0);

  // Calculate share, cumulative share, and grade
  let cumValue = 0;
  return items.map((item) => {
    cumValue += Math.abs(item.value);
    const share = total !== 0 ? (Math.abs(item.value) / total) * 100 : 0;
    const cumShare = total !== 0 ? (cumValue / total) * 100 : 0;
    const grade: "A" | "B" | "C" =
      total === 0 ? "C" : cumShare <= 80 ? "A" : cumShare <= 95 ? "B" : "C";

    return {
      name: item.name,
      code: item.code,
      value: item.value,
      share,
      cumShare,
      grade,
    };
  });
}

// ── Product Group Analysis ───────────────────────────────────────

export interface ProductGroupSummary {
  group: string;
  sales: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  opMargin: number;
  domesticSales: number;
  exportSales: number;
  exportRatio: number;
  productCount: number;
  customerCount: number;
  planAchievement: number;
}

/**
 * 제품군별 분석
 * 제품군으로 그룹핑하여 재무 지표 집계, 가중 마진 계산, 고유 품목/거래처 수 집계
 */
export function calcProductGroupAnalysis(
  data: CustomerItemDetailRecord[]
): ProductGroupSummary[] {
  const map = new Map<
    string,
    {
      sales: number;
      salesPlan: number;
      cost: number;
      grossProfit: number;
      operatingProfit: number;
      domesticSales: number;
      exportSales: number;
      products: Set<string>;
      customers: Set<string>;
    }
  >();

  for (const r of data) {
    const group = r.제품군 || "(미분류)";

    const entry = map.get(group) || {
      sales: 0,
      salesPlan: 0,
      cost: 0,
      grossProfit: 0,
      operatingProfit: 0,
      domesticSales: 0,
      exportSales: 0,
      products: new Set<string>(),
      customers: new Set<string>(),
    };

    entry.sales += r.매출액.실적;
    entry.salesPlan += r.매출액.계획;
    entry.cost += r.실적매출원가.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;
    entry.domesticSales += r.제품내수매출?.실적 || 0;
    entry.exportSales += r.제품수출매출?.실적 || 0;
    if (r.품목) entry.products.add(r.품목);
    if (r.매출거래처) entry.customers.add(r.매출거래처);

    map.set(group, entry);
  }

  return Array.from(map.entries())
    .map(([group, v]) => ({
      group,
      sales: v.sales,
      cost: v.cost,
      grossProfit: v.grossProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
      operatingProfit: v.operatingProfit,
      opMargin: v.sales !== 0 ? (v.operatingProfit / v.sales) * 100 : 0,
      domesticSales: v.domesticSales,
      exportSales: v.exportSales,
      exportRatio: v.sales !== 0 ? Math.max(0, Math.min(100, (v.exportSales / v.sales) * 100)) : 0,
      productCount: v.products.size,
      customerCount: v.customers.size,
      planAchievement:
        v.salesPlan !== 0 ? (v.sales / v.salesPlan) * 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);
}

// ── Margin Erosion Analysis ──────────────────────────────────────

export interface MarginErosionItem {
  name: string;
  code: string;
  dimension: "product" | "customer";
  plannedMargin: number;
  actualMargin: number;
  erosion: number;
  sales: number;
  impactAmount: number;
}

/**
 * 마진 침식 분석
 * 계획 대비 실적 매출총이익율의 차이를 분석하여 마진이 악화된 항목 도출
 * erosion = actualMargin - plannedMargin (음수 = 마진 악화)
 * impactAmount = sales * erosion / 100 (추정 손실이익)
 *
 * Supports both CustomerItemDetailRecord and ProfitabilityAnalysisRecord.
 * ProfitabilityAnalysisRecord lacks 품목명/매출거래처명 → falls back to code.
 */
export function calcMarginErosion(
  data: MarginErosionRecord[],
  dimension: "product" | "customer",
  topN: number = 20
): MarginErosionItem[] {
  const map = new Map<
    string,
    {
      name: string;
      code: string;
      salesPlan: number;
      salesActual: number;
      gpPlan: number;
      gpActual: number;
    }
  >();

  for (const r of data) {
    const code = dimension === "product" ? r.품목 : r.매출거래처;
    // ProfitabilityAnalysisRecord has no 품목명/매출거래처명 → fallback to code
    const name = dimension === "product"
      ? ((r as CustomerItemDetailRecord).품목명 || r.품목)
      : ((r as CustomerItemDetailRecord).매출거래처명 || r.매출거래처);
    if (!code) continue;

    const entry = map.get(code) || {
      name: name || code,
      code,
      salesPlan: 0,
      salesActual: 0,
      gpPlan: 0,
      gpActual: 0,
    };

    entry.salesPlan += r.매출액.계획;
    entry.salesActual += r.매출액.실적;
    entry.gpPlan += r.매출총이익.계획;
    entry.gpActual += r.매출총이익.실적;

    map.set(code, entry);
  }

  const items: MarginErosionItem[] = Array.from(map.values()).map((v) => {
    const plannedMargin =
      v.salesPlan !== 0 ? (v.gpPlan / v.salesPlan) * 100 : 0;
    const actualMargin =
      v.salesActual !== 0 ? (v.gpActual / v.salesActual) * 100 : 0;
    const erosion = actualMargin - plannedMargin;
    const sales = v.salesActual;
    const impactAmount = (sales * erosion) / 100;

    return {
      name: v.name,
      code: v.code,
      dimension,
      plannedMargin,
      actualMargin,
      erosion,
      sales,
      impactAmount,
    };
  });

  // Sort by impactAmount ascending (worst erosion first)
  items.sort((a, b) => a.impactAmount - b.impactAmount);

  return items.slice(0, topN);
}

// ── Org-Product Summary ──────────────────────────────────────────

export interface OrgProductSummary {
  org: string;
  totalSales: number;
  totalGrossProfit: number;
  grossMargin: number;
  productCount: number;
  customerCount: number;
  topProduct: string;
  topCustomer: string;
  domesticRatio: number;
}

/**
 * 영업조직별 품목/거래처 요약
 * 조직별 재무 집계, 고유 품목/거래처 수, 최대 매출 품목/거래처 식별
 */
export function calcOrgProductSummary(
  data: CustomerItemDetailRecord[]
): OrgProductSummary[] {
  const map = new Map<
    string,
    {
      totalSales: number;
      totalGrossProfit: number;
      domesticSales: number;
      products: Set<string>;
      customers: Set<string>;
      productSales: Map<string, { name: string; sales: number }>;
      customerSales: Map<string, { name: string; sales: number }>;
    }
  >();

  for (const r of data) {
    const org = r.영업조직팀;
    if (!org) continue;

    const entry = map.get(org) || {
      totalSales: 0,
      totalGrossProfit: 0,
      domesticSales: 0,
      products: new Set<string>(),
      customers: new Set<string>(),
      productSales: new Map<string, { name: string; sales: number }>(),
      customerSales: new Map<string, { name: string; sales: number }>(),
    };

    const sales = r.매출액.실적;
    entry.totalSales += sales;
    entry.totalGrossProfit += r.매출총이익.실적;
    entry.domesticSales += r.제품내수매출?.실적 || 0;

    if (r.품목) {
      entry.products.add(r.품목);
      const ps = entry.productSales.get(r.품목) || {
        name: r.품목명 || r.품목,
        sales: 0,
      };
      ps.sales += sales;
      entry.productSales.set(r.품목, ps);
    }

    if (r.매출거래처) {
      entry.customers.add(r.매출거래처);
      const cs = entry.customerSales.get(r.매출거래처) || {
        name: r.매출거래처명 || r.매출거래처,
        sales: 0,
      };
      cs.sales += sales;
      entry.customerSales.set(r.매출거래처, cs);
    }

    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, v]) => {
      // Find top product by sales
      let topProduct = "";
      let maxProductSales = -Infinity;
      Array.from(v.productSales.values()).forEach((ps) => {
        if (ps.sales > maxProductSales) {
          maxProductSales = ps.sales;
          topProduct = ps.name;
        }
      });

      // Find top customer by sales
      let topCustomer = "";
      let maxCustomerSales = -Infinity;
      Array.from(v.customerSales.values()).forEach((cs) => {
        if (cs.sales > maxCustomerSales) {
          maxCustomerSales = cs.sales;
          topCustomer = cs.name;
        }
      });

      return {
        org,
        totalSales: v.totalSales,
        totalGrossProfit: v.totalGrossProfit,
        grossMargin:
          v.totalSales !== 0
            ? (v.totalGrossProfit / v.totalSales) * 100
            : 0,
        productCount: v.products.size,
        customerCount: v.customers.size,
        topProduct,
        topCustomer,
        domesticRatio:
          v.totalSales !== 0
            ? (v.domesticSales / v.totalSales) * 100
            : 0,
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}
