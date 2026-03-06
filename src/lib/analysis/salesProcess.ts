import type { SalesRecord, OrderRecord, CollectionRecord } from "@/types";

export interface SalesProcessKpis {
  winRate: number;
  avgSalesCycle: number;
  salesVelocity: number;
  avgCollectionLeadTime: number;
  totalWonAmount: number;
  totalLostAmount: number;
  pipelineCount: number;
}

// ─── 날짜 파싱 유틸 ─────────────────────────────────────────────────

/** 날짜 문자열 또는 Excel serial number를 Date로 변환 */
function parseDate(raw: string | number | undefined): Date | null {
  if (raw === undefined || raw === null || raw === "") return null;

  // Excel serial number
  if (typeof raw === "number" || /^\d{5}$/.test(String(raw))) {
    const serial = typeof raw === "number" ? raw : Number(raw);
    if (!isFinite(serial) || serial < 1) return null;
    const d = new Date((serial - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(raw).trim();

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    return isNaN(d.getTime()) ? null : d;
  }

  // ISO or slash-separated
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** 두 날짜 사이 일수 (절대값) */
function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 86400000;
}

// ─── Win Rate ────────────────────────────────────────────────────────

export function calcWinRate(orders: OrderRecord[]): {
  rate: number;
  wonAmount: number;
  lostAmount: number;
} {
  let wonAmount = 0;
  let lostAmount = 0;

  for (const o of orders) {
    const status = (o.품목상태 ?? "").trim();
    const amt = Number(o.장부금액) || 0;
    if (status === "완료") wonAmount += amt;
    else if (status === "삭제") lostAmount += amt;
  }

  const denom = wonAmount + lostAmount;
  const rate = denom > 0 ? (wonAmount / denom) * 100 : 0;

  return {
    rate: isFinite(rate) ? rate : 0,
    wonAmount,
    lostAmount,
  };
}

// ─── 평균 영업주기 (수주일 → 매출일) ─────────────────────────────────

export function calcAvgSalesCycle(
  orders: OrderRecord[],
  sales: SalesRecord[]
): number {
  // 수주번호 기반 매칭: 수주번호 → 가장 빠른 매출일
  const salesByOrder = new Map<string, Date>();
  for (const s of sales) {
    const key = (s.수주번호 ?? "").trim();
    if (!key) continue;
    const d = parseDate(s.매출일);
    if (!d) continue;
    const existing = salesByOrder.get(key);
    if (!existing || d < existing) {
      salesByOrder.set(key, d);
    }
  }

  const cycles: number[] = [];

  for (const o of orders) {
    if ((o.품목상태 ?? "").trim() !== "완료") continue;
    const orderDate = parseDate(o.수주일);
    if (!orderDate) continue;

    const orderKey = (o.수주번호 ?? "").trim();
    // 1차: 수주번호 매칭
    if (orderKey) {
      const saleDate = salesByOrder.get(orderKey);
      if (saleDate) {
        const days = daysBetween(orderDate, saleDate);
        if (days <= 365) cycles.push(days); // 1년 이내만 유효
        continue;
      }
    }

    // 2차: 거래처명 매칭 (납품처 ↔ 매출처) — 수주번호 없을 때 fallback
    const customer = (o.납품처 ?? "").trim();
    if (!customer) continue;

    let closest: number | null = null;
    for (const s of sales) {
      if ((s.매출처 ?? "").trim() !== customer) continue;
      const saleDate = parseDate(s.매출일);
      if (!saleDate) continue;
      const days = daysBetween(orderDate, saleDate);
      // 수주일 이후 매출만, 1년 이내
      if (saleDate >= orderDate && days <= 365) {
        if (closest === null || days < closest) closest = days;
      }
    }
    if (closest !== null) cycles.push(closest);
  }

  if (cycles.length === 0) return 0;
  const avg = cycles.reduce((a, b) => a + b, 0) / cycles.length;
  return isFinite(avg) ? Math.round(avg * 10) / 10 : 0;
}

// ─── Sales Velocity ──────────────────────────────────────────────────

export function calcSalesVelocity(
  orderCount: number,
  avgAmount: number,
  winRate: number,
  avgCycle: number
): number {
  const cycle = Math.max(avgCycle, 1);
  const velocity = (orderCount * avgAmount * (winRate / 100)) / cycle;
  return isFinite(velocity) ? velocity : 0;
}

// ─── 수금 리드타임 (매출일 → 수금일) ─────────────────────────────────

export function calcCollectionLeadTime(
  sales: SalesRecord[],
  collections: CollectionRecord[]
): number {
  // 거래처별 매출일 목록 (정렬)
  const salesByCustomer = new Map<string, Date[]>();
  for (const s of sales) {
    const customer = (s.매출처 ?? "").trim();
    if (!customer) continue;
    const d = parseDate(s.매출일);
    if (!d) continue;
    const list = salesByCustomer.get(customer) ?? [];
    list.push(d);
    salesByCustomer.set(customer, list);
  }

  // 각 리스트를 시간순 정렬
  for (const [, dates] of Array.from(salesByCustomer.entries())) {
    dates.sort((a, b) => a.getTime() - b.getTime());
  }

  const gaps: number[] = [];

  for (const c of collections) {
    const customer = (c.거래처명 ?? "").trim();
    if (!customer) continue;
    const collDate = parseDate(c.수금일);
    if (!collDate) continue;

    const saleDates = salesByCustomer.get(customer);
    if (!saleDates || saleDates.length === 0) continue;

    // 수금일 직전/당일의 가장 가까운 매출일 찾기
    let bestGap: number | null = null;
    for (const sd of saleDates) {
      if (sd > collDate) break; // 매출일이 수금일 이후면 중단
      const gap = daysBetween(sd, collDate);
      if (gap <= 180) {
        // 6개월 이내만 유효
        if (bestGap === null || gap < bestGap) bestGap = gap;
      }
    }
    if (bestGap !== null) gaps.push(bestGap);
  }

  if (gaps.length === 0) return 0;
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return isFinite(avg) ? Math.round(avg * 10) / 10 : 0;
}

// ─── 통합 KPI 계산 ──────────────────────────────────────────────────

export function calcSalesProcessKpis(
  orders: OrderRecord[],
  sales: SalesRecord[],
  collections: CollectionRecord[]
): SalesProcessKpis {
  const { rate: winRate, wonAmount, lostAmount } = calcWinRate(orders);
  const avgSalesCycle = calcAvgSalesCycle(orders, sales);
  const collectionLeadTime = calcCollectionLeadTime(sales, collections);

  // 수주 건수 / 건당 평균 금액
  const completedOrders = orders.filter(
    (o) => (o.품목상태 ?? "").trim() === "완료"
  );
  const orderCount = completedOrders.length;
  const avgAmount =
    orderCount > 0
      ? completedOrders.reduce((s, o) => s + (Number(o.장부금액) || 0), 0) /
        orderCount
      : 0;

  const salesVelocity = calcSalesVelocity(
    orderCount,
    avgAmount,
    winRate,
    avgSalesCycle
  );

  // 진행 중 수주 건수 (파이프라인)
  const pipelineCount = orders.filter(
    (o) => (o.품목상태 ?? "").trim() !== "완료" && (o.품목상태 ?? "").trim() !== "삭제"
  ).length;

  return {
    winRate,
    avgSalesCycle,
    salesVelocity,
    avgCollectionLeadTime: collectionLeadTime,
    totalWonAmount: wonAmount,
    totalLostAmount: lostAmount,
    pipelineCount,
  };
}
