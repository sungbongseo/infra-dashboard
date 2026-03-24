/**
 * 거래처×품목 마진 분석
 * 매출리스트(판매단가)와 501 품목별매출원가(단위원가)를 결합하여
 * 거래처별 품목 판매가격 대비 마진을 계산
 */

import type { SalesRecord } from "@/types";
import { safeDivide } from "@/lib/utils";

export interface ItemUnitCost {
  품목: string;
  영업조직팀: string;
  매출수량: number;
  매출액: number;
  실적매출원가: number;
  /** 단위원가 = 실적매출원가 / 매출수량 */
  unitCost: number;
  /** 평균 판매단가 = 매출액 / 매출수량 */
  avgUnitPrice: number;
  /** 평균 마진율 = (매출액 - 실적매출원가) / 매출액 * 100 */
  avgMarginRate: number;
}

export interface CustomerItemMarginRow {
  거래처명: string;
  품목명: string;
  영업조직: string;
  영업담당자명: string;
  /** 해당 거래처×품목의 평균 판매단가 (매출리스트 기준) */
  avgSellingPrice: number;
  /** 품목 단위원가 (501 기준) */
  unitCost: number;
  /** 단위 마진 = avgSellingPrice - unitCost */
  unitMargin: number;
  /** 마진율(%) = unitMargin / avgSellingPrice * 100 */
  marginRate: number;
  /** 총 매출수량 */
  totalQty: number;
  /** 총 매출금액 */
  totalAmount: number;
  /** 총 마진금액 = totalAmount - (unitCost * totalQty) */
  totalMargin: number;
  /** 거래 건수 */
  txCount: number;
  /** 최저 판매단가 */
  minPrice: number;
  /** 최고 판매단가 */
  maxPrice: number;
}

export interface CustomerMarginSummary {
  거래처명: string;
  품목수: number;
  totalAmount: number;
  totalMargin: number;
  weightedMarginRate: number;
  avgMarginRate: number;
}

/**
 * 501 품목별매출원가에서 품목별 단위원가 맵 생성
 */
export function buildItemCostMap(
  itemCostDetail: any[]
): Map<string, ItemUnitCost> {
  // 품목명 → 누적 {수량, 매출, 원가}
  const accum = new Map<string, { 품목: string; org: string; qty: number; sales: number; cogs: number }>();

  for (const row of itemCostDetail) {
    const item = String(row.품목 || "").trim();
    if (!item) continue;
    const org = String(row.영업조직팀 || "").trim();
    const qty = typeof row.매출수량 === "object" ? (row.매출수량?.실적 ?? 0) : (Number(row.매출수량) || 0);
    const sales = typeof row.매출액 === "object" ? (row.매출액?.실적 ?? 0) : (Number(row.매출액) || 0);
    const cogs = typeof row.실적매출원가 === "object" ? (row.실적매출원가?.실적 ?? 0) : (Number(row.실적매출원가) || 0);

    const prev = accum.get(item) || { 품목: item, org, qty: 0, sales: 0, cogs: 0 };
    accum.set(item, {
      ...prev,
      qty: prev.qty + qty,
      sales: prev.sales + sales,
      cogs: prev.cogs + cogs,
      org: prev.org || org,
    });
  }

  const result = new Map<string, ItemUnitCost>();
  for (const [item, v] of Array.from(accum.entries())) {
    if (v.qty <= 0) continue;
    const unitCost = safeDivide(v.cogs, v.qty);
    const avgUnitPrice = safeDivide(v.sales, v.qty);
    const avgMarginRate = v.sales > 0 ? ((v.sales - v.cogs) / v.sales) * 100 : 0;
    result.set(item, {
      품목: item,
      영업조직팀: v.org,
      매출수량: v.qty,
      매출액: v.sales,
      실적매출원가: v.cogs,
      unitCost,
      avgUnitPrice,
      avgMarginRate: isFinite(avgMarginRate) ? avgMarginRate : 0,
    });
  }
  return result;
}

/**
 * 매출리스트 + 품목원가맵 → 거래처×품목 마진 테이블 생성
 */
