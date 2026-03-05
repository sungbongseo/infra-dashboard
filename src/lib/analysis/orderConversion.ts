/**
 * 수주 전환율 분석 (Order Conversion Analysis)
 *
 * 수주리스트의 품목상태(완료/삭제/진행) 필드를 활용하여
 * 전환율, 취소율, 파이프라인 가치를 분석합니다.
 */
import type { OrderRecord } from "@/types";
import { extractMonth } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────

export interface ConversionSummary {
  totalOrders: number;
  totalAmount: number;
  completed: { count: number; amount: number };
  cancelled: { count: number; amount: number };
  inProgress: { count: number; amount: number };
  other: { count: number; amount: number };
  conversionRate: number; // 완료 비율 (%)
  cancellationRate: number; // 삭제 비율 (%)
}

export interface MonthlyConversionTrend {
  month: string;
  완료: number;
  삭제: number;
  진행: number;
  기타: number;
  전환율: number;
  취소율: number;
}

export interface OrgConversionEntry {
  org: string;
  totalCount: number;
  totalAmount: number;
  completedCount: number;
  completedAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
  conversionRate: number;
  cancellationRate: number;
  avgOrderAmount: number;
}

export interface PipelineValueEntry {
  status: string;
  count: number;
  amount: number;
  share: number;
}

export interface CurrencyConversionEntry {
  currency: string;
  totalCount: number;
  totalAmount: number;
  conversionRate: number;
  cancellationRate: number;
}

// ── Helpers ──────────────────────────────────────────────────

function classifyStatus(status: string): "완료" | "삭제" | "진행" | "기타" {
  const s = (status || "").trim();
  if (s.includes("완료")) return "완료";
  if (s.includes("삭제")) return "삭제";
  if (s.includes("진행")) return "진행";
  if (s === "") return "기타";
  return "기타";
}

// ── 1. 전환율 요약 ──────────────────────────────────────────

export function calcConversionSummary(data: OrderRecord[]): ConversionSummary {
  const empty: ConversionSummary = {
    totalOrders: 0, totalAmount: 0,
    completed: { count: 0, amount: 0 },
    cancelled: { count: 0, amount: 0 },
    inProgress: { count: 0, amount: 0 },
    other: { count: 0, amount: 0 },
    conversionRate: 0, cancellationRate: 0,
  };
  if (data.length === 0) return empty;

  let totalAmount = 0;
  const buckets = { 완료: { count: 0, amount: 0 }, 삭제: { count: 0, amount: 0 }, 진행: { count: 0, amount: 0 }, 기타: { count: 0, amount: 0 } };

  for (const r of data) {
    const status = classifyStatus(r.품목상태);
    const amt = r.장부금액 || 0;
    totalAmount += amt;
    buckets[status].count += 1;
    buckets[status].amount += amt;
  }

  const total = data.length;
  return {
    totalOrders: total,
    totalAmount,
    completed: buckets.완료,
    cancelled: buckets.삭제,
    inProgress: buckets.진행,
    other: buckets.기타,
    conversionRate: total > 0 ? (buckets.완료.count / total) * 100 : 0,
    cancellationRate: total > 0 ? (buckets.삭제.count / total) * 100 : 0,
  };
}

// ── 2. 월별 전환율 추세 ──────────────────────────────────────

