import type { HqCustomerItemProfitRecord } from "@/types";

// ── Cross Profitability (거래처 x 품목 수익성 매트릭스) ──

export interface CrossProfitCell {
  customer: string;      // 매출거래처명
  customerCode: string;  // 매출거래처
  product: string;       // 품목명
  productCode: string;   // 품목
  sales: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  opMargin: number;
  quantity: number;      // 매출수량.실적
}

export function calcCrossProfitability(
  data: HqCustomerItemProfitRecord[]
): CrossProfitCell[] {
  const map = new Map<
    string,
    {
      customer: string;
      customerCode: string;
      product: string;
      productCode: string;
      sales: number;
      grossProfit: number;
      operatingProfit: number;
      quantity: number;
    }
  >();

  for (const r of data) {
    const key = `${r.매출거래처}__${r.품목}`;
    const existing = map.get(key);
    if (existing) {
      existing.sales += r.매출액.실적 || 0;
      existing.grossProfit += r.매출총이익.실적 || 0;
      existing.operatingProfit += r.영업이익.실적 || 0;
      existing.quantity += r.매출수량.실적 || 0;
    } else {
      map.set(key, {
        customer: r.매출거래처명 || "",
        customerCode: r.매출거래처 || "",
        product: r.품목명 || "",
        productCode: r.품목 || "",
        sales: r.매출액.실적 || 0,
        grossProfit: r.매출총이익.실적 || 0,
        operatingProfit: r.영업이익.실적 || 0,
        quantity: r.매출수량.실적 || 0,
      });
    }
  }

  const results: CrossProfitCell[] = Array.from(map.values()).map((v) => ({
    customer: v.customer,
    customerCode: v.customerCode,
    product: v.product,
    productCode: v.productCode,
    sales: v.sales,
    grossProfit: v.grossProfit,
    grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
    operatingProfit: v.operatingProfit,
    opMargin: v.sales !== 0 ? (v.operatingProfit / v.sales) * 100 : 0,
    quantity: v.quantity,
  }));

  results.sort((a, b) => b.sales - a.sales);
  return results;
}

// ── ABC Analysis (품목별 ABC 등급 분석) ──

export interface ABCItem {
  product: string;       // 품목명
  productCode: string;   // 품목
  sales: number;
  cumulativeShare: number;  // cumulative % of total sales
  grade: "A" | "B" | "C";  // A: 0~80%, B: 80~95%, C: 95~100%
  grossProfit: number;
  grossMargin: number;
  customerCount: number;  // 거래처 수
}

export function calcABCAnalysis(
  data: HqCustomerItemProfitRecord[]
): ABCItem[] {
  const map = new Map<
    string,
    {
      product: string;
      productCode: string;
      sales: number;
      grossProfit: number;
      customers: Set<string>;
    }
  >();

  for (const r of data) {
    const key = r.품목 || "";
    if (!key) continue;

    const existing = map.get(key);
    if (existing) {
      existing.sales += r.매출액.실적 || 0;
      existing.grossProfit += r.매출총이익.실적 || 0;
      existing.customers.add(r.매출거래처 || "");
    } else {
      const customers = new Set<string>();
      customers.add(r.매출거래처 || "");
      map.set(key, {
        product: r.품목명 || "",
        productCode: key,
        sales: r.매출액.실적 || 0,
        grossProfit: r.매출총이익.실적 || 0,
        customers,
      });
    }
  }

  // Sort by sales descending
  const sorted = Array.from(map.values()).sort((a, b) => b.sales - a.sales);

  const totalSales = sorted.reduce((sum, v) => sum + v.sales, 0);
  let cumulative = 0;

  const results: ABCItem[] = sorted.map((v) => {
    cumulative += v.sales;
    const cumulativeShare =
      totalSales !== 0 ? (cumulative / totalSales) * 100 : 0;

    let grade: "A" | "B" | "C";
    if (cumulativeShare <= 80) {
      grade = "A";
    } else if (cumulativeShare <= 95) {
      grade = "B";
    } else {
      grade = "C";
    }

    return {
      product: v.product,
      productCode: v.productCode,
      sales: v.sales,
      cumulativeShare,
      grade,
      grossProfit: v.grossProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
      customerCount: v.customers.size,
    };
  });

  return results;
}

// ── Customer Portfolio (거래처별 포트폴리오 분석) ──

export interface CustomerPortfolio {
  customer: string;      // 매출거래처명
  customerCode: string;  // 매출거래처
  totalSales: number;
  totalGrossProfit: number;
  avgGrossMargin: number;
  productCount: number;
  topProducts: Array<{ name: string; sales: number; margin: number }>;  // Top 3
}

