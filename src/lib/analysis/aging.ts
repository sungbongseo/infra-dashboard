import type { ReceivableAgingRecord, RiskGrade, AgingRiskAssessment, CreditUtilization, CreditSummaryByOrg, CreditStatus } from "@/types";

// SAP FI-AR 표준: 90일(month3) 이상 = 연체
export const RISK_THRESHOLDS = {
  HIGH_OVERDUE_RATIO: 0.5,
  MEDIUM_OVERDUE_RATIO: 0.2,
  HIGH_OVERDUE_AMOUNT: 100_000_000,  // 1억원
  MEDIUM_OVERDUE_AMOUNT: 50_000_000,  // 5천만원
} as const;

export interface AgingSummary {
  month1: number;
  month2: number;
  month3: number;
  month4: number;
  month5: number;
  month6: number;
  overdue: number;
  total: number;
}

export function calcAgingSummary(records: ReceivableAgingRecord[]): AgingSummary {
  const summary: AgingSummary = {
    month1: 0, month2: 0, month3: 0, month4: 0, month5: 0, month6: 0, overdue: 0, total: 0,
  };

  for (const r of records) {
    summary.month1 += r.month1.장부금액;
    summary.month2 += r.month2.장부금액;
    summary.month3 += r.month3.장부금액;
    summary.month4 += r.month4.장부금액;
    summary.month5 += r.month5.장부금액;
    summary.month6 += r.month6.장부금액;
    summary.overdue += r.overdue.장부금액;
    summary.total += r.합계.장부금액;
  }

  return summary;
}

export function calcAgingByOrg(agingMap: Map<string, ReceivableAgingRecord[]>) {
  const result: Array<{ org: string } & AgingSummary> = [];
  for (const [org, records] of Array.from(agingMap.entries())) {
    const summary = calcAgingSummary(records);
    result.push({ org, ...summary });
  }
  return result.sort((a, b) => b.total - a.total);
}

export function calcAgingByPerson(records: ReceivableAgingRecord[]) {
  const personMap = new Map<string, ReceivableAgingRecord[]>();
  for (const r of records) {
    const key = r.담당자;
    if (!key) continue;
    const arr = personMap.get(key) || [];
    arr.push(r);
    personMap.set(key, arr);
  }
  return Array.from(personMap.entries()).map(([person, recs]) => ({
    person,
    ...calcAgingSummary(recs),
  })).sort((a, b) => b.total - a.total);
}

export function assessRisk(record: ReceivableAgingRecord): RiskGrade {
  const total = record.합계.장부금액;
  if (total === 0) return "low";
  // SAP FI-AR 표준: month3(90일) 이상을 연체로 판정
  const overdueAmt = record.month3.장부금액 + record.month4.장부금액 + record.month5.장부금액 + record.month6.장부금액 + record.overdue.장부금액;
  const overdueRatio = overdueAmt / total;
  if (overdueRatio > RISK_THRESHOLDS.HIGH_OVERDUE_RATIO || record.overdue.장부금액 > RISK_THRESHOLDS.HIGH_OVERDUE_AMOUNT) return "high";
  if (overdueRatio > RISK_THRESHOLDS.MEDIUM_OVERDUE_RATIO || overdueAmt > RISK_THRESHOLDS.MEDIUM_OVERDUE_AMOUNT) return "medium";
  return "low";
}

export function calcRiskAssessments(records: ReceivableAgingRecord[]): AgingRiskAssessment[] {
  return records.map((r) => {
    const total = r.합계.장부금액;
    const overdueAmt = r.month3.장부금액 + r.month4.장부금액 + r.month5.장부금액 + r.month6.장부금액 + r.overdue.장부금액;
    return {
      판매처: r.판매처,
      판매처명: r.판매처명,
      영업조직: r.영업조직,
      담당자: r.담당자,
      총미수금: total,
      연체비율: total > 0 ? (overdueAmt / total) * 100 : 0,
      riskGrade: assessRisk(r),
    };
  }).filter(r => r.총미수금 !== 0).sort((a, b) => b.총미수금 - a.총미수금);
}

/** 거래처별 여신한도 대비 미수금 비율 계산 */
export function calcCreditUtilization(records: ReceivableAgingRecord[]): CreditUtilization[] {
  // 판매처 기준으로 그룹핑
  const grouped = new Map<string, ReceivableAgingRecord[]>();
  for (const r of records) {
    const key = r.판매처;
    if (!key) continue;
    const arr = grouped.get(key) || [];
    arr.push(r);
    grouped.set(key, arr);
  }

  const results: CreditUtilization[] = [];
  for (const [판매처, recs] of Array.from(grouped.entries())) {
    const first = recs[0];
    const 총미수금 = recs.reduce((sum, r) => sum + r.합계.장부금액, 0);
    // 여신한도는 거래처 단위이므로 같은 값 → 첫 번째 레코드에서 취득
    const 여신한도 = first.여신한도;
    // 여신한도가 0이거나 없는 경우 제외
    if (!여신한도 || 여신한도 === 0) continue;

    const 사용률 = (총미수금 / 여신한도) * 100;
    let 상태: CreditStatus = "normal";
    if (사용률 >= 100) 상태 = "danger";
    else if (사용률 >= 80) 상태 = "warning";

    results.push({
      판매처,
      판매처명: first.판매처명,
      영업조직: first.영업조직,
      담당자: first.담당자,
      총미수금,
      여신한도,
      사용률,
      상태,
    });
  }

  return results.sort((a, b) => b.사용률 - a.사용률);
}

/** 조직별 여신 현황 요약 */
export function calcCreditSummaryByOrg(records: ReceivableAgingRecord[]): CreditSummaryByOrg[] {
  const utilizations = calcCreditUtilization(records);

  const orgMap = new Map<string, { totalLimit: number; totalUsed: number; dangerCount: number; warningCount: number }>();
  for (const u of utilizations) {
    const org = u.영업조직;
    if (!org) continue;
    const entry = orgMap.get(org) || { totalLimit: 0, totalUsed: 0, dangerCount: 0, warningCount: 0 };
    entry.totalLimit += u.여신한도;
    entry.totalUsed += u.총미수금;
    if (u.상태 === "danger") entry.dangerCount++;
    if (u.상태 === "warning") entry.warningCount++;
    orgMap.set(org, entry);
  }

  return Array.from(orgMap.entries()).map(([org, data]) => ({
    org,
    totalLimit: data.totalLimit,
    totalUsed: data.totalUsed,
    utilizationRate: data.totalLimit > 0 ? (data.totalUsed / data.totalLimit) * 100 : 0,
    dangerCount: data.dangerCount,
    warningCount: data.warningCount,
  })).sort((a, b) => b.utilizationRate - a.utilizationRate);
}
