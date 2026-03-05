import type {
  OrgCustomerProfitRecord,
  ReceivableAgingRecord,
} from "@/types";

export interface CustomerRiskEntry {
  거래처: string;
  영업조직팀: string;
  매출액: number;
  영업이익: number;
  영업이익율: number;
  미수금잔액: number;
  장기미수율: number;
  quadrant: "star" | "risk" | "improve" | "exit";
}

export interface QuadrantSummary {
  count: number;
  totalSales: number;
  avgProfitRate: number;
  customers: string[]; // top 5 거래처명
}

export interface CustomerRiskSummary {
  star: QuadrantSummary;
  risk: QuadrantSummary;
  improve: QuadrantSummary;
  exit: QuadrantSummary;
  medianProfitRate: number;
  medianAgingRate: number;
}

/**
 * 중앙값 계산
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * 거래처명 기반 contains 매칭
 * profitData.매출거래처명 ↔ agingData.판매처명
 */
function findAgingMatch(
  customerName: string,
  agingMap: Map<string, { 미수금잔액: number; 장기미수율: number }>
): { 미수금잔액: number; 장기미수율: number } | undefined {
  // 정확 매칭 우선
  const exact = agingMap.get(customerName);
  if (exact !== undefined) return exact;

  // contains 매칭
  const entries = Array.from(agingMap.entries());
  for (let i = 0; i < entries.length; i++) {
    const [key, val] = entries[i];
    if (key.includes(customerName) || customerName.includes(key)) return val;
  }
  return undefined;
}

/**
 * 거래처별 수익성 x 미수금 리스크 4사분면 분석
 *
 * profitData: 303 조직별 거래처별 손익 (OrgCustomerProfitRecord)
 * agingData: 미수금 에이징 (ReceivableAgingRecord)
 *
 * 매칭: 매출거래처명 ↔ 판매처명 (이름 기반 contains 검색)
 * 사분면: median 기준으로 고/저 분류
 */
export function calcCustomerRiskMatrix(
  profitData: OrgCustomerProfitRecord[],
  agingData: ReceivableAgingRecord[]
): CustomerRiskEntry[] {
  // 1. agingData에서 거래처별 미수금/장기미수율 집계
  const agingByCustomer = new Map<
    string,
    { total: number; longTerm: number }
  >();

  for (const r of agingData) {
    const name = r.판매처명;
    if (!name) continue;

    const total = r.합계.장부금액;
    if (total === 0) continue; // 합계.장부금액 === 0 제외

    const longTerm =
      r.month3.장부금액 +
      r.month4.장부금액 +
      r.month5.장부금액 +
      r.month6.장부금액 +
      r.overdue.장부금액;

    const entry = agingByCustomer.get(name) || { total: 0, longTerm: 0 };
    entry.total += total;
    entry.longTerm += longTerm;
    agingByCustomer.set(name, entry);
  }

  // agingMap: 거래처명 → { 미수금잔액, 장기미수율 }
  const agingMap = new Map<
    string,
    { 미수금잔액: number; 장기미수율: number }
  >();
  Array.from(agingByCustomer.entries()).forEach(([name, v]) => {
    const rate = v.total > 0 ? (v.longTerm / v.total) * 100 : 0;
    agingMap.set(name, {
      미수금잔액: v.total,
      장기미수율: isFinite(rate) ? Math.max(rate, 0) : 0,
    });
  });

  // 2. profitData에서 거래처별 손익 집계 (동일 거래처명이 여러 행일 수 있음)
  const profitByCustomer = new Map<
    string,
    { 영업조직팀: string; 매출액: number; 영업이익: number }
  >();

  for (const r of profitData) {
    const name = r.매출거래처명;
    if (!name) continue;
    if (r.매출액.실적 === 0) continue; // 매출액.실적 === 0 제외

    const entry = profitByCustomer.get(name) || {
      영업조직팀: r.영업조직팀,
      매출액: 0,
      영업이익: 0,
    };
    entry.매출액 += r.매출액.실적;
    entry.영업이익 += r.영업이익.실적;
    profitByCustomer.set(name, entry);
  }

  // 3. 거래처별 영업이익율 + 장기미수율 계산
  const entries: CustomerRiskEntry[] = [];

  Array.from(profitByCustomer.entries()).forEach(([name, profit]) => {
    const profitRate =
      profit.매출액 !== 0 ? (profit.영업이익 / profit.매출액) * 100 : 0;
    const safeProfitRate = isFinite(profitRate) ? profitRate : 0;

    const agingMatch = findAgingMatch(name, agingMap);
    const 미수금잔액 = agingMatch?.미수금잔액 ?? 0;
    const 장기미수율 = agingMatch?.장기미수율 ?? 0;

    entries.push({
      거래처: name,
      영업조직팀: profit.영업조직팀,
      매출액: profit.매출액,
      영업이익: profit.영업이익,
      영업이익율: safeProfitRate,
      미수금잔액,
      장기미수율,
      quadrant: "star", // placeholder, 아래에서 median 기준으로 재분류
    });
  });

  if (entries.length === 0) return [];

  // 4. median 계산 후 사분면 분류
  const medianProfit = median(entries.map((e) => e.영업이익율));
  const medianAging = median(entries.map((e) => e.장기미수율));

  return entries.map((e) => ({
    ...e,
    quadrant: classifyQuadrant(e.영업이익율, e.장기미수율, medianProfit, medianAging),
  }));
}

/**
 * 4사분면 분류 (median 기준)
 * - star: 고수익(> median) + 저리스크(<= median)
 * - risk: 고수익 + 고리스크
 * - improve: 저수익 + 저리스크
 * - exit: 저수익 + 고리스크
 */
function classifyQuadrant(
  profitRate: number,
  agingRate: number,
  medianProfit: number,
  medianAging: number
): CustomerRiskEntry["quadrant"] {
  const highProfit = profitRate > medianProfit;
  const highRisk = agingRate > medianAging;

  if (highProfit && !highRisk) return "star";
  if (highProfit && highRisk) return "risk";
  if (!highProfit && !highRisk) return "improve";
  return "exit";
}

/**
 * 사분면별 요약 통계
 */
export function calcCustomerRiskSummary(
  matrix: CustomerRiskEntry[]
): CustomerRiskSummary {
  const medianProfitRate = median(matrix.map((e) => e.영업이익율));
  const medianAgingRate = median(matrix.map((e) => e.장기미수율));

  function summarize(quadrant: CustomerRiskEntry["quadrant"]): QuadrantSummary {
    const items = matrix.filter((e) => e.quadrant === quadrant);
    const totalSales = items.reduce((sum, e) => sum + e.매출액, 0);
    const avgProfitRate =
      items.length > 0
        ? items.reduce((sum, e) => sum + e.영업이익율, 0) / items.length
        : 0;

    // top 5 거래처 (매출액 내림차순)
    const customers = [...items]
      .sort((a, b) => b.매출액 - a.매출액)
      .slice(0, 5)
      .map((e) => e.거래처);

    return {
      count: items.length,
      totalSales,
      avgProfitRate: isFinite(avgProfitRate) ? avgProfitRate : 0,
      customers,
    };
  }

  return {
    star: summarize("star"),
    risk: summarize("risk"),
    improve: summarize("improve"),
    exit: summarize("exit"),
    medianProfitRate: isFinite(medianProfitRate) ? medianProfitRate : 0,
    medianAgingRate: isFinite(medianAgingRate) ? medianAgingRate : 0,
  };
}