export function calcCustomerPortfolio(
  data: HqCustomerItemProfitRecord[]
): CustomerPortfolio[] {
  const map = new Map<
    string,
    {
      customer: string;
      customerCode: string;
      totalSales: number;
      totalGrossProfit: number;
      products: Map<string, { name: string; sales: number; grossProfit: number }>;
    }
  >();

  for (const r of data) {
    const key = r.매출거래처 || "";
    if (!key) continue;

    const existing = map.get(key);
    const productKey = r.품목 || "";
    const productSales = r.매출액.실적 || 0;
    const productGP = r.매출총이익.실적 || 0;

    if (existing) {
      existing.totalSales += productSales;
      existing.totalGrossProfit += productGP;

      const prod = existing.products.get(productKey);
      if (prod) {
        prod.sales += productSales;
        prod.grossProfit += productGP;
      } else {
        existing.products.set(productKey, {
          name: r.품목명 || "",
          sales: productSales,
          grossProfit: productGP,
        });
      }
    } else {
      const products = new Map<
        string,
        { name: string; sales: number; grossProfit: number }
      >();
      products.set(productKey, {
        name: r.품목명 || "",
        sales: productSales,
        grossProfit: productGP,
      });
      map.set(key, {
        customer: r.매출거래처명 || "",
        customerCode: key,
        totalSales: productSales,
        totalGrossProfit: productGP,
        products,
      });
    }
  }

  const results: CustomerPortfolio[] = Array.from(map.values()).map((v) => {
    // Sort products by sales desc, take top 3
    const sortedProducts = Array.from(v.products.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 3)
      .map((p) => ({
        name: p.name,
        sales: p.sales,
        margin: p.sales !== 0 ? (p.grossProfit / p.sales) * 100 : 0,
      }));

    return {
      customer: v.customer,
      customerCode: v.customerCode,
      totalSales: v.totalSales,
      totalGrossProfit: v.totalGrossProfit,
      avgGrossMargin:
        v.totalSales !== 0 ? (v.totalGrossProfit / v.totalSales) * 100 : 0,
      productCount: v.products.size,
      topProducts: sortedProducts,
    };
  });

  results.sort((a, b) => b.totalSales - a.totalSales);
  return results;
}

// ── Product-Customer Matrix (품목 x 거래처 매트릭스) ──

export interface ProductCustomerMatrix {
  products: string[];     // unique product names (top N)
  customers: string[];    // unique customer names (top N)
  cells: Array<{
    productIdx: number;
    customerIdx: number;
    sales: number;
    grossMargin: number;
  }>;
}

export function calcProductCustomerMatrix(
  data: HqCustomerItemProfitRecord[],
  topN: number = 15
): ProductCustomerMatrix {
  // Aggregate total sales by product and by customer
  const productTotals = new Map<string, { name: string; sales: number }>();
  const customerTotals = new Map<string, { name: string; sales: number }>();
  // Cell data keyed by "productCode__customerCode"
  const cellMap = new Map<string, { sales: number; grossProfit: number }>();

  for (const r of data) {
    const productCode = r.품목 || "";
    const customerCode = r.매출거래처 || "";
    const sales = r.매출액.실적 || 0;
    const gp = r.매출총이익.실적 || 0;

    // Product totals
    const pt = productTotals.get(productCode);
    if (pt) {
      pt.sales += sales;
    } else {
      productTotals.set(productCode, { name: r.품목명 || "", sales });
    }

    // Customer totals
    const ct = customerTotals.get(customerCode);
    if (ct) {
      ct.sales += sales;
    } else {
      customerTotals.set(customerCode, { name: r.매출거래처명 || "", sales });
    }

    // Cell data
    const cellKey = `${productCode}__${customerCode}`;
    const cell = cellMap.get(cellKey);
    if (cell) {
      cell.sales += sales;
      cell.grossProfit += gp;
    } else {
      cellMap.set(cellKey, { sales, grossProfit: gp });
    }
  }

  // Get top N products by sales
  const topProducts = Array.from(productTotals.entries())
    .sort((a, b) => b[1].sales - a[1].sales)
    .slice(0, topN);

  // Get top N customers by sales
  const topCustomers = Array.from(customerTotals.entries())
    .sort((a, b) => b[1].sales - a[1].sales)
    .slice(0, topN);

  const products = topProducts.map(([, v]) => v.name);
  const customers = topCustomers.map(([, v]) => v.name);

  // Build matrix cells
  const cells: ProductCustomerMatrix["cells"] = [];

  for (let pi = 0; pi < topProducts.length; pi++) {
    const productCode = topProducts[pi][0];
    for (let ci = 0; ci < topCustomers.length; ci++) {
      const customerCode = topCustomers[ci][0];
      const cellKey = `${productCode}__${customerCode}`;
      const cell = cellMap.get(cellKey);

      const sales = cell ? cell.sales : 0;
      const grossProfit = cell ? cell.grossProfit : 0;
      const grossMargin = sales !== 0 ? (grossProfit / sales) * 100 : 0;

      cells.push({
        productIdx: pi,
        customerIdx: ci,
        sales,
        grossMargin,
      });
    }
  }

  return { products, customers, cells };
}
