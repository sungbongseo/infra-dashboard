import type { ReceivableAgingRecord, RiskGrade, AgingRiskAssessment } from "@/types";

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
  const overdueRatio = (record.month4.장부금액 + record.month5.장부금액 + record.month6.장부금액 + record.overdue.장부금액) / total;
  if (overdueRatio > 0.5 || record.overdue.장부금액 > 100_000_000) return "high";
  if (overdueRatio > 0.2 || record.month3.장부금액 > 50_000_000) return "medium";
  return "low";
}

export function calcRiskAssessments(records: ReceivableAgingRecord[]): AgingRiskAssessment[] {
  return records.map((r) => {
    const total = r.합계.장부금액;
    const overdueAmt = r.month4.장부금액 + r.month5.장부금액 + r.month6.장부금액 + r.overdue.장부금액;
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
