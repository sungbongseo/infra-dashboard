import type { ReceivableAgingRecord } from "@/types";

// ─── 인터페이스 ───────────────────────────────────────────────────────

export interface CustomerAgingProfile {
  판매처: string;
  판매처명: string;
  담당자: string;
  영업조직: string;
  통화: string;
  month1: number;
  month2: number;
  month3: number;
  month4: number;
  month5: number;
  month6: number;
  overdue: number;
  합계: number;
  출고합계: number;
  괴리금액: number;
  괴리율: number;
  weightedDays: number;
}

export interface CurrencyExposure {
  통화: string;
  장부금액: number;
  출고금액: number;
  비중: number;
  거래처수: number;
}

export interface OrgInvoiceBookGap {
  org: string;
  출고합계: number;
  장부합계: number;
  괴리금액: number;
  괴리율: number;
}

// Aging bucket midpoints (days)
const BUCKET_MIDPOINTS = {
  month1: 15,
  month2: 45,
  month3: 75,
  month4: 105,
  month5: 135,
  month6: 165,
  overdue: 270,
} as const;

type BucketKey = keyof typeof BUCKET_MIDPOINTS;
const BUCKET_KEYS: BucketKey[] = ["month1", "month2", "month3", "month4", "month5", "month6", "overdue"];

// ─── 1. 거래처별 Aging 프로파일 ─────────────────────────────────────

export function calcCustomerAgingProfile(records: ReceivableAgingRecord[]): CustomerAgingProfile[] {
  const grouped = new Map<string, ReceivableAgingRecord[]>();
  for (const r of records) {
    const key = r.판매처;
    if (!key) continue;
    const arr = grouped.get(key) || [];
    arr.push(r);
    grouped.set(key, arr);
  }

  const results: CustomerAgingProfile[] = [];

  for (const [판매처, recs] of Array.from(grouped.entries())) {
    const first = recs[0];
    let 장부합계 = 0;
    let 출고합계 = 0;
    const buckets = { month1: 0, month2: 0, month3: 0, month4: 0, month5: 0, month6: 0, overdue: 0 };

    for (const r of recs) {
      for (const k of BUCKET_KEYS) {
        buckets[k] += r[k].장부금액;
        출고합계 += r[k].출고금액;
      }
      장부합계 += r.합계.장부금액;
    }

    // 가중평균 채권연령
    let weightedSum = 0;
    let amountSum = 0;
    for (const k of BUCKET_KEYS) {
      const amt = Math.abs(buckets[k]);
      if (amt > 0) {
        weightedSum += amt * BUCKET_MIDPOINTS[k];
        amountSum += amt;
      }
    }

    const 괴리금액 = 출고합계 - 장부합계;
    const 괴리율 = 장부합계 !== 0 ? (괴리금액 / 장부합계) * 100 : 0;

    results.push({
      판매처,
      판매처명: first.판매처명,
      담당자: first.담당자,
      영업조직: first.영업조직,
      통화: first.통화 || "KRW",
      ...buckets,
      합계: 장부합계,
      출고합계,
      괴리금액,
      괴리율,
      weightedDays: amountSum > 0 ? weightedSum / amountSum : 0,
    });
  }

  return results.sort((a, b) => b.합계 - a.합계);
}

// ─── 2. 통화별 미수금 노출 ──────────────────────────────────────────

export function calcCurrencyExposure(records: ReceivableAgingRecord[]): CurrencyExposure[] {
  const map = new Map<string, { 장부: number; 출고: number; customers: Set<string> }>();

  for (const r of records) {
    const currency = r.통화 || "KRW";
    const entry = map.get(currency) || { 장부: 0, 출고: 0, customers: new Set<string>() };
    entry.장부 += r.합계.장부금액;
    entry.출고 += r.합계.출고금액;
    entry.customers.add(r.판매처);
    map.set(currency, entry);
  }

  const totalBook = Array.from(map.values()).reduce((s, e) => s + e.장부, 0);

  return Array.from(map.entries())
    .map(([통화, data]) => ({
      통화,
      장부금액: data.장부,
      출고금액: data.출고,
      비중: totalBook > 0 ? (data.장부 / totalBook) * 100 : 0,
      거래처수: data.customers.size,
    }))
    .sort((a, b) => b.장부금액 - a.장부금액);
}

// ─── 3. 조직별 출고-장부 괴리 ───────────────────────────────────────

export function calcOrgInvoiceBookGap(records: ReceivableAgingRecord[]): OrgInvoiceBookGap[] {
  const map = new Map<string, { 출고: number; 장부: number }>();

  for (const r of records) {
    const org = r.영업조직 || "미지정";
    const entry = map.get(org) || { 출고: 0, 장부: 0 };
    entry.출고 += r.합계.출고금액;
    entry.장부 += r.합계.장부금액;
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, data]) => ({
      org,
      출고합계: data.출고,
      장부합계: data.장부,
      괴리금액: data.출고 - data.장부,
      괴리율: data.장부 !== 0 ? ((data.출고 - data.장부) / data.장부) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(b.괴리금액) - Math.abs(a.괴리금액));
}

// ─── 4. 가중평균 채권연령 (전체) ────────────────────────────────────

export function calcWeightedAgingDays(records: ReceivableAgingRecord[]): { weightedAvgDays: number; totalAmount: number } {
  let weightedSum = 0;
  let totalAmount = 0;

  for (const r of records) {
    for (const k of BUCKET_KEYS) {
      const amt = Math.abs(r[k].장부금액);
      if (amt > 0) {
        weightedSum += amt * BUCKET_MIDPOINTS[k];
        totalAmount += amt;
      }
    }
  }

  return {
    weightedAvgDays: totalAmount > 0 ? weightedSum / totalAmount : 0,
    totalAmount,
  };
}
