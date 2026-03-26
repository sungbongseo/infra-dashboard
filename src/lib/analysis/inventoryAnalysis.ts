import type { InventoryMovementRecord, SalesRecord } from "@/types";
import type { ItemCostDetailRecord } from "@/types/itemCost";
import { safeDivide } from "@/lib/utils";

export interface ItemInventoryAnalysis {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  대분류: string;
  중분류: string;
  소분류: string;
  단위: string;
  factory: string;
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
    대분류: string;
    중분류: string;
    소분류: string;
    factory: string;
    단위: string;
    기초: number;
    입고: number;
    출고: number;
    기말: number;
  }>();

  for (const [factory, records] of Array.from(data.entries())) {
    for (const r of records) {
      const key = r.품목.trim();
      if (!key) continue;
      const entry = map.get(key) || {
        품목명: r.품목명,
        품목계정그룹: r.품목계정그룹,
        대분류: r.대분류 || "",
        중분류: r.중분류 || "",
        소분류: r.소분류 || "",
        factory,
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
      대분류: v.대분류,
      중분류: v.중분류,
      소분류: v.소분류,
      factory: v.factory,
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

// ─── ABC 재고 분류 ─────────────────────────────────────────────

export interface InventoryABCItem extends ItemInventoryAnalysis {
  abc: "A" | "B" | "C";
  출고비중: number;
  누적비중: number;
}

/** ABC 재고 분류 (파레토 80/20): A=누적80%, B=80~95%, C=95%+ */
export function calcInventoryABC(items: ItemInventoryAnalysis[]): InventoryABCItem[] {
  const sorted = [...items].filter(i => i.출고 > 0).sort((a, b) => b.출고 - a.출고);
  const total = sorted.reduce((s, i) => s + i.출고, 0);
  if (total === 0) return [];

  let cumulative = 0;
  return sorted.map(item => {
    const share = safeDivide(item.출고, total) * 100;
    cumulative += share;
    const abc = cumulative <= 80 ? "A" as const : cumulative <= 95 ? "B" as const : "C" as const;
    return { ...item, abc, 출고비중: Math.round(share * 10) / 10, 누적비중: Math.round(cumulative * 10) / 10 };
  });
}

// ─── 카테고리별 재고 분석 ──────────────────────────────────────

export interface CategoryInventorySummary {
  category: string;
  itemCount: number;
  totalClosing: number;
  totalOutgoing: number;
  avgTurnover: number;
  deadStockCount: number;
  deadStockRate: number;
}

/** 카테고리(대분류/중분류/소분류/품목계정그룹) 기준 재고 집계 */
export function calcCategoryInventory(
  items: ItemInventoryAnalysis[],
  level: "대분류" | "중분류" | "소분류" | "품목계정그룹" = "대분류"
): CategoryInventorySummary[] {
  const map = new Map<string, ItemInventoryAnalysis[]>();
  for (const item of items) {
    const key = (item as any)[level] || "미분류";
    const arr = map.get(key) || [];
    arr.push(item);
    map.set(key, arr);
  }

  return Array.from(map.entries())
    .map(([category, catItems]) => {
      const totalClosing = catItems.reduce((s, i) => s + i.기말, 0);
      const totalOutgoing = catItems.reduce((s, i) => s + i.출고, 0);
      const validTurnover = catItems.filter(i => i.회전율 > 0);
      const avgTurnover = validTurnover.length > 0
        ? validTurnover.reduce((s, i) => s + i.회전율, 0) / validTurnover.length : 0;
      const deadStockCount = catItems.filter(i => i.기말 > 0 && i.출고 === 0).length;
      return {
        category, itemCount: catItems.length, totalClosing, totalOutgoing,
        avgTurnover: Math.round(avgTurnover * 10) / 10, deadStockCount,
        deadStockRate: Math.round(safeDivide(deadStockCount, catItems.length) * 1000) / 10,
      };
    })
    .sort((a, b) => b.totalClosing - a.totalClosing);
}

// ─── 주거래처별 재고 분포 ──────────────────────────────────────

export interface CustomerInventorySummary {
  customer: string;
  itemCount: number;
  totalClosing: number;
  totalOutgoing: number;
  avgTurnover: number;
}

/** 주거래처 필드 기반 재고 분포 분석 */
export function calcCustomerInventory(data: InventoryMovementRecord[]): CustomerInventorySummary[] {
  const map = new Map<string, { closing: number; outgoing: number; items: Set<string> }>();
  for (const r of data) {
    const customer = (r.주거래처 || "").trim() || "미지정";
    const entry = map.get(customer) || { closing: 0, outgoing: 0, items: new Set() };
    entry.closing += (r.기말 ?? 0);
    entry.outgoing += (r.출고 ?? 0);
    entry.items.add(r.품목);
    map.set(customer, entry);
  }
  return Array.from(map.entries())
    .map(([customer, v]) => ({
      customer, itemCount: v.items.size, totalClosing: v.closing, totalOutgoing: v.outgoing,
      avgTurnover: v.closing > 0 ? Math.round(safeDivide(v.outgoing, v.closing) * 10) / 10 : 0,
    }))
    .filter(c => c.totalClosing > 0)
    .sort((a, b) => b.totalClosing - a.totalClosing);
}

// ─── 예상 소진일 계산 ──────────────────────────────────────────

export interface StockoutEstimate {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  대분류: string;
  factory: string;
  기말: number;
  월평균출고: number;
  예상소진일: number;
  risk: "danger" | "warning" | "safe";
}

/** 기말재고 기준 예상 소진일: danger(<30일), warning(30~60일), safe(60일+) */
export function calcStockoutEstimate(items: ItemInventoryAnalysis[]): StockoutEstimate[] {
  return items
    .filter(item => item.기말 > 0 && item.출고 > 0)
    .map(item => {
      const dailyOut = safeDivide(item.출고, 365);
      const days = safeDivide(item.기말, dailyOut);
      const risk = days < 30 ? "danger" as const : days < 60 ? "warning" as const : "safe" as const;
      return {
        품목: item.품목, 품목명: item.품목명, 품목계정그룹: item.품목계정그룹,
        대분류: item.대분류, factory: item.factory, 기말: item.기말,
        월평균출고: Math.round(safeDivide(item.출고, 12)),
        예상소진일: Math.round(days), risk,
      };
    })
    .sort((a, b) => a.예상소진일 - b.예상소진일);
}

// ─── 매출×재고 사분면 매트릭스 ──────────────────────────────────

export interface SalesInventoryQuadrant {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  대분류: string;
  매출금액: number;
  매출비중: number;      // %
  기말재고: number;
  회전율: number;
  quadrant: "star" | "overstock" | "fast" | "review";
  // star: 높매출+높회전 (핵심 품목)
  // overstock: 낮매출+낮회전 (과잉 재고, 정리 필요)
  // fast: 높매출+낮재고 (빠른 소진, 재고 부족 위험)
  // review: 낮매출+높회전 (소량 빈번, 검토 필요)
}

/**
 * 매출×재고 사분면 매트릭스
 * salesData의 품목별 매출과 inventoryItems의 회전율을 교차 분석
 */
export function calcSalesInventoryMatrix(
  inventoryItems: ItemInventoryAnalysis[],
  salesData: SalesRecord[]
): SalesInventoryQuadrant[] {
  // 매출 품목별 집계 (품목명 기준)
  const salesMap = new Map<string, number>();
  for (const s of salesData) {
    const name = (s.품목명 || s.품목 || "").trim();
    if (!name) continue;
    salesMap.set(name, (salesMap.get(name) || 0) + Math.abs(s.장부금액));
  }
  const totalSales = Array.from(salesMap.values()).reduce((s, v) => s + v, 0);

  // 재고 품목과 매출 교차
  const results: SalesInventoryQuadrant[] = [];
  const medianTurnover = getMedian(inventoryItems.filter(i => i.회전율 > 0).map(i => i.회전율));

  for (const item of inventoryItems) {
    if (item.기말 <= 0 && item.출고 <= 0) continue;
    // 품목명으로 매출 매칭 (재고 데이터는 코드, 매출은 이름일 수 있으므로 양방향 시도)
    const sales = salesMap.get(item.품목명) || salesMap.get(item.품목) || 0;
    const salesShare = safeDivide(sales, totalSales) * 100;
    const medianSalesShare = totalSales > 0 ? safeDivide(100, salesMap.size) : 0;

    const highSales = salesShare > medianSalesShare;
    const highTurnover = item.회전율 > medianTurnover;

    let quadrant: SalesInventoryQuadrant["quadrant"];
    if (highSales && highTurnover) quadrant = "star";
    else if (!highSales && !highTurnover) quadrant = "overstock";
    else if (highSales && !highTurnover) quadrant = "fast";
    else quadrant = "review";

    results.push({
      품목: item.품목, 품목명: item.품목명, 품목계정그룹: item.품목계정그룹,
      대분류: item.대분류, 매출금액: sales, 매출비중: Math.round(salesShare * 10) / 10,
      기말재고: item.기말, 회전율: item.회전율, quadrant,
    });
  }

  return results.sort((a, b) => b.매출금액 - a.매출금액);
}

function getMedian(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ─── 원가 연계 재고 금액 ───────────────────────────────────────

export interface InventoryValueItem {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  대분류: string;
  기말수량: number;
  단가: number;
  재고금액: number;       // 기말수량 × 단가
  금액비중: number;       // % of total
  abc금액: "A" | "B" | "C";
}

/**
 * itemCostDetail에서 품목별 단가를 추출하여 재고 금액 계산
 * 단가 = 실적매출원가.실적 ÷ 매출수량.실적
 */
export function calcInventoryValue(
  items: ItemInventoryAnalysis[],
  costData: ItemCostDetailRecord[]
): InventoryValueItem[] {
  // 원가 데이터에서 품목별 단가 추출
  const costMap = new Map<string, number>();
  for (const c of costData) {
    const key = (c.품목 || "").trim();
    if (!key) continue;
    const qty = c.매출수량?.실적 ?? 0;
    const cost = c.실적매출원가?.실적 ?? 0;
    if (qty > 0 && cost > 0) {
      costMap.set(key, safeDivide(cost, qty));
    }
  }

  // 재고 × 단가 = 금액
  const valued = items
    .filter(item => item.기말 > 0)
    .map(item => {
      const unitCost = costMap.get(item.품목) || 0;
      const value = item.기말 * unitCost;
      return { ...item, unitCost, value };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalValue = valued.reduce((s, v) => s + v.value, 0);

  // 금액 기준 ABC
  let cumulative = 0;
  return valued.map(item => {
    const share = safeDivide(item.value, totalValue) * 100;
    cumulative += share;
    const abc = cumulative <= 80 ? "A" as const : cumulative <= 95 ? "B" as const : "C" as const;
    return {
      품목: item.품목, 품목명: item.품목명, 품목계정그룹: item.품목계정그룹,
      대분류: item.대분류, 기말수량: item.기말,
      단가: Math.round(item.unitCost),
      재고금액: Math.round(item.value),
      금액비중: Math.round(share * 10) / 10,
      abc금액: abc,
    };
  });
}

// ─── 재고 수요 예측 (월별 이동평균) ────────────────────────────

export interface InventoryForecastItem {
  품목: string;
  품목명: string;
  품목계정그룹: string;
  대분류: string;
  기말재고: number;
  monthlyOutgoing: { month: string; qty: number }[];  // 월별 출고 이력
  avgMonthlyOut: number;    // 최근 3개월 평균 월 출고
  forecastNextMonth: number; // 다음 달 예측 출고 (이동평균)
  coverageMonths: number;   // 현재 재고 ÷ 예측 출고 = 커버리지 월수
  trend: "increasing" | "stable" | "decreasing"; // 출고 추세
}

/**
 * 월별 데이터 기반 품목별 수요 예측
 * 최근 3개월 이동평균으로 다음 달 출고 예측, 커버리지 월수 계산
 */
export function calcInventoryForecast(
  data: InventoryMovementRecord[]
): InventoryForecastItem[] {
  if (!data.some(r => r.month)) return []; // 월별 데이터 없으면 빈 배열

  // 품목별 월별 출고 집계
  const itemMonthly = new Map<string, {
    품목명: string; 품목계정그룹: string; 대분류: string; 기말: number;
    months: Map<string, number>;
  }>();

  for (const r of data) {
    const key = (r.품목 || "").trim();
    if (!key || !r.month) continue;
    const entry = itemMonthly.get(key) || {
      품목명: r.품목명, 품목계정그룹: r.품목계정그룹, 대분류: r.대분류 || "",
      기말: 0, months: new Map(),
    };
    entry.기말 = Math.max(entry.기말, r.기말 ?? 0); // 가장 최근 기말
    entry.months.set(r.month, (entry.months.get(r.month) || 0) + (r.출고 ?? 0));
    itemMonthly.set(key, entry);
  }

  const results: InventoryForecastItem[] = [];

  for (const [품목, v] of Array.from(itemMonthly.entries())) {
    if (v.months.size < 2) continue; // 2개월 미만 데이터 스킵

    const sorted = Array.from(v.months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, qty]) => ({ month, qty }));

    // 최근 3개월 (또는 가용 데이터) 이동평균
    const recent = sorted.slice(-3);
    const avgOut = recent.reduce((s, m) => s + m.qty, 0) / recent.length;

    // 추세 판단: 최근 3개월 중 마지막 vs 첫째
    let trend: InventoryForecastItem["trend"] = "stable";
    if (recent.length >= 2) {
      const first = recent[0].qty;
      const last = recent[recent.length - 1].qty;
      const change = first > 0 ? safeDivide(last - first, first) : 0;
      if (change > 0.15) trend = "increasing";
      else if (change < -0.15) trend = "decreasing";
    }

    const coverageMonths = avgOut > 0 ? safeDivide(v.기말, avgOut) : (v.기말 > 0 ? 999 : 0);

    results.push({
      품목, 품목명: v.품목명, 품목계정그룹: v.품목계정그룹, 대분류: v.대분류,
      기말재고: v.기말,
      monthlyOutgoing: sorted,
      avgMonthlyOut: Math.round(avgOut),
      forecastNextMonth: Math.round(avgOut), // 단순 이동평균 = 예측
      coverageMonths: Math.round(coverageMonths * 10) / 10,
      trend,
    });
  }

  return results.sort((a, b) => a.coverageMonths - b.coverageMonths); // 위험한 순
}

// ─── 품목그룹별 재고 분석 ──────────────────────────────────────

export interface ItemGroupInventorySummary {
  group: string;
  itemCount: number;
  totalClosing: number;
  totalOutgoing: number;
  avgTurnover: number;
  deadStockCount: number;
  overstockCount: number;
}

/** 품목그룹 필드 기반 재고 집계 (품목계정그룹과 다른 분류 체계) */
export function calcItemGroupInventory(
  data: InventoryMovementRecord[]
): ItemGroupInventorySummary[] {
  const map = new Map<string, {
    items: Set<string>; closing: number; outgoing: number;
    turnovers: number[]; deadCount: number; overstockCount: number;
  }>();

  // 품목별 먼저 집계
  const itemMap = new Map<string, { group: string; 기초: number; 입고: number; 출고: number; 기말: number }>();
  for (const r of data) {
    const key = (r.품목 || "").trim();
    if (!key) continue;
    const entry = itemMap.get(key) || {
      group: r.품목그룹 || "미분류", 기초: 0, 입고: 0, 출고: 0, 기말: 0,
    };
    entry.기초 += r.기초 ?? 0;
    entry.입고 += r.입고 ?? 0;
    entry.출고 += r.출고 ?? 0;
    entry.기말 += r.기말 ?? 0;
    itemMap.set(key, entry);
  }

  // 그룹별 집계
  for (const [품목, item] of Array.from(itemMap.entries())) {
    const group = item.group;
    const entry = map.get(group) || {
      items: new Set(), closing: 0, outgoing: 0,
      turnovers: [], deadCount: 0, overstockCount: 0,
    };
    entry.items.add(품목);
    entry.closing += item.기말;
    entry.outgoing += item.출고;
    const avg = (item.기초 + item.기말) / 2;
    const turnover = avg > 0 ? safeDivide(item.출고, avg) : 0;
    if (turnover > 0) entry.turnovers.push(turnover);
    if (item.기말 > 0 && item.출고 === 0) entry.deadCount++;
    if (item.출고 > 0 && safeDivide(item.입고, item.출고) > 1.5) entry.overstockCount++;
    map.set(group, entry);
  }

  return Array.from(map.entries())
    .map(([group, v]) => ({
      group,
      itemCount: v.items.size,
      totalClosing: v.closing,
      totalOutgoing: v.outgoing,
      avgTurnover: v.turnovers.length > 0
        ? Math.round((v.turnovers.reduce((s, t) => s + t, 0) / v.turnovers.length) * 10) / 10
        : 0,
      deadStockCount: v.deadCount,
      overstockCount: v.overstockCount,
    }))
    .sort((a, b) => b.totalClosing - a.totalClosing);
}
