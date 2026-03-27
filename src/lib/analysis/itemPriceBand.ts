/**
 * 품목별 단가 밴드 분석 (Item Price Band Analysis)
 *
 * 표준판매단가가 없는 상황에서 매출리스트의 거래처별 개별 단가를 집계하여
 * 품목별 가중평균단가, 중앙값, 사분위수, 편차율을 산출합니다.
 * 일상 비유: 같은 물건을 여러 가게에 다른 가격으로 납품할 때,
 * "이 물건의 대표 단가"와 "가격 편차"를 파악하는 분석입니다.
 */
import type { SalesRecord } from "@/types";
import { safeDivide } from "@/lib/utils";

// ─── 인터페이스 ───────────────────────────────────────────────────────

export interface ItemPriceBand {
  품목: string;
  품목명: string;
  단위: string;             // EA, KG, M, SET 등
  제품군: string;
  거래처수: number;
  총수량: number;
  총매출액: number;
  가중평균단가: number;       // Σ(매출금액) / Σ(수량)
  중앙값단가: number;         // 거래건별 단가의 중앙값
  최저단가: number;
  최고단가: number;
  Q1단가: number;            // 25th percentile
  Q3단가: number;            // 75th percentile
  단가편차율: number;         // (Q3 - Q1) / 중앙값 × 100 (IQR 기반)
  단위원가?: number;          // 501 데이터 연계 시
  가중평균마진율?: number;    // (가중평균단가 - 단위원가) / 가중평균단가 × 100
  거래처별단가: Array<{ 거래처: string; 평균단가: number; 수량: number; 매출액: number }>;
}

export interface PriceBandSummary {
  totalItems: number;
  avgVariationRate: number;
  highVariationCount: number;   // 편차율 20% 초과 품목 수
  items: ItemPriceBand[];
}

// ─── 헬퍼 ───────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── 메인 함수 ──────────────────────────────────────────────────────

/**
 * 매출리스트에서 품목별 단가 밴드를 분석합니다.
 * @param sales 필터링된 매출 레코드
 * @param itemCostMap 품목별 단위원가 맵 (optional, 501 데이터)
 */
export function calcItemPriceBand(
  sales: SalesRecord[],
  itemCostMap?: Map<string, { unitCost: number }>
): PriceBandSummary {
  // 1단계: 품목별 거래 집계
  const itemMap = new Map<string, {
    품목: string;
    품목명: string;
    단위: string;
    제품군: string;
    prices: number[];           // 거래건별 판매단가 목록
    totalQty: number;
    totalAmount: number;
    customers: Map<string, { qty: number; amount: number }>;
  }>();

  for (const r of sales) {
    const itemCode = (r.품목 ?? "").trim();
    const itemName = (r.품목명 ?? "").trim();
    if (!itemCode && !itemName) continue;

    const qty = r.수량 ?? 0;
    const amount = r.장부금액 ?? 0;
    const customer = (r.매출처명 ?? r.수금처명 ?? "").trim();
    if (qty <= 0 || amount <= 0) continue;

    // 장부단가 기준 통일 (원화 환산): 외화 거래도 원화 기준으로 비교 가능
    // 장부금액 = 판매단가 × 수량 × 환율 이므로, 장부금액/수량 = 원화 단위당 단가
    const price = safeDivide(amount, qty);
    if (price <= 0) continue;

    const key = itemCode || itemName;
    const entry = itemMap.get(key) || {
      품목: itemCode,
      품목명: itemName,
      단위: (r.단위 ?? "").trim(),
      제품군: r.제품군 ?? r.대분류 ?? "",
      prices: [] as number[],
      totalQty: 0,
      totalAmount: 0,
      customers: new Map<string, { qty: number; amount: number }>(),
    };

    entry.prices.push(price);
    entry.totalQty += qty;
    entry.totalAmount += amount;
    entry.품목명 = entry.품목명 || itemName;
    entry.단위 = entry.단위 || (r.단위 ?? "").trim();
    entry.제품군 = entry.제품군 || (r.제품군 ?? r.대분류 ?? "");

    if (customer) {
      const cEntry = entry.customers.get(customer) || { qty: 0, amount: 0 };
      cEntry.qty += qty;
      cEntry.amount += amount;
      entry.customers.set(customer, cEntry);
    }

    itemMap.set(key, entry);
  }

  // 2단계: 품목별 단가 밴드 계산
  const items: ItemPriceBand[] = [];

  for (const [key, data] of Array.from(itemMap.entries())) {
    if (data.prices.length === 0) continue;

    const sorted = [...data.prices].sort((a, b) => a - b);
    const median = percentile(sorted, 50);
    const q1 = percentile(sorted, 25);
    const q3 = percentile(sorted, 75);
    const weightedAvg = safeDivide(data.totalAmount, data.totalQty);
    const variationRate = median > 0 ? ((q3 - q1) / median) * 100 : 0;

    // 501 원가 연계
    const costInfo = itemCostMap?.get(key) || itemCostMap?.get(data.품목명);
    const unitCost = costInfo?.unitCost;
    const marginRate = unitCost !== undefined && weightedAvg > 0
      ? ((weightedAvg - unitCost) / weightedAvg) * 100
      : undefined;

    // 거래처별 평균단가
    const 거래처별단가 = Array.from(data.customers.entries())
      .map(([name, c]) => ({
        거래처: name,
        평균단가: Math.round(safeDivide(c.amount, c.qty)),
        수량: c.qty,
        매출액: c.amount,
      }))
      .sort((a, b) => b.매출액 - a.매출액)
      .slice(0, 10);

    items.push({
      품목: data.품목,
      품목명: data.품목명,
      단위: data.단위 || "-",
      제품군: data.제품군,
      거래처수: data.customers.size,
      총수량: data.totalQty,
      총매출액: data.totalAmount,
      가중평균단가: Math.round(weightedAvg),
      중앙값단가: Math.round(median),
      최저단가: sorted[0],
      최고단가: sorted[sorted.length - 1],
      Q1단가: Math.round(q1),
      Q3단가: Math.round(q3),
      단가편차율: isFinite(variationRate) ? Math.round(variationRate * 10) / 10 : 0,
      단위원가: unitCost !== undefined ? Math.round(unitCost) : undefined,
      가중평균마진율: marginRate !== undefined && isFinite(marginRate)
        ? Math.round(marginRate * 10) / 10
        : undefined,
      거래처별단가,
    });
  }

  // 정렬: 매출액 내림차순
  items.sort((a, b) => b.총매출액 - a.총매출액);

  const highVariationCount = items.filter(i => i.단가편차율 > 20).length;
  const avgVariation = items.length > 0
    ? items.reduce((s, i) => s + i.단가편차율, 0) / items.length
    : 0;

  return {
    totalItems: items.length,
    avgVariationRate: Math.round(avgVariation * 10) / 10,
    highVariationCount,
    items,
  };
}
