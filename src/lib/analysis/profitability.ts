import type { ProfitabilityAnalysisRecord } from "@/types";

export interface ProductProfitability {
  product: string;
  sales: number;
  cost: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  operatingMargin: number;
}

export interface CustomerProfitability {
  customer: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  operatingProfit: number;
  operatingMargin: number;
  productCount: number;
}

export interface ProfitabilityMatrix {
  customer: string;
  product: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
}

/**
 * 품목별 수익성 분석
 * ProfitabilityAnalysisRecord의 품목 필드로 그룹핑하여
 * 매출액, 매출원가, 매출총이익, 영업이익을 집계
 */
export function calcProductProfitability(
  data: ProfitabilityAnalysisRecord[]
): ProductProfitability[] {
  const map = new Map<
    string,
    { sales: number; cost: number; grossProfit: number; operatingProfit: number }
  >();

  for (const r of data) {
    const product = r.품목;
    if (!product) continue;

    const entry = map.get(product) || {
      sales: 0,
      cost: 0,
      grossProfit: 0,
      operatingProfit: 0,
    };

    entry.sales += r.매출액.실적;
    entry.cost += r.실적매출원가.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;

    map.set(product, entry);
  }

  return Array.from(map.entries())
    .map(([product, v]) => ({
      product,
      sales: v.sales,
      cost: v.cost,
      grossProfit: v.grossProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
      operatingProfit: v.operatingProfit,
      operatingMargin: v.sales !== 0 ? (v.operatingProfit / v.sales) * 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);
}

/**
 * 거래처별 수익성 분석
 * ProfitabilityAnalysisRecord의 매출거래처 필드로 그룹핑
 */
export function calcCustomerProfitability(
  data: ProfitabilityAnalysisRecord[]
): CustomerProfitability[] {
  const map = new Map<
    string,
    {
      sales: number;
      grossProfit: number;
      operatingProfit: number;
      products: Set<string>;
    }
  >();

  for (const r of data) {
    const customer = r.매출거래처;
    if (!customer) continue;

    const entry = map.get(customer) || {
      sales: 0,
      grossProfit: 0,
      operatingProfit: 0,
      products: new Set<string>(),
    };

    entry.sales += r.매출액.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;
    if (r.품목) entry.products.add(r.품목);

    map.set(customer, entry);
  }

  return Array.from(map.entries())
    .map(([customer, v]) => ({
      customer,
      sales: v.sales,
      grossProfit: v.grossProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
      operatingProfit: v.operatingProfit,
      operatingMargin: v.sales !== 0 ? (v.operatingProfit / v.sales) * 100 : 0,
      productCount: v.products.size,
    }))
    .sort((a, b) => b.sales - a.sales);
}

/**
 * 거래처 x 품목 수익성 매트릭스
 * 크로스탭 형태로 각 (거래처, 품목) 조합의 매출/이익 집계
 */
export function calcProfitabilityMatrix(
  data: ProfitabilityAnalysisRecord[]
): ProfitabilityMatrix[] {
  const map = new Map<
    string,
    { customer: string; product: string; sales: number; grossProfit: number }
  >();

  for (const r of data) {
    const customer = r.매출거래처;
    const product = r.품목;
    if (!customer || !product) continue;

    const key = `${customer}||${product}`;
    const entry = map.get(key) || {
      customer,
      product,
      sales: 0,
      grossProfit: 0,
    };

    entry.sales += r.매출액.실적;
    entry.grossProfit += r.매출총이익.실적;

    map.set(key, entry);
  }

  return Array.from(map.values())
    .map((v) => ({
      customer: v.customer,
      product: v.product,
      sales: v.sales,
      grossProfit: v.grossProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);
}