export function calcCustomerItemMargin(
  salesList: SalesRecord[],
  itemCostMap: Map<string, ItemUnitCost>
): CustomerItemMarginRow[] {
  // 거래처명×품목명 → 누적 데이터
  const accum = new Map<string, {
    거래처명: string; 품목명: string; 영업조직: string; 영업담당자명: string;
    totalQty: number; totalAmount: number; txCount: number;
    prices: number[];
    unitCost: number;
  }>();

  for (const row of salesList) {
    const custName = (row.매출처명 ?? "").trim();
    const itemName = (row.품목명 ?? "").trim();
    const itemCode = (row.품목 ?? "").trim();
    const price = row.판매단가 ?? 0;
    const qty = row.수량 ?? 0;
    const amt = row.장부금액 ?? 0;

    if (!custName || !itemName || qty <= 0) continue;

    // 품목코드 또는 품목명으로 원가 조회
    const costInfo = itemCostMap.get(itemCode) || itemCostMap.get(itemName);
    if (!costInfo) continue; // 원가 정보 없으면 스킵

    const key = `${custName}|${itemCode || itemName}`;
    const prev = accum.get(key) || {
      거래처명: custName,
      품목명: itemName,
      영업조직: row.영업조직 || "",
      영업담당자명: row.영업담당자명 || "",
      totalQty: 0,
      totalAmount: 0,
      txCount: 0,
      prices: [] as number[],
      unitCost: costInfo.unitCost,
    };
    accum.set(key, {
      ...prev,
      totalQty: prev.totalQty + qty,
      totalAmount: prev.totalAmount + amt,
      txCount: prev.txCount + 1,
      prices: price > 0 ? [...prev.prices, price] : prev.prices,
      영업담당자명: prev.영업담당자명 || row.영업담당자명 || "",
    });
  }

  const result: CustomerItemMarginRow[] = [];
  for (const v of Array.from(accum.values())) {
    if (v.totalQty <= 0 || v.prices.length === 0) continue;
    const avgSellingPrice = safeDivide(v.totalAmount, v.totalQty);
    const unitMargin = avgSellingPrice - v.unitCost;
    const marginRate = avgSellingPrice > 0 ? (unitMargin / avgSellingPrice) * 100 : 0;
    const totalMargin = v.totalAmount - (v.unitCost * v.totalQty);

    result.push({
      거래처명: v.거래처명,
      품목명: v.품목명,
      영업조직: v.영업조직,
      영업담당자명: v.영업담당자명,
      avgSellingPrice,
      unitCost: v.unitCost,
      unitMargin,
      marginRate: isFinite(marginRate) ? marginRate : 0,
      totalQty: v.totalQty,
      totalAmount: v.totalAmount,
      totalMargin: isFinite(totalMargin) ? totalMargin : 0,
      txCount: v.txCount,
      minPrice: v.prices.reduce((a, b) => Math.min(a, b), Infinity),
      maxPrice: v.prices.reduce((a, b) => Math.max(a, b), -Infinity),
    });
  }

  return result.sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * 거래처별 마진 요약
 */
export function calcCustomerMarginSummary(
  rows: CustomerItemMarginRow[]
): CustomerMarginSummary[] {
  const map = new Map<string, { items: Set<string>; totalAmt: number; totalMargin: number; marginRates: number[] }>();

  for (const r of rows) {
    const prev = map.get(r.거래처명) || { items: new Set(), totalAmt: 0, totalMargin: 0, marginRates: [] };
    prev.items.add(r.품목명);
    prev.totalAmt += r.totalAmount;
    prev.totalMargin += r.totalMargin;
    prev.marginRates.push(r.marginRate);
    map.set(r.거래처명, prev);
  }

  return Array.from(map.entries())
    .map(([name, v]) => ({
      거래처명: name,
      품목수: v.items.size,
      totalAmount: v.totalAmt,
      totalMargin: v.totalMargin,
      weightedMarginRate: v.totalAmt > 0 ? (v.totalMargin / v.totalAmt) * 100 : 0,
      avgMarginRate: v.marginRates.length > 0 ? v.marginRates.reduce((a, b) => a + b, 0) / v.marginRates.length : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
