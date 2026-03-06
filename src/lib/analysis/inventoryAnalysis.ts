import type { InventoryMovementRecord } from "@/types";

export interface ItemInventoryAnalysis {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  단위: string;
  기초: number;
  입고: number;
  출고: number;
  기말: number;
  회전율: number;     // 출고 / ((기초+기말)/2), 높을수록 좋음
  보유일수: number;   // ((기초+기말)/2) / 출고 × 365
  입출비율: number;   // 입고 / 출고, 1 초과=재고 증가 추세
}

export interface GroupInventorySummary {
  group: string;
  itemCount: number;
  totalOpening: number;
  totalIncoming: number;
  totalOutgoing: number;
  totalClosing: number;
}

export interface InventoryKPI {
  totalItems: number;
  avgTurnoverRate: number;    // 제품 평균 회전율
  deadStockCount: number;     // 사장재고 (기말>0 & 출고=0)
  overstockItems: number;     // 과잉재고 (입출비율 > 1.5)
}

/**
 * 품목별 재고 분석 (전 공장 합산)
 * 같은 품목코드는 공장별 수량을 합산
 */
export function calcItemInventory(
  data: Map<string, InventoryMovementRecord[]>
): ItemInventoryAnalysis[] {
  const map = new Map<string, {
    품목명: string;
    품목계정그룹: string;
    단위: string;
    기초: number;
    입고: number;
    출고: number;
    기말: number;
  }>();

  for (const records of Array.from(data.values())) {
    for (const r of records) {
      const key = r.품목.trim();
      if (!key) continue;
      const entry = map.get(key) || {
        품목명: r.품목명,
        품목계정그룹: r.품목계정그룹,
        단위: r.단위,
        기초: 0, 입고: 0, 출고: 0, 기말: 0,
      };
      entry.기초 += r.기초;
      entry.입고 += r.입고;
      entry.출고 += r.출고;
      entry.기말 += r.기말;
      map.set(key, entry);
    }
  }

  return Array.from(map.entries()).map(([품목, v]) => {
    const avg = (v.기초 + v.기말) / 2;
    const 회전율 = avg > 0 ? v.출고 / avg : 0;
    const 보유일수 = 회전율 > 0 ? 365 / 회전율 : (v.기말 > 0 ? 999 : 0);
    const 입출비율 = v.출고 > 0 ? v.입고 / v.출고 : (v.입고 > 0 ? 999 : 0);

    return {
      품목,
      품목명: v.품목명,
      품목계정그룹: v.품목계정그룹,
      단위: v.단위,
      기초: v.기초,
      입고: v.입고,
      출고: v.출고,
      기말: v.기말,
      회전율: isFinite(회전율) ? Math.round(회전율 * 10) / 10 : 0,
      보유일수: isFinite(보유일수) ? Math.round(보유일수) : 0,
      입출비율: isFinite(입출비율) ? Math.round(입출비율 * 100) / 100 : 0,
    };
  }).sort((a, b) => b.보유일수 - a.보유일수); // 보유일수 높은(체류 오래된) 품목 먼저
}

/**
 * 품목계정그룹별 요약
 */
export function calcGroupSummary(
  items: ItemInventoryAnalysis[]
): GroupInventorySummary[] {
  const map = new Map<string, GroupInventorySummary>();

  for (const item of items) {
    const g = item.품목계정그룹 || "기타";
    const entry = map.get(g) || {
      group: g,
      itemCount: 0,
      totalOpening: 0,
      totalIncoming: 0,
      totalOutgoing: 0,
      totalClosing: 0,
    };
    entry.itemCount++;
    entry.totalOpening += item.기초;
    entry.totalIncoming += item.입고;
    entry.totalOutgoing += item.출고;
    entry.totalClosing += item.기말;
    map.set(g, entry);
  }

  return Array.from(map.values()).sort((a, b) => b.totalOutgoing - a.totalOutgoing);
}

/**
 * 재고 KPI (제품 기준)
 */
export function calcInventoryKPI(
  items: ItemInventoryAnalysis[]
): InventoryKPI {
  const products = items.filter((i) => i.품목계정그룹 === "제품");
  const withTurnover = products.filter((i) => i.회전율 > 0);
  const avgTurnoverRate = withTurnover.length > 0
    ? withTurnover.reduce((s, i) => s + i.회전율, 0) / withTurnover.length
    : 0;

  const deadStockCount = items.filter((i) => i.기말 > 0 && i.출고 === 0).length;
  const overstockItems = items.filter((i) => i.입출비율 > 1.5 && i.출고 > 0).length;

  return {
    totalItems: items.length,
    avgTurnoverRate: Math.round(avgTurnoverRate * 10) / 10,
    deadStockCount,
    overstockItems,
  };
}
