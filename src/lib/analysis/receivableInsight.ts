import type { ReceivableAgingRecord, RiskGrade } from "@/types";
import { assessRisk, calcCreditUtilization, calcRiskAssessments } from "./aging";

// ─── 담당자별 거래처 포트폴리오 ────────────────────────────────────

export interface PersonPortfolio {
  person: string;
  customerCount: number;
  totalReceivable: number;
  overdueAmount: number;
  overdueRatio: number;
  highRiskCount: number;
  hhi: number;
  topCustomer: string;
  topCustomerShare: number;
  normalRatio: number;
  efficiencyGrade: string;
}

export function calcPersonPortfolio(records: ReceivableAgingRecord[]): PersonPortfolio[] {
  const personMap = new Map<string, ReceivableAgingRecord[]>();
  for (const r of records) {
    if (!r.담당자) continue;
    const arr = personMap.get(r.담당자) || [];
    arr.push(r);
    personMap.set(r.담당자, arr);
  }

  const results: PersonPortfolio[] = [];

  for (const [person, recs] of Array.from(personMap.entries())) {
    let totalReceivable = 0;
    let normalAmount = 0; // month1 + month2
    let overdueAmount = 0; // month3+
    let highRiskCount = 0;

    const customerTotals = new Map<string, { name: string; amount: number }>();

    for (const r of recs) {
      const total = r.합계.장부금액;
      totalReceivable += total;
      normalAmount += r.month1.장부금액 + r.month2.장부금액;
      overdueAmount += r.month3.장부금액 + r.month4.장부금액 + r.month5.장부금액 + r.month6.장부금액 + r.overdue.장부금액;

      if (assessRisk(r) === "high") highRiskCount++;

      const key = r.판매처 || r.판매처명;
      const prev = customerTotals.get(key);
      customerTotals.set(key, {
        name: r.판매처명 || r.판매처,
        amount: (prev?.amount || 0) + total,
      });
    }

    // HHI (Herfindahl-Hirschman Index)
    let hhi = 0;
    let topCustomer = "";
    let topCustomerAmount = 0;

    if (totalReceivable > 0) {
      for (const [, v] of Array.from(customerTotals.entries())) {
        const share = v.amount / totalReceivable;
        hhi += share * share;
        if (v.amount > topCustomerAmount) {
          topCustomerAmount = v.amount;
          topCustomer = v.name;
        }
      }
    }

    const overdueRatio = totalReceivable > 0 ? (overdueAmount / totalReceivable) * 100 : 0;
    const normalRatio = totalReceivable > 0 ? (normalAmount / totalReceivable) * 100 : 0;
    const topCustomerShare = totalReceivable > 0 ? (topCustomerAmount / totalReceivable) * 100 : 0;

    // 수금 효율 등급: A(정상80%+), B(60%+), C(40%+), D(40%미만)
    let efficiencyGrade = "D";
    if (normalRatio >= 80) efficiencyGrade = "A";
    else if (normalRatio >= 60) efficiencyGrade = "B";
    else if (normalRatio >= 40) efficiencyGrade = "C";

    results.push({
      person,
      customerCount: customerTotals.size,
      totalReceivable,
      overdueAmount,
      overdueRatio,
      highRiskCount,
      hhi,
      topCustomer,
      topCustomerShare,
      normalRatio,
      efficiencyGrade,
    });
  }

  return results.sort((a, b) => b.totalReceivable - a.totalReceivable);
}

// ─── 담당자별 미수금 건전성 (Stacked Bar 데이터) ───────────────────

export interface PersonHealthData {
  person: string;
  normal: number;    // month1 + month2
  caution: number;   // month3 + month4 + month5
  overdue: number;   // month6 + overdue
  total: number;
  normalPct: number;
  cautionPct: number;
  overduePct: number;
}

export function calcPersonHealthData(records: ReceivableAgingRecord[]): PersonHealthData[] {
  const personMap = new Map<string, { normal: number; caution: number; overdue: number; total: number }>();

  for (const r of records) {
    if (!r.담당자) continue;
    const prev = personMap.get(r.담당자) || { normal: 0, caution: 0, overdue: 0, total: 0 };
    prev.normal += r.month1.장부금액 + r.month2.장부금액;
    prev.caution += r.month3.장부금액 + r.month4.장부금액 + r.month5.장부금액;
    prev.overdue += r.month6.장부금액 + r.overdue.장부금액;
    prev.total += r.합계.장부금액;
    personMap.set(r.담당자, prev);
  }

  return Array.from(personMap.entries())
    .map(([person, v]) => ({
      person,
      ...v,
      normalPct: v.total > 0 ? (v.normal / v.total) * 100 : 0,
      cautionPct: v.total > 0 ? (v.caution / v.total) * 100 : 0,
      overduePct: v.total > 0 ? (v.overdue / v.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── 거래처×담당자 상세 ────────────────────────────────────────────

export interface CustomerRepDetail {
  customerName: string;
  customerCode: string;
  person: string;
  org: string;
  totalReceivable: number;
  overdueRatio: number;
  riskGrade: RiskGrade;
  creditLimit: number;
  creditUsage: number;
}

export function calcCustomerRepDetail(records: ReceivableAgingRecord[]): CustomerRepDetail[] {
  const riskMap = new Map<string, { overdueRatio: number; riskGrade: RiskGrade }>();
  for (const r of calcRiskAssessments(records)) {
    riskMap.set(r.판매처, { overdueRatio: r.연체비율, riskGrade: r.riskGrade });
  }

  const creditMap = new Map<string, { creditLimit: number; creditUsage: number }>();
  for (const c of calcCreditUtilization(records)) {
    creditMap.set(c.판매처, { creditLimit: c.여신한도, creditUsage: c.사용률 });
  }

  // 판매처×담당자 기준으로 그룹핑
  const groupKey = (r: ReceivableAgingRecord) => `${r.판매처}||${r.담당자}`;
  const grouped = new Map<string, { recs: ReceivableAgingRecord[]; total: number }>();

  for (const r of records) {
    const key = groupKey(r);
    const prev = grouped.get(key) || { recs: [], total: 0 };
    prev.recs.push(r);
    prev.total += r.합계.장부금액;
    grouped.set(key, prev);
  }

  const results: CustomerRepDetail[] = [];

  for (const [, { recs, total }] of Array.from(grouped.entries())) {
    if (total === 0) continue;
    const first = recs[0];
    const risk = riskMap.get(first.판매처);
    const credit = creditMap.get(first.판매처);

    results.push({
      customerName: first.판매처명 || first.판매처,
      customerCode: first.판매처,
      person: first.담당자,
      org: first.영업조직,
      totalReceivable: total,
      overdueRatio: risk?.overdueRatio ?? 0,
      riskGrade: risk?.riskGrade ?? "low",
      creditLimit: credit?.creditLimit ?? 0,
      creditUsage: credit?.creditUsage ?? 0,
    });
  }

  return results.sort((a, b) => b.totalReceivable - a.totalReceivable);
}
