import type { InventoryMovementRecord } from "@/types";
import { safeDivide } from "@/lib/utils";

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
      entry.기초 += (r.기초 ?? 0);
      entry.입고 += (r.입고 ?? 0);
      entry.출고 += (r.출고 ?? 0);
      entry.기말 += (r.기말 ?? 0);
      map.set(key, entry);
    }
  }

  return Array.from(map.entries()).map(([품목, v]) => {
    const avg = (v.기초 + v.기말) / 2;
    const 회전율 = safeDivide(v.출고, avg);
    const 보유일수 = 회전율 > 0 ? safeDivide(365, 회전율) : (v.기말 > 0 ? 999 : 0);
    const 입출비율 = v.출고 > 0 ? safeDivide(v.입고, v.출고) : (v.입고 > 0 ? 999 : 0);

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

// ─── 월별 재고 분석 (Phase 2: monthly-analysis) ─────────────────────

export interface InventoryTurnover {
  factory: string;
  품목: string;
  품목명: string;
  단위: string;
  avgInventory: number;    // (기초 + 기말) / 2 의 월평균
  totalOut: number;        // 총 출고 수량
  turnoverRate: number;    // 출고 / 평균재고
  months: number;          // 데이터 월 수
}

export interface MonthlyMovement {
  month: string;           // YYYYMM
  factory: string;
  입고합계: number;
  출고합계: number;
  기말재고합계: number;
}

export interface SlowMovingItem {
  factory: string;
  품목: string;
  품목명: string;
  단위: string;
  기말재고: number;
  zeroOutMonths: number;   // 출고=0인 연속 월 수
  lastOutMonth: string;    // 마지막 출고 월
}

export interface DIOResult {
  factory: string;
  dio: number;             // Days Inventory Outstanding
  avgInventoryValue: number;
  dailyCOGS: number;       // 수량 기반 일일 출고
}

/**
 * 품목별 재고회전율 계산 (월별 데이터 활용).
 * 회전율 = 총 출고 / 평균재고.
 * 평균재고 = 각 월의 (기초+기말)/2 의 평균.
 */
export function calcInventoryTurnover(
  data: InventoryMovementRecord[]
): InventoryTurnover[] {
  const map = new Map<
    string,
    {
      factory: string;
      품목: string;
      품목명: string;
      단위: string;
      avgInvSum: number;
      totalOut: number;
      months: number;
    }
  >();

  for (const row of data) {
    const key = `${row.factory}||${row.품목}`;
    const existing = map.get(key);
    const monthAvg = (row.기초 + row.기말) / 2;

    if (existing) {
      existing.avgInvSum += monthAvg;
      existing.totalOut += row.출고;
      existing.months += 1;
    } else {
      map.set(key, {
        factory: row.factory,
        품목: row.품목,
        품목명: row.품목명,
        단위: row.단위 || "",
        avgInvSum: monthAvg,
        totalOut: row.출고,
        months: 1,
      });
    }
  }

  return Array.from(map.values()).map((item) => {
    const avgInventory = item.months > 0 ? item.avgInvSum / item.months : 0;
    const turnoverRate = avgInventory > 0 ? item.totalOut / avgInventory : 0;

    return {
      factory: item.factory,
      품목: item.품목,
      품목명: item.품목명,
      단위: item.단위,
      avgInventory,
      totalOut: item.totalOut,
      turnoverRate: isFinite(turnoverRate) ? turnoverRate : 0,
      months: item.months,
    };
  });
}

/**
 * 공장별·월별 입고/출고/기말재고 합계.
 * 월 오름차순 정렬.
 */
export function calcMonthlyMovement(
  data: InventoryMovementRecord[]
): MonthlyMovement[] {
  const map = new Map<
    string,
    { month: string; factory: string; 입고: number; 출고: number; 기말: number }
  >();

  for (const row of data) {
    const m = row.month;
    if (!m) continue;

    const key = `${row.factory}||${m}`;
    const existing = map.get(key);

    if (existing) {
      existing.입고 += row.입고;
      existing.출고 += row.출고;
      existing.기말 += row.기말;
    } else {
      map.set(key, {
        month: m,
        factory: row.factory,
        입고: row.입고,
        출고: row.출고,
        기말: row.기말,
      });
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      month: item.month,
      factory: item.factory,
      입고합계: item.입고,
      출고합계: item.출고,
      기말재고합계: item.기말,
    }))
    .sort((a, b) => {
      const fc = a.factory.localeCompare(b.factory);
      if (fc !== 0) return fc;
      return a.month.localeCompare(b.month);
    });
}

/**
 * 장기재고(슬로우무빙) 감지.
 * 출고=0인 연속 월이 thresholdMonths 이상인 품목.
 */
export function calcSlowMoving(
  data: InventoryMovementRecord[],
  thresholdMonths = 3
): SlowMovingItem[] {
  const map = new Map<
    string,
    {
      factory: string;
      품목: string;
      품목명: string;
      단위: string;
      monthlyData: { month: string; 출고: number; 기말: number }[];
    }
  >();

  for (const row of data) {
    const m = row.month;
    if (!m) continue;

    const key = `${row.factory}||${row.품목}`;
    const existing = map.get(key);

    if (existing) {
      existing.monthlyData.push({ month: m, 출고: row.출고, 기말: row.기말 });
    } else {
      map.set(key, {
        factory: row.factory,
        품목: row.품목,
        품목명: row.품목명,
        단위: row.단위 || "",
        monthlyData: [{ month: m, 출고: row.출고, 기말: row.기말 }],
      });
    }
  }

  const results: SlowMovingItem[] = [];

  for (const item of Array.from(map.values())) {
    const sorted = item.monthlyData.sort((a, b) => a.month.localeCompare(b.month));

    let zeroOutMonths = 0;
    let lastOutMonth = "";

    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].출고 === 0) {
        zeroOutMonths++;
      } else {
        lastOutMonth = sorted[i].month;
        break;
      }
    }

    if (!lastOutMonth && zeroOutMonths === sorted.length) {
      lastOutMonth = "없음";
    }

    const lastRecord = sorted[sorted.length - 1];
    const 기말재고 = lastRecord?.기말 ?? 0;

    if (zeroOutMonths >= thresholdMonths && 기말재고 > 0) {
      results.push({
        factory: item.factory,
        품목: item.품목,
        품목명: item.품목명,
        단위: item.단위,
        기말재고,
        zeroOutMonths,
        lastOutMonth,
      });
    }
  }

  return results.sort((a, b) => b.기말재고 - a.기말재고);
}

