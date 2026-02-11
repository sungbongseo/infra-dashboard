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
  if (avgMonthlySales <= 0) return receivablesTotal > 0 ? Infinity : 0;
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
  for (const s of sales) {
    const org = (s.영업조직 || "").trim();
    if (!org) continue;
    const month = extractMonth(s.매출일);
    if (!month) continue;

    if (!salesByOrgMonth.has(org)) {
      salesByOrgMonth.set(org, new Map());
    }
    const monthMap = salesByOrgMonth.get(org)!;
    monthMap.set(month, (monthMap.get(month) || 0) + s.장부금액);
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

  return calcDSO(totalReceivables, avgMonthlySales);
}
