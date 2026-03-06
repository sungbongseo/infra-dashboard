import type { ReceivableAgingRecord, SalesRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

export type DSOClassification = "excellent" | "good" | "fair" | "poor";

export interface DSOMetric {
  org: string;
  dso: number;
  totalReceivables: number;
  avgMonthlySales: number;
  classification: DSOClassification;
}

/**
 * DSO (Days Sales Outstanding) = (Total Receivables / Average Monthly Sales) x 30
 * 미수채권 회수에 걸리는 평균 일수
 */
export function calcDSO(receivablesTotal: number, avgMonthlySales: number): number {
  if (avgMonthlySales <= 0) return receivablesTotal > 0 ? 999 : 0; // 999일 = 실질 회수불가
  return Math.round((receivablesTotal / avgMonthlySales) * 30);
}

/**
 * DSO 등급 분류
 * < 30일: excellent (우수)
 * 30~45일: good (양호)
 * 45~60일: fair (보통)
 * > 60일: poor (주의)
 */
export function classifyDSO(dso: number): DSOClassification {
  if (!isFinite(dso) || dso > 60) return "poor";
  if (dso < 30) return "excellent";
  if (dso <= 45) return "good";
  return "fair";
}

/**
 * 조직별 DSO 계산
 * - receivableAging: 영업조직별 합계.장부금액으로 미수금 합산
 * - sales: 영업조직별 월별 매출(장부금액)을 평균하여 월평균매출 산출
 */
export function calcDSOByOrg(
  receivableAging: ReceivableAgingRecord[],
  sales: SalesRecord[]
): DSOMetric[] {
  // 1. 조직별 매출을 월별로 그룹핑하여 월평균 매출 계산
  const salesByOrgMonth = new Map<string, Map<string, number>>();
  let skippedCount = 0;
  for (const s of sales) {
    const org = (s.영업조직 || "").trim();
    if (!org) continue;
    const month = extractMonth(s.매출일);
    if (!month) { skippedCount++; continue; }

    if (!salesByOrgMonth.has(org)) {
      salesByOrgMonth.set(org, new Map());
    }
    const monthMap = salesByOrgMonth.get(org)!;
    monthMap.set(month, (monthMap.get(month) || 0) + s.장부금액);
  }

  // 날짜 파싱 실패율 경고
  if (skippedCount > 0 && sales.length > 0) {
    const skipRate = (skippedCount / sales.length) * 100;
    if (skipRate > 5) {
      console.warn(`[DSO] 매출 날짜 파싱 실패 ${skippedCount}건 (${skipRate.toFixed(1)}%) → DSO 분모 왜곡 가능`);
    }
  }

  // 조직별 월평균 매출 계산
  const avgMonthlySalesByOrg = new Map<string, number>();
  for (const [org, monthMap] of Array.from(salesByOrgMonth.entries())) {
    const months = Array.from(monthMap.values());
    const totalSales = months.reduce((sum, v) => sum + v, 0);
    const monthCount = months.length;
    avgMonthlySalesByOrg.set(org, monthCount > 0 ? totalSales / monthCount : 0);
  }

  // 2. 조직별 미수금 합산 (합계.장부금액)
  const receivablesByOrg = new Map<string, number>();
  for (const r of receivableAging) {
    const org = (r.영업조직 || "").trim();
    if (!org) continue;
    receivablesByOrg.set(org, (receivablesByOrg.get(org) || 0) + r.합계.장부금액);
  }

  // 3. 조직별 DSO 계산
  const allOrgs = new Set([
    ...Array.from(receivablesByOrg.keys()),
    ...Array.from(avgMonthlySalesByOrg.keys()),
  ]);

  const results: DSOMetric[] = [];
  for (const org of Array.from(allOrgs)) {
    const totalReceivables = receivablesByOrg.get(org) || 0;
    const avgMonthlySales = avgMonthlySalesByOrg.get(org) || 0;
    const dso = calcDSO(totalReceivables, avgMonthlySales);

    // 미수금이 0이고 매출도 0이면 의미 없으므로 제외
    if (totalReceivables === 0 && avgMonthlySales === 0) continue;
    // 매출 없이 미수금만 있는 경우 DSO 산출 불가 → 제외
    if (!isFinite(dso)) continue;

    results.push({
      org,
      dso,
      totalReceivables,
      avgMonthlySales,
      classification: classifyDSO(dso),
    });
  }

  return results.sort((a, b) => a.dso - b.dso);
}

// ─── DSO Trend ───────────────────────────────────────────────

export interface DSOTrendPoint {
  month: string;
  dso: number;
  totalReceivables: number;
  monthlySales: number;
  isSynthetic?: boolean; // true = 미수금 비례배분 추정치
}

/**
 * 월별 DSO 추세 (Rolling DSO)
 * 각 월의 매출에 대해 해당 시점의 미수금 잔액 비율로 DSO를 추정
 * receivableAging의 합계.장부금액은 시점 데이터(스냅샷)이므로
 * 전체 미수금을 월별 매출에 대한 비중으로 배분하여 추정
 *
 * 실질적으로는: DSO_month = (총미수금 / 전체매출) × 해당월매출비중 가중 DSO
 * → 간소화: 월별 매출 규모 대비 전체 DSO를 추정하는 근사치
 */
export function calcDSOTrend(
  receivableAging: ReceivableAgingRecord[],
  sales: SalesRecord[]
): DSOTrendPoint[] {
  if (receivableAging.length === 0 || sales.length === 0) return [];

  // 전체 미수금
  const totalReceivables = receivableAging.reduce(
    (sum, r) => sum + r.합계.장부금액, 0
  );

  // 월별 매출 집계
  const salesByMonth = new Map<string, number>();
  for (const s of sales) {
    const month = extractMonth(s.매출일);
    if (!month) continue;
    salesByMonth.set(month, (salesByMonth.get(month) || 0) + s.장부금액);
  }

  const months = Array.from(salesByMonth.keys()).sort();
  if (months.length === 0) return [];

  // 전체 월평균 매출
  const totalSales = Array.from(salesByMonth.values()).reduce((s, v) => s + v, 0);
  const avgMonthlySales = totalSales / months.length;

  // 월별 DSO: 해당월 매출 기준 rolling DSO 추정
  // DSO_month = (totalReceivables × (monthlySales / totalSales)) / monthlySales × 30
  //           = (totalReceivables / totalSales) × 30
  // → 모든 월이 같은 값이 되므로 의미가 없음
  // 대안: 누적 매출 기반 rolling DSO
  // 매월 누적 미수금 잔액 추정: 미수금 × (최근N개월 매출비중)
  // 간소화: 3개월 이동평균 매출 기반 DSO

  // 1단계: 각 월의 raw 미수금 배분 계산
  const rawAllocations: { month: string; raw: number; monthlySales: number }[] = [];
  for (let i = 0; i < months.length; i++) {
    const month = months[i];
    const monthlySales = salesByMonth.get(month) || 0;
    const raw = avgMonthlySales > 0
      ? totalReceivables * (monthlySales / totalSales * months.length)
      : totalReceivables / months.length;
    rawAllocations.push({ month, raw: Math.max(raw, 0), monthlySales });
  }

  // 2단계: 정규화 — raw 합계가 totalReceivables를 초과하면 비례 축소
  const rawTotal = rawAllocations.reduce((sum, a) => sum + a.raw, 0);
  const normFactor = rawTotal > totalReceivables && rawTotal > 0
    ? totalReceivables / rawTotal
    : 1;

  // 3단계: 정규화된 배분으로 DSO 계산
  const result: DSOTrendPoint[] = [];
  for (let i = 0; i < rawAllocations.length; i++) {
    const { month, monthlySales } = rawAllocations[i];
    const monthlyReceivables = rawAllocations[i].raw * normFactor;

    // 3개월 이동평균 매출 (최근 3개월)
    let rollingSum = 0;
    let rollingCount = 0;
    for (let j = Math.max(0, i - 2); j <= i; j++) {
      rollingSum += salesByMonth.get(months[j]) || 0;
      rollingCount++;
    }
    const rollingAvg = rollingCount > 0 ? rollingSum / rollingCount : 0;

    const dso = rollingAvg > 0
      ? Math.round((monthlyReceivables / rollingAvg) * 30)
      : 0;

    if (isFinite(dso) && dso >= 0) {
      result.push({
        month,
        dso,
        totalReceivables: Math.round(monthlyReceivables),
        monthlySales,
        isSynthetic: true, // 미수금 비례배분 추정치 (스냅샷 데이터 기반)
      });
    }
  }

  return result;
}

/**
 * 전체 평균 DSO 계산
 * 전체 미수금 합계 / 전체 월평균 매출 x 30
 */
export function calcOverallDSO(
  receivableAging: ReceivableAgingRecord[],
  sales: SalesRecord[]
): number {
  // 전체 미수금 합계
  const totalReceivables = receivableAging.reduce(
    (sum, r) => sum + r.합계.장부금액,
    0
  );

  // 전체 월별 매출 계산
  const salesByMonth = new Map<string, number>();
  for (const s of sales) {
    const month = extractMonth(s.매출일);
    if (!month) continue;
    salesByMonth.set(month, (salesByMonth.get(month) || 0) + s.장부금액);
  }

  const months = Array.from(salesByMonth.values());
  const totalSales = months.reduce((sum, v) => sum + v, 0);
  const monthCount = months.length;
  const avgMonthlySales = monthCount > 0 ? totalSales / monthCount : 0;

  const dso = calcDSO(totalReceivables, avgMonthlySales);
  return isFinite(dso) ? dso : 999;
}