/**
 * 공장별 DIO (Days Inventory Outstanding) 계산.
 * DIO = 평균재고 / 일일출고 (수량 기반).
 */
export function calcDIO(
  data: InventoryMovementRecord[]
): DIOResult[] {
  const map = new Map<
    string,
    { avgInvSum: number; totalOut: number; months: number }
  >();

  for (const row of data) {
    const existing = map.get(row.factory);
    const monthAvg = (row.기초 + row.기말) / 2;

    if (existing) {
      existing.avgInvSum += monthAvg;
      existing.totalOut += row.출고;
      existing.months += 1;
    } else {
      map.set(row.factory, {
        avgInvSum: monthAvg,
        totalOut: row.출고,
        months: 1,
      });
    }
  }

  return Array.from(map.entries()).map(([factory, agg]) => {
    const avgInventory = agg.months > 0 ? agg.avgInvSum / agg.months : 0;
    const dailyCOGS = agg.months > 0 ? agg.totalOut / (agg.months * 30) : 0;
    const dio = dailyCOGS > 0 ? avgInventory / dailyCOGS : 0;

    return {
      factory,
      dio: isFinite(dio) ? Math.round(dio) : 0,
      avgInventoryValue: Math.round(avgInventory),
      dailyCOGS: Math.round(dailyCOGS),
    };
  });
}
