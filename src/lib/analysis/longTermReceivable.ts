import type { ReceivableAgingRecord, RiskGrade } from "@/types";
import { assessRisk, calcAgingSummary } from "./aging";

// ─── 대손충당금 충당률 (SAP FI 간편법) ──────────────────────────────

export const PROVISION_RATES = {
  month4: 0.01,
  month5: 0.05,
  month6: 0.10,
  overdue: 0.50,
} as const;

// ─── 인터페이스 ───────────────────────────────────────────────────────

export interface LongTermSummary {
  longTermTotal: number;
  longTermRatio: number;
  totalProvision: number;
  longTermCustomerCount: number;
}

export interface LongTermCustomer {
  판매처: string;
  판매처명: string;
  담당자: string;
  영업조직: string;
  month4금액: number;
  month5금액: number;
  month6금액: number;
  overdue금액: number;
  장기미수합계: number;
  총미수금: number;
  장기비중: number;
  대손추정액: number;
  여신한도: number;
  riskGrade: RiskGrade;
}

export interface LongTermByOrg {
  org: string;
  month6: number;
  overdue: number;
  longTermTotal: number;
  totalReceivable: number;
  longTermRatio: number;
  대손추정액: number;
  customerCount: number;
}

export interface BadDebtProvision {
  bucket: string;
  원금: number;
  충당률: number;
  충당금: number;
}

// ─── 1. 장기 미수 요약 ──────────────────────────────────────────────

export function calcLongTermSummary(records: ReceivableAgingRecord[]): LongTermSummary {
  const summary = calcAgingSummary(records);
  const longTermTotal = summary.month6 + summary.overdue;

  // 대손충당금: 4개 bucket 합산
  let totalProvision = 0;
  for (const r of records) {
    totalProvision += r.month4.장부금액 * PROVISION_RATES.month4;
    totalProvision += r.month5.장부금액 * PROVISION_RATES.month5;
    totalProvision += r.month6.장부금액 * PROVISION_RATES.month6;
    totalProvision += r.overdue.장부금액 * PROVISION_RATES.overdue;
  }

  // 장기 미수 거래처: month6+overdue > 0
  const customerSet = new Set<string>();
  for (const r of records) {
    if (r.month6.장부금액 + r.overdue.장부금액 > 0) {
      customerSet.add(r.판매처);
    }
  }

  return {
    longTermTotal,
    longTermRatio: summary.total > 0 ? (longTermTotal / summary.total) * 100 : 0,
    totalProvision,
    longTermCustomerCount: customerSet.size,
  };
}

// ─── 2. 장기 미수 거래처 목록 ───────────────────────────────────────

export function calcLongTermCustomers(records: ReceivableAgingRecord[]): LongTermCustomer[] {
  const grouped = new Map<string, ReceivableAgingRecord[]>();
  for (const r of records) {
    const key = r.판매처;
    if (!key) continue;
    const arr = grouped.get(key) || [];
    arr.push(r);
    grouped.set(key, arr);
  }

  const results: LongTermCustomer[] = [];

  for (const [판매처, recs] of Array.from(grouped.entries())) {
    const first = recs[0];
    let m4 = 0, m5 = 0, m6 = 0, ov = 0, total = 0;
    const 여신한도 = first.여신한도 || 0;

    for (const r of recs) {
      m4 += r.month4.장부금액;
      m5 += r.month5.장부금액;
      m6 += r.month6.장부금액;
      ov += r.overdue.장부금액;
      total += r.합계.장부금액;
    }

    const longTerm = m6 + ov;
    if (longTerm <= 0) continue;

    const 대손추정액 = m4 * PROVISION_RATES.month4 + m5 * PROVISION_RATES.month5
      + m6 * PROVISION_RATES.month6 + ov * PROVISION_RATES.overdue;

    // riskGrade: first record 기준 (가장 높은 위험도로)
    let worstGrade: RiskGrade = "low";
    for (const r of recs) {
      const grade = assessRisk(r);
      if (grade === "high") { worstGrade = "high"; break; }
      if (grade === "medium") worstGrade = "medium";
    }

    results.push({
      판매처,
      판매처명: first.판매처명,
      담당자: first.담당자,
      영업조직: first.영업조직,
      month4금액: m4,
      month5금액: m5,
      month6금액: m6,
      overdue금액: ov,
      장기미수합계: longTerm,
      총미수금: total,
      장기비중: total > 0 ? (longTerm / total) * 100 : 0,
      대손추정액,
      여신한도,
      riskGrade: worstGrade,
    });
  }

  return results.sort((a, b) => b.장기미수합계 - a.장기미수합계);
}

// ─── 3. 조직별 장기 미수 구성 ───────────────────────────────────────

export function calcLongTermByOrg(records: ReceivableAgingRecord[]): LongTermByOrg[] {
  const map = new Map<string, { m6: number; ov: number; total: number; provision: number; customers: Set<string> }>();

  for (const r of records) {
    const org = r.영업조직 || "미지정";
    const entry = map.get(org) || { m6: 0, ov: 0, total: 0, provision: 0, customers: new Set<string>() };
    entry.m6 += r.month6.장부금액;
    entry.ov += r.overdue.장부금액;
    entry.total += r.합계.장부금액;
    entry.provision += r.month4.장부금액 * PROVISION_RATES.month4
      + r.month5.장부금액 * PROVISION_RATES.month5
      + r.month6.장부금액 * PROVISION_RATES.month6
      + r.overdue.장부금액 * PROVISION_RATES.overdue;
    if (r.month6.장부금액 + r.overdue.장부금액 > 0) {
      entry.customers.add(r.판매처);
    }
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, d]) => ({
      org,
      month6: d.m6,
      overdue: d.ov,
      longTermTotal: d.m6 + d.ov,
      totalReceivable: d.total,
      longTermRatio: d.total > 0 ? ((d.m6 + d.ov) / d.total) * 100 : 0,
      대손추정액: d.provision,
      customerCount: d.customers.size,
    }))
    .sort((a, b) => b.longTermTotal - a.longTermTotal);
}

// ─── 4. 대손충당금 추정 구성 ────────────────────────────────────────

export function calcBadDebtProvision(records: ReceivableAgingRecord[]): BadDebtProvision[] {
  let m4 = 0, m5 = 0, m6 = 0, ov = 0;

  for (const r of records) {
    m4 += r.month4.장부금액;
    m5 += r.month5.장부금액;
    m6 += r.month6.장부금액;
    ov += r.overdue.장부금액;
  }

  return [
    { bucket: "91~120일", 원금: m4, 충당률: PROVISION_RATES.month4, 충당금: m4 * PROVISION_RATES.month4 },
    { bucket: "121~150일", 원금: m5, 충당률: PROVISION_RATES.month5, 충당금: m5 * PROVISION_RATES.month5 },
    { bucket: "151~180일", 원금: m6, 충당률: PROVISION_RATES.month6, 충당금: m6 * PROVISION_RATES.month6 },
    { bucket: "180일+", 원금: ov, 충당률: PROVISION_RATES.overdue, 충당금: ov * PROVISION_RATES.overdue },
  ];
}
