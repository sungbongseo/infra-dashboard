import type { ProfitabilityAnalysisRecord, CustomerItemDetailRecord, InventoryMovementRecord } from "@/types";

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
 *
 * options.groupBy: "품목"(기본) | "제품군" — 제품군은 100(CustomerItemDetail) 데이터에만 존재
 * options.sortBy: "grossProfit"(기본) | "sales"
 */
export function calcProductProfitability(
  data: (ProfitabilityAnalysisRecord | CustomerItemDetailRecord)[],
  options?: { sortBy?: "grossProfit" | "sales"; groupBy?: "품목" | "제품군" }
): ProductProfitability[] {
  const sortBy = options?.sortBy ?? "grossProfit";
  const groupBy = options?.groupBy ?? "품목";

  const map = new Map<
    string,
    { sales: number; cost: number; grossProfit: number; operatingProfit: number }
  >();

  for (const r of data) {
    const key = groupBy === "제품군"
      ? ("제품군" in r ? (r as CustomerItemDetailRecord).제품군 : r.품목) || r.품목
      : r.품목;
    if (!key) continue;

    const entry = map.get(key) || {
      sales: 0,
      cost: 0,
      grossProfit: 0,
      operatingProfit: 0,
    };

    entry.sales += r.매출액.실적;
    entry.cost += r.실적매출원가.실적;
    entry.grossProfit += r.매출총이익.실적;
    entry.operatingProfit += r.영업이익.실적;

    map.set(key, entry);
  }

  return Array.from(map.entries())
    .filter(([, v]) => v.sales !== 0) // 매출 0 품목 제외 (반품/역분개 이상 데이터 방지)
    .map(([product, v]) => ({
      product,
      sales: v.sales,
      cost: v.cost,
      grossProfit: v.grossProfit,
      grossMargin: v.sales !== 0 ? (v.grossProfit / v.sales) * 100 : 0,
      operatingProfit: v.operatingProfit,
      operatingMargin: v.sales !== 0 ? (v.operatingProfit / v.sales) * 100 : 0,
    }))
    .sort((a, b) => sortBy === "sales" ? b.sales - a.sales : b.grossProfit - a.grossProfit);
}

/**
 * 거래처별 수익성 분석
 * ProfitabilityAnalysisRecord의 매출거래처 필드로 그룹핑
 */
export function calcCustomerProfitability(
  data: (ProfitabilityAnalysisRecord | CustomerItemDetailRecord)[]
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

/**
 * 재고조정 마진 계산
 * 재고 보유비용(자본비용+보관+보험+감모)을 반영한 실질 마진
 */
export function calcInventoryAdjustedMargin(
  grossProfit: number,
  avgInventory: number,
  holdingRate: number = 0.15,
): { adjustedProfit: number; holdingCost: number } {
  const holdingCost = avgInventory * holdingRate;
  const adjustedProfit = grossProfit - holdingCost;
  return { adjustedProfit, holdingCost };
}

export interface ProductInventoryAdjusted {
  product: string;
  sales: number;
  grossProfit: number;
  grossMargin: number;
  avgInventory: number;
  holdingCost: number;
  adjustedProfit: number;
  adjustedMargin: number;
  marginGap: number; // grossMargin - adjustedMargin
}

/**
 * 품목별 재고조정 마진 분석
 * 수익성 데이터와 재고 데이터를 매칭하여 재고보유비용 반영 실질 마진 산출
 */
export function calcProductInventoryAdjusted(
  profitData: ProductProfitability[],
  inventoryData: Map<string, InventoryMovementRecord[]>,
  holdingRate: number = 0.15,
): ProductInventoryAdjusted[] {
  // 전 공장 품목별 합산: 품목명 기준 매칭
  const invMap = new Map<string, { opening: number; closing: number }>();
  for (const records of Array.from(inventoryData.values())) {
    for (const r of records) {
      const key = r.품목명.trim();
      if (!key) continue;
      const entry = invMap.get(key) || { opening: 0, closing: 0 };
      entry.opening += r.기초금액;
      entry.closing += r.기말금액;
      invMap.set(key, entry);
    }
  }

  return profitData
    .filter((p) => invMap.has(p.product))
    .map((p) => {
      const inv = invMap.get(p.product)!;
      const avgInventory = (inv.opening + inv.closing) / 2;
      const { adjustedProfit, holdingCost } = calcInventoryAdjustedMargin(
        p.grossProfit,
        avgInventory,
        holdingRate,
      );
      const adjustedMargin = p.sales !== 0 ? (adjustedProfit / p.sales) * 100 : 0;
      return {
        product: p.product,
        sales: p.sales,
        grossProfit: p.grossProfit,
        grossMargin: p.grossMargin,
        avgInventory,
        holdingCost,
        adjustedProfit,
        adjustedMargin: isFinite(adjustedMargin) ? adjustedMargin : 0,
        marginGap: p.grossMargin - (isFinite(adjustedMargin) ? adjustedMargin : 0),
      };
    })
    .sort((a, b) => b.marginGap - a.marginGap);
}