export function calcMonthlyConversionTrend(data: OrderRecord[]): MonthlyConversionTrend[] {
  if (data.length === 0) return [];

  const map = new Map<string, { 완료: number; 삭제: number; 진행: number; 기타: number; total: number }>();

  for (const r of data) {
    const month = extractMonth(r.수주일);
    if (!month) continue;
    const status = classifyStatus(r.품목상태);
    const entry = map.get(month) || { 완료: 0, 삭제: 0, 진행: 0, 기타: 0, total: 0 };
    entry[status] += 1;
    entry.total += 1;
    map.set(month, entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({
      month,
      완료: e.완료,
      삭제: e.삭제,
      진행: e.진행,
      기타: e.기타,
      전환율: e.total > 0 ? (e.완료 / e.total) * 100 : 0,
      취소율: e.total > 0 ? (e.삭제 / e.total) * 100 : 0,
    }));
}

// ── 3. 조직별 전환율 비교 ──────────────────────────────────

export function calcOrgConversion(data: OrderRecord[]): OrgConversionEntry[] {
  if (data.length === 0) return [];

  const map = new Map<string, {
    totalCount: number; totalAmount: number;
    completedCount: number; completedAmount: number;
    cancelledCount: number; cancelledAmount: number;
  }>();

  for (const r of data) {
    const org = (r.영업조직 || "미분류").trim() || "미분류";
    const status = classifyStatus(r.품목상태);
    const amt = r.장부금액 || 0;
    const entry = map.get(org) || {
      totalCount: 0, totalAmount: 0,
      completedCount: 0, completedAmount: 0,
      cancelledCount: 0, cancelledAmount: 0,
    };
    entry.totalCount += 1;
    entry.totalAmount += amt;
    if (status === "완료") { entry.completedCount += 1; entry.completedAmount += amt; }
    if (status === "삭제") { entry.cancelledCount += 1; entry.cancelledAmount += amt; }
    map.set(org, entry);
  }

  return Array.from(map.entries())
    .map(([org, e]) => ({
      org,
      ...e,
      conversionRate: e.totalCount > 0 ? (e.completedCount / e.totalCount) * 100 : 0,
      cancellationRate: e.totalCount > 0 ? (e.cancelledCount / e.totalCount) * 100 : 0,
      avgOrderAmount: e.totalCount > 0 ? e.totalAmount / e.totalCount : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

// ── 4. 파이프라인 가치 (품목상태별) ────────────────────────

export function calcPipelineByStatus(data: OrderRecord[]): PipelineValueEntry[] {
  if (data.length === 0) return [];

  const map = new Map<string, { count: number; amount: number }>();
  let totalAmount = 0;

  for (const r of data) {
    const status = classifyStatus(r.품목상태);
    const amt = r.장부금액 || 0;
    totalAmount += amt;
    const entry = map.get(status) || { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += amt;
    map.set(status, entry);
  }

  const order = ["완료", "진행", "삭제", "기타"];
  return order
    .filter((s) => map.has(s))
    .map((status) => {
      const e = map.get(status)!;
      return {
        status,
        count: e.count,
        amount: e.amount,
        share: totalAmount > 0 ? (e.amount / totalAmount) * 100 : 0,
      };
    });
}

// ── 5. 통화별 전환율 ──────────────────────────────────────

export function calcCurrencyConversion(data: OrderRecord[]): CurrencyConversionEntry[] {
  if (data.length === 0) return [];

  const map = new Map<string, {
    totalCount: number; totalAmount: number;
    completedCount: number; cancelledCount: number;
  }>();

  for (const r of data) {
    const currency = (r.단가통화 || "KRW").trim() || "KRW";
    const status = classifyStatus(r.품목상태);
    const amt = r.장부금액 || 0;
    const entry = map.get(currency) || { totalCount: 0, totalAmount: 0, completedCount: 0, cancelledCount: 0 };
    entry.totalCount += 1;
    entry.totalAmount += amt;
    if (status === "완료") entry.completedCount += 1;
    if (status === "삭제") entry.cancelledCount += 1;
    map.set(currency, entry);
  }

  return Array.from(map.entries())
    .map(([currency, e]) => ({
      currency,
      totalCount: e.totalCount,
      totalAmount: e.totalAmount,
      conversionRate: e.totalCount > 0 ? (e.completedCount / e.totalCount) * 100 : 0,
      cancellationRate: e.totalCount > 0 ? (e.cancelledCount / e.totalCount) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
